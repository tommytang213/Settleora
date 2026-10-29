import 'package:flutter_test/flutter_test.dart';
import '../support/fuel_metadata_receipt.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

void main() {
  for (final scale in [0.5, 2.0]) {
    for (final gap in [0.0, 1.0, 5.0]) {
      test(
        'separate date immediately above fuel panel gap=$gap scale=$scale',
        () {
          final blocks = transform(
            receipt(scale: scale),
            (b) => b.row == 4,
            points: (ps) => [
              for (final point in ps)
                ReceiptOcrPoint(x: point.x, y: point.y + (12 - gap) * scale),
            ],
          );
          final preview = parse(blocks);
          expect(preview.blocks, blocks);
          expect(preview.adjustmentsComplete, isTrue);
          expect(preview.reviewHints, isEmpty);
        },
      );
    }
    for (final edge in [(5, -19.0), (14, 19.0)]) {
      for (final left in [false, true]) {
        test(
          'competing cell overlaps panel edge $edge left=$left scale=$scale',
          () {
            final blocks = withDetachedPanelCell(
              targetRow: edge.$1,
              dy: edge.$2,
              left: left,
              scale: scale,
            );
            final preview = parse(blocks);
            expect(preview.blocks, blocks);
            expect(preview.adjustmentsComplete, isFalse);
            expect(preview.reviewHints, isNotEmpty);
          },
        );
      }
    }
  }
  for (final values in [
    ('12.50', 'USD 3.20'),
    ('12,50', '3,20 USD'),
    ('0012.500', 'USD 3.200 USD'),
  ]) {
    test('complete measurement forms $values preserve confidence', () {
      final blocks = receipt(volume: values.$1, rate: values.$2);
      final preview = parse(blocks);
      expect(preview.blocks, blocks);
      expect(preview.total, '40.00');
      expect(preview.adjustmentsComplete, isTrue);
      expect(preview.reviewHints, isEmpty);
    });
  }
  for (final scale in [0.5, 1.0, 2.0]) {
    for (final row in [5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) {
      for (final left in [false, true]) {
        test(
          'competing cell across fuel/payment panel row $row left=$left scale=$scale',
          () {
            final blocks = withDetachedPanelCell(
              targetRow: row,
              left: left,
              scale: scale,
            );
            final preview = parse(blocks);
            expect(preview.blocks, blocks);
            expect(preview.adjustmentsComplete, isFalse);
            expect(preview.reviewHints, isNotEmpty);
            expect(preview.total, '40.00');
          },
        );
      }
    }
  }
  for (final volume in [
    '12,500',
    '12.500 or 12.600',
    '12.500 12.600',
    '12.500 litres extra',
    '12.500 mug',
    '-12.500',
    '0.000',
  ]) {
    test('incomplete measurement volume $volume remains reviewable', () {
      final blocks = receipt(volume: volume);
      final preview = parse(blocks);
      expect(preview.blocks, blocks);
      expect(preview.adjustmentsComplete, isFalse);
      expect(preview.reviewHints, isNotEmpty);
    });
  }
  for (final rate in [
    'USD 3,200',
    'USD 3.200 or USD 3.300',
    '3.200 3.300',
    'USD 3.200 mug',
    '-3.200',
    'USD 0.000',
    'USD 3.200 EUR',
  ]) {
    test('incomplete measurement rate $rate remains reviewable', () {
      final blocks = receipt(rate: rate);
      final preview = parse(blocks);
      expect(preview.blocks, blocks);
      expect(preview.adjustmentsComplete, isFalse);
      expect(preview.reviewHints, isNotEmpty);
    });
  }
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
    'missing authorization': receipt(referenceText: 'Reference unavailable'),
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
