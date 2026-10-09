import Flutter
import UIKit
import XCTest
@testable import Runner

class RunnerTests: XCTestCase {

  func testQuadTextCropReusesOnePreparedReceiptRaster() throws {
    let width = 12
    let height = 8
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let context = CGContext(
      data: nil,
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: width * 4,
      space: colorSpace,
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
      return XCTFail("Could not create test bitmap context")
    }
    context.setFillColor(UIColor.red.cgColor)
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    guard let image = context.makeImage() else {
      return XCTFail("Could not create test image")
    }

    let source = try QuadTextCrop.prepare(image)
    let left = try QuadTextCrop.crop(
      source,
      polygon: [[0, 0], [5, 0], [5, 7], [0, 7]]
    )
    let right = try QuadTextCrop.crop(
      source,
      polygon: [[6, 0], [11, 0], [11, 7], [6, 7]]
    )

    XCTAssertGreaterThan(left.width, 0)
    XCTAssertGreaterThan(left.height, 0)
    XCTAssertGreaterThan(right.width, 0)
    XCTAssertGreaterThan(right.height, 0)
  }

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


  // Synthetic literals, not private receipt content or fixture expectations.
  func testCurrencySymbolCompetitionPreservesLiteralAndScriptEvidence() {
    let cases: [(String, String, Float, String, Float, ScriptEvidence, Bool)] = [
      ("symbol_beats_lower_confidence_letter", "₹ 8,765.43", 0.943, "र 8,765.43", 0.93, .devanagari, true),
      ("symbol_beats_nearby_letter", "₹ 1,23,456.78", 0.943, "र 1,23,456.78", 0.946, .devanagari, true),
      ("suffix_symbol", "8.50 ₹", 0.95, "8.50 र", 0.95, .devanagari, true),
      ("leading_negative", "-₹8.50", 0.95, "-र8.50", 0.95, .devanagari, true),
      ("inner_negative", "₹−8.50", 0.95, "र−8.50", 0.95, .devanagari, true),
      ("explicit_positive", "+₹8.50", 0.95, "+र8.50", 0.95, .devanagari, true),
      ("decimal_comma", "₹8,50", 0.95, "र8,50", 0.95, .devanagari, true),
      ("western_grouping", "₹12,345.67", 0.95, "र12,345.67", 0.95, .devanagari, true),
      ("european_grouping", "₹12.345,67", 0.95, "र12.345,67", 0.95, .devanagari, true),
      ("ambiguous_identical_separator", "₹1,234", 0.95, "र1,234", 0.95, .devanagari, true),
      ("no_explicit_currency", "8.50", 0.95, "र8.50", 0.95, .devanagari, false),
      ("currency_code_is_not_symbol", "INR 8.50", 0.95, "र8.50", 0.95, .devanagari, false),
      ("currency_letters_remain_text", "₹8.50", 0.95, "रुपये 8.50", 0.95, .devanagari, false),
      ("single_glyph_item", "X", 0.99, "차", 0.82, .korean, false),
      ("mixed_script_words", "₹8.50", 0.95, "TOTAL रकम 8.50", 0.95, .devanagari, false),
      ("local_numerals", "₹8.50", 0.95, "र८.५०", 0.95, .devanagari, false),
      ("low_common_confidence", "₹8.50", 0.89, "र8.50", 0.9, .devanagari, false),
      ("large_confidence_gap", "₹8.50", 0.91, "र8.50", 0.99, .devanagari, false),
      ("opposite_signs", "₹-8.50", 0.95, "र+8.50", 0.95, .devanagari, false),
      ("dropped_sign", "-₹8.50", 0.95, "र8.50", 0.95, .devanagari, false),
      ("moved_sign", "-₹8.50", 0.95, "र-8.50", 0.95, .devanagari, false),
      ("opposite_marker_position", "₹8.50", 0.95, "8.50 र", 0.95, .devanagari, false),
      ("different_digits", "₹8.50", 0.95, "र8.60", 0.95, .devanagari, false),
      ("different_separators", "₹8,50", 0.95, "र8.50", 0.95, .devanagari, false),
      ("different_grouping", "₹1,234.50", 0.95, "र1234.50", 0.95, .devanagari, false),
      ("bad_grouping", "₹1,2,3.50", 0.95, "र1,2,3.50", 0.95, .devanagari, false),
      ("two_amounts", "₹8.50 2.00", 0.95, "र8.50 2.00", 0.95, .devanagari, false),
      ("double_sign", "-₹-8.50", 0.95, "-र-8.50", 0.95, .devanagari, false),
      ("parenthesized", "(₹8.50)", 0.95, "(र8.50)", 0.95, .devanagari, false),
      ("decimal_without_integer", "₹.50", 0.95, "र.50", 0.95, .devanagari, false),
      ("letter_combining_sequence", "₹8.50", 0.95, "ऱ8.50", 0.95, .devanagari, false),
      ("genuine_single_letter_item_with_price", "₹8.50", 0.95, "차 8.50", 0.95, .korean, false),
      ("currency_letter_with_price", "₹8.50", 0.95, "р8.50", 0.95, .cyrillic, false),
      ("unrelated_devanagari_letter", "₹8.50", 0.95, "म8.50", 0.95, .devanagari, false),
      ("precomposed_nukta_letter", "₹8.50", 0.95, "ऱ8.50", 0.95, .devanagari, false),
      ("unrelated_currency_symbol", "€8.50", 0.95, "र8.50", 0.95, .devanagari, false),
      ("unrelated_dollar_symbol", "$8.50", 0.95, "र8.50", 0.95, .devanagari, false),
      ("integer", "₹850", 0.95, "र850", 0.95, .devanagari, true),
    ]
    for (name, commonText, commonConfidence, specialistText, specialistConfidence, script, preferCommon) in cases {
      let common = currencyCandidate("common", .common, commonText, commonConfidence)
      let specialist = currencyCandidate("specialist", script, specialistText, specialistConfidence)
      let expected = preferCommon ? common : specialist
      for ordered in [[common, specialist], [specialist, common]] {
        let selected = ScriptRouteSelector.select(ordered)
        XCTAssertEqual(selected?.text, expected.text, name)
        XCTAssertEqual(selected?.pack.modelPackID, expected.pack.modelPackID, name)
        XCTAssertEqual(selected?.confidence, expected.confidence, name)
      }
    }
  }

