import 'package:flutter/material.dart';

import '../groups/group_repository.dart';
import '../receipt_ocr_review/receipt_ocr_review_repository.dart';
import '../sync/sync_queue.dart';
import '../sync/sync_queue_processor.dart';
import '../ui/settleora_components.dart';
import '../ui/settleora_theme.dart';
import 'bill_attachment_file_input.dart';
import 'bill_attachment_repository.dart';
import 'bill_attachment_section.dart';
import 'bill_revision_proposal_editor_screen.dart';
import 'bill_revision_repository.dart';
import 'bill_revision_review_screen.dart';
import 'bill_repository.dart';
import 'bill_sync_controller.dart';

class SettleoraBillListScreen extends StatefulWidget {
  const SettleoraBillListScreen({
    super.key,
    required this.repository,
    required this.syncController,
    this.attachmentRepository,
    this.attachmentFileInput,
    this.receiptOcrReviewRepository,
    this.revisionRepository,
  });

  final SettleoraBillRepository repository;
  final SettleoraBillSyncController syncController;
  final SettleoraBillAttachmentRepository? attachmentRepository;
  final SettleoraBillAttachmentFileInput? attachmentFileInput;
  final ReceiptOcrReviewRepository? receiptOcrReviewRepository;
  final SettleoraBillRevisionRepository? revisionRepository;

  @override
  State<SettleoraBillListScreen> createState() =>
      _SettleoraBillListScreenState();
}

class _SettleoraBillListScreenState extends State<SettleoraBillListScreen> {
  final _searchController = TextEditingController();

  bool _isLoading = true;
  bool _isSyncing = false;
  String? _busyBillId;
  List<SettleoraBillSummary> _bills = const [];
  _PersonalBillListFilter _selectedFilter = _PersonalBillListFilter.all;
  _SyncQueueFilter _selectedSyncQueueFilter = _SyncQueueFilter.all;
  SettleoraBillFailure? _failure;
  SettleoraBillSyncSnapshot? _syncSnapshot;
  String? _syncNotice;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _failure = null;
      _syncNotice = null;
    });

    try {
      final snapshot = await widget.syncController.readSnapshot();
      final bills = await widget.repository.listPersonalBills(limit: 50);
      if (!mounted) {
        return;
      }

      setState(() {
        _syncSnapshot = snapshot;
        _bills = bills;
        _isLoading = false;
      });

      if (snapshot.pendingCount > 0) {
        await _flushQueue(reloadBillsOnSuccess: true);
      }
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _failure = SettleoraBillFailure.from(error);
        _isLoading = false;
      });
    }
  }

  Future<void> _flushQueue({bool reloadBillsOnSuccess = false}) async {
    if (_isSyncing) {
      return;
    }

    setState(() {
      _isSyncing = true;
      _syncNotice = null;
    });

    try {
      final outcome = await widget.syncController.flushPending();
      var bills = _bills;
      if (reloadBillsOnSuccess && outcome.result.syncedCount > 0) {
        bills = await widget.repository.listPersonalBills(limit: 50);
      }
      if (!mounted) {
        return;
      }

      setState(() {
        _syncSnapshot = outcome.snapshot;
        _bills = bills;
        _syncNotice = _syncMessage(outcome.result);
        _isSyncing = false;
      });
    } on SettleoraSyncQueueFailure catch (failure) {
      if (!mounted) {
        return;
      }

      setState(() {
        _syncNotice = failure.message;
        _isSyncing = false;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _syncNotice = 'Sync is unavailable right now. Try again later.';
        _isSyncing = false;
      });
    }
  }

  Future<void> _queueBillLifecycle(SettleoraBillSummary bill) async {
    if (_busyBillId != null) {
      return;
    }

    setState(() {
      _busyBillId = bill.id;
      _syncNotice = null;
    });

    try {
      final snapshot = bill.isArchived
          ? await widget.syncController.queueRestore(bill.id)
          : await widget.syncController.queueArchive(bill.id);
      if (!mounted) {
        return;
      }

      setState(() {
        _syncSnapshot = snapshot;
        _busyBillId = null;
      });
      await _flushQueue(reloadBillsOnSuccess: true);
    } on SettleoraSyncQueueFailure catch (failure) {
      if (!mounted) {
        return;
      }

      setState(() {
        _syncNotice = failure.message;
        _busyBillId = null;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _syncNotice = 'This bill action could not be queued right now.';
        _busyBillId = null;
      });
    }
  }

  Future<void> _openBill(SettleoraBillSummary bill) async {
    if (bill.isArchived) {
      return;
    }

    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SettleoraBillDetailScreen(
          repository: widget.repository,
          attachmentRepository: widget.attachmentRepository,
          attachmentFileInput: widget.attachmentFileInput,
          receiptOcrReviewRepository: widget.receiptOcrReviewRepository,
          revisionRepository: widget.revisionRepository,
          billId: bill.id,
        ),
      ),
    );
  }

  Future<void> _openCreateBill() async {
    final createdBill = await Navigator.of(context).push<SettleoraBillDetail>(
      MaterialPageRoute(
        builder: (_) => SettleoraPersonalBillCreateScreen(
          repository: widget.repository,
          attachmentRepository: widget.attachmentRepository,
          attachmentFileInput: widget.attachmentFileInput,
        ),
      ),
    );

    if (!mounted || createdBill == null) {
      return;
    }

    setState(() {
      _failure = null;
      _syncNotice = null;
      _bills = [
        _summaryFromCreatedDetail(createdBill),
        ..._bills.where((bill) => bill.id != createdBill.id),
      ];
    });

    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SettleoraBillDetailScreen(
          repository: widget.repository,
          attachmentRepository: widget.attachmentRepository,
          attachmentFileInput: widget.attachmentFileInput,
          receiptOcrReviewRepository: widget.receiptOcrReviewRepository,
          revisionRepository: widget.revisionRepository,
          billId: createdBill.id,
          initialBill: createdBill,
        ),
      ),
    );

    if (mounted) {
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final snapshot = _syncSnapshot;
    final syncNotice = _syncNotice;
    final searchQuery = _searchController.text;
    final visibleBills = _filteredBills(searchQuery);
    final hasFilters =
        searchQuery.trim().isNotEmpty ||
        _selectedFilter != _PersonalBillListFilter.all;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Bills'),
        actions: [
          IconButton(
            key: const Key('bill-list-sync'),
            onPressed: _isLoading || _isSyncing ? null : () => _flushQueue(),
            tooltip: 'Sync pending work',
            icon: _isSyncing
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.sync_outlined),
          ),
          IconButton(
            key: const Key('bill-list-refresh'),
            onPressed: _isLoading ? null : _load,
            tooltip: 'Refresh',
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: Builder(
          builder: (context) {
            if (_isLoading) {
              return const _LoadingPanel(label: 'Loading bills');
            }

            final failure = _failure;
            if (failure != null) {
              return _FailurePanel(failure: failure, onRetry: _load);
            }

            return RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 112),
                children: [
                  _BillsListHeader(
                    onCreateBill: _isLoading ? null : _openCreateBill,
                    onScanReceipt: null,
                  ),
                  const SizedBox(height: 14),
                  if (snapshot != null)
                    _SyncStatusPanel(
                      snapshot: snapshot,
                      isSyncing: _isSyncing,
                      selectedFilter: _selectedSyncQueueFilter,
                      onSync: () => _flushQueue(),
                      onFilterSelected: (filter) {
                        setState(() {
                          _selectedSyncQueueFilter = filter;
                        });
                      },
                    ),
                  if (syncNotice != null) ...[
                    const SizedBox(height: 10),
                    _SyncNotice(message: syncNotice),
                  ],
                  if (_bills.isEmpty) ...[
                    const SizedBox(height: 56),
                    _StatePanel(
                      icon: Icons.receipt_long_outlined,
                      title: 'No bills',
                      message:
                          'Personal bills visible to this account will appear here.',
                      action: AppButton(
                        key: const Key('bill-list-empty-create'),
                        label: 'Create bill',
                        icon: Icons.add_rounded,
                        onPressed: _openCreateBill,
                      ),
                    ),
                  ] else ...[
                    const SizedBox(height: 12),
                    _BillListDiscoveryControls(
                      keyPrefix: 'bill-list',
                      searchController: _searchController,
                      searchHint: 'Search bills',
                      selectedFilter: _selectedFilter,
                      filters: _PersonalBillListFilter.values,
                      labelForFilter: (filter) =>
                          filter.labelWithCount(_personalFilterCount(filter)),
                      onSearchChanged: (_) => setState(() {}),
                      onFilterSelected: (filter) {
                        setState(() {
                          _selectedFilter = filter;
                        });
                      },
                      onClear: _clearFilters,
                      hasFilters: hasFilters,
                    ),
                    if (visibleBills.isEmpty) ...[
                      const SizedBox(height: 56),
                      const _StatePanel(
                        icon: Icons.search_off_outlined,
                        title: 'No matching bills',
                        message: 'No personal bills match these filters.',
                      ),
                    ],
                    for (var index = 0; index < visibleBills.length; index += 1)
                      Padding(
                        padding: EdgeInsets.only(
                          top: index == 0 ? 14 : 0,
                          bottom: 10,
                        ),
                        child: _BillSummaryTile(
                          bill: visibleBills[index],
                          syncItem: snapshot?.latestForBill(
                            visibleBills[index].id,
                          ),
                          hasOpenOperation:
                              snapshot?.hasOpenBillOperation(
                                visibleBills[index].id,
                              ) ??
                              false,
                          isBusy: _busyBillId == visibleBills[index].id,
                          archiveButtonKey: ValueKey('bill-archive-$index'),
                          restoreButtonKey: ValueKey('bill-restore-$index'),
                          onTap: () => _openBill(visibleBills[index]),
                          onQueue: () =>
                              _queueBillLifecycle(visibleBills[index]),
                        ),
                      ),
                  ],
                ],
              ),
            );
          },
        ),
      ),
      bottomNavigationBar: const SettleoraBottomNav(
        selected: SettleoraNavDestination.bills,
      ),
    );
  }

  List<SettleoraBillSummary> _filteredBills(String query) {
    return _bills
        .where((bill) => _selectedFilter.matches(bill))
        .where((bill) => _billMatchesQuery(bill, query))
        .toList(growable: false);
  }

  int _personalFilterCount(_PersonalBillListFilter filter) {
    return _bills.where(filter.matches).length;
  }

  void _clearFilters() {
    setState(() {
      _searchController.clear();
      _selectedFilter = _PersonalBillListFilter.all;
    });
  }
}

enum _PersonalBillListFilter { all, active, needsReview, archived }

extension _PersonalBillListFilterText on _PersonalBillListFilter {
  String get label {
    return switch (this) {
      _PersonalBillListFilter.all => 'All',
      _PersonalBillListFilter.active => 'Active',
      _PersonalBillListFilter.needsReview => 'Needs review',
      _PersonalBillListFilter.archived => 'Archived',
    };
  }

  String labelWithCount(int count) {
    return '$label ($count)';
  }

  bool matches(SettleoraBillSummary bill) {
    return switch (this) {
      _PersonalBillListFilter.all => true,
      _PersonalBillListFilter.active => !bill.isArchived,
      _PersonalBillListFilter.needsReview => _billNeedsReview(bill),
      _PersonalBillListFilter.archived => bill.isArchived,
    };
  }
}

class _BillsListHeader extends StatelessWidget {
  const _BillsListHeader({
    required this.onCreateBill,
    required this.onScanReceipt,
  });

  final VoidCallback? onCreateBill;
  final VoidCallback? onScanReceipt;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;

    return AppCard(
      padding: const EdgeInsets.all(SettleoraSpacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          CircleAvatar(
            radius: 19,
            backgroundColor: colors.accentSoft,
            foregroundColor: colors.accent,
            child: const Icon(Icons.receipt_long_rounded, size: 20),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: AppButton(
              key: const Key('bill-list-create'),
              label: 'Create bill',
              icon: Icons.add_rounded,
              onPressed: onCreateBill,
              expanded: true,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: AppButton(
              key: const Key('bill-list-scan-receipt'),
              label: 'Scan receipt',
              icon: Icons.document_scanner_outlined,
              variant: AppButtonVariant.secondary,
              onPressed: onScanReceipt,
              expanded: true,
            ),
          ),
        ],
      ),
    );
  }
}

class SettleoraPersonalBillCreateScreen extends StatefulWidget {
  const SettleoraPersonalBillCreateScreen({
    super.key,
    required this.repository,
    this.attachmentRepository,
    this.attachmentFileInput,
  });

  final SettleoraBillRepository repository;
  final SettleoraBillAttachmentRepository? attachmentRepository;
  final SettleoraBillAttachmentFileInput? attachmentFileInput;

  @override
  State<SettleoraPersonalBillCreateScreen> createState() =>
      _SettleoraPersonalBillCreateScreenState();
}

