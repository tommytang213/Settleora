import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/notifications/notification_screen.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../helpers/settleora_visual_test_fonts.dart';
import '../notification_screen_test.dart' as notifications;

const _visualOutputDir =
    '/workspace/logs/settleora-visual-qa/20260623-0055-mobile-groups-notifications-shared-primitives';

void main() {
  testWidgets('captures notifications shared primitive visual evidence', (
    tester,
  ) async {
    await tester.runAsync(() async {
      await loadSettleoraVisualTestFonts();
      await Directory(_visualOutputDir).create(recursive: true);
    });
    await setSettleoraMobileViewport(tester);

    final repository = notifications.FakeNotificationRepository(
      notifications: [
        notifications.sampleNotification(
          safeSummary: 'Personal bill ready.',
          expenseBillId: '11111111-1111-1111-1111-111111111111',
        ),
        notifications.sampleNotification(
          id: 'settlement-row',
          safeSummary: 'Settlement request is waiting.',
          eventType: 'settlement.request_created',
          settlementRequestId: '22222222-2222-2222-2222-222222222222',
        ),
      ],
    );
    const captureKey = Key('notifications-shared-primitives-capture');

    await tester.pumpWidget(
      RepaintBoundary(
        key: captureKey,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: SettleoraTheme.light(),
          home: SettleoraNotificationScreen(
            repository: repository,
            billRepository: notifications.FakeBillRepository(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Personal bill ready.'), findsOneWidget);
    await _captureBoundary(
      tester,
      captureKey,
      'notifications-list-shared-primitives-390x844.png',
    );

    await notifications.tapNotificationFilter(tester, 'bills');
    await notifications.tapVisibleNotificationControl(
      tester,
      const ValueKey('notification-details-0'),
    );
    expect(find.byKey(const Key('notification-detail-sheet')), findsOneWidget);
    expect(find.byType(SettleoraKeyValueText), findsWidgets);
    expect(find.text('Navigation safety'), findsOneWidget);
    await _captureBoundary(
      tester,
      captureKey,
      'notifications-detail-shared-primitives-390x844.png',
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
