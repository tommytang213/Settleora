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
import 'package:mobile/ui/settleora_components.dart';

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

    expect(find.text('Good morning'), findsOneWidget);
    expect(find.text('Welcome back, Taylor'), findsOneWidget);
    expect(find.text('Secure & synced - USD'), findsOneWidget);
    expect(find.text('Quick actions'), findsOneWidget);
    expect(find.text('Needs attention'), findsOneWidget);
    expect(find.byKey(const Key('server-shell-bottom-nav')), findsOneWidget);
    expect(bottomNavDestination(const Key('bottom-nav-home')), findsOneWidget);
    expect(bottomNavDestination(const Key('bottom-nav-bills')), findsOneWidget);
    expect(
      bottomNavDestination(const Key('bottom-nav-groups')),
      findsOneWidget,
    );
    expect(
      bottomNavDestination(const Key('bottom-nav-settle')),
      findsOneWidget,
    );
    expect(
      bottomNavDestination(const Key('bottom-nav-receipts')),
      findsOneWidget,
    );
    expect(
      bottomNavDestination(const Key('bottom-nav-profile')),
      findsOneWidget,
    );
    expectSelectedBottomNav(tester, SettleoraNavDestination.home);
    expect(find.text('You owe'), findsOneWidget);
    expect(find.text("You're owed"), findsOneWidget);
    expect(find.text('No balances yet'), findsNothing);
    expect(find.text('Upcoming bills'), findsOneWidget);
    expect(find.text('Group activity'), findsOneWidget);
    expect(find.text('This month'), findsOneWidget);
    expect(
      find.byKey(const Key('server-shell-notifications-header')),
      findsOneWidget,
    );
    expect(find.text('Active bills'), findsOneWidget);
    expect(find.text('All bills'), findsNothing);
    expect(find.text('Recurring forecast'), findsNothing);
    expect(find.text('Corner Market'), findsOneWidget);
    expect(find.text('USD 24.50'), findsOneWidget);
    expect(find.textContaining('Latest: Corner Market'), findsOneWidget);
    expect(find.text('Open groups'), findsOneWidget);
    expect(
      find.textContaining('Create a group or shared bill to see activity here'),
      findsNothing,
    );
    expect(
      find.textContaining('No global shared-bill count is exposed'),
      findsNothing,
    );
    expect(find.textContaining('_DashboardBillRow'), findsNothing);
    expect(find.textContaining('dependencies:'), findsNothing);
    expect(find.textContaining('1 request may need review'), findsWidgets);
    expect(
      find.textContaining('1 forecast item ready for draft review'),
      findsWidgets,
    );
    expect(find.textContaining('2 unread update'), findsOneWidget);
    expect(
      find.byKey(const Key('server-shell-sync-status-card')),
      findsNothing,
    );
    expect(billRepository.listCalls, 1);
    expect(notificationRepository.summaryCalls, 1);
    expect(settlementRepository.listBalanceCalls, 1);
    expect(recurringRepository.listForecastCalls, 1);
  });

  testWidgets('bottom nav uses canonical M2 labels on Home', (tester) async {
    await pumpShell(tester);

    expectCanonicalBottomNav(tester, selectedIndex: 0);
  });

  testWidgets('bottom nav stays canonical across top-level shell routes', (
    tester,
  ) async {
    await pumpShell(
      tester,
      groupRepository: FakeGroupRepository(groups: [sampleGroup()]),
    );

    await tester.tap(bottomNavDestination(const Key('bottom-nav-bills')));
    await tester.pumpAndSettle();
    expect(find.text('Bills'), findsWidgets);
    expectCanonicalBottomNav(tester, selectedIndex: 1);
    expectSingleCanonicalBottomNav(tester);

    await tester.tap(bottomNavDestination(const Key('bottom-nav-groups')));
    await tester.pumpAndSettle();
    expect(find.text('Groups'), findsWidgets);
    expectCanonicalBottomNav(tester, selectedIndex: 2);
    expectSingleCanonicalBottomNav(tester);

    await tester.tap(bottomNavDestination(const Key('bottom-nav-settle')));
    await tester.pumpAndSettle();
    expect(find.text('Settlements'), findsWidgets);
    expectCanonicalBottomNav(tester, selectedIndex: 3);
    expectSingleCanonicalBottomNav(tester);

    await tester.tap(bottomNavDestination(const Key('bottom-nav-receipts')));
    await tester.pumpAndSettle();
    expect(find.text('Receipt Reviews'), findsWidgets);
    expectCanonicalBottomNav(tester, selectedIndex: 4);
    expectSingleCanonicalBottomNav(tester);

    await tester.tap(bottomNavDestination(const Key('bottom-nav-profile')));
    await tester.pumpAndSettle();
    expect(find.text('Profile'), findsWidgets);
    expectCanonicalBottomNav(tester, selectedIndex: 5);
    expectSingleCanonicalBottomNav(tester);

    await tester.tap(bottomNavDestination(const Key('bottom-nav-home')));
    await tester.pumpAndSettle();
    expect(
      find.byKey(const Key('server-shell-dashboard-surface')),
      findsOneWidget,
    );
    expectCanonicalBottomNav(tester, selectedIndex: 0);
    expectSingleCanonicalBottomNav(tester);
  });

  testWidgets('bottom nav switches from group bills list to Home', (
    tester,
  ) async {
    final billRepository = FakeBillRepository(groupBills: [sampleBill()]);
    final groupRepository = FakeGroupRepository(
      groups: [sampleGroup()],
      members: [sampleGroupMember()],
    );

    await pumpShell(
      tester,
      billRepository: billRepository,
      groupRepository: groupRepository,
    );

    await tester.tap(bottomNavDestination(const Key('bottom-nav-groups')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Trip Crew'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('group-detail-bills')));
    await tester.pumpAndSettle();

    expect(find.text('Group bills'), findsOneWidget);
    expect(find.text('Corner Market'), findsOneWidget);
    expectCanonicalBottomNav(tester, selectedIndex: 2);

    await tester.tap(bottomNavDestination(const Key('bottom-nav-home')));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const Key('server-shell-dashboard-surface')),
      findsOneWidget,
    );
    expect(find.text('Group bills'), findsNothing);
    expectCanonicalBottomNav(tester, selectedIndex: 0);
    expectSingleCanonicalBottomNav(tester);
  });

  testWidgets('bottom nav switches from bill detail to Groups', (tester) async {
    final billRepository = FakeBillRepository(
      bills: [sampleBill()],
      detail: sampleBillDetail(),
    );
    final groupRepository = FakeGroupRepository(groups: [sampleGroup()]);

    await pumpShell(
      tester,
      billRepository: billRepository,
      groupRepository: groupRepository,
    );

    await tester.tap(bottomNavDestination(const Key('bottom-nav-bills')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();

    expect(find.text('Bill'), findsWidgets);
    expect(find.text('Lunch'), findsOneWidget);
    expectCanonicalBottomNav(tester, selectedIndex: 1);

    await tester.tap(bottomNavDestination(const Key('bottom-nav-groups')));
    await tester.pumpAndSettle();

    expect(find.text('Groups'), findsWidgets);
    expect(find.text('Trip Crew'), findsOneWidget);
    expect(find.text('Bill'), findsNothing);
    expectCanonicalBottomNav(tester, selectedIndex: 2);
    expectSingleCanonicalBottomNav(tester);
  });

  testWidgets('dashboard keeps visible sections on narrow and wide viewports', (
    tester,
  ) async {
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 820);
    await pumpShell(tester, billRepository: FakeBillRepository());

    expect(find.text('Quick actions'), findsOneWidget);
    expect(find.text('Needs attention'), findsOneWidget);
    expect(find.text('Upcoming bills'), findsOneWidget);
    expect(find.text('Group activity'), findsOneWidget);
    expect(find.text('This month'), findsOneWidget);
    expect(find.text('You owe'), findsOneWidget);
    expect(find.text("You're owed"), findsOneWidget);
    expect(find.byKey(const Key('server-shell-bottom-nav')), findsOneWidget);
    expectSelectedBottomNav(tester, SettleoraNavDestination.home);
    expect(find.text('Create bill'), findsOneWidget);
    expect(find.text('Create group'), findsOneWidget);
    expect(tester.takeException(), isNull);

    tester.view.physicalSize = const Size(1120, 820);
    await pumpShell(
      tester,
      billRepository: FakeBillRepository(bills: [sampleBill()]),
      settlementRepository: FakeSettlementRepository(
        requests: [sampleSettlementRequest()],
      ),
      recurringRepository: FakeRecurringBillRepository(
        templates: [sampleTemplate()],
        forecast: [sampleOccurrence()],
      ),
    );

    expect(find.text('Welcome back, Taylor'), findsOneWidget);
    expect(find.text('Quick actions'), findsOneWidget);
    expect(find.text('Needs attention'), findsOneWidget);
    expect(find.text('Upcoming bills'), findsOneWidget);
    expect(find.text('Group activity'), findsOneWidget);
    expect(find.text('This month'), findsOneWidget);
    final surfaceWidth = tester
        .getSize(find.byKey(const Key('server-shell-dashboard-surface')))
        .width;
    expect(surfaceWidth, lessThanOrEqualTo(430));
    expect(find.textContaining('No global shared-bill count'), findsNothing);
    expect(find.textContaining('_DashboardBillRow'), findsNothing);
    expect(find.textContaining('dependencies:'), findsNothing);
    expectSingleCanonicalBottomNav(tester);
    expect(tester.takeException(), isNull);
  });

  testWidgets('dashboard replaces route cards with metric and content rows', (
    tester,
  ) async {
    await pumpShell(
      tester,
      billRepository: FakeBillRepository(bills: [sampleBill()]),
      notificationRepository: FakeNotificationRepository(
        summary: const SettleoraNotificationSummary(
          unreadCount: 2,
          attentionCount: 1,
          urgentCount: 1,
        ),
      ),
      settlementRepository: FakeSettlementRepository(
        balances: [
          sampleBalance(),
          sampleBalance(
            direction: SettleoraSettlementBalanceDirectionValues.incoming,
            amount: '18.00',
          ),
        ],
      ),
      recurringRepository: FakeRecurringBillRepository(
        forecast: [sampleOccurrence()],
      ),
    );

    expect(find.text('You owe'), findsOneWidget);
    expect(find.text("You're owed"), findsOneWidget);
    expect(find.text('No balances yet'), findsNothing);
    expect(find.text('USD 10.00'), findsOneWidget);
    expect(find.text('USD 18.00'), findsOneWidget);
    expect(find.text('Corner Market'), findsOneWidget);
    expect(find.text('Rent'), findsOneWidget);
    expect(find.text('Personal bills'), findsNothing);
    expect(find.text('Shared bills'), findsNothing);
    expect(find.text('All bills'), findsNothing);
    expect(find.text('Recurring forecast'), findsNothing);
    expect(find.textContaining('_DashboardBillRow'), findsNothing);
    expect(find.textContaining('dependencies:'), findsNothing);
    expect(find.text('Open notifications'), findsOneWidget);
    expect(find.text('Open groups'), findsOneWidget);
    expect(find.byKey(const Key('server-shell-bills')), findsWidgets);
    expect(find.byKey(const Key('server-shell-groups')), findsOneWidget);
    expect(find.byKey(const Key('server-shell-notifications')), findsOneWidget);
  });

  testWidgets(
    'dashboard recurring draft shortcut appears for draft-ready forecast',
    (tester) async {
      final recurringRepository = FakeRecurringBillRepository(
        templates: [sampleTemplate()],
        forecast: [sampleOccurrence()],
      );

      await pumpShell(tester, recurringRepository: recurringRepository);

      expect(
        find.byKey(const Key('server-shell-recurring-drafts-action')),
        findsOneWidget,
      );
      expect(find.text('Recurring drafts ready'), findsOneWidget);
      expect(find.text('1 forecast item ready for draft review'), findsWidgets);
      expect(find.text('Review drafts'), findsOneWidget);
    },
  );

  testWidgets(
    'dashboard settlement action shortcut appears for actionable requests',
    (tester) async {
      final settlementRepository = FakeSettlementRepository(
        requests: [sampleSettlementRequest()],
      );

      await pumpShell(tester, settlementRepository: settlementRepository);

      expect(
        find.byKey(const Key('server-shell-settlement-actions')),
        findsOneWidget,
      );
      expect(find.text('Review settlement actions'), findsOneWidget);
      expect(find.text('1 request may need review'), findsWidgets);
      expect(
        find.byKey(const Key('server-shell-settlement-actions-review')),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'dashboard settlement action shortcut hides without actionable requests',
    (tester) async {
      final settlementRepository = FakeSettlementRepository(
        requests: [
          sampleSettlementRequest(
            status: SettleoraSettlementRequestStatusValues.confirmed,
          ),
        ],
      );

      await pumpShell(tester, settlementRepository: settlementRepository);

      expect(
        find.byKey(const Key('server-shell-settlement-actions')),
        findsNothing,
      );
      expect(find.text('Review settlement actions'), findsNothing);
    },
  );

  testWidgets(
    'dashboard settlement action shortcut opens needs-action settlement list',
    (tester) async {
      final settlementRepository = FakeSettlementRepository(
        requests: [
          sampleSettlementRequest(amount: '10.00', currency: 'USD'),
          sampleSettlementRequest(
            id: _secondSettlementId,
            amount: '25.00',
            currency: 'EUR',
            status: SettleoraSettlementRequestStatusValues.confirmed,
          ),
        ],
      );

      await pumpShell(tester, settlementRepository: settlementRepository);

      await scrollToAndTap(
        tester,
        const Key('server-shell-settlement-actions-review'),
      );
      await tester.pumpAndSettle();

      expect(find.text('Settlements'), findsWidgets);
      expect(
        tester
            .widget<FilterChip>(
              find.byKey(const Key('settlement-list-filter-needs-action')),
            )
            .selected,
        isTrue,
      );
      expect(find.text('10.00 USD'), findsOneWidget);
      expect(find.text('25.00 EUR'), findsNothing);
      expect(settlementRepository.listRequestsCalls, 2);
    },
  );

  testWidgets('dashboard settlements tile opens unfiltered settlement list', (
    tester,
  ) async {
    final settlementRepository = FakeSettlementRepository(
      requests: [
        sampleSettlementRequest(amount: '10.00', currency: 'USD'),
        sampleSettlementRequest(
          id: _secondSettlementId,
          amount: '25.00',
          currency: 'EUR',
          status: SettleoraSettlementRequestStatusValues.confirmed,
        ),
      ],
    );

    await pumpShell(tester, settlementRepository: settlementRepository);

    await scrollToAndTap(tester, const Key('server-shell-settlements'));
    await tester.pumpAndSettle();

    expect(find.text('Settlements'), findsWidgets);
    expect(
      tester
          .widget<FilterChip>(
            find.byKey(const Key('settlement-list-filter-all')),
          )
          .selected,
      isTrue,
    );
    expect(find.text('10.00 USD'), findsOneWidget);
    expect(find.text('25.00 EUR'), findsOneWidget);
    expect(settlementRepository.listRequestsCalls, 2);
  });

  testWidgets(
    'dashboard recurring draft shortcut hides without draft-ready forecast',
    (tester) async {
      final recurringRepository = FakeRecurringBillRepository(
        templates: [sampleTemplate()],
        forecast: [
          sampleOccurrence(
            status: SettleoraRecurringBillOccurrenceStatusValues.draftGenerated,
            draftGenerated: true,
            generatedBillId: _generatedBillId,
          ),
        ],
      );

      await pumpShell(tester, recurringRepository: recurringRepository);

      expect(
        find.byKey(const Key('server-shell-recurring-drafts-action')),
        findsNothing,
      );
      expect(find.text('Recurring drafts ready'), findsNothing);
    },
  );

  testWidgets(
    'dashboard recurring draft shortcut opens needs-draft recurring forecast',
    (tester) async {
      final recurringRepository = FakeRecurringBillRepository(
        templates: [sampleTemplate()],
        forecast: [
          sampleOccurrence(merchantName: 'Rent'),
          sampleOccurrence(
            templateId: '55555555-5555-5555-5555-555555555555',
            merchantName: 'Gym',
            status: SettleoraRecurringBillOccurrenceStatusValues.draftGenerated,
            draftGenerated: true,
            generatedBillId: _generatedBillId,
            occurrenceDate: '2026-07-15',
          ),
        ],
      );

      await pumpShell(tester, recurringRepository: recurringRepository);

      await scrollToAndTap(
        tester,
        const Key('server-shell-recurring-drafts-review'),
      );
      await tester.pumpAndSettle();

      expect(find.text('Recurring bills'), findsWidgets);
      expect(
        tester
            .widget<FilterChip>(
              find.byKey(
                const Key('recurring-bill-forecast-filter-needs-draft'),
              ),
            )
            .selected,
        isTrue,
      );
      expect(find.text('Rent'), findsWidgets);
      expect(find.text('Gym'), findsNothing);
      expect(recurringRepository.listForecastCalls, 2);
    },
  );

  testWidgets(
    'dashboard recurring bills tile opens generic recurring forecast',
    (tester) async {
      final recurringRepository = FakeRecurringBillRepository(
        templates: [sampleTemplate()],
        forecast: [
          sampleOccurrence(merchantName: 'Rent'),
          sampleOccurrence(
            templateId: '55555555-5555-5555-5555-555555555555',
            merchantName: 'Gym',
            status: SettleoraRecurringBillOccurrenceStatusValues.draftGenerated,
            draftGenerated: true,
            generatedBillId: _generatedBillId,
            occurrenceDate: '2026-07-15',
          ),
        ],
      );

      await pumpShell(tester, recurringRepository: recurringRepository);

      await tester.dragUntilVisible(
        find.byKey(const Key('server-shell-recurring-bills')),
        find.byType(Scrollable).first,
        const Offset(0, -300),
      );
      await tester.ensureVisible(
        find.byKey(const Key('server-shell-recurring-bills')),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('server-shell-recurring-bills')));
      await tester.pumpAndSettle();

      expect(find.text('Recurring bills'), findsWidgets);
      expect(
        tester
            .widget<FilterChip>(
              find.byKey(const Key('recurring-bill-forecast-filter-all')),
            )
            .selected,
        isTrue,
      );
      expect(find.text('Rent'), findsWidgets);
      expect(find.text('Gym'), findsWidgets);
      expect(recurringRepository.listForecastCalls, 2);
    },
  );

  testWidgets('dashboard cards navigate to existing mobile surfaces', (
    tester,
  ) async {
    final billRepository = FakeBillRepository(bills: [sampleBill()]);
    final notificationRepository = FakeNotificationRepository(
      summary: const SettleoraNotificationSummary(
        unreadCount: 1,
        attentionCount: 0,
        urgentCount: 0,
      ),
      notifications: [sampleNotification()],
    );

    await pumpShell(
      tester,
      billRepository: billRepository,
      notificationRepository: notificationRepository,
    );

    await scrollToAndTap(tester, const Key('server-shell-bills'));
    await tester.pumpAndSettle();

    expect(find.text('Bills'), findsWidgets);
    expect(bottomNavDestination(const Key('bottom-nav-bills')), findsOneWidget);
    expectSingleCanonicalBottomNav(tester);
    expect(find.byKey(const Key('bill-list-create')), findsOneWidget);

    await tester.tap(bottomNavDestination(const Key('bottom-nav-home')));
    await tester.pumpAndSettle();

    await scrollToAndTap(tester, const Key('server-shell-notifications'));
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
    expect(find.text('You owe'), findsOneWidget);
    expect(find.text("You're owed"), findsOneWidget);
    expect(find.text('USD 0.00'), findsNWidgets(2));
    expect(find.text('No upcoming due bills'), findsOneWidget);
    expect(
      find.text('Create a bill to start tracking upcoming payments'),
      findsOneWidget,
    );
    expect(find.text('No recent group activity'), findsOneWidget);
    expect(
      find.text('Create a group or shared bill to see activity here'),
      findsOneWidget,
    );
    expect(find.text('Personal bills'), findsNothing);
    expect(find.text('Shared bills'), findsNothing);
  });

  testWidgets('dashboard quick action opens personal bill create screen', (
    tester,
  ) async {
    await pumpShell(tester);

    await scrollToAndTap(
      tester,
      const Key('server-shell-create-personal-bill'),
    );
    await tester.pumpAndSettle();

    expect(find.text('Personal bill'), findsOneWidget);
    expect(find.text('Group bill'), findsOneWidget);

    await tester.tap(find.byKey(const Key('create-bill-choice-personal')));
    await tester.pumpAndSettle();

    expect(find.text('Create bill'), findsWidgets);
    expect(find.byKey(const Key('personal-bill-date')), findsOneWidget);
    expect(find.byKey(const Key('personal-bill-item-name-0')), findsOneWidget);
  });

  testWidgets(
    'dashboard group bill choice picks group then opens create flow',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(900, 1600));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final groupRepository = FakeGroupRepository(
        groups: [sampleGroup()],
        members: [
          sampleGroupMember(displayName: 'Taylor'),
          sampleGroupMember(
            userProfileId: 'profile-other',
            displayName: 'Morgan',
          ),
        ],
      );
      final billRepository = FakeBillRepository();

      await pumpShell(
        tester,
        billRepository: billRepository,
        groupRepository: groupRepository,
      );

      await scrollToAndTap(
        tester,
        const Key('server-shell-create-personal-bill'),
      );
      await tester.pumpAndSettle();

      expect(find.text('Personal bill'), findsOneWidget);
      expect(find.text('Group bill'), findsOneWidget);

      await tester.tap(find.byKey(const Key('create-bill-choice-group')));
      await tester.pumpAndSettle();

      expect(find.text('Groups'), findsWidgets);
      expect(find.text('Trip Crew'), findsOneWidget);
      expect(find.byKey(const Key('group-list-create')), findsOneWidget);
      expect(groupRepository.listCalls, 1);

      await tester.tap(find.text('Trip Crew'));
      await tester.pumpAndSettle();

      expect(find.text('Create group bill start'), findsOneWidget);
      expect(find.text('Trip Crew'), findsWidgets);
      expect(find.text('Start'), findsWidgets);
      expect(find.text('Basics'), findsWidgets);
      expect(find.byKey(const Key('group-bill-list-create')), findsNothing);
      expect(find.byKey(const Key('server-shell-bottom-nav')), findsNothing);
      expect(find.byType(SettleoraBottomNav), findsNothing);
      expect(billRepository.listGroupCalls, 1);
    },
  );

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

      await scrollToAndTap(
        tester,
        const Key('server-shell-create-personal-bill'),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('create-bill-choice-personal')));
      await tester.pumpAndSettle();

      await fillMinimalPersonalBillCreateForm(tester);
      await tester.tap(find.byKey(const Key('personal-bill-save')));
      await tester.pumpAndSettle();

      expect(find.text('Good morning'), findsOneWidget);
      expect(find.byKey(const Key('personal-bill-date')), findsNothing);
      expect(billRepository.createCalls, 1);
      expect(billRepository.lastCreateDraft?.merchantName, 'Quick Cafe');
      expect(billRepository.listCalls, 2);
      expect(find.textContaining('Latest: Quick Cafe'), findsOneWidget);
      expect(find.text('Quick Cafe'), findsOneWidget);
    },
  );

  testWidgets('dashboard quick action back does not create or refresh', (
    tester,
  ) async {
    final billRepository = FakeBillRepository(bills: [sampleBill()]);

    await pumpShell(tester, billRepository: billRepository);

    expect(billRepository.listCalls, 1);

    await scrollToAndTap(
      tester,
      const Key('server-shell-create-personal-bill'),
    );
    await tester.pumpAndSettle();

    expect(find.text('Personal bill'), findsOneWidget);
    expect(find.text('Group bill'), findsOneWidget);

    await tester.binding.handlePopRoute();
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

      await scrollToAndTap(tester, const Key('server-shell-create-group'));
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

    await scrollToAndTap(tester, const Key('server-shell-create-group'));
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

    await scrollToAndTap(tester, const Key('dashboard-overview-retry'));
    await tester.pumpAndSettle();

    expect(find.text('Active bills'), findsOneWidget);
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

    await scrollToAndTap(tester, const Key('server-shell-bills'));
    await tester.pumpAndSettle();

    final callsAfterOpeningBills = billRepository.listCalls;
    expect(find.text('Bills'), findsWidgets);
    expect(bottomNavDestination(const Key('bottom-nav-bills')), findsOneWidget);

    await tester.tap(bottomNavDestination(const Key('bottom-nav-home')));
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
    expect(find.byKey(const Key('server-shell-sync-now')), findsOneWidget);
    expect(find.text('Sync now'), findsOneWidget);
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

  testWidgets(
    'dashboard sync now flushes pending work and updates visible status',
    (tester) async {
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
          ],
        ),
      );
      final syncRepository = FakeSyncRepository(
        submitResult: const SettleoraSyncOperationResult(
          operationId: 'operation-1',
          status: SettleoraSyncOperationResultStatusValues.accepted,
          resourceType: SettleoraSyncResourceTypeValues.expenseBill,
          resourceId: _billId,
          resultingVersion: 2,
          safeErrorCode: null,
          safeMessage: null,
        ),
      );

      await pumpShell(
        tester,
        billSyncController: sampleBillSyncController(
          store: store,
          repository: syncRepository,
        ),
      );

      await scrollToAndTap(tester, const Key('server-shell-sync-now'));
      await tester.pumpAndSettle();

      expect(syncRepository.submitCalls, 2);
      expect(
        find.byKey(const Key('server-shell-sync-status-card')),
        findsNothing,
      );
      expect(
        find.text('Sync complete: 2 synced, 0 failed, 0 conflicts.'),
        findsOneWidget,
      );
    },
  );

  testWidgets('dashboard sync now ignores duplicate taps while flushing', (
    tester,
  ) async {
    final flushGate = Completer<void>();
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
    final syncRepository = FakeSyncRepository(
      submitGate: flushGate,
      submitResult: const SettleoraSyncOperationResult(
        operationId: 'operation-1',
        status: SettleoraSyncOperationResultStatusValues.accepted,
        resourceType: SettleoraSyncResourceTypeValues.expenseBill,
        resourceId: _billId,
        resultingVersion: 2,
        safeErrorCode: null,
        safeMessage: null,
      ),
    );

    await pumpShell(
      tester,
      billSyncController: sampleBillSyncController(
        store: store,
        repository: syncRepository,
      ),
    );

    await scrollToAndTap(tester, const Key('server-shell-sync-now'));
    await tester.pump();

    expect(syncRepository.submitCalls, 1);
    expect(find.text('Syncing'), findsOneWidget);
    expect(
      find.byKey(const Key('server-shell-sync-now-progress')),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const Key('server-shell-sync-now')));
    await tester.pump();

    expect(syncRepository.submitCalls, 1);

    flushGate.complete();
    await tester.pumpAndSettle();

    expect(syncRepository.submitCalls, 1);
    expect(
      find.text('Sync complete: 1 synced, 0 failed, 0 conflicts.'),
      findsOneWidget,
    );
  });

  testWidgets(
    'dashboard conflict-only sync status reviews bills without retry action',
    (tester) async {
      final store = MemorySyncQueueStore(
        initialState: SettleoraSyncQueueState(
          items: [
            sampleSyncItem(
              id: 'sync-conflict-1',
              resourceId: _billId,
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
      expect(find.textContaining('1 conflict'), findsOneWidget);
      expect(find.byKey(const Key('server-shell-sync-now')), findsNothing);
      expect(
        find.byKey(const Key('server-shell-sync-status-open-bills')),
        findsOneWidget,
      );

      await scrollToAndTap(
        tester,
        const Key('server-shell-sync-status-open-bills'),
      );
      await tester.pumpAndSettle();

      expect(find.text('Bills'), findsWidgets);
      expect(
        bottomNavDestination(const Key('bottom-nav-bills')),
        findsOneWidget,
      );
      expect(find.byKey(const Key('bill-list-create')), findsOneWidget);
    },
  );

  testWidgets('dashboard sync now ends session for session-required result', (
    tester,
  ) async {
    String? sessionEndedMessage;
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
    final syncRepository = FakeSyncRepository(
      submitFailure: const SettleoraSyncFailure(
        kind: SettleoraSyncFailureKind.sessionExpired,
        message: 'Sign in again to sync pending changes.',
      ),
    );

    await pumpShell(
      tester,
      billSyncController: sampleBillSyncController(
        store: store,
        repository: syncRepository,
      ),
      onSessionEnded: (message) async {
        sessionEndedMessage = message;
      },
    );

    await scrollToAndTap(tester, const Key('server-shell-sync-now'));
    await tester.pumpAndSettle();

    expect(syncRepository.submitCalls, 1);
    expect(sessionEndedMessage, 'Sign in again to sync pending changes.');
    expect(find.text('Sync is unavailable right now.'), findsNothing);
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

    await tester.ensureVisible(
      find.byKey(const Key('server-shell-sync-status-open-bills')),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const Key('server-shell-sync-status-open-bills')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Bills'), findsWidgets);
    expect(bottomNavDestination(const Key('bottom-nav-bills')), findsOneWidget);
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

    await scrollToAndTap(tester, const Key('server-shell-bills'));
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

    await tester.tap(bottomNavDestination(const Key('bottom-nav-home')));
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

    expect(find.text('Active bills'), findsOneWidget);
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

    final notificationsButton = find.byKey(
      const Key('server-shell-notifications-header'),
    );
    await tester.tap(notificationsButton);
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

Future<void> scrollToAndTap(WidgetTester tester, Key key) async {
  final finder = find.byKey(key);
  await tester.dragUntilVisible(
    finder,
    find.byType(Scrollable).first,
    const Offset(0, -300),
  );
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
}

Finder bottomNavDestination(Key key) => find.byKey(key);

void expectCanonicalBottomNav(
  WidgetTester tester, {
  required int selectedIndex,
}) {
  expectSelectedBottomNav(
    tester,
    const [
      SettleoraNavDestination.home,
      SettleoraNavDestination.bills,
      SettleoraNavDestination.groups,
      SettleoraNavDestination.settle,
      SettleoraNavDestination.receipts,
      SettleoraNavDestination.profile,
    ][selectedIndex],
  );
  for (final label in const [
    'Home',
    'Bills',
    'Groups',
    'Settle',
    'Receipts',
    'Profile',
  ]) {
    expect(
      find.descendant(
        of: find.byType(SettleoraBottomNav),
        matching: find.text(label),
      ),
      findsOneWidget,
    );
  }
  expect(bottomNavDestination(const Key('bottom-nav-home')), findsOneWidget);
  expect(bottomNavDestination(const Key('bottom-nav-bills')), findsOneWidget);
  expect(bottomNavDestination(const Key('bottom-nav-groups')), findsOneWidget);
  expect(bottomNavDestination(const Key('bottom-nav-settle')), findsOneWidget);
  expect(
    bottomNavDestination(const Key('bottom-nav-receipts')),
    findsOneWidget,
  );
  expect(bottomNavDestination(const Key('bottom-nav-profile')), findsOneWidget);
}

void expectSingleCanonicalBottomNav(WidgetTester tester) {
  expect(find.byKey(const Key('server-shell-bottom-nav')), findsOneWidget);
  expect(find.byType(SettleoraBottomNav), findsOneWidget);
  expect(find.byType(SettleoraBottomNav), findsOneWidget);
  expect(
    find.descendant(
      of: find.byType(SettleoraBottomNav),
      matching: find.text('Settings'),
    ),
    findsNothing,
  );
}

void expectSelectedBottomNav(
  WidgetTester tester,
  SettleoraNavDestination selected,
) {
  final nav = tester.widget<SettleoraBottomNav>(
    find.byType(SettleoraBottomNav),
  );
  expect(nav.selected, selected);
}

Future<void> pumpShell(
  WidgetTester tester, {
  FakeBillRepository? billRepository,
  FakeGroupRepository? groupRepository,
  FakeNotificationRepository? notificationRepository,
  FakeSettlementRepository? settlementRepository,
  FakeRecurringBillRepository? recurringRepository,
  SettleoraBillSyncController? billSyncController,
  SettleoraSessionEndedCallback? onSessionEnded,
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
        onSessionEnded: onSessionEnded ?? (_) async {},
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
  await tester.tap(find.byKey(const Key('personal-bill-date-today')));
  await tester.pumpAndSettle();
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

SettleoraSettlementBalance sampleBalance({
  String direction = SettleoraSettlementBalanceDirectionValues.outgoing,
  String amount = '10.00',
  String currency = 'USD',
}) {
  return SettleoraSettlementBalance(
    counterpartyUserProfileId: 'counterparty-1',
    groupId: null,
    direction: direction,
    currency: currency,
    selectedLineAmount: amount,
    pendingClaimedAmount: '0.00',
    confirmedClearedAmount: '0.00',
    remainingUnclaimedAmount: amount,
    confirmedRemainingResidualAmount: '0.00',
    waivedResidualAmount: '0.00',
    creditResidualAmount: '0.00',
    requestCount: 1,
    lineCount: 1,
    pendingPaymentCount: 0,
    confirmedPaymentCount: 0,
  );
}

SettleoraSettlementRequest sampleSettlementRequest({
  String id = _settlementId,
  String debtorUserProfileId = _profileId,
  String creditorUserProfileId = 'counterparty-1',
  String amount = '10.00',
  String currency = 'USD',
  String status = SettleoraSettlementRequestStatusValues.requested,
  String requestedByUserProfileId = 'counterparty-1',
}) {
  return SettleoraSettlementRequest(
    id: id,
    sourceExpenseBillId: _billId,
    groupId: null,
    debtorUserProfileId: debtorUserProfileId,
    creditorUserProfileId: creditorUserProfileId,
    amount: amount,
    currency: currency,
    status: status,
    requestedByUserProfileId: requestedByUserProfileId,
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

SettleoraRecurringBillForecastOccurrence sampleOccurrence({
  String templateId = _templateId,
  String? occurrenceId,
  String occurrenceDate = '2026-07-01',
  String? dueDate = '2026-07-04',
  String status = SettleoraRecurringBillOccurrenceStatusValues.forecasted,
  bool draftGenerated = false,
  String? generatedBillId,
  String forecastAmount = '1200.00',
  String forecastCurrency = 'USD',
  String? merchantName = 'Rent',
  bool isGroupScoped = false,
}) {
  return SettleoraRecurringBillForecastOccurrence(
    templateId: templateId,
    occurrenceId: occurrenceId,
    occurrenceDate: occurrenceDate,
    dueDate: dueDate,
    status: status,
    draftGenerated: draftGenerated,
    generatedBillId: generatedBillId,
    forecastAmount: forecastAmount,
    forecastCurrency: forecastCurrency,
    merchantName: merchantName,
    isGroupScoped: isGroupScoped,
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

SettleoraGroupMember sampleGroupMember({
  String userProfileId = _profileId,
  String displayName = 'Taylor',
}) {
  return SettleoraGroupMember(
    userProfileId: userProfileId,
    displayName: displayName,
    role: SettleoraGroupRoleValues.owner,
    status: SettleoraGroupMembershipStatusValues.active,
    joinedAtUtc: DateTime.utc(2026, 6, 7, 12),
    updatedAtUtc: DateTime.utc(2026, 6, 7, 12),
  );
}

SettleoraBillSyncController sampleBillSyncController({
  SettleoraSyncQueueStore? store,
  SettleoraSyncRepository? repository,
}) {
  final queueStore = store ?? MemorySyncQueueStore();
  return SettleoraBillSyncController(
    queueStore: queueStore,
    queueProcessor: SettleoraSyncQueueProcessor(
      queueStore: queueStore,
      repository: repository ?? FakeSyncRepository(),
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
    this.groupBills = const [],
    this.failures = const [],
    SettleoraBillDetail? detail,
    SettleoraBillDetail? createdDetail,
  }) : detail = detail ?? sampleBillDetail(),
       createdDetail = createdDetail ?? sampleBillDetail();

  List<SettleoraBillSummary> bills;
  List<SettleoraBillSummary> groupBills;
  final List<SettleoraBillFailure> failures;
  final SettleoraBillDetail detail;
  final SettleoraBillDetail createdDetail;
  Completer<void>? nextListPersonalBillsGate;
  int listCalls = 0;
  int listGroupCalls = 0;
  int getPersonalCalls = 0;
  int getGroupCalls = 0;
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
  Future<SettleoraBillDetail> getPersonalBill(String billId) async {
    getPersonalCalls += 1;
    return detail;
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
  }) async {
    listGroupCalls += 1;
    return groupBills;
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
  Future<SettleoraBillDetail> getGroupBill(
    String groupId,
    String billId,
  ) async {
    getGroupCalls += 1;
    return detail;
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
  int listRequestsCalls = 0;

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
    listRequestsCalls += 1;
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
  Future<SettleoraRecurringBillTemplateDetail> createTemplate(
    SettleoraRecurringBillCreateDraft draft,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraRecurringBillTemplateDetail> updateTemplate({
    required String templateId,
    required SettleoraRecurringBillUpdateDraft draft,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraRecurringBillTemplateDetail> pauseTemplate(
    String templateId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraRecurringBillTemplateDetail> resumeTemplate(
    String templateId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraRecurringBillTemplateDetail> archiveTemplate(
    String templateId,
  ) {
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
  FakeGroupRepository({
    List<SettleoraGroup>? groups,
    List<SettleoraGroupMember>? members,
  }) : groups = groups ?? const [],
       members = members ?? const [];

  List<SettleoraGroup> groups;
  List<SettleoraGroupMember> members;
  int listCalls = 0;
  int createCalls = 0;
  int getCalls = 0;
  int listMemberCalls = 0;
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
  Future<SettleoraGroup> getGroup(String groupId) async {
    getCalls += 1;
    return groups.firstWhere(
      (group) => group.id == groupId,
      orElse: () => sampleGroup(id: groupId),
    );
  }

  @override
  Future<SettleoraGroup> updateGroup(
    String groupId,
    SettleoraGroupSaveRequest request,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<List<SettleoraGroupMember>> listGroupMembers(String groupId) async {
    listMemberCalls += 1;
    return members;
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
  FakeSyncRepository({this.submitResult, this.submitFailure, this.submitGate});

  final SettleoraSyncOperationResult? submitResult;
  final SettleoraSyncFailure? submitFailure;
  final Completer<void>? submitGate;
  int submitCalls = 0;

  @override
  Future<SettleoraSyncOperationResult> submitOperation(
    SettleoraSyncQueueItem item,
  ) async {
    submitCalls += 1;
    await submitGate?.future;
    final failure = submitFailure;
    if (failure != null) {
      throw failure;
    }
    final result = submitResult;
    if (result != null) {
      return SettleoraSyncOperationResult(
        operationId: result.operationId,
        status: result.status,
        resourceType: result.resourceType,
        resourceId: item.resourceId,
        resultingVersion: result.resultingVersion,
        safeErrorCode: result.safeErrorCode,
        safeMessage: result.safeMessage,
      );
    }

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
const _secondSettlementId = 'settlement-2';
const _templateId = 'template-1';
const _generatedBillId = 'generated-bill-1';
