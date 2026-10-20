import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

typedef _Cell = (String, double, double);

ReceiptOcrPreview _parse(List<List<_Cell>> rows, {double scale = 1}) {
  final blocks = <ReceiptOcrBlockEvidence>[];
  for (var row = 0; row < rows.length; row++) {
    for (final cell in rows[row]) {
      blocks.add(
        ReceiptOcrBlockEvidence(
          text: cell.$1,
          row: row,
          order: blocks.length,
          confidence: .99,
          points: [
            ReceiptOcrPoint(x: cell.$2 * scale, y: row * 30 * scale),
            ReceiptOcrPoint(x: cell.$3 * scale, y: row * 30 * scale),
            ReceiptOcrPoint(x: cell.$3 * scale, y: (row * 30 + 15) * scale),
            ReceiptOcrPoint(x: cell.$2 * scale, y: (row * 30 + 15) * scale),
          ],
        ),
      );
    }
  }
  final result = const ReceiptOcrParser().parse(
    rows.map((r) => r.map((c) => c.$1).join(' ')).join('\n'),
    blocks: blocks,
  );
  expect(result.blocks, blocks, reason: 'Every source block is preserved.');
  return result;
}

ReceiptOcrPreview _issuer({
  String first = 'North',
  String second = 'Market',
  double scale = 1,
  String? neighbor,
  String total = '5.00',
}) => _parse([
  [(first, 20, 140), ('Receipt', 300, 650)],
  [(second, 20, 140)],
  [('Coffee USD 3.00', 300, 650)],
  [('Tea USD 2.00', 300, 650)],
  [('Total USD $total', 20, 650)],
  [('$first $second', 20, 220), if (neighbor != null) (neighbor, 300, 650)],
], scale: scale);

ReceiptOcrPreview _discounts({
  required bool utility,
  String first = 'Loyalty Discount',
  String second = 'Member Discount',
  String firstMoney = 'USD -2.00',
  String secondMoney = 'USD -3.00',
  String total = '5.00',
  String? outside,
}) {
  if (utility) {
    List<_Cell> line(String label, String money) => [
      (label, 50, 383),
      ('Feb 5 - Mar 4, 2025', 417, 567),
      (money, 652, 717),
      (outside ?? 'Live Chat', 828, 960),
    ];
    return _parse([
      [('Network Utility', 20, 350)],
      [('Subtotal USD 10.00', 20, 717)],
      [('Current Charges Detail', 20, 717)],
      [
        ('Description', 49, 140),
        ('Service Period', 417, 529),
        ('Amount', 652, 717),
        ('Support', 828, 960),
      ],
      line('Internet Plan', 'USD 10.00'),
      line(first, firstMoney),
      line(second, secondMoney),
      [('Total Current Charges USD $total', 20, 717)],
    ]);
  }
  return _parse([
    [('Example Market', 20, 650)],
    [('Description', 20, 300), ('Rate', 350, 450), ('Amount', 500, 650)],
    [('Coffee', 20, 300), ('USD 10.00', 500, 650)],
    [('Subtotal', 20, 300), ('USD 10.00', 500, 650)],
    [
      (first, 20, 300),
      (firstMoney, 500, 650),
      if (outside != null) (outside, 800, 960),
    ],
    [(second, 20, 300), (secondMoney, 500, 650)],
    [('Total USD $total', 20, 650)],
  ]);
}

