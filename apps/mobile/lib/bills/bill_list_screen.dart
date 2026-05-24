import 'package:flutter/material.dart';

import '../groups/group_repository.dart';
import '../receipt_ocr_review/receipt_ocr_review_repository.dart';
import '../receipt_ocr_review/receipt_ocr_review_screen.dart';
import '../sync/sync_queue.dart';
import '../sync/sync_queue_processor.dart';
import 'bill_attachment_file_input.dart';
import 'bill_attachment_repository.dart';
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
  bool _isLoading = true;
  bool _isSyncing = false;
  String? _busyBillId;
  List<SettleoraBillSummary> _bills = const [];
  SettleoraBillFailure? _failure;
  SettleoraBillSyncSnapshot? _syncSnapshot;
  String? _syncNotice;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
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
        builder: (_) =>
            SettleoraPersonalBillCreateScreen(repository: widget.repository),
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
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                children: [
                  if (snapshot != null)
                    _SyncStatusPanel(
                      snapshot: snapshot,
                      isSyncing: _isSyncing,
                      onSync: () => _flushQueue(),
                    ),
                  if (syncNotice != null) ...[
                    const SizedBox(height: 10),
                    _SyncNotice(message: syncNotice),
                  ],
                  if (_bills.isEmpty) ...[
                    const SizedBox(height: 56),
                    const _StatePanel(
                      icon: Icons.receipt_long_outlined,
                      title: 'No bills',
                      message:
                          'Personal bills visible to this account will appear here.',
                    ),
                  ] else ...[
                    const SizedBox(height: 12),
                    for (var index = 0; index < _bills.length; index += 1)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _BillSummaryTile(
                          bill: _bills[index],
                          syncItem: snapshot?.latestForBill(_bills[index].id),
                          hasOpenOperation:
                              snapshot?.hasOpenBillOperation(
                                _bills[index].id,
                              ) ??
                              false,
                          isBusy: _busyBillId == _bills[index].id,
                          archiveButtonKey: ValueKey('bill-archive-$index'),
                          restoreButtonKey: ValueKey('bill-restore-$index'),
                          onTap: () => _openBill(_bills[index]),
                          onQueue: () => _queueBillLifecycle(_bills[index]),
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
        key: const Key('bill-list-create'),
        onPressed: _isLoading ? null : _openCreateBill,
        icon: const Icon(Icons.add),
        label: const Text('Create bill'),
      ),
    );
  }
}

class SettleoraPersonalBillCreateScreen extends StatefulWidget {
  const SettleoraPersonalBillCreateScreen({
    super.key,
    required this.repository,
  });

  final SettleoraBillRepository repository;

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
  bool _isSaving = false;
  String? _itemListError;
  SettleoraBillFailure? _failure;

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

