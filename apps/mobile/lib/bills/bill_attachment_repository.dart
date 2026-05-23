typedef SettleoraBillAttachmentPurpose = String;

class SettleoraBillAttachmentPurposeValues {
  const SettleoraBillAttachmentPurposeValues._();

  static const SettleoraBillAttachmentPurpose receipt = 'receipt';
  static const SettleoraBillAttachmentPurpose supportingAttachment =
      'supporting_attachment';

  static const Set<SettleoraBillAttachmentPurpose> values = {
    receipt,
    supportingAttachment,
  };
}

enum SettleoraBillAttachmentFailureKind {
  sessionRequired,
  sessionExpired,
  denied,
  unavailable,
  conflict,
  validation,
  network,
  server,
}

class SettleoraBillAttachmentFailure implements Exception {
  const SettleoraBillAttachmentFailure({
    required this.kind,
    required this.message,
    this.statusCode,
  });

  factory SettleoraBillAttachmentFailure.from(Object error) {
    if (error is SettleoraBillAttachmentFailure) {
      return error;
    }

    return const SettleoraBillAttachmentFailure(
      kind: SettleoraBillAttachmentFailureKind.network,
      message:
          'The server is unavailable. Try again when the connection is back.',
    );
  }

  final SettleoraBillAttachmentFailureKind kind;
  final String message;
  final int? statusCode;

  String get title {
    return switch (kind) {
      SettleoraBillAttachmentFailureKind.sessionRequired => 'Sign in required',
      SettleoraBillAttachmentFailureKind.sessionExpired => 'Sign in again',
      SettleoraBillAttachmentFailureKind.denied => 'Attachments unavailable',
      SettleoraBillAttachmentFailureKind.unavailable =>
        'Attachment unavailable',
      SettleoraBillAttachmentFailureKind.conflict => 'Refresh required',
      SettleoraBillAttachmentFailureKind.validation => 'Unsupported request',
      SettleoraBillAttachmentFailureKind.network => 'Server unavailable',
      SettleoraBillAttachmentFailureKind.server => 'Attachments unavailable',
    };
  }

  @override
  String toString() =>
      'SettleoraBillAttachmentFailure($kind, statusCode: $statusCode)';
}

class SettleoraBillAttachmentRoute {
  const SettleoraBillAttachmentRoute({required this.billId, this.groupId});

  const SettleoraBillAttachmentRoute.personal(String billId)
    : this(billId: billId);

  const SettleoraBillAttachmentRoute.group({
    required String groupId,
    required String billId,
  }) : this(billId: billId, groupId: groupId);

  final String billId;
  final String? groupId;

  bool get isGroupBill => groupId != null;
}

class SettleoraBillAttachment {
  const SettleoraBillAttachment({
    required this.fileId,
    required this.billId,
    required this.purpose,
    required this.contentType,
    required this.sizeBytes,
    required this.uploadedAtUtc,
    required this.updatedAtUtc,
  });

  final String fileId;
  final String billId;
  final SettleoraBillAttachmentPurpose purpose;
  final String contentType;
  final int sizeBytes;
  final DateTime uploadedAtUtc;
  final DateTime updatedAtUtc;
}

class SettleoraBillAttachmentUpload {
  const SettleoraBillAttachmentUpload({
    required this.bytes,
    required this.filename,
    required this.contentType,
    required this.purpose,
  });

  final List<int> bytes;
  final String filename;
  final String contentType;
  final SettleoraBillAttachmentPurpose purpose;
}

class SettleoraBillAttachmentContent {
  SettleoraBillAttachmentContent({required List<int> bytes})
    : bytes = List.unmodifiable(bytes);

  final List<int> bytes;
}

abstract class SettleoraBillAttachmentRepository {
  Future<List<SettleoraBillAttachment>> listAttachments(
    SettleoraBillAttachmentRoute route,
  );

  Future<SettleoraBillAttachment> attachAttachment(
    SettleoraBillAttachmentRoute route,
    SettleoraBillAttachmentUpload upload,
  );

  Future<void> removeAttachment(
    SettleoraBillAttachmentRoute route,
    String fileId,
  );

  Future<SettleoraBillAttachmentContent> downloadAttachmentContent(
    SettleoraBillAttachmentRoute route,
    String fileId,
  );
}
