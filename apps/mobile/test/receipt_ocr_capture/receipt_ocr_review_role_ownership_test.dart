import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

void main() {
  ReceiptOcrPreview parse(String text) =>
      const ReceiptOcrParser().parse(text, fallbackCurrency: 'USD');

  String parking({
    String entry = 'Entry: 2026-10-01 09:15',
    String exit = 'Exit: 2026-10-01 11:45',
    String fee = 'Parking Fee USD 7.25',
    String total = 'Total USD 7.25',
    String extra = '',
  }) =>
      'Cedar Garage\n$entry\n$exit\nDuration 2h 30m\n$fee\n'
      '$extra\n$total\nThank you';

  String refund({
    String item = 'Returned Scarf USD -18.00',
    String fee = 'Restocking Fee USD 2.00',
    String total = 'Refund Total USD -16.00',
    String extra = '',
  }) =>
      'Cedar Returns\nDate: 2026-10-01\n$item\n$fee\n$extra\n'
      '$total\nRefund to VISA ****4321\nThank you';

  String promotion({
    String detail = 'Promotion USD -3.00',
    String subtotal = 'Subtotal USD 8.00',
    String summary = 'Discount USD -3.00',
    String total = 'Total USD 5.00',
    String extra = '',
  }) =>
      'Cedar Market\nTea USD 8.00\n$detail\n$subtotal\n'
      '$summary\n$extra\n$total\nThank you';

  test('closed parking session owns its priced service fee', () {
    final p = parse(parking());
    expect(p.items.map((i) => [i.description, i.lineTotal]), [
      ['Parking Fee', '7.25'],
    ]);
    expect(p.total, '7.25');
    expect(p.service, isNull);
    expect(p.adjustmentsComplete, isTrue);
    expect(p.reviewHints, isEmpty);
    expect(p.warnings, isEmpty);
  });

  test('signed return owns a separately printed restocking item', () {
    final p = parse(refund());
    expect(p.items.map((i) => [i.description, i.lineTotal]), [
      ['Returned Scarf', '-18.00'],
      ['Restocking Fee', '2.00'],
    ]);
    expect(p.total, '-16.00');
    expect(p.service, isNull);
    expect(p.adjustmentsComplete, isTrue);
    expect(p.reviewHints, isEmpty);
  });

  test('fixed-width parking timestamp may touch its clock', () {
    final p = parse(parking(exit: 'Exit: 2026-10-0111:45'));
    expect(p.total, '7.25');
    expect(p.items.single.lineTotal, '7.25');
    expect(p.reviewHints, isEmpty);
  });

  test('return item names may contain multiple ordinary words', () {
    final p = parse(refund(item: 'Returned Wool Winter Scarf USD -18.00'));
    expect(p.items.first.description, 'Returned Wool Winter Scarf');
    expect(p.reviewHints, isEmpty);
  });

  for (final defect in <String, String>{
    'missing entry': parking(entry: ''),
    'missing exit': parking(exit: ''),
    'invalid date': parking(entry: 'Entry: 2026-02-30 09:15'),
    'invalid clock': parking(exit: 'Exit: 2026-10-01 24:45'),
    'extra timestamp amount': parking(exit: 'Exit: 2026-10-01 11:45 USD 1.00'),
    'later conflicting timestamp': parking(extra: 'Exit: 2026-10-01 12:45'),
    'reversed interval': parking(exit: 'Exit: 2026-10-01 08:45'),
    'duplicate entry': parking(
      entry: 'Entry: 2026-10-01 09:15\nEntry: 2026-10-01 09:16',
    ),
    'fee mismatch': parking(total: 'Total USD 8.25'),
    'foreign fee': parking(fee: 'Parking Fee EUR 7.25'),
    'unknown fee': parking(fee: 'Convenience Fee USD 7.25'),
    'compound fee': parking(fee: 'Parking Fee and Tax USD 7.25'),
    'competing amount': parking(fee: 'Parking Fee USD 7.25 USD 1.00'),
    'additional unknown charge': parking(
      extra: 'Convenience Fee USD 1.00',
      total: 'Total USD 8.25',
    ),
    'unpriced modifier': parking(extra: '+ Extra parking'),
    'positive return': refund(
      item: 'Scarf USD 18.00',
      total: 'Total USD 20.00',
    ),
    'missing returned amount': refund(item: 'Returned Scarf'),
    'refund mismatch': refund(total: 'Refund Total USD -15.00'),
    'foreign restocking': refund(fee: 'Restocking Fee EUR 2.00'),
    'unknown refund fee': refund(fee: 'Convenience Fee USD 2.00'),
    'compound restocking': refund(fee: 'Restocking Fee Tax USD 2.00'),
    'duplicate restocking': refund(
      extra: 'Restocking Fee USD 2.00',
      total: 'Refund Total USD -14.00',
    ),
  }.entries) {
    test('fee ownership retains ${defect.key}', () {
      expect(parse(defect.value).reviewHints, isNotEmpty);
    });
  }

  test(
    'one promotion detail and its subtotal discount summary are one role',
    () {
      final p = parse(promotion());
      expect(p.items.map((i) => [i.description, i.lineTotal]), [
        ['Tea', '8.00'],
      ]);
      expect([p.subtotal, p.discount, p.total], ['8.00', '-3.00', '5.00']);
      expect(p.discountBeforeSubtotal, isFalse);
      expect(p.adjustmentsComplete, isTrue);
      expect(p.reviewHints, isEmpty);
    },
  );

  test('full promotion preserves a valid zero total', () {
    final p = parse(
      promotion(
        detail: 'Promo USD -8.00',
        summary: 'Discount USD -8.00',
        total: 'Total USD 0.00',
      ),
    );
    expect([p.subtotal, p.discount, p.total], ['8.00', '-8.00', '0.00']);
    expect(p.reviewHints, isEmpty);
  });

  for (final defect in <String, String>{
    'different amounts': promotion(
      summary: 'Discount USD -2.00',
      total: 'Total USD 6.00',
    ),
    'two discounts instead of summary': promotion(detail: 'Discount USD -3.00'),
    'duplicate promotion details': promotion(
      detail: 'Promotion USD -3.00\nPromotion USD -3.00',
    ),
    'duplicate summary': promotion(extra: 'Discount USD -3.00'),
    'different currency': promotion(summary: 'Discount EUR -3.00'),
    'foreign subtotal': promotion(subtotal: 'Subtotal EUR 8.00'),
    'duplicate subtotal': promotion(
      detail: 'Subtotal USD 8.00\nPromotion USD -3.00',
    ),
    'unknown subtotal currency': promotion(subtotal: 'Subtotal XYZ 8.00'),
    'different total': promotion(total: 'Total USD 4.00'),
    'duplicate total': promotion(total: 'Total USD 5.00\nTotal USD 5.00'),
    'unknown adjustment': promotion(extra: 'Fee USD 1.00'),
    'missing subtotal': promotion(subtotal: ''),
    'unpriced item': promotion(extra: '+ Extra dessert'),
    'positive promotion': promotion(detail: 'Promotion USD 3.00'),
  }.entries) {
    test('promotion ownership retains ${defect.key}', () {
      expect(parse(defect.value).reviewHints, isNotEmpty);
    });
  }
}
