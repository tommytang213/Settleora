part of 'bill_attachment_section.dart';

const _uploadBillAttachmentLabel = 'Upload bill attachment';
const _refreshBillAttachmentsLabel = 'Refresh bill attachments';
const _retryBillAttachmentsLabel = 'Retry loading bill attachments';
const _openBillAttachmentLabel = 'Open bill attachment';
const _removeBillAttachmentLabel = 'Remove bill attachment';
const _reviewReceiptOcrLabel = 'Review receipt OCR';
const _uploadAsReceiptLabel = 'Upload as receipt';
const _uploadAsSupportingAttachmentLabel = 'Upload as supporting attachment';
const _cancelAttachmentUploadLabel = 'Cancel attachment upload';
const _cancelRemoveBillAttachmentLabel = 'Cancel attachment removal';
const _confirmRemoveBillAttachmentLabel = 'Confirm remove bill attachment';
const _billAttachmentBusyDisabledSemanticLabel =
    'Disabled while attachment work is in progress';

class _AttachmentSemanticButtonLabel extends StatelessWidget {
  const _AttachmentSemanticButtonLabel({
    required this.label,
    required this.child,
    this.enabled = true,
    this.onTap,
  });

  final String label;
  final Widget child;
  final bool enabled;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final semanticLabel = enabled
        ? label
        : '$label. $_billAttachmentBusyDisabledSemanticLabel.';

    return Tooltip(
      message: label,
      child: Semantics(
        button: true,
        enabled: enabled,
        excludeSemantics: true,
        label: semanticLabel,
        onTap: enabled ? onTap : null,
        child: child,
      ),
    );
  }
}

class _AttachmentTileMetadata {
  const _AttachmentTileMetadata({
    required this.purposeLabel,
    required this.purposeIcon,
    required this.contentTypeLabel,
    required this.sizeLabel,
    required this.uploadedAtLabel,
    required this.updatedAtLabel,
  });

  factory _AttachmentTileMetadata.from(SettleoraBillAttachment attachment) {
    return _AttachmentTileMetadata(
      purposeLabel: _attachmentPurposeLabel(attachment.purpose),
      purposeIcon: _attachmentPurposeIcon(attachment.purpose),
      contentTypeLabel: _safeAttachmentContentTypeLabel(attachment.contentType),
      sizeLabel: _formatBytes(attachment.sizeBytes),
      uploadedAtLabel: _formatTimestamp(attachment.uploadedAtUtc),
      updatedAtLabel: _formatTimestamp(attachment.updatedAtUtc),
    );
  }

  final String purposeLabel;
  final IconData purposeIcon;
  final String contentTypeLabel;
  final String sizeLabel;
  final String uploadedAtLabel;
  final String updatedAtLabel;
}

String _formatBytes(int sizeBytes) {
  if (sizeBytes < 0) {
    return 'Unknown size';
  }

  if (sizeBytes < 1024) {
    return '$sizeBytes bytes';
  }

  final kib = sizeBytes / 1024;
  if (kib < 1024) {
    return '${kib.toStringAsFixed(1)} KiB';
  }

  return '${(kib / 1024).toStringAsFixed(1)} MiB';
}

String _formatTimestamp(DateTime value) {
  return value.toLocal().toString().split('.').first;
}

String _attachmentPurposeLabel(SettleoraBillAttachmentPurpose purpose) {
  return switch (purpose) {
    SettleoraBillAttachmentPurposeValues.receipt => 'Receipt',
    SettleoraBillAttachmentPurposeValues.supportingAttachment =>
      'Supporting attachment',
    _ => 'Attachment',
  };
}

IconData _attachmentPurposeIcon(SettleoraBillAttachmentPurpose purpose) {
  return switch (purpose) {
    SettleoraBillAttachmentPurposeValues.receipt => Icons.receipt_long_outlined,
    SettleoraBillAttachmentPurposeValues.supportingAttachment =>
      Icons.attach_file_outlined,
    _ => Icons.insert_drive_file_outlined,
  };
}

String _safeAttachmentContentTypeLabel(String contentType) {
  final trimmed = contentType.trim().toLowerCase();
  if (trimmed.isEmpty ||
      trimmed.length > 128 ||
      _containsUnsafeAttachmentMetadataDetail(trimmed) ||
      !RegExp(
        r'^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$',
      ).hasMatch(trimmed)) {
    return 'Unknown type';
  }

  return trimmed;
}

String _attachmentSummarySemanticLabel(_AttachmentTileMetadata metadata) {
  return 'Bill attachment. Purpose: ${metadata.purposeLabel}. '
      'Content type: ${metadata.contentTypeLabel}. '
      'Size: ${metadata.sizeLabel}. '
      'Uploaded: ${metadata.uploadedAtLabel}. '
      'Updated: ${metadata.updatedAtLabel}.';
}

