import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/groups/group_list_screen.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../group_bill_list_screen_test.dart' as bills;
import '../group_list_screen_test.dart' as groups;
import '../helpers/settleora_visual_test_fonts.dart';
import 'member_picker_test.dart' as component;

const output =
    '/workspace/logs/settleora-visual-qa/20260907-1043-member-picker';
const boundaryKey = Key('member-picker-capture');

Future<void> capture(WidgetTester tester, String name) async {
  expect(tester.takeException(), isNull);
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.byKey(boundaryKey),
    );
    final image = await boundary.toImage(pixelRatio: 1);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await File('$output/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

void main() {
  testWidgets(
    'captures shared member picker states and representative screens',
    (tester) async {
      await tester.runAsync(() async {
        await loadSettleoraVisualTestFonts();
        await Directory(output).create(recursive: true);
      });
      await setSettleoraMobileViewport(tester);
      Future<void> pump(Widget app) async {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpWidget(RepaintBoundary(key: boundaryKey, child: app));
        await tester.pump(const Duration(milliseconds: 400));
      }

      await pump(component.harness());
      await capture(tester, 'selected');
      await tester.tap(find.byType(InkWell).first);
      await tester.pumpAndSettle();
      await capture(tester, 'search-list');
      await tester.enterText(find.byKey(const Key('search')), 'nobody');
      await tester.pumpAndSettle();
      await capture(tester, 'no-match');
      await pump(component.harness(members: [], value: null));
      await tester.tap(find.byType(InkWell).first);
      await tester.pumpAndSettle();
      await capture(tester, 'empty');
      await pump(component.harness(enabled: false));
      await capture(tester, 'disabled');
      await pump(component.harness(loading: true));
      await capture(tester, 'loading');
      await pump(
        component.harness(
          error: 'Could not load members. Try again.',
          retry: () async {},
        ),
      );
      await capture(tester, 'error-retry');
      await pump(
        MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: SettleoraTheme.light(),
          home: SettleoraGroupBillCreateScreen(
            billRepository: bills.FakeBillRepository(),
            groupRepository: bills.FakeGroupRepository(
              members: [
                bills.sampleMember(displayName: 'Taylor'),
                bills.sampleMember(
                  userProfileId: 'morgan-id',
                  displayName: 'Morgan',
                ),
              ],
            ),
            groupId: '11111111-1111-1111-1111-111111111111',
            groupName: 'Trip Crew',
          ),
        ),
      );
      await tester.pumpAndSettle();
      final step = find.byKey(const Key('group-bill-create-step-payers'));
      await tester.ensureVisible(step);
      await tester.tap(step);
      await tester.pumpAndSettle();
      final add = find.byKey(const Key('group-bill-add-payer'));
      await tester.ensureVisible(add);
      await tester.tap(add);
      await tester.pumpAndSettle();
      final field = find.byKey(const Key('group-bill-payer-member-0'));
      await tester.ensureVisible(field);
      await tester.tap(field);
      await tester.pumpAndSettle();
      expect(find.byType(SettleoraMemberSearchField), findsOneWidget);
      await capture(tester, 'group-bill-payer-list');
      await tester.tap(find.text('Morgan').last);
      await tester.pumpAndSettle();
      await tester.ensureVisible(field);
      await capture(tester, 'group-bill-payer-selected');
      await pump(
        MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: SettleoraTheme.light(),
          home: SettleoraGroupDetailScreen(
            repository: groups.FakeGroupRepository(
              members: [
                groups.sampleMember(displayName: 'Taylor'),
                groups.sampleMember(
                  userProfileId: 'morgan-id',
                  displayName: 'Morgan',
                ),
              ],
            ),
            billRepository: groups.FakeBillRepository(),
            groupId: '11111111-1111-1111-1111-111111111111',
          ),
        ),
      );
      await tester.pumpAndSettle();
      final search = find.byKey(const Key('group-member-search'));
      await tester.ensureVisible(search);
      await tester.enterText(search, 'mor');
      await tester.pumpAndSettle();
      expect(find.byType(SettleoraMemberSearchField), findsOneWidget);
      await capture(tester, 'group-detail-member-search');
    },
  );
}
