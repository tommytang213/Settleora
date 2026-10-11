import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

List<ReceiptOcrBlockEvidence> receipt({
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

ReceiptOcrPreview parse(List<ReceiptOcrBlockEvidence> blocks) {
  final rows = <int, List<String>>{};
  for (final block in blocks) {
    rows.putIfAbsent(block.row, () => []).add(block.text);
  }
  return const ReceiptOcrParser().parse(
    rows.values.map((row) => row.join(' ')).join('\n'),
    blocks: blocks,
  );
}

void main() {
  for (final scale in [0.5, 1.0, 3.0]) {
    for (final first in ['Grazie!', 'Merci!', 'Thank you!']) {
      test('complete paired footer $first scale $scale', () {
        final blocks = receipt(scale: scale, first: first);
        final preview = parse(blocks);
        expect(preview.items.single.description, 'Tea');
        expect(preview.items.single.lineTotal, '4.00');
        expect(preview.total, '4.00');
        expect(preview.adjustmentsComplete, isTrue);
        expect(preview.warnings, isEmpty);
        expect(preview.reviewHints, isEmpty);
        expect(preview.blocks, blocks);
      });
    }
    for (final mutation in [
      'missingTotal',
      'offCenter',
      'overTotal',
      'distant',
      'overlap',
      'weak',
      'competing',
    ]) {
      test('paired footer excludes $mutation scale $scale', () {
        final blocks = receipt(scale: scale, mutation: mutation);
        final preview = parse(blocks);
        expect(preview.adjustmentsComplete, isFalse);
        expect(preview.blocks, blocks);
      });
    }
    for (final first in [
      'Grazie Coffee',
      'Grazie discount',
      '+ Grazie',
      'Grazie 2',
    ]) {
      test('unknown footer content retained $first scale $scale', () {
        final blocks = receipt(scale: scale, first: first);
        final preview = parse(blocks);
        expect(preview.adjustmentsComplete, isFalse);
        expect(preview.blocks, blocks);
      });
    }
    test('priced courtesy remains an item scale $scale', () {
      final blocks = receipt(scale: scale, first: 'Grazie USD 1.00');
      final preview = parse(blocks);
      expect(preview.items.map((item) => item.description), ['Tea', 'Grazie']);
      expect(preview.items.last.lineTotal, '1.00');
      expect(preview.blocks, blocks);
    });
    for (final invalid in ['nan', 'crossed', 'duplicate', 'missing']) {
      test('invalid footer polygon $invalid scale $scale', () {
        final blocks = receipt(scale: scale);
        final old = blocks[3];
        final points = switch (invalid) {
          'nan' => [
            ReceiptOcrPoint(x: double.nan, y: old.points[0].y),
            ...old.points.skip(1),
          ],
          'crossed' => [
            old.points[0],
            old.points[2],
            old.points[1],
            old.points[3],
          ],
          'duplicate' => [
            old.points[0],
            old.points[1],
            old.points[1],
            old.points[3],
          ],
          _ => old.points.take(3).toList(),
        };
        blocks[3] = ReceiptOcrBlockEvidence(
          text: old.text,
          order: old.order,
          row: old.row,
          confidence: old.confidence,
          points: points,
        );
        final preview = parse(blocks);
        expect(preview.adjustmentsComplete, isFalse);
        expect(preview.blocks, blocks);
      });
    }
    test('genuine surcharge review survives owned footer scale $scale', () {
      final initial = receipt(scale: scale);
      final blocks = <ReceiptOcrBlockEvidence>[
        ...initial.take(2),
        ReceiptOcrBlockEvidence(
          text: 'Surcharge USD 1.00',
          order: 2,
          row: 2,
          confidence: 0.99,
          points: [
            ReceiptOcrPoint(x: 100 * scale, y: 103 * scale),
            ReceiptOcrPoint(x: 500 * scale, y: 103 * scale),
            ReceiptOcrPoint(x: 500 * scale, y: 118 * scale),
            ReceiptOcrPoint(x: 100 * scale, y: 118 * scale),
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
      final preview = parse(blocks);
      expect(preview.adjustmentsComplete, isFalse);
      expect(preview.reviewHints, isNotEmpty);
      expect(preview.total, '4.00');
      expect(preview.blocks, blocks);
      expect(
        preview.incompleteAdjustmentReasons,
        isNot(
          contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
        ),
      );
    });
  }
}
