import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/settleora_api_client.dart';
import 'package:mobile/notifications/generated_notification_repository.dart';
import 'package:mobile/notifications/notification_repository.dart';
import 'package:settleora_api_client/settleora_api.dart' as api;

void main() {
  group('GeneratedSettleoraNotificationRepository', () {
    test('requires a session before calling the generated client', () async {
      final client = FakeNotificationGeneratedClient();
      final repository = GeneratedSettleoraNotificationRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider(null),
      );

      final failure = await captureNotificationFailure(() {
        return repository.listNotifications();
      });

      expect(failure.kind, SettleoraNotificationFailureKind.sessionRequired);
      expect(client.listCalls, 0);
    });

    test('maps notification summary and list rows safely', () async {
      final before = DateTime(2026, 5, 18, 20);
      final tokenProvider = FakeAccessTokenProvider('  redacted-token  ');
      final client = FakeNotificationGeneratedClient();
      final repository = GeneratedSettleoraNotificationRepository(
        client: client,
        accessTokenProvider: tokenProvider,
      );

      final summary = await repository.getNotificationSummary();
      final notifications = await repository.listNotifications(
        status: ' unread ',
        limit: 25,
        before: before,
      );

      expect(summary.unreadCount, 2);
      expect(summary.attentionCount, 1);
      expect(summary.urgentCount, 0);
      expect(notifications, hasLength(1));
      expect(notifications.single.id, _notificationId);
      expect(notifications.single.displayTitle, 'Bill submitted');
      expect(notifications.single.displaySummary, 'Dinner bill is ready.');
      expect(notifications.single.createdAtUtc.isUtc, isTrue);
      expect(client.lastStatus, 'unread');
      expect(client.lastLimit, 25);
      expect(client.lastBefore, before.toUtc());
      expect(client.accessTokens, ['redacted-token', 'redacted-token']);
      expect(tokenProvider.calls, 2);
    });

    test('trims IDs and wraps notification actions', () async {
      final client = FakeNotificationGeneratedClient();
      final repository = GeneratedSettleoraNotificationRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider('redacted-token'),
      );

      final read = await repository.markNotificationRead(' $_notificationId ');
      final summary = await repository.markAllNotificationsRead();
      final archived = await repository.archiveNotification(
        ' $_notificationId ',
      );

      expect(read.status, SettleoraNotificationStatusValues.read);
      expect(summary.unreadCount, 0);
      expect(archived.status, SettleoraNotificationStatusValues.archived);
      expect(client.markReadCalls, 1);
      expect(client.markAllReadCalls, 1);
      expect(client.archiveCalls, 1);
      expect(client.lastNotificationId, _notificationId);
      expect(client.accessTokens, [
        'redacted-token',
        'redacted-token',
        'redacted-token',
      ]);
    });

    test('validates status, limit, and IDs before generated calls', () async {
      final client = FakeNotificationGeneratedClient();
      final repository = GeneratedSettleoraNotificationRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider('redacted-token'),
      );

      expect(
        (await captureNotificationFailure(
          () => repository.listNotifications(status: 'deleted'),
        )).kind,
        SettleoraNotificationFailureKind.validation,
      );
      expect(
        (await captureNotificationFailure(
          () => repository.listNotifications(limit: 0),
        )).kind,
        SettleoraNotificationFailureKind.validation,
      );
      expect(
        (await captureNotificationFailure(
          () => repository.archiveNotification('   '),
        )).kind,
        SettleoraNotificationFailureKind.validation,
      );
      expect(client.listCalls, 0);
      expect(client.archiveCalls, 0);
    });

    test('maps generated failures to bounded safe failures', () async {
      const cases = [
        FailureCase(
          api.SettleoraApiException(400, 'Bad Request', _hiddenBody),
          SettleoraNotificationFailureKind.validation,
          400,
        ),
        FailureCase(
          api.SettleoraApiException(401, 'Unauthorized', _hiddenBody),
          SettleoraNotificationFailureKind.sessionExpired,
          401,
        ),
        FailureCase(
          api.SettleoraApiException(403, 'Forbidden', _hiddenBody),
          SettleoraNotificationFailureKind.denied,
          403,
        ),
        FailureCase(
          api.SettleoraApiException(404, 'Not Found', _hiddenBody),
          SettleoraNotificationFailureKind.unavailable,
          404,
        ),
        FailureCase(
          api.SettleoraApiException(409, 'Conflict', _hiddenBody),
          SettleoraNotificationFailureKind.conflict,
          409,
        ),
        FailureCase(
          api.SettleoraApiException(422, 'Unprocessable Content', _hiddenBody),
          SettleoraNotificationFailureKind.validation,
          422,
        ),
        FailureCase(
          api.SettleoraApiException(503, 'Unavailable', _hiddenBody),
          SettleoraNotificationFailureKind.server,
          503,
        ),
      ];

      for (final failureCase in cases) {
        final repository = GeneratedSettleoraNotificationRepository(
          client: FakeNotificationGeneratedClient(error: failureCase.error),
          accessTokenProvider: FakeAccessTokenProvider('redacted-token'),
        );

        final failure = await captureNotificationFailure(() {
          return repository.getNotificationSummary();
        });

        expect(failure.kind, failureCase.kind);
        expect(failure.statusCode, failureCase.statusCode);
        expect(failure.message, isNot(contains('internal-detail')));
        expect(failure.toString(), isNot(contains('internal-detail')));
      }
    });

    test('maps network errors to safe retry text', () async {
      final repository = GeneratedSettleoraNotificationRepository(
        client: FakeNotificationGeneratedClient(
          error: const SocketException('internal socket detail'),
        ),
        accessTokenProvider: FakeAccessTokenProvider('redacted-token'),
      );

      final failure = await captureNotificationFailure(() {
        return repository.listNotifications();
      });

      expect(failure.kind, SettleoraNotificationFailureKind.network);
      expect(failure.message, isNot(contains('internal socket detail')));
    });
  });
}

