import 'package:flutter/material.dart';

import '../receipt_ocr_review/receipt_ocr_review_repository.dart';
import '../receipt_ocr_review/receipt_ocr_review_screen.dart';
import 'bill_attachment_file_input.dart';
import 'bill_attachment_repository.dart';

class BillAttachmentSection extends StatefulWidget {
  const BillAttachmentSection({
    super.key,
    required this.keyPrefix,
    required this.reloadRevision,
    required this.route,
    required this.repository,
    required this.fileInput,
    required this.receiptOcrReviewRepository,
  });

  final String keyPrefix;
  final int reloadRevision;
  final SettleoraBillAttachmentRoute route;
  final SettleoraBillAttachmentRepository repository;
  final SettleoraBillAttachmentFileInput? fileInput;
  final ReceiptOcrReviewRepository? receiptOcrReviewRepository;

  @override
  State<BillAttachmentSection> createState() => _BillAttachmentSectionState();
}

class _BillAttachmentSectionState extends State<BillAttachmentSection> {
  bool _isLoading = true;
  bool _loadInFlight = false;
  bool _isSelectingUploadPurpose = false;
  bool _isUploading = false;
  String? _downloadingFileId;
  String? _removingFileId;
  List<SettleoraBillAttachment> _attachments = const [];
  SettleoraBillAttachmentFailure? _failure;
  int _loadGeneration = 0;
  String? _activeLoadBillId;
  String? _activeLoadGroupId;
  int? _activeLoadRevision;
  int _downloadGeneration = 0;
  String? _activeDownloadBillId;
  String? _activeDownloadGroupId;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  @override
  void didUpdateWidget(BillAttachmentSection oldWidget) {
    super.didUpdateWidget(oldWidget);
    final routeChanged =
        oldWidget.repository != widget.repository ||
        oldWidget.route.billId != widget.route.billId ||
        oldWidget.route.groupId != widget.route.groupId;
    if (routeChanged) {
      setState(() {
        _downloadGeneration += 1;
        _downloadingFileId = null;
        _activeDownloadBillId = null;
        _activeDownloadGroupId = null;
      });
    }
    if (routeChanged ||
        oldWidget.fileInput != widget.fileInput ||
        oldWidget.reloadRevision != widget.reloadRevision) {
      Future<void>.microtask(_load);
    }
  }

  Future<void> _load() async {
    await _loadAttachments();
  }

  Future<List<SettleoraBillAttachment>?> _loadAttachments({
    bool showLoading = true,
    bool rethrowFailure = false,
  }) async {
    if (!mounted) {
      return null;
    }

    if (_loadInFlight &&
        _activeLoadBillId == widget.route.billId &&
        _activeLoadGroupId == widget.route.groupId &&
        _activeLoadRevision == widget.reloadRevision) {
      return _attachments;
    }

    final loadGeneration = _loadGeneration + 1;
    final loadBillId = widget.route.billId;
    final loadGroupId = widget.route.groupId;
    final loadRevision = widget.reloadRevision;

    setState(() {
      _loadGeneration = loadGeneration;
      _loadInFlight = true;
      _activeLoadBillId = loadBillId;
      _activeLoadGroupId = loadGroupId;
      _activeLoadRevision = loadRevision;
      if (showLoading) {
        _isLoading = true;
      }
      _failure = null;
    });

    try {
      final attachments = await widget.repository.listAttachments(widget.route);
      if (!_isCurrentLoad(
        loadGeneration,
        billId: loadBillId,
        groupId: loadGroupId,
        reloadRevision: loadRevision,
      )) {
        return attachments;
      }

      setState(() {
        _attachments = attachments;
        _isLoading = false;
        _loadInFlight = false;
        _failure = null;
      });
      return attachments;
    } catch (error) {
      if (!_isCurrentLoad(
        loadGeneration,
        billId: loadBillId,
        groupId: loadGroupId,
        reloadRevision: loadRevision,
      )) {
        if (rethrowFailure) {
          rethrow;
        }
        return null;
      }

      setState(() {
        _failure = SettleoraBillAttachmentFailure.from(error);
        _isLoading = false;
        _loadInFlight = false;
      });
      if (rethrowFailure) {
        rethrow;
      }
      return null;
    }
  }

