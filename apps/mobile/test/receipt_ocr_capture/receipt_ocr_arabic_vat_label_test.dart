import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

const _vatLabel = 'ضريبة القيمة المضافة';

ReceiptOcrPreview _receipt(String adjustment) => const ReceiptOcrParser().parse(
  'متجر النور\n'
  'Date: 2026-09-17\n'
  'شاورما AED 25.00\n'
  'عصير AED 12.00\n'
  'المجموع الفرعي AED 37.00\n'
  '$adjustment\n'
  'الإجمالي AED 38.85',
);

ReceiptOcrPreview _invoiceReceipt(
  String description,
  String money, {
  bool merchandise = false,
  bool invoice = true,
}) {
  final rows = <List<(String, double, double)>>[
    [('متجر النور', 20, 350)],
    [('Date: 2026-09-17', 20, 350)],
    if (invoice)
      [
        ('Product / Service', 90, 300),
        ('SKU', 520, 600),
        ('Qty', 620, 650),
        ('Unit Price', 680, 790),
        ('Total', 850, 960),
      ]
    else ...[
      [('Current Charges Detail', 20, 500)],
      [('Description', 90, 300), ('Amount', 850, 960)],
    ],
    [('شاورما', 90, 420), ('AED 25.00', 850, 960)],
    [('عصير', 90, 420), ('AED 12.00', 850, 960)],
    [(description, 90, 420), (money, 850, 960)],
    [('Subtotal AED ${merchandise ? '38.85' : '37.00'}', 680, 960)],
    [('Total AED 38.85', 680, 960)],
  ];
  final blocks = <ReceiptOcrBlockEvidence>[];
  for (var row = 0; row < rows.length; row++) {
    for (final (text, left, right) in rows[row]) {
      blocks.add(
        ReceiptOcrBlockEvidence(
          text: text,
          row: row,
          order: blocks.length,
          points: [
            ReceiptOcrPoint(x: left, y: row * 20),
            ReceiptOcrPoint(x: right, y: row * 20),
            ReceiptOcrPoint(x: right, y: row * 20 + 12),
            ReceiptOcrPoint(x: left, y: row * 20 + 12),
          ],
        ),
      );
    }
  }
  return const ReceiptOcrParser().parse(
    rows.map((row) => row.map((cell) => cell.$1).join(' ')).join('\n'),
    blocks: blocks,
  );
}

void _expectPurchasesAndTotals(ReceiptOcrPreview preview) {
  expect(preview.currency, 'AED');
  expect(preview.currencyProvenance, ReceiptOcrCurrencyProvenance.explicit);
  expect(preview.subtotal, '37.00');
  expect(preview.total, '38.85');
  for (final (description, amount) in [
    ('شاورما', '25.00'),
    ('عصير', '12.00'),
  ]) {
    final item = preview.items.singleWhere(
      (item) => item.description == description,
    );
    expect(item.lineTotal, amount);
    expect(item.currency, 'AED');
    expect(item.currencyUnresolved, isFalse);
    expect(item.quantity, isNull);
    expect(item.unitPrice, isNull);
  }
}

void _expectCompleteTax(ReceiptOcrPreview preview) {
  _expectPurchasesAndTotals(preview);
  expect(preview.tax, '1.85');
  expect(preview.taxCurrency, 'AED');
  expect(preview.taxHasExplicitCurrencyEvidence, isTrue);
  expect(preview.taxIncludedInTotal, isFalse);
  expect(preview.items.map((item) => item.description), ['شاورما', 'عصير']);
  expect(preview.adjustmentsComplete, isTrue);
  expect(preview.reviewHints, isEmpty);
}

