import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/server_mode_shell.dart';
import 'package:mobile/settlements/settlement_repository.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../helpers/settleora_visual_test_fonts.dart';
import '../server_mode_shell_dashboard_test.dart' as dashboard;

const _visualOutputDir =
    '/workspace/logs/settleora-visual-qa/20260622-2152-mobile-home-dashboard-money-readouts';

void main() {
  testWidgets('captures home dashboard money readout visual evidence', (
    tester,
  ) async {
    await tester.runAsync(() async {
      await loadSettleoraVisualTestFonts();
      await Directory(_visualOutputDir).create(recursive: true);
    });
    await setSettleoraMobileViewport(tester);

    const captureKey = Key('home-dashboard-money-readouts-capture');
    await tester.pumpWidget(
      RepaintBoundary(
        key: captureKey,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: SettleoraTheme.light(),
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
            ),
            recurringBillRepository: dashboard.FakeRecurringBillRepository(
              forecast: [dashboard.sampleOccurrence()],
            ),
            groupRepository: dashboard.FakeGroupRepository(),
            notificationRepository: dashboard.FakeNotificationRepository(),
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

    expect(_moneyText('10.00', 'USD'), findsOneWidget);
    expect(_moneyText('18.00', 'USD'), findsOneWidget);
    expect(_moneyText('24.50', 'USD'), findsOneWidget);
    expect(_moneyText('1200.00', 'USD'), findsOneWidget);
    expect(find.text('You owe'), findsOneWidget);
    expect(find.text("You're owed"), findsOneWidget);
    expect(find.text('Upcoming bills'), findsOneWidget);

    await _captureBoundary(
      tester,
      captureKey,
      'home-dashboard-money-readouts-390x844.png',
    );

    await tester.scrollUntilVisible(
      find.text('Upcoming bills'),
      320,
      scrollable: find.descendant(
        of: find.byKey(const Key('server-shell-home-scroll')),
        matching: find.byType(Scrollable),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Corner Market'), findsOneWidget);
    expect(find.text('Rent'), findsOneWidget);
    await _captureBoundary(
      tester,
      captureKey,
      'home-dashboard-upcoming-money-readouts-390x844.png',
    );
  });
}

Finder _moneyText(String amount, String currencyCode) {
  return find.byWidgetPredicate(
    (widget) =>
        widget is MoneyText &&
        widget.amount == amount &&
        widget.currencyCode == currencyCode,
  );
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