  Future<void> _download(SettleoraBillAttachment attachment) async {
    if (_attachmentActionsBlocked ||
        !_attachments.any((item) => item.fileId == attachment.fileId)) {
      return;
    }

    final route = widget.route;
    final fileId = attachment.fileId;
    final downloadGeneration = _downloadGeneration + 1;
    setState(() {
      _downloadGeneration = downloadGeneration;
      _downloadingFileId = fileId;
      _activeDownloadBillId = route.billId;
      _activeDownloadGroupId = route.groupId;
      _failure = null;
    });

    try {
      final content = await widget.repository.downloadAttachmentContent(
        route,
        fileId,
      );
      if (!_isCurrentDownload(
        downloadGeneration,
        billId: route.billId,
        groupId: route.groupId,
        fileId: fileId,
      )) {
        return;
      }

      _showSnackBar('Downloaded ${content.bytes.length} bytes.');
    } catch (error) {
      if (!_isCurrentDownload(
        downloadGeneration,
        billId: route.billId,
        groupId: route.groupId,
        fileId: fileId,
      )) {
        return;
      }

      setState(() {
        _failure = SettleoraBillAttachmentFailure.from(error);
      });
    } finally {
      if (_isCurrentDownload(
        downloadGeneration,
        billId: route.billId,
        groupId: route.groupId,
        fileId: fileId,
      )) {
        setState(() {
          _downloadingFileId = null;
          _activeDownloadBillId = null;
          _activeDownloadGroupId = null;
        });
      }
    }
  }

  Future<void> _confirmRemove(SettleoraBillAttachment attachment) async {
    if (_attachmentActionsBlocked) {
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remove attachment?'),
        content: const Text('This will remove the attachment from the bill.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            key: Key('${widget.keyPrefix}-remove-confirm'),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );

    if (!mounted || confirmed != true) {
      return;
    }

    if (_attachmentActionsBlocked ||
        !_attachments.any((item) => item.fileId == attachment.fileId)) {
      return;
    }

    await _remove(attachment);
  }

  Future<void> _remove(SettleoraBillAttachment attachment) async {
    if (_removingFileId != null) {
      return;
    }

    setState(() {
      _removingFileId = attachment.fileId;
      _failure = null;
    });

    try {
      await widget.repository.removeAttachment(widget.route, attachment.fileId);
      if (!mounted) {
        return;
      }

      setState(() {
        _attachments = [
          for (final item in _attachments)
            if (item.fileId != attachment.fileId) item,
        ];
      });
      _showSnackBar('Attachment removed.');
      try {
        await _loadAttachments(showLoading: false, rethrowFailure: true);
      } catch (_) {
        // _loadAttachments records a sanitized refresh failure while keeping the
        // already-filtered list so removed-row actions do not come back.
      }
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _failure = SettleoraBillAttachmentFailure.from(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _removingFileId = null;
        });
      }
    }
  }

