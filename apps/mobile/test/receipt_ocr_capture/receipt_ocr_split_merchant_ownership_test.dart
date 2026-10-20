import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrPreview _parse({
  String first = 'Coffee USD 3.00',
  String second = 'Tea USD 2.00',
  List<String> extraRows = const [],
  bool separateItems = false,
  double scale = 1,
  String issuerFirst = 'NORTH',
  String issuerSecond = 'MARKET',
  bool splitPrices = false,
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

  cell(issuerFirst, 0, 20, 140);
  if (splitPrices && !separateItems) {
    cell('Coffee', 0, 300, 420);
    cell('USD 3.00', 0, 500, 650);
  } else {
    cell(separateItems ? 'Receipt' : first, 0, 300, 650);
  }
  cell(issuerSecond, 1, 20, 140);
  if (splitPrices && !separateItems) {
    cell('Tea', 1, 300, 420);
    cell('USD 2.00', 1, 500, 650);
  } else if (!separateItems) {
    cell(second, 1, 300, 650);
  }
  var row = 2;
  if (separateItems) {
    cell(first, row++, 300, 650);
    cell(second, row++, 300, 650);
  }
  for (final text in extraRows) {
    cell(text, row++, 300, 650);
  }
  cell('Total USD 5.00', row++, 20, 650);
  cell('$issuerFirst $issuerSecond', row, 20, 220);
  cell('Phone 123-456-7890', row, 300, 650);
  final rows = <int, List<String>>{};
  for (final b in blocks) {
    (rows[b.row] ??= []).add(b.text);
  }
  final preview = const ReceiptOcrParser().parse(
    rows.values.map((r) => r.join(' ')).join('\n'),
    blocks: blocks,
  );
  expect(preview.blocks, blocks);
  return preview;
}

void main() {
  test('genuine split issuer with separate priced lines stays usable', () {
    final p = _parse(separateItems: true);
    expect(p.merchant, 'NORTH MARKET');
    expect(p.items.map((i) => [i.description, i.lineTotal, i.currency]), [
      ['Coffee', '3.00', 'USD'],
      ['Tea', '2.00', 'USD'],
    ]);
    expect(p.adjustmentsComplete, isTrue);
  });
  test('split merchant owns its blocks, not independent priced neighbors', () {
    final p = _parse();
    expect(p.merchant, 'NORTH MARKET');
    expect(p.items.map((i) => [i.description, i.lineTotal, i.currency]), [
      ['Coffee', '3.00', 'USD'],
      ['Tea', '2.00', 'USD'],
    ]);
    expect(p.adjustmentsComplete, isTrue);
  });
  for (final unpriced in ['BOTTLED WATER', 'Glass', 'Cafe Latte']) {
    test('unpriced adjacent item remains unresolved: $unpriced', () {
      final p = _parse(first: unpriced);
      expect(p.merchant, 'NORTH MARKET');
      expect(p.items.map((i) => [i.description, i.lineTotal]), [
        ['Tea', '2.00'],
      ]);
      expect(p.adjustmentsComplete, isFalse);
      expect(
        p.incompleteAdjustmentReasons,
        contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
      );
      expect(p.reviewHints, isNotEmpty);
    });
  }
  test('independent conflicting dates remain unresolved', () {
    final p = _parse(
      separateItems: true,
      extraRows: ['Date: May 1, 2025', 'Date: May 2, 2025'],
    );
    expect(p.receiptDate, isNull);
    expect(p.warnings, contains(contains('receipt dates')));
    expect(p.items, hasLength(2));
  });
  test('independent foreign currency never inherits the total currency', () {
    final p = _parse(separateItems: true, first: 'Coffee EUR 3.00');
    expect(p.items.first.currency, 'EUR');
    expect(p.items.first.lineTotal, '3.00');
    expect(p.total, '5.00');
    expect(p.reviewHints, isNotEmpty);
  });
  for (final scale in [.5, 1.0, 2.0]) {
    for (final name in [
      ('NORTH', 'MARKET'),
      ('RIVER', 'SUPPLIES'),
      ('SUNRISE', 'PROVISIONS'),
    ]) {
      for (final split in [false, true]) {
        test(
          'priced neighbors retain ownership $name scale=$scale split=$split',
          () {
            final p = _parse(
              scale: scale,
              issuerFirst: name.$1,
              issuerSecond: name.$2,
              splitPrices: split,
            );
            expect(p.merchant, '${name.$1} ${name.$2}');
            expect(
              p.items.map((i) => [i.description, i.lineTotal, i.currency]),
              [
                ['Coffee', '3.00', 'USD'],
                ['Tea', '2.00', 'USD'],
              ],
            );
            expect(p.adjustmentsComplete, isTrue);
          },
        );
      }
    }
  }
  for (final unpriced in ['BOTTLED WATER', 'Glass', 'Cafe Latte']) {
    test(
      'unpriced neighbor beside the second name remains unresolved: $unpriced',
      () {
        final p = _parse(second: unpriced);
        expect(p.items.map((i) => [i.description, i.lineTotal]), [
          ['Coffee', '3.00'],
        ]);
        expect(p.adjustmentsComplete, isFalse);
        expect(
          p.incompleteAdjustmentReasons,
          contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
        );
      },
    );
  }
  for (final foreign in ['EUR', 'JPY', 'CAD']) {
    test('mixed merchant row preserves foreign priced evidence $foreign', () {
      final value = foreign == 'JPY' ? '300' : '3.00';
      final p = _parse(first: 'Coffee $foreign $value');
      expect(p.items.first.description, 'Coffee');
      expect(p.items.first.currency, foreign);
      expect(p.items.first.lineTotal, value);
      expect(p.items.last.description, 'Tea');
      expect(p.reviewHints, isNotEmpty);
    });
  }
  for (final money in [
    'USD 3.00 EUR',
    'USD EUR 3.00',
    'KWD 3.000',
    'USD -3.00',
    '(USD 3.00)',
  ]) {
    test(
      'mixed row keeps conflicting or unsupported money reviewable: $money',
      () {
        final p = _parse(first: 'Coffee $money');
        expect(
          p.items.any((i) => i.description == 'Tea' && i.lineTotal == '2.00'),
          isTrue,
        );
        if (money == 'USD 3.00 EUR' || money == 'USD EUR 3.00') {
          expect(p.items.first.currency, isNull);
          expect(p.items.first.currencyUnresolved, isTrue);
        } else {
          expect(p.reviewHints, isNotEmpty);
        }
      },
    );
  }
  for (final date in [
    'Date: May 1, 2025',
    'Date: 2025-05-01',
    'Receipt Date: 2025-05-01',
  ]) {
    final other = date.replaceAll('1,', '2,').replaceAll('05-01', '05-02');
    test('independent mixed-row date conflicts stay unresolved: $date', () {
      final p = _parse(
        first: date,
        second: other,
        extraRows: ['Coffee USD 3.00', 'Tea USD 2.00'],
      );
      expect(p.receiptDate, isNull);
      expect(p.warnings, contains(contains('receipt dates')));
      expect(p.items.map((i) => i.description), ['Coffee', 'Tea']);
    });
  }
  test('matching mixed-row dates remain usable', () {
    final p = _parse(
      first: 'Date: May 1, 2025',
      second: 'Date: May 1, 2025',
      extraRows: ['Coffee USD 3.00', 'Tea USD 2.00'],
    );
    expect(p.receiptDate, '2025-05-01');
    expect(p.warnings, isNot(contains(contains('receipt dates'))));
    expect(p.items.map((i) => i.description), ['Coffee', 'Tea']);
  });
  test(
    'unpriced merchant neighbor cannot wrap into an independent priced row',
    () {
      final p = _parse(
        second: 'Bottled Spring Water',
        extraRows: ['Biscuit USD 2.00'],
      );
      expect(p.items.map((i) => i.description), ['Coffee', 'Biscuit']);
      expect(p.adjustmentsComplete, isFalse);
      expect(
        p.incompleteAdjustmentReasons,
        contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
      );
    },
  );
}
