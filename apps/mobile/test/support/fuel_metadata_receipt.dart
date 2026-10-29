import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

List<ReceiptOcrBlockEvidence> receipt({
  String merchant = 'GARDEN FUEL STOP',
  String pump = '7',
  String volumeLabel = 'GALLONS',
  String volume = '12.500',
  String rate = 'USD 3.200',
  String rateLabel = 'PRICE/GAL',
  String heading = 'Payment Method',
  String card = 'Mastercard  1234',
  String approval = 'APPROVED',
  String referenceText = 'AUTH # 543210',
  String closing = 'Drive safe.',
  bool omitRate = false,
  bool extraPurchase = false,
  bool extraFooterPrice = false,
  bool weakGeometry = false,
  double scale = 1,
  double dx = 0,
}) {
  final rows = <List<String>>[
    [merchant],
    ['10 Meadow Road'],
    ['Sample City, OR 97000'],
    ['(555) 010-2323'],
    ['DATE', '2026-02-11 12:30'],
    ['PUMP', pump],
    ['FUEL', 'Regular Unleaded'],
    [volumeLabel, volume],
    if (!omitRate) [rateLabel, rate],
    if (extraPurchase) ['Water Pump', 'USD 5.00'],
    ['TOTAL', 'USD 40.00'],
    [heading],
    [card],
    [approval, referenceText],
    ['Thank you!'],
    [closing],
  ];
  final blocks = <ReceiptOcrBlockEvidence>[];
  for (var row = 0; row < rows.length; row++) {
    final parts = rows[row];
    final y = row * 32.0 + (row >= rows.length - 5 ? 12 : 0);
    for (var col = 0; col < parts.length; col++) {
      final footer = row >= rows.length - 2;
      final x = footer ? 100.0 : (col == 0 ? 10.0 : 180.0);
      final width = footer ? 150.0 : (parts.length == 1 ? 230.0 : 140.0);
      blocks.add(
        ReceiptOcrBlockEvidence(
          text: parts[col],
          row: row,
          order: blocks.length,
          confidence: weakGeometry && row == rows.length - 5 ? 0.4 : 0.99,
          points: [
            ReceiptOcrPoint(x: dx + x * scale, y: y * scale),
            ReceiptOcrPoint(x: dx + (x + width) * scale, y: y * scale),
            ReceiptOcrPoint(x: dx + (x + width) * scale, y: (y + 20) * scale),
            ReceiptOcrPoint(x: dx + x * scale, y: (y + 20) * scale),
          ],
        ),
      );
    }
  }
  if (extraFooterPrice) {
    final y = (rows.length - 2) * 32.0 + 12;
    blocks.add(
      ReceiptOcrBlockEvidence(
        text: 'USD 5.00',
        row: rows.length - 2,
        order: blocks.length,
        confidence: 0.99,
        points: [
          ReceiptOcrPoint(x: dx + 255 * scale, y: y * scale),
          ReceiptOcrPoint(x: dx + 320 * scale, y: y * scale),
          ReceiptOcrPoint(x: dx + 320 * scale, y: (y + 20) * scale),
          ReceiptOcrPoint(x: dx + 255 * scale, y: (y + 20) * scale),
        ],
      ),
    );
  }
  return blocks;
}

ReceiptOcrPreview parse(List<ReceiptOcrBlockEvidence> blocks) {
  final rows = <int, List<String>>{};
  for (final block in blocks) {
    (rows[block.row] ??= []).add(block.text);
  }
  return const ReceiptOcrParser().parse(
    rows.values.map((parts) => parts.join(' ')).join('\n'),
    blocks: blocks,
    fallbackCurrency: 'USD',
  );
}

List<ReceiptOcrBlockEvidence> transform(
  List<ReceiptOcrBlockEvidence> blocks,
  bool Function(ReceiptOcrBlockEvidence) select, {
  double? confidence,
  bool missingConfidence = false,
  List<ReceiptOcrPoint> Function(List<ReceiptOcrPoint>)? points,
}) => [
  for (final block in blocks)
    if (!select(block))
      block
    else
      ReceiptOcrBlockEvidence(
        text: block.text,
        row: block.row,
        order: block.order,
        confidence: missingConfidence ? null : (confidence ?? block.confidence),
        points: points?.call(block.points) ?? block.points,
      ),
];

List<ReceiptOcrBlockEvidence> withDetachedPanelCell({
  required int targetRow,
  bool left = false,
  double scale = 1,
  double dy = 0,
}) {
  final blocks = receipt(scale: scale);
  final output = <ReceiptOcrBlockEvidence>[];
  final x = left ? -50.0 : 325.0;
  final y = targetRow * 32.0 + (targetRow >= 10 ? 12 : 0) + dy;
  for (final block in blocks) {
    if (block.row == 5 && !output.any((b) => b.row == 5)) {
      output.add(
        ReceiptOcrBlockEvidence(
          text: 'USD 5.00',
          row: 5,
          order: output.length,
          confidence: 0.99,
          points: [
            ReceiptOcrPoint(x: x * scale, y: y * scale),
            ReceiptOcrPoint(x: (x + 55) * scale, y: y * scale),
            ReceiptOcrPoint(x: (x + 55) * scale, y: (y + 20) * scale),
            ReceiptOcrPoint(x: x * scale, y: (y + 20) * scale),
          ],
        ),
      );
    }
    output.add(
      ReceiptOcrBlockEvidence(
        text: block.text,
        row: block.row < 5 ? block.row : block.row + 1,
        order: output.length,
        confidence: block.confidence,
        points: block.points,
      ),
    );
  }
  return output;
}
