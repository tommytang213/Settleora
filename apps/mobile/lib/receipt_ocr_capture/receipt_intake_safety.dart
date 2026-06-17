import '../bills/bill_attachment_file_input.dart';
import 'receipt_image_normalization_policy.dart';

enum ReceiptIntakeSourceType { cameraCapture, photoImport, fileImport, unknown }

class ReceiptIntakePolicy {
  const ReceiptIntakePolicy._();

  static const int largeFileWarningBytes = 10 * 1024 * 1024;
  static const Set<String> supportedReceiptContentTypes =
      SettleoraBillAttachmentContentTypeValues.receiptValues;
  static const Set<String> supportedReceiptExtensions = {
    'jpg',
    'jpeg',
    'png',
    'webp',
  };
}

class ReceiptIntakeSafetyMetadata {
  const ReceiptIntakeSafetyMetadata({
    required this.sourceType,
    this.filename,
    this.contentType,
    this.sizeBytes,
    this.nativeCameraAvailable,
    this.nativePhotoImportAvailable,
    this.nativeFileImportAvailable,
  });

  factory ReceiptIntakeSafetyMetadata.fromPickedFile({
    required ReceiptIntakeSourceType sourceType,
    required SettleoraPickedBillAttachmentFile file,
    bool? nativeCameraAvailable,
    bool? nativePhotoImportAvailable,
    bool? nativeFileImportAvailable,
  }) {
    return ReceiptIntakeSafetyMetadata(
      sourceType: sourceType,
      filename: file.filename,
      contentType: file.contentType,
      sizeBytes: file.bytes.length,
      nativeCameraAvailable: nativeCameraAvailable,
      nativePhotoImportAvailable: nativePhotoImportAvailable,
      nativeFileImportAvailable: nativeFileImportAvailable,
    );
  }

  final ReceiptIntakeSourceType sourceType;
  final String? filename;
  final String? contentType;
  final int? sizeBytes;
  final bool? nativeCameraAvailable;
  final bool? nativePhotoImportAvailable;
  final bool? nativeFileImportAvailable;
}

class ReceiptIntakeSafetyReview {
  const ReceiptIntakeSafetyReview({
    required this.sourceType,
    required this.normalizationReview,
    required this.warnings,
  });

  final ReceiptIntakeSourceType sourceType;
  final ReceiptImageNormalizationPolicyReview normalizationReview;
  final List<String> warnings;
}

ReceiptIntakeSafetyReview reviewReceiptIntakeSafety(
  ReceiptIntakeSafetyMetadata metadata,
) {
  final warnings = <String>[
    'Server-mode OCR data stays provisional until the API validates and accepts it.',
  ];

  final contentType = metadata.contentType?.trim().toLowerCase();
  if (contentType == null || contentType.isEmpty) {
    warnings.add(
      'Receipt file type metadata is missing. Review before saving.',
    );
  } else if (!ReceiptIntakePolicy.supportedReceiptContentTypes.contains(
    contentType,
  )) {
    warnings.add('Receipt file type is not supported for receipt OCR review.');
  }

  final extension = _receiptFilenameExtension(metadata.filename);
  if (extension == null || extension.isEmpty) {
    warnings.add(
      'Receipt filename extension is missing. Review the import source.',
    );
  } else if (!ReceiptIntakePolicy.supportedReceiptExtensions.contains(
    extension,
  )) {
    warnings.add(
      'Receipt filename extension is not supported for receipt OCR review.',
    );
  }

  final sizeBytes = metadata.sizeBytes;
  if (sizeBytes == null) {
    warnings.add(
      'Receipt file size metadata is missing. Review before upload.',
    );
  } else if (sizeBytes > ReceiptIntakePolicy.largeFileWarningBytes) {
    warnings.add(
      'Receipt file is large. Upload or OCR may fail; review before saving.',
    );
  }

  if (metadata.sourceType == ReceiptIntakeSourceType.unknown) {
    warnings.add(
      'Receipt source is unavailable. Treat the import as manual review only.',
    );
  }
  if (metadata.nativeCameraAvailable == false) {
    warnings.add('Native camera capture is unavailable in this build.');
  }
  if (metadata.nativePhotoImportAvailable == false) {
    warnings.add('Native photo import is unavailable in this build.');
  }
  if (metadata.nativeFileImportAvailable == false) {
    warnings.add('Native file import is unavailable in this build.');
  }

  return ReceiptIntakeSafetyReview(
    sourceType: metadata.sourceType,
    normalizationReview: ReceiptImageNormalizationPolicy.review(
      ReceiptImageNormalizationPolicyInput(
        sourceKind: _receiptImageSourceKind(
          metadata.sourceType,
          contentType: contentType,
          extension: extension,
        ),
        sourceLabel: metadata.filename,
        mediaType: contentType,
        extension: extension,
        sizeBytes: metadata.sizeBytes,
      ),
    ),
    warnings: warnings.toList(growable: false),
  );
}

String receiptIntakeSourceLabel(ReceiptIntakeSourceType sourceType) {
  return switch (sourceType) {
    ReceiptIntakeSourceType.cameraCapture => 'Camera capture',
    ReceiptIntakeSourceType.photoImport => 'Photo import',
    ReceiptIntakeSourceType.fileImport => 'File import',
    ReceiptIntakeSourceType.unknown => 'Source unavailable',
  };
}

String? _receiptFilenameExtension(String? filename) {
  final safeName = filename?.replaceAll('\\', '/').split('/').last.trim();
  if (safeName == null || safeName.isEmpty) {
    return null;
  }

  final dotIndex = safeName.lastIndexOf('.');
  if (dotIndex < 0 || dotIndex == safeName.length - 1) {
    return '';
  }

  return safeName.substring(dotIndex + 1).toLowerCase();
}

ReceiptImageSourceKind _receiptImageSourceKind(
  ReceiptIntakeSourceType sourceType, {
  required String? contentType,
  required String? extension,
}) {
  if (contentType == 'application/pdf' || extension == 'pdf') {
    return ReceiptImageSourceKind.importedPdf;
  }
  return switch (sourceType) {
    ReceiptIntakeSourceType.cameraCapture =>
      ReceiptImageSourceKind.capturedPhoto,
    ReceiptIntakeSourceType.photoImport => ReceiptImageSourceKind.importedImage,
    ReceiptIntakeSourceType.fileImport => ReceiptImageSourceKind.importedImage,
    ReceiptIntakeSourceType.unknown => ReceiptImageSourceKind.unknown,
  };
}
