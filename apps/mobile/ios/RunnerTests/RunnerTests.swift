import Flutter
import UIKit
import XCTest
@testable import Runner

class RunnerTests: XCTestCase {

  func testRupeeRecoveryRequiresOriginalCurrencyColumnAndExactMoney() {
    let commonPack = RecognizerSpec(modelPackID: "common", modelVersion: "v1", modelPath: "common", configPath: "common.yml", acceptedScripts: [.common])
    let devaPack = RecognizerSpec(modelPackID: "deva", modelVersion: "v1", modelPath: "deva", configPath: "deva.yml", acceptedScripts: [.devanagari])
    let recoveryPack = RecognizerSpec(modelPackID: "recovery", modelVersion: "v1", modelPath: "recovery", configPath: "recovery.yml", acceptedScripts: [.common])
    func candidate(_ text: String, _ confidence: Float = 0.95, _ pack: RecognizerSpec? = nil) -> ScriptCandidate {
      ScriptCandidate(text: text, confidence: confidence, pack: pack ?? commonPack)
    }
    func box(_ x: Double, _ y: Double) -> [CalendarDateRecovery.Point] {
      [.init(x: x, y: y), .init(x: x + 80, y: y), .init(x: x + 80, y: y + 20), .init(x: x, y: y + 20)]
    }
    let original: [ScriptCandidate?] = [candidate("Widget"), candidate("ऱ 12,34,567.89", 0.95, devaPack), candidate("Other"), candidate("₹45.00"), candidate("Total"), candidate("₹8,765.43")]
    var common = original
    common[1] = candidate("12,34,567.89")
    let points = [box(20, 10), box(200, 10), box(20, 60), box(200, 60), box(20, 110), box(200, 110)]
    let recovery = candidate("₹12,34,567.89", 0.95, recoveryPack)
    func accepts(_ originals: [ScriptCandidate?], _ commons: [ScriptCandidate?], _ geometry: [[CalendarDateRecovery.Point]], _ recovered: ScriptCandidate) -> Bool {
      RupeeCurrencyRecovery.accepts(1, original: originals, common: commons, points: geometry, recovery: recovered, recoveryPack: recoveryPack)
    }
    XCTAssertTrue(accepts(original, common, points, recovery))
    XCTAssertTrue(accepts(original, common, points.map { Array($0.reversed()) }, recovery))
    for value in ["0.00", "27.16", "2,345.67", "12,34,567.89", "-34.56", "+7.89", "−7.89"] {
      for marker in ["र", "ऱ"] {
        var originals = original, commons = common
        originals[1] = candidate("\t\(marker) \(value) ", 0.95, devaPack)
        commons[1] = candidate(" \(value)\t")
        XCTAssertTrue(accepts(originals, commons, points, candidate(" ₹\t\(value) ", 0.95, recoveryPack)))
      }
    }
    for value in ["₹12,34,567.88", "₹1,234,567.89", "₹-12,34,567.89", "₹12,34,567.890", "₹12,34,567", "₹१२,३४,५६७.८९", "₹12,34,567.89\n", "$12,34,567.89", "Rs12,34,567.89", "₹12,34,567.89 extra"] {
      XCTAssertFalse(accepts(original, common, points, candidate(value, 0.95, recoveryPack)), value)
    }
    for text in ["रोटी 12,34,567.89", "A 12,34,567.89", "ر 12,34,567.89", "₹12,34,567.89", "ऱ 12,34,567.8", "ऱ 12,34,567.89\n", "ऱ -+12,34,567.89"] {
      var changed = original; changed[1] = candidate(text, 0.95, devaPack)
      XCTAssertFalse(accepts(changed, common, points, recovery), text)
    }
    for index in [3, 5] {
      for text in ["45.00", "₹45.00 details", "₹4.5", ""] {
        var changed = original; changed[index] = candidate(text)
        XCTAssertFalse(accepts(changed, common, points, recovery))
      }
      var geometry = points; geometry[index] = box(400, index == 3 ? 60 : 110)
      XCTAssertFalse(accepts(original, common, geometry, recovery))
    }
    var repeatedRow = points; repeatedRow[5] = points[3]
    XCTAssertFalse(accepts(original, common, repeatedRow, recovery))
    XCTAssertFalse(accepts(original + [candidate("€6.00")], common + [candidate("€6.00")], points + [box(20, 160)], recovery))
    for index in original.indices {
      var missing = original; missing[index] = nil
      XCTAssertFalse(accepts(missing, common, points, recovery))
    }
    for text in ["12345", "Widget 5", "₹Widget", ""] {
      var changed = original; changed[0] = candidate(text)
      XCTAssertFalse(accepts(changed, common, points, recovery))
    }
    for labelBox in [box(300, 10), box(200, 10), box(20, 200), box(20, 29)] {
      var geometry = points; geometry[0] = labelBox
      XCTAssertFalse(accepts(original, common, geometry, recovery))
    }
    XCTAssertFalse(accepts(original + [candidate("extra")], common + [candidate("extra")], points + [box(350, 10)], recovery))
    let invalid: [[CalendarDateRecovery.Point]] = [[], Array(points[1].prefix(3)), Array(repeating: points[1][0], count: 4), [points[1][0], points[1][2], points[1][1], points[1][3]], box(-1, 10), box(.nan, 10), box(.infinity, 10)]
    for polygon in invalid {
      for index in points.indices {
        var geometry = points; geometry[index] = polygon
        XCTAssertFalse(accepts(original, common, geometry, recovery))
      }
    }
    XCTAssertFalse(accepts(original, common, Array(points.dropLast()), recovery))
    XCTAssertFalse(accepts(original, Array(common.dropLast()), points, recovery))
    XCTAssertFalse(RupeeCurrencyRecovery.shouldProbe(-1, original: original, common: common, points: points))
    XCTAssertFalse(RupeeCurrencyRecovery.shouldProbe(original.count, original: original, common: common, points: points))
    XCTAssertFalse(accepts(original, common, points, candidate(recovery.text)))
    for value in [Float(-1), 0, 0.8999, 1.0001, .nan, .infinity, -.infinity] {
      for index in [0, 1, 3, 5] {
        var changed = original; changed[index] = candidate(original[index]!.text, value, original[index]!.pack)
        XCTAssertFalse(accepts(changed, common, points, recovery))
      }
      var changed = common; changed[1] = candidate(common[1]!.text, value)
      XCTAssertFalse(accepts(original, changed, points, recovery))
      XCTAssertFalse(accepts(original, common, points, candidate(recovery.text, value, recoveryPack)))
    }
    for value in [Float(0.90), 1] {
      XCTAssertTrue(accepts(original.map { candidate($0!.text, value, $0!.pack) }, common.map { candidate($0!.text, value, $0!.pack) }, points, candidate(recovery.text, value, recoveryPack)))
    }
  }

