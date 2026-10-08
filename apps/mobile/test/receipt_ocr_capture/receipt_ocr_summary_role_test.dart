import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_repository.dart';
import '../support/summary_role_receipt.dart';

void main() {
  for (final label in [
    'Service Charge10%',
    'Service Fee5%',
    'Services Charges2.5%',
    'Service10%',
  ]) {
    test('joined service percentage owns its monetary amount: $label', () {
      final p = const ReceiptOcrParser().parse(
        'Corner Market\nTea USD 10.00\nSubtotal USD 10.00\n$label USD 1.00\nTotal USD 11.00',
      );
      expect(p.service, '1.00');
      expect(p.serviceCurrency, 'USD');
      expect(p.serviceHasExplicitCurrencyEvidence, isTrue);
      expect(p.items.map((i) => i.description), ['Tea']);
      expect(p.adjustmentsComplete, isTrue);
      expect(p.reviewHints, isEmpty);
    });
  }
  for (final row in [
    'Service Charge10 kit USD 1.00',
    'Service Charge10% guide USD 1.00',
    'Service Chargeback10% USD 1.00',
    'Service Fee5 plan USD 1.00',
  ]) {
    test('service product wording does not become an adjustment: $row', () {
      final p = const ReceiptOcrParser().parse(
        'Corner Market\n$row\nSubtotal USD 1.00\nTotal USD 1.00',
      );
      expect(p.service, isNull);
      expect(p.items.single.lineTotal, '1.00');
      expect(p.items.single.description, startsWith('Service'));
    });
  }
  for (final row in [
    'Service Charge10% USD 1.00 EUR',
    'Service Charge10% USD 1.00 USD 2.00',
    'Service Charge10% - USD 1.00',
    'Service Charge10% and Tax USD 1.00',
    'Service Charge10%',
    'Service Charge10% USD 1.00\nService Fee5% USD 1.00',
  ]) {
    test('ambiguous service evidence remains unresolved: $row', () {
      final p = const ReceiptOcrParser().parse(
        'Corner Market\nTea USD 10.00\nSubtotal USD 10.00\n$row\nTotal USD 11.00',
      );
      final saved = receiptOcrReviewSaveRequestFromPreview(
        p,
        originalCurrency: 'USD',
      );
      expect(saved, isNotNull);
      expect(saved!.status, ReceiptOcrReviewStatusValues.provisional);
      expect(
        saved.taxReconciliationMode,
        ReceiptOcrTaxReconciliationModeValues.unresolved,
      );
      expect(p.reviewHints, isNotEmpty);
    });
  }
  for (final money in ['1.00 USD', 'USD 1.00 USD']) {
    test('joined service owns a complete bounded money cell: $money', () {
      final p = joinedServicePreview(amount: money);
      expect(p.service, '1.00');
      expect(p.adjustmentsComplete, isTrue);
      expect(p.reviewHints, isEmpty);
    });
  }
  for (final row in [
    'Service Charge10% USD 1.00 guide',
    'Service Fee5% USD 1.00 kit',
    'Services Charges2.5% USD 1.00 product',
    'Service10% USD 1.00 manual',
    'guide USD 1.00 Service Charge10%',
    'kit USD 1.00 Service Fee5%',
    'Service Charge10% USD1.00',
    'Service Charge10% USD-1.00',
    'Service Charge10% 1.00USD',
    'Service Charge10% USD1.00 USD',
  ]) {
    test('joined service retains unexplained text around money: $row', () {
      final p = const ReceiptOcrParser().parse(
        'Corner Market\nTea USD 10.00\nSubtotal USD 10.00\n$row\nTotal USD 11.00',
      );
      expect(p.service, isNull);
      expect(p.adjustmentsComplete, isFalse);
      expect(p.reviewHints, isNotEmpty);
      final saved = receiptOcrReviewSaveRequestFromPreview(
        p,
        originalCurrency: p.currency,
      );
      expect(saved!.status, ReceiptOcrReviewStatusValues.provisional);
      expect(
        saved.taxReconciliationMode,
        ReceiptOcrTaxReconciliationModeValues.unresolved,
      );
    });
  }
  for (final scale in [0.5, 1.0, 2.0]) {
    test(
      'unique skewed subtotal/total ownership is scale invariant: $scale',
      () {
        final blocks = skewedSummaryBlocks(scale: scale);
        final p = parseSummaryBlocks(blocks);
        expect(p.subtotal, '10.00');
        expect(p.total, '10.00');
        expect(p.subtotalCurrency, 'USD');
        expect(p.subtotalHasExplicitCurrencyEvidence, isTrue);
        expect(p.items.map((i) => i.description), ['Tea', 'Bread']);
        expect(p.adjustmentsComplete, isTrue);
        expect(p.reviewHints, isEmpty);
        expect(p.blocks, same(blocks));
        expect(p.blocks.map((b) => b.text), blocks.map((b) => b.text));
        expect(p.blocks[6].row, 5);
        expect(p.blocks[7].row, 6);
        expect(p.rawTextLineCount, 8);
      },
    );
  }
  test('geometry preserves unequal printed amounts instead of balancing', () {
    final p = parseSummaryBlocks(skewedSummaryBlocks(total: 'USD 12.00'));
    expect(p.subtotal, '10.00');
    expect(p.total, '12.00');
    expect(p.reviewHints, isNotEmpty);
  });
  for (final amount in ['0.00', '-10.00']) {
    test(
      'summary ownership preserves the printed amount and sign: $amount',
      () {
        final p = parseSummaryBlocks(
          skewedSummaryBlocks(subtotal: 'USD $amount', total: 'USD $amount'),
        );
        expect(p.subtotal, amount);
        expect(p.total, amount);
        expect(p.reviewHints, isNotEmpty);
      },
    );
  }
  test(
    'matching values without geometry do not establish subtotal ownership',
    () {
      final p = const ReceiptOcrParser().parse(
        summaryText(skewedSummaryBlocks()),
      );
      expect(p.subtotal, isNull);
    },
  );
  for (final money in [
    'EUR 10.00',
    'USD 10.00 EUR',
    'USD - 10.00',
    'USD 10.00 USD 9.00',
    'USD 10%',
    '10.00',
    'USD10.00',
    'USD-10.00',
    '10.00USD',
  ]) {
    test('skewed summary does not consume uncertain money: $money', () {
      final blocks = skewedSummaryBlocks(subtotal: money);
      final p = parseSummaryBlocks(blocks);
      expect(p.subtotal, isNull);
      expect(p.adjustmentsComplete, isFalse);
      expect(p.warnings, isNotEmpty);
      expect(
        receiptOcrReviewSaveRequestFromPreview(
          p,
          originalCurrency: p.currency,
        )!.taxReconciliationMode,
        ReceiptOcrTaxReconciliationModeValues.unresolved,
      );
      expect(p.blocks, same(blocks));
    });
  }
  for (final offset in [-55.0, 22.0, 55.0]) {
    test('misaligned amounts do not establish subtotal ownership: $offset', () {
      final p = parseSummaryBlocks(skewedSummaryBlocks(amountOffset: offset));
      expect(p.subtotal, isNull);
      expect(p.reviewHints, isNotEmpty);
    });
  }
  for (final invalid in ['missing', 'crossed', 'zero', 'nonfinite']) {
    test(
      'invalid quadrilateral cannot establish summary ownership: $invalid',
      () {
        final blocks = skewedSummaryBlocks();
        final b = blocks[6];
        blocks[6] = ReceiptOcrBlockEvidence(
          text: b.text,
          row: b.row,
          order: b.order,
          points: switch (invalid) {
            'missing' => [],
            'crossed' => [b.points[0], b.points[2], b.points[1], b.points[3]],
            'zero' => List.filled(4, b.points[0]),
            _ => [
              const ReceiptOcrPoint(x: double.nan, y: 0),
              ...b.points.skip(1),
            ],
          },
        );
        final p = parseSummaryBlocks(blocks);
        expect(p.subtotal, isNull);
        expect(p.reviewHints, isNotEmpty);
      },
    );
  }
  test('a competing fifth block in another provider row prevents recovery', () {
    final blocks = skewedSummaryBlocks()
      ..add(summaryBlock('USD 9.00', 8, 400, 220.2, 100, 30));
    final p = parseSummaryBlocks(blocks);
    expect(p.subtotal, isNull);
    expect(p.reviewHints, isNotEmpty);
    expect(p.blocks.last.text, 'USD 9.00');
  });
  test('unknown label suffix and unmatched text do not borrow an amount', () {
    final blocks = skewedSummaryBlocks(label: 'Subtotal estimate');
    expect(parseSummaryBlocks(blocks).subtotal, isNull);
    final good = skewedSummaryBlocks();
    final p = const ReceiptOcrParser().parse(
      '${summaryText(good)}\nUnknown note',
      blocks: good,
    );
    expect(p.subtotal, isNull);
    expect(p.reviewHints, isNotEmpty);
  });
  test('summary ownership does not hide an unpriced footer item', () {
    final blocks = skewedSummaryBlocks()
      ..add(summaryBlock('Mystery item', 8, 20, 430, 160, 30));
    final p = parseSummaryBlocks(blocks);
    expect(p.subtotal, '10.00');
    expect(p.adjustmentsComplete, isFalse);
    expect(
      p.incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
    );
    expect(p.blocks.last.text, 'Mystery item');
  });
  test(
    'a priced courtesy name remains a purchase after the recovered total',
    () {
      final blocks = skewedSummaryBlocks();
      blocks[8] = summaryBlock('Thank you USD 5.00', 7, 320, 350, 180, 30);
      final p = parseSummaryBlocks(blocks);
      expect(p.subtotal, '10.00');
      expect(p.items.map((item) => item.lineTotal), contains('5.00'));
      expect(p.reviewHints, isNotEmpty);
      expect(p.blocks[8].text, 'Thank you USD 5.00');
    },
  );
  test(
    'explicit tax annotation remains item evidence without a false warning',
    () {
      final p = annotatedTaxItemPreview();
      expect(p.items.map((i) => i.description), [
        'Tea VAT 5% item',
        'Book VAT 20% product',
      ]);
      expect(p.tax, '4.00');
      expect(p.taxIncludedInTotal, isFalse);
      expect(p.adjustmentsComplete, isTrue);
      expect(p.reviewHints, isEmpty);
    },
  );
  for (final row in [
    'Local VAT 5% charge EUR 20.00',
    'Service VAT 5% item EUR 20.00',
    'Tea VAT 5% item EUR 20.00 USD',
    'Tea VAT 5% item EUR 20.00 EUR 2.00',
    'Tea VAT 5% item - EUR 20.00',
    'Tea VAT 5% EUR 20.00',
    'Tea VAT 500% item EUR 20.00',
    'Tea 9.00 VAT 5% item EUR 20.00',
    'Tea USD VAT 5% item EUR 20.00',
    'Tea - VAT 5% item EUR 20.00',
    'Subtotal VAT 5% item EUR 20.00',
    'Tea VAT 5% item USD 20.00',
    'Tea VAT 5% item EUR20.00',
    'Tea VAT 5% item EUR-20.00',
    'Tea VAT 5% item 20.00EUR',
  ]) {
    test('tax annotation uncertainty keeps its review reason: $row', () {
      final p = const ReceiptOcrParser().parse(
        'Corner Market\n$row\nSubtotal EUR 20.00\nTotal EUR 20.00',
      );
      expect(p.adjustmentsComplete, isFalse);
      expect(p.reviewHints, isNotEmpty);
    });
  }
  for (final p in [
    joinedServicePreview(),
    parseSummaryBlocks(skewedSummaryBlocks()),
    annotatedTaxItemPreview(),
  ]) {
    test(
      'confident summary still saves only a provisional draft: ${p.service}/${p.tax}',
      () {
        final saved = receiptOcrReviewSaveRequestFromPreview(
          p,
          originalCurrency: p.currency,
        );
        expect(saved, isNotNull);
        expect(saved!.status, ReceiptOcrReviewStatusValues.provisional);
        expect(saved.taxReconciliationMode, isNull);
        expect(saved.subtotalAmount, p.subtotal);
        expect(saved.lines.length, p.items.length);
      },
    );
  }
}
