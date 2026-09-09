import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/home_shortcut_preferences.dart';
import 'package:mobile/app/server_mode_shell.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../helpers/settleora_visual_test_fonts.dart';
import '../server_mode_shell_dashboard_test.dart' as dashboard;

const _outputDir =
    '/workspace/logs/settleora-visual-qa/20260909-0934-issue-295-home-shortcuts';
const _captureKey = Key('issue-295-capture');

void main() {
  testWidgets('captures 390px Home shortcut states and settings', (
    tester,
  ) async {
    await _prepare(tester, logicalWidth: 390, devicePixelRatio: 1);

    await _pumpShell(tester, preference: _FakePreference());
    await _showHomeShortcut(tester, 'recurring_bills');
    await _capture(tester, '01-home-default-390x844-1x.png', 1);

    await _openMore(tester);
    await tester.scrollUntilVisible(
      find.byKey(const Key('server-shell-reports')),
      220,
      scrollable: _scrollableWithin(const Key('server-shell-more-hub')),
    );
    await tester.pumpAndSettle();
    await _capture(tester, '02-more-canonical-routes-390x844-1x.png', 1);

    await _openAppSettings(tester);
    await _capture(tester, '03-app-settings-row-390x844-1x.png', 1);
    await _openShortcutSheet(tester);
    await _capture(tester, '04-customization-default-390x844-1x.png', 1);

    await _pumpShell(
      tester,
      preference: _FakePreference(
        selection: const {
          ...settleoraDefaultHomeShortcuts,
          SettleoraHomeShortcut.receiptReviews,
        },
      ),
    );
    await _showHomeShortcut(tester, 'receipt_reviews');
    await _capture(tester, '05-home-add-receipts-390x844-1x.png', 1);

    await _pumpShell(
      tester,
      preference: _FakePreference(
        selection: const {
          ...settleoraDefaultHomeShortcuts,
          SettleoraHomeShortcut.reports,
        },
      ),
    );
    await _showHomeShortcut(tester, 'reports');
    await _capture(tester, '06-home-add-reports-390x844-1x.png', 1);

    await _pumpShell(
      tester,
      preference: _FakePreference(
        selection: const {SettleoraHomeShortcut.recurringBills},
      ),
    );
    await _showHomeShortcut(tester, 'recurring_bills');
    await _capture(tester, '07-home-notifications-hidden-390x844-1x.png', 1);

    await _pumpShell(
      tester,
      preference: _FakePreference(
        selection: settleoraHomeShortcutFixedOrder.toSet(),
      ),
    );
    await _showHomeShortcut(tester, 'reports');
    await _capture(tester, '08-home-all-four-390x844-1x.png', 1);

    await _pumpShell(tester, preference: _FakePreference(selection: const {}));
    await tester.scrollUntilVisible(
      find.byKey(const Key('server-shell-open-more-hub')),
      240,
      scrollable: _scrollableWithin(const Key('server-shell-home-scroll')),
    );
    await tester.pumpAndSettle();
    expect(find.text('Quick access'), findsNothing);
    await _capture(tester, '09-home-zero-390x844-1x.png', 1);

    await _pumpShell(tester, preference: _FakePreference(failNextWrite: true));
    await _openMore(tester);
    await _openAppSettings(tester);
    await _openShortcutSheet(tester);
    await tester.tap(find.byKey(const Key('home-shortcuts-toggle-reports')));
    await tester.pumpAndSettle();
    await _capture(tester, '10-save-failure-retry-390x844-1x.png', 1);

    await _pumpShell(
      tester,
      preference: _FakePreference(
        selection: settleoraHomeShortcutFixedOrder.toSet(),
      ),
    );
    await _showHomeShortcut(tester, 'notifications');
    await _focusWithin(
      tester,
      const Key('server-shell-home-shortcut-notifications'),
    );
    await _capture(tester, '11-focused-home-shortcut-390x844-1x.png', 1);

    await _openMore(tester);
    await _openAppSettings(tester);
    await _openShortcutSheet(tester);
    await _focusWithin(
      tester,
      const Key('home-shortcuts-toggle-notifications'),
    );
    await _capture(tester, '12-focused-customization-390x844-1x.png', 1);
  });

  testWidgets('captures 320px 2x all, customization, and failure states', (
    tester,
  ) async {
    await _prepare(tester, logicalWidth: 320, devicePixelRatio: 2);
    await _pumpShell(
      tester,
      preference: _FakePreference(
        selection: settleoraHomeShortcutFixedOrder.toSet(),
      ),
    );
    await _showHomeShortcut(tester, 'reports');
    await _capture(tester, '13-home-all-four-320x844-2x.png', 2);

    await _openMore(tester);
    await _openAppSettings(tester);
    await _openShortcutSheet(tester);
    await _capture(tester, '14-customization-all-four-320x844-2x.png', 2);

    await tester.tap(find.byKey(const Key('home-shortcuts-close')));
    await tester.pumpAndSettle();
    await _pumpShell(tester, preference: _FakePreference(failNextWrite: true));
    await _openMore(tester);
    await _openAppSettings(tester);
    await _openShortcutSheet(tester);
    await tester.tap(find.byKey(const Key('home-shortcuts-toggle-reports')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('home-shortcuts-retry')), findsOneWidget);
    await _capture(tester, '15-save-failure-320x844-2x.png', 2);
  });
}

