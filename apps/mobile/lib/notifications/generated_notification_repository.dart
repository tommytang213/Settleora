import 'dart:async';
import 'dart:io';

import 'package:settleora_api_client/settleora_api.dart' as api;

import '../api/settleora_api_client.dart';
import 'notification_repository.dart';

abstract interface class SettleoraNotificationGeneratedClient {
  Future<api.InAppNotificationListResponse> listNotifications({
    api.InAppNotificationStatus? status,
    int? limit,
    DateTime? before,
    required String accessToken,
  });

  Future<api.InAppNotificationSummaryResponse> getNotificationSummary({
    required String accessToken,
  });

  Future<api.InAppNotificationResponse> markNotificationRead(
    String notificationId, {
    required String accessToken,
  });

  Future<api.InAppNotificationSummaryResponse> markAllNotificationsRead({
    required String accessToken,
  });

  Future<api.InAppNotificationResponse> archiveNotification(
    String notificationId, {
    required String accessToken,
  });
}

class SettleoraGeneratedNotificationClient
    implements SettleoraNotificationGeneratedClient {
  const SettleoraGeneratedNotificationClient(this._client);

  final api.SettleoraApiClient _client;

  @override
  Future<api.InAppNotificationListResponse> listNotifications({
    api.InAppNotificationStatus? status,
    int? limit,
    DateTime? before,
    required String accessToken,
  }) {
    return _client.listNotifications(
      status: status,
      limit: limit,
      before: before,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.InAppNotificationSummaryResponse> getNotificationSummary({
    required String accessToken,
  }) {
    return _client.getNotificationSummary(accessToken: accessToken);
  }

  @override
  Future<api.InAppNotificationResponse> markNotificationRead(
    String notificationId, {
    required String accessToken,
  }) {
    return _client.markNotificationRead(
      notificationId,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.InAppNotificationSummaryResponse> markAllNotificationsRead({
    required String accessToken,
  }) {
    return _client.markAllNotificationsRead(accessToken: accessToken);
  }

  @override
  Future<api.InAppNotificationResponse> archiveNotification(
    String notificationId, {
    required String accessToken,
  }) {
    return _client.archiveNotification(
      notificationId,
      accessToken: accessToken,
    );
  }
}

class GeneratedSettleoraNotificationRepository
    implements SettleoraNotificationRepository {
  GeneratedSettleoraNotificationRepository({
    required SettleoraNotificationGeneratedClient client,
    required SettleoraAccessTokenProvider accessTokenProvider,
  }) : _client = client,
       _accessTokenProvider = accessTokenProvider;

  factory GeneratedSettleoraNotificationRepository.fromConfiguration({
    required SettleoraApiConfiguration configuration,
    required SettleoraAccessTokenProvider accessTokenProvider,
    SettleoraGeneratedApiClientFactory clientFactory =
        const SettleoraGeneratedApiClientFactory(),
  }) {
    return GeneratedSettleoraNotificationRepository(
      client: SettleoraGeneratedNotificationClient(
        clientFactory.create(configuration),
      ),
      accessTokenProvider: accessTokenProvider,
    );
  }

  final SettleoraNotificationGeneratedClient _client;
  final SettleoraAccessTokenProvider _accessTokenProvider;

  @override
  Future<List<SettleoraNotificationRow>> listNotifications({
    SettleoraNotificationStatus? status,
    int limit = 50,
    DateTime? before,
  }) {
    final normalizedStatus = _optionalStatus(status);
    final boundedLimit = _boundedLimit(limit);
    final normalizedBefore = before?.toUtc();

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.listNotifications(
          status: normalizedStatus,
          limit: boundedLimit,
          before: normalizedBefore,
          accessToken: accessToken,
        );
        return response.notifications.map(_mapRow).toList(growable: false);
      } on SettleoraNotificationFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraNotificationSummary> getNotificationSummary() {
    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.getNotificationSummary(
          accessToken: accessToken,
        );
        return _mapSummary(response);
      } on SettleoraNotificationFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraNotificationRow> markNotificationRead(String notificationId) {
    final trimmedNotificationId = _requiredId(
      notificationId,
      message: 'Choose a notification before marking it read.',
    );

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.markNotificationRead(
          trimmedNotificationId,
          accessToken: accessToken,
        );
        return _mapRow(response);
      } on SettleoraNotificationFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraNotificationSummary> markAllNotificationsRead() {
    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.markAllNotificationsRead(
          accessToken: accessToken,
        );
        return _mapSummary(response);
      } on SettleoraNotificationFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraNotificationRow> archiveNotification(String notificationId) {
    final trimmedNotificationId = _requiredId(
      notificationId,
      message: 'Choose a notification before archiving it.',
    );

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.archiveNotification(
          trimmedNotificationId,
          accessToken: accessToken,
        );
        return _mapRow(response);
      } on SettleoraNotificationFailure {
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
      throw const SettleoraNotificationFailure(
        kind: SettleoraNotificationFailureKind.sessionRequired,
        message: 'Sign in before loading notifications.',
      );
    }

    return operation(accessToken);
  }

  Future<String?> _readAccessToken() async {
    try {
      final accessToken = await _accessTokenProvider.accessToken();
      final trimmed = accessToken?.trim();
      if (trimmed == null || trimmed.isEmpty) {
        return null;
      }

      return trimmed;
    } catch (_) {
      return null;
    }
  }
}

SettleoraNotificationSummary _mapSummary(
  api.InAppNotificationSummaryResponse response,
) {
  return SettleoraNotificationSummary(
    unreadCount: response.unreadCount,
    attentionCount: response.attentionCount,
    urgentCount: response.urgentCount,
  );
}

SettleoraNotificationRow _mapRow(api.InAppNotificationResponse response) {
  return SettleoraNotificationRow(
    id: response.id,
    eventType: response.eventType,
    status: response.status,
    priority: response.priority,
    subjectType: response.subjectType,
    safeSummary: response.safeSummary,
    createdAtUtc: response.createdAtUtc.toUtc(),
    readAtUtc: response.readAtUtc?.toUtc(),
    archivedAtUtc: response.archivedAtUtc?.toUtc(),
  );
}

SettleoraNotificationFailure _mapFailure(Object error) {
  if (error is api.SettleoraApiException) {
    return switch (error.statusCode) {
      400 || 422 => SettleoraNotificationFailure(
        kind: SettleoraNotificationFailureKind.validation,
        message:
            'The notification request is no longer valid. Refresh and try again.',
        statusCode: error.statusCode,
      ),
      401 => const SettleoraNotificationFailure(
        kind: SettleoraNotificationFailureKind.sessionExpired,
        message:
            'Your session has expired. Sign in again before loading notifications.',
        statusCode: 401,
      ),
      403 => const SettleoraNotificationFailure(
        kind: SettleoraNotificationFailureKind.denied,
        message: 'Notifications are not available to this account.',
        statusCode: 403,
      ),
      404 || 410 => SettleoraNotificationFailure(
        kind: SettleoraNotificationFailureKind.unavailable,
        message: 'The notification is no longer available.',
        statusCode: error.statusCode,
      ),
      409 => const SettleoraNotificationFailure(
        kind: SettleoraNotificationFailureKind.conflict,
        message: 'Refresh notifications and try again.',
        statusCode: 409,
      ),
      >= 500 => SettleoraNotificationFailure(
        kind: SettleoraNotificationFailureKind.server,
        message: 'Notifications are unavailable right now. Try again later.',
        statusCode: error.statusCode,
      ),
      _ => SettleoraNotificationFailure(
        kind: SettleoraNotificationFailureKind.server,
        message: 'Notifications are unavailable right now. Try again later.',
        statusCode: error.statusCode,
      ),
    };
  }

  if (error is SocketException ||
      error is HttpException ||
      error is HandshakeException ||
      error is TimeoutException ||
      error is IOException) {
    return const SettleoraNotificationFailure(
      kind: SettleoraNotificationFailureKind.network,
      message:
          'The server is unavailable. Try again when the connection is back.',
    );
  }

  return const SettleoraNotificationFailure(
    kind: SettleoraNotificationFailureKind.server,
    message: 'Notifications are unavailable right now. Try again later.',
  );
}

int _boundedLimit(int limit) {
  if (limit < 1 || limit > 100) {
    throw const SettleoraNotificationFailure(
      kind: SettleoraNotificationFailureKind.validation,
      message: 'Choose a notification list limit from 1 to 100.',
    );
  }

  return limit;
}

String _requiredId(String value, {required String message}) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    throw SettleoraNotificationFailure(
      kind: SettleoraNotificationFailureKind.validation,
      message: message,
    );
  }

  return trimmed;
}

SettleoraNotificationStatus? _optionalStatus(
  SettleoraNotificationStatus? value,
) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }

  if (!SettleoraNotificationStatusValues.values.contains(trimmed)) {
    throw const SettleoraNotificationFailure(
      kind: SettleoraNotificationFailureKind.validation,
      message: 'Choose a supported notification status.',
    );
  }

  return trimmed;
}
