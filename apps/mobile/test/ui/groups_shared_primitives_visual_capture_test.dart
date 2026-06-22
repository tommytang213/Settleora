import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/groups/group_list_screen.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../group_list_screen_test.dart' as groups;
import '../helpers/settleora_visual_test_fonts.dart';

const _visualOutputDir =
    '/workspace/logs/settleora-visual-qa/20260623-0055-mobile-groups-notifications-shared-primitives';

void main() {
  testWidgets('captures groups shared primitive visual evidence', (
    tester,
  ) async {
    await tester.runAsync(() async {
      await loadSettleoraVisualTestFonts();
      await Directory(_visualOutputDir).create(recursive: true);
    });
    await setSettleoraMobileViewport(tester);

    final repository = groups.FakeGroupRepository(
      groups: groups.sampleGroupDiscoveryRows(),
      members: [
        groups.sampleMember(displayName: 'Taylor'),
        groups.sampleMember(
          userProfileId: '99999999-9999-9999-9999-999999999999',
          displayName: 'Morgan',
        ),
      ],
    );
    const captureKey = Key('groups-shared-primitives-capture');

    await tester.pumpWidget(
      RepaintBoundary(
        key: captureKey,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: SettleoraTheme.light(),
          home: SettleoraGroupListScreen(
            repository: repository,
            billRepository: groups.FakeBillRepository(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(SettleoraStatePanel), findsNothing);
    await _captureBoundary(
      tester,
      captureKey,
      'groups-list-shared-primitives-390x844.png',
    );

    await tester.tap(find.text('Trip Crew'));
    await tester.pumpAndSettle();
    expect(find.byType(SettleoraSection), findsWidgets);
    expect(find.byType(SettleoraKeyValueText), findsWidgets);
    expect(find.text('Taylor'), findsOneWidget);
    await _captureBoundary(
      tester,
      captureKey,
      'groups-detail-shared-primitives-390x844.png',
    );
  });
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
