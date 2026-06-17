enum ReceiptImageSourceKind {
  capturedPhoto,
  importedImage,
  importedPdf,
  unknown,
}

enum ReceiptImageHandlingDecision { accepted, limited, unsupported }

class ReceiptImageNormalizationPolicyInput {
  const ReceiptImageNormalizationPolicyInput({
    required this.sourceKind,
    this.sourceLabel,
    this.mediaType,
    this.extension,
    this.sizeBytes,
    this.width,
    this.height,
    this.byteNormalizationPerformed = false,
    this.thumbnailGenerated = false,
  });

  final ReceiptImageSourceKind sourceKind;
  final String? sourceLabel;
  final String? mediaType;
  final String? extension;
  final int? sizeBytes;
  final int? width;
  final int? height;
  final bool byteNormalizationPerformed;
  final bool thumbnailGenerated;
}

class ReceiptImageNormalizationPolicyReview {
  const ReceiptImageNormalizationPolicyReview({
    required this.sourceKind,
    required this.sourceLabel,
    required this.mediaTypeLabel,
    required this.decision,
    required this.normalizedJpegExpected,
    required this.originalRetainedByPolicy,
    required this.thumbnailExpected,
    required this.byteNormalizationPerformed,
    required this.thumbnailGenerated,
    required this.reasonCodes,
    required this.messages,
  });

  final ReceiptImageSourceKind sourceKind;
  final String sourceLabel;
  final String mediaTypeLabel;
  final ReceiptImageHandlingDecision decision;
  final bool normalizedJpegExpected;
  final bool originalRetainedByPolicy;
  final bool thumbnailExpected;
  final bool byteNormalizationPerformed;
  final bool thumbnailGenerated;
  final List<String> reasonCodes;
  final List<String> messages;

  bool get isAccepted => decision == ReceiptImageHandlingDecision.accepted;

  String get decisionLabel {
    return switch (decision) {
      ReceiptImageHandlingDecision.accepted => 'Accepted',
      ReceiptImageHandlingDecision.limited => 'Limited',
      ReceiptImageHandlingDecision.unsupported => 'Unsupported',
    };
  }

  List<String> get displayLines {
    return [
      'Source: ${_sourceKindLabel(sourceKind)}',
      'File type: $mediaTypeLabel',
      'Handling: $decisionLabel',
      normalizedJpegExpected
          ? 'Policy target: normalized JPEG derivative expected.'
          : 'Policy target: no normalized JPEG derivative for this file.',
      originalRetainedByPolicy
          ? 'Original retention: source file retention is expected by policy.'
          : 'Original retention: raw source retention is off by default.',
      thumbnailExpected
          ? 'Thumbnail: thumbnail derivative expected by policy.'
          : 'Thumbnail: no thumbnail derivative expected by policy.',
      byteNormalizationPerformed
          ? 'Current build: normalized receipt bytes were prepared.'
          : 'Current build: byte normalization is not performed here.',
      thumbnailGenerated
          ? 'Current build: thumbnail bytes were prepared.'
          : 'Current build: thumbnail generation is not performed here.',
      ...messages,
    ];
  }

  String get safeDiagnosticSummary {
    final codes = reasonCodes.isEmpty ? 'none' : reasonCodes.join(',');
    return [
      'sourceKind=${sourceKind.name}',
      'mediaType=$mediaTypeLabel',
      'decision=${decision.name}',
      'normalizedJpegExpected=$normalizedJpegExpected',
      'originalRetainedByPolicy=$originalRetainedByPolicy',
      'thumbnailExpected=$thumbnailExpected',
      'byteNormalizationPerformed=$byteNormalizationPerformed',
      'thumbnailGenerated=$thumbnailGenerated',
      'reasonCodes=$codes',
    ].join(';');
  }
}

class ReceiptImageNormalizationPolicy {
  const ReceiptImageNormalizationPolicy._();

  static const int largeFileWarningBytes = 10 * 1024 * 1024;
  static const int largeDimensionWarningPixels = 12 * 1000 * 1000;