class _SettleoraPersonalBillCreateScreenState
    extends State<SettleoraPersonalBillCreateScreen> {
  final _formKey = GlobalKey<FormState>();
  final _merchantController = TextEditingController();
  final _billDateController = TextEditingController();
  final _currencyController = TextEditingController(text: 'USD');
  final List<_PersonalBillCreateItemControllers> _itemControllers = [];
  final List<_BillCreateDraftAttachment> _draftAttachments = [];
  bool _isSaving = false;
  bool _isPickingAttachment = false;
  String? _itemListError;
  String? _attachmentDraftError;
  SettleoraBillFailure? _failure;
  SettleoraBillAttachmentFailure? _attachmentUploadFailure;
  SettleoraBillDetail? _createdBillAwaitingAttachmentUpload;
  int _nextDraftAttachmentId = 0;
  bool _exitGuardBypassed = false;

  @override
  void initState() {
    super.initState();
    _itemControllers.add(
      _PersonalBillCreateItemControllers(
        currency: _currencyController.text.trim(),
      ),
    );
  }

  @override
  void dispose() {
    _merchantController.dispose();
    _billDateController.dispose();
    _currencyController.dispose();
    for (final item in _itemControllers) {
      item.dispose();
    }
    super.dispose();
  }

  void _addItem() {
    setState(() {
      _itemListError = null;
      _itemControllers.add(
        _PersonalBillCreateItemControllers(
          currency: _currencyController.text.trim(),
        ),
      );
    });
  }

  void _removeItem(int index) {
    if (index < 0 || index >= _itemControllers.length) {
      return;
    }

    setState(() {
      final removed = _itemControllers.removeAt(index);
      removed.dispose();
      _itemListError = _itemControllers.isEmpty
          ? 'Add at least one item before saving.'
          : null;
    });
  }

  void _notifyDraftChanged() {
    if (!mounted || _isSaving) {
      return;
    }

    setState(() {});
  }

  bool get _hasMeaningfulUnsavedDraft {
    if (_createdBillAwaitingAttachmentUpload != null) {
      return true;
    }

    if (_draftAttachments.isNotEmpty) {
      return true;
    }

    if (_merchantController.text.trim().isNotEmpty ||
        _billDateController.text.trim().isNotEmpty ||
        _currencyController.text.trim().toUpperCase() != 'USD') {
      return true;
    }

    if (_itemControllers.length != 1) {
      return true;
    }

    if (_itemControllers.isEmpty) {
      return true;
    }

    final item = _itemControllers.single;
    return item.name.text.trim().isNotEmpty ||
        item.amount.text.trim().isNotEmpty ||
        item.note.text.trim().isNotEmpty ||
        item.currency.text.trim().toUpperCase() != 'USD';
  }

  Future<void> _requestExit() async {
    if (!_hasMeaningfulUnsavedDraft) {
      await _leaveRoute();
      return;
    }

    final shouldDiscard = await _confirmDiscardCreateDraft(
      context,
      keyPrefix: 'personal-bill',
    );
    if (shouldDiscard && mounted) {
      await _leaveRoute();
    }
  }

  Future<void> _leaveRoute([SettleoraBillDetail? result]) async {
    if (!mounted) {
      return;
    }

    setState(() {
      _exitGuardBypassed = true;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        Navigator.of(context).pop(result);
      }
    });
  }

  Future<void> _addDraftAttachment() async {
    final fileInput = widget.attachmentFileInput;
    if (fileInput == null || _isSaving || _isPickingAttachment) {
      return;
    }

    setState(() {
      _isPickingAttachment = true;
      _attachmentDraftError = null;
    });

    try {
      final purpose = await _selectDraftAttachmentPurpose();
      if (!mounted || purpose == null) {
        return;
      }

      final allowedContentTypes = billAttachmentUploadContentTypesForPurpose(
        purpose,
      );
      final pickedFile = await fileInput.pickAttachmentFile(
        allowedContentTypes: allowedContentTypes,
      );
      if (!mounted || pickedFile == null) {
        return;
      }

      final validatedFile = validatePickedBillAttachmentFile(
        pickedFile,
        allowedContentTypes: allowedContentTypes,
      );
      setState(() {
        _draftAttachments.add(
          _BillCreateDraftAttachment(
            id: _nextDraftAttachmentId,
            file: validatedFile,
            purpose: purpose,
          ),
        );
        _nextDraftAttachmentId += 1;
      });
    } on SettleoraBillAttachmentFileInputFailure catch (failure) {
      if (!mounted) {
        return;
      }

      setState(() {
        _attachmentDraftError = failure.message;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _attachmentDraftError =
            'The attachment could not be selected. Try again.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isPickingAttachment = false;
        });
      }
    }
  }

  Future<SettleoraBillAttachmentPurpose?> _selectDraftAttachmentPurpose() {
    return showModalBottomSheet<SettleoraBillAttachmentPurpose>(
      context: context,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Add attachment as',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              ListTile(
                key: const Key('personal-bill-attachment-purpose-receipt'),
                leading: const Icon(Icons.receipt_long_outlined),
                title: const Text('Receipt'),
                onTap: () => Navigator.of(
                  context,
                ).pop(SettleoraBillAttachmentPurposeValues.receipt),
              ),
              ListTile(
                key: const Key('personal-bill-attachment-purpose-supporting'),
                leading: const Icon(Icons.attach_file_outlined),
                title: const Text('Supporting attachment'),
                onTap: () => Navigator.of(context).pop(
                  SettleoraBillAttachmentPurposeValues.supportingAttachment,
                ),
              ),
              const SizedBox(height: 8),
              TextButton(
                key: const Key('personal-bill-attachment-purpose-cancel'),
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Cancel'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _removeDraftAttachment(int id) {
    if (_isSaving) {
      return;
    }

    setState(() {
      _attachmentDraftError = null;
      _attachmentUploadFailure = null;
      _draftAttachments.removeWhere((attachment) => attachment.id == id);
    });
  }

  void _changeDraftAttachmentPurpose(
    int id,
    SettleoraBillAttachmentPurpose purpose,
  ) {
    if (_isSaving) {
      return;
    }

    setState(() {
      _attachmentDraftError = null;
      _attachmentUploadFailure = null;
      final index = _draftAttachments.indexWhere(
        (attachment) => attachment.id == id,
      );
      if (index < 0) {
        return;
      }

      _draftAttachments[index] = _draftAttachments[index].copyWith(
        purpose: purpose,
      );
    });
  }

  Future<void> _save() async {
    if (_isSaving) {
      return;
    }

    final existingCreatedBill = _createdBillAwaitingAttachmentUpload;
    if (existingCreatedBill != null) {
      await _finishAttachmentUploads(existingCreatedBill);
      return;
    }

    setState(() {
      _failure = null;
      _attachmentUploadFailure = null;
      _itemListError = _itemControllers.isEmpty
          ? 'Add at least one item before saving.'
          : null;
    });

    final formIsValid = _formKey.currentState?.validate() ?? false;
    if (!formIsValid || _itemControllers.isEmpty) {
      return;
    }

    setState(() {
      _isSaving = true;
    });

    final draft = SettleoraPersonalBillCreateDraft(
      merchantName: _merchantController.text,
      billDate: _billDateController.text,
      currency: _currencyController.text,
      items: _itemControllers
          .map(
            (item) => SettleoraPersonalBillCreateItemDraft(
              name: item.name.text,
              note: item.note.text,
              amount: item.amount.text,
              currency: item.currency.text,
            ),
          )
          .toList(growable: false),
    );

    try {
      final createdBill = await widget.repository.createPersonalBill(draft);
      if (!mounted) {
        return;
      }

      if (_draftAttachments.isEmpty) {
        await _leaveRoute(createdBill);
        return;
      }

      setState(() {
        _createdBillAwaitingAttachmentUpload = createdBill;
      });
      await _finishAttachmentUploads(createdBill);
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _failure = SettleoraBillFailure.from(error);
        _isSaving = false;
      });
    }
  }

  Future<void> _finishAttachmentUploads(SettleoraBillDetail createdBill) async {
    final attachmentRepository = widget.attachmentRepository;
    if (attachmentRepository == null) {
      if (!mounted) {
        return;
      }

      setState(() {
        _attachmentUploadFailure = const SettleoraBillAttachmentFailure(
          kind: SettleoraBillAttachmentFailureKind.unavailable,
          message:
              'The bill was created, but attachments cannot be uploaded right now.',
        );
        _createdBillAwaitingAttachmentUpload = createdBill;
        _isSaving = false;
      });
      return;
    }

    setState(() {
      _isSaving = true;
      _failure = null;
      _attachmentUploadFailure = null;
      _attachmentDraftError = null;
    });

    final route = SettleoraBillAttachmentRoute.personal(createdBill.id);
    final pendingUploads = List<_BillCreateDraftAttachment>.of(
      _draftAttachments,
    );
    final uploadedDraftIds = <int>{};

    try {
      for (final attachment in pendingUploads) {
        await attachmentRepository.attachAttachment(
          route,
          SettleoraBillAttachmentUpload(
            bytes: attachment.file.bytes,
            filename: attachment.file.filename,
            contentType: attachment.file.contentType,
            purpose: attachment.purpose,
          ),
        );
        uploadedDraftIds.add(attachment.id);
      }
      if (!mounted) {
        return;
      }

      setState(() {
        _draftAttachments.clear();
        _createdBillAwaitingAttachmentUpload = null;
        _isSaving = false;
      });
      await _leaveRoute(createdBill);
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _draftAttachments.removeWhere(
          (attachment) => uploadedDraftIds.contains(attachment.id),
        );
        _attachmentUploadFailure = SettleoraBillAttachmentFailure.from(error);
        _createdBillAwaitingAttachmentUpload = createdBill;
        _isSaving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final failure = _failure;
    final attachmentUploadFailure = _attachmentUploadFailure;
    final itemListError = _itemListError;
    final saveLabel = _createdBillAwaitingAttachmentUpload == null
        ? 'Save bill'
        : 'Retry remaining attachment uploads';

    return PopScope<SettleoraBillDetail>(
      canPop: _exitGuardBypassed || !_hasMeaningfulUnsavedDraft,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) {
          Future<void>.microtask(_requestExit);
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Create bill'),
          leading: BackButton(onPressed: _requestExit),
        ),
        body: SafeArea(
          child: Form(
            key: _formKey,
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (failure != null) ...[
                    _CreateBillFailureBanner(failure: failure),
                    const SizedBox(height: 16),
                  ],
                  if (attachmentUploadFailure != null) ...[
                    _CreateBillAttachmentUploadFailureBanner(
                      failure: attachmentUploadFailure,
                    ),
                    const SizedBox(height: 16),
                  ],
                  _CreateBillHeader(
                    hasReceiptAttachment: _draftAttachments.any(
                      (attachment) =>
                          attachment.purpose ==
                          SettleoraBillAttachmentPurposeValues.receipt,
                    ),
                  ),
                  const SizedBox(height: 12),
                  AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          'Bill details',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 12),
                        TextFormField(
                          key: const Key('personal-bill-merchant-name'),
                          controller: _merchantController,
                          enabled: !_isSaving,
                          onChanged: (_) => _notifyDraftChanged(),
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(
                            labelText: 'Merchant name',
                          ),
                        ),
                        const SizedBox(height: 12),
                        TextFormField(
                          key: const Key('personal-bill-date'),
                          controller: _billDateController,
                          enabled: !_isSaving,
                          onChanged: (_) => _notifyDraftChanged(),
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(
                            labelText: 'Bill date',
                            hintText: 'YYYY-MM-DD',
                          ),
                          validator: (value) =>
                              _requiredField(value, 'Enter a bill date.'),
                        ),
                        const SizedBox(height: 12),
                        TextFormField(
                          key: const Key('personal-bill-currency'),
                          controller: _currencyController,
                          enabled: !_isSaving,
                          onChanged: (_) => _notifyDraftChanged(),
                          textCapitalization: TextCapitalization.characters,
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(
                            labelText: 'Currency',
                          ),
                          validator: (value) => _currencyCodeField(
                            value,
                            requiredMessage: 'Enter a currency.',
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 22),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Items',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ),
                      TextButton.icon(
                        key: const Key('personal-bill-add-item'),
                        onPressed: _isSaving ? null : _addItem,
                        icon: const Icon(Icons.add),
                        label: const Text('Add item'),
                      ),
                    ],
                  ),
                  if (itemListError != null) ...[
                    const SizedBox(height: 6),
                    _CreateBillValidationMessage(
                      message: itemListError,
                      messageKey: const Key('personal-bill-item-list-error'),
                    ),
                  ],
                  const SizedBox(height: 10),
                  for (
                    var index = 0;
                    index < _itemControllers.length;
                    index += 1
                  )
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _PersonalBillCreateItemCard(
                        index: index,
                        controllers: _itemControllers[index],
                        isSaving: _isSaving,
                        onRemove: () => _removeItem(index),
                        onDraftChanged: _notifyDraftChanged,
                      ),
                    ),
                  const SizedBox(height: 10),
                  _BillCreateDraftAttachmentSection(
                    keyPrefix: 'personal-bill',
                    attachments: _draftAttachments,
                    errorText: _attachmentDraftError,
                    canAdd:
                        widget.attachmentFileInput != null &&
                        widget.attachmentRepository != null,
                    isBusy: _isSaving || _isPickingAttachment,
                    onAdd: _addDraftAttachment,
                    onRemove: _removeDraftAttachment,
                    onPurposeChanged: _changeDraftAttachmentPurpose,
                  ),
                  const SizedBox(height: 22),
                  _PersonalBillCreateReviewChecklist(
                    merchantController: _merchantController,
                    billDateController: _billDateController,
                    currencyController: _currencyController,
                    itemControllers: _itemControllers,
                    attachmentCount: _draftAttachments.length,
                    isAttachmentRetryActive:
                        _createdBillAwaitingAttachmentUpload != null &&
                        _draftAttachments.isNotEmpty,
                  ),
                ],
              ),
            ),
          ),
        ),
        bottomNavigationBar: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: Tooltip(
              message: saveLabel,
              child: FilledButton.icon(
                key: const Key('personal-bill-save'),
                onPressed: _isSaving ? null : _save,
                icon: _isSaving
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.check),
                label: FittedBox(child: Text(saveLabel)),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _CreateBillHeader extends StatelessWidget {
  const _CreateBillHeader({required this.hasReceiptAttachment});

  final bool hasReceiptAttachment;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;

    return AppCard(
      padding: const EdgeInsets.all(SettleoraSpacing.lg),
      color: hasReceiptAttachment ? colors.successSoft : colors.surface,
      child: Row(
        children: [
          CircleAvatar(
            radius: 22,
            backgroundColor: hasReceiptAttachment
                ? colors.surface
                : colors.primarySoft,
            foregroundColor: hasReceiptAttachment
                ? colors.onSuccessSoft
                : colors.primary,
            child: Icon(
              hasReceiptAttachment
                  ? Icons.check_circle_outline
                  : Icons.edit_note_outlined,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Create bill',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 3),
                Text(
                  hasReceiptAttachment
                      ? 'Receipt attached. Review receipt data before saving.'
                      : 'Manual entry. Add receipt files when available.',
                  style: Theme.of(
                    context,
                  ).textTheme.bodyMedium?.copyWith(color: colors.textMuted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PersonalBillCreateItemControllers {
  _PersonalBillCreateItemControllers({String? currency})
    : name = TextEditingController(),
      amount = TextEditingController(),
      currency = TextEditingController(text: currency ?? ''),
      note = TextEditingController();

  final TextEditingController name;
  final TextEditingController amount;
  final TextEditingController currency;
  final TextEditingController note;

  void dispose() {
    name.dispose();
    amount.dispose();
    currency.dispose();
    note.dispose();
  }
}

class _PersonalBillCreateReviewChecklist extends StatelessWidget {
  const _PersonalBillCreateReviewChecklist({
    required this.merchantController,
    required this.billDateController,
    required this.currencyController,
    required this.itemControllers,
    required this.attachmentCount,
    required this.isAttachmentRetryActive,
  });

  final TextEditingController merchantController;
  final TextEditingController billDateController;
  final TextEditingController currencyController;
  final List<_PersonalBillCreateItemControllers> itemControllers;
  final int attachmentCount;
  final bool isAttachmentRetryActive;

  @override
  Widget build(BuildContext context) {
    final missingDetails = <String>[
      if (merchantController.text.trim().isEmpty) 'merchant',
      if (billDateController.text.trim().isEmpty) 'bill date',
      if (currencyController.text.trim().isEmpty) 'currency',
    ];
    final missingItemNames = itemControllers
        .where((item) => item.name.text.trim().isEmpty)
        .length;
    final missingItemAmounts = itemControllers
        .where((item) => item.amount.text.trim().isEmpty)
        .length;
    final missingItemCurrencies = itemControllers
        .where((item) => item.currency.text.trim().isEmpty)
        .length;
    final itemFieldsReady =
        itemControllers.isNotEmpty &&
        missingItemNames == 0 &&
        missingItemAmounts == 0 &&
        missingItemCurrencies == 0;
    final colorScheme = Theme.of(context).colorScheme;

    return Semantics(
      container: true,
      label: 'Personal bill create local review checklist',
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colorScheme.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: colorScheme.outlineVariant),
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            key: const Key('personal-bill-create-review-checklist'),
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    Icons.fact_check_outlined,
                    color: colorScheme.onSurfaceVariant,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Review before save',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                'Local form checklist only. The server still validates the saved bill.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _ReviewChecklistChip(
                    label: _pluralCount(itemControllers.length, 'item row'),
                  ),
                  _ReviewChecklistChip(
                    label: _pluralCount(attachmentCount, 'attachment'),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              _ReviewChecklistHint(
                text: missingDetails.isEmpty
                    ? 'Merchant, date, and currency are filled locally.'
                    : 'Missing local details: ${missingDetails.join(', ')}.',
                isReady: missingDetails.isEmpty,
              ),
              _ReviewChecklistHint(
                text: itemFieldsReady
                    ? 'All item names, amounts, and currencies are filled locally.'
                    : _personalBillCreateMissingItemFieldsMessage(
                        itemControllers: itemControllers,
                        missingItemNames: missingItemNames,
                        missingItemAmounts: missingItemAmounts,
                        missingItemCurrencies: missingItemCurrencies,
                      ),
                isReady: itemFieldsReady,
              ),
              _ReviewChecklistHint(
                text: attachmentCount == 0
                    ? 'No attachments selected.'
                    : 'Attachments are selected for upload after bill creation.',
                isReady: attachmentCount > 0,
              ),
              if (isAttachmentRetryActive)
                const _ReviewChecklistHint(
                  text:
                      'Attachment retry is active for the remaining selected uploads.',
                  isReady: false,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

String _personalBillCreateMissingItemFieldsMessage({
  required List<_PersonalBillCreateItemControllers> itemControllers,
  required int missingItemNames,
  required int missingItemAmounts,
  required int missingItemCurrencies,
}) {
  if (itemControllers.isEmpty) {
    return 'No item rows yet.';
  }

  final missingParts = <String>[
    if (missingItemNames > 0) _pluralCount(missingItemNames, 'item name'),
    if (missingItemAmounts > 0) _pluralCount(missingItemAmounts, 'item amount'),
    if (missingItemCurrencies > 0)
      _pluralCount(missingItemCurrencies, 'item currency'),
  ];

  return 'Missing local item fields: ${missingParts.join(', ')}.';
}

Future<bool> _confirmDiscardCreateDraft(
  BuildContext context, {
  required String keyPrefix,
}) async {
  final shouldDiscard = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      key: Key('$keyPrefix-exit-guard-dialog'),
      title: const Text('Discard draft?'),
      content: const Text(
        'You have unsaved local work on this bill. Leave only if you want to discard this draft.',
      ),
      actions: [
        TextButton(
          key: Key('$keyPrefix-exit-keep-editing'),
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('Keep editing'),
        ),
        FilledButton(
          key: Key('$keyPrefix-exit-discard'),
          onPressed: () => Navigator.of(context).pop(true),
          child: const Text('Discard draft'),
        ),
      ],
    ),
  );

  return shouldDiscard ?? false;
}

class _BillCreateDraftAttachment {
  const _BillCreateDraftAttachment({
    required this.id,
    required this.file,
    required this.purpose,
  });

  final int id;
  final SettleoraPickedBillAttachmentFile file;
  final SettleoraBillAttachmentPurpose purpose;

  _BillCreateDraftAttachment copyWith({
    SettleoraBillAttachmentPurpose? purpose,
  }) {
    return _BillCreateDraftAttachment(
      id: id,
      file: file,
      purpose: purpose ?? this.purpose,
    );
  }
}

typedef _BillCreateDraftAttachmentPurposeChanged =
    void Function(int id, SettleoraBillAttachmentPurpose purpose);

class _BillCreateDraftAttachmentSection extends StatelessWidget {
  const _BillCreateDraftAttachmentSection({
    required this.keyPrefix,
    required this.attachments,
    required this.errorText,
    required this.canAdd,
    required this.isBusy,
    required this.onAdd,
    required this.onRemove,
    required this.onPurposeChanged,
  });

  final String keyPrefix;
  final List<_BillCreateDraftAttachment> attachments;
  final String? errorText;
  final bool canAdd;
  final bool isBusy;
  final VoidCallback onAdd;
  final ValueChanged<int> onRemove;
  final _BillCreateDraftAttachmentPurposeChanged onPurposeChanged;

  @override
  Widget build(BuildContext context) {
    final attachmentCount = attachments.length;

    return Column(
      key: Key('$keyPrefix-attachments-section'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'Attachments',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            TextButton.icon(
              key: Key('$keyPrefix-attachment-add'),
              onPressed: canAdd && !isBusy ? onAdd : null,
              icon: isBusy
                  ? const SizedBox.square(
                      dimension: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.attach_file_outlined),
              label: const Text('Add attachment'),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          attachmentCount == 1
              ? '1 attachment selected'
              : '$attachmentCount attachments selected',
          key: Key('$keyPrefix-attachment-count'),
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        if (errorText != null) ...[
          const SizedBox(height: 6),
          Text(
            errorText!,
            key: Key('$keyPrefix-attachment-error'),
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
        ],
        const SizedBox(height: 10),
        if (attachments.isEmpty)
          const _StatePanel(
            icon: Icons.attach_file_outlined,
            title: 'No attachments selected',
            message: 'Receipts and supporting files can be added later.',
          )
        else
          for (var index = 0; index < attachments.length; index += 1)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _BillCreateDraftAttachmentTile(
                keyPrefix: keyPrefix,
                attachment: attachments[index],
                index: index,
                isBusy: isBusy,
                onRemove: () => onRemove(attachments[index].id),
                onPurposeChanged: (purpose) =>
                    onPurposeChanged(attachments[index].id, purpose),
              ),
            ),
      ],
    );
  }
}

class _BillCreateDraftAttachmentTile extends StatelessWidget {
  const _BillCreateDraftAttachmentTile({
    required this.keyPrefix,
    required this.attachment,
    required this.index,
    required this.isBusy,
    required this.onRemove,
    required this.onPurposeChanged,
  });

  final String keyPrefix;
  final _BillCreateDraftAttachment attachment;
  final int index;
  final bool isBusy;
  final VoidCallback onRemove;
  final ValueChanged<SettleoraBillAttachmentPurpose> onPurposeChanged;

  @override
  Widget build(BuildContext context) {
    final purposeLabel = _billAttachmentPurposeLabel(attachment.purpose);
    final purposeChoices = _billAttachmentPurposeChoicesForContentType(
      attachment.file.contentType,
    );
    final attachmentNumber = index + 1;
    final fileSizeLabel = '${attachment.file.bytes.length} bytes';
    final purposeControlLabel =
        'Change selected draft attachment $attachmentNumber purpose';

    return Semantics(
      container: true,
      explicitChildNodes: true,
      label:
          'Selected bill attachment $attachmentNumber. Filename: ${attachment.file.filename}. Content type: ${attachment.file.contentType}. Size: $fileSizeLabel. Selected purpose: $purposeLabel.',
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border.all(
            color: Theme.of(context).colorScheme.outlineVariant,
          ),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                attachment.purpose ==
                        SettleoraBillAttachmentPurposeValues.receipt
                    ? Icons.receipt_long_outlined
                    : Icons.attach_file_outlined,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      attachment.file.filename,
                      key: ValueKey('$keyPrefix-attachment-name-$index'),
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      purposeLabel,
                      key: ValueKey('$keyPrefix-attachment-purpose-$index'),
                    ),
                    const SizedBox(height: 6),
                    Semantics(
                      container: true,
                      button: true,
                      enabled: !isBusy,
                      label: purposeControlLabel,
                      value: purposeLabel,
                      child: PopupMenuButton<SettleoraBillAttachmentPurpose>(
                        key: ValueKey(
                          '$keyPrefix-attachment-purpose-menu-$index',
                        ),
                        enabled: !isBusy,
                        initialValue: attachment.purpose,
                        onSelected: onPurposeChanged,
                        tooltip: purposeControlLabel,
                        itemBuilder: (context) => [
                          for (final purpose in purposeChoices)
                            PopupMenuItem<SettleoraBillAttachmentPurpose>(
                              key: ValueKey(
                                '$keyPrefix-attachment-purpose-choice-$index-${_billAttachmentPurposeKeySuffix(purpose)}',
                              ),
                              value: purpose,
                              child: Text(_billAttachmentPurposeLabel(purpose)),
                            ),
                        ],
                        child: Text(
                          'Change purpose',
                          semanticsLabel: purposeControlLabel,
                          style: Theme.of(context).textTheme.labelLarge
                              ?.copyWith(
                                color: isBusy
                                    ? Theme.of(context).disabledColor
                                    : Theme.of(context).colorScheme.primary,
                              ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text('${attachment.file.contentType} - $fileSizeLabel'),
                  ],
                ),
              ),
              IconButton(
                key: ValueKey('$keyPrefix-attachment-remove-$index'),
                onPressed: isBusy ? null : onRemove,
                tooltip: 'Remove selected bill attachment',
                icon: const Icon(Icons.remove_circle_outline),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PersonalBillCreateItemCard extends StatelessWidget {
  const _PersonalBillCreateItemCard({
    required this.index,
    required this.controllers,
    required this.isSaving,
    required this.onRemove,
    required this.onDraftChanged,
  });

  final int index;
  final _PersonalBillCreateItemControllers controllers;
  final bool isSaving;
  final VoidCallback onRemove;
  final VoidCallback onDraftChanged;

  @override
  Widget build(BuildContext context) {
    final itemNumber = index + 1;

    return AppCard(
      child: Padding(
        padding: EdgeInsets.zero,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Item $itemNumber',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                ),
                IconButton(
                  key: ValueKey('personal-bill-item-remove-$index'),
                  onPressed: isSaving ? null : onRemove,
                  tooltip: 'Remove item',
                  icon: const Icon(Icons.remove_circle_outline),
                ),
              ],
            ),
            const SizedBox(height: 8),
            TextFormField(
              key: ValueKey('personal-bill-item-name-$index'),
              controller: controllers.name,
              enabled: !isSaving,
              onChanged: (_) => onDraftChanged(),
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(labelText: 'Name'),
              validator: (value) =>
                  _requiredField(value, 'Enter an item name.'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: ValueKey('personal-bill-item-amount-$index'),
              controller: controllers.amount,
              enabled: !isSaving,
              onChanged: (_) => onDraftChanged(),
              keyboardType: TextInputType.number,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(labelText: 'Amount'),
              validator: (value) => _positiveMoneyAmountField(
                value,
                requiredMessage: 'Enter an item amount.',
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: ValueKey('personal-bill-item-currency-$index'),
              controller: controllers.currency,
              enabled: !isSaving,
              onChanged: (_) => onDraftChanged(),
              textCapitalization: TextCapitalization.characters,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(labelText: 'Currency'),
              validator: (value) => _currencyCodeField(
                value,
                requiredMessage: 'Enter an item currency.',
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: ValueKey('personal-bill-item-note-$index'),
              controller: controllers.note,
              enabled: !isSaving,
              onChanged: (_) => onDraftChanged(),
              textInputAction: TextInputAction.done,
              decoration: const InputDecoration(labelText: 'Note'),
            ),
          ],
        ),
      ),
    );
  }
}

class _CreateBillFailureBanner extends StatelessWidget {
  const _CreateBillFailureBanner({
    required this.failure,
    this.bannerKey = const Key('personal-bill-create-failure'),
  });

  final SettleoraBillFailure failure;
  final Key bannerKey;

  @override
  Widget build(BuildContext context) {
    final message = '${failure.title}: ${failure.message}';

    return Semantics(
      key: bannerKey,
      container: true,
      liveRegion: true,
      label: message,
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border.all(color: Theme.of(context).colorScheme.error),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.info_outline),
              const SizedBox(width: 10),
              Expanded(child: Text(message, semanticsLabel: message)),
            ],
          ),
        ),
      ),
    );
  }
}

class _CreateBillValidationMessage extends StatelessWidget {
  const _CreateBillValidationMessage({
    required this.message,
    required this.messageKey,
  });

  final String message;
  final Key messageKey;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      key: messageKey,
      container: true,
      liveRegion: true,
      label: message,
      child: Text(
        message,
        semanticsLabel: message,
        style: TextStyle(color: Theme.of(context).colorScheme.error),
      ),
    );
  }
}

class _CreateBillAttachmentUploadFailureBanner extends StatelessWidget {
  const _CreateBillAttachmentUploadFailureBanner({
    required this.failure,
    this.bannerKey = const Key(
      'personal-bill-create-attachment-upload-failure',
    ),
  });

  final SettleoraBillAttachmentFailure failure;
  final Key bannerKey;

  @override
  Widget build(BuildContext context) {
    final message =
        'Bill created, but some attachments were not uploaded. '
        '${failure.title}: ${failure.message}';

    return Semantics(
      key: bannerKey,
      container: true,
      liveRegion: true,
      label: message,
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border.all(color: Theme.of(context).colorScheme.error),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.info_outline),
              const SizedBox(width: 10),
              Expanded(child: Text(message, semanticsLabel: message)),
            ],
          ),
        ),
      ),
    );
  }
}

class SettleoraGroupBillListScreen extends StatefulWidget {
  const SettleoraGroupBillListScreen({
    super.key,
    required this.repository,
    required this.groupRepository,
    required this.groupId,
    required this.groupName,
    this.currentUserProfileId,
    this.participantDisplayNames = const {},
    this.attachmentRepository,
    this.attachmentFileInput,
    this.receiptOcrReviewRepository,
    this.revisionRepository,
  });

  final SettleoraBillRepository repository;
  final SettleoraGroupRepository groupRepository;
  final String groupId;
  final String groupName;
  final String? currentUserProfileId;
  final Map<String, String> participantDisplayNames;
  final SettleoraBillAttachmentRepository? attachmentRepository;
  final SettleoraBillAttachmentFileInput? attachmentFileInput;
  final ReceiptOcrReviewRepository? receiptOcrReviewRepository;
  final SettleoraBillRevisionRepository? revisionRepository;

  @override
  State<SettleoraGroupBillListScreen> createState() =>
      _SettleoraGroupBillListScreenState();
}

class _SettleoraGroupBillListScreenState
    extends State<SettleoraGroupBillListScreen> {
  final _searchController = TextEditingController();

  bool _isLoading = true;
  List<SettleoraBillSummary> _bills = const [];
  late Map<String, String> _participantDisplayNames;
  _GroupBillListFilter _selectedFilter = _GroupBillListFilter.all;
  SettleoraBillFailure? _failure;

  @override
  void initState() {
    super.initState();
    _participantDisplayNames = _normalizeParticipantDisplayNames(
      widget.participantDisplayNames,
    );
    Future<void>.microtask(_load);
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _failure = null;
    });

    try {
      final bills = await widget.repository.listGroupBills(
        widget.groupId,
        limit: 50,
      );
      final participantDisplayNames = await _loadParticipantDisplayNames();
      if (!mounted) {
        return;
      }

      setState(() {
        _bills = bills;
        _participantDisplayNames = participantDisplayNames;
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _failure = SettleoraBillFailure.from(error);
        _isLoading = false;
      });
    }
  }

  Future<void> _openBill(SettleoraBillSummary bill) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SettleoraGroupBillDetailScreen(
          repository: widget.repository,
          attachmentRepository: widget.attachmentRepository,
          attachmentFileInput: widget.attachmentFileInput,
          receiptOcrReviewRepository: widget.receiptOcrReviewRepository,
          revisionRepository: widget.revisionRepository,
          groupId: widget.groupId,
          groupName: widget.groupName,
          currentUserProfileId: widget.currentUserProfileId,
          participantDisplayNames: _participantDisplayNames,
          billId: bill.id,
        ),
      ),
    );

    if (mounted) {
      await _load();
    }
  }

  Future<void> _openCreateGroupBill() async {
    final createdBill = await Navigator.of(context).push<SettleoraBillDetail>(
      MaterialPageRoute(
        builder: (_) => SettleoraGroupBillCreateScreen(
          billRepository: widget.repository,
          groupRepository: widget.groupRepository,
          groupId: widget.groupId,
          groupName: widget.groupName,
          attachmentRepository: widget.attachmentRepository,
          attachmentFileInput: widget.attachmentFileInput,
        ),
      ),
    );

    if (!mounted || createdBill == null) {
      return;
    }

    setState(() {
      _failure = null;
      _bills = [
        _summaryFromCreatedDetail(createdBill),
        ..._bills.where((bill) => bill.id != createdBill.id),
      ];
    });

    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SettleoraGroupBillDetailScreen(
          repository: widget.repository,
          attachmentRepository: widget.attachmentRepository,
          attachmentFileInput: widget.attachmentFileInput,
          receiptOcrReviewRepository: widget.receiptOcrReviewRepository,
          revisionRepository: widget.revisionRepository,
          groupId: widget.groupId,
          groupName: widget.groupName,
          currentUserProfileId: widget.currentUserProfileId,
          participantDisplayNames: _participantDisplayNames,
          billId: createdBill.id,
          initialBill: createdBill,
        ),
      ),
    );

    if (mounted) {
      await _load();
    }
  }

  Future<Map<String, String>> _loadParticipantDisplayNames() async {
    try {
      final members = await widget.groupRepository.listGroupMembers(
        widget.groupId,
      );
      return _participantDisplayNamesFromMembers(members);
    } catch (_) {
      return _participantDisplayNames;
    }
  }

  @override
  Widget build(BuildContext context) {
    final searchQuery = _searchController.text;
    final visibleBills = _filteredBills(searchQuery);
    final filterCounts = _filterCounts();
    final hasFilters =
        searchQuery.trim().isNotEmpty ||
        _selectedFilter != _GroupBillListFilter.all;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Group bills'),
        actions: [
          IconButton(
            key: const Key('group-bill-list-refresh'),
            onPressed: _isLoading ? null : _load,
            tooltip: 'Refresh',
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: Builder(
          builder: (context) {
            if (_isLoading) {
              return const _LoadingPanel(label: 'Loading group bills');
            }

            final failure = _failure;
            if (failure != null) {
              return _FailurePanel(failure: failure, onRetry: _load);
            }

            return RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
                children: [
                  _GroupBillContext(groupName: widget.groupName),
                  const SizedBox(height: 14),
                  _BillListDiscoveryControls(
                    keyPrefix: 'group-bill-list',
                    searchController: _searchController,
                    searchHint: 'Search group bills',
                    selectedFilter: _selectedFilter,
                    filters: _GroupBillListFilter.values,
                    labelForFilter: (filter) =>
                        filter.labelWithCount(filterCounts[filter] ?? 0),
                    onSearchChanged: (_) => setState(() {}),
                    onFilterSelected: (filter) {
                      setState(() {
                        _selectedFilter = filter;
                      });
                    },
                    onClear: _clearFilters,
                    hasFilters: hasFilters,
                  ),
                  if (_bills.isEmpty) ...[
                    const SizedBox(height: 56),
                    _StatePanel(
                      icon: Icons.receipt_long_outlined,
                      title: 'No group bills',
                      message:
                          'Bills visible in ${_safeGroupName(widget.groupName)} will appear here.',
                    ),
                  ] else if (visibleBills.isEmpty) ...[
                    const SizedBox(height: 56),
                    _StatePanel(
                      icon: hasFilters
                          ? Icons.search_off_outlined
                          : Icons.filter_list_off_outlined,
                      title: searchQuery.trim().isNotEmpty
                          ? 'No matching group bills'
                          : _selectedFilter.emptyTitle,
                      message: searchQuery.trim().isNotEmpty
                          ? 'No group bills match this search and filter.'
                          : _selectedFilter.emptyMessage,
                    ),
                  ] else ...[
                    const SizedBox(height: 14),
                    for (var index = 0; index < visibleBills.length; index += 1)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _ReadOnlyBillSummaryTile(
                          bill: visibleBills[index],
                          currentUserProfileId: widget.currentUserProfileId,
                          participantDisplayNames: _participantDisplayNames,
                          onTap: () => _openBill(visibleBills[index]),
                        ),
                      ),
                  ],
                ],
              ),
            );
          },
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        key: const Key('group-bill-list-create'),
        onPressed: _isLoading ? null : _openCreateGroupBill,
        icon: const Icon(Icons.add),
        label: const Text('Create group bill'),
      ),
      bottomNavigationBar: const SettleoraBottomNav(
        selected: SettleoraNavDestination.groups,
      ),
    );
  }

  List<SettleoraBillSummary> _filteredBills(String query) {
    return _bills
        .where(
          (bill) => _selectedFilter.matches(
            bill: bill,
            currentUserProfileId: widget.currentUserProfileId,
          ),
        )
        .where(
          (bill) => _billMatchesQuery(
            bill,
            query,
            participantDisplayNames: _participantDisplayNames,
            extraFields: [widget.groupName],
          ),
        )
        .toList(growable: false);
  }

  Map<_GroupBillListFilter, int> _filterCounts() {
    return {
      for (final filter in _GroupBillListFilter.values)
        filter: _bills
            .where(
              (bill) => filter.matches(
                bill: bill,
                currentUserProfileId: widget.currentUserProfileId,
              ),
            )
            .length,
    };
  }

  void _clearFilters() {
    setState(() {
      _searchController.clear();
      _selectedFilter = _GroupBillListFilter.all;
    });
  }
}

enum _GroupBillListFilter {
  all,
  needsYourResponse,
  youAccepted,
  youRejected,
  hasRejections,
}

extension _GroupBillListFilterText on _GroupBillListFilter {
  String get label {
    return switch (this) {
      _GroupBillListFilter.all => 'All',
      _GroupBillListFilter.needsYourResponse => 'Needs your response',
      _GroupBillListFilter.youAccepted => 'You accepted',
      _GroupBillListFilter.youRejected => 'You rejected',
      _GroupBillListFilter.hasRejections => 'Has rejections',
    };
  }

  String labelWithCount(int count) {
    return '$label ($count)';
  }

  String get emptyTitle {
    return switch (this) {
      _GroupBillListFilter.needsYourResponse => 'No response needed',
      _ => 'No matching group bills',
    };
  }

  String get emptyMessage {
    return switch (this) {
      _GroupBillListFilter.needsYourResponse =>
        'No group bills need your response.',
      _ => 'No group bills match this filter.',
    };
  }

  bool matches({
    required SettleoraBillSummary bill,
    required String? currentUserProfileId,
  }) {
    return switch (this) {
      _GroupBillListFilter.all => true,
      _GroupBillListFilter.needsYourResponse =>
        _currentParticipantHasStatus(
              bill,
              currentUserProfileId,
              SettleoraBillParticipantStatusValues.pendingAcceptance,
            ) &&
            _billNeedsCurrentUserResponse(bill),
      _GroupBillListFilter.youAccepted => _currentParticipantHasStatus(
        bill,
        currentUserProfileId,
        SettleoraBillParticipantStatusValues.accepted,
      ),
      _GroupBillListFilter.youRejected => _currentParticipantHasStatus(
        bill,
        currentUserProfileId,
        SettleoraBillParticipantStatusValues.rejected,
      ),
      _GroupBillListFilter.hasRejections => bill.participants.any(
        (participant) =>
            participant.status == SettleoraBillParticipantStatusValues.rejected,
      ),
    };
  }
}

bool _billNeedsCurrentUserResponse(SettleoraBillSummary bill) {
  return bill.status == 'pending_confirmation';
}

bool _currentParticipantHasStatus(
  SettleoraBillSummary bill,
  String? currentUserProfileId,
  SettleoraBillParticipantStatus status,
) {
  final participant = _currentBillParticipant(bill, currentUserProfileId);
  return participant?.status == status;
}

SettleoraBillParticipant? _currentBillParticipant(
  SettleoraBillSummary bill,
  String? currentUserProfileId,
) {
  final trimmed = currentUserProfileId?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }

  for (final participant in bill.participants) {
    if (participant.userProfileId.trim() == trimmed) {
      return participant;
    }
  }

  return null;
}

bool _billMatchesQuery(
  SettleoraBillSummary bill,
  String query, {
  Map<String, String> participantDisplayNames = const {},
  Iterable<String> extraFields = const [],
}) {
  final normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.isEmpty) {
    return true;
  }

  final searchableFields = <String>[
    bill.displayName,
    bill.billDate,
    bill.totalAmount,
    bill.totalCurrency,
    _money(bill.totalAmount, bill.totalCurrency),
    settleoraBillStatusLabel(bill.status),
    bill.status,
    settleoraBillReconciliationStatusLabel(bill.reconciliationStatus),
    bill.reconciliationStatus,
    settleoraBillArchiveStateLabel(bill.archiveState),
    bill.archiveState,
    '${bill.itemCount} items',
    '${bill.participantCount} participants',
    '${bill.payerCount} payers',
    ...extraFields,
  ];

  for (final participant in bill.participants) {
    searchableFields.addAll([
      participant.userProfileId,
      settleoraBillParticipantStatusLabel(participant.status),
      participant.status,
      participant.resolvedShareAmount,
      participant.resolvedShareCurrency,
      _money(
        participant.resolvedShareAmount,
        participant.resolvedShareCurrency,
      ),
    ]);
    final displayName = participantDisplayNames[participant.userProfileId];
    if (displayName != null) {
      searchableFields.add(displayName);
    }
    final reasonCode = participant.rejectionReasonCode;
    if (reasonCode != null) {
      searchableFields.addAll([
        reasonCode,
        settleoraBillParticipantRejectionReasonLabel(reasonCode),
      ]);
    }
  }

  return searchableFields
      .where((field) => field.trim().isNotEmpty)
      .any((field) => field.toLowerCase().contains(normalizedQuery));
}

class _BillListDiscoveryControls<T extends Enum> extends StatelessWidget {
  const _BillListDiscoveryControls({
    required this.keyPrefix,
    required this.searchController,
    required this.searchHint,
    required this.selectedFilter,
    required this.filters,
    required this.labelForFilter,
    required this.onSearchChanged,
    required this.onFilterSelected,
    required this.onClear,
    required this.hasFilters,
  });

  final String keyPrefix;
  final TextEditingController searchController;
  final String searchHint;
  final T selectedFilter;
  final List<T> filters;
  final String Function(T filter) labelForFilter;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<T> onFilterSelected;
  final VoidCallback onClear;
  final bool hasFilters;

  @override
  Widget build(BuildContext context) {
    final filterKeyPrefix = keyPrefix == 'group-bill-list'
        ? 'group-bill'
        : keyPrefix;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          key: Key('$keyPrefix-search'),
          controller: searchController,
          onChanged: onSearchChanged,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            prefixIcon: const Icon(Icons.search),
            suffixIcon: searchController.text.trim().isEmpty
                ? null
                : IconButton(
                    key: Key('$keyPrefix-clear-search'),
                    tooltip: 'Clear search',
                    onPressed: () {
                      searchController.clear();
                      onSearchChanged('');
                    },
                    icon: const Icon(Icons.close),
                  ),
            labelText: searchHint,
            border: const OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: SingleChildScrollView(
                key: Key('$keyPrefix-filters'),
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (final filter in filters) ...[
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: FilterChip(
                          key: ValueKey(
                            '$filterKeyPrefix-filter-${filter.name}',
                          ),
                          label: Text(labelForFilter(filter)),
                          selected: selectedFilter == filter,
                          onSelected: (_) => onFilterSelected(filter),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(width: 8),
            TextButton.icon(
              key: Key('$keyPrefix-clear-filters'),
              onPressed: hasFilters ? onClear : null,
              icon: const Icon(Icons.filter_list_off_outlined),
              label: const Text('Clear'),
            ),
          ],
        ),
      ],
    );
  }
}

class SettleoraGroupBillCreateScreen extends StatefulWidget {
  const SettleoraGroupBillCreateScreen({
    super.key,
    required this.billRepository,
    required this.groupRepository,
    required this.groupId,
    required this.groupName,
    this.attachmentRepository,
    this.attachmentFileInput,
  });

  final SettleoraBillRepository billRepository;
  final SettleoraGroupRepository groupRepository;
  final String groupId;
  final String groupName;
  final SettleoraBillAttachmentRepository? attachmentRepository;
  final SettleoraBillAttachmentFileInput? attachmentFileInput;

  @override
  State<SettleoraGroupBillCreateScreen> createState() =>
      _SettleoraGroupBillCreateScreenState();
}

