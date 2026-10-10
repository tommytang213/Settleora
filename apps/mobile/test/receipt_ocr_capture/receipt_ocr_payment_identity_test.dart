import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_repository.dart';

ReceiptOcrPreview parsePayment(String payment, {bool layout = false}) {
  final lines = ['Corner Market', 'Tea USD 7.00', 'Total USD 7.00', payment];
  final blocks = <ReceiptOcrBlockEvidence>[];
  if (layout) {
    for (var row = 0; row < lines.length; row++) {
      blocks.add(
        ReceiptOcrBlockEvidence(
          text: lines[row],
          row: row,
          order: row,
          confidence: 0.95,
          points: [
            ReceiptOcrPoint(x: 20, y: 20.0 + row * 40),
            ReceiptOcrPoint(x: 320, y: 20.0 + row * 40),
            ReceiptOcrPoint(x: 320, y: 40.0 + row * 40),
            ReceiptOcrPoint(x: 20, y: 40.0 + row * 40),
          ],
        ),
      );
    }
  }
  return const ReceiptOcrParser().parse(lines.join('\n'), blocks: blocks);
}

void main() {
  for (final layout in [false, true]) {
    for (final row in [
      'Debit · 6789 USD 7.00',
      'Debit ••••6789 7.00',
      'Credit ****6789 USD 7.00',
      'Credit ****6789 7.00 USD',
      'Credit ****6789 USD 7.00 USD',
      r'Credit ****6789 US$7.00',
      r'Credit ****6789 $7.00 USD',
      r'Credit ****6789 USD 7.00$',
      'Credit ****6789 EUR 7.00 €',
      'PAID WITH: Visa •●●.● 9191',
      'Paid with Mastercard **** 9191 USD 7.00',
      'Refund to VISA ****1234',
      'APPROVED AUTH # 293847',
      'APPROVED AUTH#293847',
      'APPROVED AUTH:293847',
      'Approved Authorization # A29384',
    ]) {
      test('payment identity is not a purchase: $row (layout $layout)', () {
        final p = parsePayment(row, layout: layout);
        expect(p.items.map((i) => [i.description, i.lineTotal]).toList(), [
          ['Tea', '7.00'],
        ]);
        expect(p.total, '7.00');
        expect(p.currency, 'USD');
        expect(p.incompleteAdjustmentReasons, isEmpty);
        expect(p.reviewHints, isEmpty);
        expect(p.blocks.length, layout ? 4 : 0);
        if (layout) expect(p.blocks.last.text, row);
      });
    }
    for (final amount in [
      'USD 7.00 EUR',
      'EUR 7.00 USD',
      r'7.00$€',
      r'$€7.00',
      r'USD 7.00€',
      r'€7.00 USD',
      r'7.00 USD$',
      'USD 7.00 XYZ',
    ]) {
      test(
        'conflicting payment currency stays unresolved: $amount layout=$layout',
        () {
          final row = 'Credit ****6789 $amount';
          final p = parsePayment(row, layout: layout);
          expect(p.adjustmentsComplete, isFalse);
          expect(p.reviewHints, isNotEmpty);
          expect(p.total, '7.00');
          final saved = receiptOcrReviewSaveRequestFromPreview(
            p,
            originalCurrency: p.currency,
          );
          expect(saved, isNotNull);
          expect(saved!.status, ReceiptOcrReviewStatusValues.provisional);
          expect(
            saved.taxReconciliationMode,
            ReceiptOcrTaxReconciliationModeValues.unresolved,
          );
          if (layout) expect(p.blocks.last.text, row);
        },
      );
    }
    for (final row in [
      'Approved author1234',
      'Approved authority6543',
      'Approved authentic7',
      'Approved auth1234',
      'Approved authorizationCode1234',
    ]) {
      test(
        'authorization label requires a boundary: $row (layout $layout)',
        () {
          final p = parsePayment(row, layout: layout);
          expect(p.items.single.description, 'Tea');
          expect(p.total, '7.00');
          expect(
            p.incompleteAdjustmentReasons,
            contains(
              ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine,
            ),
          );
          expect(p.reviewHints, isNotEmpty);
          if (layout) expect(p.blocks.last.text, row);
        },
      );
    }
    for (final row in [
      'Debit processing fee USD 4.00',
      'Credit manual USD 4.00',
      'Debit notes 6789 USD 4.00',
      'Paid with Visa guide USD 4.00',
      'Approved author collection USD 4.00',
      'Debit · 6789 extra USD 4.00',
      'Debit · 6789 USD 4.00 USD 5.00',
      'Debit · 67890 USD 4.00',
      'Debit 6789 USD 4.00',
      'Debit .6789 USD 4.00',
      'Debit · 6789X USD 4.00',
      'Debit · 67890',
      'Approved author label USD 4.00',
      'APPROVED AUTH # 293847 extra USD 4.00',
    ]) {
      test(
        'non-payment shape retains its priced row: $row (layout $layout)',
        () {
          final p = parsePayment(row, layout: layout);
          expect(p.items.length, 2);
          expect(
            p.items.last.lineTotal,
            row == 'Debit · 67890'
                ? '67890'
                : row.contains('5.00')
                ? '5.00'
                : '4.00',
          );
          expect(p.total, '7.00');
          expect(p.reviewHints, isNotEmpty);
          if (layout) expect(p.blocks.last.text, row);
        },
      );
    }
  }
}
