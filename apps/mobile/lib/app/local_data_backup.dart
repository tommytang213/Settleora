import 'dart:convert';

import '../bills/bill_sync_controller.dart';
import '../sync/sync_queue.dart';
import 'auth_session_repository.dart';
import 'secure_storage.dart';

abstract interface class SettleoraLocalDataBackupService {
  Future<SettleoraLocalDataBackupExport> buildExport({
    required SettleoraCurrentUser currentUser,
  });

  SettleoraLocalDataBackupPreview previewImport(String rawJson);
}

class SettleoraLocalDataBackupExport {
  const SettleoraLocalDataBackupExport({
    required this.backup,
    required this.encodedJson,
    required this.preview,
  });

  final SettleoraLocalDataBackup backup;
  final String encodedJson;
  final SettleoraLocalDataBackupPreview preview;
}

class SettleoraLocalDataBackupPreview {
  const SettleoraLocalDataBackupPreview({
    required this.isValid,
    required this.schemaVersion,
    required this.generatedAtUtc,
    required this.sectionCounts,
    required this.warnings,
    required this.failureMessage,
    required this.restoreMode,
  });

  final bool isValid;
  final int? schemaVersion;
  final DateTime? generatedAtUtc;
  final Map<String, int> sectionCounts;
  final List<String> warnings;
  final String? failureMessage;
  final String restoreMode;

  int countFor(String key) => sectionCounts[key] ?? 0;
}

class SettleoraLocalDataBackup {
  const SettleoraLocalDataBackup({
    required this.schemaVersion,
    required this.generatedAtUtc,
    required this.source,
    required this.scope,
    required this.summaries,
    required this.payload,
  });

  static const int currentSchemaVersion = 1;
  static const String sourceApp = 'settleora-mobile';
  static const String restoreModePreviewOnly = 'preview_only';

  final int schemaVersion;
  final DateTime generatedAtUtc;
  final Map<String, Object?> source;
  final Map<String, Object?> scope;
  final Map<String, Object?> summaries;
  final Map<String, Object?> payload;

  Map<String, Object?> toJson() {
    return {
      'backupSchemaVersion': schemaVersion,
      'generatedAtUtc': generatedAtUtc.toUtc().toIso8601String(),
      'source': source,
      'scope': scope,
      'summaries': summaries,
      'payload': payload,
    };
  }
}

class SecureStorageLocalDataBackupService
    implements SettleoraLocalDataBackupService {
  SecureStorageLocalDataBackupService({
    required SettleoraSecureStorageBoundary secureStorage,
    required SettleoraBillSyncController billSyncController,
    DateTime Function()? now,
  }) : _secureStorage = secureStorage,
       _billSyncController = billSyncController,
       _now = now;

  final SettleoraSecureStorageBoundary _secureStorage;
  final SettleoraBillSyncController _billSyncController;
  final DateTime Function()? _now;

  @override
  Future<SettleoraLocalDataBackupExport> buildExport({
    required SettleoraCurrentUser currentUser,
  }) async {
    final generatedAtUtc = (_now?.call() ?? DateTime.now()).toUtc();
    final configuration = await _secureStorage.readAppConfiguration();
    final syncSnapshot = await _billSyncController.readSnapshot();
    final backup = SettleoraLocalDataBackup(
      schemaVersion: SettleoraLocalDataBackup.currentSchemaVersion,
      generatedAtUtc: generatedAtUtc,
      source: {
        'app': SettleoraLocalDataBackup.sourceApp,
        'generatedBy': 'mobile_local_data_safety',
        'currentUserProfileId': currentUser.userProfileId,
      },
      scope: {
        'coverage': 'mobile_local_state_only',
        'includesServerModeCachedData': true,
        'includesCompleteServerBackup': false,
        'includesSessionMaterial': false,
        'includesFileBytes': false,
        'serverBaseUriIncluded': false,
        'mode': configuration?.mode.storageValue ?? 'unknown',
      },
      summaries: {
        'syncQueue': _syncQueueSummary(syncSnapshot),
        'appConfiguration': {'count': configuration == null ? 0 : 1},
      },
      payload: {
        'appConfiguration': {
          'mode': configuration?.mode.storageValue,
          'serverBaseUriExcluded': true,
        },
        'syncQueue': {
          'items': syncSnapshot.items
              .map(_sanitizedSyncQueueItemJson)
              .toList(growable: false),
        },
      },
    );
    final encodedJson = const JsonEncoder.withIndent(
      '  ',
    ).convert(backup.toJson());

    return SettleoraLocalDataBackupExport(
      backup: backup,
      encodedJson: encodedJson,
      preview: _previewBackupMap(backup.toJson()),
    );
  }

  @override
  SettleoraLocalDataBackupPreview previewImport(String rawJson) {
    if (rawJson.trim().isEmpty) {
      return _invalidPreview('Paste a Settleora backup JSON file first.');
    }

    Object? decoded;
    try {
      decoded = jsonDecode(rawJson);
    } on FormatException {
      return _invalidPreview('The backup JSON is not valid.');
    }

    if (decoded is! Map) {
      return _invalidPreview('The backup root must be a JSON object.');
    }

    final root = Map<String, Object?>.from(decoded);
    if (_containsSensitiveKey(root) || _containsSensitiveString(root)) {
      return _invalidPreview(
        'The backup contains unsupported sensitive material.',
      );
    }

    return _previewBackupMap(root);
  }
}

