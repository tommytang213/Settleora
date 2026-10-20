// All text and geometry below are invented; no held receipt data is used.
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrBlockEvidence block(
  String text,
  int order,
  int row,
  double left,
  double right,
) => ReceiptOcrBlockEvidence(
  text: text,
  order: order,
  row: row,
  points: [
    ReceiptOcrPoint(x: left, y: row * 20),
    ReceiptOcrPoint(x: right, y: row * 20),
    ReceiptOcrPoint(x: right, y: row * 20 + 12),
    ReceiptOcrPoint(x: left, y: row * 20 + 12),
  ],
);

String receipt(String row, {String total = '5.00'}) =>
    'Example Shop\n$row\nNotebook USD 5.00\n'
    'Subtotal USD $total\nTotal USD $total';

ReceiptOcrPreview parseRow(String row, {String total = '5.00'}) =>
    const ReceiptOcrParser().parse(
      receipt(row, total: total),
      fallbackCurrency: 'USD',
    );

void expectCleanNotebook(ReceiptOcrPreview preview) {
  expect(preview.items.length, 1);
  expect(preview.items.single.description, 'Notebook');
  expect(preview.items.single.lineTotal, '5.00');
  expect(preview.subtotal, '5.00');
  expect(preview.total, '5.00');
  expect(preview.adjustmentsComplete, isTrue);
  expect(preview.reviewHints, isEmpty);
  expect(preview.warnings, isEmpty);
}

bool hasReview(ReceiptOcrPreview preview) =>
    !preview.adjustmentsComplete || preview.reviewHints.isNotEmpty;

void expectExtraPricePreserved(ReceiptOcrPreview preview, String itemName) {
  final retained = preview.items.any(
    (item) =>
        item.lineTotal == '3.00' &&
        item.description.toLowerCase().contains(itemName.toLowerCase()),
  );
  expect(retained, isTrue);
  if (preview.blocks.isNotEmpty) {
    expect(
      preview.blocks.any((evidence) => evidence.text.contains(itemName)),
      isTrue,
    );
    expect(
      preview.blocks.any((evidence) => evidence.text.contains('3.00')),
      isTrue,
    );
  }
  expect(
    preview.items.any(
      (item) => item.description == 'Notebook' && item.lineTotal == '5.00',
    ),
    isTrue,
  );
}

