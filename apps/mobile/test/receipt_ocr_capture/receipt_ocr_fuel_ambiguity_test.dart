import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrPreview _parse(List<String> measurements, String total) {
  final lines = [
    'Example Fuel',
    'Date 2026-10-15',
    'FUEL Regular Unleaded',
    ...measurements,
    'TOTAL USD $total',
  ];
  final blocks = [
    for (var i = 0; i < lines.length; i++)
      ReceiptOcrBlockEvidence(
        text: lines[i],
        row: i,
        order: i,
        confidence: .99,
        points: [
          ReceiptOcrPoint(x: 10, y: i * 30),
          ReceiptOcrPoint(x: 350, y: i * 30),
          ReceiptOcrPoint(x: 350, y: i * 30 + 18),
          ReceiptOcrPoint(x: 10, y: i * 30 + 18),
        ],
      ),
  ];
  final preview = const ReceiptOcrParser().parse(
    lines.join('\n'),
    blocks: blocks,
  );
  expect(preview.blocks, blocks, reason: 'Keep all printed source evidence.');
  expect(preview.total, total);
  expect(preview.items, hasLength(1));
  expect(preview.items.single.description, 'Regular Unleaded');
  expect(preview.items.single.lineTotal, total);
  return preview;
}

void main() {
  for (final reversed in [false, true]) {
    for (final fractional in [false, true]) {
      test('conflicting fuel rates retain review evidence '
          'reversed=$reversed fractional=$fractional', () {
        final rates = reversed ? ['4.00', '3.00'] : ['3.00', '4.00'];
        final quantity = fractional ? '2.5' : '5';
        final total = fractional ? '7.50' : '15.00';
        final p = _parse([
          'GALLONS $quantity',
          for (final rate in rates) 'PRICE/GAL USD $rate',
        ], total);
        expect(p.items.single.quantity, quantity);
        expect(p.items.single.unitPrice, rates.last);
        expect(p.adjustmentsComplete, isFalse);
        expect(p.reviewHints, isNotEmpty);
        expect(p.warnings.any((w) => w.toLowerCase().contains('fuel')), isTrue);
      });

      test('conflicting fuel volumes retain review evidence '
          'reversed=$reversed fractional=$fractional', () {
        final quantities = fractional ? ['2.5', '3.5'] : ['5', '6'];
        if (reversed) {
          final first = quantities.first;
          quantities[0] = quantities[1];
          quantities[1] = first;
        }
        final p = _parse([
          for (final quantity in quantities) 'GALLONS $quantity',
          'PRICE/GAL USD 3.00',
        ], fractional ? '7.50' : '15.00');
        expect(p.items.single.quantity, quantities.last);
        expect(p.items.single.unitPrice, '3.00');
        expect(p.adjustmentsComplete, isFalse);
        expect(p.reviewHints, isNotEmpty);
        expect(p.warnings.any((w) => w.toLowerCase().contains('fuel')), isTrue);
      });
    }
  }

  for (final measurements in [
    ['GALLONS 5', 'PRICE/GAL USD 3.00'],
    ['GALLONS 5', 'GALLONS 5.00', 'PRICE/GAL USD 3.00', 'PRICE/GAL USD 3.000'],
    ['GALLONS 5.000', 'GALLONS 5', 'PRICE/GAL USD 3.000', 'PRICE/GAL USD 3.00'],
  ]) {
    test('agreeing fuel measurements remain confident: $measurements', () {
      final p = _parse(measurements, '15.00');
      expect(p.adjustmentsComplete, isTrue);
      expect(p.reviewHints, isEmpty);
      expect(p.warnings, isEmpty);
    });
  }

  for (final malformed in ['GALLONS unreadable', 'PRICE/GAL unreadable']) {
    test(
      'an unreadable repeated fuel measurement remains reviewable: $malformed',
      () {
        final p = _parse([
          malformed,
          'GALLONS 5',
          'PRICE/GAL USD 3.00',
        ], '15.00');
        expect(p.adjustmentsComplete, isFalse);
        expect(p.reviewHints, isNotEmpty);
        expect(p.warnings.any((w) => w.toLowerCase().contains('fuel')), isTrue);
      },
    );
  }
}
