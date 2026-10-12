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
  private let rupeeRecognizer: Recognizer?
  private let coldLoadTimeMs: Int

  static func make() async throws -> SettleoraPaddleOcrEngine {
    let start = CFAbsoluteTimeGetCurrent()
    let catalog = try MobileOcrModelCatalog.load()
    let sessions = ORTSessionManager()
    try await sessions.loadModels(
      detectionPath: catalog.detection.modelPath,
      recognizerPaths: Dictionary(uniqueKeysWithValues: (catalog.recognizers + [catalog.rupeeRecovery].compactMap { $0 }).map {
        ($0.modelPackID, $0.modelPath)
      })
    )
    let detector = try DetectionEngine(
      sessionManager: sessions,
      configPath: catalog.detection.configPath
    )
    func recognizer(_ spec: RecognizerSpec) throws -> Recognizer {
      let config = try InferenceConfig.load(from: spec.configPath)
      return Recognizer(
        spec: spec,
        preprocessor: try RecPreprocessor(config: config),
        decoder: try CTCDecoder(config: config)
      )
    }
    let recognizers = try catalog.recognizers.map(recognizer)
    let rupeeRecognizer = try catalog.rupeeRecovery.map(recognizer)
    return SettleoraPaddleOcrEngine(
      catalog: catalog,
      sessions: sessions,
      detector: detector,
      recognizers: recognizers,
      rupeeRecognizer: rupeeRecognizer,
      coldLoadTimeMs: milliseconds(since: start)
    )
  }

  private init(
    catalog: MobileOcrModelCatalog,
    sessions: ORTSessionManager,
    detector: DetectionEngine,
    recognizers: [Recognizer],
    rupeeRecognizer: Recognizer?,
    coldLoadTimeMs: Int
  ) {
    self.catalog = catalog
    self.sessions = sessions
    self.detector = detector
    self.recognizers = recognizers
    self.rupeeRecognizer = rupeeRecognizer
    self.coldLoadTimeMs = coldLoadTimeMs
  }

  func recognize(_ imageData: Data) async throws -> SettleoraOcrRunResult {
    guard !imageData.isEmpty, imageData.count <= 25 * 1024 * 1024 else {
      throw SettleoraOcrError.imageTooLarge
    }
    let image = try EncodedImageCodec.cgImage(fromEncodedData: imageData)

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
    guard boxes.count <= 256 else { throw SettleoraOcrError.tooManyLines }
    let crops: [CGImage]
    if boxes.isEmpty {
      crops = []
    } else {
      let cropSource = try QuadTextCrop.prepare(image)
      crops = try boxes.map { try QuadTextCrop.crop(cropSource, polygon: $0.points) }
    }

    guard let common = recognizers.first(where: { $0.spec.acceptedScripts.contains(.common) }) else {
      throw SettleoraOcrError.invalidCatalog
    }
    let recognitionStart = CFAbsoluteTimeGetCurrent()
    var uprightCandidates = try await recognize(common, crops: crops).map { [$0] }
    let rotatedCrops = try crops.map(rotate180)
    var rotatedCandidates = try await recognize(common, crops: rotatedCrops).map { [$0] }

    // The common recognizer cannot establish orientation for specialist-only
    // scripts. Probe the bounded catalog-pinned specialist set in both
    // orientations before choosing the document direction.
    for recognizer in recognizers where recognizer.spec != common.spec {
      let upright = try await recognize(recognizer, crops: crops)
      let rotated = try await recognize(recognizer, crops: rotatedCrops)
      for index in crops.indices {
        uprightCandidates[index].append(upright[index])
        rotatedCandidates[index].append(rotated[index])
      }
    }
    if let cyrillic = recognizers.first(where: { $0.spec.acceptedScripts == [.cyrillic] }) {
      let uprightRecovery = try await recognizeRecovery(cyrillic, crops: crops, original: uprightCandidates)
      let rotatedRecovery = try await recognizeRecovery(cyrillic, crops: rotatedCrops, original: rotatedCandidates)
      for index in crops.indices {
        if let recovered = uprightRecovery[index] { uprightCandidates[index].append(recovered) }
        if let recovered = rotatedRecovery[index] { rotatedCandidates[index].append(recovered) }
      }
    }
    let uprightOrientationCandidates = uprightCandidates.map {
      ScriptRouteSelector.select($0) ?? $0[0]
    }
    let rotatedOrientationCandidates = rotatedCandidates.map {
      ScriptRouteSelector.select($0) ?? $0[0]
    }
    let rotateDocument = ReceiptOrientationSelector.shouldRotate180(
      upright: uprightOrientationCandidates,
      rotated: rotatedOrientationCandidates
    )
    let candidates = rotateDocument ? rotatedCandidates : uprightCandidates
    let documentOrientation = ReceiptDocumentOrientation.select(
      lineDimensions: boxes.map { box in
        let xs = box.points.map { Double($0[0]) }
        let ys = box.points.map { Double($0[1]) }
        return (
          width: (xs.max() ?? 0) - (xs.min() ?? 0),
          height: (ys.max() ?? 0) - (ys.min() ?? 0)
        )
      },
      reverseRecognition: rotateDocument
    )

    // Recovery cannot alter orientation or bootstrap corroboration from itself.
    let original = candidates.map { ScriptRouteSelector.select($0) }
    let recoveryPoints = boxes.map { box in
      box.points.map { point -> CalendarDateRecovery.Point in
        let normalized = documentOrientation.transform(
          SettleoraOcrPoint(x: Double(point[0]), y: Double(point[1])),
          sourceWidth: image.width, sourceHeight: image.height
        )
        return CalendarDateRecovery.Point(x: normalized.x, y: normalized.y)
      }
    }
    let commonRecovery = try await recognizeCommonRecovery(
      common, crops: rotateDocument ? rotatedCrops : crops, original: original, points: recoveryPoints
    )
    let originalCommon = candidates.map { alternatives -> ScriptCandidate? in
      let matching = alternatives.filter { $0.pack == common.spec }
      return matching.count == 1 ? matching[0] : nil
    }
    let rupeeRecovery = try await recognizeRupeeRecovery(
      crops: rotateDocument ? rotatedCrops : crops, original: original, common: originalCommon, points: recoveryPoints
    )
    var blocks: [SettleoraOcrBlock] = []
    for index in candidates.indices {
      guard let accepted = rupeeRecovery[index] ?? commonRecovery[index] ?? original[index],
            accepted.confidence >= 0.1 else { continue }
      let points = boxes[index].points.map { point -> SettleoraOcrPoint in
        documentOrientation.transform(
          SettleoraOcrPoint(x: Double(point[0]), y: Double(point[1])),
          sourceWidth: image.width,
          sourceHeight: image.height
        )
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

  private func recognizeRecovery(
    _ recognizer: Recognizer, crops: [CGImage], original: [[ScriptCandidate]]
  ) async throws -> [ScriptCandidate?] {
    var output = [ScriptCandidate?](repeating: nil, count: crops.count)
    // Match the original contiguous batches, including lines that need no
    // recovery, so CTC receives the same full-batch width plus the fixed margin.
    for indices in Array(crops.indices).chunked(maxCount: 4) {
      guard indices.contains(where: { CyrillicRecovery.shouldProbe(original[$0]) }) else { continue }
      let input = try recognizer.preprocessor.preprocessBatch(
        indices.map { crops[$0] }, whiteMargin: CyrillicRecovery.whiteMargin
      )
      let raw = try await sessions.runRecognition(
        packID: recognizer.spec.modelPackID, inputData: input.tensorData, shape: input.tensorShape
      )
      let decoded = try recognizer.decoder.decodeBatch(outputData: raw.data, outputShape: raw.shape)
      guard decoded.count == indices.count else { throw SettleoraOcrError.invalidCatalog }
      for (offset, value) in decoded.enumerated() {
        let index = indices[offset]
        let candidate = ScriptCandidate(
          text: RecognizedTextNormalizer.normalize(value.text.trimmingCharacters(in: .whitespacesAndNewlines), pack: recognizer.spec),
          confidence: value.confidence, pack: recognizer.spec
        )
        if CyrillicRecovery.accepts(original[index], recovery: candidate) { output[index] = candidate }
      }
    }
    return output
  }

  private func recognizeCommonRecovery(
    _ recognizer: Recognizer, crops: [CGImage], original: [ScriptCandidate?], points: [[CalendarDateRecovery.Point]]
  ) async throws -> [ScriptCandidate?] {
    var output = [ScriptCandidate?](repeating: nil, count: crops.count)
    // Retain the original full batches and their canvas widths.
    for indices in Array(crops.indices).chunked(maxCount: 4) {
      guard indices.contains(where: {
        PolishCurrencyRecovery.shouldProbe($0, original: original) ||
          CalendarDateRecovery.shouldProbe($0, original: original, points: points)
      }) else { continue }
      let input = try recognizer.preprocessor.preprocessBatch(
        indices.map { crops[$0] }, whiteMargin: PolishCurrencyRecovery.whiteMargin
      )
      let raw = try await sessions.runRecognition(
        packID: recognizer.spec.modelPackID, inputData: input.tensorData, shape: input.tensorShape
      )
      let decoded = try recognizer.decoder.decodeBatch(outputData: raw.data, outputShape: raw.shape)
      guard decoded.count == indices.count else { throw SettleoraOcrError.invalidCatalog }
      for (offset, value) in decoded.enumerated() {
        let index = indices[offset]
        let candidate = ScriptCandidate(
          text: RecognizedTextNormalizer.normalize(value.text.trimmingCharacters(in: .whitespacesAndNewlines), pack: recognizer.spec),
          confidence: value.confidence, pack: recognizer.spec
        )
        if PolishCurrencyRecovery.accepts(index, original: original, recovery: candidate) ||
          CalendarDateRecovery.accepts(index, original: original, points: points, recovery: candidate) {
          output[index] = candidate
        }
      }
    }
    return output
  }

  private func recognizeRupeeRecovery(
    crops: [CGImage], original: [ScriptCandidate?], common: [ScriptCandidate?],
    points: [[CalendarDateRecovery.Point]]
  ) async throws -> [ScriptCandidate?] {
    var output = [ScriptCandidate?](repeating: nil, count: crops.count)
    guard let recognizer = rupeeRecognizer else { return output }
    // Keep the original complete batches, pixel scaling and canvas widths.
    for indices in Array(crops.indices).chunked(maxCount: 4) {
      guard indices.contains(where: {
        RupeeCurrencyRecovery.shouldProbe($0, original: original, common: common, points: points)
      }) else { continue }
      let input = try recognizer.preprocessor.preprocessBatch(indices.map { crops[$0] })
      let raw = try await sessions.runRecognition(
        packID: recognizer.spec.modelPackID, inputData: input.tensorData, shape: input.tensorShape
      )
      let decoded = try recognizer.decoder.decodeBatch(outputData: raw.data, outputShape: raw.shape)
      guard decoded.count == indices.count else { throw SettleoraOcrError.invalidCatalog }
      for (offset, value) in decoded.enumerated() {
        let index = indices[offset]
        let candidate = ScriptCandidate(
          text: RecognizedTextNormalizer.normalize(value.text.trimmingCharacters(in: .whitespacesAndNewlines), pack: recognizer.spec),
          confidence: value.confidence, pack: recognizer.spec
        )
        if RupeeCurrencyRecovery.accepts(
          index, original: original, common: common, points: points, recovery: candidate, recoveryPack: recognizer.spec
        ) { output[index] = candidate }
      }
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