  func testCalendarDateRecoveryPreservesDigitsAndRequiresOriginalGeometry() {
    let pack = RecognizerSpec(modelPackID: "common", modelVersion: "test", modelPath: "/test", configPath: "/test", acceptedScripts: [.common])
    func candidate(_ text: String, _ confidence: Float = 0.95, _ spec: RecognizerSpec? = nil) -> ScriptCandidate {
      ScriptCandidate(text: text, confidence: confidence, pack: spec ?? pack)
    }
    func box(_ x: Double, _ y: Double, _ width: Double = 80, _ height: Double = 20) -> [CalendarDateRecovery.Point] {
      [.init(x: x, y: y), .init(x: x + width, y: y), .init(x: x + width, y: y + height), .init(x: x, y: y + height)]
    }
    let points = [box(20, 10), box(130, 10, 160)]
    let original: [ScriptCandidate?] = [candidate("Date:"), candidate("2031·0419")]
    let recovery = candidate("2031·04·19·", 0.81)
    for label in ["Date", "DATE:", "datum", "Fecha:", "Data", "日期：", "日付", "날짜", "Дата:", "วันที่", "तारीख", "दिनांक"] {
      for date in ["2031·0419", "2000·0229", "2024·0229", "1900·0228", "1999·1231", "2099·0101"] {
        let original: [ScriptCandidate?] = [candidate(label), candidate(date)]
        let complete = String(date.prefix(7)) + "·" + String(date.suffix(2))
        for suffix in ["", "·"] {
          let recovered = candidate(complete + suffix, 0.81)
          XCTAssertTrue(CalendarDateRecovery.shouldProbe(1, original: original, points: points))
          XCTAssertTrue(CalendarDateRecovery.accepts(1, original: original, points: points, recovery: recovered))
          XCTAssertEqual(recovered.confidence, Float(0.81)); XCTAssertEqual(recovered.pack, pack)
          XCTAssertEqual(original[1]?.text, date)
        }
        XCTAssertFalse(CalendarDateRecovery.shouldProbe(0, original: original, points: points))
      }
    }
    XCTAssertTrue(CalendarDateRecovery.accepts(1, original: [candidate("\tDate: "), candidate(" 2031·0419\t")], points: points, recovery: candidate("\t2031·04·19· ")))
    for text in ["", "20310419", "2031·419", "2031·00419", "2031·04190", "2031·04·19", "2031·04·19·", "2031·0019", "2031·1319", "2031·0400", "2031·0431", "2031·0229", "1900·0229", "2100·0101", "1899·0101", "２０３１·０４１９", "٢٠٣١·٠٤١٩", "item 2031·0419", "2031·0419 USD", "2031·0419 7.00", "2031·0419\n", "-2031·0419"] {
      XCTAssertFalse(CalendarDateRecovery.shouldProbe(1, original: [original[0], candidate(text)], points: points), text)
      XCTAssertFalse(CalendarDateRecovery.accepts(1, original: [original[0], candidate(text)], points: points, recovery: recovery), text)
    }
    for text in ["Code", "Receipt date", "Due date", "Stay date", "Order date", "Date item", "Update", "Date 5.00", "日期 1", "日付\n"] { XCTAssertFalse(CalendarDateRecovery.shouldProbe(1, original: [candidate(text), original[1]], points: points), text) }
    for text in ["2031·04·18", "2031·01·49", "2031·04·190", "2031·4·19", "2031·04·9", "2031·0419", "2031/04/19", "2031·04/19", "2031·04·19..", "2031·04·19··", "2031·04·19 USD", "2031·04·19 5.00", "2031·04·19\n", "２０３１·０４·１９", "-2031·04·19"] { XCTAssertFalse(CalendarDateRecovery.accepts(1, original: original, points: points, recovery: candidate(text)), text) }
    XCTAssertFalse(CalendarDateRecovery.shouldProbe(-1, original: original, points: points))
    XCTAssertFalse(CalendarDateRecovery.shouldProbe(2, original: original, points: points))
    XCTAssertFalse(CalendarDateRecovery.shouldProbe(1, original: [nil, original[1]], points: points))
    XCTAssertFalse(CalendarDateRecovery.shouldProbe(1, original: [original[0], nil], points: points))
    XCTAssertFalse(CalendarDateRecovery.shouldProbe(0, original: [original[1]], points: [points[1]]))
    XCTAssertFalse(CalendarDateRecovery.shouldProbe(1, original: original, points: [points[0]]))
    XCTAssertTrue(CalendarDateRecovery.accepts(1, original: original, points: points.map { Array($0.reversed()) }, recovery: recovery))
    let invalidBoxes: [[CalendarDateRecovery.Point]] = [
      [], Array(points[0].prefix(3)), [points[0][0], points[0][2], points[0][1], points[0][3]],
      Array(repeating: points[0][0], count: 4), box(-1, 10), box(20, -1),
      box(.nan, 10), box(.infinity, 10), box(20, 10, .greatestFiniteMagnitude),
      box(20, 50), box(20, 25), box(400, 10), box(120, 10),
    ]
    for invalid in invalidBoxes { XCTAssertFalse(CalendarDateRecovery.shouldProbe(1, original: original, points: [invalid, points[1]])) }
    XCTAssertFalse(CalendarDateRecovery.shouldProbe(1, original: original, points: [points[0], box(1000, 10)]))
    let competitors: [ScriptCandidate?] = [candidate("other"), candidate("", 0), nil]
    for third in competitors { XCTAssertFalse(CalendarDateRecovery.shouldProbe(1, original: original + [third], points: points + [box(500, 10)])) }
    XCTAssertTrue(CalendarDateRecovery.accepts(1, original: original + [candidate("separate row")], points: points + [box(20, 60)], recovery: recovery))
    XCTAssertFalse(CalendarDateRecovery.shouldProbe(1, original: original + [candidate("other")], points: points + [[]]))
    let different = [
      RecognizerSpec(modelPackID: "other", modelVersion: "test", modelPath: "/test", configPath: "/test", acceptedScripts: [.common]),
      RecognizerSpec(modelPackID: "common", modelVersion: "next", modelPath: "/test", configPath: "/test", acceptedScripts: [.common]),
      RecognizerSpec(modelPackID: "common", modelVersion: "test", modelPath: "/other", configPath: "/test", acceptedScripts: [.common]),
      RecognizerSpec(modelPackID: "common", modelVersion: "test", modelPath: "/test", configPath: "/other", acceptedScripts: [.common]),
      RecognizerSpec(modelPackID: "common", modelVersion: "test", modelPath: "/test", configPath: "/test", acceptedScripts: [.korean]),
    ]
    for spec in different {
      XCTAssertFalse(CalendarDateRecovery.shouldProbe(1, original: [candidate("Date:", 0.95, spec), original[1]], points: points))
      XCTAssertFalse(CalendarDateRecovery.shouldProbe(1, original: [original[0], candidate("2031·0419", 0.95, spec)], points: points))
      XCTAssertFalse(CalendarDateRecovery.accepts(1, original: original, points: points, recovery: candidate("2031·04·19·", 0.95, spec)))
    }
    for confidence in [Float(-1), 0, 0.7999, 1.0001, .nan, .infinity, -.infinity] {
      XCTAssertFalse(CalendarDateRecovery.accepts(1, original: [candidate("Date:", confidence), original[1]], points: points, recovery: recovery))
      XCTAssertFalse(CalendarDateRecovery.accepts(1, original: [original[0], candidate("2031·0419", confidence)], points: points, recovery: recovery))
      XCTAssertFalse(CalendarDateRecovery.accepts(1, original: original, points: points, recovery: candidate("2031·04·19·", confidence)))
    }
    for confidence in [Float(0.8), 1] {
      XCTAssertTrue(CalendarDateRecovery.accepts(1, original: [candidate("Date:", confidence), candidate("2031·0419", confidence)], points: points, recovery: candidate("2031·04·19·", confidence)))
    }
  }

