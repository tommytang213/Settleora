import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/settleora_api_client.dart';
import 'package:mobile/app/auth_session_repository.dart';
import 'package:mobile/app/secure_storage.dart';
import 'package:mobile/app/server_mode_shell.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/bills/bill_revision_repository.dart';
import 'package:mobile/bills/bill_repository.dart';
import 'package:mobile/bills/bill_sync_controller.dart';
import 'package:mobile/groups/group_repository.dart';
import 'package:mobile/notifications/notification_repository.dart';
import 'package:mobile/profile/profile_repository.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_repository.dart';
import 'package:mobile/recurring_bills/recurring_bill_repository.dart';
import 'package:mobile/reports/report_repository.dart';
import 'package:mobile/settlements/settlement_repository.dart';
import 'package:mobile/sync/sync_queue.dart';
import 'package:mobile/sync/sync_queue_processor.dart';
import 'package:mobile/sync/sync_repository.dart';

void main() {
  testWidgets('bill list queues archive and flushes through sync', (
    tester,
  ) async {
    final store = MemorySyncQueueStore();
    final syncRepository = FakeSyncRepository([sampleOperationResult()]);
    final controller = SettleoraBillSyncController(
      queueStore: store,
      queueProcessor: SettleoraSyncQueueProcessor(
        queueStore: store,
        repository: syncRepository,
        now: () => _attemptedAtUtc,
      ),
      now: () => _createdAtUtc,
      idGenerator: () => 'queue-1',
    );
    final billRepository = FakeBillRepository(bills: [sampleBillSummary()]);

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: billRepository,
          syncController: controller,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Corner Market'), findsOneWidget);
    expect(billRepository.listCalls, 1);

    await tester.tap(find.byKey(const ValueKey('bill-archive-0')));
    await tester.pumpAndSettle();

    expect(syncRepository.submitCalls, 1);
    expect(store.state.items.single.operationType, 'bill_archive');
    expect(store.state.items.single.payload, isEmpty);
    expect(store.state.items.single.state, 'synced');
    expect(find.textContaining('1 synced'), findsWidgets);
    expect(billRepository.listCalls, 2);
  });

  testWidgets('bill list preserves queued work when session is missing', (
    tester,
  ) async {
    final store = MemorySyncQueueStore(
      initialState: SettleoraSyncQueueState(items: [sampleArchiveQueueItem()]),
    );
    final syncRepository = FakeSyncRepository([
      const SettleoraSyncFailure(
        kind: SettleoraSyncFailureKind.sessionRequired,
        message: 'Sign in before syncing pending changes.',
      ),
    ]);
    final controller = SettleoraBillSyncController(
      queueStore: store,
      queueProcessor: SettleoraSyncQueueProcessor(
        queueStore: store,
        repository: syncRepository,
        now: () => _attemptedAtUtc,
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: FakeBillRepository(bills: [sampleBillSummary()]),
          syncController: controller,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('Sign in before syncing pending changes.'),
      findsOneWidget,
    );
    expect(store.state.items.single.state, 'queued');
    expect(store.state.items.single.attemptCount, 0);
  });

  testWidgets('bill detail opens from active bill summaries', (tester) async {
    final controller = SettleoraBillSyncController(
      queueStore: MemorySyncQueueStore(),
      queueProcessor: SettleoraSyncQueueProcessor(
        queueStore: MemorySyncQueueStore(),
        repository: FakeSyncRepository([]),
      ),
    );
    final repository = FakeBillRepository(
      bills: [sampleBillSummary()],
      detail: sampleBillDetail(),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          syncController: controller,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();

    expect(repository.getCalls, 1);
    expect(find.text('Items'), findsOneWidget);
    expect(find.text('Milk'), findsOneWidget);
    expect(find.text('Participants'), findsOneWidget);
    expect(find.byKey(const Key('bill-detail-propose-change')), findsNothing);
  });

  testWidgets('bill detail creates revision after fresh capability checks', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final detail = sampleBillDetail(canCreateRevision: true);
    final repository = FakeBillRepository(
      bills: [sampleBillSummary()],
      details: [detail, detail, detail],
    );
    final revisionRepository = FakeBillRevisionRepository(
      listResponses: const [],
      createResponse: sampleRevision(id: _createdRevisionId),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          revisionRepository: revisionRepository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-detail-propose-change')));
    await tester.pumpAndSettle();

    expect(find.text('Create proposal'), findsOneWidget);
    expect(
      tester
          .widget<TextField>(find.byKey(const Key('proposal-total-amount')))
          .controller
          ?.text,
      '10.80',
    );

    await tester.tap(find.byKey(const Key('bill-revision-proposal-save')));
    await tester.pumpAndSettle();

    expect(repository.getCalls, 3);
    expect(revisionRepository.createCalls, 1);
    expect(revisionRepository.lastCreatedBillId, _billId);
    expect(revisionRepository.lastProposal?.totalAmount, '10.80');
    expect(
      revisionRepository.lastProposal?.participants.single.userProfileId,
      _userProfileId,
    );
    expect(revisionRepository.getCalls, 1);
    expect(find.text('Revision review'), findsOneWidget);
  });

  testWidgets(
    'bill detail stops create entry when refreshed capability denies',
    (tester) async {
      await useLargeSurface(tester);
      final repository = FakeBillRepository(
        bills: [sampleBillSummary()],
        details: [
          sampleBillDetail(canCreateRevision: true),
          sampleBillDetail(canCreateRevision: false),
        ],
      );
      final revisionRepository = FakeBillRevisionRepository(
        listResponses: const [],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: repository,
            revisionRepository: revisionRepository,
            syncController: sampleBillSyncController(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Corner Market'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('bill-detail-propose-change')));
      await tester.pumpAndSettle();

      expect(repository.getCalls, 2);
      expect(revisionRepository.createCalls, 0);
      expect(find.byKey(const Key('bill-detail-propose-change')), findsNothing);
      expect(
        find.byKey(const Key('bill-detail-propose-change-failure')),
        findsOneWidget,
      );
      expect(find.textContaining('Refresh needed'), findsOneWidget);
    },
  );

  testWidgets('bill detail create save refreshes capability before mutation', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeBillRepository(
      bills: [sampleBillSummary()],
      details: [
        sampleBillDetail(canCreateRevision: true),
        sampleBillDetail(canCreateRevision: true),
        sampleBillDetail(canCreateRevision: false),
      ],
    );
    final revisionRepository = FakeBillRevisionRepository(
      listResponses: const [],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          revisionRepository: revisionRepository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-detail-propose-change')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-revision-proposal-save')));
    await tester.pumpAndSettle();

    expect(repository.getCalls, 3);
    expect(revisionRepository.createCalls, 0);
    expect(find.text('Refresh needed'), findsOneWidget);
    expect(
      find.text(
        'This bill can no longer accept a revision proposal. Review the refreshed bill before trying again.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('bill detail create failure stays bounded in editor', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final detail = sampleBillDetail(canCreateRevision: true);
    final repository = FakeBillRepository(
      bills: [sampleBillSummary()],
      details: [detail, detail, detail],
    );
    final revisionRepository = FakeBillRevisionRepository(
      listResponses: const [],
      createFailure: const SettleoraBillRevisionFailure(
        kind: SettleoraBillRevisionFailureKind.validation,
        message:
            'This proposal includes unsupported fields or amounts. Review the highlighted fields.',
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          revisionRepository: revisionRepository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-detail-propose-change')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-revision-proposal-save')));
    await tester.pumpAndSettle();

    expect(revisionRepository.createCalls, 1);
    expect(find.text('Unsupported request'), findsOneWidget);
    expect(
      find.text(
        'This proposal includes unsupported fields or amounts. Review the highlighted fields.',
      ),
      findsOneWidget,
    );
    expect(find.text('Revision review'), findsNothing);
  });

  testWidgets('authenticated server shell opens bills', (tester) async {
    final store = MemorySyncQueueStore();
    final controller = SettleoraBillSyncController(
      queueStore: store,
      queueProcessor: SettleoraSyncQueueProcessor(
        queueStore: store,
        repository: FakeSyncRepository([]),
      ),
    );
    final billRepository = FakeBillRepository(bills: [sampleBillSummary()]);

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraAuthenticatedServerShell(
          currentUser: sampleCurrentUser(),
          receiptOcrReviewRepository: FakeReceiptOcrReviewRepository(),
          billRepository: billRepository,
          settlementRepository: FakeSettlementRepository(),
          recurringBillRepository: FakeRecurringBillRepository(),
          groupRepository: FakeGroupRepository(),
          notificationRepository: FakeNotificationRepository(),
          reportRepository: FakeMonthlyReportRepository(),
          profileRepository: FakeProfileRepository(),
          billSyncController: controller,
          authRepository: FakeAuthRepository(),
          accessTokenProvider: FakeAccessTokenProvider('redacted'),
          onSessionEnded: (_) async {},
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('server-shell-bills')));
    await tester.pumpAndSettle();

    expect(find.text('Bills'), findsWidgets);
    expect(find.text('Corner Market'), findsOneWidget);
    expect(billRepository.listCalls, 1);
  });

  testWidgets('authenticated server shell opens settlements', (tester) async {
    final store = MemorySyncQueueStore();
    final controller = SettleoraBillSyncController(
      queueStore: store,
      queueProcessor: SettleoraSyncQueueProcessor(
        queueStore: store,
        repository: FakeSyncRepository([]),
      ),
    );
    final settlementRepository = FakeSettlementRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraAuthenticatedServerShell(
          currentUser: sampleCurrentUser(),
          receiptOcrReviewRepository: FakeReceiptOcrReviewRepository(),
          billRepository: FakeBillRepository(bills: [sampleBillSummary()]),
          settlementRepository: settlementRepository,
          recurringBillRepository: FakeRecurringBillRepository(),
          groupRepository: FakeGroupRepository(),
          notificationRepository: FakeNotificationRepository(),
          reportRepository: FakeMonthlyReportRepository(),
          profileRepository: FakeProfileRepository(),
          billSyncController: controller,
          authRepository: FakeAuthRepository(),
          accessTokenProvider: FakeAccessTokenProvider('redacted'),
          onSessionEnded: (_) async {},
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('server-shell-settlements')));
    await tester.pumpAndSettle();

    expect(find.text('Settlements'), findsOneWidget);
    expect(find.text('No balances'), findsOneWidget);
    expect(settlementRepository.listBalancesCalls, 1);
    expect(settlementRepository.listRequestsCalls, 1);
  });
}