class _SettleoraGroupBillCreateScreenState
    extends State<SettleoraGroupBillCreateScreen> {
  final _formKey = GlobalKey<FormState>();
  final _merchantController = TextEditingController();
  final _billDateController = TextEditingController();
  final _currencyController = TextEditingController(text: 'USD');
  final List<_GroupBillCreateItemControllers> _itemControllers = [];
  final List<_GroupBillCreatePayerControllers> _payerControllers = [];
  final List<_BillCreateDraftAttachment> _draftAttachments = [];
  bool _isLoadingMembers = true;
  bool _isSaving = false;
  bool _isPickingAttachment = false;
  List<SettleoraGroupMember> _members = const [];
  SettleoraGroupFailure? _memberFailure;
  SettleoraBillFailure? _failure;
  SettleoraBillAttachmentFailure? _attachmentUploadFailure;
  SettleoraBillDetail? _createdBillAwaitingCompletion;
  _GroupBillCreateEntryMode _entryMode = _GroupBillCreateEntryMode.manual;
  _GroupBillCreateStep _selectedStep = _GroupBillCreateStep.start;
  _GroupBillSplitMode _selectedSplitMode = _GroupBillSplitMode.byItem;
  String _splitAssignmentFilter = _groupBillAssignmentFilterAll;
  String? _itemListError;
  String? _splitTotalError;
  String? _payerTotalError;
  String? _attachmentDraftError;
  int _nextDraftAttachmentId = 0;
  bool _exitGuardBypassed = false;

  @override
  void initState() {
    super.initState();
    _itemControllers.add(
      _GroupBillCreateItemControllers(currency: _currencyController.text),
    );
    Future<void>.microtask(_loadMembers);
  }

  @override
  void dispose() {
    _merchantController.dispose();
    _billDateController.dispose();
    _currencyController.dispose();
    for (final item in _itemControllers) {
      item.dispose();
    }
    for (final payer in _payerControllers) {
      payer.dispose();
    }
    super.dispose();
  }

  Future<void> _loadMembers() async {
    setState(() {
      _isLoadingMembers = true;
      _memberFailure = null;
    });

    try {
      final members = await widget.groupRepository.listGroupMembers(
        widget.groupId,
      );
      if (!mounted) {
        return;
      }

      final activeMembers = members
          .where(
            (member) =>
                member.status == SettleoraGroupMembershipStatusValues.active,
          )
          .toList(growable: false);
      setState(() {
        _members = activeMembers;
        _isLoadingMembers = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _memberFailure = SettleoraGroupFailure.from(error);
        _isLoadingMembers = false;
      });
    }
  }

  void _addItem() {
    setState(() {
      _itemListError = null;
      _splitTotalError = null;
      _payerTotalError = null;
      _itemControllers.add(
        _GroupBillCreateItemControllers(currency: _currencyController.text),
      );
    });
  }

  void _removeItem(int index) {
    if (index < 0 || index >= _itemControllers.length) {
      return;
    }

    setState(() {
      final removed = _itemControllers.removeAt(index);
      removed.dispose();
      _itemListError = _itemControllers.isEmpty
          ? 'Add at least one item before saving.'
          : null;
      _splitTotalError = null;
      _payerTotalError = null;
    });
  }

  void _addPayer() {
    setState(() {
      _payerTotalError = null;
      _payerControllers.add(
        _GroupBillCreatePayerControllers(currency: _currencyController.text),
      );
    });
  }

  void _removePayer(int index) {
    if (index < 0 || index >= _payerControllers.length) {
      return;
    }

    setState(() {
      final removed = _payerControllers.removeAt(index);
      removed.dispose();
      _payerTotalError = null;
    });
  }

  void _selectSplitMode(_GroupBillSplitMode mode) {
    setState(() {
      _selectedSplitMode = mode;
    });
  }

  void _selectSplitAssignmentFilter(String filter) {
    setState(() {
      _splitAssignmentFilter = filter;
    });
  }

  void _assignAllUnassignedEqually() {
    if (_isSaving || _members.isEmpty) {
      return;
    }

    setState(() {
      for (final item in _itemControllers) {
        if (!_groupBillCreateItemIsUnassigned(item)) {
          continue;
        }

        for (final split in item.splits) {
          split.dispose();
        }
        item.splits
          ..clear()
          ..addAll([
            for (final member in _members)
              _GroupBillCreateSplitControllers()
                ..userProfileId = member.userProfileId
                ..splitMethod.text = 'equal',
          ]);
      }
      _splitTotalError = null;
    });
  }

  void _clearSplitAssignments() {
    if (_isSaving) {
      return;
    }

    setState(() {
      for (final item in _itemControllers) {
        for (final split in item.splits) {
          split.dispose();
        }
        item.splits
          ..clear()
          ..add(_GroupBillCreateSplitControllers());
      }
      _splitTotalError = null;
    });
  }

  Future<void> _openAssignItemSheet(int itemIndex) async {
    if (_isSaving || itemIndex < 0 || itemIndex >= _itemControllers.length) {
      return;
    }

    final assignment = await showModalBottomSheet<_GroupBillItemAssignment>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _GroupBillAssignItemSheet(
        itemIndex: itemIndex,
        item: _itemControllers[itemIndex],
        members: _members,
        currency: _currencyController.text,
      ),
    );
    if (!mounted || assignment == null) {
      return;
    }

    setState(() {
      final item = _itemControllers[itemIndex];
      for (final split in item.splits) {
        split.dispose();
      }
      item.splits
        ..clear()
        ..addAll([
          for (final memberId in assignment.memberIds)
            _GroupBillCreateSplitControllers()
              ..userProfileId = memberId
              ..splitMethod.text = assignment.method.apiValue
              ..basisValue.text = assignment.basisValueFor(memberId)
              ..allocationOrder.text = assignment.allocationOrderFor(memberId),
        ]);
      if (item.splits.isEmpty) {
        item.splits.add(_GroupBillCreateSplitControllers());
      }
      _splitTotalError = null;
    });
  }

  void _notifyDraftChanged() {
    if (!mounted || _isSaving) {
      return;
    }

    setState(() {});
  }

  bool get _hasMeaningfulUnsavedDraft {
    if (_createdBillAwaitingCompletion != null) {
      return true;
    }

    if (_draftAttachments.isNotEmpty || _payerControllers.isNotEmpty) {
      return true;
    }

    if (_merchantController.text.trim().isNotEmpty ||
        _billDateController.text.trim().isNotEmpty ||
        _currencyController.text.trim().toUpperCase() != 'USD') {
      return true;
    }

    if (_itemControllers.length != 1 || _itemControllers.isEmpty) {
      return true;
    }

    final item = _itemControllers.single;
    if (item.name.text.trim().isNotEmpty ||
        item.amount.text.trim().isNotEmpty ||
        item.note.text.trim().isNotEmpty ||
        item.currency.text.trim().toUpperCase() != 'USD' ||
        item.splits.length != 1 ||
        item.splits.isEmpty) {
      return true;
    }

    final split = item.splits.single;
    return (split.userProfileId ?? '').trim().isNotEmpty ||
        split.splitMethod.text.trim() != 'equal' ||
        split.basisValue.text.trim().isNotEmpty ||
        split.allocationOrder.text.trim().isNotEmpty;
  }

  Future<void> _requestExit() async {
    if (!_hasMeaningfulUnsavedDraft) {
      await _leaveRoute();
      return;
    }

    final shouldDiscard = await _confirmDiscardCreateDraft(
      context,
      keyPrefix: 'group-bill',
    );
    if (shouldDiscard && mounted) {
      await _leaveRoute();
    }
  }

  Future<void> _leaveRoute([SettleoraBillDetail? result]) async {
    if (!mounted) {
      return;
    }

    setState(() {
      _exitGuardBypassed = true;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        Navigator.of(context).pop(result);
      }
    });
  }

  Future<void> _addDraftAttachment() async {
    final fileInput = widget.attachmentFileInput;
    if (fileInput == null || _isSaving || _isPickingAttachment) {
      return;
    }

    setState(() {
      _isPickingAttachment = true;
      _attachmentDraftError = null;
    });

    try {
      final purpose = await _selectDraftAttachmentPurpose();
      if (!mounted || purpose == null) {
        return;
      }

      final allowedContentTypes = billAttachmentUploadContentTypesForPurpose(
        purpose,
      );
      final pickedFile = await fileInput.pickAttachmentFile(
        allowedContentTypes: allowedContentTypes,
      );
      if (!mounted || pickedFile == null) {
        return;
      }

      final validatedFile = validatePickedBillAttachmentFile(
        pickedFile,
        allowedContentTypes: allowedContentTypes,
      );
      setState(() {
        _draftAttachments.add(
          _BillCreateDraftAttachment(
            id: _nextDraftAttachmentId,
            file: validatedFile,
            purpose: purpose,
          ),
        );
        _nextDraftAttachmentId += 1;
      });
    } on SettleoraBillAttachmentFileInputFailure catch (failure) {
      if (!mounted) {
        return;
      }

      setState(() {
        _attachmentDraftError = failure.message;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _attachmentDraftError =
            'The attachment could not be selected. Try again.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isPickingAttachment = false;
        });
      }
    }
  }

  Future<SettleoraBillAttachmentPurpose?> _selectDraftAttachmentPurpose() {
    return showModalBottomSheet<SettleoraBillAttachmentPurpose>(
      context: context,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Add attachment as',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              ListTile(
                key: const Key('group-bill-attachment-purpose-receipt'),
                leading: const Icon(Icons.receipt_long_outlined),
                title: const Text('Receipt'),
                onTap: () => Navigator.of(
                  context,
                ).pop(SettleoraBillAttachmentPurposeValues.receipt),
              ),
              ListTile(
                key: const Key('group-bill-attachment-purpose-supporting'),
                leading: const Icon(Icons.attach_file_outlined),
                title: const Text('Supporting attachment'),
                onTap: () => Navigator.of(context).pop(
                  SettleoraBillAttachmentPurposeValues.supportingAttachment,
                ),
              ),
              const SizedBox(height: 8),
              TextButton(
                key: const Key('group-bill-attachment-purpose-cancel'),
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Cancel'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _removeDraftAttachment(int id) {
    if (_isSaving) {
      return;
    }

    setState(() {
      _attachmentDraftError = null;
      _attachmentUploadFailure = null;
      _draftAttachments.removeWhere((attachment) => attachment.id == id);
    });
  }

  void _changeDraftAttachmentPurpose(
    int id,
    SettleoraBillAttachmentPurpose purpose,
  ) {
    if (_isSaving) {
      return;
    }

    setState(() {
      _attachmentDraftError = null;
      _attachmentUploadFailure = null;
      final index = _draftAttachments.indexWhere(
        (attachment) => attachment.id == id,
      );
      if (index < 0) {
        return;
      }

      _draftAttachments[index] = _draftAttachments[index].copyWith(
        purpose: purpose,
      );
    });
  }

  Future<void> _save() async {
    if (_isSaving) {
      return;
    }

    final existingCreatedBill = _createdBillAwaitingCompletion;
    if (existingCreatedBill != null) {
      if (_draftAttachments.isEmpty) {
        await _submitCreatedGroupBill(existingCreatedBill);
      } else {
        await _finishAttachmentUploads(existingCreatedBill);
      }
      return;
    }

    setState(() {
      _failure = null;
      _attachmentUploadFailure = null;
      _splitTotalError = null;
      _payerTotalError = null;
      _itemListError = _itemControllers.isEmpty
          ? 'Add at least one item before saving.'
          : null;
    });

    final formIsValid = _formKey.currentState?.validate() ?? false;
    if (!formIsValid || _itemControllers.isEmpty) {
      setState(() {
        _selectedStep = _itemControllers.isEmpty
            ? _GroupBillCreateStep.receiptItems
            : _firstGroupBillCreateInvalidStep();
      });
      return;
    }

    if (_shouldValidateExactAmountSplitTotal() &&
        !_decimalAmountTotalsMatch(
          _itemControllers.map((item) => item.amount.text),
          _itemControllers.expand(
            (item) => item.splits.map((split) => split.basisValue.text),
          ),
        )) {
      setState(() {
        _selectedStep = _GroupBillCreateStep.split;
        _splitTotalError =
            'Split amounts must add up to the item total before saving.';
      });
      return;
    }

    if (_payerControllers.isNotEmpty &&
        !_decimalAmountTotalsMatch(
          _itemControllers.map((item) => item.amount.text),
          _payerControllers.map((payer) => payer.amount.text),
        )) {
      setState(() {
        _selectedStep = _GroupBillCreateStep.payers;
        _payerTotalError =
            'Payer amounts must add up to the item total before saving.';
      });
      return;
    }

    setState(() {
      _isSaving = true;
    });

    final draft = SettleoraGroupBillCreateDraft(
      merchantName: _merchantController.text,
      billDate: _billDateController.text,
      currency: _currencyController.text,
      items: _itemControllers
          .map(
            (item) => SettleoraGroupBillCreateItemDraft(
              name: item.name.text,
              note: item.note.text,
              amount: item.amount.text,
              currency: item.currency.text,
              splits: item.splits
                  .map(
                    (split) => SettleoraGroupBillCreateItemSplitDraft(
                      userProfileId: split.userProfileId ?? '',
                      splitMethod: split.splitMethod.text,
                      basisValue: split.basisValue.text,
                      allocationOrder: _parseAllocationOrder(
                        split.allocationOrder.text,
                      ),
                    ),
                  )
                  .toList(growable: false),
            ),
          )
          .toList(growable: false),
      payers: _payerControllers
          .map(
            (payer) => SettleoraGroupBillCreatePayerDraft(
              userProfileId: payer.userProfileId ?? '',
              amount: payer.amount.text,
              currency: payer.currency.text,
              paymentMethodLabelSnapshot: payer.paymentMethodLabel.text,
            ),
          )
          .toList(growable: false),
    );

    try {
      final createdBill = await widget.billRepository.createGroupBill(
        widget.groupId,
        draft,
      );
      if (!mounted) {
        return;
      }

      setState(() {
        _createdBillAwaitingCompletion = createdBill;
      });

      if (_draftAttachments.isEmpty) {
        await _submitCreatedGroupBill(createdBill);
        return;
      }

      await _finishAttachmentUploads(createdBill);
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _failure = SettleoraBillFailure.from(error);
        _isSaving = false;
      });
    }
  }

  Future<void> _finishAttachmentUploads(SettleoraBillDetail createdBill) async {
    final attachmentRepository = widget.attachmentRepository;
    if (attachmentRepository == null) {
      if (!mounted) {
        return;
      }

      setState(() {
        _selectedStep = _GroupBillCreateStep.receiptItems;
        _attachmentUploadFailure = const SettleoraBillAttachmentFailure(
          kind: SettleoraBillAttachmentFailureKind.unavailable,
          message:
              'The bill was created, but attachments cannot be uploaded right now.',
        );
        _createdBillAwaitingCompletion = createdBill;
        _isSaving = false;
      });
      return;
    }

    setState(() {
      _isSaving = true;
      _failure = null;
      _attachmentUploadFailure = null;
      _attachmentDraftError = null;
    });

    final route = SettleoraBillAttachmentRoute.group(
      groupId: widget.groupId,
      billId: createdBill.id,
    );
    final pendingUploads = List<_BillCreateDraftAttachment>.of(
      _draftAttachments,
    );
    final uploadedDraftIds = <int>{};

    try {
      for (final attachment in pendingUploads) {
        await attachmentRepository.attachAttachment(
          route,
          SettleoraBillAttachmentUpload(
            bytes: attachment.file.bytes,
            filename: attachment.file.filename,
            contentType: attachment.file.contentType,
            purpose: attachment.purpose,
          ),
        );
        uploadedDraftIds.add(attachment.id);
      }
      if (!mounted) {
        return;
      }

      setState(() {
        _draftAttachments.clear();
      });
      await _submitCreatedGroupBill(createdBill);
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _selectedStep = _GroupBillCreateStep.receiptItems;
        _draftAttachments.removeWhere(
          (attachment) => uploadedDraftIds.contains(attachment.id),
        );
        _attachmentUploadFailure = SettleoraBillAttachmentFailure.from(error);
        _createdBillAwaitingCompletion = createdBill;
        _isSaving = false;
      });
    }
  }

  Future<void> _submitCreatedGroupBill(SettleoraBillDetail createdBill) async {
    setState(() {
      _isSaving = true;
      _failure = null;
      _attachmentUploadFailure = null;
      _attachmentDraftError = null;
    });

    try {
      await widget.billRepository.submitGroupBill(
        widget.groupId,
        createdBill.id,
      );
      final submittedBill = await widget.billRepository.getGroupBill(
        widget.groupId,
        createdBill.id,
      );
      if (!mounted) {
        return;
      }

      setState(() {
        _createdBillAwaitingCompletion = null;
        _isSaving = false;
      });
      await _leaveRoute(submittedBill);
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _failure = SettleoraBillFailure.from(error);
        _createdBillAwaitingCompletion = createdBill;
        _isSaving = false;
      });
    }
  }

  bool _shouldValidateExactAmountSplitTotal() {
    if (_itemControllers.isEmpty) {
      return false;
    }

    for (final item in _itemControllers) {
      if (item.splits.isEmpty) {
        return false;
      }

      for (final split in item.splits) {
        if (!_isExactAmountSplitMethod(split.splitMethod.text)) {
          return false;
        }
      }
    }

    return true;
  }

  _GroupBillCreateStep _firstGroupBillCreateInvalidStep() {
    if (_billDateController.text.trim().isEmpty ||
        _currencyCodeField(
              _currencyController.text,
              requiredMessage: 'Enter a currency.',
            ) !=
            null) {
      return _GroupBillCreateStep.basics;
    }

    if (_itemControllers.isEmpty ||
        _itemControllers.any(
          (item) =>
              item.name.text.trim().isEmpty ||
              _positiveMoneyAmountField(
                    item.amount.text,
                    requiredMessage: 'Enter an item amount.',
                  ) !=
                  null ||
              _currencyCodeField(
                    item.currency.text,
                    requiredMessage: 'Enter an item currency.',
                  ) !=
                  null,
        )) {
      return _GroupBillCreateStep.receiptItems;
    }

    if (_groupBillCreateMissingSplitMembers(_itemControllers) > 0 ||
        _itemControllers
            .expand((item) => item.splits)
            .any(
              (split) =>
                  split.splitMethod.text.trim().isEmpty ||
                  _allocationOrderError(split.allocationOrder.text) != null,
            )) {
      return _GroupBillCreateStep.receiptItems;
    }

    if (_payerControllers.any(
      (payer) =>
          (payer.userProfileId ?? '').trim().isEmpty ||
          _positiveMoneyAmountField(
                payer.amount.text,
                requiredMessage: 'Enter a payer amount.',
              ) !=
              null ||
          _currencyCodeField(
                payer.currency.text,
                requiredMessage: 'Enter a payer currency.',
              ) !=
              null,
    )) {
      return _GroupBillCreateStep.payers;
    }

    return _GroupBillCreateStep.review;
  }

  void _selectStep(_GroupBillCreateStep step) {
    setState(() {
      _selectedStep = step;
    });
  }

  void _goToNextStep() {
    if (_selectedStep == _GroupBillCreateStep.start &&
        _entryMode == _GroupBillCreateEntryMode.receipt) {
      _selectStep(_GroupBillCreateStep.receiptItems);
      return;
    }

    final steps = _GroupBillCreateStep.values;
    final index = steps.indexOf(_selectedStep);
    if (index < steps.length - 1) {
      _selectStep(steps[index + 1]);
    }
  }

  void _goToPreviousStep() {
    final steps = _GroupBillCreateStep.values;
    final index = steps.indexOf(_selectedStep);
    if (index > 0) {
      _selectStep(steps[index - 1]);
    }
  }

  String get _nextStepLabel {
    return switch (_selectedStep) {
      _GroupBillCreateStep.start =>
        _entryMode == _GroupBillCreateEntryMode.receipt
            ? 'Continue to receipt'
            : 'Continue to basics',
      _GroupBillCreateStep.basics => 'Continue to items',
      _GroupBillCreateStep.receiptItems => 'Continue to split',
      _GroupBillCreateStep.split => 'Continue to payers',
      _GroupBillCreateStep.payers => 'Continue to review',
      _GroupBillCreateStep.review => '',
    };
  }

  @override
  Widget build(BuildContext context) {
    final failure = _failure;
    final memberFailure = _memberFailure;
    final attachmentUploadFailure = _attachmentUploadFailure;
    final itemListError = _itemListError;
    final splitTotalError = _splitTotalError;
    final payerTotalError = _payerTotalError;
    final saveLabel = _createdBillAwaitingCompletion == null
        ? 'Submit group bill'
        : _draftAttachments.isEmpty
        ? 'Retry group bill submit'
        : 'Retry remaining attachment uploads';
    final shouldShowSaveAction =
        _selectedStep == _GroupBillCreateStep.review ||
        _createdBillAwaitingCompletion != null;

    return PopScope<SettleoraBillDetail>(
      canPop: _exitGuardBypassed || !_hasMeaningfulUnsavedDraft,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) {
          Future<void>.microtask(_requestExit);
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Create group bill'),
          leading: BackButton(onPressed: _requestExit),
        ),
        body: SafeArea(
          child: Builder(
            builder: (context) {
              if (_isLoadingMembers) {
                return const _LoadingPanel(label: 'Loading group members');
              }

              if (memberFailure != null) {
                return _GroupMemberFailurePanel(
                  failure: memberFailure,
                  onRetry: _loadMembers,
                );
              }

              return Form(
                key: _formKey,
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 152),
                  child: Align(
                    alignment: Alignment.topCenter,
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 640),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          _GroupBillContext(groupName: widget.groupName),
                          const SizedBox(height: 14),
                          _GroupBillCreateStepSelector(
                            selectedStep: _selectedStep,
                            onSelected: (step) {
                              _selectStep(step);
                            },
                          ),
                          if (failure != null) ...[
                            const SizedBox(height: 16),
                            _CreateBillFailureBanner(
                              failure: failure,
                              bannerKey: const Key('group-bill-create-failure'),
                            ),
                          ],
                          if (attachmentUploadFailure != null) ...[
                            const SizedBox(height: 16),
                            _CreateBillAttachmentUploadFailureBanner(
                              failure: attachmentUploadFailure,
                              bannerKey: const Key(
                                'group-bill-create-attachment-upload-failure',
                              ),
                            ),
                          ],
                          const SizedBox(height: 14),
                          _GroupBillCreateStepVisibility(
                            step: _GroupBillCreateStep.start,
                            selectedStep: _selectedStep,
                            child: _GroupBillCreateStartPanel(
                              entryMode: _entryMode,
                              onEntryModeChanged: (mode) {
                                setState(() {
                                  _entryMode = mode;
                                  _selectedStep =
                                      mode == _GroupBillCreateEntryMode.receipt
                                      ? _GroupBillCreateStep.receiptItems
                                      : _GroupBillCreateStep.basics;
                                });
                              },
                            ),
                          ),
                          const SizedBox(height: 14),
                          _GroupBillCreateStepVisibility(
                            step: _GroupBillCreateStep.basics,
                            selectedStep: _selectedStep,
                            child: _GroupBillCreateSection(
                              step: _GroupBillCreateStep.basics,
                              selectedStep: _selectedStep,
                              onSelected: () =>
                                  _selectStep(_GroupBillCreateStep.basics),
                              trailing: StatusChip(
                                label: _currencyController.text.trim().isEmpty
                                    ? 'Currency needed'
                                    : _currencyController.text
                                          .trim()
                                          .toUpperCase(),
                                variant: StatusChipVariant.info,
                                size: StatusChipSize.small,
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  _GroupSelectorPreview(
                                    groupName: widget.groupName,
                                  ),
                                  const SizedBox(height: 12),
                                  TextFormField(
                                    key: const Key('group-bill-merchant-name'),
                                    controller: _merchantController,
                                    enabled: !_isSaving,
                                    onChanged: (_) => _notifyDraftChanged(),
                                    textInputAction: TextInputAction.next,
                                    decoration: const InputDecoration(
                                      labelText: 'Merchant or payee',
                                      hintText:
                                          'Restaurant, store, or bill title',
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                  TextFormField(
                                    key: const Key('group-bill-date'),
                                    controller: _billDateController,
                                    enabled: !_isSaving,
                                    onChanged: (_) => _notifyDraftChanged(),
                                    textInputAction: TextInputAction.next,
                                    decoration: const InputDecoration(
                                      labelText: 'Bill date',
                                      hintText: 'YYYY-MM-DD',
                                    ),
                                    validator: (value) => _requiredField(
                                      value,
                                      'Enter a bill date.',
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                  TextFormField(
                                    key: const Key('group-bill-currency'),
                                    controller: _currencyController,
                                    enabled: !_isSaving,
                                    onChanged: (_) => _notifyDraftChanged(),
                                    textCapitalization:
                                        TextCapitalization.characters,
                                    textInputAction: TextInputAction.next,
                                    decoration: const InputDecoration(
                                      labelText: 'Currency',
                                      hintText: 'USD',
                                    ),
                                    validator: (value) => _currencyCodeField(
                                      value,
                                      requiredMessage: 'Enter a currency.',
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                  _GroupBillCreateAmountPreview(
                                    itemControllers: _itemControllers,
                                    currency: _currencyController.text,
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 14),
                          _GroupBillCreateStepVisibility(
                            step: _GroupBillCreateStep.receiptItems,
                            selectedStep: _selectedStep,
                            child: _GroupBillCreateSection(
                              step: _GroupBillCreateStep.receiptItems,
                              selectedStep: _selectedStep,
                              onSelected: () => _selectStep(
                                _GroupBillCreateStep.receiptItems,
                              ),
                              trailing: StatusChip(
                                label: _draftAttachments.isEmpty
                                    ? 'No receipt'
                                    : 'Receipt attached',
                                variant: _draftAttachments.isEmpty
                                    ? StatusChipVariant.neutral
                                    : StatusChipVariant.success,
                                size: StatusChipSize.small,
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  _ReceiptOcrGuidanceCard(
                                    hasAttachment: _draftAttachments.isNotEmpty,
                                    isReceiptMode:
                                        _entryMode ==
                                        _GroupBillCreateEntryMode.receipt,
                                  ),
                                  const SizedBox(height: 14),
                                  _BillCreateDraftAttachmentSection(
                                    keyPrefix: 'group-bill',
                                    attachments: _draftAttachments,
                                    errorText: _attachmentDraftError,
                                    canAdd:
                                        widget.attachmentFileInput != null &&
                                        widget.attachmentRepository != null,
                                    isBusy: _isSaving || _isPickingAttachment,
                                    onAdd: _addDraftAttachment,
                                    onRemove: _removeDraftAttachment,
                                    onPurposeChanged:
                                        _changeDraftAttachmentPurpose,
                                  ),
                                  const SizedBox(height: 16),
                                  Row(
                                    children: [
                                      Expanded(
                                        child: Text(
                                          'Editable items',
                                          style: Theme.of(
                                            context,
                                          ).textTheme.titleMedium,
                                        ),
                                      ),
                                      TextButton.icon(
                                        key: const Key('group-bill-add-item'),
                                        onPressed: _isSaving ? null : _addItem,
                                        icon: const Icon(Icons.add),
                                        label: const Text('Add item'),
                                      ),
                                    ],
                                  ),
                                  if (itemListError != null) ...[
                                    const SizedBox(height: 6),
                                    _CreateBillValidationMessage(
                                      message: itemListError,
                                      messageKey: const Key(
                                        'group-bill-item-list-error',
                                      ),
                                    ),
                                  ],
                                  const SizedBox(height: 10),
                                  for (
                                    var index = 0;
                                    index < _itemControllers.length;
                                    index += 1
                                  )
                                    Padding(
                                      padding: const EdgeInsets.only(
                                        bottom: 12,
                                      ),
                                      child: _GroupBillCreateItemCard(
                                        index: index,
                                        controllers: _itemControllers[index],
                                        members: _members,
                                        isSaving: _isSaving,
                                        onRemove: () => _removeItem(index),
                                        onDraftChanged: _notifyDraftChanged,
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 14),
                          _GroupBillCreateStepVisibility(
                            step: _GroupBillCreateStep.split,
                            selectedStep: _selectedStep,
                            child: _GroupBillCreateSection(
                              step: _GroupBillCreateStep.split,
                              selectedStep: _selectedStep,
                              onSelected: () =>
                                  _selectStep(_GroupBillCreateStep.split),
                              trailing: StatusChip(
                                label:
                                    '${_groupBillCreateSplitCount(_itemControllers)} splits',
                                variant:
                                    _groupBillCreateMissingSplitMembers(
                                          _itemControllers,
                                        ) ==
                                        0
                                    ? StatusChipVariant.success
                                    : StatusChipVariant.warning,
                                size: StatusChipSize.small,
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  _GroupBillSplitAssignmentWorkspace(
                                    members: _members,
                                    itemControllers: _itemControllers,
                                    currency: _currencyController.text,
                                    selectedMode: _selectedSplitMode,
                                    selectedFilter: _splitAssignmentFilter,
                                    isSaving: _isSaving,
                                    onModeSelected: _selectSplitMode,
                                    onFilterSelected:
                                        _selectSplitAssignmentFilter,
                                    onAssignAllUnassignedEqually:
                                        _assignAllUnassignedEqually,
                                    onClearAssignments: _clearSplitAssignments,
                                    onAssignItem: _openAssignItemSheet,
                                  ),
                                  if (splitTotalError != null) ...[
                                    const SizedBox(height: 12),
                                    _CreateBillValidationMessage(
                                      message: splitTotalError,
                                      messageKey: const Key(
                                        'group-bill-split-total-error',
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 14),
                          _GroupBillCreateStepVisibility(
                            step: _GroupBillCreateStep.payers,
                            selectedStep: _selectedStep,
                            child: _GroupBillCreateSection(
                              step: _GroupBillCreateStep.payers,
                              selectedStep: _selectedStep,
                              onSelected: () =>
                                  _selectStep(_GroupBillCreateStep.payers),
                              trailing: StatusChip(
                                label: '${_payerControllers.length} payers',
                                variant: _payerControllers.isEmpty
                                    ? StatusChipVariant.warning
                                    : StatusChipVariant.info,
                                size: StatusChipSize.small,
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  _GroupBillPayerTotalsPreview(
                                    itemControllers: _itemControllers,
                                    payerControllers: _payerControllers,
                                    currency: _currencyController.text,
                                  ),
                                  const SizedBox(height: 12),
                                  Align(
                                    alignment: Alignment.centerRight,
                                    child: TextButton.icon(
                                      key: const Key('group-bill-add-payer'),
                                      onPressed: _isSaving ? null : _addPayer,
                                      icon: const Icon(Icons.add),
                                      label: const Text('Add payer'),
                                    ),
                                  ),
                                  if (_payerControllers.isEmpty)
                                    Padding(
                                      padding: const EdgeInsets.only(top: 8),
                                      child: Text(
                                        'No payer rows added.',
                                        style: Theme.of(context)
                                            .textTheme
                                            .bodyMedium
                                            ?.copyWith(
                                              color: context
                                                  .settleoraColors
                                                  .textSubtle,
                                            ),
                                      ),
                                    )
                                  else
                                    for (
                                      var index = 0;
                                      index < _payerControllers.length;
                                      index += 1
                                    )
                                      Padding(
                                        padding: const EdgeInsets.only(top: 10),
                                        child: _GroupBillCreatePayerCard(
                                          index: index,
                                          controllers: _payerControllers[index],
                                          members: _members,
                                          isSaving: _isSaving,
                                          onRemove: () => _removePayer(index),
                                          onDraftChanged: _notifyDraftChanged,
                                        ),
                                      ),
                                  if (payerTotalError != null) ...[
                                    const SizedBox(height: 10),
                                    _CreateBillValidationMessage(
                                      message: payerTotalError,
                                      messageKey: const Key(
                                        'group-bill-payer-total-error',
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 14),
                          _GroupBillCreateStepVisibility(
                            step: _GroupBillCreateStep.review,
                            selectedStep: _selectedStep,
                            child: _GroupBillCreateSection(
                              step: _GroupBillCreateStep.review,
                              selectedStep: _selectedStep,
                              onSelected: () =>
                                  _selectStep(_GroupBillCreateStep.review),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  _GroupBillReviewSummary(
                                    merchantName: _merchantController.text,
                                    billDate: _billDateController.text,
                                    currency: _currencyController.text,
                                    itemControllers: _itemControllers,
                                    payerControllers: _payerControllers,
                                    attachmentCount: _draftAttachments.length,
                                  ),
                                  const SizedBox(height: 14),
                                  _GroupBillCreateReviewChecklist(
                                    members: _members,
                                    itemControllers: _itemControllers,
                                    payerControllers: _payerControllers,
                                    attachmentCount: _draftAttachments.length,
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        bottomNavigationBar: memberFailure == null
            ? SafeArea(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Align(
                      alignment: Alignment.center,
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 640),
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                          child: Row(
                            children: [
                              if (_selectedStep !=
                                  _GroupBillCreateStep.start) ...[
                                TextButton.icon(
                                  key: const Key('group-bill-back-step'),
                                  onPressed: _isSaving
                                      ? null
                                      : _goToPreviousStep,
                                  icon: const Icon(Icons.arrow_back),
                                  label: const Text('Back'),
                                ),
                                const SizedBox(width: 10),
                              ],
                              Expanded(
                                child: Tooltip(
                                  message: shouldShowSaveAction
                                      ? saveLabel
                                      : _nextStepLabel,
                                  child: FilledButton.icon(
                                    key: shouldShowSaveAction
                                        ? const Key('group-bill-save')
                                        : const Key('group-bill-next-step'),
                                    onPressed: _isSaving || _isLoadingMembers
                                        ? null
                                        : shouldShowSaveAction
                                        ? _save
                                        : _goToNextStep,
                                    icon: _isSaving
                                        ? const SizedBox.square(
                                            dimension: 18,
                                            child: CircularProgressIndicator(
                                              strokeWidth: 2,
                                            ),
                                          )
                                        : Icon(
                                            shouldShowSaveAction
                                                ? Icons.check
                                                : Icons.arrow_forward,
                                          ),
                                    label: Text(
                                      shouldShowSaveAction
                                          ? saveLabel
                                          : _nextStepLabel,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SettleoraBottomNav(
                      selected: SettleoraNavDestination.groups,
                    ),
                  ],
                ),
              )
            : null,
      ),
    );
  }
}

enum _GroupBillCreateEntryMode { manual, receipt }

enum _GroupBillCreateStep {
  start('Start', Icons.add_circle_outline),
  basics('Basics', Icons.edit_note_outlined),
  receiptItems('Receipt & Items', Icons.receipt_long_outlined),
  split('Split', Icons.call_split_outlined),
  payers('Payers', Icons.payments_outlined),
  review('Review', Icons.fact_check_outlined);

  const _GroupBillCreateStep(this.label, this.icon);

  final String label;
  final IconData icon;
}

class _GroupBillCreateStepSelector extends StatelessWidget {
  const _GroupBillCreateStepSelector({
    required this.selectedStep,
    required this.onSelected,
  });

  final _GroupBillCreateStep selectedStep;
  final ValueChanged<_GroupBillCreateStep> onSelected;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      key: const Key('group-bill-create-stepper'),
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final step in _GroupBillCreateStep.values) ...[
            ChoiceChip(
              key: ValueKey('group-bill-create-step-${step.name}'),
              selected: selectedStep == step,
              avatar: Icon(step.icon, size: 16),
              label: Text(step.label),
              onSelected: (_) => onSelected(step),
            ),
            const SizedBox(width: 8),
          ],
        ],
      ),
    );
  }
}

class _GroupBillCreateStepVisibility extends StatelessWidget {
  const _GroupBillCreateStepVisibility({
    required this.step,
    required this.selectedStep,
    required this.child,
  });

  final _GroupBillCreateStep step;
  final _GroupBillCreateStep selectedStep;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final isSelected = step == selectedStep;
    return Offstage(
      offstage: !isSelected,
      child: TickerMode(enabled: isSelected, child: child),
    );
  }
}

class _GroupBillCreateStartPanel extends StatelessWidget {
  const _GroupBillCreateStartPanel({
    required this.entryMode,
    required this.onEntryModeChanged,
  });

  final _GroupBillCreateEntryMode entryMode;
  final ValueChanged<_GroupBillCreateEntryMode> onEntryModeChanged;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Create group bill start',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              ChoiceChip(
                key: const Key('group-bill-create-mode-manual'),
                selected: entryMode == _GroupBillCreateEntryMode.manual,
                avatar: const Icon(Icons.edit_outlined, size: 16),
                label: const Text('Manual entry'),
                onSelected: (_) =>
                    onEntryModeChanged(_GroupBillCreateEntryMode.manual),
              ),
              ChoiceChip(
                key: const Key('group-bill-create-mode-receipt'),
                selected: entryMode == _GroupBillCreateEntryMode.receipt,
                avatar: const Icon(Icons.document_scanner_outlined, size: 16),
                label: const Text('Scan/import receipt'),
                onSelected: (_) =>
                    onEntryModeChanged(_GroupBillCreateEntryMode.receipt),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            entryMode == _GroupBillCreateEntryMode.receipt
                ? 'Receipt OCR can seed editable item rows when that capture path is available. Review remains required before save.'
                : 'Start from clean fields, then add items, split rows, payers, and optional receipt attachments.',
            style: TextStyle(color: context.settleoraColors.textMuted),
          ),
        ],
      ),
    );
  }
}

class _GroupBillCreateSection extends StatelessWidget {
  const _GroupBillCreateSection({
    required this.step,
    required this.selectedStep,
    required this.onSelected,
    required this.child,
    this.trailing,
  });

  final _GroupBillCreateStep step;
  final _GroupBillCreateStep selectedStep;
  final VoidCallback onSelected;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final isSelected = selectedStep == step;
    final colors = context.settleoraColors;

    return AppCard(
      key: ValueKey('group-bill-create-section-${step.name}'),
      color: isSelected ? colors.primarySoft : colors.surface,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(SettleoraRadius.md),
            onTap: onSelected,
            child: Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                children: [
                  Icon(step.icon, size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      step.label,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  ?trailing,
                ],
              ),
            ),
          ),
          child,
        ],
      ),
    );
  }
}

class _GroupSelectorPreview extends StatelessWidget {
  const _GroupSelectorPreview({required this.groupName});

  final String groupName;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: context.settleoraColors.primarySoft,
        borderRadius: BorderRadius.circular(SettleoraRadius.md),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            const Icon(Icons.groups_outlined, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Group: ${_safeGroupName(groupName)}',
                style: Theme.of(context).textTheme.titleSmall,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _GroupBillCreateAmountPreview extends StatelessWidget {
  const _GroupBillCreateAmountPreview({
    required this.itemControllers,
    required this.currency,
  });

  final List<_GroupBillCreateItemControllers> itemControllers;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final total = _groupBillCreateDecimalTotal(
      itemControllers.map((item) => item.amount.text),
    );
    return _CreatePreviewStrip(
      label: 'Total amount preview',
      value: _decimalPreviewMoney(total, currency),
      icon: Icons.summarize_outlined,
    );
  }
}

class _ReceiptOcrGuidanceCard extends StatelessWidget {
  const _ReceiptOcrGuidanceCard({
    required this.hasAttachment,
    required this.isReceiptMode,
  });

  final bool hasAttachment;
  final bool isReceiptMode;

  @override
  Widget build(BuildContext context) {
    return _CreatePreviewStrip(
      label: hasAttachment
          ? 'Receipt attached state'
          : isReceiptMode
          ? 'Ready for receipt import'
          : 'No receipt attached',
      value: hasAttachment
          ? 'View, rescan, or remove the selected file before save.'
          : 'OCR-derived rows are provisional until user review and server validation.',
      icon: hasAttachment
          ? Icons.attachment_outlined
          : Icons.document_scanner_outlined,
      variant: hasAttachment
          ? StatusChipVariant.success
          : StatusChipVariant.info,
    );
  }
}

const _groupBillAssignmentFilterAll = 'all';
const _groupBillAssignmentFilterUnassigned = 'unassigned';

enum _GroupBillSplitMode {
  equal('Equal', 'equal'),
  byItem('By item', 'equal'),
  exact('Exact amount', 'exact_amount'),
  share('Share', 'share');

  const _GroupBillSplitMode(this.label, this.apiValue);

  final String label;
  final String apiValue;
}

enum _GroupBillAssignmentMethod {
  equal('Equal', 'equal', Icons.splitscreen_outlined),
  quantity('Quantity', 'quantity', Icons.exposure_plus_1_outlined),
  exactAmount('Exact amount', 'exact_amount', Icons.payments_outlined),
  share('Share', 'share', Icons.pie_chart_outline);

  const _GroupBillAssignmentMethod(this.label, this.apiValue, this.icon);

  final String label;
  final String apiValue;
  final IconData icon;
}

class _GroupBillSplitAssignmentWorkspace extends StatelessWidget {
  const _GroupBillSplitAssignmentWorkspace({
    required this.members,
    required this.itemControllers,
    required this.currency,
    required this.selectedMode,
    required this.selectedFilter,
    required this.isSaving,
    required this.onModeSelected,
    required this.onFilterSelected,
    required this.onAssignAllUnassignedEqually,
    required this.onClearAssignments,
    required this.onAssignItem,
  });

  final List<SettleoraGroupMember> members;
  final List<_GroupBillCreateItemControllers> itemControllers;
  final String currency;
  final _GroupBillSplitMode selectedMode;
  final String selectedFilter;
  final bool isSaving;
  final ValueChanged<_GroupBillSplitMode> onModeSelected;
  final ValueChanged<String> onFilterSelected;
  final VoidCallback onAssignAllUnassignedEqually;
  final VoidCallback onClearAssignments;
  final ValueChanged<int> onAssignItem;

  @override
  Widget build(BuildContext context) {
    final missing = _groupBillCreateMissingSplitMembers(itemControllers);
    final unassignedItems = itemControllers
        .where(_groupBillCreateItemIsUnassigned)
        .length;
    final visibleItems = _filteredGroupBillAssignmentItems(
      itemControllers: itemControllers,
      selectedFilter: selectedFilter,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          key: const Key('group-bill-split-mode-selector'),
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final mode in _GroupBillSplitMode.values)
              ChoiceChip(
                key: ValueKey('group-bill-split-mode-${mode.name}'),
                selected: selectedMode == mode,
                label: Text(mode.label),
                onSelected: isSaving ? null : (_) => onModeSelected(mode),
              ),
          ],
        ),
        const SizedBox(height: 12),
        _CreatePreviewStrip(
          label: selectedMode == _GroupBillSplitMode.byItem
              ? 'By item assignment workspace'
              : '${selectedMode.label} split preview',
          value: missing == 0
              ? 'All item split rows have a selected member.'
              : '${_pluralCount(missing, 'split row')} still needs a member.',
          icon: missing == 0
              ? Icons.check_circle_outline
              : Icons.report_problem_outlined,
          variant: missing == 0
              ? StatusChipVariant.success
              : StatusChipVariant.warning,
        ),
        if (selectedMode != _GroupBillSplitMode.byItem) ...[
          const SizedBox(height: 10),
          Text(
            'This is a local split preview. The API remains authoritative for final participant shares.',
            style: TextStyle(color: context.settleoraColors.textMuted),
          ),
        ],
        const SizedBox(height: 12),
        _GroupBillAssignmentFilters(
          members: members,
          selectedFilter: selectedFilter,
          itemControllers: itemControllers,
          onSelected: isSaving ? null : onFilterSelected,
        ),
        const SizedBox(height: 12),
        _GroupBillAssignmentActionsMenu(
          canAssignAll: !isSaving && members.isNotEmpty && unassignedItems > 0,
          canClear:
              !isSaving &&
              _groupBillCreateAssignedItemCount(itemControllers) > 0,
          onAssignAllUnassignedEqually: onAssignAllUnassignedEqually,
          onClearAssignments: onClearAssignments,
        ),
        if (unassignedItems > 0) ...[
          const SizedBox(height: 12),
          _GroupBillUnassignedWarning(
            unassignedItems: unassignedItems,
            onReviewItems: () =>
                onFilterSelected(_groupBillAssignmentFilterUnassigned),
            onAssignAllUnassignedEqually: onAssignAllUnassignedEqually,
            canAssignAll: !isSaving && members.isNotEmpty,
          ),
        ],
        const SizedBox(height: 12),
        for (final itemIndex in visibleItems) ...[
          _GroupBillAssignableItemRow(
            key: ValueKey('group-bill-assignable-item-$itemIndex'),
            itemIndex: itemIndex,
            item: itemControllers[itemIndex],
            members: members,
            currency: currency,
            onTap: isSaving ? null : () => onAssignItem(itemIndex),
          ),
          const SizedBox(height: 10),
        ],
        if (visibleItems.isEmpty)
          const _MemberPickerEmptyState(
            title: 'No matching items',
            body: 'No item rows match this assignment filter.',
          ),
        const SizedBox(height: 4),
        _GroupBillTaxServiceAllocationControls(currency: currency),
      ],
    );
  }
}

class _GroupBillAssignmentFilters extends StatelessWidget {
  const _GroupBillAssignmentFilters({
    required this.members,
    required this.selectedFilter,
    required this.itemControllers,
    required this.onSelected,
  });

  final List<SettleoraGroupMember> members;
  final String selectedFilter;
  final List<_GroupBillCreateItemControllers> itemControllers;
  final ValueChanged<String>? onSelected;

  @override
  Widget build(BuildContext context) {
    final filters = <(String, String)>[
      (_groupBillAssignmentFilterAll, 'All'),
      for (final member in members)
        (member.userProfileId, member.safeDisplayName),
      (_groupBillAssignmentFilterUnassigned, 'Unassigned'),
    ];

    return SingleChildScrollView(
      key: const Key('group-bill-assignment-filters'),
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final filter in filters) ...[
            ChoiceChip(
              key: ValueKey('group-bill-assignment-filter-${filter.$1}'),
              selected: selectedFilter == filter.$1,
              label: Text(
                '${filter.$2} (${_groupBillAssignmentFilterCount(itemControllers, filter.$1)})',
              ),
              onSelected: onSelected == null
                  ? null
                  : (_) => onSelected!(filter.$1),
            ),
            const SizedBox(width: 8),
          ],
        ],
      ),
    );
  }
}

class _GroupBillAssignmentActionsMenu extends StatelessWidget {
  const _GroupBillAssignmentActionsMenu({
    required this.canAssignAll,
    required this.canClear,
    required this.onAssignAllUnassignedEqually,
    required this.onClearAssignments,
  });

  final bool canAssignAll;
  final bool canClear;
  final VoidCallback onAssignAllUnassignedEqually;
  final VoidCallback onClearAssignments;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerRight,
      child: PopupMenuButton<_GroupBillAssignmentMenuAction>(
        key: const Key('group-bill-split-actions-menu'),
        tooltip: 'Split actions',
        icon: const Icon(Icons.more_horiz),
        onSelected: (action) {
          switch (action) {
            case _GroupBillAssignmentMenuAction.assignAllUnassigned:
              onAssignAllUnassignedEqually();
              return;
            case _GroupBillAssignmentMenuAction.clearAssignments:
              onClearAssignments();
              return;
          }
        },
        itemBuilder: (context) => [
          PopupMenuItem(
            key: const Key('group-bill-assign-all-unassigned'),
            value: _GroupBillAssignmentMenuAction.assignAllUnassigned,
            enabled: canAssignAll,
            child: const ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              leading: Icon(Icons.group_add_outlined),
              title: Text('Assign unassigned equally'),
            ),
          ),
          PopupMenuItem(
            key: const Key('group-bill-clear-assignments'),
            value: _GroupBillAssignmentMenuAction.clearAssignments,
            enabled: canClear,
            child: const ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              leading: Icon(Icons.backspace_outlined),
              title: Text('Clear assignments'),
            ),
          ),
        ],
      ),
    );
  }
}

enum _GroupBillAssignmentMenuAction { assignAllUnassigned, clearAssignments }

class _GroupBillUnassignedWarning extends StatelessWidget {
  const _GroupBillUnassignedWarning({
    required this.unassignedItems,
    required this.onReviewItems,
    required this.onAssignAllUnassignedEqually,
    required this.canAssignAll,
  });

  final int unassignedItems;
  final VoidCallback onReviewItems;
  final VoidCallback onAssignAllUnassignedEqually;
  final bool canAssignAll;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      key: const Key('group-bill-unassigned-warning'),
      container: true,
      liveRegion: true,
      label: '${_pluralCount(unassignedItems, 'item')} unassigned.',
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: context.settleoraColors.warningSoft,
          borderRadius: BorderRadius.circular(SettleoraRadius.md),
          border: Border.all(color: context.settleoraColors.borderStrong),
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const Icon(Icons.report_problem_outlined, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '${_pluralCount(unassignedItems, 'item')} unassigned',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              const Text(
                'Review these rows before moving to payers or review. Continuing with unresolved assignments should be intentional.',
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  AppButton(
                    key: const Key('group-bill-review-unassigned-items'),
                    label: 'Review items',
                    icon: Icons.visibility_outlined,
                    variant: AppButtonVariant.secondary,
                    onPressed: onReviewItems,
                  ),
                  AppButton(
                    key: const Key('group-bill-warning-assign-equally'),
                    label: 'Split equally',
                    icon: Icons.group_add_outlined,
                    variant: AppButtonVariant.soft,
                    onPressed: canAssignAll
                        ? onAssignAllUnassignedEqually
                        : null,
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

class _GroupBillAssignableItemRow extends StatelessWidget {
  const _GroupBillAssignableItemRow({
    super.key,
    required this.itemIndex,
    required this.item,
    required this.members,
    required this.currency,
    required this.onTap,
  });

  final int itemIndex;
  final _GroupBillCreateItemControllers item;
  final List<SettleoraGroupMember> members;
  final String currency;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;
    final assignedMembers = _groupBillAssignedMembers(item, members);
    final isUnassigned = assignedMembers.isEmpty;
    final title = item.name.text.trim().isEmpty
        ? 'Item ${itemIndex + 1}'
        : item.name.text.trim();
    final quantityLabel = _groupBillQuantityLabel(item);
    final markers = _groupBillItemMarkers(item);

    return Material(
      color: isUnassigned ? colors.warningSoft : colors.surface,
      borderRadius: BorderRadius.circular(SettleoraRadius.md),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(SettleoraRadius.md),
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(SettleoraRadius.md),
            border: Border.all(
              color: isUnassigned ? colors.borderStrong : colors.border,
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.titleSmall,
                          ),
                          const SizedBox(height: 4),
                          Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: [
                              StatusChip(
                                label: quantityLabel,
                                icon: Icons.format_list_numbered_outlined,
                                size: StatusChipSize.small,
                              ),
                              for (final marker in markers)
                                StatusChip(
                                  label: marker,
                                  icon: Icons.percent_outlined,
                                  variant: StatusChipVariant.info,
                                  size: StatusChipSize.small,
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          _decimalPreviewMoney(
                            double.tryParse(item.amount.text.trim()) ?? 0,
                            item.currency.text.trim().isEmpty
                                ? currency
                                : item.currency.text,
                          ),
                          style: Theme.of(context).textTheme.titleSmall,
                        ),
                        const SizedBox(height: 5),
                        StatusChip(
                          label: isUnassigned ? 'Unassigned' : 'Assigned',
                          variant: isUnassigned
                              ? StatusChipVariant.warning
                              : StatusChipVariant.success,
                          size: StatusChipSize.small,
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                assignedMembers.isEmpty
                    ? Text(
                        'Tap to assign this item.',
                        style: TextStyle(color: colors.textMuted),
                      )
                    : Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (final member in assignedMembers)
                            _AssignedMemberChip(member: member),
                        ],
                      ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AssignedMemberChip extends StatelessWidget {
  const _AssignedMemberChip({required this.member});

  final SettleoraGroupMember member;

  @override
  Widget build(BuildContext context) {
    final label = member.safeDisplayName;
    return Chip(
      visualDensity: VisualDensity.compact,
      avatar: CircleAvatar(
        backgroundColor: context.settleoraColors.primary,
        foregroundColor: context.settleoraColors.onPrimary,
        child: Text(_memberInitial(label)),
      ),
      label: Text(label, overflow: TextOverflow.ellipsis),
    );
  }
}

class _GroupBillTaxServiceAllocationControls extends StatelessWidget {
  const _GroupBillTaxServiceAllocationControls({required this.currency});

  final String currency;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      key: const Key('group-bill-tax-service-allocation'),
      decoration: BoxDecoration(
        color: context.settleoraColors.infoSoft,
        borderRadius: BorderRadius.circular(SettleoraRadius.md),
      ),
      child: Material(
        type: MaterialType.transparency,
        child: ExpansionTile(
          tilePadding: const EdgeInsets.symmetric(horizontal: 12),
          childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
          leading: const Icon(Icons.receipt_long_outlined),
          title: Text(
            'Tax & fees',
            style: Theme.of(context).textTheme.titleSmall,
          ),
          subtitle: const Text('Compact local preview only'),
          children: [
            Text(
              'Final tax, service, and fee allocation is validated by the server.',
              style: TextStyle(color: context.settleoraColors.textMuted),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: const [
                StatusChip(
                  label: 'Proportional by assigned item total',
                  icon: Icons.call_split_outlined,
                  variant: StatusChipVariant.info,
                ),
                StatusChip(
                  label: 'Equal across participants',
                  icon: Icons.groups_outlined,
                  variant: StatusChipVariant.neutral,
                ),
                StatusChip(
                  label: 'Manual',
                  icon: Icons.tune_outlined,
                  variant: StatusChipVariant.neutral,
                ),
              ],
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _InlineMetric(
                  label: 'Tax preview',
                  value: _decimalPreviewMoney(0, currency),
                ),
                _InlineMetric(
                  label: 'Service preview',
                  value: _decimalPreviewMoney(0, currency),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _GroupBillAssignItemSheet extends StatefulWidget {
  const _GroupBillAssignItemSheet({
    required this.itemIndex,
    required this.item,
    required this.members,
    required this.currency,
  });

  final int itemIndex;
  final _GroupBillCreateItemControllers item;
  final List<SettleoraGroupMember> members;
  final String currency;

  @override
  State<_GroupBillAssignItemSheet> createState() =>
      _GroupBillAssignItemSheetState();
}

class _GroupBillAssignItemSheetState extends State<_GroupBillAssignItemSheet> {
  late final Set<String> _selectedMemberIds = {
    for (final split in widget.item.splits)
      if ((split.userProfileId ?? '').trim().isNotEmpty)
        split.userProfileId!.trim(),
  };
  late _GroupBillAssignmentMethod _method = _initialMethod();
  late final Map<String, int> _quantities = {
    for (final member in widget.members)
      member.userProfileId: _selectedMemberIds.contains(member.userProfileId)
          ? 1
          : 0,
  };

  _GroupBillAssignmentMethod _initialMethod() {
    final method = widget.item.splits.isEmpty
        ? null
        : widget.item.splits.first.splitMethod.text.trim().toLowerCase();
    return switch (method) {
      'quantity' => _GroupBillAssignmentMethod.quantity,
      'exact_amount' => _GroupBillAssignmentMethod.exactAmount,
      'share' => _GroupBillAssignmentMethod.share,
      _ => _GroupBillAssignmentMethod.equal,
    };
  }

  void _toggleMember(String memberId, bool selected) {
    setState(() {
      if (selected) {
        _selectedMemberIds.add(memberId);
        _quantities[memberId] = _quantities[memberId] == 0
            ? 1
            : _quantities[memberId] ?? 1;
      } else {
        _selectedMemberIds.remove(memberId);
        _quantities[memberId] = 0;
      }
    });
  }

  void _changeQuantity(String memberId, int delta) {
    setState(() {
      final current = _quantities[memberId] ?? 0;
      final next = (current + delta).clamp(0, _quantitySplitTotal);
      final otherTotal = _quantities.entries
          .where((entry) => entry.key != memberId)
          .fold<int>(0, (total, entry) => total + entry.value);
      _quantities[memberId] = next > _quantitySplitTotal - otherTotal
          ? _quantitySplitTotal - otherTotal
          : next;
      if ((_quantities[memberId] ?? 0) > 0) {
        _selectedMemberIds.add(memberId);
      } else {
        _selectedMemberIds.remove(memberId);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final amount = double.tryParse(widget.item.amount.text.trim()) ?? 0;
    final itemName = widget.item.name.text.trim().isEmpty
        ? 'Item ${widget.itemIndex + 1}'
        : widget.item.name.text.trim();
    final selectedMembers = [
      for (final member in widget.members)
        if (_selectedMemberIds.contains(member.userProfileId)) member,
    ];
    final selectedCount = selectedMembers.length;
    final quantityTotal = _quantities.values.fold<int>(
      0,
      (total, value) => total + value,
    );
    final remainingQuantity = _quantitySplitTotal - quantityTotal;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          16,
          12,
          16,
          16 + MediaQuery.of(context).viewInsets.bottom,
        ),
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.86,
          ),
          child: Column(
            key: const Key('group-bill-assign-item-sheet'),
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Assign item',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  IconButton(
                    tooltip: 'Close',
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              Text(
                itemName,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleSmall,
              ),
              const SizedBox(height: 4),
              Text(
                _decimalPreviewMoney(amount, widget.currency),
                style: TextStyle(color: context.settleoraColors.textMuted),
              ),
              const SizedBox(height: 12),
              Wrap(
                key: const Key('group-bill-assignment-method-selector'),
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final method in _GroupBillAssignmentMethod.values)
                    ChoiceChip(
                      key: ValueKey(
                        'group-bill-assignment-method-${method.name}',
                      ),
                      selected: _method == method,
                      avatar: Icon(method.icon, size: 16),
                      label: Text(method.label),
                      onSelected: (_) {
                        setState(() {
                          _method = method;
                        });
                      },
                    ),
                ],
              ),
              const SizedBox(height: 12),
              if (_method == _GroupBillAssignmentMethod.quantity) ...[
                Text(
                  'Remaining: $remainingQuantity',
                  key: const Key('group-bill-quantity-remaining'),
                  style: Theme.of(context).textTheme.labelLarge,
                ),
                const SizedBox(height: 8),
              ],
              Flexible(
                child: ListView(
                  shrinkWrap: true,
                  children: [
                    for (final member in widget.members)
                      CheckboxListTile(
                        key: ValueKey(
                          'group-bill-assign-item-member-${member.userProfileId}',
                        ),
                        value: _selectedMemberIds.contains(
                          member.userProfileId,
                        ),
                        title: Text(member.safeDisplayName),
                        subtitle: Text(
                          _method == _GroupBillAssignmentMethod.quantity
                              ? 'Quantity ${_quantities[member.userProfileId] ?? 0}'
                              : selectedCount == 0
                              ? 'Not included'
                              : _decimalPreviewMoney(
                                  amount / selectedCount,
                                  widget.currency,
                                ),
                        ),
                        onChanged: (value) =>
                            _toggleMember(member.userProfileId, value ?? false),
                      ),
                    if (_method == _GroupBillAssignmentMethod.quantity) ...[
                      const Divider(height: 20),
                      Text(
                        'Quantity split',
                        key: const Key('group-bill-quantity-split-title'),
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                      const SizedBox(height: 8),
                      for (final member in widget.members)
                        _QuantitySplitControl(
                          key: ValueKey(
                            'group-bill-quantity-split-${member.userProfileId}',
                          ),
                          name: member.safeDisplayName,
                          quantity: _quantities[member.userProfileId] ?? 0,
                          previewAmount: _decimalPreviewMoney(
                            amount *
                                ((_quantities[member.userProfileId] ?? 0) /
                                    _quantitySplitTotal),
                            widget.currency,
                          ),
                          onDecrease: () =>
                              _changeQuantity(member.userProfileId, -1),
                          onIncrease: () =>
                              _changeQuantity(member.userProfileId, 1),
                        ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: AppButton(
                      key: const Key('group-bill-assign-item-cancel'),
                      label: 'Cancel',
                      variant: AppButtonVariant.secondary,
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: AppButton(
                      key: const Key('group-bill-assign-item-apply'),
                      label: 'Apply assignment',
                      icon: Icons.check,
                      onPressed:
                          _selectedMemberIds.isEmpty ||
                              (_method == _GroupBillAssignmentMethod.quantity &&
                                  remainingQuantity != 0)
                          ? null
                          : () => Navigator.of(context).pop(
                              _GroupBillItemAssignment(
                                memberIds: [
                                  for (final member in widget.members)
                                    if (_selectedMemberIds.contains(
                                      member.userProfileId,
                                    ))
                                      member.userProfileId,
                                ],
                                method: _method,
                                quantities: Map<String, int>.of(_quantities),
                              ),
                            ),
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

class _QuantitySplitControl extends StatelessWidget {
  const _QuantitySplitControl({
    super.key,
    required this.name,
    required this.quantity,
    required this.previewAmount,
    required this.onDecrease,
    required this.onIncrease,
  });

  final String name;
  final int quantity;
  final String previewAmount;
  final VoidCallback onDecrease;
  final VoidCallback onIncrease;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              '$name: $quantity',
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ),
          Text(previewAmount),
          IconButton(
            tooltip: 'Decrease quantity for $name',
            onPressed: quantity == 0 ? null : onDecrease,
            icon: const Icon(Icons.remove_circle_outline),
          ),
          IconButton(
            tooltip: 'Increase quantity for $name',
            onPressed: onIncrease,
            icon: const Icon(Icons.add_circle_outline),
          ),
        ],
      ),
    );
  }
}

class _GroupBillItemAssignment {
  const _GroupBillItemAssignment({
    required this.memberIds,
    required this.method,
    required this.quantities,
  });

  final List<String> memberIds;
  final _GroupBillAssignmentMethod method;
  final Map<String, int> quantities;

  String basisValueFor(String memberId) {
    return switch (method) {
      _GroupBillAssignmentMethod.quantity =>
        (quantities[memberId] ?? 0).toString(),
      _GroupBillAssignmentMethod.exactAmount => '',
      _GroupBillAssignmentMethod.share => '1',
      _GroupBillAssignmentMethod.equal => '',
    };
  }

  String allocationOrderFor(String memberId) {
    final index = memberIds.indexOf(memberId);
    return index < 0 ? '' : index.toString();
  }
}

const _quantitySplitTotal = 3;

class _GroupBillPayerTotalsPreview extends StatelessWidget {
  const _GroupBillPayerTotalsPreview({
    required this.itemControllers,
    required this.payerControllers,
    required this.currency,
  });

  final List<_GroupBillCreateItemControllers> itemControllers;
  final List<_GroupBillCreatePayerControllers> payerControllers;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final billTotal = _groupBillCreateDecimalTotal(
      itemControllers.map((item) => item.amount.text),
    );
    final paidTotal = _groupBillCreateDecimalTotal(
      payerControllers.map((payer) => payer.amount.text),
    );
    final unmatched = billTotal - paidTotal;
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        _InlineMetric(
          label: 'Bill total',
          value: _decimalPreviewMoney(billTotal, currency),
        ),
        _InlineMetric(
          label: 'Total paid',
          value: _decimalPreviewMoney(paidTotal, currency),
        ),
        _InlineMetric(
          label: 'Unmatched',
          value: _decimalPreviewMoney(unmatched, currency),
        ),
      ],
    );
  }
}

class _GroupBillReviewSummary extends StatelessWidget {
  const _GroupBillReviewSummary({
    required this.merchantName,
    required this.billDate,
    required this.currency,
    required this.itemControllers,
    required this.payerControllers,
    required this.attachmentCount,
  });

  final String merchantName;
  final String billDate;
  final String currency;
  final List<_GroupBillCreateItemControllers> itemControllers;
  final List<_GroupBillCreatePayerControllers> payerControllers;
  final int attachmentCount;

  @override
  Widget build(BuildContext context) {
    final warnings = _groupBillCreateWarnings(
      merchantName: merchantName,
      billDate: billDate,
      itemControllers: itemControllers,
      payerControllers: payerControllers,
      attachmentCount: attachmentCount,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _CreatePreviewStrip(
          label: 'Summary before save',
          value:
              'Items ${itemControllers.length}, payers ${payerControllers.length}, attachments $attachmentCount',
          icon: Icons.fact_check_outlined,
        ),
        const SizedBox(height: 10),
        _CreatePreviewStrip(
          label: 'Server validation still applies',
          value:
              'Final money, split, status, authorization, and policy checks remain API-authoritative.',
          icon: Icons.verified_user_outlined,
          variant: StatusChipVariant.info,
        ),
        const SizedBox(height: 12),
        if (warnings.isEmpty)
          const _ReviewChecklistHint(
            text: 'No local review warnings.',
            isReady: true,
          )
        else
          for (final warning in warnings)
            _ReviewChecklistHint(text: warning, isReady: false),
      ],
    );
  }
}

class _CreatePreviewStrip extends StatelessWidget {
  const _CreatePreviewStrip({
    required this.label,
    required this.value,
    required this.icon,
    this.variant = StatusChipVariant.neutral,
  });

  final String label;
  final String value;
  final IconData icon;
  final StatusChipVariant variant;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;
    final background = switch (variant) {
      StatusChipVariant.success => colors.successSoft,
      StatusChipVariant.warning => colors.warningSoft,
      StatusChipVariant.danger => colors.dangerSoft,
      StatusChipVariant.info => colors.infoSoft,
      StatusChipVariant.neutral => colors.primarySoft,
    };
    return DecoratedBox(
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(SettleoraRadius.md),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: Theme.of(context).textTheme.titleSmall),
                  const SizedBox(height: 2),
                  Text(value),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InlineMetric extends StatelessWidget {
  const _InlineMetric({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 118,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: context.settleoraColors.primarySoft,
          borderRadius: BorderRadius.circular(SettleoraRadius.md),
        ),
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: Theme.of(context).textTheme.labelMedium),
              const SizedBox(height: 4),
              Text(value, style: Theme.of(context).textTheme.titleSmall),
            ],
          ),
        ),
      ),
    );
  }
}

class _GroupBillCreateReviewChecklist extends StatelessWidget {
  const _GroupBillCreateReviewChecklist({
    required this.members,
    required this.itemControllers,
    required this.payerControllers,
    required this.attachmentCount,
  });

  final List<SettleoraGroupMember> members;
  final List<_GroupBillCreateItemControllers> itemControllers;
  final List<_GroupBillCreatePayerControllers> payerControllers;
  final int attachmentCount;

  @override
  Widget build(BuildContext context) {
    final splitCount = itemControllers.fold<int>(
      0,
      (count, item) => count + item.splits.length,
    );
    final missingSplitMembers = itemControllers
        .expand((item) => item.splits)
        .where((split) => (split.userProfileId ?? '').trim().isEmpty)
        .length;
    final missingPayerMembers = payerControllers
        .where((payer) => (payer.userProfileId ?? '').trim().isEmpty)
        .length;
    final selectedMemberNames = _selectedGroupBillCreateMemberNames(
      members: members,
      itemControllers: itemControllers,
      payerControllers: payerControllers,
    );
    final colorScheme = Theme.of(context).colorScheme;

    return Semantics(
      container: true,
      label: 'Group bill create local review checklist',
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colorScheme.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: colorScheme.outlineVariant),
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            key: const Key('group-bill-create-review-checklist'),
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    Icons.fact_check_outlined,
                    color: colorScheme.onSurfaceVariant,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Review before submit',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                'Local form checklist only. The server still validates final bill accounting.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _ReviewChecklistChip(
                    label: _pluralCount(itemControllers.length, 'item row'),
                  ),
                  _ReviewChecklistChip(
                    label: _pluralCount(splitCount, 'split row'),
                  ),
                  _ReviewChecklistChip(
                    label: _pluralCount(payerControllers.length, 'payer row'),
                  ),
                  _ReviewChecklistChip(
                    label: _pluralCount(attachmentCount, 'attachment'),
                  ),
                  _ReviewChecklistChip(
                    label: _pluralCount(members.length, 'active member'),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              if (selectedMemberNames.isEmpty)
                Text(
                  'Selected members: none yet',
                  key: const Key('group-bill-create-review-members'),
                  style: Theme.of(context).textTheme.bodyMedium,
                )
              else
                Text(
                  'Selected members: ${selectedMemberNames.join(', ')}',
                  key: const Key('group-bill-create-review-members'),
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              const SizedBox(height: 10),
              _ReviewChecklistHint(
                text: missingSplitMembers == 0
                    ? 'All split rows have selected members.'
                    : '${_pluralCount(missingSplitMembers, 'split row')} without a selected member.',
                isReady: missingSplitMembers == 0,
              ),
              _ReviewChecklistHint(
                text: payerControllers.isEmpty
                    ? 'No payer rows yet.'
                    : missingPayerMembers == 0
                    ? 'All payer rows have selected members.'
                    : '${_pluralCount(missingPayerMembers, 'payer row')} without a selected member.',
                isReady:
                    payerControllers.isNotEmpty && missingPayerMembers == 0,
              ),
              _ReviewChecklistHint(
                text: attachmentCount == 0
                    ? 'No attachments selected.'
                    : 'Attachments are selected for upload after draft creation.',
                isReady: attachmentCount > 0,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ReviewChecklistChip extends StatelessWidget {
  const _ReviewChecklistChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Chip(
      label: Text(label),
      visualDensity: VisualDensity.compact,
      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
    );
  }
}

class _ReviewChecklistHint extends StatelessWidget {
  const _ReviewChecklistHint({required this.text, required this.isReady});

  final String text;
  final bool isReady;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            isReady ? Icons.check_circle_outline : Icons.info_outline,
            size: 18,
            color: isReady ? colorScheme.primary : colorScheme.onSurfaceVariant,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text, style: Theme.of(context).textTheme.bodyMedium),
          ),
        ],
      ),
    );
  }
}

List<String> _selectedGroupBillCreateMemberNames({
  required List<SettleoraGroupMember> members,
  required List<_GroupBillCreateItemControllers> itemControllers,
  required List<_GroupBillCreatePayerControllers> payerControllers,
}) {
  final selectedIds = <String>{
    for (final item in itemControllers)
      for (final split in item.splits)
        if ((split.userProfileId ?? '').trim().isNotEmpty)
          split.userProfileId!.trim(),
    for (final payer in payerControllers)
      if ((payer.userProfileId ?? '').trim().isNotEmpty)
        payer.userProfileId!.trim(),
  };

  return [
    for (final member in members)
      if (selectedIds.contains(member.userProfileId)) member.safeDisplayName,
  ];
}

int _groupBillCreateSplitCount(
  List<_GroupBillCreateItemControllers> itemControllers,
) {
  return itemControllers.fold<int>(
    0,
    (count, item) => count + item.splits.length,
  );
}

int _groupBillCreateMissingSplitMembers(
  List<_GroupBillCreateItemControllers> itemControllers,
) {
  return itemControllers
      .expand((item) => item.splits)
      .where((split) => (split.userProfileId ?? '').trim().isEmpty)
      .length;
}

bool _groupBillCreateItemIsUnassigned(_GroupBillCreateItemControllers item) {
  return item.splits.isEmpty ||
      item.splits.every((split) => (split.userProfileId ?? '').trim().isEmpty);
}

int _groupBillCreateAssignedItemCount(
  List<_GroupBillCreateItemControllers> itemControllers,
) {
  return itemControllers
      .where((item) => !_groupBillCreateItemIsUnassigned(item))
      .length;
}

List<int> _filteredGroupBillAssignmentItems({
  required List<_GroupBillCreateItemControllers> itemControllers,
  required String selectedFilter,
}) {
  final indexes = <int>[];
  for (var index = 0; index < itemControllers.length; index += 1) {
    final item = itemControllers[index];
    if (selectedFilter == _groupBillAssignmentFilterAll) {
      indexes.add(index);
      continue;
    }
    if (selectedFilter == _groupBillAssignmentFilterUnassigned) {
      if (_groupBillCreateItemIsUnassigned(item)) {
        indexes.add(index);
      }
      continue;
    }
    if (item.splits.any((split) => split.userProfileId == selectedFilter)) {
      indexes.add(index);
    }
  }
  return indexes;
}

int _groupBillAssignmentFilterCount(
  List<_GroupBillCreateItemControllers> itemControllers,
  String filter,
) {
  return _filteredGroupBillAssignmentItems(
    itemControllers: itemControllers,
    selectedFilter: filter,
  ).length;
}

List<SettleoraGroupMember> _groupBillAssignedMembers(
  _GroupBillCreateItemControllers item,
  List<SettleoraGroupMember> members,
) {
  final assignedIds = <String>{
    for (final split in item.splits)
      if ((split.userProfileId ?? '').trim().isNotEmpty)
        split.userProfileId!.trim(),
  };
  return [
    for (final member in members)
      if (assignedIds.contains(member.userProfileId)) member,
  ];
}

String _groupBillQuantityLabel(_GroupBillCreateItemControllers item) {
  final noteMatch = RegExp(
    r'(?:qty|quantity)\s*[:=]\s*(\d+)',
    caseSensitive: false,
  ).firstMatch(item.note.text);
  if (noteMatch != null) {
    return 'Qty ${noteMatch.group(1)}';
  }

  for (final token in item.note.text.split(RegExp(r'[\s,;]+'))) {
    final match = RegExp(
      r'^(?:qty|quantity)[:=]?(\d+)$',
      caseSensitive: false,
    ).firstMatch(token.trim());
    if (match != null) {
      return 'Qty ${match.group(1)}';
    }
  }

  return 'Qty preview';
}

List<String> _groupBillItemMarkers(_GroupBillCreateItemControllers item) {
  final note = item.note.text.toLowerCase();
  return [
    if (note.contains('tax')) 'Tax',
    if (note.contains('service') || note.contains('fee')) 'Service/fee',
  ];
}

String _memberInitial(String label) {
  final trimmed = label.trim();
  if (trimmed.isEmpty) {
    return '?';
  }

  return trimmed.substring(0, 1).toUpperCase();
}

double _groupBillCreateDecimalTotal(Iterable<String> values) {
  var total = 0.0;
  for (final value in values) {
    total += double.tryParse(value.trim()) ?? 0;
  }
  return total;
}

String _decimalPreviewMoney(double amount, String currency) {
  final code = currency.trim().isEmpty
      ? 'currency'
      : currency.trim().toUpperCase();
  return '${amount.toStringAsFixed(2)} $code';
}

List<String> _groupBillCreateWarnings({
  required String merchantName,
  required String billDate,
  required List<_GroupBillCreateItemControllers> itemControllers,
  required List<_GroupBillCreatePayerControllers> payerControllers,
  required int attachmentCount,
}) {
  final warnings = <String>[];
  if (merchantName.trim().isEmpty) {
    warnings.add('Missing merchant or payee.');
  }
  if (billDate.trim().isEmpty) {
    warnings.add('Missing bill date.');
  }
  if (itemControllers.any(
    (item) => item.name.text.trim().isEmpty || item.amount.text.trim().isEmpty,
  )) {
    warnings.add('One or more items need a name and amount.');
  }
  final missingSplits = _groupBillCreateMissingSplitMembers(itemControllers);
  if (missingSplits > 0) {
    warnings.add('${_pluralCount(missingSplits, 'split row')} unassigned.');
  }
  if (payerControllers.isEmpty) {
    warnings.add('No payer rows added.');
  }
  if (attachmentCount == 0) {
    warnings.add('No receipt attached.');
  }
  return warnings;
}

class _GroupBillCreateItemControllers {
  _GroupBillCreateItemControllers({String? currency})
    : name = TextEditingController(),
      amount = TextEditingController(),
      currency = TextEditingController(text: currency ?? ''),
      note = TextEditingController(),
      splits = [_GroupBillCreateSplitControllers()];

  final TextEditingController name;
  final TextEditingController amount;
  final TextEditingController currency;
  final TextEditingController note;
  final List<_GroupBillCreateSplitControllers> splits;

  void addSplit() {
    splits.add(_GroupBillCreateSplitControllers());
  }

  void removeSplit(int index) {
    if (index < 0 || index >= splits.length) {
      return;
    }

    final removed = splits.removeAt(index);
    removed.dispose();
  }

  void dispose() {
    name.dispose();
    amount.dispose();
    currency.dispose();
    note.dispose();
    for (final split in splits) {
      split.dispose();
    }
  }
}

class _GroupBillCreateSplitControllers {
  _GroupBillCreateSplitControllers()
    : splitMethod = TextEditingController(text: 'equal'),
      basisValue = TextEditingController(),
      allocationOrder = TextEditingController();

  String? userProfileId;
  final TextEditingController splitMethod;
  final TextEditingController basisValue;
  final TextEditingController allocationOrder;

  void dispose() {
    splitMethod.dispose();
    basisValue.dispose();
    allocationOrder.dispose();
  }
}

class _GroupBillCreatePayerControllers {
  _GroupBillCreatePayerControllers({String? currency})
    : amount = TextEditingController(),
      currency = TextEditingController(text: currency ?? ''),
      paymentMethodLabel = TextEditingController();

  String? userProfileId;
  final TextEditingController amount;
  final TextEditingController currency;
  final TextEditingController paymentMethodLabel;

  void dispose() {
    amount.dispose();
    currency.dispose();
    paymentMethodLabel.dispose();
  }
}

class _GroupBillCreateItemCard extends StatefulWidget {
  const _GroupBillCreateItemCard({
    required this.index,
    required this.controllers,
    required this.members,
    required this.isSaving,
    required this.onRemove,
    required this.onDraftChanged,
  });

  final int index;
  final _GroupBillCreateItemControllers controllers;
  final List<SettleoraGroupMember> members;
  final bool isSaving;
  final VoidCallback onRemove;
  final VoidCallback onDraftChanged;

  @override
  State<_GroupBillCreateItemCard> createState() =>
      _GroupBillCreateItemCardState();
}

class _GroupBillCreateItemCardState extends State<_GroupBillCreateItemCard> {
  String? _splitListError;

  void _addSplit() {
    setState(() {
      _splitListError = null;
      widget.controllers.addSplit();
    });
    widget.onDraftChanged();
  }

  void _removeSplit(int index) {
    setState(() {
      widget.controllers.removeSplit(index);
      _splitListError = widget.controllers.splits.isEmpty
          ? 'Add at least one split before saving.'
          : null;
    });
    widget.onDraftChanged();
  }

  @override
  Widget build(BuildContext context) {
    final itemNumber = widget.index + 1;
    final splitListError = _splitListError;

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
              children: [
                Expanded(
                  child: Text(
                    'Item $itemNumber',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                ),
                IconButton(
                  key: ValueKey('group-bill-item-remove-${widget.index}'),
                  onPressed: widget.isSaving ? null : widget.onRemove,
                  tooltip: 'Remove item',
                  icon: const Icon(Icons.remove_circle_outline),
                ),
              ],
            ),
            const SizedBox(height: 8),
            TextFormField(
              key: ValueKey('group-bill-item-name-${widget.index}'),
              controller: widget.controllers.name,
              enabled: !widget.isSaving,
              onChanged: (_) => widget.onDraftChanged(),
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Name',
                border: OutlineInputBorder(),
              ),
              validator: (value) =>
                  _requiredField(value, 'Enter an item name.'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: ValueKey('group-bill-item-amount-${widget.index}'),
              controller: widget.controllers.amount,
              enabled: !widget.isSaving,
              onChanged: (_) => widget.onDraftChanged(),
              keyboardType: TextInputType.number,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Amount',
                border: OutlineInputBorder(),
              ),
              validator: (value) => _positiveMoneyAmountField(
                value,
                requiredMessage: 'Enter an item amount.',
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: ValueKey('group-bill-item-currency-${widget.index}'),
              controller: widget.controllers.currency,
              enabled: !widget.isSaving,
              onChanged: (_) => widget.onDraftChanged(),
              textCapitalization: TextCapitalization.characters,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Currency',
                border: OutlineInputBorder(),
              ),
              validator: (value) => _currencyCodeField(
                value,
                requiredMessage: 'Enter an item currency.',
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: ValueKey('group-bill-item-note-${widget.index}'),
              controller: widget.controllers.note,
              enabled: !widget.isSaving,
              onChanged: (_) => widget.onDraftChanged(),
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Note',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Splits',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                ),
                TextButton.icon(
                  key: ValueKey('group-bill-item-add-split-${widget.index}'),
                  onPressed: widget.isSaving ? null : _addSplit,
                  icon: const Icon(Icons.add),
                  label: const Text('Add split'),
                ),
              ],
            ),
            if (splitListError != null) ...[
              const SizedBox(height: 6),
              Text(
                splitListError,
                key: ValueKey('group-bill-split-list-error-${widget.index}'),
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            for (
              var splitIndex = 0;
              splitIndex < widget.controllers.splits.length;
              splitIndex += 1
            )
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: _GroupBillCreateSplitCard(
                  itemIndex: widget.index,
                  splitIndex: splitIndex,
                  controllers: widget.controllers.splits[splitIndex],
                  members: widget.members,
                  isSaving: widget.isSaving,
                  onRemove: () => _removeSplit(splitIndex),
                  onDraftChanged: widget.onDraftChanged,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _GroupBillCreateSplitCard extends StatelessWidget {
  const _GroupBillCreateSplitCard({
    required this.itemIndex,
    required this.splitIndex,
    required this.controllers,
    required this.members,
    required this.isSaving,
    required this.onRemove,
    required this.onDraftChanged,
  });

  final int itemIndex;
  final int splitIndex;
  final _GroupBillCreateSplitControllers controllers;
  final List<SettleoraGroupMember> members;
  final bool isSaving;
  final VoidCallback onRemove;
  final VoidCallback onDraftChanged;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Split ${splitIndex + 1}',
                    style: Theme.of(context).textTheme.labelLarge,
                  ),
                ),
                IconButton(
                  key: ValueKey(
                    'group-bill-split-remove-$itemIndex-$splitIndex',
                  ),
                  onPressed: isSaving ? null : onRemove,
                  tooltip: 'Remove split',
                  icon: const Icon(Icons.remove_circle_outline),
                ),
              ],
            ),
            const SizedBox(height: 8),
            _MemberPickerField(
              key: ValueKey('group-bill-split-member-$itemIndex-$splitIndex'),
              label: 'Member',
              pickerTitle: 'Choose split member',
              searchKey: ValueKey(
                'group-bill-split-member-search-$itemIndex-$splitIndex',
              ),
              clearSearchKey: ValueKey(
                'group-bill-split-member-clear-search-$itemIndex-$splitIndex',
              ),
              members: members,
              value: controllers.userProfileId,
              enabled: !isSaving,
              requiredMessage: 'Choose a member for every split.',
              onChanged: (value) {
                controllers.userProfileId = value;
                onDraftChanged();
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: ValueKey('group-bill-split-method-$itemIndex-$splitIndex'),
              controller: controllers.splitMethod,
              enabled: !isSaving,
              onChanged: (_) => onDraftChanged(),
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Split method',
                border: OutlineInputBorder(),
              ),
              validator: (value) =>
                  _requiredField(value, 'Enter a split method.'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: ValueKey('group-bill-split-basis-$itemIndex-$splitIndex'),
              controller: controllers.basisValue,
              enabled: !isSaving,
              onChanged: (_) => onDraftChanged(),
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Basis value',
                border: OutlineInputBorder(),
              ),
              validator: (value) =>
                  _isExactAmountSplitMethod(controllers.splitMethod.text)
                  ? _positiveMoneyAmountField(
                      value,
                      requiredMessage: 'Enter a split amount.',
                    )
                  : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: ValueKey('group-bill-split-order-$itemIndex-$splitIndex'),
              controller: controllers.allocationOrder,
              enabled: !isSaving,
              onChanged: (_) => onDraftChanged(),
              keyboardType: TextInputType.number,
              textInputAction: TextInputAction.done,
              decoration: const InputDecoration(
                labelText: 'Allocation order',
                border: OutlineInputBorder(),
              ),
              validator: _allocationOrderError,
            ),
          ],
        ),
      ),
    );
  }
}

class _GroupBillCreatePayerCard extends StatelessWidget {
  const _GroupBillCreatePayerCard({
    required this.index,
    required this.controllers,
    required this.members,
    required this.isSaving,
    required this.onRemove,
    required this.onDraftChanged,
  });

  final int index;
  final _GroupBillCreatePayerControllers controllers;
  final List<SettleoraGroupMember> members;
  final bool isSaving;
  final VoidCallback onRemove;
  final VoidCallback onDraftChanged;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Payer ${index + 1}',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                ),
                IconButton(
                  key: ValueKey('group-bill-payer-remove-$index'),
                  onPressed: isSaving ? null : onRemove,
                  tooltip: 'Remove payer',
                  icon: const Icon(Icons.remove_circle_outline),
                ),
              ],
            ),
            const SizedBox(height: 8),
            _MemberPickerField(
              key: ValueKey('group-bill-payer-member-$index'),
              label: 'Member',
              pickerTitle: 'Choose payer member',
              searchKey: ValueKey('group-bill-payer-member-search-$index'),
              clearSearchKey: ValueKey(
                'group-bill-payer-member-clear-search-$index',
              ),
              members: members,
              value: controllers.userProfileId,
              enabled: !isSaving,
              requiredMessage: 'Choose a member for every payer.',
              onChanged: (value) {
                controllers.userProfileId = value;
                onDraftChanged();
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: ValueKey('group-bill-payer-amount-$index'),
              controller: controllers.amount,
              enabled: !isSaving,
              onChanged: (_) => onDraftChanged(),
              keyboardType: TextInputType.number,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Amount',
                border: OutlineInputBorder(),
              ),
              validator: (value) => _positiveMoneyAmountField(
                value,
                requiredMessage: 'Enter a payer amount.',
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: ValueKey('group-bill-payer-currency-$index'),
              controller: controllers.currency,
              enabled: !isSaving,
              onChanged: (_) => onDraftChanged(),
              textCapitalization: TextCapitalization.characters,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Currency',
                border: OutlineInputBorder(),
              ),
              validator: (value) => _currencyCodeField(
                value,
                requiredMessage: 'Enter a payer currency.',
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: ValueKey('group-bill-payer-method-$index'),
              controller: controllers.paymentMethodLabel,
              enabled: !isSaving,
              onChanged: (_) => onDraftChanged(),
              textInputAction: TextInputAction.done,
              decoration: const InputDecoration(
                labelText: 'Payment method label',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MemberPickerField extends StatelessWidget {
  const _MemberPickerField({
    super.key,
    required this.label,
    required this.pickerTitle,
    required this.searchKey,
    required this.clearSearchKey,
    required this.members,
    required this.value,
    required this.enabled,
    required this.requiredMessage,
    required this.onChanged,
  });

  final String label;
  final String pickerTitle;
  final Key searchKey;
  final Key clearSearchKey;
  final List<SettleoraGroupMember> members;
  final String? value;
  final bool enabled;
  final String requiredMessage;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    return FormField<String>(
      initialValue: value,
      validator: (fieldValue) {
        final trimmed = fieldValue?.trim();
        if (trimmed == null || trimmed.isEmpty) {
          return requiredMessage;
        }

        return null;
      },
      builder: (field) {
        final selectedMember = _memberForValue(members, field.value);
        final selectedText = selectedMember?.safeDisplayName;
        final helperText = members.isEmpty
            ? 'No active group members loaded.'
            : 'Showing ${members.length} of ${members.length} members';

        return InkWell(
          onTap: enabled
              ? () async {
                  final selected = await showModalBottomSheet<String>(
                    context: context,
                    isScrollControlled: true,
                    builder: (context) => _MemberPickerSheet(
                      title: pickerTitle,
                      members: members,
                      selectedValue: field.value,
                      searchKey: searchKey,
                      clearSearchKey: clearSearchKey,
                    ),
                  );
                  if (selected == null) {
                    return;
                  }

                  field.didChange(selected);
                  onChanged(selected);
                }
              : null,
          borderRadius: BorderRadius.circular(4),
          child: InputDecorator(
            isEmpty: selectedText == null,
            decoration: InputDecoration(
              labelText: label,
              border: const OutlineInputBorder(),
              enabled: enabled,
              errorText: field.errorText,
              helperText: helperText,
              suffixIcon: const Icon(Icons.expand_more),
            ),
            child: Text(
              selectedText ?? 'Choose member',
              style: selectedText == null
                  ? TextStyle(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    )
                  : null,
            ),
          ),
        );
      },
    );
  }
}

class _MemberPickerSheet extends StatefulWidget {
  const _MemberPickerSheet({
    required this.title,
    required this.members,
    required this.selectedValue,
    required this.searchKey,
    required this.clearSearchKey,
  });

  final String title;
  final List<SettleoraGroupMember> members;
  final String? selectedValue;
  final Key searchKey;
  final Key clearSearchKey;

  @override
  State<_MemberPickerSheet> createState() => _MemberPickerSheetState();
}

class _MemberPickerSheetState extends State<_MemberPickerSheet> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _clearSearch() {
    _searchController.clear();
    setState(() {
      _query = '';
    });
  }

  @override
  Widget build(BuildContext context) {
    final query = _query.trim().toLowerCase();
    final filteredMembers = [
      for (final member in widget.members)
        if (query.isEmpty || _memberMatchesQuery(member, query)) member,
    ];
    final hasSearch = query.isNotEmpty;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          16,
          12,
          16,
          16 + MediaQuery.of(context).viewInsets.bottom,
        ),
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.82,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      widget.title,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  IconButton(
                    tooltip: 'Close',
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              TextField(
                key: widget.searchKey,
                controller: _searchController,
                enabled: widget.members.isNotEmpty,
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  labelText: 'Search members',
                  border: const OutlineInputBorder(),
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: hasSearch
                      ? IconButton(
                          key: widget.clearSearchKey,
                          tooltip: 'Clear search',
                          onPressed: _clearSearch,
                          icon: const Icon(Icons.clear),
                        )
                      : null,
                ),
                onChanged: (value) {
                  setState(() {
                    _query = value;
                  });
                },
              ),
              const SizedBox(height: 10),
              Text(
                'Showing ${filteredMembers.length} of ${widget.members.length} members',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 8),
              if (widget.members.isEmpty)
                const _MemberPickerEmptyState(
                  title: 'No active members',
                  body: 'No active group members are loaded for this bill.',
                )
              else if (filteredMembers.isEmpty)
                const _MemberPickerEmptyState(
                  title: 'No matching members',
                  body: 'No loaded active members match this search.',
                )
              else
                Flexible(
                  child: ListView.separated(
                    shrinkWrap: true,
                    itemCount: filteredMembers.length,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final member = filteredMembers[index];
                      final isSelected =
                          member.userProfileId == widget.selectedValue;
                      return ListTile(
                        key: ValueKey(
                          'group-bill-member-picker-${member.userProfileId}',
                        ),
                        title: Text(member.safeDisplayName),
                        subtitle: Text(
                          '${settleoraGroupRoleLabel(member.role)} - '
                          '${settleoraGroupMembershipStatusLabel(member.status)}',
                        ),
                        trailing: isSelected
                            ? const Icon(Icons.check_circle)
                            : null,
                        onTap: () =>
                            Navigator.of(context).pop(member.userProfileId),
                      );
                    },
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MemberPickerEmptyState extends StatelessWidget {
  const _MemberPickerEmptyState({required this.title, required this.body});

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 24),
      child: Column(
        children: [
          Icon(
            Icons.group_off_outlined,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
          const SizedBox(height: 8),
          Text(title, style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 4),
          Text(
            body,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

SettleoraGroupMember? _memberForValue(
  List<SettleoraGroupMember> members,
  String? value,
) {
  if (value == null) {
    return null;
  }

  for (final member in members) {
    if (member.userProfileId == value) {
      return member;
    }
  }

  return null;
}

bool _memberMatchesQuery(SettleoraGroupMember member, String query) {
  return member.safeDisplayName.toLowerCase().contains(query) ||
      settleoraGroupRoleLabel(member.role).toLowerCase().contains(query) ||
      settleoraGroupMembershipStatusLabel(
        member.status,
      ).toLowerCase().contains(query);
}

class _GroupMemberFailurePanel extends StatelessWidget {
  const _GroupMemberFailurePanel({
    required this.failure,
    required this.onRetry,
  });

  final SettleoraGroupFailure failure;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return _StatePanel(
      icon: Icons.group_off_outlined,
      title: failure.title,
      message: failure.message,
      action: OutlinedButton.icon(
        onPressed: onRetry,
        icon: const Icon(Icons.refresh),
        label: const Text('Retry'),
      ),
    );
  }
}

class SettleoraBillDetailScreen extends StatefulWidget {
  const SettleoraBillDetailScreen({
    super.key,
    required this.repository,
    required this.billId,
    this.initialBill,
    this.attachmentRepository,
    this.attachmentFileInput,
    this.receiptOcrReviewRepository,
    this.revisionRepository,
  });

  final SettleoraBillRepository repository;
  final String billId;
  final SettleoraBillDetail? initialBill;
  final SettleoraBillAttachmentRepository? attachmentRepository;
  final SettleoraBillAttachmentFileInput? attachmentFileInput;
  final ReceiptOcrReviewRepository? receiptOcrReviewRepository;
  final SettleoraBillRevisionRepository? revisionRepository;

  @override
  State<SettleoraBillDetailScreen> createState() =>
      _SettleoraBillDetailScreenState();
}

class _SettleoraBillDetailScreenState extends State<SettleoraBillDetailScreen> {
  final _detailSearchController = TextEditingController();

  late bool _isLoading;
  SettleoraBillDetail? _bill;
  SettleoraBillFailure? _failure;
  SettleoraBillRevision? _pendingRevision;
  SettleoraBillRevisionFailure? _revisionFailure;
  SettleoraBillRevisionFailure? _createFailure;
  _BillDetailFilter _selectedDetailFilter = _BillDetailFilter.all;
  bool _isOpeningCreate = false;
  int _attachmentReloadRevision = 0;

  @override
  void initState() {
    super.initState();
    final initialBill = widget.initialBill;
    _bill = initialBill;
    _isLoading = initialBill == null;
    if (initialBill == null) {
      Future<void>.microtask(_load);
    } else {
      Future<void>.microtask(_loadPendingRevisionForInitialBill);
    }
  }

  @override
  void dispose() {
    _detailSearchController.dispose();
    super.dispose();
  }

  Future<void> _loadPendingRevisionForInitialBill() async {
    final revisionSnapshot = await _loadPendingRevision(
      widget.revisionRepository,
      widget.billId,
    );
    if (!mounted) {
      return;
    }

    setState(() {
      _pendingRevision = revisionSnapshot.revision;
      _revisionFailure = revisionSnapshot.failure;
    });
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _failure = null;
      _revisionFailure = null;
      _createFailure = null;
    });

    try {
      final bill = await widget.repository.getPersonalBill(widget.billId);
      final revisionSnapshot = await _loadPendingRevision(
        widget.revisionRepository,
        widget.billId,
      );
      if (!mounted) {
        return;
      }

      setState(() {
        _bill = bill;
        _pendingRevision = revisionSnapshot.revision;
        _revisionFailure = revisionSnapshot.failure;
        _isLoading = false;
        _attachmentReloadRevision += 1;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _failure = SettleoraBillFailure.from(error);
        _isLoading = false;
      });
    }
  }

  Future<void> _openRevision(
    SettleoraBillDetail bill,
    SettleoraBillRevision revision,
  ) async {
    final revisionRepository = widget.revisionRepository;
    if (revisionRepository == null) {
      return;
    }

    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SettleoraBillRevisionReviewScreen(
          repository: revisionRepository,
          billId: bill.id,
          revisionId: revision.id,
          billLabel: bill.displayName,
        ),
      ),
    );

    if (mounted) {
      await _load();
    }
  }

  Future<void> _openCreateRevision() async {
    final revisionRepository = widget.revisionRepository;
    if (revisionRepository == null || _isOpeningCreate) {
      return;
    }

    setState(() {
      _isOpeningCreate = true;
      _createFailure = null;
    });

    late final SettleoraBillDetail freshBill;
    try {
      freshBill = await widget.repository.getPersonalBill(widget.billId);
      if (!mounted) {
        return;
      }
      setState(() {
        _bill = freshBill;
      });
      _assertCanCreateRevision(freshBill);
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _createFailure = _createRevisionFailureFrom(error);
        _isOpeningCreate = false;
      });
      return;
    }

    if (!mounted) {
      return;
    }
    setState(() {
      _isOpeningCreate = false;
    });

    final created = await Navigator.of(context).push<SettleoraBillRevision>(
      MaterialPageRoute(
        builder: (_) => SettleoraBillRevisionProposalEditorScreen.create(
          repository: revisionRepository,
          billId: freshBill.id,
          billLabel: freshBill.displayName,
          initialProposal: _proposalFromBillDetail(freshBill),
          onCreate: (proposal) =>
              _createWithFreshPersonalCapability(revisionRepository, proposal),
        ),
      ),
    );

    if (!mounted || created == null) {
      return;
    }

    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SettleoraBillRevisionReviewScreen(
          repository: revisionRepository,
          billId: created.billId,
          revisionId: created.id,
          billLabel: freshBill.displayName,
        ),
      ),
    );

    if (mounted) {
      await _load();
    }
  }

  Future<SettleoraBillRevision> _createWithFreshPersonalCapability(
    SettleoraBillRevisionRepository revisionRepository,
    SettleoraBillRevisionProposalSnapshot proposal,
  ) async {
    try {
      final freshBill = await widget.repository.getPersonalBill(widget.billId);
      if (mounted) {
        setState(() {
          _bill = freshBill;
        });
      }
      _assertCanCreateRevision(freshBill);
      return revisionRepository.createBillRevision(freshBill.id, proposal);
    } catch (error) {
      throw _createRevisionFailureFrom(error);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Bill'),
        actions: [
          IconButton(
            onPressed: _isLoading ? null : _load,
            tooltip: 'Refresh',
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: Builder(
          builder: (context) {
            if (_isLoading) {
              return const _LoadingPanel(label: 'Loading bill');
            }

            final failure = _failure;
            if (failure != null) {
              return _FailurePanel(failure: failure, onRetry: _load);
            }

            final bill = _bill;
            if (bill == null) {
              return _FailurePanel(
                failure: const SettleoraBillFailure(
                  kind: SettleoraBillFailureKind.unavailable,
                  message: 'The bill is no longer available.',
                ),
                onRetry: _load,
              );
            }
            final detailDiscovery = _BillDetailDiscoverySnapshot.fromBill(
              bill,
              searchQuery: _detailSearchController.text,
              selectedFilter: _selectedDetailFilter,
            );

            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 112),
              children: [
                _BillDetailHeader(bill: bill),
                if (_pendingRevision != null) ...[
                  const SizedBox(height: 14),
                  _PendingRevisionBanner(
                    revision: _pendingRevision!,
                    onOpen: () => _openRevision(bill, _pendingRevision!),
                  ),
                ] else if (_revisionFailure != null) ...[
                  const SizedBox(height: 14),
                  _RevisionUnavailableBanner(failure: _revisionFailure!),
                ],
                if (_canShowCreateRevisionAction(
                  bill,
                  widget.revisionRepository,
                )) ...[
                  const SizedBox(height: 14),
                  _CreateRevisionAction(
                    key: const Key('bill-detail-propose-change-card'),
                    buttonKey: const Key('bill-detail-propose-change'),
                    isLoading: _isOpeningCreate,
                    onPressed: _openCreateRevision,
                  ),
                ],
                if (_createFailure != null) ...[
                  const SizedBox(height: 14),
                  _CreateRevisionFailureBanner(failure: _createFailure!),
                ],
                const SizedBox(height: 20),
                _BillDetailDiscoveryControls(
                  searchController: _detailSearchController,
                  selectedFilter: _selectedDetailFilter,
                  loadedCount: detailDiscovery.loadedCount,
                  visibleCount: detailDiscovery.visibleCount,
                  onSearchChanged: (_) => setState(() {}),
                  onFilterSelected: (filter) {
                    setState(() {
                      _selectedDetailFilter = filter;
                    });
                  },
                  onClear: () {
                    setState(() {
                      _detailSearchController.clear();
                      _selectedDetailFilter = _BillDetailFilter.all;
                    });
                  },
                ),
                const SizedBox(height: 20),
                if (detailDiscovery.showFilteredEmpty)
                  const _BillDetailFilteredEmpty()
                else ...[
                  if (detailDiscovery.shouldShowItems) ...[
                    _BillItems(items: detailDiscovery.items),
                    const SizedBox(height: 20),
                  ],
                  if (detailDiscovery.shouldShowParticipants) ...[
                    _BillParticipants(
                      participants: detailDiscovery.participants,
                      participantDisplayIndexes:
                          detailDiscovery.participantDisplayIndexes,
                    ),
                    const SizedBox(height: 20),
                  ],
                  if (detailDiscovery.shouldShowPayers) ...[
                    _BillPayers(payers: detailDiscovery.payers),
                    const SizedBox(height: 20),
                  ],
                  if (detailDiscovery.shouldShowAdjustments)
                    _BillAdjustments(adjustments: detailDiscovery.adjustments),
                ],
                if (widget.attachmentRepository != null) ...[
                  const SizedBox(height: 20),
                  BillAttachmentSection(
                    keyPrefix: 'bill-attachments',
                    reloadRevision: _attachmentReloadRevision,
                    route: SettleoraBillAttachmentRoute.personal(bill.id),
                    repository: widget.attachmentRepository!,
                    fileInput: widget.attachmentFileInput,
                    receiptOcrReviewRepository:
                        widget.receiptOcrReviewRepository,
                  ),
                ],
              ],
            );
          },
        ),
      ),
      bottomNavigationBar: const SettleoraBottomNav(
        selected: SettleoraNavDestination.bills,
      ),
    );
  }
}

class SettleoraGroupBillDetailScreen extends StatefulWidget {
  const SettleoraGroupBillDetailScreen({
    super.key,
    required this.repository,
    required this.groupId,
    required this.groupName,
    required this.billId,
    this.currentUserProfileId,
    this.participantDisplayNames = const {},
    this.initialBill,
    this.attachmentRepository,
    this.attachmentFileInput,
    this.receiptOcrReviewRepository,
    this.revisionRepository,
  });

  final SettleoraBillRepository repository;
  final SettleoraBillRevisionRepository? revisionRepository;
  final SettleoraBillAttachmentRepository? attachmentRepository;
  final SettleoraBillAttachmentFileInput? attachmentFileInput;
  final ReceiptOcrReviewRepository? receiptOcrReviewRepository;
  final String groupId;
  final String groupName;
  final String billId;
  final String? currentUserProfileId;
  final Map<String, String> participantDisplayNames;
  final SettleoraBillDetail? initialBill;

  @override
  State<SettleoraGroupBillDetailScreen> createState() =>
      _SettleoraGroupBillDetailScreenState();
}

class _SettleoraGroupBillDetailScreenState
    extends State<SettleoraGroupBillDetailScreen> {
  final _detailSearchController = TextEditingController();

  late bool _isLoading;
  late Map<String, String> _participantDisplayNames;
  SettleoraBillDetail? _bill;
  SettleoraBillFailure? _failure;
  SettleoraBillRevision? _pendingRevision;
  SettleoraBillRevisionFailure? _revisionFailure;
  SettleoraBillRevisionFailure? _createFailure;
  _BillDetailFilter _selectedDetailFilter = _BillDetailFilter.all;
  bool _isOpeningCreate = false;
  bool _isAcknowledging = false;
  SettleoraBillFailure? _acknowledgementFailure;
  int _attachmentReloadRevision = 0;

  @override
  void initState() {
    super.initState();
    _participantDisplayNames = _normalizeParticipantDisplayNames(
      widget.participantDisplayNames,
    );
    final initialBill = widget.initialBill;
    _bill = initialBill;
    _isLoading = initialBill == null;
    if (initialBill == null) {
      Future<void>.microtask(_load);
    } else {
      Future<void>.microtask(_loadPendingRevisionForInitialBill);
    }
  }

  @override
  void dispose() {
    _detailSearchController.dispose();
    super.dispose();
  }

  Future<void> _loadPendingRevisionForInitialBill() async {
    final revisionSnapshot = await _loadPendingRevision(
      widget.revisionRepository,
      widget.billId,
    );
    if (!mounted) {
      return;
    }

    setState(() {
      _pendingRevision = revisionSnapshot.revision;
      _revisionFailure = revisionSnapshot.failure;
    });
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _failure = null;
      _revisionFailure = null;
      _createFailure = null;
      _acknowledgementFailure = null;
    });

    try {
      final bill = await widget.repository.getGroupBill(
        widget.groupId,
        widget.billId,
      );
      final revisionSnapshot = await _loadPendingRevision(
        widget.revisionRepository,
        widget.billId,
      );
      if (!mounted) {
        return;
      }

      setState(() {
        _bill = bill;
        _pendingRevision = revisionSnapshot.revision;
        _revisionFailure = revisionSnapshot.failure;
        _isLoading = false;
        _attachmentReloadRevision += 1;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _failure = SettleoraBillFailure.from(error);
        _isLoading = false;
      });
    }
  }

  Future<void> _openRevision(
    SettleoraBillDetail bill,
    SettleoraBillRevision revision,
  ) async {
    final revisionRepository = widget.revisionRepository;
    if (revisionRepository == null) {
      return;
    }

    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SettleoraBillRevisionReviewScreen(
          repository: revisionRepository,
          billId: bill.id,
          revisionId: revision.id,
          billLabel: bill.displayName,
        ),
      ),
    );

    if (mounted) {
      await _load();
    }
  }

  Future<void> _openCreateRevision() async {
    final revisionRepository = widget.revisionRepository;
    if (revisionRepository == null || _isOpeningCreate) {
      return;
    }

    setState(() {
      _isOpeningCreate = true;
      _createFailure = null;
    });

    late final SettleoraBillDetail freshBill;
    try {
      freshBill = await widget.repository.getGroupBill(
        widget.groupId,
        widget.billId,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _bill = freshBill;
      });
      _assertCanCreateRevision(freshBill);
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _createFailure = _createRevisionFailureFrom(error);
        _isOpeningCreate = false;
      });
      return;
    }

    if (!mounted) {
      return;
    }
    setState(() {
      _isOpeningCreate = false;
    });

    final created = await Navigator.of(context).push<SettleoraBillRevision>(
      MaterialPageRoute(
        builder: (_) => SettleoraBillRevisionProposalEditorScreen.create(
          repository: revisionRepository,
          billId: freshBill.id,
          billLabel: freshBill.displayName,
          initialProposal: _proposalFromBillDetail(freshBill),
          onCreate: (proposal) =>
              _createWithFreshGroupCapability(revisionRepository, proposal),
        ),
      ),
    );

    if (!mounted || created == null) {
      return;
    }

    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SettleoraBillRevisionReviewScreen(
          repository: revisionRepository,
          billId: created.billId,
          revisionId: created.id,
          billLabel: freshBill.displayName,
        ),
      ),
    );

    if (mounted) {
      await _load();
    }
  }

  Future<SettleoraBillRevision> _createWithFreshGroupCapability(
    SettleoraBillRevisionRepository revisionRepository,
    SettleoraBillRevisionProposalSnapshot proposal,
  ) async {
    try {
      final freshBill = await widget.repository.getGroupBill(
        widget.groupId,
        widget.billId,
      );
      if (mounted) {
        setState(() {
          _bill = freshBill;
        });
      }
      _assertCanCreateRevision(freshBill);
      return revisionRepository.createBillRevision(freshBill.id, proposal);
    } catch (error) {
      throw _createRevisionFailureFrom(error);
    }
  }

  Future<void> _acceptParticipantShare() async {
    final userProfileId = widget.currentUserProfileId?.trim();
    if (_isAcknowledging || userProfileId == null || userProfileId.isEmpty) {
      return;
    }

    setState(() {
      _isAcknowledging = true;
      _acknowledgementFailure = null;
    });

    try {
      await widget.repository.acceptGroupBillParticipant(
        widget.groupId,
        widget.billId,
        userProfileId,
      );
      await _load();
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _acknowledgementFailure = SettleoraBillFailure.from(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isAcknowledging = false;
        });
      }
    }
  }

  Future<void> _rejectParticipantShare() async {
    final userProfileId = widget.currentUserProfileId?.trim();
    if (_isAcknowledging || userProfileId == null || userProfileId.isEmpty) {
      return;
    }

    final reasonCode = await _selectRejectionReason();
    if (!mounted || reasonCode == null) {
      return;
    }

    setState(() {
      _isAcknowledging = true;
      _acknowledgementFailure = null;
    });

    try {
      await widget.repository.rejectGroupBillParticipant(
        widget.groupId,
        widget.billId,
        userProfileId,
        reasonCode,
      );
      await _load();
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _acknowledgementFailure = SettleoraBillFailure.from(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isAcknowledging = false;
        });
      }
    }
  }

  Future<SettleoraBillParticipantRejectionReasonCode?>
  _selectRejectionReason() {
    SettleoraBillParticipantRejectionReasonCode? selectedReason;

    return showModalBottomSheet<SettleoraBillParticipantRejectionReasonCode>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) => SafeArea(
          child: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Reject bill',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Choose a correction reason before sending this request.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 8),
                  for (final reason
                      in SettleoraBillParticipantRejectionReasonCodeValues
                          .values)
                    ListTile(
                      key: ValueKey('group-bill-reject-reason-$reason'),
                      leading: Icon(
                        selectedReason == reason
                            ? Icons.radio_button_checked
                            : Icons.radio_button_unchecked,
                      ),
                      title: Text(
                        settleoraBillParticipantRejectionReasonLabel(reason),
                      ),
                      onTap: () {
                        setSheetState(() {
                          selectedReason = reason;
                        });
                      },
                    ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      TextButton(
                        key: const Key('group-bill-reject-cancel'),
                        onPressed: () => Navigator.of(context).pop(),
                        child: const Text('Cancel'),
                      ),
                      const SizedBox(width: 8),
                      FilledButton.icon(
                        key: const Key('group-bill-reject-submit'),
                        onPressed: selectedReason == null
                            ? null
                            : () => Navigator.of(context).pop(selectedReason),
                        icon: const Icon(Icons.close),
                        label: const Text('Send rejection'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Group bill'),
        actions: [
          IconButton(
            key: const Key('group-bill-detail-refresh'),
            onPressed: _isLoading ? null : _load,
            tooltip: 'Refresh',
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      bottomNavigationBar: const SettleoraBottomNav(
        selected: SettleoraNavDestination.groups,
      ),
      body: SafeArea(
        child: Builder(
          builder: (context) {
            if (_isLoading) {
              return const _LoadingPanel(label: 'Loading group bill');
            }

            final failure = _failure;
            if (failure != null) {
              return _FailurePanel(failure: failure, onRetry: _load);
            }

            final bill = _bill;
            if (bill == null) {
              return _FailurePanel(
                failure: const SettleoraBillFailure(
                  kind: SettleoraBillFailureKind.unavailable,
                  message: 'The bill is no longer available.',
                ),
                onRetry: _load,
              );
            }
            final detailDiscovery = _BillDetailDiscoverySnapshot.fromBill(
              bill,
              searchQuery: _detailSearchController.text,
              selectedFilter: _selectedDetailFilter,
              currentUserProfileId: widget.currentUserProfileId,
              participantDisplayNames: _participantDisplayNames,
            );

            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
              children: [
                _GroupBillContext(groupName: widget.groupName),
                const SizedBox(height: 20),
                _BillDetailHeader(bill: bill),
                if (_canAcknowledgeCurrentParticipant(
                  bill,
                  widget.currentUserProfileId,
                )) ...[
                  const SizedBox(height: 14),
                  _GroupBillAcknowledgementActions(
                    isBusy: _isAcknowledging || _isLoading,
                    failure: _acknowledgementFailure,
                    onAccept: _acceptParticipantShare,
                    onReject: _rejectParticipantShare,
                  ),
                ],
                if (_currentBillDetailParticipant(
                      bill,
                      widget.currentUserProfileId,
                    ) !=
                    null) ...[
                  const SizedBox(height: 14),
                  _GroupBillNextStepPanel(
                    bill: bill,
                    currentUserProfileId: widget.currentUserProfileId,
                  ),
                ],
                const SizedBox(height: 14),
                _GroupBillParticipantStatusSummary(
                  participants: bill.participants,
                  currentUserProfileId: widget.currentUserProfileId,
                  participantDisplayNames: _participantDisplayNames,
                ),
                if (_currentBillDetailParticipant(
                      bill,
                      widget.currentUserProfileId,
                    ) !=
                    null) ...[
                  const SizedBox(height: 14),
                  _GroupBillSharePanel(
                    bill: bill,
                    currentUserProfileId: widget.currentUserProfileId,
                    participantDisplayNames: _participantDisplayNames,
                  ),
                ],
                if (_pendingRevision != null) ...[
                  const SizedBox(height: 14),
                  _PendingRevisionBanner(
                    revision: _pendingRevision!,
                    onOpen: () => _openRevision(bill, _pendingRevision!),
                  ),
                ] else if (_revisionFailure != null) ...[
                  const SizedBox(height: 14),
                  _RevisionUnavailableBanner(failure: _revisionFailure!),
                ],
                if (_canShowCreateRevisionAction(
                  bill,
                  widget.revisionRepository,
                )) ...[
                  const SizedBox(height: 14),
                  _CreateRevisionAction(
                    key: const Key('group-bill-detail-propose-change-card'),
                    buttonKey: const Key('group-bill-detail-propose-change'),
                    isLoading: _isOpeningCreate,
                    onPressed: _openCreateRevision,
                  ),
                ],
                if (_createFailure != null) ...[
                  const SizedBox(height: 14),
                  _CreateRevisionFailureBanner(failure: _createFailure!),
                ],
                const SizedBox(height: 20),
                _BillDetailDiscoveryControls(
                  searchController: _detailSearchController,
                  selectedFilter: _selectedDetailFilter,
                  loadedCount: detailDiscovery.loadedCount,
                  visibleCount: detailDiscovery.visibleCount,
                  onSearchChanged: (_) => setState(() {}),
                  onFilterSelected: (filter) {
                    setState(() {
                      _selectedDetailFilter = filter;
                    });
                  },
                  onClear: () {
                    setState(() {
                      _detailSearchController.clear();
                      _selectedDetailFilter = _BillDetailFilter.all;
                    });
                  },
                ),
                const SizedBox(height: 20),
                if (detailDiscovery.showFilteredEmpty)
                  const _BillDetailFilteredEmpty()
                else ...[
                  if (detailDiscovery.shouldShowItems) ...[
                    _BillItems(items: detailDiscovery.items),
                    const SizedBox(height: 20),
                  ],
                  if (detailDiscovery.shouldShowParticipants) ...[
                    _BillParticipants(
                      participants: detailDiscovery.participants,
                      currentUserProfileId: widget.currentUserProfileId,
                      participantDisplayNames: _participantDisplayNames,
                      participantDisplayIndexes:
                          detailDiscovery.participantDisplayIndexes,
                    ),
                    const SizedBox(height: 20),
                  ],
                  if (detailDiscovery.shouldShowPayers) ...[
                    _BillPayers(payers: detailDiscovery.payers),
                    const SizedBox(height: 20),
                  ],
                  if (detailDiscovery.shouldShowAdjustments)
                    _BillAdjustments(adjustments: detailDiscovery.adjustments),
                ],
                if (widget.attachmentRepository != null) ...[
                  const SizedBox(height: 20),
                  BillAttachmentSection(
                    keyPrefix: 'group-bill-attachments',
                    reloadRevision: _attachmentReloadRevision,
                    route: SettleoraBillAttachmentRoute.group(
                      groupId: widget.groupId,
                      billId: bill.id,
                    ),
                    repository: widget.attachmentRepository!,
                    fileInput: widget.attachmentFileInput,
                    receiptOcrReviewRepository:
                        widget.receiptOcrReviewRepository,
                  ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _BillSummaryTile extends StatelessWidget {
  const _BillSummaryTile({
    required this.bill,
    required this.syncItem,
    required this.hasOpenOperation,
    required this.isBusy,
    required this.archiveButtonKey,
    required this.restoreButtonKey,
    required this.onTap,
    required this.onQueue,
  });

  final SettleoraBillSummary bill;
  final SettleoraSyncQueueItem? syncItem;
  final bool hasOpenOperation;
  final bool isBusy;
  final Key archiveButtonKey;
  final Key restoreButtonKey;
  final VoidCallback onTap;
  final VoidCallback onQueue;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;
    final syncItem = this.syncItem;
    final actionTooltip = bill.isArchived ? 'Queue restore' : 'Queue archive';
    final actionIcon = bill.isArchived
        ? Icons.unarchive_outlined
        : Icons.archive_outlined;
    final nextStepLabel = _personalBillNextStepLabel(bill);
    final needsReview = _billNeedsReview(bill);

    return Semantics(
      container: true,
      button: !bill.isArchived,
      label:
          '${bill.displayName}, ${_money(bill.totalAmount, bill.totalCurrency)}, ${settleoraBillStatusLabel(bill.status)}',
      child: AppCard(
        color: needsReview ? colors.warningSoft : colors.surface,
        padding: EdgeInsets.zero,
        child: Material(
          type: MaterialType.transparency,
          child: ListTile(
            enabled: !bill.isArchived,
            onTap: bill.isArchived ? null : onTap,
            contentPadding: const EdgeInsets.all(SettleoraSpacing.md),
            title: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            bill.displayName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            bill.billDate,
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(color: colors.textMuted),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          _money(bill.totalAmount, bill.totalCurrency),
                          style: Theme.of(context).textTheme.titleMedium,
                          textAlign: TextAlign.end,
                        ),
                        const SizedBox(height: 6),
                        StatusChip(
                          label: settleoraBillStatusLabel(bill.status),
                          variant: _billStatusVariant(bill.status),
                          size: StatusChipSize.small,
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    StatusChip(
                      label: 'Personal',
                      icon: Icons.person_outline,
                      variant: StatusChipVariant.info,
                      size: StatusChipSize.small,
                    ),
                    StatusChip(
                      label: _billCountSummary(bill),
                      icon: Icons.group_outlined,
                      size: StatusChipSize.small,
                    ),
                    StatusChip(
                      label: settleoraBillArchiveStateLabel(bill.archiveState),
                      icon: bill.isArchived
                          ? Icons.inventory_2_outlined
                          : Icons.check_circle_outline,
                      variant: bill.isArchived
                          ? StatusChipVariant.neutral
                          : StatusChipVariant.success,
                      size: StatusChipSize.small,
                    ),
                    StatusChip(
                      label: settleoraBillReconciliationStatusLabel(
                        bill.reconciliationStatus,
                      ),
                      icon: Icons.fact_check_outlined,
                      variant: StatusChipVariant.neutral,
                      size: StatusChipSize.small,
                    ),
                    if (syncItem != null)
                      StatusChip(
                        label:
                            '${settleoraBillSyncOperationLabel(syncItem)} - ${settleoraBillSyncStateLabel(syncItem)}',
                        icon: _syncIcon(syncItem.state),
                        variant:
                            syncItem.state ==
                                SettleoraSyncQueueItemStateValues.conflict
                            ? StatusChipVariant.warning
                            : StatusChipVariant.info,
                        size: StatusChipSize.small,
                      ),
                  ],
                ),
                if (syncItem?.safeMessage != null) ...[
                  const SizedBox(height: 10),
                  Text(syncItem!.safeMessage!),
                ],
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        nextStepLabel,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: colors.textMuted,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton(
                      key: bill.isArchived
                          ? restoreButtonKey
                          : archiveButtonKey,
                      tooltip: actionTooltip,
                      onPressed: isBusy || hasOpenOperation ? null : onQueue,
                      icon: isBusy
                          ? const SizedBox.square(
                              dimension: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Icon(actionIcon),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ReadOnlyBillSummaryTile extends StatelessWidget {
  const _ReadOnlyBillSummaryTile({
    required this.bill,
    required this.onTap,
    this.currentUserProfileId,
    this.participantDisplayNames = const {},
  });

  final SettleoraBillSummary bill;
  final VoidCallback onTap;
  final String? currentUserProfileId;
  final Map<String, String> participantDisplayNames;

  @override
  Widget build(BuildContext context) {
    final participantSummary = _GroupBillListParticipantSummary(
      bill: bill,
      currentUserProfileId: currentUserProfileId,
      participantDisplayNames: participantDisplayNames,
    );

    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListTile(
        onTap: onTap,
        title: Text(
          bill.displayName,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${bill.billDate} - ${_money(bill.totalAmount, bill.totalCurrency)}',
              ),
              const SizedBox(height: 4),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  _SoftChip(
                    label: settleoraBillStatusLabel(bill.status),
                    icon: Icons.assignment_outlined,
                  ),
                  _SoftChip(
                    label: settleoraBillArchiveStateLabel(bill.archiveState),
                    icon: bill.isArchived
                        ? Icons.inventory_2_outlined
                        : Icons.check_circle_outline,
                  ),
                  if (participantSummary.currentUserLabel != null)
                    _SoftChip(
                      label: participantSummary.currentUserLabel!,
                      icon: participantSummary.currentUserIcon,
                    ),
                  if (participantSummary.participantCountLabel != null)
                    _SoftChip(
                      label: participantSummary.participantCountLabel!,
                      icon: Icons.group_outlined,
                    ),
                  if (participantSummary.rejectedLabel != null)
                    _SoftChip(
                      label: participantSummary.rejectedLabel!,
                      icon: Icons.report_problem_outlined,
                    ),
                ],
              ),
            ],
          ),
        ),
        trailing: const Icon(Icons.chevron_right),
      ),
    );
  }
}

class _GroupBillListParticipantSummary {
  const _GroupBillListParticipantSummary({
    required this.bill,
    required this.currentUserProfileId,
    required this.participantDisplayNames,
  });

  final SettleoraBillSummary bill;
  final String? currentUserProfileId;
  final Map<String, String> participantDisplayNames;

  String? get currentUserLabel {
    final participant = _currentParticipant();
    if (participant == null) {
      return null;
    }

    return switch (participant.status) {
      SettleoraBillParticipantStatusValues.pendingAcceptance
          when _billNeedsCurrentUserResponse(bill) =>
        'Needs your response',
      SettleoraBillParticipantStatusValues.accepted => 'You accepted',
      SettleoraBillParticipantStatusValues.rejected => 'You rejected',
      _ => null,
    };
  }

  IconData get currentUserIcon {
    final participant = _currentParticipant();
    return switch (participant?.status) {
      SettleoraBillParticipantStatusValues.pendingAcceptance =>
        Icons.priority_high_outlined,
      SettleoraBillParticipantStatusValues.accepted =>
        Icons.check_circle_outline,
      SettleoraBillParticipantStatusValues.rejected => Icons.cancel_outlined,
      _ => Icons.person_outline,
    };
  }

  String? get participantCountLabel {
    if (bill.participants.isEmpty) {
      return null;
    }

    final pending = _statusCount(
      SettleoraBillParticipantStatusValues.pendingAcceptance,
    );
    final accepted = _statusCount(
      SettleoraBillParticipantStatusValues.accepted,
    );
    final rejected = _statusCount(
      SettleoraBillParticipantStatusValues.rejected,
    );

    return '$pending pending - $accepted accepted - $rejected rejected';
  }

  String? get rejectedLabel {
    if (bill.participants.isEmpty) {
      return null;
    }

    final labels = <String>[];
    for (var index = 0; index < bill.participants.length; index += 1) {
      final participant = bill.participants[index];
      if (participant.status != SettleoraBillParticipantStatusValues.rejected) {
        continue;
      }

      labels.add(
        _participantDisplayLabel(
          index: index,
          participant: participant,
          currentUserProfileId: currentUserProfileId,
          participantDisplayNames: participantDisplayNames,
          includeRejectionReason: false,
        ),
      );
    }

    if (labels.isEmpty) {
      return null;
    }

    if (labels.length <= 2) {
      return 'Rejected: ${labels.join(', ')}';
    }

    return '${labels.length} rejected participants';
  }

  SettleoraBillParticipant? _currentParticipant() {
    return _currentBillParticipant(bill, currentUserProfileId);
  }

  int _statusCount(SettleoraBillParticipantStatus status) {
    return bill.participants
        .where((participant) => participant.status == status)
        .length;
  }
}

class _PendingRevisionBanner extends StatelessWidget {
  const _PendingRevisionBanner({required this.revision, required this.onOpen});

  final SettleoraBillRevision revision;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final impact = revision.reviewContext.viewerFinancialImpact;
    final payerImpact = impact.payerImpact;
    final requiresPayerConfirmation =
        payerImpact?.requiresPayerConfirmation ?? false;

    return DecoratedBox(
      key: const Key('bill-detail-pending-revision-banner'),
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.primary),
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
                const Icon(Icons.rate_review_outlined),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Pending revision review',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${settleoraBillRevisionStatusLabel(revision.status)} - ${impact.affectedByRevision ? 'Your share changed' : 'No direct impact'}',
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                _SoftChip(
                  label: _money(revision.totalAmount, revision.totalCurrency),
                  icon: Icons.payments_outlined,
                ),
                if (requiresPayerConfirmation)
                  const _SoftChip(
                    label: 'Payer confirmation required',
                    icon: Icons.verified_user_outlined,
                  ),
              ],
            ),
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton.icon(
                key: const Key('bill-detail-open-revision-review'),
                onPressed: onOpen,
                icon: const Icon(Icons.chevron_right),
                label: const Text('Review revision'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CreateRevisionAction extends StatelessWidget {
  const _CreateRevisionAction({
    super.key,
    required this.buttonKey,
    required this.isLoading,
    required this.onPressed,
  });

  final Key buttonKey;
  final bool isLoading;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            const Icon(Icons.edit_note_outlined),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Revision proposal',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            FilledButton.icon(
              key: buttonKey,
              onPressed: isLoading ? null : onPressed,
              icon: isLoading
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.add),
              label: const Text('Propose change'),
            ),
          ],
        ),
      ),
    );
  }
}

class _GroupBillAcknowledgementActions extends StatelessWidget {
  const _GroupBillAcknowledgementActions({
    required this.isBusy,
    required this.failure,
    required this.onAccept,
    required this.onReject,
  });

  final bool isBusy;
  final SettleoraBillFailure? failure;
  final VoidCallback onAccept;
  final VoidCallback onReject;

  @override
  Widget build(BuildContext context) {
    final failure = this.failure;

    return DecoratedBox(
      key: const Key('group-bill-acknowledgement-actions'),
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(Icons.verified_user_outlined),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Your share needs review',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
              ],
            ),
            if (failure != null) ...[
              const SizedBox(height: 10),
              Text(
                failure.message,
                key: const Key('group-bill-acknowledgement-failure'),
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            const SizedBox(height: 12),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              alignment: WrapAlignment.end,
              children: [
                OutlinedButton.icon(
                  key: const Key('group-bill-reject-share'),
                  onPressed: isBusy ? null : onReject,
                  icon: const Icon(Icons.close),
                  label: const Text('Reject'),
                ),
                FilledButton.icon(
                  key: const Key('group-bill-accept-share'),
                  onPressed: isBusy ? null : onAccept,
                  icon: isBusy
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.check),
                  label: const Text('Accept'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _GroupBillSharePanel extends StatelessWidget {
  const _GroupBillSharePanel({
    required this.bill,
    required this.currentUserProfileId,
    required this.participantDisplayNames,
  });

  final SettleoraBillDetail bill;
  final String? currentUserProfileId;
  final Map<String, String> participantDisplayNames;

  @override
  Widget build(BuildContext context) {
    final participant = _currentBillDetailParticipant(
      bill,
      currentUserProfileId,
    );
    if (participant == null) {
      return const SizedBox.shrink();
    }

    final accepted =
        participant.status == SettleoraBillParticipantStatusValues.accepted;

    return AppCard(
      key: const Key('group-bill-current-share-panel'),
      color: accepted
          ? context.settleoraColors.successSoft
          : context.settleoraColors.surface,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                accepted
                    ? Icons.check_circle_outline
                    : Icons.account_balance_wallet_outlined,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      accepted ? 'Accepted share' : 'Your portion',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      accepted
                          ? 'Acknowledgement is complete. Settlement remains a separate action.'
                          : 'Review this server-calculated participant share before acknowledgement.',
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Text(
                _money(
                  participant.resolvedShareAmount,
                  participant.resolvedShareCurrency,
                ),
                style: Theme.of(context).textTheme.titleMedium,
                textAlign: TextAlign.end,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              StatusChip(
                label: settleoraBillParticipantStatusLabel(participant.status),
                variant: accepted
                    ? StatusChipVariant.success
                    : StatusChipVariant.warning,
                size: StatusChipSize.small,
              ),
              StatusChip(
                label: _pluralCount(bill.items.length, 'assigned item'),
                icon: Icons.format_list_bulleted,
                variant: StatusChipVariant.neutral,
                size: StatusChipSize.small,
              ),
              if (bill.payers.isNotEmpty)
                StatusChip(
                  label: _pluralCount(bill.payers.length, 'payer'),
                  icon: Icons.payments_outlined,
                  variant: StatusChipVariant.info,
                  size: StatusChipSize.small,
                ),
            ],
          ),
          const SizedBox(height: 12),
          _KeyValueText(
            label: 'Payer summary',
            value: bill.payers.isEmpty
                ? 'No payer rows visible'
                : bill.payers
                      .map((payer) => _money(payer.amount, payer.currency))
                      .join(', '),
          ),
          _KeyValueText(
            label: 'Assigned items',
            value: bill.items.isEmpty
                ? 'No items visible'
                : bill.items.map((item) => item.name).join(', '),
          ),
        ],
      ),
    );
  }
}

class _GroupBillNextStepPanel extends StatelessWidget {
  const _GroupBillNextStepPanel({
    required this.bill,
    required this.currentUserProfileId,
  });

  final SettleoraBillDetail bill;
  final String? currentUserProfileId;

  @override
  Widget build(BuildContext context) {
    final guidance = _groupBillNextStepGuidance(bill, currentUserProfileId);

    return DecoratedBox(
      key: const Key('group-bill-next-step'),
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(guidance.icon),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    guidance.title,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 4),
                  Text(guidance.message),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _GroupBillNextStepGuidance {
  const _GroupBillNextStepGuidance({
    required this.title,
    required this.message,
    required this.icon,
  });

  final String title;
  final String message;
  final IconData icon;
}

class _CreateRevisionFailureBanner extends StatelessWidget {
  const _CreateRevisionFailureBanner({required this.failure});

  final SettleoraBillRevisionFailure failure;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      key: const Key('bill-detail-propose-change-failure'),
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.error),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.info_outline),
            const SizedBox(width: 10),
            Expanded(child: Text('${failure.title}: ${failure.message}')),
          ],
        ),
      ),
    );
  }
}

class _RevisionUnavailableBanner extends StatelessWidget {
  const _RevisionUnavailableBanner({required this.failure});

  final SettleoraBillRevisionFailure failure;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.info_outline),
            const SizedBox(width: 10),
            Expanded(child: Text('${failure.title}: ${failure.message}')),
          ],
        ),
      ),
    );
  }
}

