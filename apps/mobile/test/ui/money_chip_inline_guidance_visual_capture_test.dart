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
    '/workspace/logs/settleora-visual-qa/20260623-0152-mobile-money-chip-inline-guidance-consolidation';

void main() {
  testWidgets('captures migrated money chip and inline guidance primitives', (
    tester,
  ) async {
    await tester.runAsync(() async {
      await loadSettleoraVisualTestFonts();
      await Directory(_visualOutputDir).create(recursive: true);
    });
    await setSettleoraMobileViewport(tester);

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
    const settlementKey = Key('money-chip-inline-guidance-settlement-capture');

    await tester.pumpWidget(
      RepaintBoundary(
        key: settlementKey,
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
    await tester.scrollUntilVisible(
      find.text('Loaded settlement facts'),
      180,
      scrollable: find.byWidgetPredicate(
        (widget) =>
            widget is Scrollable && widget.axisDirection == AxisDirection.down,
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(SettleoraInlinePanel), findsWidgets);
    expect(find.byType(SettleoraMoneyChip), findsOneWidget);
    expect(_moneyChipText('22.00', 'USD'), findsOneWidget);
    await _captureBoundary(
      tester,
      settlementKey,
      'settlement-guidance-money-chip-390x844.png',
    );

    const showcaseKey = Key('money-chip-inline-guidance-showcase-capture');
    await tester.pumpWidget(
      RepaintBoundary(
        key: showcaseKey,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: SettleoraTheme.light(),
          home: const Scaffold(
            body: SafeArea(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SettleoraInlinePanel(
                      icon: Icons.error_outline,
                      message:
                          'This inline failure shell is visual only; retry and sign-in behavior stays with the feature.',
                      variant: SettleoraSurfaceVariant.danger,
                    ),
                    SizedBox(height: 12),
                    SettleoraInlinePanel(
                      icon: Icons.fact_check_outlined,
                      title: 'Guidance stays specific',
                      message:
                          'Feature code owns product copy, action labels, callbacks, and state transitions.',
                      filled: true,
                      padding: EdgeInsets.all(14),
                      children: [
                        Wrap(
                          spacing: 8,
                          runSpacing: 6,
                          children: [
                            SettleoraStatusChip(
                              label: 'Domain chip',
                              icon: Icons.info_outline,
                            ),
                            SettleoraMoneyChip(
                              label: 'Selected total',
                              amount: '42.00',
                              currencyCode: 'HKD',
                              icon: Icons.payments_outlined,
                            ),
                          ],
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(SettleoraInlinePanel), findsNWidgets(2));
    expect(find.byType(SettleoraMoneyChip), findsOneWidget);
    await _captureBoundary(
      tester,
      showcaseKey,
      'shared-inline-panel-money-chip-showcase-390x844.png',
    );
  });
}

Finder _moneyChipText(String amount, String currencyCode) {
  return find.descendant(
    of: find.byType(SettleoraMoneyChip),
    matching: find.byWidgetPredicate(
      (widget) =>
          widget is MoneyText &&
          widget.amount == amount &&
          widget.currencyCode == currencyCode,
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
