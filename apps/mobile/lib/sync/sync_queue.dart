import 'dart:convert';
import 'dart:math';

import '../app/secure_storage.dart';

typedef SettleoraSyncOperationType = String;

class SettleoraSyncOperationTypeValues {
  const SettleoraSyncOperationTypeValues._();

  static const SettleoraSyncOperationType billArchive = 'bill_archive';
  static const SettleoraSyncOperationType billRestore = 'bill_restore';
  static const Set<SettleoraSyncOperationType> values = {
    billArchive,
    billRestore,
  };
}

typedef SettleoraSyncResourceType = String;

class SettleoraSyncResourceTypeValues {
  const SettleoraSyncResourceTypeValues._();

  static const SettleoraSyncResourceType expenseBill = 'expense_bill';
  static const Set<SettleoraSyncResourceType> values = {expenseBill};
}

typedef SettleoraSyncQueueItemState = String;

class SettleoraSyncQueueItemStateValues {
  const SettleoraSyncQueueItemStateValues._();

  static const SettleoraSyncQueueItemState queued = 'queued';
  static const SettleoraSyncQueueItemState syncing = 'syncing';
  static const SettleoraSyncQueueItemState synced = 'synced';
  static const SettleoraSyncQueueItemState failed = 'failed';
  static const SettleoraSyncQueueItemState conflict = 'conflict';
  static const SettleoraSyncQueueItemState cancelled = 'cancelled';
  static const Set<SettleoraSyncQueueItemState> values = {
    queued,
    syncing,
    synced,
    failed,
    conflict,
    cancelled,
  };
}

enum SettleoraSyncQueueFailureKind { invalidData, capacity, storage }

class SettleoraSyncQueueFailure implements Exception {
  const SettleoraSyncQueueFailure({required this.kind, required this.message});

  final SettleoraSyncQueueFailureKind kind;
  final String message;

  @override
  String toString() => 'SettleoraSyncQueueFailure($kind)';
}

class SettleoraSyncQueueItem {
  SettleoraSyncQueueItem({
    required this.id,
    required this.idempotencyKey,
    required this.operationType,
    required this.resourceType,
    required this.resourceId,
    required this.baseVersion,
    required Map<String, Object?> payload,
    required this.state,
    required this.safeErrorCode,
    required this.safeMessage,
    required this.createdAtUtc,
    required this.updatedAtUtc,
    required this.lastAttemptAtUtc,
    required this.attemptCount,
  }) : payload = Map.unmodifiable(payload) {
    _validateItem(this);
  }

  factory SettleoraSyncQueueItem.billArchive({
    required String resourceId,
    int? baseVersion,
    DateTime? now,
    String Function()? idGenerator,
  }) {
    return SettleoraSyncQueueItem._billLifecycle(
      operationType: SettleoraSyncOperationTypeValues.billArchive,
      resourceId: resourceId,
      baseVersion: baseVersion,
      now: now,
      idGenerator: idGenerator,
    );
  }

  factory SettleoraSyncQueueItem.billRestore({
    required String resourceId,
    int? baseVersion,
    DateTime? now,
    String Function()? idGenerator,
  }) {
    return SettleoraSyncQueueItem._billLifecycle(
      operationType: SettleoraSyncOperationTypeValues.billRestore,
      resourceId: resourceId,
      baseVersion: baseVersion,
      now: now,
      idGenerator: idGenerator,
    );
  }

  factory SettleoraSyncQueueItem._billLifecycle({
    required SettleoraSyncOperationType operationType,
    required String resourceId,
    required int? baseVersion,
    required DateTime? now,
    required String Function()? idGenerator,
  }) {
    final itemId = idGenerator?.call() ?? generateSettleoraSyncQueueItemId();
    final createdAtUtc = (now ?? DateTime.now()).toUtc();
    return SettleoraSyncQueueItem(
      id: itemId,
      idempotencyKey: _buildIdempotencyKey(
        itemId: itemId,
        operationType: operationType,
        resourceType: SettleoraSyncResourceTypeValues.expenseBill,
        resourceId: resourceId,
      ),
      operationType: operationType,
      resourceType: SettleoraSyncResourceTypeValues.expenseBill,
      resourceId: resourceId,
      baseVersion: baseVersion,
      payload: const {},
      state: SettleoraSyncQueueItemStateValues.queued,
      safeErrorCode: null,
      safeMessage: null,
      createdAtUtc: createdAtUtc,
      updatedAtUtc: createdAtUtc,
      lastAttemptAtUtc: null,
      attemptCount: 0,
    );
  }

