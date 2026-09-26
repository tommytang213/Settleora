import Flutter
import Foundation

final class RetryableValueLoader<Value> {
  private var cachedValue: Value?

  // The owning plugin admits only one OCR call at a time through isBusy, so
  // loader state is always entered serially and never needs actor isolation.
  func value(factory: @escaping () async throws -> Value) async throws -> Value {
    if let cachedValue { return cachedValue }
    let loaded = try await factory()
    cachedValue = loaded
    return loaded
  }
}

final class SettleoraReceiptOcrPlugin: NSObject, FlutterPlugin {
  private static let ocrChannelName = "com.settleora.mobile/receipt_ocr"

  private let engineLoader = RetryableValueLoader<SettleoraPaddleOcrEngine>()
  private var isBusy = false

  static func register(with registrar: FlutterPluginRegistrar) {
    let instance = SettleoraReceiptOcrPlugin()
    let channel = FlutterMethodChannel(name: ocrChannelName, binaryMessenger: registrar.messenger())
    registrar.addMethodCallDelegate(instance, channel: channel)

    #if DEBUG
    let acceptanceChannelName = "com.settleora.mobile/receipt_ocr_acceptance"
    let acceptance = FlutterMethodChannel(
      name: acceptanceChannelName,
      binaryMessenger: registrar.messenger()
    )
    acceptance.setMethodCallHandler { call, result in
      if call.method == "loadModelCatalog" {
        do {
          let catalog = try FlutterAssetResolver.url("assets/receipt_ocr_models/catalog.json")
          result(FlutterStandardTypedData(bytes: try Data(contentsOf: catalog)))
        } catch {
          result(FlutterError(
            code: "catalog_unavailable",
            message: "Packaged OCR model catalog unavailable",
            details: nil
          ))
        }
        return
      }
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
    Task {
      do {
        let engine = try await engineLoader.value {
          try await SettleoraPaddleOcrEngine.make()
        }
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
