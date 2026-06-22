import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/reports/monthly_report_screen.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../helpers/settleora_visual_test_fonts.dart';
import '../monthly_report_screen_test.dart' as monthly;

const _visualOutputDir =
    '/workspace/logs/settleora-visual-qa/20260622-2355-mobile-shared-component-consolidation-bundle';

void main() {
  testWidgets('captures reports money field visual QA evidence', (
    tester,
  ) async {
    await tester.runAsync(() async {
      await loadSettleoraVisualTestFonts();
      await Directory(_visualOutputDir).create(recursive: true);
    });
    await setSettleoraMobileViewport(tester);

    const showcaseKey = Key('reports-money-fields-showcase-capture');
    await _pumpMoneyShowcase(tester, showcaseKey);
    await _captureBoundary(
      tester,
      showcaseKey,
      'reports-money-fields-showcase-390x844.png',
    );

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 100));

    const reportKey = Key('monthly-report-money-fields-capture');
    await _pumpMonthlyReport(tester, reportKey);
    await _captureBoundary(
      tester,
      reportKey,
      'monthly-report-money-fields-390x844.png',
    );
  });
}

Future<void> _pumpMoneyShowcase(WidgetTester tester, Key boundaryKey) async {
  await tester.pumpWidget(
    RepaintBoundary(
      key: boundaryKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.light(),
        home: Scaffold(
          appBar: AppBar(title: const Text('Report totals')),
          body: const SafeArea(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Total by currency'),
                        SizedBox(height: 10),
                        MoneyText(amount: '123.4500', currencyCode: 'USD'),
                        SizedBox(height: 14),
                        Text('Your share by currency'),
                        SizedBox(height: 10),
                        MoneyText(amount: '41.1500', currencyCode: 'USD'),
                        SizedBox(height: 14),
                        Text('You paid by currency'),
                        SizedBox(height: 10),
                        MoneyText(amount: '9000', currencyCode: 'JPY'),
                      ],
                    ),
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
}

Future<void> _pumpMonthlyReport(WidgetTester tester, Key boundaryKey) async {
  await tester.pumpWidget(
    RepaintBoundary(
      key: boundaryKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.light(),
        home: SettleoraMonthlyReportScreen(
          repository: monthly.FakeMonthlyReportRepository(
            report: monthly.sampleReport(),
          ),
          initialMonth: '2026-05',
          groupLabel: 'Roommates',
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  expect(find.byType(MoneyText), findsWidgets);
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