Future<void> _prepare(
  WidgetTester tester, {
  required double logicalWidth,
  required double devicePixelRatio,
}) async {
  await tester.runAsync(() async {
    await loadSettleoraVisualTestFonts();
    await Directory(_outputDir).create(recursive: true);
  });
  tester.view.devicePixelRatio = devicePixelRatio;
  tester.view.physicalSize = Size(
    logicalWidth * devicePixelRatio,
    844 * devicePixelRatio,
  );
  addTearDown(tester.view.reset);
}

Future<void> _pumpShell(
  WidgetTester tester, {
  required _FakePreference preference,
}) async {
  await tester.pumpWidget(
    RepaintBoundary(
      key: _captureKey,
      child: MaterialApp(
        key: UniqueKey(),
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.midnight(),
        home: SettleoraAuthenticatedServerShell(
          currentUser: dashboard.sampleCurrentUser(),
          receiptOcrReviewRepository:
              dashboard.FakeReceiptOcrReviewRepository(),
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
          homeShortcutPreference: preference,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _showHomeShortcut(WidgetTester tester, String machineKey) async {
  expect(
    find.byKey(Key('server-shell-home-shortcut-$machineKey')),
    findsOneWidget,
  );
  await Scrollable.ensureVisible(
    tester.element(find.text('Quick access')),
    alignment: 0,
    duration: Duration.zero,
  );
  await tester.pumpAndSettle();
}

Future<void> _openMore(WidgetTester tester) async {
  await tester.tap(
    find.descendant(
      of: find.byKey(const Key('server-shell-bottom-nav')),
      matching: find.byKey(const Key('bottom-nav-more')),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _openAppSettings(WidgetTester tester) async {
  await tester.ensureVisible(
    find.byKey(const Key('server-shell-more-settings')),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('server-shell-more-settings')));
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.byKey(const Key('settings-home-shortcuts')));
  await tester.pumpAndSettle();
}

Future<void> _openShortcutSheet(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('settings-home-shortcuts')));
  await tester.pumpAndSettle();
}

Finder _scrollableWithin(Key key) =>
    find.descendant(of: find.byKey(key), matching: find.byType(Scrollable));

Future<void> _focusWithin(WidgetTester tester, Key targetKey) async {
  final target = find.byKey(targetKey).evaluate().single;
  for (var index = 0; index < 40; index += 1) {
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    final focusContext = FocusManager.instance.primaryFocus?.context;
    var isWithinTarget = focusContext == target;
    if (focusContext is Element && !isWithinTarget) {
      focusContext.visitAncestorElements((ancestor) {
        isWithinTarget = ancestor == target;
        return !isWithinTarget;
      });
    }
    if (isWithinTarget) {
      return;
    }
  }
  fail('Unable to focus ${targetKey.toString()}');
}

Future<void> _capture(
  WidgetTester tester,
  String fileName,
  double pixelRatio,
) async {
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.byKey(_captureKey),
    );
    final image = await boundary.toImage(pixelRatio: pixelRatio);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await File(
      '$_outputDir/$fileName',
    ).writeAsBytes(bytes!.buffer.asUint8List());
  });
}

class _FakePreference implements SettleoraHomeShortcutPreference {
  _FakePreference({
    Set<SettleoraHomeShortcut>? selection,
    this.failNextWrite = false,
  }) : selection = normalizeSettleoraHomeShortcuts(
         selection ?? settleoraDefaultHomeShortcuts,
       );

  Set<SettleoraHomeShortcut> selection;
  bool failNextWrite;

  @override
  Future<Set<SettleoraHomeShortcut>> readShownShortcuts() async => selection;

  @override
  Future<void> writeShownShortcuts(Set<SettleoraHomeShortcut> shortcuts) async {
    if (failNextWrite) {
      failNextWrite = false;
      throw StateError('private storage failure');
    }
    selection = normalizeSettleoraHomeShortcuts(shortcuts);
  }
}
