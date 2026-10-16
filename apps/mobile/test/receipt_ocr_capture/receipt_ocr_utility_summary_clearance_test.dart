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

void main() {
  for (final scale in [.5, 1.0, 2.0]) {
    for (final afterCurrent in [false, true]) {
      for (final gap in [1.0, 9.0]) {
        for (final amount in ['USD 2.00', 'EUR 2.00', 'BHD 2.00', '2.00']) {
          test(
            'nearby detached amount stays reviewable scale=$scale after=$afterCurrent gap=$gap amount=$amount',
            () {
              final top = afterCurrent ? 160 + gap : 110 - gap - 20;
              final blocks = [..._panel(), _cell(amount, 9, 600, top, 120)]
                  .map(
                    (b) => _copy(
                      b,
                      points: [
                        for (final p in b.points)
                          ReceiptOcrPoint(
                            x: p.x * scale + 75,
                            y: p.y * scale + 35,
                          ),
                      ],
                    ),
                  )
                  .toList();
              final preview = _parse(blocks);
              expect(
                preview.itemLineDecisions[4],
                isNot(ReceiptOcrItemLineDecision.metadataOrHeaderSkipped),
              );
              expect(preview.adjustmentsComplete, isFalse);
              expect(preview.reviewHints, isNotEmpty);
              expect(
                preview.items.any(
                  (i) =>
                      i.description == 'Network Plan' && i.lineTotal == '18.00',
                ),
                isTrue,
              );
            },
          );
        }
      }
    }
    test('independently proven summary pairs may be close scale=$scale', () {
      final blocks = _panel()
          .map(
            (b) => _copy(
              b,
              points: [
                for (final p in b.points)
                  ReceiptOcrPoint(
                    x: p.x * scale + 75,
                    y: (p.y - (b.row == 4 ? 8 : 0)) * scale + 35,
                  ),
              ],
            ),
          )
          .toList();
      final preview = _parse(blocks);
      expect(
        preview.itemLineDecisions[4],
        ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
      );
      expect(preview.items.single.description, 'Network Plan');
      expect(preview.items.single.lineTotal, '18.00');
      expect(preview.total, '18.00');
    });
  }
}