Map<String, Object?> _syncQueueSummary(SettleoraBillSyncSnapshot snapshot) {
  return {
    'count': snapshot.items.length,
    'queued': snapshot.queuedCount,
    'syncing': snapshot.syncingCount,
    'synced': snapshot.syncedCount,
    'failed': snapshot.failedCount,
    'conflict': snapshot.conflictCount,
  };
}

Map<String, Object?> _sanitizedSyncQueueItemJson(SettleoraSyncQueueItem item) {
  return {
    'id': item.id,
    'operationType': item.operationType,
    'resourceType': item.resourceType,
    'resourceId': item.resourceId,
    'baseVersion': item.baseVersion,
    'state': item.state,
    'safeErrorCode': item.safeErrorCode,
    'safeMessage': item.safeMessage,
    'createdAtUtc': item.createdAtUtc.toUtc().toIso8601String(),
    'updatedAtUtc': item.updatedAtUtc.toUtc().toIso8601String(),
    'lastAttemptAtUtc': item.lastAttemptAtUtc?.toUtc().toIso8601String(),
    'attemptCount': item.attemptCount,
  };
}

SettleoraLocalDataBackupPreview _previewBackupMap(Map<String, Object?> root) {
  final schemaVersion = _readInt(root['backupSchemaVersion']);
  final generatedAtUtc = _readDateTime(root['generatedAtUtc']);
  final warnings = <String>[];

  if (schemaVersion == null) {
    return _invalidPreview('The backup schema version is missing.');
  }

  if (schemaVersion != SettleoraLocalDataBackup.currentSchemaVersion) {
    warnings.add(
      'Schema version $schemaVersion is not supported for restore apply.',
    );
  }

  final source = root['source'];
  if (source is! Map || source['app'] != SettleoraLocalDataBackup.sourceApp) {
    warnings.add('Source app is not recognized as Settleora mobile.');
  }

  final payload = root['payload'];
  if (payload is! Map) {
    return _invalidPreview('The backup payload is missing.');
  }

  final payloadMap = Map<String, Object?>.from(payload);
  final syncQueue = payloadMap['syncQueue'];
  final syncItems = syncQueue is Map ? syncQueue['items'] : null;
  final syncQueueCount = syncItems is List ? syncItems.length : 0;
  final appConfiguration = payloadMap['appConfiguration'];

  warnings.add(
    'Restore is preview-only in this build; no local data will be overwritten.',
  );

  return SettleoraLocalDataBackupPreview(
    isValid: true,
    schemaVersion: schemaVersion,
    generatedAtUtc: generatedAtUtc,
    sectionCounts: {
      'syncQueue': syncQueueCount,
      'appConfiguration': appConfiguration is Map ? 1 : 0,
    },
    warnings: warnings,
    failureMessage: null,
    restoreMode: SettleoraLocalDataBackup.restoreModePreviewOnly,
  );
}

SettleoraLocalDataBackupPreview _invalidPreview(String failureMessage) {
  return SettleoraLocalDataBackupPreview(
    isValid: false,
    schemaVersion: null,
    generatedAtUtc: null,
    sectionCounts: const {},
    warnings: const [],
    failureMessage: failureMessage,
    restoreMode: SettleoraLocalDataBackup.restoreModePreviewOnly,
  );
}

int? _readInt(Object? value) {
  if (value is int) {
    return value;
  }

  if (value is num && value % 1 == 0) {
    return value.toInt();
  }

  return null;
}

DateTime? _readDateTime(Object? value) {
  if (value is! String) {
    return null;
  }

  return DateTime.tryParse(value)?.toUtc();
}

bool _containsSensitiveKey(Object? value) {
  if (value is Map) {
    for (final entry in value.entries) {
      if (_looksSensitive(entry.key.toString())) {
        return true;
      }
      if (_containsSensitiveKey(entry.value)) {
        return true;
      }
    }
  }

  if (value is Iterable) {
    return value.any(_containsSensitiveKey);
  }

  return false;
}

bool _containsSensitiveString(Object? value) {
  if (value is String) {
    return _looksSensitive(value) ||
        value.contains('://') ||
        value.startsWith('/') ||
        RegExp(r'^[A-Za-z]:\\').hasMatch(value);
  }

  if (value is Map) {
    return value.values.any(_containsSensitiveString);
  }

  if (value is Iterable) {
    return value.any(_containsSensitiveString);
  }

  return false;
}

bool _looksSensitive(String value) {
  final normalized = value.toLowerCase();
  const fragments = [
    'token',
    'password',
    'credential',
    'secret',
    'session',
    'bearer',
    'authorization',
    'privateurl',
    'private_url',
    'signedurl',
    'signed_url',
    'paymenthandle',
    'payment_handle',
    'filepath',
    'file_path',
    'storagepath',
    'storage_path',
    'objectkey',
    'object_key',
  ];

  return fragments.any(normalized.contains);
}