  func testPolishCurrencyRecoveryPreservesAmountsAndRejectsUnprovenChanges() {
    let pack = RecognizerSpec(modelPackID: "common", modelVersion: "test", modelPath: "/test", configPath: "/test", acceptedScripts: [.common])
    func candidate(_ text: String, _ confidence: Float = 0.95, _ spec: RecognizerSpec? = nil) -> ScriptCandidate {
      ScriptCandidate(text: text, confidence: confidence, pack: spec ?? pack)
    }
    for amount in ["0,00", "7.20", "83,41", "-6,73", "+91.08", "−6,73", "1,823.41", "1.823,41", "9,876,543.21", "9.876.543,21"] {
      for suffix in ["zl", "zì"] {
        let original: [ScriptCandidate?] = [candidate("\(amount) \(suffix)"), candidate("2,18 zł"), candidate("$5.67")]
        let recovery = candidate("\(amount) zł", 0.81)
        XCTAssertTrue(PolishCurrencyRecovery.shouldProbe(0, original: original))
        XCTAssertTrue(PolishCurrencyRecovery.accepts(0, original: original, recovery: recovery))
        XCTAssertFalse(PolishCurrencyRecovery.shouldProbe(1, original: original))
        XCTAssertFalse(PolishCurrencyRecovery.shouldProbe(2, original: original))
        XCTAssertEqual(original[0]?.text, "\(amount) \(suffix)")
        XCTAssertEqual(original[2]?.text, "$5.67")
        XCTAssertEqual(recovery.confidence, Float(0.81))
        XCTAssertEqual(recovery.pack, pack)
      }
    }
    XCTAssertTrue(PolishCurrencyRecovery.accepts(0, original: [candidate(" \t83,41 zl\t "), candidate("2,18 zł")], recovery: candidate("83,41\tzł")))
    for text in ["", "Word zl", "12 zl", "12,3 zl", "1,234 zl", "1,23,456.78 zl", "01,234.56 zl", "1.23,45 zl", "12.34zl", "12.34 zI", "12.34 zł", "12.34 PLN", "12.34 zł extra", "label 12.34 zl", "12.34 zl 56.78", "12.34 USD", "$12.34 zl", "12.34 €", "12/10/2026 zl", "١٢.٣٤ zl", "１２.３４ zl", "12.34\nzl", "12.34 zl", "--12.34 zl", "+-12.34 zl"] {
      let original: [ScriptCandidate?] = [candidate(text), candidate("2,18 zł")]
      XCTAssertFalse(PolishCurrencyRecovery.shouldProbe(0, original: original), text)
      XCTAssertFalse(PolishCurrencyRecovery.accepts(0, original: original, recovery: candidate("83,41 zł")), text)
    }
    let damaged = candidate("83,41 zl"), proof = candidate("2,18 zł"), recovery = candidate("83,41 zł")
    for text in ["83.41 zł", "83,42 zł", "8,341 zł", "-83,41 zł", "+83,41 zł", "083,41 zł", "83,410 zł", "83,41 zl", "83,41 zì", "83,41 PLN", "83,41 zł extra", "label 83,41 zł", "83,41 zł\nnoise", "83,41 $", ""] {
      XCTAssertFalse(PolishCurrencyRecovery.accepts(0, original: [damaged, proof], recovery: candidate(text)), text)
    }
    for text in ["1823.41 zł", "1.823,41 zł", "1,823.42 zł"] {
      XCTAssertFalse(PolishCurrencyRecovery.accepts(0, original: [candidate("1,823.41 zl"), proof], recovery: candidate(text)), text)
    }
    XCTAssertFalse(PolishCurrencyRecovery.shouldProbe(0, original: [damaged]))
    XCTAssertFalse(PolishCurrencyRecovery.shouldProbe(0, original: [damaged, candidate("2,18 zl")]))
    XCTAssertFalse(PolishCurrencyRecovery.shouldProbe(0, original: [damaged, candidate("VAT 2,18 zł")]))
    XCTAssertFalse(PolishCurrencyRecovery.shouldProbe(-1, original: [damaged, proof]))
    XCTAssertFalse(PolishCurrencyRecovery.shouldProbe(2, original: [damaged, proof]))
    XCTAssertFalse(PolishCurrencyRecovery.shouldProbe(0, original: [nil, proof]))
    let different = [
      RecognizerSpec(modelPackID: "other", modelVersion: "test", modelPath: "/test", configPath: "/test", acceptedScripts: [.common]),
      RecognizerSpec(modelPackID: "common", modelVersion: "next", modelPath: "/test", configPath: "/test", acceptedScripts: [.common]),
      RecognizerSpec(modelPackID: "common", modelVersion: "test", modelPath: "/other", configPath: "/test", acceptedScripts: [.common]),
      RecognizerSpec(modelPackID: "common", modelVersion: "test", modelPath: "/test", configPath: "/other", acceptedScripts: [.common]),
      RecognizerSpec(modelPackID: "common", modelVersion: "test", modelPath: "/test", configPath: "/test", acceptedScripts: [.cyrillic]),
    ]
    for spec in different {
      XCTAssertFalse(PolishCurrencyRecovery.shouldProbe(0, original: [damaged, candidate("2,18 zł", 0.95, spec)]))
      XCTAssertFalse(PolishCurrencyRecovery.accepts(0, original: [damaged, proof], recovery: candidate("83,41 zł", 0.95, spec)))
    }
    XCTAssertFalse(PolishCurrencyRecovery.shouldProbe(0, original: [candidate("83,41 zl", 0.95, different.last!), proof]))
    for confidence in [Float(-1), 0, 0.7999, 1.0001, .nan, .infinity, -.infinity] {
      XCTAssertFalse(PolishCurrencyRecovery.accepts(0, original: [candidate("83,41 zl", confidence), proof], recovery: recovery))
      XCTAssertFalse(PolishCurrencyRecovery.accepts(0, original: [damaged, candidate("2,18 zł", confidence)], recovery: recovery))
      XCTAssertFalse(PolishCurrencyRecovery.accepts(0, original: [damaged, proof], recovery: candidate("83,41 zł", confidence)))
    }
    for confidence in [Float(0.8), 1] {
      XCTAssertTrue(PolishCurrencyRecovery.accepts(0, original: [candidate("83,41 zl", confidence), candidate("2,18 zł", confidence)], recovery: candidate("83,41 zł", confidence)))
    }
  }