  factory SettleoraSyncQueueItem.fromJson(Map<String, Object?> json) {
    final payload = json['payload'];
    if (payload is! Map) {
      throw const FormatException('Sync queue payload is invalid.');
    }

    return SettleoraSyncQueueItem(
      id: _readString(json, 'id'),
      idempotencyKey: _readString(json, 'idempotencyKey'),
      operationType: _readString(json, 'operationType'),
      resourceType: _readString(json, 'resourceType'),
      resourceId: _readString(json, 'resourceId'),
      baseVersion: _readOptionalInt(json, 'baseVersion'),
      payload: Map<String, Object?>.from(payload),
      state: _readString(json, 'state'),
      safeErrorCode: _readOptionalString(json, 'safeErrorCode'),
      safeMessage: _readOptionalString(json, 'safeMessage'),
      createdAtUtc: _readDateTime(json, 'createdAtUtc'),
      updatedAtUtc: _readDateTime(json, 'updatedAtUtc'),
      lastAttemptAtUtc: _readOptionalDateTime(json, 'lastAttemptAtUtc'),
      attemptCount: _readInt(json, 'attemptCount'),
    );
  }

  final String id;
  final String idempotencyKey;
  final SettleoraSyncOperationType operationType;
  final SettleoraSyncResourceType resourceType;
  final String resourceId;
  final int? baseVersion;
  final Map<String, Object?> payload;
  final SettleoraSyncQueueItemState state;
  final String? safeErrorCode;
  final String? safeMessage;
  final DateTime createdAtUtc;
  final DateTime updatedAtUtc;
  final DateTime? lastAttemptAtUtc;
  final int attemptCount;

  bool get isRetryable {
    return state == SettleoraSyncQueueItemStateValues.queued ||
        state == SettleoraSyncQueueItemStateValues.failed;
  }

  SettleoraSyncQueueItem copyWith({
    SettleoraSyncQueueItemState? state,
    DateTime? updatedAtUtc,
    DateTime? lastAttemptAtUtc,
    int? attemptCount,
    String? safeErrorCode,
    String? safeMessage,
    bool clearSafeError = false,
  }) {
    return SettleoraSyncQueueItem(
      id: id,
      idempotencyKey: idempotencyKey,
      operationType: operationType,
      resourceType: resourceType,
      resourceId: resourceId,
      baseVersion: baseVersion,
      payload: payload,
      state: state ?? this.state,
      safeErrorCode: clearSafeError
          ? null
          : safeErrorCode ?? this.safeErrorCode,
      safeMessage: clearSafeError ? null : safeMessage ?? this.safeMessage,
      createdAtUtc: createdAtUtc,
      updatedAtUtc: updatedAtUtc ?? this.updatedAtUtc,
      lastAttemptAtUtc: lastAttemptAtUtc ?? this.lastAttemptAtUtc,
      attemptCount: attemptCount ?? this.attemptCount,
    );
  }

  Map<String, Object?> toJson() {
    return {
      'id': id,
      'idempotencyKey': idempotencyKey,
      'operationType': operationType,
      'resourceType': resourceType,
      'resourceId': resourceId,
      'baseVersion': baseVersion,
      'payload': payload,
      'state': state,
      'safeErrorCode': safeErrorCode,
      'safeMessage': safeMessage,
      'createdAtUtc': createdAtUtc.toUtc().toIso8601String(),
      'updatedAtUtc': updatedAtUtc.toUtc().toIso8601String(),
      'lastAttemptAtUtc': lastAttemptAtUtc?.toUtc().toIso8601String(),
      'attemptCount': attemptCount,
    };
  }

