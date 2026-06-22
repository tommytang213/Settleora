import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/recurring_bills/recurring_bill_screen.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../helpers/settleora_visual_test_fonts.dart';
import '../recurring_bill_screen_test.dart' as recurring;

const _visualOutputDir =
    '/workspace/logs/settleora-visual-qa/20260622-1822-mobile-recurring-bill-money-fields';

void main() {
  testWidgets('captures recurring bill money field visual QA evidence', (
    tester,
  ) async {
    await tester.runAsync(() async {
      await loadSettleoraVisualTestFonts();
      await Directory(_visualOutputDir).create(recursive: true);
    });
    await setSettleoraMobileViewport(tester);

    const showcaseKey = Key('recurring-bill-money-fields-showcase-capture');
    await _pumpRecurringList(tester, showcaseKey);
    await _captureBoundary(
      tester,
      showcaseKey,
      'recurring-bill-money-fields-showcase-390x844.png',
    );

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 100));

    const createKey = Key('recurring-bill-create-money-input-capture');
    await _pumpTemplateCreate(tester, createKey);
    await tester.ensureVisible(
      find.byKey(const Key('recurring-bill-form-item-amount')),
    );
    await tester.enterText(
      find.byKey(const Key('recurring-bill-form-item-name')),
      'Gym membership',
    );
    await tester.enterText(
      find.byKey(const Key('recurring-bill-form-item-amount')),
      '480.00',
    );
    await tester.pumpAndSettle();
    await _captureBoundary(
      tester,
      createKey,
      'recurring-bill-template-create-money-input-390x844.png',
    );

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 100));

    const detailKey = Key('recurring-bill-detail-money-text-capture');
    await _pumpTemplateDetail(tester, detailKey);
    await _captureBoundary(
      tester,
      detailKey,
      'recurring-bill-detail-money-text-390x844.png',
    );
  });
}

Future<void> _pumpRecurringList(WidgetTester tester, Key boundaryKey) async {
  await tester.pumpWidget(
    RepaintBoundary(
      key: boundaryKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.light(),
        home: SettleoraRecurringBillScreen(
          repository: recurring.FakeRecurringBillRepository(),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _pumpTemplateCreate(WidgetTester tester, Key boundaryKey) async {
  await tester.pumpWidget(
    RepaintBoundary(
      key: boundaryKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.light(),
        home: SettleoraRecurringBillTemplateFormScreen.create(
          repository: recurring.FakeRecurringBillRepository(),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _pumpTemplateDetail(WidgetTester tester, Key boundaryKey) async {
  await tester.pumpWidget(
    RepaintBoundary(
      key: boundaryKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.light(),
        home: SettleoraRecurringBillDetailScreen(
          repository: recurring.FakeRecurringBillRepository(
            detail: recurring.samplePayloadDetail(),
          ),
          templateId: '11111111-1111-1111-1111-111111111111',
        ),
      ),
    ),
  );
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
