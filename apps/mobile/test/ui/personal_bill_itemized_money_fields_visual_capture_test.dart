import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../bill_list_screen_test.dart' as bills;
import '../helpers/settleora_visual_test_fonts.dart';

const _visualOutputDir =
    '/workspace/logs/settleora-visual-qa/20260622-1934-mobile-personal-bill-itemized-money-fields';

void main() {
  testWidgets(
    'captures personal bill itemized money field visual QA evidence',
    (tester) async {
      await tester.runAsync(() async {
        await loadSettleoraVisualTestFonts();
        await Directory(_visualOutputDir).create(recursive: true);
      });
      await setSettleoraMobileViewport(tester);

      const showcaseKey = Key('personal-bill-itemized-money-fields-capture');
      await _pumpPersonalBillCreate(tester, showcaseKey);
      await _openCreate(tester);
      await tester.ensureVisible(
        find.byKey(const Key('personal-bill-item-quantity-0')),
      );
      await tester.pumpAndSettle();
      await _captureBoundary(
        tester,
        showcaseKey,
        'personal-bill-itemized-money-fields-showcase-390x844.png',
      );

      const createKey = Key(
        'personal-bill-create-itemized-money-fields-capture',
      );
      await _pumpPersonalBillCreate(tester, createKey);
      await _openCreate(tester);
      await tester.enterText(
        find.byKey(const Key('personal-bill-item-name-0')),
        'Noodles',
      );
      await tester.enterText(
        find.byKey(const Key('personal-bill-item-quantity-0')),
        '2',
      );
      await tester.enterText(
        find.byKey(const Key('personal-bill-item-unit-amount-0')),
        '36.50',
      );
      await tester.ensureVisible(
        find.byKey(const Key('personal-bill-item-quantity-0')),
      );
      await tester.pumpAndSettle();
      await _captureBoundary(
        tester,
        createKey,
        'personal-bill-create-itemized-money-fields-390x844.png',
      );
    },
  );
}

Future<void> _pumpPersonalBillCreate(
  WidgetTester tester,
  Key boundaryKey,
) async {
  await tester.pumpWidget(
    RepaintBoundary(
      key: boundaryKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.light(),
        home: SettleoraBillListScreen(
          repository: bills.FakeBillRepository(),
          syncController: bills.sampleBillSyncController(),
          defaultCurrency: 'HKD',
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _openCreate(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('bill-list-create')));
  await tester.pumpAndSettle();
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
