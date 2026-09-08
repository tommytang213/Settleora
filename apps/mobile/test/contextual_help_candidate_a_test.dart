import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/setup_screen.dart';
import 'package:mobile/help/contextual_help.dart';
import 'package:mobile/reports/monthly_report_screen.dart';
import 'package:mobile/reports/report_repository.dart';
import 'package:mobile/ui/settleora_components.dart';

import 'server_mode_shell_dashboard_test.dart' as dashboard;

void main() {
  test('registry contains the exact supported Day 1 mobile help matrix', () {
    const expectedKeys = <String>{
      'first-launch',
      'dashboard',
      'bills',
      'ocr-review',
      'groups',
      'settlements',
      'recurring',
      'reports-search',
      'backup-restore',
      'settings-security',
    };

    expect(
      SettleoraHelpTopic.values.map((topic) => topic.keyName).toSet(),
      expectedKeys,
    );
    expect(settleoraContextualHelpRegistry.length, expectedKeys.length);
    expect(
      settleoraContextualHelpRegistry.keys.toSet(),
      SettleoraHelpTopic.values.toSet(),
    );
    expect(expectedKeys, isNot(contains('admin-maintenance')));

    for (final topic in SettleoraHelpTopic.values) {
      final content = settleoraHelpContent(topic);
      expect(content.topic, topic);
      expect(
        content.contentVersion.trim(),
        matches(RegExp(r'^\d{4}-\d{2}-\d{2}\.\d+$')),
      );
      expect(content.sheetTitle.trim(), isNotEmpty);
      expect(content.heading.trim(), isNotEmpty);
      expect(content.description.trim(), isNotEmpty);
      expect(content.points, isNotEmpty);
      expect(content.points.every((point) => point.trim().isNotEmpty), isTrue);
      expect(content.entryLabel.trim(), isNotEmpty);
      expect(identical(content, settleoraHelpContent(topic)), isTrue);
    }

    final groups = settleoraHelpContent(SettleoraHelpTopic.groups);
    expect(groups.points, contains(contains('not available')));
    expect(groups.points.join(' '), isNot(contains('can appear')));
  });

  testWidgets(
    'setup help is pre-auth, dismissible, reopenable, and does not block save',
    (tester) async {
      var saveCalls = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraSetupScreen(
            onSaveConfiguration: (_) async {
              saveCalls += 1;
            },
          ),
        ),
      );

      final launcher = find.byKey(const Key('contextual-help-first-launch'));
      expect(launcher, findsOneWidget);
      expect(tester.getSize(launcher).width, greaterThanOrEqualTo(48));
      expect(tester.getSize(launcher).height, greaterThanOrEqualTo(48));
      expect(
        tester.widget<IconButton>(launcher).tooltip,
        'Help with Settleora setup',
      );

      await tester.tap(launcher);
      await tester.pumpAndSettle();
      expect(
        find.byKey(const Key('contextual-help-content-first-launch')),
        findsOneWidget,
      );
      expect(find.text('Choose how this device starts'), findsOneWidget);
      expect(saveCalls, 0);

      await tester.tapAt(const Offset(8, 220));
      await tester.pumpAndSettle();
      expect(find.byType(SettleoraGuidanceContent), findsNothing);
      expect(
        tester.widget<IconButton>(launcher).focusNode?.hasPrimaryFocus,
        isTrue,
      );

      await tester.tap(launcher);
      await tester.pumpAndSettle();
      final close = find.byKey(const Key('contextual-help-close-first-launch'));
      expect(tester.getSize(close).height, greaterThanOrEqualTo(48));
      await tester.tap(close);
      await tester.pumpAndSettle();
      expect(find.byType(SettleoraGuidanceContent), findsNothing);

      await tester.tap(find.text('Use local mode').first);
      await tester.pump();
      await tester.tap(find.byKey(const Key('setup-save')));
      await tester.pumpAndSettle();
      expect(saveCalls, 1);
    },
  );

  testWidgets('Home help opens without reloading overview repositories', (
    tester,
  ) async {
    final bills = dashboard.FakeBillRepository();
    final notifications = dashboard.FakeNotificationRepository();
    final settlements = dashboard.FakeSettlementRepository();
    final recurring = dashboard.FakeRecurringBillRepository();
    await dashboard.pumpShell(
      tester,
      billRepository: bills,
      notificationRepository: notifications,
      settlementRepository: settlements,
      recurringRepository: recurring,
    );
    final before = <int>[
      bills.listCalls,
      notifications.summaryCalls,
      settlements.listBalanceCalls,
      recurring.listForecastCalls,
    ];

    await tester.tap(find.byKey(const Key('contextual-help-dashboard')));
    await tester.pumpAndSettle();
    expect(
      find.byKey(const Key('contextual-help-content-dashboard')),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const Key('contextual-help-close-dashboard')));
    await tester.pumpAndSettle();

    expect(<int>[
      bills.listCalls,
      notifications.summaryCalls,
      settlements.listBalanceCalls,
      recurring.listForecastCalls,
    ], before);
  });

  testWidgets('report help is read-only and does not request another report', (
    tester,
  ) async {
    final repository = _PendingReportRepository();
    await tester.pumpWidget(
      MaterialApp(home: SettleoraMonthlyReportScreen(repository: repository)),
    );
    await tester.pump();
    expect(repository.calls, 1);

    await tester.tap(find.byKey(const Key('contextual-help-reports-search')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(
      find.byKey(const Key('contextual-help-content-reports-search')),
      findsOneWidget,
    );
    expect(find.textContaining('read-only monthly summary'), findsOneWidget);
    await tester.tap(
      find.byKey(const Key('contextual-help-close-reports-search')),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(repository.calls, 1);
  });

  testWidgets('help remains scrollable at 320px and 2x text scale', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 760);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        home: MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(2)),
          child: Scaffold(
            appBar: AppBar(
              actions: const [
                SettleoraContextualHelpAction(topic: SettleoraHelpTopic.bills),
              ],
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.byKey(const Key('contextual-help-bills')));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.byType(SingleChildScrollView), findsOneWidget);
    await tester.scrollUntilVisible(
      find.byKey(const Key('contextual-help-close-bills')),
      120,
      scrollable: find.byType(Scrollable).last,
    );
    expect(tester.takeException(), isNull);
  });
}

class _PendingReportRepository implements SettleoraMonthlyReportRepository {
  final Completer<SettleoraMonthlyReport> _completer = Completer();
  int calls = 0;

  @override
  Future<SettleoraMonthlyReport> getMonthlyReport({
    required String month,
    String? groupId,
  }) {
    calls += 1;
    return _completer.future;
  }
}
