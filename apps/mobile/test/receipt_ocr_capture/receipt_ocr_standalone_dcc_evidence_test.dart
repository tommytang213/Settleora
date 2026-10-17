import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

void main() {
  for (final amount in ['USD 5.00', '5.00 USD', '105.00']) {
    test('unowned standalone money remains incomplete: $amount', () {
      final preview = const ReceiptOcrParser().parse(
        'Acme Market\nCoffee USD 10.00\n$amount\nTotal USD 10.00',
      );
      expect(preview.items.map((item) => (item.description, item.lineTotal)), [
        ('Coffee', '10.00'),
      ]);
      expect(preview.total, '10.00');
      expect(preview.adjustmentsComplete, isFalse);
      expect(
        preview.incompleteAdjustmentReasons,
        contains(ReceiptOcrIncompleteAdjustmentReason.unretainedPricedItem),
      );
      expect(preview.reviewHints, isNotEmpty);
    });
  }

  test('geometry-owned standalone item amount remains complete', () {
    final preview = const ReceiptOcrParser().parse(
      'Corner Market\nBread\nUSD 2.50\nTotal USD 2.50',
      blocks: [
        _layoutBlock('Corner Market', 0, 20, 220),
        _layoutBlock('Bread', 1, 20, 150),
        _layoutBlock('USD 2.50', 2, 310, 350),
        _layoutBlock('Total USD 2.50', 3, 20, 350),
      ],
    );
    expect(preview.items.single.lineTotal, '2.50');
    expect(preview.total, '2.50');
    expect(preview.adjustmentsComplete, isTrue);
    expect(preview.incompleteAdjustmentReasons, isEmpty);
  });

  test('geometry-owned summary and tender amounts are not unowned money', () {
    final preview = const ReceiptOcrParser().parse(
      'Corner Market\nBread USD 2.50\nAmount Due\nUSD 2.50\n'
      'Cash Tendered\nUSD 5.00',
      blocks: [
        _layoutBlock('Corner Market', 0, 20, 220),
        _layoutBlock('Bread USD 2.50', 1, 20, 350),
        _layoutBlock('Amount Due', 2, 20, 150),
        _layoutBlock('USD 2.50', 3, 310, 350),
        _layoutBlock('Cash Tendered', 4, 20, 150),
        _layoutBlock('USD 5.00', 5, 310, 350),
      ],
    );
    expect(preview.items.single.lineTotal, '2.50');
    expect(preview.total, '2.50');
    expect(
      preview.incompleteAdjustmentReasons,
      isNot(
        contains(ReceiptOcrIncompleteAdjustmentReason.unretainedPricedItem),
      ),
    );
  });

  for (final label in [
    'Cash',
    'Cash Tendered',
    'Paid by card',
    'Payment summary',
    'Charged to card',
    'Charged card',
    'Payment amount',
    'Tender credit card',
    'Cash amount',
    'Credit card total',
    'Change due',
    'Card payment total',
    '現金',
  ]) {
    test('complete payment label owns its adjacent amount: $label', () {
      final preview = const ReceiptOcrParser().parse(
        'Acme Market\nCoffee USD 10.00\nTotal USD 10.00\n$label\nUSD 20.00',
        blocks: [
          _layoutBlock('Acme Market', 0, 20, 220),
          _layoutBlock('Coffee USD 10.00', 1, 20, 350),
          _layoutBlock('Total USD 10.00', 2, 20, 350),
          _layoutBlock(label, 3, 20, 150),
          _layoutBlock('USD 20.00', 4, 310, 350),
        ],
      );
      expect(preview.total, '10.00');
      expect(preview.items.single.lineTotal, '10.00');
      expect(
        preview.incompleteAdjustmentReasons,
        isNot(
          contains(ReceiptOcrIncompleteAdjustmentReason.unretainedPricedItem),
        ),
      );
    });
  }

  for (final label in ['Cash USD 20.00', 'Cash Latte']) {
    test(
      'priced or descriptive payment row cannot own extra money: $label',
      () {
        final preview = const ReceiptOcrParser().parse(
          'Acme Market\nCoffee USD 10.00\nTotal USD 10.00\n$label\nUSD 5.00',
          blocks: [
            _layoutBlock('Acme Market', 0, 20, 220),
            _layoutBlock('Coffee USD 10.00', 1, 20, 350),
            _layoutBlock('Total USD 10.00', 2, 20, 350),
            _layoutBlock(label, 3, 20, 150),
            _layoutBlock('USD 5.00', 4, 310, 350),
          ],
        );
        expect(preview.total, '10.00');
        expect(preview.adjustmentsComplete, isFalse);
        expect(
          preview.incompleteAdjustmentReasons,
          contains(ReceiptOcrIncompleteAdjustmentReason.unretainedPricedItem),
        );
        expect(preview.reviewHints, isNotEmpty);
      },
    );
  }

  for (final rate in [
    ('20', '2.00', '12.00'),
    ('7.5', '0.75', '10.75'),
    ('7.125', '0.71', '10.71'),
    ('8.875', '0.89', '10.89'),
    ('20.000', '2.00', '12.00'),
  ]) {
    test('rated tax label owns its adjacent monetary amount: ${rate.$1}%', () {
      final label = 'VAT ${rate.$1}%';
      final preview = const ReceiptOcrParser().parse(
        'Acme Market\nCoffee USD 10.00\nSubtotal USD 10.00\n'
        '$label\nUSD ${rate.$2}\nTotal USD ${rate.$3}',
        blocks: [
          _layoutBlock('Acme Market', 0, 20, 220),
          _layoutBlock('Coffee USD 10.00', 1, 20, 350),
          _layoutBlock('Subtotal USD 10.00', 2, 20, 350),
          _layoutBlock(label, 3, 20, 150),
          _layoutBlock('USD ${rate.$2}', 4, 310, 350),
          _layoutBlock('Total USD ${rate.$3}', 5, 20, 350),
        ],
      );
      expect(preview.tax, rate.$2);
      expect(preview.total, rate.$3);
      expect(preview.adjustmentsComplete, isTrue);
      expect(preview.incompleteAdjustmentReasons, isEmpty);
    });
  }

  test('percentage does not erase a monetary amount already on the label', () {
    const label = 'VAT 20% USD 2.00';
    final preview = const ReceiptOcrParser().parse(
      'Acme Market\nCoffee USD 10.00\nSubtotal USD 10.00\n'
      '$label\nUSD 5.00\nTotal USD 12.00',
      blocks: [
        _layoutBlock('Acme Market', 0, 20, 220),
        _layoutBlock('Coffee USD 10.00', 1, 20, 350),
        _layoutBlock('Subtotal USD 10.00', 2, 20, 350),
        _layoutBlock(label, 3, 20, 150),
        _layoutBlock('USD 5.00', 4, 310, 350),
        _layoutBlock('Total USD 12.00', 5, 20, 350),
      ],
    );
    expect(preview.adjustmentsComplete, isFalse);
    expect(
      preview.incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.unretainedPricedItem),
    );
  });

  for (final label in [
    'VISA ****1234',
    'Paid with card ••••5678',
    'Refund to debit ****2468',
  ]) {
    test('bounded card identity owns its adjacent payment amount: $label', () {
      final preview = const ReceiptOcrParser().parse(
        'Acme Market\nCoffee USD 10.00\nTotal USD 10.00\n$label\nUSD 10.00',
        blocks: [
          _layoutBlock('Acme Market', 0, 20, 220),
          _layoutBlock('Coffee USD 10.00', 1, 20, 350),
          _layoutBlock('Total USD 10.00', 2, 20, 350),
          _layoutBlock(label, 3, 20, 150),
          _layoutBlock('USD 10.00', 4, 310, 350),
        ],
      );
      expect(preview.total, '10.00');
      expect(preview.items.single.lineTotal, '10.00');
      expect(preview.adjustmentsComplete, isTrue);
      expect(preview.incompleteAdjustmentReasons, isEmpty);
    });
  }

  for (final (label, amount) in [
    ('VISA ****1234 USD 20.00', 'USD 5.00'),
    ('VISA 1234', 'USD 5.00'),
    ('VISA ****12345', 'USD 5.00'),
    ('VISA ****1234 USD 20', '500 USD'),
    ('Paid with card ••••5678 20', '500 USD'),
  ]) {
    test(
      'card identifier or existing price cannot hide extra money: $label',
      () {
        final preview = const ReceiptOcrParser().parse(
          'Acme Market\nCoffee USD 10.00\nTotal USD 10.00\n$label\n$amount',
          blocks: [
            _layoutBlock('Acme Market', 0, 20, 220),
            _layoutBlock('Coffee USD 10.00', 1, 20, 350),
            _layoutBlock('Total USD 10.00', 2, 20, 350),
            _layoutBlock(label, 3, 20, 150),
            _layoutBlock(amount, 4, 310, 350),
          ],
        );
        expect(preview.adjustmentsComplete, isFalse);
        expect(
          preview.incompleteAdjustmentReasons,
          contains(ReceiptOcrIncompleteAdjustmentReason.unretainedPricedItem),
        );
      },
    );
  }

  test('unpriced card identity can own one space-grouped amount', () {
    const label = 'VISA ****1234';
    const amount = 'USD 20 500';
    final preview = const ReceiptOcrParser().parse(
      'Acme Market\nCoffee USD 20500.00\nTotal USD 20500.00\n'
      '$label\n$amount',
      blocks: [
        _layoutBlock('Acme Market', 0, 20, 220),
        _layoutBlock('Coffee USD 20500.00', 1, 20, 350),
        _layoutBlock('Total USD 20500.00', 2, 20, 350),
        _layoutBlock(label, 3, 20, 150),
        _layoutBlock(amount, 4, 310, 350),
      ],
    );
    expect(preview.total, '20500.00');
    expect(preview.adjustmentsComplete, isTrue);
    expect(preview.incompleteAdjustmentReasons, isEmpty);
  });

  for (final pair in [
    ('12.34', '12.34'),
    ('0012.34', '12.34'),
    ('12.34', '0012.34'),
    ('00012.34', '0012.34'),
    ('0012.00', '12'),
  ]) {
    test('equivalent DCC money corroborates: $pair', () {
      final preview = const ReceiptOcrParser().parse(
        'Acme Market\nCoffee USD ${pair.$2}\nTotal USD ${pair.$2}\n'
        'DCC selected USD ${pair.$1}\nCard charged USD ${pair.$2}',
      );
      expect(preview.currency, 'USD');
      expect(
        preview.warnings,
        isNot(
          contains(
            'DCC selection needs a matching charged amount. '
            'Review the receipt currency.',
          ),
        ),
      );
    });
  }

  test('different DCC amounts remain uncorroborated', () {
    final preview = const ReceiptOcrParser().parse(
      'Acme Market\nCoffee USD 12.34\nTotal USD 12.34\n'
      'DCC selected USD 0012.35\nCard charged USD 12.34',
    );
    expect(
      preview.warnings,
      contains(
        'DCC selection needs a matching charged amount. '
        'Review the receipt currency.',
      ),
    );
  });
}

ReceiptOcrBlockEvidence _layoutBlock(
  String text,
  int row,
  double left,
  double right,
) => ReceiptOcrBlockEvidence(
  text: text,
  order: row,
  row: row,
  points: [
    ReceiptOcrPoint(x: left, y: row * 20),
    ReceiptOcrPoint(x: right, y: row * 20),
    ReceiptOcrPoint(x: right, y: row * 20 + 12),
    ReceiptOcrPoint(x: left, y: row * 20 + 12),
  ],
);