Future<void> useLargeSurface(WidgetTester tester) async {
  await tester.binding.setSurfaceSize(const Size(900, 1600));
  addTearDown(() => tester.binding.setSurfaceSize(null));
}

SettleoraBillSyncController sampleBillSyncController() {
  final store = MemorySyncQueueStore();
  return SettleoraBillSyncController(
    queueStore: store,
    queueProcessor: SettleoraSyncQueueProcessor(
      queueStore: store,
      repository: FakeSyncRepository([]),
    ),
  );
}

class FakeBillRepository implements SettleoraBillRepository {
  FakeBillRepository({
    this.bills = const [],
    this.groupBills = const [],
    SettleoraBillDetail? detail,
    List<SettleoraBillDetail>? details,
    this.failure,
  }) : details = details ?? [detail ?? sampleBillDetail()];

  final List<SettleoraBillSummary> bills;
  final List<SettleoraBillSummary> groupBills;
  final List<SettleoraBillDetail> details;
  final SettleoraBillFailure? failure;
  int listCalls = 0;
  int getCalls = 0;
  int listGroupCalls = 0;
  int getGroupCalls = 0;

  SettleoraBillDetail _detailForCall(int callIndex) {
    final index = callIndex < details.length ? callIndex : details.length - 1;
    return details[index];
  }

