import CoreGraphics
import Foundation
import ImageIO

struct SettleoraOcrPoint {
  let x: Double
  let y: Double
  var channelValue: [String: Double] { ["x": x, "y": y] }
}

struct SettleoraOcrBlock {
  let text: String
  let confidence: Float
  let modelPackID: String
  let modelVersion: String
  let textDirection: String
  var order: Int
  var row: Int
  let points: [SettleoraOcrPoint]

  var channelValue: [String: Any] {
    [
      "text": text,
      "confidence": Double(confidence),
      "modelPackId": modelPackID,
      "modelVersion": modelVersion,
      "textDirection": textDirection,
      "order": order,
      "row": row,
      "points": points.map(\.channelValue),
    ]
  }
}

struct SettleoraOcrRunResult {
  let blocks: [SettleoraOcrBlock]
  let detectionModelPackID: String
  let detectionModelVersion: String
  let coldLoadTimeMs: Int
  let detectionTimeMs: Int
  let recognitionTimeMs: Int
  let totalTimeMs: Int

  var channelValue: [String: Any] {
    [
      "blocks": blocks.map(\.channelValue),
      "detectionModelPackId": detectionModelPackID,
      "detectionModelVersion": detectionModelVersion,
      "runtime": "onnxruntime-objc:1.24.3:cpu",
      "coldLoadTimeMs": coldLoadTimeMs,
      "detectionTimeMs": detectionTimeMs,
      "recognitionTimeMs": recognitionTimeMs,
      "totalTimeMs": totalTimeMs,
    ]
  }
}

final class SettleoraPaddleOcrEngine {
  private struct Recognizer {
    let spec: RecognizerSpec
    let preprocessor: RecPreprocessor
    let decoder: CTCDecoder
  }

  private let catalog: MobileOcrModelCatalog
  private let sessions: ORTSessionManager
  private let detector: DetectionEngine
  private let recognizers: [Recognizer]
  private let coldLoadTimeMs: Int

  static func make() async throws -> SettleoraPaddleOcrEngine {
    let start = CFAbsoluteTimeGetCurrent()
    let catalog = try MobileOcrModelCatalog.load()
    let sessions = ORTSessionManager()
    try await sessions.loadModels(
      detectionPath: catalog.detection.modelPath,
      recognizerPaths: Dictionary(uniqueKeysWithValues: catalog.recognizers.map {
        ($0.modelPackID, $0.modelPath)
      })
    )
    let detector = try DetectionEngine(
      sessionManager: sessions,
      configPath: catalog.detection.configPath
    )
    let recognizers = try catalog.recognizers.map { spec in
      let config = try InferenceConfig.load(from: spec.configPath)
      return Recognizer(
        spec: spec,
        preprocessor: try RecPreprocessor(config: config),
        decoder: try CTCDecoder(config: config)
      )
    }
    return SettleoraPaddleOcrEngine(
      catalog: catalog,
      sessions: sessions,
      detector: detector,
      recognizers: recognizers,
      coldLoadTimeMs: milliseconds(since: start)
    )
  }

  private init(
    catalog: MobileOcrModelCatalog,
    sessions: ORTSessionManager,
    detector: DetectionEngine,
    recognizers: [Recognizer],
    coldLoadTimeMs: Int
  ) {
    self.catalog = catalog
    self.sessions = sessions
    self.detector = detector
    self.recognizers = recognizers
    self.coldLoadTimeMs = coldLoadTimeMs
  }

