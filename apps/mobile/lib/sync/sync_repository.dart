import 'sync_queue.dart';

typedef SettleoraSyncOperationResultStatus = String;

class SettleoraSyncOperationResultStatusValues {
  const SettleoraSyncOperationResultStatusValues._();

  static const SettleoraSyncOperationResultStatus accepted = 'accepted';
  static const SettleoraSyncOperationResultStatus replayed = 'replayed';
  static const SettleoraSyncOperationResultStatus rejected = 'rejected';
  static const SettleoraSyncOperationResultStatus conflict = 'conflict';
  static const Set<SettleoraSyncOperationResultStatus> values = {
    accepted,
    replayed,
    rejected,
    conflict,
  };
}

typedef SettleoraSyncChangeKind = String;

class SettleoraSyncChangeKindValues {
  const SettleoraSyncChangeKindValues._();

  static const SettleoraSyncChangeKind updated = 'updated';
  static const SettleoraSyncChangeKind archived = 'archived';
  static const SettleoraSyncChangeKind restored = 'restored';
}

enum SettleoraSyncFailureKind {
  sessionRequired,
  sessionExpired,
  denied,
  unavailable,
  conflict,
  validation,
  retryable,
  server,
}

class SettleoraSyncFailure implements Exception {
  const SettleoraSyncFailure({
    required this.kind,
    required this.message,
    this.statusCode,
    this.safeErrorCode,
  });

  final SettleoraSyncFailureKind kind;
  final String message;
  final int? statusCode;
  final String? safeErrorCode;

  bool get isSessionBlocking {
    return kind == SettleoraSyncFailureKind.sessionRequired ||
        kind == SettleoraSyncFailureKind.sessionExpired;
  }

  bool get isRetryable => kind == SettleoraSyncFailureKind.retryable;

  String get title {
    return switch (kind) {
      SettleoraSyncFailureKind.sessionRequired => 'Sign in required',
      SettleoraSyncFailureKind.sessionExpired => 'Sign in again',
      SettleoraSyncFailureKind.denied => 'Sync unavailable',
      SettleoraSyncFailureKind.unavailable => 'Sync unavailable',
      SettleoraSyncFailureKind.conflict => 'Needs review',
      SettleoraSyncFailureKind.validation => 'Sync request rejected',
      SettleoraSyncFailureKind.retryable => 'Server unavailable',
      SettleoraSyncFailureKind.server => 'Sync unavailable',
    };
  }

  @override
  String toString() {
    return 'SettleoraSyncFailure($kind, statusCode: $statusCode)';
  }
}

class SettleoraSyncOperationResult {
  const SettleoraSyncOperationResult({
    required this.operationId,
    required this.status,
    required this.resourceType,
    required this.resourceId,
    required this.resultingVersion,
    required this.safeErrorCode,
    required this.safeMessage,
  });

  final String operationId;
  final SettleoraSyncOperationResultStatus status;
  final SettleoraSyncResourceType resourceType;
  final String? resourceId;
  final int? resultingVersion;
  final String? safeErrorCode;
  final String? safeMessage;

  bool get isSynced {
    return status == SettleoraSyncOperationResultStatusValues.accepted ||
        status == SettleoraSyncOperationResultStatusValues.replayed;
  }

  bool get isRejected {
    return status == SettleoraSyncOperationResultStatusValues.rejected;
  }

  bool get isConflict {
    return status == SettleoraSyncOperationResultStatusValues.conflict;
  }
}

class SettleoraSyncChangeFeed {
  const SettleoraSyncChangeFeed({
    required this.sinceVersion,
    required this.nextSinceVersion,
    required this.limit,
    required this.resourceType,
    required this.changes,
  });

  final int sinceVersion;
  final int nextSinceVersion;
  final int limit;
  final SettleoraSyncResourceType? resourceType;
  final List<SettleoraSyncChange> changes;
}

class SettleoraSyncChange {
  const SettleoraSyncChange({
    required this.resourceType,
    required this.resourceId,
    required this.version,
    required this.changedAtUtc,
    required this.changeKind,
    required this.groupId,
  });

  final SettleoraSyncResourceType resourceType;
  final String resourceId;
  final int version;
  final DateTime changedAtUtc;
  final SettleoraSyncChangeKind changeKind;
  final String? groupId;
}

abstract interface class SettleoraSyncRepository {
  Future<SettleoraSyncOperationResult> submitOperation(
    SettleoraSyncQueueItem item,
  );

  Future<SettleoraSyncChangeFeed> listChanges({
    int? sinceVersion,
    int? limit,
    SettleoraSyncResourceType? resourceType,
  });
}
