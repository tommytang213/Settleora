import Flutter
import Foundation

final class SettleoraReceiptOcrPlugin: NSObject, FlutterPlugin {
  private static let ocrChannelName = "com.settleora.mobile/receipt_ocr"
  private static let acceptanceChannelName = "com.settleora.mobile/receipt_ocr_acceptance"

  private var engineTask: Task<SettleoraPaddleOcrEngine, Error>?
  private var isBusy = false

  static func register(with registrar: FlutterPluginRegistrar) {
    let instance = SettleoraReceiptOcrPlugin()
    let channel = FlutterMethodChannel(name: ocrChannelName, binaryMessenger: registrar.messenger())
    registrar.addMethodCallDelegate(instance, channel: channel)

    #if DEBUG
    let acceptance = FlutterMethodChannel(
      name: acceptanceChannelName,
      binaryMessenger: registrar.messenger()
    )
    acceptance.setMethodCallHandler { call, result in
      guard call.method == "loadFixture" else { result(FlutterMethodNotImplemented); return }
      guard
        let arguments = call.arguments as? [String: Any],
        let path = arguments["path"] as? String,
        path.range(of: #"^[A-Za-z0-9_./-]+$"#, options: .regularExpression) != nil,
        !path.hasPrefix("/"), !path.contains("..")
      else {
        result(FlutterError(code: "invalid_fixture", message: "Invalid OCR acceptance fixture", details: nil))
        return
      }
      do {
        let fixture = Bundle.main.bundleURL
          .appendingPathComponent("receipt_ocr_acceptance", isDirectory: true)
          .appendingPathComponent(path)
        result(FlutterStandardTypedData(bytes: try Data(contentsOf: fixture)))
      } catch {
        result(FlutterError(code: "fixture_unavailable", message: "OCR acceptance fixture unavailable", details: nil))
      }
    }
    #endif
  }

  func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    guard call.method == "recognize" else { result(FlutterMethodNotImplemented); return }
    guard
      let arguments = call.arguments as? [String: Any],
      let bytes = arguments["imageBytes"] as? FlutterStandardTypedData,
      !bytes.data.isEmpty
    else {
      result(FlutterError(code: "invalid_image", message: "Receipt image bytes are required", details: nil))
      return
    }
    guard !isBusy else {
      result(FlutterError(code: "ocr_busy", message: "On-device receipt OCR is already running", details: nil))
      return
    }
    isBusy = true
    let engineTask = self.engineTask ?? Task { try await SettleoraPaddleOcrEngine.make() }
    self.engineTask = engineTask
    Task {
      do {
        let engine = try await engineTask.value
        let value = try await engine.recognize(bytes.data).channelValue
        await MainActor.run {
          self.isBusy = false
          result(value)
        }
      } catch {
        // Never expose receipt bytes, text, file paths, or provider internals.
        await MainActor.run {
          self.isBusy = false
          result(FlutterError(code: "ocr_failed", message: "On-device receipt OCR failed", details: nil))
        }
      }
    }
  }
}
