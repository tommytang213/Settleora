import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrBlockEvidence _block(
  String text,
  int order,
  int row,
  double left,
  double right, {
  bool missingPoints = false,
}) => ReceiptOcrBlockEvidence(
  text: text,
  order: order,
  row: row,
  points: missingPoints
      ? const []
      : [
          ReceiptOcrPoint(x: left, y: row * 20),
          ReceiptOcrPoint(x: right, y: row * 20),
          ReceiptOcrPoint(x: right, y: row * 20 + 12),
          ReceiptOcrPoint(x: left, y: row * 20 + 12),
        ],
);

void main() {
  for (final missingLabel in [true, false]) {
    test('unresolved total with missing ${missingLabel ? 'label' : 'amount'} '
        'geometry remains reviewable', () {
      final blocks = [
        _block('Corner Store', 0, 0, 10, 100),
        _block('Coffee USD 10.00', 1, 1, 10, 200),
        _block('Total 2025/01/01', 2, 2, 10, 200),
        _block('Grand Total', 3, 3, 10, 100, missingPoints: missingLabel),
        _block('USD 10.00', 4, 3, 150, 220, missingPoints: !missingLabel),
      ];
      final preview = const ReceiptOcrParser().parse(
        'Corner Store\nCoffee USD 10.00\nTotal 2025/01/01\n'
        'Grand Total USD 10.00',
        fallbackCurrency: 'USD',
        blocks: blocks,
      );

      expect(preview.total, isNull);
      expect(preview.blocks, blocks);
      expect(preview.items.any((item) => item.description == 'Coffee'), isTrue);
    });
  }

  for (final sideText in ['Meter reading 434', 'Graph sample 9271']) {
    test(
      'unowned numeric side cell cannot replace a printed total: $sideText',
      () {
        final blocks = [
          _block('Corner Store', 0, 0, 10, 100),
          _block('Coffee USD 10.00', 1, 1, 10, 200),
          _block('Grand Total', 2, 2, 10, 100),
          _block('USD 10.00', 3, 2, 150, 220),
          _block(sideText, 4, 2, 300, 440),
        ];
        final preview = const ReceiptOcrParser().parse(
          'Corner Store\nCoffee USD 10.00\nGrand Total USD 10.00 $sideText',
          fallbackCurrency: 'USD',
          blocks: blocks,
        );
        expect(preview.total, isNull);
        expect(preview.blocks, blocks);
        expect([...preview.warnings, ...preview.reviewHints], isNotEmpty);
      },
    );
  }

  test('foreign subtotal stays visible without corroborating receipt money', () {
    const preview = ReceiptOcrPreview(
      currency: 'USD',
      subtotal: '9.00',
      subtotalCurrency: 'EUR',
      subtotalHasExplicitCurrencyEvidence: true,
      total: '10.00',
      items: [
        ReceiptOcrItemCandidate(
          description: 'Coffee',
          lineTotal: '10.00',
          currency: 'USD',
        ),
      ],
    );

    expect(preview.subtotal, '9.00');
    expect(preview.subtotalCurrency, 'EUR');
    expect(
      preview.reviewHintDecision,
      ReceiptOcrReviewDecision.foreignAdjustmentWithoutSubtotal,
    );
    expect(preview.reviewHints, [
      'Detected adjustment currency differs from receipt currency. Review before applying.',
    ]);
  });

  test('reconciled same-currency subtotal does not add a warning', () {
    const preview = ReceiptOcrPreview(
      currency: 'USD',
      subtotal: '10.00',
      subtotalCurrency: 'USD',
      subtotalHasExplicitCurrencyEvidence: true,
      total: '10.00',
      items: [
        ReceiptOcrItemCandidate(
          description: 'Coffee',
          lineTotal: '10.00',
          currency: 'USD',
        ),
      ],
    );

    expect(preview.reviewHints, isEmpty);
    expect(preview.reviewHintDecision, ReceiptOcrReviewDecision.none);
  });
}