  Future<void> _upload() async {
    final fileInput = widget.fileInput;
    if (fileInput == null ||
        _isLoading ||
        _isSelectingUploadPurpose ||
        _isUploading ||
        _downloadingFileId != null ||
        _removingFileId != null) {
      return;
    }

    setState(() {
      _isSelectingUploadPurpose = true;
      _failure = null;
    });

    try {
      final purpose = await _selectUploadPurpose();
      if (!mounted || purpose == null) {
        return;
      }

      setState(() {
        _isSelectingUploadPurpose = false;
        _isUploading = true;
      });

      final pickedFile = await fileInput.pickAttachmentFile(
        allowedContentTypes: billAttachmentUploadContentTypesForPurpose(
          purpose,
        ),
      );
      if (!mounted || pickedFile == null) {
        return;
      }

      final uploadedAttachment = await widget.repository.attachAttachment(
        widget.route,
        SettleoraBillAttachmentUpload(
          bytes: pickedFile.bytes,
          filename: pickedFile.filename,
          contentType: pickedFile.contentType,
          purpose: purpose,
        ),
      );
      if (!mounted) {
        return;
      }

      var refreshedAttachments = const <SettleoraBillAttachment>[];
      try {
        refreshedAttachments =
            await _loadAttachments(showLoading: false, rethrowFailure: true) ??
            const <SettleoraBillAttachment>[];
      } catch (_) {
        refreshedAttachments = const <SettleoraBillAttachment>[];
      }
      if (!mounted) {
        return;
      }

      _showUploadSuccessSnackBar(
        purpose,
        reviewAttachment: _receiptReviewAttachmentForUpload(
          purpose: purpose,
          uploadedAttachment: uploadedAttachment,
          refreshedAttachments: refreshedAttachments,
        ),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _failure = _attachmentFailureFromUploadError(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSelectingUploadPurpose = false;
          _isUploading = false;
        });
      }
    }
  }

  Future<SettleoraBillAttachmentPurpose?> _selectUploadPurpose() {
    return showModalBottomSheet<SettleoraBillAttachmentPurpose>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const ListTile(
              title: Text('Upload attachment as'),
              subtitle: Text('Choose how the server should process this file.'),
            ),
            ListTile(
              key: const Key('attachment-upload-purpose-receipt'),
              leading: const Icon(Icons.receipt_long_outlined),
              title: const Text('Receipt'),
              onTap: () => Navigator.of(
                context,
              ).pop(SettleoraBillAttachmentPurposeValues.receipt),
            ),
            ListTile(
              key: const Key('attachment-upload-purpose-supporting'),
              leading: const Icon(Icons.attach_file_outlined),
              title: const Text('Supporting attachment'),
              onTap: () => Navigator.of(
                context,
              ).pop(SettleoraBillAttachmentPurposeValues.supportingAttachment),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
              child: Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  key: const Key('attachment-upload-purpose-cancel'),
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Cancel'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _openOcrReview(SettleoraBillAttachment attachment) {
    final repository = widget.receiptOcrReviewRepository;
    if (repository == null || _attachmentActionsBlocked) {
      return;
    }

    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ReceiptOcrReviewDetailScreen.forRoute(
          repository: repository,
          route: ReceiptOcrReviewRoute(
            billId: widget.route.billId,
            fileId: attachment.fileId,
            groupId: widget.route.groupId,
          ),
        ),
      ),
    );
  }

  SettleoraBillAttachment? _receiptReviewAttachmentForUpload({
    required SettleoraBillAttachmentPurpose purpose,
    required SettleoraBillAttachment uploadedAttachment,
    required List<SettleoraBillAttachment> refreshedAttachments,
  }) {
    if (purpose != SettleoraBillAttachmentPurposeValues.receipt ||
        widget.receiptOcrReviewRepository == null) {
      return null;
    }

    for (final attachment in refreshedAttachments) {
      if (attachment.fileId == uploadedAttachment.fileId &&
          attachment.purpose == SettleoraBillAttachmentPurposeValues.receipt) {
        return attachment;
      }
    }

    return null;
  }

  void _showUploadSuccessSnackBar(
    SettleoraBillAttachmentPurpose purpose, {
    SettleoraBillAttachment? reviewAttachment,
  }) {
    _showSnackBar(
      _uploadSuccessMessage(purpose),
      action: reviewAttachment == null
          ? null
          : SnackBarAction(
              label: 'Review receipt',
              onPressed: () => _openOcrReview(reviewAttachment),
            ),
    );
  }

  void _showSnackBar(String message, {SnackBarAction? action}) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message), action: action));
  }

  bool _isCurrentLoad(
    int loadGeneration, {
    required String billId,
    required String? groupId,
    required int reloadRevision,
  }) {
    return mounted &&
        _loadGeneration == loadGeneration &&
        widget.route.billId == billId &&
        widget.route.groupId == groupId &&
        widget.reloadRevision == reloadRevision;
  }

  bool _isCurrentDownload(
    int downloadGeneration, {
    required String billId,
    required String? groupId,
    required String fileId,
  }) {
    return mounted &&
        _downloadGeneration == downloadGeneration &&
        _downloadingFileId == fileId &&
        _activeDownloadBillId == billId &&
        _activeDownloadGroupId == groupId &&
        widget.route.billId == billId &&
        widget.route.groupId == groupId;
  }

  bool get _attachmentActionsBlocked =>
      _isLoading ||
      _loadInFlight ||
      _isSelectingUploadPurpose ||
      _isUploading ||
      _downloadingFileId != null ||
      _removingFileId != null;

  @override
  Widget build(BuildContext context) {
    final failure = _failure;
    final attachmentActionDisabled = _attachmentActionsBlocked;
    final downloadingFileId = _downloadingFileId;
    final removingFileId = _removingFileId;
    final hasAttachments = _attachments.isNotEmpty;

    return _AttachmentSectionContainer(
      title: 'Attachments',
      children: [
        Row(
          children: [
            const Expanded(
              child: Text(
                'Server-authorized bill files',
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (widget.fileInput != null)
              OutlinedButton.icon(
                key: Key('${widget.keyPrefix}-upload'),
                onPressed: attachmentActionDisabled ? null : _upload,
                icon: _isUploading
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.upload_file_outlined),
                label: const Text('Upload attachment'),
              ),
            if (widget.fileInput != null) const SizedBox(width: 8),
            IconButton(
              key: Key('${widget.keyPrefix}-refresh'),
              tooltip: 'Refresh attachments',
              onPressed: attachmentActionDisabled ? null : _load,
              icon: _isLoading && hasAttachments
                  ? const SizedBox.square(
                      dimension: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.refresh),
            ),
          ],
        ),
        if (_isUploading) ...[
          const SizedBox(height: 8),
          LinearProgressIndicator(
            key: Key('${widget.keyPrefix}-upload-progress'),
          ),
        ],
        if (removingFileId != null) ...[
          const SizedBox(height: 8),
          _AttachmentRefreshStatus(
            keyPrefix: widget.keyPrefix,
            keySuffix: 'remove-progress',
            label: 'Removing attachment',
          ),
        ],
        const SizedBox(height: 8),
        if (_isLoading && !hasAttachments)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: _AttachmentRefreshStatus(
              keyPrefix: widget.keyPrefix,
              keySuffix: 'loading',
              label: 'Loading attachments',
            ),
          )
        else ...[
          if (_isLoading && hasAttachments) ...[
            _AttachmentRefreshStatus(
              keyPrefix: widget.keyPrefix,
              keySuffix: 'refreshing',
              label: 'Refreshing attachments',
            ),
            const SizedBox(height: 8),
          ],
          if (failure != null) ...[
            _AttachmentFailurePanel(
              keyPrefix: widget.keyPrefix,
              failure: failure,
              onRetry: attachmentActionDisabled ? null : _load,
            ),
            const SizedBox(height: 10),
          ],
          if (hasAttachments)
            for (var index = 0; index < _attachments.length; index += 1)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _AttachmentTile(
                  attachment: _attachments[index],
                  index: index,
                  keyPrefix: widget.keyPrefix,
                  isBusy: attachmentActionDisabled,
                  isDownloading:
                      _attachments[index].fileId == downloadingFileId,
                  isRemoving: _attachments[index].fileId == removingFileId,
                  canOpenOcr:
                      widget.receiptOcrReviewRepository != null &&
                      _attachments[index].purpose ==
                          SettleoraBillAttachmentPurposeValues.receipt,
                  onDownload: () => _download(_attachments[index]),
                  onRemove: () => _confirmRemove(_attachments[index]),
                  onOpenOcr: () => _openOcrReview(_attachments[index]),
                ),
              )
          else if (failure == null)
            const _AttachmentStatePanel(
              icon: Icons.attach_file_outlined,
              title: 'No attachments',
              message: 'Receipts and supporting files will appear here.',
              compact: true,
            ),
        ],
      ],
    );
  }
}

