import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/settleora_api_client.dart';
import 'package:mobile/app/auth_session_repository.dart';
import 'package:mobile/app/secure_storage.dart';
import 'package:mobile/app/server_mode_shell.dart';
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
  testWidgets('dashboard overview renders repository summaries', (
    tester,
  ) async {
    final billRepository = FakeBillRepository(bills: [sampleBill()]);
    final notificationRepository = FakeNotificationRepository(
      summary: const SettleoraNotificationSummary(
        unreadCount: 2,
        attentionCount: 1,
        urgentCount: 0,
      ),
    );
    final settlementRepository = FakeSettlementRepository(
      balances: [sampleBalance()],
      requests: [sampleSettlementRequest()],
    );
    final recurringRepository = FakeRecurringBillRepository(
      templates: [sampleTemplate()],
      forecast: [sampleOccurrence()],
    );

    await pumpShell(
      tester,
      billRepository: billRepository,
      notificationRepository: notificationRepository,
      settlementRepository: settlementRepository,
      recurringRepository: recurringRepository,
    );

    expect(find.text('Today'), findsOneWidget);
    expect(find.text('Personal bills'), findsOneWidget);
    expect(find.textContaining('1 recent active bill'), findsOneWidget);
    expect(find.textContaining('Latest: Corner Market'), findsOneWidget);
    expect(find.text('Shared bills'), findsOneWidget);
    expect(
      find.textContaining(
        'No global shared-bill count is exposed by this mobile seam yet.',
      ),
      findsOneWidget,
    );
    expect(find.textContaining('1 request may need review'), findsOneWidget);
    expect(
      find.textContaining('1 forecast item ready for draft review'),
      findsOneWidget,
    );
    expect(find.textContaining('2 unread notifications'), findsOneWidget);
    expect(
      find.byKey(const Key('server-shell-sync-status-card')),
      findsNothing,
    );
    expect(billRepository.listCalls, 1);
    expect(notificationRepository.summaryCalls, 1);
    expect(settlementRepository.listBalanceCalls, 1);
    expect(recurringRepository.listForecastCalls, 1);
  });

  testWidgets('dashboard cards navigate to existing mobile surfaces', (
    tester,
  ) async {
    final billRepository = FakeBillRepository(bills: [sampleBill()]);
    final notificationRepository = FakeNotificationRepository(
      notifications: [sampleNotification()],
    );

    await pumpShell(
      tester,
      billRepository: billRepository,
      notificationRepository: notificationRepository,
    );

    await tester.tap(find.byKey(const Key('server-shell-bills')));
    await tester.pumpAndSettle();

    expect(find.text('Bills'), findsOneWidget);
    expect(find.byKey(const Key('bill-list-create')), findsOneWidget);

    await tester.pageBack();
    await tester.pumpAndSettle();

    final notificationsTile = find.byKey(
      const Key('server-shell-notifications'),
    );
    await tester.dragUntilVisible(
      notificationsTile,
      find.byType(Scrollable).first,
      const Offset(0, -300),
    );
    await tester.ensureVisible(notificationsTile);
    await tester.pumpAndSettle();
    await tester.tap(notificationsTile);
    await tester.pumpAndSettle();

    expect(find.text('Notifications'), findsOneWidget);
    expect(find.text('Bill submitted'), findsOneWidget);
  });

  testWidgets('dashboard renders honest empty state', (tester) async {
    await pumpShell(tester);

    expect(
      find.byKey(const Key('server-shell-create-personal-bill')),
      findsOneWidget,
    );
    expect(find.text('Create bill'), findsOneWidget);
    expect(find.byKey(const Key('server-shell-create-group')), findsOneWidget);
    expect(find.text('Create group'), findsOneWidget);
    expect(
      find.text(
        'No overview items yet. Open a section below to create or review Day 1 records.',
      ),
      findsOneWidget,
    );
    expect(
      find.textContaining('Open bills to create or review personal records'),
      findsOneWidget,
    );
    expect(
      find.textContaining('Open groups to review shared bill activity'),
      findsOneWidget,
    );
    expect(
      find.textContaining(
        'Open recurring bills to review templates and forecast',
      ),
      findsOneWidget,
    );
  });

  testWidgets('dashboard quick action opens personal bill create screen', (
    tester,
  ) async {
    await pumpShell(tester);

    await tester.tap(
      find.byKey(const Key('server-shell-create-personal-bill')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Create bill'), findsWidgets);
    expect(find.byKey(const Key('personal-bill-date')), findsOneWidget);
    expect(find.byKey(const Key('personal-bill-item-name-0')), findsOneWidget);
  });

  testWidgets(
    'dashboard quick action refreshes overview after create success',
    (tester) async {
      final billRepository = FakeBillRepository(
        bills: [sampleBill()],
        createdDetail: sampleBillDetail(
          id: _createdBillId,
          merchantName: 'Quick Cafe',
        ),
      );

      await pumpShell(tester, billRepository: billRepository);

      expect(billRepository.listCalls, 1);

      await tester.tap(
        find.byKey(const Key('server-shell-create-personal-bill')),
      );
      await tester.pumpAndSettle();

      await fillMinimalPersonalBillCreateForm(tester);
      await tester.tap(find.byKey(const Key('personal-bill-save')));
      await tester.pumpAndSettle();

      expect(find.text('Today'), findsOneWidget);
      expect(find.byKey(const Key('personal-bill-date')), findsNothing);
      expect(billRepository.createCalls, 1);
      expect(billRepository.lastCreateDraft?.merchantName, 'Quick Cafe');
      expect(billRepository.listCalls, 2);
      expect(find.textContaining('Latest: Quick Cafe'), findsOneWidget);
    },
  );

  testWidgets('dashboard quick action back does not create or refresh', (
    tester,
  ) async {
    final billRepository = FakeBillRepository(bills: [sampleBill()]);

    await pumpShell(tester, billRepository: billRepository);

    expect(billRepository.listCalls, 1);

    await tester.tap(
      find.byKey(const Key('server-shell-create-personal-bill')),
    );
    await tester.pumpAndSettle();

    await tester.pageBack();
    await tester.pumpAndSettle();

    expect(
      find.byKey(const Key('server-shell-create-personal-bill')),
      findsOneWidget,
    );
    expect(find.byKey(const Key('personal-bill-date')), findsNothing);
    expect(billRepository.createCalls, 0);
    expect(billRepository.listCalls, 1);
    expect(find.text('Refreshing overview'), findsNothing);
  });

  testWidgets(
    'dashboard create group quick action opens existing group create flow',
    (tester) async {
      final billRepository = FakeBillRepository(bills: [sampleBill()]);
      final groupRepository = FakeGroupRepository();

      await pumpShell(
        tester,
        billRepository: billRepository,
        groupRepository: groupRepository,
      );

      expect(billRepository.listCalls, 1);

      await tester.tap(find.byKey(const Key('server-shell-create-group')));
      await tester.pumpAndSettle();

      expect(find.text('Groups'), findsOneWidget);
      expect(find.text('Create Group'), findsOneWidget);
      expect(find.byKey(const Key('group-form-name')), findsOneWidget);
      expect(groupRepository.listCalls, 1);
      expect(groupRepository.createCalls, 0);

      await tester.enterText(find.byKey(const Key('group-form-name')), 'House');
      await tester.tap(find.byKey(const Key('group-form-save')));
      await tester.pumpAndSettle();

      expect(groupRepository.createCalls, 1);
      expect(groupRepository.lastGroupSave?.name, 'House');
      expect(find.text('House'), findsOneWidget);
      expect(find.text('Group created.'), findsOneWidget);

      await tester.pageBack();
      await tester.pumpAndSettle();

      expect(
        find.byKey(const Key('server-shell-create-group')),
        findsOneWidget,
      );
      expect(billRepository.listCalls, 2);
    },
  );

  testWidgets('dashboard create group cancel does not create a group', (
    tester,
  ) async {
    final billRepository = FakeBillRepository(bills: [sampleBill()]);
    final groupRepository = FakeGroupRepository();

    await pumpShell(
      tester,
      billRepository: billRepository,
      groupRepository: groupRepository,
    );

    await tester.tap(find.byKey(const Key('server-shell-create-group')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('group-form-cancel')));
    await tester.pumpAndSettle();

    expect(find.text('Groups'), findsOneWidget);
    expect(find.text('Create Group'), findsNothing);
    expect(groupRepository.createCalls, 0);
    expect(find.text('Group created.'), findsNothing);

    await tester.pageBack();
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('server-shell-create-group')), findsOneWidget);
    expect(billRepository.listCalls, 2);
  });

  testWidgets('dashboard retries bounded load failures', (tester) async {
    final billRepository = FakeBillRepository(
      failures: [
        const SettleoraBillFailure(
          kind: SettleoraBillFailureKind.network,
          message:
              'The server is unavailable. Try again when the connection is back.',
        ),
      ],
      bills: [sampleBill()],
    );

    await pumpShell(tester, billRepository: billRepository);

    expect(find.text('Server unavailable'), findsOneWidget);
    expect(
      find.text(
        'The server is unavailable. Try again when the connection is back.',
      ),
      findsOneWidget,
    );
    expect(find.byKey(const Key('dashboard-overview-retry')), findsOneWidget);

    await tester.tap(find.byKey(const Key('dashboard-overview-retry')));
    await tester.pumpAndSettle();

    expect(find.text('Personal bills'), findsOneWidget);
    expect(find.textContaining('Latest: Corner Market'), findsOneWidget);
    expect(billRepository.listCalls, 2);
  });

  testWidgets(
    'manual dashboard refresh keeps visible overview and deduplicates',
    (tester) async {
      final billRepository = FakeBillRepository(bills: [sampleBill()]);

      await pumpShell(tester, billRepository: billRepository);

      expect(find.textContaining('Latest: Corner Market'), findsOneWidget);
      expect(billRepository.listCalls, 1);

      final refreshGate = Completer<void>();
      billRepository.nextListPersonalBillsGate = refreshGate;
      billRepository.bills = [sampleBill(merchantName: 'Fresh Grocer')];

      await tester.tap(find.byKey(const Key('dashboard-overview-refresh')));
      await tester.pump();

      expect(find.text('Refreshing overview'), findsOneWidget);
      expect(find.textContaining('Latest: Corner Market'), findsOneWidget);
      expect(billRepository.listCalls, 2);

      await tester.tap(find.byKey(const Key('dashboard-overview-refresh')));
      await tester.pump();

      expect(billRepository.listCalls, 2);

      refreshGate.complete();
      await tester.pumpAndSettle();

      expect(find.text('Refreshing overview'), findsNothing);
      expect(find.textContaining('Latest: Fresh Grocer'), findsOneWidget);
      expect(billRepository.listCalls, 2);
    },
  );

  testWidgets('returning from bills refreshes dashboard overview', (
    tester,
  ) async {
    final billRepository = FakeBillRepository(bills: [sampleBill()]);

    await pumpShell(tester, billRepository: billRepository);

    expect(billRepository.listCalls, 1);

    await tester.tap(find.byKey(const Key('server-shell-bills')));
    await tester.pumpAndSettle();

    final callsAfterOpeningBills = billRepository.listCalls;
    expect(find.text('Bills'), findsOneWidget);

    await tester.pageBack();
    await tester.pumpAndSettle();

    expect(billRepository.listCalls, callsAfterOpeningBills + 1);
  });

  testWidgets('dashboard shows compact pending sync status', (tester) async {
    final billRepository = FakeBillRepository(bills: [sampleBill()]);
    final store = MemorySyncQueueStore(
      initialState: SettleoraSyncQueueState(
        items: [
          sampleSyncItem(
            id: 'sync-queued-1',
            resourceId: _billId,
            state: SettleoraSyncQueueItemStateValues.queued,
          ),
          sampleSyncItem(
            id: 'sync-syncing-1',
            resourceId: 'bill-2',
            state: SettleoraSyncQueueItemStateValues.syncing,
          ),
        ],
      ),
    );

    await pumpShell(
      tester,
      billRepository: billRepository,
      billSyncController: sampleBillSyncController(store: store),
    );

    expect(
      find.byKey(const Key('server-shell-sync-status-card')),
      findsOneWidget,
    );
    expect(find.text('Sync pending'), findsOneWidget);
    expect(find.textContaining('2 pending'), findsOneWidget);
    expect(find.text('Review in Bills'), findsOneWidget);
  });

  testWidgets('dashboard sync status prioritizes attention counts', (
    tester,
  ) async {
    final store = MemorySyncQueueStore(
      initialState: SettleoraSyncQueueState(
        items: [
          sampleSyncItem(
            id: 'sync-queued-1',
            resourceId: _billId,
            state: SettleoraSyncQueueItemStateValues.queued,
          ),
          sampleSyncItem(
            id: 'sync-failed-1',
            resourceId: 'bill-2',
            state: SettleoraSyncQueueItemStateValues.failed,
          ),
          sampleSyncItem(
            id: 'sync-conflict-1',
            resourceId: 'bill-3',
            state: SettleoraSyncQueueItemStateValues.conflict,
          ),
        ],
      ),
    );

    await pumpShell(
      tester,
      billSyncController: sampleBillSyncController(store: store),
    );

    expect(find.text('Sync needs attention'), findsOneWidget);
    expect(find.textContaining('1 pending'), findsOneWidget);
    expect(find.textContaining('1 failed'), findsOneWidget);
    expect(find.textContaining('1 conflict'), findsOneWidget);
  });

  testWidgets('dashboard sync status action opens bills surface', (
    tester,
  ) async {
    final store = MemorySyncQueueStore(
      initialState: SettleoraSyncQueueState(
        items: [
          sampleSyncItem(
            id: 'sync-queued-1',
            resourceId: _billId,
            state: SettleoraSyncQueueItemStateValues.queued,
          ),
        ],
      ),
    );

    await pumpShell(
      tester,
      billSyncController: sampleBillSyncController(store: store),
    );

    await tester.tap(
      find.byKey(const Key('server-shell-sync-status-open-bills')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Bills'), findsOneWidget);
    expect(find.byKey(const Key('bill-list-create')), findsOneWidget);
  });

  testWidgets('returning from bills refreshes dashboard sync status', (
    tester,
  ) async {
    final store = MemorySyncQueueStore();

    await pumpShell(
      tester,
      billSyncController: sampleBillSyncController(store: store),
    );

    expect(
      find.byKey(const Key('server-shell-sync-status-card')),
      findsNothing,
    );

    await tester.tap(find.byKey(const Key('server-shell-bills')));
    await tester.pumpAndSettle();

    store.state = SettleoraSyncQueueState(
      items: [
        sampleSyncItem(
          id: 'sync-queued-1',
          resourceId: _billId,
          state: SettleoraSyncQueueItemStateValues.queued,
        ),
      ],
    );

    await tester.pageBack();
    await tester.pumpAndSettle();

    expect(
      find.byKey(const Key('server-shell-sync-status-card')),
      findsOneWidget,
    );
    expect(find.text('Sync pending'), findsOneWidget);
  });

  testWidgets('dashboard omits sync card when local sync read fails', (
    tester,
  ) async {
    final billRepository = FakeBillRepository(bills: [sampleBill()]);

    await pumpShell(
      tester,
      billRepository: billRepository,
      billSyncController: sampleBillSyncController(
        store: FailingSyncQueueStore(),
      ),
    );

    expect(find.text('Personal bills'), findsOneWidget);
    expect(find.textContaining('Latest: Corner Market'), findsOneWidget);
    expect(
      find.byKey(const Key('server-shell-sync-status-card')),
      findsNothing,
    );
    expect(find.text('Overview unavailable'), findsNothing);
  });

  testWidgets('returning from notifications refreshes dashboard overview', (
    tester,
  ) async {
    final notificationRepository = FakeNotificationRepository(
      notifications: [sampleNotification()],
    );

    await pumpShell(tester, notificationRepository: notificationRepository);

    expect(notificationRepository.summaryCalls, 1);

    final notificationsTile = find.byKey(
      const Key('server-shell-notifications'),
    );
    await tester.dragUntilVisible(
      notificationsTile,
      find.byType(Scrollable).first,
      const Offset(0, -300),
    );
    await tester.ensureVisible(notificationsTile);
    await tester.pumpAndSettle();
    await tester.tap(notificationsTile);
    await tester.pumpAndSettle();

    final callsAfterOpeningNotifications = notificationRepository.summaryCalls;
    expect(find.text('Notifications'), findsOneWidget);

    await tester.pageBack();
    await tester.pumpAndSettle();

    expect(
      notificationRepository.summaryCalls,
      callsAfterOpeningNotifications + 1,
    );
  });
}

Future<void> pumpShell(
  WidgetTester tester, {
  FakeBillRepository? billRepository,
  FakeGroupRepository? groupRepository,
  FakeNotificationRepository? notificationRepository,
  FakeSettlementRepository? settlementRepository,
  FakeRecurringBillRepository? recurringRepository,
  SettleoraBillSyncController? billSyncController,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: SettleoraAuthenticatedServerShell(
        currentUser: sampleCurrentUser(),
        receiptOcrReviewRepository: FakeReceiptOcrReviewRepository(),
        billRepository: billRepository ?? FakeBillRepository(),
        settlementRepository:
            settlementRepository ?? FakeSettlementRepository(),
        recurringBillRepository:
            recurringRepository ?? FakeRecurringBillRepository(),
        groupRepository: groupRepository ?? FakeGroupRepository(),
        notificationRepository:
            notificationRepository ?? FakeNotificationRepository(),
        reportRepository: FakeMonthlyReportRepository(),
        profileRepository: FakeProfileRepository(),
        billSyncController: billSyncController ?? sampleBillSyncController(),
        authRepository: FakeAuthRepository(),
        accessTokenProvider: FakeAccessTokenProvider(),
        onSessionEnded: (_) async {},
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> fillMinimalPersonalBillCreateForm(WidgetTester tester) async {
  await tester.enterText(
    find.byKey(const Key('personal-bill-merchant-name')),
    'Quick Cafe',
  );
  await tester.enterText(
    find.byKey(const Key('personal-bill-date')),
    '2026-06-08',
  );
  await tester.enterText(
    find.byKey(const Key('personal-bill-item-name-0')),
    'Lunch',
  );
  await tester.enterText(
    find.byKey(const Key('personal-bill-item-amount-0')),
    '18.40',
  );
}

SettleoraCurrentUser sampleCurrentUser() {
  return SettleoraCurrentUser(
    userProfileId: _profileId,
    displayName: 'Taylor',
    defaultCurrency: 'USD',
    roles: const ['owner'],
    sessionExpiresAtUtc: DateTime.utc(2026, 6, 8),
  );
}

SettleoraBillSummary sampleBill({String merchantName = 'Corner Market'}) {
  return SettleoraBillSummary(
    id: _billId,
    merchantName: merchantName,
    billDate: '2026-06-07',
    status: 'confirmed',
    reconciliationStatus: 'unreconciled',
    totalAmount: '24.50',
    totalCurrency: 'USD',
    archiveState: SettleoraBillArchiveStateValues.active,
    itemCount: 2,
    participantCount: 1,
    payerCount: 1,
    createdAtUtc: DateTime.utc(2026, 6, 7, 10),
    updatedAtUtc: DateTime.utc(2026, 6, 7, 10),
  );
}

SettleoraBillDetail sampleBillDetail({
  String id = _billId,
  String? merchantName = 'Corner Market',
  String billDate = '2026-06-08',
  String totalAmount = '18.40',
  String totalCurrency = 'USD',
}) {
  return SettleoraBillDetail(
    id: id,
    merchantName: merchantName,
    billDate: billDate,
    status: 'draft',
    reconciliationStatus: 'unreconciled',
    reconciliationNote: null,
    revisionCreationActions: const SettleoraBillRevisionCreationActions(
      canCreateRevision: false,
    ),
    totalAmount: totalAmount,
    totalCurrency: totalCurrency,
    createdAtUtc: DateTime.utc(2026, 6, 8, 9),
    updatedAtUtc: DateTime.utc(2026, 6, 8, 9),
    items: const [
      SettleoraBillItem(
        id: 'item-1',
        name: 'Lunch',
        note: null,
        amount: '18.40',
        currency: 'USD',
        sortOrder: 0,
      ),
    ],
    participants: const [
      SettleoraBillParticipant(
        userProfileId: _profileId,
        status: 'pending_acceptance',
        resolvedShareAmount: '18.40',
        resolvedShareCurrency: 'USD',
      ),
    ],
    payers: const [
      SettleoraBillPayer(
        userProfileId: _profileId,
        amount: '18.40',
        currency: 'USD',
      ),
    ],
    adjustments: const [],
  );
}

SettleoraSettlementBalance sampleBalance() {
  return const SettleoraSettlementBalance(
    counterpartyUserProfileId: 'counterparty-1',
    groupId: null,
    direction: SettleoraSettlementBalanceDirectionValues.outgoing,
    currency: 'USD',
    selectedLineAmount: '10.00',
    pendingClaimedAmount: '0.00',
    confirmedClearedAmount: '0.00',
    remainingUnclaimedAmount: '10.00',
    confirmedRemainingResidualAmount: '0.00',
    waivedResidualAmount: '0.00',
    creditResidualAmount: '0.00',
    requestCount: 1,
    lineCount: 1,
    pendingPaymentCount: 0,
    confirmedPaymentCount: 0,
  );
}

SettleoraSettlementRequest sampleSettlementRequest() {
  return SettleoraSettlementRequest(
    id: _settlementId,
    sourceExpenseBillId: _billId,
    groupId: null,
    debtorUserProfileId: _profileId,
    creditorUserProfileId: 'counterparty-1',
    amount: '10.00',
    currency: 'USD',
    status: SettleoraSettlementRequestStatusValues.requested,
    requestedByUserProfileId: 'counterparty-1',
    requestedAtUtc: DateTime.utc(2026, 6, 7, 11),
    createdAtUtc: DateTime.utc(2026, 6, 7, 11),
    updatedAtUtc: DateTime.utc(2026, 6, 7, 11),
    lines: const [],
  );
}

SettleoraRecurringBillTemplateSummary sampleTemplate() {
  return SettleoraRecurringBillTemplateSummary(
    id: _templateId,
    merchantName: 'Rent',
    description: null,
    status: SettleoraRecurringBillTemplateStatusValues.active,
    schedule: const SettleoraRecurringBillSchedule(
      type: SettleoraRecurringBillScheduleTypeValues.monthly,
      intervalCount: 1,
      intervalDays: null,
      startDate: '2026-06-01',
      endDate: null,
      dueOffsetDays: 3,
    ),
    forecastAmount: '1200.00',
    forecastCurrency: 'USD',
    nextOccurrenceDate: '2026-07-01',
    createdAtUtc: DateTime.utc(2026, 6, 1),
    updatedAtUtc: DateTime.utc(2026, 6, 1),
    archivedAtUtc: null,
    isGroupScoped: false,
  );
}

SettleoraRecurringBillForecastOccurrence sampleOccurrence() {
  return const SettleoraRecurringBillForecastOccurrence(
    templateId: _templateId,
    occurrenceId: null,
    occurrenceDate: '2026-07-01',
    dueDate: '2026-07-04',
    status: SettleoraRecurringBillOccurrenceStatusValues.forecasted,
    draftGenerated: false,
    generatedBillId: null,
    forecastAmount: '1200.00',
    forecastCurrency: 'USD',
    merchantName: 'Rent',
    isGroupScoped: false,
  );
}

SettleoraNotificationRow sampleNotification() {
  return SettleoraNotificationRow(
    id: 'notification-1',
    eventType: 'bill.submitted',
    status: SettleoraNotificationStatusValues.unread,
    priority: SettleoraNotificationPriorityValues.normal,
    subjectType: SettleoraNotificationSubjectTypeValues.expenseBill,
    safeSummary: 'Dinner bill is ready.',
    actionUrl: null,
    groupId: null,
    expenseBillId: _billId,
    expenseBillRevisionId: null,
    settlementRequestId: null,
    settlementPaymentId: null,
    recurringBillTemplateId: null,
    recurringBillOccurrenceId: null,
    createdAtUtc: DateTime.utc(2026, 6, 7, 12),
    readAtUtc: null,
    archivedAtUtc: null,
  );
}

SettleoraGroup sampleGroup({String id = _groupId, String name = 'Trip Crew'}) {
  return SettleoraGroup(
    id: id,
    name: name,
    currentUserRole: SettleoraGroupRoleValues.owner,
    currentUserStatus: SettleoraGroupMembershipStatusValues.active,
    createdAtUtc: DateTime.utc(2026, 6, 7, 12),
    updatedAtUtc: DateTime.utc(2026, 6, 7, 12),
  );
}

SettleoraBillSyncController sampleBillSyncController({
  SettleoraSyncQueueStore? store,
}) {
  final queueStore = store ?? MemorySyncQueueStore();
  return SettleoraBillSyncController(
    queueStore: queueStore,
    queueProcessor: SettleoraSyncQueueProcessor(
      queueStore: queueStore,
      repository: FakeSyncRepository(),
    ),
  );
}

SettleoraSyncQueueItem sampleSyncItem({
  required String id,
  required String resourceId,
  required SettleoraSyncQueueItemState state,
}) {
  final createdAtUtc = DateTime.utc(2026, 6, 7, 12);
  return SettleoraSyncQueueItem(
    id: id,
    idempotencyKey: 'mobile-sync:bill_archive:expense_bill:$resourceId:$id',
    operationType: SettleoraSyncOperationTypeValues.billArchive,
    resourceType: SettleoraSyncResourceTypeValues.expenseBill,
    resourceId: resourceId,
    baseVersion: null,
    payload: const {},
    state: state,
    safeErrorCode: state == SettleoraSyncQueueItemStateValues.failed
        ? 'network'
        : null,
    safeMessage: state == SettleoraSyncQueueItemStateValues.failed
        ? 'Sync failed.'
        : null,
    createdAtUtc: createdAtUtc,
    updatedAtUtc: createdAtUtc,
    lastAttemptAtUtc: null,
    attemptCount: state == SettleoraSyncQueueItemStateValues.queued ? 0 : 1,
  );
}

class FakeBillRepository implements SettleoraBillRepository {
  FakeBillRepository({
    this.bills = const [],
    this.failures = const [],
    SettleoraBillDetail? createdDetail,
  }) : createdDetail = createdDetail ?? sampleBillDetail();

  List<SettleoraBillSummary> bills;
  final List<SettleoraBillFailure> failures;
  final SettleoraBillDetail createdDetail;
  Completer<void>? nextListPersonalBillsGate;
  int listCalls = 0;
  int createCalls = 0;
  SettleoraPersonalBillCreateDraft? lastCreateDraft;

  @override
  Future<List<SettleoraBillSummary>> listPersonalBills({int limit = 50}) async {
    listCalls += 1;
    final gate = nextListPersonalBillsGate;
    if (gate != null) {
      nextListPersonalBillsGate = null;
      await gate.future;
    }
    if (listCalls <= failures.length) {
      throw failures[listCalls - 1];
    }
    return bills;
  }

  @override
  Future<SettleoraBillDetail> getPersonalBill(String billId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillDetail> createPersonalBill(
    SettleoraPersonalBillCreateDraft draft,
  ) async {
    createCalls += 1;
    lastCreateDraft = draft;
    bills = [
      SettleoraBillSummary(
        id: createdDetail.id,
        merchantName: createdDetail.merchantName,
        billDate: createdDetail.billDate,
        status: createdDetail.status,
        reconciliationStatus: createdDetail.reconciliationStatus,
        totalAmount: createdDetail.totalAmount,
        totalCurrency: createdDetail.totalCurrency,
        archiveState: SettleoraBillArchiveStateValues.active,
        itemCount: createdDetail.items.length,
        participantCount: createdDetail.participants.length,
        payerCount: createdDetail.payers.length,
        createdAtUtc: createdDetail.createdAtUtc,
        updatedAtUtc: createdDetail.updatedAtUtc,
      ),
      ...bills.where((bill) => bill.id != createdDetail.id),
    ];
    return createdDetail;
  }

  @override
  Future<List<SettleoraBillSummary>> listGroupBills(
    String groupId, {
    int limit = 50,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillDetail> createGroupBill(
    String groupId,
    SettleoraGroupBillCreateDraft draft,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<void> submitGroupBill(String groupId, String billId) {
    throw UnimplementedError();
  }

  @override
  Future<void> acceptGroupBillParticipant(
    String groupId,
    String billId,
    String userProfileId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<void> rejectGroupBillParticipant(
    String groupId,
    String billId,
    String userProfileId,
    SettleoraBillParticipantRejectionReasonCode reasonCode,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillDetail> getGroupBill(String groupId, String billId) {
    throw UnimplementedError();
  }
}

class FakeNotificationRepository implements SettleoraNotificationRepository {
  FakeNotificationRepository({
    this.summary = const SettleoraNotificationSummary(
      unreadCount: 0,
      attentionCount: 0,
      urgentCount: 0,
    ),
    this.notifications = const [],
  });

  final SettleoraNotificationSummary summary;
  final List<SettleoraNotificationRow> notifications;
  int summaryCalls = 0;

  @override
  Future<SettleoraNotificationSummary> getNotificationSummary() async {
    summaryCalls += 1;
    return summary;
  }

  @override
  Future<List<SettleoraNotificationRow>> listNotifications({
    SettleoraNotificationStatus? status,
    int limit = 50,
    DateTime? before,
  }) async {
    return notifications;
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

class FakeSettlementRepository implements SettleoraSettlementRepository {
  FakeSettlementRepository({
    this.balances = const [],
    this.requests = const [],
  });

  final List<SettleoraSettlementBalance> balances;
  final List<SettleoraSettlementRequest> requests;
  int listBalanceCalls = 0;

  @override
  Future<SettleoraSettlementBalanceSnapshot> listBalances() async {
    listBalanceCalls += 1;
    return SettleoraSettlementBalanceSnapshot(
      generatedAtUtc: DateTime.utc(2026, 6, 7, 12),
      balances: balances,
    );
  }

  @override
  Future<List<SettleoraSettlementRequest>> listSettlementRequests() async {
    return requests;
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
  Future<SettleoraSettlementPayment> markSettlementPaymentPaid({
    required String settlementId,
    required String amount,
    required String currency,
    required String paymentDate,
  }) {
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

class FakeRecurringBillRepository implements SettleoraRecurringBillRepository {
  FakeRecurringBillRepository({
    this.templates = const [],
    this.forecast = const [],
  });

  final List<SettleoraRecurringBillTemplateSummary> templates;
  final List<SettleoraRecurringBillForecastOccurrence> forecast;
  int listForecastCalls = 0;

  @override
  Future<List<SettleoraRecurringBillTemplateSummary>> listTemplates({
    SettleoraRecurringBillTemplateStatus? status,
    String? groupId,
    String? fromDate,
    String? toDate,
    int maxItems = 100,
  }) async {
    return templates;
  }

  @override
  Future<List<SettleoraRecurringBillForecastOccurrence>> listForecast({
    String? fromDate,
    String? toDate,
    int limit = 30,
    String? groupId,
  }) async {
    listForecastCalls += 1;
    return forecast;
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

class FakeGroupRepository implements SettleoraGroupRepository {
  FakeGroupRepository({List<SettleoraGroup>? groups})
    : groups = groups ?? const [];

  List<SettleoraGroup> groups;
  int listCalls = 0;
  int createCalls = 0;
  SettleoraGroupSaveRequest? lastGroupSave;

  @override
  Future<List<SettleoraGroup>> listGroups() async {
    listCalls += 1;
    return groups;
  }

  @override
  Future<SettleoraGroup> createGroup(SettleoraGroupSaveRequest request) async {
    createCalls += 1;
    lastGroupSave = request;
    final group = sampleGroup(name: request.name.trim());
    groups = [group, ...groups.where((item) => item.id != group.id)];
    return group;
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
  }) {
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

class FakeAuthRepository implements SettleoraAuthRepository {
  @override
  Future<SettleoraServerSessionMaterial> signIn(
    SettleoraSignInSubmission submission,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraCurrentUser> currentUser({required String accessToken}) {
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
  Future<void> signOutAllCurrentAccountSessions({required String accessToken}) {
    throw UnimplementedError();
  }

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
  }) {
    throw UnimplementedError();
  }
}

class FakeAccessTokenProvider implements SettleoraAccessTokenProvider {
  @override
  Future<String?> accessToken() async => 'test-access-token';
}

class MemorySyncQueueStore extends SettleoraSyncQueueStore {
  MemorySyncQueueStore({SettleoraSyncQueueState? initialState})
    : state = initialState ?? SettleoraSyncQueueState.empty();

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

class FailingSyncQueueStore extends SettleoraSyncQueueStore {
  @override
  int get maxItemCount => 100;

  @override
  Future<SettleoraSyncQueueState> read() {
    throw const SettleoraSyncQueueFailure(
      kind: SettleoraSyncQueueFailureKind.storage,
      message: 'Sync status is unavailable.',
    );
  }

  @override
  Future<void> write(SettleoraSyncQueueState state) {
    throw UnimplementedError();
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

const _profileId = 'profile-1';
const _billId = 'bill-1';
const _createdBillId = 'created-bill-1';
const _groupId = 'group-1';
const _settlementId = 'settlement-1';
const _templateId = 'template-1';
