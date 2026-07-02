import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/server_mode_shell.dart';
import 'package:mobile/notifications/notification_repository.dart';
import 'package:mobile/profile/profile_screen.dart';
import 'package:mobile/settlements/settlement_repository.dart';
import 'package:mobile/sync/sync_queue.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../helpers/settleora_visual_test_fonts.dart';
import '../profile_screen_test.dart' as profile;
import '../server_mode_shell_dashboard_test.dart' as dashboard;

const _visualOutputDir =
    '/workspace/logs/settleora-visual-qa/20260702-2323-mobile-shell-home-more-profile-visual-followup';

void main() {
  testWidgets('captures shell home more profile parity visual evidence', (
    tester,
  ) async {
    await tester.runAsync(() async {
      await loadSettleoraVisualTestFonts();
      await Directory(_visualOutputDir).create(recursive: true);
    });
    await setSettleoraMobileViewport(tester);

    const shellCaptureKey = Key('shell-home-more-capture');
    await tester.pumpWidget(
      RepaintBoundary(
        key: shellCaptureKey,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: SettleoraTheme.midnight(),
          home: SettleoraAuthenticatedServerShell(
            currentUser: dashboard.sampleCurrentUser(),
            receiptOcrReviewRepository:
                dashboard.FakeReceiptOcrReviewRepository(),
            billRepository: dashboard.FakeBillRepository(
              bills: [dashboard.sampleBill()],
            ),
            settlementRepository: dashboard.FakeSettlementRepository(
              balances: [
                dashboard.sampleBalance(),
                dashboard.sampleBalance(
                  direction: SettleoraSettlementBalanceDirectionValues.incoming,
                  amount: '18.00',
                ),
              ],
              requests: [dashboard.sampleSettlementRequest()],
            ),
            recurringBillRepository: dashboard.FakeRecurringBillRepository(
              templates: [dashboard.sampleTemplate()],
              forecast: [dashboard.sampleOccurrence()],
            ),
            groupRepository: dashboard.FakeGroupRepository(),
            notificationRepository: dashboard.FakeNotificationRepository(
              summary: const SettleoraNotificationSummary(
                unreadCount: 3,
                attentionCount: 1,
                urgentCount: 1,
              ),
            ),
            reportRepository: dashboard.FakeMonthlyReportRepository(),
            profileRepository: dashboard.FakeProfileRepository(),
            billSyncController: dashboard.sampleBillSyncController(
              store: dashboard.MemorySyncQueueStore(
                initialState: SettleoraSyncQueueState(
                  items: [
                    dashboard.sampleSyncItem(
                      id: 'visual-sync-queued',
                      resourceId: 'visual-bill',
                      state: SettleoraSyncQueueItemStateValues.queued,
                    ),
                  ],
                ),
              ),
            ),
            dataBackupService: dashboard.FakeLocalDataBackupService(),
            authRepository: dashboard.FakeAuthRepository(),
            accessTokenProvider: dashboard.FakeAccessTokenProvider(),
            onSessionEnded: (_) async {},
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('server-shell-current-user')), findsOneWidget);
    await _captureBoundary(tester, shellCaptureKey, 'home-shell-390x844.png');

    await tester.scrollUntilVisible(
      find.byKey(const Key('server-shell-settlement-actions')),
      260,
      scrollable: find.descendant(
        of: find.byKey(const Key('server-shell-home-scroll')),
        matching: find.byType(Scrollable),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.byKey(const Key('server-shell-recurring-drafts-action')),
      findsOneWidget,
    );
    await tester.scrollUntilVisible(
      find.byKey(const Key('server-shell-attention-queue-row')),
      220,
      scrollable: find.descendant(
        of: find.byKey(const Key('server-shell-home-scroll')),
        matching: find.byType(Scrollable),
      ),
    );
    await tester.pumpAndSettle();
    _expectAboveBottomNav(
      tester,
      find.byKey(const Key('server-shell-attention-queue-row')),
    );
    await _captureBoundary(
      tester,
      shellCaptureKey,
      'home-attention-390x844.png',
    );

    await tester.tap(
      find.descendant(
        of: find.byKey(const Key('server-shell-bottom-nav')),
        matching: find.byKey(const Key('bottom-nav-more')),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('server-shell-more-hub')), findsOneWidget);
    await tester.scrollUntilVisible(
      find.byKey(const Key('server-shell-visual-preference-readout')),
      260,
      scrollable: find.descendant(
        of: find.byKey(const Key('server-shell-more-hub')),
        matching: find.byType(Scrollable),
      ),
    );
    await tester.pumpAndSettle();
    _expectAboveBottomNav(
      tester,
      find.byKey(const Key('server-shell-visual-preference-readout')),
    );
    await _captureBoundary(tester, shellCaptureKey, 'more-hub-390x844.png');

    const profileCaptureKey = Key('profile-payment-capture');
    await tester.pumpWidget(
      RepaintBoundary(
        key: profileCaptureKey,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: SettleoraTheme.midnight(),
          home: SettleoraProfileScreen(
            repository: profile.FakeProfileRepository(),
            currentUser: profile.sampleCurrentUser(),
            onSessionEnded: (_) async {},
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const Key('profile-payment-summary')),
      260,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(find.text('Payment Details'), findsOneWidget);
    _expectVisibleInViewport(
      tester,
      find.byKey(const Key('profile-payment-summary')),
    );
    await _captureBoundary(
      tester,
      profileCaptureKey,
      'profile-payment-390x844.png',
    );
  });
}

void _expectAboveBottomNav(WidgetTester tester, Finder contentFinder) {
  final contentBottom = tester.getBottomLeft(contentFinder).dy;
  final navTop = tester
      .getTopLeft(find.byKey(const Key('server-shell-bottom-nav')))
      .dy;

  expect(contentBottom, lessThanOrEqualTo(navTop - 12));
}

void _expectVisibleInViewport(WidgetTester tester, Finder contentFinder) {
  final contentRect = tester.getRect(contentFinder);
  final viewportSize = tester.view.physicalSize / tester.view.devicePixelRatio;

  expect(contentRect.top, greaterThanOrEqualTo(0));
  expect(contentRect.bottom, lessThanOrEqualTo(viewportSize.height));
}

Future<void> _captureBoundary(
  WidgetTester tester,
  Key key,
  String fileName,
) async {
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.byKey(key),
    );
    final image = await boundary.toImage(pixelRatio: 1);
    final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
    await File(
      '$_visualOutputDir/$fileName',
    ).writeAsBytes(byteData!.buffer.asUint8List());
  });
}
