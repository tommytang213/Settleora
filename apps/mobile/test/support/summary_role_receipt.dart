import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrBlockEvidence summaryBlock(
  String text,
  int row,
  double x,
  double y,
  double width,
  double height, {
  double slope = 0.04,
  double scale = 1,
}) => ReceiptOcrBlockEvidence(
  text: text,
  row: row,
  order: row,
  confidence: 0.97,
  modelPackId: 'synthetic-summary-test',
  modelVersion: '1',
  textDirection: 'ltr',
  points: [
    ReceiptOcrPoint(x: x * scale, y: y * scale),
    ReceiptOcrPoint(x: (x + width) * scale, y: (y + width * slope) * scale),
    ReceiptOcrPoint(
      x: (x + width) * scale,
      y: (y + width * slope + height) * scale,
    ),
    ReceiptOcrPoint(x: x * scale, y: (y + height) * scale),
  ],
);

List<ReceiptOcrBlockEvidence> skewedSummaryBlocks({
  String subtotal = 'USD 10.00',
  String total = 'USD 10.00',
  String label = 'Subtotal',
  double scale = 1,
  double amountOffset = 0,
}) => [
  summaryBlock('Corner Market', 0, 20, 20, 250, 30, scale: scale),
  summaryBlock('Date: 2026-09-17', 1, 20, 65, 250, 30, scale: scale),
  summaryBlock('Tea USD 3.50', 2, 20, 110, 280, 30, scale: scale),
  summaryBlock('Bread USD 6.50', 3, 20, 155, 280, 30, scale: scale),
  summaryBlock(label, 4, 20, 205, 120, 30, scale: scale),
  summaryBlock('Total', 5, 20, 260, 85, 35, scale: scale),
  summaryBlock(subtotal, 5, 650, 230.2 + amountOffset, 150, 30, scale: scale),
  summaryBlock(total, 6, 650, 285.2 + amountOffset, 150, 35, scale: scale),
  summaryBlock('Thank you', 7, 320, 350, 180, 30, scale: scale),
];

String summaryText(List<ReceiptOcrBlockEvidence> blocks) {
  final rows = <int, List<String>>{};
  for (final block in blocks) {
    (rows[block.row] ??= []).add(block.text);
  }
  return rows.values.map((row) => row.join(' ')).join('\n');
}

ReceiptOcrPreview parseSummaryBlocks(List<ReceiptOcrBlockEvidence> blocks) =>
    const ReceiptOcrParser().parse(summaryText(blocks), blocks: blocks);

ReceiptOcrPreview joinedServicePreview({String amount = 'USD 1.00'}) =>
    const ReceiptOcrParser().parse('''
Corner Market
Tea USD 10.00
Subtotal USD 10.00
Service Charge10% $amount
Total USD 11.00
''');

ReceiptOcrPreview annotatedTaxItemPreview({String firstCurrency = 'EUR'}) =>
    const ReceiptOcrParser().parse('''
Corner Market
Tea VAT 5% item $firstCurrency 20.00
Book VAT 20% product EUR 15.00
Subtotal EUR 35.00
VAT 5% EUR 1.00
VAT 20% EUR 3.00
Total EUR 39.00
''');