  @override
  String toString() {
    return 'SettleoraSyncQueueItem(operationType: $operationType, resourceType: $resourceType, state: $state)';
  }
}

class SettleoraSyncQueueState {
  SettleoraSyncQueueState({required Iterable<SettleoraSyncQueueItem> items})
    : items = List.unmodifiable(items);

  factory SettleoraSyncQueueState.empty() {
    return SettleoraSyncQueueState(items: const []);
  }

  factory SettleoraSyncQueueState.fromJson(Map<String, Object?> json) {
    final items = json['items'];
    if (items is! List) {
      throw const FormatException('Sync queue item list is invalid.');
    }

    return SettleoraSyncQueueState(
      items: items.map((item) {
        if (item is! Map) {
          throw const FormatException('Sync queue item is invalid.');
        }

        return SettleoraSyncQueueItem.fromJson(Map<String, Object?>.from(item));
      }),
    );
  }

  final List<SettleoraSyncQueueItem> items;

  int get queuedCount => _count(SettleoraSyncQueueItemStateValues.queued);

  int get failedCount => _count(SettleoraSyncQueueItemStateValues.failed);

  int get conflictCount => _count(SettleoraSyncQueueItemStateValues.conflict);

  int get pendingCount => items.where((item) => item.isRetryable).length;

  SettleoraSyncQueueState enqueue(
    SettleoraSyncQueueItem item, {
    required int maxItems,
  }) {
    if (items.any((existing) => existing.id == item.id)) {
      throw const SettleoraSyncQueueFailure(
        kind: SettleoraSyncQueueFailureKind.invalidData,
        message: 'Sync queue item already exists.',
      );
    }

    if (items.length >= maxItems) {
      throw const SettleoraSyncQueueFailure(
        kind: SettleoraSyncQueueFailureKind.capacity,
        message: 'The sync queue is full. Sync or review pending work first.',
      );
    }

    return SettleoraSyncQueueState(items: [...items, item]);
  }

  SettleoraSyncQueueState replaceItem(SettleoraSyncQueueItem item) {
    var replaced = false;
    final updatedItems = items
        .map((existing) {
          if (existing.id != item.id) {
            return existing;
          }

          replaced = true;
          return item;
        })
        .toList(growable: false);

    if (!replaced) {
      throw const SettleoraSyncQueueFailure(
        kind: SettleoraSyncQueueFailureKind.invalidData,
        message: 'Sync queue item is no longer available.',
      );
    }

    return SettleoraSyncQueueState(items: updatedItems);
  }

  List<SettleoraSyncQueueItem> retryableItems({int limit = 25}) {
    final boundedLimit = limit.clamp(1, 100).toInt();
    return items
        .where((item) => item.isRetryable)
        .take(boundedLimit)
        .toList(growable: false);
  }

  Map<String, Object?> toJson() {
    return {
      'version': 1,
      'items': items.map((item) => item.toJson()).toList(growable: false),
    };
  }

  int _count(SettleoraSyncQueueItemState state) {
    return items.where((item) => item.state == state).length;
  }
}

abstract class SettleoraSyncQueueStore {
  int get maxItemCount;

  Future<SettleoraSyncQueueState> read();

  Future<void> write(SettleoraSyncQueueState state);

  Future<SettleoraSyncQueueState> enqueue(SettleoraSyncQueueItem item) async {
    final next = (await read()).enqueue(item, maxItems: maxItemCount);
    await write(next);
    return next;
  }

  Future<SettleoraSyncQueueState> replaceItem(
    SettleoraSyncQueueItem item,
  ) async {
    final next = (await read()).replaceItem(item);
    await write(next);
    return next;
  }
}

class SecureStorageSyncQueueStore extends SettleoraSyncQueueStore {
  SecureStorageSyncQueueStore({
    SecureKeyValueStore? keyValueStore,
    this.maxItemCount = 100,
    this.maxSerializedBytes = 65536,
  }) : _keyValueStore = keyValueStore ?? FlutterSecureKeyValueStore();

  final SecureKeyValueStore _keyValueStore;

  @override
  final int maxItemCount;
  final int maxSerializedBytes;

