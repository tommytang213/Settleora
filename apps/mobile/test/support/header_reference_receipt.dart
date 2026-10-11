import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

List<List<String>> headerReferenceRows({
  String currency = 'USD',
  String merchant = 'Maple Duty Trading',
  String venue = 'Riverside International Airport',
  String reference = 'Reference EUR EUR 11.00',
}) => [
  [merchant],
  if (venue.isNotEmpty) [venue],
  ['Date: 2026-10-03'],
  ['Tea Blend', '$currency 7.00'],
  ['Cookies', '$currency 5.00'],
  ['Total', '$currency 12.00'],
  if (reference.isNotEmpty) [reference],
  ['Thank you'],
];

List<ReceiptOcrBlockEvidence> headerReferenceBlocks(
  List<List<String>> rows, {
  double scale = 1,
  double shift = 0,
  bool prominent = true,
}) {
  final blocks = <ReceiptOcrBlockEvidence>[];
  for (var row = 0; row < rows.length; row++) {
    for (var part = 0; part < rows[row].length; part++) {
      final text = rows[row][part];
      final height = row == 0 && prominent ? 60.0 : 30.0;
      final width = part > 0 ? 170.0 : text.length * (row == 0 ? 20.0 : 15.0);
      final left = row == 0 || text == 'Thank you'
          ? 500 - width / 2
          : part > 0
          ? 790.0
          : 60.0;
      final top = 40 + row * 80.0;
      blocks.add(
        ReceiptOcrBlockEvidence(
          text: text,
          row: row,
          order: blocks.length,
          confidence: 0.98,
          points: [
            ReceiptOcrPoint(x: left * scale + shift, y: top * scale + shift),
            ReceiptOcrPoint(
              x: (left + width) * scale + shift,
              y: top * scale + shift,
            ),
            ReceiptOcrPoint(
              x: (left + width) * scale + shift,
              y: (top + height) * scale + shift,
            ),
            ReceiptOcrPoint(
              x: left * scale + shift,
              y: (top + height) * scale + shift,
            ),
          ],
        ),
      );
    }
  }
  return blocks;
}

ReceiptOcrPreview parseHeaderReference(
  List<ReceiptOcrBlockEvidence> blocks, {
  bool layout = true,
}) {
  final rows = <int, List<String>>{};
  for (final b in blocks) {
    (rows[b.row] ??= []).add(b.text);
  }
  return const ReceiptOcrParser().parse(
    rows.values.map((r) => r.join(' ')).join('\n'),
    blocks: layout ? blocks : const [],
    fallbackCurrency: 'USD',
  );
}

List<ReceiptOcrBlockEvidence> headerReferenceDetachedMoneyBlocks({
  bool besideLocation = false,
  int logicalRow = 5,
  String amount = 'USD 2.00',
}) {
  final blocks = [
    for (final b in headerReferenceBlocks(
      headerReferenceRows(merchant: 'Riverside Tax Cafe'),
    ))
      ReceiptOcrBlockEvidence(
        text: b.text,
        row: b.row >= logicalRow ? b.row + 1 : b.row,
        order: b.order,
        confidence: b.confidence,
        points: b.points,
      ),
  ];
  final top = besideLocation ? 120.0 : 40.0;
  blocks.add(
    ReceiptOcrBlockEvidence(
      text: amount,
      row: logicalRow,
      order: blocks.length,
      confidence: 0.98,
      points: [
        ReceiptOcrPoint(x: 980, y: top),
        ReceiptOcrPoint(x: 1100, y: top),
        ReceiptOcrPoint(x: 1100, y: top + 30),
        ReceiptOcrPoint(x: 980, y: top + 30),
      ],
    ),
  );
  blocks.sort(
    (a, b) =>
        a.row == b.row ? a.order.compareTo(b.order) : a.row.compareTo(b.row),
  );
  return blocks;
}
