import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

List<ReceiptOcrBlockEvidence> brandCopyBlocks({
  String? caption,
  List<String> footer = const [],
  bool address = true,
  bool postal = true,
  bool payment = true,
  bool barcode = false,
  List<String> beforeItems = const [],
  List<String> afterItems = const [],
  List<String> afterTotal = const [],
  double captionLeft = 300,
  double footerLeft = 200,
  double confidence = 0.98,
  double logoHeight = 90,
  double scale = 1,
}) {
  final blocks = <ReceiptOcrBlockEvidence>[];
  var y = 80.0;
  void add(String text, double x, double width, double height) {
    final row = blocks.length;
    blocks.add(
      ReceiptOcrBlockEvidence(
        text: text,
        row: row,
        order: row,
        confidence: confidence,
        points: [
          ReceiptOcrPoint(x: x * scale, y: y * scale),
          ReceiptOcrPoint(x: (x + width) * scale, y: y * scale),
          ReceiptOcrPoint(x: (x + width) * scale, y: (y + height) * scale),
          ReceiptOcrPoint(x: x * scale, y: (y + height) * scale),
        ],
      ),
    );
    y += height + 18;
  }

  add('Oak Lantern Market', 280, 440, logoHeight);
  if (caption != null) add(caption, captionLeft, 400, 35);
  y += 16;
  if (address) {
    add('82 Elm Avenue', 360, 280, 40);
    if (postal) add('Brookvale, MA 02140', 320, 360, 40);
    add('(555) 222-9900', 365, 270, 40);
  }
  add('Date: 2026-09-18', 300, 400, 40);
  y += 25;
  for (final line in beforeItems) {
    add(line, 120, 250, 40);
  }
  add('Tea USD 3.50', 120, 760, 40);
  add('Bread USD 6.50', 120, 760, 40);
  for (final line in afterItems) {
    add(line, 120, 250, 40);
  }
  add('Subtotal USD 10.00', 120, 760, 40);
  add('Tax USD 1.00', 120, 760, 40);
  add('Total USD 11.00', 120, 760, 50);
  if (payment) add('Card **** 4422 USD 11.00', 120, 760, 40);
  for (final line in afterTotal) {
    add(line, 120, 250, 40);
  }
  y += 30;
  for (final line in footer) {
    add(line, footerLeft, 600, 40);
  }
  if (barcode) {
    y += 80;
    add('812345678901', 370, 260, 40);
  }
  return blocks;
}

ReceiptOcrPreview parseBrandCopy(
  List<ReceiptOcrBlockEvidence> blocks, {
  bool layout = true,
}) => const ReceiptOcrParser().parse(
  blocks.map((b) => b.text).join('\n'),
  blocks: layout ? blocks : const [],
);
