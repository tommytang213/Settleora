import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/app_configuration.dart';
import 'package:mobile/app/auth_session_repository.dart';
import 'package:mobile/app/local_data_backup.dart';
import 'package:mobile/app/secure_storage.dart';
import 'package:mobile/bills/bill_sync_controller.dart';
import 'package:mobile/sync/sync_queue.dart';
import 'package:mobile/sync/sync_queue_processor.dart';
import 'package:mobile/sync/sync_repository.dart';

void main() {
  test(
    'buildExport creates a versioned backup without session material',
    () async {
      final keyValueStore = MemorySecureKeyValueStore();
      final secureStorage = SettleoraSecureStorage(
        keyValueStore: keyValueStore,
      );
      await secureStorage.writeAppConfiguration(
        SettleoraAppConfiguration.server(
          serverBaseUri: Uri.parse('https://settleora.private.example'),
        ),
      );
      await secureStorage.writeServerSession(
        SettleoraServerSessionMaterial(
          accessToken: 'access-token-secret',
          refreshCredential: 'refresh-credential-secret',
          accessSessionExpiresAtUtc: DateTime.utc(2026, 6, 16, 13),
          refreshIdleExpiresAtUtc: DateTime.utc(2026, 6, 17),
          refreshAbsoluteExpiresAtUtc: DateTime.utc(2026, 6, 18),
        ),
      );
      final queueStore = MemorySyncQueueStore(
        state: SettleoraSyncQueueState(
          items: [
            SettleoraSyncQueueItem.billArchive(
              resourceId: 'bill-1',
              baseVersion: 7,
              now: DateTime.utc(2026, 6, 16, 11),
              idGenerator: () => 'sync-archive-1',
            ),
            SettleoraSyncQueueItem.billRestore(
              resourceId: 'bill-2',
              now: DateTime.utc(2026, 6, 16, 11, 5),
              idGenerator: () => 'sync-restore-1',
            ).copyWith(
              state: SettleoraSyncQueueItemStateValues.failed,
              safeErrorCode: 'stale_version',
              safeMessage: 'Refresh the bill before trying again.',
            ),
          ],
        ),
      );
      final service = SecureStorageLocalDataBackupService(
        secureStorage: secureStorage,
        billSyncController: SettleoraBillSyncController(
          queueStore: queueStore,
          queueProcessor: SettleoraSyncQueueProcessor(
            queueStore: queueStore,
            repository: FakeSyncRepository(),
          ),
        ),
        now: () => DateTime.utc(2026, 6, 16, 12),
      );

      final export = await service.buildExport(
        currentUser: sampleCurrentUser(),
      );
      final decoded = jsonDecode(export.encodedJson) as Map<String, Object?>;

      expect(decoded['backupSchemaVersion'], 1);
      expect(decoded['generatedAtUtc'], '2026-06-16T12:00:00.000Z');
      expect((decoded['source'] as Map)['app'], 'settleora-mobile');
      expect((decoded['scope'] as Map)['coverage'], 'mobile_local_state_only');
      expect(
        (decoded['scope'] as Map)['includesCompleteServerBackup'],
        isFalse,
      );
      expect((decoded['scope'] as Map)['includesSessionMaterial'], isFalse);
      expect((decoded['scope'] as Map)['serverBaseUriIncluded'], isFalse);
      expect(export.preview.countFor('syncQueue'), 2);
      expect(export.preview.countFor('appConfiguration'), 1);
      expect(export.preview.restoreMode, 'preview_only');
      expect(export.encodedJson, isNot(contains('access-token-secret')));
      expect(export.encodedJson, isNot(contains('refresh-credential-secret')));
      expect(export.encodedJson, isNot(contains('settleora.private.example')));
      expect(export.encodedJson, isNot(contains('password')));
      expect(export.encodedJson, isNot(contains('objectKey')));
    },
  );

  test('previewImport validates JSON and blocks sensitive material', () async {
    final service = SecureStorageLocalDataBackupService(
      secureStorage: SettleoraSecureStorage(
        keyValueStore: MemorySecureKeyValueStore(),
      ),
      billSyncController: sampleBillSyncController(),
      now: () => DateTime.utc(2026, 6, 16, 12),
    );

    final valid = service.previewImport(
      jsonEncode({
        'backupSchemaVersion': 1,
        'generatedAtUtc': '2026-06-16T12:00:00Z',
        'source': {'app': 'settleora-mobile'},
        'payload': {
          'appConfiguration': {'mode': 'server'},
          'syncQueue': {
            'items': [
              {'id': 'sync-1', 'state': 'queued'},
            ],
          },
        },
      }),
    );

    expect(valid.isValid, isTrue);
    expect(valid.schemaVersion, 1);
    expect(valid.countFor('syncQueue'), 1);
    expect(valid.warnings.single, contains('preview-only'));

    final unsupported = service.previewImport(
      jsonEncode({
        'backupSchemaVersion': 99,
        'source': {'app': 'settleora-mobile'},
        'payload': {
          'syncQueue': {'items': []},
        },
      }),
    );
    expect(unsupported.isValid, isTrue);
    expect(unsupported.warnings.first, contains('not supported'));

    final invalidJson = service.previewImport('{not json');
    expect(invalidJson.isValid, isFalse);
    expect(invalidJson.failureMessage, 'The backup JSON is not valid.');

    final sensitive = service.previewImport(
      jsonEncode({
        'backupSchemaVersion': 1,
        'payload': {'accessToken': 'secret'},
      }),
    );
    expect(sensitive.isValid, isFalse);
    expect(
      sensitive.failureMessage,
      'The backup contains unsupported sensitive material.',
    );
  });
}

SettleoraCurrentUser sampleCurrentUser() {
  return SettleoraCurrentUser(
    userProfileId: 'profile-1',
    displayName: 'Taylor',
    defaultCurrency: 'USD',
    roles: const ['owner'],
    sessionExpiresAtUtc: DateTime.utc(2026, 6, 16, 13),
  );
}

SettleoraBillSyncController sampleBillSyncController() {
  final queueStore = MemorySyncQueueStore();
  return SettleoraBillSyncController(
    queueStore: queueStore,
    queueProcessor: SettleoraSyncQueueProcessor(
      queueStore: queueStore,
      repository: FakeSyncRepository(),
    ),
  );
}

class MemorySecureKeyValueStore implements SecureKeyValueStore {
  final Map<String, String> values = {};

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
  MemorySyncQueueStore({SettleoraSyncQueueState? state})
    : state = state ?? SettleoraSyncQueueState.empty();

  SettleoraSyncQueueState state;

  @override
  int get maxItemCount => 100;

  @override
  Future<SettleoraSyncQueueState> read() async => state;

  @override
  Future<void> write(SettleoraSyncQueueState state) async {
    this.state = state;
  }
}

class FakeSyncRepository implements SettleoraSyncRepository {
  @override
  Future<SettleoraSyncOperationResult> submitOperation(
    SettleoraSyncQueueItem item,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSyncOperationResult> getOperation(String syncOperationId) {
    throw UnimplementedError();
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