void main() {
  // Printed receipt text, not a reconstruction of retained native OCR output.
  test(
    'complete Arabic VAT phrase owns its printed tax rather than an item',
    () {
      _expectCompleteTax(_receipt('$_vatLabel AED 1.85'));
    },
  );

  for (final money in ['AED 1.85', '1.85 AED', '١٫٨٥ د.إ']) {
    test('existing Arabic tax label retains its contract: $money', () {
      _expectCompleteTax(_receipt('الضريبة $money'));
    });
  }

  for (final description in [
    '$_vatLabel Guide',
    '$_vatLabel DVD',
    'Guide $_vatLabel',
    'Guide $_vatLabel ZZZ',
    'كتاب$_vatLabel',
    '$_vatLabelكتاب',
  ]) {
    test(
      'Arabic VAT phrase inside merchandise stays an item: $description',
      () {
        final preview = const ReceiptOcrParser().parse(
          'Bookshop\nDate: 2026-09-17\n'
          '$description AED 1.85\nTotal AED 1.85',
        );
        expect(preview.tax, isNull);
        expect(preview.currency, 'AED');
        expect(preview.total, '1.85');
        expect(preview.items.single.description, description);
        expect(preview.items.single.lineTotal, '1.85');
        expect(preview.items.single.currency, 'AED');
      },
    );
  }

  test('an unrelated VAT mention cannot borrow a summary amount', () {
    final preview = _receipt('ملاحظة عن $_vatLabel');
    _expectPurchasesAndTotals(preview);
    expect(preview.tax, isNull);
    expect(preview.items.map((item) => item.description), ['شاورما', 'عصير']);
  });

  for (final remainder in ['AED', 'aEd', 'د.إ', 'دإ', ': AED', '： د.إ']) {
    test('currency-only Arabic VAT retains its missing amount: $remainder', () {
      final preview = _receipt('$_vatLabel $remainder');
      _expectPurchasesAndTotals(preview);
      expect(preview.tax, isNull);
      expect(preview.taxCurrency, isNull);
      expect(preview.taxHasExplicitCurrencyEvidence, isFalse);
      expect(preview.items.map((item) => item.description), ['شاورما', 'عصير']);
      expect(preview.adjustmentsComplete, isFalse);
      expect(
        preview.incompleteAdjustmentReasons,
        contains(
          ReceiptOcrIncompleteAdjustmentReason.unclassifiedAdjustmentLabel,
        ),
      );
      expect(preview.reviewHints, isNotEmpty);
    });
  }

  for (final line in [
    '$_vatLabel AED Guide',
    '$_vatLabel AEDGuide',
    '$_vatLabel د.إ Guide',
    'Guide $_vatLabel AED',
    '$_vatLabel ZZZ',
    '$_vatLabel DVD',
  ]) {
    test('other Arabic VAT text is not a known currency-only cell: $line', () {
      final preview = _receipt(line);
      _expectPurchasesAndTotals(preview);
      expect(preview.tax, isNull);
      expect(preview.taxCurrency, isNull);
      expect(preview.taxHasExplicitCurrencyEvidence, isFalse);
      expect(preview.items.map((item) => item.description), ['شاورما', 'عصير']);
      // These words do not prove a missing known-currency monetary cell.
      // Other unresolved-row review evidence remains governed by its own role.
      expect(
        preview.incompleteAdjustmentReasons,
        isNot(
          contains(
            ReceiptOcrIncompleteAdjustmentReason.unclassifiedAdjustmentLabel,
          ),
        ),
      );
      expect(preview.reviewHints, isNotEmpty);
    });
  }

  for (final adjustment in [
    '$_vatLabel AED 1.85 pending',
    '$_vatLabel AED 1.85guide',
    '$_vatLabel AED 1.85 AED 2.00',
    '$_vatLabel AED 1.85 2.00',
    '$_vatLabel AED 1.85.2',
    '$_vatLabel 5%',
    _vatLabel,
    '$_vatLabel ZZZ 1.85',
    '$_vatLabel AED - 1.85',
  ]) {
    test(
      'incomplete or ambiguous Arabic VAT is not a scalar tax: $adjustment',
      () {
        final preview = _receipt(adjustment);
        _expectPurchasesAndTotals(preview);
        expect(preview.tax, isNull);
        expect(preview.items.map((item) => item.description), [
          'شاورما',
          'عصير',
        ]);
        expect(preview.adjustmentsComplete, isFalse);
        expect(
          preview.incompleteAdjustmentReasons,
          containsAll(
            adjustment == '$_vatLabel AED - 1.85'
                ? [ReceiptOcrIncompleteAdjustmentReason.detachedLabeledSign]
                : adjustment == '$_vatLabel AED 1.85.2'
                ? [
                    ReceiptOcrIncompleteAdjustmentReason.labeledAmountEvidence,
                    ReceiptOcrIncompleteAdjustmentReason
                        .adjustmentAmountMissingOrRate,
                  ]
                : [
                    ReceiptOcrIncompleteAdjustmentReason
                        .unclassifiedAdjustmentLabel,
                  ],
          ),
        );
        expect(preview.reviewHints, isNotEmpty);
      },
    );
  }

  for (final code in ['ZZZ', 'DVD']) {
    test('table geometry retains incomplete Arabic VAT review: $code', () {
      // Check text-owned simple tables before the separately reproduced
      // invoice path so their independent ownership key is exercised.
      for (final invoice in [false, true]) {
        final preview = _invoiceReceipt(
          '$_vatLabel $code',
          '1.85',
          invoice: invoice,
        );
        _expectPurchasesAndTotals(preview);
        expect(preview.tax, isNull);
        expect(preview.items.map((item) => item.description), [
          'شاورما',
          'عصير',
        ]);
        expect(
          preview.adjustmentsComplete,
          isFalse,
          reason: 'invoice=$invoice',
        );
        expect(
          preview.incompleteAdjustmentReasons,
          contains(ReceiptOcrIncompleteAdjustmentReason.chargeTableAdjustment),
        );
        expect(preview.reviewHints, isNotEmpty);
        expect(
          preview.blocks.any((block) => block.text == '$_vatLabel $code'),
          isTrue,
        );
        expect(preview.blocks.any((block) => block.text == '1.85'), isTrue);
      }
    });
  }

  for (final suffix in ['Guide', 'DVD']) {
    test('table geometry retains Arabic VAT merchandise: $suffix', () {
      final description = '$_vatLabel $suffix';
      for (final invoice in [false, true]) {
        final preview = _invoiceReceipt(
          description,
          'AED 1.85',
          merchandise: true,
          invoice: invoice,
        );
        expect(preview.tax, isNull);
        expect(preview.currency, 'AED');
        expect(preview.subtotal, '38.85');
        expect(preview.total, '38.85');
        expect(preview.items.map((item) => item.description), [
          'شاورما',
          'عصير',
          description,
        ]);
        expect(preview.items.map((item) => item.lineTotal), [
          '25.00',
          '12.00',
          '1.85',
        ]);
        expect(preview.items.every((item) => item.currency == 'AED'), isTrue);
        expect(preview.adjustmentsComplete, isTrue);
        expect(preview.incompleteAdjustmentReasons, isEmpty);
        expect(preview.reviewHints, isEmpty);
      }
    });
  }

  test('invoice Arabic tax retains the existing unresolved table role', () {
    // Neither Arabic label has an existing invoice-column tax projection.
    // A complete monetary cell within that table cannot bypass its role gate.
    for (final label in ['الضريبة', _vatLabel]) {
      final preview = _invoiceReceipt(label, 'AED 1.85');
      _expectPurchasesAndTotals(preview);
      expect(preview.tax, isNull);
      expect(preview.items.map((item) => item.description), ['شاورما', 'عصير']);
      expect(preview.adjustmentsComplete, isFalse);
      expect(
        preview.incompleteAdjustmentReasons,
        contains(ReceiptOcrIncompleteAdjustmentReason.chargeTableAdjustment),
      );
      expect(preview.reviewHints, isNotEmpty);
    }
  });

  for (final adjustment in [
    '$_vatLabel ZZZ 1.85',
    '$_vatLabel DVD 1.85',
    '$_vatLabel AED 1.85 AED 2.00',
    '$_vatLabel AED 1.85 2.00',
  ]) {
    test(
      'ambiguous Arabic VAT money stays outside merchandise: $adjustment',
      () {
        final preview = _receipt(adjustment);
        _expectPurchasesAndTotals(preview);
        expect(preview.tax, isNull);
        expect(preview.items.map((item) => item.description), [
          'شاورما',
          'عصير',
        ]);
        expect(preview.adjustmentsComplete, isFalse);
        expect(
          preview.incompleteAdjustmentReasons,
          contains(
            ReceiptOcrIncompleteAdjustmentReason.unclassifiedAdjustmentLabel,
          ),
        );
        expect(preview.reviewHints, isNotEmpty);
      },
    );
  }

  test('a foreign-denominated Arabic VAT keeps its currency for review', () {
    final preview = _receipt('$_vatLabel USD 1.85');
    final existingLabel = _receipt('الضريبة USD 1.85');
    _expectPurchasesAndTotals(preview);
    expect(preview.tax, '1.85');
    expect(preview.taxCurrency, 'USD');
    expect(preview.taxHasExplicitCurrencyEvidence, isTrue);
    expect(preview.items.map((item) => item.description), ['شاورما', 'عصير']);
    expect(preview.reviewHints, isNotEmpty);
    expect(preview.adjustmentsComplete, existingLabel.adjustmentsComplete);
    expect(preview.reviewHintDecision, existingLabel.reviewHintDecision);
    expect(preview.reviewHints, existingLabel.reviewHints);
  });

  test('opposed Arabic VAT denominations remain unresolved', () {
    final preview = _receipt('$_vatLabel AED 1.85 USD');
    final existingLabel = _receipt('الضريبة AED 1.85 USD');
    _expectPurchasesAndTotals(preview);
    expect(preview.tax, '1.85');
    expect(preview.taxCurrency, isNull);
    expect(preview.taxHasExplicitCurrencyEvidence, isTrue);
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.items.map((item) => item.description), ['شاورما', 'عصير']);
    expect(preview.reviewHints, isNotEmpty);
    expect(preview.reviewHintDecision, existingLabel.reviewHintDecision);
  });

  test('repeated Arabic VAT rows preserve the existing ambiguity gate', () {
    final preview = _receipt('$_vatLabel AED 1.85\n$_vatLabel AED 2.00');
    final existingLabel = _receipt('الضريبة AED 1.85\nالضريبة AED 2.00');
    _expectPurchasesAndTotals(preview);
    expect(preview.items.map((item) => item.description), ['شاورما', 'عصير']);
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.reviewHints, isNotEmpty);
    expect(preview.tax, existingLabel.tax);
    expect(preview.reviewHintDecision, existingLabel.reviewHintDecision);
  });
}
