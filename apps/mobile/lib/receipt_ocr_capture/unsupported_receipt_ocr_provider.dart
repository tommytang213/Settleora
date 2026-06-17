import 'receipt_ocr_provider.dart';

class UnsupportedReceiptOcrProvider implements ReceiptOcrProvider {
  const UnsupportedReceiptOcrProvider();

  @override
  Future<ReceiptOcrResult> extractReceipt(ReceiptOcrRequest request) async {
    return const ReceiptOcrResult.unsupported(
      'Receipt reading is not available on this device yet. You can still enter the bill manually.',
    );
  }
}
