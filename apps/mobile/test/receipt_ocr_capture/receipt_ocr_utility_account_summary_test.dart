import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

// Synthetic account-summary panels. No native text, values or geometry copied.
ReceiptOcrBlockEvidence _cell(
  String text,
  int row,
  double left,
  double top,
  double width,
) => ReceiptOcrBlockEvidence(
  text: text,
  row: row,
  order: row * 10 + (left / 100).round(),
  confidence: .98,
  points: [
    ReceiptOcrPoint(x: left, y: top),
    ReceiptOcrPoint(x: left + width, y: top),
    ReceiptOcrPoint(x: left + width, y: top + 20),
    ReceiptOcrPoint(x: left, y: top + 20),
  ],
);

List<ReceiptOcrBlockEvidence> _panel({
  String label = 'Current Charges (details above)',
  String money = 'USD 18.00',
  String heading = 'Account Summary',
  String anchor = 'Balance Forward',
  String anchorMoney = 'USD 4.00',
}) => [
  _cell('Example Utility', 0, 20, 10, 280),
  _cell('Invoice date: 2026-06-18', 1, 20, 40, 350),
  _cell(heading, 2, 20, 80, 250),
  _cell(anchor, 3, 20, 110, 200),
  _cell(anchorMoney, 3, 600, 110, 120),
  _cell(label, 4, 20, 140, 400),
  _cell(money, 4, 600, 140, 120),
  _cell('Current Charges Detail', 5, 20, 190, 300),
  _cell('Description', 6, 20, 220, 200),
  _cell('Amount', 6, 600, 220, 120),
  _cell('Network Plan', 7, 20, 250, 220),
  _cell('USD 18.00', 7, 600, 250, 120),
  _cell('Total Current Charges', 8, 20, 290, 400),
  _cell('USD 18.00', 8, 600, 290, 120),
];

ReceiptOcrBlockEvidence _copy(
  ReceiptOcrBlockEvidence b, {
  String? text,
  List<ReceiptOcrPoint>? points,
}) => ReceiptOcrBlockEvidence(
  text: text ?? b.text,
  row: b.row,
  order: b.order,
  confidence: b.confidence,
  points: points ?? b.points,
);

ReceiptOcrPreview _parse(List<ReceiptOcrBlockEvidence> blocks) {
  final rows = <int, List<String>>{};
  for (final block in blocks) {
    (rows[block.row] ??= []).add(block.text);
  }
  final preview = const ReceiptOcrParser().parse(
    rows.values.map((row) => row.join(' ')).join('\n'),
    blocks: blocks,
  );
  expect(preview.blocks, blocks);
  return preview;
}

void _expectOwned(ReceiptOcrPreview preview) {
  expect(
    preview.itemLineDecisions[4],
    ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
  );
  expect(
    preview.incompleteAdjustmentReasons,
    isNot(contains(ReceiptOcrIncompleteAdjustmentReason.unretainedPricedItem)),
  );
  expect(
    preview.incompleteAdjustmentReasons,
    isNot(
      contains(
        ReceiptOcrIncompleteAdjustmentReason.unclassifiedAdjustmentLabel,
      ),
    ),
  );
  expect(preview.items.single.description, 'Network Plan');
  expect(preview.items.single.lineTotal, '18.00');
  expect(preview.items.single.currency, 'USD');
  expect(preview.items.single.quantity, isNull);
  expect(preview.items.single.unitPrice, isNull);
  expect(preview.total, '18.00');
  expect(preview.subtotal, isNull);
  expect(preview.tax, isNull);
  expect(preview.service, isNull);
  expect(preview.discount, isNull);
}

void _expectUnowned(List<ReceiptOcrBlockEvidence> blocks) {
  final preview = _parse(blocks);
  expect(
    preview.itemLineDecisions[4],
    isNot(ReceiptOcrItemLineDecision.metadataOrHeaderSkipped),
  );
  expect(preview.adjustmentsComplete, isFalse);
  expect(preview.incompleteAdjustmentReasons, isNotEmpty);
  expect(
    preview.items.any((item) => item.description == 'Network Plan'),
    isTrue,
  );
}