  func testCyrillicRecoveryPreservesWinnersAndNumericEvidence() {
    func candidate(_ id: String, _ script: ScriptEvidence, _ text: String, _ confidence: Float) -> ScriptCandidate {
      ScriptCandidate(text: text, confidence: confidence, pack: RecognizerSpec(
        modelPackID: id, modelVersion: "test", modelPath: "/test", configPath: "/test", acceptedScripts: [script]
      ))
    }
    let common = candidate("common", .common, "Cyr", 0.85)
    let original = candidate("cyrillic", .cyrillic, "Суr", 0.50)
    let recovery = candidate("cyrillic", .cyrillic, "Сыр", 0.68)
    let values = [common, original]
    XCTAssertEqual(ScriptRouteSelector.select(values)?.text, common.text)
    XCTAssertTrue(CyrillicRecovery.shouldProbe(values))
    XCTAssertTrue(CyrillicRecovery.accepts(values, recovery: recovery))
    XCTAssertEqual(ScriptRouteSelector.select(values + [recovery])?.text, recovery.text)
    XCTAssertEqual(values.count, 2)
    let empty = [candidate("common", .common, "", 0), candidate("cyrillic", .cyrillic, "HAC", 0.5)]
    XCTAssertNil(ScriptRouteSelector.select(empty))
    XCTAssertTrue(CyrillicRecovery.accepts(empty, recovery: recovery))
    for confidence in [Float(0.90), 0.99, 1] {
      let strong = [candidate("common", .common, "Example", confidence), candidate("cyrillic", .cyrillic, "HAC", 0.5)]
      XCTAssertFalse(CyrillicRecovery.shouldProbe(strong))
      XCTAssertFalse(CyrillicRecovery.accepts(strong, recovery: recovery))
    }
    XCTAssertFalse(CyrillicRecovery.accepts([common, candidate("cyrillic", .cyrillic, "Сыр", 0.8)], recovery: recovery))
    for literal in ["Sep 09, 2025", "1", "٢", "३", "๔", "５", "𝟞", "$", "€", "₽", "₫", "₹"] {
      XCTAssertFalse(CyrillicRecovery.shouldProbe([candidate("common", .common, literal, 0.8), original]), literal)
      XCTAssertFalse(CyrillicRecovery.accepts(values, recovery: candidate("cyrillic", .cyrillic, "НАС \(literal)", 0.8)), literal)
    }
    for confidence in [Float(-1), 0, 0.099, 1.001, .nan, .infinity] {
      XCTAssertFalse(CyrillicRecovery.accepts(values, recovery: candidate("cyrillic", .cyrillic, "НАС", confidence)))
    }
    for text in ["", "HAC", "ภาษาไทย", "كلمة", "AБCDE"] {
      XCTAssertFalse(CyrillicRecovery.accepts(values, recovery: candidate("cyrillic", .cyrillic, text, 0.8)))
    }
    XCTAssertFalse(CyrillicRecovery.accepts(values, recovery: candidate("other", .cyrillic, "НАС", 0.8)))
    XCTAssertFalse(CyrillicRecovery.accepts(values, recovery: candidate("common", .common, "Word", 0.8)))
    XCTAssertFalse(CyrillicRecovery.shouldProbe([original]))
    XCTAssertFalse(CyrillicRecovery.shouldProbe(values + [common]))
  }

