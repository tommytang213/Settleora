import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrPreview _receipt(
  List<String> fields, {
  String currency = 'USD',
  bool geometry = false,
}) {
  final lines = [
    'Example Market',
    ...fields,
    'Coffee $currency 5.00',
    'Total $currency 5.00',
  ];
  final blocks = [
    for (final (i, line) in lines.indexed)
      ReceiptOcrBlockEvidence(
        text: line,
        row: i,
        order: i,
        confidence: .99,
        points: [
          ReceiptOcrPoint(x: 20, y: i * 30),
          ReceiptOcrPoint(x: 500, y: i * 30),
          ReceiptOcrPoint(x: 500, y: i * 30 + 20),
          ReceiptOcrPoint(x: 20, y: i * 30 + 20),
        ],
      ),
  ];
  final p = const ReceiptOcrParser().parse(
    lines.join('\n'),
    blocks: geometry ? blocks : const [],
  );
  if (geometry) expect(p.blocks, blocks);
  return p;
}

void _ambiguous(ReceiptOcrPreview p) {
  expect(p.receiptDate, isNull);
  expect(p.warnings, contains(contains('Conflicting receipt dates')));
}

void _date(ReceiptOcrPreview p, String expected) {
  expect(p.receiptDate, expected);
  expect(p.warnings, isNot(contains(contains('Conflicting receipt dates'))));
}

