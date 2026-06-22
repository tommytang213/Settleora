import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/recurring_bills/recurring_bill_screen.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_form_fields.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../helpers/settleora_visual_test_fonts.dart';
import '../recurring_bill_screen_test.dart' as recurring;

const _visualOutputDir =
    '/workspace/logs/settleora-visual-qa/20260622-2232-mobile-future-bill-money-date-readouts';

void main() {
  testWidgets('captures future bill money and date readout visual evidence', (
    tester,
  ) async {
    await tester.runAsync(() async {
      await loadSettleoraVisualTestFonts();
      await Directory(_visualOutputDir).create(recursive: true);
    });
    await setSettleoraMobileViewport(tester);

    const listKey = Key('future-bill-list-money-readouts-capture');
    await _pumpFutureBillList(tester, listKey);
    expect(_moneyText('120.00', 'USD'), findsOneWidget);
    expect(find.text('Upcoming one-time bills'), findsOneWidget);
    await _captureBoundary(
      tester,
      listKey,
      'future-bill-list-money-readouts-390x844.png',
    );

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 100));

    const detailKey = Key('future-bill-detail-money-readouts-capture');
    await _pumpFutureBillDetail(tester, detailKey);
    expect(_moneyText('120.00', 'USD'), findsNWidgets(2));
    expect(find.text('Items'), findsOneWidget);
    await _captureBoundary(
      tester,
      detailKey,
      'future-bill-detail-money-readouts-390x844.png',
    );

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 100));

    const formKey = Key('future-bill-form-date-field-capture');
    await _pumpFutureBillForm(tester, formKey);
    expect(find.byType(DateField), findsOneWidget);
    expect(find.byKey(const Key('future-bill-form-due-date')), findsOneWidget);
    await _captureBoundary(
      tester,
      formKey,
      'future-bill-form-date-field-390x844.png',
    );
  });
}

Future<void> _pumpFutureBillList(WidgetTester tester, Key boundaryKey) async {
  await tester.pumpWidget(
    RepaintBoundary(
      key: boundaryKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.light(),
        home: SettleoraRecurringBillScreen(
          repository: recurring.FakeRecurringBillRepository(
            templates: const [],
            forecast: const [],
          ),
          futureBillRepository: recurring.FakeFutureBillRepository(
            futureBills: [recurring.sampleFutureBill()],
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _pumpFutureBillDetail(WidgetTester tester, Key boundaryKey) async {
  await tester.pumpWidget(
    RepaintBoundary(
      key: boundaryKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.light(),
        home: SettleoraFutureBillDetailScreen(
          repository: recurring.FakeFutureBillRepository(
            detail: recurring.sampleFutureBillDetail(),
          ),
          futureBillId: 'future-bill-id',
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _pumpFutureBillForm(WidgetTester tester, Key boundaryKey) async {
  await tester.pumpWidget(
    RepaintBoundary(
      key: boundaryKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.light(),
        home: SettleoraFutureBillFormScreen.create(
          repository: recurring.FakeFutureBillRepository(futureBills: const []),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  await tester.enterText(
    find.byKey(const Key('future-bill-form-merchant')),
    'Insurance',
  );
  await tester.enterText(
    find.byKey(const Key('future-bill-form-amount')),
    '120.00',
  );
  final dateField = tester.widget<DateField>(
    find.byKey(const Key('future-bill-form-due-date')),
  );
  dateField.controller.text = '2026-06-19';
  dateField.onChanged?.call('2026-06-19');
  await tester.ensureVisible(
    find.byKey(const Key('future-bill-form-due-date')),
  );
  await tester.pumpAndSettle();
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
