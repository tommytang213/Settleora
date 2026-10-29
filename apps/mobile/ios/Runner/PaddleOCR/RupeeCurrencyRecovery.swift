import Foundation

// Recover an actual currency glyph only inside an independently corroborated
// money column. Original recognition and geometry retain all authority over the
// role; the recovery output must preserve every monetary character.
enum RupeeCurrencyRecovery {
  private static let amount = #"[+−-]?(?:[0-9]+\.[0-9]{2}|[1-9][0-9]{0,2}(?:,[0-9]{3})+\.[0-9]{2}|[1-9][0-9]?(?:,[0-9]{2})+,[0-9]{3}\.[0-9]{2})"#
  private static let damaged = #"[रऱ][ \t]*("# + amount + ")"
  private static let complete = #"₹[ \t]*("# + amount + ")"
  private struct Bounds {
    let left: Double, top: Double, right: Double, bottom: Double
  }

  static func shouldProbe(
    _ index: Int, original: [ScriptCandidate?], common: [ScriptCandidate?],
    points: [[CalendarDateRecovery.Point]]
  ) -> Bool {
    originalAmount(index, original: original, common: common, points: points) != nil
  }

  static func accepts(
    _ index: Int, original: [ScriptCandidate?], common: [ScriptCandidate?],
    points: [[CalendarDateRecovery.Point]], recovery: ScriptCandidate, recoveryPack: RecognizerSpec
  ) -> Bool {
    guard let value = originalAmount(index, original: original, common: common, points: points) else { return false }
    return recovery.pack == recoveryPack && recoveryPack.acceptedScripts == [.common] &&
      recoveryPack != common[index]?.pack && confident(recovery) && money(complete, recovery.text) == value
  }

  private static func originalAmount(
    _ index: Int, original: [ScriptCandidate?], common: [ScriptCandidate?],
    points: [[CalendarDateRecovery.Point]]
  ) -> String? {
    guard original.count == common.count, original.count == points.count,
          original.indices.contains(index), let selected = original[index], let broad = common[index],
          selected.pack.acceptedScripts == [.devanagari], broad.pack.acceptedScripts == [.common],
          confident(selected), confident(broad), let value = money(damaged, selected.text),
          broad.text.trimmingCharacters(in: CharacterSet(charactersIn: " \t")) == value else { return nil }
    for candidate in original {
      guard let candidate, !candidate.text.isEmpty else { return nil }
      if candidate.text.unicodeScalars.contains(where: {
        $0.properties.generalCategory == .currencySymbol && $0.value != 0x20B9
      }) { return nil }
    }
    var rectangles: [Bounds] = []
    for polygon in points {
      guard let rectangle = bounds(polygon) else { return nil }
      rectangles.append(rectangle)
    }
    let cell = rectangles[index]
    let neighbors = rectangles.indices.filter { $0 != index && overlap(cell, rectangles[$0]) > 0 }
    guard neighbors.count == 1, let label = original[neighbors[0]], confident(label) else { return nil }
    let labelBox = rectangles[neighbors[0]]
    let letters: Set<Unicode.GeneralCategory> = [.uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter]
    guard label.text.unicodeScalars.contains(where: { letters.contains($0.properties.generalCategory) }),
          !label.text.unicodeScalars.contains(where: {
            $0.properties.generalCategory == .decimalNumber || $0.properties.generalCategory == .currencySymbol
          }), labelBox.right <= cell.left,
          overlap(cell, labelBox) >= min(cell.bottom - cell.top, labelBox.bottom - labelBox.top) / 2,
          cell.left - labelBox.right <= 4 * max(cell.right - cell.left, labelBox.right - labelBox.left) else { return nil }
    let proofs = original.indices.filter { otherIndex in
      guard otherIndex != index, let other = original[otherIndex], other.pack == broad.pack,
            confident(other), money(complete, other.text) != nil else { return false }
      let rect = rectangles[otherIndex]
      return overlap(cell, rect) <= 0 &&
        abs(cell.right - rect.right) <= max(cell.bottom - cell.top, rect.bottom - rect.top) / 2
    }
    guard proofs.contains(where: { a in
      proofs.contains(where: { b in a != b && overlap(rectangles[a], rectangles[b]) <= 0 })
    }) else { return nil }
    return value
  }

  private static func confident(_ candidate: ScriptCandidate) -> Bool {
    candidate.confidence.isFinite && (Float(0.90)...Float(1)).contains(candidate.confidence)
  }

  private static func money(_ pattern: String, _ text: String) -> String? {
    let value = text.trimmingCharacters(in: CharacterSet(charactersIn: " \t"))
    guard let regex = try? NSRegularExpression(pattern: "^(?:" + pattern + ")$"),
          let match = regex.firstMatch(in: value, range: NSRange(value.startIndex..., in: value)),
          match.range == NSRange(value.startIndex..., in: value),
          let range = Range(match.range(at: 1), in: value) else { return nil }
    return String(value[range])
  }

  private static func bounds(_ points: [CalendarDateRecovery.Point]) -> Bounds? {
    guard points.count == 4, points.allSatisfy({ $0.x.isFinite && $0.y.isFinite && $0.x >= 0 && $0.y >= 0 }) else { return nil }
    let crosses = points.indices.map { i -> Double in
      let a = points[i], b = points[(i + 1) % 4], c = points[(i + 2) % 4]
      return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    }
    guard crosses.allSatisfy({ $0.isFinite }),
          crosses.allSatisfy({ $0 > 0 }) || crosses.allSatisfy({ $0 < 0 }) else { return nil }
    return Bounds(left: points.map(\.x).min()!, top: points.map(\.y).min()!,
                  right: points.map(\.x).max()!, bottom: points.map(\.y).max()!)
  }

  private static func overlap(_ a: Bounds, _ b: Bounds) -> Double {
    min(a.bottom, b.bottom) - max(a.top, b.top)
  }
}
