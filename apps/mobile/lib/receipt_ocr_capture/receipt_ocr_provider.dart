import 'receipt_ocr_preview.dart';

abstract interface class ReceiptOcrProvider {
  Future<ReceiptOcrResult> extractReceipt(ReceiptOcrRequest request);
}

class ReceiptOcrRequest {
  ReceiptOcrRequest({required List<int> bytes, required this.contentType})
    : bytes = List.unmodifiable(bytes);

  final List<int> bytes;
  final String contentType;
}

class ReceiptOcrResult {
  const ReceiptOcrResult._({required this.status, this.preview, this.message});

  const ReceiptOcrResult.extracted(ReceiptOcrPreview preview)
    : this._(status: ReceiptOcrStatus.extracted, preview: preview);

  const ReceiptOcrResult.unsupported(String message)
    : this._(status: ReceiptOcrStatus.unsupported, message: message);

  const ReceiptOcrResult.failed(String message)
    : this._(status: ReceiptOcrStatus.failed, message: message);

  final ReceiptOcrStatus status;
  final ReceiptOcrPreview? preview;
  final String? message;
}

enum ReceiptOcrStatus { extracted, unsupported, failed }