Future<SettleoraNotificationFailure> captureNotificationFailure(
  Future<Object?> Function() operation,
) async {
  try {
    await operation();
  } on SettleoraNotificationFailure catch (failure) {
    return failure;
  }

  fail('Expected SettleoraNotificationFailure.');
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

class FakeNotificationGeneratedClient
    implements SettleoraNotificationGeneratedClient {
  FakeNotificationGeneratedClient({this.error});

  final Object? error;
  final accessTokens = <String>[];
  int listCalls = 0;
  int summaryCalls = 0;
  int markReadCalls = 0;
  int markAllReadCalls = 0;
  int archiveCalls = 0;
  String? lastStatus;
  int? lastLimit;
  DateTime? lastBefore;
  String? lastNotificationId;

  @override
  Future<api.InAppNotificationListResponse> listNotifications({
    api.InAppNotificationStatus? status,
    int? limit,
    DateTime? before,
    required String accessToken,
  }) async {
    listCalls += 1;
    lastStatus = status;
    lastLimit = limit;
    lastBefore = before;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return api.InAppNotificationListResponse(
      notifications: [sampleApiNotification()],
    );
  }

  @override
  Future<api.InAppNotificationSummaryResponse> getNotificationSummary({
    required String accessToken,
  }) async {
    summaryCalls += 1;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return sampleApiSummary();
  }

  @override
  Future<api.InAppNotificationResponse> markNotificationRead(
    String notificationId, {
    required String accessToken,
  }) async {
    markReadCalls += 1;
    lastNotificationId = notificationId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return sampleApiNotification(
      status: api.InAppNotificationStatusValues.read,
    );
  }

  @override
  Future<api.InAppNotificationSummaryResponse> markAllNotificationsRead({
    required String accessToken,
  }) async {
    markAllReadCalls += 1;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return const api.InAppNotificationSummaryResponse(
      unreadCount: 0,
      attentionCount: 0,
      urgentCount: 0,
    );
  }

  @override
  Future<api.InAppNotificationResponse> archiveNotification(
    String notificationId, {
    required String accessToken,
  }) async {
    archiveCalls += 1;
    lastNotificationId = notificationId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return sampleApiNotification(
      status: api.InAppNotificationStatusValues.archived,
      archivedAtUtc: _updatedAtUtc,
    );
  }

  void _throwIfNeeded() {
    final error = this.error;
    if (error != null) {
      throw error;
    }
  }
}

class FailureCase {
  const FailureCase(this.error, this.kind, this.statusCode);

  final Object error;
  final SettleoraNotificationFailureKind kind;
  final int statusCode;
}

api.InAppNotificationSummaryResponse sampleApiSummary() {
  return const api.InAppNotificationSummaryResponse(
    unreadCount: 2,
    attentionCount: 1,
    urgentCount: 0,
  );
}

api.InAppNotificationResponse sampleApiNotification({
  String status = api.InAppNotificationStatusValues.unread,
  DateTime? archivedAtUtc,
}) {
  return api.InAppNotificationResponse(
    id: _notificationId,
    eventType: api.InAppNotificationEventTypeValues.billSubmitted,
    status: status,
    priority: api.InAppNotificationPriorityValues.attention,
    subjectType: api.InAppNotificationSubjectTypeValues.expenseBill,
    titleKey: 'notifications.bill.submitted.title',
    messageKey: 'notifications.bill.submitted.message',
    safeSummary: 'Dinner bill is ready.',
    actionUrl: '/api/v1/bills/hidden',
    groupId: null,
    expenseBillId: _billId,
    expenseBillRevisionId: null,
    settlementRequestId: null,
    settlementPaymentId: null,
    recurringBillTemplateId: null,
    recurringBillOccurrenceId: null,
    createdAtUtc: _createdAtUtc,
    readAtUtc: status == api.InAppNotificationStatusValues.read
        ? _updatedAtUtc
        : null,
    archivedAtUtc: archivedAtUtc,
  );
}

const _notificationId = '11111111-1111-1111-1111-111111111111';
const _billId = '22222222-2222-2222-2222-222222222222';
const _hiddenBody = {'detail': 'internal-detail'};
final _createdAtUtc = DateTime.utc(2026, 5, 18, 9);
final _updatedAtUtc = DateTime.utc(2026, 5, 18, 10);
