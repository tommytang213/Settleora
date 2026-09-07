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

const _capture = Key('bill-detail-search-capture');
const _output =
    '/workspace/logs/settleora-visual-qa/20260907-2358-bill-detail-search';
const _filters = {
  'all': 'All',
  'items': 'Items',
  'participants': 'Participants',
  'payers': 'Payers',
  'adjustments': 'Adjustments',
  'needsResponse': 'Needs response',
  'rejected': 'Rejected',
};

Future<void> _tap(WidgetTester tester, Finder target) async {
  await tester.ensureVisible(target);
  await tester.pumpAndSettle();
  await tester.tap(target);
  await tester.pumpAndSettle();
}

Future<void> _png(WidgetTester tester, String name) async {
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
      final prefix =
          '${isGroup ? 'group' : 'personal'}-${narrow ? '320-2x' : '390-1x'}';
      testWidgets('$prefix production detail search mechanics and captures', (
        tester,
      ) async {
        final semantics = tester.ensureSemantics();
        final detail = personal.sampleBillDetail(
          status: 'confirmed',
          items: const [
            SettleoraBillItem(
              id: 'private-item',
              name: 'Coffee beans',
              note: 'Morning roast',
              amount: '16.50',
              currency: 'USD',
              sortOrder: 0,
            ),
            SettleoraBillItem(
              id: 'private-milk',
              name: 'Milk',
              note: null,
              amount: '10.00',
              currency: 'USD',
              sortOrder: 1,
            ),
          ],
          participants: const [
            SettleoraBillParticipant(
              userProfileId: 'private-current-profile',
              status: SettleoraBillParticipantStatusValues.pendingAcceptance,
              resolvedShareAmount: '5.25',
              resolvedShareCurrency: 'USD',
            ),
            SettleoraBillParticipant(
              userProfileId: 'private-rejected-profile',
              status: SettleoraBillParticipantStatusValues.rejected,
              resolvedShareAmount: '8.75',
              resolvedShareCurrency: 'USD',
              rejectionReasonCode:
                  SettleoraBillParticipantRejectionReasonCodeValues.wrongAmount,
            ),
          ],
          payers: const [
            SettleoraBillPayer(
              userProfileId: 'private-current-profile',
              amount: '26.50',
              currency: 'USD',
            ),
          ],
          adjustments: const [
            SettleoraBillAdjustment(
              id: 'private-adjustment',
              type: 'service_charge',
              direction: 'charge',
              amount: '1.20',
              currency: 'USD',
              reasonNote: 'Weekend service',
              sortOrder: 0,
            ),
          ],
        );
        final personalRepository = personal.FakeBillRepository(detail: detail);
        final groupRepository = group.FakeBillRepository(detail: detail);
        List<int> calls() => isGroup
            ? [
                groupRepository.listGroupCalls,
                groupRepository.getGroupCalls,
                groupRepository.createPersonalCalls,
                groupRepository.createGroupCalls,
                groupRepository.submitGroupCalls,
                groupRepository.acceptGroupParticipantCalls,
                groupRepository.rejectGroupParticipantCalls,
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
                  ? SettleoraGroupBillDetailScreen(
                      repository: groupRepository,
                      groupId: 'private-group',
                      groupName: 'Trip Crew',
                      billId: detail.id,
                      currentUserProfileId: 'private-current-profile',
                      participantDisplayNames: const {
                        'private-current-profile': 'Morgan',
                      },
                    )
                  : SettleoraBillDetailScreen(
                      repository: personalRepository,
                      billId: detail.id,
                    ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        final initialCalls = calls();
        final search = find.byKey(const Key('bill-detail-search'));
        final overall = find.byKey(const Key('bill-detail-clear-filters'));
        Finder chip(String name) =>
            find.byKey(ValueKey('bill-detail-filter-$name'));
        TextField field() => tester.widget<TextField>(
          find.descendant(of: search, matching: find.byType(TextField)),
        );
        Future<void> query(String value) async {
          await tester.ensureVisible(search);
          await tester.pumpAndSettle();
          await tester.enterText(search, value);
          await tester.pumpAndSettle();
        }

        Future<void> capture(String state, {bool clearVisible = false}) async {
          await tester.ensureVisible(clearVisible ? overall : search);
          await tester.pumpAndSettle();
          await _png(tester, '$prefix-$state');
        }

        void count(int visible) => expect(
          tester
              .widget<Text>(find.byKey(const Key('bill-detail-visible-count')))
              .data,
          '$visible of 6 bill details visible.',
        );
        await tester.scrollUntilVisible(
          search,
          250,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.pumpAndSettle();
        expect(tester.widget(search), isA<AppTextField>());
        expect(tester.widget<AppTextField>(search).label, 'Search detail rows');
        expect(field().textInputAction, TextInputAction.search);
        expect(field().autofocus, isFalse);
        expect(field().onChanged, isNotNull);
        expect(field().decoration!.suffixIcon, isNull);
        expect(
          find.descendant(of: search, matching: find.byIcon(Icons.search)),
          findsOneWidget,
        );
        final controller = field().controller!;
        void geometry() {
          final label = find.descendant(
            of: search,
            matching: find.text('Search detail rows'),
          );
          final labelRect = tester.getRect(label);
          final inputRect = tester.getRect(
            find.descendant(of: search, matching: find.byType(EditableText)),
          );
          expect(labelRect.bottom, lessThanOrEqualTo(inputRect.top));
          expect(labelRect.left, greaterThanOrEqualTo(0));
          expect(labelRect.right, lessThanOrEqualTo(narrow ? 320 : 390));
          expect(
            tester.renderObject<RenderParagraph>(label).didExceedMaxLines,
            isFalse,
          );
        }

        expect(tester.widget<AppTextField>(search).labelAbove, isTrue);
        geometry();

        for (final entry in _filters.entries) {
          final control = tester.widget<FilterChip>(chip(entry.key));
          expect((control.label as Text).data, entry.value);
          expect(control.selected, entry.key == 'all');
        }
        expect(tester.widget<TextButton>(overall).onPressed, isNull);
        count(6);
        await capture('normal');
        await query('   ');
        expect(controller.text, '   ');
        expect(tester.widget<TextButton>(overall).onPressed, isNull);
        final raw = isGroup ? '  MoRgAn  ' : '  CoFfEe  ';
        await query(raw);
        expect(field().controller, same(controller));
        expect(controller.text, raw);
        final rawValue = controller.value;
        count(1);
        expect(field().decoration!.suffixIcon, isNull);
        await capture('query');
        expect(controller.value, rawValue);
        await _tap(tester, overall);
        await _tap(tester, chip(isGroup ? 'participants' : 'items'));
        count(2);
        await capture('filter-only');
        await query(raw);
        count(1);
        await capture('intersection');
        await query('no matching details');
        count(0);
        await tester.scrollUntilVisible(
          find.text('No matching detail rows'),
          150,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.pumpAndSettle();
        expect(find.text('No matching detail rows'), findsOneWidget);
        await capture('empty', clearVisible: true);
        var notifications = 0;
        void listener() => notifications++;
        controller.addListener(listener);
        await _tap(tester, overall);
        controller.removeListener(listener);
        expect(notifications, 1);
        expect(controller.text, isEmpty);
        expect(field().controller, same(controller));
        expect(tester.widget<FilterChip>(chip('all')).selected, isTrue);
        expect(tester.widget<TextButton>(overall).onPressed, isNull);
        count(6);
        await capture('restored-rows', clearVisible: true);
        await capture('overall-clear');
        // Each safe presentation category retains the same query/filter intersection.
        for (final entry in {
          'items': ['morning', '16.50', 'milk'],
          'participants': [
            isGroup ? 'morgan' : 'participant 1',
            '5.25',
            'participant 2',
            'wrong amount',
          ],
          'payers': ['payer 1', '26.50'],
          'adjustments': ['weekend', 'service charge', '1.20'],
          'needsResponse': ['5.25'],
          'rejected': ['8.75'],
        }.entries) {
          await _tap(tester, overall);
          await _tap(tester, chip(entry.key));
          for (final text in entry.value) {
            await query(text);
            count(1);
            expect(field().controller, same(controller));
            expect(field().decoration!.suffixIcon, isNull);
          }
          await query('USD');
          count(entry.key == 'items' || entry.key == 'participants' ? 2 : 1);
        }
        await _tap(tester, overall);
        for (final id in [
          'private-current-profile',
          'private-rejected-profile',
        ]) {
          await query(id);
          count(0);
          expect(
            find
                .text(id, findRichText: true)
                .evaluate()
                .where((e) => e.widget is! EditableText),
            isEmpty,
          );
        }
        await query(isGroup ? '(you)' : 'participant 1');
        count(1);
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
        final data = tester.getSemantics(search).getSemanticsData();
        expect('Search detail rows'.allMatches(data.label).length, 1);
        var editableNodes = 0;
        void inspectSemantics(SemanticsNode node) {
          final nodeData = node.getSemanticsData();
          if (nodeData.flagsCollection.isTextField) {
            editableNodes++;
            expect(nodeData.value, raw);
          }
          node.visitChildren((child) {
            inspectSemantics(child);
            return true;
          });
        }

        inspectSemantics(tester.getSemantics(search));
        expect(editableNodes, 1);
        semantics.dispose();
        await capture('focused-inset');
        await tester.testTextInput.receiveAction(TextInputAction.search);
        await tester.pumpAndSettle();
        expect(controller.text, raw);
        expect(calls(), initialCalls);
        expect(tester.takeException(), isNull);
      });
    }
  }
}