class _GroupBillContext extends StatelessWidget {
  const _GroupBillContext({required this.groupName});

  final String groupName;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.only(top: 2),
          child: Icon(Icons.groups_outlined),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _safeGroupName(groupName),
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 4),
              Text(
                'Group bills',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

enum _BillDetailFilter {
  all('All'),
  items('Items'),
  participants('Participants'),
  payers('Payers'),
  adjustments('Adjustments'),
  needsResponse('Needs response'),
  rejected('Rejected');

  const _BillDetailFilter(this.label);

  final String label;
}

class _BillDetailDiscoverySnapshot {
  const _BillDetailDiscoverySnapshot({
    required this.items,
    required this.participants,
    required this.payers,
    required this.adjustments,
    required this.loadedCount,
    required this.visibleCount,
    required this.selectedFilter,
    required this.hasQuery,
    required this.participantDisplayIndexes,
  });

  factory _BillDetailDiscoverySnapshot.fromBill(
    SettleoraBillDetail bill, {
    required String searchQuery,
    required _BillDetailFilter selectedFilter,
    String? currentUserProfileId,
    Map<String, String> participantDisplayNames = const {},
  }) {
    final query = searchQuery.trim().toLowerCase();
    final hasQuery = query.isNotEmpty;
    final includeItems =
        selectedFilter == _BillDetailFilter.all ||
        selectedFilter == _BillDetailFilter.items;
    final includeParticipants =
        selectedFilter == _BillDetailFilter.all ||
        selectedFilter == _BillDetailFilter.participants ||
        selectedFilter == _BillDetailFilter.needsResponse ||
        selectedFilter == _BillDetailFilter.rejected;
    final includePayers =
        selectedFilter == _BillDetailFilter.all ||
        selectedFilter == _BillDetailFilter.payers;
    final includeAdjustments =
        selectedFilter == _BillDetailFilter.all ||
        selectedFilter == _BillDetailFilter.adjustments;

    final items = includeItems
        ? bill.items
              .where((item) => !hasQuery || _billDetailItemMatches(item, query))
              .toList(growable: false)
        : const <SettleoraBillItem>[];
    final participants = includeParticipants
        ? [
            for (var index = 0; index < bill.participants.length; index += 1)
              if (_participantMatchesDetailFilter(
                    bill.participants[index],
                    selectedFilter,
                  ) &&
                  (!hasQuery ||
                      _billDetailParticipantMatches(
                        bill.participants[index],
                        query,
                        index: index,
                        currentUserProfileId: currentUserProfileId,
                        participantDisplayNames: participantDisplayNames,
                      )))
                bill.participants[index],
          ]
        : const <SettleoraBillParticipant>[];
    final participantDisplayIndexes = {
      for (var index = 0; index < bill.participants.length; index += 1)
        if (bill.participants[index].userProfileId.trim().isNotEmpty)
          bill.participants[index].userProfileId.trim(): index,
    };
    final payers = includePayers
        ? [
            for (var index = 0; index < bill.payers.length; index += 1)
              if (!hasQuery ||
                  _billDetailPayerMatches(bill.payers[index], query, index))
                bill.payers[index],
          ]
        : const <SettleoraBillPayer>[];
    final adjustments = includeAdjustments
        ? bill.adjustments
              .where(
                (adjustment) =>
                    !hasQuery ||
                    _billDetailAdjustmentMatches(adjustment, query),
              )
              .toList(growable: false)
        : const <SettleoraBillAdjustment>[];

    return _BillDetailDiscoverySnapshot(
      items: items,
      participants: participants,
      payers: payers,
      adjustments: adjustments,
      loadedCount:
          bill.items.length +
          bill.participants.length +
          bill.payers.length +
          bill.adjustments.length,
      visibleCount:
          items.length +
          participants.length +
          payers.length +
          adjustments.length,
      selectedFilter: selectedFilter,
      hasQuery: hasQuery,
      participantDisplayIndexes: participantDisplayIndexes,
    );
  }

  final List<SettleoraBillItem> items;
  final List<SettleoraBillParticipant> participants;
  final List<SettleoraBillPayer> payers;
  final List<SettleoraBillAdjustment> adjustments;
  final int loadedCount;
  final int visibleCount;
  final _BillDetailFilter selectedFilter;
  final bool hasQuery;
  final Map<String, int> participantDisplayIndexes;

  bool get hasActiveFilter =>
      hasQuery || selectedFilter != _BillDetailFilter.all;

  bool get showFilteredEmpty =>
      loadedCount > 0 && hasActiveFilter && visibleCount == 0;

  bool get shouldShowItems =>
      selectedFilter == _BillDetailFilter.all ||
      selectedFilter == _BillDetailFilter.items;

  bool get shouldShowParticipants =>
      selectedFilter == _BillDetailFilter.all ||
      selectedFilter == _BillDetailFilter.participants ||
      selectedFilter == _BillDetailFilter.needsResponse ||
      selectedFilter == _BillDetailFilter.rejected;

  bool get shouldShowPayers =>
      selectedFilter == _BillDetailFilter.all ||
      selectedFilter == _BillDetailFilter.payers;

  bool get shouldShowAdjustments =>
      selectedFilter == _BillDetailFilter.all ||
      selectedFilter == _BillDetailFilter.adjustments;
}

class _BillDetailDiscoveryControls extends StatelessWidget {
  const _BillDetailDiscoveryControls({
    required this.searchController,
    required this.selectedFilter,
    required this.loadedCount,
    required this.visibleCount,
    required this.onSearchChanged,
    required this.onFilterSelected,
    required this.onClear,
  });

  final TextEditingController searchController;
  final _BillDetailFilter selectedFilter;
  final int loadedCount;
  final int visibleCount;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<_BillDetailFilter> onFilterSelected;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final hasFilters =
        searchController.text.trim().isNotEmpty ||
        selectedFilter != _BillDetailFilter.all;

    return _Section(
      title: 'Find rows',
      children: [
        TextField(
          key: const Key('bill-detail-search'),
          controller: searchController,
          onChanged: onSearchChanged,
          textInputAction: TextInputAction.search,
          decoration: const InputDecoration(
            labelText: 'Search detail rows',
            prefixIcon: Icon(Icons.search),
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final filter in _BillDetailFilter.values)
              FilterChip(
                key: ValueKey('bill-detail-filter-${filter.name}'),
                label: Text(filter.label),
                selected: selectedFilter == filter,
                onSelected: (_) => onFilterSelected(filter),
              ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: Text(
                '$visibleCount of $loadedCount loaded detail rows visible.',
                key: const Key('bill-detail-visible-count'),
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ),
            TextButton.icon(
              key: const Key('bill-detail-clear-filters'),
              onPressed: hasFilters ? onClear : null,
              icon: const Icon(Icons.clear),
              label: const Text('Clear'),
            ),
          ],
        ),
        if (hasFilters) ...[
          const SizedBox(height: 6),
          Text(
            'Filtered rows are hidden locally only. Clear filters to review every loaded row before responding.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ],
    );
  }
}

class _BillDetailFilteredEmpty extends StatelessWidget {
  const _BillDetailFilteredEmpty();

  @override
  Widget build(BuildContext context) {
    return const _StatePanel(
      icon: Icons.search_off,
      title: 'No matching detail rows',
      message: 'No loaded bill rows match these local filters.',
      compact: true,
    );
  }
}

class _BillDetailHeader extends StatelessWidget {
  const _BillDetailHeader({required this.bill});

  final SettleoraBillDetail bill;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;

    return AppCard(
      padding: const EdgeInsets.all(SettleoraSpacing.lg),
      color: _billDetailNeedsReview(bill) ? colors.warningSoft : colors.surface,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  bill.displayName,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              const SizedBox(width: 12),
              Text(
                _money(bill.totalAmount, bill.totalCurrency),
                style: Theme.of(context).textTheme.titleLarge,
                textAlign: TextAlign.end,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              StatusChip(
                label: settleoraBillStatusLabel(bill.status),
                variant: _billStatusVariant(bill.status),
                icon: Icons.assignment_outlined,
                size: StatusChipSize.small,
              ),
              StatusChip(
                label: bill.billDate,
                icon: Icons.calendar_today_outlined,
                variant: StatusChipVariant.neutral,
                size: StatusChipSize.small,
              ),
              StatusChip(
                label: settleoraBillReconciliationStatusLabel(
                  bill.reconciliationStatus,
                ),
                icon: Icons.fact_check_outlined,
                variant: StatusChipVariant.info,
                size: StatusChipSize.small,
              ),
            ],
          ),
          if (bill.reconciliationNote != null) ...[
            const SizedBox(height: 12),
            Text(bill.reconciliationNote!),
          ],
        ],
      ),
    );
  }
}

