import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_repository.dart';

import '../support/paired_courtesy_receipt.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

void main() {
  for (final scale in [0.5, 1.0, 3.0]) {
    for (final first in ['Grazie!', 'Merci!', 'Thank you!']) {
      test('complete paired footer $first scale $scale', () {
        final blocks = courtesyReceipt(scale: scale, first: first);
        final preview = parseCourtesy(blocks);
        expect(preview.items.single.description, 'Tea');
        expect(preview.items.single.lineTotal, '4.00');
        expect(preview.total, '4.00');
        expect(preview.adjustmentsComplete, isTrue);
        expect(preview.warnings, isEmpty);
        expect(preview.reviewHints, isEmpty);
        expect(preview.blocks, blocks);
        final saved = receiptOcrReviewSaveRequestFromPreview(
          preview,
          originalCurrency: preview.currency,
        );
        expect(saved?.taxReconciliationMode, isNull);
        expect(saved?.grandTotalAmount, '4.00');
      });
    }
    for (final left in [false, true]) {
      for (final text in ['USD 1.00', '1.00']) {
        for (final position in ['beside', 'gap', 'above']) {
          test('detached footer cell $left $text $position scale $scale', () {
            final blocks = courtesyWithDetachedCell(
              left: left,
              scale: scale,
              text: text,
              position: position,
            );
            final preview = parseCourtesy(blocks);
            expect(preview.adjustmentsComplete, isFalse);
            expect(preview.reviewHints, isNotEmpty);
            expect(preview.total, '4.00');
            expect(preview.items.single.description, 'Tea');
            expect(preview.items.single.lineTotal, '4.00');
            expect(preview.blocks, blocks);
            final saved = receiptOcrReviewSaveRequestFromPreview(
              preview,
              originalCurrency: preview.currency,
            );
            expect(saved, isNotNull);
            expect(
              saved!.taxReconciliationMode,
              ReceiptOcrTaxReconciliationModeValues.unresolved,
            );
            expect(saved.grandTotalAmount, '4.00');
            expect(saved.lines.single.lineTotalAmount, '4.00');
          });
        }
      }
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
        final blocks = courtesyReceipt(scale: scale, mutation: mutation);
        final preview = parseCourtesy(blocks);
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
        final blocks = courtesyReceipt(scale: scale, first: first);
        final preview = parseCourtesy(blocks);
        expect(preview.adjustmentsComplete, isFalse);
        expect(preview.blocks, blocks);
      });
    }
    test('priced courtesy remains an item scale $scale', () {
      final blocks = courtesyReceipt(scale: scale, first: 'Grazie USD 1.00');
      final preview = parseCourtesy(blocks);
      expect(preview.items.map((item) => item.description), ['Tea', 'Grazie']);
      expect(preview.items.last.lineTotal, '1.00');
      expect(preview.blocks, blocks);
    });
    for (final invalid in ['nan', 'crossed', 'duplicate', 'missing']) {
      test('invalid footer polygon $invalid scale $scale', () {
        final blocks = courtesyReceipt(scale: scale);
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
        final preview = parseCourtesy(blocks);
        expect(preview.adjustmentsComplete, isFalse);
        expect(preview.blocks, blocks);
      });
    }
    test('genuine surcharge review survives owned footer scale $scale', () {
      final initial = courtesyReceipt(scale: scale);
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
      final preview = parseCourtesy(blocks);
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