  func testConflictingCurrencyCandidatesRetainCalibratedWinner() {
    let common = currencyCandidate("common", .common, "₹8.50", 0.95)
    let specialist = currencyCandidate("specialist", .devanagari, "र8.50", 0.95)
    for conflict in [
      currencyCandidate("common2", .common, "€8.50", 0.94),
      currencyCandidate("common2", .common, "₹8.60", 0.94),
      currencyCandidate("arabic", .arabic, "د8.60", 0.94),
      currencyCandidate("korean", .korean, "차 8.60", 0.94),
      currencyCandidate("arabic", .arabic, "مبلغ 8.50", 0.94),
    ] {
      XCTAssertEqual(ScriptRouteSelector.select([common, specialist, conflict])?.text, specialist.text)
    }
    XCTAssertEqual(ScriptRouteSelector.select([common])?.text, common.text)
    XCTAssertEqual(ScriptRouteSelector.select([specialist])?.text, specialist.text)
    XCTAssertNil(ScriptRouteSelector.select([]))
  }

  private func currencyCandidate(
    _ id: String, _ script: ScriptEvidence, _ text: String, _ confidence: Float
  ) -> ScriptCandidate {
    ScriptCandidate(text: text, confidence: confidence, pack: RecognizerSpec(
      modelPackID: id, modelVersion: "test", modelPath: "/test.onnx",
      configPath: "/test.yml", acceptedScripts: [script]
    ))
  }

}