class _BillItems extends StatelessWidget {
  const _BillItems({required this.items});

  final List<SettleoraBillItem> items;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return const _StatePanel(
        icon: Icons.format_list_bulleted,
        title: 'No items',
        message: 'This bill has no visible items.',
        compact: true,
      );
    }

    final sorted = [...items]
      ..sort((left, right) => left.sortOrder.compareTo(right.sortOrder));

    return _Section(
      title: 'Items',
      children: [
        for (final item in sorted)
          _BillItemRow(
            name: item.name,
            amount: _money(item.amount, item.currency),
            note: item.note,
          ),
      ],
    );
  }
}

class _BillItemRow extends StatelessWidget {
  const _BillItemRow({required this.name, required this.amount, this.note});

  final String name;
  final String amount;
  final String? note;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: Theme.of(context).textTheme.titleSmall),
                if (note != null && note!.trim().isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    note!,
                    style: Theme.of(
                      context,
                    ).textTheme.bodySmall?.copyWith(color: colors.textMuted),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 12),
          Text(
            amount,
            style: Theme.of(context).textTheme.titleSmall,
            textAlign: TextAlign.end,
          ),
        ],
      ),
    );
  }
}

class _BillParticipants extends StatelessWidget {
  const _BillParticipants({
    required this.participants,
    this.currentUserProfileId,
    this.participantDisplayNames = const {},
    this.participantDisplayIndexes = const {},
  });

