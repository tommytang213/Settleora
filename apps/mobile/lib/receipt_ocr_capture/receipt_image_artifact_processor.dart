import 'dart:typed_data';

import 'package:image/image.dart' as img;

import 'receipt_image_normalization_policy.dart';

class ReceiptImageArtifactRequest {
  const ReceiptImageArtifactRequest({
    required this.sourceType,
    required this.sourceContentType,
    required this.sourceBytes,
    this.sourceLabel,
    this.sourceExtension,
    this.thumbnailMaxDimension = 320,
    this.jpegQuality = 88,
  });

  final ReceiptImageSourceKind sourceType;
  final String sourceContentType;
  final List<int> sourceBytes;
  final String? sourceLabel;
  final String? sourceExtension;
  final int thumbnailMaxDimension;
  final int jpegQuality;
}

class ReceiptImageArtifactResult {
  const ReceiptImageArtifactResult({
    required this.status,
    required this.sourceType,
    required this.sourceContentType,
    required this.sourceLabel,
    required this.originalRetainedByPolicy,
    required this.normalizedContentType,
    required this.normalizedJpegBytes,
    required this.thumbnailJpegBytes,
    required this.sourceSizeBytes,
    required this.normalizedSizeBytes,
    required this.thumbnailSizeBytes,
    required this.width,
    required this.height,
    required this.thumbnailWidth,
    required this.thumbnailHeight,
    required this.warnings,
    required this.reasonCodes,
    required this.cacheReadiness,
  });

  final ReceiptImageArtifactStatus status;
  final ReceiptImageSourceKind sourceType;
  final String sourceContentType;
  final String sourceLabel;
  final bool originalRetainedByPolicy;
  final String? normalizedContentType;
  final Uint8List? normalizedJpegBytes;
  final Uint8List? thumbnailJpegBytes;
  final int sourceSizeBytes;
  final int? normalizedSizeBytes;
  final int? thumbnailSizeBytes;
  final int? width;
  final int? height;
  final int? thumbnailWidth;
  final int? thumbnailHeight;
  final List<String> warnings;
  final List<String> reasonCodes;
  final ReceiptArtifactCacheReadiness cacheReadiness;

  bool get accepted => status == ReceiptImageArtifactStatus.accepted;

  bool get normalizedJpegProduced => normalizedJpegBytes != null;

  bool get thumbnailJpegProduced => thumbnailJpegBytes != null;

  String get safeDiagnosticSummary {
    final codes = reasonCodes.isEmpty ? 'none' : reasonCodes.join(',');
    return [
      'status=${status.name}',
      'sourceType=${sourceType.name}',
      'sourceContentType=$sourceContentType',
      'normalizedContentType=${normalizedContentType ?? 'none'}',
      'sourceSizeBytes=$sourceSizeBytes',
      'normalizedSizeBytes=${normalizedSizeBytes ?? 0}',
      'thumbnailSizeBytes=${thumbnailSizeBytes ?? 0}',
      'width=${width ?? 0}',
      'height=${height ?? 0}',
      'thumbnailWidth=${thumbnailWidth ?? 0}',
      'thumbnailHeight=${thumbnailHeight ?? 0}',
      'originalRetainedByPolicy=$originalRetainedByPolicy',
      'reasonCodes=$codes',
      'secureCacheImplemented=${cacheReadiness.secureLocalCacheImplemented}',
    ].join(';');
  }
}

enum ReceiptImageArtifactStatus { accepted, limited, unsupported }

class ReceiptArtifactCacheReadiness {
  const ReceiptArtifactCacheReadiness({
    required this.secureLocalCacheImplemented,
    required this.originalRetainedByPolicy,
    required this.message,
    required this.reasonCodes,
  });

  const ReceiptArtifactCacheReadiness.deferred({
    bool originalRetainedByPolicy = false,
  }) : this(
         secureLocalCacheImplemented: false,
         originalRetainedByPolicy: originalRetainedByPolicy,
         message:
             'Secure/encrypted local receipt artifact cache is deferred; artifacts are in memory only in this build.',
         reasonCodes: const ['secure_receipt_cache_deferred'],
       );

