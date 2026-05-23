import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/settleora_api_client.dart';
import 'package:mobile/app/auth_session_repository.dart';
import 'package:mobile/app/secure_storage.dart';
import 'package:mobile/app/server_mode_shell.dart';
import 'package:mobile/bills/bill_revision_repository.dart';
import 'package:mobile/bills/bill_repository.dart';
import 'package:mobile/bills/bill_sync_controller.dart';
import 'package:mobile/groups/group_repository.dart';
import 'package:mobile/notifications/notification_repository.dart';
import 'package:mobile/notifications/notification_screen.dart';
import 'package:mobile/profile/profile_repository.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_repository.dart';
import 'package:mobile/recurring_bills/recurring_bill_repository.dart';
import 'package:mobile/reports/report_repository.dart';
import 'package:mobile/settlements/settlement_repository.dart';
import 'package:mobile/sync/sync_queue.dart';
import 'package:mobile/sync/sync_queue_processor.dart';
import 'package:mobile/sync/sync_repository.dart';

void main() {
  testWidgets('notification screen shows loading and loaded content', (
    tester,
  ) async {
    final repository = FakeNotificationRepository.manual();

    await tester.pumpWidget(
      MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
    );
    await tester.pump();

    expect(find.text('Loading notifications'), findsOneWidget);

    repository.completeSummary(sampleSummary());
    await tester.pump();
    repository.completeNotifications([sampleNotification()]);
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('notification-summary')), findsOneWidget);
    expect(find.text('Unread: 1'), findsOneWidget);
    expect(find.text('Attention: 1'), findsOneWidget);
    expect(find.text('Bill submitted'), findsOneWidget);
    expect(find.text('Dinner bill is ready.'), findsOneWidget);
    expect(visibleText(tester), isNot(contains(_notificationId)));
    expect(visibleText(tester), isNot(contains(_billId)));
  });

  testWidgets('notification screen renders empty state', (tester) async {
    final repository = FakeNotificationRepository(notifications: const []);

    await tester.pumpWidget(
      MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    expect(find.text('No notifications'), findsOneWidget);
    expect(repository.summaryCalls, 1);
    expect(repository.listCalls, 1);
  });

  testWidgets('notification screen retries bounded load failures', (
    tester,
  ) async {
    final repository = FakeNotificationRepository(
      loadFailures: [
        const SettleoraNotificationFailure(
          kind: SettleoraNotificationFailureKind.network,
          message:
              'The server is unavailable. Try again when the connection is back.',
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    expect(find.text('Server unavailable'), findsOneWidget);
    expect(find.byKey(const Key('notification-retry')), findsOneWidget);

    await tester.tap(find.byKey(const Key('notification-retry')));
    await tester.pumpAndSettle();

    expect(find.text('Bill submitted'), findsOneWidget);
    expect(repository.summaryCalls, 2);
  });

  testWidgets('notification actions refresh server state', (tester) async {
    final repository = FakeNotificationRepository();

    await tester.pumpWidget(
      MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('notification-mark-all-read')));
    await tester.pumpAndSettle();

    expect(repository.markAllReadCalls, 1);
    expect(find.text('Notifications marked read.'), findsOneWidget);
    expect(find.text('Unread: 0'), findsOneWidget);
    expect(find.text('Read'), findsWidgets);

    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('notification-archive-0')));
    await tester.pumpAndSettle();

    expect(repository.archiveCalls, 1);
    expect(find.text('Notification archived.'), findsOneWidget);
    expect(find.text('No notifications'), findsOneWidget);
  });

  testWidgets('bill revision notifications show open action and navigate', (
    tester,
  ) async {
    final revisionRepository = FakeBillRevisionRepository();
    final repository = FakeNotificationRepository(
      notifications: [
        sampleNotification(
          eventType: SettleoraNotificationEventTypeValues.billRevisionSubmitted,
          expenseBillId: _billId,
          expenseBillRevisionId: _revisionId,
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraNotificationScreen(
          repository: repository,
          billRevisionRepository: revisionRepository,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('notification-open-revision-0')),
      findsOneWidget,
    );

    await tester.tap(
      find.byKey(const ValueKey('notification-open-revision-0')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Revision review'), findsOneWidget);
    expect(revisionRepository.getCalls, 1);
    expect(revisionRepository.lastBillId, _billId);
    expect(revisionRepository.lastRevisionId, _revisionId);
  });

  testWidgets('bill revision open action requires typed IDs', (tester) async {
    final repository = FakeNotificationRepository(
      notifications: [
        sampleNotification(
          eventType: SettleoraNotificationEventTypeValues.billRevisionSubmitted,
          expenseBillId: _billId,
          expenseBillRevisionId: ' ',
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraNotificationScreen(
          repository: repository,
          billRevisionRepository: FakeBillRevisionRepository(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('notification-open-revision-0')),
      findsNothing,
    );
  });

  testWidgets('bill revision open action ignores action URLs', (tester) async {
    final repository = FakeNotificationRepository(
      notifications: [
        sampleNotification(
          eventType: SettleoraNotificationEventTypeValues.billRevisionSubmitted,
          actionUrl: '/api/v1/bills/$_billId/revisions/$_revisionId',
          expenseBillId: null,
          expenseBillRevisionId: null,
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraNotificationScreen(
          repository: repository,
          billRevisionRepository: FakeBillRevisionRepository(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('notification-open-revision-0')),
      findsNothing,
    );
  });

  testWidgets('bill revision open action requires repository seam', (
    tester,
  ) async {
    final repository = FakeNotificationRepository(
      notifications: [
        sampleNotification(
          eventType: SettleoraNotificationEventTypeValues.billRevisionSubmitted,
          expenseBillId: _billId,
          expenseBillRevisionId: _revisionId,
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('notification-open-revision-0')),
      findsNothing,
    );
  });

  testWidgets('single notification read failure stays bounded', (tester) async {
    const hiddenValue = 'internal-notification-id';
    final repository = FakeNotificationRepository(
      markReadFailure: const SettleoraNotificationFailure(
        kind: SettleoraNotificationFailureKind.conflict,
        message: 'Refresh notifications and try again.',
        statusCode: 409,
      ),
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('notification-mark-read-0')));
    await tester.pumpAndSettle();

    expect(repository.markReadCalls, 1);
    expect(find.text('Refresh notifications and try again.'), findsOneWidget);
    expect(visibleText(tester), isNot(contains(hiddenValue)));
  });

  testWidgets('notification screen handles expired sessions safely', (
    tester,
  ) async {
    String? sessionEndedNotice;
    final repository = FakeNotificationRepository(
      loadFailures: [
        const SettleoraNotificationFailure(
          kind: SettleoraNotificationFailureKind.sessionExpired,
          message:
              'Your session has expired. Sign in again before loading notifications.',
          statusCode: 401,
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraNotificationScreen(
          repository: repository,
          onSessionEnded: (notice) async {
            sessionEndedNotice = notice;
          },
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Sign in again'), findsOneWidget);
    expect(
      find.byKey(const Key('notification-sign-in-required')),
      findsOneWidget,
    );
    expect(visibleText(tester), isNot(contains('redacted-token')));

    await tester.tap(find.byKey(const Key('notification-sign-in-required')));
    await tester.pumpAndSettle();

    expect(
      sessionEndedNotice,
      'Your session has expired. Sign in again before loading notifications.',
    );
  });

  testWidgets('authenticated server shell opens notifications', (tester) async {
    final notificationRepository = FakeNotificationRepository(
      notifications: [
        sampleNotification(
          eventType: SettleoraNotificationEventTypeValues.billRevisionSubmitted,
          expenseBillId: _billId,
          expenseBillRevisionId: _revisionId,
        ),
      ],
    );
    final revisionRepository = FakeBillRevisionRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraAuthenticatedServerShell(
          currentUser: sampleCurrentUser(),
          receiptOcrReviewRepository: FakeReceiptOcrReviewRepository(),
          billRepository: FakeBillRepository(),
          billRevisionRepository: revisionRepository,
          settlementRepository: FakeSettlementRepository(),
          recurringBillRepository: FakeRecurringBillRepository(),
          groupRepository: FakeGroupRepository(),
          notificationRepository: notificationRepository,
          reportRepository: FakeMonthlyReportRepository(),
          profileRepository: FakeProfileRepository(),
          billSyncController: sampleSyncController(),
          authRepository: FakeAuthRepository(),
          accessTokenProvider: const FakeAccessTokenProvider('redacted-token'),
          onSessionEnded: (_) async {},
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('server-shell-notifications')));
    await tester.pumpAndSettle();

    expect(find.text('Notifications'), findsWidgets);
    expect(find.text('Bill revision submitted'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('notification-open-revision-0')),
      findsOneWidget,
    );
    expect(notificationRepository.summaryCalls, 1);
    expect(notificationRepository.listCalls, 1);
  });
}

class FakeNotificationRepository implements SettleoraNotificationRepository {
  FakeNotificationRepository({
    List<SettleoraNotificationRow>? notifications,
    this.loadFailures = const [],
    this.markReadFailure,
    this.markAllReadFailure,
    this.archiveFailure,
  }) : notifications = notifications ?? [sampleNotification()],
       _summaryCompleter = null,
       _notificationsCompleter = null;

  FakeNotificationRepository.manual()
    : notifications = const [],
      loadFailures = const [],
      markReadFailure = null,
      markAllReadFailure = null,
      archiveFailure = null,
      _summaryCompleter = Completer<SettleoraNotificationSummary>(),
      _notificationsCompleter = Completer<List<SettleoraNotificationRow>>();

  List<SettleoraNotificationRow> notifications;
  final List<SettleoraNotificationFailure> loadFailures;
  final SettleoraNotificationFailure? markReadFailure;
  final SettleoraNotificationFailure? markAllReadFailure;
  final SettleoraNotificationFailure? archiveFailure;
  final Completer<SettleoraNotificationSummary>? _summaryCompleter;
  final Completer<List<SettleoraNotificationRow>>? _notificationsCompleter;
  int summaryCalls = 0;
  int listCalls = 0;
  int markReadCalls = 0;
  int markAllReadCalls = 0;
  int archiveCalls = 0;
  String? lastNotificationId;

  void completeSummary(SettleoraNotificationSummary summary) {
    _summaryCompleter?.complete(summary);
  }

  void completeNotifications(List<SettleoraNotificationRow> value) {
    _notificationsCompleter?.complete(value);
  }

  @override
  Future<List<SettleoraNotificationRow>> listNotifications({
    SettleoraNotificationStatus? status,
    int limit = 50,
    DateTime? before,
  }) async {
    listCalls += 1;
    final completer = _notificationsCompleter;
    if (completer != null) {
      notifications = await completer.future;
      return notifications;
    }

    return notifications;
  }

  @override
  Future<SettleoraNotificationSummary> getNotificationSummary() async {
    summaryCalls += 1;
    if (loadFailures.length >= summaryCalls) {
      throw loadFailures[summaryCalls - 1];
    }

    final completer = _summaryCompleter;
    if (completer != null) {
      return completer.future;
    }

    return _summaryFromRows(notifications);
  }

  @override
  Future<SettleoraNotificationRow> markNotificationRead(
    String notificationId,
  ) async {
    markReadCalls += 1;
    lastNotificationId = notificationId;
    final failure = markReadFailure;
    if (failure != null) {
      throw failure;
    }

    final updated = _copyNotification(
      notifications.firstWhere((row) => row.id == notificationId),
      status: SettleoraNotificationStatusValues.read,
      readAtUtc: _updatedAtUtc,
    );
    notifications = [
      for (final row in notifications) row.id == notificationId ? updated : row,
    ];
    return updated;
  }

  @override
  Future<SettleoraNotificationSummary> markAllNotificationsRead() async {
    markAllReadCalls += 1;
    final failure = markAllReadFailure;
    if (failure != null) {
      throw failure;
    }

    notifications = [
      for (final row in notifications)
        _copyNotification(
          row,
          status: SettleoraNotificationStatusValues.read,
          readAtUtc: row.readAtUtc ?? _updatedAtUtc,
        ),
    ];
    return _summaryFromRows(notifications);
  }

  @override
  Future<SettleoraNotificationRow> archiveNotification(
    String notificationId,
  ) async {
    archiveCalls += 1;
    lastNotificationId = notificationId;
    final failure = archiveFailure;
    if (failure != null) {
      throw failure;
    }

    final archived = _copyNotification(
      notifications.firstWhere((row) => row.id == notificationId),
      status: SettleoraNotificationStatusValues.archived,
      archivedAtUtc: _updatedAtUtc,
    );
    notifications = [
      for (final row in notifications)
        if (row.id != notificationId) row,
    ];
    return archived;
  }
}

class FakeBillRevisionRepository implements SettleoraBillRevisionRepository {
  int getCalls = 0;
  String? lastBillId;
  String? lastRevisionId;

  @override
  Future<List<SettleoraBillRevision>> listBillRevisions(String billId) async {
    return const [];
  }

  @override
  Future<SettleoraBillRevision> createBillRevision(
    String billId,
    SettleoraBillRevisionProposalSnapshot proposal,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> getBillRevision(
    String billId,
    String revisionId,
  ) async {
    getCalls += 1;
    lastBillId = billId;
    lastRevisionId = revisionId;
    throw const SettleoraBillRevisionFailure(
      kind: SettleoraBillRevisionFailureKind.unavailable,
      message: 'The revision is no longer available.',
    );
  }

  @override
  Future<SettleoraBillRevision> reviseBillRevision(
    String billId,
    String revisionId,
    SettleoraBillRevisionProposalSnapshot proposal,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> submitBillRevision(
    String billId,
    String revisionId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> withdrawBillRevision(
    String billId,
    String revisionId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> approveBillRevision(
    SettleoraBillRevision revision,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> rejectBillRevision(
    String billId,
    String revisionId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> confirmBillRevisionPayer(
    SettleoraBillRevision revision,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> applyBillRevision(
    String billId,
    String revisionId,
  ) {
    throw UnimplementedError();
  }
}

class FakeReceiptOcrReviewRepository implements ReceiptOcrReviewRepository {
  @override
  Future<List<ReceiptOcrReviewSummary>> listReviews({
    ReceiptOcrReviewStatus? status,
    ReceiptOcrReviewSource? source,
    int? limit,
  }) async {
    return const [];
  }

  @override
  Future<ReceiptOcrReviewDetail> getReview(ReceiptOcrReviewRoute route) {
    throw UnimplementedError();
  }

  @override
  Future<ReceiptOcrReviewDetail> saveReview(
    ReceiptOcrReviewRoute route,
    ReceiptOcrReviewSaveRequest request,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<void> deleteReview(ReceiptOcrReviewRoute route) {
    throw UnimplementedError();
  }

  @override
  Future<ReceiptOcrReviewApplyPreview> previewApply(
    ReceiptOcrReviewRoute route,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<ReceiptOcrReviewApplyResult> applyReview(
    ReceiptOcrReviewRoute route, {
    required DateTime expectedReviewUpdatedAtUtc,
  }) {
    throw UnimplementedError();
  }
}

class FakeRecurringBillRepository implements SettleoraRecurringBillRepository {
  @override
  Future<List<SettleoraRecurringBillTemplateSummary>> listTemplates({
    SettleoraRecurringBillTemplateStatus? status,
    String? groupId,
    String? fromDate,
    String? toDate,
    int maxItems = 100,
  }) async {
    return const [];
  }

  @override
  Future<List<SettleoraRecurringBillForecastOccurrence>> listForecast({
    String? fromDate,
    String? toDate,
    int limit = 30,
    String? groupId,
  }) async {
    return const [];
  }

  @override
  Future<SettleoraRecurringBillTemplateDetail> getTemplate(String templateId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraRecurringBillDraftResult> generateDraft({
    required String templateId,
    required String occurrenceDate,
  }) {
    throw UnimplementedError();
  }
}

class FakeBillRepository implements SettleoraBillRepository {
  @override
  Future<SettleoraBillDetail> createPersonalBill(
    SettleoraPersonalBillCreateDraft draft,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillDetail> getGroupBill(String groupId, String billId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillDetail> getPersonalBill(String billId) {
    throw UnimplementedError();
  }

  @override
  Future<List<SettleoraBillSummary>> listGroupBills(
    String groupId, {
    int limit = 50,
  }) async {
    return const [];
  }

  @override
  Future<List<SettleoraBillSummary>> listPersonalBills({int limit = 50}) async {
    return const [];
  }
}

class FakeSettlementRepository implements SettleoraSettlementRepository {
  @override
  Future<SettleoraSettlementBalanceSnapshot> listBalances() async {
    return SettleoraSettlementBalanceSnapshot(
      generatedAtUtc: _updatedAtUtc,
      balances: const [],
    );
  }

  @override
  Future<List<SettleoraSettlementRequest>> listSettlementRequests() async {
    return const [];
  }

  @override
  Future<SettleoraSettlementRequest> getSettlementRequest(String settlementId) {
    throw UnimplementedError();
  }

  @override
  Future<List<SettleoraSettlementPayment>> listSettlementPayments(
    String settlementId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementCounterpartyPaymentDetails>
  getCounterpartyPaymentDetails({
    required String settlementId,
    required String userProfileId,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementRequest> cancelSettlementRequest(
    String settlementId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementRequest> disputeSettlementRequest(
    String settlementId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementPayment> confirmSettlementPayment(
    String paymentId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementPayment> cancelSettlementPayment(String paymentId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementPayment> disputeSettlementPayment(
    String paymentId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementPayment> confirmSettlementPaymentResidual({
    required String paymentId,
    required String residualId,
  }) {
    throw UnimplementedError();
  }
}

class FakeGroupRepository implements SettleoraGroupRepository {
  @override
  Future<List<SettleoraGroup>> listGroups() async {
    return const [];
  }

  @override
  Future<SettleoraGroup> createGroup(SettleoraGroupSaveRequest request) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraGroup> getGroup(String groupId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraGroup> updateGroup(
    String groupId,
    SettleoraGroupSaveRequest request,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<List<SettleoraGroupMember>> listGroupMembers(String groupId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraGroupMember> addGroupMember(
    String groupId,
    SettleoraGroupMemberAddRequest request,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraGroupMember> updateGroupMember(
    String groupId,
    String userProfileId,
    SettleoraGroupMemberRoleUpdate update,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<void> removeGroupMember(String groupId, String userProfileId) {
    throw UnimplementedError();
  }
}

class FakeProfileRepository implements SettleoraProfileRepository {
  @override
  Future<SettleoraSelfProfile> getSelfProfile() {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSelfProfile> updateSelfProfile(
    SettleoraSelfProfileUpdate update,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSelfPaymentDetails> getSelfPaymentDetails() {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSelfPaymentDetails> updateSelfPaymentDetails(
    SettleoraSelfPaymentDetailsUpdate update,
  ) {
    throw UnimplementedError();
  }
}

class FakeMonthlyReportRepository implements SettleoraMonthlyReportRepository {
  @override
  Future<SettleoraMonthlyReport> getMonthlyReport({
    required String month,
    String? groupId,
  }) async {
    return SettleoraMonthlyReport(
      month: month,
      groupId: groupId,
      generatedAtUtc: DateTime.utc(2026, 5, 18, 9),
      billCount: 0,
      totalByCurrency: const [],
      actorShareByCurrency: const [],
      actorPaidByCurrency: const [],
      reconciliationCounts: const [],
      settlementRequestCounts: const [],
      settlementPaymentCounts: const [],
    );
  }
}

class FakeAuthRepository implements SettleoraAuthRepository {
  @override
  Future<SettleoraCurrentUser> currentUser({
    required String accessToken,
  }) async {
    return sampleCurrentUser();
  }

  @override
  Future<SettleoraServerSessionMaterial> signIn(
    SettleoraSignInSubmission submission,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraServerSessionMaterial> refreshSession({
    required String refreshCredential,
    String? deviceLabel,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<void> signOutCurrentSession({required String accessToken}) async {}

  @override
  Future<void> signOutAllCurrentAccountSessions({
    required String accessToken,
  }) async {}

  @override
  Future<List<SettleoraSessionSummary>> listSessions({
    required String accessToken,
  }) async {
    return const [];
  }

  @override
  Future<void> revokeSession({
    required String sessionId,
    required String accessToken,
  }) async {}
}

class FakeAccessTokenProvider implements SettleoraAccessTokenProvider {
  const FakeAccessTokenProvider(this._accessToken);

  final String? _accessToken;

  @override
  Future<String?> accessToken() async => _accessToken;
}

class MemorySyncQueueStore extends SettleoraSyncQueueStore {
  var state = SettleoraSyncQueueState.empty();

  @override
  final int maxItemCount = 100;

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
  Future<SettleoraSyncChangeFeed> listChanges({
    int? sinceVersion,
    int? limit,
    SettleoraSyncResourceType? resourceType,
  }) {
    throw UnimplementedError();
  }
}

SettleoraBillSyncController sampleSyncController() {
  final store = MemorySyncQueueStore();
  return SettleoraBillSyncController(
    queueStore: store,
    queueProcessor: SettleoraSyncQueueProcessor(
      queueStore: store,
      repository: FakeSyncRepository(),
    ),
  );
}

SettleoraCurrentUser sampleCurrentUser() {
  return SettleoraCurrentUser(
    userProfileId: _profileId,
    displayName: 'Taylor',
    defaultCurrency: 'USD',
    roles: const ['user'],
    sessionExpiresAtUtc: DateTime.utc(2026, 5, 19),
  );
}

SettleoraNotificationSummary sampleSummary() {
  return const SettleoraNotificationSummary(
    unreadCount: 1,
    attentionCount: 1,
    urgentCount: 0,
  );
}

SettleoraNotificationRow sampleNotification({
  String eventType = 'bill.submitted',
  String status = SettleoraNotificationStatusValues.unread,
  String? actionUrl,
  String? groupId,
  String? expenseBillId,
  String? expenseBillRevisionId,
  DateTime? readAtUtc,
  DateTime? archivedAtUtc,
}) {
  return SettleoraNotificationRow(
    id: _notificationId,
    eventType: eventType,
    status: status,
    priority: SettleoraNotificationPriorityValues.attention,
    subjectType: SettleoraNotificationSubjectTypeValues.expenseBill,
    safeSummary: 'Dinner bill is ready.',
    actionUrl: actionUrl,
    groupId: groupId,
    expenseBillId: expenseBillId,
    expenseBillRevisionId: expenseBillRevisionId,
    createdAtUtc: _createdAtUtc,
    readAtUtc: readAtUtc,
    archivedAtUtc: archivedAtUtc,
  );
}

SettleoraNotificationRow _copyNotification(
  SettleoraNotificationRow row, {
  String? status,
  DateTime? readAtUtc,
  DateTime? archivedAtUtc,
}) {
  return SettleoraNotificationRow(
    id: row.id,
    eventType: row.eventType,
    status: status ?? row.status,
    priority: row.priority,
    subjectType: row.subjectType,
    safeSummary: row.safeSummary,
    actionUrl: row.actionUrl,
    groupId: row.groupId,
    expenseBillId: row.expenseBillId,
    expenseBillRevisionId: row.expenseBillRevisionId,
    createdAtUtc: row.createdAtUtc,
    readAtUtc: readAtUtc ?? row.readAtUtc,
    archivedAtUtc: archivedAtUtc ?? row.archivedAtUtc,
  );
}

SettleoraNotificationSummary _summaryFromRows(
  List<SettleoraNotificationRow> rows,
) {
  return SettleoraNotificationSummary(
    unreadCount: rows
        .where((row) => row.status == SettleoraNotificationStatusValues.unread)
        .length,
    attentionCount: rows
        .where(
          (row) =>
              row.priority == SettleoraNotificationPriorityValues.attention,
        )
        .length,
    urgentCount: rows
        .where(
          (row) => row.priority == SettleoraNotificationPriorityValues.urgent,
        )
        .length,
  );
}

String visibleText(WidgetTester tester) {
  return tester
      .widgetList<Text>(find.byType(Text))
      .map((widget) => widget.data)
      .whereType<String>()
      .join('\n');
}

const _notificationId = '11111111-1111-1111-1111-111111111111';
const _billId = '22222222-2222-2222-2222-222222222222';
const _revisionId = '44444444-4444-4444-4444-444444444444';
const _profileId = '33333333-3333-3333-3333-333333333333';
final _createdAtUtc = DateTime.utc(2026, 5, 18, 9);
final _updatedAtUtc = DateTime.utc(2026, 5, 18, 10);
