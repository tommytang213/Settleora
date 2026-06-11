import 'package:flutter/material.dart';

import '../receipt_ocr_review/receipt_ocr_review_repository.dart';
import '../receipt_ocr_review/receipt_ocr_review_screen.dart';
import 'bill_attachment_file_input.dart';
import 'bill_attachment_repository.dart';

part 'bill_attachment_section_accessibility.dart';

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
  final TextEditingController _discoverySearchController =
      TextEditingController();
  bool _isLoading = true;
  bool _loadInFlight = false;
  bool _isSelectingUploadPurpose = false;
  bool _isUploading = false;
  _AttachmentDiscoveryFilter _selectedDiscoveryFilter =
      _AttachmentDiscoveryFilter.all;
  String? _downloadingFileId;
  String? _removingFileId;
  String? _confirmingRemoveFileId;
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
    _discoverySearchController.addListener(_onDiscoverySearchChanged);
    Future<void>.microtask(_load);
  }

  @override
  void dispose() {
    _discoverySearchController.removeListener(_onDiscoverySearchChanged);
    _discoverySearchController.dispose();
    super.dispose();
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
        _confirmingRemoveFileId = null;
        _selectedDiscoveryFilter = _AttachmentDiscoveryFilter.all;
        _discoverySearchController.clear();
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

  void _onDiscoverySearchChanged() {
    if (mounted) {
      setState(() {});
    }
  }

  void _selectDiscoveryFilter(_AttachmentDiscoveryFilter filter) {
    setState(() {
      _selectedDiscoveryFilter = filter;
    });
  }

  void _clearDiscovery() {
    setState(() {
      _selectedDiscoveryFilter = _AttachmentDiscoveryFilter.all;
      _discoverySearchController.clear();
    });
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
    if (!_attachmentActionState.canStartAttachmentAction(
      attachment,
      _attachments,
    )) {
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
    if (!_attachmentActionState.canStartAttachmentAction(
      attachment,
      _attachments,
    )) {
      return;
    }

    final route = widget.route;
    final fileId = attachment.fileId;
    setState(() {
      _confirmingRemoveFileId = fileId;
    });

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remove attachment?'),
        content: const Text('This will remove the attachment from the bill.'),
        actions: [
          _AttachmentSemanticButtonLabel(
            label: _cancelRemoveBillAttachmentLabel,
            onTap: () => Navigator.of(context).pop(false),
            child: TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancel'),
            ),
          ),
          _AttachmentSemanticButtonLabel(
            label: _confirmRemoveBillAttachmentLabel,
            onTap: () => Navigator.of(context).pop(true),
            child: FilledButton(
              key: Key('${widget.keyPrefix}-remove-confirm'),
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Remove'),
            ),
          ),
        ],
      ),
    );

    if (!mounted) {
      return;
    }

    if (_confirmingRemoveFileId == fileId) {
      setState(() {
        _confirmingRemoveFileId = null;
      });
    }

    if (confirmed != true) {
      return;
    }

    if (widget.route.billId != route.billId ||
        widget.route.groupId != route.groupId ||
        !_attachmentActionState.canStartAttachmentAction(
          attachment,
          _attachments,
        )) {
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
    if (!_attachmentActionState.canStartUpload(fileInput)) {
      return;
    }
    final activeFileInput = fileInput!;

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

      final pickedFile = await activeFileInput.pickAttachmentFile(
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
              subtitle: Text(
                'Receipt files can move into OCR review. Supporting files stay as bill evidence.',
              ),
            ),
            _AttachmentSemanticButtonLabel(
              label: _uploadAsReceiptLabel,
              onTap: () => Navigator.of(
                context,
              ).pop(SettleoraBillAttachmentPurposeValues.receipt),
              child: ListTile(
                key: const Key('attachment-upload-purpose-receipt'),
                leading: const Icon(Icons.receipt_long_outlined),
                title: const Text('Receipt'),
                subtitle: const Text(
                  'Use for receipt OCR review after upload.',
                ),
                onTap: () => Navigator.of(
                  context,
                ).pop(SettleoraBillAttachmentPurposeValues.receipt),
              ),
            ),
            _AttachmentSemanticButtonLabel(
              label: _uploadAsSupportingAttachmentLabel,
              onTap: () => Navigator.of(
                context,
              ).pop(SettleoraBillAttachmentPurposeValues.supportingAttachment),
              child: ListTile(
                key: const Key('attachment-upload-purpose-supporting'),
                leading: const Icon(Icons.attach_file_outlined),
                title: const Text('Supporting attachment'),
                subtitle: const Text(
                  'Reference only; it is not handed to receipt OCR review.',
                ),
                onTap: () => Navigator.of(context).pop(
                  SettleoraBillAttachmentPurposeValues.supportingAttachment,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
              child: Align(
                alignment: Alignment.centerRight,
                child: _AttachmentSemanticButtonLabel(
                  label: _cancelAttachmentUploadLabel,
                  onTap: () => Navigator.of(context).pop(),
                  child: TextButton(
                    key: const Key('attachment-upload-purpose-cancel'),
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Cancel'),
                  ),
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
    if (!_attachmentActionState.canOpenOcrReview(
      attachment,
      _attachments,
      repository,
    )) {
      return;
    }

    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ReceiptOcrReviewDetailScreen.forRoute(
          repository: repository!,
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

  _AttachmentActionState get _attachmentActionState => _AttachmentActionState(
    isLoading: _isLoading,
    loadInFlight: _loadInFlight,
    isSelectingUploadPurpose: _isSelectingUploadPurpose,
    isUploading: _isUploading,
    downloadingFileId: _downloadingFileId,
    removingFileId: _removingFileId,
    confirmingRemoveFileId: _confirmingRemoveFileId,
  );

  @override
  Widget build(BuildContext context) {
    final failure = _failure;
    final actionState = _attachmentActionState;
    final attachmentActionDisabled = actionState.blocksActions;
    final hasAttachments = _attachments.isNotEmpty;
    final discovery = _AttachmentDiscoveryState.from(
      attachments: _attachments,
      query: _discoverySearchController.text,
      selectedFilter: _selectedDiscoveryFilter,
      receiptOcrReviewRepository: widget.receiptOcrReviewRepository,
    );

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
              _AttachmentSemanticButtonLabel(
                label: _uploadBillAttachmentLabel,
                enabled: !attachmentActionDisabled,
                onTap: _upload,
                child: OutlinedButton.icon(
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
              ),
            if (widget.fileInput != null) const SizedBox(width: 8),
            _AttachmentSemanticButtonLabel(
              label: _refreshBillAttachmentsLabel,
              enabled: !attachmentActionDisabled,
              onTap: _load,
              child: IconButton(
                key: Key('${widget.keyPrefix}-refresh'),
                onPressed: attachmentActionDisabled ? null : _load,
                icon: _isLoading && hasAttachments
                    ? const SizedBox.square(
                        dimension: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.refresh),
              ),
            ),
          ],
        ),
        if (_isUploading) ...[
          const SizedBox(height: 8),
          LinearProgressIndicator(
            key: Key('${widget.keyPrefix}-upload-progress'),
          ),
        ],
        if (actionState.removingFileId != null) ...[
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
          if (hasAttachments) ...[
            if (!attachmentActionDisabled) ...[
              _AttachmentDiscoveryControls(
                keyPrefix: widget.keyPrefix,
                controller: _discoverySearchController,
                discovery: discovery,
                selectedFilter: _selectedDiscoveryFilter,
                onFilterSelected: _selectDiscoveryFilter,
                onClear: discovery.isActive ? _clearDiscovery : null,
              ),
              const SizedBox(height: 10),
            ],
            if (discovery.visibleAttachments.isEmpty)
              const _AttachmentStatePanel(
                icon: Icons.filter_alt_off_outlined,
                title: 'No matching attachments',
                message: 'Clear search or filters to show attachments again.',
                compact: true,
              )
            else
              for (
                var index = 0;
                index < discovery.visibleAttachments.length;
                index += 1
              )
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _AttachmentTile(
                    attachment: discovery.visibleAttachments[index],
                    index: index,
                    keyPrefix: widget.keyPrefix,
                    isBusy: attachmentActionDisabled,
                    isDownloading: actionState.isDownloading(
                      discovery.visibleAttachments[index],
                    ),
                    isRemoving: actionState.isRemoving(
                      discovery.visibleAttachments[index],
                    ),
                    canOpenOcr: actionState.showsOcrReviewAction(
                      discovery.visibleAttachments[index],
                      widget.receiptOcrReviewRepository,
                    ),
                    onDownload: () =>
                        _download(discovery.visibleAttachments[index]),
                    onRemove: () =>
                        _confirmRemove(discovery.visibleAttachments[index]),
                    onOpenOcr: () =>
                        _openOcrReview(discovery.visibleAttachments[index]),
                  ),
                ),
          ] else if (failure == null)
            const _AttachmentStatePanel(
              icon: Icons.attach_file_outlined,
              title: 'No attachments',
              message:
                  'Upload receipts for OCR review or supporting files for bill evidence.',
              compact: true,
            ),
        ],
      ],
    );
  }
}

enum _AttachmentDiscoveryFilter {
  all,
  receipts,
  supporting,
  reviewableOcr,
  other,
}

class _AttachmentDiscoveryState {
  const _AttachmentDiscoveryState({
    required this.visibleAttachments,
    required this.totalCount,
    required this.receiptCount,
    required this.supportingCount,
    required this.reviewableOcrCount,
    required this.otherCount,
    required this.isActive,
  });

  factory _AttachmentDiscoveryState.from({
    required List<SettleoraBillAttachment> attachments,
    required String query,
    required _AttachmentDiscoveryFilter selectedFilter,
    required ReceiptOcrReviewRepository? receiptOcrReviewRepository,
  }) {
    final normalizedQuery = query.trim().toLowerCase();
    final canReviewOcr = receiptOcrReviewRepository != null;
    final visibleAttachments = [
      for (final attachment in attachments)
        if (_matchesAttachmentDiscoveryFilter(
              attachment,
              selectedFilter,
              canReviewOcr: canReviewOcr,
            ) &&
            _matchesAttachmentDiscoverySearch(attachment, normalizedQuery))
          attachment,
    ];

    return _AttachmentDiscoveryState(
      visibleAttachments: visibleAttachments,
      totalCount: attachments.length,
      receiptCount: attachments
          .where(
            (attachment) =>
                attachment.purpose ==
                SettleoraBillAttachmentPurposeValues.receipt,
          )
          .length,
      supportingCount: attachments
          .where(
            (attachment) =>
                attachment.purpose ==
                SettleoraBillAttachmentPurposeValues.supportingAttachment,
          )
          .length,
      reviewableOcrCount: canReviewOcr
          ? attachments
                .where(
                  (attachment) =>
                      attachment.purpose ==
                      SettleoraBillAttachmentPurposeValues.receipt,
                )
                .length
          : 0,
      otherCount: attachments
          .where(
            (attachment) =>
                attachment.purpose !=
                    SettleoraBillAttachmentPurposeValues.receipt &&
                attachment.purpose !=
                    SettleoraBillAttachmentPurposeValues.supportingAttachment,
          )
          .length,
      isActive:
          normalizedQuery.isNotEmpty ||
          selectedFilter != _AttachmentDiscoveryFilter.all,
    );
  }

  final List<SettleoraBillAttachment> visibleAttachments;
  final int totalCount;
  final int receiptCount;
  final int supportingCount;
  final int reviewableOcrCount;
  final int otherCount;
  final bool isActive;
}

bool _matchesAttachmentDiscoveryFilter(
  SettleoraBillAttachment attachment,
  _AttachmentDiscoveryFilter filter, {
  required bool canReviewOcr,
}) {
  return switch (filter) {
    _AttachmentDiscoveryFilter.all => true,
    _AttachmentDiscoveryFilter.receipts =>
      attachment.purpose == SettleoraBillAttachmentPurposeValues.receipt,
    _AttachmentDiscoveryFilter.supporting =>
      attachment.purpose ==
          SettleoraBillAttachmentPurposeValues.supportingAttachment,
    _AttachmentDiscoveryFilter.reviewableOcr =>
      canReviewOcr &&
          attachment.purpose == SettleoraBillAttachmentPurposeValues.receipt,
    _AttachmentDiscoveryFilter.other =>
      attachment.purpose != SettleoraBillAttachmentPurposeValues.receipt &&
          attachment.purpose !=
              SettleoraBillAttachmentPurposeValues.supportingAttachment,
  };
}

bool _matchesAttachmentDiscoverySearch(
  SettleoraBillAttachment attachment,
  String normalizedQuery,
) {
  if (normalizedQuery.isEmpty) {
    return true;
  }

  final metadata = _AttachmentTileMetadata.from(attachment);
  final searchableText = [
    metadata.purposeLabel,
    metadata.contentTypeLabel,
    metadata.sizeLabel,
    metadata.uploadedAtLabel,
    metadata.updatedAtLabel,
  ].join(' ').toLowerCase();

  return searchableText.contains(normalizedQuery);
}

class _AttachmentActionState {
  const _AttachmentActionState({
    required this.isLoading,
    required this.loadInFlight,
    required this.isSelectingUploadPurpose,
    required this.isUploading,
    required this.downloadingFileId,
    required this.removingFileId,
    required this.confirmingRemoveFileId,
  });

  final bool isLoading;
  final bool loadInFlight;
  final bool isSelectingUploadPurpose;
  final bool isUploading;
  final String? downloadingFileId;
  final String? removingFileId;
  final String? confirmingRemoveFileId;

  bool get blocksActions =>
      isLoading ||
      loadInFlight ||
      isSelectingUploadPurpose ||
      isUploading ||
      downloadingFileId != null ||
      removingFileId != null ||
      confirmingRemoveFileId != null;

  bool canStartUpload(SettleoraBillAttachmentFileInput? fileInput) {
    return fileInput != null && !blocksActions;
  }

  bool canStartAttachmentAction(
    SettleoraBillAttachment attachment,
    Iterable<SettleoraBillAttachment> attachments,
  ) {
    return !blocksActions && _containsAttachment(attachment, attachments);
  }

  bool canOpenOcrReview(
    SettleoraBillAttachment attachment,
    Iterable<SettleoraBillAttachment> attachments,
    ReceiptOcrReviewRepository? repository,
  ) {
    return canStartAttachmentAction(attachment, attachments) &&
        showsOcrReviewAction(attachment, repository);
  }

  bool showsOcrReviewAction(
    SettleoraBillAttachment attachment,
    ReceiptOcrReviewRepository? repository,
  ) {
    return repository != null &&
        attachment.purpose == SettleoraBillAttachmentPurposeValues.receipt;
  }

  bool isDownloading(SettleoraBillAttachment attachment) {
    return attachment.fileId == downloadingFileId;
  }

  bool isRemoving(SettleoraBillAttachment attachment) {
    return attachment.fileId == removingFileId;
  }

  bool _containsAttachment(
    SettleoraBillAttachment attachment,
    Iterable<SettleoraBillAttachment> attachments,
  ) {
    return attachments.any((item) => item.fileId == attachment.fileId);
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
    return Semantics(
      label: label,
      child: Row(
        key: Key('$keyPrefix-$keySuffix'),
        children: [
          const SizedBox.square(
            dimension: 16,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          const SizedBox(width: 8),
          Text(label, style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}

class _AttachmentDiscoveryControls extends StatelessWidget {
  const _AttachmentDiscoveryControls({
    required this.keyPrefix,
    required this.controller,
    required this.discovery,
    required this.selectedFilter,
    required this.onFilterSelected,
    required this.onClear,
  });

  final String keyPrefix;
  final TextEditingController controller;
  final _AttachmentDiscoveryState discovery;
  final _AttachmentDiscoveryFilter selectedFilter;
  final ValueChanged<_AttachmentDiscoveryFilter> onFilterSelected;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Showing ${discovery.visibleAttachments.length} of '
          '${discovery.totalCount} attachments',
          key: Key('$keyPrefix-discovery-count'),
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          key: Key('$keyPrefix-discovery-search'),
          controller: controller,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            labelText: 'Search attachments',
            hintText: 'Purpose, type, size, or date',
            prefixIcon: const Icon(Icons.search),
            border: const OutlineInputBorder(),
            isDense: true,
            suffixIcon: onClear == null
                ? null
                : IconButton(
                    key: Key('$keyPrefix-discovery-clear-field'),
                    tooltip: 'Clear attachment discovery',
                    onPressed: onClear,
                    icon: const Icon(Icons.close),
                  ),
          ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _AttachmentDiscoveryChip(
              keyPrefix: keyPrefix,
              filter: _AttachmentDiscoveryFilter.all,
              selectedFilter: selectedFilter,
              label: 'All',
              count: discovery.totalCount,
              onSelected: onFilterSelected,
            ),
            _AttachmentDiscoveryChip(
              keyPrefix: keyPrefix,
              filter: _AttachmentDiscoveryFilter.receipts,
              selectedFilter: selectedFilter,
              label: 'Receipts',
              count: discovery.receiptCount,
              onSelected: onFilterSelected,
            ),
            _AttachmentDiscoveryChip(
              keyPrefix: keyPrefix,
              filter: _AttachmentDiscoveryFilter.supporting,
              selectedFilter: selectedFilter,
              label: 'Supporting',
              count: discovery.supportingCount,
              onSelected: onFilterSelected,
            ),
            _AttachmentDiscoveryChip(
              keyPrefix: keyPrefix,
              filter: _AttachmentDiscoveryFilter.reviewableOcr,
              selectedFilter: selectedFilter,
              label: 'Reviewable OCR',
              count: discovery.reviewableOcrCount,
              onSelected: onFilterSelected,
            ),
            _AttachmentDiscoveryChip(
              keyPrefix: keyPrefix,
              filter: _AttachmentDiscoveryFilter.other,
              selectedFilter: selectedFilter,
              label: 'Other',
              count: discovery.otherCount,
              onSelected: onFilterSelected,
            ),
            if (onClear != null)
              TextButton.icon(
                key: Key('$keyPrefix-discovery-clear'),
                onPressed: onClear,
                icon: const Icon(Icons.restart_alt),
                label: const Text('Clear'),
              ),
          ],
        ),
      ],
    );
  }
}

class _AttachmentDiscoveryChip extends StatelessWidget {
  const _AttachmentDiscoveryChip({
    required this.keyPrefix,
    required this.filter,
    required this.selectedFilter,
    required this.label,
    required this.count,
    required this.onSelected,
  });

  final String keyPrefix;
  final _AttachmentDiscoveryFilter filter;
  final _AttachmentDiscoveryFilter selectedFilter;
  final String label;
  final int count;
  final ValueChanged<_AttachmentDiscoveryFilter> onSelected;

  @override
  Widget build(BuildContext context) {
    final chipLabel = '$label ($count)';

    return FilterChip(
      key: Key('$keyPrefix-discovery-filter-${filter.name}'),
      label: Text(chipLabel),
      selected: selectedFilter == filter,
      onSelected: (_) => onSelected(filter),
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

    return Semantics(
      container: true,
      explicitChildNodes: true,
      label: _attachmentSummarySemanticLabel(metadata),
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border.all(
            color: Theme.of(context).colorScheme.outlineVariant,
          ),
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
              _AttachmentHandoffText(
                purpose: attachment.purpose,
                canOpenOcr: canOpenOcr,
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _AttachmentSemanticButtonLabel(
                    label: _openBillAttachmentLabel,
                    enabled: !isBusy,
                    onTap: onDownload,
                    child: OutlinedButton.icon(
                      key: ValueKey('$keyPrefix-download-$index'),
                      onPressed: isBusy ? null : onDownload,
                      icon: isDownloading
                          ? SizedBox.square(
                              key: ValueKey(
                                '$keyPrefix-download-progress-$index',
                              ),
                              dimension: 18,
                              child: const CircularProgressIndicator(
                                strokeWidth: 2,
                              ),
                            )
                          : const Icon(Icons.download_outlined),
                      label: const Text('Download'),
                    ),
                  ),
                  _AttachmentSemanticButtonLabel(
                    label: _removeBillAttachmentLabel,
                    enabled: !isBusy,
                    onTap: onRemove,
                    child: OutlinedButton.icon(
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
                  ),
                  if (canOpenOcr)
                    _AttachmentSemanticButtonLabel(
                      label: _reviewReceiptOcrLabel,
                      enabled: !isBusy,
                      onTap: onOpenOcr,
                      child: OutlinedButton.icon(
                        key: ValueKey('$keyPrefix-ocr-$index'),
                        onPressed: isBusy ? null : onOpenOcr,
                        icon: const Icon(Icons.fact_check_outlined),
                        label: const Text('Review receipt'),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AttachmentHandoffText extends StatelessWidget {
  const _AttachmentHandoffText({
    required this.purpose,
    required this.canOpenOcr,
  });

  final SettleoraBillAttachmentPurpose purpose;
  final bool canOpenOcr;

  @override
  Widget build(BuildContext context) {
    final text = switch (purpose) {
      SettleoraBillAttachmentPurposeValues.receipt when canOpenOcr =>
        'Receipt handoff: review OCR before applying saved data to a draft.',
      SettleoraBillAttachmentPurposeValues.receipt =>
        'Receipt saved as bill evidence. OCR review is unavailable here.',
      SettleoraBillAttachmentPurposeValues.supportingAttachment =>
        'Supporting file only; not used for receipt OCR review.',
      _ => null,
    };

    if (text == null) {
      return const SizedBox.shrink();
    }

    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Text(
        text,
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
      ),
    );
  }
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
            _AttachmentSemanticButtonLabel(
              label: _retryBillAttachmentsLabel,
              enabled: onRetry != null,
              onTap: onRetry,
              child: OutlinedButton.icon(
                key: Key('$keyPrefix-retry'),
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text('Retry'),
              ),
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