void main() {
  for (final row in [
    'Datum: 2026-09-17 12:34',
    'Fecha/Date: 2026-09-17 12:34',
    'Due Date: 2025-04-28 Bill Date: 2025-04-10',
    'Order Date: 2026-09-16 Receipt Date: 2026-09-17',
    'Datum: Apr 10, 2025 12:34',
    'Date: Apr 10, 2025 1:34 pm',
    'Due Date: Apr 28, 2025 12:34 Bill Date: Apr 10, 2025 1:20 pm',
    'Order Date: 2026-09-16 23:59:59 Receipt Date: 2026-09-17 12:34',
    'Service Bill Date: 2026-09-17 12:34',
  ]) {
    test('complete original calendar field has no monetary residue: $row', () {
      expectCleanNotebook(parseRow(row));
    });
  }

  for (final row in [
    'Datum: 2026-02-29 Bill Date: 2026-09-18',
    'Datum: 2026/09-17 Bill Date: 2026-09-18',
    'Datum: 2026-09-17 24:00 Bill Date: 2026-09-18',
    'Datum: 2026-09-17 2026-09-18',
    'Datum: 2026-09-17 Bill Date: 2026-09-18 Date: 2026-09-19',
    'Datum: 2026-09-17 Invoice: 2026-09-18',
    'Datum: 2026-09-17 extra note Bill Date: 2026-09-18',
  ]) {
    test(
      'unsupported calendar chain cannot silently own all evidence: $row',
      () {
        final preview = parseRow(row);
        final silentlyOwned =
            preview.items.length == 1 &&
            preview.items.single.description == 'Notebook' &&
            preview.items.single.lineTotal == '5.00' &&
            preview.adjustmentsComplete &&
            preview.reviewHints.isEmpty;
        // This is a preservation oracle, not a demand for a particular warning.
        // If it fails, compare old/new behavior before attributing a new defect.
        expect(silentlyOwned, isFalse);
      },
    );
  }

  test('complete calendar chain cannot absorb a genuine trailing price', () {
    final preview = parseRow(
      'Datum: 2026-09-17 Bill Date: 2026-09-18 Calendar USD 3.00',
      total: '8.00',
    );
    expectExtraPricePreserved(preview, 'Calendar');
  });

  test('same-row separately priced Coffee survives calendar metadata', () {
    const row = 'Datum: 2026-09-17 12:34 Coffee USD 3.00';
    final preview = const ReceiptOcrParser().parse(
      receipt(row, total: '8.00'),
      fallbackCurrency: 'USD',
      blocks: [
        block('Example Shop', 0, 0, 20, 250),
        block('Datum: 2026-09-17 12:34', 1, 1, 20, 300),
        block('Coffee', 2, 1, 500, 600),
        block('USD 3.00', 3, 1, 650, 730),
        block('Notebook', 4, 2, 20, 180),
        block('USD 5.00', 5, 2, 650, 730),
        block('Subtotal USD 8.00', 6, 3, 20, 730),
        block('Total USD 8.00', 7, 4, 20, 730),
      ],
    );
    expectExtraPricePreserved(preview, 'Coffee');
  });

  test('mismatching blocks cannot authorize new whole-row ownership', () {
    const row = 'Datum: 2026-09-17 12:34';
    final preview = const ReceiptOcrParser().parse(
      receipt(row),
      fallbackCurrency: 'USD',
      blocks: [
        block('Example Shop', 0, 0, 20, 250),
        block(row, 1, 1, 20, 300),
        // This evidence is deliberately absent from recognizedText.
        block('Coffee', 2, 1, 500, 600),
        block('USD 3.00', 3, 1, 650, 730),
        block('Notebook', 4, 2, 20, 180),
        block('USD 5.00', 5, 2, 650, 730),
        block('Subtotal USD 5.00', 6, 3, 20, 730),
        block('Total USD 5.00', 7, 4, 20, 730),
      ],
    );
    expect(hasReview(preview), isTrue);
  });

  test('complete matching split calendar blocks own the original full row', () {
    const row = 'Due Date: Apr 28, 2025 12:34 Bill Date: Apr 10, 2025 1:20 pm';
    final preview = const ReceiptOcrParser().parse(
      receipt(row),
      fallbackCurrency: 'USD',
      blocks: [
        block('Example Shop', 0, 0, 20, 250),
        block('Due Date:', 1, 1, 20, 110),
        block('Apr 28, 2025 12:34', 2, 1, 120, 350),
        block('Bill Date:', 3, 1, 400, 500),
        block('Apr 10, 2025 1:20 pm', 4, 1, 510, 750),
        block('Notebook', 5, 2, 20, 180),
        block('USD 5.00', 6, 2, 650, 730),
        block('Subtotal USD 5.00', 7, 3, 20, 730),
        block('Total USD 5.00', 8, 4, 20, 730),
      ],
    );
    expectCleanNotebook(preview);
    expect(preview.receiptDate, '2025-04-10');
  });

  test('calendar row inside a charge table adds no item incompleteness', () {
    ReceiptOcrPreview table({required bool includeCalendar}) {
      const row = 'Datum: 2026-09-17 12:34';
      final itemRow = includeCalendar ? 3 : 2;
      return const ReceiptOcrParser().parse(
        'Example Shop\nDescription Amount\n'
        '${includeCalendar ? '$row\n' : ''}'
        'Notebook USD 5.00\nSubtotal USD 5.00\nTotal USD 5.00',
        fallbackCurrency: 'USD',
        blocks: [
          block('Example Shop', 0, 0, 20, 250),
          block('Description', 1, 1, 20, 180),
          block('Amount', 2, 1, 650, 730),
          if (includeCalendar) block(row, 3, 2, 20, 400),
          block('Notebook', 4, itemRow, 20, 180),
          block('USD 5.00', 5, itemRow, 650, 730),
          block('Subtotal USD 5.00', 6, itemRow + 1, 20, 730),
          block('Total USD 5.00', 7, itemRow + 2, 20, 730),
        ],
      );
    }

    final baseline = table(includeCalendar: false);
    final withCalendar = table(includeCalendar: true);
    for (final preview in [baseline, withCalendar]) {
      expect(preview.items.length, 1);
      expect(preview.items.single.description, 'Notebook');
      expect(preview.items.single.lineTotal, '5.00');
      expect(preview.subtotal, '5.00');
      expect(preview.total, '5.00');
    }
    // V1 required an unrelated synthetic merchant-row warning to disappear.
    // Require calendar ownership to add no incompleteness; do not suppress the
    // baseline's existing unowned merchant/product evidence.
    expect(withCalendar.adjustmentsComplete, baseline.adjustmentsComplete);
    expect(
      withCalendar.incompleteAdjustmentReasons,
      baseline.incompleteAdjustmentReasons,
    );
    expect(
      withCalendar.unresolvedItemLikeCount,
      baseline.unresolvedItemLikeCount,
    );
    expect(withCalendar.warnings, baseline.warnings);
  });
  test('complete single calendar prefix cannot absorb a genuine price', () {
    final preview = parseRow(
      'Datum: 2026-09-17 12:34 Calendar USD 3.00',
      total: '8.00',
    );
    expectExtraPricePreserved(preview, 'Calendar');
  });

  for (final values in [
    ['2026-09-17 12:34', '2026-09-18 12:34'],
    ['2026-09-17', '2026-09-18'],
    ['Apr 10, 2025 1:34 pm', 'Apr 11, 2025 12:34'],
    ['2026·09·17 12:34', '2026·09·18 12:34'],
    ['2026年09月17日 12:34', '2026年09月18日 12:34'],
  ]) {
    for (final reverse in [false, true]) {
      for (final withBlocks in [false, true]) {
        test('conflicting complete generic fields stay unresolved: '
            '$values,$reverse,$withBlocks', () {
          final ordered = reverse ? values.reversed.toList() : values;
          final first = 'Datum: ${ordered[0]}';
          final second = 'Date: ${ordered[1]}';
          final row = '$first $second';
          final preview = const ReceiptOcrParser().parse(
            receipt(row),
            fallbackCurrency: 'USD',
            blocks: withBlocks
                ? [
                    block('Example Shop', 0, 0, 20, 250),
                    block(first, 1, 1, 20, 350),
                    block(second, 2, 1, 400, 750),
                    block('Notebook', 3, 2, 20, 180),
                    block('USD 5.00', 4, 2, 650, 730),
                    block('Subtotal USD 5.00', 5, 3, 20, 730),
                    block('Total USD 5.00', 6, 4, 20, 730),
                  ]
                : const [],
          );
          expect(preview.receiptDate, isNull);
          expect(preview.warnings, contains(contains('receipt dates')));
          expect(preview.items.length, 1);
          expect(preview.items.single.description, 'Notebook');
          expect(preview.items.single.lineTotal, '5.00');
          expect(preview.subtotal, '5.00');
          expect(preview.total, '5.00');
        });
      }
    }
  }

  for (final value in [
    '2026-09-17',
    '2026-09-17 12:34',
    'Sep 17, 2026 1:34 pm',
    '2026·09·17 12:34',
    '2026年09月17日 12:34',
  ]) {
    test('corroborating complete generic fields stay quiet: $value', () {
      final preview = parseRow('Datum: $value Date: $value');
      expectCleanNotebook(preview);
      expect(preview.receiptDate, '2026-09-17');
    });
  }

  for (final fields in [
    ['Due Date: 2026-09-18 12:34', 'Datum: 2026-09-17 12:34'],
    ['Due Bill Date: 2026-09-18 12:34', 'Date: 2026-09-17 12:34'],
    ['Order Date: 2026-09-16 12:34', 'Receipt Date: 2026-09-17 12:34'],
    ['Stay Bill Date: 2026-09-18 12:34', 'Datum: 2026-09-17 12:34'],
  ]) {
    for (final reverse in [false, true]) {
      test('complete date field roles remain separate: $fields,$reverse', () {
        final ordered = reverse ? fields.reversed.toList() : fields;
        final preview = parseRow(ordered.join(' '));
        expectCleanNotebook(preview);
        expect(preview.receiptDate, '2026-09-17');
      });
    }
  }

  test('generic dates on separate clocked rows retain conflict evidence', () {
    final preview = parseRow('Datum: 2026-09-17 12:34\nDate: 2026-09-18 12:34');
    expect(preview.receiptDate, isNull);
    expect(preview.warnings, contains(contains('receipt dates')));
  });

  test('a complete generic field conflicts with an explicit receipt field', () {
    final preview = parseRow(
      'Datum: 2026-09-18 12:34 Receipt Date: 2026-09-17 12:34',
    );
    expect(preview.receiptDate, isNull);
    expect(preview.warnings, contains(contains('receipt dates')));
  });
}
