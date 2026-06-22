import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/notifications/notification_screen.dart';
import 'package:mobile/recurring_bills/recurring_bill_screen.dart';
import 'package:mobile/reports/monthly_report_screen.dart';
import 'package:mobile/settlements/settlement_list_screen.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../helpers/settleora_visual_test_fonts.dart';
import '../monthly_report_screen_test.dart' as reports;
import '../notification_screen_test.dart' as notifications;
import '../recurring_bill_screen_test.dart' as recurring;
import '../settlement_list_screen_test.dart' as settlements;

const _visualOutputDir =
    '/workspace/logs/settleora-visual-qa/20260623-0120-mobile-chip-status-readiness-consolidation';

void main() {
  testWidgets('captures shared chip status readiness visual evidence', (
    tester,
  ) async {
    await tester.runAsync(() async {
      await loadSettleoraVisualTestFonts();
      await Directory(_visualOutputDir).create(recursive: true);
    });
    await setSettleoraMobileViewport(tester);

    const captureKey = Key('chip-status-readiness-capture');

    await _pumpCaptureSurface(
      tester,
      captureKey,
      SettleoraNotificationScreen(
        repository: notifications.FakeNotificationRepository(
          notifications: [
            notifications.sampleNotification(
              safeSummary: 'Receipt review is waiting.',
              expenseBillId: '11111111-1111-1111-1111-111111111111',
            ),
            notifications.sampleNotification(
              id: 'settlement-row',
              safeSummary: 'Settlement request is waiting.',
              eventType: 'settlement.request_created',
              settlementRequestId: '22222222-2222-2222-2222-222222222222',
            ),
          ],
        ),
        billRepository: notifications.FakeBillRepository(),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(SettleoraStatusChip), findsWidgets);
    expect(find.byType(SettleoraCountChip), findsWidgets);
    await _captureBoundary(
      tester,
      captureKey,
      'notifications-chip-status-390x844.png',
    );

    await _pumpCaptureSurface(
      tester,
      captureKey,
      SettleoraRecurringBillScreen(
        repository: recurring.FakeRecurringBillRepository(
          templates: [recurring.sampleTemplate(merchantName: 'Rent')],
          forecast: [recurring.sampleOccurrence(merchantName: 'Rent')],
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(SettleoraStatusChip), findsWidgets);
    await _captureBoundary(
      tester,
      captureKey,
      'recurring-chip-status-390x844.png',
    );

    await _pumpCaptureSurface(
      tester,
      captureKey,
      SettleoraSettlementListScreen(
        repository: settlements.FakeSettlementRepository(
          balances: [settlements.sampleBalance()],
          requests: [settlements.sampleRequest()],
        ),
        currentUserProfileId: '88888888-8888-8888-8888-888888888888',
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(SettleoraStatusChip), findsWidgets);
    await _captureBoundary(
      tester,
      captureKey,
      'settlements-chip-status-390x844.png',
    );

    await _pumpCaptureSurface(
      tester,
      captureKey,
      SettleoraMonthlyReportScreen(
        repository: reports.FakeMonthlyReportRepository(
          report: reports.sampleReport(),
        ),
        initialMonth: '2026-05',
      ),
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Reconciliation'),
      180,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.byType(SettleoraCountChip), findsWidgets);
    await _captureBoundary(
      tester,
      captureKey,
      'reports-count-chip-390x844.png',
    );
  });
}

Future<void> _pumpCaptureSurface(
  WidgetTester tester,
  Key key,
  Widget home,
) async {
  await tester.pumpWidget(
    RepaintBoundary(
      key: key,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.light(),
        home: home,
      ),
    ),
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
