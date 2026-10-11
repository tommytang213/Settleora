import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

List<ReceiptOcrBlockEvidence> receipt({
  String merchant = 'GARDEN FUEL STOP',
  String pump = '7',
  String volumeLabel = 'GALLONS',
  String rateLabel = 'PRICE/GAL',
  String heading = 'Payment Method',
  String card = 'Mastercard  1234',
  String approval = 'APPROVED',
  String authorization = 'AUTH # 543210',
  String closing = 'Drive safe.',
  bool omitRate = false,
  bool extraPurchase = false,
  bool extraFooterPrice = false,
  bool weakGeometry = false,
  double scale = 1,
  double dx = 0,
}) {
  final rows = <List<String>>[
    [merchant],
    ['10 Meadow Road'],
    ['Sample City, OR 97000'],
    ['(555) 010-2323'],
    ['DATE', '2026-02-11 12:30'],
    ['PUMP', pump],
    ['FUEL', 'Regular Unleaded'],
    [volumeLabel, '12.500'],
    if (!omitRate) [rateLabel, 'USD 3.200'],
    if (extraPurchase) ['Water Pump', 'USD 5.00'],
    ['TOTAL', 'USD 40.00'],
    [heading],
    [card],
    [approval, authorization],
    ['Thank you!'],
    [closing],
  ];
  final blocks = <ReceiptOcrBlockEvidence>[];
  for (var row = 0; row < rows.length; row++) {
    final parts = rows[row];
    final y = row * 32.0 + (row >= rows.length - 5 ? 12 : 0);
    for (var col = 0; col < parts.length; col++) {
      final footer = row >= rows.length - 2;
      final x = footer ? 100.0 : (col == 0 ? 10.0 : 180.0);
      final width = footer ? 150.0 : (parts.length == 1 ? 230.0 : 140.0);
      blocks.add(
        ReceiptOcrBlockEvidence(
          text: parts[col],
          row: row,
          order: blocks.length,
          confidence: weakGeometry && row == rows.length - 5 ? 0.4 : 0.99,
          points: [
            ReceiptOcrPoint(x: dx + x * scale, y: y * scale),
            ReceiptOcrPoint(x: dx + (x + width) * scale, y: y * scale),
            ReceiptOcrPoint(x: dx + (x + width) * scale, y: (y + 20) * scale),
            ReceiptOcrPoint(x: dx + x * scale, y: (y + 20) * scale),
          ],
        ),
      );
    }
  }
  if (extraFooterPrice) {
    final y = (rows.length - 2) * 32.0 + 12;
    blocks.add(
      ReceiptOcrBlockEvidence(
        text: 'USD 5.00',
        row: rows.length - 2,
        order: blocks.length,
        confidence: 0.99,
        points: [
          ReceiptOcrPoint(x: dx + 255 * scale, y: y * scale),
          ReceiptOcrPoint(x: dx + 320 * scale, y: y * scale),
          ReceiptOcrPoint(x: dx + 320 * scale, y: (y + 20) * scale),
          ReceiptOcrPoint(x: dx + 255 * scale, y: (y + 20) * scale),
        ],
      ),
    );
  }
  return blocks;
}

ReceiptOcrPreview parse(List<ReceiptOcrBlockEvidence> blocks) {
  final rows = <int, List<String>>{};
  for (final block in blocks) {
    (rows[block.row] ??= []).add(block.text);
  }
  return const ReceiptOcrParser().parse(
    rows.values.map((parts) => parts.join(' ')).join('\n'),
    blocks: blocks,
    fallbackCurrency: 'USD',
  );
}

List<ReceiptOcrBlockEvidence> transform(
  List<ReceiptOcrBlockEvidence> blocks,
  bool Function(ReceiptOcrBlockEvidence) select, {
  double? confidence,
  bool missingConfidence = false,
  List<ReceiptOcrPoint> Function(List<ReceiptOcrPoint>)? points,
}) => [
  for (final block in blocks)
    if (!select(block))
      block
    else
      ReceiptOcrBlockEvidence(
        text: block.text,
        row: block.row,
        order: block.order,
        confidence: missingConfidence ? null : (confidence ?? block.confidence),
        points: points?.call(block.points) ?? block.points,
      ),
];

