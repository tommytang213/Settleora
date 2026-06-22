import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/bills/bill_repository.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../bill_list_screen_test.dart' as bills;
import '../helpers/settleora_visual_test_fonts.dart';

const _visualOutputDir =
    '/workspace/logs/settleora-visual-qa/20260622-2300-mobile-bill-detail-readonly-money-readouts';

void main() {
  testWidgets('captures bill detail read-only money visual evidence', (
    tester,
  ) async {
    await tester.runAsync(() async {
      await loadSettleoraVisualTestFonts();
      await Directory(_visualOutputDir).create(recursive: true);
    });
    await setSettleoraMobileViewport(tester);

    final detail = _sampleReadOnlyMoneyDetail();
    const groupId = 'visual-group-id';
    final currentUserProfileId = detail.participants.first.userProfileId;

    const listKey = Key('bill-detail-money-list-capture');
    await _pumpGroupBillList(
      tester,
      boundaryKey: listKey,
      detail: detail,
      groupId: groupId,
      currentUserProfileId: currentUserProfileId,
    );
    expect(_moneyText('64.25', 'HKD'), findsOneWidget);
    await _captureBoundary(
      tester,
      listKey,
      'bill-detail-money-list-390x844.png',
    );

    await tester.tap(find.text('Harbour Dinner'));
    await tester.pumpAndSettle();
    expect(_moneyText('64.25', 'HKD'), findsWidgets);
    expect(_moneyText('32.13', 'HKD'), findsWidgets);
    await _captureBoundary(
      tester,
      listKey,
      'bill-detail-money-summary-390x844.png',
    );

    await tester.drag(find.byType(Scrollable).first, const Offset(0, -620));
    await tester.pumpAndSettle();
    expect(_moneyText('32.12', 'HKD'), findsOneWidget);
    await _captureBoundary(
      tester,
      listKey,
      'bill-detail-money-items-shares-390x844.png',
    );
  });
}

Future<void> _pumpGroupBillList(
  WidgetTester tester, {
  required Key boundaryKey,
  required SettleoraBillDetail detail,
  required String groupId,
  required String currentUserProfileId,
}) async {
  await tester.pumpWidget(
    RepaintBoundary(
      key: boundaryKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.light(),
        home: SettleoraGroupBillListScreen(
          repository: bills.FakeBillRepository(
            groupBills: [
              bills.sampleBillSummary(
                id: detail.id,
                merchantName: detail.displayName,
                billDate: detail.billDate,
                status: detail.status,
                totalAmount: detail.totalAmount,
                totalCurrency: detail.totalCurrency,
              ),
            ],
            detail: detail,
          ),
          groupRepository: bills.FakeGroupRepository(),
          groupId: groupId,
          groupName: 'Dinner club',
          currentUserProfileId: currentUserProfileId,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

SettleoraBillDetail _sampleReadOnlyMoneyDetail() {
  return bills.sampleBillDetail(
    id: 'visual-bill-id',
    merchantName: 'Harbour Dinner',
    billDate: '2026-06-22',
    status: 'confirmed',
    totalAmount: '64.25',
    totalCurrency: 'HKD',
    items: const [
      SettleoraBillItem(
        id: 'item-noodles',
        name: 'Noodles',
        note: 'Shared table item',
        amount: '28.00',
        currency: 'HKD',
        sortOrder: 0,
      ),
      SettleoraBillItem(
        id: 'item-tea',
        name: 'Tea',
        note: null,
        amount: '29.00',
        currency: 'HKD',
        sortOrder: 1,
      ),
    ],
    participants: const [
      SettleoraBillParticipant(
        userProfileId: 'visual-current-user',
        status: SettleoraBillParticipantStatusValues.pendingAcceptance,
        resolvedShareAmount: '32.13',
        resolvedShareCurrency: 'HKD',
      ),
      SettleoraBillParticipant(
        userProfileId: 'visual-friend-user',
        status: SettleoraBillParticipantStatusValues.accepted,
        resolvedShareAmount: '32.12',
        resolvedShareCurrency: 'HKD',
      ),
    ],
    payers: const [
      SettleoraBillPayer(
        userProfileId: 'visual-current-user',
        amount: '64.25',
        currency: 'HKD',
      ),
    ],
    adjustments: const [
      SettleoraBillAdjustment(
        id: 'adjustment-service',
        type: 'service_charge',
        direction: 'charge',
        amount: '7.25',
        currency: 'HKD',
        reasonNote: 'Restaurant service charge',
        sortOrder: 0,
      ),
    ],
  );
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
