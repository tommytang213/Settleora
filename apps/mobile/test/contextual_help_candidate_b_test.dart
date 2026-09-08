import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/groups/group_list_screen.dart';
import 'package:mobile/help/contextual_help.dart';
import 'package:mobile/recurring_bills/recurring_bill_screen.dart';
import 'package:mobile/settlements/settlement_list_screen.dart';

import 'bill_list_screen_test.dart' as bills;
import 'group_bill_list_screen_test.dart' as group_bills;
import 'group_list_screen_test.dart' as groups;
import 'recurring_bill_screen_test.dart' as recurring;
import 'settlement_list_screen_test.dart' as settlements;

void main() {
  testWidgets('bills help matches its topic and has no bill side effects', (
    tester,
  ) async {
    final repository = bills.FakeBillRepository();
    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          syncController: bills.sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final listCalls = repository.listCalls;

    await _openHelp(tester, SettleoraHelpTopic.bills);
    expect(
      settleoraHelpContent(SettleoraHelpTopic.bills).points.join(' '),
      contains('Receipt warnings and OCR suggestions are review signals'),
    );
    expect(repository.listCalls, listCalls);
    expect(repository.createCalls, 0);
    expect(repository.groupCreateCalls, 0);
    expect(repository.submitGroupCalls, 0);

    await tester.tapAt(const Offset(8, 220));
    await tester.pumpAndSettle();
    await _openHelp(tester, SettleoraHelpTopic.bills);
    await _closeHelp(tester, SettleoraHelpTopic.bills);
    expect(repository.listCalls, listCalls);
  });

  testWidgets('groups help preserves server authorization boundaries', (
    tester,
  ) async {
    final repository = groups.FakeGroupRepository();
    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupListScreen(
          repository: repository,
          billRepository: groups.FakeBillRepository(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final listCalls = repository.listCalls;

    await _openHelp(tester, SettleoraHelpTopic.groups);
    final copy = settleoraHelpContent(
      SettleoraHelpTopic.groups,
    ).points.join(' ');
    expect(copy, contains('does not grant authorization'));
    expect(copy, contains('not available'));
    await _closeHelp(tester, SettleoraHelpTopic.groups);

    expect(repository.listCalls, listCalls);
    expect(repository.createCalls, 0);
    expect(repository.updateCalls, 0);
    expect(repository.addMemberCalls, 0);
    expect(repository.updateMemberCalls, 0);
    expect(repository.removeMemberCalls, 0);
  });

  testWidgets('group bill list uses the same bills help topic', (tester) async {
    final repository = group_bills.FakeBillRepository();
    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupBillListScreen(
          repository: repository,
          groupRepository: group_bills.FakeGroupRepository(),
          groupId: 'group-1',
          groupName: 'Trip Crew',
        ),
      ),
    );
    await tester.pumpAndSettle();
    final listCalls = repository.listGroupCalls;

    await _openHelp(tester, SettleoraHelpTopic.bills);
    await _closeHelp(tester, SettleoraHelpTopic.bills);

    expect(repository.listGroupCalls, listCalls);
    expect(repository.createGroupCalls, 0);
  });

  testWidgets(
    'settlements help is descriptive and has no payment side effects',
    (tester) async {
      final repository = settlements.FakeSettlementRepository();
      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraSettlementListScreen(
            repository: repository,
            currentUserProfileId: 'current-user',
          ),
        ),
      );
      await tester.pumpAndSettle();
      final reads = <int>[
        repository.listBalancesCalls,
        repository.listRequestsCalls,
      ];

      await _openHelp(tester, SettleoraHelpTopic.settlements);
      expect(
        settleoraHelpContent(SettleoraHelpTopic.settlements).points.join(' '),
        contains('not a recommendation to send, accept, or confirm a payment'),
      );
      await _closeHelp(tester, SettleoraHelpTopic.settlements);

      expect(<int>[
        repository.listBalancesCalls,
        repository.listRequestsCalls,
      ], reads);
      expect(repository.cancelRequestCalls, 0);
      expect(repository.disputeRequestCalls, 0);
      expect(repository.markPaymentPaidCalls, 0);
      expect(repository.confirmPaymentCalls, 0);
      expect(repository.cancelPaymentCalls, 0);
      expect(repository.disputePaymentCalls, 0);
      expect(repository.confirmResidualCalls, 0);
    },
  );

  testWidgets('recurring help preserves forecast and confirmation meaning', (
    tester,
  ) async {
    final repository = recurring.FakeRecurringBillRepository();
    await tester.pumpWidget(
      MaterialApp(home: SettleoraRecurringBillScreen(repository: repository)),
    );
    await tester.pumpAndSettle();
    final reads = <int>[repository.listTemplateCalls, repository.forecastCalls];

    await _openHelp(tester, SettleoraHelpTopic.recurring);
    final copy = settleoraHelpContent(
      SettleoraHelpTopic.recurring,
    ).points.join(' ');
    expect(copy, contains('Forecast entries are derived planning views'));
    expect(copy, contains('confirmation remain separate'));
    await _closeHelp(tester, SettleoraHelpTopic.recurring);

    expect(<int>[
      repository.listTemplateCalls,
      repository.forecastCalls,
    ], reads);
    expect(repository.createTemplateCalls, 0);
    expect(repository.updateTemplateCalls, 0);
    expect(repository.pauseTemplateCalls, 0);
    expect(repository.resumeTemplateCalls, 0);
    expect(repository.archiveTemplateCalls, 0);
    expect(repository.generateDraftCalls, 0);
  });
}

Future<void> _openHelp(WidgetTester tester, SettleoraHelpTopic topic) async {
  final launcher = find.byKey(Key('contextual-help-${topic.keyName}'));
  expect(launcher, findsOneWidget);
  expect(tester.getSize(launcher).width, greaterThanOrEqualTo(48));
  expect(tester.getSize(launcher).height, greaterThanOrEqualTo(48));
  expect(
    tester.widget<IconButton>(launcher).tooltip,
    settleoraHelpContent(topic).entryLabel,
  );
  await tester.tap(launcher);
  await tester.pumpAndSettle();
  expect(
    find.byKey(Key('contextual-help-content-${topic.keyName}')),
    findsOneWidget,
  );
  expect(find.text(settleoraHelpContent(topic).heading), findsOneWidget);
}

Future<void> _closeHelp(WidgetTester tester, SettleoraHelpTopic topic) async {
  await tester.tap(find.byKey(Key('contextual-help-close-${topic.keyName}')));
  await tester.pumpAndSettle();
  expect(
    tester
        .widget<IconButton>(find.byKey(Key('contextual-help-${topic.keyName}')))
        .focusNode
        ?.hasPrimaryFocus,
    isTrue,
  );
}
