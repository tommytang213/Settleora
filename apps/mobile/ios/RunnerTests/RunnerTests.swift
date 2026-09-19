import Flutter
import UIKit
import XCTest
@testable import Runner

class RunnerTests: XCTestCase {

  func testEncodedImageRejectsOversizedDeclaredDimensionsBeforeDecode() {
    // Valid, compressed 75-byte PNG declaring a 10,000-pixel-wide surface.
    // The encoded header must be rejected before Image I/O decodes its pixels.
    let oversizedHeader = Data([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x27, 0x10, 0x00, 0x00, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x00, 0x00, 0x50, 0xA5, 0x89, 0xA6,
      0x00, 0x00, 0x00, 0x12, 0x49, 0x44, 0x41, 0x54,
      0x78, 0xDA, 0x63, 0x60, 0x18, 0x05, 0xA3, 0x60,
      0x14, 0x8C, 0x82, 0x61, 0x0B, 0x00, 0x04, 0xE3,
      0x00, 0x01, 0x3F, 0x15, 0x39, 0x8A,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44,
      0xAE, 0x42, 0x60, 0x82,
    ])

    XCTAssertThrowsError(try EncodedImageCodec.cgImage(fromEncodedData: oversizedHeader)) { error in
      guard case EncodedImageCodecError.dimensionsExceeded = error else {
        return XCTFail("Expected a pre-decode dimensions rejection, got \(error)")
      }
    }
  }

  @MainActor
  func testRetryableValueLoaderRecoversAfterInitializationFailure() async throws {
    enum ExpectedFailure: Error { case transient }
    let loader = RetryableValueLoader<Int>()
    var attempts = 0

    do {
      _ = try await loader.value {
        attempts += 1
        throw ExpectedFailure.transient
      }
      XCTFail("Expected the first initialization to fail")
    } catch ExpectedFailure.transient {
      // Expected.
    }

    let value = try await loader.value {
      attempts += 1
      return 42
    }
    XCTAssertEqual(value, 42)
    XCTAssertEqual(attempts, 2)

    let cached = try await loader.value {
      attempts += 1
      return 99
    }
    XCTAssertEqual(cached, 42)
    XCTAssertEqual(attempts, 2)
  }

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

  func testArabicPresentationFormRowOrderingTreatsIsoCurrencyAmountAsNeutral() {
    let amount = SettleoraOcrBlock(
      text: "SAR 12.00",
      confidence: 0.9,
      modelPackID: "arabic",
      modelVersion: "test",
      textDirection: "ltr",
      order: 0,
      row: 0,
      points: [
        SettleoraOcrPoint(x: 10, y: 10), SettleoraOcrPoint(x: 80, y: 10),
        SettleoraOcrPoint(x: 80, y: 30), SettleoraOcrPoint(x: 10, y: 30),
      ]
    )
    let presentationDescription = "\u{FB59}\u{FB6A}\u{FDF2}"
    let description = SettleoraOcrBlock(
      text: presentationDescription,
      confidence: 0.9,
      modelPackID: "arabic",
      modelVersion: "test",
      textDirection: "rtl",
      order: 0,
      row: 0,
      points: [
        SettleoraOcrPoint(x: 120, y: 10), SettleoraOcrPoint(x: 180, y: 10),
        SettleoraOcrPoint(x: 180, y: 30), SettleoraOcrPoint(x: 120, y: 30),
      ]
    )

    let ordered = ReceiptBlockOrder.normalize([amount, description])

    XCTAssertEqual(ordered.map(\.text), [presentationDescription, "SAR 12.00"])
    XCTAssertEqual(ordered.map(\.order), [0, 1])
    XCTAssertEqual(ordered.map(\.row), [0, 0])
  }

  func testSpecialistRoutingAcceptsOneSubstantiveGlyph() {
    let arabic = RecognizerSpec(
      modelPackID: "arabic",
      modelVersion: "test",
      modelPath: "/arabic.onnx",
      configPath: "/arabic.yml",
      acceptedScripts: [.arabic]
    )
    let presentationForm = ScriptCandidate(text: "\u{FE8E}", confidence: 0.9, pack: arabic)

    XCTAssertTrue(ScriptRouteSelector.score(presentationForm).isFinite)
  }

  func testSpecialistRoutingRecognizesCyrillicExtendedLetters() {
    let cyrillic = RecognizerSpec(
      modelPackID: "cyrillic",
      modelVersion: "test",
      modelPath: "/cyrillic.onnx",
      configPath: "/cyrillic.yml",
      acceptedScripts: [.cyrillic]
    )

    XCTAssertTrue(
      ScriptRouteSelector.score(
        ScriptCandidate(text: "\u{A640}", confidence: 0.9, pack: cyrillic)
      ).isFinite
    )
    XCTAssertTrue(
      ScriptRouteSelector.score(
        ScriptCandidate(text: "\u{1E030}", confidence: 0.9, pack: cyrillic)
      ).isFinite
    )
  }

  func testArabicPresentationFormsTriggerLogicalNormalization() {
    let arabic = RecognizerSpec(
      modelPackID: "arabic",
      modelVersion: "test",
      modelPath: "/arabic.onnx",
      configPath: "/arabic.yml",
      acceptedScripts: [.arabic]
    )

    XCTAssertEqual(RecognizedTextNormalizer.normalize("\u{FE8E}A", pack: arabic), "A\u{FE8E}")
  }

}