class _AttachmentRefreshStatus extends StatelessWidget {
  const _AttachmentRefreshStatus({
    required this.keyPrefix,
    required this.keySuffix,
    required this.label,
  });

  final String keyPrefix;
  final String keySuffix;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      key: Key('$keyPrefix-$keySuffix'),
      children: [
        const SizedBox.square(
          dimension: 16,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
        const SizedBox(width: 8),
        Text(label, style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}

class _AttachmentTile extends StatelessWidget {
  const _AttachmentTile({
    required this.attachment,
    required this.index,
    required this.keyPrefix,
    required this.isBusy,
    required this.isDownloading,
    required this.isRemoving,
    required this.canOpenOcr,
    required this.onDownload,
    required this.onRemove,
    required this.onOpenOcr,
  });

  final SettleoraBillAttachment attachment;
  final int index;
  final String keyPrefix;
  final bool isBusy;
  final bool isDownloading;
  final bool isRemoving;
  final bool canOpenOcr;
  final VoidCallback onDownload;
  final VoidCallback onRemove;
  final VoidCallback onOpenOcr;

  @override
  Widget build(BuildContext context) {
    final metadata = _AttachmentTileMetadata.from(attachment);

    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.attach_file_outlined),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _AttachmentSoftChip(
                        label: metadata.purposeLabel,
                        icon: metadata.purposeIcon,
                      ),
                      const SizedBox(height: 6),
                      _AttachmentMetadataRows(metadata: metadata),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton.icon(
                  key: ValueKey('$keyPrefix-download-$index'),
                  onPressed: isBusy ? null : onDownload,
                  icon: isDownloading
                      ? SizedBox.square(
                          key: ValueKey('$keyPrefix-download-progress-$index'),
                          dimension: 18,
                          child: const CircularProgressIndicator(
                            strokeWidth: 2,
                          ),
                        )
                      : const Icon(Icons.download_outlined),
                  label: const Text('Download'),
                ),
                OutlinedButton.icon(
                  key: ValueKey('$keyPrefix-remove-$index'),
                  onPressed: isBusy ? null : onRemove,
                  icon: isRemoving
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.delete_outline),
                  label: const Text('Remove'),
                ),
                if (canOpenOcr)
                  OutlinedButton.icon(
                    key: ValueKey('$keyPrefix-ocr-$index'),
                    onPressed: isBusy ? null : onOpenOcr,
                    icon: const Icon(Icons.fact_check_outlined),
                    label: const Text('Review OCR'),
                  ),
              ],
            ),
          ],
        ),
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