  func testCyrillicWhiteMarginPreservesFullBatchTensor() {
    let source = (1...60).map { Float($0) / 100 }
    let input = RecBatchPreprocessResult(tensorData: source, tensorShape: [2, 3, 2, 5])
    XCTAssertEqual(input.withWhiteMargin(contentWidths: [2, 5], margin: 0).tensorData, source)
    let output = input.withWhiteMargin(contentWidths: [2, 5], margin: 12)
    XCTAssertEqual(output.tensorShape, [2, 3, 2, 29])
    for batch in 0..<2 {
      for channel in 0..<3 {
        for row in 0..<2 {
          let width = batch == 0 ? 2 : 5
          let from = ((batch * 3 + channel) * 2 + row) * 5
          let to = ((batch * 3 + channel) * 2 + row) * 29
          XCTAssertEqual(Array(output.tensorData[to..<(to + 12)]), [Float](repeating: 1, count: 12))
          XCTAssertEqual(Array(output.tensorData[(to + 12)..<(to + 12 + width)]), Array(source[from..<(from + width)]))
          XCTAssertEqual(Array(output.tensorData[(to + 12 + width)..<(to + 24 + width)]), [Float](repeating: 1, count: 12))
          XCTAssertEqual(Array(output.tensorData[(to + 24 + width)..<(to + 29)]), [Float](repeating: 0, count: 5 - width))
        }
      }
    }
    XCTAssertEqual(input.tensorData, source)
  }

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

