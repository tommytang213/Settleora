import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/.dart_tool/flutter_gen/gen_l10n/app_localizations.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/groups/group_list_screen.dart';
import 'package:mobile/help/contextual_help.dart';
import 'package:mobile/recurring_bills/recurring_bill_screen.dart';
import 'package:mobile/settlements/settlement_list_screen.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../bill_list_screen_test.dart' as bills;
import '../group_bill_list_screen_test.dart' as group_bills;
import '../group_list_screen_test.dart' as groups;
import '../helpers/settleora_visual_test_fonts.dart';
import '../recurring_bill_screen_test.dart' as recurring;
import '../settlement_list_screen_test.dart' as settlements;

const _outputDirectory =
    '/workspace/logs/issue-1181-contextual-help-localization/visual-evidence/candidate-b';
const _captureKey = Key('contextual-help-candidate-b-capture');

void main() {
  testWidgets('captures bills contextual help', (tester) async {
    await _prepare(tester);
    await _pump(
      tester,
      SettleoraBillListScreen(
        repository: bills.FakeBillRepository(),
        syncController: bills.sampleBillSyncController(),
      ),
    );
    await _capturePair(tester, SettleoraHelpTopic.bills, 'bills');
  }, tags: ['visual']);

  testWidgets('captures groups contextual help', (tester) async {
    await _prepare(tester);
    await _pump(
      tester,
      SettleoraGroupListScreen(
        repository: groups.FakeGroupRepository(),
        billRepository: groups.FakeBillRepository(),
      ),
    );
    await _capturePair(tester, SettleoraHelpTopic.groups, 'groups');
  }, tags: ['visual']);

  testWidgets('captures group bills contextual help', (tester) async {
    await _prepare(tester);
    await _pump(
      tester,
      SettleoraGroupBillListScreen(
        repository: group_bills.FakeBillRepository(),
        groupRepository: group_bills.FakeGroupRepository(),
        groupId: 'group-1',
        groupName: 'Trip Crew',
      ),
    );
    await _capturePair(tester, SettleoraHelpTopic.bills, 'group-bills');
  }, tags: ['visual']);

  testWidgets('captures settlements contextual help', (tester) async {
    await _prepare(tester);
    await _pump(
      tester,
      SettleoraSettlementListScreen(
        repository: settlements.FakeSettlementRepository(),
        currentUserProfileId: 'current-user',
      ),
    );
    await _capturePair(tester, SettleoraHelpTopic.settlements, 'settlements');
  }, tags: ['visual']);

  testWidgets('captures recurring contextual help', (tester) async {
    await _prepare(tester);
    await _pump(
      tester,
      SettleoraRecurringBillScreen(
        repository: recurring.FakeRecurringBillRepository(),
      ),
    );
    await _capturePair(tester, SettleoraHelpTopic.recurring, 'recurring');
  }, tags: ['visual']);

  testWidgets('captures groups contextual help at 320px and 2x text scale', (
    tester,
  ) async {
    await _prepare(tester, width: 320, height: 760);
    await _pump(
      tester,
      SettleoraGroupListScreen(
        repository: groups.FakeGroupRepository(),
        billRepository: groups.FakeBillRepository(),
      ),
      textScaler: const TextScaler.linear(2),
    );
    await _capturePair(
      tester,
      SettleoraHelpTopic.groups,
      'groups',
      captureClose: true,
      dimensions: '320x760-2x',
    );
  }, tags: ['visual']);

  testWidgets(
    'captures settlements contextual help at 320px and 2x text scale',
    (tester) async {
      await _prepare(tester, width: 320, height: 760);
      await _pump(
        tester,
        SettleoraSettlementListScreen(
          repository: settlements.FakeSettlementRepository(),
          currentUserProfileId: 'current-user',
        ),
        textScaler: const TextScaler.linear(2),
      );
      await _capturePair(
        tester,
        SettleoraHelpTopic.settlements,
        'settlements',
        captureClose: true,
        dimensions: '320x760-2x',
      );
    },
    tags: ['visual'],
  );
}

Future<void> _prepare(
  WidgetTester tester, {
  double width = 390,
  double height = 844,
}) async {
  await tester.runAsync(() async {
    await loadSettleoraVisualTestFonts();
    await Directory(_outputDirectory).create(recursive: true);
  });
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Future<void> _pump(
  WidgetTester tester,
  Widget home, {
  TextScaler textScaler = TextScaler.noScaling,
}) async {
  await tester.pumpWidget(
    RepaintBoundary(
      key: _captureKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.midnight(),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: textScaler),
          child: child!,
        ),
        home: home,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _capturePair(
  WidgetTester tester,
  SettleoraHelpTopic topic,
  String stem, {
  bool captureClose = false,
  String dimensions = '390x844-1x',
}) async {
  await _capture(tester, '$stem-help-entry-$dimensions.png');
  await tester.tap(find.byKey(Key('contextual-help-${topic.keyName}')));
  await tester.pumpAndSettle();
  await _capture(tester, '$stem-help-open-$dimensions.png');
  if (captureClose) {
    await tester.scrollUntilVisible(
      find.byKey(Key('contextual-help-close-${topic.keyName}')),
      120,
      scrollable: find.byType(Scrollable).last,
    );
    await _capture(tester, '$stem-help-close.png');
  }
}

Future<void> _capture(WidgetTester tester, String name) async {
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.byKey(_captureKey),
    );
    final image = await boundary.toImage(pixelRatio: 1);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await File(
      '$_outputDirectory/$name',
    ).writeAsBytes(bytes!.buffer.asUint8List());
  });
}
