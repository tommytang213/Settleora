import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/reports/monthly_report_screen.dart';
import 'package:mobile/settlements/settlement_list_screen.dart';
import 'package:mobile/recurring_bills/recurring_bill_screen.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_screen.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../monthly_report_screen_test.dart' as monthly;
import '../settlement_list_screen_test.dart' as settle;
import '../recurring_bill_screen_test.dart' as recurring;
import '../receipt_ocr_review_screen_test.dart' as ocr;
import '../helpers/settleora_visual_test_fonts.dart';

const _output = '/workspace/logs/settleora-visual-qa/20260907-1805-discovery';
const _capture = Key('discovery-capture');
const _keys = [
  'monthly-report-search',
  'settlement-list-search',
  'recurring-bill-search',
  'receipt-review-search',
];
const _labels = [
  'Search report',
  'Search settlements',
  'Search recurring bills',
  'Search receipt reviews',
];
const _queries = [' USD ', ' USD ', ' Rent ', ' Corner '];
Finder control(int i) => find.byKey(Key(_keys[i]));
Finder editable(int i) =>
    find.descendant(of: control(i), matching: find.byType(EditableText));
TextField field(WidgetTester tester, int i) => tester.widget<TextField>(
  find.descendant(of: control(i), matching: find.byType(TextField)),
);
Widget screen(int i) => switch (i) {
  0 => SettleoraMonthlyReportScreen(
    repository: monthly.FakeMonthlyReportRepository(),
    initialMonth: '2026-05',
  ),
  1 => SettleoraSettlementListScreen(
    repository: settle.FakeSettlementRepository(
      requests: [settle.sampleRequest()],
    ),
    currentUserProfileId: '22222222-2222-2222-2222-222222222222',
  ),
  2 => SettleoraRecurringBillScreen(
    repository: recurring.FakeRecurringBillRepository(),
  ),
  _ => ReceiptOcrReviewQueueScreen(
    repository: ocr.FakeReceiptOcrReviewRepository(
      listResponse: [ocr.sampleSummary()],
    ),
  ),
};
Future<void> mount(
  WidgetTester tester,
  Widget home, {
  double width = 390,
  double scale = 1,
  double inset = 0,
}) async {
  await setSettleoraMobileViewport(tester, width: width);
  await tester.pumpWidget(
    RepaintBoundary(
      key: _capture,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.midnight(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(scale),
            viewInsets: EdgeInsets.only(bottom: inset),
          ),
          child: child!,
        ),
        home: home,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> capture(WidgetTester tester, String name) async {
  await tester.pump();
  await tester.runAsync(() async {
    final image = await tester
        .renderObject<RenderRepaintBoundary>(find.byKey(_capture))
        .toImage(pixelRatio: 1);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    await File('$_output/$name.png').writeAsBytes(data!.buffer.asUint8List());
    image.dispose();
  });
}

void main() {
  testWidgets('shared field forwards raw edits and explicit clear once', (
    tester,
  ) async {
    final controller = TextEditingController(text: 'initial');
    addTearDown(controller.dispose);
    final edits = <String>[];
    var clears = 0;
    await mount(
      tester,
      Scaffold(
        body: AppTextField(
          label: 'Search',
          controller: controller,
          prefixIcon: const Icon(Icons.search),
          suffixIcon: IconButton(
            tooltip: 'Clear search',
            onPressed: () {
              clears++;
              controller.clear();
            },
            icon: const Icon(Icons.clear),
          ),
          onChanged: edits.add,
          textInputAction: TextInputAction.search,
        ),
      ),
    );
    await tester.enterText(find.byType(TextField), '  Mixed CASE  ');
    expect(controller.text, '  Mixed CASE  ');
    expect(edits, ['  Mixed CASE  ']);
    await tester.tap(find.byTooltip('Clear search'));
    expect(clears, 1);
    expect(controller.text, '');
    expect(edits, [
      '  Mixed CASE  ',
    ], reason: 'Programmatic clear must not synthesize onChanged.');
    await tester.pumpWidget(const SizedBox.shrink());
    controller.text = 'host still owns controller';
  });
  for (var i = 0; i < 4; i++) {
    testWidgets(
      '${_keys[i]} preserves controller raw value, semantics and focus',
      (tester) async {
        final semantics = tester.ensureSemantics();
        try {
          await mount(tester, screen(i));
          expect(tester.widget(control(i)), isA<AppTextField>());
          final controller = field(tester, i).controller!;
          expect(
            field(tester, i).textInputAction,
            i == 1 ? isNull : TextInputAction.search,
          );
          expect(field(tester, i).onChanged, i == 3 ? isNotNull : isNull);
          await tester.ensureVisible(control(i));
          await tester.enterText(control(i), _queries[i]);
          await tester.pumpAndSettle();
          expect(field(tester, i).controller, same(controller));
          expect(controller.text, _queries[i]);
          expect(
            tester.widget<EditableText>(editable(i)).focusNode.hasFocus,
            isTrue,
          );
          expect(
            tester
                    .getSemantics(editable(i))
                    .getSemanticsData()
                    .label
                    .split(_labels[i])
                    .length -
                1,
            1,
          );
          expect(
            tester.getSemantics(editable(i)).getSemanticsData().value,
            _queries[i],
          );
          await tester.testTextInput.receiveAction(
            i == 1 ? TextInputAction.done : TextInputAction.search,
          );
          await tester.pumpAndSettle();
          expect(controller.text, _queries[i]);
          expect(
            tester.widget<EditableText>(editable(i)).focusNode.hasFocus,
            isFalse,
          );
          if (i == 0 || i == 2) {
            var textChanges = 0;
            var previous = controller.text;
            controller.addListener(() {
              if (previous != controller.text) {
                previous = controller.text;
                textChanges++;
              }
            });
            await tester.ensureVisible(control(i));
            expect(
              tester.getSize(find.byTooltip('Clear search')).shortestSide,
              greaterThanOrEqualTo(48),
            );
            await tester.tap(find.byTooltip('Clear search'));
            await tester.pumpAndSettle();
            expect(textChanges, 1);
            expect(controller.text, '');
          }
          expect(tester.takeException(), isNull);
        } finally {
          semantics.dispose();
        }
      },
    );
  }
  testWidgets('monthly trimmed search never recomputes authoritative totals', (
    tester,
  ) async {
    final report = monthly.sampleReport();
    final repository = monthly.FakeMonthlyReportRepository(report: report);
    await mount(
      tester,
      SettleoraMonthlyReportScreen(
        repository: repository,
        initialMonth: '2026-05',
      ),
    );
    await tester.enterText(control(0), '  uSd  ');
    await tester.pumpAndSettle();
    expect(find.text('3 matching report rows'), findsOneWidget);
    expect(field(tester, 0).controller!.text, '  uSd  ');
    await tester.enterText(control(0), 'no-match-sentinel');
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('No matching report rows'),
      150,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('No matching report rows'), findsOneWidget);
    expect(repository.calls, 1);
    expect(repository.report, same(report));
    expect(report.totalByCurrency.single.amount, '123.4500');
    expect(report.billCount, 3);
    await tester.ensureVisible(control(0));
    await tester.tap(find.byTooltip('Clear search'));
    await tester.pumpAndSettle();
    expect(field(tester, 0).controller!.text, '');
    expect(find.text('No matching report rows'), findsNothing);
    expect(repository.calls, 1);
  });
  for (var i = 0; i < 4; i++) {
    testWidgets('${_keys[i]} production visual evidence', (tester) async {
      await tester.runAsync(() async {
        await loadSettleoraVisualTestFonts();
        await Directory(_output).create(recursive: true);
      });
      for (final narrow in [false, true]) {
        await mount(
          tester,
          screen(i),
          width: narrow ? 320 : 390,
          scale: narrow ? 2 : 1,
        );
        await tester.ensureVisible(control(i));
        await tester.pumpAndSettle();
        await capture(
          tester,
          '${_keys[i]}-${narrow ? '320-2x' : '390-1x'}-normal',
        );
        await tester.enterText(control(i), _queries[i]);
        await tester.pumpAndSettle();
        await capture(
          tester,
          '${_keys[i]}-${narrow ? '320-2x' : '390-1x'}-populated',
        );
        expect(
          tester.getSize(editable(i)).height,
          greaterThanOrEqualTo(narrow ? 32 : 16),
        );
        expect(
          tester.getSize(control(i)).width,
          lessThanOrEqualTo(narrow ? 320 : 390),
        );
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      }
      await mount(tester, screen(i), inset: 300);
      await tester.ensureVisible(control(i));
      await tester.enterText(control(i), 'no-match-sentinel');
      await tester.pumpAndSettle();
      expect(
        tester.widget<EditableText>(editable(i)).focusNode.hasFocus,
        isTrue,
      );
      await capture(tester, '${_keys[i]}-focused-inset-filtered-empty');
      expect(tester.takeException(), isNull);
    });
  }
}
