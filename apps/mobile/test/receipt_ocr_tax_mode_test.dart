import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_repository.dart';

void main() {
  test('included tax reconciles bounded same-currency tip or shipping', () {
    ReceiptOcrReviewSaveRequest candidate({
      required String subtotal,
      required String total,
      required String kind,
      String adjustmentCurrency = 'GBP',
      bool duplicate = false,
    }) {
      final adjustment = ReceiptOcrReviewAdjustmentSaveRequest(
        kind: kind,
        originalLabel: kind,
        amount: '2',
        currency: adjustmentCurrency,
        direction: ReceiptOcrReviewAdjustmentDirectionValues.charge,
      );
      return ReceiptOcrReviewSaveRequest(
        status: ReceiptOcrReviewStatusValues.provisional,
        source: ReceiptOcrReviewSourceValues.onDevice,
        merchantText: null,
        receiptIssuedAtUtc: null,
        currency: 'GBP',
        subtotalAmount: subtotal,
        taxAmount: '4',
        serviceChargeAmount: null,
        discountAmount: null,
        grandTotalAmount: total,
        lines: const [],
        adjustmentEvidence: [adjustment, if (duplicate) adjustment],
      );
    }

    expect(
      receiptOcrTaxModeFromSupportedEvidence(
        candidate(
          subtotal: '24',
          total: '26',
          kind: ReceiptOcrReviewAdjustmentKindValues.tip,
        ),
      ),
      ReceiptOcrTaxReconciliationModeValues.alreadyInBase,
    );
    expect(
      receiptOcrTaxModeFromSupportedEvidence(
        candidate(
          subtotal: '20',
          total: '26',
          kind: ReceiptOcrReviewAdjustmentKindValues.shipping,
        ),
      ),
      ReceiptOcrTaxReconciliationModeValues.addToBase,
    );
    expect(
      receiptOcrTaxModeFromSupportedEvidence(
        candidate(
          subtotal: '24',
          total: '26',
          kind: ReceiptOcrReviewAdjustmentKindValues.tip,
          adjustmentCurrency: 'EUR',
        ),
      ),
      ReceiptOcrTaxReconciliationModeValues.unresolved,
    );
    expect(
      receiptOcrTaxModeFromSupportedEvidence(
        candidate(
          subtotal: '24',
          total: '26',
          kind: ReceiptOcrReviewAdjustmentKindValues.tip,
          duplicate: true,
        ),
      ),
      ReceiptOcrTaxReconciliationModeValues.unresolved,
    );
  });

  test('saved additive tax cannot become included from edited arithmetic', () {
    final now = DateTime.utc(2026, 10, 2);
    final review = ReceiptOcrReviewDetail(
      id: 'review',
      billId: 'bill',
      fileId: 'file',
      groupId: null,
      status: ReceiptOcrReviewStatusValues.reviewed,
      source: ReceiptOcrReviewSourceValues.onDevice,
      merchantText: 'Cafe',
      receiptIssuedAtUtc: null,
      currency: 'USD',
      subtotalAmount: '20',
      taxAmount: '4',
      taxReconciliationMode: ReceiptOcrTaxReconciliationModeValues.addToBase,
      serviceChargeAmount: null,
      discountAmount: null,
      grandTotalAmount: '24',
      lines: const [],
      createdAtUtc: now,
      updatedAtUtc: now,
    );
    ReceiptOcrReviewSaveRequest edit(String subtotal, String total) =>
        ReceiptOcrReviewSaveRequest(
          status: review.status,
          source: review.source,
          merchantText: review.merchantText,
          receiptIssuedAtUtc: null,
          currency: 'USD',
          subtotalAmount: subtotal,
          taxAmount: '4',
          serviceChargeAmount: null,
          discountAmount: null,
          grandTotalAmount: total,
          lines: const [],
        );
    expect(
      receiptOcrTaxModeForSavedEdit(review, edit('20', '20')),
      ReceiptOcrTaxReconciliationModeValues.unresolved,
    );
    expect(
      receiptOcrTaxModeForSavedEdit(review, edit('20', '25')),
      ReceiptOcrTaxReconciliationModeValues.unresolved,
    );
    expect(
      receiptOcrTaxModeForSavedEdit(review, edit('21', '25')),
      ReceiptOcrTaxReconciliationModeValues.addToBase,
    );
  });

  test('saved included tax survives merchant edit and numeric formatting', () {
    final now = DateTime.utc(2026, 10, 2);
    final review = ReceiptOcrReviewDetail(
      id: 'review',
      billId: 'bill',
      fileId: 'file',
      groupId: null,
      status: ReceiptOcrReviewStatusValues.reviewed,
      source: ReceiptOcrReviewSourceValues.onDevice,
      merchantText: 'London Books',
      receiptIssuedAtUtc: null,
      currency: 'GBP',
      subtotalAmount: '24.00',
      taxAmount: '4.00',
      taxReconciliationMode:
          ReceiptOcrTaxReconciliationModeValues.alreadyInBase,
      serviceChargeAmount: null,
      discountAmount: null,
      grandTotalAmount: '24.00',
      lines: [
        ReceiptOcrReviewLine(
          id: 'line',
          sortOrder: 0,
          text: 'Book',
          quantity: '1',
          unitPriceAmount: '24.00',
          lineTotalAmount: '24.00',
          createdAtUtc: now,
          updatedAtUtc: now,
        ),
      ],
      createdAtUtc: now,
      updatedAtUtc: now,
    );
    ReceiptOcrReviewSaveRequest edit({
      String tax = '4',
      String subtotal = '24',
      String lineTotal = '24',
    }) => ReceiptOcrReviewSaveRequest(
      status: review.status,
      source: review.source,
      merchantText: 'Corrected London Books',
      receiptIssuedAtUtc: null,
      currency: 'GBP',
      subtotalAmount: subtotal,
      taxAmount: tax,
      serviceChargeAmount: null,
      discountAmount: null,
      grandTotalAmount: '24',
      lines: [
        ReceiptOcrReviewLineSaveRequest(
          text: 'Book',
          quantity: '1.0',
          unitPriceAmount: lineTotal,
          lineTotalAmount: lineTotal,
        ),
      ],
    );
    expect(
      receiptOcrTaxModeForSavedEdit(review, edit()),
      ReceiptOcrTaxReconciliationModeValues.alreadyInBase,
    );
    expect(
      receiptOcrTaxModeForSavedEdit(review, edit(tax: '5')),
      ReceiptOcrTaxReconciliationModeValues.alreadyInBase,
    );
    expect(
      receiptOcrTaxModeForSavedEdit(
        review,
        edit(subtotal: '20', lineTotal: '20'),
      ),
      ReceiptOcrTaxReconciliationModeValues.addToBase,
    );
    expect(
      receiptOcrTaxModeForSavedEdit(review, edit(tax: '25')),
      ReceiptOcrTaxReconciliationModeValues.sourceIncludedUnresolved,
    );
  });

  test(
    'source included conflict survives save and resolves only after correction',
    () {
      final now = DateTime.utc(2026, 10, 2);
      ReceiptOcrReviewDetail review(String mode) => ReceiptOcrReviewDetail(
        id: 'review',
        billId: 'bill',
        fileId: 'file',
        groupId: null,
        status: ReceiptOcrReviewStatusValues.reviewed,
        source: ReceiptOcrReviewSourceValues.onDevice,
        merchantText: 'Books',
        receiptIssuedAtUtc: null,
        currency: 'GBP',
        subtotalAmount: '20',
        taxAmount: '4',
        taxReconciliationMode: mode,
        serviceChargeAmount: null,
        discountAmount: null,
        grandTotalAmount: '25',
        lines: const [],
        createdAtUtc: now,
        updatedAtUtc: now,
      );
      ReceiptOcrReviewSaveRequest corrected({String currency = 'GBP'}) =>
          ReceiptOcrReviewSaveRequest(
            status: ReceiptOcrReviewStatusValues.reviewed,
            source: ReceiptOcrReviewSourceValues.onDevice,
            merchantText: 'Books',
            receiptIssuedAtUtc: null,
            currency: currency,
            subtotalAmount: '20',
            taxAmount: '4',
            serviceChargeAmount: null,
            discountAmount: null,
            grandTotalAmount: '24',
            lines: const [],
          );
      expect(
        receiptOcrTaxModeForSavedEdit(
          review(
            ReceiptOcrTaxReconciliationModeValues.sourceIncludedUnresolved,
          ),
          corrected(),
        ),
        ReceiptOcrTaxReconciliationModeValues.addToBase,
      );
      expect(
        receiptOcrTaxModeForSavedEdit(
          review(ReceiptOcrTaxReconciliationModeValues.unresolved),
          corrected(),
        ),
        ReceiptOcrTaxReconciliationModeValues.unresolved,
      );
      expect(
        receiptOcrTaxModeForSavedEdit(
          review(
            ReceiptOcrTaxReconciliationModeValues.sourceIncludedUnresolved,
          ),
          corrected(currency: 'EUR'),
        ),
        ReceiptOcrTaxReconciliationModeValues.unresolved,
      );
    },
  );

  test('correcting a missed item retains printed included-tax provenance', () {
    final now = DateTime.utc(2026, 10, 2);
    final review = ReceiptOcrReviewDetail(
      id: 'review',
      billId: 'bill',
      fileId: 'file',
      groupId: null,
      status: ReceiptOcrReviewStatusValues.reviewed,
      source: ReceiptOcrReviewSourceValues.onDevice,
      merchantText: 'Books',
      receiptIssuedAtUtc: null,
      currency: 'GBP',
      subtotalAmount: '24',
      taxAmount: '4',
      taxReconciliationMode:
          ReceiptOcrTaxReconciliationModeValues.sourceIncludedUnresolved,
      serviceChargeAmount: null,
      discountAmount: null,
      grandTotalAmount: '24',
      lines: [
        ReceiptOcrReviewLine(
          id: 'line',
          sortOrder: 0,
          text: 'Book',
          quantity: '1',
          unitPriceAmount: '19',
          lineTotalAmount: '19',
          createdAtUtc: now,
          updatedAtUtc: now,
        ),
      ],
      createdAtUtc: now,
      updatedAtUtc: now,
    );
    final correction = ReceiptOcrReviewSaveRequest(
      status: review.status,
      source: review.source,
      merchantText: review.merchantText,
      receiptIssuedAtUtc: null,
      currency: 'GBP',
      subtotalAmount: '24',
      taxAmount: '4',
      serviceChargeAmount: null,
      discountAmount: null,
      grandTotalAmount: '24',
      lines: const [
        ReceiptOcrReviewLineSaveRequest(
          text: 'Book',
          quantity: '1',
          unitPriceAmount: '24',
          lineTotalAmount: '24',
        ),
      ],
    );
    expect(
      receiptOcrTaxModeForSavedEdit(review, correction),
      ReceiptOcrTaxReconciliationModeValues.alreadyInBase,
    );
  });
}