  @override
  Future<List<SettleoraBillSummary>> listGroupBills(
    String groupId, {
    int limit = 50,
  }) async {
    listGroupCalls += 1;
    final failure = this.failure;
    if (failure != null) {
      throw failure;
    }

    return groupBills;
  }

  @override
  Future<SettleoraBillDetail> getGroupBill(
    String groupId,
    String billId,
  ) async {
    getGroupCalls += 1;
    return _detailForCall(getGroupCalls - 1);
  }

  @override
  Future<List<SettleoraBillSummary>> listPersonalBills({int limit = 50}) async {
    listCalls += 1;
    final failure = this.failure;
    if (failure != null) {
      throw failure;
    }

    return bills;
  }

  @override
  Future<SettleoraBillDetail> getPersonalBill(String billId) async {
    getCalls += 1;
    return _detailForCall(getCalls - 1);
  }
}

class FakeBillRevisionRepository implements SettleoraBillRevisionRepository {
  FakeBillRevisionRepository({
    this.listResponses = const [],
    SettleoraBillRevision? detailResponse,
    SettleoraBillRevision? createResponse,
    this.createFailure,
  }) : detailResponse = detailResponse ?? createResponse ?? sampleRevision(),
       createResponse = createResponse ?? detailResponse ?? sampleRevision();

