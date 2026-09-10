import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/.dart_tool/flutter_gen/gen_l10n/app_localizations.dart';
import 'package:mobile/app/server_mode_shell.dart';
import 'package:mobile/app/setup_screen.dart';
import 'package:mobile/help/contextual_help.dart';
import 'package:mobile/reports/monthly_report_screen.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../helpers/settleora_visual_test_fonts.dart';
import '../server_mode_shell_dashboard_test.dart' as dashboard;

const _outputDirectory =
    '/workspace/logs/issue-1181-contextual-help-localization/visual-evidence/candidate-a';
const _captureKey = Key('contextual-help-candidate-a-capture');

void main() {
  testWidgets('captures setup launcher and open help', (tester) async {
    await _prepare(tester, width: 390, height: 844);
    await _pump(
      tester,
      SettleoraSetupScreen(onSaveConfiguration: (_) async {}),
    );
    await _capture(tester, 'setup-help-entry-390x844-1x.png');
    await tester.tap(find.byKey(const Key('contextual-help-first-launch')));
    await tester.pumpAndSettle();
    await _capture(tester, 'setup-help-open-390x844-1x.png');
  }, tags: ['visual']);

  testWidgets('captures Home launcher and open help', (tester) async {
    await _prepare(tester, width: 390, height: 844);
    await _pump(tester, _buildShell());
    await _capture(tester, 'home-help-entry-390x844-1x.png');
    await tester.tap(find.byKey(const Key('contextual-help-dashboard')));
    await tester.pumpAndSettle();
    await _capture(tester, 'home-help-open-390x844-1x.png');
  }, tags: ['visual']);

  testWidgets('captures reports launcher and open help', (tester) async {
    await _prepare(tester, width: 390, height: 844);
    await _pump(
      tester,
      SettleoraMonthlyReportScreen(
        repository: dashboard.FakeMonthlyReportRepository(),
      ),
    );
    await _capture(tester, 'reports-help-entry-390x844-1x.png');
    await tester.tap(find.byKey(const Key('contextual-help-reports-search')));
    await tester.pumpAndSettle();
    await _capture(tester, 'reports-help-open-390x844-1x.png');
  }, tags: ['visual']);

  testWidgets('captures contextual help at 320px and 2x text scale', (
    tester,
  ) async {
    final previousHighlightStrategy = FocusManager.instance.highlightStrategy;
    FocusManager.instance.highlightStrategy =
        FocusHighlightStrategy.alwaysTraditional;
    addTearDown(() {
      FocusManager.instance.highlightStrategy = previousHighlightStrategy;
    });
    await _prepare(tester, width: 320, height: 760);
    await tester.pumpWidget(
      RepaintBoundary(
        key: _captureKey,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: SettleoraTheme.midnight(),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(2)),
            child: child!,
          ),
          home: Scaffold(
            appBar: AppBar(
              title: const Text('Bills'),
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
    await _capture(tester, 'help-long-copy-320x760-2x.png');
    final close = find.byKey(const Key('contextual-help-close-bills'));
    await tester.scrollUntilVisible(
      close,
      120,
      scrollable: find.byType(Scrollable).last,
    );
    await _capture(tester, 'help-long-copy-close-320x760-2x.png');
    await tester.tap(close);
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<IconButton>(find.byKey(const Key('contextual-help-bills')))
          .focusNode
          ?.hasPrimaryFocus,
      isTrue,
    );
    await _capture(tester, 'help-focus-return-320x760-2x.png');
  }, tags: ['visual']);
}

Future<void> _prepare(
  WidgetTester tester, {
  required double width,
  required double height,
}) async {
  await tester.runAsync(() async {
    await loadSettleoraVisualTestFonts();
    await Directory(_outputDirectory).create(recursive: true);
  });
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Future<void> _pump(WidgetTester tester, Widget home) async {
  await tester.pumpWidget(
    RepaintBoundary(
      key: _captureKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.midnight(),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: home,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

SettleoraAuthenticatedServerShell _buildShell() {
  return SettleoraAuthenticatedServerShell(
    currentUser: dashboard.sampleCurrentUser(),
    receiptOcrReviewRepository: dashboard.FakeReceiptOcrReviewRepository(),
    billRepository: dashboard.FakeBillRepository(),
    settlementRepository: dashboard.FakeSettlementRepository(),
    recurringBillRepository: dashboard.FakeRecurringBillRepository(),
    groupRepository: dashboard.FakeGroupRepository(),
    notificationRepository: dashboard.FakeNotificationRepository(),
    reportRepository: dashboard.FakeMonthlyReportRepository(),
    profileRepository: dashboard.FakeProfileRepository(),
    billSyncController: dashboard.sampleBillSyncController(),
    authRepository: dashboard.FakeAuthRepository(),
    accessTokenProvider: dashboard.FakeAccessTokenProvider(),
    onSessionEnded: (_) async {},
  );
}

Future<void> _capture(WidgetTester tester, String name) async {
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.byKey(_captureKey),
    );
    final image = await boundary.toImage(pixelRatio: 1);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await File(
      '$_outputDirectory/$name',
    ).writeAsBytes(bytes!.buffer.asUint8List());
  });
}
