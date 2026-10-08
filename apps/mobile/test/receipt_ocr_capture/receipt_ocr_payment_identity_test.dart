import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrPreview parsePayment(String payment, {bool layout = false}) {
  final lines = ['Corner Market', 'Tea USD 7.00', 'Total USD 7.00', payment];
  final blocks = <ReceiptOcrBlockEvidence>[];
  if (layout) {
    for (var row = 0; row < lines.length; row++) {
      blocks.add(
        ReceiptOcrBlockEvidence(
          text: lines[row],
          row: row,
          order: row,
          confidence: 0.95,
          points: [
            ReceiptOcrPoint(x: 20, y: 20.0 + row * 40),
            ReceiptOcrPoint(x: 320, y: 20.0 + row * 40),
            ReceiptOcrPoint(x: 320, y: 40.0 + row * 40),
            ReceiptOcrPoint(x: 20, y: 40.0 + row * 40),
          ],
        ),
      );
    }
  }
  return const ReceiptOcrParser().parse(lines.join('\n'), blocks: blocks);
}

void main() {
  for (final layout in [false, true]) {
    for (final row in [
      'Debit · 6789 USD 7.00',
      'Debit ••••6789 7.00',
      'Credit ****6789 USD 7.00',
      'PAID WITH: Visa •●●.● 9191',
      'Paid with Mastercard **** 9191 USD 7.00',
      'Refund to VISA ****1234',
      'APPROVED AUTH # 293847',
      'Approved Authorization # A29384',
    ]) {
      test('payment identity is not a purchase: $row (layout $layout)', () {
        final p = parsePayment(row, layout: layout);
        expect(p.items.map((i) => [i.description, i.lineTotal]).toList(), [
          ['Tea', '7.00'],
        ]);
        expect(p.total, '7.00');
        expect(p.currency, 'USD');
        expect(p.incompleteAdjustmentReasons, isEmpty);
        expect(p.reviewHints, isEmpty);
        expect(p.blocks.length, layout ? 4 : 0);
        if (layout) expect(p.blocks.last.text, row);
      });
    }
    for (final row in [
      'Debit processing fee USD 4.00',
      'Credit manual USD 4.00',
      'Debit notes 6789 USD 4.00',
      'Paid with Visa guide USD 4.00',
      'Approved author collection USD 4.00',
      'Debit · 6789 extra USD 4.00',
      'Debit · 6789 USD 4.00 USD 5.00',
      'Debit · 67890 USD 4.00',
      'Debit 6789 USD 4.00',
      'Debit .6789 USD 4.00',
      'Debit · 6789X USD 4.00',
      'Debit · 67890',
      'Approved author label USD 4.00',
      'APPROVED AUTH # 293847 extra USD 4.00',
    ]) {
      test(
        'non-payment shape retains its priced row: $row (layout $layout)',
        () {
          final p = parsePayment(row, layout: layout);
          expect(p.items.length, 2);
          expect(
            p.items.last.lineTotal,
            row == 'Debit · 67890'
                ? '67890'
                : row.contains('5.00')
                ? '5.00'
                : '4.00',
          );
          expect(p.total, '7.00');
          expect(p.reviewHints, isNotEmpty);
          if (layout) expect(p.blocks.last.text, row);
        },
      );
    }
  }
}
