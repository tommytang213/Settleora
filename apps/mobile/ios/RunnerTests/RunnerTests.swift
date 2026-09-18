import Flutter
import UIKit
import XCTest
@testable import Runner

class RunnerTests: XCTestCase {

  func testDocumentOrientationSelectionCoversQuarterTurns() {
    let vertical = [
      (width: 20.0, height: 80.0),
      (width: 30.0, height: 75.0),
      (width: 90.0, height: 20.0),
    ]

    XCTAssertEqual(
      ReceiptDocumentOrientation.select(
        lineDimensions: vertical,
        reverseRecognition: false
      ),
      .counterclockwise90
    )
    XCTAssertEqual(
      ReceiptDocumentOrientation.select(
        lineDimensions: vertical,
        reverseRecognition: true
      ),
      .clockwise90
    )
  }

  func testDocumentOrientationTransformsGeometryBeforeOrdering() {
    let point = SettleoraOcrPoint(x: 25, y: 10)
    let clockwise = ReceiptDocumentOrientation.clockwise90.transform(
      point,
      sourceWidth: 100,
      sourceHeight: 200
    )
    XCTAssertEqual(clockwise.x, 189)
    XCTAssertEqual(clockwise.y, 25)

    let counterclockwise = ReceiptDocumentOrientation.counterclockwise90.transform(
      point,
      sourceWidth: 100,
      sourceHeight: 200
    )
    XCTAssertEqual(counterclockwise.x, 10)
    XCTAssertEqual(counterclockwise.y, 74)
  }

}