  @override
  Future<SettleoraSyncQueueState> read() async {
    final raw = await _keyValueStore.read(_syncQueueKey);
    if (raw == null || raw.trim().isEmpty) {
      return SettleoraSyncQueueState.empty();
    }

    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) {
        throw const FormatException('Sync queue root is invalid.');
      }

      final state = SettleoraSyncQueueState.fromJson(
        Map<String, Object?>.from(decoded),
      );
      _validateStateCapacity(state);
      return state;
    } on FormatException catch (error) {
      throw SettleoraSyncQueueFailure(
        kind: SettleoraSyncQueueFailureKind.storage,
        message: error.message,
      );
    } on TypeError {
      throw const SettleoraSyncQueueFailure(
        kind: SettleoraSyncQueueFailureKind.storage,
        message: 'The saved sync queue is invalid.',
      );
    }
  }

  @override
  Future<void> write(SettleoraSyncQueueState state) async {
    _validateStateCapacity(state);
    final raw = jsonEncode(state.toJson());
    if (utf8.encode(raw).length > maxSerializedBytes) {
      throw const SettleoraSyncQueueFailure(
        kind: SettleoraSyncQueueFailureKind.capacity,
        message: 'The sync queue is too large to store safely.',
      );
    }

    await _keyValueStore.write(_syncQueueKey, raw);
  }

  Future<void> clear() {
    return _keyValueStore.delete(_syncQueueKey);
  }

  void _validateStateCapacity(SettleoraSyncQueueState state) {
    if (state.items.length > maxItemCount) {
      throw const SettleoraSyncQueueFailure(
        kind: SettleoraSyncQueueFailureKind.capacity,
        message: 'The saved sync queue is over capacity.',
      );
    }
  }
}

String generateSettleoraSyncQueueItemId({DateTime? now, Random? random}) {
  final timestamp = (now ?? DateTime.now()).toUtc().microsecondsSinceEpoch;
  final source = random ?? Random.secure();
  final suffix = List.generate(
    16,
    (_) => _idAlphabet[source.nextInt(_idAlphabet.length)],
  ).join();
  return 'sync_${timestamp}_$suffix';
}

String _buildIdempotencyKey({
  required String itemId,
  required SettleoraSyncOperationType operationType,
  required SettleoraSyncResourceType resourceType,
  required String resourceId,
}) {
  return 'mobile-sync:$operationType:$resourceType:$resourceId:$itemId';
}

void _validateItem(SettleoraSyncQueueItem item) {
  _validateBoundedText(item.id, fieldName: 'id', maxLength: 96);
  _validateBoundedText(
    item.idempotencyKey,
    fieldName: 'idempotencyKey',
    maxLength: 220,
  );
  _validateAllowedValue(
    item.operationType,
    SettleoraSyncOperationTypeValues.values,
    fieldName: 'operationType',
  );
  _validateAllowedValue(
    item.resourceType,
    SettleoraSyncResourceTypeValues.values,
    fieldName: 'resourceType',
  );
  _validateBoundedText(item.resourceId, fieldName: 'resourceId');
  _validateAllowedValue(
    item.state,
    SettleoraSyncQueueItemStateValues.values,
    fieldName: 'state',
  );
  final baseVersion = item.baseVersion;
  if (baseVersion != null && baseVersion < 0) {
    throw const SettleoraSyncQueueFailure(
      kind: SettleoraSyncQueueFailureKind.invalidData,
      message: 'Sync base version is invalid.',
    );
  }
  if (item.attemptCount < 0) {
    throw const SettleoraSyncQueueFailure(
      kind: SettleoraSyncQueueFailureKind.invalidData,
      message: 'Sync attempt count is invalid.',
    );
  }

  _validateOptionalBoundedText(
    item.safeErrorCode,
    fieldName: 'safeErrorCode',
    maxLength: 80,
  );
  _validateOptionalBoundedText(
    item.safeMessage,
    fieldName: 'safeMessage',
    maxLength: 240,
  );
  _validatePayload(item.payload);
}

