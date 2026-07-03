import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/settleora_api_client.dart';
import 'package:mobile/app/auth_session_repository.dart';
import 'package:mobile/app/secure_storage.dart';
import 'package:mobile/app/server_mode_shell.dart';
import 'package:mobile/bills/bill_attachment_file_input.dart';
import 'package:mobile/bills/bill_attachment_repository.dart';
import 'package:mobile/bills/bill_revision_repository.dart';
import 'package:mobile/bills/bill_repository.dart';
import 'package:mobile/bills/bill_sync_controller.dart';
import 'package:mobile/groups/group_repository.dart';
import 'package:mobile/notifications/notification_preferences.dart';
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
  test('notification preferences use safe defaults and local suppression', () {
    final settings = SettleoraNotificationPreferenceSettings.defaults();
    final bill = sampleNotification(safeSummary: 'Bill row.');
    final settlement = sampleNotification(
      eventType: 'settlement.request_created',
      subjectType: SettleoraNotificationSubjectTypeValues.settlementRequest,
      settlementRequestId: _settlementId,
      safeSummary: 'Settlement row.',
    );
    final security = sampleNotification(
      eventType: 'security.session_revoked',
      priority: SettleoraNotificationPriorityValues.urgent,
      safeSummary: 'Security row.',
    );

    expect(settings.shouldShowNotification(bill), isTrue);
    expect(settings.shouldShowNotification(settlement), isTrue);
    expect(settings.shouldShowNotification(security), isTrue);

    final billsDisabled = settings.setCategoryEnabled(
      SettleoraNotificationPreferenceCategory.bills,
      false,
    );
    expect(billsDisabled.shouldShowNotification(bill), isFalse);
    expect(billsDisabled.shouldShowNotification(settlement), isTrue);
    expect(billsDisabled.shouldShowNotification(security), isTrue);
    expect(billsDisabled.suppressedCount([bill, settlement, security]), 1);

    final quiet = settings.copyWith(
      quietHours: const SettleoraNotificationQuietHours(
        enabled: true,
        startHour: 22,
        endHour: 7,
      ),
    );
    final localQuietTime = DateTime(2026, 6, 16, 23);
    expect(
      quiet.shouldShowNotification(bill, localNow: localQuietTime),
      isFalse,
    );
    expect(
      quiet.shouldShowNotification(security, localNow: localQuietTime),
      isTrue,
    );
  });

  test('notification open fallback copy stays product-facing and safe', () {
    final expectedCopy = {
      SettleoraNotificationOpenFallbackState.signInRequired:
          'Sign in to view this notification.',
      SettleoraNotificationOpenFallbackState.wrongAccount:
          'This item is not available to this account.',
      SettleoraNotificationOpenFallbackState.localOnly:
          'Connect to the server to refresh this notification.',
      SettleoraNotificationOpenFallbackState.offline:
          'Connect to the server to refresh this notification. Cached notification details are not enough to open it.',
      SettleoraNotificationOpenFallbackState.stale:
          'This notification is no longer available.',
      SettleoraNotificationOpenFallbackState.unauthorized:
          'This item is not available to this account.',
      SettleoraNotificationOpenFallbackState.resolved:
          'This item no longer needs action.',
      SettleoraNotificationOpenFallbackState.providerUnconfigured:
          'Push notifications are off for this server. In-app notifications still work.',
      SettleoraNotificationOpenFallbackState.unsupported:
          'This item cannot be opened here yet. Refresh or check the related section.',
    };

    for (final entry in expectedCopy.entries) {
      final copy = settleoraNotificationOpenFallbackMessage(entry.key);
      expect(copy, entry.value);
      expect(copy, isNot(contains('/api/')));
      expect(copy, isNot(contains(_notificationId)));
      expect(copy, isNot(contains('token=')));
      expect(copy, isNot(contains('ocr.needs_review')));
      expect(copy, isNot(contains('settlement.residual_review_needed')));
    }
  });

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
    expect(find.text('Needs attention: 1'), findsOneWidget);
    expect(
      find.text('We refresh access before opening details.'),
      findsOneWidget,
    );
    expect(find.textContaining('Showing 1 of 1 in All'), findsOneWidget);
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

  testWidgets(
    'notification screen respects local preferences without archive',
    (tester) async {
      final repository = FakeNotificationRepository(
        notifications: [
          sampleNotification(id: 'bill-row', safeSummary: 'Bill row.'),
          sampleNotification(
            id: 'settlement-row',
            eventType: 'settlement.request_created',
            subjectType:
                SettleoraNotificationSubjectTypeValues.settlementRequest,
            settlementRequestId: _settlementId,
            safeSummary: 'Settlement row.',
          ),
          sampleNotification(
            id: 'archived-row',
            status: SettleoraNotificationStatusValues.archived,
            safeSummary: 'Archived row.',
            archivedAtUtc: _updatedAtUtc,
          ),
        ],
      );
      final preferences = SettleoraNotificationPreferenceSettings.defaults()
          .setCategoryEnabled(
            SettleoraNotificationPreferenceCategory.bills,
            false,
          );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraNotificationScreen(
            repository: repository,
            preferences: preferences,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Settlement row.'), findsOneWidget);
      expect(find.text('Bill row.'), findsNothing);
      expect(find.text('Archived row.'), findsNothing);
      expect(find.textContaining('1 lower-priority item'), findsOneWidget);
      expect(repository.archiveCalls, 0);

      await tapNotificationFilter(tester, 'archived');

      expect(find.text('Archived row.'), findsOneWidget);
      expect(find.text('Bill row.'), findsNothing);
    },
  );

  testWidgets('notification filters show counts and filtered empty state', (
    tester,
  ) async {
    final repository = FakeNotificationRepository(
      notifications: [
        sampleNotification(
          safeSummary: 'Group bill ready.',
          groupId: _groupId,
          expenseBillId: _billId,
        ),
        sampleNotification(
          eventType: 'settlement.request_created',
          status: SettleoraNotificationStatusValues.read,
          priority: SettleoraNotificationPriorityValues.urgent,
          subjectType: SettleoraNotificationSubjectTypeValues.settlementRequest,
          safeSummary: 'Settlement ready.',
          settlementRequestId: _settlementId,
        ),
        sampleNotification(
          eventType: 'recurring_bill.draft_generated',
          priority: SettleoraNotificationPriorityValues.normal,
          subjectType:
              SettleoraNotificationSubjectTypeValues.recurringBillOccurrence,
          safeSummary: 'Rent draft generated.',
          recurringBillTemplateId: _recurringTemplateId,
          recurringBillOccurrenceId: _recurringOccurrenceId,
        ),
        sampleNotification(
          eventType: 'recurring_bill.draft_generated',
          priority: SettleoraNotificationPriorityValues.normal,
          subjectType:
              SettleoraNotificationSubjectTypeValues.recurringBillOccurrence,
          safeSummary: 'Recurring metadata missing.',
          recurringBillTemplateId: ' ',
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraNotificationScreen(
          repository: repository,
          currentUserProfileId: _profileId,
          billRepository: FakeBillRepository(),
          groupRepository: FakeGroupRepository(),
          settlementRepository: FakeSettlementRepository(),
          recurringBillRepository: FakeRecurringBillRepository(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('All (4)'), findsOneWidget);
    expect(find.text('Unread (3)'), findsOneWidget);
    expect(find.text('Read (1)'), findsOneWidget);
    expect(find.text('Needs attention (1)'), findsOneWidget);
    expect(find.text('Urgent (1)'), findsOneWidget);
    expect(find.text('Bills (1)'), findsOneWidget);
    expect(find.text('Settlements (1)'), findsOneWidget);
    expect(find.text('Recurring (2)'), findsOneWidget);
    expect(find.text('Review (2)'), findsOneWidget);
    expect(find.text('Archived (0)'), findsOneWidget);

    await tapNotificationFilter(tester, 'urgent');

    expect(find.text('Settlement ready.'), findsOneWidget);
    expect(find.text('Group bill ready.'), findsNothing);

    await tapNotificationFilter(tester, 'actionable');

    expect(find.text('Group bill ready.'), findsOneWidget);
    expect(find.text('Settlement ready.'), findsNothing);

    await tapNotificationFilter(tester, 'urgent');
    await tapNotificationFilter(tester, 'recurring');

    expect(find.text('Rent draft generated.'), findsOneWidget);
    expect(find.text('Recurring metadata missing.'), findsOneWidget);

    await tapNotificationFilter(tester, 'bills');

    expect(find.text('Group bill ready.'), findsOneWidget);
  });

  testWidgets('archived filter shows only archived rows', (tester) async {
    final repository = FakeNotificationRepository(
      notifications: [
        sampleNotification(id: 'active-one', safeSummary: 'Active row.'),
        sampleNotification(
          id: 'archived-one',
          status: SettleoraNotificationStatusValues.archived,
          safeSummary: 'Archived row.',
          archivedAtUtc: _updatedAtUtc,
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    expect(find.text('All (1)'), findsOneWidget);
    expect(find.text('Archived (1)'), findsOneWidget);
    expect(find.text('Active row.'), findsOneWidget);
    expect(find.text('Archived row.'), findsNothing);

    await tapNotificationFilter(tester, 'archived');

    expect(find.text('Archived row.'), findsOneWidget);
    expect(find.text('Active row.'), findsNothing);
    expect(
      find.byKey(const ValueKey('notification-restore-0')),
      findsOneWidget,
    );
    expect(find.byKey(const ValueKey('notification-archive-0')), findsNothing);
  });

  testWidgets('active filters exclude archived notifications', (tester) async {
    final repository = FakeNotificationRepository(
      notifications: [
        sampleNotification(
          id: 'archived-bill',
          status: SettleoraNotificationStatusValues.archived,
          priority: SettleoraNotificationPriorityValues.urgent,
          safeSummary: 'Archived bill.',
          expenseBillId: _billId,
          archivedAtUtc: _updatedAtUtc,
        ),
        sampleNotification(
          id: 'active-settlement',
          subjectType: SettleoraNotificationSubjectTypeValues.settlementRequest,
          eventType: 'settlement.request_created',
          safeSummary: 'Active settlement.',
          settlementRequestId: _settlementId,
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraNotificationScreen(
          repository: repository,
          billRepository: FakeBillRepository(),
          settlementRepository: FakeSettlementRepository(),
          currentUserProfileId: _profileId,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('All (1)'), findsOneWidget);
    expect(find.text('Unread (1)'), findsOneWidget);
    expect(find.text('Needs attention (1)'), findsOneWidget);
    expect(find.text('Urgent (0)'), findsOneWidget);
    expect(find.text('Bills (0)'), findsOneWidget);
    expect(find.text('Settlements (1)'), findsOneWidget);
    expect(find.text('Review (1)'), findsOneWidget);
    expect(find.text('Archived (1)'), findsOneWidget);

    await tapNotificationFilter(tester, 'bills');
    expect(find.text('Archived bill.'), findsNothing);

    await tapNotificationFilter(tester, 'archived');
    expect(find.text('Archived bill.'), findsOneWidget);
    expect(find.text('Active settlement.'), findsNothing);
  });

  testWidgets('read filter stays selected after read action refresh', (
    tester,
  ) async {
    final repository = FakeNotificationRepository(
      notifications: [sampleNotification(safeSummary: 'Needs review.')],
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    await tapNotificationFilter(tester, 'read');

    expect(find.text('No read notifications'), findsOneWidget);
    expect(find.text('Needs review.'), findsNothing);

    await tapNotificationFilter(tester, 'unread');
    await tester.tap(find.byKey(const ValueKey('notification-mark-read-0')));
    await tester.pumpAndSettle();

    expect(find.text('No unread notifications'), findsOneWidget);
    expect(find.text('Unread (0)'), findsOneWidget);
    expect(find.text('Read (1)'), findsOneWidget);

    await tapNotificationFilter(tester, 'read');

    expect(find.text('Needs review.'), findsOneWidget);
  });

  testWidgets('selected notification filter has distinct empty state', (
    tester,
  ) async {
    final repository = FakeNotificationRepository(
      notifications: [
        sampleNotification(
          safeSummary: 'Only a bill.',
          groupId: _groupId,
          expenseBillId: _billId,
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    await tapNotificationFilter(tester, 'recurring');

    expect(find.text('No matching notifications'), findsOneWidget);
    expect(find.text('No notifications'), findsNothing);
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
    expect(find.text('All notifications marked read.'), findsOneWidget);
    expect(find.text('Unread: 0'), findsOneWidget);
    expect(find.text('Read'), findsWidgets);

    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('notification-archive-0')));
    await tester.pumpAndSettle();

    expect(repository.archiveCalls, 1);
    expect(find.text('Notification archived.'), findsOneWidget);
    expect(find.text('No matching notifications'), findsOneWidget);
    expect(find.text('All (0)'), findsOneWidget);
    expect(find.text('Archived (1)'), findsOneWidget);
  });

  testWidgets('archive moves row into archived filter and restore returns it', (
    tester,
  ) async {
    final repository = FakeNotificationRepository(
      notifications: [sampleNotification(safeSummary: 'Review me.')],
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('notification-archive-0')));
    await tester.pumpAndSettle();

    expect(repository.archiveCalls, 1);
    expect(find.text('All (0)'), findsOneWidget);
    expect(find.text('Unread (0)'), findsOneWidget);
    expect(find.text('Archived (1)'), findsOneWidget);
    expect(find.text('No matching notifications'), findsOneWidget);

    await tapNotificationFilter(tester, 'archived');
    expect(find.text('Review me.'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('notification-restore-0')));
    await tester.pumpAndSettle();

    expect(repository.restoreCalls, 1);
    expect(find.text('Archived (0)'), findsOneWidget);
    expect(find.text('No archived notifications'), findsOneWidget);

    await tapNotificationFilter(tester, 'all');
    expect(find.text('Review me.'), findsOneWidget);
    expect(find.text('Unread (1)'), findsOneWidget);
  });

  testWidgets(
    'successful archive preserves local state when follow-up refresh fails',
    (tester) async {
      final repository = FakeNotificationRepository(
        notifications: [sampleNotification(safeSummary: 'Refresh risk.')],
        listFailureOnCall: 2,
      );

      await tester.pumpWidget(
        MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('notification-archive-0')));
      await tester.pumpAndSettle();

      expect(repository.archiveCalls, 1);
      expect(repository.listCalls, 2);
      expect(
        find.text(
          'Notification was archived, but the inbox could not refresh. Use Refresh before repeating actions.',
        ),
        findsOneWidget,
      );
      expect(find.text('No matching notifications'), findsOneWidget);
      expect(find.text('Archived (1)'), findsOneWidget);
      expect(find.text('Server unavailable'), findsNothing);

      await tester.tap(find.byKey(const Key('notification-mark-visible-read')));
      await tester.pumpAndSettle();

      expect(repository.archiveCalls, 1);
      expect(repository.markReadCalls, 0);
    },
  );

  testWidgets(
    'selected filter is preserved after archive and refresh updates',
    (tester) async {
      final repository = FakeNotificationRepository(
        notifications: [
          sampleNotification(
            id: 'notification-bill-1',
            safeSummary: 'First bill.',
            expenseBillId: 'bill-1',
          ),
          sampleNotification(
            id: 'notification-settlement-1',
            subjectType:
                SettleoraNotificationSubjectTypeValues.settlementRequest,
            eventType: 'settlement.request_created',
            priority: SettleoraNotificationPriorityValues.urgent,
            safeSummary: 'Settlement ready.',
            settlementRequestId: _settlementId,
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
      );
      await tester.pumpAndSettle();

      await tapNotificationFilter(tester, 'bills');
      expectSelectedFilter(tester, 'bills');
      expect(find.text('First bill.'), findsOneWidget);
      expect(find.text('Settlement ready.'), findsNothing);

      await tester.tap(find.byKey(const ValueKey('notification-archive-0')));
      await tester.pumpAndSettle();

      expect(repository.archiveCalls, 1);
      expectSelectedFilter(tester, 'bills');
      expect(find.text('Bills (0)'), findsOneWidget);
      expect(find.text('No matching notifications'), findsOneWidget);
      expect(find.text('Archived (1)'), findsOneWidget);
      expect(find.text('Settlement ready.'), findsNothing);

      repository.notifications = [
        sampleNotification(
          id: 'notification-bill-2',
          safeSummary: 'Replacement bill.',
          expenseBillId: 'bill-2',
        ),
      ];
      await tester.tap(find.byKey(const Key('notification-refresh')));
      await tester.pumpAndSettle();

      expect(repository.listCalls, 3);
      expectSelectedFilter(tester, 'bills');
      expect(find.text('Replacement bill.'), findsOneWidget);
      expect(find.text('Bills (1)'), findsOneWidget);
    },
  );

  testWidgets(
    'selected filter is preserved after mark all read empties actionable',
    (tester) async {
      final repository = FakeNotificationRepository(
        notifications: [
          sampleNotification(
            id: 'actionable-notification-1',
            safeSummary: 'Openable bill.',
            expenseBillId: _billId,
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraNotificationScreen(
            repository: repository,
            billRepository: FakeBillRepository(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tapNotificationFilter(tester, 'actionable');
      expectSelectedFilter(tester, 'actionable');
      expect(find.text('Openable bill.'), findsOneWidget);

      await tapVisibleNotificationControl(
        tester,
        const Key('notification-mark-all-read'),
      );
      await tester.pumpAndSettle();

      expect(repository.markAllReadCalls, 1);
      expectSelectedFilter(tester, 'actionable');
      expect(find.text('Review (0)'), findsOneWidget);
      expect(find.text('Unread: 0'), findsOneWidget);
      expect(find.text('No matching notifications'), findsOneWidget);

      await tapNotificationFilter(tester, 'read');

      expect(find.text('Openable bill.'), findsOneWidget);
      expect(find.text('Read (1)'), findsOneWidget);
    },
  );

  testWidgets(
    'bulk mark visible read only affects unread rows in selected filter',
    (tester) async {
      await useLargeSurface(tester);
      final repository = FakeNotificationRepository(
        notifications: [
          sampleNotification(
            id: 'notification-bill-visible',
            safeSummary: 'Visible bill.',
            expenseBillId: 'bill-visible',
          ),
          sampleNotification(
            id: 'notification-settlement-hidden',
            subjectType:
                SettleoraNotificationSubjectTypeValues.settlementRequest,
            eventType: 'settlement.request_created',
            priority: SettleoraNotificationPriorityValues.urgent,
            safeSummary: 'Hidden settlement.',
            settlementRequestId: _settlementId,
          ),
          sampleNotification(
            id: 'notification-bill-read',
            status: SettleoraNotificationStatusValues.read,
            readAtUtc: _updatedAtUtc,
            safeSummary: 'Already read bill.',
            expenseBillId: 'bill-read',
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
      );
      await tester.pumpAndSettle();

      await tapNotificationFilter(tester, 'bills');
      expectSelectedFilter(tester, 'bills');
      expect(find.text('Visible bill.'), findsOneWidget);
      expect(find.text('Already read bill.'), findsOneWidget);
      expect(find.text('Hidden settlement.'), findsNothing);
      expect(
        find.textContaining('1 unread notification in Bills'),
        findsOneWidget,
      );

      await tester.tap(find.byKey(const Key('notification-mark-visible-read')));
      await tester.pumpAndSettle();

      expect(repository.markReadCalls, 1);
      expect(repository.markReadIds, ['notification-bill-visible']);
      expectSelectedFilter(tester, 'bills');
      expect(find.text('Visible notifications marked read.'), findsOneWidget);
      expect(find.text('Unread (1)'), findsOneWidget);
      expect(find.text('Read (2)'), findsOneWidget);
      expect(find.text('Bills (2)'), findsOneWidget);
      expect(
        find.textContaining('0 unread notifications in Bills'),
        findsOneWidget,
      );

      await tapNotificationFilter(tester, 'unread');

      expect(find.text('Hidden settlement.'), findsOneWidget);
      expect(find.text('Visible bill.'), findsNothing);
    },
  );

  testWidgets('bulk read and mark all read do not include archived rows', (
    tester,
  ) async {
    final repository = FakeNotificationRepository(
      notifications: [
        sampleNotification(id: 'active-one', safeSummary: 'Active one.'),
        sampleNotification(
          id: 'archived-one',
          status: SettleoraNotificationStatusValues.archived,
          safeSummary: 'Archived one.',
          archivedAtUtc: _updatedAtUtc,
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('1 unread notification in All'), findsOneWidget);
    await tester.tap(find.byKey(const Key('notification-mark-visible-read')));
    await tester.pumpAndSettle();

    expect(repository.markReadIds, ['active-one']);
    expect(find.text('Unread (0)'), findsOneWidget);
    expect(find.text('Read (1)'), findsOneWidget);
    expect(find.text('Archived (1)'), findsOneWidget);

    await tapNotificationFilter(tester, 'archived');
    expect(find.text('Archived one.'), findsOneWidget);
    expect(
      find.textContaining('0 unread notifications in Archived'),
      findsOneWidget,
    );

    await tapNotificationFilter(tester, 'all');
    await tester.tap(find.byKey(const Key('notification-mark-all-read')));
    await tester.pumpAndSettle();

    expect(repository.markAllReadCalls, 0);
    expect(
      repository.notifications
          .singleWhere((notification) => notification.id == 'archived-one')
          .status,
      SettleoraNotificationStatusValues.archived,
    );
  });

  testWidgets(
    'bulk mark visible read preserves unread filter and shows empty state',
    (tester) async {
      final repository = FakeNotificationRepository(
        notifications: [
          sampleNotification(id: 'notification-one', safeSummary: 'First.'),
          sampleNotification(id: 'notification-two', safeSummary: 'Second.'),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
      );
      await tester.pumpAndSettle();

      await tapNotificationFilter(tester, 'unread');
      expectSelectedFilter(tester, 'unread');
      expect(find.text('Unread (2)'), findsOneWidget);
      expect(
        find.textContaining('2 unread notifications in Unread'),
        findsOneWidget,
      );

      await tester.tap(find.byKey(const Key('notification-mark-visible-read')));
      await tester.pumpAndSettle();

      expect(repository.markReadCalls, 2);
      expect(repository.markReadIds, ['notification-one', 'notification-two']);
      expectSelectedFilter(tester, 'unread');
      expect(find.text('Unread (0)'), findsOneWidget);
      expect(find.text('Read (2)'), findsOneWidget);
      expect(find.text('Unread: 0'), findsOneWidget);
      expect(find.text('No unread notifications'), findsOneWidget);
      expect(
        find.textContaining('0 unread notifications in Unread'),
        findsOneWidget,
      );
    },
  );

  testWidgets('duplicate bulk mark visible read taps are single flight', (
    tester,
  ) async {
    final repository = FakeNotificationRepository(
      notifications: [
        sampleNotification(id: 'notification-one'),
        sampleNotification(id: 'notification-two'),
      ],
      actionDelay: const Duration(milliseconds: 50),
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    final button = find.byKey(const Key('notification-mark-visible-read'));
    await tester.tap(button);
    await tester.pump();
    await tester.tap(button);
    await tester.pumpAndSettle();

    expect(repository.markReadCalls, 2);
    expect(repository.markReadIds, ['notification-one', 'notification-two']);
    expect(find.text('Unread (0)'), findsOneWidget);
    expect(find.text('Read (2)'), findsOneWidget);
  });

  testWidgets(
    'unsafe bulk failure details are not rendered in text tooltips semantics or snackbars',
    (tester) async {
      final semantics = tester.ensureSemantics();
      final repository = FakeNotificationRepository(
        markReadFailure: const SettleoraNotificationFailure(
          kind: SettleoraNotificationFailureKind.server,
          message:
              'internal /api/v1/notifications/$_notificationId?token=secret bearer abc',
        ),
      );

      await tester.pumpWidget(
        MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('notification-mark-visible-read')));
      await tester.pumpAndSettle();

      expect(repository.markReadCalls, 1);
      expect(
        find.text('Visible notifications could not be marked read.'),
        findsOneWidget,
      );
      expect(
        tester
            .getSemantics(
              find.text('Visible notifications could not be marked read.'),
            )
            .label,
        'Visible notifications could not be marked read.',
      );
      semantics.dispose();
      expect(renderedNotificationUiText(tester), isNot(contains('/api/v1')));
      expect(
        renderedNotificationUiText(tester),
        isNot(contains(_notificationId)),
      );
      expect(
        renderedNotificationUiText(tester),
        isNot(contains('token=secret')),
      );
      expect(renderedNotificationUiText(tester), isNot(contains('bearer abc')));
    },
  );

  testWidgets('unsafe archive and restore failure details are not rendered', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final repository = FakeNotificationRepository(
      archiveFailure: const SettleoraNotificationFailure(
        kind: SettleoraNotificationFailureKind.server,
        message:
            'internal /api/v1/notifications/$_notificationId?token=secret bearer abc',
      ),
      restoreFailure: const SettleoraNotificationFailure(
        kind: SettleoraNotificationFailureKind.server,
        message:
            'internal /api/v1/notifications/$_notificationId/restore?secret=true',
      ),
      notifications: [
        sampleNotification(safeSummary: 'Active notification.'),
        sampleNotification(
          id: 'archived-notification',
          status: SettleoraNotificationStatusValues.archived,
          safeSummary: 'Archived notification.',
          archivedAtUtc: _updatedAtUtc,
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('notification-archive-0')));
    await tester.pumpAndSettle();

    expect(repository.archiveCalls, 1);
    expect(find.text('Notification could not be archived.'), findsOneWidget);

    await tapNotificationFilter(tester, 'archived');
    await tester.tap(find.byKey(const ValueKey('notification-restore-0')));
    await tester.pumpAndSettle();

    expect(repository.restoreCalls, 1);
    expect(find.text('Notification could not be restored.'), findsOneWidget);
    expect(
      tester
          .getSemantics(find.text('Notification could not be restored.'))
          .label,
      'Notification could not be restored.',
    );
    semantics.dispose();
    expect(renderedNotificationUiText(tester), isNot(contains('/api/v1')));
    expect(
      renderedNotificationUiText(tester),
      isNot(contains(_notificationId)),
    );
    expect(renderedNotificationUiText(tester), isNot(contains('token=secret')));
    expect(renderedNotificationUiText(tester), isNot(contains('bearer abc')));
  });

  testWidgets('duplicate archive taps are single flight', (tester) async {
    final repository = FakeNotificationRepository(
      actionDelay: const Duration(milliseconds: 50),
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    final button = find.byKey(const ValueKey('notification-archive-0'));
    await tester.tap(button);
    await tester.pump();
    await tester.tap(button);
    await tester.pumpAndSettle();

    expect(repository.archiveCalls, 1);
    expect(find.text('No matching notifications'), findsOneWidget);
    expect(find.text('Archived (1)'), findsOneWidget);
  });

  testWidgets('duplicate restore taps are single flight', (tester) async {
    final repository = FakeNotificationRepository(
      notifications: [
        sampleNotification(
          status: SettleoraNotificationStatusValues.archived,
          archivedAtUtc: _updatedAtUtc,
        ),
      ],
      actionDelay: const Duration(milliseconds: 50),
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    await tapNotificationFilter(tester, 'archived');

    final button = find.byKey(const ValueKey('notification-restore-0'));
    await tester.tap(button);
    await tester.pump();
    await tester.tap(button);
    await tester.pumpAndSettle();

    expect(repository.restoreCalls, 1);
    expect(find.text('Archived (0)'), findsOneWidget);
    expect(find.text('Read (1)'), findsOneWidget);
  });

  testWidgets('duplicate mark-all-read taps are single flight', (tester) async {
    final repository = FakeNotificationRepository(
      actionDelay: const Duration(milliseconds: 50),
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    final button = find.byKey(const Key('notification-mark-all-read'));
    await tester.tap(button);
    await tester.pump();
    await tester.tap(button);
    await tester.pumpAndSettle();

    expect(repository.markAllReadCalls, 1);
    expect(find.text('Unread: 0'), findsOneWidget);
    expect(find.text('Unread (0)'), findsOneWidget);
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

    await tapVisibleNotificationControl(
      tester,
      const ValueKey('notification-open-revision-0'),
    );

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
    expect(
      find.text(
        'This item cannot be opened here yet. Refresh or check the related section.',
      ),
      findsOneWidget,
    );
    expect(visibleText(tester), isNot(contains('/api/v1/bills')));
    expect(visibleText(tester), isNot(contains(_billId)));
    expect(visibleText(tester), isNot(contains(_revisionId)));
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

  test('notification row detects typed personal bill targets', () {
    expect(
      sampleNotification(expenseBillId: ' $_billId ').hasPersonalBillTarget,
      isTrue,
    );
    expect(
      sampleNotification(expenseBillId: ' $_billId ').hasTypedOpenTarget,
      isTrue,
    );
    expect(sampleNotification(expenseBillId: ' ').hasPersonalBillTarget, false);
    expect(
      sampleNotification(
        groupId: _groupId,
        expenseBillId: _billId,
      ).hasPersonalBillTarget,
      false,
    );
    expect(
      sampleNotification(
        eventType: SettleoraNotificationEventTypeValues.billRevisionSubmitted,
        expenseBillId: _billId,
        expenseBillRevisionId: _revisionId,
      ).hasPersonalBillTarget,
      false,
    );
    expect(
      sampleNotification(
        actionUrl: '/api/v1/bills/$_billId',
        expenseBillId: null,
      ).hasPersonalBillTarget,
      false,
    );
  });

  testWidgets(
    'personal bill notifications show open bill action and navigate',
    (tester) async {
      await useLargeSurface(tester);
      final billRepository = FakeBillRepository(
        detail: sampleBillDetail(displayNameFallback: 'Personal bill'),
      );
      final attachmentRepository = FakeBillAttachmentRepository();
      final fileInput = FakeBillAttachmentFileInput();
      final ocrRepository = FakeReceiptOcrReviewRepository();
      final revisionRepository = FakeBillRevisionRepository();
      final repository = FakeNotificationRepository(
        notifications: [sampleNotification(expenseBillId: ' $_billId ')],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraNotificationScreen(
            repository: repository,
            billRepository: billRepository,
            billAttachmentRepository: attachmentRepository,
            billAttachmentFileInput: fileInput,
            receiptOcrReviewRepository: ocrRepository,
            billRevisionRepository: revisionRepository,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.byKey(const ValueKey('notification-open-personal-bill-0')),
        findsOneWidget,
      );
      expect(find.text('Open bill'), findsOneWidget);
      expect(
        find.byKey(const ValueKey('notification-open-group-bill-0')),
        findsNothing,
      );

      await tester.tap(
        find.byKey(const ValueKey('notification-open-personal-bill-0')),
      );
      await tester.pumpAndSettle();

      expect(billRepository.getPersonalCalls, 1);
      expect(billRepository.lastBillId, _billId);
      expect(attachmentRepository.listCalls, 2);
      expect(attachmentRepository.lastRoute?.billId, _billId);
      expect(attachmentRepository.lastRoute?.groupId, isNull);
      expect(find.text('Corner Market'), findsWidgets);
    },
  );

  testWidgets('personal bill open action hides without typed target or seam', (
    tester,
  ) async {
    final cases = [
      sampleNotification(expenseBillId: ' '),
      sampleNotification(groupId: _groupId, expenseBillId: _billId),
      sampleNotification(
        eventType: SettleoraNotificationEventTypeValues.billRevisionSubmitted,
        expenseBillId: _billId,
        expenseBillRevisionId: _revisionId,
      ),
      sampleNotification(
        actionUrl: '/api/v1/bills/$_billId?token=secret',
        expenseBillId: null,
      ),
    ];

    for (final notification in cases) {
      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraNotificationScreen(
            repository: FakeNotificationRepository(
              notifications: [notification],
            ),
            billRepository: FakeBillRepository(),
            groupRepository: FakeGroupRepository(),
            currentUserProfileId: _profileId,
            billRevisionRepository: FakeBillRevisionRepository(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.byKey(const ValueKey('notification-open-personal-bill-0')),
        findsNothing,
      );
    }

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraNotificationScreen(
          repository: FakeNotificationRepository(
            notifications: [sampleNotification(expenseBillId: _billId)],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('notification-open-personal-bill-0')),
      findsNothing,
    );
  });

  testWidgets('personal bill destination failure stays bounded', (
    tester,
  ) async {
    final billRepository = FakeBillRepository(
      personalFailure: const SettleoraBillFailure(
        kind: SettleoraBillFailureKind.denied,
        message:
            'generated client denied /api/v1/bills/$_billId?token=secret stack trace storage provider receipt OCR proof payment details /home/user/file unrelated-user',
        statusCode: 403,
      ),
    );
    final repository = FakeNotificationRepository(
      notifications: [
        sampleNotification(
          actionUrl: '/api/v1/bills/$_billId?token=secret',
          expenseBillId: _billId,
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraNotificationScreen(
          repository: repository,
          billRepository: billRepository,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tapVisibleNotificationControl(
      tester,
      const ValueKey('notification-open-personal-bill-0'),
    );

    expect(billRepository.getPersonalCalls, 1);
    expect(repository.markReadCalls, 0);
    expect(find.text('Corner Market'), findsNothing);
    expect(
      find.text(
        'The linked bill is unavailable. Refresh notifications or open the related list to retry.',
      ),
      findsOneWidget,
    );
    final text = renderedNotificationUiText(tester);
    expect(text, isNot(contains('/api/v1')));
    expect(text, isNot(contains(_billId)));
    expect(text, isNot(contains('token=secret')));
    expect(text, isNot(contains('generated client')));
    expect(text, isNot(contains('stack trace')));
    expect(text, isNot(contains('storage provider')));
    expect(text, isNot(contains('receipt OCR')));
    expect(text, isNot(contains('proof')));
    expect(text, isNot(contains('payment details')));
    expect(text, isNot(contains('/home/user/file')));
    expect(text, isNot(contains('unrelated-user')));
  });

  testWidgets('actionable filter includes openable personal bill targets', (
    tester,
  ) async {
    final repository = FakeNotificationRepository(
      notifications: [
        sampleNotification(
          safeSummary: 'Personal bill ready.',
          expenseBillId: _billId,
        ),
        sampleNotification(
          safeSummary: 'Blank bill metadata.',
          expenseBillId: ' ',
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraNotificationScreen(
          repository: repository,
          billRepository: FakeBillRepository(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Bills (2)'), findsOneWidget);
    expect(find.text('Review (1)'), findsOneWidget);

    await tapNotificationFilter(tester, 'actionable');

    expect(find.text('Personal bill ready.'), findsOneWidget);
    expect(find.text('Blank bill metadata.'), findsNothing);
  });

  testWidgets('group bill notifications show open bill action and navigate', (
    tester,
  ) async {
    final billRepository = FakeBillRepository(
      detail: sampleBillDetail(
        participants: const [
          SettleoraBillParticipant(
            userProfileId: _profileId,
            status: SettleoraBillParticipantStatusValues.pendingAcceptance,
            resolvedShareAmount: '5.40',
            resolvedShareCurrency: 'USD',
          ),
          SettleoraBillParticipant(
            userProfileId: _otherProfileId,
            status: SettleoraBillParticipantStatusValues.accepted,
            resolvedShareAmount: '5.40',
            resolvedShareCurrency: 'USD',
          ),
        ],
      ),
    );
    final groupRepository = FakeGroupRepository(
      group: sampleGroup(name: 'Trip Crew'),
      members: [
        sampleMember(displayName: 'Taylor'),
        sampleMember(userProfileId: _otherProfileId, displayName: 'Morgan'),
      ],
    );
    final repository = FakeNotificationRepository(
      notifications: [
        sampleNotification(groupId: ' $_groupId ', expenseBillId: ' $_billId '),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraNotificationScreen(
          repository: repository,
          currentUserProfileId: _profileId,
          billRepository: billRepository,
          groupRepository: groupRepository,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('notification-open-group-bill-0')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('notification-open-revision-0')),
      findsNothing,
    );

    await tapVisibleNotificationControl(
      tester,
      const ValueKey('notification-open-group-bill-0'),
    );

    expect(groupRepository.getGroupCalls, 1);
    expect(groupRepository.listMemberCalls, 1);
    expect(billRepository.getGroupCalls, 1);
    expect(billRepository.lastGroupId, _groupId);
    expect(billRepository.lastBillId, _billId);
    expect(find.text('Group bill'), findsWidgets);
    expect(find.text('Trip Crew'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Taylor (you)'),
      220,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('Taylor (you)'), findsWidgets);
    expect(find.text('Morgan'), findsWidgets);
  });

  testWidgets('group bill open action tolerates member name failures', (
    tester,
  ) async {
    final billRepository = FakeBillRepository(detail: sampleBillDetail());
    final groupRepository = FakeGroupRepository(
      group: sampleGroup(name: 'Trip Crew'),
      memberFailure: const SettleoraGroupFailure(
        kind: SettleoraGroupFailureKind.server,
        message: 'Member names are unavailable.',
      ),
    );
    final repository = FakeNotificationRepository(
      notifications: [
        sampleNotification(groupId: _groupId, expenseBillId: _billId),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraNotificationScreen(
          repository: repository,
          currentUserProfileId: _profileId,
          billRepository: billRepository,
          groupRepository: groupRepository,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tapVisibleNotificationControl(
      tester,
      const ValueKey('notification-open-group-bill-0'),
    );

    expect(groupRepository.listMemberCalls, 1);
    expect(find.text('Group bill'), findsWidgets);
    await tester.scrollUntilVisible(
      find.text('Participant 1 (you)'),
      220,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('Participant 1 (you)'), findsWidgets);
    expect(find.text('Member names are unavailable.'), findsNothing);
  });

  testWidgets('group bill open action hides without typed target or seams', (
    tester,
  ) async {
    final cases = [
      sampleNotification(groupId: ' ', expenseBillId: _billId),
      sampleNotification(groupId: _groupId, expenseBillId: ' '),
      sampleNotification(
        eventType: SettleoraNotificationEventTypeValues.billRevisionSubmitted,
        groupId: _groupId,
        expenseBillId: _billId,
        expenseBillRevisionId: _revisionId,
      ),
    ];

    for (final notification in cases) {
      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraNotificationScreen(
            repository: FakeNotificationRepository(
              notifications: [notification],
            ),
            currentUserProfileId: _profileId,
            billRepository: FakeBillRepository(),
            groupRepository: FakeGroupRepository(),
            billRevisionRepository: FakeBillRevisionRepository(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.byKey(const ValueKey('notification-open-group-bill-0')),
        findsNothing,
      );
    }

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraNotificationScreen(
          repository: FakeNotificationRepository(
            notifications: [
              sampleNotification(groupId: _groupId, expenseBillId: _billId),
            ],
          ),
          currentUserProfileId: _profileId,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('notification-open-group-bill-0')),
      findsNothing,
    );
  });

  testWidgets('group bill open failure stays bounded', (tester) async {
    final repository = FakeNotificationRepository(
      notifications: [
        sampleNotification(
          actionUrl: '/api/v1/groups/$_groupId/bills/$_billId?token=secret',
          groupId: _groupId,
          expenseBillId: _billId,
        ),
      ],
    );
    final groupRepository = FakeGroupRepository(
      groupFailure: const SettleoraGroupFailure(
        kind: SettleoraGroupFailureKind.denied,
        message: 'This bill is not available to this account.',
        statusCode: 403,
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraNotificationScreen(
          repository: repository,
          currentUserProfileId: _profileId,
          billRepository: FakeBillRepository(),
          groupRepository: groupRepository,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tapVisibleNotificationControl(
      tester,
      const ValueKey('notification-open-group-bill-0'),
    );

    expect(groupRepository.getGroupCalls, 1);
    expect(repository.markReadCalls, 0);
    expect(
      find.text('This bill is not available to this account.'),
      findsOneWidget,
    );
    expect(visibleText(tester), isNot(contains(_groupId)));
    expect(visibleText(tester), isNot(contains(_billId)));
    expect(visibleText(tester), isNot(contains('token=secret')));
  });

  testWidgets(
    'settlement notifications show open settlement action and navigate',
    (tester) async {
      final settlementRepository = FakeSettlementRepository();
      final repository = FakeNotificationRepository(
        notifications: [
          sampleNotification(
            subjectType:
                SettleoraNotificationSubjectTypeValues.settlementRequest,
            eventType: 'settlement.request_created',
            actionUrl: '/api/v1/settlements/ignored',
            settlementRequestId: ' $_settlementId ',
            settlementPaymentId: _paymentId,
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraNotificationScreen(
            repository: repository,
            currentUserProfileId: _profileId,
            settlementRepository: settlementRepository,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.byKey(const ValueKey('notification-open-settlement-0')),
        findsOneWidget,
      );
      expect(find.text('Review settlement'), findsOneWidget);

      await tapVisibleNotificationControl(
        tester,
        const ValueKey('notification-open-settlement-0'),
      );

      expect(settlementRepository.getRequestCalls, 1);
      expect(settlementRepository.listPaymentsCalls, 1);
      expect(settlementRepository.lastSettlementId, _settlementId);
      expect(find.text('Settlement'), findsWidgets);
      expect(
        visibleText(tester),
        isNot(contains('/api/v1/settlements/ignored')),
      );
    },
  );

  testWidgets(
    'settlement payment notifications require request ID and profile seam',
    (tester) async {
      final cases = [
        sampleNotification(
          subjectType: SettleoraNotificationSubjectTypeValues.settlementPayment,
          eventType: 'settlement.payment_marked_paid',
          settlementRequestId: ' ',
          settlementPaymentId: _paymentId,
        ),
        sampleNotification(
          subjectType: SettleoraNotificationSubjectTypeValues.settlementPayment,
          eventType: 'settlement.payment_marked_paid',
          actionUrl: '/api/v1/settlement-payments/$_paymentId',
          settlementRequestId: null,
          settlementPaymentId: _paymentId,
        ),
      ];

      for (final notification in cases) {
        await tester.pumpWidget(
          MaterialApp(
            home: SettleoraNotificationScreen(
              repository: FakeNotificationRepository(
                notifications: [notification],
              ),
              currentUserProfileId: _profileId,
              settlementRepository: FakeSettlementRepository(),
            ),
          ),
        );
        await tester.pumpAndSettle();

        expect(
          find.byKey(const ValueKey('notification-open-settlement-0')),
          findsNothing,
        );
      }

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraNotificationScreen(
            repository: FakeNotificationRepository(
              notifications: [
                sampleNotification(
                  subjectType:
                      SettleoraNotificationSubjectTypeValues.settlementPayment,
                  eventType: 'settlement.payment_marked_paid',
                  settlementRequestId: _settlementId,
                  settlementPaymentId: _paymentId,
                ),
              ],
            ),
            settlementRepository: FakeSettlementRepository(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.byKey(const ValueKey('notification-open-settlement-0')),
        findsNothing,
      );
    },
  );

  testWidgets(
    'recurring bill notifications show open recurring action and navigate',
    (tester) async {
      final recurringRepository = FakeRecurringBillRepository();
      final repository = FakeNotificationRepository(
        notifications: [
          sampleNotification(
            subjectType:
                SettleoraNotificationSubjectTypeValues.recurringBillOccurrence,
            eventType: 'recurring_bill.draft_generated',
            actionUrl: '/api/v1/recurring/ignored',
            recurringBillTemplateId: ' $_recurringTemplateId ',
            recurringBillOccurrenceId: _recurringOccurrenceId,
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraNotificationScreen(
            repository: repository,
            recurringBillRepository: recurringRepository,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.byKey(const ValueKey('notification-open-recurring-0')),
        findsOneWidget,
      );
      expect(find.text('Review bill'), findsOneWidget);

      await tapVisibleNotificationControl(
        tester,
        const ValueKey('notification-open-recurring-0'),
      );

      expect(recurringRepository.getTemplateCalls, 1);
      expect(recurringRepository.lastTemplateId, _recurringTemplateId);
      expect(find.text('Recurring bill'), findsWidgets);
      expect(find.text('Rent'), findsOneWidget);
      expect(visibleText(tester), isNot(contains('/api/v1/recurring/ignored')));
    },
  );

  testWidgets(
    'recurring bill open action requires typed template ID and repository seam',
    (tester) async {
      final cases = [
        sampleNotification(
          subjectType:
              SettleoraNotificationSubjectTypeValues.recurringBillOccurrence,
          eventType: 'recurring_bill.draft_generated',
          actionUrl: '/api/v1/recurring/templates/$_recurringTemplateId',
          recurringBillTemplateId: ' ',
          recurringBillOccurrenceId: _recurringOccurrenceId,
        ),
        sampleNotification(
          subjectType: SettleoraNotificationSubjectTypeValues.expenseBill,
          eventType: 'recurring_bill.draft_generated',
          recurringBillTemplateId: _recurringTemplateId,
          recurringBillOccurrenceId: _recurringOccurrenceId,
        ),
      ];

      for (final notification in cases) {
        await tester.pumpWidget(
          MaterialApp(
            home: SettleoraNotificationScreen(
              repository: FakeNotificationRepository(
                notifications: [notification],
              ),
              recurringBillRepository: FakeRecurringBillRepository(),
            ),
          ),
        );
        await tester.pumpAndSettle();

        expect(
          find.byKey(const ValueKey('notification-open-recurring-0')),
          findsNothing,
        );
      }

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraNotificationScreen(
            repository: FakeNotificationRepository(
              notifications: [
                sampleNotification(
                  subjectType: SettleoraNotificationSubjectTypeValues
                      .recurringBillOccurrence,
                  eventType: 'recurring_bill.draft_generated',
                  recurringBillTemplateId: _recurringTemplateId,
                ),
              ],
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.byKey(const ValueKey('notification-open-recurring-0')),
        findsNothing,
      );
    },
  );

  testWidgets(
    'opening a personal bill notification marks read and updates filters',
    (tester) async {
      final repository = FakeNotificationRepository(
        notifications: [sampleNotification(expenseBillId: _billId)],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraNotificationScreen(
            repository: repository,
            billRepository: FakeBillRepository(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Unread (1)'), findsOneWidget);
      expect(find.text('Review (1)'), findsOneWidget);

      await openNotificationAndReturn(
        tester,
        const ValueKey('notification-open-personal-bill-0'),
      );

      expect(repository.markReadCalls, 1);
      expect(repository.lastNotificationId, _notificationId);
      expect(repository.summaryCalls, 2);
      expect(repository.listCalls, 3);
      expect(find.text('Unread (0)'), findsOneWidget);
      expect(find.text('Review (0)'), findsOneWidget);
      expect(find.text('Unread: 0'), findsOneWidget);
      expect(find.text('Read'), findsWidgets);
    },
  );

  testWidgets(
    'opening a group bill notification marks read and updates filters',
    (tester) async {
      final repository = FakeNotificationRepository(
        notifications: [
          sampleNotification(groupId: _groupId, expenseBillId: _billId),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraNotificationScreen(
            repository: repository,
            currentUserProfileId: _profileId,
            billRepository: FakeBillRepository(),
            groupRepository: FakeGroupRepository(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await openNotificationAndReturn(
        tester,
        const ValueKey('notification-open-group-bill-0'),
      );

      expect(repository.markReadCalls, 1);
      expect(find.text('Unread (0)'), findsOneWidget);
      expect(find.text('Review (0)'), findsOneWidget);
    },
  );

  testWidgets(
    'opening a settlement notification marks read and updates filters',
    (tester) async {
      final repository = FakeNotificationRepository(
        notifications: [
          sampleNotification(
            subjectType:
                SettleoraNotificationSubjectTypeValues.settlementRequest,
            eventType: 'settlement.request_created',
            settlementRequestId: _settlementId,
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraNotificationScreen(
            repository: repository,
            currentUserProfileId: _profileId,
            settlementRepository: FakeSettlementRepository(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await openNotificationAndReturn(
        tester,
        const ValueKey('notification-open-settlement-0'),
      );

      expect(repository.markReadCalls, 1);
      expect(find.text('Unread (0)'), findsOneWidget);
      expect(find.text('Review (0)'), findsOneWidget);
    },
  );

  testWidgets(
    'opening a recurring notification marks read and updates filters',
    (tester) async {
      final repository = FakeNotificationRepository(
        notifications: [
          sampleNotification(
            subjectType:
                SettleoraNotificationSubjectTypeValues.recurringBillOccurrence,
            eventType: 'recurring_bill.draft_generated',
            recurringBillTemplateId: _recurringTemplateId,
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraNotificationScreen(
            repository: repository,
            recurringBillRepository: FakeRecurringBillRepository(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await openNotificationAndReturn(
        tester,
        const ValueKey('notification-open-recurring-0'),
      );

      expect(repository.markReadCalls, 1);
      expect(find.text('Unread (0)'), findsOneWidget);
      expect(find.text('Review (0)'), findsOneWidget);
    },
  );

  testWidgets(
    'opening a bill revision notification marks read and updates filters',
    (tester) async {
      final repository = FakeNotificationRepository(
        notifications: [
          sampleNotification(
            eventType:
                SettleoraNotificationEventTypeValues.billRevisionSubmitted,
            expenseBillId: _billId,
            expenseBillRevisionId: _revisionId,
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

      await openNotificationAndReturn(
        tester,
        const ValueKey('notification-open-revision-0'),
      );

      expect(repository.markReadCalls, 1);
      expect(find.text('Unread (0)'), findsOneWidget);
      expect(find.text('Review (0)'), findsOneWidget);
    },
  );

  testWidgets('notification center does not duplicate the global bell', (
    tester,
  ) async {
    final repository = FakeNotificationRepository();

    await tester.pumpWidget(
      MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    expect(find.byIcon(Icons.notifications_outlined), findsNothing);
    expect(
      find.byKey(const Key('server-shell-notifications-header')),
      findsNothing,
    );
  });

  testWidgets('receipt review notifications refresh and open review detail', (
    tester,
  ) async {
    final ocrRepository = FakeReceiptOcrReviewRepository();
    final repository = FakeNotificationRepository(
      notifications: [
        sampleNotification(
          eventType: SettleoraNotificationEventTypeValues.ocrNeedsReview,
          subjectType: SettleoraNotificationSubjectTypeValues.receiptOcrReview,
          expenseBillId: _billId,
          receiptOcrReviewId: _ocrReviewId,
          receiptAttachmentFileId: _receiptFileId,
          safeSummary: 'A receipt needs review.',
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraNotificationScreen(
          repository: repository,
          receiptOcrReviewRepository: ocrRepository,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Receipt review'), findsWidgets);
    expect(find.text('Review receipt'), findsOneWidget);

    await tapVisibleNotificationControl(
      tester,
      const ValueKey('notification-open-receipt-review-0'),
    );
    await tester.pumpAndSettle();

    expect(ocrRepository.getReviewCalls, 1);
    expect(ocrRepository.lastRoute?.billId, _billId);
    expect(ocrRepository.lastRoute?.fileId, _receiptFileId);
    await tester.pageBack();
    await tester.pumpAndSettle();

    expect(repository.markReadCalls, 1);
    expect(visibleText(tester), isNot(contains('ocr.needs_review')));
    expect(visibleText(tester), isNot(contains(_ocrReviewId)));
    expect(visibleText(tester), isNot(contains(_receiptFileId)));
  });

  testWidgets('sync notifications refresh and show bounded sync readout', (
    tester,
  ) async {
    final syncRepository = FakeSyncRepository();
    final repository = FakeNotificationRepository(
      notifications: [
        sampleNotification(
          eventType: SettleoraNotificationEventTypeValues.syncConflictDetected,
          subjectType: SettleoraNotificationSubjectTypeValues.syncOperation,
          syncOperationId: _syncOperationId,
          safeSummary: 'Sync needs attention.',
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraNotificationScreen(
          repository: repository,
          syncRepository: syncRepository,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Sync issue'), findsWidgets);
    expect(find.text('Review sync issue'), findsOneWidget);

    await tapVisibleNotificationControl(
      tester,
      const ValueKey('notification-open-sync-0'),
    );
    await tester.pumpAndSettle();

    expect(syncRepository.getOperationCalls, 1);
    expect(syncRepository.lastSyncOperationId, _syncOperationId);
    expect(
      find.text('Review the latest server state before retrying.'),
      findsOneWidget,
    );
    await tester.pageBack();
    await tester.pumpAndSettle();

    expect(repository.markReadCalls, 1);
    expect(visibleText(tester), isNot(contains('sync.conflict_detected')));
    expect(visibleText(tester), isNot(contains(_syncOperationId)));
  });

  testWidgets('future and unsupported route families show safe fallback copy', (
    tester,
  ) async {
    final repository = FakeNotificationRepository(
      notifications: [
        sampleNotification(
          eventType: 'security.session_revoked',
          subjectType: 'auth_session',
          actionUrl: '/api/v1/auth/sessions/private?token=secret',
          safeSummary: 'Account attention needed.',
        ),
        sampleNotification(
          id: 'claim-row',
          eventType: 'bill.item_claim_requested',
          subjectType: SettleoraNotificationSubjectTypeValues.expenseBill,
          expenseBillId: _billId,
          safeSummary: 'Bill item needs review.',
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    expect(
      find.text(
        'This item cannot be opened here yet. Refresh or check the related section.',
      ),
      findsWidgets,
    );
    expect(visibleText(tester), isNot(contains('security.session_revoked')));
    expect(visibleText(tester), isNot(contains('bill.item_claim_requested')));
    expect(visibleText(tester), isNot(contains('/api/v1/auth')));
    expect(visibleText(tester), isNot(contains(_billId)));
  });

  testWidgets('already-read notifications open without marking read again', (
    tester,
  ) async {
    final repository = FakeNotificationRepository(
      notifications: [
        sampleNotification(
          status: SettleoraNotificationStatusValues.read,
          readAtUtc: _updatedAtUtc,
          expenseBillId: _billId,
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraNotificationScreen(
          repository: repository,
          billRepository: FakeBillRepository(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await openNotificationAndReturn(
      tester,
      const ValueKey('notification-open-personal-bill-0'),
    );

    expect(repository.markReadCalls, 0);
    expect(repository.summaryCalls, 1);
    expect(repository.listCalls, 2);
  });

  testWidgets(
    'mark-read failure after open stays bounded and clears acting state',
    (tester) async {
      final repository = FakeNotificationRepository(
        markReadFailure: const SettleoraNotificationFailure(
          kind: SettleoraNotificationFailureKind.server,
          message:
              'internal notification $_notificationId bill $_billId token=secret',
        ),
        notifications: [
          sampleNotification(
            actionUrl: '/api/v1/bills/$_billId?token=secret',
            expenseBillId: _billId,
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraNotificationScreen(
            repository: repository,
            billRepository: FakeBillRepository(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await openNotificationAndReturn(
        tester,
        const ValueKey('notification-open-personal-bill-0'),
      );

      expect(repository.markReadCalls, 1);
      expect(
        find.text(
          'Notification status could not be refreshed. Try again later.',
        ),
        findsOneWidget,
      );
      expect(visibleText(tester), isNot(contains(_notificationId)));
      expect(visibleText(tester), isNot(contains(_billId)));
      expect(visibleText(tester), isNot(contains('token=secret')));

      final openButton = tester.widget<FilledButton>(
        find.descendant(
          of: find.byKey(const ValueKey('notification-open-personal-bill-0')),
          matching: find.byType(FilledButton),
        ),
      );
      expect(openButton.onPressed, isNotNull);
    },
  );

  testWidgets('hidden open actions do not mark read', (tester) async {
    final repository = FakeNotificationRepository(
      notifications: [
        sampleNotification(
          actionUrl: '/api/v1/bills/$_billId?token=secret',
          expenseBillId: null,
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraNotificationScreen(
          repository: repository,
          billRepository: FakeBillRepository(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('notification-open-personal-bill-0')),
      findsNothing,
    );
    expect(
      find.text(
        'This item cannot be opened here yet. Refresh or check the related section.',
      ),
      findsOneWidget,
    );
    expect(repository.markReadCalls, 0);
  });

  testWidgets('notification details show safe context without opening target', (
    tester,
  ) async {
    final billRepository = FakeBillRepository();
    final repository = FakeNotificationRepository(
      notifications: [
        sampleNotification(
          safeSummary: 'Personal bill ready.',
          expenseBillId: _billId,
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraNotificationScreen(
          repository: repository,
          billRepository: billRepository,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tapNotificationFilter(tester, 'bills');
    await tapVisibleNotificationControl(
      tester,
      const ValueKey('notification-details-0'),
    );

    expect(find.byKey(const Key('notification-detail-sheet')), findsOneWidget);
    expect(find.text('Unread'), findsWidgets);
    expect(find.text('What happened'), findsOneWidget);
    expect(find.text('Personal bill ready.'), findsWidgets);
    expect(find.text('What you can do'), findsOneWidget);
    expect(
      find.text('Open the linked item for the next step.'),
      findsOneWidget,
    );
    expect(find.text('Linked item'), findsOneWidget);
    expect(find.text('Personal bill'), findsOneWidget);
    expect(find.text('Ready to open.'), findsOneWidget);
    expect(find.text('Safety note'), findsOneWidget);
    expect(
      find.textContaining('We recheck access before opening details.'),
      findsOneWidget,
    );
    expect(repository.markReadCalls, 0);
    expect(billRepository.getPersonalCalls, 0);

    Navigator.of(
      tester.element(find.byKey(const Key('notification-detail-sheet'))),
    ).pop();
    await tester.pumpAndSettle();

    expectSelectedFilter(tester, 'bills');
    expect(find.text('Bills (1)'), findsOneWidget);
  });

  testWidgets('notification details explain unavailable typed destinations', (
    tester,
  ) async {
    final repository = FakeNotificationRepository(
      notifications: [
        sampleNotification(
          safeSummary: 'Settlement needs review.',
          eventType: 'settlement.request_created',
          subjectType: SettleoraNotificationSubjectTypeValues.settlementRequest,
          settlementRequestId: _settlementId,
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    await tapVisibleNotificationControl(
      tester,
      const ValueKey('notification-details-0'),
    );

    expect(find.byKey(const Key('notification-detail-sheet')), findsOneWidget);
    expect(find.text('What happened'), findsOneWidget);
    expect(find.text('Settlement needs review.'), findsWidgets);
    expect(find.text('Linked item'), findsOneWidget);
    expect(find.text('Settlement'), findsOneWidget);
    expect(find.text('Sign in or refresh before opening.'), findsOneWidget);
    expect(renderedNotificationUiText(tester), isNot(contains(_settlementId)));
    expect(repository.markReadCalls, 0);
  });

  testWidgets(
    'notification details hide unsafe action URLs IDs paths and tokens',
    (tester) async {
      final repository = FakeNotificationRepository(
        notifications: [
          sampleNotification(
            eventType: '/api/v1/bills/$_billId?token=secret',
            subjectType: '/api/v1/groups/$_groupId',
            priority: 'urgent?token=secret',
            safeSummary: 'Open /api/v1/bills/$_billId?token=secret',
            actionUrl: '/api/v1/bills/$_billId?token=secret bearer abc',
            expenseBillId: null,
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
      );
      await tester.pumpAndSettle();

      await tapVisibleNotificationControl(
        tester,
        const ValueKey('notification-details-0'),
      );

      expect(
        find.byKey(const Key('notification-detail-sheet')),
        findsOneWidget,
      );
      expect(find.text('Notification'), findsWidgets);
      expect(find.text('What happened'), findsWidgets);
      expect(find.text('Unsupported link'), findsOneWidget);
      expect(
        find.text('Linked item is not available here yet.'),
        findsOneWidget,
      );
      expect(renderedNotificationUiText(tester), isNot(contains('/api/v1')));
      expect(renderedNotificationUiText(tester), isNot(contains(_billId)));
      expect(renderedNotificationUiText(tester), isNot(contains(_groupId)));
      expect(
        renderedNotificationUiText(tester),
        isNot(contains('token=secret')),
      );
      expect(renderedNotificationUiText(tester), isNot(contains('bearer abc')));
    },
  );

  testWidgets('archived notifications show details but do not open', (
    tester,
  ) async {
    final billRepository = FakeBillRepository();
    final repository = FakeNotificationRepository(
      notifications: [
        sampleNotification(
          status: SettleoraNotificationStatusValues.archived,
          safeSummary: 'Archived bill.',
          expenseBillId: _billId,
          readAtUtc: _createdAtUtc,
          archivedAtUtc: _updatedAtUtc,
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraNotificationScreen(
          repository: repository,
          billRepository: billRepository,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tapNotificationFilter(tester, 'archived');
    expect(
      find.byKey(const ValueKey('notification-open-personal-bill-0')),
      findsNothing,
    );

    await tapVisibleNotificationControl(
      tester,
      const ValueKey('notification-details-0'),
    );

    expect(find.byKey(const Key('notification-detail-sheet')), findsOneWidget);
    expect(find.text('Archived'), findsWidgets);
    expect(find.textContaining('updated'), findsOneWidget);
    expect(find.text('Personal bill'), findsOneWidget);
    expect(
      find.text('Archived; restore before opening from Notifications.'),
      findsOneWidget,
    );
    expect(
      find.text('Archived notifications do not open automatically.'),
      findsOneWidget,
    );
    expect(repository.markReadCalls, 0);
    expect(billRepository.getPersonalCalls, 0);
  });

  testWidgets('unsafe notification display text falls back to bounded copy', (
    tester,
  ) async {
    final repository = FakeNotificationRepository(
      notifications: [
        sampleNotification(
          eventType: '/api/v1/bills/$_billId?token=secret',
          subjectType: '/api/v1/groups/$_groupId',
          priority: 'urgent?token=secret',
          safeSummary: 'Open /api/v1/bills/$_billId?token=secret',
          actionUrl: '/api/v1/bills/$_billId?token=secret',
          expenseBillId: null,
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    expect(find.text('Notification'), findsOneWidget);
    expect(find.text('Review later'), findsOneWidget);
    expect(
      find.text(
        'This item cannot be opened here yet. Refresh or check the related section.',
      ),
      findsOneWidget,
    );
    expect(visibleText(tester), isNot(contains('/api/v1')));
    expect(visibleText(tester), isNot(contains(_billId)));
    expect(visibleText(tester), isNot(contains(_groupId)));
    expect(visibleText(tester), isNot(contains('token=secret')));
  });

  testWidgets('duplicate mark-read taps are single flight', (tester) async {
    final repository = FakeNotificationRepository(
      actionDelay: const Duration(milliseconds: 50),
    );

    await tester.pumpWidget(
      MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    final button = find.byKey(const ValueKey('notification-mark-read-0'));
    await tester.tap(button);
    await tester.pump();
    await tester.tap(button);
    await tester.pumpAndSettle();

    expect(repository.markReadCalls, 1);
    expect(find.text('Unread (0)'), findsOneWidget);
    expect(find.text('Read (1)'), findsOneWidget);
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

  testWidgets(
    'unsafe action failure details are not rendered in text tooltips or semantics',
    (tester) async {
      final semantics = tester.ensureSemantics();
      final repository = FakeNotificationRepository(
        markReadFailure: const SettleoraNotificationFailure(
          kind: SettleoraNotificationFailureKind.server,
          message:
              'internal /api/v1/notifications/$_notificationId?token=secret bearer abc',
        ),
      );

      await tester.pumpWidget(
        MaterialApp(home: SettleoraNotificationScreen(repository: repository)),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('notification-mark-read-0')));
      await tester.pumpAndSettle();

      expect(repository.markReadCalls, 1);
      expect(
        find.text('Notification could not be marked read.'),
        findsOneWidget,
      );
      expect(
        tester
            .getSemantics(find.text('Notification could not be marked read.'))
            .label,
        'Notification could not be marked read.',
      );
      semantics.dispose();
      expect(renderedNotificationUiText(tester), isNot(contains('/api/v1')));
      expect(
        renderedNotificationUiText(tester),
        isNot(contains(_notificationId)),
      );
      expect(
        renderedNotificationUiText(tester),
        isNot(contains('token=secret')),
      );
      expect(renderedNotificationUiText(tester), isNot(contains('bearer abc')));
    },
  );

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

    expect(find.text('Notifications'), findsWidgets);
    expect(find.text('Bill revision submitted'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('notification-open-revision-0')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('notification-open-settlement-0')),
      findsNothing,
    );
    expect(notificationRepository.summaryCalls, 2);
    expect(notificationRepository.listCalls, 1);
  });
}

Future<void> tapNotificationFilter(
  WidgetTester tester,
  String filterName,
) async {
  final finder = find.byKey(ValueKey('notification-filter-$filterName'));
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

void expectSelectedFilter(WidgetTester tester, String filterName) {
  final chip = tester.widget<FilterChip>(
    find.byKey(ValueKey('notification-filter-$filterName')),
  );
  expect(chip.selected, isTrue);
}

Future<void> openNotificationAndReturn(
  WidgetTester tester,
  Key openButtonKey,
) async {
  await tapVisibleNotificationControl(tester, openButtonKey);
  await tester.pageBack();
  await tester.pumpAndSettle();
}

Future<void> tapVisibleNotificationControl(WidgetTester tester, Key key) async {
  final finder = find.byKey(key);
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

class FakeNotificationRepository
    implements
        SettleoraNotificationRepository,
        SettleoraNotificationRestoreRepository {
  FakeNotificationRepository({
    List<SettleoraNotificationRow>? notifications,
    this.loadFailures = const [],
    this.markReadFailure,
    this.markAllReadFailure,
    this.archiveFailure,
    this.restoreFailure,
    this.listFailureOnCall,
    this.listFailure,
    this.actionDelay = Duration.zero,
  }) : notifications = notifications ?? [sampleNotification()],
       _preArchiveStatuses = <String, String>{},
       _summaryCompleter = null,
       _notificationsCompleter = null;

  FakeNotificationRepository.manual()
    : notifications = const [],
      loadFailures = const [],
      markReadFailure = null,
      markAllReadFailure = null,
      archiveFailure = null,
      restoreFailure = null,
      listFailureOnCall = null,
      listFailure = null,
      actionDelay = Duration.zero,
      _preArchiveStatuses = <String, String>{},
      _summaryCompleter = Completer<SettleoraNotificationSummary>(),
      _notificationsCompleter = Completer<List<SettleoraNotificationRow>>();

  List<SettleoraNotificationRow> notifications;
  final Map<String, String> _preArchiveStatuses;
  final List<SettleoraNotificationFailure> loadFailures;
  final SettleoraNotificationFailure? markReadFailure;
  final SettleoraNotificationFailure? markAllReadFailure;
  final SettleoraNotificationFailure? archiveFailure;
  final SettleoraNotificationFailure? restoreFailure;
  final int? listFailureOnCall;
  final SettleoraNotificationFailure? listFailure;
  final Duration actionDelay;
  final Completer<SettleoraNotificationSummary>? _summaryCompleter;
  final Completer<List<SettleoraNotificationRow>>? _notificationsCompleter;
  int summaryCalls = 0;
  int listCalls = 0;
  int markReadCalls = 0;
  int markAllReadCalls = 0;
  int archiveCalls = 0;
  int restoreCalls = 0;
  String? lastNotificationId;
  final List<String> markReadIds = [];

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
    if (listFailureOnCall == listCalls) {
      throw listFailure ??
          const SettleoraNotificationFailure(
            kind: SettleoraNotificationFailureKind.network,
            message:
                'The server is unavailable. Try again when the connection is back.',
          );
    }
    final completer = _notificationsCompleter;
    if (completer != null) {
      notifications = await completer.future;
      return notifications;
    }

    return status == null
        ? notifications
        : notifications
              .where((notification) => notification.status == status)
              .toList(growable: false);
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
    markReadIds.add(notificationId);
    if (actionDelay > Duration.zero) {
      await Future<void>.delayed(actionDelay);
    }
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
    if (actionDelay > Duration.zero) {
      await Future<void>.delayed(actionDelay);
    }
    final failure = markAllReadFailure;
    if (failure != null) {
      throw failure;
    }

    notifications = [
      for (final row in notifications)
        row.status == SettleoraNotificationStatusValues.archived
            ? row
            : _copyNotification(
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
    if (actionDelay > Duration.zero) {
      await Future<void>.delayed(actionDelay);
    }
    final failure = archiveFailure;
    if (failure != null) {
      throw failure;
    }

    final current = notifications.firstWhere((row) => row.id == notificationId);
    _preArchiveStatuses[notificationId] = current.status;
    final archived = _copyNotification(
      current,
      status: SettleoraNotificationStatusValues.archived,
      archivedAtUtc: _updatedAtUtc,
    );
    notifications = [
      for (final row in notifications)
        row.id == notificationId ? archived : row,
    ];
    return archived;
  }

  @override
  Future<SettleoraNotificationRow> restoreNotification(
    String notificationId,
  ) async {
    restoreCalls += 1;
    lastNotificationId = notificationId;
    if (actionDelay > Duration.zero) {
      await Future<void>.delayed(actionDelay);
    }
    final failure = restoreFailure;
    if (failure != null) {
      throw failure;
    }

    final current = notifications.firstWhere((row) => row.id == notificationId);
    final restoredStatus =
        _preArchiveStatuses.remove(notificationId) ??
        SettleoraNotificationStatusValues.read;
    final restored = _copyNotification(
      current,
      status: restoredStatus,
      archivedAtUtc: null,
      clearArchivedAtUtc: true,
    );
    notifications = [
      for (final row in notifications)
        row.id == notificationId ? restored : row,
    ];
    return restored;
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
  int getReviewCalls = 0;
  ReceiptOcrReviewRoute? lastRoute;
  ReceiptOcrReviewFailure? getReviewFailure;

  @override
  Future<List<ReceiptOcrReviewSummary>> listReviews({
    ReceiptOcrReviewStatus? status,
    ReceiptOcrReviewSource? source,
    int? limit,
  }) async {
    return const [];
  }

  @override
  Future<ReceiptOcrReviewDetail> getReview(ReceiptOcrReviewRoute route) async {
    getReviewCalls += 1;
    lastRoute = route;
    final failure = getReviewFailure;
    if (failure != null) {
      throw failure;
    }

    return ReceiptOcrReviewDetail(
      id: _ocrReviewId,
      billId: route.billId,
      fileId: route.fileId,
      groupId: route.groupId,
      status: ReceiptOcrReviewStatusValues.provisional,
      source: ReceiptOcrReviewSourceValues.onDevice,
      merchantText: null,
      receiptIssuedAtUtc: null,
      currency: null,
      subtotalAmount: null,
      taxAmount: null,
      serviceChargeAmount: null,
      discountAmount: null,
      grandTotalAmount: null,
      lines: const [],
      createdAtUtc: _createdAtUtc,
      updatedAtUtc: _updatedAtUtc,
    );
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
  int getTemplateCalls = 0;
  String? lastTemplateId;

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
  Future<SettleoraRecurringBillTemplateDetail> getTemplate(
    String templateId,
  ) async {
    getTemplateCalls += 1;
    lastTemplateId = templateId;
    return sampleRecurringBillTemplate(templateId);
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

class FakeBillRepository implements SettleoraBillRepository {
  FakeBillRepository({SettleoraBillDetail? detail, this.personalFailure})
    : detail = detail ?? sampleBillDetail();

  final SettleoraBillDetail detail;
  final SettleoraBillFailure? personalFailure;
  int getPersonalCalls = 0;
  int getGroupCalls = 0;
  String? lastGroupId;
  String? lastBillId;

  @override
  Future<SettleoraBillDetail> createPersonalBill(
    SettleoraPersonalBillCreateDraft draft,
  ) {
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
  Future<SettleoraBillDetail> getGroupBill(
    String groupId,
    String billId,
  ) async {
    getGroupCalls += 1;
    lastGroupId = groupId;
    lastBillId = billId;
    return detail;
  }

  @override
  Future<SettleoraBillDetail> getPersonalBill(String billId) async {
    getPersonalCalls += 1;
    lastBillId = billId;
    final failure = personalFailure;
    if (failure != null) {
      throw failure;
    }

    return detail;
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

class FakeBillAttachmentRepository
    implements SettleoraBillAttachmentRepository {
  int listCalls = 0;
  SettleoraBillAttachmentRoute? lastRoute;

  @override
  Future<List<SettleoraBillAttachment>> listAttachments(
    SettleoraBillAttachmentRoute route,
  ) async {
    listCalls += 1;
    lastRoute = route;
    return const [];
  }

  @override
  Future<SettleoraBillAttachment> attachAttachment(
    SettleoraBillAttachmentRoute route,
    SettleoraBillAttachmentUpload upload,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillAttachmentContent> downloadAttachmentContent(
    SettleoraBillAttachmentRoute route,
    String fileId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<void> removeAttachment(
    SettleoraBillAttachmentRoute route,
    String fileId,
  ) {
    throw UnimplementedError();
  }
}

class FakeBillAttachmentFileInput implements SettleoraBillAttachmentFileInput {
  @override
  Future<SettleoraPickedBillAttachmentFile?> pickAttachmentFile({
    required Set<String> allowedContentTypes,
  }) async {
    return null;
  }
}

class FakeSettlementRepository implements SettleoraSettlementRepository {
  int getRequestCalls = 0;
  int listPaymentsCalls = 0;
  String? lastSettlementId;

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
  Future<SettleoraSettlementRequest> getSettlementRequest(
    String settlementId,
  ) async {
    getRequestCalls += 1;
    lastSettlementId = settlementId;
    return sampleSettlementRequest();
  }

  @override
  Future<List<SettleoraSettlementPayment>> listSettlementPayments(
    String settlementId,
  ) async {
    listPaymentsCalls += 1;
    lastSettlementId = settlementId;
    return const [];
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

class FakeGroupRepository implements SettleoraGroupRepository {
  FakeGroupRepository({
    SettleoraGroup? group,
    this.groupFailure,
    this.members = const [],
    this.memberFailure,
  }) : group = group ?? sampleGroup();

  final SettleoraGroup group;
  final SettleoraGroupFailure? groupFailure;
  final List<SettleoraGroupMember> members;
  final SettleoraGroupFailure? memberFailure;
  int getGroupCalls = 0;
  int listMemberCalls = 0;

  @override
  Future<List<SettleoraGroup>> listGroups() async {
    return const [];
  }

  @override
  Future<SettleoraGroup> createGroup(SettleoraGroupSaveRequest request) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraGroup> getGroup(String groupId) async {
    getGroupCalls += 1;
    final failure = groupFailure;
    if (failure != null) {
      throw failure;
    }

    return group;
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
    final failure = memberFailure;
    if (failure != null) {
      throw failure;
    }

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
  int getOperationCalls = 0;
  String? lastSyncOperationId;
  SettleoraSyncFailure? getOperationFailure;
  SettleoraSyncOperationResult operationResult =
      const SettleoraSyncOperationResult(
        operationId: _syncOperationId,
        status: SettleoraSyncOperationResultStatusValues.conflict,
        resourceType: SettleoraSyncResourceTypeValues.expenseBill,
        resourceId: null,
        resultingVersion: null,
        safeErrorCode: 'sync_conflict',
        safeMessage: 'Review the latest server state before retrying.',
      );

  @override
  Future<SettleoraSyncOperationResult> submitOperation(
    SettleoraSyncQueueItem item,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSyncOperationResult> getOperation(
    String syncOperationId,
  ) async {
    getOperationCalls += 1;
    lastSyncOperationId = syncOperationId;
    final failure = getOperationFailure;
    if (failure != null) {
      throw failure;
    }

    return operationResult;
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
  String id = _notificationId,
  String eventType = 'bill.submitted',
  String status = SettleoraNotificationStatusValues.unread,
  String priority = SettleoraNotificationPriorityValues.attention,
  String subjectType = SettleoraNotificationSubjectTypeValues.expenseBill,
  String? actionUrl,
  String? groupId,
  String? expenseBillId,
  String? expenseBillRevisionId,
  String? settlementRequestId,
  String? settlementPaymentId,
  String? recurringBillTemplateId,
  String? recurringBillOccurrenceId,
  String? receiptOcrReviewId,
  String? receiptAttachmentFileId,
  String? syncOperationId,
  String safeSummary = 'Dinner bill is ready.',
  DateTime? readAtUtc,
  DateTime? archivedAtUtc,
}) {
  return SettleoraNotificationRow(
    id: id,
    eventType: eventType,
    status: status,
    priority: priority,
    subjectType: subjectType,
    safeSummary: safeSummary,
    actionUrl: actionUrl,
    groupId: groupId,
    expenseBillId: expenseBillId,
    expenseBillRevisionId: expenseBillRevisionId,
    settlementRequestId: settlementRequestId,
    settlementPaymentId: settlementPaymentId,
    recurringBillTemplateId: recurringBillTemplateId,
    recurringBillOccurrenceId: recurringBillOccurrenceId,
    receiptOcrReviewId: receiptOcrReviewId,
    receiptAttachmentFileId: receiptAttachmentFileId,
    syncOperationId: syncOperationId,
    createdAtUtc: _createdAtUtc,
    readAtUtc: readAtUtc,
    archivedAtUtc: archivedAtUtc,
  );
}

SettleoraRecurringBillTemplateDetail sampleRecurringBillTemplate(String id) {
  return SettleoraRecurringBillTemplateDetail(
    id: id,
    merchantName: 'Rent',
    description: 'Monthly rent',
    status: SettleoraRecurringBillTemplateStatusValues.active,
    schedule: const SettleoraRecurringBillSchedule(
      type: SettleoraRecurringBillScheduleTypeValues.monthly,
      intervalCount: 1,
      intervalDays: null,
      startDate: '2026-05-01',
      endDate: null,
      dueOffsetDays: null,
    ),
    forecastAmount: '1200.00',
    forecastCurrency: 'USD',
    nextOccurrenceDate: '2026-06-01',
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
    archivedAtUtc: null,
    isGroupScoped: false,
    payloadVersion: 1,
  );
}

SettleoraSettlementRequest sampleSettlementRequest() {
  return SettleoraSettlementRequest(
    id: _settlementId,
    sourceExpenseBillId: _billId,
    groupId: null,
    debtorUserProfileId: _profileId,
    creditorUserProfileId: _otherProfileId,
    amount: '10.00',
    currency: 'USD',
    status: SettleoraSettlementRequestStatusValues.requested,
    requestedByUserProfileId: _otherProfileId,
    requestedAtUtc: _createdAtUtc,
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
    lines: const [],
  );
}

SettleoraBillDetail sampleBillDetail({
  List<SettleoraBillParticipant>? participants,
  String displayNameFallback = 'Group bill',
}) {
  return SettleoraBillDetail(
    id: _billId,
    merchantName: 'Corner Market',
    billDate: '2026-05-17',
    status: 'pending_confirmation',
    reconciliationStatus: 'unreconciled',
    reconciliationNote: null,
    revisionCreationActions: const SettleoraBillRevisionCreationActions(
      canCreateRevision: false,
    ),
    totalAmount: '10.80',
    totalCurrency: 'USD',
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
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
    participants:
        participants ??
        const [
          SettleoraBillParticipant(
            userProfileId: _profileId,
            status: SettleoraBillParticipantStatusValues.pendingAcceptance,
            resolvedShareAmount: '10.80',
            resolvedShareCurrency: 'USD',
          ),
        ],
    payers: const [
      SettleoraBillPayer(
        userProfileId: _profileId,
        amount: '10.80',
        currency: 'USD',
      ),
    ],
    adjustments: const [],
    displayNameFallback: displayNameFallback,
  );
}

SettleoraGroup sampleGroup({String name = 'Trip Crew'}) {
  return SettleoraGroup(
    id: _groupId,
    name: name,
    currentUserRole: SettleoraGroupRoleValues.member,
    currentUserStatus: SettleoraGroupMembershipStatusValues.active,
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

SettleoraGroupMember sampleMember({
  String userProfileId = _profileId,
  String displayName = 'Taylor',
}) {
  return SettleoraGroupMember(
    userProfileId: userProfileId,
    displayName: displayName,
    role: SettleoraGroupRoleValues.member,
    status: SettleoraGroupMembershipStatusValues.active,
    joinedAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

SettleoraNotificationRow _copyNotification(
  SettleoraNotificationRow row, {
  String? status,
  DateTime? readAtUtc,
  DateTime? archivedAtUtc,
  bool clearArchivedAtUtc = false,
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
    settlementRequestId: row.settlementRequestId,
    settlementPaymentId: row.settlementPaymentId,
    recurringBillTemplateId: row.recurringBillTemplateId,
    recurringBillOccurrenceId: row.recurringBillOccurrenceId,
    receiptOcrReviewId: row.receiptOcrReviewId,
    receiptAttachmentFileId: row.receiptAttachmentFileId,
    syncOperationId: row.syncOperationId,
    createdAtUtc: row.createdAtUtc,
    readAtUtc: readAtUtc ?? row.readAtUtc,
    archivedAtUtc: clearArchivedAtUtc
        ? null
        : archivedAtUtc ?? row.archivedAtUtc,
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
              row.status != SettleoraNotificationStatusValues.archived &&
              row.priority == SettleoraNotificationPriorityValues.attention,
        )
        .length,
    urgentCount: rows
        .where(
          (row) =>
              row.status != SettleoraNotificationStatusValues.archived &&
              row.priority == SettleoraNotificationPriorityValues.urgent,
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

String renderedNotificationUiText(WidgetTester tester) {
  final text = visibleText(tester);
  final tooltips = tester
      .widgetList<Tooltip>(find.byType(Tooltip))
      .map((widget) => widget.message)
      .join('\n');
  return '$text\n$tooltips';
}

Future<void> useLargeSurface(WidgetTester tester) async {
  await tester.binding.setSurfaceSize(const Size(900, 1600));
  addTearDown(() => tester.binding.setSurfaceSize(null));
}

const _notificationId = '11111111-1111-1111-1111-111111111111';
const _billId = '22222222-2222-2222-2222-222222222222';
const _revisionId = '44444444-4444-4444-4444-444444444444';
const _profileId = '33333333-3333-3333-3333-333333333333';
const _groupId = '55555555-5555-5555-5555-555555555555';
const _otherProfileId = '66666666-6666-6666-6666-666666666666';
const _settlementId = '77777777-7777-7777-7777-777777777777';
const _paymentId = '88888888-8888-8888-8888-888888888888';
const _recurringTemplateId = '99999999-9999-9999-9999-999999999999';
const _recurringOccurrenceId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const _ocrReviewId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const _receiptFileId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const _syncOperationId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
final _createdAtUtc = DateTime.utc(2026, 5, 18, 9);
final _updatedAtUtc = DateTime.utc(2026, 5, 18, 10);