void main() {
  for (final pump in ['1', '7', '24']) {
    for (final scale in [0.5, 1.0, 2.0]) {
      test('complete fuel/payment roles pump $pump scale $scale', () {
        final blocks = receipt(pump: pump, scale: scale, dx: 37);
        final preview = parse(blocks);
        expect(preview.currency, 'USD');
        expect(preview.total, '40.00');
        expect(preview.items, hasLength(1));
        expect(preview.items.single.description, 'Regular Unleaded');
        expect(preview.items.single.lineTotal, '40.00');
        expect(preview.blocks, blocks);
        expect(preview.adjustmentsComplete, isTrue);
        expect(preview.incompleteAdjustmentReasons, isEmpty);
        expect(preview.reviewHints, isEmpty);
        expect(preview.warnings, isEmpty);
      });
    }
  }
  for (final pump in ['007', '9999']) {
    test('bounded pump identifier $pump and liter labels', () {
      final blocks = receipt(
        pump: pump,
        volumeLabel: 'LITERS',
        rateLabel: 'PRICE/L',
      );
      final preview = parse(blocks);
      expect(preview.items.single.description, 'Regular Unleaded');
      expect(preview.adjustmentsComplete, isTrue);
      expect(preview.reviewHints, isEmpty);
      expect(preview.blocks, blocks);
    });
  }
  test('recognized tip evidence retains its value and reconciliation hint', () {
    final blocks = receipt(pump: '7 tip');
    final preview = parse(blocks);
    expect(preview.tip, '7');
    expect(preview.total, '40.00');
    expect(preview.reviewHints, isNotEmpty);
    expect(preview.blocks, blocks);
  });
  for (final scale in [0.5, 2.0]) {
    for (final row in [0, 2]) {
      for (final x in [45.0, 255.0]) {
        test('detached footer price row $row x $x scale $scale', () {
          final blocks = receipt(scale: scale);
          final y = 13 * 32.0 + 12;
          blocks.add(
            ReceiptOcrBlockEvidence(
              text: 'USD 5.00',
              row: row,
              order: blocks.length,
              confidence: 0.99,
              points: [
                ReceiptOcrPoint(x: x * scale, y: y * scale),
                ReceiptOcrPoint(x: (x + 50) * scale, y: y * scale),
                ReceiptOcrPoint(x: (x + 50) * scale, y: (y + 20) * scale),
                ReceiptOcrPoint(x: x * scale, y: (y + 20) * scale),
              ],
            ),
          );
          final preview = parse(blocks);
          expect(preview.blocks, blocks);
          expect(preview.adjustmentsComplete, isFalse);
          expect(preview.reviewHints, isNotEmpty);
        });
      }
    }
  }
  final negatives = <String, List<ReceiptOcrBlockEvidence>>{
    'independently ambiguous service label': receipt(
      merchant: 'GARDEN SERVICE STATION',
    ),
    'priced pump evidence': receipt(pump: 'USD 7.00'),
    'partial fuel measurement': receipt(omitRate: true),
    'additional pump purchase': receipt(extraPurchase: true),
    'partial payment heading': receipt(heading: 'Payment'),
    'unrecognized tender': receipt(card: 'Card information unavailable'),
    'missing approval': receipt(approval: 'Status unknown'),
    'missing authorization': receipt(authorization: 'Reference unavailable'),
    'price beside courtesy': receipt(extraFooterPrice: true),
    'unpriced product instead of closing': receipt(closing: 'Travel mug'),
    'weak payment geometry': receipt(weakGeometry: true),
    for (final pump in [
      '0',
      '0000',
      '-1',
      '7.00',
      '1,000',
      '12345',
      '7 USD',
      '1/2',
    ])
      'ambiguous pump value $pump': receipt(pump: pump),
    'overlapping pump columns': transform(
      receipt(),
      (b) => b.row == 5 && b.text == '7',
      points: (ps) => [
        for (final p in ps) ReceiptOcrPoint(x: p.x - 150, y: p.y),
      ],
    ),
    'vertically separated pump columns': transform(
      receipt(),
      (b) => b.row == 5 && b.text == '7',
      points: (ps) => [
        for (final p in ps) ReceiptOcrPoint(x: p.x, y: p.y - 25),
      ],
    ),
    'overlapping approval columns': transform(
      receipt(),
      (b) => b.text.startsWith('AUTH #'),
      points: (ps) => [
        for (final p in ps) ReceiptOcrPoint(x: p.x - 150, y: p.y),
      ],
    ),
    'vertically separated approval columns': transform(
      receipt(),
      (b) => b.text.startsWith('AUTH #'),
      points: (ps) => [
        for (final p in ps) ReceiptOcrPoint(x: p.x, y: p.y - 25),
      ],
    ),
    'payment panel distant from total': transform(
      receipt(),
      (b) => b.row >= 10,
      points: (ps) => [
        for (final p in ps) ReceiptOcrPoint(x: p.x, y: p.y + 100),
      ],
    ),
    'courtesy aligned outside payment panel': transform(
      receipt(),
      (b) => b.row >= 13,
      points: (ps) => [
        for (final p in ps) ReceiptOcrPoint(x: p.x + 200, y: p.y),
      ],
    ),
    for (final row in [5, 10, 12, 13, 14])
      'missing confidence at row $row': transform(
        receipt(),
        (b) => b.row == row,
        missingConfidence: true,
      ),
    for (final confidence in [0.79, double.nan, double.infinity, 1.01])
      'invalid confidence $confidence': transform(
        receipt(),
        (b) => b.row == 12,
        confidence: confidence,
      ),
    'nonfinite payment coordinates': transform(
      receipt(),
      (b) => b.row == 10,
      points: (ps) => [
        ReceiptOcrPoint(x: double.nan, y: ps.first.y),
        ...ps.skip(1),
      ],
    ),
    'degenerate pump rectangle': transform(
      receipt(),
      (b) => b.row == 5,
      points: (ps) => [for (final p in ps) ReceiptOcrPoint(x: p.x, y: 160)],
    ),
  };
  for (final entry in negatives.entries) {
    test('${entry.key} remains reviewable', () {
      final preview = parse(entry.value);
      expect(preview.blocks, entry.value);
      expect(preview.adjustmentsComplete, isFalse);
      expect(preview.incompleteAdjustmentReasons, isNotEmpty);
      expect(preview.reviewHints, isNotEmpty);
    });
  }
}
