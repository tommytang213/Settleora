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
  'Phone. Case',
  'Tel. Adapter',
  'Phone Number Case',
  'Tel No Adapter',
];

const unsupportedContactFields = [
  'Phone: +44 20 7946 1234 / +44 20 7946 5678',
  'Tel: +44 20 7946 1234;+44 20 7946 5678',
  'Phone No./Fax No.: +44 20 7946 1234 | +44 20 7946 5678',
  'Phone: +1 (212) 555-0100, +1 (212) 555-0199',
  '+44 20 7946 1234/+44 20 7946 5678',
  'Phone: +44 20 7946 1234 and +44 20 7946 5678',
  'Phone: +44 20 7946 1234 reception 123',
  'Phone: +44 20 7946 1234 service USD 2.00',
];

const qualifiedContactFields = [
  'Phone No: +44 20 7946 1234',
  'Phone No. +44 20 7946 1234',
  'Phone number: +44 20 7946 1234',
  'Tel. No: +44 20 7946 1234',
  'Tel.No.: +44 20 7946 1234',
  'Mobile number: 0412 345 678',
  'FAX NO.:+1 202 555 0131',
  'Contact Number +852 2468 1357',
  'Phone/Fax: +44 20 7946 1234',
  'Tel / Fax No.: +44 20 7946 1234',
  'Tel./Fax.+44 20 7946 1234',
  'Phone & Tel number: +44 20 7946 1234',
  'Phone No./Fax: +44 20 7946 1234',
  'Phone number/Fax No.: +44 20 7946 1234',
  'Tel.No./Fax.No.:+44 20 7946 1234',
  'Phone No. & Fax number: +44 20 7946 1234',
  'Phone number / Telephone number:+44 20 7946 1234',
  'Tel No / Mobile No: +44 20 7946 1234',
];

const dottedContactFields = [
  'Tel. +44 20 7946 1234',
  'TEL.: +44 20 7946 1234',
  'Tel.+44 20 7946 1234',
  'Tél. +33 1 42 68 53 00',
  'Phone. +1 (212) 555-0100 ext. 123',
  'Fax.: +1 202 555 0131',
  'Mobile. 0412 345 678',
  'Contact. +852 2468 1357',
];

const contactExtensionFields = [
  'Phone: +1 (212) 555-0100 ext. 123',
  'Tel: +44 20 7946 0958 ext 42',
  'Fax: +1 202 555 0131 extension 7',
  'Mobile: 0412 345 678 x123',
  'Contact: +852 2468 1357 #12',
  'Phone:212-555-0100x123',
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
  String? contact,
}) {
  final input = contactProductInput(product, layout: layout, contact: contact);
  return const ReceiptOcrParser().parse(
    input.text,
    fallbackCurrency: 'USD',
    blocks: input.blocks,
  );
}

