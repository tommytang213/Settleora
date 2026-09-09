import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/app_bootstrap.dart';
import 'package:mobile/app/app_configuration.dart';
import 'package:mobile/app/secure_storage.dart';
import 'package:mobile/app/server_mode_shell.dart';
import 'package:mobile/app/version_notes.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../helpers/settleora_visual_test_fonts.dart';
import '../server_mode_shell_dashboard_test.dart' as dashboard;

const _outputDirectory =
    '/workspace/logs/settleora-visual-qa/20260908-1556-issue-1092-whats-new';
const _captureKey = Key('version-notes-visual-capture');

void main() {
  testWidgets('captures automatic setup sign-in and local-only states', (
    tester,
  ) async {
    await _prepare(tester, width: 390, height: 844);

    await _pumpBootstrap(tester, storage: _VisualSecureStorage());
    expect(find.text('Settleora Setup'), findsOneWidget);
    expect(find.byType(SettleoraGuidanceContent), findsOneWidget);
    await _capture(tester, 'setup-unseen-whats-new-390x844-1x.png');
    await tester.tap(find.byKey(const Key('whats-new-close')));
    await tester.pumpAndSettle();
    await _capture(tester, 'setup-after-dismissal-390x844-1x.png');

    await _pumpBootstrap(
      tester,
      storage: _VisualSecureStorage(
        configuration: SettleoraAppConfiguration.server(
          serverBaseUri: Uri.parse('https://settleora.example/'),
        ),
      ),
    );
    expect(find.text('Sign in to Settleora'), findsOneWidget);
    expect(find.byType(SettleoraGuidanceContent), findsOneWidget);
    await _capture(tester, 'server-sign-in-unseen-whats-new-390x844-1x.png');

    await _pumpBootstrap(
      tester,
      storage: _VisualSecureStorage(
        configuration: const SettleoraAppConfiguration.local(),
      ),
    );
    expect(find.text('Local Mode'), findsOneWidget);
    expect(find.byType(SettleoraGuidanceContent), findsOneWidget);
    await _capture(tester, 'local-only-unseen-whats-new-390x844-1x.png');
    await tester.tap(find.byKey(const Key('whats-new-close')));
    await tester.pumpAndSettle();
    await _capture(tester, 'local-only-after-dismissal-390x844-1x.png');
  }, tags: ['visual']);

  testWidgets('captures authenticated settings launcher and manual reopen', (
    tester,
  ) async {
    await _prepare(tester, width: 390, height: 844);
    await tester.pumpWidget(
      RepaintBoundary(
        key: _captureKey,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: SettleoraTheme.midnight(),
          home: _buildShell(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bottom-nav-more')));
    await tester.pumpAndSettle();
    final moreScroll = find
        .descendant(
          of: find.byKey(const Key('server-shell-more-hub')),
          matching: find.byType(Scrollable),
        )
        .first;
    await tester.drag(moreScroll, const Offset(0, -600));
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const Key('server-shell-more-settings')),
    );
    await tester.tap(find.byKey(const Key('server-shell-more-settings')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('settings-whats-new')), findsOneWidget);
    await _capture(
      tester,
      'authenticated-settings-whats-new-entry-390x844-1x.png',
    );
    await tester.tap(find.byKey(const Key('settings-whats-new')));
    await tester.pumpAndSettle();
    expect(find.byType(SettleoraGuidanceContent), findsOneWidget);
    await _capture(
      tester,
      'authenticated-settings-whats-new-open-390x844-1x.png',
    );
  }, tags: ['visual']);

  testWidgets('captures long 320px 2x scrollable notes', (tester) async {
    await _prepare(tester, width: 320, height: 760);
    final notes = SettleoraBundledVersionNotes(
      releaseKey: '1.0.0+localized-preview',
      heading: "What's New in this longer localized Settleora release",
      description: 'Long localized description ' * 8,
      points: List.generate(
        8,
        (index) => 'Long localized product guidance point ${index + 1} ' * 5,
      ),
    );

    await tester.pumpWidget(
      RepaintBoundary(
        key: _captureKey,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: SettleoraTheme.midnight(),
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(2)),
            child: child!,
          ),
          home: SettleoraAppBootstrap(
            secureStorage: _VisualSecureStorage(),
            versionSeenPreference: _VisualVersionSeenPreference(),
            versionNotesProcessGuard: SettleoraVersionNotesProcessGuard(),
            versionNotes: notes,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(SettleoraGuidanceContent), findsOneWidget);
    expect(tester.takeException(), isNull);
    await _capture(tester, 'long-whats-new-320x760-2x-top.png');
    final sheetScroll = find
        .ancestor(
          of: find.byType(SettleoraGuidanceContent),
          matching: find.byType(SingleChildScrollView),
        )
        .first;
    await tester.scrollUntilVisible(
      find.textContaining('product guidance point 8').first,
      500,
      scrollable: find
          .descendant(of: sheetScroll, matching: find.byType(Scrollable))
          .first,
    );
    await tester.pumpAndSettle();
    await _capture(tester, 'long-whats-new-320x760-2x-close-reachable.png');
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

Future<void> _pumpBootstrap(
  WidgetTester tester, {
  required _VisualSecureStorage storage,
}) async {
  await tester.pumpWidget(
    RepaintBoundary(
      key: _captureKey,
      child: MaterialApp(
        key: UniqueKey(),
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.midnight(),
        home: SettleoraAppBootstrap(
          key: UniqueKey(),
          secureStorage: storage,
          versionSeenPreference: _VisualVersionSeenPreference(),
          versionNotesProcessGuard: SettleoraVersionNotesProcessGuard(),
        ),
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
    homeShortcutPreference: dashboard.FakeHomeShortcutPreference(),
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

class _VisualVersionSeenPreference implements SettleoraVersionSeenPreference {
  @override
  Future<String?> readSeenReleaseKey() async => null;

  @override
  Future<void> writeSeenReleaseKey(String releaseKey) async {}
}

class _VisualSecureStorage implements SettleoraSecureStorageBoundary {
  _VisualSecureStorage({this.configuration});

  SettleoraAppConfiguration? configuration;

  @override
  Future<void> clearServerSession() async {}

  @override
  Future<SettleoraAppConfiguration?> readAppConfiguration() async =>
      configuration;

  @override
  Future<SettleoraServerSessionMaterial?> readServerSession() async => null;

  @override
  Future<void> writeAppConfiguration(
    SettleoraAppConfiguration configuration,
  ) async => this.configuration = configuration;

  @override
  Future<void> writeServerSession(
    SettleoraServerSessionMaterial session,
  ) async {}
}