  func testSpecialistRoutingPreservesNumeralOnlyEvidence() {
    let cases: [(ScriptEvidence, String)] = [
      (.arabic, "١٢٫٥٠"),
      (.arabic, "۱۲٫۵۰"),
      (.devanagari, "१२.५०"),
      (.thai, "๑๒.๕๐"),
    ]
    for (script, text) in cases {
      let specialist = currencyCandidate("specialist", script, text, 0.99)
      for commonText in ["12.50", ""] {
        let common = currencyCandidate("common", .common, commonText, 0.80)
        for candidates in [[common, specialist], [specialist, common]] {
          let selected = ScriptRouteSelector.select(candidates)
          XCTAssertEqual(selected?.text, text)
          XCTAssertEqual(selected?.pack.modelPackID, specialist.pack.modelPackID)
          XCTAssertEqual(selected?.confidence, specialist.confidence)
        }
      }
    }
  }

  func testSpecialistRoutingKeepsNeutralAndIncompatibleNumeralsIneligible() {
    let common = currencyCandidate("common", .common, "12.50", 0.80)
    for (script, text) in [
      (ScriptEvidence.arabic, "12.50"),
      (.devanagari, "١٢٫٥٠"),
      (.thai, "१२.५०"),
      (.arabic, "$.,"),
      (.devanagari, "TOTAL१"),
    ] {
      let specialist = currencyCandidate("specialist", script, text, 0.99)
      XCTAssertFalse(ScriptRouteSelector.score(specialist).isFinite, text)
      XCTAssertNil(ScriptRouteSelector.select([specialist]), text)
      XCTAssertEqual(ScriptRouteSelector.select([common, specialist])?.text, common.text, text)
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

  func testNumericObservationSeparatesEligibleDisagreementFromRejectedLongerAlternates() {
    let short = currencyCandidate("common", .common, "1", 0.95)
    let longer = currencyCandidate("common", .common, "12.50", 0.8)
    let rejected = currencyCandidate("common", .common, "12.50", .nan)
    let rows = [[short, longer], [short, rejected], [short, short]]
    let frozen = rows.map { ScriptRouteSelector.select($0) }
    let observation = NumericRoutingObserver.observe(rows, original: frozen)
    XCTAssertEqual(observation["status"] as? String, "observed")
    for (key, count) in ["numericCandidateCropCount": 3, "eligibleNumericCandidateCropCount": 3,
                         "competingEligibleNumericCandidateCropCount": 2,
                         "eligibleNumericLiteralDisagreementCropCount": 1,
                         "selectedShorterThanEligibleNumericAlternateCropCount": 1,
                         "selectedShorterThanAnyNumericAlternateCropCount": 2] {
      XCTAssertEqual(observation[key] as? Int, count, key)
    }
    XCTAssertEqual(frozen.map { $0?.text }, ["1", "1", "1"])
    XCTAssertEqual(rows.map { ScriptRouteSelector.select($0)?.text }, frozen.map { $0?.text })
    XCTAssertEqual(rows.map { $0.map(\.text) }, [["1", "12.50"], ["1", "12.50"], ["1", "1"]])
  }

  func testNumericObservationCountsUnicodeScalarsAndExactLiteralsWithoutMoneyInterpretation() {
    let selected = ScriptCandidate(text: " \t𝟙٢،३.４\t", confidence: 0.95, pack: RecognizerSpec(
      modelPackID: "common", modelVersion: "test", modelPath: "/test.onnx",
      configPath: "/test.yml", acceptedScripts: [.common, .arabic, .devanagari]
    ))
    let alternate = currencyCandidate("common", .common, "12,3.4", 0.8)
    let rows = [[selected, alternate]]
    let observation = NumericRoutingObserver.observe(rows, original: rows.map { ScriptRouteSelector.select($0) })
    XCTAssertEqual(observation["status"] as? String, "observed")
    XCTAssertEqual(observation["eligibleNumericLiteralDisagreementCropCount"] as? Int, 1)
    XCTAssertEqual(observation["selectedShorterThanAnyNumericAlternateCropCount"] as? Int, 0)
    XCTAssertEqual((observation["selectedDigitCountBins"] as? [String: Int])?["four"], 1)
    for text in ["TOTAL 12.50", "$12.50", "12/50", "12\n50", "½", "+ . ,"] {
      let candidate = currencyCandidate("common", .common, text, 0.95)
      let observed = NumericRoutingObserver.observe([[candidate]], original: [candidate])
      XCTAssertEqual(observed["numericCandidateCropCount"] as? Int, 0, text)
      XCTAssertEqual((observed["selectedDigitCountBins"] as? [String: Int])?["nonNumeric"], 1, text)
    }
    let date = currencyCandidate("common", .common, "2031-04-19", 0.95)
    XCTAssertEqual(NumericRoutingObserver.observe([[date]], original: [date])["numericCandidateCropCount"] as? Int, 1)
  }

  func testNumericObservationDistinguishesObservedZeroUnavailableAndInvalidWithoutPayload() {
    let zero = NumericRoutingObserver.observe([], original: [])
    XCTAssertEqual(zero["status"] as? String, "observed")
    XCTAssertEqual(zero["observedCropCount"] as? Int, 0)
    let unavailable = NumericRoutingObserver.unavailable()
    XCTAssertEqual(Set(unavailable.keys), ["schemaVersion", "stage", "status"])
    XCTAssertEqual(unavailable["status"] as? String, "unavailable")
    let value = currencyCandidate("common", .common, "private text", 0.95)
    let rejected = currencyCandidate("common", .common, "12.50", .nan)
    for invalid in [
      NumericRoutingObserver.observe([[value]], original: []),
      NumericRoutingObserver.observe(Array(repeating: [], count: 257), original: Array(repeating: nil, count: 257)),
      NumericRoutingObserver.observe([[]], original: [value]),
      NumericRoutingObserver.observe([[currencyCandidate("common", .common, "1", 0.95)]], original: [nil]),
      NumericRoutingObserver.observe([[rejected]], original: [rejected]),
    ] {
      XCTAssertEqual(Set(invalid.keys), ["schemaVersion", "stage", "status"])
      XCTAssertEqual(invalid["status"] as? String, "invalid")
    }
    let absent = NumericRoutingObserver.observe([[rejected]], original: [nil])
    XCTAssertEqual(absent["numericCandidateCropCount"] as? Int, 1)
    XCTAssertEqual(absent["eligibleNumericCandidateCropCount"] as? Int, 0)
    XCTAssertEqual((absent["selectedDigitCountBins"] as? [String: Int])?["noSelection"], 1)
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
