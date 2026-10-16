import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

const contactProducts = [
  'Phone Case',
  'Mobile Stand',
  'Contact Lens',
  'Fax Paper',
  'Tel Adapter',
  'Notebook',
];

({String text, List<ReceiptOcrBlockEvidence> blocks}) contactProductInput(
  String product, {
  String layout = 'flat',
  String? contact,
}) {
  final rows = <List<String>>[
    ['Example Shop'],
    ['Receipt date: 2026-06-18'],
    if (contact != null) [contact],
    if (layout == 'wrapped' && product.contains(' ')) ...[
      [product.substring(0, product.indexOf(' '))],
      [product.substring(product.indexOf(' ') + 1), 'USD 5.00'],
    ] else
      [product, 'USD 5.00'],
    ['Tea', 'USD 5.00'],
    ['Total', 'USD 10.00'],
  ];
  final blocks = <ReceiptOcrBlockEvidence>[];
  final scale = layout == 'small'
      ? 0.5
      : layout == 'large'
      ? 2.0
      : 1.0;
  if (layout != 'flat') {
    for (var row = 0; row < rows.length; row++) {
      final cells = layout == 'line' ? [rows[row].join(' ')] : rows[row];
      for (var cell = 0; cell < cells.length; cell++) {
        final x = (cell == 0 ? 20.0 : 600.0) * scale;
        final y = (20.0 + row * 30) * scale;
        final width =
            (cells.length == 1
                ? 700.0
                : cell == 0
                ? 400.0
                : 150.0) *
            scale;
        blocks.add(
          ReceiptOcrBlockEvidence(
            text: cells[cell],
            row: row,
            order: blocks.length,
            points: [
              ReceiptOcrPoint(x: x, y: y),
              ReceiptOcrPoint(x: x + width, y: y),
              ReceiptOcrPoint(x: x + width, y: y + 18 * scale),
              ReceiptOcrPoint(x: x, y: y + 18 * scale),
            ],
          ),
        );
      }
    }
  }
  return (text: rows.map((r) => r.join(' ')).join('\n'), blocks: blocks);
}

ReceiptOcrPreview contactProductPreview(
  String product, {
  String layout = 'flat',
}) {
  final input = contactProductInput(product, layout: layout);
  return const ReceiptOcrParser().parse(
    input.text,
    fallbackCurrency: 'USD',
    blocks: input.blocks,
  );
}

void main() {
  for (final product in contactProducts) {
    for (final layout in [
      'flat',
      'line',
      'split',
      'small',
      'large',
      'wrapped',
    ]) {
      test('contact product ownership retains $product in $layout layout', () {
        final input = contactProductInput(product, layout: layout);
        final p = const ReceiptOcrParser().parse(
          input.text,
          fallbackCurrency: 'USD',
          blocks: input.blocks,
        );
        final ambiguousWrap = layout == 'wrapped' && product.contains(' ');
        final retainedDescription = ambiguousWrap
            ? product.substring(product.indexOf(' ') + 1)
            : product;
        expect(p.items.map((i) => [i.description, i.lineTotal]), [
          [retainedDescription, '5.00'],
          ['Tea', '5.00'],
        ]);
        expect(p.currency, 'USD');
        expect(p.total, '10.00');
        // A lone unpriced word is not sufficient proof of continuation.
        // Preserve its ambiguity rather than dropping it as contact metadata
        // or broadening the existing description-joining contract.
        expect(p.adjustmentsComplete, !ambiguousWrap);
        if (ambiguousWrap) {
          expect(p.incompleteAdjustmentReasons, isNotEmpty);
          expect(p.reviewHints, isNotEmpty);
        } else {
          expect(p.incompleteAdjustmentReasons, isEmpty);
          expect(p.reviewHints, isEmpty);
        }
        expect(p.blocks, orderedEquals(input.blocks));
        final request = receiptOcrReviewSaveRequestFromPreview(
          p,
          originalCurrency: p.currency,
        )!;
        expect(request.lines.map((i) => [i.text, i.lineTotalAmount]), [
          [retainedDescription, '5.00'],
          ['Tea', '5.00'],
        ]);
      });
    }
  }
  for (final contact in [
    'Phone: +1 (212) 555-0100',
    'Tel: (555) 222-0199',
    'Telephone +44 20 7946 0958',
    '電話：2468 1357',
    '电话：2468 1357',
    'Tél: +33 1 42 68 53 00',
    'Fax: +44 20 7946 0958',
    'WhatsApp: +852 2468 1357',
    'Mobile: 0412 345 678',
    'Contact: +1-202-555-0131',
    '(555) 222-0199',
    '+44 20 7946 0958',
  ]) {
    for (final layout in ['flat', 'line', 'split']) {
      test('complete contact field remains metadata: $contact $layout', () {
        final input = contactProductInput(
          'Notebook',
          layout: layout,
          contact: contact,
        );
        final p = const ReceiptOcrParser().parse(
          input.text,
          fallbackCurrency: 'USD',
          blocks: input.blocks,
        );
        expect(p.items.map((i) => i.description), ['Notebook', 'Tea']);
        expect(p.adjustmentsComplete, isTrue);
        expect(p.reviewHints, isEmpty);
        expect(p.blocks, orderedEquals(input.blocks));
      });
    }
  }
  for (final mixed in [
    'Phone: +1 (212) 555-0100',
    'Mobile: 0412 345 678',
    'Contact: call reception',
    'Phone Case 123456789',
    'Notebook 123456789',
  ]) {
    for (final layout in ['flat', 'line', 'split']) {
      test(
        'priced mixed contact row cannot disappear as complete: $mixed $layout',
        () {
          final input = contactProductInput(mixed, layout: layout);
          final p = const ReceiptOcrParser().parse(
            input.text,
            fallbackCurrency: 'USD',
            blocks: input.blocks,
          );
          expect(p.items.length == 2 || !p.adjustmentsComplete, isTrue);
          if (p.items.length != 2) expect(p.reviewHints, isNotEmpty);
          expect(p.blocks, orderedEquals(input.blocks));
        },
      );
    }
  }
}
