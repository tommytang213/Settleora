// Runtime-only harness. The real Paddle engine and all model code stay unchanged.
import UIKit
import Foundation
import CryptoKit
import Darwin
import Dispatch

private enum ArmRuntimeFailure: Error { case rejected }
private let expectedImageSHA = "261b6f1831617873bad6da93cefe54c050e70d10ec283dfdc6af9286602e10ec"
private let expectedSourceSHA = "ee60af99bb233c8d99b4678373b713d22e74127c44cf68e61db794f448e1356e"
private let purpose = "arm64_ridge_runtime_v1"

private func requireRuntime(_ value: Bool) throws {
  if !value { throw ArmRuntimeFailure.rejected }
}
private func digest(_ data: Data) -> String {
  SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}
private func milliseconds(_ start: UInt64) -> Int {
  Int((DispatchTime.now().uptimeNanoseconds - start) / 1_000_000)
}
private func lifetimePeakRSS() -> Int? {
  var usage = rusage()
  guard getrusage(RUSAGE_SELF, &usage) == 0 else { return nil }
  // Darwin ru_maxrss is bytes. This is a process-lifetime peak, not a per-call peak.
  return Int(usage.ru_maxrss)
}
private func privateJSON(_ value: [String: Any], at url: URL, maximum: Int) throws -> (Int, String) {
  let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
  try requireRuntime(!data.isEmpty && data.count <= maximum)
  let fd = open(url.path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, mode_t(0o600))
  try requireRuntime(fd >= 0)
  defer { close(fd) }
  try data.withUnsafeBytes { raw in
    guard let base = raw.baseAddress else { throw ArmRuntimeFailure.rejected }
    var offset = 0
    while offset < raw.count {
      let count = write(fd, base.advanced(by: offset), raw.count - offset)
      if count < 0 && errno == EINTR { continue }
      try requireRuntime(count > 0)
      offset += count
    }
  }
  try requireRuntime(fsync(fd) == 0 && fchmod(fd, mode_t(0o400)) == 0)
  return (data.count, digest(data))
}

