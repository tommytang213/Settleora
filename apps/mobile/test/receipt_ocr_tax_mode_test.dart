import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_repository.dart';

void main() {
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
      ReceiptOcrTaxReconciliationModeValues.unresolved,
    );
  });
}
