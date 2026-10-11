import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

List<List<String>> modifierReceiptRows({String currency = 'USD'}) => [
  ['Orchard Counter'],
  ['Date: 2026-10-01'],
  ['Lunch Bowl', '$currency 9.00'],
  ['+ No dressing'],
  ['+ Brown rice'],
  ['+ Avocado', '$currency 1.50'],
  ['Lemonade', '$currency 2.50'],
  ['Subtotal', '$currency 13.00'],
  ['Tax', '$currency 1.30'],
  ['Total', '$currency 14.30'],
  ['Thank you'],
];

List<ReceiptOcrBlockEvidence> modifierReceiptBlocks(
  List<List<String>> rows, {
  double scale = 1,
  double shiftX = 0,
  double shiftY = 0,
}) {
  final blocks = <ReceiptOcrBlockEvidence>[];
  for (var i = 0; i < rows.length; i++) {
    for (var j = 0; j < rows[i].length; j++) {
      final text = rows[i][j];
      final left = j == 0
          ? (text == 'Thank you' ? 590 - text.length * 8.0 : 120.0)
          : j == rows[i].length - 1
          ? 930.0
          : 830.0;
      final width = j == 0
          ? text.length * 16.0
          : j == rows[i].length - 1
          ? 130.0
          : 80.0;
      final top = 80 + i * 52.0;
      blocks.add(
        ReceiptOcrBlockEvidence(
          text: text,
          row: i,
          order: blocks.length,
          confidence: 0.98,
          points: [
            ReceiptOcrPoint(x: left * scale + shiftX, y: top * scale + shiftY),
            ReceiptOcrPoint(
              x: (left + width) * scale + shiftX,
              y: top * scale + shiftY,
            ),
            ReceiptOcrPoint(
              x: (left + width) * scale + shiftX,
              y: (top + 32) * scale + shiftY,
            ),
            ReceiptOcrPoint(
              x: left * scale + shiftX,
              y: (top + 32) * scale + shiftY,
            ),
          ],
        ),
      );
    }
  }
  return blocks;
}

ReceiptOcrPreview parseModifierReceipt(
  List<ReceiptOcrBlockEvidence> blocks, {
  bool layout = true,
}) {
  final rows = <int, List<String>>{};
  for (final b in blocks) {
    (rows[b.row] ??= []).add(b.text);
  }
  return const ReceiptOcrParser().parse(
    rows.values.map((v) => v.join(' ')).join('\n'),
    blocks: layout ? blocks : const [],
    fallbackCurrency: 'USD',
  );
}

ReceiptOcrBlockEvidence changedModifierBlock(
  ReceiptOcrBlockEvidence b, {
  String? text,
  double? confidence,
  List<ReceiptOcrPoint>? points,
}) => ReceiptOcrBlockEvidence(
  text: text ?? b.text,
  row: b.row,
  order: b.order,
  confidence: confidence ?? b.confidence,
  points: points ?? b.points,
);
