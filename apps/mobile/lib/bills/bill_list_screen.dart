import 'package:flutter/material.dart';

import '../sync/sync_queue.dart';
import '../sync/sync_queue_processor.dart';
import 'bill_repository.dart';
import 'bill_sync_controller.dart';

class SettleoraBillListScreen extends StatefulWidget {
  const SettleoraBillListScreen({
    super.key,
    required this.repository,
    required this.syncController,
  });

  final SettleoraBillRepository repository;
  final SettleoraBillSyncController syncController;

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
          billId: bill.id,
        ),
      ),
    );
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
    );
  }
}

class SettleoraBillDetailScreen extends StatefulWidget {
  const SettleoraBillDetailScreen({
    super.key,
    required this.repository,
    required this.billId,
  });

  final SettleoraBillRepository repository;
  final String billId;

  @override
  State<SettleoraBillDetailScreen> createState() =>
      _SettleoraBillDetailScreenState();
}

class _SettleoraBillDetailScreenState extends State<SettleoraBillDetailScreen> {
  bool _isLoading = true;
  SettleoraBillDetail? _bill;
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
      final bill = await widget.repository.getPersonalBill(widget.billId);
      if (!mounted) {
        return;
      }

      setState(() {
        _bill = bill;
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
                const SizedBox(height: 20),
                _BillItems(items: bill.items),
                const SizedBox(height: 20),
                _BillParticipants(participants: bill.participants),
                const SizedBox(height: 20),
                _BillPayers(payers: bill.payers),
                const SizedBox(height: 20),
                _BillAdjustments(adjustments: bill.adjustments),
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

String _titleFromCode(String code) {
  return code
      .split('_')
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}
