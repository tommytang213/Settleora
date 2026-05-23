import 'bill_attachment_repository.dart';

abstract interface class SettleoraBillAttachmentFileInput {
  Future<SettleoraPickedBillAttachmentFile?> pickAttachmentFile({
    required Set<String> allowedContentTypes,
  });
}

class SettleoraPickedBillAttachmentFile {
  SettleoraPickedBillAttachmentFile({
    required this.filename,
    required this.contentType,
    required List<int> bytes,
  }) : bytes = List.unmodifiable(bytes);

  final String filename;
  final String contentType;
  final List<int> bytes;
}

class SettleoraBillAttachmentFileInputFailure implements Exception {
  const SettleoraBillAttachmentFileInputFailure(this.message);

  final String message;

  @override
  String toString() => 'SettleoraBillAttachmentFileInputFailure';
}

class SettleoraBillAttachmentContentTypeValues {
  const SettleoraBillAttachmentContentTypeValues._();

  static const String imagePng = 'image/png';
  static const String imageJpeg = 'image/jpeg';
  static const String imageWebp = 'image/webp';
  static const String applicationPdf = 'application/pdf';

  static const Set<String> receiptValues = {imagePng, imageJpeg, imageWebp};

  static const Set<String> supportingAttachmentValues = {
    imagePng,
    imageJpeg,
    imageWebp,
    applicationPdf,
  };
}

const SettleoraBillAttachmentPurpose defaultBillAttachmentUploadPurpose =
    SettleoraBillAttachmentPurposeValues.supportingAttachment;

Set<String> billAttachmentUploadContentTypesForPurpose(
  SettleoraBillAttachmentPurpose purpose,
) {
  return switch (purpose) {
    SettleoraBillAttachmentPurposeValues.receipt =>
      SettleoraBillAttachmentContentTypeValues.receiptValues,
    SettleoraBillAttachmentPurposeValues.supportingAttachment =>
      SettleoraBillAttachmentContentTypeValues.supportingAttachmentValues,
    _ => SettleoraBillAttachmentContentTypeValues.supportingAttachmentValues,
  };
}

List<String> billAttachmentFileExtensionsForContentTypes(
  Set<String> allowedContentTypes,
) {
  final extensions = <String>[];
  for (final contentType in allowedContentTypes) {
    switch (contentType) {
      case SettleoraBillAttachmentContentTypeValues.imagePng:
        extensions.add('png');
        break;
      case SettleoraBillAttachmentContentTypeValues.imageJpeg:
        extensions.addAll(['jpg', 'jpeg']);
        break;
      case SettleoraBillAttachmentContentTypeValues.imageWebp:
        extensions.add('webp');
        break;
      case SettleoraBillAttachmentContentTypeValues.applicationPdf:
        extensions.add('pdf');
        break;
    }
  }

  return extensions;
}

String billAttachmentContentTypeForFilename(String filename) {
  final extension = _extensionFor(filename);
  return switch (extension) {
    'png' => SettleoraBillAttachmentContentTypeValues.imagePng,
    'jpg' || 'jpeg' => SettleoraBillAttachmentContentTypeValues.imageJpeg,
    'webp' => SettleoraBillAttachmentContentTypeValues.imageWebp,
    'pdf' => SettleoraBillAttachmentContentTypeValues.applicationPdf,
    _ => throw const SettleoraBillAttachmentFileInputFailure(
      'Choose a PNG, JPG, WEBP, or PDF attachment.',
    ),
  };
}

SettleoraPickedBillAttachmentFile pickedBillAttachmentFileFromBytes({
  required String filename,
  required String contentType,
  required List<int> bytes,
  required Set<String> allowedContentTypes,
}) {
  final safeFilename = _safeFilename(filename);
  final normalizedContentType = contentType.trim().toLowerCase();
  if (!allowedContentTypes.contains(normalizedContentType)) {
    throw const SettleoraBillAttachmentFileInputFailure(
      'Choose a supported bill attachment file.',
    );
  }

  if (bytes.isEmpty) {
    throw const SettleoraBillAttachmentFileInputFailure(
      'Choose a non-empty file before uploading an attachment.',
    );
  }

  return SettleoraPickedBillAttachmentFile(
    filename: safeFilename,
    contentType: normalizedContentType,
    bytes: bytes,
  );
}

String _safeFilename(String filename) {
  final withoutPath = filename.replaceAll('\\', '/').split('/').last.trim();
  final withoutControls = withoutPath.replaceAll(
    RegExp(r'[\x00-\x1F\x7F]'),
    '',
  );
  if (withoutControls.isEmpty ||
      withoutControls == '.' ||
      withoutControls == '..') {
    throw const SettleoraBillAttachmentFileInputFailure(
      'Choose a named file before uploading an attachment.',
    );
  }

  if (withoutControls.length <= 160) {
    return withoutControls;
  }

  final extension = _extensionFor(withoutControls);
  if (extension.isEmpty || extension.length > 20) {
    return withoutControls.substring(0, 160);
  }

  final suffix = '.$extension';
  final baseLength = 160 - suffix.length;
  return '${withoutControls.substring(0, baseLength)}$suffix';
}

String _extensionFor(String filename) {
  final safeFilename = filename.replaceAll('\\', '/').split('/').last.trim();
  final dotIndex = safeFilename.lastIndexOf('.');
  if (dotIndex < 0 || dotIndex == safeFilename.length - 1) {
    return '';
  }

  return safeFilename.substring(dotIndex + 1).toLowerCase();
}