  final List<SettleoraBillParticipant> participants;
  final String? currentUserProfileId;
  final Map<String, String> participantDisplayNames;
  final Map<String, int> participantDisplayIndexes;

  @override
  Widget build(BuildContext context) {
    if (participants.isEmpty) {
      return const _StatePanel(
        icon: Icons.group_outlined,
        title: 'No participants',
        message: 'No participant rows are visible for this bill.',
        compact: true,
      );
    }

    return _Section(
      title: 'Participants',
      children: [
        for (var index = 0; index < participants.length; index += 1)
          _KeyValueText(
            label: _participantDisplayLabel(
              index:
                  participantDisplayIndexes[participants[index].userProfileId
                      .trim()] ??
                  index,
              participant: participants[index],
              currentUserProfileId: currentUserProfileId,
              participantDisplayNames: participantDisplayNames,
            ),
            value:
                '${_money(participants[index].resolvedShareAmount, participants[index].resolvedShareCurrency)} - ${settleoraBillParticipantStatusLabel(participants[index].status)}',
          ),
      ],
    );
  }
}

class _GroupBillParticipantStatusSummary extends StatelessWidget {
  const _GroupBillParticipantStatusSummary({
    required this.participants,
    required this.currentUserProfileId,
    this.participantDisplayNames = const {},
  });