  func recognize(_ imageData: Data) async throws -> SettleoraOcrRunResult {
    guard !imageData.isEmpty, imageData.count <= 25 * 1024 * 1024 else {
      throw SettleoraOcrError.imageTooLarge
    }
    let image = try EncodedImageCodec.cgImage(fromEncodedData: imageData)
    guard image.width <= 8192, image.height <= 8192,
          image.width * image.height <= 16_000_000 else {
      throw SettleoraOcrError.imageTooLarge
    }

    let totalStart = CFAbsoluteTimeGetCurrent()
    let runtime = OCRRuntimeParams(
      textDetLimitSideLen: 1600,
      textDetLimitType: "max",
      textDetMaxSideLimit: 1600,
      textDetThresh: 0.2,
      textDetBoxThresh: 0.45,
      textDetUnclipRatio: 1.4,
      textRecBatchSize: 4,
      textRecScoreThresh: 0.1
    )
    let detection = try await detector.detect(image, runtimeParams: runtime)
    let boxes = BoxSorter.sortInReadingOrder(detection.boxes)
    guard boxes.count <= 128 else { throw SettleoraOcrError.tooManyLines }
    let crops = try boxes.map { try QuadTextCrop.crop(image, polygon: $0.points) }

    guard let common = recognizers.first(where: { $0.spec.acceptedScripts.contains(.common) }) else {
      throw SettleoraOcrError.invalidCatalog
    }
    let recognitionStart = CFAbsoluteTimeGetCurrent()
    var candidates = try await recognize(common, crops: crops).map { [$0] }
    let rotatedCrops = try crops.map(rotate180)
    let rotatedCommon = try await recognize(common, crops: rotatedCrops)
    let rotateDocument = ReceiptOrientationSelector.shouldRotate180(
      upright: candidates.compactMap(\.first),
      rotated: rotatedCommon
    )
    let selectedCrops = rotateDocument ? rotatedCrops : crops
    if rotateDocument {
      for index in candidates.indices { candidates[index] = [rotatedCommon[index]] }
    }

    // Correctness-first bounded routing: every verified specialist sees every
    // detected crop, so a common-model hallucination cannot suppress Arabic,
    // Thai, or another mandatory Global Core script.
    for recognizer in recognizers where recognizer.spec != common.spec {
      let results = try await recognize(recognizer, crops: selectedCrops)
      for index in results.indices { candidates[index].append(results[index]) }
    }

    var blocks: [SettleoraOcrBlock] = []
    for index in candidates.indices {
      guard let accepted = ScriptRouteSelector.select(candidates[index]),
            accepted.confidence >= 0.1 else { continue }
      let points = boxes[index].points.map { point -> SettleoraOcrPoint in
        if rotateDocument {
          return SettleoraOcrPoint(
            x: Double(max(0, min(image.width - 1, image.width - 1 - Int(point[0])))),
            y: Double(max(0, min(image.height - 1, image.height - 1 - Int(point[1]))))
          )
        }
        return SettleoraOcrPoint(x: Double(point[0]), y: Double(point[1]))
      }
      blocks.append(SettleoraOcrBlock(
        text: accepted.text,
        confidence: accepted.confidence,
        modelPackID: accepted.pack.modelPackID,
        modelVersion: accepted.pack.modelVersion,
        textDirection: ReceiptBlockOrder.textDirection(accepted.text),
        order: index,
        row: 0,
        points: points
      ))
    }
    let recognitionTimeMs = milliseconds(since: recognitionStart)
    return SettleoraOcrRunResult(
      blocks: ReceiptBlockOrder.normalize(blocks),
      detectionModelPackID: catalog.detection.modelPackID,
      detectionModelVersion: catalog.detection.modelVersion,
      coldLoadTimeMs: coldLoadTimeMs,
      detectionTimeMs: Int((detection.totalTime * 1000).rounded()),
      recognitionTimeMs: recognitionTimeMs,
      totalTimeMs: milliseconds(since: totalStart)
    )
  }

  private func recognize(_ recognizer: Recognizer, crops: [CGImage]) async throws -> [ScriptCandidate] {
    var output: [ScriptCandidate] = []
    for batch in crops.chunked(maxCount: 4) {
      let input = try recognizer.preprocessor.preprocessBatch(batch)
      let raw = try await sessions.runRecognition(
        packID: recognizer.spec.modelPackID,
        inputData: input.tensorData,
        shape: input.tensorShape
      )
      let decoded = try recognizer.decoder.decodeBatch(outputData: raw.data, outputShape: raw.shape)
      output.append(contentsOf: decoded.map {
        ScriptCandidate(
          text: RecognizedTextNormalizer.normalize($0.text.trimmingCharacters(in: .whitespacesAndNewlines), pack: recognizer.spec),
          confidence: $0.confidence,
          pack: recognizer.spec
        )
      })
    }
    return output
  }

  private func rotate180(_ image: CGImage) throws -> CGImage {
    guard let colorSpace = image.colorSpace ?? CGColorSpace(name: CGColorSpace.sRGB),
          let context = CGContext(
            data: nil,
            width: image.width,
            height: image.height,
            bitsPerComponent: 8,
            bytesPerRow: image.width * 4,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
          ) else { throw SettleoraOcrError.invalidImage }
    context.translateBy(x: CGFloat(image.width), y: CGFloat(image.height))
    context.rotate(by: .pi)
    context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
    guard let result = context.makeImage() else { throw SettleoraOcrError.invalidImage }
    return result
  }
}

private func milliseconds(since start: CFAbsoluteTime) -> Int {
  Int(((CFAbsoluteTimeGetCurrent() - start) * 1000).rounded())
}

private extension Array {
  func chunked(maxCount: Int) -> [[Element]] {
    guard !isEmpty else { return [] }
    return stride(from: 0, to: count, by: maxCount).map {
      Array(self[$0..<Swift.min($0 + maxCount, count)])
    }
  }
}
