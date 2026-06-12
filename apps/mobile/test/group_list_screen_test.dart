import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/settleora_api_client.dart';
import 'package:mobile/app/auth_session_repository.dart';
import 'package:mobile/app/secure_storage.dart';
import 'package:mobile/app/server_mode_shell.dart';
import 'package:mobile/bills/bill_repository.dart';
import 'package:mobile/bills/bill_sync_controller.dart';
import 'package:mobile/groups/group_list_screen.dart';
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
  testWidgets('group list renders empty state and creates a group', (
    tester,
  ) async {
    final repository = FakeGroupRepository(groups: const []);

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupListScreen(
          repository: repository,
          billRepository: FakeBillRepository(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('No groups'), findsOneWidget);
    expect(
      find.text(
        'Groups visible to this account will appear here. Create a group to start a shared bill flow.',
      ),
      findsOneWidget,
    );
    expect(find.byKey(const Key('group-list-empty-create')), findsOneWidget);
    expect(find.byKey(const Key('group-list-search')), findsNothing);
    expect(repository.listCalls, 1);

    await tester.tap(find.byKey(const Key('group-list-create')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('group-form-name')), 'House');
    await tester.tap(find.byKey(const Key('group-form-save')));
    await tester.pumpAndSettle();

    expect(repository.createCalls, 1);
    expect(repository.lastGroupSave?.name, 'House');
    expect(find.text('House'), findsOneWidget);
    expect(find.text('Group created.'), findsOneWidget);
  });

  testWidgets('group list can auto-open create dialog once', (tester) async {
    final repository = FakeGroupRepository(groups: const []);

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupListScreen(
          repository: repository,
          billRepository: FakeBillRepository(),
          openCreateOnStart: true,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Create Group'), findsOneWidget);
    expect(find.byKey(const Key('group-form-name')), findsOneWidget);
    expect(repository.listCalls, 1);
    expect(repository.createCalls, 0);

    await tester.tap(find.byKey(const Key('group-form-cancel')));
    await tester.pumpAndSettle();

    expect(repository.createCalls, 0);
    expect(find.text('Group created.'), findsNothing);
    expect(find.text('No groups'), findsOneWidget);

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupListScreen(
          repository: repository,
          billRepository: FakeBillRepository(),
          openCreateOnStart: true,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Create Group'), findsNothing);
    expect(repository.listCalls, 1);

    await tester.tap(find.byKey(const Key('group-list-create')));
    await tester.pumpAndSettle();

    expect(find.text('Create Group'), findsOneWidget);
  });

  testWidgets('group list auto-open create uses existing save behavior', (
    tester,
  ) async {
    final repository = FakeGroupRepository(groups: const []);

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupListScreen(
          repository: repository,
          billRepository: FakeBillRepository(),
          openCreateOnStart: true,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('group-form-name')), 'House');
    await tester.tap(find.byKey(const Key('group-form-save')));
    await tester.pumpAndSettle();

    expect(repository.createCalls, 1);
    expect(repository.lastGroupSave?.name, 'House');
    expect(find.text('House'), findsOneWidget);
    expect(find.text('Group created.'), findsOneWidget);

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupListScreen(
          repository: repository,
          billRepository: FakeBillRepository(),
          openCreateOnStart: true,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Create Group'), findsNothing);
    expect(repository.createCalls, 1);
  });

  testWidgets('group list search filters visible groups', (tester) async {
    final repository = FakeGroupRepository(groups: sampleGroupDiscoveryRows());

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupListScreen(
          repository: repository,
          billRepository: FakeBillRepository(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Trip Crew'), findsOneWidget);
    expect(find.text('Dinner Club'), findsOneWidget);
    expect(find.text('Archive Team'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('group-list-search')), 'club');
    await tester.pumpAndSettle();

    expect(find.text('Showing 1 of 3 groups'), findsOneWidget);
    expect(find.text('Dinner Club'), findsOneWidget);
    expect(find.text('Trip Crew'), findsNothing);
    expect(find.text('Archive Team'), findsNothing);
  });

  testWidgets('group list chip counts and role filtering use loaded fields', (
    tester,
  ) async {
    final repository = FakeGroupRepository(groups: sampleGroupDiscoveryRows());

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupListScreen(
          repository: repository,
          billRepository: FakeBillRepository(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Owner (2)'), findsOneWidget);
    expect(find.text('Member (1)'), findsOneWidget);
    expect(find.text('Active (2)'), findsOneWidget);
    expect(find.text('Removed (1)'), findsOneWidget);

    await tester.tap(
      find.byKey(
        const ValueKey(
          'group-list-role-filter-${SettleoraGroupRoleValues.member}',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Showing 1 of 3 groups'), findsOneWidget);
    expect(find.text('Dinner Club'), findsOneWidget);
    expect(find.text('Trip Crew'), findsNothing);
    expect(find.text('Archive Team'), findsNothing);
  });

  testWidgets('group list combines search and chip filters', (tester) async {
    final repository = FakeGroupRepository(groups: sampleGroupDiscoveryRows());

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupListScreen(
          repository: repository,
          billRepository: FakeBillRepository(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(
      find.byKey(
        const ValueKey(
          'group-list-status-filter-${SettleoraGroupMembershipStatusValues.active}',
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('group-list-search')),
      'dinner',
    );
    await tester.pumpAndSettle();

    expect(find.text('Showing 1 of 3 groups'), findsOneWidget);
    expect(find.text('Dinner Club'), findsOneWidget);
    expect(find.text('Trip Crew'), findsNothing);
    expect(find.text('Archive Team'), findsNothing);
  });

  testWidgets('group list clear resets search and filters', (tester) async {
    final repository = FakeGroupRepository(groups: sampleGroupDiscoveryRows());

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupListScreen(
          repository: repository,
          billRepository: FakeBillRepository(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(
      find.byKey(
        const ValueKey(
          'group-list-status-filter-${SettleoraGroupMembershipStatusValues.removed}',
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('group-list-search')),
      'archive',
    );
    await tester.pumpAndSettle();

    expect(find.text('Showing 1 of 3 groups'), findsOneWidget);
    expect(find.text('Archive Team'), findsOneWidget);

    await tester.tap(find.byKey(const Key('group-list-clear-filters')));
    await tester.pumpAndSettle();

    expect(find.text('Showing 3 of 3 groups'), findsOneWidget);
    expect(find.text('Trip Crew'), findsOneWidget);
    expect(find.text('Dinner Club'), findsOneWidget);
    expect(find.text('Archive Team'), findsOneWidget);
    expect(
      tester
          .widget<TextField>(find.byKey(const Key('group-list-search')))
          .controller
          ?.text,
      isEmpty,
    );
  });

  testWidgets('group list shows filtered empty state separately', (
    tester,
  ) async {
    final repository = FakeGroupRepository(groups: sampleGroupDiscoveryRows());

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupListScreen(
          repository: repository,
          billRepository: FakeBillRepository(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(
      find.byKey(
        const ValueKey(
          'group-list-role-filter-${SettleoraGroupRoleValues.member}',
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('group-list-search')), 'trip');
    await tester.pumpAndSettle();

    expect(find.text('No matching groups'), findsOneWidget);
    expect(
      find.text('No loaded groups match the current search or filters.'),
      findsOneWidget,
    );
    expect(find.text('No groups'), findsNothing);
  });

  testWidgets('group list opens detail and loads members', (tester) async {
    final repository = FakeGroupRepository(
      groups: [sampleGroup()],
      members: [sampleMember(displayName: 'Taylor')],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupListScreen(
          repository: repository,
          billRepository: FakeBillRepository(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Trip Crew'));
    await tester.pumpAndSettle();

    expect(repository.getCalls, 1);
    expect(repository.listMemberCalls, 1);
    expect(find.byKey(const Key('group-detail-bills-handoff')), findsOneWidget);
    expect(find.text('Shared bill workspace'), findsOneWidget);
    expect(
      find.textContaining('1 loaded member - Open group bills for Trip Crew'),
      findsOneWidget,
    );
    expect(find.text('Members'), findsOneWidget);
    expect(find.text('Taylor'), findsOneWidget);
    expect(visibleText(tester), isNot(contains(_profileId)));
  });

  testWidgets('group detail opens read-only group bills', (tester) async {
    final groupRepository = FakeGroupRepository(
      groups: [sampleGroup()],
      members: [sampleMember(displayName: 'Taylor')],
    );
    final billRepository = FakeBillRepository(
      groupBills: [sampleBillSummary()],
      detail: sampleBillDetail(),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupListScreen(
          repository: groupRepository,
          billRepository: billRepository,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Trip Crew'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('group-detail-bills')));
    await tester.pumpAndSettle();

    expect(find.text('Group bills'), findsWidgets);
    expect(find.text('Corner Market'), findsOneWidget);
    expect(billRepository.listGroupCalls, 1);
  });

  testWidgets('group detail member search filters by safe display name', (
    tester,
  ) async {
    final repository = FakeGroupRepository(
      group: sampleGroup(),
      members: sampleMemberDiscoveryRows(),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupDetailScreen(
          repository: repository,
          billRepository: FakeBillRepository(),
          groupId: _groupId,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Taylor'), findsOneWidget);
    expect(find.text('Morgan'), findsOneWidget);
    expect(find.text('Casey'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('group-member-search')), 'mor');
    await tester.pumpAndSettle();

    expect(find.text('Showing 1 of 3 members'), findsOneWidget);
    expect(find.text('Morgan'), findsOneWidget);
    expect(find.text('Taylor'), findsNothing);
    expect(find.text('Casey'), findsNothing);
    expect(visibleText(tester), isNot(contains(_profileId)));
  });

  testWidgets('group detail member role chip counts and filters', (
    tester,
  ) async {
    final repository = FakeGroupRepository(
      group: sampleGroup(),
      members: sampleMemberDiscoveryRows(),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupDetailScreen(
          repository: repository,
          billRepository: FakeBillRepository(),
          groupId: _groupId,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Owner (1)'), findsOneWidget);
    expect(find.text('Member (2)'), findsOneWidget);

    final ownerFilter = find.byKey(
      const ValueKey(
        'group-member-role-filter-${SettleoraGroupRoleValues.owner}',
      ),
    );
    await tester.ensureVisible(ownerFilter);
    await tester.pumpAndSettle();
    await tester.tap(ownerFilter);
    await tester.pumpAndSettle();

    expect(find.text('Showing 1 of 3 members'), findsOneWidget);
    expect(find.text('Taylor'), findsOneWidget);
    expect(find.text('Morgan'), findsNothing);
    expect(find.text('Casey'), findsNothing);
  });

  testWidgets('group detail member status chip counts and filters', (
    tester,
  ) async {
    final repository = FakeGroupRepository(
      group: sampleGroup(),
      members: sampleMemberDiscoveryRows(),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupDetailScreen(
          repository: repository,
          billRepository: FakeBillRepository(),
          groupId: _groupId,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Active (2)'), findsOneWidget);
    expect(find.text('Removed (1)'), findsOneWidget);

    final removedFilter = find.byKey(
      const ValueKey(
        'group-member-status-filter-${SettleoraGroupMembershipStatusValues.removed}',
      ),
    );
    await tester.ensureVisible(removedFilter);
    await tester.pumpAndSettle();
    await tester.tap(removedFilter);
    await tester.pumpAndSettle();

    expect(find.text('Showing 1 of 3 members'), findsOneWidget);
    expect(find.text('Casey'), findsOneWidget);
    expect(find.text('Taylor'), findsNothing);
    expect(find.text('Morgan'), findsNothing);
  });

  testWidgets('group detail combines member search role and status filters', (
    tester,
  ) async {
    final repository = FakeGroupRepository(
      group: sampleGroup(),
      members: sampleMemberDiscoveryRows(),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupDetailScreen(
          repository: repository,
          billRepository: FakeBillRepository(),
          groupId: _groupId,
        ),
      ),
    );
    await tester.pumpAndSettle();

    final memberFilter = find.byKey(
      const ValueKey(
        'group-member-role-filter-${SettleoraGroupRoleValues.member}',
      ),
    );
    await tester.ensureVisible(memberFilter);
    await tester.pumpAndSettle();
    await tester.tap(memberFilter);
    await tester.pumpAndSettle();
    final activeFilter = find.byKey(
      const ValueKey(
        'group-member-status-filter-${SettleoraGroupMembershipStatusValues.active}',
      ),
    );
    await tester.ensureVisible(activeFilter);
    await tester.pumpAndSettle();
    await tester.tap(activeFilter);
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('group-member-search')), 'mor');
    await tester.pumpAndSettle();

    expect(find.text('Showing 1 of 3 members'), findsOneWidget);
    expect(find.text('Morgan'), findsOneWidget);
    expect(find.text('Taylor'), findsNothing);
    expect(find.text('Casey'), findsNothing);
  });

  testWidgets('group detail member clear resets search and filters', (
    tester,
  ) async {
    final repository = FakeGroupRepository(
      group: sampleGroup(),
      members: sampleMemberDiscoveryRows(),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupDetailScreen(
          repository: repository,
          billRepository: FakeBillRepository(),
          groupId: _groupId,
        ),
      ),
    );
    await tester.pumpAndSettle();

    final removedFilter = find.byKey(
      const ValueKey(
        'group-member-status-filter-${SettleoraGroupMembershipStatusValues.removed}',
      ),
    );
    await tester.ensureVisible(removedFilter);
    await tester.pumpAndSettle();
    await tester.tap(removedFilter);
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('group-member-search')),
      'casey',
    );
    await tester.pumpAndSettle();

    expect(find.text('Showing 1 of 3 members'), findsOneWidget);
    expect(find.text('Casey'), findsOneWidget);

    final clearFilters = find.byKey(const Key('group-member-clear-filters'));
    await tester.ensureVisible(clearFilters);
    await tester.pumpAndSettle();
    await tester.tap(clearFilters);
    await tester.pumpAndSettle();

    expect(find.text('Showing 3 of 3 members'), findsOneWidget);
    expect(find.text('Taylor'), findsOneWidget);
    expect(find.text('Morgan'), findsOneWidget);
    expect(find.text('Casey'), findsOneWidget);
    expect(
      tester
          .widget<TextField>(find.byKey(const Key('group-member-search')))
          .controller
          ?.text,
      isEmpty,
    );
  });

  testWidgets('group detail separates filtered-empty from true-empty members', (
    tester,
  ) async {
    final emptyRepository = FakeGroupRepository(
      group: sampleGroup(),
      members: const [],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupDetailScreen(
          repository: emptyRepository,
          billRepository: FakeBillRepository(),
          groupId: _groupId,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('No members'), findsOneWidget);
    expect(find.byKey(const Key('group-member-search')), findsNothing);

    final filteredRepository = FakeGroupRepository(
      group: sampleGroup(),
      members: sampleMemberDiscoveryRows(),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupDetailScreen(
          key: UniqueKey(),
          repository: filteredRepository,
          billRepository: FakeBillRepository(),
          groupId: _groupId,
        ),
      ),
    );
    await tester.pumpAndSettle();
    final ownerFilter = find.byKey(
      const ValueKey(
        'group-member-role-filter-${SettleoraGroupRoleValues.owner}',
      ),
    );
    await tester.ensureVisible(ownerFilter);
    await tester.pumpAndSettle();
    await tester.tap(ownerFilter);
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('group-member-search')),
      'casey',
    );
    await tester.pumpAndSettle();

    expect(find.text('No matching members'), findsOneWidget);
    expect(
      find.text('No loaded members match the current search or filters.'),
      findsOneWidget,
    );
    expect(find.text('No members'), findsNothing);
  });

  testWidgets('group detail filtered actions target the visible member', (
    tester,
  ) async {
    final repository = FakeGroupRepository(
      group: sampleGroup(),
      members: sampleMemberDiscoveryRows(),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupDetailScreen(
          repository: repository,
          billRepository: FakeBillRepository(),
          groupId: _groupId,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('group-member-search')), 'mor');
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const ValueKey('group-member-actions-$_otherProfileId')),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const ValueKey('group-member-actions-$_otherProfileId')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Make Owner'));
    await tester.pumpAndSettle();

    expect(repository.updateMemberCalls, 1);
    expect(repository.lastUpdatedUserProfileId, _otherProfileId);
    expect(repository.lastMemberUpdate?.role, SettleoraGroupRoleValues.owner);

    await tester.ensureVisible(
      find.byKey(const ValueKey('group-member-actions-$_otherProfileId')),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const ValueKey('group-member-actions-$_otherProfileId')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Remove').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('group-member-remove-confirm')));
    await tester.pumpAndSettle();

    expect(repository.removeMemberCalls, 1);
    expect(repository.lastRemovedUserProfileId, _otherProfileId);
  });

  testWidgets('group detail edits group and manages members', (tester) async {
    final repository = FakeGroupRepository(
      group: sampleGroup(),
      members: [sampleMember(displayName: 'Taylor')],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupDetailScreen(
          repository: repository,
          billRepository: FakeBillRepository(),
          groupId: _groupId,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('group-detail-edit')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('group-form-name')),
      'Dinner Club',
    );
    await tester.tap(find.byKey(const Key('group-form-save')));
    await tester.pumpAndSettle();

    expect(repository.updateCalls, 1);
    expect(repository.lastGroupSave?.name, 'Dinner Club');
    expect(find.text('Dinner Club'), findsWidgets);

    await tester.enterText(
      find.byKey(const Key('group-member-profile-id')),
      _otherProfileId,
    );
    await tester.tap(find.byKey(const Key('group-member-add')));
    await tester.pumpAndSettle();

    expect(repository.addMemberCalls, 1);
    expect(repository.lastMemberAdd?.userProfileId, _otherProfileId);
    expect(find.text('Morgan'), findsOneWidget);

    await tester.ensureVisible(
      find.byKey(const ValueKey('group-member-actions-$_otherProfileId')),
    );
    await tester.drag(find.byType(ListView), const Offset(0, -96));
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const ValueKey('group-member-actions-$_otherProfileId')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Make Owner'));
    await tester.pumpAndSettle();

    expect(repository.updateMemberCalls, 1);
    expect(repository.lastMemberUpdate?.role, SettleoraGroupRoleValues.owner);

    await tester.ensureVisible(
      find.byKey(const ValueKey('group-member-actions-$_otherProfileId')),
    );
    await tester.drag(find.byType(ListView), const Offset(0, -96));
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const ValueKey('group-member-actions-$_otherProfileId')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Remove').last);
    await tester.pumpAndSettle();

    expect(find.text('Remove Member?'), findsOneWidget);
    expect(repository.removeMemberCalls, 0);

    await tester.tap(find.byKey(const Key('group-member-remove-confirm')));
    await tester.pumpAndSettle();

    expect(repository.removeMemberCalls, 1);
    expect(repository.lastRemovedUserProfileId, _otherProfileId);
    expect(find.text('Morgan'), findsNothing);
  });

  testWidgets('group screen shows bounded failures', (tester) async {
    final repository = FakeGroupRepository(
      listFailure: const SettleoraGroupFailure(
        kind: SettleoraGroupFailureKind.denied,
        message: 'Groups are not available to this account.',
        statusCode: 403,
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupListScreen(
          repository: repository,
          billRepository: FakeBillRepository(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Groups unavailable'), findsOneWidget);
    expect(
      find.text('Groups are not available to this account.'),
      findsOneWidget,
    );
    expect(visibleText(tester), isNot(contains('redacted-token')));
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('authenticated server shell opens groups', (tester) async {
    final groupRepository = FakeGroupRepository(groups: [sampleGroup()]);

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraAuthenticatedServerShell(
          currentUser: sampleCurrentUser(),
          receiptOcrReviewRepository: FakeReceiptOcrReviewRepository(),
          billRepository: FakeBillRepository(),
          settlementRepository: FakeSettlementRepository(),
          recurringBillRepository: FakeRecurringBillRepository(),
          groupRepository: groupRepository,
          notificationRepository: FakeNotificationRepository(),
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

    await tester.ensureVisible(find.byKey(const Key('server-shell-groups')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('server-shell-groups')));
    await tester.pumpAndSettle();

    expect(find.text('Groups'), findsWidgets);
    expect(find.text('Trip Crew'), findsOneWidget);
    expect(groupRepository.listCalls, 1);
  });
}

class FakeGroupRepository implements SettleoraGroupRepository {
  FakeGroupRepository({
    List<SettleoraGroup>? groups,
    SettleoraGroup? group,
    List<SettleoraGroupMember>? members,
    this.listFailure,
    this.detailFailure,
    this.actionFailure,
  }) : groups = groups ?? const [],
       group = group ?? sampleGroup(),
       members = members ?? const [];

  List<SettleoraGroup> groups;
  SettleoraGroup group;
  List<SettleoraGroupMember> members;
  final SettleoraGroupFailure? listFailure;
  final SettleoraGroupFailure? detailFailure;
  final SettleoraGroupFailure? actionFailure;
  int listCalls = 0;
  int createCalls = 0;
  int getCalls = 0;
  int updateCalls = 0;
  int listMemberCalls = 0;
  int addMemberCalls = 0;
  int updateMemberCalls = 0;
  int removeMemberCalls = 0;
  String? lastGroupId;
  String? lastUpdatedUserProfileId;
  String? lastRemovedUserProfileId;
  SettleoraGroupSaveRequest? lastGroupSave;
  SettleoraGroupMemberAddRequest? lastMemberAdd;
  SettleoraGroupMemberRoleUpdate? lastMemberUpdate;

  @override
  Future<List<SettleoraGroup>> listGroups() async {
    listCalls += 1;
    final failure = listFailure;
    if (failure != null) {
      throw failure;
    }

    return groups;
  }

  @override
  Future<SettleoraGroup> createGroup(SettleoraGroupSaveRequest request) async {
    createCalls += 1;
    lastGroupSave = request;
    _throwActionIfNeeded();
    final created = sampleGroup(name: request.name.trim());
    groups = [created, ...groups];
    return created;
  }

  @override
  Future<SettleoraGroup> getGroup(String groupId) async {
    getCalls += 1;
    lastGroupId = groupId;
    final failure = detailFailure;
    if (failure != null) {
      throw failure;
    }

    return group;
  }

  @override
  Future<SettleoraGroup> updateGroup(
    String groupId,
    SettleoraGroupSaveRequest request,
  ) async {
    updateCalls += 1;
    lastGroupId = groupId;
    lastGroupSave = request;
    _throwActionIfNeeded();
    group = sampleGroup(name: request.name.trim());
    return group;
  }

  @override
  Future<List<SettleoraGroupMember>> listGroupMembers(String groupId) async {
    listMemberCalls += 1;
    lastGroupId = groupId;
    final failure = detailFailure;
    if (failure != null) {
      throw failure;
    }

    return members;
  }

  @override
  Future<SettleoraGroupMember> addGroupMember(
    String groupId,
    SettleoraGroupMemberAddRequest request,
  ) async {
    addMemberCalls += 1;
    lastGroupId = groupId;
    lastMemberAdd = request;
    _throwActionIfNeeded();
    final member = sampleMember(
      userProfileId: request.userProfileId.trim(),
      displayName: 'Morgan',
      role: request.role,
    );
    members = [member, ...members];
    return member;
  }

  @override
  Future<SettleoraGroupMember> updateGroupMember(
    String groupId,
    String userProfileId,
    SettleoraGroupMemberRoleUpdate update,
  ) async {
    updateMemberCalls += 1;
    lastGroupId = groupId;
    lastUpdatedUserProfileId = userProfileId;
    lastMemberUpdate = update;
    _throwActionIfNeeded();
    final updated = sampleMember(
      userProfileId: userProfileId,
      displayName: 'Morgan',
      role: update.role,
    );
    members = [
      for (final member in members)
        if (member.userProfileId == userProfileId) updated else member,
    ];
    return updated;
  }

  @override
  Future<void> removeGroupMember(String groupId, String userProfileId) async {
    removeMemberCalls += 1;
    lastGroupId = groupId;
    lastRemovedUserProfileId = userProfileId;
    _throwActionIfNeeded();
    members = [
      for (final member in members)
        if (member.userProfileId != userProfileId) member,
    ];
  }

  void _throwActionIfNeeded() {
    final failure = actionFailure;
    if (failure != null) {
      throw failure;
    }
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
  FakeBillRepository({this.groupBills = const [], SettleoraBillDetail? detail})
    : detail = detail ?? sampleBillDetail();

  final List<SettleoraBillSummary> groupBills;
  final SettleoraBillDetail detail;
  int listGroupCalls = 0;
  int getGroupCalls = 0;

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
    return detail;
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
    listGroupCalls += 1;
    return groupBills;
  }

  @override
  Future<List<SettleoraBillSummary>> listPersonalBills({int limit = 50}) async {
    return const [];
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

List<SettleoraGroup> sampleGroupDiscoveryRows() {
  return [
    sampleGroup(id: _groupId, name: 'Trip Crew'),
    sampleGroup(
      id: '55555555-5555-5555-5555-555555555555',
      name: 'Dinner Club',
      role: SettleoraGroupRoleValues.member,
    ),
    sampleGroup(
      id: '66666666-6666-6666-6666-666666666666',
      name: 'Archive Team',
      status: SettleoraGroupMembershipStatusValues.removed,
    ),
  ];
}

List<SettleoraGroupMember> sampleMemberDiscoveryRows() {
  return [
    sampleMember(
      userProfileId: _profileId,
      displayName: 'Taylor',
      role: SettleoraGroupRoleValues.owner,
    ),
    sampleMember(userProfileId: _otherProfileId, displayName: 'Morgan'),
    sampleMember(
      userProfileId: '77777777-7777-7777-7777-777777777777',
      displayName: 'Casey',
      status: SettleoraGroupMembershipStatusValues.removed,
    ),
  ];
}

SettleoraGroup sampleGroup({
  String id = _groupId,
  String name = 'Trip Crew',
  String role = SettleoraGroupRoleValues.owner,
  String status = SettleoraGroupMembershipStatusValues.active,
}) {
  return SettleoraGroup(
    id: id,
    name: name,
    currentUserRole: role,
    currentUserStatus: status,
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

SettleoraGroupMember sampleMember({
  String userProfileId = _profileId,
  String displayName = 'Taylor',
  String role = SettleoraGroupRoleValues.member,
  String status = SettleoraGroupMembershipStatusValues.active,
}) {
  return SettleoraGroupMember(
    userProfileId: userProfileId,
    displayName: displayName,
    role: role,
    status: status,
    joinedAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

SettleoraBillSummary sampleBillSummary() {
  return SettleoraBillSummary(
    id: _billId,
    merchantName: 'Corner Market',
    billDate: '2026-05-17',
    status: 'draft',
    reconciliationStatus: 'unreconciled',
    totalAmount: '10.80',
    totalCurrency: 'USD',
    archiveState: SettleoraBillArchiveStateValues.active,
    itemCount: 1,
    participantCount: 1,
    payerCount: 1,
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
    displayNameFallback: 'Group bill',
  );
}

SettleoraBillDetail sampleBillDetail() {
  return SettleoraBillDetail(
    id: _billId,
    merchantName: 'Corner Market',
    billDate: '2026-05-17',
    status: 'draft',
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
    participants: const [
      SettleoraBillParticipant(
        userProfileId: _profileId,
        status: 'pending_acceptance',
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
    displayNameFallback: 'Group bill',
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

String visibleText(WidgetTester tester) {
  return tester
      .widgetList<Text>(find.byType(Text))
      .map((widget) => widget.data)
      .whereType<String>()
      .join('\n');
}

const _groupId = '11111111-1111-1111-1111-111111111111';
const _profileId = '22222222-2222-2222-2222-222222222222';
const _otherProfileId = '33333333-3333-3333-3333-333333333333';
const _billId = '44444444-4444-4444-4444-444444444444';
final _createdAtUtc = DateTime.utc(2026, 5, 18, 9);
final _updatedAtUtc = DateTime.utc(2026, 5, 18, 10);