bool _containsUnsafeAttachmentMetadataDetail(String value) {
  final lower = value.toLowerCase();
  return lower.contains('stacktrace') ||
      lower.contains('exception') ||
      lower.contains('token') ||
      lower.contains('raw bytes') ||
      lower.contains('object key') ||
      lower.contains('storage path') ||
      lower.contains('filesystem') ||
      lower.contains('s3://') ||
      lower.contains('gs://') ||
      lower.contains('/var/') ||
      lower.contains('/tmp/') ||
      lower.contains('\\users\\') ||
      lower.contains('c:\\') ||
      RegExp(r'\[[0-9,\s]+\]').hasMatch(value);
}

IconData _attachmentFailureIcon(SettleoraBillAttachmentFailureKind kind) {
  return switch (kind) {
    SettleoraBillAttachmentFailureKind.sessionRequired => Icons.lock_outline,
    SettleoraBillAttachmentFailureKind.sessionExpired => Icons.lock_outline,
    SettleoraBillAttachmentFailureKind.denied => Icons.no_accounts_outlined,
    SettleoraBillAttachmentFailureKind.unavailable =>
      Icons.visibility_off_outlined,
    SettleoraBillAttachmentFailureKind.conflict => Icons.sync_problem_outlined,
    SettleoraBillAttachmentFailureKind.validation =>
      Icons.report_problem_outlined,
    SettleoraBillAttachmentFailureKind.network => Icons.cloud_off_outlined,
    SettleoraBillAttachmentFailureKind.server => Icons.error_outline,
  };
}

String _safeAttachmentFailureDisplayMessage(
  SettleoraBillAttachmentFailure failure,
) {
  final message = failure.message.trim();
  if (message.isEmpty || _containsUnsafeAttachmentFailureDetail(message)) {
    return _fallbackAttachmentFailureMessage(failure.kind);
  }

  return message;
}

bool _containsUnsafeAttachmentFailureDetail(String message) {
  final lower = message.toLowerCase();
  return lower.contains('stacktrace') ||
      lower.contains('exception') ||
      lower.contains('token') ||
      lower.contains('raw bytes') ||
      lower.contains('object key') ||
      lower.contains('storage path') ||
      lower.contains('filesystem') ||
      lower.contains('s3://') ||
      lower.contains('gs://') ||
      lower.contains('/var/') ||
      lower.contains('/tmp/') ||
      lower.contains('\\users\\') ||
      lower.contains('c:\\') ||
      RegExp(r'\[[0-9,\s]+\]').hasMatch(message);
}

String _fallbackAttachmentFailureMessage(
  SettleoraBillAttachmentFailureKind kind,
) {
  return switch (kind) {
    SettleoraBillAttachmentFailureKind.sessionRequired =>
      'Sign in before loading attachments.',
    SettleoraBillAttachmentFailureKind.sessionExpired =>
      'Your session has expired. Sign in again before loading attachments.',
    SettleoraBillAttachmentFailureKind.denied =>
      'Attachments are not available to this account.',
    SettleoraBillAttachmentFailureKind.unavailable =>
      'The attachment is no longer available.',
    SettleoraBillAttachmentFailureKind.conflict =>
      'Refresh the bill attachments and try again.',
    SettleoraBillAttachmentFailureKind.validation =>
      'The attachment request is no longer valid. Refresh and try again.',
    SettleoraBillAttachmentFailureKind.network =>
      'The server is unavailable. Try again when the connection is back.',
    SettleoraBillAttachmentFailureKind.server =>
      'Attachments are unavailable right now. Try again later.',
  };
}

SettleoraBillAttachmentFailure _attachmentFailureFromUploadError(Object error) {
  if (error is SettleoraBillAttachmentFileInputFailure) {
    return SettleoraBillAttachmentFailure(
      kind: SettleoraBillAttachmentFailureKind.validation,
      message: _safeAttachmentFileInputFailureMessage(error.message),
    );
  }

  return SettleoraBillAttachmentFailure.from(error);
}

String _safeAttachmentFileInputFailureMessage(String message) {
  return switch (message) {
    'Choose a PNG, JPG, WEBP, or PDF attachment.' => message,
    'Choose a supported bill attachment file.' => message,
    'Choose a non-empty file before uploading an attachment.' => message,
    'Choose a named file before uploading an attachment.' => message,
    _ => 'Choose a supported, readable bill attachment file and try again.',
  };
}

String _uploadSuccessMessage(SettleoraBillAttachmentPurpose purpose) {
  return switch (purpose) {
    SettleoraBillAttachmentPurposeValues.receipt =>
      'Receipt uploaded. Review OCR before applying it to a draft.',
    _ => 'Attachment uploaded.',
  };
}
