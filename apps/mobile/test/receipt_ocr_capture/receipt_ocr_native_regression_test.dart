import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

// Source-image transcriptions and mutations, not retained native OCR captures.
// They isolate generic label semantics without merchant-specific exceptions.
void main() {
  for (final mirrored in [false, true]) {
    for (final variant in [
      'caption',
      'money',
      'bare decimal',
      'compound financial',
      'same column',
      'no neighboring header',
      'missing geometry',
    ]) {
      test(
        'rated tax beside a separate panel: $variant mirrored=$mirrored',
        () {
          final blocks = <ReceiptOcrBlockEvidence>[];
          void cell(String text, int row, double left, double right) {
            if (mirrored) {
              final oldLeft = left;
              left = 1100 - right;
              right = 1100 - oldLeft;
            }
            blocks.add(
              ReceiptOcrBlockEvidence(
                text: text,
                row: row,
                order: blocks.length,
                points:
                    variant == 'missing geometry' && text == 'Your Water Usage'
                    ? []
                    : [
                        ReceiptOcrPoint(x: left, y: row * 35),
                        ReceiptOcrPoint(x: right, y: row * 35),
                        ReceiptOcrPoint(x: right, y: row * 35 + 20),
                        ReceiptOcrPoint(x: left, y: row * 35 + 20),
                      ],
              ),
            );
          }

          cell('Water Company', 0, 30, 250);
          cell('Bill Date: Aug 15, 2024', 1, 600, 850);
          cell('Charges for this period', 2, 600, 880);
          if (variant != 'no neighboring header') {
            cell('Meter Number', 3, 40, 160);
            cell('Previous Read', 3, 185, 300);
            cell('Current Read', 3, 310, 425);
            cell('Consumption', 3, 440, 550);
          }
          cell('Description', 3, 600, 720);
          cell('Amount', 3, 980, 1050);
          cell('Water Charge (25 m3 @ \$1.80)', 4, 600, 920);
          cell('\$45.00', 4, 980, 1050);
          cell('Sewer Charge (25 m3 @ \$2.10)', 5, 600, 920);
          cell('\$52.50', 5, 980, 1050);
          cell('Service Fee', 6, 600, 730);
          cell('\$8.00', 6, 980, 1050);
          final caption = switch (variant) {
            'money' => 'USD 7.00',
            'bare decimal' => '7.00',
            'compound financial' => 'Fee',
            _ => 'Your Water Usage',
          };
          cell(
            caption,
            7,
            variant == 'same column' ? 730 : 40,
            variant == 'same column' ? 965 : 300,
          );
          cell('State Water Tax (2.5%)', 7, 600, 875);
          cell('\$2.64', 7, 980, 1050);
          cell('Local Utility Tax (1.5%)', 8, 600, 875);
          cell('\$1.58', 8, 980, 1050);
          cell('Total Amount Due', 9, 600, 850);
          cell('\$109.72', 9, 980, 1050);
          final rows = <int, List<String>>{};
          for (final block in blocks) {
            (rows[block.row] ??= []).add(block.text);
          }
          final preview = const ReceiptOcrParser().parse(
            rows.values.map((row) => row.join(' ')).join('\n'),
            blocks: blocks,
            fallbackCurrency: 'USD',
          );
          if (variant == 'caption') {
            expect(preview.tax, '4.22');
          } else {
            expect(preview.tax, isNot('4.22'));
            // An in-column phrase may be an item name; it must not be
            // discarded to synthesize a tax component. Numeric/financial
            // conflicts and absent geometry remain incomplete adjustments.
            if (variant != 'same column') {
              expect(preview.adjustmentsComplete, isFalse);
            }
          }
          expect(preview.blocks, blocks);
        },
      );
    }
  }
  for (final summary in [
    'Current Charges USD 75.00',
    'Current Charges: USD 75.00',
    'CURRENT CHARGES 75.00 USD',
  ]) {
    test('one current-charge summary is not an unresolved fee: $summary', () {
      final preview = const ReceiptOcrParser().parse('''Water Company
Bill Date: 2026-09-17
Previous Balance USD 80.00
Payment Received USD -80.00
Water Usage USD 45.00
Sewer USD 30.00
$summary
Amount Due USD 75.00
Thank you''', fallbackCurrency: 'USD');
      expect(preview.total, '75.00');
      expect(preview.items.map((item) => item.lineTotal), ['45.00', '30.00']);
      expect(preview.adjustmentsComplete, isTrue);
      expect(preview.incompleteAdjustmentReasons, isEmpty);
    });
  }
  for (final summary in [
    'Current Charges and Fee USD 75.00',
    'Current Charges USD 75.00 USD 5.00',
    'Current Charges USD - 75.00',
    'Current Charges unknown USD 75.00',
    'Current Charges',
  ]) {
    test('incomplete or compound summary still requires review: $summary', () {
      final preview = const ReceiptOcrParser().parse('''Water Company
Bill Date: 2026-09-17
Water Usage USD 45.00
Sewer USD 30.00
$summary
Amount Due USD 75.00''', fallbackCurrency: 'USD');
      expect(preview.adjustmentsComplete, isFalse);
      expect(preview.incompleteAdjustmentReasons, isNotEmpty);
    });
  }
}