  final bool secureLocalCacheImplemented;
  final bool originalRetainedByPolicy;
  final String message;
  final List<String> reasonCodes;
}

class ReceiptImageArtifactProcessor {
  const ReceiptImageArtifactProcessor();

  static const normalizedJpegContentType = 'image/jpeg';
  static const maxSourceBytes = 25 * 1024 * 1024;
  static const maxDecodedDimension = 8192;
  static const maxDecodedPixels = 16 * 1024 * 1024;
  static const maxNormalizedDimension = 2048;

  ReceiptImageArtifactResult process(ReceiptImageArtifactRequest request) {
    final sourceContentType = _normalizedToken(request.sourceContentType);
    final sourceExtension = _normalizedExtension(request.sourceExtension);
    final sourceLabel = _safeSourceLabel(request.sourceLabel);
    final reasonCodes = <String>[];
    final warnings = <String>[
      'Receipt contents may include sensitive merchant, payment, location, or contact details. Review before saving or sharing.',
    ];
    const originalRetainedByPolicy = false;
    const cacheReadiness = ReceiptArtifactCacheReadiness.deferred(
      originalRetainedByPolicy: originalRetainedByPolicy,
    );

    if (request.sourceBytes.isEmpty) {
      reasonCodes.add('empty_source_bytes');
      warnings.add('Receipt source bytes are empty.');
      return _rejectedResult(
        request: request,
        sourceContentType: sourceContentType,
        sourceLabel: sourceLabel,
        status: ReceiptImageArtifactStatus.unsupported,
        reasonCodes: reasonCodes,
        warnings: warnings,
        cacheReadiness: cacheReadiness,
      );
    }

    if (request.sourceBytes.length > maxSourceBytes) {
      reasonCodes.add('source_exceeds_processing_limit');
      warnings.add('Receipt source bytes exceed the mobile processing limit.');
      return _rejectedResult(
        request: request,
        sourceContentType: sourceContentType,
        sourceLabel: sourceLabel,
        status: ReceiptImageArtifactStatus.unsupported,
        reasonCodes: reasonCodes,
        warnings: warnings,
        cacheReadiness: cacheReadiness,
      );
    }

    // Camera and picker APIs already return Uint8List. Reuse that buffer and
    // only copy a generic List after its encoded size has been bounded.
    final sourceBytes = request.sourceBytes is Uint8List
        ? request.sourceBytes as Uint8List
        : Uint8List.fromList(request.sourceBytes);
    final declaredType = _receiptArtifactFileType(
      mediaType: sourceContentType,
      extension: sourceExtension,
    );
    final img.Decoder? decoder;
    try {
      decoder = img.findDecoderForData(sourceBytes);
    } catch (_) {
      if (declaredType == _ReceiptArtifactFileType.pdf) {
        reasonCodes.add('pdf_document_not_image_normalized');
        warnings.add(
          'PDF is document-limited; this build does not extract PDF pages into receipt image bytes.',
        );
        return _rejectedResult(
          request: request,
          sourceContentType: sourceContentType,
          sourceLabel: sourceLabel,
          status: ReceiptImageArtifactStatus.limited,
          reasonCodes: reasonCodes,
          warnings: warnings,
          cacheReadiness: cacheReadiness,
        );
      }
      if (declaredType == _ReceiptArtifactFileType.heic) {
        reasonCodes.add('heic_decoder_unavailable');
        warnings.add('HEIC/HEIF receipt inputs are unsupported by this build.');
        return _rejectedResult(
          request: request,
          sourceContentType: sourceContentType,
          sourceLabel: sourceLabel,
          status: ReceiptImageArtifactStatus.unsupported,
          reasonCodes: reasonCodes,
          warnings: warnings,
          cacheReadiness: cacheReadiness,
        );
      }
      return _decodeFailedResult(
        request: request,
        sourceContentType: sourceContentType,
        sourceLabel: sourceLabel,
        reasonCodes: reasonCodes,
        warnings: warnings,
        cacheReadiness: cacheReadiness,
      );
    }
    if (decoder == null && declaredType == _ReceiptArtifactFileType.pdf) {
      reasonCodes.add('pdf_document_not_image_normalized');
      warnings.add(
        'PDF is document-limited; this build does not extract PDF pages into receipt image bytes.',
      );
      return _rejectedResult(
        request: request,
        sourceContentType: sourceContentType,
        sourceLabel: sourceLabel,
        status: ReceiptImageArtifactStatus.limited,
        reasonCodes: reasonCodes,
        warnings: warnings,
        cacheReadiness: cacheReadiness,
      );
    }
    if (decoder == null && declaredType == _ReceiptArtifactFileType.heic) {
      reasonCodes.add('heic_decoder_unavailable');
      warnings.add('HEIC/HEIF receipt inputs are unsupported by this build.');
      return _rejectedResult(
        request: request,
        sourceContentType: sourceContentType,
        sourceLabel: sourceLabel,
        status: ReceiptImageArtifactStatus.unsupported,
        reasonCodes: reasonCodes,
        warnings: warnings,
        cacheReadiness: cacheReadiness,
      );
    }
    if (decoder == null) {
      reasonCodes.add('unknown_or_unsupported_file_type');
      warnings.add('Unknown receipt image inputs are manual-review only.');
      return _rejectedResult(
        request: request,
        sourceContentType: sourceContentType,
        sourceLabel: sourceLabel,
        status: ReceiptImageArtifactStatus.unsupported,
        reasonCodes: reasonCodes,
        warnings: warnings,
        cacheReadiness: cacheReadiness,
      );
    }

    final detectedType = _decoderType(decoder);
    if (detectedType == _ReceiptArtifactFileType.unknown) {
      reasonCodes.add('unknown_or_unsupported_file_type');
      warnings.add('Unknown receipt image inputs are manual-review only.');
      return _rejectedResult(
        request: request,
        sourceContentType: sourceContentType,
        sourceLabel: sourceLabel,
        status: ReceiptImageArtifactStatus.unsupported,
        reasonCodes: reasonCodes,
        warnings: warnings,
        cacheReadiness: cacheReadiness,
      );
    }
    if (declaredType != _ReceiptArtifactFileType.unknown &&
        declaredType != detectedType) {
      reasonCodes.add('source_metadata_type_mismatch');
    }
    final img.DecodeInfo? decodeInfo;
    try {
      decodeInfo = decoder.startDecode(sourceBytes);
    } catch (_) {
      return _decodeFailedResult(
        request: request,
        sourceContentType: sourceContentType,
        sourceLabel: sourceLabel,
        reasonCodes: reasonCodes,
        warnings: warnings,
        cacheReadiness: cacheReadiness,
      );
    }
    if (decodeInfo == null || decodeInfo.width <= 0 || decodeInfo.height <= 0) {
      return _decodeFailedResult(
        request: request,
        sourceContentType: sourceContentType,
        sourceLabel: sourceLabel,
        reasonCodes: reasonCodes,
        warnings: warnings,
        cacheReadiness: cacheReadiness,
      );
    }
    if (decodeInfo.width > maxDecodedDimension ||
        decodeInfo.height > maxDecodedDimension ||
        decodeInfo.width > maxDecodedPixels ~/ decodeInfo.height) {
      reasonCodes.add('image_dimensions_exceed_processing_limit');
      warnings.add(
        'Receipt image dimensions exceed the mobile processing limit.',
      );
      return _rejectedResult(
        request: request,
        sourceContentType: sourceContentType,
        sourceLabel: sourceLabel,
        status: ReceiptImageArtifactStatus.unsupported,
        reasonCodes: reasonCodes,
        warnings: warnings,
        cacheReadiness: cacheReadiness,
      );
    }

    final img.Image? decodedImage;
    try {
      // Header validation above bounds the full-resolution allocation before
      // a pixel buffer is materialized. Native OCR applies its own decode-time
      // sampling independently to the normalized artifact.
      decodedImage = decoder.decodeFrame(0);
    } catch (_) {
      return _decodeFailedResult(
        request: request,
        sourceContentType: sourceContentType,
        sourceLabel: sourceLabel,
        reasonCodes: reasonCodes,
        warnings: warnings,
        cacheReadiness: cacheReadiness,
      );
    }
    if (decodedImage == null) {
      reasonCodes.add('image_decode_failed');
      warnings.add('Receipt image bytes could not be decoded.');
      return _rejectedResult(
        request: request,
        sourceContentType: sourceContentType,
        sourceLabel: sourceLabel,
        status: ReceiptImageArtifactStatus.unsupported,
        reasonCodes: reasonCodes,
        warnings: warnings,
        cacheReadiness: cacheReadiness,
      );
    }

    reasonCodes.add('normalized_jpeg_produced');
    reasonCodes.add('thumbnail_jpeg_produced');
    reasonCodes.addAll(cacheReadiness.reasonCodes);
    warnings.add(cacheReadiness.message);

    // Bound the decoded pixels before EXIF orientation can allocate a second
    // full-resolution buffer. Rotation preserves the maximum dimension, so
    // pre-orientation bounding keeps the normalized geometry contract intact.
    final boundedImage = _boundedForOcr(decodedImage);
    if (!identical(boundedImage, decodedImage)) {
      reasonCodes.add('normalized_dimensions_bounded');
    }
    final normalizedImage = img.bakeOrientation(boundedImage);
    final jpegQuality = request.jpegQuality.clamp(1, 100).toInt();
    final normalizedBytes = Uint8List.fromList(
      img.encodeJpg(normalizedImage, quality: jpegQuality),
    );
    final thumbnailImage = _thumbnailFor(
      normalizedImage,
      maxDimension: request.thumbnailMaxDimension,
    );
    final thumbnailBytes = Uint8List.fromList(
      img.encodeJpg(thumbnailImage, quality: jpegQuality),
    );

    return ReceiptImageArtifactResult(
      status: ReceiptImageArtifactStatus.accepted,
      sourceType: request.sourceType,
      sourceContentType: sourceContentType,
      sourceLabel: sourceLabel,
      originalRetainedByPolicy: originalRetainedByPolicy,
      normalizedContentType: normalizedJpegContentType,
      normalizedJpegBytes: normalizedBytes,
      thumbnailJpegBytes: thumbnailBytes,
      sourceSizeBytes: sourceBytes.length,
      normalizedSizeBytes: normalizedBytes.length,
      thumbnailSizeBytes: thumbnailBytes.length,
      width: normalizedImage.width,
      height: normalizedImage.height,
      thumbnailWidth: thumbnailImage.width,
      thumbnailHeight: thumbnailImage.height,
      warnings: warnings.toList(growable: false),
      reasonCodes: reasonCodes.toList(growable: false),
      cacheReadiness: cacheReadiness,
    );
  }
}