class _AttachmentMetadataRows extends StatelessWidget {
  const _AttachmentMetadataRows({required this.metadata});

  final _AttachmentTileMetadata metadata;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _AttachmentKeyValueText(
          label: 'Content type',
          value: metadata.contentTypeLabel,
        ),
        _AttachmentKeyValueText(label: 'Size', value: metadata.sizeLabel),
        _AttachmentKeyValueText(
          label: 'Uploaded',
          value: metadata.uploadedAtLabel,
        ),
        _AttachmentKeyValueText(
          label: 'Updated',
          value: metadata.updatedAtLabel,
        ),
      ],
    );
  }
}

class _AttachmentFailurePanel extends StatelessWidget {
  const _AttachmentFailurePanel({
    required this.keyPrefix,
    required this.failure,
    required this.onRetry,
  });

  final String keyPrefix;
  final SettleoraBillAttachmentFailure failure;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final message = _safeAttachmentFailureDisplayMessage(failure);

    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  _attachmentFailureIcon(failure.kind),
                  color: Theme.of(context).colorScheme.error,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        failure.title,
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                      const SizedBox(height: 4),
                      Text(message),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              key: Key('$keyPrefix-retry'),
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

class _AttachmentSectionContainer extends StatelessWidget {
  const _AttachmentSectionContainer({
    required this.title,
    required this.children,
  });

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        ...children,
      ],
    );
  }
}

class _AttachmentStatePanel extends StatelessWidget {
  const _AttachmentStatePanel({
    required this.icon,
    required this.title,
    required this.message,
    this.compact = false,
  });

  final IconData icon;
  final String title;
  final String message;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final content = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          icon,
          size: compact ? 28 : 42,
          color: Theme.of(context).colorScheme.primary,
        ),
        SizedBox(height: compact ? 8 : 14),
        Text(
          title,
          style: compact
              ? Theme.of(context).textTheme.titleMedium
              : Theme.of(context).textTheme.titleLarge,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 6),
        Text(message, textAlign: TextAlign.center),
      ],
    );

    if (compact) {
      return Align(
        alignment: Alignment.centerLeft,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: content,
        ),
      );
    }

    return Center(
      child: Padding(padding: const EdgeInsets.all(24), child: content),
    );
  }
}

class _AttachmentKeyValueText extends StatelessWidget {
  const _AttachmentKeyValueText({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 132,
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(child: Text(value, textAlign: TextAlign.end)),
        ],
      ),
    );
  }
}

class _AttachmentSoftChip extends StatelessWidget {
  const _AttachmentSoftChip({required this.label, required this.icon});

  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Chip(
      visualDensity: VisualDensity.compact,
      backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
      avatar: Icon(icon, size: 16),
      label: Text(label),
    );
  }
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
    SettleoraBillAttachmentPurposeValues.receipt => 'Receipt uploaded.',
    _ => 'Attachment uploaded.',
  };
}
