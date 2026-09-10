import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/.dart_tool/flutter_gen/gen_l10n/app_localizations.dart';
import 'package:mobile/app/server_mode_shell.dart';
import 'package:mobile/help/contextual_help.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_screen.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../helpers/settleora_visual_test_fonts.dart';
import '../receipt_ocr_review_screen_test.dart' as ocr;
import '../server_mode_shell_dashboard_test.dart' as dashboard;

const _outputDirectory =
    '/workspace/logs/issue-1181-contextual-help-localization/visual-evidence/candidate-c';
const _captureKey = Key('contextual-help-candidate-c-capture');

void main() {
  testWidgets('captures OCR queue contextual help', (tester) async {
    await _prepare(tester);
    await _pump(
      tester,
      ReceiptOcrReviewQueueScreen(
        repository: ocr.FakeReceiptOcrReviewRepository(
          listResponse: [ocr.sampleSummary()],
        ),
      ),
    );
    await _capturePair(tester, SettleoraHelpTopic.ocrReview, 'ocr-queue');
  }, tags: ['visual']);

  testWidgets('captures OCR detail contextual help', (tester) async {
    await _prepare(tester);
    final route = ocr.sampleRoute();
    await _pump(
      tester,
      ReceiptOcrReviewDetailScreen.forRoute(
        repository: ocr.FakeReceiptOcrReviewRepository(
          reviewResponse: ocr.sampleReview(route),
        ),
        route: route,
      ),
    );
    await _capturePair(tester, SettleoraHelpTopic.ocrReview, 'ocr-detail');
  }, tags: ['visual']);

  testWidgets('captures settings and backup contextual help', (tester) async {
    await _prepare(tester);
    await _pump(tester, _buildShell());
    await tester.tap(
      dashboard.bottomNavDestination(const Key('bottom-nav-more')),
    );
    await tester.pumpAndSettle();
    await dashboard.scrollToAndTap(
      tester,
      const Key('server-shell-more-settings'),
    );
    await tester.pumpAndSettle();

    await _capturePair(
      tester,
      SettleoraHelpTopic.settingsSecurity,
      'settings-security',
    );
    await _scrollTo(tester, const Key('contextual-help-backup-restore'));
    await _capturePair(
      tester,
      SettleoraHelpTopic.backupRestore,
      'backup-restore',
    );
  }, tags: ['visual']);

  testWidgets('captures OCR help at 320px and 2x text scale', (tester) async {
    await _prepare(tester, width: 320, height: 760);
    await _pump(
      tester,
      ReceiptOcrReviewQueueScreen(
        repository: ocr.FakeReceiptOcrReviewRepository(
          listResponse: [ocr.sampleSummary()],
        ),
      ),
      textScaler: const TextScaler.linear(2),
    );
    await _capturePair(
      tester,
      SettleoraHelpTopic.ocrReview,
      'ocr-queue',
      captureClose: true,
      dimensions: '320x760-2x',
    );
  }, tags: ['visual']);

  testWidgets('captures settings help at 320px and 2x text scale', (
    tester,
  ) async {
    await _prepare(tester, width: 320, height: 760);
    await _pump(tester, _buildShell(), textScaler: const TextScaler.linear(2));
    await tester.tap(
      dashboard.bottomNavDestination(const Key('bottom-nav-more')),
    );
    await tester.pumpAndSettle();
    await dashboard.scrollToAndTap(
      tester,
      const Key('server-shell-more-settings'),
    );
    await tester.pumpAndSettle();
    await _capturePair(
      tester,
      SettleoraHelpTopic.settingsSecurity,
      'settings-security',
      captureClose: true,
      dimensions: '320x760-2x',
    );
  }, tags: ['visual']);
}

Future<void> _prepare(
  WidgetTester tester, {
  double width = 390,
  double height = 844,
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

Future<void> _pump(
  WidgetTester tester,
  Widget home, {
  TextScaler textScaler = TextScaler.noScaling,
}) async {
  await tester.pumpWidget(
    RepaintBoundary(
      key: _captureKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.midnight(),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: textScaler),
          child: child!,
        ),
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
    dataBackupService: dashboard.FakeLocalDataBackupService(),
    authRepository: dashboard.FakeAuthRepository(),
    accessTokenProvider: dashboard.FakeAccessTokenProvider(),
    homeShortcutPreference: dashboard.FakeHomeShortcutPreference(),
    onSessionEnded: (_) async {},
  );
}

Future<void> _capturePair(
  WidgetTester tester,
  SettleoraHelpTopic topic,
  String stem, {
  bool captureClose = false,
  String dimensions = '390x844-1x',
}) async {
  await _capture(tester, '$stem-help-entry-$dimensions.png');
  await tester.tap(find.byKey(Key('contextual-help-${topic.keyName}')));
  await tester.pumpAndSettle();
  await _capture(tester, '$stem-help-open-$dimensions.png');
  if (captureClose) {
    await tester.scrollUntilVisible(
      find.byKey(Key('contextual-help-close-${topic.keyName}')),
      120,
      scrollable: find.byType(Scrollable).last,
    );
    await _capture(tester, '$stem-help-close.png');
  }
  await tester.tap(find.byKey(Key('contextual-help-close-${topic.keyName}')));
  await tester.pumpAndSettle();
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
