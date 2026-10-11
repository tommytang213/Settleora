import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrBlockEvidence cell(
  String text,
  int row,
  double x,
  double y,
  double width,
  double height,
) => ReceiptOcrBlockEvidence(
  text: text,
  row: row,
  order: row * 10 + x.round(),
  points: [
    ReceiptOcrPoint(x: x, y: y),
    ReceiptOcrPoint(x: x + width, y: y),
    ReceiptOcrPoint(x: x + width, y: y + height),
    ReceiptOcrPoint(x: x, y: y + height),
  ],
);

ReceiptOcrPreview parseBlocks(List<ReceiptOcrBlockEvidence> blocks) {
  final rows = <int, List<String>>{};
  for (final block in blocks) {
    (rows[block.row] ??= []).add(block.text);
  }
  return const ReceiptOcrParser().parse(
    rows.values.map((row) => row.join(' ')).join('\n'),
    fallbackCurrency: 'USD',
    blocks: blocks,
  );
}

List<ReceiptOcrBlockEvidence> panel({
  String heading = 'Need Help?',
  String phone = 'Call us at 1-800-555-0100',
  String hours = 'Monday - Friday, 7 AM - 7 PM',
  double scale = 1,
  double hoursX = 780,
  double hoursY = 256,
  bool sameRowMoney = false,
  bool overlap = false,
  bool gapText = false,
  bool missingGeometry = false,
  bool crossedGeometry = false,
  bool nonfiniteGeometry = false,
  bool supportedTax = false,
}) {
  final blocks = [
    cell('Example Utility', 0, 20, 10, 300, 20),
    cell('Current Charges Detail', 1, 20, 60, 300, 20),
    cell('Description', 2, 20, 100, 180, 20),
    cell('Amount', 2, 650, 100, 100, 20),
    cell('Internet Plan', 3, 20, 140, 250, 20),
    cell('USD 10.00', 3, 650, 140, 100, 20),
    cell(
      supportedTax ? 'Sales Tax' : 'Regional Surcharge',
      4,
      20,
      180,
      300,
      20,
    ),
    cell('USD 2.00', 4, 650, 180, 100, 20),
    cell(heading, 5, 780, 200, 200, 20),
    cell(phone, 6, 780, 228, 280, 20),
    if (sameRowMoney) cell('USD 3.00', 6, 1090, 228, 100, 20),
    cell(hours, 7, hoursX, hoursY, 340, 20),
    cell('Total Current Charges USD 12.00', 8, 20, 300, 700, 20),
    if (overlap) cell('USD -3.00', 8, 900, 265, 100, 20),
    if (gapText) cell('Service USD 4.00', 8, 800, 221, 160, 5),
  ];
  return blocks.map((b) {
    final points = b.points
        .map((p) => ReceiptOcrPoint(x: p.x * scale, y: p.y * scale))
        .toList();
    if (b.row == 6) {
      if (missingGeometry) points.clear();
      if (crossedGeometry) {
        final first = points[1];
        points[1] = points[2];
        points[2] = first;
      }
      if (nonfiniteGeometry) {
        points[0] = const ReceiptOcrPoint(x: double.nan, y: 228);
      }
    }
    return ReceiptOcrBlockEvidence(
      text: b.text,
      row: b.row,
      order: b.order,
      points: points,
    );
  }).toList();
}

void main() {
  for (final scale in [0.5, 1.0, 2.0]) {
    test('complete ordinary receipt stays confident at scale $scale', () {
      final blocks = panel(supportedTax: true, scale: scale);
      final p = parseBlocks(blocks);
      expect(p.items.single.lineTotal, '10.00');
      expect(p.tax, '2.00');
      expect(p.total, '12.00');
      expect(p.adjustmentsComplete, isTrue);
      expect(p.warnings, isEmpty);
      expect(p.reviewHints, isEmpty);
      expect(p.blocks, orderedEquals(blocks));
    });
  }
  for (final scale in [0.5, 1.0, 2.0]) {
    for (final phone in [
      'Call us at 1-800-555-0100',
      'Tel: +44 1234 567890',
      '1-800-555-0100',
    ]) {
      test('independent complete contact panel $phone scale $scale', () {
        final blocks = panel(phone: phone, scale: scale);
        final p = parseBlocks(blocks);
        expect(
          p.itemLineDecisions[7],
          ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
        );
        expect(
          p.incompleteAdjustmentReasons,
          isNot(
            contains(ReceiptOcrIncompleteAdjustmentReason.detachedAmountSign),
          ),
        );
        expect(p.items.single.lineTotal, '10.00');
        expect(p.total, '12.00');
        expect(p.adjustmentsComplete, isFalse);
        expect(p.reviewHints, isNotEmpty);
        expect(p.blocks, orderedEquals(blocks));
      });
    }
  }
  final exclusions = <String, List<ReceiptOcrBlockEvidence>>{
    'missing help role': panel(heading: 'Special offers'),
    'missing phone role': panel(phone: 'Plan for 1-800-555-0100'),
    'short phone': panel(phone: 'Call us at 1234'),
    'long phone': panel(phone: 'Call us at 1234567890123456'),
    'phone fee': panel(phone: 'Call us at 1-800-555-0100 USD 3.00'),
    'invalid end time': panel(hours: 'Monday - Friday, 7 AM - 19 PM'),
    'missing end time': panel(hours: 'Monday - Friday, 7 AM - ? PM'),
    'hours fee': panel(hours: 'Monday - Friday, 7 AM - 7 PM USD 3.00'),
    'hours credit': panel(hours: 'Monday - Friday, 7 AM - 7 PM (-)'),
    'unknown suffix': panel(hours: 'Monday - Friday, 7 AM - 7 PM XYZ'),
    'misaligned hours': panel(hoursX: 30),
    'distant hours': panel(hoursY: 450),
    'same row money': panel(sameRowMoney: true),
    'overlapping money': panel(overlap: true),
    'competing gap text': panel(gapText: true),
    'missing geometry': panel(missingGeometry: true),
    'crossed geometry': panel(crossedGeometry: true),
    'nonfinite geometry': panel(nonfiniteGeometry: true),
  };
  for (final entry in exclusions.entries) {
    test('${entry.key} keeps contact ownership unresolved', () {
      final p = parseBlocks(entry.value);
      expect(
        p.itemLineDecisions[7],
        isNot(ReceiptOcrItemLineDecision.metadataOrHeaderSkipped),
      );
      expect(p.adjustmentsComplete, isFalse);
      expect(p.blocks, orderedEquals(entry.value));
    });
  }
}
