import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/groups/group_list_screen.dart';
import 'package:mobile/notifications/notification_repository.dart';
import 'package:mobile/notifications/notification_screen.dart';
import 'package:mobile/settlements/settlement_list_screen.dart';
import 'package:mobile/settlements/settlement_repository.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../group_list_screen_test.dart' as groups;
import '../helpers/settleora_visual_test_fonts.dart';
import '../notification_screen_test.dart' as notifications;
import '../settlement_list_screen_test.dart' as settlements;

const _visualOutputDir =
    '/workspace/logs/settleora-visual-qa/20260703-1714-mobile-notifications-center-density-followup-dev-only';

void main() {
  testWidgets('captures groups settle notifications visual parity evidence', (
    tester,
  ) async {
    await tester.runAsync(() async {
      await loadSettleoraVisualTestFonts();
      await Directory(_visualOutputDir).create(recursive: true);
    });
    await setSettleoraMobileViewport(tester);

    await _captureGroupsList(tester);
    await _captureSettleList(tester);
    await _captureSettlementDetail(tester);
    await _captureNotificationsCenter(tester);
    await _captureNotificationDetail(tester);
  });
}

Future<void> _captureGroupsList(WidgetTester tester) async {
  final repository = groups.FakeGroupRepository(
    groups: groups.sampleGroupDiscoveryRows(),
    members: groups.sampleMemberDiscoveryRows(),
  );
  const captureKey = Key('groups-parity-capture');

  await tester.pumpWidget(
    RepaintBoundary(
      key: captureKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.midnight(),
        home: SettleoraGroupListScreen(
          repository: repository,
          billRepository: groups.FakeBillRepository(),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  expect(find.byKey(const Key('group-list-search')), findsOneWidget);
  await _captureBoundary(
    tester,
    captureKey,
    'groups-list-or-dashboard-390x844.png',
  );
}

Future<void> _captureSettleList(WidgetTester tester) async {
  final repository = settlements.FakeSettlementRepository(
    balances: [
      settlements.sampleBalance(
        selectedLineAmount: '80.00',
        pendingClaimedAmount: '25.00',
        confirmedClearedAmount: '10.00',
        remainingUnclaimedAmount: '45.00',
        lineCount: 4,
        pendingPaymentCount: 1,
      ),
    ],
    requests: [
      settlements.sampleRequest(amount: '45.00', currency: 'HKD'),
      settlements.sampleRequest(
        id: '99999999-9999-9999-9999-999999999999',
        amount: '18.50',
        currency: 'USD',
        status: SettleoraSettlementRequestStatusValues.markedPaid,
      ),
    ],
  );
  const captureKey = Key('settle-list-parity-capture');

  await tester.pumpWidget(
    RepaintBoundary(
      key: captureKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.midnight(),
        home: SettleoraSettlementListScreen(
          repository: repository,
          currentUserProfileId: '77777777-7777-7777-7777-777777777777',
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  expect(find.byKey(const Key('settlement-list-search')), findsOneWidget);
  await _captureBoundary(
    tester,
    captureKey,
    'settle-dashboard-or-list-390x844.png',
  );
}

Future<void> _captureSettlementDetail(WidgetTester tester) async {
  final repository = settlements.FakeSettlementRepository(
    detail: settlements.sampleMultiLineRequest(),
    payments: [
      settlements.samplePayment(
        amount: '8.00',
        currency: 'USD',
        residualAmount: '1.00',
        residualCurrency: 'USD',
        residualStatus:
            SettleoraSettlementResidualStatusValues.pendingReceiverConfirmation,
      ),
    ],
    paymentDetails: settlements.samplePaymentDetails(),
  );
  const captureKey = Key('settlement-detail-parity-capture');

  await tester.pumpWidget(
    RepaintBoundary(
      key: captureKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.midnight(),
        home: SettleoraSettlementDetailScreen(
          repository: repository,
          settlementId: '11111111-1111-1111-1111-111111111111',
          currentUserProfileId: '77777777-7777-7777-7777-777777777777',
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  expect(find.byKey(const Key('settlement-request-mark-paid')), findsOneWidget);
  await _captureBoundary(
    tester,
    captureKey,
    'settlement-detail-or-payment-390x844.png',
  );
}

Future<void> _captureNotificationsCenter(WidgetTester tester) async {
  final repository = notifications.FakeNotificationRepository(
    notifications: [
      notifications.sampleNotification(
        id: 'receipt-review',
        eventType: 'ocr.needs_review',
        subjectType: SettleoraNotificationSubjectTypeValues.expenseBill,
        receiptAttachmentFileId: 'receipt-file',
        expenseBillId: 'bill-one',
        safeSummary: 'Receipt review is waiting for your check.',
      ),
      notifications.sampleNotification(
        id: 'settlement-review',
        eventType: 'settlement.request_created',
        subjectType: SettleoraNotificationSubjectTypeValues.settlementRequest,
        settlementRequestId: 'settlement-one',
        priority: SettleoraNotificationPriorityValues.urgent,
        safeSummary: 'A settlement payment needs your review.',
      ),
      notifications.sampleNotification(
        id: 'sync-review',
        eventType: 'sync.conflict_detected',
        subjectType: SettleoraNotificationSubjectTypeValues.syncOperation,
        syncOperationId: 'sync-one',
        safeSummary: 'A sync issue needs attention.',
      ),
    ],
  );
  const captureKey = Key('notifications-center-parity-capture');

  await tester.pumpWidget(
    RepaintBoundary(
      key: captureKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.midnight(),
        home: SettleoraNotificationScreen(
          repository: repository,
          currentUserProfileId: '33333333-3333-3333-3333-333333333333',
          settlementRepository: settlements.FakeSettlementRepository(),
          syncRepository: notifications.FakeSyncRepository(),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  expect(find.byKey(const Key('notification-summary')), findsOneWidget);
  await _captureBoundary(
    tester,
    captureKey,
    'notifications-center-390x844.png',
  );
}

Future<void> _captureNotificationDetail(WidgetTester tester) async {
  final repository = notifications.FakeNotificationRepository(
    notifications: [
      notifications.sampleNotification(
        id: 'settlement-detail',
        eventType: 'settlement.request_created',
        subjectType: SettleoraNotificationSubjectTypeValues.settlementRequest,
        settlementRequestId: 'settlement-one',
        priority: SettleoraNotificationPriorityValues.urgent,
        safeSummary: 'A settlement payment needs your review.',
      ),
    ],
  );
  const captureKey = Key('notification-detail-parity-capture');

  await tester.pumpWidget(
    RepaintBoundary(
      key: captureKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.midnight(),
        home: SettleoraNotificationScreen(
          repository: repository,
          currentUserProfileId: '33333333-3333-3333-3333-333333333333',
          settlementRepository: settlements.FakeSettlementRepository(),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  await tester.scrollUntilVisible(
    find.byKey(const ValueKey('notification-details-0')),
    240,
    scrollable: find.byWidgetPredicate(
      (widget) =>
          widget is Scrollable && widget.axisDirection == AxisDirection.down,
    ),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const ValueKey('notification-details-0')));
  await tester.pumpAndSettle();
  expect(find.byKey(const Key('notification-detail-sheet')), findsOneWidget);
  await _captureBoundary(
    tester,
    captureKey,
    'notification-detail-or-review-390x844.png',
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
    expect(image.width, 390);
    expect(image.height, 844);
    final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
    await File(
      '$_visualOutputDir/$fileName',
    ).writeAsBytes(byteData!.buffer.asUint8List());
  });
}
