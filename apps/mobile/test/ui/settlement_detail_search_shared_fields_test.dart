import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/settlements/settlement_list_screen.dart';
import 'package:mobile/settlements/settlement_repository.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../settlement_list_screen_test.dart' as fixtures;
import '../helpers/settleora_visual_test_fonts.dart';

const _viewer = '88888888-8888-8888-8888-888888888888';
const _output =
    '/workspace/logs/settleora-visual-qa/20260907-1954-detail-search';
const _capture = Key('detail-search-capture');
const _names = ['lines', 'payments'];
const _labels = ['Search request lines', 'Search payments and residuals'];
Finder _control(int i) =>
    find.byKey(Key('settlement-detail-${_names[i]}-search'));
Finder _clear(int i) =>
    find.byKey(Key('settlement-detail-${_names[i]}-search-clear'));
Finder _editable(int i) =>
    find.descendant(of: _control(i), matching: find.byType(EditableText));
TextField _field(WidgetTester tester, int i) => tester.widget<TextField>(
  find.descendant(of: _control(i), matching: find.byType(TextField)),
);
Finder _filter(String name) =>
    find.byKey(Key('settlement-detail-payment-filter-$name'));

fixtures.FakeSettlementRepository _repository() =>
    fixtures.FakeSettlementRepository(
      detail: fixtures.sampleMultiLineRequest(),
      payments: [
        fixtures.samplePayment(
          status: SettleoraSettlementPaymentStatusValues.confirmed,
          residualStatus: SettleoraSettlementResidualStatusValues.confirmed,
        ),
        fixtures.samplePayment(
          id: 'second-payment-private',
          amount: '8.00',
          currency: 'EUR',
          residualId: 'second-residual-private',
          residualAmount: '1.00',
          residualCurrency: 'EUR',
        ),
      ],
    );
