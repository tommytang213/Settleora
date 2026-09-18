import Foundation

enum ReceiptOrientationSelector {
  static func shouldRotate180(upright: [ScriptCandidate], rotated: [ScriptCandidate]) -> Bool {
    guard upright.count == rotated.count, !upright.isEmpty else { return false }
    var rotatedWins = 0
    var uprightWins = 0
    var uprightScore = 0.0
    var rotatedScore = 0.0
    for (normal, flipped) in zip(upright, rotated) {
      let normalScore = lineScore(normal)
      let flippedScore = lineScore(flipped)
      uprightScore += normalScore
      rotatedScore += flippedScore
      if flippedScore - normalScore >= 0.08 { rotatedWins += 1 }
      if normalScore - flippedScore >= 0.08 { uprightWins += 1 }
    }
    return rotatedWins > uprightWins && rotatedWins * 2 >= upright.count &&
      rotatedScore - uprightScore >= 0.10 * Double(upright.count)
  }

  private static func lineScore(_ candidate: ScriptCandidate) -> Double {
    guard !candidate.text.isEmpty else { return 0 }
    let scalars = candidate.text.unicodeScalars
    let meaningful = scalars.filter {
      CharacterSet.alphanumerics.contains($0)
    }.count
    guard meaningful > 0 else { return 0 }
    let share = Double(meaningful) / Double(scalars.count)
    return Double(min(1, max(0, candidate.confidence))) * (0.75 + 0.25 * share)
  }
}

enum ReceiptBlockOrder {
  static func normalize(_ source: [SettleoraOcrBlock]) -> [SettleoraOcrBlock] {
    let sorted = source.sorted { top($0) < top($1) }
    var ordered: [SettleoraOcrBlock] = []
    var index = 0
    var rowIndex = 0
    while index < sorted.count {
      var row: [SettleoraOcrBlock] = []
      while index < sorted.count && (row.isEmpty || sameRow(row, sorted[index])) {
        row.append(sorted[index])
        index += 1
      }
      let rtl = directionCounts(row.map(\.text).joined()).rtl > directionCounts(row.map(\.text).joined()).ltr
      row.sort { rtl ? left($0) > left($1) : left($0) < left($1) }
      for var block in row {
        block.row = rowIndex
        ordered.append(block)
      }
      rowIndex += 1
    }
    for index in ordered.indices { ordered[index].order = index }
    return ordered
  }

  static func textDirection(_ text: String) -> String {
    let counts = directionCounts(text)
    return counts.rtl > counts.ltr ? "rtl" : "ltr"
  }

  private static func sameRow(_ row: [SettleoraOcrBlock], _ next: SettleoraOcrBlock) -> Bool {
    guard let previous = row.last else { return true }
    let adjacent = abs(center(previous) - center(next)) <= min(height(previous), height(next)) * 0.75
    guard adjacent else { return false }
    let centers = row.map(center) + [center(next)]
    let minimumHeight = min(row.map(height).min() ?? 1, height(next))
    return (centers.max()! - centers.min()!) <= minimumHeight * 0.90
  }

  private static func top(_ block: SettleoraOcrBlock) -> Double { block.points.map(\.y).min() ?? 0 }
  private static func bottom(_ block: SettleoraOcrBlock) -> Double { block.points.map(\.y).max() ?? 0 }
  private static func left(_ block: SettleoraOcrBlock) -> Double { block.points.map(\.x).min() ?? 0 }
  private static func height(_ block: SettleoraOcrBlock) -> Double { max(1, bottom(block) - top(block)) }
  private static func center(_ block: SettleoraOcrBlock) -> Double { top(block) + height(block) / 2 }

  private static func directionCounts(_ text: String) -> (ltr: Int, rtl: Int) {
    var ltr = 0
    var rtl = 0
    for scalar in text.unicodeScalars {
      switch scalar.properties.generalCategory {
      case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter:
        let value = scalar.value
        if (0x0590...0x08FF).contains(value) { rtl += 1 } else { ltr += 1 }
      default: break
      }
    }
    return (ltr, rtl)
  }
}