  final List<SettleoraBillRevision> listResponses;
  SettleoraBillRevision detailResponse;
  SettleoraBillRevision createResponse;
  final SettleoraBillRevisionFailure? createFailure;
  int listCalls = 0;
  int getCalls = 0;
  int createCalls = 0;
  String? lastCreatedBillId;
  SettleoraBillRevisionProposalSnapshot? lastProposal;

  @override
  Future<List<SettleoraBillRevision>> listBillRevisions(String billId) async {
    listCalls += 1;
    return listResponses;
  }

  @override
  Future<SettleoraBillRevision> createBillRevision(
    String billId,
    SettleoraBillRevisionProposalSnapshot proposal,
  ) async {
    createCalls += 1;
    lastCreatedBillId = billId;
    lastProposal = proposal;
    final failure = createFailure;
    if (failure != null) {
      throw failure;
    }
    detailResponse = createResponse;
    return createResponse;
  }

  @override
  Future<SettleoraBillRevision> getBillRevision(
    String billId,
    String revisionId,
  ) async {
    getCalls += 1;
    return detailResponse;
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
  int submitCalls = 0;

  @override
  Future<SettleoraSyncOperationResult> submitOperation(
    SettleoraSyncQueueItem item,
  ) async {
    submitCalls += 1;
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

class FakeNotificationRepository implements SettleoraNotificationRepository {
  @override
  Future<List<SettleoraNotificationRow>> listNotifications({
    SettleoraNotificationStatus? status,
    int limit = 50,
    DateTime? before,
  }) async {
    return const [];
  }

  @override
  Future<SettleoraNotificationSummary> getNotificationSummary() async {
    return const SettleoraNotificationSummary(
      unreadCount: 0,
      attentionCount: 0,
      urgentCount: 0,
    );
  }

  @override
  Future<SettleoraNotificationRow> markNotificationRead(String notificationId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraNotificationSummary> markAllNotificationsRead() {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraNotificationRow> archiveNotification(String notificationId) {
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
  Future<SettleoraServerSessionMaterial> signIn(
    SettleoraSignInSubmission submission,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraCurrentUser> currentUser({
    required String accessToken,
  }) async {
    return sampleCurrentUser();
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

SettleoraBillSummary sampleBillSummary({
  String archiveState = SettleoraBillArchiveStateValues.active,
}) {
  return SettleoraBillSummary(
    id: _billId,
    merchantName: 'Corner Market',
    billDate: '2026-05-17',
    status: 'draft',
    reconciliationStatus: 'unreconciled',
    totalAmount: '10.80',
    totalCurrency: 'USD',
    archiveState: archiveState,
    itemCount: 1,
    participantCount: 1,
    payerCount: 1,
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _createdAtUtc,
  );
}

SettleoraBillDetail sampleBillDetail({bool canCreateRevision = false}) {
  return SettleoraBillDetail(
    id: _billId,
    merchantName: 'Corner Market',
    billDate: '2026-05-17',
    status: 'draft',
    reconciliationStatus: 'unreconciled',
    reconciliationNote: null,
    revisionCreationActions: SettleoraBillRevisionCreationActions(
      canCreateRevision: canCreateRevision,
    ),
    totalAmount: '10.80',
    totalCurrency: 'USD',
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _createdAtUtc,
    items: const [
      SettleoraBillItem(
        id: 'item-1',
        name: 'Milk',
        note: null,
        amount: '10.00',
        currency: 'USD',
        sortOrder: 0,
      ),
    ],
    participants: const [
      SettleoraBillParticipant(
        userProfileId: _userProfileId,
        status: 'pending_acceptance',
        resolvedShareAmount: '10.80',
        resolvedShareCurrency: 'USD',
      ),
    ],
    payers: const [
      SettleoraBillPayer(
        userProfileId: _userProfileId,
        amount: '10.80',
        currency: 'USD',
      ),
    ],
    adjustments: const [
      SettleoraBillAdjustment(
        id: 'adjustment-1',
        type: 'tax',
        direction: 'charge',
        amount: '0.80',
        currency: 'USD',
        reasonNote: null,
        sortOrder: 0,
      ),
    ],
  );
}

SettleoraSyncQueueItem sampleArchiveQueueItem() {
  return SettleoraSyncQueueItem.billArchive(
    resourceId: _billId,
    now: _createdAtUtc,
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

SettleoraCurrentUser sampleCurrentUser() {
  return SettleoraCurrentUser(
    userProfileId: _userProfileId,
    displayName: 'Taylor',
    defaultCurrency: 'USD',
    roles: const ['user'],
    sessionExpiresAtUtc: DateTime.utc(2026, 5, 18),
  );
}

SettleoraBillRevision sampleRevision({String id = _revisionId}) {
  return SettleoraBillRevision(
    id: id,
    billId: _billId,
    groupId: null,
    status: SettleoraBillRevisionStatusValues.draftRevision,
    totalAmount: '10.80',
    totalCurrency: 'USD',
    calculationHash: _hash,
    submittedAtUtc: null,
    updatedAtUtc: _attemptedAtUtc,
    participants: const [
      SettleoraBillRevisionParticipant(
        userProfileId: _userProfileId,
        resolvedShareAmount: '10.80',
        resolvedShareCurrency: 'USD',
        affectedByRevision: true,
      ),
    ],
    payers: const [
      SettleoraBillRevisionPayer(
        userProfileId: _userProfileId,
        amount: '10.80',
        currency: 'USD',
        requiresPayerConfirmation: false,
        payerConfirmationStatus:
            SettleoraBillRevisionPayerConfirmationStatusValues.confirmed,
      ),
    ],
    approvals: const [],
    viewerActions: const SettleoraBillRevisionViewerActions(
      canSubmit: true,
      canWithdraw: false,
      canRevise: false,
      canApprove: false,
      canReject: false,
      canConfirmPayer: false,
      canApply: false,
    ),
    reviewContext: sampleReviewContext(),
    viewerApprovalBasis: null,
  );
}

SettleoraBillRevisionReviewContext sampleReviewContext() {
  return SettleoraBillRevisionReviewContext(
    viewerUserProfileId: _userProfileId,
    baseline: SettleoraBillRevisionReviewBaseline(
      baselineType:
          SettleoraBillRevisionReviewBaselineTypeValues.activeAcceptedBill,
      baselineBillRevisionId: '11111111-1111-1111-1111-111111111111',
      baselineRevisionStatus: SettleoraBillRevisionStatusValues.acceptedApplied,
      baselineReviewedAtUtc: null,
      derivationReason: 'Server selected the active accepted bill baseline.',
    ),
    defaultViewMode: SettleoraBillRevisionReviewViewModeValues.fullBill,
    fullViewRecommendedReason:
        SettleoraBillRevisionReviewRecommendationReasonValues
            .baselineAvailableFullViewOptional,
    viewerFinancialImpact: const SettleoraBillRevisionViewerFinancialImpact(
      previousShare: SettleoraBillRevisionMoneyValue(
        amount: '10.80',
        currency: 'USD',
      ),
      proposedShare: SettleoraBillRevisionMoneyValue(
        amount: '10.80',
        currency: 'USD',
      ),
      deltaShare: SettleoraBillRevisionMoneyValue(
        amount: '0.00',
        currency: 'USD',
      ),
      affectedByRevision: true,
      isPayer: false,
      payerImpact: null,
    ),
    changeSummary: const [],
    changes: const [],
    limitations: const [],
  );
}

class FakeSettlementRepository implements SettleoraSettlementRepository {
  int listBalancesCalls = 0;
  int listRequestsCalls = 0;

  @override
  Future<SettleoraSettlementRequest> cancelSettlementRequest(
    String settlementId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementPayment> cancelSettlementPayment(String paymentId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementPayment> confirmSettlementPayment(
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

  @override
  Future<SettleoraSettlementRequest> disputeSettlementRequest(
    String settlementId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementPayment> disputeSettlementPayment(
    String paymentId,
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
  Future<SettleoraSettlementRequest> getSettlementRequest(String settlementId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementBalanceSnapshot> listBalances() {
    listBalancesCalls += 1;
    return Future.value(
      SettleoraSettlementBalanceSnapshot(
        generatedAtUtc: DateTime.utc(2026, 5, 18),
        balances: const [],
      ),
    );
  }

  @override
  Future<List<SettleoraSettlementPayment>> listSettlementPayments(
    String settlementId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<List<SettleoraSettlementRequest>> listSettlementRequests() {
    listRequestsCalls += 1;
    return Future.value(const []);
  }
}

const _billId = '22222222-2222-2222-2222-222222222222';
const _revisionId = '33333333-3333-3333-3333-333333333333';
const _createdRevisionId = '44444444-4444-4444-4444-444444444444';
const _userProfileId = '55555555-5555-5555-5555-555555555555';
const _hash =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
final _createdAtUtc = DateTime.utc(2026, 5, 17, 10);
final _attemptedAtUtc = DateTime.utc(2026, 5, 17, 11);