void main() {
  for (final label in [
    'Current Charges (details above)',
    'Current Charges (see details below)',
    'CURRENT CHARGES (SEE DETAIL ABOVE):',
    'current charges (detail below)',
  ]) {
    for (final scale in [.5, 1.0, 2.0]) {
      test('complete cross-reference summary $label scale=$scale', () {
        final blocks = _panel(label: label)
            .map(
              (b) => _copy(
                b,
                points: b.points
                    .map(
                      (p) => ReceiptOcrPoint(
                        x: p.x * scale + 75,
                        y: p.y * scale + 35,
                      ),
                    )
                    .toList(),
              ),
            )
            .toList();
        _expectOwned(_parse(blocks));
      });
    }
  }

  test('a matching printed symbol does not select a new currency', () {
    _expectOwned(_parse(_panel(money: r'$18.00', anchorMoney: r'$4.00')));
  });

  for (final label in [
    'Current Charges (tax included)',
    'Current Charges (details below plus fee)',
    'Current Charges (details below USD 2.00)',
    'Current Charges (details below 2)',
    'Current Charges (details below) Guide',
    'Current Charges (details below',
    'Current Charges details below)',
    'Current Charges ((details below))',
  ]) {
    test('unknown or incomplete annotation remains reviewable $label', () {
      _expectUnowned(_panel(label: label));
    });
  }

  for (final money in [
    'EUR 18.00',
    'BHD 18.00',
    'CAD 18.00',
    'USD 18.00 EUR',
    'USD 18.00 USD 2.00',
    'USD 18.00 notebook',
    'USD 18.00 -',
    '18%',
    'unreadable',
  ]) {
    test('conflicting or incomplete amount remains reviewable $money', () {
      _expectUnowned(_panel(money: money));
    });
  }

  for (final options in [
    (heading: 'Account overview', anchor: 'Balance Forward', money: 'USD 4.00'),
    (heading: 'Account Summary', anchor: 'Notebook', money: 'USD 4.00'),
    (heading: 'Account Summary', anchor: 'Balance Forward', money: 'EUR 4.00'),
    (
      heading: 'Account Summary',
      anchor: 'Balance Forward',
      money: 'unreadable',
    ),
  ]) {
    test('missing or conflicting panel evidence $options', () {
      _expectUnowned(
        _panel(
          heading: options.heading,
          anchor: options.anchor,
          anchorMoney: options.money,
        ),
      );
    });
  }

  for (final kind in [
    'missing',
    'crossed',
    'nonfinite',
    'flat',
    'misaligned',
    'overlap',
    'distant',
    'other column',
    'anchor overlap',
    'heading offset',
  ]) {
    test('unproven geometry remains reviewable $kind', () {
      final blocks = _panel().map((b) {
        final candidateMoney = b.row == 4 && b.text == 'USD 18.00';
        if (candidateMoney && kind == 'missing') return _copy(b, points: []);
        if (candidateMoney && kind == 'crossed') {
          return _copy(
            b,
            points: [b.points[0], b.points[2], b.points[1], b.points[3]],
          );
        }
        if (candidateMoney && kind == 'nonfinite') {
          return _copy(
            b,
            points: [
              const ReceiptOcrPoint(x: double.nan, y: 140),
              ...b.points.skip(1),
            ],
          );
        }
        double dx = 0;
        double dy = 0;
        if (candidateMoney && kind == 'misaligned') dy = 18;
        if (candidateMoney && kind == 'overlap') dx = -250;
        if (candidateMoney && kind == 'other column') dx = 100;
        if (b.row == 4 && kind == 'distant') dy = 200;
        if (b.row == 3 && kind == 'anchor overlap') dy = 15;
        if (b.row == 2 && kind == 'heading offset') dx = 100;
        return _copy(
          b,
          points: b.points
              .map(
                (p) => ReceiptOcrPoint(
                  x: p.x + dx,
                  y: candidateMoney && kind == 'flat' ? 140 : p.y + dy,
                ),
              )
              .toList(),
        );
      }).toList();
      _expectUnowned(blocks);
    });
  }

  test('geometry-free text does not acquire summary ownership', () {
    _expectUnowned(_panel().map((b) => _copy(b, points: [])).toList());
  });

  test('a third block on the same provider row remains unowned', () {
    final blocks = _panel();
    blocks.insert(7, _cell('USD 2.00', 4, 780, 140, 100));
    _expectUnowned(blocks);
  });

  test('a neighboring priced row inside the corridor blocks ownership', () {
    final blocks = [..._panel(), _cell('Adapter USD 3.00', 9, 450, 145, 120)];
    _expectUnowned(blocks);
    expect(_parse(blocks).items.any((i) => i.description == 'Adapter'), isTrue);
  });

  test('a separate priced column keeps its independently selected item', () {
    final blocks = [..._panel(), _cell('Notebook USD 3.00', 9, 780, 140, 200)];
    final preview = _parse(blocks);
    expect(
      preview.itemLineDecisions[4],
      ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
    );
    expect(preview.items.map((i) => i.description), [
      'Network Plan',
      'Notebook',
    ]);
    expect(preview.items.map((i) => i.lineTotal), ['18.00', '3.00']);
    expect(preview.total, '18.00');
  });

  test('an extra block on the anchor row cannot establish columns', () {
    final blocks = _panel();
    blocks.insert(5, _cell('Calendar note', 3, 780, 110, 180));
    _expectUnowned(blocks);
  });

  test('a total is not an account-summary heading', () {
    _expectUnowned(_panel(heading: 'Total USD 4.00'));
  });

  test('independently unresolved unpriced text still requires review', () {
    final preview = _parse([
      ..._panel(),
      _cell('Unpriced adapter', 9, 20, 330, 240),
    ]);
    _expectOwned(preview);
    expect(preview.adjustmentsComplete, isFalse);
    expect(
      preview.incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
    );
    expect(preview.reviewHints, isNotEmpty);
  });

  for (final number in [3, 20]) {
    test('numbered product remains a name $number', () {
      final preview = _parse(
        _panel()
            .map(
              (b) => b.text == 'Network Plan'
                  ? _copy(b, text: '$number Network Plan')
                  : b,
            )
            .toList(),
      );
      expect(preview.items.single.description, '$number Network Plan');
      expect(preview.items.single.quantity, isNull);
      expect(preview.items.single.unitPrice, isNull);
      expect(preview.items.single.lineTotal, '18.00');
    });
  }

  test('a summary amount supplies neither an item nor a missing total', () {
    final preview = _parse(_panel().where((b) => b.row < 5).toList());
    expect(
      preview.itemLineDecisions[4],
      ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
    );
    expect(preview.items, isEmpty);
    expect(preview.total, isNull);
    expect(preview.tax, isNull);
    expect(preview.service, isNull);
  });
}
