import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/.dart_tool/flutter_gen/gen_l10n/app_localizations.dart';
import 'package:mobile/notifications/notification_repository.dart';
import 'package:mobile/notifications/notification_screen.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../helpers/settleora_visual_test_fonts.dart';
import '../notification_screen_test.dart' as notifications;

final _outputDirectory = settleoraVisualOutputDirectory(
  'issue-1171-mobile-localization/visual-evidence',
);
const _captureKey = Key('notification-localization-capture');

void main() {
  testWidgets('captures known and unknown key behavior at 390px 1x', (
    tester,
  ) async {
    await _prepare(tester, width: 390, height: 844);
    await _pump(
      tester,
      rows: [
        _knownNotification(safeSummary: 'Dinner bill is ready.'),
        _unknownNotification(),
      ],
    );
    await _revealRows(tester);

    expect(find.text('Bill submitted'), findsOneWidget);
    expect(find.text('Dinner bill is ready.'), findsOneWidget);
    expect(find.text('Settlement requested'), findsOneWidget);
    expect(find.text('Settlement request'), findsOneWidget);
    expect(_visibleText(tester), isNot(contains('notifications.')));
    expect(tester.takeException(), isNull);
    await _capture(tester, 'notification-known-unknown-390x844-1x.png');
  }, tags: ['visual']);

  testWidgets('captures known key behavior at 320px 2x', (tester) async {
    await _prepare(tester, width: 320, height: 844, devicePixelRatio: 2);
    await _pump(tester, rows: [_knownNotification(safeSummary: '')]);
    await _revealRows(tester);

    expect(find.text('Bill submitted'), findsOneWidget);
    expect(find.text('Bill'), findsOneWidget);
    expect(_visibleText(tester), isNot(contains('notifications.')));
    expect(tester.takeException(), isNull);
    await _capture(tester, 'notification-known-320x844-2x.png', pixelRatio: 2);

    await notifications.tapVisibleNotificationControl(
      tester,
      const ValueKey('notification-details-0'),
    );
    expect(find.byKey(const Key('notification-detail-sheet')), findsOneWidget);
    expect(find.text('Bill submitted'), findsWidgets);
    expect(find.text('Bill'), findsWidgets);
    expect(tester.takeException(), isNull);
    await _capture(
      tester,
      'notification-known-detail-320x844-2x.png',
      pixelRatio: 2,
    );
  }, tags: ['visual']);

  testWidgets('captures unknown-key fallback at 320px 2x', (tester) async {
    await _prepare(tester, width: 320, height: 844, devicePixelRatio: 2);
    await _pump(tester, rows: [_unknownNotification()]);
    await _revealRows(tester);

    expect(find.text('Settlement requested'), findsOneWidget);
    expect(find.text('Settlement request'), findsOneWidget);
    expect(_visibleText(tester), isNot(contains('notifications.')));
    expect(tester.takeException(), isNull);
    await _capture(
      tester,
      'notification-unknown-320x844-2x.png',
      pixelRatio: 2,
    );
  }, tags: ['visual']);
}

SettleoraNotificationRow _knownNotification({required String safeSummary}) {
  return notifications.sampleNotification(
    id: 'known-notification',
    titleKey: 'notifications.bill.submitted.title',
    messageKey: 'notifications.bill.submitted.message',
    safeSummary: safeSummary,
  );
}

SettleoraNotificationRow _unknownNotification() {
  return notifications.sampleNotification(
    id: 'unknown-notification',
    eventType: SettleoraNotificationEventTypeValues.settlementRequestCreated,
    subjectType: SettleoraNotificationSubjectTypeValues.settlementRequest,
    titleKey: 'notifications.future.raw_title',
    messageKey: 'notifications.future.raw_message',
    safeSummary: '',
  );
}

Future<void> _prepare(
  WidgetTester tester, {
  required double width,
  required double height,
  double devicePixelRatio = 1,
}) async {
  tester.view.physicalSize = Size(
    width * devicePixelRatio,
    height * devicePixelRatio,
  );
  tester.view.devicePixelRatio = devicePixelRatio;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.runAsync(() async {
    await loadSettleoraVisualTestFonts();
    await Directory(_outputDirectory).create(recursive: true);
  });
}

Future<void> _pump(
  WidgetTester tester, {
  required List<SettleoraNotificationRow> rows,
}) async {
  await tester.pumpWidget(
    RepaintBoundary(
      key: _captureKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.midnight(),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: SettleoraNotificationScreen(
          repository: notifications.FakeNotificationRepository(
            notifications: rows,
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _revealRows(WidgetTester tester) async {
  await tester.drag(find.byType(ListView).first, const Offset(0, -1600));
  await tester.pumpAndSettle();
}

String _visibleText(WidgetTester tester) {
  return tester
      .widgetList<Text>(find.byType(Text))
      .map((widget) => widget.data ?? widget.textSpan?.toPlainText() ?? '')
      .join('\n');
}

Future<void> _capture(
  WidgetTester tester,
  String fileName, {
  double pixelRatio = 1,
}) async {
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.byKey(_captureKey),
    );
    final image = await boundary.toImage(pixelRatio: pixelRatio);
    final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
    await File(
      '$_outputDirectory/$fileName',
    ).writeAsBytes(byteData!.buffer.asUint8List());
  });
}