  final List<SettleoraBillParticipant> participants;
  final String? currentUserProfileId;
  final Map<String, String> participantDisplayNames;

  @override
  Widget build(BuildContext context) {
    if (participants.isEmpty) {
      return const SizedBox.shrink();
    }

    final currentParticipant = _currentParticipant();

    return _Section(
      title: 'Participant status',
      children: [
        if (currentParticipant != null)
          _KeyValueText(
            key: const Key('group-bill-current-participant-status'),
            label: 'Your status',
            value: _participantStatusValue(currentParticipant),
          ),
        _KeyValueText(
          key: const Key('group-bill-pending-participants'),
          label: 'Pending acceptance',
          value: _participantsForStatus(
            SettleoraBillParticipantStatusValues.pendingAcceptance,
          ),
        ),
        _KeyValueText(
          key: const Key('group-bill-accepted-participants'),
          label: 'Accepted',
          value: _participantsForStatus(
            SettleoraBillParticipantStatusValues.accepted,
          ),
        ),
        _KeyValueText(
          key: const Key('group-bill-rejected-participants'),
          label: 'Rejected',
          value: _participantsForStatus(
            SettleoraBillParticipantStatusValues.rejected,
          ),
        ),
      ],
    );
  }

  SettleoraBillParticipant? _currentParticipant() {
    final trimmed = currentUserProfileId?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      return null;
    }

    for (final participant in participants) {
      if (participant.userProfileId == trimmed) {
        return participant;
      }
    }

    return null;
  }

  String _participantsForStatus(SettleoraBillParticipantStatus status) {
    final matching = <String>[];
    for (var index = 0; index < participants.length; index += 1) {
      final participant = participants[index];
      if (participant.status != status) {
        continue;
      }

      matching.add(_participantLabel(index, participant));
    }

    if (matching.isEmpty) {
      return 'None';
    }

    return matching.join(', ');
  }

  String _participantStatusValue(SettleoraBillParticipant participant) {
    final statusLabel = settleoraBillParticipantStatusLabel(participant.status);
    final reasonCode = participant.rejectionReasonCode;
    if (participant.status != SettleoraBillParticipantStatusValues.rejected ||
        reasonCode == null ||
        reasonCode.trim().isEmpty) {
      return statusLabel;
    }

    return '$statusLabel - ${settleoraBillParticipantRejectionReasonLabel(reasonCode)}';
  }

  String _participantLabel(int index, SettleoraBillParticipant participant) {
    return _participantDisplayLabel(
      index: index,
      participant: participant,
      currentUserProfileId: currentUserProfileId,
      participantDisplayNames: participantDisplayNames,
    );
  }
}

String _participantDisplayLabel({
  required int index,
  required SettleoraBillParticipant participant,
  String? currentUserProfileId,
  Map<String, String> participantDisplayNames = const {},
  bool includeRejectionReason = true,
}) {
  final participantProfileId = participant.userProfileId.trim();
  final knownName = participantDisplayNames[participantProfileId]?.trim();
  final fallbackLabel = 'Participant ${index + 1}';
  final isCurrent =
      participantProfileId.isNotEmpty &&
      participantProfileId == currentUserProfileId?.trim();
  final baseLabel = knownName == null || knownName.isEmpty
      ? fallbackLabel
      : knownName;
  final currentLabel = isCurrent ? '$baseLabel (you)' : baseLabel;
  final reasonCode = participant.rejectionReasonCode;
  if (!includeRejectionReason ||
      participant.status != SettleoraBillParticipantStatusValues.rejected ||
      reasonCode == null ||
      reasonCode.trim().isEmpty) {
    return currentLabel;
  }

  return '$currentLabel (${settleoraBillParticipantRejectionReasonLabel(reasonCode)})';
}

