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
    let packagedRelativePath = asset.hasPrefix("assets/")
      ? String(asset.dropFirst("assets/".count))
      : asset
    let packaged = Bundle.main.bundleURL.appendingPathComponent(packagedRelativePath)
    if FileManager.default.fileExists(atPath: packaged.path) {
      return packaged
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
    let eligible = candidates.filter { !$0.text.isEmpty && score($0).isFinite }
    guard let selected = eligible.max(by: { score($0) < score($1) }) else { return nil }
    if selected.pack.acceptedScripts.contains(.common) { return selected }

    // Match Android's evidenced rupee-symbol/Devanagari-ra exception. Arbitrary
    // symbol/letter pairs remain subject to the existing script calibration.
    // Never infer a currency or rewrite the selected text and provenance.
    let commonCandidates = eligible.filter { $0.pack.acceptedScripts.contains(.common) }
    guard commonCandidates.count == 1, let common = commonCandidates.first,
          (Float(0.90)...Float(1)).contains(common.confidence),
          common.confidence + Float(0.03) >= selected.confidence,
          let monetary = monetaryGlyph(common.text),
          monetary.marker == "₹"
    else { return selected }
    let agrees = eligible.allSatisfy { candidate in
      guard let shape = monetaryGlyph(candidate.text), shape.skeleton == monetary.skeleton else {
        return false
      }
      if candidate.pack.acceptedScripts.contains(.common) {
        return shape.marker == monetary.marker
      }
      return candidate.pack.acceptedScripts.contains(.devanagari) && shape.marker == "र"
    }
    return agrees ? common : selected
  }

  private struct MonetaryGlyph {
    let marker: String
    let skeleton: String
  }

  // Preserve exact signs and decimal/grouping spelling; do not interpret values.
  // Local numerals, words, multiple amounts and malformed groups are excluded.
  private static let amountLiteral = try! NSRegularExpression(
    pattern: #"\A(?:[0-9]+(?:[.,][0-9]{1,3})?|[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,3})?|[0-9]{1,2}(?:,[0-9]{2})+,[0-9]{3}(?:\.[0-9]{1,3})?|[0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{1,3})?)\z"#
  )
  private static let prefixGlyph = try! NSRegularExpression(
    pattern: #"\A([+−-]?)([\p{Sc}\p{L}])[ \t]*([+−-]?)([0-9][0-9.,]*)\z"#
  )
  private static let suffixGlyph = try! NSRegularExpression(
    pattern: #"\A([+−-]?)([0-9][0-9.,]*)[ \t]*([\p{Sc}\p{L}])\z"#
  )

  // Anchors must participate in matching so a short alternative cannot hide a
  // valid grouped-number alternative. A post-match range check alone is insufficient.
  private static func wholeMatch(_ pattern: NSRegularExpression, _ text: String) -> [String]? {
    let source = text as NSString
    let range = NSRange(location: 0, length: source.length)
    guard let match = pattern.firstMatch(in: text, range: range), match.range == range else {
      return nil
    }
    return (1..<match.numberOfRanges).map { source.substring(with: match.range(at: $0)) }
  }

  private static func monetaryGlyph(_ text: String) -> MonetaryGlyph? {
    let literal = text.trimmingCharacters(in: CharacterSet(charactersIn: " \t"))
    if let parts = wholeMatch(prefixGlyph, literal) {
      let before = parts[0], marker = parts[1], after = parts[2], amount = parts[3]
      guard before.isEmpty || after.isEmpty, wholeMatch(amountLiteral, amount) != nil else {
        return nil
      }
      return MonetaryGlyph(marker: marker, skeleton: "\(before)#\(after)\(amount)")
    }
    if let parts = wholeMatch(suffixGlyph, literal) {
      let sign = parts[0], amount = parts[1], marker = parts[2]
      guard wholeMatch(amountLiteral, amount) != nil else { return nil }
      return MonetaryGlyph(marker: marker, skeleton: "\(sign)\(amount)#")
    }
    return nil
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
    let meaningful = common || (declared > 0 && declared * 4 >= strong.count)
    guard compatible && meaningful else { return -.infinity }
    return Double(candidate.confidence) + scriptMatchBonus + (common ? 0 : specialistBias)
  }

  private static func script(of value: UInt32) -> ScriptEvidence {
    switch value {
    case 0x0041...0x024F, 0x1E00...0x1EFF,
         0x3040...0x30FF, 0x31F0...0x31FF,
         0x3400...0x4DBF, 0x4E00...0x9FFF, 0xF900...0xFAFF: return .common
    case 0x0600...0x06FF, 0x0750...0x077F, 0x08A0...0x08FF,
         0xFB50...0xFDFF, 0xFE70...0xFEFF: return .arabic
    case 0x0400...0x052F, 0x1C80...0x1C8F, 0x2DE0...0x2DFF,
         0xA640...0xA69F, 0x1E030...0x1E08F: return .cyrillic
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
      (0x0750...0x077F).contains($0.value) ||
      (0x08A0...0x08FF).contains($0.value) ||
      (0xFB50...0xFDFF).contains($0.value) ||
      (0xFE70...0xFEFF).contains($0.value) }
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
