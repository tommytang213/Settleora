import '../sync/sync_queue.dart';
import '../sync/sync_queue_processor.dart';

class SettleoraBillSyncController {
  SettleoraBillSyncController({
    required SettleoraSyncQueueStore queueStore,
    required SettleoraSyncQueueProcessor queueProcessor,
    DateTime Function()? now,
    String Function()? idGenerator,
  }) : _queueStore = queueStore,
       _queueProcessor = queueProcessor,
       _now = now,
       _idGenerator = idGenerator;

  final SettleoraSyncQueueStore _queueStore;
  final SettleoraSyncQueueProcessor _queueProcessor;
  final DateTime Function()? _now;
  final String Function()? _idGenerator;

  Future<SettleoraBillSyncSnapshot> readSnapshot() async {
    return SettleoraBillSyncSnapshot(state: await _queueStore.read());
  }

  Future<SettleoraBillSyncSnapshot> queueArchive(String billId) async {
    await _queueStore.enqueue(
      SettleoraSyncQueueItem.billArchive(
        resourceId: billId,
        now: _now?.call(),
        idGenerator: _idGenerator,
      ),
    );
    return readSnapshot();
  }

  Future<SettleoraBillSyncSnapshot> queueRestore(String billId) async {
    await _queueStore.enqueue(
      SettleoraSyncQueueItem.billRestore(
        resourceId: billId,
        now: _now?.call(),
        idGenerator: _idGenerator,
      ),
    );
    return readSnapshot();
  }

  Future<SettleoraBillSyncFlushOutcome> flushPending({int limit = 25}) async {
    final result = await _queueProcessor.flush(limit: limit);
    return SettleoraBillSyncFlushOutcome(
      result: result,
      snapshot: await readSnapshot(),
    );
  }
}

class SettleoraBillSyncSnapshot {
  const SettleoraBillSyncSnapshot({required SettleoraSyncQueueState state})
    : _state = state;

  final SettleoraSyncQueueState _state;

  List<SettleoraSyncQueueItem> get items => _state.items;

  int get queuedCount => _state.queuedCount;

  int get failedCount => _state.failedCount;

  int get conflictCount => _state.conflictCount;

  int get pendingCount => _state.pendingCount;

  int get syncedCount => _count(SettleoraSyncQueueItemStateValues.synced);

  int get syncingCount => _count(SettleoraSyncQueueItemStateValues.syncing);

  bool get hasAnyItems => items.isNotEmpty;

  SettleoraSyncQueueItem? latestForBill(String billId) {
    final matches = items
        .where(
          (item) =>
              item.resourceType ==
                  SettleoraSyncResourceTypeValues.expenseBill &&
              item.resourceId == billId,
        )
        .toList(growable: false);
    if (matches.isEmpty) {
      return null;
    }

    matches.sort((left, right) {
      final updatedCompare = right.updatedAtUtc.compareTo(left.updatedAtUtc);
      if (updatedCompare != 0) {
        return updatedCompare;
      }

      return right.createdAtUtc.compareTo(left.createdAtUtc);
    });
    return matches.first;
  }

  bool hasOpenBillOperation(String billId) {
    final item = latestForBill(billId);
    if (item == null) {
      return false;
    }

    return item.state == SettleoraSyncQueueItemStateValues.queued ||
        item.state == SettleoraSyncQueueItemStateValues.syncing ||
        item.state == SettleoraSyncQueueItemStateValues.failed ||
        item.state == SettleoraSyncQueueItemStateValues.conflict;
  }

  int _count(String state) {
    return items.where((item) => item.state == state).length;
  }
}

class SettleoraBillSyncFlushOutcome {
  const SettleoraBillSyncFlushOutcome({
    required this.result,
    required this.snapshot,
  });

  final SettleoraSyncQueueFlushResult result;
  final SettleoraBillSyncSnapshot snapshot;
}

String settleoraBillSyncOperationLabel(SettleoraSyncQueueItem item) {
  return switch (item.operationType) {
    SettleoraSyncOperationTypeValues.billArchive => 'Archive',
    SettleoraSyncOperationTypeValues.billRestore => 'Restore',
    _ => 'Sync',
  };
}

String settleoraBillSyncStateLabel(SettleoraSyncQueueItem item) {
  return switch (item.state) {
    SettleoraSyncQueueItemStateValues.queued => 'Queued',
    SettleoraSyncQueueItemStateValues.syncing => 'Syncing',
    SettleoraSyncQueueItemStateValues.synced => 'Synced',
    SettleoraSyncQueueItemStateValues.failed => 'Retry later',
    SettleoraSyncQueueItemStateValues.conflict => 'Needs review',
    SettleoraSyncQueueItemStateValues.cancelled => 'Cancelled',
    _ => 'Sync pending',
  };
}
