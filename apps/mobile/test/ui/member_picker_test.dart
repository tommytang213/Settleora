import 'dart:async';
import 'dart:ui' show Tristate;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_theme.dart';

const choices = [
  SettleoraMemberChoice(
    value: 'taylor-id',
    label: 'Taylor',
    subtitle: 'Owner - Active',
    searchTerms: ['Owner', 'Active'],
    key: Key('taylor'),
  ),
  SettleoraMemberChoice(
    value: 'morgan-id',
    label: 'Morgan',
    subtitle: 'Member - Active',
    searchTerms: ['Member', 'Active'],
    key: Key('morgan'),
  ),
];

Widget harness({
  List<SettleoraMemberChoice> members = choices,
  String? value = 'taylor-id',
  bool enabled = true,
  bool loading = false,
  String? error,
  Future<void> Function()? retry,
  ValueChanged<String>? changed,
  double scale = 1,
}) => MaterialApp(
  debugShowCheckedModeBanner: false,
  theme: SettleoraTheme.light(),
  builder: (context, child) => MediaQuery(
    data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
    child: child!,
  ),
  home: Scaffold(
    body: MediaQuery(
      data: MediaQueryData(textScaler: TextScaler.linear(scale)),
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: SettleoraMemberPickerField(
            label: 'Paid by',
            pickerTitle: 'Choose payer member',
            choices: members,
            value: value,
            enabled: enabled,
            loading: loading,
            errorText: error,
            onRetry: retry,
            onChanged: changed ?? (_) {},
            searchKey: const Key('search'),
            clearSearchKey: const Key('clear'),
          ),
        ),
      ),
    ),
  ),
);