ReceiptOcrPreview repeatedNameAmountPreview({
  (String, String) name = ('NORTH', 'MARKET'),
  String money = 'USD 3.00',
  double scale = 1,
}) {
  final blocks = <ReceiptOcrBlockEvidence>[];
  void cell(String text, int row, double left, double right) {
    blocks.add(
      ReceiptOcrBlockEvidence(
        text: text,
        row: row,
        order: blocks.length,
        confidence: .99,
        points: [
          ReceiptOcrPoint(x: left * scale, y: row * 30 * scale),
          ReceiptOcrPoint(x: right * scale, y: row * 30 * scale),
          ReceiptOcrPoint(x: right * scale, y: (row * 30 + 15) * scale),
          ReceiptOcrPoint(x: left * scale, y: (row * 30 + 15) * scale),
        ],
      ),
    );
  }

  cell(name.$1, 0, 20, 140);
  cell('Receipt', 0, 300, 650);
  cell(name.$2, 1, 20, 140);
  cell('Coffee USD 3.00', 2, 300, 650);
  cell('Tea USD 2.00', 3, 300, 650);
  cell('Total USD 5.00', 4, 20, 650);
  cell('${name.$1} ${name.$2}', 5, 20, 220);
  cell(money, 5, 300, 650);
  final rows = <int, List<String>>{};
  for (final block in blocks) {
    (rows[block.row] ??= []).add(block.text);
  }
  final preview = const ReceiptOcrParser().parse(
    rows.values.map((row) => row.join(' ')).join('\n'),
    blocks: blocks,
  );
  expect(preview.blocks, orderedEquals(blocks));
  return preview;
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
    ...contactExtensionFields,
    ...dottedContactFields,
    ...qualifiedContactFields,
    'Phone: +1 (212) 555-0100',
    'Tel: (555) 222-0199',
    'Telephone +44 20 7946 0958',
    '電話：2468 1357',
    '电话：2468 1357',
    'Tél: +33 1 42 68 53 00',
    'Call us at 1-800-555-0199',
    'Call: +1 (212) 555-0100',
    'Help desk: +44 20 7946 0958',
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
    ...dottedContactFields,
    ...qualifiedContactFields,
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

  for (final label in ['Dato', 'Dato/Datum', 'Datum/Dato']) {
    for (final shape in ['complete', 'invalid', 'priced', 'product']) {
      test('complete calendar contact-regression control: $label $shape', () {
        final field = switch (shape) {
          'complete' => '$label 2026-09-17',
          'invalid' => '$label 2026-02-30',
          'priced' => '$label 2026-09-17 USD 5.00',
          _ => '$label Organizer USD 5.00',
        };
        final priced = shape == 'priced' || shape == 'product';
        final p = const ReceiptOcrParser().parse(
          'Example Shop\n$field\nTea USD 5.00\nTotal USD ${priced ? '10.00' : '5.00'}',
          fallbackCurrency: 'USD',
        );
        if (shape == 'invalid') {
          expect(p.adjustmentsComplete, isFalse);
          expect(p.reviewHints, isNotEmpty);
        } else {
          expect(p.items.length, priced ? 2 : 1);
          expect(p.adjustmentsComplete, isTrue);
          expect(p.reviewHints, isEmpty);
          if (priced) expect(p.items.first.lineTotal, '5.00');
        }
      });
    }
  }
  for (final suffix in [
    'ext.',
    'ext. reception',
    'ext. 1234567',
    'ext. -123',
    'ext. 12.34',
    'ext. 123 USD 2.00',
  ]) {
    for (final layout in ['flat', 'line', 'split']) {
      test(
        'unsupported phone extension retains ambiguity: $suffix $layout',
        () {
          final input = contactProductInput(
            'Notebook',
            layout: layout,
            contact: 'Phone: +1 (212) 555-0100 $suffix',
          );
          final p = const ReceiptOcrParser().parse(
            input.text,
            fallbackCurrency: 'USD',
            blocks: input.blocks,
          );
          expect(p.items.map((i) => i.description), ['Notebook', 'Tea']);
          expect(p.adjustmentsComplete, isFalse);
          expect(p.reviewHints, isNotEmpty);
          expect(p.blocks, orderedEquals(input.blocks));
        },
      );
    }
  }
  test('reviewer phone-extension trigger retains only its priced tea', () {
    final p = const ReceiptOcrParser().parse(
      'Example Shop\nReceipt date: 2026-06-18\n'
      'Phone: +1 (212) 555-0100 ext. 123\n'
      'Tea USD 5.00\nTotal USD 5.00',
    );
    expect(p.items.map((i) => [i.description, i.lineTotal]), [
      ['Tea', '5.00'],
    ]);
    expect(p.adjustmentsComplete, isTrue);
    expect(p.reviewHints, isEmpty);
  });
  test('reviewer dotted-contact trigger retains only its priced tea', () {
    final p = const ReceiptOcrParser().parse(
      'Example Shop\nReceipt date: 2026-06-18\n'
      'Tel. +44 20 7946 1234\n'
      'Tea USD 5.00\nTotal USD 5.00',
    );
    expect(p.items.map((i) => [i.description, i.lineTotal]), [
      ['Tea', '5.00'],
    ]);
    expect(p.adjustmentsComplete, isTrue);
    expect(p.reviewHints, isEmpty);
  });
  test('reviewer qualified-contact trigger retains only its priced tea', () {
    final p = const ReceiptOcrParser().parse(
      'Example Shop\nReceipt date: 2026-06-18\n'
      'Phone No: +44 20 7946 1234\n'
      'Tea USD 5.00\nTotal USD 5.00',
    );
    expect(p.items.map((i) => [i.description, i.lineTotal]), [
      ['Tea', '5.00'],
    ]);
    expect(p.adjustmentsComplete, isTrue);
    expect(p.reviewHints, isEmpty);
  });
  test('reviewer qualifier-before-combined-label retains only priced tea', () {
    final p = const ReceiptOcrParser().parse(
      'Example Shop\nReceipt date: 2026-06-18\n'
      'Phone No./Fax: +44 20 7946 1234\n'
      'Tea USD 5.00\nTotal USD 5.00',
    );
    expect(p.items.map((i) => [i.description, i.lineTotal]), [
      ['Tea', '5.00'],
    ]);
    expect(p.adjustmentsComplete, isTrue);
    expect(p.reviewHints, isEmpty);
  });
  for (final name in [
    ('NORTH', 'MARKET'),
    ('RIVER', 'SUPPLIES'),
    ('SUNRISE', 'PROVISIONS'),
  ]) {
    for (final scale in [.5, 1.0, 2.0]) {
      for (final money in ['USD 3.00', '3.00', 'EUR 3.00']) {
        test(
          'repeated issuer retains neighboring money: $name $scale $money',
          () {
            final p = repeatedNameAmountPreview(
              name: name,
              scale: scale,
              money: money,
            );
            expect(p.merchant, '${name.$1} ${name.$2}');
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
            expect(p.reviewHints, isNotEmpty);
            final request = receiptOcrReviewSaveRequestFromPreview(
              p,
              originalCurrency: p.currency,
            )!;
            expect(request.lines.map((i) => [i.text, i.lineTotalAmount]), [
              ['Coffee', '3.00'],
              ['Tea', '2.00'],
              [
                '${name.$1} ${name.$2}',
                money.startsWith('EUR') ? null : '3.00',
              ],
            ]);
          },
        );
      }
    }
  }
  for (final contact in unsupportedContactFields) {
    for (final layout in ['flat', 'line', 'split']) {
      test('unsupported contact field stays unresolved $contact $layout', () {
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
        expect(p.items.map((i) => [i.description, i.lineTotal]), [
          ['Notebook', '5.00'],
          ['Tea', '5.00'],
        ]);
        expect(p.adjustmentsComplete, isFalse);
        expect(p.reviewHints, isNotEmpty);
        expect(p.blocks, orderedEquals(input.blocks));
        final request = receiptOcrReviewSaveRequestFromPreview(
          p,
          originalCurrency: p.currency,
        )!;
        expect(request.lines.map((i) => [i.text, i.lineTotalAmount]), [
          ['Notebook', '5.00'],
          ['Tea', '5.00'],
        ]);
      });
    }
  }
  test('reviewer multi-number trigger never creates a phone-priced item', () {
    final p = const ReceiptOcrParser().parse(
      'Example Shop\nReceipt date: 2026-06-18\n'
      'Phone: +44 20 7946 1234 / +44 20 7946 5678\n'
      'Tea USD 5.00\nTotal USD 5.00',
    );
    expect(p.items.map((i) => [i.description, i.lineTotal]), [
      ['Tea', '5.00'],
    ]);
    expect(p.adjustmentsComplete, isFalse);
    expect(p.reviewHints, isNotEmpty);
  });
}
