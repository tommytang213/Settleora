import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';

void main() {
  test('a purchase after receipt date cannot replace the issuer', () {
    final preview = const ReceiptOcrParser().parse(
      'ALPHA\nReceipt Date: 2026-09-17\nCafe Latte\n'
      'Tea USD 5.00\nTotal USD 5.00',
    );
    expect(preview.merchant, 'ALPHA');
    expect(preview.adjustmentsComplete, isFalse);
  });

  test(
    'an issuer before a receipt date stays usable without an omitted item',
    () {
      final preview = const ReceiptOcrParser().parse(
        'ALPHA\nReceipt Date: 2026-09-17\n'
        'Tea USD 5.00\nTotal USD 5.00',
      );
      expect(preview.merchant, 'ALPHA');
      expect(preview.adjustmentsComplete, isTrue);
    },
  );

  test('an actual cafe issuer before the date stays usable', () {
    final preview = const ReceiptOcrParser().parse(
      'Example Cafe\nReceipt Date: 2026-09-17\n'
      'Tea USD 5.00\nTotal USD 5.00',
    );
    expect(preview.merchant, 'Example Cafe');
    expect(preview.adjustmentsComplete, isTrue);
  });

  for (final field in [
    'Receipt Date: 2026-09-17',
    'Invoice Date: 2026-09-17',
    'Bill Date: Sep 17, 2026',
    'Statement Date: 17 September 2026',
    'Transaction Date: 2026/09/17',
    'Purchase Date: 2026-09-17',
    'Date: 2026-09-17',
    'Datum: 2026/09/17',
    'Receipt Date:\n2026-09-17',
    'Receipt Date: 2026-09-17 14:35',
    'Receipt Date: 2026-02-30',
  ]) {
    for (final item in ['Cafe Latte', 'CAFE LATTE', 'Market Blend']) {
      test(
        'document date bounds unpriced merchant-like purchase: $field/$item',
        () {
          final preview = const ReceiptOcrParser().parse(
            'ALPHA\n$field\n$item\nTea USD 5.00\nTotal USD 5.00',
          );
          expect(preview.merchant, 'ALPHA');
          expect(preview.adjustmentsComplete, isFalse);
        },
      );
    }
  }

  test('a date word in an actual issuer is not a date-field boundary', () {
    final preview = const ReceiptOcrParser().parse(
      'Date House Cafe\nReceipt Date: 2026-09-17\n'
      'Tea USD 5.00\nTotal USD 5.00',
    );
    expect(preview.merchant, 'Date House Cafe');
    expect(preview.adjustmentsComplete, isTrue);
  });
}