void _validatePayload(Map<String, Object?> payload) {
  if (payload.length > 16) {
    throw const SettleoraSyncQueueFailure(
      kind: SettleoraSyncQueueFailureKind.invalidData,
      message: 'Sync payload has too many fields.',
    );
  }

  for (final entry in payload.entries) {
    _validateBoundedText(entry.key, fieldName: 'payloadKey', maxLength: 64);
    if (_looksSensitive(entry.key)) {
      throw const SettleoraSyncQueueFailure(
        kind: SettleoraSyncQueueFailureKind.invalidData,
        message: 'Sync payload contains unsupported sensitive fields.',
      );
    }

    final value = entry.value;
    if (value is String) {
      _validateBoundedText(value, fieldName: 'payloadValue', maxLength: 128);
      if (_looksSensitive(value)) {
        throw const SettleoraSyncQueueFailure(
          kind: SettleoraSyncQueueFailureKind.invalidData,
          message: 'Sync payload contains unsupported sensitive values.',
        );
      }
    } else if (value != null && value is! num && value is! bool) {
      throw const SettleoraSyncQueueFailure(
        kind: SettleoraSyncQueueFailureKind.invalidData,
        message: 'Sync payload values must be bounded primitives.',
      );
    }
  }

  if (utf8.encode(jsonEncode(payload)).length > 2048) {
    throw const SettleoraSyncQueueFailure(
      kind: SettleoraSyncQueueFailureKind.invalidData,
      message: 'Sync payload is too large.',
    );
  }
}

void _validateAllowedValue(
  String value,
  Set<String> allowedValues, {
  required String fieldName,
}) {
  if (!allowedValues.contains(value)) {
    throw SettleoraSyncQueueFailure(
      kind: SettleoraSyncQueueFailureKind.invalidData,
      message: 'Unsupported sync $fieldName.',
    );
  }
}

void _validateBoundedText(
  String value, {
  required String fieldName,
  int maxLength = 128,
}) {
  final trimmed = value.trim();
  if (trimmed.isEmpty || trimmed.length > maxLength) {
    throw SettleoraSyncQueueFailure(
      kind: SettleoraSyncQueueFailureKind.invalidData,
      message: 'Sync $fieldName is invalid.',
    );
  }
}

void _validateOptionalBoundedText(
  String? value, {
  required String fieldName,
  required int maxLength,
}) {
  if (value == null) {
    return;
  }

  if (value.trim().isEmpty || value.length > maxLength) {
    throw SettleoraSyncQueueFailure(
      kind: SettleoraSyncQueueFailureKind.invalidData,
      message: 'Sync $fieldName is invalid.',
    );
  }
}

bool _looksSensitive(String value) {
  final normalized = value.toLowerCase();
  return normalized.contains('token') ||
      normalized.contains('password') ||
      normalized.contains('refresh') ||
      normalized.contains('credential') ||
      normalized.contains('payment') ||
      normalized.contains('ocr') ||
      normalized.contains('receipt') ||
      normalized.contains('proof') ||
      normalized.contains('filepath') ||
      normalized.contains('file_path') ||
      normalized.contains('authaccount') ||
      normalized.contains('auth_account');
}

String _readString(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value is! String) {
    throw FormatException('Sync queue $key is invalid.');
  }

  return value;
}

String? _readOptionalString(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value == null) {
    return null;
  }

  if (value is! String) {
    throw FormatException('Sync queue $key is invalid.');
  }

  return value;
}

int _readInt(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value is! num) {
    throw FormatException('Sync queue $key is invalid.');
  }

  return value.toInt();
}

int? _readOptionalInt(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value == null) {
    return null;
  }

  if (value is! num) {
    throw FormatException('Sync queue $key is invalid.');
  }

  return value.toInt();
}

DateTime _readDateTime(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value is! String) {
    throw FormatException('Sync queue $key is invalid.');
  }

  return DateTime.parse(value).toUtc();
}

DateTime? _readOptionalDateTime(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value == null) {
    return null;
  }

  if (value is! String) {
    throw FormatException('Sync queue $key is invalid.');
  }

  return DateTime.parse(value).toUtc();
}

const _idAlphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
const _syncQueueKey = 'settleora.sync_queue.v1';