_ReceiptArtifactFileType _decoderType(img.Decoder decoder) {
  if (decoder is img.JpegDecoder) return _ReceiptArtifactFileType.jpeg;
  if (decoder is img.PngDecoder) return _ReceiptArtifactFileType.png;
  if (decoder is img.WebPDecoder) return _ReceiptArtifactFileType.webp;
  return _ReceiptArtifactFileType.unknown;
}

ReceiptImageArtifactResult _decodeFailedResult({
  required ReceiptImageArtifactRequest request,
  required String sourceContentType,
  required String sourceLabel,
  required List<String> reasonCodes,
  required List<String> warnings,
  required ReceiptArtifactCacheReadiness cacheReadiness,
}) {
  reasonCodes.add('image_decode_failed');
  warnings.add('Receipt image bytes could not be decoded.');
  return _rejectedResult(
    request: request,
    sourceContentType: sourceContentType,
    sourceLabel: sourceLabel,
    status: ReceiptImageArtifactStatus.unsupported,
    reasonCodes: reasonCodes,
    warnings: warnings,
    cacheReadiness: cacheReadiness,
  );
}

ReceiptImageArtifactResult _rejectedResult({
  required ReceiptImageArtifactRequest request,
  required String sourceContentType,
  required String sourceLabel,
  required ReceiptImageArtifactStatus status,
  required List<String> reasonCodes,
  required List<String> warnings,
  required ReceiptArtifactCacheReadiness cacheReadiness,
}) {
  reasonCodes.addAll(cacheReadiness.reasonCodes);
  warnings.add(cacheReadiness.message);
  return ReceiptImageArtifactResult(
    status: status,
    sourceType: request.sourceType,
    sourceContentType: sourceContentType,
    sourceLabel: sourceLabel,
    originalRetainedByPolicy: cacheReadiness.originalRetainedByPolicy,
    normalizedContentType: null,
    normalizedJpegBytes: null,
    thumbnailJpegBytes: null,
    sourceSizeBytes: request.sourceBytes.length,
    normalizedSizeBytes: null,
    thumbnailSizeBytes: null,
    width: null,
    height: null,
    thumbnailWidth: null,
    thumbnailHeight: null,
    warnings: warnings.toList(growable: false),
    reasonCodes: reasonCodes.toList(growable: false),
    cacheReadiness: cacheReadiness,
  );
}

