import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

void main() {
  for (final scale in [0.5, 1.0, 2.0]) {
    for (final variant in [
      'complete address',
      'conflicting prior total',
      'agreeing prior total',
      'conflicting split prior total',
      'agreeing split prior total',
      'conflicting skewed prior total',
      'agreeing skewed prior total',
      'conflicting address prior total',
      'agreeing address prior total',
      'adjacent owned date',
      'adjacent zero-padded date',
      'invalid adjacent date',
      'priced adjacent date',
      'unlabeled adjacent date',
      'competing date cell',
      'misaligned date cell',
      'no postal line',
      'unknown prefix',
      'bare number',
      'priced street',
      'foreign street marker',
      'unknown region',
      'postal product',
      'misaligned postal',
      'distant postal',
      'overlapping columns',
      'nearby currency',
      'nearby amount',
      'competing total cell',
      'foreign total',
      'unresolved total marker',
      'bare total amount',
      'missing geometry',
      'invalid polygon',
    ]) {
      test('total beside address: $variant at scale $scale', () {
        final blocks = <ReceiptOcrBlockEvidence>[];
        void cell(
          String text,
          int row,
          double x,
          double y,
          double width, {
          bool broken = false,
        }) {
          final points = [
            ReceiptOcrPoint(x: x * scale, y: y * scale),
            ReceiptOcrPoint(x: (x + width) * scale, y: y * scale),
            ReceiptOcrPoint(x: (x + width) * scale, y: (y + 20) * scale),
            ReceiptOcrPoint(x: x * scale, y: (y + 20) * scale),
          ];
          blocks.add(
            ReceiptOcrBlockEvidence(
              text: text,
              row: row,
              order: blocks.length,
              points: broken
                  ? variant == 'invalid polygon'
                        ? [points[0], points[2], points[1], points[3]]
                        : []
                  : points,
            ),
          );
        }

        cell('Regional Services', 0, 20, 0, 220);
        cell('Bill Date 2026-08-09', 1, 20, 40, 220);
        cell('Maintenance USD 27.00', 2, 20, 80, 350);
        if (variant.contains('address prior')) {
          cell('456 Another Road', 3, 100, 120, 210);
        }
        final skewed = variant.contains('skewed prior');
        if (skewed) {
          cell('Subtotal', 3, 600, 120, 170);
          cell('USD 27.00', 30, 820, 120, 100);
        }
        // The incomplete printed total must remain evidence and keep review.
        cell('Grand Total', skewed ? 30 : 3, 600, skewed ? 146 : 120, 170);
        cell(
          variant.startsWith('conflicting')
              ? 'USD 29.00'
              : variant.startsWith('agreeing')
              ? 'USD 27.00'
              : 'unreadable',
          skewed
              ? 31
              : variant.contains('split prior')
              ? 30
              : 3,
          820,
          skewed || variant.contains('split prior') ? 146 : 120,
          100,
        );
        if (variant.contains('address prior')) {
          cell('Another City, CA 12345', 31, 100, 146, 230);
        }
        final street = switch (variant) {
          'unknown prefix' => 'Reference unknown',
          'bare number' => '40',
          'priced street' => '123 Example Drive USD 9.00',
          'foreign street marker' => '123 EUR Drive',
          _ => '123 Example Drive',
        };
        cell(
          street,
          4,
          100,
          200,
          variant == 'overlapping columns' ? 550 : 210,
          broken: variant == 'missing geometry' || variant == 'invalid polygon',
        );
        cell('Total Amount Due:', 4, 600, 205, 170);
        cell(
          switch (variant) {
            'foreign total' => 'EUR 27.00',
            'unresolved total marker' => '¥27.00',
            'bare total amount' => '27.00',
            _ => 'USD 27.00',
          },
          4,
          820,
          205,
          110,
        );
        if (variant != 'no postal line') {
          cell(
            switch (variant) {
              'unknown region' => 'Example City, QQ 12345',
              'postal product' => 'Example City, CA 12345 USD 4.00',
              _ => 'Example City, CA 12345',
            },
            5,
            variant == 'misaligned postal' ? 180 : 100,
            variant == 'distant postal' ? 300 : 226,
            230,
          );
        }
        if (variant == 'nearby currency') cell('EUR', 6, 333, 226, 35);
        if (variant == 'nearby amount') cell('9.00', 6, 333, 226, 40);
        if (variant == 'competing total cell') {
          cell('USD 9.00', 6, 785, 207, 80);
        }
        if (variant.contains('date')) {
          cell(
            variant == 'unlabeled adjacent date' ? 'Reference' : 'Due Date:',
            7,
            600,
            179,
            150,
          );
          cell(
            switch (variant) {
              'invalid adjacent date' => 'Feb 31, 2026',
              'adjacent zero-padded date' => 'Sep 05, 2026',
              'priced adjacent date' => 'Sep 10, 2026 USD 9.00',
              _ => 'Sep 10, 2026',
            },
            7,
            variant == 'misaligned date cell' ? 780 : 820,
            179,
            110,
          );
          if (variant == 'competing date cell') {
            cell('USD 9.00', 8, 775, 185, 80);
          }
        }
        final rows = <int, List<String>>{};
        for (final block in blocks) {
          (rows[block.row] ??= []).add(block.text);
        }
        final raw = rows.values.map((r) => r.join(' ')).join('\n');
        final preview = const ReceiptOcrParser().parse(
          raw,
          blocks: blocks,
          fallbackCurrency: 'USD',
        );
        final accepted =
            variant == 'complete address' ||
            variant == 'adjacent owned date' ||
            variant == 'adjacent zero-padded date';
        expect(
          preview.total,
          accepted || variant.startsWith('agreeing')
              ? '27.00'
              : variant.startsWith('conflicting') &&
                    !variant.contains('address prior')
              ? '29.00'
              : null,
        );
        final saved = receiptOcrReviewSaveRequestFromPreview(
          preview,
          originalCurrency: 'USD',
        )!;
        expect(saved.grandTotalAmount, preview.total);
        expect(preview.blocks, blocks);
        if (accepted) {
          expect(preview.adjustmentsComplete, isFalse);
          expect([...preview.warnings, ...preview.reviewHints], isNotEmpty);
        }
        if (variant.startsWith('conflicting')) {
          expect([...preview.warnings, ...preview.reviewHints], isNotEmpty);
        }
      });
    }
  }
}
