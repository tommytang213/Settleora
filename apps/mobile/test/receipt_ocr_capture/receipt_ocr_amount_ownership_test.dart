import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrBlockEvidence cell(
  String text,
  int order,
  int row,
  double left,
  double right,
) => ReceiptOcrBlockEvidence(
  text: text,
  order: order,
  row: row,
  points: [
    ReceiptOcrPoint(x: left, y: row * 24),
    ReceiptOcrPoint(x: right, y: row * 24),
    ReceiptOcrPoint(x: right, y: row * 24 + 14),
    ReceiptOcrPoint(x: left, y: row * 24 + 14),
  ],
);

void main() {
  for (final currency in ['USD', 'EUR', 'JPY']) {
    for (final amount in ['2000', '12345']) {
      for (final afterAddress in [false, true]) {
        test('priced item $currency $amount afterAddress=$afterAddress', () {
          final p = const ReceiptOcrParser().parse(
            'General Store\n'
            '${afterAddress ? '123 Example Street\n' : ''}'
            'Widget $currency $amount\nTotal $currency $amount',
            fallbackCurrency: currency,
          );
          expect(p.items.single.description, 'Widget');
          expect(p.items.single.lineTotal, amount);
          expect(p.items.single.currency, currency);
        });
      }
    }
  }
  for (final postal in [
    'Seattle WA 98101',
    'Seattle, WA 98101',
    'Sydney NSW 2000',
    'Toronto ON M5V 2T6',
  ]) {
    test('unpriced postal header stays metadata: $postal', () {
      final p = const ReceiptOcrParser().parse(
        'General Store\n123 Example Street\n$postal\nWidget USD 2.00\nTotal USD 2.00',
        fallbackCurrency: 'USD',
      );
      expect(p.items.map((item) => item.description), ['Widget']);
      expect(p.items.single.lineTotal, '2.00');
    });
  }
  for (final mirrored in [false, true]) {
    for (final competing in [false, true]) {
      for (final reversed in [false, true]) {
        if (!competing && reversed) continue;
        test(
          'amount column mirrored=$mirrored competing=$competing reversed=$reversed',
          () {
            final blocks = <ReceiptOcrBlockEvidence>[];
            void add(String text, int row, double left, double right) {
              blocks.add(
                cell(
                  text,
                  blocks.length,
                  row,
                  mirrored ? 600 - right : left,
                  mirrored ? 600 - left : right,
                ),
              );
            }

            add('Utility', 0, 20, 150);
            add('Details of current charges', 1, 20, 280);
            add('Description', 2, 20, 160);
            add('Amount', 2, 300, 500);
            add('Widget', 3, 20, 160);
            if (competing)
              add(reversed ? 'USD 20.00' : 'USD 10.00', 3, 310, 380);
            add(competing && reversed ? 'USD 10.00' : 'USD 20.00', 3, 400, 470);
            add('Total', 4, 20, 160);
            add('USD 20.00', 4, 400, 470);
            final p = const ReceiptOcrParser().parse(
              'Utility\nDetails of current charges\nDescription Amount\n'
              'Widget ${competing ? (reversed ? 'USD 20.00 USD 10.00' : 'USD 10.00 USD 20.00') : 'USD 20.00'}\nTotal USD 20.00',
              fallbackCurrency: 'USD',
              blocks: blocks,
            );
            expect(p.blocks, blocks);
            if (competing) {
              expect(
                p.items.where(
                  (i) => i.description == 'Widget' && i.lineTotal != null,
                ),
                isEmpty,
              );
              expect([...p.warnings, ...p.reviewHints], isNotEmpty);
            } else {
              expect(p.items.single.description, 'Widget');
              expect(p.items.single.lineTotal, '20.00');
              expect([...p.warnings, ...p.reviewHints], isEmpty);
            }
          },
        );
      }
    }
  }
}