bool _participantMatchesDetailFilter(
  SettleoraBillParticipant participant,
  _BillDetailFilter selectedFilter,
) {
  return switch (selectedFilter) {
    _BillDetailFilter.needsResponse =>
      participant.status ==
          SettleoraBillParticipantStatusValues.pendingAcceptance,
    _BillDetailFilter.rejected =>
      participant.status == SettleoraBillParticipantStatusValues.rejected,
    _ => true,
  };
}

bool _billDetailItemMatches(SettleoraBillItem item, String query) {
  return _matchesQuery(query, [
    item.name,
    item.note,
    item.amount,
    item.currency,
    _money(item.amount, item.currency),
  ]);
}

bool _billDetailParticipantMatches(
  SettleoraBillParticipant participant,
  String query, {
  required int index,
  String? currentUserProfileId,
  Map<String, String> participantDisplayNames = const {},
}) {
  final label = _participantDisplayLabel(
    index: index,
    participant: participant,
    currentUserProfileId: currentUserProfileId,
    participantDisplayNames: participantDisplayNames,
  );

  return _matchesQuery(query, [
    label,
    participant.resolvedShareAmount,
    participant.resolvedShareCurrency,
    _money(participant.resolvedShareAmount, participant.resolvedShareCurrency),
    settleoraBillParticipantStatusLabel(participant.status),
    if (participant.rejectionReasonCode != null)
      settleoraBillParticipantRejectionReasonLabel(
        participant.rejectionReasonCode!,
      ),
  ]);
}

bool _billDetailPayerMatches(
  SettleoraBillPayer payer,
  String query,
  int index,
) {
  return _matchesQuery(query, [
    'Payer ${index + 1}',
    payer.amount,
    payer.currency,
    _money(payer.amount, payer.currency),
  ]);
}

bool _billDetailAdjustmentMatches(
  SettleoraBillAdjustment adjustment,
  String query,
) {
  return _matchesQuery(query, [
    _titleFromCode(adjustment.type),
    _titleFromCode(adjustment.direction),
    adjustment.amount,
    adjustment.currency,
    _money(adjustment.amount, adjustment.currency),
    adjustment.reasonNote,
  ]);
}

bool _matchesQuery(String query, Iterable<String?> values) {
  for (final value in values) {
    if (value == null) {
      continue;
    }

    if (value.toLowerCase().contains(query)) {
      return true;
    }
  }

  return false;
}

Map<String, String> _participantDisplayNamesFromMembers(
  Iterable<SettleoraGroupMember> members,
) {
  return {
    for (final member in members)
      if (member.userProfileId.trim().isNotEmpty &&
          member.safeDisplayName.trim().isNotEmpty)
        member.userProfileId.trim(): member.safeDisplayName.trim(),
  };
}

Map<String, String> _normalizeParticipantDisplayNames(Map<String, String> raw) {
  return {
    for (final entry in raw.entries)
      if (entry.key.trim().isNotEmpty && entry.value.trim().isNotEmpty)
        entry.key.trim(): entry.value.trim(),
  };
}

class _BillPayers extends StatelessWidget {
  const _BillPayers({required this.payers});

  final List<SettleoraBillPayer> payers;

  @override
  Widget build(BuildContext context) {
    if (payers.isEmpty) {
      return const _StatePanel(
        icon: Icons.payments_outlined,
        title: 'No payers',
        message: 'No payer rows are visible for this bill.',
        compact: true,
      );
    }

    return _Section(
      title: 'Payers',
      children: [
        for (var index = 0; index < payers.length; index += 1)
          _KeyValueText(
            label: 'Payer ${index + 1}',
            value: _money(payers[index].amount, payers[index].currency),
          ),
      ],
    );
  }
}

class _BillAdjustments extends StatelessWidget {
  const _BillAdjustments({required this.adjustments});

  final List<SettleoraBillAdjustment> adjustments;

  @override
  Widget build(BuildContext context) {
    if (adjustments.isEmpty) {
      return const _StatePanel(
        icon: Icons.tune_outlined,
        title: 'No adjustments',
        message: 'No tax, service charge, discount, or adjustment rows.',
        compact: true,
      );
    }

    final sorted = [...adjustments]
      ..sort((left, right) => left.sortOrder.compareTo(right.sortOrder));

    return _Section(
      title: 'Adjustments',
      children: [
        for (final adjustment in sorted)
          _KeyValueText(
            label: _titleFromCode(adjustment.type),
            value: _money(adjustment.amount, adjustment.currency),
          ),
      ],
    );
  }
}

class _SyncStatusPanel extends StatelessWidget {
  const _SyncStatusPanel({
    required this.snapshot,
    required this.isSyncing,
    required this.selectedFilter,
    required this.onSync,
    required this.onFilterSelected,
  });

  final SettleoraBillSyncSnapshot snapshot;
  final bool isSyncing;
  final _SyncQueueFilter selectedFilter;
  final VoidCallback onSync;
  final ValueChanged<_SyncQueueFilter> onFilterSelected;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      key: const Key('bill-sync-status-panel'),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  snapshot.conflictCount > 0
                      ? Icons.sync_problem_outlined
                      : Icons.sync_outlined,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Sync queue',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${snapshot.queuedCount + snapshot.syncingCount} pending, ${snapshot.failedCount} retry later, ${snapshot.conflictCount} needs review, ${snapshot.syncedCount} synced',
                      ),
                    ],
                  ),
                ),
                TextButton.icon(
                  key: const Key('bill-sync-panel-sync'),
                  onPressed: isSyncing ? null : onSync,
                  icon: isSyncing
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.sync_outlined),
                  label: const Text('Sync'),
                ),
              ],
            ),
            if (snapshot.hasAnyItems) ...[
              const SizedBox(height: 12),
              _SyncQueueDetailsSection(
                snapshot: snapshot,
                selectedFilter: selectedFilter,
                onFilterSelected: onFilterSelected,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

enum _SyncQueueFilter { all, pending, failed, conflict, synced }

extension _SyncQueueFilterText on _SyncQueueFilter {
  String get label {
    return switch (this) {
      _SyncQueueFilter.all => 'All',
      _SyncQueueFilter.pending => 'Pending',
      _SyncQueueFilter.failed => 'Failed',
      _SyncQueueFilter.conflict => 'Needs review',
      _SyncQueueFilter.synced => 'Synced',
    };
  }

  String labelWithCount(Iterable<SettleoraSyncQueueItem> items) {
    final count = items.where(matches).length;
    return '$label ($count)';
  }

  bool matches(SettleoraSyncQueueItem item) {
    return switch (this) {
      _SyncQueueFilter.all => true,
      _SyncQueueFilter.pending =>
        item.state == SettleoraSyncQueueItemStateValues.queued ||
            item.state == SettleoraSyncQueueItemStateValues.syncing,
      _SyncQueueFilter.failed =>
        item.state == SettleoraSyncQueueItemStateValues.failed,
      _SyncQueueFilter.conflict =>
        item.state == SettleoraSyncQueueItemStateValues.conflict,
      _SyncQueueFilter.synced =>
        item.state == SettleoraSyncQueueItemStateValues.synced,
    };
  }
}

class _SyncQueueDetailsSection extends StatelessWidget {
  const _SyncQueueDetailsSection({
    required this.snapshot,
    required this.selectedFilter,
    required this.onFilterSelected,
  });

  static const int _maxVisibleItems = 8;

  final SettleoraBillSyncSnapshot snapshot;
  final _SyncQueueFilter selectedFilter;
  final ValueChanged<_SyncQueueFilter> onFilterSelected;

  @override
  Widget build(BuildContext context) {
    final items = [...snapshot.items]
      ..sort((left, right) {
        final updatedCompare = right.updatedAtUtc.compareTo(left.updatedAtUtc);
        if (updatedCompare != 0) {
          return updatedCompare;
        }

        return right.createdAtUtc.compareTo(left.createdAtUtc);
      });
    final filteredItems = items
        .where(selectedFilter.matches)
        .take(_maxVisibleItems)
        .toList(growable: false);
    final matchingCount = items.where(selectedFilter.matches).length;

    return Column(
      key: const Key('bill-sync-queue-details'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final filter in _SyncQueueFilter.values)
              ChoiceChip(
                key: ValueKey('bill-sync-filter-${filter.name}'),
                selected: selectedFilter == filter,
                label: Text(filter.labelWithCount(items)),
                onSelected: (_) => onFilterSelected(filter),
              ),
          ],
        ),
        const SizedBox(height: 10),
        if (filteredItems.isEmpty)
          Text('No ${selectedFilter.label.toLowerCase()} queue items.')
        else
          for (var index = 0; index < filteredItems.length; index += 1) ...[
            if (index > 0) const SizedBox(height: 8),
            _SyncQueueItemTile(item: filteredItems[index]),
          ],
        if (matchingCount > filteredItems.length) ...[
          const SizedBox(height: 8),
          Text(
            'Showing ${filteredItems.length} of $matchingCount queue items.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ],
    );
  }
}

class _SyncQueueItemTile extends StatelessWidget {
  const _SyncQueueItemTile({required this.item});

  final SettleoraSyncQueueItem item;

  @override
  Widget build(BuildContext context) {
    final safeMessage = item.safeMessage?.trim();
    final safeErrorCode = item.safeErrorCode?.trim();

    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
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
                Icon(_syncIcon(item.state), size: 20),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Bill action',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                ),
                _SoftChip(
                  label: settleoraBillSyncStateLabel(item),
                  icon: _syncIcon(item.state),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                _SoftChip(
                  label: settleoraBillSyncOperationLabel(item),
                  icon: Icons.receipt_long_outlined,
                ),
                _SoftChip(
                  label: _syncAttemptLabel(item.attemptCount),
                  icon: Icons.repeat_outlined,
                ),
                if (item.lastAttemptAtUtc != null)
                  _SoftChip(
                    label:
                        'Last attempt ${_formatUtcMinute(item.lastAttemptAtUtc!)}',
                    icon: Icons.schedule_outlined,
                  ),
              ],
            ),
            if (safeErrorCode != null && safeErrorCode.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text('Error code: $safeErrorCode'),
            ],
            if (safeMessage != null && safeMessage.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(safeMessage),
            ],
          ],
        ),
      ),
    );
  }
}

String _syncAttemptLabel(int attemptCount) {
  if (attemptCount == 1) {
    return '1 attempt';
  }

  return '$attemptCount attempts';
}

String _formatUtcMinute(DateTime value) {
  final utc = value.toUtc();
  return '${utc.year.toString().padLeft(4, '0')}-'
      '${utc.month.toString().padLeft(2, '0')}-'
      '${utc.day.toString().padLeft(2, '0')} '
      '${utc.hour.toString().padLeft(2, '0')}:'
      '${utc.minute.toString().padLeft(2, '0')} UTC';
}

class _SyncNotice extends StatelessWidget {
  const _SyncNotice({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            const Icon(Icons.info_outline),
            const SizedBox(width: 10),
            Expanded(child: Text(message)),
          ],
        ),
      ),
    );
  }
}

class _FailurePanel extends StatelessWidget {
  const _FailurePanel({required this.failure, required this.onRetry});

  final SettleoraBillFailure failure;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return _StatePanel(
      icon: _failureIcon(failure.kind),
      title: failure.title,
      message: failure.message,
      action: OutlinedButton.icon(
        onPressed: onRetry,
        icon: const Icon(Icons.refresh),
        label: const Text('Retry'),
      ),
    );
  }
}

class _StatePanel extends StatelessWidget {
  const _StatePanel({
    required this.icon,
    required this.title,
    required this.message,
    this.action,
    this.compact = false,
  });

  final IconData icon;
  final String title;
  final String message;
  final Widget? action;
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
        if (action != null) ...[const SizedBox(height: 14), action!],
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

class _LoadingPanel extends StatelessWidget {
  const _LoadingPanel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(),
          const SizedBox(height: 14),
          Text(label),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          ...children,
        ],
      ),
    );
  }
}

class _KeyValueText extends StatelessWidget {
  const _KeyValueText({super.key, required this.label, required this.value});

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

class _SoftChip extends StatelessWidget {
  const _SoftChip({required this.label, required this.icon});

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

String _syncMessage(SettleoraSyncQueueFlushResult result) {
  if (result.sessionRequired) {
    return result.safeMessage ?? 'Sign in before syncing pending changes.';
  }

  if (result.processedCount == 0) {
    return 'No pending bill changes to sync.';
  }

  final parts = <String>[
    if (result.syncedCount > 0) '${result.syncedCount} synced',
    if (result.failedCount > 0) '${result.failedCount} failed',
    if (result.conflictCount > 0) '${result.conflictCount} needs review',
  ];

  return parts.isEmpty
      ? 'Sync finished.'
      : 'Sync finished: ${parts.join(', ')}.';
}

IconData _syncIcon(String state) {
  return switch (state) {
    SettleoraSyncQueueItemStateValues.queued => Icons.pending_actions_outlined,
    SettleoraSyncQueueItemStateValues.syncing => Icons.sync_outlined,
    SettleoraSyncQueueItemStateValues.synced => Icons.check_circle_outline,
    SettleoraSyncQueueItemStateValues.failed => Icons.cloud_off_outlined,
    SettleoraSyncQueueItemStateValues.conflict => Icons.sync_problem_outlined,
    _ => Icons.info_outline,
  };
}

IconData _failureIcon(SettleoraBillFailureKind kind) {
  return switch (kind) {
    SettleoraBillFailureKind.sessionRequired => Icons.lock_outline,
    SettleoraBillFailureKind.sessionExpired => Icons.lock_outline,
    SettleoraBillFailureKind.denied => Icons.no_accounts_outlined,
    SettleoraBillFailureKind.unavailable => Icons.visibility_off_outlined,
    SettleoraBillFailureKind.conflict => Icons.sync_problem_outlined,
    SettleoraBillFailureKind.validation => Icons.report_problem_outlined,
    SettleoraBillFailureKind.network => Icons.cloud_off_outlined,
    SettleoraBillFailureKind.server => Icons.error_outline,
  };
}

String _money(String amount, String currency) {
  return '$amount $currency';
}

String _billCountSummary(SettleoraBillSummary bill) {
  final parts = <String>[
    _pluralCount(bill.itemCount, 'item'),
    _pluralCount(bill.participantCount, 'participant'),
    _pluralCount(bill.payerCount, 'payer'),
  ];

  return parts.join(' - ');
}

bool _billNeedsReview(SettleoraBillSummary bill) {
  if (bill.isArchived) {
    return false;
  }

  final status = bill.status.trim().toLowerCase();
  return status == 'needs_review' ||
      status == 'pending_confirmation' ||
      status == 'rejected' ||
      status == 'disputed';
}

bool _billDetailNeedsReview(SettleoraBillDetail bill) {
  final summary = SettleoraBillSummary(
    id: bill.id,
    merchantName: bill.merchantName,
    billDate: bill.billDate,
    status: bill.status,
    reconciliationStatus: bill.reconciliationStatus,
    totalAmount: bill.totalAmount,
    totalCurrency: bill.totalCurrency,
    archiveState: SettleoraBillArchiveStateValues.active,
    itemCount: bill.items.length,
    participantCount: bill.participants.length,
    payerCount: bill.payers.length,
    createdAtUtc: bill.createdAtUtc,
    updatedAtUtc: bill.updatedAtUtc,
    participants: bill.participants,
    displayNameFallback: bill.displayNameFallback,
  );
  return _billNeedsReview(summary);
}

StatusChipVariant _billStatusVariant(String status) {
  return switch (status.trim().toLowerCase()) {
    'confirmed' || 'finalized' => StatusChipVariant.success,
    'needs_review' ||
    'pending_confirmation' ||
    'rejected' ||
    'disputed' => StatusChipVariant.warning,
    'cancelled' => StatusChipVariant.danger,
    'draft' => StatusChipVariant.info,
    _ => StatusChipVariant.neutral,
  };
}

String _pluralCount(int count, String singular) {
  return count == 1 ? '1 $singular' : '$count ${singular}s';
}

String _personalBillNextStepLabel(SettleoraBillSummary bill) {
  if (bill.isArchived) {
    return 'Restore to open details or update this bill.';
  }

  return switch (bill.status) {
    'draft' => 'Open to review details or add attachments.',
    'pending_confirmation' => 'Waiting for confirmation before final state.',
    'rejected' => 'Open to review the returned bill state.',
    'confirmed' => 'Confirmed bill. Settlement remains separate.',
    'finalized' => 'Finalized bill. Settlement remains separate.',
    'cancelled' => 'Cancelled bill. Details remain read-only here.',
    _ => 'Open for bill details.',
  };
}

String? _requiredField(String? value, String message) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return message;
  }

  return null;
}

String? _positiveMoneyAmountField(
  String? value, {
  required String requiredMessage,
}) {
  final requiredError = _requiredField(value, requiredMessage);
  if (requiredError != null) {
    return requiredError;
  }

  final trimmed = value!.trim();
  final decimalShape = RegExp(r'^\d+(?:\.\d+)?$');
  if (!decimalShape.hasMatch(trimmed)) {
    return 'Enter a valid positive amount.';
  }

  final hasNonZeroDigit = trimmed.contains(RegExp(r'[1-9]'));
  if (!hasNonZeroDigit) {
    return 'Enter an amount greater than zero.';
  }

  return null;
}

bool _isExactAmountSplitMethod(String value) =>
    value.trim().toLowerCase() == 'exact_amount';

bool _decimalAmountTotalsMatch(
  Iterable<String> expectedAmounts,
  Iterable<String> actualAmounts,
) {
  final expected = expectedAmounts
      .map(_parseExactDecimalAmount)
      .whereType<_ExactDecimalAmount>()
      .toList(growable: false);
  final actual = actualAmounts
      .map(_parseExactDecimalAmount)
      .whereType<_ExactDecimalAmount>()
      .toList(growable: false);
  if (expected.length != expectedAmounts.length ||
      actual.length != actualAmounts.length) {
    return false;
  }

  final scale = [
    ...expected.map((amount) => amount.scale),
    ...actual.map((amount) => amount.scale),
  ].fold<int>(0, (current, next) => next > current ? next : current);

  return _sumExactDecimals(expected, scale) == _sumExactDecimals(actual, scale);
}

_ExactDecimalAmount? _parseExactDecimalAmount(String value) {
  final trimmed = value.trim();
  final match = RegExp(r'^(\d+)(?:\.(\d+))?$').firstMatch(trimmed);
  if (match == null) {
    return null;
  }

  final whole = match.group(1)!;
  final fractional = match.group(2) ?? '';
  final digits = '$whole$fractional'.replaceFirst(RegExp(r'^0+(?=\d)'), '');
  return _ExactDecimalAmount(
    value: BigInt.parse(digits.isEmpty ? '0' : digits),
    scale: fractional.length,
  );
}

BigInt _sumExactDecimals(List<_ExactDecimalAmount> amounts, int scale) {
  return amounts.fold<BigInt>(
    BigInt.zero,
    (total, amount) =>
        total + amount.value * _bigIntPow10(scale - amount.scale),
  );
}

BigInt _bigIntPow10(int exponent) {
  var value = BigInt.one;
  for (var index = 0; index < exponent; index += 1) {
    value *= BigInt.from(10);
  }
  return value;
}

class _ExactDecimalAmount {
  const _ExactDecimalAmount({required this.value, required this.scale});

  final BigInt value;
  final int scale;
}

String? _currencyCodeField(String? value, {required String requiredMessage}) {
  final requiredError = _requiredField(value, requiredMessage);
  if (requiredError != null) {
    return requiredError;
  }

  final currency = value!.trim().toUpperCase();
  if (!RegExp(r'^[A-Z]{3}$').hasMatch(currency)) {
    return 'Use a 3-letter currency code such as USD.';
  }

  return null;
}

String _billAttachmentPurposeLabel(SettleoraBillAttachmentPurpose purpose) {
  return switch (purpose) {
    SettleoraBillAttachmentPurposeValues.receipt => 'Receipt',
    SettleoraBillAttachmentPurposeValues.supportingAttachment =>
      'Supporting attachment',
    _ => 'Attachment',
  };
}

String _billAttachmentPurposeKeySuffix(SettleoraBillAttachmentPurpose purpose) {
  return switch (purpose) {
    SettleoraBillAttachmentPurposeValues.receipt => 'receipt',
    SettleoraBillAttachmentPurposeValues.supportingAttachment => 'supporting',
    _ => 'attachment',
  };
}

List<SettleoraBillAttachmentPurpose>
_billAttachmentPurposeChoicesForContentType(String contentType) {
  final choices = <SettleoraBillAttachmentPurpose>[];
  if (SettleoraBillAttachmentContentTypeValues.receiptValues.contains(
    contentType,
  )) {
    choices.add(SettleoraBillAttachmentPurposeValues.receipt);
  }
  if (SettleoraBillAttachmentContentTypeValues.supportingAttachmentValues
      .contains(contentType)) {
    choices.add(SettleoraBillAttachmentPurposeValues.supportingAttachment);
  }

  return choices;
}

String? _allocationOrderError(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }

  final parsed = int.tryParse(trimmed);
  if (parsed == null || parsed < 0) {
    return 'Allocation order must be zero or greater.';
  }

  return null;
}

int? _parseAllocationOrder(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    return null;
  }

  return int.parse(trimmed);
}

SettleoraBillSummary _summaryFromCreatedDetail(SettleoraBillDetail bill) {
  return SettleoraBillSummary(
    id: bill.id,
    merchantName: bill.merchantName,
    billDate: bill.billDate,
    status: bill.status,
    reconciliationStatus: bill.reconciliationStatus,
    totalAmount: bill.totalAmount,
    totalCurrency: bill.totalCurrency,
    archiveState: SettleoraBillArchiveStateValues.active,
    itemCount: bill.items.length,
    participantCount: bill.participants.length,
    payerCount: bill.payers.length,
    createdAtUtc: bill.createdAtUtc,
    updatedAtUtc: bill.updatedAtUtc,
    participants: bill.participants,
    displayNameFallback: bill.displayNameFallback,
  );
}

bool _canShowCreateRevisionAction(
  SettleoraBillDetail bill,
  SettleoraBillRevisionRepository? repository,
) {
  return repository != null && bill.revisionCreationActions.canCreateRevision;
}

bool _canAcknowledgeCurrentParticipant(
  SettleoraBillDetail bill,
  String? currentUserProfileId,
) {
  final trimmedProfileId = currentUserProfileId?.trim();
  if (trimmedProfileId == null || trimmedProfileId.isEmpty) {
    return false;
  }

  return bill.status == 'pending_confirmation' &&
      bill.participants.any(
        (participant) =>
            participant.userProfileId == trimmedProfileId &&
            participant.status ==
                SettleoraBillParticipantStatusValues.pendingAcceptance,
      );
}

_GroupBillNextStepGuidance _groupBillNextStepGuidance(
  SettleoraBillDetail bill,
  String? currentUserProfileId,
) {
  final currentParticipant = _currentBillDetailParticipant(
    bill,
    currentUserProfileId,
  );

  if (currentParticipant == null) {
    return const _GroupBillNextStepGuidance(
      title: 'Review only',
      message:
          'No share is assigned to the current signed-in profile in this mobile view.',
      icon: Icons.visibility_outlined,
    );
  }

  if (_canAcknowledgeCurrentParticipant(bill, currentUserProfileId)) {
    return _GroupBillNextStepGuidance(
      title: 'Your response is needed',
      message:
          'Review your assigned share of ${_money(currentParticipant.resolvedShareAmount, currentParticipant.resolvedShareCurrency)}. Accept it or request a correction with a reason.',
      icon: Icons.priority_high_outlined,
    );
  }

  if (currentParticipant.status ==
      SettleoraBillParticipantStatusValues.accepted) {
    return const _GroupBillNextStepGuidance(
      title: 'You accepted this share',
      message:
          'No further acknowledgement is available in mobile. Settlement actions stay separate and server-authoritative.',
      icon: Icons.check_circle_outline,
    );
  }

  if (currentParticipant.status ==
      SettleoraBillParticipantStatusValues.rejected) {
    final reasonCode = currentParticipant.rejectionReasonCode;
    final reason = reasonCode == null || reasonCode.trim().isEmpty
        ? 'No reason was returned for this rejection.'
        : 'Reason: ${settleoraBillParticipantRejectionReasonLabel(reasonCode)}.';

    return _GroupBillNextStepGuidance(
      title: 'Correction requested',
      message:
          '$reason The creator can revise and resubmit the shared bill when server workflow allows it.',
      icon: Icons.report_problem_outlined,
    );
  }

  if (bill.status != 'pending_confirmation') {
    return _GroupBillNextStepGuidance(
      title: 'No response available',
      message:
          'This bill is ${settleoraBillStatusLabel(bill.status).toLowerCase()}, so mobile cannot accept or reject this share.',
      icon: Icons.info_outline,
    );
  }

  return _GroupBillNextStepGuidance(
    title: 'No response available',
    message:
        'Your share is ${settleoraBillParticipantStatusLabel(currentParticipant.status).toLowerCase()}, so there is no mobile acknowledgement action for it.',
    icon: Icons.info_outline,
  );
}

SettleoraBillParticipant? _currentBillDetailParticipant(
  SettleoraBillDetail bill,
  String? currentUserProfileId,
) {
  final trimmedProfileId = currentUserProfileId?.trim();
  if (trimmedProfileId == null || trimmedProfileId.isEmpty) {
    return null;
  }

  for (final participant in bill.participants) {
    if (participant.userProfileId.trim() == trimmedProfileId) {
      return participant;
    }
  }

  return null;
}

void _assertCanCreateRevision(SettleoraBillDetail bill) {
  if (bill.revisionCreationActions.canCreateRevision) {
    return;
  }

  throw const SettleoraBillRevisionFailure(
    kind: SettleoraBillRevisionFailureKind.conflict,
    message:
        'This bill can no longer accept a revision proposal. Review the refreshed bill before trying again.',
  );
}

SettleoraBillRevisionProposalSnapshot _proposalFromBillDetail(
  SettleoraBillDetail bill,
) {
  return SettleoraBillRevisionProposalSnapshot(
    totalAmount: bill.totalAmount,
    totalCurrency: bill.totalCurrency,
    participants: bill.participants
        .map(
          (participant) => SettleoraBillRevisionProposalParticipantRow(
            userProfileId: participant.userProfileId,
            resolvedShareAmount: participant.resolvedShareAmount,
            resolvedShareCurrency: participant.resolvedShareCurrency,
          ),
        )
        .toList(growable: false),
    payers: bill.payers
        .map(
          (payer) => SettleoraBillRevisionProposalPayerRow(
            userProfileId: payer.userProfileId,
            amount: payer.amount,
            currency: payer.currency,
          ),
        )
        .toList(growable: false),
  );
}

SettleoraBillRevisionFailure _createRevisionFailureFrom(Object error) {
  if (error is SettleoraBillRevisionFailure) {
    return error;
  }
  if (error is SettleoraBillFailure) {
    return SettleoraBillRevisionFailure(
      kind: _revisionFailureKindFromBillFailure(error.kind),
      message: error.message,
      statusCode: error.statusCode,
    );
  }

  return SettleoraBillRevisionFailure.from(error);
}

SettleoraBillRevisionFailureKind _revisionFailureKindFromBillFailure(
  SettleoraBillFailureKind kind,
) {
  return switch (kind) {
    SettleoraBillFailureKind.sessionRequired =>
      SettleoraBillRevisionFailureKind.sessionRequired,
    SettleoraBillFailureKind.sessionExpired =>
      SettleoraBillRevisionFailureKind.sessionExpired,
    SettleoraBillFailureKind.denied => SettleoraBillRevisionFailureKind.denied,
    SettleoraBillFailureKind.unavailable =>
      SettleoraBillRevisionFailureKind.unavailable,
    SettleoraBillFailureKind.conflict =>
      SettleoraBillRevisionFailureKind.conflict,
    SettleoraBillFailureKind.validation =>
      SettleoraBillRevisionFailureKind.validation,
    SettleoraBillFailureKind.network =>
      SettleoraBillRevisionFailureKind.network,
    SettleoraBillFailureKind.server => SettleoraBillRevisionFailureKind.server,
  };
}

Future<_PendingRevisionSnapshot> _loadPendingRevision(
  SettleoraBillRevisionRepository? repository,
  String billId,
) async {
  if (repository == null) {
    return const _PendingRevisionSnapshot();
  }

  try {
    final revisions = await repository.listBillRevisions(billId);
    final submitted =
        revisions
            .where(
              (revision) =>
                  revision.status ==
                  SettleoraBillRevisionStatusValues.submittedForReview,
            )
            .toList(growable: false)
          ..sort(
            (left, right) => right.updatedAtUtc.compareTo(left.updatedAtUtc),
          );
    return _PendingRevisionSnapshot(
      revision: submitted.isEmpty ? null : submitted.first,
    );
  } catch (error) {
    return _PendingRevisionSnapshot(
      failure: SettleoraBillRevisionFailure.from(error),
    );
  }
}

class _PendingRevisionSnapshot {
  const _PendingRevisionSnapshot({this.revision, this.failure});

  final SettleoraBillRevision? revision;
  final SettleoraBillRevisionFailure? failure;
}

String _safeGroupName(String groupName) {
  final trimmed = groupName.trim();
  if (trimmed.isEmpty) {
    return 'Group';
  }

  return trimmed;
}

String _titleFromCode(String code) {
  return code
      .split('_')
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}
