import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

void main() {
  test('warns only for conservative OCR duplicate matches', () {
    const existing = [
      BillDuplicateWarningCandidate(
        billId: 'bill-1',
        merchantName: 'Corner Market',
        billDate: '2026-06-12',
        totalAmount: '43.0',
        totalCurrency: 'HKD',
      ),
    ];

    final warning = possibleReceiptDuplicateWarning(
      preview: const ReceiptOcrPreview(
        merchant: 'Corner Market Ltd.',
        receiptDate: '2026/6/12',
        currency: 'hkd',
        total: '43.00',
      ),
      existingBills: existing,
    );

    expect(warning?.title, 'Possible duplicate receipt');
    expect(warning?.matchedBillId, 'bill-1');
    expect(warning?.reason, contains('merchant'));

    expect(
      possibleReceiptDuplicateWarning(
        preview: const ReceiptOcrPreview(
          merchant: 'Corner Market',
          receiptDate: '2026-06-12',
          currency: 'USD',
          total: '43.00',
        ),
        existingBills: existing,
      ),
      isNull,
    );
    expect(
      possibleReceiptDuplicateWarning(
        preview: const ReceiptOcrPreview(
          merchant: 'Corner Market',
          receiptDate: '2026-06-12',
          currency: 'HKD',
          total: '44.00',
        ),
        existingBills: existing,
      ),
      isNull,
    );
    expect(
      possibleReceiptDuplicateWarning(
        preview: const ReceiptOcrPreview(
          merchant: 'Other Cafe',
          receiptDate: '2026-06-12',
          currency: 'HKD',
          total: '43.00',
        ),
        existingBills: existing,
      ),
      isNull,
    );
    expect(
      possibleReceiptDuplicateWarning(
        preview: const ReceiptOcrPreview(
          merchant: 'Corner Market',
          receiptDate: '2026-06-12',
          currency: 'HKD',
        ),
        existingBills: existing,
      ),
      isNull,
    );
  });
}
