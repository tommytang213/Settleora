import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_sync_controller.dart';
import 'package:mobile/sync/sync_queue.dart';
import 'package:mobile/sync/sync_queue_processor.dart';
import 'package:mobile/sync/sync_repository.dart';

void main() {
  group('SettleoraBillSyncController', () {
    test('queues archive and restore using empty safe payloads', () async {
      var id = 0;
      final store = MemorySyncQueueStore();
      final controller = SettleoraBillSyncController(
        queueStore: store,
        queueProcessor: SettleoraSyncQueueProcessor(
          queueStore: store,
          repository: FakeSyncRepository([]),
        ),
        now: () => _now,
        idGenerator: () {
          id += 1;
          return 'queue-$id';
        },
      );

      await controller.queueArchive(_billId);
      final snapshot = await controller.queueRestore(_billId);

      expect(snapshot.queuedCount, 2);
      expect(snapshot.items.first.operationType, 'bill_archive');
      expect(snapshot.items.last.operationType, 'bill_restore');
      expect(snapshot.items.first.resourceType, 'expense_bill');
      expect(snapshot.items.first.resourceId, _billId);
      expect(snapshot.items.first.payload, isEmpty);
      expect(snapshot.items.last.payload, isEmpty);

      final queueJson = snapshot.items.map((item) => item.toJson()).toString();
      expect(queueJson, isNot(contains('token')));
      expect(queueJson, isNot(contains('password')));
      expect(queueJson, isNot(contains('payment')));
      expect(queueJson, isNot(contains('receipt')));
      expect(queueJson, isNot(contains('ocr')));
    });

    test('preserves queued work when sync is session-blocked', () async {
      final store = MemorySyncQueueStore(
        initialState: SettleoraSyncQueueState(items: [sampleArchiveItem()]),
      );
      final controller = SettleoraBillSyncController(
        queueStore: store,
        queueProcessor: SettleoraSyncQueueProcessor(
          queueStore: store,
          repository: FakeSyncRepository([
            const SettleoraSyncFailure(
              kind: SettleoraSyncFailureKind.sessionRequired,
              message: 'Sign in before syncing pending changes.',
            ),
          ]),
        ),
        now: () => _attemptedAtUtc,
      );

      final outcome = await controller.flushPending();

      expect(outcome.result.sessionRequired, isTrue);
      expect(outcome.result.processedCount, 0);
      expect(outcome.snapshot.items.single.state, 'queued');
      expect(outcome.snapshot.items.single.attemptCount, 0);
    });

    test('marks accepted sync operations as synced', () async {
      final store = MemorySyncQueueStore(
        initialState: SettleoraSyncQueueState(items: [sampleArchiveItem()]),
      );
      final controller = SettleoraBillSyncController(
        queueStore: store,
        queueProcessor: SettleoraSyncQueueProcessor(
          queueStore: store,
          repository: FakeSyncRepository([sampleOperationResult()]),
          now: () => _attemptedAtUtc,
        ),
      );

      final outcome = await controller.flushPending();

      expect(outcome.result.syncedCount, 1);
      expect(outcome.snapshot.syncedCount, 1);
      expect(outcome.snapshot.items.single.state, 'synced');
      expect(outcome.snapshot.items.single.safeMessage, isNull);
    });
  });
}

SettleoraSyncQueueItem sampleArchiveItem() {
  return SettleoraSyncQueueItem.billArchive(
    resourceId: _billId,
    now: _now,
    idGenerator: () => 'queue-1',
  );
}

SettleoraSyncOperationResult sampleOperationResult() {
  return const SettleoraSyncOperationResult(
    operationId: 'server-operation-1',
    status: SettleoraSyncOperationResultStatusValues.accepted,
    resourceType: SettleoraSyncResourceTypeValues.expenseBill,
    resourceId: _billId,
    resultingVersion: 12,
    safeErrorCode: null,
    safeMessage: null,
  );
}

class MemorySyncQueueStore extends SettleoraSyncQueueStore {
  MemorySyncQueueStore({
    SettleoraSyncQueueState? initialState,
    this.maxItemCount = 100,
  }) : state = initialState ?? SettleoraSyncQueueState.empty();

  SettleoraSyncQueueState state;

  @override
  final int maxItemCount;

  @override
  Future<SettleoraSyncQueueState> read() async => state;

  @override
  Future<void> write(SettleoraSyncQueueState state) async {
    this.state = state;
  }
}

class FakeSyncRepository implements SettleoraSyncRepository {
  FakeSyncRepository(this._outcomes);

  final List<Object> _outcomes;

  @override
  Future<SettleoraSyncOperationResult> submitOperation(
    SettleoraSyncQueueItem item,
  ) async {
    final outcome = _outcomes.removeAt(0);
    if (outcome is SettleoraSyncOperationResult) {
      return outcome;
    }

    throw outcome;
  }

  @override
  Future<SettleoraSyncChangeFeed> listChanges({
    int? sinceVersion,
    int? limit,
    SettleoraSyncResourceType? resourceType,
  }) {
    throw UnimplementedError();
  }
}

const _billId = '22222222-2222-2222-2222-222222222222';
final _now = DateTime.utc(2026, 5, 17, 10);
final _attemptedAtUtc = DateTime.utc(2026, 5, 17, 11);
