import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/settleora_api_client.dart';
import 'package:mobile/app/app_bootstrap.dart';
import 'package:mobile/app/secure_storage.dart';
import 'package:mobile/sync/generated_sync_repository.dart';
import 'package:mobile/sync/sync_change_feed_hydration.dart';
import 'package:mobile/sync/sync_queue.dart';
import 'package:mobile/sync/sync_queue_processor.dart';
import 'package:mobile/sync/sync_repository.dart';
import 'package:settleora_api_client/settleora_api.dart' as api;

void main() {
  group('SettleoraSyncQueueState', () {
    test('serializes queued items across a JSON round trip', () {
      final state = SettleoraSyncQueueState(items: [sampleArchiveItem()]);

      final restored = SettleoraSyncQueueState.fromJson(
        Map<String, Object?>.from(
          jsonDecode(jsonEncode(state.toJson())) as Map,
        ),
      );
      final item = restored.items.single;

      expect(item.id, 'queue-1');
      expect(item.operationType, SettleoraSyncOperationTypeValues.billArchive);
      expect(item.resourceType, SettleoraSyncResourceTypeValues.expenseBill);
      expect(item.resourceId, _billId);
      expect(item.baseVersion, 7);
      expect(item.payload, isEmpty);
      expect(item.state, SettleoraSyncQueueItemStateValues.queued);
      expect(item.createdAtUtc, _now);
      expect(item.updatedAtUtc, _now);
      expect(item.lastAttemptAtUtc, isNull);
      expect(item.attemptCount, 0);
    });

    test(
      'enforces the queue capacity limit without dropping pending work',
      () async {
        final store = MemorySyncQueueStore(maxItemCount: 1);
        await store.enqueue(sampleArchiveItem(id: 'queue-1'));

        await expectLater(
          store.enqueue(sampleRestoreItem(id: 'queue-2')),
          throwsA(
            isA<SettleoraSyncQueueFailure>().having(
              (failure) => failure.kind,
              'kind',
              SettleoraSyncQueueFailureKind.capacity,
            ),
          ),
        );

        expect(store.state.items.single.id, 'queue-1');
      },
    );

    test('creates stable safe archive and restore queue items', () {
      final archive = sampleArchiveItem(id: 'archive-item');
      final restore = sampleRestoreItem(id: 'restore-item');

      expect(
        archive.operationType,
        SettleoraSyncOperationTypeValues.billArchive,
      );
      expect(
        restore.operationType,
        SettleoraSyncOperationTypeValues.billRestore,
      );
      expect(archive.resourceType, SettleoraSyncResourceTypeValues.expenseBill);
      expect(archive.idempotencyKey, contains('archive-item'));
      expect(archive.idempotencyKey, contains(_billId));
      expect(archive.payload, isEmpty);
      expect(restore.payload, isEmpty);

      final queueJson = jsonEncode(
        SettleoraSyncQueueState(items: [archive, restore]).toJson(),
      );
      expect(queueJson, isNot(contains('accessToken')));
      expect(queueJson, isNot(contains('refreshCredential')));
      expect(queueJson, isNot(contains('password')));
      expect(queueJson, isNot(contains('authAccountId')));
      expect(queueJson, isNot(contains('receiptBytes')));
      expect(queueJson, isNot(contains('proofContents')));
    });

    test('persists the queue through secure key-value storage', () async {
      final keyValueStore = MemorySecureKeyValueStore();
      final store = SecureStorageSyncQueueStore(keyValueStore: keyValueStore);

      await store.enqueue(sampleArchiveItem());

      final restoredStore = SecureStorageSyncQueueStore(
        keyValueStore: keyValueStore,
      );
      final restored = await restoredStore.read();

      expect(restored.items.single.id, 'queue-1');
      expect(keyValueStore.values.keys, contains('settleora.sync_queue.v1'));
    });
  });

  group('SettleoraSyncQueueProcessor', () {
    test(
      'leaves the queue untouched when no session token is available',
      () async {
        final store = MemorySyncQueueStore(
          initialState: SettleoraSyncQueueState(items: [sampleArchiveItem()]),
        );
        final client = FakeSyncGeneratedClient(
          operationResponse: sampleApiOperationResponse(),
        );
        final repository = GeneratedSettleoraSyncRepository(
          client: client,
          accessTokenProvider: FakeAccessTokenProvider(null),
        );
        final processor = SettleoraSyncQueueProcessor(
          queueStore: store,
          repository: repository,
          now: () => _attemptedAtUtc,
        );
        final before = jsonEncode(store.state.toJson());

        final result = await processor.flush();

        expect(result.sessionRequired, isTrue);
        expect(result.processedCount, 0);
        expect(client.submitCalls, 0);
        expect(jsonEncode(store.state.toJson()), before);
      },
    );

    test('persists syncing state during an in-flight attempt', () async {
      final completer = Completer<SettleoraSyncOperationResult>();
      final repository = BlockingSyncRepository(completer);
      final store = MemorySyncQueueStore(
        initialState: SettleoraSyncQueueState(items: [sampleArchiveItem()]),
      );
      final processor = SettleoraSyncQueueProcessor(
        queueStore: store,
        repository: repository,
        now: () => _attemptedAtUtc,
      );

      final flush = processor.flush();
      await Future<void>.delayed(Duration.zero);
      final syncingItem = store.state.items.single;

      expect(syncingItem.state, SettleoraSyncQueueItemStateValues.syncing);
      expect(syncingItem.id, 'queue-1');
      expect(syncingItem.idempotencyKey, contains('queue-1'));
      expect(syncingItem.payload, isEmpty);
      expect(syncingItem.attemptCount, 0);
      expect(syncingItem.lastAttemptAtUtc, isNull);
      expect(repository.lastSubmittedItem?.state, 'syncing');

      completer.complete(sampleOperationResult());
      final result = await flush;
      final syncedItem = store.state.items.single;

      expect(result.syncedCount, 1);
      expect(syncedItem.state, SettleoraSyncQueueItemStateValues.synced);
      expect(syncedItem.payload, isEmpty);
      expect(syncedItem.attemptCount, 1);
    });

    test('marks accepted and replayed results as synced', () async {
      for (final status in [
        SettleoraSyncOperationResultStatusValues.accepted,
        SettleoraSyncOperationResultStatusValues.replayed,
      ]) {
        final store = MemorySyncQueueStore(
          initialState: SettleoraSyncQueueState(items: [sampleArchiveItem()]),
        );
        final processor = SettleoraSyncQueueProcessor(
          queueStore: store,
          repository: FakeSyncRepository(
            outcomes: [sampleOperationResult(status: status)],
          ),
          now: () => _attemptedAtUtc,
        );

        final result = await processor.flush();
        final item = store.state.items.single;

        expect(result.syncedCount, 1);
        expect(item.state, SettleoraSyncQueueItemStateValues.synced);
        expect(item.attemptCount, 1);
        expect(item.lastAttemptAtUtc, _attemptedAtUtc);
        expect(item.safeErrorCode, isNull);
        expect(item.safeMessage, isNull);
      }
    });

    test('marks rejected results as failed with safe fields', () async {
      final store = MemorySyncQueueStore(
        initialState: SettleoraSyncQueueState(items: [sampleArchiveItem()]),
      );
      final processor = SettleoraSyncQueueProcessor(
        queueStore: store,
        repository: FakeSyncRepository(
          outcomes: [
            sampleOperationResult(
              status: SettleoraSyncOperationResultStatusValues.rejected,
              safeErrorCode: 'bill_archived_elsewhere',
              safeMessage: 'Refresh the bill before trying again.',
            ),
          ],
        ),
        now: () => _attemptedAtUtc,
      );

      final result = await processor.flush();
      final item = store.state.items.single;

      expect(result.failedCount, 1);
      expect(item.state, SettleoraSyncQueueItemStateValues.failed);
      expect(item.safeErrorCode, 'bill_archived_elsewhere');
      expect(item.safeMessage, 'Refresh the bill before trying again.');
      expect(item.payload, isEmpty);
    });

    test('marks conflict results as conflict and preserves the item', () async {
      final store = MemorySyncQueueStore(
        initialState: SettleoraSyncQueueState(items: [sampleArchiveItem()]),
      );
      final processor = SettleoraSyncQueueProcessor(
        queueStore: store,
        repository: FakeSyncRepository(
          outcomes: [
            sampleOperationResult(
              status: SettleoraSyncOperationResultStatusValues.conflict,
              safeErrorCode: 'stale_version',
              safeMessage: 'Review the latest bill before syncing.',
            ),
          ],
        ),
        now: () => _attemptedAtUtc,
      );

      final result = await processor.flush();
      final item = store.state.items.single;

      expect(result.conflictCount, 1);
      expect(item.id, 'queue-1');
      expect(item.state, SettleoraSyncQueueItemStateValues.conflict);
      expect(item.safeErrorCode, 'stale_version');
      expect(item.safeMessage, 'Review the latest bill before syncing.');
      expect(item.payload, isEmpty);
    });

    test('keeps network failures retryable and increments attempts', () async {
      final store = MemorySyncQueueStore(
        initialState: SettleoraSyncQueueState(items: [sampleArchiveItem()]),
      );
      final processor = SettleoraSyncQueueProcessor(
        queueStore: store,
        repository: FakeSyncRepository(
          outcomes: const [
            SettleoraSyncFailure(
              kind: SettleoraSyncFailureKind.retryable,
              message: 'The server is unavailable. Try syncing again later.',
              safeErrorCode: 'network_unavailable',
            ),
          ],
        ),
        now: () => _attemptedAtUtc,
      );

      final result = await processor.flush();
      final item = store.state.items.single;

      expect(result.failedCount, 1);
      expect(item.state, SettleoraSyncQueueItemStateValues.failed);
      expect(item.isRetryable, isTrue);
      expect(item.attemptCount, 1);
      expect(item.lastAttemptAtUtc, _attemptedAtUtc);
      expect(item.safeErrorCode, 'network_unavailable');
    });

    test('keeps retryable failed items available for a later sync', () async {
      final store = MemorySyncQueueStore(
        initialState: SettleoraSyncQueueState(items: [sampleArchiveItem()]),
      );
      final processor = SettleoraSyncQueueProcessor(
        queueStore: store,
        repository: FakeSyncRepository(
          outcomes: [
            const SettleoraSyncFailure(
              kind: SettleoraSyncFailureKind.retryable,
              message: 'The server is unavailable. Try syncing again later.',
              safeErrorCode: 'network_unavailable',
            ),
            sampleOperationResult(),
          ],
        ),
        now: () => _attemptedAtUtc,
      );

      final failedResult = await processor.flush();
      final failedItem = store.state.items.single;

      expect(failedResult.failedCount, 1);
      expect(failedItem.state, SettleoraSyncQueueItemStateValues.failed);
      expect(failedItem.isRetryable, isTrue);
      expect(failedItem.payload, isEmpty);
      expect(failedItem.attemptCount, 1);

      final syncedResult = await processor.flush();
      final syncedItem = store.state.items.single;

      expect(syncedResult.syncedCount, 1);
      expect(syncedItem.state, SettleoraSyncQueueItemStateValues.synced);
      expect(syncedItem.attemptCount, 2);
      expect(syncedItem.safeErrorCode, isNull);
      expect(syncedItem.safeMessage, isNull);
    });

    test('reuses an in-flight flush instead of duplicate processing', () async {
      final completer = Completer<SettleoraSyncOperationResult>();
      final repository = BlockingSyncRepository(completer);
      final processor = SettleoraSyncQueueProcessor(
        queueStore: MemorySyncQueueStore(
          initialState: SettleoraSyncQueueState(items: [sampleArchiveItem()]),
        ),
        repository: repository,
        now: () => _attemptedAtUtc,
      );

      final first = processor.flush();
      final second = processor.flush();
      await Future<void>.delayed(Duration.zero);

      expect(identical(first, second), isTrue);
      expect(repository.submitCalls, 1);

      completer.complete(sampleOperationResult());
      final firstResult = await first;
      final secondResult = await second;

      expect(firstResult.syncedCount, 1);
      expect(secondResult.syncedCount, 1);
      expect(repository.submitCalls, 1);
    });
  });

  group('GeneratedSettleoraSyncRepository', () {
    test(
      'maps submit requests and responses through the generated client',
      () async {
        final item = sampleArchiveItem();
        final client = FakeSyncGeneratedClient(
          operationResponse: sampleApiOperationResponse(),
        );
        final repository = GeneratedSettleoraSyncRepository(
          client: client,
          accessTokenProvider: FakeAccessTokenProvider('  redacted  '),
        );

        final result = await repository.submitOperation(item);

        expect(
          result.status,
          SettleoraSyncOperationResultStatusValues.accepted,
        );
        expect(
          result.resourceType,
          SettleoraSyncResourceTypeValues.expenseBill,
        );
        expect(result.resultingVersion, 12);
        expect(client.lastAccessToken, 'redacted');
        expect(
          client.lastOperationRequest?.idempotencyKey,
          item.idempotencyKey,
        );
        expect(client.lastOperationRequest?.operationType, item.operationType);
        expect(client.lastOperationRequest?.resourceType, item.resourceType);
        expect(client.lastOperationRequest?.resourceId, item.resourceId);
        expect(client.lastOperationRequest?.baseVersion, item.baseVersion);
        expect(client.lastOperationRequest?.payload, isEmpty);
        expect(
          client.lastOperationRequest?.toJson().keys,
          unorderedEquals([
            'idempotencyKey',
            'operationType',
            'resourceType',
            'resourceId',
            'baseVersion',
            'payload',
          ]),
        );
      },
    );

    test('maps generated failures to bounded safe failures', () async {
      final repository = GeneratedSettleoraSyncRepository(
        client: FakeSyncGeneratedClient(
          failure: api.SettleoraApiException(
            422,
            'Unprocessable Content',
            _hiddenBody,
          ),
        ),
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      final failure = await captureSyncFailure(() {
        return repository.submitOperation(sampleArchiveItem());
      });

      expect(failure.kind, SettleoraSyncFailureKind.validation);
      expect(failure.statusCode, 422);
      expect(failure.message, isNot(contains('internal-detail')));
      expect(failure.toString(), isNot(contains('internal-detail')));
    });

    test('maps network failures to retryable sync failures', () async {
      final repository = GeneratedSettleoraSyncRepository(
        client: FakeSyncGeneratedClient(
          failure: const SocketException('internal socket detail'),
        ),
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      final failure = await captureSyncFailure(() {
        return repository.submitOperation(sampleArchiveItem());
      });

      expect(failure.kind, SettleoraSyncFailureKind.retryable);
      expect(failure.safeErrorCode, 'network_unavailable');
      expect(failure.message, isNot(contains('internal socket detail')));
    });

    test('maps change feed metadata only', () async {
      final client = FakeSyncGeneratedClient(
        changesResponse: api.SyncChangesResponse(
          sinceVersion: 4,
          nextSinceVersion: 9,
          limit: 25,
          resourceType: api.SyncResourceTypeValues.expenseBill,
          changes: [
            api.SyncChange(
              resourceType: api.SyncResourceTypeValues.expenseBill,
              resourceId: _billId,
              version: 9,
              changedAtUtc: _attemptedAtUtc,
              changeKind: api.SyncChangeKindValues.archived,
              groupId: _groupId,
            ),
          ],
        ),
      );
      final repository = GeneratedSettleoraSyncRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      final feed = await repository.listChanges(
        sinceVersion: 4,
        limit: 25,
        resourceType: SettleoraSyncResourceTypeValues.expenseBill,
      );

      expect(feed.sinceVersion, 4);
      expect(feed.nextSinceVersion, 9);
      expect(feed.limit, 25);
      expect(feed.resourceType, SettleoraSyncResourceTypeValues.expenseBill);
      expect(feed.changes.single.resourceId, _billId);
      expect(feed.changes.single.version, 9);
      expect(feed.changes.single.changedAtUtc, _attemptedAtUtc);
      expect(
        feed.changes.single.changeKind,
        SettleoraSyncChangeKindValues.archived,
      );
      expect(feed.changes.single.groupId, _groupId);
      expect(client.lastSinceVersion, 4);
      expect(client.lastLimit, 25);
      expect(
        client.lastResourceType,
        SettleoraSyncResourceTypeValues.expenseBill,
      );
    });

    test('bounds change feed request inputs before generated calls', () async {
      final client = FakeSyncGeneratedClient();
      final repository = GeneratedSettleoraSyncRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      await expectLater(
        repository.listChanges(sinceVersion: -1),
        throwsA(
          isA<SettleoraSyncFailure>()
              .having(
                (failure) => failure.kind,
                'kind',
                SettleoraSyncFailureKind.validation,
              )
              .having(
                (failure) => failure.safeErrorCode,
                'safeErrorCode',
                'invalid_since_version',
              ),
        ),
      );
      await expectLater(
        repository.listChanges(limit: 101),
        throwsA(
          isA<SettleoraSyncFailure>().having(
            (failure) => failure.safeErrorCode,
            'safeErrorCode',
            'invalid_limit',
          ),
        ),
      );
      await expectLater(
        repository.listChanges(resourceType: 'settlement_payment'),
        throwsA(
          isA<SettleoraSyncFailure>().having(
            (failure) => failure.safeErrorCode,
            'safeErrorCode',
            'unsupported_resource_type',
          ),
        ),
      );

      expect(client.listCalls, 0);
    });

    test('maps change feed failures to bounded safe failures', () async {
      final cases = <Object, SettleoraSyncFailureKind>{
        api.SettleoraApiException(401, 'Unauthorized', _hiddenBody):
            SettleoraSyncFailureKind.sessionExpired,
        api.SettleoraApiException(500, 'Server Error', _hiddenBody):
            SettleoraSyncFailureKind.retryable,
        const SocketException('internal socket detail'):
            SettleoraSyncFailureKind.retryable,
      };

      for (final entry in cases.entries) {
        final repository = GeneratedSettleoraSyncRepository(
          client: FakeSyncGeneratedClient(failure: entry.key),
          accessTokenProvider: FakeAccessTokenProvider('redacted'),
        );

        final failure = await captureSyncFailure(() {
          return repository.listChanges(
            sinceVersion: 4,
            limit: 25,
            resourceType: SettleoraSyncResourceTypeValues.expenseBill,
          );
        });

        expect(failure.kind, entry.value);
        expect(failure.message, isNot(contains('internal')));
        expect(failure.toString(), isNot(contains('internal')));
      }
    });

    test('requires a session token before reading change feed', () async {
      final client = FakeSyncGeneratedClient();
      final repository = GeneratedSettleoraSyncRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider('  '),
      );

      final failure = await captureSyncFailure(() {
        return repository.listChanges(limit: 25);
      });

      expect(failure.kind, SettleoraSyncFailureKind.sessionRequired);
      expect(client.listCalls, 0);
    });
  });

  group('SettleoraSyncChangeFeedHydrationSeam', () {
    test(
      'returns metadata-only change feed without accepting business truth',
      () async {
        final feed = sampleChangeFeed();
        final repository = FakeSyncRepository(changes: [feed]);
        final seam = SettleoraSyncChangeFeedHydrationSeam(
          repository: repository,
        );

        final result = await seam.readMetadataOnlyChanges(
          sinceVersion: 4,
          limit: 25,
          resourceType: SettleoraSyncResourceTypeValues.expenseBill,
        );

        expect(result.feed, same(feed));
        expect(result.metadataOnly, isTrue);
        expect(result.persistentCacheHydrated, isFalse);
        expect(result.mobileBusinessTruthAccepted, isFalse);
        expect(repository.lastSinceVersion, 4);
        expect(repository.lastLimit, 25);
        expect(
          repository.lastResourceType,
          SettleoraSyncResourceTypeValues.expenseBill,
        );
      },
    );

    test('fails closed for unbounded hydration inputs', () async {
      final repository = FakeSyncRepository(changes: [sampleChangeFeed()]);
      final seam = SettleoraSyncChangeFeedHydrationSeam(repository: repository);

      await expectLater(
        seam.readMetadataOnlyChanges(limit: 0),
        throwsA(
          isA<SettleoraSyncFailure>().having(
            (failure) => failure.safeErrorCode,
            'safeErrorCode',
            'invalid_limit',
          ),
        ),
      );

      expect(repository.listCalls, 0);
    });

    test('preserves safe failure mapping from repository reads', () async {
      final repository = FakeSyncRepository(
        changes: const [
          SettleoraSyncFailure(
            kind: SettleoraSyncFailureKind.retryable,
            message: 'The server is unavailable. Try syncing again later.',
            safeErrorCode: 'network_unavailable',
          ),
        ],
      );
      final seam = SettleoraSyncChangeFeedHydrationSeam(repository: repository);

      final failure = await captureSyncFailure(() {
        return seam.readMetadataOnlyChanges(limit: 25);
      });

      expect(failure.kind, SettleoraSyncFailureKind.retryable);
      expect(failure.safeErrorCode, 'network_unavailable');
      expect(failure.message, isNot(contains(_billId)));
    });
  });

  group('app bootstrap sync wiring', () {
    test('creates authenticated server-mode sync controller seam', () async {
      final store = MemorySyncQueueStore();
      final repository = FakeSyncRepository(
        outcomes: [sampleOperationResult()],
      );
      final configuration = SettleoraApiConfiguration(
        baseUri: Uri.parse('https://settleora.example/api/'),
      );
      final tokenProvider = FakeAccessTokenProvider('redacted');
      SettleoraApiConfiguration? capturedConfiguration;
      SettleoraAccessTokenProvider? capturedTokenProvider;

      final controller = createAuthenticatedServerModeBillSyncController(
        configuration: configuration,
        accessTokenProvider: tokenProvider,
        queueStore: store,
        syncRepositoryFactory: (configuration, accessTokenProvider) {
          capturedConfiguration = configuration;
          capturedTokenProvider = accessTokenProvider;
          return repository;
        },
        now: () => _now,
        idGenerator: () => 'queue-1',
      );

      await controller.queueArchive(_billId);
      final outcome = await controller.flushPending();

      expect(capturedConfiguration, same(configuration));
      expect(capturedTokenProvider, same(tokenProvider));
      expect(repository.submitCalls, 1);
      expect(repository.listCalls, 0);
      expect(outcome.result.syncedCount, 1);
      expect(
        store.state.items.single.state,
        SettleoraSyncQueueItemStateValues.synced,
      );
      expect(store.state.items.single.payload, isEmpty);
    });
  });
}

Future<SettleoraSyncFailure> captureSyncFailure(
  Future<Object?> Function() operation,
) async {
  try {
    await operation();
  } on SettleoraSyncFailure catch (failure) {
    return failure;
  }

  fail('Expected SettleoraSyncFailure.');
}

SettleoraSyncQueueItem sampleArchiveItem({String id = 'queue-1'}) {
  return SettleoraSyncQueueItem.billArchive(
    resourceId: _billId,
    baseVersion: 7,
    now: _now,
    idGenerator: () => id,
  );
}

SettleoraSyncQueueItem sampleRestoreItem({String id = 'queue-2'}) {
  return SettleoraSyncQueueItem.billRestore(
    resourceId: _billId,
    baseVersion: 8,
    now: _now,
    idGenerator: () => id,
  );
}

SettleoraSyncOperationResult sampleOperationResult({
  SettleoraSyncOperationResultStatus status =
      SettleoraSyncOperationResultStatusValues.accepted,
  String? safeErrorCode,
  String? safeMessage,
}) {
  return SettleoraSyncOperationResult(
    operationId: 'server-operation-1',
    status: status,
    resourceType: SettleoraSyncResourceTypeValues.expenseBill,
    resourceId: _billId,
    resultingVersion:
        status == SettleoraSyncOperationResultStatusValues.accepted ? 12 : null,
    safeErrorCode: safeErrorCode,
    safeMessage: safeMessage,
  );
}

SettleoraSyncChangeFeed sampleChangeFeed() {
  return SettleoraSyncChangeFeed(
    sinceVersion: 4,
    nextSinceVersion: 9,
    limit: 25,
    resourceType: SettleoraSyncResourceTypeValues.expenseBill,
    changes: [
      SettleoraSyncChange(
        resourceType: SettleoraSyncResourceTypeValues.expenseBill,
        resourceId: _billId,
        version: 9,
        changedAtUtc: _attemptedAtUtc,
        changeKind: SettleoraSyncChangeKindValues.archived,
        groupId: _groupId,
      ),
    ],
  );
}

api.SyncOperationResponse sampleApiOperationResponse({
  api.SyncOperationStatus status = api.SyncOperationStatusValues.accepted,
}) {
  return api.SyncOperationResponse(
    operationId: 'server-operation-1',
    status: status,
    resourceType: api.SyncResourceTypeValues.expenseBill,
    resourceId: _billId,
    resultingVersion: 12,
    safeErrorCode: null,
    safeMessage: null,
  );
}

class MemorySecureKeyValueStore implements SecureKeyValueStore {
  final values = <String, String>{};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async {
    values[key] = value;
  }

  @override
  Future<void> delete(String key) async {
    values.remove(key);
  }
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

class FakeAccessTokenProvider implements SettleoraAccessTokenProvider {
  FakeAccessTokenProvider(this._accessToken);

  final String? _accessToken;
  int calls = 0;

  @override
  Future<String?> accessToken() async {
    calls += 1;
    return _accessToken;
  }
}

class FakeSyncGeneratedClient implements SettleoraSyncGeneratedClient {
  FakeSyncGeneratedClient({
    this.failure,
    api.SyncOperationResponse? operationResponse,
    api.SyncChangesResponse? changesResponse,
  }) : operationResponse = operationResponse ?? sampleApiOperationResponse(),
       changesResponse =
           changesResponse ??
           const api.SyncChangesResponse(
             sinceVersion: 0,
             nextSinceVersion: 0,
             limit: 25,
             resourceType: null,
             changes: [],
           );

  final Object? failure;
  final api.SyncOperationResponse operationResponse;
  final api.SyncChangesResponse changesResponse;
  int submitCalls = 0;
  int listCalls = 0;
  String? lastAccessToken;
  api.SyncOperationRequest? lastOperationRequest;
  int? lastSinceVersion;
  int? lastLimit;
  api.SyncResourceType? lastResourceType;

  @override
  Future<api.SyncOperationResponse> submitSyncOperation(
    api.SyncOperationRequest request, {
    required String accessToken,
  }) async {
    submitCalls += 1;
    lastAccessToken = accessToken;
    lastOperationRequest = request;
    _throwIfNeeded();
    return operationResponse;
  }

  @override
  Future<api.SyncChangesResponse> listSyncChanges({
    int? sinceVersion,
    int? limit,
    api.SyncResourceType? resourceType,
    required String accessToken,
  }) async {
    listCalls += 1;
    lastAccessToken = accessToken;
    lastSinceVersion = sinceVersion;
    lastLimit = limit;
    lastResourceType = resourceType;
    _throwIfNeeded();
    return changesResponse;
  }

  void _throwIfNeeded() {
    final error = failure;
    if (error != null) {
      throw error;
    }
  }
}

class FakeSyncRepository implements SettleoraSyncRepository {
  FakeSyncRepository({List<Object>? outcomes, List<Object>? changes})
    : _outcomes = List<Object>.of(outcomes ?? const <Object>[]),
      _changes = List<Object>.of(changes ?? const <Object>[]);

  final List<Object> _outcomes;
  final List<Object> _changes;
  int submitCalls = 0;
  int listCalls = 0;
  SettleoraSyncQueueItem? lastSubmittedItem;
  int? lastSinceVersion;
  int? lastLimit;
  SettleoraSyncResourceType? lastResourceType;

  @override
  Future<SettleoraSyncOperationResult> submitOperation(
    SettleoraSyncQueueItem item,
  ) async {
    submitCalls += 1;
    lastSubmittedItem = item;
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
  }) async {
    listCalls += 1;
    lastSinceVersion = sinceVersion;
    lastLimit = limit;
    lastResourceType = resourceType;
    final outcome = _changes.removeAt(0);
    if (outcome is SettleoraSyncChangeFeed) {
      return outcome;
    }

    throw outcome;
  }
}

class BlockingSyncRepository implements SettleoraSyncRepository {
  BlockingSyncRepository(this._completer);

  final Completer<SettleoraSyncOperationResult> _completer;
  int submitCalls = 0;
  SettleoraSyncQueueItem? lastSubmittedItem;

  @override
  Future<SettleoraSyncOperationResult> submitOperation(
    SettleoraSyncQueueItem item,
  ) {
    submitCalls += 1;
    lastSubmittedItem = item;
    return _completer.future;
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
const _groupId = '33333333-3333-3333-3333-333333333333';
const _hiddenBody = {'detail': 'internal-detail'};
final _now = DateTime.utc(2026, 5, 17, 10);
final _attemptedAtUtc = DateTime.utc(2026, 5, 17, 11);
