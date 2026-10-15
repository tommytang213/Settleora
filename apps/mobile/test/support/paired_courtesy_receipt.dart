import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

List<ReceiptOcrBlockEvidence> courtesyReceipt({
  double scale = 1,
  String first = 'Grazie!',
  String last = 'See you soon!',
  String mutation = '',
}) {
  final rows = <(String, double, double, double, double)>[
    ('Corner Outlet', 100, 0, 500, 40),
    ('Tea USD 4.00', 100, 60, 500, 100),
    (
      mutation == 'missingTotal' ? 'Reference USD 4.00' : 'Total USD 4.00',
      100,
      120,
      500,
      160,
    ),
    (
      first,
      mutation == 'offCenter' ? 450 : 140,
      mutation == 'overTotal'
          ? 140
          : mutation == 'distant'
          ? 800
          : 165,
      mutation == 'offCenter' ? 790 : 460,
      mutation == 'distant' ? 930 : 295,
    ),
    (
      last,
      210,
      mutation == 'overlap'
          ? 180
          : mutation == 'distant'
          ? 940
          : 285,
      390,
      mutation == 'overlap'
          ? 210
          : mutation == 'distant'
          ? 970
          : 315,
    ),
  ];
  final result = <ReceiptOcrBlockEvidence>[];
  for (var i = 0; i < rows.length; i++) {
    final (text, left, top, right, bottom) = rows[i];
    result.add(
      ReceiptOcrBlockEvidence(
        text: text,
        order: result.length,
        row: i,
        confidence: mutation == 'weak' && i == 3 ? 0.3 : 0.98,
        points: [
          ReceiptOcrPoint(x: left * scale, y: top * scale),
          ReceiptOcrPoint(x: right * scale, y: top * scale),
          ReceiptOcrPoint(x: right * scale, y: bottom * scale),
          ReceiptOcrPoint(x: left * scale, y: bottom * scale),
        ],
      ),
    );
  }
  if (mutation == 'competing') {
    result.insert(
      4,
      ReceiptOcrBlockEvidence(
        text: 'Offer',
        order: 4,
        row: 3,
        confidence: 0.98,
        points: [
          ReceiptOcrPoint(x: 470 * scale, y: 200 * scale),
          ReceiptOcrPoint(x: 520 * scale, y: 200 * scale),
          ReceiptOcrPoint(x: 520 * scale, y: 230 * scale),
          ReceiptOcrPoint(x: 470 * scale, y: 230 * scale),
        ],
      ),
    );
  }
  return result;
}

ReceiptOcrPreview parseCourtesy(List<ReceiptOcrBlockEvidence> blocks) {
  final rows = <int, List<String>>{};
  for (final block in blocks) {
    rows.putIfAbsent(block.row, () => []).add(block.text);
  }
  return const ReceiptOcrParser().parse(
    rows.values.map((row) => row.join(' ')).join('\n'),
    blocks: blocks,
  );
}

// The provider orders this detached cell before the total even though its
// polygon is physically beside the footer. Its side must not change ownership.
List<ReceiptOcrBlockEvidence> courtesyWithDetachedCell({
  required bool left,
  double scale = 1,
  String text = 'USD 1.00',
  String position = 'beside',
}) {
  final initial = courtesyReceipt(scale: scale);
  final phrase = initial[3];
  initial[3] = ReceiptOcrBlockEvidence(
    text: phrase.text,
    order: phrase.order,
    row: phrase.row,
    confidence: phrase.confidence,
    points: [
      ReceiptOcrPoint(x: 100 * scale, y: 165 * scale),
      ReceiptOcrPoint(x: 500 * scale, y: 165 * scale),
      ReceiptOcrPoint(x: 500 * scale, y: 295 * scale),
      ReceiptOcrPoint(x: 100 * scale, y: 295 * scale),
    ],
  );
  final top = position == 'above' ? 130.0 : 205.0;
  final bottom = position == 'above' ? 164.0 : 235.0;
  final nearLeft = position == 'gap' ? 85.0 : 99.0;
  final nearRight = position == 'gap' ? 515.0 : 501.0;
  return [
    ...initial.take(2),
    ReceiptOcrBlockEvidence(
      text: text,
      order: 2,
      row: 2,
      confidence: 0.99,
      points: [
        ReceiptOcrPoint(
          x: (left ? nearLeft - 59 : nearRight) * scale,
          y: top * scale,
        ),
        ReceiptOcrPoint(
          x: (left ? nearLeft : nearRight + 59) * scale,
          y: top * scale,
        ),
        ReceiptOcrPoint(
          x: (left ? nearLeft : nearRight + 59) * scale,
          y: bottom * scale,
        ),
        ReceiptOcrPoint(
          x: (left ? nearLeft - 59 : nearRight) * scale,
          y: bottom * scale,
        ),
      ],
    ),
    for (final old in initial.skip(2))
      ReceiptOcrBlockEvidence(
        text: old.text,
        order: old.order + 1,
        row: old.row + 1,
        confidence: old.confidence,
        points: old.points,
      ),
  ];
}
