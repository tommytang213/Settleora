import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/bills/bill_repository.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../bill_list_screen_test.dart' as personal;
import '../group_bill_list_screen_test.dart' as group;
import '../helpers/settleora_visual_test_fonts.dart';

const _capture = Key('bill-list-search-capture');
final _output = settleoraVisualOutputDirectory(
  '20260907-2301-bill-list-search',
);

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
  for (final isGroup in [false, true]) {
    for (final narrow in [false, true]) {
      final prefix = isGroup ? 'group-bill-list' : 'bill-list';
      final label = isGroup ? 'Search group bills' : 'Search bills';
      final chipPrefix = isGroup ? 'group-bill' : 'bill-list';
      final suffix = '$prefix-${narrow ? '320-2x' : '390-1x'}';
      testWidgets(
        '$suffix production shared search preserves host mechanics and captures',
        (tester) async {
          final semantics = tester.ensureSemantics();

          final rows = group.filteredBillSummaries();
          final profile = rows.first.participants.first.userProfileId;
          final other = rows.first.participants.last.userProfileId;
          final personalRepository = personal.FakeBillRepository(
            bills: [
              personal.sampleBillSummary(
                id: 'private-draft-id',
                merchantName: 'Corner Market',
              ),
              personal.sampleBillSummary(
                id: 'private-archive-id',
                merchantName: 'Train Tickets',
                status: 'confirmed',
                totalCurrency: 'EUR',
                archiveState: SettleoraBillArchiveStateValues.archived,
              ),
            ],
          );
          final groupRepository = group.FakeBillRepository(groupBills: rows);
          final members = group.FakeGroupRepository(
            members: [
              group.sampleMember(userProfileId: profile, displayName: 'Taylor'),
              group.sampleMember(userProfileId: other, displayName: 'Morgan'),
            ],
          );
          List<int> calls() => isGroup
              ? [
                  groupRepository.listGroupCalls,
                  groupRepository.getGroupCalls,
                  groupRepository.createPersonalCalls,
                  groupRepository.createGroupCalls,
                  groupRepository.submitGroupCalls,
                  groupRepository.acceptGroupParticipantCalls,
                  groupRepository.rejectGroupParticipantCalls,
                  members.listMemberCalls,
                ]
              : [
                  personalRepository.listCalls,
                  personalRepository.getCalls,
                  personalRepository.createCalls,
                  personalRepository.groupCreateCalls,
                  personalRepository.submitGroupCalls,
                  personalRepository.listGroupCalls,
                  personalRepository.getGroupCalls,
                ];
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
                home: isGroup
                    ? SettleoraGroupBillListScreen(
                        repository: groupRepository,
                        groupRepository: members,
                        groupId: 'fixture-group-route',
                        groupName: 'Trip Crew',
                        currentUserProfileId: profile,
                      )
                    : SettleoraBillListScreen(
                        repository: personalRepository,
                        syncController: personal.sampleBillSyncController(),
                      ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          final initialCalls = calls();
          final search = find.byKey(Key('$prefix-search'));
          final clear = find.byKey(Key('$prefix-clear-search'));
          final overall = find.byKey(Key('$prefix-clear-filters'));
          Finder chip(String name) =>
              find.byKey(ValueKey('$chipPrefix-filter-$name'));
          TextField field() => tester.widget<TextField>(
            find.descendant(of: search, matching: find.byType(TextField)),
          );
          Future<void> query(String value) async {
            await tester.ensureVisible(search);
            await tester.pumpAndSettle();
            await tester.enterText(search, value);
            await tester.pumpAndSettle();
          }

          Future<void> capture(String state) async {
            await tester.ensureVisible(search);
            await tester.pumpAndSettle();
            await _png(tester, '$suffix-$state');
          }

          await tester.scrollUntilVisible(
            search,
            250,
            scrollable: find.byType(Scrollable).first,
          );
          await tester.pumpAndSettle();
          expect(tester.widget(search), isA<AppTextField>());
          expect(tester.widget<AppTextField>(search).label, label);
          expect(field().textInputAction, TextInputAction.search);
          expect(field().autofocus, isFalse);
          expect(field().onChanged, isNotNull);
          expect(
            find.descendant(of: search, matching: find.byIcon(Icons.search)),
            findsOneWidget,
          );
          final controller = field().controller!;
          expect(tester.widget<AppTextField>(search).labelAbove, isTrue);
          void geometry() {
            final labelRect = tester.getRect(
              find.descendant(of: search, matching: find.text(label)),
            );
            final editRect = tester.getRect(
              find.descendant(of: search, matching: find.byType(EditableText)),
            );
            expect(labelRect.bottom, lessThanOrEqualTo(editRect.top));
            expect(labelRect.left, greaterThanOrEqualTo(0));
            expect(labelRect.right, lessThanOrEqualTo(narrow ? 320 : 390));
            final paragraph = tester.renderObject<RenderParagraph>(
              find.descendant(of: search, matching: find.text(label)),
            );
            expect(paragraph.didExceedMaxLines, isFalse);
          }

          expect(clear, findsNothing);
          expect(tester.widget<TextButton>(overall).onPressed, isNull);
          expect(
            find.text(
              '${isGroup ? 6 : 2} of ${isGroup ? 6 : 2} loaded rows visible.',
            ),
            findsOneWidget,
          );
          final counts = {
            for (final c in tester.widgetList<FilterChip>(
              find.byType(FilterChip),
            ))
              c.key: (c.label as Text).data,
          };
          expect(counts.values, contains('All (${isGroup ? 6 : 2})'));
          geometry();
          await capture('normal');
          await query('   ');
          expect(controller.text, '   ');
          expect(clear, findsNothing);
          expect(tester.widget<TextButton>(overall).onPressed, isNull);
          final raw = isGroup ? '  MoRgAn  ' : '  EuR  ';
          await query(raw);
          expect(field().controller, same(controller));
          expect(controller.text, raw);
          final value = controller.value;
          expect(clear, findsOneWidget);
          expect(tester.widget<IconButton>(clear).tooltip, 'Clear search');
          expect(tester.getSize(clear).width, greaterThanOrEqualTo(48));
          expect(tester.getSize(clear).height, greaterThanOrEqualTo(48));
          expect(
            tester.getSemantics(clear).getSemanticsData().tooltip,
            'Clear search',
          );
          expect(
            find.text(
              '${isGroup ? 3 : 1} of ${isGroup ? 6 : 2} loaded rows visible.',
            ),
            findsOneWidget,
          );
          expect(
            find.text(isGroup ? 'Accepted Current' : 'Corner Market'),
            findsNothing,
          );
          geometry();
          final clearData = tester.getSemantics(clear).getSemanticsData();
          expect(clearData.hasAction(ui.SemanticsAction.tap), isTrue);
          var clearNodes = 0;
          void countClear(SemanticsNode node) {
            if (node.getSemanticsData().tooltip == 'Clear search') clearNodes++;
            node.visitChildren((child) {
              countClear(child);
              return true;
            });
          }

          countClear(tester.getSemantics(search));
          expect(clearNodes, 1);
          await capture('query');
          expect(controller.value, value);
          await _tap(tester, clear);
          expect(controller.text, isEmpty);
          expect(tester.widget<FilterChip>(chip('all')).selected, isTrue);
          await capture('query-only-clear');
          final filter = isGroup ? 'youAccepted' : 'archived';
          await _tap(tester, chip(filter));
          expect(clear, findsNothing);
          expect(tester.widget<TextButton>(overall).onPressed, isNotNull);
          expect(
            find.text(
              '${isGroup ? 2 : 1} of ${isGroup ? 6 : 2} loaded rows visible.',
            ),
            findsOneWidget,
          );
          await capture('filter-only');
          await query(raw);
          expect(tester.widget<FilterChip>(chip(filter)).selected, isTrue);
          expect(
            find.text('1 of ${isGroup ? 6 : 2} loaded rows visible.'),
            findsOneWidget,
          );
          await capture('intersection');
          await _tap(tester, clear);
          expect(controller.text, isEmpty);
          expect(field().controller, same(controller));
          expect(tester.widget<FilterChip>(chip(filter)).selected, isTrue);
          expect(
            find.text(
              '${isGroup ? 2 : 1} of ${isGroup ? 6 : 2} loaded rows visible.',
            ),
            findsOneWidget,
          );
          await capture('suffix-preserves-filter');
          await query('no matching merchant');
          expect(
            find.text(
              isGroup ? 'No matching group bills' : 'No matching bills',
            ),
            findsOneWidget,
          );
          expect(
            find.text('0 of ${isGroup ? 6 : 2} loaded rows visible.'),
            findsOneWidget,
          );
          await capture('empty');
          await _tap(tester, overall);
          expect(controller.text, isEmpty);
          expect(tester.widget<FilterChip>(chip('all')).selected, isTrue);
          expect(tester.widget<TextButton>(overall).onPressed, isNull);
          expect({
            for (final c in tester.widgetList<FilterChip>(
              find.byType(FilterChip),
            ))
              c.key: (c.label as Text).data,
          }, counts);
          await capture('overall-clear');
          // IDs not explicitly in the existing helper must not enter search through adoption.
          await query(isGroup ? 'fixture-group-route' : 'private-draft-id');
          expect(
            find.text('0 of ${isGroup ? 6 : 2} loaded rows visible.'),
            findsOneWidget,
          );
          await _tap(tester, overall);
          await query(raw);
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
          geometry();
          await capture('focused-inset');
          await tester.testTextInput.receiveAction(TextInputAction.search);
          await tester.pumpAndSettle();
          expect(controller.text, raw);
          semantics.dispose();
          expect(calls(), initialCalls);
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
}