  static ReceiptImageNormalizationPolicyReview review(
    ReceiptImageNormalizationPolicyInput input,
  ) {
    final mediaType = _normalizedToken(input.mediaType);
    final extension = _normalizedExtension(input.extension);
    final type = _receiptFileType(mediaType: mediaType, extension: extension);
    final reasonCodes = <String>[];
    final messages = <String>[
      'Receipt images can contain merchant, location, payment, and contact details. Review before saving or sharing.',
    ];

    ReceiptImageHandlingDecision decision;
    var normalizedJpegExpected = false;
    var thumbnailExpected = false;

    switch (type) {
      case _ReceiptFileType.jpeg:
        decision = ReceiptImageHandlingDecision.accepted;
        normalizedJpegExpected = true;
        thumbnailExpected = true;
        reasonCodes.add('preferred_jpeg_input');
        messages.add('JPEG/JPG is the preferred normalized receipt target.');
      case _ReceiptFileType.png:
      case _ReceiptFileType.webp:
        decision = ReceiptImageHandlingDecision.accepted;
        normalizedJpegExpected = true;
        thumbnailExpected = true;
        reasonCodes.add('image_input_needs_jpeg_derivative');
        messages.add(
          'This image type can be reviewed, but policy expects a JPEG derivative before final storage.',
        );
      case _ReceiptFileType.pdf:
        decision = ReceiptImageHandlingDecision.limited;
        reasonCodes.add('pdf_document_not_image_normalized');
        messages.add(
          'PDF is a document candidate. This build does not extract PDF pages into normalized receipt images.',
        );
      case _ReceiptFileType.heic:
        decision = ReceiptImageHandlingDecision.unsupported;
        reasonCodes.add('heic_not_supported_by_current_mobile_seam');
        messages.add(
          'HEIC may be a future input candidate, but the current receipt upload/OCR seam does not support it.',
        );
      case _ReceiptFileType.unknown:
        decision = ReceiptImageHandlingDecision.unsupported;
        reasonCodes.add('unknown_or_unsupported_file_type');
        messages.add(
          'Unknown or unsupported file types must stay manual-review only.',
        );
    }

    if (input.sizeBytes == null) {
      reasonCodes.add('missing_size_metadata');
      messages.add('File size metadata is unavailable.');
    } else if (input.sizeBytes! > largeFileWarningBytes) {
      reasonCodes.add('large_file_warning');
      messages.add('Receipt file is large; OCR, upload, or storage may fail.');
    }

    final width = input.width;
    final height = input.height;
    if (width != null && height != null) {
      final pixelCount = width * height;
      if (pixelCount > largeDimensionWarningPixels) {
        reasonCodes.add('large_dimension_warning');
        messages.add(
          'Receipt image dimensions are large; downscaling should happen before final storage.',
        );
      }
    }

    if (!input.byteNormalizationPerformed && normalizedJpegExpected) {
      reasonCodes.add('normalization_not_performed');
      messages.add(
        'This build previews and guides normalization policy; it does not save, share, upload, or replace normalized JPEG bytes.',
      );
    }
    if (!input.thumbnailGenerated && thumbnailExpected) {
      reasonCodes.add('thumbnail_not_generated');
    }

    return ReceiptImageNormalizationPolicyReview(
      sourceKind: input.sourceKind,
      sourceLabel: _safeSourceLabel(input.sourceLabel),
      mediaTypeLabel: _mediaTypeLabel(mediaType, extension),
      decision: decision,
      normalizedJpegExpected: normalizedJpegExpected,
      originalRetainedByPolicy: false,
      thumbnailExpected: thumbnailExpected,
      byteNormalizationPerformed: input.byteNormalizationPerformed,
      thumbnailGenerated: input.thumbnailGenerated,
      reasonCodes: reasonCodes.toList(growable: false),
      messages: messages.toList(growable: false),
    );
  }
}

enum _ReceiptFileType { jpeg, png, webp, pdf, heic, unknown }

_ReceiptFileType _receiptFileType({String? mediaType, String? extension}) {
  if (mediaType == 'image/jpeg' ||
      mediaType == 'image/jpg' ||
      extension == 'jpg' ||
      extension == 'jpeg') {
    return _ReceiptFileType.jpeg;
  }
  if (mediaType == 'image/png' || extension == 'png') {
    return _ReceiptFileType.png;
  }
  if (mediaType == 'image/webp' || extension == 'webp') {
    return _ReceiptFileType.webp;
  }
  if (mediaType == 'application/pdf' || extension == 'pdf') {
    return _ReceiptFileType.pdf;
  }
  if (mediaType == 'image/heic' ||
      mediaType == 'image/heif' ||
      extension == 'heic' ||
      extension == 'heif') {
    return _ReceiptFileType.heic;
  }
  return _ReceiptFileType.unknown;
}

String _sourceKindLabel(ReceiptImageSourceKind sourceKind) {
  return switch (sourceKind) {
    ReceiptImageSourceKind.capturedPhoto => 'Captured photo',
    ReceiptImageSourceKind.importedImage => 'Imported image',
    ReceiptImageSourceKind.importedPdf => 'Imported PDF',
    ReceiptImageSourceKind.unknown => 'Unknown source',
  };
}

String _safeSourceLabel(String? label) {
  final normalized = label?.replaceAll('\\', '/').split('/').last.trim();
  if (normalized == null || normalized.isEmpty) {
    return 'Receipt file';
  }

  return normalized.length <= 80 ? normalized : normalized.substring(0, 80);
}

String _mediaTypeLabel(String? mediaType, String? extension) {
  if (mediaType != null && extension != null) {
    return '$mediaType .$extension';
  }
  return mediaType ?? (extension == null ? 'Unknown' : '.$extension');
}

String? _normalizedToken(String? value) {
  final normalized = value?.trim().toLowerCase();
  if (normalized == null || normalized.isEmpty) {
    return null;
  }
  return normalized;
}

String? _normalizedExtension(String? extension) {
  final normalized = _normalizedToken(extension);
  if (normalized == null) {
    return null;
  }
  return normalized.startsWith('.') ? normalized.substring(1) : normalized;
}