img.Image _boundedForOcr(img.Image source) {
  if (source.width <= ReceiptImageArtifactProcessor.maxNormalizedDimension &&
      source.height <= ReceiptImageArtifactProcessor.maxNormalizedDimension) {
    return source;
  }
  if (source.width >= source.height) {
    return img.copyResize(
      source,
      width: ReceiptImageArtifactProcessor.maxNormalizedDimension,
    );
  }
  return img.copyResize(
    source,
    height: ReceiptImageArtifactProcessor.maxNormalizedDimension,
  );
}

img.Image _thumbnailFor(img.Image source, {required int maxDimension}) {
  final boundedMax = maxDimension.clamp(1, 4096).toInt();
  if (source.width <= boundedMax && source.height <= boundedMax) {
    return img.copyResize(source, width: source.width, height: source.height);
  }

  if (source.width >= source.height) {
    return img.copyResize(source, width: boundedMax);
  }

  return img.copyResize(source, height: boundedMax);
}

enum _ReceiptArtifactFileType { jpeg, png, webp, pdf, heic, unknown }

_ReceiptArtifactFileType _receiptArtifactFileType({
  required String mediaType,
  required String? extension,
}) {
  if (mediaType == 'image/jpeg' ||
      mediaType == 'image/jpg' ||
      extension == 'jpg' ||
      extension == 'jpeg') {
    return _ReceiptArtifactFileType.jpeg;
  }
  if (mediaType == 'image/png' || extension == 'png') {
    return _ReceiptArtifactFileType.png;
  }
  if (mediaType == 'image/webp' || extension == 'webp') {
    return _ReceiptArtifactFileType.webp;
  }
  if (mediaType == 'application/pdf' || extension == 'pdf') {
    return _ReceiptArtifactFileType.pdf;
  }
  if (mediaType == 'image/heic' ||
      mediaType == 'image/heif' ||
      extension == 'heic' ||
      extension == 'heif') {
    return _ReceiptArtifactFileType.heic;
  }
  return _ReceiptArtifactFileType.unknown;
}

String _safeSourceLabel(String? label) {
  final normalized = label?.replaceAll('\\', '/').split('/').last.trim();
  if (normalized == null || normalized.isEmpty) {
    return 'Receipt file';
  }

  final withoutControls = normalized.replaceAll(RegExp(r'[\x00-\x1F\x7F]'), '');
  if (withoutControls.isEmpty) {
    return 'Receipt file';
  }

  return withoutControls.length <= 80
      ? withoutControls
      : withoutControls.substring(0, 80);
}

String _normalizedToken(String value) {
  return value.trim().toLowerCase();
}

String? _normalizedExtension(String? extension) {
  final normalized = extension?.trim().toLowerCase();
  if (normalized == null || normalized.isEmpty) {
    return null;
  }
  return normalized.startsWith('.') ? normalized.substring(1) : normalized;
}
