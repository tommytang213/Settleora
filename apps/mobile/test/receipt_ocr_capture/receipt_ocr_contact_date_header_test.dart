import 'package:flutter_test/flutter_test.dart';
import '../support/contact_date_receipt.dart';

void main() {
  for (final address in [
    '九龍灣觀塘道中27號',
    '台北市大安區和平路18號',
    '廣州市中山路9号',
    'Hauptstrasse 8, Berlin',
    'Avenida Central 21, Madrid',
  ]) {
    for (final label in ['Date', 'Fecha/Date', '日期 / Date']) {
      test('closed contact address with date aliases $address $label', () {
        final p = parseContactDateReceipt(
          contactDateReceiptRows(address: address, date: '$label: 2026-10-04'),
        );
        expect(p.merchant, 'Cedar Pier Kitchen');
        expect(p.receiptDate, '2026-10-04');
        expect(p.currency, 'HKD');
        expect(p.total, '22.00');
        expect(p.subtotal, '20.00');
        expect(p.service, '2.00');
        expect(p.items.map((i) => [i.description, i.lineTotal, i.currency]), [
          ['Soup', '8.00', 'HKD'],
          ['Rice', '12.00', 'HKD'],
        ]);
        expect(p.adjustmentsComplete, isTrue);
        expect(p.reviewHints, isEmpty);
        expect(p.warnings, isEmpty);
      });
    }
  }
  for (final phone in [
    'Phone: 2345 6789',
    'Telephone +44 1234 567890',
    '電話：2468 1357',
    'Tel 123-456-7890',
  ]) {
    test('bounded labeled telephone $phone', () {
      final p = parseContactDateReceipt(contactDateReceiptRows(phone: phone));
      expect(p.reviewHints, isEmpty);
      expect(p.items, hasLength(2));
    });
  }
  for (final date in [
    'Price/Date: 2026-10-04',
    'Fecha/Date2026-10-04',
    'Fecha/Date: 2026-99-04',
    'Fecha/Date: 2026/10-04',
    'Fecha/Date: 2026-10-04 HKD 2.00',
    'Date/2026-10-04',
    'Fecha/Date: 2026-10-04 2026-10-05',
    'Date: 2026-10',
  ]) {
    test('ambiguous contact date retains review $date', () {
      final p = parseContactDateReceipt(contactDateReceiptRows(date: date));
      expect(p.adjustmentsComplete, isFalse);
      expect(p.reviewHints, isNotEmpty);
    });
  }
  for (final phone in [
    'Tel HKD 2.00',
    'Tel +852 2468 1357 fee',
    'Tel 2468',
    'Tel 1234567890123456',
    'Tel EUR 2468 1357',
    'Tel +852 2468 1357 USD',
    'Order 2468 1357',
    '2468 1357',
  ]) {
    test('unowned intervening row retains address review $phone', () {
      final p = parseContactDateReceipt(contactDateReceiptRows(phone: phone));
      expect(p.adjustmentsComplete, isFalse);
      expect(p.reviewHints, isNotEmpty);
    });
  }
  for (final address in [
    '九龍灣觀塘道中27號 HKD 2.00',
    '九龍灣觀塘道中27號 + Rice',
    '九龍灣觀塘道中27號 EUR',
    'Soup HKD 4.00',
    '+ 九龍灣觀塘道中27號',
    '九龍灣觀塘道中27',
  ]) {
    test('financial or incomplete address remains reviewable $address', () {
      final p = parseContactDateReceipt(
        contactDateReceiptRows(address: address),
      );
      expect(p.reviewHints, isNotEmpty);
    });
  }
  for (final placement in [
    'after date',
    'after item',
    'two contacts',
    'unpriced gap',
  ]) {
    test('unclosed address band remains reviewable $placement', () {
      final rows = contactDateReceiptRows();
      switch (placement) {
        case 'after date':
          final address = rows.removeAt(1);
          rows.insert(3, address);
        case 'after item':
          final address = rows.removeAt(1);
          rows.insert(4, address);
        case 'two contacts':
          rows.insert(3, 'Phone 2468 1357');
        case 'unpriced gap':
          rows.insert(3, 'Side bowl');
      }
      final p = parseContactDateReceipt(rows);
      expect(p.reviewHints, isNotEmpty);
    });
  }
}
