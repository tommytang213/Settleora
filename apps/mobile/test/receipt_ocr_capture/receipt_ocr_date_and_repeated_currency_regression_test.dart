import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrPreview _dated(List<String> dates) => const ReceiptOcrParser().parse(
  ['Example Market', ...dates, 'Tea USD 3.00', 'Total USD 3.00'].join('\n'),
);

ReceiptOcrPreview _table({
  bool secondMarker = false,
  String marker = 'USD',
  bool mirrored = false,
  double scale = 1,
}) {
  final blocks = <ReceiptOcrBlockEvidence>[];
  void add(String text, int row, double left, double right) {
    if (mirrored) {
      final previousLeft = left;
      left = 400 - right;
      right = 400 - previousLeft;
    }
    left *= scale;
    right *= scale;
    blocks.add(
      ReceiptOcrBlockEvidence(
        text: text,
        row: row,
        order: blocks.length,
        confidence: .99,
        points: [
          ReceiptOcrPoint(x: left, y: row * 30 * scale),
          ReceiptOcrPoint(x: right, y: row * 30 * scale),
          ReceiptOcrPoint(x: right, y: (row * 30 + 15) * scale),
          ReceiptOcrPoint(x: left, y: (row * 30 + 15) * scale),
        ],
      ),
    );
  }

  add('Example Market', 0, 20, 380);
  add('Description', 1, 20, 150);
  add('Usage', 1, 170, 210);
  add('Rate', 1, 230, 270);
  add('Amount', 1, 310, 350);
  add('Tea', 2, 20, 150);
  add('3', 2, 170, 210);
  add('1.00', 2, 230, 270);
  add('USD', 2, 280, 305);
  add('3.00', 2, 310, 350);
  if (secondMarker) add(marker, 2, 355, 380);
  add('Total USD 3.00', 3, 20, 380);
  blocks.sort((a, b) {
    final row = a.row.compareTo(b.row);
    return row != 0 ? row : a.points.first.x.compareTo(b.points.first.x);
  });
  final ordered = [
    for (var i = 0; i < blocks.length; i++)
      ReceiptOcrBlockEvidence(
        text: blocks[i].text,
        row: blocks[i].row,
        order: i,
        confidence: blocks[i].confidence,
        points: blocks[i].points,
      ),
  ];
  final rows = <int, List<String>>{};
  for (final b in ordered) {
    (rows[b.row] ??= []).add(b.text);
  }
  return const ReceiptOcrParser().parse(
    rows.values.map((row) => row.join(' ')).join('\n'),
    blocks: ordered,
  );
}

void main() {
  test('control: a single generic named-month date remains usable', () {
    final p = _dated(['Date: May 1, 2025']);
    expect(p.receiptDate, '2025-05-01');
    expect(p.warnings, isNot(contains(contains('receipt dates'))));
  });
  test('control: repeated identical named-month dates corroborate', () {
    final p = _dated(['Date: May 1, 2025', 'Date: May 1, 2025']);
    expect(p.receiptDate, '2025-05-01');
    expect(p.warnings, isNot(contains(contains('receipt dates'))));
  });
  test('control: conflicting generic numeric dates stay unresolved', () {
    final p = _dated(['Date: 2025-05-01', 'Date: 2025-05-02']);
    expect(p.receiptDate, isNull);
    expect(p.warnings, contains(contains('receipt dates')));
  });
  test('P2: conflicting generic named-month dates stay unresolved', () {
    final p = _dated(['Date: May 1, 2025', 'Date: May 2, 2025']);
    expect(p.receiptDate, isNull);
    expect(p.warnings, contains(contains('receipt dates')));
  });
  test('control: one nearby currency marker retains a charge-table item', () {
    final p = _table();
    expect(p.items.map((item) => item.description), ['Tea']);
    expect(p.items.single.currency, 'USD');
    expect(p.items.single.lineTotal, '3.00');
    expect(p.adjustmentsComplete, isTrue);
  });
  test('control: conflicting nearby table markers remain ambiguous', () {
    final p = _table(secondMarker: true, marker: 'EUR');
    expect(p.items, isEmpty);
    expect(p.adjustmentsComplete, isFalse);
    expect(p.reviewHints, isNotEmpty);
  });
  test('P2: repeated matching nearby markers retain the charge-table item', () {
    final p = _table(secondMarker: true);
    expect(p.items.map((item) => item.description), ['Tea']);
    expect(p.items.single.currency, 'USD');
    expect(p.items.single.lineTotal, '3.00');
    expect(p.items.single.currencyUnresolved, isFalse);
    expect(p.adjustmentsComplete, isTrue);
  });
  for (final label in ['Date', 'Datum', 'Fecha', 'Date / Fecha', '日付']) {
    for (final reverse in [false, true]) {
      test(
        'whole named date conflict is order independent: $label,$reverse',
        () {
          final dates = ['$label: September 17, 2026', '$label: Sep. 18 2026.'];
          final p = _dated(reverse ? dates.reversed.toList() : dates);
          expect(p.receiptDate, isNull);
          expect(p.warnings, contains(contains('receipt dates')));
        },
      );
    }
    test('same named/numeric date corroborates: $label', () {
      final p = _dated(['$label: September 17, 2026', '$label: 2026-09-17']);
      expect(p.receiptDate, '2026-09-17');
      expect(p.warnings, isNot(contains(contains('receipt dates'))));
    });
  }
  for (final value in [
    'Due Date: May 2, 2025',
    'Previous Date: May 2, 2025',
    'Stay: May 2, 2025',
    'Calendar May 2, 2025 USD 3.00',
    'Date: May 2, 2025 USD 3.00',
    'Date: February 30, 2025',
  ]) {
    test(
      'secondary or incomplete named field is not conflicting document evidence: $value',
      () {
        final p = _dated(['Date: May 1, 2025', value]);
        expect(p.receiptDate, '2025-05-01');
        expect(p.warnings, isNot(contains(contains('receipt dates'))));
      },
    );
  }
  test(
    'wrapped due role remains separate from the generic named date field',
    () {
      final p = _dated(['Date: May 1, 2025', 'Due', 'Date: May 2, 2025']);
      expect(p.receiptDate, '2025-05-01');
      expect(p.warnings, isNot(contains(contains('receipt dates'))));
    },
  );
  for (final mirrored in [false, true]) {
    for (final scale in [1.0, 2.0]) {
      for (final marker in ['USD', 'usd', r'$']) {
        test(
          'matching table currencies retain ownership: $marker,$mirrored,$scale',
          () {
            final p = _table(
              secondMarker: true,
              marker: marker,
              mirrored: mirrored,
              scale: scale,
            );
            expect(p.items.map((item) => item.description), ['Tea']);
            expect(p.items.single.currency, 'USD');
            expect(p.items.single.lineTotal, '3.00');
            expect(p.items.single.currencyUnresolved, isFalse);
            expect(p.adjustmentsComplete, isTrue);
            expect(p.reviewHints, isEmpty);
          },
        );
      }
      for (final marker in ['EUR', 'JPY', 'KWD', '₿', 'USD/EUR']) {
        test(
          'conflicting table currencies retain ambiguity: $marker,$mirrored,$scale',
          () {
            final p = _table(
              secondMarker: true,
              marker: marker,
              mirrored: mirrored,
              scale: scale,
            );
            expect(p.items, isEmpty);
            expect(p.adjustmentsComplete, isFalse);
            expect(p.reviewHints, isNotEmpty);
            expect(p.blocks.map((b) => b.text), contains(marker));
          },
        );
      }
    }
  }
}
