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
  let rupeeRecovery: RecognizerSpec?

  static func load() throws -> MobileOcrModelCatalog {
    let data = try Data(contentsOf: FlutterAssetResolver.url("assets/receipt_ocr_models/catalog.json"))
    guard
      let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      let packs = root["packs"] as? [[String: Any]]
    else { throw SettleoraOcrError.invalidCatalog }

    var detection: DetectionModelSpec?
    var recognizers: [RecognizerSpec] = []
    var rupeeRecovery: RecognizerSpec?
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
      } else if role == "recognition" || role == "recognition_recovery" {
        let spec = RecognizerSpec(
          modelPackID: id,
          modelVersion: version,
          modelPath: modelPath,
          configPath: configPath,
          acceptedScripts: try scripts(routeScripts)
        )
        if role == "recognition_recovery" {
          guard rupeeRecovery == nil,
                pack["recoveryPolicy"] as? String == "corroborated_rupee_money",
                spec.acceptedScripts == [.common] else { throw SettleoraOcrError.invalidCatalog }
          rupeeRecovery = spec
        } else {
          recognizers.append(spec)
        }
      } else {
        throw SettleoraOcrError.invalidCatalog
      }
    }
    guard let detection, !recognizers.isEmpty else { throw SettleoraOcrError.invalidCatalog }
    return MobileOcrModelCatalog(detection: detection, recognizers: recognizers, rupeeRecovery: rupeeRecovery)
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

// This optional recovery follows all mandatory common/specialist probes.
enum CyrillicRecovery {
  static let whiteMargin = 12

  static func shouldProbe(_ candidates: [ScriptCandidate]) -> Bool {
    let common = candidates.filter { $0.pack.acceptedScripts.contains(.common) }
    guard common.count == 1, textOnly(common[0].text) else { return false }
    guard let selected = ScriptRouteSelector.select(candidates) else { return true }
    return selected.pack.acceptedScripts.contains(.common) &&
      selected.confidence < 0.90 && textOnly(selected.text)
  }

  static func accepts(_ candidates: [ScriptCandidate], recovery: ScriptCandidate) -> Bool {
    shouldProbe(candidates) && recovery.pack.acceptedScripts == [.cyrillic] &&
      candidates.contains { $0.pack == recovery.pack } &&
      (Float(0.1)...Float(1)).contains(recovery.confidence) && !recovery.text.isEmpty &&
      textOnly(recovery.text) && ScriptRouteSelector.score(recovery).isFinite
  }

  private static func textOnly(_ text: String) -> Bool {
    !text.unicodeScalars.contains {
      $0.properties.generalCategory == .decimalNumber ||
        $0.properties.generalCategory == .currencySymbol
    }
  }
}

