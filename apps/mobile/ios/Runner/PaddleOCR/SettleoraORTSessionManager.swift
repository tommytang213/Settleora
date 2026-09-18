import Foundation

enum ORTSessionManagerError: LocalizedError {
  case sessionUnavailable
  case invalidTensor
  case invalidOutput

  var errorDescription: String? {
    switch self {
    case .sessionUnavailable: return "OCR model session is unavailable"
    case .invalidTensor: return "OCR tensor is invalid"
    case .invalidOutput: return "OCR model output is invalid"
    }
  }
}

/// One process-scoped ONNX Runtime environment with a detection session and
/// independently addressable script recognizers. CPU is the correctness-first
/// baseline; accelerated providers are deliberately not required here.
actor ORTSessionManager {
  private struct SessionBinding {
    let session: ORTSession
    let inputName: String
    let outputNames: Set<String>
  }

  private var environment: ORTEnv?
  private var detection: SessionBinding?
  private var recognizers: [String: SessionBinding] = [:]

  func loadModels(detectionPath: String, recognizerPaths: [String: String]) throws {
    let environment = try ORTEnv(loggingLevel: .warning)
    let options = try ORTSessionOptions()
    try options.setGraphOptimizationLevel(.all)
    self.environment = environment
    detection = try makeBinding(environment: environment, path: detectionPath, options: options)
    for (packID, path) in recognizerPaths.sorted(by: { $0.key < $1.key }) {
      recognizers[packID] = try makeBinding(environment: environment, path: path, options: options)
    }
  }

  func runDetection(inputData: [Float], shape: [Int]) throws -> [String: (data: [Float], shape: [Int])] {
    guard let detection else { throw ORTSessionManagerError.sessionUnavailable }
    return try run(binding: detection, inputData: inputData, shape: shape)
  }

  func runRecognition(packID: String, inputData: [Float], shape: [Int]) throws -> (data: [Float], shape: [Int]) {
    guard let binding = recognizers[packID] else { throw ORTSessionManagerError.sessionUnavailable }
    guard let first = try run(binding: binding, inputData: inputData, shape: shape).values.first else {
      throw ORTSessionManagerError.invalidOutput
    }
    return first
  }

  private func makeBinding(environment: ORTEnv, path: String, options: ORTSessionOptions) throws -> SessionBinding {
    let session = try ORTSession(env: environment, modelPath: path, sessionOptions: options)
    guard let inputName = try session.inputNames().first else {
      throw ORTSessionManagerError.sessionUnavailable
    }
    return SessionBinding(
      session: session,
      inputName: inputName,
      outputNames: Set(try session.outputNames())
    )
  }

  private func run(binding: SessionBinding, inputData: [Float], shape: [Int]) throws -> [String: (data: [Float], shape: [Int])] {
    guard !shape.isEmpty, shape.allSatisfy({ $0 > 0 }), shape.reduce(1, *) == inputData.count else {
      throw ORTSessionManagerError.invalidTensor
    }
    var values = inputData
    let bytes = NSMutableData(bytes: &values, length: values.count * MemoryLayout<Float>.stride)
    let tensor = try ORTValue(
      tensorData: bytes,
      elementType: .float,
      shape: shape.map { NSNumber(value: $0) }
    )
    let outputs = try binding.session.run(
      withInputs: [binding.inputName: tensor],
      outputNames: binding.outputNames,
      runOptions: nil
    )
    var result: [String: (data: [Float], shape: [Int])] = [:]
    for (name, output) in outputs {
      let info = try output.tensorTypeAndShapeInfo()
      let data = try output.tensorData() as Data
      let floats = data.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }
      guard !floats.contains(where: { !$0.isFinite }) else {
        throw ORTSessionManagerError.invalidOutput
      }
      result[name] = (floats, info.shape.map(\.intValue))
    }
    return result
  }
}
