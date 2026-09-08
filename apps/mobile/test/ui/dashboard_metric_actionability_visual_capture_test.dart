import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/server_mode_shell.dart';
import 'package:mobile/notifications/notification_repository.dart';
import 'package:mobile/settlements/settlement_repository.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../helpers/settleora_visual_test_fonts.dart';
import '../server_mode_shell_dashboard_test.dart' as dashboard;

const _visualOutputDir =
    '/workspace/logs/settleora-visual-qa/20260909-0108-issue-299-dashboard-metric-actionability';
const _captureKey = Key('dashboard-metric-actionability-capture');

void main() {
  testWidgets('captures dashboard metric actionability production widgets', (
    tester,
  ) async {
    await tester.runAsync(() async {
      await loadSettleoraVisualTestFonts();
      await Directory(_visualOutputDir).create(recursive: true);
    });

    await _setViewport(tester, logicalWidth: 390, devicePixelRatio: 1);
    await _pumpCandidate(tester, populated: true);
    await _capture(tester, 'home-nonzero-390x844-1x.png', pixelRatio: 1);

    await _focusAction(
      tester,
      find.byKey(const Key('dashboard-active-bills-action')),
    );
    await _capture(
      tester,
      'home-active-bills-focused-390x844-1x.png',
      pixelRatio: 1,
    );

    await _pumpCandidate(tester, populated: true);
    await _focusAction(
      tester,
      find.byKey(const Key('dashboard-outgoing-settlements-action')),
    );
    await _capture(
      tester,
      'home-money-summary-focused-390x844-1x.png',
      pixelRatio: 1,
    );

    await _pumpCandidate(tester, populated: true);
    await tester.tap(find.byKey(const Key('dashboard-active-bills-action')));
    await tester.pumpAndSettle();
    expect(_selectedFilter('bill-list-filter-active'), isTrue);
    await _capture(tester, 'bills-active-390x844-1x.png', pixelRatio: 1);

    await _pumpCandidate(tester, populated: true);
    await tester.tap(
      find.byKey(const Key('dashboard-unread-notifications-action')),
    );
    await tester.pumpAndSettle();
    expect(_selectedFilter('notification-filter-unread'), isTrue);
    await _capture(
      tester,
      'notifications-unread-390x844-1x.png',
      pixelRatio: 1,
    );

    await _pumpCandidate(tester, populated: true);
    await tester.ensureVisible(
      find.byKey(const Key('dashboard-outgoing-settlements-action')),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const Key('dashboard-outgoing-settlements-action')),
    );
    await tester.pumpAndSettle();
    expect(_selectedFilter('settlement-list-filter-outgoing'), isTrue);
    await _capture(
      tester,
      'settlements-outgoing-390x844-1x.png',
      pixelRatio: 1,
    );

    await _pumpCandidate(tester, populated: true);
    await tester.ensureVisible(
      find.byKey(const Key('dashboard-incoming-settlements-action')),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const Key('dashboard-incoming-settlements-action')),
    );
    await tester.pumpAndSettle();
    expect(_selectedFilter('settlement-list-filter-incoming'), isTrue);
    await _capture(
      tester,
      'settlements-incoming-390x844-1x.png',
      pixelRatio: 1,
    );

    await _pumpCandidate(tester, populated: false);
    await _capture(tester, 'home-zero-390x844-1x.png', pixelRatio: 1);

    await _setViewport(tester, logicalWidth: 320, devicePixelRatio: 2);
    await _pumpCandidate(tester, populated: true);
    await _capture(tester, 'home-nonzero-320x844-2x.png', pixelRatio: 2);
    await tester.tap(find.byKey(const Key('dashboard-active-bills-action')));
    await tester.pumpAndSettle();
    expect(_selectedFilter('bill-list-filter-active'), isTrue);
    await _capture(tester, 'bills-active-320x844-2x.png', pixelRatio: 2);
  });
}

bool _selectedFilter(String key) {
  final chip = find.byKey(Key(key)).evaluate().single.widget as FilterChip;
  return chip.selected;
}

Future<void> _setViewport(
  WidgetTester tester, {
  required double logicalWidth,
  required double devicePixelRatio,
}) async {
  tester.view.devicePixelRatio = devicePixelRatio;
  tester.view.physicalSize = Size(
    logicalWidth * devicePixelRatio,
    844 * devicePixelRatio,
  );
  addTearDown(tester.view.reset);
}

Future<void> _pumpCandidate(
  WidgetTester tester, {
  required bool populated,
}) async {
  FocusManager.instance.primaryFocus?.unfocus();
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump();
  await tester.pumpWidget(
    RepaintBoundary(
      key: _captureKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.light(),
        home: SettleoraAuthenticatedServerShell(
          currentUser: dashboard.sampleCurrentUser(),
          receiptOcrReviewRepository:
              dashboard.FakeReceiptOcrReviewRepository(),
          billRepository: dashboard.FakeBillRepository(
            bills: populated ? [dashboard.sampleBill()] : const [],
          ),
          settlementRepository: dashboard.FakeSettlementRepository(
            balances: populated
                ? [
                    dashboard.sampleBalance(),
                    dashboard.sampleBalance(
                      direction:
                          SettleoraSettlementBalanceDirectionValues.incoming,
                      amount: '18.00',
                    ),
                  ]
                : const [],
            requests: populated
                ? [
                    dashboard.sampleSettlementRequest(),
                    dashboard.sampleSettlementRequest(
                      id: 'visual-incoming-request',
                      debtorUserProfileId: 'visual-counterparty',
                      creditorUserProfileId: 'profile-1',
                      amount: '18.00',
                    ),
                  ]
                : const [],
          ),
          recurringBillRepository: dashboard.FakeRecurringBillRepository(
            forecast: populated ? [dashboard.sampleOccurrence()] : const [],
          ),
          groupRepository: dashboard.FakeGroupRepository(),
          notificationRepository: dashboard.FakeNotificationRepository(
            summary: populated
                ? const SettleoraNotificationSummary(
                    unreadCount: 1,
                    attentionCount: 1,
                    urgentCount: 1,
                  )
                : const SettleoraNotificationSummary(
                    unreadCount: 0,
                    attentionCount: 0,
                    urgentCount: 0,
                  ),
            notifications: populated
                ? [dashboard.sampleNotification()]
                : const [],
          ),
          reportRepository: dashboard.FakeMonthlyReportRepository(),
          profileRepository: dashboard.FakeProfileRepository(),
          billSyncController: dashboard.sampleBillSyncController(),
          authRepository: dashboard.FakeAuthRepository(),
          accessTokenProvider: dashboard.FakeAccessTokenProvider(),
          onSessionEnded: (_) async {},
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _focusAction(WidgetTester tester, Finder action) async {
  for (var index = 0; index < 20; index += 1) {
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    final focusContext = FocusManager.instance.primaryFocus?.context;
    if (focusContext == null) {
      continue;
    }
    final focusFinder = find.byElementPredicate(
      (element) => identical(element, focusContext),
    );
    if (find
        .ancestor(of: focusFinder, matching: action)
        .evaluate()
        .isNotEmpty) {
      await tester.pumpAndSettle();
      return;
    }
  }
  fail('Could not focus the requested dashboard action.');
}

Future<void> _capture(
  WidgetTester tester,
  String fileName, {
  required double pixelRatio,
}) async {
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.byKey(_captureKey),
    );
    final image = await boundary.toImage(pixelRatio: pixelRatio);
    final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
    await File(
      '$_visualOutputDir/$fileName',
    ).writeAsBytes(byteData!.buffer.asUint8List());
  });
}