void main() {
  for (final label in [
    'Receipt Date',
    'Invoice Date',
    'Bill Date',
    'Statement Date',
    'Transaction Date',
    'Purchase Date',
    'Order Date',
    'Issued On',
  ]) {
    for (final geometry in [false, true]) {
      for (final reversed in [false, true]) {
        test(
          'same date role conflicts independent of position: $label,$geometry,$reversed',
          () {
            final fields = ['$label: 2026-10-01', '$label: October 2, 2026'];
            _ambiguous(
              _receipt(
                reversed ? fields.reversed.toList() : fields,
                geometry: geometry,
              ),
            );
          },
        );
      }
      test(
        'same date role corroborates equivalent values: $label,$geometry',
        () {
          _date(
            _receipt([
              '$label: 2026-10-01',
              '$label: October 1, 2026',
            ], geometry: geometry),
            '2026-10-01',
          );
        },
      );
    }
    test('wrapped same-role date conflicts: $label', () {
      _ambiguous(_receipt(['$label:', '2026-10-01', '$label:', '2026-10-02']));
    });
    test('wrapped identical dates corroborate: $label', () {
      _date(
        _receipt(['$label:', '2026-10-01', '$label:', '2026-10-01']),
        '2026-10-01',
      );
    });
    for (final qualifier in ['Prior', 'Previous', 'Refund', 'Due', 'Payment']) {
      test(
        'qualified date does not conflict with current role: $label,$qualifier',
        () {
          _date(
            _receipt(['$qualifier $label: 2026-09-30', '$label: 2026-10-01']),
            '2026-10-01',
          );
        },
      );
    }
    test('invalid date does not create role conflict: $label', () {
      _date(
        _receipt(['$label: 2026-02-30', '$label: 2026-10-01']),
        '2026-10-01',
      );
    });
  }
  for (final label in ['Invoice Date', 'Bill Date', 'Statement Date']) {
    test('generic date remains lower-priority than $label', () {
      _date(_receipt(['Date: 2026-09-30', '$label: 2026-10-01']), '2026-10-01');
    });
    test('product mention does not own $label', () {
      _date(
        _receipt(['$label Planner 2026-09-30 USD 2.00', '$label: 2026-10-01']),
        '2026-10-01',
      );
    });
  }
  test('receipt and order dates retain distinct roles', () {
    _date(
      _receipt(['Order Date: 2026-09-30', 'Receipt Date: 2026-10-01']),
      '2026-10-01',
    );
  });
  for (final row in [
    (currency: 'USD', a: '1.25', b: '2.50', expected: '3.75'),
    (
      currency: 'USD',
      a: '50000000000000000.00',
      b: '50000000000000000.00',
      expected: '100000000000000000.00',
    ),
    (
      currency: 'USD',
      a: '100000000000000000.00',
      b: '1.00',
      expected: '100000000000000001.00',
    ),
    (
      currency: 'USD',
      a: '92233720368547758.06',
      b: '0.01',
      expected: '92233720368547758.07',
    ),
    (
      currency: 'USD',
      a: '92233720368547758.07',
      b: '0.01',
      expected: '92233720368547758.08',
    ),
    (
      currency: 'JPY',
      a: '4611686018427387904',
      b: '4611686018427387904',
      expected: '9223372036854775808',
    ),
    (
      currency: 'JPY',
      a: '9223372036854775807',
      b: '1',
      expected: '9223372036854775808',
    ),
    (
      currency: 'KWD',
      a: '5000000000000000.000',
      b: '5000000000000000.000',
      expected: '10000000000000000.000',
    ),
    (
      currency: 'KWD',
      a: '9223372036854775.807',
      b: '0.001',
      expected: '9223372036854775.808',
    ),
  ]) {
    test(
      'positive tax sum stays exact across native limits: ${row.currency},${row.a},${row.b}',
      () {
        final p = _receipt([
          'Tax 5% ${row.currency} ${row.a}',
          'Tax 10% ${row.currency} ${row.b}',
        ], currency: row.currency);
        expect(p.tax, row.expected);
        expect(p.taxCurrency, row.currency);
      },
    );
  }
  for (final separateRows in [false, true]) {
    for (final reverse in [false, true]) {
      test(
        'totals differing by 2^64 minor units stay conflicting: $separateRows,$reverse',
        () {
          final totals = [
            'Grand Total USD 184467440737095516.17',
            'Grand Total USD 0.01',
          ];
          final p = const ReceiptOcrParser().parse(
            [
              'Example Market',
              'Coffee USD 0.01',
              ...(separateRows
                  ? (reverse ? totals.reversed : totals)
                  : [(reverse ? totals.reversed : totals).join(' ')]),
            ].join('\n'),
          );
          expect(p.adjustmentsComplete, isFalse);
          expect(
            p.incompleteAdjustmentReasons,
            contains(
              ReceiptOcrIncompleteAdjustmentReason.labeledAmountEvidence,
            ),
          );
        },
      );
    }
  }
  for (final total in ['-84467440737095518.16', '99999999999999998.00']) {
    test('discount reconciliation uses exact components: $total', () {
      final p = const ReceiptOcrParser().parse(
        [
          'Example Market',
          'Coffee USD 50000000000000000.00',
          'Subtotal USD 50000000000000000.00',
          'Tax USD 50000000000000000.00',
          'Coupon USD -1.00',
          'Loyalty Discount USD -1.00',
          'Total USD $total',
        ].join('\n'),
      );
      if (total.startsWith('-')) {
        expect(p.discount, isNot('-2.00'));
        expect(p.adjustmentsComplete, isFalse);
      } else {
        expect(p.discount, '-2.00');
      }
    });
  }
  test('unsupported loyalty savings keeps its existing ambiguity', () {
    final p = const ReceiptOcrParser().parse(
      'Example Market\nCoffee USD 10.00\nSubtotal USD 10.00\nCoupon USD -1.00\nLoyalty Savings USD -1.00\nTotal USD 8.00',
    );
    expect(p.adjustmentsComplete, isFalse);
    expect(p.discount, isNot('-2.00'));
  });
  for (final alias in [false, true]) {
    test('discount rejects a modulo-2^64 total alias: $alias', () {
      final total = alias ? '184467440737095524.16' : '8.00';
      final p = const ReceiptOcrParser().parse(
        'Example Market\nCoffee USD 10.00\nSubtotal USD 10.00\nCoupon USD -1.00\nLoyalty Discount USD -1.00\nTotal USD $total',
      );
      if (alias) {
        expect(p.discount, isNot('-2.00'));
        expect(p.adjustmentsComplete, isFalse);
      } else {
        expect(p.discount, '-2.00');
        expect(p.adjustmentsComplete, isTrue);
      }
    });
  }
  for (final qualifier in ['Prior', 'Previous', 'Due', 'Payment']) {
    test('wrapped qualifier keeps invoice history separate: $qualifier', () {
      _date(
        _receipt([
          'Invoice Date: 2026-10-01',
          qualifier,
          'Invoice Date: 2026-09-30',
        ]),
        '2026-10-01',
      );
    });
  }
  for (final alias in [false, true]) {
    test('signed return ownership rejects modulo-2^64 item alias: $alias', () {
      final amount = alias ? '-184467440737095526.16' : '-10.00';
      final p = const ReceiptOcrParser().parse(
        'Example Returns\nDate: 2026-10-01\nReturned Scarf USD $amount\nRestocking Fee USD 2.00\nRefund Total USD -8.00\nRefund to VISA ****4321\nThank you',
      );
      if (alias) {
        expect(p.adjustmentsComplete, isFalse);
        expect(p.reviewHints, isNotEmpty);
        expect(p.items.first.lineTotal, amount);
      } else {
        expect(p.adjustmentsComplete, isTrue);
        expect(p.items.map((i) => i.description), contains('Restocking Fee'));
      }
    });
  }
}
