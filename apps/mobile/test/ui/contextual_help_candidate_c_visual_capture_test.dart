import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/server_mode_shell.dart';
import 'package:mobile/help/contextual_help.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_screen.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../helpers/settleora_visual_test_fonts.dart';
import '../receipt_ocr_review_screen_test.dart' as ocr;
import '../server_mode_shell_dashboard_test.dart' as dashboard;

const _outputDirectory =
    '/workspace/logs/settleora-visual-qa/20260908-1952-issue-1093/candidate-c';
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
}

Future<void> _prepare(WidgetTester tester) async {
  await tester.runAsync(() async {
    await loadSettleoraVisualTestFonts();
    await Directory(_outputDirectory).create(recursive: true);
  });
  tester.view.physicalSize = const Size(390, 844);
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
    onSessionEnded: (_) async {},
  );
}

Future<void> _capturePair(
  WidgetTester tester,
  SettleoraHelpTopic topic,
  String stem,
) async {
  await _capture(tester, '$stem-help-entry-390x844-1x.png');
  await tester.tap(find.byKey(Key('contextual-help-${topic.keyName}')));
  await tester.pumpAndSettle();
  await _capture(tester, '$stem-help-open-390x844-1x.png');
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
