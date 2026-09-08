import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/help/contextual_help.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_screen.dart';

import 'receipt_ocr_review_screen_test.dart' as ocr;
import 'server_mode_shell_dashboard_test.dart' as dashboard;

void main() {
  testWidgets('OCR queue help is provisional and has no OCR side effects', (
    tester,
  ) async {
    final repository = ocr.FakeReceiptOcrReviewRepository(
      listResponse: const [],
    );
    await tester.pumpWidget(
      MaterialApp(home: ReceiptOcrReviewQueueScreen(repository: repository)),
    );
    await tester.pumpAndSettle();
    final listCalls = repository.listCalls;

    await _openHelp(tester, SettleoraHelpTopic.ocrReview);
    final copy = settleoraHelpContent(
      SettleoraHelpTopic.ocrReview,
    ).points.join(' ');
    expect(copy, contains('should be reviewed against the receipt'));
    expect(copy, contains('existing guarded draft-only flow'));
    await _closeHelp(tester, SettleoraHelpTopic.ocrReview);

    expect(repository.listCalls, listCalls);
    expect(repository.getCalls, 0);
    expect(repository.saveCalls, 0);
    expect(repository.deleteCalls, 0);
    expect(repository.previewCalls, 0);
    expect(repository.applyCalls, 0);
  });

  testWidgets('OCR detail uses the same help without parser or apply work', (
    tester,
  ) async {
    final route = ocr.sampleRoute();
    final repository = ocr.FakeReceiptOcrReviewRepository(
      reviewResponse: ocr.sampleReview(route),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: ReceiptOcrReviewDetailScreen.forRoute(
          repository: repository,
          route: route,
        ),
      ),
    );
    await tester.pumpAndSettle();
    final getCalls = repository.getCalls;

    await _openHelp(tester, SettleoraHelpTopic.ocrReview);
    await _closeHelp(tester, SettleoraHelpTopic.ocrReview);

    expect(repository.getCalls, getCalls);
    expect(repository.saveCalls, 0);
    expect(repository.deleteCalls, 0);
    expect(repository.previewCalls, 0);
    expect(repository.applyCalls, 0);
  });

  testWidgets(
    'settings and backup help preserve security and non-mutating preview',
    (tester) async {
      final bills = dashboard.FakeBillRepository();
      final notifications = dashboard.FakeNotificationRepository();
      final settlements = dashboard.FakeSettlementRepository();
      final recurring = dashboard.FakeRecurringBillRepository();
      final backup = dashboard.FakeLocalDataBackupService();
      await dashboard.pumpShell(
        tester,
        billRepository: bills,
        notificationRepository: notifications,
        settlementRepository: settlements,
        recurringRepository: recurring,
        dataBackupService: backup,
      );
      final overviewReads = <int>[
        bills.listCalls,
        notifications.summaryCalls,
        settlements.listBalanceCalls,
        recurring.listForecastCalls,
      ];

      await tester.tap(
        dashboard.bottomNavDestination(const Key('bottom-nav-more')),
      );
      await tester.pumpAndSettle();
      await dashboard.scrollToAndTap(
        tester,
        const Key('server-shell-more-settings'),
      );
      await tester.pumpAndSettle();

      await _openHelp(tester, SettleoraHelpTopic.settingsSecurity);
      final settingsCopy = settleoraHelpContent(
        SettleoraHelpTopic.settingsSecurity,
      ).points.join(' ');
      expect(settingsCopy, contains('change security policy'));
      expect(settingsCopy, isNot(contains('token')));
      expect(settingsCopy, isNot(contains('secret')));
      await _closeHelp(tester, SettleoraHelpTopic.settingsSecurity);

      await _scrollTo(tester, const Key('contextual-help-backup-restore'));
      await _openHelp(tester, SettleoraHelpTopic.backupRestore);
      final backupCopy = settleoraHelpContent(
        SettleoraHelpTopic.backupRestore,
      ).points.join(' ');
      expect(backupCopy, contains('without overwriting local or server data'));
      expect(backupCopy, contains('Restore apply is disabled'));
      await _closeHelp(tester, SettleoraHelpTopic.backupRestore);

      expect(backup.buildCalls, 0);
      expect(backup.previewCalls, 0);
      expect(<int>[
        bills.listCalls,
        notifications.summaryCalls,
        settlements.listBalanceCalls,
        recurring.listForecastCalls,
      ], overviewReads);
    },
  );

  test('complete matrix is wired and isolated from release seen state', () {
    final topicSources = <String, String>{
      'firstLaunch': 'lib/app/setup_screen.dart',
      'dashboard': 'lib/app/server_mode_shell.dart',
      'bills': 'lib/bills/bill_list_screen.dart',
      'ocrReview': 'lib/receipt_ocr_review/receipt_ocr_review_screen.dart',
      'groups': 'lib/groups/group_list_screen.dart',
      'settlements': 'lib/settlements/settlement_list_screen.dart',
      'recurring': 'lib/recurring_bills/recurring_bill_screen.dart',
      'reportsSearch': 'lib/reports/monthly_report_screen.dart',
      'backupRestore': 'lib/app/server_mode_shell.dart',
      'settingsSecurity': 'lib/app/server_mode_shell.dart',
    };

    expect(topicSources.length, SettleoraHelpTopic.values.length);
    for (final entry in topicSources.entries) {
      expect(
        File(entry.value).readAsStringSync(),
        contains('SettleoraHelpTopic.${entry.key}'),
        reason: entry.value,
      );
    }

    final registrySource = File(
      'lib/help/contextual_help.dart',
    ).readAsStringSync();
    expect(registrySource, isNot(contains('SharedPreferences')));
    expect(registrySource, isNot(contains('SettleoraVersionNotes')));
    expect(registrySource, isNot(contains('markSeen')));
    expect(registrySource, isNot(contains('admin-maintenance')));
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

Future<void> _scrollTo(WidgetTester tester, Key key) async {
  final finder = find.byKey(key);
  await tester.dragUntilVisible(
    finder,
    find.byType(Scrollable).first,
    const Offset(0, -300),
  );
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
}
