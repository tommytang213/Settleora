import Foundation

enum ReceiptDocumentOrientation: Equatable {
  case upright
  case clockwise90
  case upsideDown
  case counterclockwise90

  func transform(
    _ point: SettleoraOcrPoint,
    sourceWidth: Int,
    sourceHeight: Int
  ) -> SettleoraOcrPoint {
    let maxX = Double(max(0, sourceWidth - 1))
    let maxY = Double(max(0, sourceHeight - 1))
    switch self {
    case .upright:
      return point
    case .clockwise90:
      return SettleoraOcrPoint(
        x: max(0, min(maxY, maxY - point.y)),
        y: max(0, min(maxX, point.x))
      )
    case .upsideDown:
      return SettleoraOcrPoint(
        x: max(0, min(maxX, maxX - point.x)),
        y: max(0, min(maxY, maxY - point.y))
      )
    case .counterclockwise90:
      return SettleoraOcrPoint(
        x: max(0, min(maxY, point.y)),
        y: max(0, min(maxX, maxX - point.x))
      )
    }
  }

  static func select(
    lineDimensions: [(width: Double, height: Double)],
    reverseRecognition: Bool
  ) -> ReceiptDocumentOrientation {
    let verticalLines = lineDimensions.filter {
      max(1, $0.height) / max(1, $0.width) >= 1.5
    }.count
    let sideways = verticalLines > lineDimensions.count - verticalLines
    switch (sideways, reverseRecognition) {
    case (true, true): return .clockwise90
    case (true, false): return .counterclockwise90
    case (false, true): return .upsideDown
    case (false, false): return .upright
    }
  }
}
