import 'sync_queue.dart';
import 'sync_repository.dart';

class SettleoraSyncQueueProcessor {
  SettleoraSyncQueueProcessor({
    required SettleoraSyncQueueStore queueStore,
    required SettleoraSyncRepository repository,
    DateTime Function()? now,
  }) : _queueStore = queueStore,
       _repository = repository,
       _now = now;

  final SettleoraSyncQueueStore _queueStore;
  final SettleoraSyncRepository _repository;
  final DateTime Function()? _now;
  Future<SettleoraSyncQueueFlushResult>? _flushInFlight;

  Future<SettleoraSyncQueueFlushResult> flush({int limit = 25}) {
    final inFlight = _flushInFlight;
    if (inFlight != null) {
      return inFlight;
    }

    late final Future<SettleoraSyncQueueFlushResult> guarded;
    guarded = _flushInternal(limit: limit).whenComplete(() {
      if (identical(_flushInFlight, guarded)) {
        _flushInFlight = null;
      }
    });
    _flushInFlight = guarded;
    return guarded;
  }

  Future<SettleoraSyncQueueFlushResult> _flushInternal({
    required int limit,
  }) async {
    final boundedLimit = limit.clamp(1, 100).toInt();
    var state = await _queueStore.read();
    final retryableItems = state.retryableItems(limit: boundedLimit);
    var processedCount = 0;
    var syncedCount = 0;
    var failedCount = 0;
    var conflictCount = 0;

    for (final item in retryableItems) {
      try {
        final response = await _repository.submitOperation(item);
        final attemptedAtUtc = _currentUtc();
        final updatedItem = _itemForResult(
          item,
          response,
          attemptedAtUtc: attemptedAtUtc,
        );
        state = state.replaceItem(updatedItem);
        await _queueStore.write(state);

        processedCount += 1;
        if (updatedItem.state == SettleoraSyncQueueItemStateValues.synced) {
          syncedCount += 1;
        } else if (updatedItem.state ==
            SettleoraSyncQueueItemStateValues.conflict) {
          conflictCount += 1;
        } else if (updatedItem.state ==
            SettleoraSyncQueueItemStateValues.failed) {
          failedCount += 1;
        }
      } on SettleoraSyncFailure catch (failure) {
        if (failure.isSessionBlocking) {
          return SettleoraSyncQueueFlushResult(
            processedCount: processedCount,
            syncedCount: syncedCount,
            failedCount: failedCount,
            conflictCount: conflictCount,
            sessionRequired: true,
            safeMessage: failure.message,
          );
        }

        final attemptedAtUtc = _currentUtc();
        final updatedItem = item.copyWith(
          state: failure.kind == SettleoraSyncFailureKind.conflict
              ? SettleoraSyncQueueItemStateValues.conflict
              : SettleoraSyncQueueItemStateValues.failed,
          updatedAtUtc: attemptedAtUtc,
          lastAttemptAtUtc: attemptedAtUtc,
          attemptCount: item.attemptCount + 1,
          safeErrorCode: failure.safeErrorCode ?? failure.kind.name,
          safeMessage: failure.message,
        );
        state = state.replaceItem(updatedItem);
        await _queueStore.write(state);

        processedCount += 1;
        if (updatedItem.state == SettleoraSyncQueueItemStateValues.conflict) {
          conflictCount += 1;
        } else {
          failedCount += 1;
        }
      }
    }

    return SettleoraSyncQueueFlushResult(
      processedCount: processedCount,
      syncedCount: syncedCount,
      failedCount: failedCount,
      conflictCount: conflictCount,
      sessionRequired: false,
      safeMessage: null,
    );
  }

  SettleoraSyncQueueItem _itemForResult(
    SettleoraSyncQueueItem item,
    SettleoraSyncOperationResult response, {
    required DateTime attemptedAtUtc,
  }) {
    if (response.isSynced) {
      return item.copyWith(
        state: SettleoraSyncQueueItemStateValues.synced,
        updatedAtUtc: attemptedAtUtc,
        lastAttemptAtUtc: attemptedAtUtc,
        attemptCount: item.attemptCount + 1,
        clearSafeError: true,
      );
    }

    if (response.isConflict) {
      return item.copyWith(
        state: SettleoraSyncQueueItemStateValues.conflict,
        updatedAtUtc: attemptedAtUtc,
        lastAttemptAtUtc: attemptedAtUtc,
        attemptCount: item.attemptCount + 1,
        safeErrorCode: response.safeErrorCode ?? 'sync_conflict',
        safeMessage: response.safeMessage ?? 'This change needs review.',
      );
    }

    return item.copyWith(
      state: SettleoraSyncQueueItemStateValues.failed,
      updatedAtUtc: attemptedAtUtc,
      lastAttemptAtUtc: attemptedAtUtc,
      attemptCount: item.attemptCount + 1,
      safeErrorCode: response.safeErrorCode ?? 'sync_rejected',
      safeMessage: response.safeMessage ?? 'The server rejected this change.',
    );
  }

  DateTime _currentUtc() => (_now?.call() ?? DateTime.now()).toUtc();
}

class SettleoraSyncQueueFlushResult {
  const SettleoraSyncQueueFlushResult({
    required this.processedCount,
    required this.syncedCount,
    required this.failedCount,
    required this.conflictCount,
    required this.sessionRequired,
    required this.safeMessage,
  });

  final int processedCount;
  final int syncedCount;
  final int failedCount;
  final int conflictCount;
  final bool sessionRequired;
  final String? safeMessage;
}