List<int> _calls(fixtures.FakeSettlementRepository r) => [
  r.getRequestCalls,
  r.listPaymentsCalls,
  r.paymentDetailsCalls,
  r.listRequestsCalls,
  r.listBalancesCalls,
  r.cancelRequestCalls,
  r.disputeRequestCalls,
  r.markPaymentPaidCalls,
  r.confirmPaymentCalls,
  r.cancelPaymentCalls,
  r.disputePaymentCalls,
  r.confirmResidualCalls,
];
Future<void> _mount(
  WidgetTester tester,
  fixtures.FakeSettlementRepository repository, {
  double width = 390,
  double scale = 1,
  double inset = 0,
  String viewer = _viewer,
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
        home: SettleoraSettlementDetailScreen(
          repository: repository,
          settlementId: repository.detail.id,
          currentUserProfileId: viewer,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _show(WidgetTester tester, Finder target) async {
  if (target.evaluate().isEmpty) {
    final scroll = tester.state<ScrollableState>(
      find.byWidgetPredicate(
        (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
      ),
    );
    scroll.position.jumpTo(0);
    await tester.pumpAndSettle();
  }
  await fixtures.scrollTo(tester, target);
  await tester.pumpAndSettle();
}

Future<void> _query(WidgetTester tester, int i, String value) async {
  await _show(tester, _control(i));
  await tester.enterText(_control(i), value);
  await tester.pumpAndSettle();
}

Future<void> _png(WidgetTester tester, String name) async {
  await tester.pump();
  await tester.runAsync(() async {
    final image = await tester
        .renderObject<RenderRepaintBoundary>(find.byKey(_capture))
        .toImage(pixelRatio: 1);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await File('$_output/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

void main() {
  for (var i = 0; i < 2; i++) {
    testWidgets(
      '${_names[i]} preserves controller, labels, focus and one clear transition',
      (tester) async {
        final semantics = tester.ensureSemantics();

        final repository = _repository();
        await _mount(tester, repository);
        final calls = _calls(repository);
        await _show(tester, _control(i));
        expect(tester.widget(_control(i)), isA<AppTextField>());
        final controller = _field(tester, i).controller!;
        expect(_field(tester, i).textInputAction, isNull);
        expect(_field(tester, i).onChanged, isNull);
        expect(_field(tester, i).autofocus, isFalse);
        expect(_field(tester, i).decoration!.hintText, isNull);
        expect(_field(tester, i).decoration!.suffixIcon, isNull);
        expect(
          (_field(tester, i).decoration!.prefixIcon! as Icon).icon,
          Icons.search_outlined,
        );
        expect(_clear(i), findsNothing);
        final query = i == 0 ? '  EuR   CLOSED  ' : '  EuR   PENDING  ';
        await _query(tester, i, query);
        expect(_field(tester, i).controller, same(controller));
        expect(controller.text, query);
        final focus = tester.widget<EditableText>(_editable(i)).focusNode;
        expect(focus.hasFocus, isTrue);
        final data = tester.getSemantics(_control(i)).getSemanticsData();
        expect(data.label.split(_labels[i]).length - 1, 1);
        expect(data.value, query);
        expect(find.text('1 visible after filter'), findsOneWidget);
        await tester.testTextInput.receiveAction(TextInputAction.done);
        await tester.pumpAndSettle();
        expect(focus.hasFocus, isFalse);
        expect(controller.text, query);
        await _show(tester, _clear(i));
        expect(
          tester.getSize(_clear(i)).shortestSide,
          greaterThanOrEqualTo(48),
        );
        expect(tester.widget<IconButton>(_clear(i)).tooltip, 'Clear search');
        var changes = 0;
        var previous = controller.text;
        controller.addListener(() {
          if (previous != controller.text) {
            changes++;
            previous = controller.text;
          }
        });
        // A repeated stale clear callback is idempotent, including the host listener.
        final clear = tester.widget<IconButton>(_clear(i)).onPressed!;
        await tester.tap(_clear(i));
        clear();
        await tester.pumpAndSettle();
        expect(changes, 1);
        expect(controller.text, '');
        expect(_field(tester, i).controller, same(controller));
        expect(_clear(i), findsNothing);
        expect(find.text('1 visible after filter'), findsNothing);
        expect(_calls(repository), calls);
        expect(tester.takeException(), isNull);
        semantics.dispose();
      },
    );
    testWidgets(
      '${_names[i]} excludes raw identifiers from visible text and search',
      (tester) async {
        final request = fixtures.sampleRequest(
          groupId: 'private-group',
          sourceBillRevisionId: 'private-revision',
          sourceCandidateKey: 'private-candidate',
          requestedByUserProfileId: 'private-requester',
        );
        final payment = fixtures.samplePayment();
        final ids = <String>{
          request.id,
          request.sourceExpenseBillId,
          request.groupId!,
          request.lines.single.id,
          request.lines.single.sourceBillRevisionId!,
          request.lines.single.sourceCandidateKey!,
          request.debtorUserProfileId,
          request.creditorUserProfileId,
          request.requestedByUserProfileId,
          payment.id,
          payment.residuals.single.id,
          payment.allocations.single.id,
        };
        final repository = fixtures.FakeSettlementRepository(
          detail: request,
          payments: [payment],
        );
        await _mount(tester, repository);
        final calls = _calls(repository);
        for (final id in ids) {
          expect(find.textContaining(id), findsNothing);
          await _query(tester, i, id);
          expect(
            find.text(
              i == 0 ? 'No matching request lines' : 'No matching payments',
            ),
            findsOneWidget,
            reason: id,
          );
          await _query(tester, i, '');
        }
        expect(_calls(repository), calls);
      },
    );
  }
  testWidgets(
    'payment counts and filter/query intersection retain residuals and actions',
    (tester) async {
      final repository = _repository();
      await _mount(tester, repository);
      final calls = _calls(repository);
      await _show(tester, _control(1));
      void counts() {
        expect(find.text('All (2)'), findsOneWidget);
        expect(find.text('Needs action (1)'), findsOneWidget);
        expect(find.text('Residuals (2)'), findsOneWidget);
      }

      counts();
      await _query(tester, 0, '  eur CLOSED ');
      final lineController = _field(tester, 0).controller!;
      fixtures.expectMoneyText('12.00', 'EUR');
      fixtures.expectMoneyText('10.00', 'USD', findsNothing);
      for (final filter in ['needs-action', 'residuals']) {
        await _show(tester, _filter(filter));
        await tester.tap(_filter(filter));
        await tester.pumpAndSettle();
        await _query(tester, 1, '  USD  ');
        counts();
        expect(tester.widget<FilterChip>(_filter(filter)).selected, isTrue);
        expect(
          find.text('No matching payments'),
          filter == 'needs-action' ? findsOneWidget : findsNothing,
        );
        await _query(tester, 1, ' eUr   pending ');
        expect(find.text('No matching payments'), findsNothing);
        expect(find.text('8.00 EUR'), findsWidgets);
        expect(find.text('2.50 USD'), findsNothing);
        expect(
          find.byKey(const ValueKey('settlement-residual-confirm-0-0')),
          findsOneWidget,
        );
        expect(
          tester
              .widget<TextButton>(
                find.byKey(const ValueKey('settlement-residual-confirm-0-0')),
              )
              .onPressed,
          isNotNull,
        );
        await _show(tester, _clear(1));
        await tester.tap(_clear(1));
        await tester.pumpAndSettle();
        expect(tester.widget<FilterChip>(_filter('all')).selected, isTrue);
        expect(_field(tester, 1).controller!.text, '');
        expect(lineController.text, '  eur CLOSED ');
        counts();
      }
      // A filter alone still exposes clear and clearing lines cannot reset payment state.
      await _show(tester, _filter('needs-action'));
      await tester.tap(_filter('needs-action'));
      await tester.pumpAndSettle();
      expect(_clear(1), findsOneWidget);
      await _show(tester, _clear(0));
      await tester.tap(_clear(0));
      await tester.pumpAndSettle();
      await _show(tester, _filter('needs-action'));
      expect(
        tester.widget<FilterChip>(_filter('needs-action')).selected,
        isTrue,
      );
      await _show(tester, _control(0));
      fixtures.expectMoneyText('10.00', 'USD');
      fixtures.expectMoneyText('12.00', 'EUR');
      expect(_calls(repository), calls);
    },
  );
  for (var i = 0; i < 2; i++) {
    testWidgets(
      '${_names[i]} production captures normal populated empty clear narrow and focused',
      (tester) async {
        await tester.runAsync(() async {
          await loadSettleoraVisualTestFonts();
          await Directory(_output).create(recursive: true);
        });
        for (final narrow in [false, true]) {
          await tester.pumpWidget(const SizedBox.shrink());
          await _mount(
            tester,
            _repository(),
            width: narrow ? 320 : 390,
            scale: narrow ? 2 : 1,
            viewer: narrow ? '77777777-7777-7777-7777-777777777777' : _viewer,
          );
          final prefix = '${_names[i]}-${narrow ? '320-2x' : '390-1x'}';
          await _show(tester, _control(i));
          await _png(tester, '$prefix-normal');
          await _query(tester, i, i == 0 ? ' EuR closed ' : ' EUR pending ');
          await _png(tester, '$prefix-populated');
          expect(
            tester.getRect(find.text(_labels[i])).bottom,
            lessThan(
              tester
                  .getRect(
                    find.descendant(
                      of: _control(i),
                      matching: find.byType(TextField),
                    ),
                  )
                  .top,
            ),
          );
          expect(
            tester.getSize(_editable(i)).height,
            greaterThanOrEqualTo(narrow ? 32 : 16),
          );
          expect(
            tester.getSize(_clear(i)).shortestSide,
            greaterThanOrEqualTo(48),
          );
          if (i == 1) {
            await _show(tester, _filter('needs-action'));
            await tester.tap(_filter('needs-action'));
            await _show(tester, _control(i));
            await _png(tester, '$prefix-filter-search');
          }
          await _query(tester, i, 'no-match-sentinel');
          await _png(tester, '$prefix-empty');
          await tester.tap(_clear(i));
          await tester.pumpAndSettle();
          await _show(tester, _control(i));
          await _png(tester, '$prefix-clear');
          await tester.pumpWidget(const SizedBox.shrink());
          await _mount(
            tester,
            _repository(),
            width: narrow ? 320 : 390,
            scale: narrow ? 2 : 1,
            viewer: narrow ? '77777777-7777-7777-7777-777777777777' : _viewer,
            inset: 300,
          );
          await _query(tester, i, 'EUR');
          await _show(tester, _control(i));
          expect(
            tester.widget<EditableText>(_editable(i)).focusNode.hasFocus,
            isTrue,
          );
          await _png(tester, '$prefix-focused-inset');
          expect(tester.takeException(), isNull);
        }
      },
      tags: ['visual'],
    );
  }
}