// Match Android: use actual fixed-margin common recognition only when a separate
// original complete zł cell corroborates the damaged suffix. Never rewrite digits.
enum PolishCurrencyRecovery {
  static let whiteMargin = 12
  private static let amount = #"([+−-]?(?:[0-9]+[.,][0-9]{2}|[1-9][0-9]{0,2}(?:,[0-9]{3})+\.[0-9]{2}|[1-9][0-9]{0,2}(?:\.[0-9]{3})+,[0-9]{2}))"#
  private static let damaged = try! NSRegularExpression(pattern: #"\A"# + amount + #"[ \t]+(?:zl|zì)\z"#)
  private static let complete = try! NSRegularExpression(pattern: #"\A"# + amount + #"[ \t]+zł\z"#)

  static func shouldProbe(_ index: Int, original: [ScriptCandidate?]) -> Bool {
    guard original.indices.contains(index), let candidate = original[index],
          confidentCommon(candidate), amount(in: candidate.text, matching: damaged) != nil else { return false }
    return original.enumerated().contains { otherIndex, other in
      guard otherIndex != index, let other = other, other.pack == candidate.pack else { return false }
      return confidentCommon(other) && amount(in: other.text, matching: complete) != nil
    }
  }

  static func accepts(_ index: Int, original: [ScriptCandidate?], recovery: ScriptCandidate) -> Bool {
    guard shouldProbe(index, original: original), let candidate = original[index] else { return false }
    return recovery.pack == candidate.pack && confidentCommon(recovery) &&
      amount(in: recovery.text, matching: complete) == amount(in: candidate.text, matching: damaged)
  }

  private static func confidentCommon(_ candidate: ScriptCandidate) -> Bool {
    candidate.pack.acceptedScripts.contains(.common) && candidate.confidence.isFinite &&
      (Float(0.8)...Float(1)).contains(candidate.confidence)
  }

  private static func amount(in text: String, matching pattern: NSRegularExpression) -> String? {
    let literal = text.trimmingCharacters(in: CharacterSet(charactersIn: " \t")) as NSString
    let range = NSRange(location: 0, length: literal.length)
    guard let match = pattern.firstMatch(in: literal as String, range: range), match.range == range else { return nil }
    return literal.substring(with: match.range(at: 1))
  }
}

// Match Android: require an original complete label and its sole row neighbor.
// A recovered date restores separators only; every original digit must survive.
enum CalendarDateRecovery {
  struct Point { let x: Double; let y: Double }
  private struct Bounds { let left: Double; let top: Double; let right: Double; let bottom: Double }
  private static let damaged = try! NSRegularExpression(pattern: #"\A((?:19|20)[0-9]{2})·([0-9]{2})([0-9]{2})\z"#)
  private static let complete = try! NSRegularExpression(pattern: #"\A((?:19|20)[0-9]{2})·([0-9]{2})·([0-9]{2})·?\z"#)
  private static let label = try! NSRegularExpression(pattern: #"\A(?:date|datum|fecha|data|日期|日付|날짜|дата|วันที่|तारीख|दिनांक)[ \t]*[:：]?\z"#, options: [.caseInsensitive])

  static func shouldProbe(_ index: Int, original: [ScriptCandidate?], points: [[Point]]) -> Bool {
    guard original.indices.contains(index), let candidate = original[index], points.count == original.count,
          confidentCommon(candidate), dateDigits(candidate.text, matching: damaged) != nil else { return false }
    // Missing geometry cannot establish that the entire row has no competitor.
    let rectangles = points.compactMap { bounds($0) }
    guard rectangles.count == points.count else { return false }
    let value = rectangles[index]
    let neighbors = rectangles.indices.filter { $0 != index && overlap(value, rectangles[$0]) > 0 }
    guard neighbors.count == 1, let otherIndex = neighbors.first, let other = original[otherIndex] else { return false }
    let name = rectangles[otherIndex]
    let literal = other.text.trimmingCharacters(in: CharacterSet(charactersIn: " \t")) as NSString
    let range = NSRange(location: 0, length: literal.length)
    return other.pack == candidate.pack && confidentCommon(other) &&
      label.firstMatch(in: literal as String, range: range)?.range == range && name.right <= value.left &&
      overlap(value, name) >= min(value.bottom - value.top, name.bottom - name.top) / 2 &&
      value.left - name.right <= 4 * max(value.right - value.left, name.right - name.left)
  }

  static func accepts(_ index: Int, original: [ScriptCandidate?], points: [[Point]], recovery: ScriptCandidate) -> Bool {
    guard shouldProbe(index, original: original, points: points), let candidate = original[index] else { return false }
    return recovery.pack == candidate.pack && confidentCommon(recovery) &&
      dateDigits(recovery.text, matching: complete) == dateDigits(candidate.text, matching: damaged)
  }

  private static func confidentCommon(_ candidate: ScriptCandidate) -> Bool {
    candidate.pack.acceptedScripts.contains(.common) && candidate.confidence.isFinite &&
      (Float(0.8)...Float(1)).contains(candidate.confidence)
  }

  private static func dateDigits(_ text: String, matching pattern: NSRegularExpression) -> String? {
    let literal = text.trimmingCharacters(in: CharacterSet(charactersIn: " \t")) as NSString
    let range = NSRange(location: 0, length: literal.length)
    guard let match = pattern.firstMatch(in: literal as String, range: range), match.range == range else { return nil }
    let fields = (1...3).map { literal.substring(with: match.range(at: $0)) }
    guard let year = Int(fields[0]), let month = Int(fields[1]), let day = Int(fields[2]), (1...12).contains(month) else { return nil }
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
    let days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    guard (1...days[month - 1]).contains(day) else { return nil }
    return fields.joined()
  }

  private static func bounds(_ points: [Point]) -> Bounds? {
    guard points.count == 4, points.allSatisfy({ $0.x.isFinite && $0.y.isFinite && $0.x >= 0 && $0.y >= 0 }) else { return nil }
    let crosses = points.indices.map { i -> Double in
      let a = points[i], b = points[(i + 1) % 4], c = points[(i + 2) % 4]
      return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    }
    guard crosses.allSatisfy({ $0.isFinite }), crosses.allSatisfy({ $0 > 0 }) || crosses.allSatisfy({ $0 < 0 }) else { return nil }
    return Bounds(left: points.map(\.x).min()!, top: points.map(\.y).min()!, right: points.map(\.x).max()!, bottom: points.map(\.y).max()!)
  }

  private static func overlap(_ a: Bounds, _ b: Bounds) -> Double { min(a.bottom, b.bottom) - max(a.top, b.top) }
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
      .filter { CharacterSet.letters.contains($0) || CharacterSet.decimalDigits.contains($0) }
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

// Observe existing candidates/frozen winners only. No selection, recovery,
// normalization or monetary interpretation is performed by these counters.
enum NumericRoutingObserver {
  private static let stage = "selectedOrientationPreRecovery"
  private static let bins = ["noSelection", "nonNumeric", "one", "two", "three", "four", "fiveToEight", "ninePlus"]
  private static let punctuation: Set<UInt32> = [0x20, 0x09, 0x2E, 0x2C, 0x060C, 0x066B, 0x066C, 0x2B, 0x2D, 0x2212]
  private struct Shape { let scalars: [UInt32]; let digits: Int }

  static func unavailable() -> [String: Any] { envelope("unavailable") }

  private static func envelope(_ status: String) -> [String: Any] {
    ["schemaVersion": 1, "stage": stage, "status": status]
  }

  private static func shape(_ candidate: ScriptCandidate) -> Shape? {
    let scalars = Array(candidate.text.trimmingCharacters(in: CharacterSet(charactersIn: " \t")).unicodeScalars)
    var digits = 0
    for scalar in scalars {
      if CharacterSet.decimalDigits.contains(scalar) { digits += 1 }
      else if !punctuation.contains(scalar.value) { return nil }
    }
    return digits > 0 ? Shape(scalars: scalars.map(\.value), digits: digits) : nil
  }

  static func observe(_ candidatesByCrop: [[ScriptCandidate]], original: [ScriptCandidate?]) -> [String: Any] {
    guard candidatesByCrop.count == original.count, candidatesByCrop.count <= 256 else { return envelope("invalid") }
    var numericCrops = 0, eligibleCrops = 0, competingCrops = 0, disagreementCrops = 0
    var eligibleShorterCrops = 0, anyShorterCrops = 0
    var selectedBins = Dictionary(uniqueKeysWithValues: bins.map { ($0, 0) })
    for index in candidatesByCrop.indices {
      let candidates = candidatesByCrop[index]
      let winner = original[index]
      if let winner {
        let present = candidates.contains {
          $0.pack == winner.pack && $0.confidence.bitPattern == winner.confidence.bitPattern &&
            $0.text.unicodeScalars.elementsEqual(winner.text.unicodeScalars)
        }
        guard present, ScriptRouteSelector.score(winner).isFinite else { return envelope("invalid") }
      }
      let numeric: [(ScriptCandidate, Shape)] = candidates.compactMap { candidate in
        guard let value = shape(candidate) else { return nil }
        return (candidate, value)
      }
      let eligible = numeric.filter { ScriptRouteSelector.score($0.0).isFinite }
      if winner == nil && !eligible.isEmpty { return envelope("invalid") }
      if !numeric.isEmpty { numericCrops += 1 }
      if !eligible.isEmpty { eligibleCrops += 1 }
      if eligible.count >= 2 { competingCrops += 1 }
      if Set(eligible.map { $0.1.scalars }).count >= 2 { disagreementCrops += 1 }
      let selected = winner.flatMap { shape($0) }
      let bin: String
      if winner == nil { bin = "noSelection" }
      else if let selected {
        switch selected.digits {
        case 1: bin = "one"
        case 2: bin = "two"
        case 3: bin = "three"
        case 4: bin = "four"
        case 5...8: bin = "fiveToEight"
        default: bin = "ninePlus"
        }
      } else { bin = "nonNumeric" }
      selectedBins[bin, default: 0] += 1
      if let selected {
        if numeric.contains(where: { $0.1.digits > selected.digits }) { anyShorterCrops += 1 }
        if eligible.contains(where: { $0.1.digits > selected.digits }) { eligibleShorterCrops += 1 }
      }
    }
    var result = envelope("observed")
    result["observedCropCount"] = candidatesByCrop.count
    result["numericCandidateCropCount"] = numericCrops
    result["eligibleNumericCandidateCropCount"] = eligibleCrops
    result["competingEligibleNumericCandidateCropCount"] = competingCrops
    result["eligibleNumericLiteralDisagreementCropCount"] = disagreementCrops
    result["selectedShorterThanEligibleNumericAlternateCropCount"] = eligibleShorterCrops
    result["selectedShorterThanAnyNumericAlternateCropCount"] = anyShorterCrops
    result["selectedDigitCountBins"] = selectedBins
    return result
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
