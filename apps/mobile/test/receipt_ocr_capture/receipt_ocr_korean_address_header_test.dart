import 'package:flutter_test/flutter_test.dart';
import '../support/contact_date_receipt.dart';

List<String> koreanHeaderRows({
  String address = '부산광역시 해운대구 바다로 42',
  String date = '날짜: 2026.10.04.',
  bool contact = false,
}) {
  final rows = contactDateReceiptRows(
    address: address,
    date: date,
    service: false,
  );
  if (!contact) rows.removeAt(2);
  return rows;
}

void main() {
  for (final address in [
    '부산광역시 해운대구 바다로 42',
    '대전광역시 서구 둔산대로 15-2',
    '경기도 수원시 영통구 중앙길 9',
    '강원특별자치도 원주시 새마을길 12',
  ]) {
    for (final contact in [false, true]) {
      for (final date in ['날짜: 2026.10.04.', 'Date: 2026-10-04']) {
        test('closed Korean road address $address $contact $date', () {
          final rows = koreanHeaderRows(
            address: address,
            contact: contact,
            date: date,
          );
          final p = parseContactDateReceipt(rows);
          expect(p.merchant, 'Cedar Pier Kitchen');
          expect(p.receiptDate, '2026-10-04');
          expect(p.items.map((i) => [i.description, i.lineTotal, i.currency]), [
            ['Soup', '8.00', 'HKD'],
            ['Rice', '12.00', 'HKD'],
          ]);
          expect(p.currency, 'HKD');
          expect(p.subtotal, '20.00');
          expect(p.total, '20.00');
          expect(p.adjustmentsComplete, isTrue);
          expect(p.reviewHints, isEmpty);
          expect(p.warnings, isEmpty);
          expect(p.rawTextLineCount, rows.length);
        });
      }
    }
  }
  for (final address in [
    '부산광역시 해운대구 바다로 KRW 42',
    '부산광역시 해운대구 바다로 BIF 42',
    '부산광역시 해운대구 바다로 HKD 42',
    '부산광역시 해운대구 바다로 42 USD',
    '부산광역시 해운대구 바다로 42 HKD 2.00',
    '부산광역시 해운대구 바다로 42.50',
    '부산광역시 해운대구 바다로 -42',
    '부산광역시 해운대구 바다로 42 50',
    '+ 부산광역시 해운대구 바다로 42',
    '부산광역시 해운대구 부가세로 42',
    '부산광역시 해운대구 바다로 42 할인',
    '부산광역시 해운대구 바다로 42 2x',
    '바다로 42',
    '부산광역시 바다로 42',
    '부산광역시 해운대구 Noodles 42',
    '부산광역시 해운대구 바다로 0',
  ]) {
    test(
      'Korean address money or incomplete structure stays visible $address',
      () {
        final rows = koreanHeaderRows(address: address);
        final p = parseContactDateReceipt(rows);
        expect(p.reviewHints, isNotEmpty);
        expect(p.rawTextLineCount, rows.length);
        expect(p.total, '20.00');
      },
    );
  }
  for (final date in [
    '날짜: 2026.99.04.',
    '날짜: 2026.10',
    '날짜: 2026/10-04',
    '날짜: 2026-10-04 HKD 3.00',
  ]) {
    test('unclosed Korean address date stays reviewable $date', () {
      final p = parseContactDateReceipt(koreanHeaderRows(date: date));
      expect(p.reviewHints, isNotEmpty);
      expect(p.items.any((i) => i.lineTotal == '42'), isTrue);
    });
  }
  for (final index in [2, 3, 5]) {
    test(
      'body-position Korean address remains a possible priced row $index',
      () {
        final rows = koreanHeaderRows();
        final address = rows.removeAt(1);
        rows.insert(index, address);
        final p = parseContactDateReceipt(rows);
        expect(p.items.any((i) => i.lineTotal == '42'), isTrue);
        expect(p.reviewHints, isNotEmpty);
      },
    );
  }
}
