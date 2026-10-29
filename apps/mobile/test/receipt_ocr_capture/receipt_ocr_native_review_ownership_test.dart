import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

import '../support/paired_courtesy_receipt.dart';
import '../support/summary_role_receipt.dart';

void main() {
  for (final scale in [0.5, 1.0, 3.0]) {
    test('positive skewed summary ownership remains complete at $scale', () {
      final blocks = skewedSummaryBlocks(scale: scale);
      final preview = parseSummaryBlocks(blocks);
      expect(preview.items.map((item) => item.lineTotal), ['3.50', '6.50']);
      expect(preview.subtotal, '10.00');
      expect(preview.total, '10.00');
      expect(preview.adjustmentsComplete, isTrue);
      expect(preview.reviewHints, isEmpty);
      expect(preview.unresolvedItemLikeCount, 0);
      expect(preview.blocks, same(blocks));
    });

    test('positive paired footer ownership remains complete at $scale', () {
      final blocks = courtesyReceipt(scale: scale, first: 'Thank you!');
      final preview = parseCourtesy(blocks);
      expect(preview.items.single.lineTotal, '4.00');
      expect(preview.total, '4.00');
      expect(preview.adjustmentsComplete, isTrue);
      expect(preview.reviewHints, isEmpty);
      expect(preview.unresolvedItemLikeCount, 0);
    });

    for (final left in [false, true]) {
      for (final position in ['beside', 'gap', 'above']) {
        test('neighbor money is not footer-owned $scale/$left/$position', () {
          final blocks = courtesyWithDetachedCell(
            left: left,
            scale: scale,
            text: 'USD 1.00',
            position: position,
          );
          final preview = parseCourtesy(blocks);
          expect(preview.adjustmentsComplete, isFalse);
          expect(preview.reviewHints, isNotEmpty);
          expect(preview.total, '4.00');
        });
      }
    }
  }

  for (final footer in ['Thank you', 'Thank you!']) {
    for (final payment in [
      'VISA ****4321',
      'VISA ****4321 USD 10.00',
      'Cash USD 10.00',
    ]) {
      for (final clock in [
        '18:43',
        'Date: 2026-09-17 18:43',
        'Time Out: 18:43',
        'Date: 2026-09-17 Due Date: 2026-09-18',
      ]) {
        test(
          'owned payment/clock precedes centered footer: $footer/$clock/$payment',
          () {
            final preview = _paymentPreview(
              footer: footer,
              clock: clock,
              payment: payment,
            );
            expect(preview.items.single.lineTotal, '10.00');
            expect(preview.subtotal, '10.00');
            expect(preview.total, '10.00');
            expect(preview.adjustmentsComplete, isTrue);
            expect(preview.reviewHints, isEmpty);
            expect(preview.unresolvedItemLikeCount, 0);
          },
        );
      }
    }
  }

  for (final payment in [
    'VISA ****4321',
    'VISA ****4321 USD 10.00',
    'Cash USD 10.00',
  ]) {
    test('bounded payment without clock remains complete: $payment', () {
      final preview = _paymentPreview(payment: payment, clock: null);
      expect(preview.adjustmentsComplete, isTrue);
      expect(preview.reviewHints, isEmpty);
    });
  }

  for (final extra in ['Gift', '+ Extra foam', 'Thank you USD 2.00']) {
    test('courtesy does not hide a product or modifier: $extra', () {
      final preview = _paymentPreview(extra: extra);
      expect(preview.total, '10.00');
      expect(preview.reviewHints, isNotEmpty);
    });
  }

  for (final clock in [
    'Time Out: 18:43 USD 2.00',
    'Time Out: 18:43 Gift',
    'Time Out: 25:99',
    'Date: 2026-09-17 18:43 USD 2.00',
    'Date: 2026-02-30 18:43',
    'Date: 2026-09-17 Gift',
    'Date: 2026-09-17 Due Date: 2026-09-18 USD 2.00',
    'Date: 2026-09-17 Due Date: 2026-09-18 Gift',
    'Date: 2026-09-17 Due Date: 2026-02-30',
  ]) {
    test('clock prefix cannot hide unowned evidence: $clock', () {
      final preview = _paymentPreview(clock: clock);
      expect(preview.reviewHints, isNotEmpty);
    });
  }

  test('labeled clock does not invent payment context', () {
    final preview = _paymentPreview(payment: null, clock: 'Time Out: 18:43');
    expect(preview.reviewHints, isNotEmpty);
  });

  test('foreign item currency retains the existing review policy', () {
    final preview = _paymentPreview(item: 'Tea EUR 10.00');
    expect(preview.items.single.currency, 'EUR');
    expect(preview.currency, 'USD');
    expect(preview.reviewHints, isNotEmpty);
  });

  test('duplicate adjustment evidence remains incomplete', () {
    final preview = const ReceiptOcrParser().parse(
      'Synthetic Market\nTea USD 10.00\nSubtotal USD 10.00\n'
      'Tax USD 1.00\nTax USD 1.00\nTotal USD 11.00',
    );
    expect(preview.adjustmentsComplete, isFalse);
    expect(
      preview.incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.repeatedAdjustmentRole),
    );
    expect(preview.reviewHints, isNotEmpty);
  });

  test('conflicting summary currency cannot acquire positive ownership', () {
    final blocks = skewedSummaryBlocks(subtotal: 'USD 10.00 EUR');
    final preview = parseSummaryBlocks(blocks);
    expect(preview.reviewHints, isNotEmpty);
  });
}

ReceiptOcrPreview _paymentPreview({
  String footer = 'Thank you',
  String? clock = 'Date: 2026-09-17 18:43',
  String? payment = 'VISA ****4321',
  String item = 'Tea USD 10.00',
  String? extra,
}) {
  final rows = <String>[
    'Synthetic Market',
    'Date: 2026-09-17',
    item,
    'Subtotal USD 10.00',
    'Total USD 10.00',
    ?payment,
    ?clock,
    ?extra,
    footer,
  ];
  final blocks = <ReceiptOcrBlockEvidence>[
    for (var i = 0; i < rows.length; i++)
      summaryBlock(
        rows[i],
        i,
        i == rows.length - 1 ? 170 : 20,
        20.0 + i * 55,
        i == rows.length - 1 ? 180 : 480,
        30,
        slope: 0,
      ),
  ];
  return const ReceiptOcrParser().parse(rows.join('\n'), blocks: blocks);
}
