import 'dart:async';
import 'dart:io';

import 'package:settleora_api_client/settleora_api.dart' as api;

import '../api/settleora_api_client.dart';
import 'sync_queue.dart';
import 'sync_repository.dart';

abstract interface class SettleoraSyncGeneratedClient {
  Future<api.SyncOperationResponse> submitSyncOperation(
    api.SyncOperationRequest request, {
    required String accessToken,
  });

  Future<api.SyncChangesResponse> listSyncChanges({
    int? sinceVersion,
    int? limit,
    api.SyncResourceType? resourceType,
    required String accessToken,
  });
}

class SettleoraGeneratedSyncClient implements SettleoraSyncGeneratedClient {
  const SettleoraGeneratedSyncClient(this._client);

  final api.SettleoraApiClient _client;

  @override
  Future<api.SyncOperationResponse> submitSyncOperation(
    api.SyncOperationRequest request, {
    required String accessToken,
  }) {
    return _client.submitSyncOperation(request, accessToken: accessToken);
  }

  @override
  Future<api.SyncChangesResponse> listSyncChanges({
    int? sinceVersion,
    int? limit,
    api.SyncResourceType? resourceType,
    required String accessToken,
  }) {
    return _client.listSyncChanges(
      sinceVersion: sinceVersion,
      limit: limit,
      resourceType: resourceType,
      accessToken: accessToken,
    );
  }
}

class GeneratedSettleoraSyncRepository implements SettleoraSyncRepository {
  GeneratedSettleoraSyncRepository({
    required SettleoraSyncGeneratedClient client,
    required SettleoraAccessTokenProvider accessTokenProvider,
  }) : _client = client,
       _accessTokenProvider = accessTokenProvider;

  factory GeneratedSettleoraSyncRepository.fromConfiguration({
    required SettleoraApiConfiguration configuration,
    required SettleoraAccessTokenProvider accessTokenProvider,
    SettleoraGeneratedApiClientFactory clientFactory =
        const SettleoraGeneratedApiClientFactory(),
  }) {
    return GeneratedSettleoraSyncRepository(
      client: SettleoraGeneratedSyncClient(clientFactory.create(configuration)),
      accessTokenProvider: accessTokenProvider,
    );
  }

  final SettleoraSyncGeneratedClient _client;
  final SettleoraAccessTokenProvider _accessTokenProvider;

  @override
  Future<SettleoraSyncOperationResult> submitOperation(
    SettleoraSyncQueueItem item,
  ) async {
    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.submitSyncOperation(
          api.SyncOperationRequest(
            idempotencyKey: item.idempotencyKey,
            operationType: item.operationType,
            resourceType: item.resourceType,
            resourceId: item.resourceId,
            baseVersion: item.baseVersion,
            payload: api.JsonObject.from(item.payload),
          ),
          accessToken: accessToken,
        );

        return _mapOperationResult(response);
      } on SettleoraSyncFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraSyncChangeFeed> listChanges({
    int? sinceVersion,
    int? limit,
    SettleoraSyncResourceType? resourceType,
  }) async {
    final boundedSinceVersion = _boundedSinceVersion(sinceVersion);
    final boundedLimit = _boundedLimit(limit);
    final boundedResourceType = _boundedResourceType(resourceType);

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.listSyncChanges(
          sinceVersion: boundedSinceVersion,
          limit: boundedLimit,
          resourceType: boundedResourceType,
          accessToken: accessToken,
        );

        return _mapChangeFeed(response);
      } on SettleoraSyncFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  Future<T> _withAccessToken<T>(
    Future<T> Function(String accessToken) operation,
  ) async {
    final accessToken = await _readAccessToken();
    if (accessToken == null) {
      throw const SettleoraSyncFailure(
        kind: SettleoraSyncFailureKind.sessionRequired,
        message: 'Sign in before syncing pending changes.',
      );
    }

    return operation(accessToken);
  }

  Future<String?> _readAccessToken() async {
    try {
      final token = await _accessTokenProvider.accessToken();
      final trimmed = token?.trim();
      if (trimmed == null || trimmed.isEmpty) {
        return null;
      }

      return trimmed;
    } catch (_) {
      return null;
    }
  }
}

SettleoraSyncOperationResult _mapOperationResult(
  api.SyncOperationResponse response,
) {
  return SettleoraSyncOperationResult(
    operationId: _boundedResponseText(
      response.operationId,
      fallback: 'sync-operation',
      maxLength: 128,
    ),
    status: _boundedKnownStatus(response.status),
    resourceType: _boundedKnownResourceType(response.resourceType),
    resourceId: _boundedNullableResponseText(
      response.resourceId,
      maxLength: 128,
    ),
    resultingVersion: response.resultingVersion,
    safeErrorCode: _boundedNullableResponseText(
      response.safeErrorCode,
      maxLength: 80,
    ),
    safeMessage: _boundedNullableResponseText(
      response.safeMessage,
      maxLength: 240,
    ),
  );
}

