import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/app_configuration.dart';
import 'package:mobile/app/server_connection_probe.dart';
import 'package:mobile/app/setup_screen.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../helpers/settleora_visual_test_fonts.dart';

const _outputDirectory =
    '/workspace/logs/settleora-visual-qa/20260908-2243-issue-1096/candidate-a';
const _captureKey = Key('setup-persistence-capture');
const _serverFieldKey = Key('setup-server-base-url');
const _saveKey = Key('setup-save');

void main() {
  testWidgets('captures production setup states at 390px 1x', (tester) async {
    await prepare(tester, width: 390, height: 844, textScale: 1);

    final pendingProbe = Completer<void>();
    final probe = VisualProbe(results: [pendingProbe.future]);
    await pumpSetup(tester, probe: probe);
    await capture(tester, 'server-unverified-390x844-1x.png');

    await tester.enterText(
      find.byKey(_serverFieldKey),
      'https://settleora.example',
    );
    await tester.tap(find.byKey(_saveKey));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    await capture(tester, 'server-checking-390x844-1x.png');

    pendingProbe.complete();
    await tester.pumpAndSettle();
    await capture(tester, 'server-verified-390x844-1x.png');

    await pumpSetup(
      tester,
      probe: VisualProbe(failures: [Exception('raw network failure')]),
    );
    await enterAndSave(tester);
    await ensureFailureVisible(tester);
    await capture(tester, 'server-unavailable-390x844-1x.png');

    var saveCalls = 0;
    await pumpSetup(
      tester,
      probe: VisualProbe(),
      onSave: (_) async {
        saveCalls += 1;
        throw Exception('raw persistence failure');
      },
    );
    await enterAndSave(tester);
    await ensureFailureVisible(tester);
    await capture(tester, 'server-verified-persistence-failure-390x844-1x.png');
    expect(saveCalls, 1);
    expect(find.text('Server verified'), findsOneWidget);
    expect(
      tester.widget<AppButton>(find.byType(AppButton).last).onPressed,
      isNotNull,
    );
    await capture(tester, 'server-persistence-retry-ready-390x844-1x.png');

    await tester.tap(find.byKey(_serverFieldKey));
    await tester.pump();
    await ensureFailureVisible(tester);
    await capture(tester, 'server-persistence-retry-focused-390x844-1x.png');

    await pumpSetup(tester, probe: VisualProbe());
    await tester.tap(find.text('Use local mode'));
    await tester.pumpAndSettle();
    await capture(tester, 'local-mode-unchanged-390x844-1x.png');
  }, tags: ['visual']);

  testWidgets('captures readable production setup states at 320px 2x', (
    tester,
  ) async {
    await prepare(tester, width: 320, height: 760, textScale: 2);

    await pumpSetup(tester, probe: VisualProbe());
    expect(tester.takeException(), isNull);
    await capture(tester, 'server-unverified-320x760-2x.png');

    await pumpSetup(
      tester,
      probe: VisualProbe(failures: [Exception('raw network failure')]),
    );
    await enterAndSave(tester);
    await ensureFailureVisible(tester);
    expect(tester.takeException(), isNull);
    await capture(tester, 'server-unavailable-320x760-2x.png');

    await pumpSetup(
      tester,
      probe: VisualProbe(),
      onSave: (_) async => throw Exception('raw persistence failure'),
    );
    await enterAndSave(tester);
    await ensureFailureVisible(tester);
    expect(tester.takeException(), isNull);
    await capture(tester, 'server-persistence-failure-320x760-2x.png');

    await tester.ensureVisible(find.byKey(_saveKey));
    await tester.pumpAndSettle();
    expect(tester.getRect(find.byKey(_saveKey)).bottom, lessThanOrEqualTo(760));
    await capture(tester, 'server-retry-action-reachable-320x760-2x.png');
  }, tags: ['visual']);
}

Future<void> prepare(
  WidgetTester tester, {
  required double width,
  required double height,
  required double textScale,
}) async {
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.runAsync(() async {
    await loadSettleoraVisualTestFonts();
    await Directory(_outputDirectory).create(recursive: true);
  });
  _textScale = textScale;
}

double _textScale = 1;

Future<void> pumpSetup(
  WidgetTester tester, {
  required VisualProbe probe,
  Future<void> Function(SettleoraAppConfiguration)? onSave,
}) async {
  await tester.pumpWidget(
    RepaintBoundary(
      key: _captureKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.midnight(),
        home: MediaQuery(
          data: MediaQueryData(textScaler: TextScaler.linear(_textScale)),
          child: SettleoraSetupScreen(
            key: UniqueKey(),
            serverConnectionProbe: probe,
            onSaveConfiguration: onSave ?? (_) async {},
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> enterAndSave(WidgetTester tester) async {
  await reveal(tester, find.byKey(_serverFieldKey));
  await tester.enterText(
    find.byKey(_serverFieldKey),
    'https://settleora.example',
  );
  await tester.ensureVisible(find.byKey(_saveKey));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(_saveKey));
  await tester.pumpAndSettle();
}

Future<void> ensureFailureVisible(WidgetTester tester) async {
  await reveal(tester, find.byKey(const Key('setup-failure')));
  await tester.scrollUntilVisible(
    find.byKey(const Key('setup-failure')),
    180,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.pumpAndSettle();
}

Future<void> reveal(WidgetTester tester, Finder target) async {
  for (
    var attempt = 0;
    attempt < 8 && target.evaluate().isEmpty;
    attempt += 1
  ) {
    await tester.drag(find.byType(ListView), const Offset(0, -220));
    await tester.pump();
  }
  expect(target, findsOneWidget);
}

Future<void> capture(WidgetTester tester, String name) async {
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

class VisualProbe implements SettleoraServerConnectionProbe {
  VisualProbe({List<Future<void>>? results, List<Object>? failures})
    : results = results ?? [],
      failures = failures ?? [];

  final List<Future<void>> results;
  final List<Object> failures;

  @override
  Future<void> verify(Uri baseUri) async {
    if (failures.isNotEmpty) throw failures.removeAt(0);
    if (results.isNotEmpty) await results.removeAt(0);
  }
}
