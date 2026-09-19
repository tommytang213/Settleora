import 'receipt_ocr_preview.dart';

abstract interface class ReceiptOcrProvider {
  Future<ReceiptOcrResult> extractReceipt(ReceiptOcrRequest request);
}

class ReceiptOcrRequest {
  ReceiptOcrRequest({
    required List<int> bytes,
    required this.contentType,
    this.imagePath,
    this.fallbackCurrency,
  }) : bytes = List.unmodifiable(bytes);

  final List<int> bytes;
  final String contentType;
  final String? imagePath;
  final String? fallbackCurrency;
}

class ReceiptOcrResult {
  const ReceiptOcrResult._({
    required this.status,
    this.preview,
    this.message,
    this.failureCategory,
  });

  const ReceiptOcrResult.extracted(ReceiptOcrPreview preview)
    : this._(status: ReceiptOcrStatus.extracted, preview: preview);

  const ReceiptOcrResult.unsupported(String message)
    : this._(status: ReceiptOcrStatus.unsupported, message: message);

  const ReceiptOcrResult.failed(this.message, {this.failureCategory})
    : status = ReceiptOcrStatus.failed,
      preview = null;

  final ReceiptOcrStatus status;
  final ReceiptOcrPreview? preview;
  final String? message;
  final ReceiptOcrFailureCategory? failureCategory;
}

enum ReceiptOcrStatus { extracted, unsupported, failed }

enum ReceiptOcrFailureCategory { invalidProviderResponse, providerException }
