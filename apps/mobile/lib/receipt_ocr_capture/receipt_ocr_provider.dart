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

  const ReceiptOcrResult.failed(
    String message, {
    ReceiptOcrFailureCategory? failureCategory,
  }) : this._(
         status: ReceiptOcrStatus.failed,
         message: message,
         failureCategory: failureCategory,
       );

  final ReceiptOcrStatus status;
  final ReceiptOcrPreview? preview;
  final String? message;
  final ReceiptOcrFailureCategory? failureCategory;
}

enum ReceiptOcrStatus { extracted, unsupported, failed }

enum ReceiptOcrFailureCategory {
  invalidProviderResponse,
  providerException,
  resourceLookup,
  modelOpen,
  modelConfiguration,
  runtimeInitialization,
  runtimeInitializationOpenCv,
  runtimeInitializationOnnxRuntime,
  inputValidation,
  postprocessing,
  detectionInference,
  recognitionInference,
  outputDecode,
}

extension ReceiptOcrFailureCategoryEvidence on ReceiptOcrFailureCategory {
  String get boundedEvidenceField => switch (this) {
    ReceiptOcrFailureCategory.invalidProviderResponse => 'provider_status',
    ReceiptOcrFailureCategory.providerException => 'provider_exception',
    ReceiptOcrFailureCategory.resourceLookup => 'ocr_resource_lookup',
    ReceiptOcrFailureCategory.modelOpen => 'ocr_model_open',
    ReceiptOcrFailureCategory.modelConfiguration => 'ocr_model_configuration',
    ReceiptOcrFailureCategory.runtimeInitialization =>
      'ocr_runtime_initialization',
    ReceiptOcrFailureCategory.runtimeInitializationOpenCv =>
      'ocr_runtime_initialization_opencv',
    ReceiptOcrFailureCategory.runtimeInitializationOnnxRuntime =>
      'ocr_runtime_initialization_onnxruntime',
    ReceiptOcrFailureCategory.inputValidation => 'ocr_input_validation',
    ReceiptOcrFailureCategory.postprocessing => 'ocr_postprocessing',
    ReceiptOcrFailureCategory.detectionInference => 'ocr_detection_inference',
    ReceiptOcrFailureCategory.recognitionInference =>
      'ocr_recognition_inference',
    ReceiptOcrFailureCategory.outputDecode => 'ocr_output_decode',
  };
}