void main() {
  testWidgets(
    'member picker labels selected value and returns unchanged ID once',
    (tester) async {
      final selected = <String>[];
      await tester.pumpWidget(harness(changed: selected.add));
      expect(find.text('Paid by'), findsOneWidget);
      expect(find.text('Taylor'), findsOneWidget);
      await tester.tap(find.byType(InkWell).first);
      await tester.tap(find.byType(InkWell).first, warnIfMissed: false);
      await tester.pumpAndSettle();
      expect(find.text('Choose payer member'), findsOneWidget);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('morgan')));
      await tester.tap(find.byKey(const Key('morgan')), warnIfMissed: false);
      await tester.pumpAndSettle();
      expect(selected, ['morgan-id']);
      expect(find.text('Morgan'), findsOneWidget);
    },
  );

  testWidgets('search filters name role status and clear restores focus', (
    tester,
  ) async {
    await tester.pumpWidget(harness());
    await tester.tap(find.byType(InkWell).first);
    await tester.pumpAndSettle();
    final field = tester.widget<TextField>(find.byKey(const Key('search')));
    expect(field.focusNode!.hasFocus, isTrue);
    await tester.enterText(find.byKey(const Key('search')), '  oWnEr ');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('taylor')), findsOneWidget);
    expect(find.byKey(const Key('morgan')), findsNothing);
    await tester.enterText(find.byKey(const Key('search')), 'no match');
    await tester.pumpAndSettle();
    expect(find.text('No matching members'), findsOneWidget);
    await tester.tap(find.byKey(const Key('clear')));
    await tester.pumpAndSettle();
    expect(field.focusNode!.hasFocus, isTrue);
    expect(find.byKey(const Key('morgan')), findsOneWidget);
    await tester.enterText(find.byKey(const Key('search')), 'active');
    await tester.pumpAndSettle();
    expect(find.text('Showing 2 of 2 members'), findsOneWidget);
  });

  testWidgets('empty picker is bounded and cannot select a value', (
    tester,
  ) async {
    final selected = <String>[];
    await tester.pumpWidget(
      harness(members: [], value: null, changed: selected.add),
    );
    await tester.tap(find.byType(InkWell).first);
    await tester.pumpAndSettle();
    expect(find.text('No members available'), findsOneWidget);
    expect(
      tester.widget<TextField>(find.byKey(const Key('search'))).enabled,
      isFalse,
    );
    expect(find.byType(ListTile), findsNothing);
    expect(selected, isEmpty);
  });

  for (final loading in [false, true]) {
    testWidgets('${loading ? 'loading' : 'disabled'} picker blocks selection', (
      tester,
    ) async {
      final selected = <String>[];
      await tester.pumpWidget(
        harness(enabled: loading, loading: loading, changed: selected.add),
      );
      await tester.tap(find.byType(InkWell).first);
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('Choose payer member'), findsNothing);
      expect(selected, isEmpty);
      if (loading) expect(find.text('Loading members'), findsOneWidget);
    });
  }

  testWidgets(
    'retry remains actionable and prevents duplicate in-flight callbacks',
    (tester) async {
      final done = Completer<void>();
      var calls = 0;
      await tester.pumpWidget(
        harness(
          error: 'Could not load members.',
          retry: () {
            calls++;
            return done.future;
          },
        ),
      );
      await tester.tap(find.text('Retry loading members'));
      await tester.tap(find.text('Retry loading members'));
      await tester.pump();
      expect(calls, 1);
      expect(find.text('Loading members'), findsOneWidget);
      done.complete();
      await tester.pumpAndSettle();
      expect(find.text('Retry loading members'), findsOneWidget);
      await tester.tap(find.byType(InkWell).first);
      await tester.pumpAndSettle();
      expect(find.text('Choose payer member'), findsNothing);
    },
  );

  testWidgets('keyboard opens closes and restores picker focus', (
    tester,
  ) async {
    await tester.pumpWidget(harness());
    final ink = tester.widget<InkWell>(find.byType(InkWell).first);
    ink.focusNode!.requestFocus();
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    expect(find.text('Choose payer member'), findsOneWidget);
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pumpAndSettle();
    expect(find.text('Choose payer member'), findsNothing);
    expect(ink.focusNode!.hasFocus, isTrue);
  });

  testWidgets('semantics expose field action and selected member', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    try {
      await tester.pumpWidget(harness());
      expect(find.bySemanticsLabel(RegExp('Paid by')), findsWidgets);
      await tester.tap(find.byType(InkWell).first);
      await tester.pumpAndSettle();
      final node = tester.getSemantics(find.byKey(const Key('taylor')));
      expect(node.flagsCollection.isSelected == Tristate.isTrue, isTrue);
      expect(node.getSemanticsData().hasAction(SemanticsAction.tap), isTrue);
    } finally {
      semantics.dispose();
    }
  });

  testWidgets('host value and availability changes are respected while open', (
    tester,
  ) async {
    final selected = <String>[];
    await tester.pumpWidget(harness(changed: selected.add));
    await tester.pumpWidget(harness(value: 'morgan-id', changed: selected.add));
    expect(find.text('Morgan'), findsOneWidget);
    await tester.tap(find.byType(InkWell).first);
    await tester.pumpAndSettle();
    await tester.pumpWidget(harness(enabled: false, changed: selected.add));
    await tester.tap(find.byKey(const Key('taylor')));
    await tester.pumpAndSettle();
    expect(selected, isEmpty);
  });

  testWidgets(
    'large text preserves labels actions and sheet with keyboard inset',
    (tester) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(harness(scale: 2));
      expect(tester.takeException(), isNull);
      await tester.tap(find.byType(InkWell).first);
      await tester.pumpAndSettle();
      tester.view.viewInsets = const FakeViewPadding(bottom: 280);
      addTearDown(tester.view.resetViewInsets);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.scrollUntilVisible(
        find.byKey(const Key('morgan')),
        100,
        scrollable: find
            .descendant(
              of: find.byType(BottomSheet),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('morgan')));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.byType(BottomSheet), findsNothing);
      expect(find.text('Morgan'), findsOneWidget);
    },
  );
}
