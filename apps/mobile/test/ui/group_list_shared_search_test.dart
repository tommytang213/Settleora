import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/groups/group_list_screen.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../group_list_screen_test.dart' as group;
import '../helpers/settleora_visual_test_fonts.dart';

const _capture = Key('group-list-search-capture');
const _output =
    '/workspace/logs/settleora-visual-qa/20260908-0050-group-list-search';

Future<void> _tap(WidgetTester tester, Finder target) async {
  await tester.ensureVisible(target);
  await tester.pumpAndSettle();
  await tester.tap(target);
  await tester.pumpAndSettle();
}

Future<void> _png(WidgetTester tester, String name) async {
  await tester.pump();
  expect(tester.takeException(), isNull, reason: name);
  await tester.runAsync(() async {
    final image = await tester
        .renderObject<RenderRepaintBoundary>(find.byKey(_capture))
        .toImage(pixelRatio: 1);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(_output).create(recursive: true);
    await File('$_output/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

void main() {
  setUpAll(loadSettleoraVisualTestFonts);

  for (final narrow in [false, true]) {
    final suffix = 'group-list-${narrow ? '320-2x' : '390-1x'}';
    testWidgets(
      '$suffix production shared search preserves host mechanics and captures',
      (tester) async {
        final semantics = tester.ensureSemantics();
        final repository = group.FakeGroupRepository(
          groups: group.sampleGroupDiscoveryRows(),
        );
        final inset = ValueNotifier<double>(0);
        addTearDown(inset.dispose);

        await setSettleoraMobileViewport(tester, width: narrow ? 320 : 390);
        await tester.pumpWidget(
          RepaintBoundary(
            key: _capture,
            child: MaterialApp(
              debugShowCheckedModeBanner: false,
              theme: SettleoraTheme.midnight(),
              builder: (context, child) => ValueListenableBuilder<double>(
                valueListenable: inset,
                builder: (context, value, _) => MediaQuery(
                  data: MediaQuery.of(context).copyWith(
                    textScaler: TextScaler.linear(narrow ? 2 : 1),
                    viewInsets: EdgeInsets.only(bottom: value),
                  ),
                  child: child!,
                ),
              ),
              home: SettleoraGroupListScreen(
                repository: repository,
                billRepository: group.FakeBillRepository(),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();

        const searchKey = Key('group-list-search');
        const clearKey = Key('group-list-search-clear');
        const overallKey = Key('group-list-clear-filters');
        const ownerKey = Key('group-list-role-filter-owner');
        const memberKey = Key('group-list-role-filter-member');
        const activeKey = Key('group-list-status-filter-active');
        const removedKey = Key('group-list-status-filter-removed');
        final search = find.byKey(searchKey);
        final clear = find.byKey(clearKey);
        final overall = find.byKey(overallKey);
        final owner = find.byKey(ownerKey);
        final member = find.byKey(memberKey);
        final active = find.byKey(activeKey);
        final removed = find.byKey(removedKey);
        Finder textField() =>
            find.descendant(of: search, matching: find.byType(TextField));
        TextField field() => tester.widget<TextField>(textField());
        TextEditingController controller() => field().controller!;
        List<int> calls() => [
          repository.listCalls,
          repository.createCalls,
          repository.getCalls,
          repository.updateCalls,
          repository.listMemberCalls,
          repository.addMemberCalls,
          repository.updateMemberCalls,
          repository.removeMemberCalls,
        ];
        Future<void> query(String value) async {
          await tester.ensureVisible(search);
          await tester.pumpAndSettle();
          await tester.enterText(textField(), value);
          await tester.pumpAndSettle();
        }

        Future<void> capture(String state) async {
          await tester.ensureVisible(search);
          await tester.pumpAndSettle();
          await _png(tester, '$suffix-$state');
        }

        void expectCount(int visible) {
          expect(
            find.text('Groups you can access: $visible of 3'),
            findsOneWidget,
          );
        }

        void expectGeometry() {
          final label = find.descendant(
            of: search,
            matching: find.text('Search by group name'),
          );
          final labelRect = tester.getRect(label);
          final editRect = tester.getRect(
            find.descendant(of: search, matching: find.byType(EditableText)),
          );
          expect(labelRect.bottom, lessThanOrEqualTo(editRect.top));
          expect(labelRect.left, greaterThanOrEqualTo(0));
          expect(labelRect.right, lessThanOrEqualTo(narrow ? 320 : 390));
          expect(
            tester.renderObject<RenderParagraph>(label).didExceedMaxLines,
            isFalse,
          );
        }

        await tester.ensureVisible(search);
        await tester.pumpAndSettle();
        expect(tester.widget(search), isA<AppTextField>());
        final sharedField = tester.widget<AppTextField>(search);
        expect(sharedField.label, 'Search by group name');
        expect(sharedField.labelAbove, isTrue);
        expect(field().textInputAction, TextInputAction.search);
        expect(field().autofocus, isFalse);
        expect(field().onChanged, isNotNull);
        expect(
          find.descendant(of: search, matching: find.byIcon(Icons.search)),
          findsOneWidget,
        );
        final originalController = controller();
        final initialCalls = calls();
        expect(initialCalls, [1, 0, 0, 0, 0, 0, 0, 0]);
        expect(clear, findsNothing);
        expect(overall, findsNothing);
        expectCount(3);
        expect(find.text('Owner (2)'), findsOneWidget);
        expect(find.text('Member (1)'), findsOneWidget);
        expect(find.text('Active (2)'), findsOneWidget);
        expect(find.text('Removed (1)'), findsOneWidget);
        expectGeometry();
        await capture('normal');

        await query('   ');
        expect(controller().text, '   ');
        expect(controller(), same(originalController));
        expect(clear, findsNothing);
        expect(overall, findsNothing);
        expectCount(3);

        await query('  DiNnEr  ');
        expect(controller().text, '  DiNnEr  ');
        expectCount(1);
        expect(find.text('Dinner Club'), findsOneWidget);
        expect(find.text('Trip Crew'), findsNothing);
        expect(clear, findsOneWidget);
        expect(tester.widget<IconButton>(clear).tooltip, 'Clear search');
        expect(tester.getSize(clear).width, greaterThanOrEqualTo(48));
        expect(tester.getSize(clear).height, greaterThanOrEqualTo(48));
        expect(
          tester.getSemantics(clear).getSemanticsData().tooltip,
          'Clear search',
        );
        expectGeometry();
        await capture('group-name-query');
        await _tap(tester, clear);
        expect(controller().text, isEmpty);
        expect(controller(), same(originalController));
        expect(clear, findsNothing);
        expect(overall, findsNothing);
        expectCount(3);
        await capture('query-only-suffix-clear');

        await query('member');
        expectCount(1);
        expect(find.text('Dinner Club'), findsOneWidget);
        await capture('role-label-query');
        await _tap(tester, clear);

        await query('removed');
        expectCount(1);
        expect(find.text('Archive Team'), findsOneWidget);
        await capture('status-label-query');
        await _tap(tester, clear);

        await _tap(tester, owner);
        expect(tester.widget<ChoiceChip>(owner).selected, isTrue);
        expectCount(2);
        expect(overall, findsOneWidget);
        await capture('role-filter-only');
        await _tap(tester, owner);

        await _tap(tester, removed);
        expect(tester.widget<ChoiceChip>(removed).selected, isTrue);
        expectCount(1);
        await capture('status-filter-only');
        await _tap(tester, removed);

        await _tap(tester, member);
        await query('dinner');
        expect(tester.widget<ChoiceChip>(member).selected, isTrue);
        expectCount(1);
        await capture('query-role-intersection');
        await _tap(tester, clear);
        expect(tester.widget<ChoiceChip>(member).selected, isTrue);
        expectCount(1);
        await capture('suffix-preserves-role');
        await _tap(tester, member);

        await _tap(tester, removed);
        await query('owner');
        expect(tester.widget<ChoiceChip>(removed).selected, isTrue);
        expectCount(1);
        expect(find.text('Archive Team'), findsOneWidget);
        await capture('query-status-intersection');
        await _tap(tester, clear);
        expect(tester.widget<ChoiceChip>(removed).selected, isTrue);
        expectCount(1);
        await _tap(tester, removed);

        await _tap(tester, owner);
        await _tap(tester, removed);
        await query('archive');
        expect(tester.widget<ChoiceChip>(owner).selected, isTrue);
        expect(tester.widget<ChoiceChip>(removed).selected, isTrue);
        expectCount(1);
        await capture('query-role-status-intersection');
        await _tap(tester, clear);
        expect(tester.widget<ChoiceChip>(owner).selected, isTrue);
        expect(tester.widget<ChoiceChip>(removed).selected, isTrue);
        expectCount(1);
        await capture('suffix-preserves-role-status');
        await _tap(tester, overall);
        expect(controller().text, isEmpty);
        expect(tester.widget<ChoiceChip>(owner).selected, isFalse);
        expect(tester.widget<ChoiceChip>(member).selected, isFalse);
        expect(tester.widget<ChoiceChip>(active).selected, isFalse);
        expect(tester.widget<ChoiceChip>(removed).selected, isFalse);
        expect(overall, findsNothing);
        expectCount(3);

        await _tap(tester, member);
        await query('trip');
        expectCount(0);
        expect(find.text('No matching groups'), findsOneWidget);
        expect(
          find.text(
            'No groups match this search. Clear filters to review your groups.',
          ),
          findsOneWidget,
        );
        await capture('filtered-empty');
        await _tap(tester, overall);
        expect(controller().text, isEmpty);
        expect(tester.widget<ChoiceChip>(member).selected, isFalse);
        expect(overall, findsNothing);
        expectCount(3);
        await capture('overall-clear-reset');

        await query('11111111-1111-1111-1111-111111111111');
        expectCount(0);
        expect(find.text('Trip Crew'), findsNothing);
        await _tap(tester, overall);
        expect(find.text('Trip Crew'), findsOneWidget);

        await query('club');
        inset.value = 300;
        await tester.pumpAndSettle();
        await tester.ensureVisible(search);
        await tester.pumpAndSettle();
        expect(
          tester
              .widget<EditableText>(
                find.descendant(
                  of: search,
                  matching: find.byType(EditableText),
                ),
              )
              .focusNode
              .hasFocus,
          isTrue,
        );
        expectGeometry();
        await capture('focused-inset');
        await tester.testTextInput.receiveAction(TextInputAction.search);
        await tester.pumpAndSettle();
        expect(controller().text, 'club');
        expect(calls(), initialCalls);
        expect(find.byKey(const Key('group-member-search')), findsNothing);
        semantics.dispose();
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets('true-empty group list keeps discovery controls absent', (
    tester,
  ) async {
    final repository = group.FakeGroupRepository(groups: const []);
    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupListScreen(
          repository: repository,
          billRepository: group.FakeBillRepository(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('No groups'), findsOneWidget);
    expect(find.text('No matching groups'), findsNothing);
    expect(find.byKey(const Key('group-list-search')), findsNothing);
    expect(find.byKey(const Key('group-list-clear-filters')), findsNothing);
  });
}
