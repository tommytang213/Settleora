import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../group_bill_list_screen_test.dart' as group;
import '../helpers/settleora_visual_test_fonts.dart';

const _visualOutputDir =
    '/workspace/logs/settleora-visual-qa/20260622-1650-mobile-group-bill-money-fields';

const _groupId = '11111111-1111-1111-1111-111111111111';
const _profileId = '55555555-5555-5555-5555-555555555555';
const _otherProfileId = '66666666-6666-6666-6666-666666666666';

void main() {
  testWidgets('captures group bill money fields visual QA evidence', (
    tester,
  ) async {
    await tester.runAsync(() async {
      await loadSettleoraVisualTestFonts();
      await Directory(_visualOutputDir).create(recursive: true);
    });
    await setSettleoraMobileViewport(tester);

    const showcaseKey = Key('group-bill-money-fields-showcase-capture');
    await _pumpGroupBillCreate(tester, showcaseKey);
    await _openCreate(tester);
    await _goToGroupBillCreateStep(tester, 'basics');
    await _captureBoundary(
      tester,
      showcaseKey,
      'group-bill-money-fields-showcase-390x844.png',
    );

    const itemKey = Key('group-bill-item-money-fields-capture');
    await _pumpGroupBillCreate(tester, itemKey);
    await _openCreate(tester);
    await _goToGroupBillCreateStep(tester, 'receiptItems');
    await tester.enterText(
      find.byKey(const Key('group-bill-item-name-0')),
      'Noodles',
    );
    await tester.enterText(
      find.byKey(const Key('group-bill-item-quantity-0')),
      '2',
    );
    await tester.enterText(
      find.byKey(const Key('group-bill-item-unit-amount-0')),
      '36.50',
    );
    await tester.ensureVisible(
      find.byKey(const Key('group-bill-item-amount-0')),
    );
    await tester.pumpAndSettle();
    await _captureBoundary(
      tester,
      itemKey,
      'group-bill-create-item-money-fields-390x844.png',
    );

    const payerKey = Key('group-bill-payer-money-fields-capture');
    await _pumpGroupBillCreate(tester, payerKey);
    await _openCreate(tester);
    await _goToGroupBillCreateStep(tester, 'receiptItems');
    await tester.enterText(
      find.byKey(const Key('group-bill-item-name-0')),
      'Noodles',
    );
    await tester.enterText(
      find.byKey(const Key('group-bill-item-amount-0')),
      '73.00',
    );
    await _goToGroupBillCreateStep(tester, 'payers');
    await tester.ensureVisible(
      find.byKey(const Key('group-bill-payer-amount-0')),
    );
    await tester.pumpAndSettle();
    await _captureBoundary(
      tester,
      payerKey,
      'group-bill-create-payer-money-fields-390x844.png',
    );
  });
}

Future<void> _pumpGroupBillCreate(WidgetTester tester, Key boundaryKey) async {
  await tester.pumpWidget(
    RepaintBoundary(
      key: boundaryKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.light(),
        home: SettleoraGroupBillListScreen(
          repository: group.FakeBillRepository(),
          groupRepository: group.FakeGroupRepository(
            members: [
              group.sampleMember(
                userProfileId: _profileId,
                displayName: 'Taylor',
              ),
              group.sampleMember(
                userProfileId: _otherProfileId,
                displayName: 'Morgan',
              ),
            ],
          ),
          currentUserProfileId: _profileId,
          groupId: _groupId,
          groupName: 'Trip Crew',
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _openCreate(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('group-bill-list-create')));
  await tester.pumpAndSettle();
}

Future<void> _goToGroupBillCreateStep(
  WidgetTester tester,
  String stepName,
) async {
  await tester.ensureVisible(
    find.byKey(ValueKey('group-bill-create-step-$stepName')),
  );
  await tester.tap(find.byKey(ValueKey('group-bill-create-step-$stepName')));
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
