import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_provider.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';
import 'package:mobile/receipt_ocr_capture/unsupported_receipt_ocr_provider.dart';

void main() {
  test('parser extracts provisional HKD receipt candidates', () {
    const parser = ReceiptOcrParser();

    final preview = parser.parse('''
Corner Market
2026-06-12
Milk 2 x 12.50 25.00
Bread 18.00
Subtotal HKD 43.00
Tax 0.00
Total HKD 43.00
Thank you
''');

    expect(preview.merchant, 'Corner Market');
    expect(preview.receiptDate, '2026-06-12');
    expect(preview.currency, 'HKD');
    expect(preview.subtotal, '43.00');
    expect(preview.tax, '0.00');
    expect(preview.total, '43.00');
    expect(preview.rawTextLineCount, 8);
    expect(preview.items, hasLength(2));
    expect(preview.items.first.description, 'Milk');
    expect(preview.items.first.quantity, '2');
    expect(preview.items.first.unitPrice, '12.50');
    expect(preview.items.first.lineTotal, '25.00');
    expect(preview.items.last.description, 'Bread');
    expect(preview.items.last.quantity, '1');
    expect(preview.items.last.lineTotal, '18.00');
  });

  test('parser keeps uncertain text provisional with warnings', () {
    const parser = ReceiptOcrParser();

    final preview = parser.parse('''
Receipt
Thank you
''');

    expect(preview.hasApplyableFields, isFalse);
    expect(preview.warnings, contains('No clear item lines were detected.'));
    expect(preview.warnings, contains('No clear total amount was detected.'));
  });

  test('unsupported provider returns manual-entry fallback', () async {
    const provider = UnsupportedReceiptOcrProvider();

    final result = await provider.extractReceipt(
      ReceiptOcrRequest(bytes: const [1, 2, 3], contentType: 'image/png'),
    );

    expect(result.status, ReceiptOcrStatus.unsupported);
    expect(result.preview, isNull);
    expect(result.message, contains('manual'));
  });

  test('fakeable provider can return structured preview', () async {
    final provider = _FakeReceiptOcrProvider(
      const ReceiptOcrResult.extracted(
        ReceiptOcrPreview(
          merchant: 'Coffee Bar',
          currency: 'USD',
          items: [
            ReceiptOcrItemCandidate(
              description: 'Latte',
              quantity: '1',
              lineTotal: '5.50',
              currency: 'USD',
            ),
          ],
        ),
      ),
    );

    final result = await provider.extractReceipt(
      ReceiptOcrRequest(bytes: const [7, 8, 9], contentType: 'image/jpeg'),
    );

    expect(provider.calls, 1);
    expect(provider.lastRequest?.bytes, const [7, 8, 9]);
    expect(provider.lastRequest?.contentType, 'image/jpeg');
    expect(result.preview?.merchant, 'Coffee Bar');
  });
}

class _FakeReceiptOcrProvider implements ReceiptOcrProvider {
  _FakeReceiptOcrProvider(this.result);

  final ReceiptOcrResult result;
  int calls = 0;
  ReceiptOcrRequest? lastRequest;

  @override
  Future<ReceiptOcrResult> extractReceipt(ReceiptOcrRequest request) async {
    calls += 1;
    lastRequest = request;
    return result;
  }
}
