import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/settlements/settlement_list_screen.dart';
import 'package:mobile/settlements/settlement_repository.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../helpers/settleora_visual_test_fonts.dart';
import '../settlement_list_screen_test.dart' as settlements;

const _visualOutputDir =
    '/workspace/logs/settleora-visual-qa/20260622-2355-mobile-shared-component-consolidation-bundle';

void main() {
  testWidgets('captures settlement money readout visual evidence', (
    tester,
  ) async {
    await tester.runAsync(() async {
      await loadSettleoraVisualTestFonts();
      await Directory(_visualOutputDir).create(recursive: true);
    });
    await setSettleoraMobileViewport(tester);

    final listRepository = settlements.FakeSettlementRepository(
      balances: [
        settlements.sampleBalance(
          selectedLineAmount: '22.00',
          pendingClaimedAmount: '8.00',
          confirmedClearedAmount: '4.00',
          remainingUnclaimedAmount: '10.00',
          confirmedRemainingResidualAmount: '1.50',
          waivedResidualAmount: '0.25',
          creditResidualAmount: '0.75',
          lineCount: 3,
          pendingPaymentCount: 2,
          confirmedPaymentCount: 1,
        ),
      ],
      requests: [settlements.sampleRequest(amount: '22.00', currency: 'USD')],
    );
    const listKey = Key('settlement-money-list-capture');
    await tester.pumpWidget(
      RepaintBoundary(
        key: listKey,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: SettleoraTheme.light(),
          home: SettleoraSettlementListScreen(
            repository: listRepository,
            currentUserProfileId: '77777777-7777-7777-7777-777777777777',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(_moneyText('10.00', 'USD'), findsWidgets);
    expect(_moneyText('8.00', 'USD'), findsWidgets);
    expect(_moneyText('4.00', 'USD'), findsWidgets);
    await _captureBoundary(
      tester,
      listKey,
      'settlement-money-list-390x844.png',
    );

    final detailRepository = settlements.FakeSettlementRepository(
      detail: settlements.sampleMultiLineRequest(),
      payments: [
        settlements.samplePayment(
          amount: '8.00',
          currency: 'EUR',
          residualAmount: '1.00',
          residualCurrency: 'EUR',
          residualStatus: SettleoraSettlementResidualStatusValues
              .pendingReceiverConfirmation,
        ),
      ],
      paymentDetails: settlements.samplePaymentDetails(),
    );
    const detailKey = Key('settlement-money-detail-capture');
    await tester.pumpWidget(
      RepaintBoundary(
        key: detailKey,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: SettleoraTheme.light(),
          home: SettleoraSettlementDetailScreen(
            repository: detailRepository,
            settlementId: '11111111-1111-1111-1111-111111111111',
            currentUserProfileId: '88888888-8888-8888-8888-888888888888',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(_moneyText('22.00', 'USD'), findsWidgets);
    await tester.scrollUntilVisible(
      find.text('Payments'),
      320,
      scrollable: find.byWidgetPredicate(
        (widget) =>
            widget is Scrollable && widget.axisDirection == AxisDirection.down,
      ),
    );
    await tester.pumpAndSettle();
    expect(_moneyText('8.00', 'EUR'), findsWidgets);
    expect(_moneyText('1.00', 'EUR'), findsWidgets);
    await _captureBoundary(
      tester,
      detailKey,
      'settlement-money-detail-390x844.png',
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