  Future<void> _save() async {
    setState(() {
      _failure = null;
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

      Navigator.of(context).pop(createdBill);
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

  @override
  Widget build(BuildContext context) {
    final failure = _failure;
    final itemListError = _itemListError;

    return Scaffold(
      appBar: AppBar(title: const Text('Create bill')),
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
                Text(
                  'Bill details',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  key: const Key('personal-bill-merchant-name'),
                  controller: _merchantController,
                  enabled: !_isSaving,
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(
                    labelText: 'Merchant name',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  key: const Key('personal-bill-date'),
                  controller: _billDateController,
                  enabled: !_isSaving,
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(
                    labelText: 'Bill date',
                    hintText: 'YYYY-MM-DD',
                    border: OutlineInputBorder(),
                  ),
                  validator: (value) =>
                      _requiredField(value, 'Enter a bill date.'),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  key: const Key('personal-bill-currency'),
                  controller: _currencyController,
                  enabled: !_isSaving,
                  textCapitalization: TextCapitalization.characters,
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(
                    labelText: 'Currency',
                    border: OutlineInputBorder(),
                  ),
                  validator: (value) =>
                      _requiredField(value, 'Enter a currency.'),
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
                  Text(
                    itemListError,
                    key: const Key('personal-bill-item-list-error'),
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ],
                const SizedBox(height: 10),
                for (var index = 0; index < _itemControllers.length; index += 1)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _PersonalBillCreateItemCard(
                      index: index,
                      controllers: _itemControllers[index],
                      isSaving: _isSaving,
                      onRemove: () => _removeItem(index),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: FilledButton.icon(
            key: const Key('personal-bill-save'),
            onPressed: _isSaving ? null : _save,
            icon: _isSaving
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.check),
            label: const Text('Save bill'),
          ),
        ),
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

class _PersonalBillCreateItemCard extends StatelessWidget {
  const _PersonalBillCreateItemCard({
    required this.index,
    required this.controllers,
    required this.isSaving,
    required this.onRemove,
  });

  final int index;
  final _PersonalBillCreateItemControllers controllers;
  final bool isSaving;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final itemNumber = index + 1;

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
              key: ValueKey('personal-bill-item-amount-$index'),
              controller: controllers.amount,
              enabled: !isSaving,
              keyboardType: TextInputType.number,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Amount',
                border: OutlineInputBorder(),
              ),
              validator: (value) =>
                  _requiredField(value, 'Enter an item amount.'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: ValueKey('personal-bill-item-currency-$index'),
              controller: controllers.currency,
              enabled: !isSaving,
              textCapitalization: TextCapitalization.characters,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Currency',
                border: OutlineInputBorder(),
              ),
              validator: (value) =>
                  _requiredField(value, 'Enter an item currency.'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: ValueKey('personal-bill-item-note-$index'),
              controller: controllers.note,
              enabled: !isSaving,
              textInputAction: TextInputAction.done,
              decoration: const InputDecoration(
                labelText: 'Note',
                border: OutlineInputBorder(),
              ),
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
    return DecoratedBox(
      key: bannerKey,
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

class SettleoraGroupBillListScreen extends StatefulWidget {
  const SettleoraGroupBillListScreen({
    super.key,
    required this.repository,
    required this.groupRepository,
    required this.groupId,
    required this.groupName,
    this.attachmentRepository,
    this.attachmentFileInput,
    this.receiptOcrReviewRepository,
    this.revisionRepository,
  });

  final SettleoraBillRepository repository;
  final SettleoraGroupRepository groupRepository;
  final String groupId;
  final String groupName;
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
  bool _isLoading = true;
  List<SettleoraBillSummary> _bills = const [];
  SettleoraBillFailure? _failure;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
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
      if (!mounted) {
        return;
      }

      setState(() {
        _bills = bills;
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
                  if (_bills.isEmpty) ...[
                    const SizedBox(height: 56),
                    _StatePanel(
                      icon: Icons.receipt_long_outlined,
                      title: 'No group bills',
                      message:
                          'Bills visible in ${_safeGroupName(widget.groupName)} will appear here.',
                    ),
                  ] else ...[
                    const SizedBox(height: 14),
                    for (var index = 0; index < _bills.length; index += 1)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _ReadOnlyBillSummaryTile(
                          bill: _bills[index],
                          onTap: () => _openBill(_bills[index]),
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
  });

  final SettleoraBillRepository billRepository;
  final SettleoraGroupRepository groupRepository;
  final String groupId;
  final String groupName;

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
  bool _isLoadingMembers = true;
  bool _isSaving = false;
  List<SettleoraGroupMember> _members = const [];
  SettleoraGroupFailure? _memberFailure;
  SettleoraBillFailure? _failure;
  String? _itemListError;

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
    });
  }

  void _addPayer() {
    setState(() {
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
    });
  }

  Future<void> _save() async {
    setState(() {
      _failure = null;
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

      Navigator.of(context).pop(createdBill);
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

  @override
  Widget build(BuildContext context) {
    final failure = _failure;
    final memberFailure = _memberFailure;
    final itemListError = _itemListError;

    return Scaffold(
      appBar: AppBar(title: const Text('Create group bill')),
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
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _GroupBillContext(groupName: widget.groupName),
                    if (failure != null) ...[
                      const SizedBox(height: 16),
                      _CreateBillFailureBanner(
                        failure: failure,
                        bannerKey: const Key('group-bill-create-failure'),
                      ),
                    ],
                    const SizedBox(height: 18),
                    Text(
                      'Bill details',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      key: const Key('group-bill-merchant-name'),
                      controller: _merchantController,
                      enabled: !_isSaving,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(
                        labelText: 'Merchant name',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      key: const Key('group-bill-date'),
                      controller: _billDateController,
                      enabled: !_isSaving,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(
                        labelText: 'Bill date',
                        hintText: 'YYYY-MM-DD',
                        border: OutlineInputBorder(),
                      ),
                      validator: (value) =>
                          _requiredField(value, 'Enter a bill date.'),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      key: const Key('group-bill-currency'),
                      controller: _currencyController,
                      enabled: !_isSaving,
                      textCapitalization: TextCapitalization.characters,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(
                        labelText: 'Currency',
                        border: OutlineInputBorder(),
                      ),
                      validator: (value) =>
                          _requiredField(value, 'Enter a currency.'),
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
                          key: const Key('group-bill-add-item'),
                          onPressed: _isSaving ? null : _addItem,
                          icon: const Icon(Icons.add),
                          label: const Text('Add item'),
                        ),
                      ],
                    ),
                    if (itemListError != null) ...[
                      const SizedBox(height: 6),
                      Text(
                        itemListError,
                        key: const Key('group-bill-item-list-error'),
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
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
                        padding: const EdgeInsets.only(bottom: 12),
                        child: _GroupBillCreateItemCard(
                          index: index,
                          controllers: _itemControllers[index],
                          members: _members,
                          isSaving: _isSaving,
                          onRemove: () => _removeItem(index),
                        ),
                      ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Payers',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                        ),
                        TextButton.icon(
                          key: const Key('group-bill-add-payer'),
                          onPressed: _isSaving ? null : _addPayer,
                          icon: const Icon(Icons.add),
                          label: const Text('Add payer'),
                        ),
                      ],
                    ),
                    if (_payerControllers.isEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          'No payer rows added.',
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurfaceVariant,
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
                          ),
                        ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
      bottomNavigationBar: memberFailure == null
          ? SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: FilledButton.icon(
                  key: const Key('group-bill-save'),
                  onPressed: _isSaving || _isLoadingMembers ? null : _save,
                  icon: _isSaving
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.check),
                  label: const Text('Save group bill'),
                ),
              ),
            )
          : null,
    );
  }
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
  });

  final int index;
  final _GroupBillCreateItemControllers controllers;
  final List<SettleoraGroupMember> members;
  final bool isSaving;
  final VoidCallback onRemove;

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
  }

  void _removeSplit(int index) {
    setState(() {
      widget.controllers.removeSplit(index);
      _splitListError = widget.controllers.splits.isEmpty
          ? 'Add at least one split before saving.'
          : null;
    });
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
              keyboardType: TextInputType.number,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Amount',
                border: OutlineInputBorder(),
              ),
              validator: (value) =>
                  _requiredField(value, 'Enter an item amount.'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: ValueKey('group-bill-item-currency-${widget.index}'),
              controller: widget.controllers.currency,
              enabled: !widget.isSaving,
              textCapitalization: TextCapitalization.characters,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Currency',
                border: OutlineInputBorder(),
              ),
              validator: (value) =>
                  _requiredField(value, 'Enter an item currency.'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: ValueKey('group-bill-item-note-${widget.index}'),
              controller: widget.controllers.note,
              enabled: !widget.isSaving,
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
  });

  final int itemIndex;
  final int splitIndex;
  final _GroupBillCreateSplitControllers controllers;
  final List<SettleoraGroupMember> members;
  final bool isSaving;
  final VoidCallback onRemove;

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
            _MemberDropdownField(
              key: ValueKey('group-bill-split-member-$itemIndex-$splitIndex'),
              label: 'Member',
              members: members,
              value: controllers.userProfileId,
              enabled: !isSaving,
              requiredMessage: 'Choose a member for every split.',
              onChanged: (value) => controllers.userProfileId = value,
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: ValueKey('group-bill-split-method-$itemIndex-$splitIndex'),
              controller: controllers.splitMethod,
              enabled: !isSaving,
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
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Basis value',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: ValueKey('group-bill-split-order-$itemIndex-$splitIndex'),
              controller: controllers.allocationOrder,
              enabled: !isSaving,
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
  });

  final int index;
  final _GroupBillCreatePayerControllers controllers;
  final List<SettleoraGroupMember> members;
  final bool isSaving;
  final VoidCallback onRemove;

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
            _MemberDropdownField(
              key: ValueKey('group-bill-payer-member-$index'),
              label: 'Member',
              members: members,
              value: controllers.userProfileId,
              enabled: !isSaving,
              requiredMessage: 'Choose a member for every payer.',
              onChanged: (value) => controllers.userProfileId = value,
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: ValueKey('group-bill-payer-amount-$index'),
              controller: controllers.amount,
              enabled: !isSaving,
              keyboardType: TextInputType.number,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Amount',
                border: OutlineInputBorder(),
              ),
              validator: (value) =>
                  _requiredField(value, 'Enter a payer amount.'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: ValueKey('group-bill-payer-currency-$index'),
              controller: controllers.currency,
              enabled: !isSaving,
              textCapitalization: TextCapitalization.characters,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Currency',
                border: OutlineInputBorder(),
              ),
              validator: (value) =>
                  _requiredField(value, 'Enter a payer currency.'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: ValueKey('group-bill-payer-method-$index'),
              controller: controllers.paymentMethodLabel,
              enabled: !isSaving,
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

class _MemberDropdownField extends StatelessWidget {
  const _MemberDropdownField({
    super.key,
    required this.label,
    required this.members,
    required this.value,
    required this.enabled,
    required this.requiredMessage,
    required this.onChanged,
  });

  final String label;
  final List<SettleoraGroupMember> members;
  final String? value;
  final bool enabled;
  final String requiredMessage;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String>(
      initialValue: value,
      isExpanded: true,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
      items: [
        for (final member in members)
          DropdownMenuItem<String>(
            value: member.userProfileId,
            child: Text(member.safeDisplayName),
          ),
      ],
      onChanged: enabled ? onChanged : null,
      validator: (value) {
        final trimmed = value?.trim();
        if (trimmed == null || trimmed.isEmpty) {
          return requiredMessage;
        }

        return null;
      },
    );
  }
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
  late bool _isLoading;
  SettleoraBillDetail? _bill;
  SettleoraBillFailure? _failure;
  SettleoraBillRevision? _pendingRevision;
  SettleoraBillRevisionFailure? _revisionFailure;
  SettleoraBillRevisionFailure? _createFailure;
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

            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
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
                _BillItems(items: bill.items),
                const SizedBox(height: 20),
                _BillParticipants(participants: bill.participants),
                const SizedBox(height: 20),
                _BillPayers(payers: bill.payers),
                const SizedBox(height: 20),
                _BillAdjustments(adjustments: bill.adjustments),
                if (widget.attachmentRepository != null) ...[
                  const SizedBox(height: 20),
                  _BillAttachmentSection(
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
  final SettleoraBillDetail? initialBill;

  @override
  State<SettleoraGroupBillDetailScreen> createState() =>
      _SettleoraGroupBillDetailScreenState();
}

class _SettleoraGroupBillDetailScreenState
    extends State<SettleoraGroupBillDetailScreen> {
  late bool _isLoading;
  SettleoraBillDetail? _bill;
  SettleoraBillFailure? _failure;
  SettleoraBillRevision? _pendingRevision;
  SettleoraBillRevisionFailure? _revisionFailure;
  SettleoraBillRevisionFailure? _createFailure;
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

            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
              children: [
                _GroupBillContext(groupName: widget.groupName),
                const SizedBox(height: 20),
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
                _BillItems(items: bill.items),
                const SizedBox(height: 20),
                _BillParticipants(participants: bill.participants),
                const SizedBox(height: 20),
                _BillPayers(payers: bill.payers),
                const SizedBox(height: 20),
                _BillAdjustments(adjustments: bill.adjustments),
                if (widget.attachmentRepository != null) ...[
                  const SizedBox(height: 20),
                  _BillAttachmentSection(
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

class _BillAttachmentSection extends StatefulWidget {
  const _BillAttachmentSection({
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
  State<_BillAttachmentSection> createState() => _BillAttachmentSectionState();
}

class _BillAttachmentSectionState extends State<_BillAttachmentSection> {
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
  void didUpdateWidget(_BillAttachmentSection oldWidget) {
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

    return _Section(
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
            const _StatePanel(
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
                      _SoftChip(
                        label: _attachmentPurposeLabel(attachment.purpose),
                        icon: _attachmentPurposeIcon(attachment.purpose),
                      ),
                      const SizedBox(height: 6),
                      _KeyValueText(
                        label: 'Content type',
                        value: _safeAttachmentContentTypeLabel(
                          attachment.contentType,
                        ),
                      ),
                      _KeyValueText(
                        label: 'Size',
                        value: _formatBytes(attachment.sizeBytes),
                      ),
                      _KeyValueText(
                        label: 'Uploaded',
                        value: _formatTimestamp(attachment.uploadedAtUtc),
                      ),
                      _KeyValueText(
                        label: 'Updated',
                        value: _formatTimestamp(attachment.updatedAtUtc),
                      ),
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
    final syncItem = this.syncItem;
    final actionTooltip = bill.isArchived ? 'Queue restore' : 'Queue archive';
    final actionIcon = bill.isArchived
        ? Icons.unarchive_outlined
        : Icons.archive_outlined;

    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListTile(
        enabled: !bill.isArchived,
        onTap: bill.isArchived ? null : onTap,
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
                  if (syncItem != null)
                    _SoftChip(
                      label:
                          '${settleoraBillSyncOperationLabel(syncItem)} - ${settleoraBillSyncStateLabel(syncItem)}',
                      icon: _syncIcon(syncItem.state),
                    ),
                ],
              ),
              if (syncItem?.safeMessage != null) ...[
                const SizedBox(height: 6),
                Text(syncItem!.safeMessage!),
              ],
            ],
          ),
        ),
        trailing: IconButton(
          key: bill.isArchived ? restoreButtonKey : archiveButtonKey,
          tooltip: actionTooltip,
          onPressed: isBusy || hasOpenOperation ? null : onQueue,
          icon: isBusy
              ? const SizedBox.square(
                  dimension: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Icon(actionIcon),
        ),
      ),
    );
  }
}

class _ReadOnlyBillSummaryTile extends StatelessWidget {
  const _ReadOnlyBillSummaryTile({required this.bill, required this.onTap});

  final SettleoraBillSummary bill;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
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

class _BillDetailHeader extends StatelessWidget {
  const _BillDetailHeader({required this.bill});

  final SettleoraBillDetail bill;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(bill.displayName, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 10),
        _KeyValueText(label: 'Bill date', value: bill.billDate),
        _KeyValueText(
          label: 'Status',
          value: settleoraBillStatusLabel(bill.status),
        ),
        _KeyValueText(
          label: 'Reconciliation',
          value: settleoraBillReconciliationStatusLabel(
            bill.reconciliationStatus,
          ),
        ),
        _KeyValueText(
          label: 'Total',
          value: _money(bill.totalAmount, bill.totalCurrency),
        ),
        if (bill.reconciliationNote != null)
          _KeyValueText(label: 'Note', value: bill.reconciliationNote!),
      ],
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
          _KeyValueText(
            label: item.name,
            value: _money(item.amount, item.currency),
          ),
      ],
    );
  }
}

class _BillParticipants extends StatelessWidget {
  const _BillParticipants({required this.participants});

  final List<SettleoraBillParticipant> participants;

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
            label: 'Participant ${index + 1}',
            value:
                '${_money(participants[index].resolvedShareAmount, participants[index].resolvedShareCurrency)} - ${settleoraBillStatusLabel(participants[index].status)}',
          ),
      ],
    );
  }
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
    required this.onSync,
  });

  final SettleoraBillSyncSnapshot snapshot;
  final bool isSyncing;
  final VoidCallback onSync;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Icon(
              snapshot.conflictCount > 0
                  ? Icons.sync_problem_outlined
                  : Icons.sync_outlined,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Queue: ${snapshot.queuedCount} queued, ${snapshot.failedCount} failed, ${snapshot.conflictCount} needs review, ${snapshot.syncedCount} synced',
              ),
            ),
            TextButton.icon(
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
      ),
    );
  }
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

class _KeyValueText extends StatelessWidget {
  const _KeyValueText({required this.label, required this.value});

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

String? _requiredField(String? value, String message) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return message;
  }

  return null;
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
    displayNameFallback: bill.displayNameFallback,
  );
}

bool _canShowCreateRevisionAction(
  SettleoraBillDetail bill,
  SettleoraBillRevisionRepository? repository,
) {
  return repository != null && bill.revisionCreationActions.canCreateRevision;
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