SettleoraSyncChangeFeed _mapChangeFeed(api.SyncChangesResponse response) {
  return SettleoraSyncChangeFeed(
    sinceVersion: response.sinceVersion,
    nextSinceVersion: response.nextSinceVersion,
    limit: response.limit,
    resourceType: response.resourceType == null
        ? null
        : _boundedKnownResourceType(response.resourceType!),
    changes: response.changes.map(_mapChange).toList(growable: false),
  );
}

SettleoraSyncChange _mapChange(api.SyncChange response) {
  return SettleoraSyncChange(
    resourceType: _boundedKnownResourceType(response.resourceType),
    resourceId: _boundedResponseText(response.resourceId, maxLength: 128),
    version: response.version,
    changedAtUtc: response.changedAtUtc.toUtc(),
    changeKind: _boundedResponseText(response.changeKind, maxLength: 48),
    groupId: _boundedNullableResponseText(response.groupId, maxLength: 128),
  );
}

SettleoraSyncFailure _mapFailure(Object error) {
  if (error is api.SettleoraApiException) {
    return switch (error.statusCode) {
      400 || 422 => SettleoraSyncFailure(
        kind: SettleoraSyncFailureKind.validation,
        message: 'The sync request is no longer valid.',
        statusCode: error.statusCode,
        safeErrorCode: 'sync_validation_failed',
      ),
      401 => const SettleoraSyncFailure(
        kind: SettleoraSyncFailureKind.sessionExpired,
        message: 'Your session has expired. Sign in again before syncing.',
        statusCode: 401,
        safeErrorCode: 'session_expired',
      ),
      403 => const SettleoraSyncFailure(
        kind: SettleoraSyncFailureKind.denied,
        message: 'This sync action is not available to this account.',
        statusCode: 403,
        safeErrorCode: 'sync_denied',
      ),
      404 || 410 => SettleoraSyncFailure(
        kind: SettleoraSyncFailureKind.unavailable,
        message: 'The sync target is no longer available.',
        statusCode: error.statusCode,
        safeErrorCode: 'sync_target_unavailable',
      ),
      409 => const SettleoraSyncFailure(
        kind: SettleoraSyncFailureKind.conflict,
        message: 'This change needs review before it can sync.',
        statusCode: 409,
        safeErrorCode: 'sync_conflict',
      ),
      >= 500 => SettleoraSyncFailure(
        kind: SettleoraSyncFailureKind.retryable,
        message: 'The server is unavailable. Try syncing again later.',
        statusCode: error.statusCode,
        safeErrorCode: 'server_unavailable',
      ),
      _ => SettleoraSyncFailure(
        kind: SettleoraSyncFailureKind.server,
        message: 'Sync is unavailable right now.',
        statusCode: error.statusCode,
        safeErrorCode: 'sync_unavailable',
      ),
    };
  }

  if (error is SocketException ||
      error is HttpException ||
      error is HandshakeException ||
      error is TimeoutException ||
      error is IOException) {
    return const SettleoraSyncFailure(
      kind: SettleoraSyncFailureKind.retryable,
      message: 'The server is unavailable. Try syncing again later.',
      safeErrorCode: 'network_unavailable',
    );
  }

  return const SettleoraSyncFailure(
    kind: SettleoraSyncFailureKind.server,
    message: 'Sync is unavailable right now.',
    safeErrorCode: 'sync_unavailable',
  );
}

int? _boundedSinceVersion(int? value) {
  if (value == null) {
    return null;
  }

  if (value < 0) {
    throw const SettleoraSyncFailure(
      kind: SettleoraSyncFailureKind.validation,
      message: 'Choose a valid sync version.',
      safeErrorCode: 'invalid_since_version',
    );
  }

  return value;
}

int? _boundedLimit(int? value) {
  if (value == null) {
    return null;
  }

  if (value < 1 || value > 100) {
    throw const SettleoraSyncFailure(
      kind: SettleoraSyncFailureKind.validation,
      message: 'Choose a sync change limit from 1 to 100.',
      safeErrorCode: 'invalid_limit',
    );
  }

  return value;
}

api.SyncResourceType? _boundedResourceType(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }

  return _boundedKnownResourceType(trimmed);
}

SettleoraSyncOperationResultStatus _boundedKnownStatus(String value) {
  if (SettleoraSyncOperationResultStatusValues.values.contains(value)) {
    return value;
  }

  throw const SettleoraSyncFailure(
    kind: SettleoraSyncFailureKind.server,
    message: 'Sync returned an unsupported result.',
    safeErrorCode: 'unsupported_sync_result',
  );
}

SettleoraSyncResourceType _boundedKnownResourceType(String value) {
  if (SettleoraSyncResourceTypeValues.values.contains(value)) {
    return value;
  }

  throw const SettleoraSyncFailure(
    kind: SettleoraSyncFailureKind.validation,
    message: 'Choose a supported sync resource type.',
    safeErrorCode: 'unsupported_resource_type',
  );
}

String _boundedResponseText(
  String value, {
  String fallback = 'sync',
  required int maxLength,
}) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    return fallback;
  }

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return trimmed.substring(0, maxLength);
}

String? _boundedNullableResponseText(String? value, {required int maxLength}) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return trimmed.substring(0, maxLength);
}