@objc(Arm64RuntimeAppDelegate)
final class Arm64RuntimeAppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?
  private var started = false

  func application(_ application: UIApplication,
                   didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    guard !started else { return false }
    started = true
    let display = UIWindow(frame: UIScreen.main.bounds)
    display.rootViewController = UIViewController()
    display.makeKeyAndVisible()
    window = display
    Task { await measure() }
    return true
  }

  private func measure() async {
    var calls = 0
    var failureStage = "preparation"
    let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    do {
      let root = Bundle.main.bundleURL
      let bindingBytes = try Data(contentsOf: root.appendingPathComponent("arm64-runtime-binding.json"))
      try requireRuntime(bindingBytes.count <= 32768)
      guard let binding = try JSONSerialization.jsonObject(with: bindingBytes) as? [String: Any],
            binding["purpose"] as? String == purpose,
            binding["fixtureId"] as? String == "existing_13_ridge_restaurant_en_US",
            binding["sourceImageSha256"] as? String == expectedSourceSHA,
            binding["inputSha256"] as? String == expectedImageSHA,
            binding["inputBytes"] as? Int == 263039,
            binding["width"] as? Int == 1086, binding["height"] as? Int == 1448,
            binding["maximumCalls"] as? Int == 2,
            let sourceHead = binding["sourceHead"] as? String,
            sourceHead.range(of: "^[0-9a-f]{40}$", options: .regularExpression) != nil,
            let sourceTree = binding["sourceTree"] as? String,
            sourceTree.range(of: "^[0-9a-f]{40}$", options: .regularExpression) != nil,
            let sourceFingerprint = binding["sourceFingerprint"] as? String,
            sourceFingerprint.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil,
            let runID = binding["runId"] as? String,
            runID.range(of: "^[1-9][0-9]{0,23}$", options: .regularExpression) != nil,
            binding["runAttempt"] as? String == "1",
            let modelHash = binding["modelManifestSha256"] as? String,
            let modelIDs = binding["modelPackIds"] as? [String], modelIDs.count == 8
      else { throw ArmRuntimeFailure.rejected }
      let modelBytes = try Data(contentsOf: root.appendingPathComponent("arm64-model-binding.json"))
      try requireRuntime(modelBytes.count <= 32768 && digest(modelBytes) == modelHash)
      guard let modelFiles = try JSONSerialization.jsonObject(with: modelBytes) as? [[String: Any]],
            !modelFiles.isEmpty, modelFiles.count <= 128
      else { throw ArmRuntimeFailure.rejected }
      for file in modelFiles {
        guard let path = file["path"] as? String,
              path.hasPrefix("receipt_ocr_models/"), !path.contains(".."), !path.contains("\\"),
              let bytes = file["bytes"] as? Int, bytes > 0, bytes <= 128 * 1024 * 1024,
              let sha = file["sha256"] as? String
        else { throw ArmRuntimeFailure.rejected }
        let data = try Data(contentsOf: root.appendingPathComponent(path))
        try requireRuntime(data.count == bytes && digest(data) == sha)
      }
      let image = try Data(contentsOf: root.appendingPathComponent("arm64-ridge-input.jpeg"))
      try requireRuntime(image.count == 263039 && digest(image) == expectedImageSHA)
      func envelope(_ phase: String, _ result: SettleoraOcrRunResult,
                    _ wall: Int, _ initialized: Bool) -> [String: Any] {
        let peak: Any
        if let measured = lifetimePeakRSS() { peak = measured } else { peak = NSNull() }
        return [
          "schemaVersion": 1, "purpose": purpose, "phase": phase,
          "sourceHead": sourceHead, "sourceTree": sourceTree,
          "sourceFingerprint": sourceFingerprint,
          "runId": runID, "runAttempt": "1",
          "fixtureId": "existing_13_ridge_restaurant_en_US",
          "inputSha256": expectedImageSHA, "inputBytes": 263039,
          "width": 1086, "height": 1448, "fallbackCurrency": "USD",
          "modelManifestSha256": modelHash, "modelPackIds": modelIDs,
          "providerCalls": calls, "wallTimeMs": wall,
          "engineInitializedThisCall": initialized,
          "processLifetimePeakRssBytes": peak,
          "capturedAtMs": Int(Date().timeIntervalSince1970 * 1000),
          "channel": result.channelValue,
        ]
      }
      calls = 1
      let coldStart = DispatchTime.now().uptimeNanoseconds
      failureStage = "engine_initialization"
      let engine = try await SettleoraPaddleOcrEngine.make()
      failureStage = "first_recognition"
      let first = try await engine.recognize(image)
      let firstWall = milliseconds(coldStart)
      failureStage = "first_capture"
      let firstData = try privateJSON(envelope("first", first, firstWall, true),
                                     at: documents.appendingPathComponent("first.json"), maximum: 128 * 1024)
      _ = try privateJSON([
        "schemaVersion": 1, "purpose": purpose, "stage": "first_ready",
        "providerCalls": calls, "bytes": firstData.0, "sha256": firstData.1,
        "wallTimeMs": firstWall, "blockCount": first.blocks.count,
      ], at: documents.appendingPathComponent("first-ready.json"), maximum: 4096)

      // A second invocation is admitted only after the host preserves the first.
      failureStage = "warm_admission"
      let admissionStart = DispatchTime.now().uptimeNanoseconds
      while !FileManager.default.fileExists(atPath: documents.appendingPathComponent("allow-warm").path) {
        if FileManager.default.fileExists(atPath: documents.appendingPathComponent("stop-after-first").path) { return }
        try requireRuntime(milliseconds(admissionStart) < 120_000)
        try await Task.sleep(nanoseconds: 200_000_000)
      }
      try requireRuntime(calls == 1 && digest(image) == expectedImageSHA)
      calls = 2
      let warmStart = DispatchTime.now().uptimeNanoseconds
      failureStage = "warm_recognition"
      let warm = try await engine.recognize(image)
      let warmWall = milliseconds(warmStart)
      failureStage = "warm_capture"
      let warmData = try privateJSON(envelope("warm", warm, warmWall, false),
                                    at: documents.appendingPathComponent("warm.json"), maximum: 64 * 1024)
      _ = try privateJSON([
        "schemaVersion": 1, "purpose": purpose, "stage": "warm_ready",
        "providerCalls": calls, "bytes": warmData.0, "sha256": warmData.1,
        "wallTimeMs": warmWall, "blockCount": warm.blocks.count,
      ], at: documents.appendingPathComponent("warm-ready.json"), maximum: 4096)
    } catch {
      // No exception messages, paths, image bytes or recognized text in logs.
      _ = try? privateJSON([
        "schemaVersion": 1, "purpose": purpose, "stage": "failed",
        "providerCalls": calls, "failureCode": "native_runtime_failed", "failureStage": failureStage,
      ], at: documents.appendingPathComponent("failure.json"), maximum: 4096)
    }
  }
}

UIApplicationMain(CommandLine.argc, CommandLine.unsafeArgv, nil,
                  NSStringFromClass(Arm64RuntimeAppDelegate.self))
