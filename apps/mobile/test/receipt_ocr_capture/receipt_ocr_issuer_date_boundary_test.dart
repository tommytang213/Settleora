import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';

void main() {
  test('a purchase after receipt date cannot replace the issuer', () {
    final preview = const ReceiptOcrParser().parse(
      'ALPHA\nReceipt Date: 2026-09-17\nCafe Latte\n'
      'Tea USD 5.00\nTotal USD 5.00',
    );
    expect(preview.merchant, 'ALPHA');
    expect(preview.items.single.description, 'Tea');
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.reviewHints, isNotEmpty);
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

  for (final header in [
    'Harborline\nWater Services',
    'HARBORLINE\nWATER SERVICES',
    'ACME\nPROVISIONS',
  ]) {
    final identity = header.replaceAll('\n', ' ');
    test('later repetition corroborates pre-date issuer segments: $header', () {
      final preview = const ReceiptOcrParser().parse(
        '$header\nBill Date: 2026-09-17\n'
        'Water Charge USD 25.00\nTotal USD 25.00\n$identity',
      );
      expect(preview.merchant, identity);
      expect(preview.items.map((item) => item.description), ['Water Charge']);
    });
  }

  test('a buyer repetition cannot corroborate uppercase header segments', () {
    final preview = const ReceiptOcrParser().parse(
      'ACME\nPROVISIONS\nReceipt Date: 2026-09-17\n'
      'Tea USD 5.00\nTotal USD 5.00\nBill To:\nACME PROVISIONS',
    );
    expect(preview.merchant, 'ACME');
    expect(preview.adjustmentsComplete, isFalse);
  });

  for (final laterIdentity in [
    'Harborline Loyalty Card',
    'Harborline Water Services Team',
    'Harborline Water Services USD 5.00',
    'Bill To:\nHarborline Water Services',
    'Ship To:\nHarborline Water Services',
    'Customer:\nHarborline Water Services',
  ]) {
    test('unowned later text cannot extend issuer: $laterIdentity', () {
      final preview = const ReceiptOcrParser().parse(
        'Harborline\nWater Services\nBill Date: 2026-09-17\n'
        'Water Charge USD 25.00\nTotal USD 25.00\n$laterIdentity',
      );
      expect(preview.merchant, 'Harborline');
    });
  }

  for (final item in ['Cafe Latte', 'CAFE LATTE', 'Market Blend']) {
    test('later repetition cannot own a post-date purchase: $item', () {
      final preview = const ReceiptOcrParser().parse(
        'ALPHA\nReceipt Date: 2026-09-17\n$item\n'
        'Tea USD 5.00\nTotal USD 5.00\nALPHA $item',
      );
      expect(preview.merchant, 'ALPHA');
      expect(preview.adjustmentsComplete, isFalse);
    });
  }
}