void main() {
  for (final name in [
    ('North', 'Market'),
    ('River', 'Supplies'),
    ('Sunrise', 'Provisions'),
  ]) {
    for (final scale in [.5, 1.0, 2.0]) {
      test('standalone corroborating issuer footer $name at scale $scale', () {
        final p = _issuer(first: name.$1, second: name.$2, scale: scale);
        expect(p.merchant, '${name.$1} ${name.$2}');
        expect(p.items.map((i) => [i.description, i.lineTotal]), [
          ['Coffee', '3.00'],
          ['Tea', '2.00'],
        ]);
        expect(p.adjustmentsComplete, isTrue);
        expect(p.reviewHints, isEmpty);
      });
    }
  }
  test('corroborating footer beside phone metadata remains complete', () {
    expect(_issuer(neighbor: 'Phone 123-456-7890').adjustmentsComplete, isTrue);
  });
  // Positive printed money beside an unowned name remains a candidate.
  // Arithmetic agreement can corroborate it, but cannot delete its evidence.
  for (final name in [('North', 'Market'), ('NORTH', 'MARKET')]) {
    for (final scale in [.5, 1.0, 2.0]) {
      for (final money in ['USD 3.00', '3.00', 'EUR 3.00']) {
        for (final total in ['5.00', '8.00']) {
          test('priced footer candidate $name $scale $money total=$total', () {
            final p = _issuer(
              first: name.$1,
              second: name.$2,
              scale: scale,
              neighbor: money,
              total: total,
            );
            expect(p.merchant, '${name.$1} ${name.$2}');
            expect(p.total, total);
            expect(
              p.items.map((i) => [i.description, i.lineTotal, i.currency]),
              [
                ['Coffee', '3.00', 'USD'],
                ['Tea', '2.00', 'USD'],
                [
                  '${name.$1} ${name.$2}',
                  '3.00',
                  money.startsWith('EUR') ? 'EUR' : 'USD',
                ],
              ],
            );
            if (total == '5.00' || money.startsWith('EUR')) {
              expect(p.reviewHints, isNotEmpty);
            }
            expect(p.blocks.any((b) => b.text == money), isTrue);
          });
        }
      }
    }
  }
  for (final neighbor in ['BOTTLED WATER', 'Glass']) {
    test('corroborating footer cannot own independent $neighbor', () {
      final p = _issuer(neighbor: neighbor);
      expect(p.adjustmentsComplete, isFalse);
      expect(p.items.map((item) => item.description), ['Coffee', 'Tea']);
      expect(p.blocks.any((b) => b.text == neighbor), isTrue);
    });
  }

  for (final money in ['USD -3.00', '-3.00', 'EUR -3.00', 'USD −3.00']) {
    for (final scale in [.5, 1.0, 2.0]) {
      test('signed footer candidate remains reviewable $money $scale', () {
        final p = _issuer(neighbor: money, scale: scale);
        expect(p.reviewHints, isNotEmpty);
        expect(p.discount, isNull);
        expect(p.total, '5.00');
        expect(p.items.map((i) => [i.description, i.lineTotal, i.currency]), [
          ['Coffee', '3.00', 'USD'],
          ['Tea', '2.00', 'USD'],
          ['North Market', '-3.00', money.startsWith('EUR') ? 'EUR' : 'USD'],
        ]);
        expect(p.blocks.any((b) => b.text == money), isTrue);
      });
    }
  }

  for (final utility in [false, true]) {
    for (final labels in [
      ('Loyalty Discount', 'Member Discount'),
      ('Member Discount', 'Loyalty Discount'),
      ('Store Coupon', 'Seasonal Rebate'),
      ('Loyalty Discount (12 months)', 'Member Discount (6 months)'),
      ('Seasonal Rebate (12 months)', 'Welcome Rebate (6 months)'),
      ('Non Member Discount', 'Member Discount'),
      ('Non-Member Discount', 'Member Discount'),
      ('No Contract Discount', 'Loyalty Discount'),
      ('Exclusive Member Discount', 'Loyalty Discount'),
      ('All Inclusive Package Discount', 'Member Discount'),
    ]) {
      test('distinct discount identities $labels utility=$utility', () {
        final p = _discounts(
          utility: utility,
          first: labels.$1,
          second: labels.$2,
        );
        expect(p.items.single.lineTotal, '10.00');
        expect(p.discount, '-5.00');
        expect(p.adjustmentsComplete, isTrue);
        expect(p.reviewHints, isEmpty);
      });
    }
    for (final second in ['Loyalty Discount', 'LOYALTY DISCOUNT']) {
      test(
        'duplicate discount identity stays unresolved $second utility=$utility',
        () {
          final p = _discounts(utility: utility, second: second);
          expect(p.adjustmentsComplete, isFalse);
          expect(p.discount, isNot('-5.00'));
        },
      );
    }
    test('duplicate duration label stays unresolved utility=$utility', () {
      final p = _discounts(
        utility: utility,
        first: 'Loyalty Discount (12 months)',
        second: 'LOYALTY DISCOUNT (12 MONTHS)',
      );
      expect(p.adjustmentsComplete, isFalse);
      expect(p.discount, isNot('-5.00'));
    });
    test('compound discount role stays unresolved utility=$utility', () {
      final p = _discounts(
        utility: utility,
        second: 'Tax and Member Discount (6 months)',
      );
      expect(p.adjustmentsComplete, isFalse);
      expect(p.discount, isNot('-5.00'));
    });
    for (final label in [
      'Loyalty Discount (reversed)',
      'Loyalty Discount (waived)',
      'Loyalty Discount (refunded)',
      'Loyalty Discount (not applied)',
      'Loyalty Discount (already included)',
      'Reversed Loyalty Discount',
      'Credited Member Rebate',
      'No Discount',
      'Non-Discount',
      'Without Rebate',
      'No Discount (12 months)',
      'Non-Discount (12 months)',
      'Without Rebate (6 months)',
      'Paid Discount',
      'Loyalty Discount (paid)',
    ]) {
      test('qualified discount stays unresolved $label utility=$utility', () {
        final p = _discounts(utility: utility, first: label);
        expect(p.adjustmentsComplete, isFalse);
        expect(p.discount, isNot('-5.00'));
        expect(p.blocks.any((block) => block.text == label), isTrue);
      });
    }
    for (final money in ['EUR -3.00', 'USD 3.00', 'USD', '-3.00']) {
      test('unproven discount amount $money utility=$utility', () {
        final p = _discounts(utility: utility, secondMoney: money);
        expect(p.adjustmentsComplete, isFalse);
        expect(p.discount, isNot('-5.00'));
      });
    }
    test(
      'discount identities cannot override conflicting total utility=$utility',
      () {
        final p = _discounts(utility: utility, total: '6.00');
        expect(p.adjustmentsComplete, isFalse);
        expect(p.discount, isNot('-5.00'));
      },
    );
    test('outside financial evidence stays unresolved utility=$utility', () {
      expect(
        _discounts(utility: utility, outside: 'EUR 2.00').adjustmentsComplete,
        isFalse,
      );
    });
  }
  for (final label in ['Paid Member Discount', 'Paid Membership Discount']) {
    test('paid eligibility label remains a retail discount $label', () {
      final p = _discounts(utility: false, first: label);
      expect(p.discount, '-5.00');
      expect(p.adjustmentsComplete, isTrue);
      expect(p.reviewHints, isEmpty);
    });
  }
  test(
    'validated service discount labels keep their existing financial role',
    () {
      final p = _discounts(
        utility: true,
        first: 'Internet Service Loyalty Discount (12 months)',
        second: 'Mobile Service Member Discount (6 months)',
      );
      expect(p.discount, '-5.00');
      expect(p.tax, isNull);
      expect(p.service, isNull);
      expect(p.adjustmentsComplete, isTrue);
    },
  );
}
