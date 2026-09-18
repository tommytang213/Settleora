import Flutter
import Foundation

enum ScriptEvidence: Hashable {
  case neutral, common, arabic, cyrillic, devanagari, korean, thai
}

struct DetectionModelSpec {
  let modelPackID: String
  let modelVersion: String
  let modelPath: String
  let configPath: String
}

struct RecognizerSpec: Hashable {
  let modelPackID: String
  let modelVersion: String
  let modelPath: String
  let configPath: String
  let acceptedScripts: Set<ScriptEvidence>
}

struct MobileOcrModelCatalog {
  let detection: DetectionModelSpec
  let recognizers: [RecognizerSpec]

  static func load() throws -> MobileOcrModelCatalog {
    let data = try Data(contentsOf: FlutterAssetResolver.url("assets/receipt_ocr_models/catalog.json"))
    guard
      let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      let packs = root["packs"] as? [[String: Any]]
    else { throw SettleoraOcrError.invalidCatalog }

    var detection: DetectionModelSpec?
    var recognizers: [RecognizerSpec] = []
    for pack in packs {
      guard
        let id = pack["modelPackId"] as? String,
        let version = pack["modelVersion"] as? String,
        let role = pack["role"] as? String,
        let assetDirectory = pack["assetDirectory"] as? String,
        let routeScripts = pack["routeScripts"] as? [String]
      else { throw SettleoraOcrError.invalidCatalog }
      let directory = assetDirectory.hasPrefix("assets/") ? assetDirectory : "assets/\(assetDirectory)"
      let modelPath = try FlutterAssetResolver.url("\(directory)/inference.onnx").path
      let configPath = try FlutterAssetResolver.url("\(directory)/inference.yml").path
      if role == "detection" {
        guard detection == nil else { throw SettleoraOcrError.invalidCatalog }
        detection = DetectionModelSpec(
          modelPackID: id, modelVersion: version, modelPath: modelPath, configPath: configPath
        )
      } else if role == "recognition" {
        recognizers.append(RecognizerSpec(
          modelPackID: id,
          modelVersion: version,
          modelPath: modelPath,
          configPath: configPath,
          acceptedScripts: try scripts(routeScripts)
        ))
      } else {
        throw SettleoraOcrError.invalidCatalog
      }
    }
    guard let detection, !recognizers.isEmpty else { throw SettleoraOcrError.invalidCatalog }
    return MobileOcrModelCatalog(detection: detection, recognizers: recognizers)
  }

  private static func scripts(_ routes: [String]) throws -> Set<ScriptEvidence> {
    var result: Set<ScriptEvidence> = []
    for route in routes {
      switch route {
      case "Latin", "HanSimplified", "HanTraditional", "Japanese": result.insert(.common)
      case "Arabic": result.insert(.arabic)
      case "Cyrillic": result.insert(.cyrillic)
      case "Devanagari": result.insert(.devanagari)
      case "Korean": result.insert(.korean)
      case "Thai": result.insert(.thai)
      default: throw SettleoraOcrError.invalidCatalog
      }
    }
    guard !result.isEmpty else { throw SettleoraOcrError.invalidCatalog }
    return result
  }
}

enum FlutterAssetResolver {
  static func url(_ asset: String) throws -> URL {
    let key = FlutterDartProject.lookupKey(forAsset: asset)
    if let path = Bundle.main.path(forResource: key, ofType: nil) {
      return URL(fileURLWithPath: path)
    }
    let appFramework = Bundle.main.bundleURL
      .appendingPathComponent("Frameworks/App.framework")
      .appendingPathComponent(key)
    guard FileManager.default.fileExists(atPath: appFramework.path) else {
      throw SettleoraOcrError.missingAsset
    }
    return appFramework
  }
}

struct ScriptCandidate {
  let text: String
  let confidence: Float
  let pack: RecognizerSpec
}

enum ScriptRouteSelector {
  private static let scriptMatchBonus = 0.24
  private static let specialistBias = 0.20
  private static let commonNeutralBias = 0.03

  static func select(_ candidates: [ScriptCandidate]) -> ScriptCandidate? {
    candidates
      .filter { !$0.text.isEmpty && score($0).isFinite }
      .max { score($0) < score($1) }
  }

  static func score(_ candidate: ScriptCandidate) -> Double {
    let strong = candidate.text.unicodeScalars
      .filter { CharacterSet.letters.contains($0) }
      .map { script(of: $0.value) }
      .filter { $0 != .neutral }
    let scripts = Set(strong)
    let common = candidate.pack.acceptedScripts.contains(.common)
    if scripts.isEmpty {
      return common ? Double(candidate.confidence) + commonNeutralBias : -.infinity
    }
    let compatible = scripts.allSatisfy {
      candidate.pack.acceptedScripts.contains($0) || (!common && $0 == .common)
    }
    let declared = strong.filter(candidate.pack.acceptedScripts.contains).count
    let meaningful = common || (declared >= 2 && declared * 4 >= strong.count)
    guard compatible && meaningful else { return -.infinity }
    return Double(candidate.confidence) + scriptMatchBonus + (common ? 0 : specialistBias)
  }

  private static func script(of value: UInt32) -> ScriptEvidence {
    switch value {
    case 0x0041...0x024F, 0x1E00...0x1EFF,
         0x3040...0x30FF, 0x31F0...0x31FF,
         0x3400...0x4DBF, 0x4E00...0x9FFF, 0xF900...0xFAFF: return .common
    case 0x0600...0x06FF, 0x0750...0x077F, 0x08A0...0x08FF: return .arabic
    case 0x0400...0x052F: return .cyrillic
    case 0x0900...0x097F: return .devanagari
    case 0x0E00...0x0E7F: return .thai
    case 0x1100...0x11FF, 0x3130...0x318F, 0xAC00...0xD7AF: return .korean
    default: return .neutral
    }
  }
}

enum RecognizedTextNormalizer {
  static func normalize(_ text: String, pack: RecognizerSpec) -> String {
    guard pack.acceptedScripts.contains(.arabic), containsArabic(text) else { return text }
    var logical = Array(text).reversed().map(String.init)
    var index = 0
    while index < logical.count {
      guard isForward(logical[index]) else { index += 1; continue }
      var end = index + 1
      while end < logical.count {
        if isForward(logical[end]) { end += 1; continue }
        if logical[end].trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
           end + 1 < logical.count, isForward(logical[end + 1]) {
          end += 2
          continue
        }
        break
      }
      logical.replaceSubrange(index..<end, with: logical[index..<end].reversed())
      index = end
    }
    return logical.joined()
  }

  private static func containsArabic(_ text: String) -> Bool {
    text.unicodeScalars.contains { (0x0600...0x06FF).contains($0.value) ||
      (0x0750...0x077F).contains($0.value) || (0x08A0...0x08FF).contains($0.value) }
  }

  private static func isForward(_ value: String) -> Bool {
    value.unicodeScalars.contains { scalar in
      CharacterSet.decimalDigits.contains(scalar) ||
        CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,،٫٬/%:+-").contains(scalar)
    }
  }
}

enum SettleoraOcrError: Error {
  case invalidCatalog, missingAsset, invalidImage, imageTooLarge, tooManyLines, invalidResult
}
