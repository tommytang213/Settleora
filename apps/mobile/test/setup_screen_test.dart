import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/app_configuration.dart';
import 'package:mobile/app/server_connection_probe.dart';
import 'package:mobile/app/setup_screen.dart';
import 'package:mobile/ui/settleora_theme.dart';

void main() {
  testWidgets('server setup starts unverified even with saved configuration', (
    tester,
  ) async {
    final probe = FakeServerConnectionProbe();
    await pumpSetup(
      tester,
      probe: probe,
      initialConfiguration: SettleoraAppConfiguration.server(
        serverBaseUri: Uri.parse('https://settleora.example/'),
      ),
    );

    expect(find.text('Server not checked'), findsOneWidget);
    expect(find.text('Server verified'), findsNothing);
    expect(probe.calls, 0);
  });

  testWidgets('syntax validation alone never verifies a server', (
    tester,
  ) async {
    final probe = FakeServerConnectionProbe();
    await pumpSetup(tester, probe: probe);

    await tester.enterText(serverField, 'https://settleora.example');
    await tester.pump();

    expect(find.text('Server not checked'), findsOneWidget);
    expect(find.text('Server verified'), findsNothing);
    expect(probe.calls, 0);
  });

  testWidgets('unverified server save probes once then saves once', (
    tester,
  ) async {
    final probe = FakeServerConnectionProbe();
    var saves = 0;
    SettleoraAppConfiguration? saved;
    await pumpSetup(
      tester,
      probe: probe,
      onSave: (configuration) async {
        saves += 1;
        saved = configuration;
      },
    );

    await tester.enterText(serverField, ' HTTPS://SETTLEORA.EXAMPLE/path ');
    await tester.tap(saveButton);
    await tester.pumpAndSettle();

    expect(probe.calls, 1);
    expect(probe.uris.single, Uri.parse('https://settleora.example/path/'));
    expect(saves, 1);
    expect(saved?.serverBaseUri, Uri.parse('https://settleora.example/path/'));
    expect(find.text('Server verified'), findsOneWidget);
  });

  testWidgets('duplicate save while probe is pending stays single flight', (
    tester,
  ) async {
    final pending = Completer<void>();
    final probe = FakeServerConnectionProbe(result: pending.future);
    var saves = 0;
    await pumpSetup(tester, probe: probe, onSave: (_) async => saves += 1);
    await tester.enterText(serverField, 'https://settleora.example');

    await tester.tap(saveButton);
    await tester.pump();
    expect(find.text('Checking server'), findsOneWidget);
    expect(probe.calls, 1);
    await tester.tap(saveButton, warnIfMissed: false);
    await tester.pump();
    expect(probe.calls, 1);
    expect(saves, 0);

    pending.complete();
    await tester.pumpAndSettle();
    expect(saves, 1);
  });

  testWidgets('probe failure is redacted, retains input, and retries probe', (
    tester,
  ) async {
    final probe = FakeServerConnectionProbe(
      failures: [Exception('token raw-body /api/private internal-id')],
    );
    var saves = 0;
    await pumpSetup(tester, probe: probe, onSave: (_) async => saves += 1);
    const entered = 'https://unavailable.example';
    await tester.enterText(serverField, entered);

    await tester.tap(saveButton);
    await tester.pumpAndSettle();

    expect(probe.calls, 1);
    expect(saves, 0);
    expect(find.text('Server unavailable'), findsOneWidget);
    expect(find.text('Check this server'), findsOneWidget);
    expect(
      find.text(
        "Settleora couldn't verify this server at the address you entered. Check the address or try again.",
      ),
      findsOneWidget,
    );
    expect(fieldText(tester), entered);
    expect(visibleText(tester), isNot(contains('raw-body')));
    expect(visibleText(tester), isNot(contains('internal-id')));

    await tester.tap(saveButton);
    await tester.pumpAndSettle();
    expect(probe.calls, 2);
    expect(saves, 1);
    expect(find.text('Server verified'), findsOneWidget);
  });

  testWidgets('invalid edit clears stale unavailable status', (tester) async {
    final probe = FakeServerConnectionProbe(
      failures: [Exception('raw network failure')],
    );
    await pumpSetup(tester, probe: probe);
    await tester.enterText(serverField, 'https://unavailable.example');
    await tester.tap(saveButton);
    await tester.pumpAndSettle();
    expect(find.text('Server unavailable'), findsOneWidget);

    await tester.enterText(serverField, '/invalid');
    await tester.pump();

    expect(find.text('Server not checked'), findsOneWidget);
    expect(find.text('Server unavailable'), findsNothing);
    expect(find.text('Check this server'), findsNothing);
  });

  testWidgets('save failure retains verified URL and retry does not re-probe', (
    tester,
  ) async {
    final probe = FakeServerConnectionProbe();
    var saves = 0;
    await pumpSetup(
      tester,
      probe: probe,
      onSave: (_) async {
        saves += 1;
        if (saves == 1) {
          throw Exception('secure storage path and raw details');
        }
      },
    );
    const entered = 'https://settleora.example';
    await tester.enterText(serverField, entered);

    await tester.tap(saveButton);
    await tester.pumpAndSettle();

    expect(probe.calls, 1);
    expect(saves, 1);
    expect(find.text('Server verified'), findsOneWidget);
    expect(find.text('Setup not saved'), findsOneWidget);
    expect(
      find.text(
        "Settleora couldn't save this setup on this device. Your entries are still here. Try again.",
      ),
      findsOneWidget,
    );
    expect(fieldText(tester), entered);
    expect(visibleText(tester), isNot(contains('raw details')));

    await tester.tap(saveButton);
    await tester.pumpAndSettle();
    expect(probe.calls, 1);
    expect(saves, 2);
  });

  testWidgets(
    'editing verified URL clears failure and requires a fresh probe',
    (tester) async {
      final probe = FakeServerConnectionProbe();
      var saves = 0;
      await pumpSetup(
        tester,
        probe: probe,
        onSave: (_) async {
          saves += 1;
          throw Exception('write failed');
        },
      );
      await tester.enterText(serverField, 'https://one.example');
      await tester.tap(saveButton);
      await tester.pumpAndSettle();
      expect(find.text('Server verified'), findsOneWidget);
      expect(find.text('Setup not saved'), findsOneWidget);

      await tester.enterText(serverField, 'https://two.example');
      await tester.pump();
      expect(find.text('Server not checked'), findsOneWidget);
      expect(find.text('Setup not saved'), findsNothing);

      await tester.tap(saveButton);
      await tester.pumpAndSettle();
      expect(probe.calls, 2);
      expect(saves, 2);
    },
  );

  testWidgets('normalization-equivalent edit keeps exact URL verified', (
    tester,
  ) async {
    final probe = FakeServerConnectionProbe();
    var saves = 0;
    await pumpSetup(
      tester,
      probe: probe,
      onSave: (_) async {
        saves += 1;
        if (saves == 1) throw Exception('write failed');
      },
    );
    await tester.enterText(serverField, 'https://settleora.example');
    await tester.tap(saveButton);
    await tester.pumpAndSettle();

    await tester.enterText(serverField, ' HTTPS://SETTLEORA.EXAMPLE/ ');
    await tester.pump();
    expect(find.text('Server verified'), findsOneWidget);
    expect(find.text('Setup not saved'), findsNothing);
    await tester.tap(saveButton);
    await tester.pumpAndSettle();
    expect(probe.calls, 1);
    expect(saves, 2);
  });

  testWidgets('local mode never probes and save failure is retryable', (
    tester,
  ) async {
    final probe = FakeServerConnectionProbe();
    var saves = 0;
    await pumpSetup(
      tester,
      probe: probe,
      onSave: (configuration) async {
        saves += 1;
        expect(configuration.mode, SettleoraAppMode.local);
        if (saves == 1) throw Exception('write failed');
      },
    );

    await tester.tap(find.text('Use local mode'));
    await tester.pumpAndSettle();
    expect(find.text('Local stays local'), findsOneWidget);
    expect(find.text('Server verified'), findsNothing);
    await tester.tap(saveButton);
    await tester.pumpAndSettle();
    expect(probe.calls, 0);
    expect(saves, 1);
    expect(find.text('Setup not saved'), findsOneWidget);
    expect(find.text('Use local mode'), findsWidgets);

    await tester.tap(saveButton);
    await tester.pumpAndSettle();
    expect(probe.calls, 0);
    expect(saves, 2);
  });

  testWidgets('mode changes clear stale failure and restore exact URL state', (
    tester,
  ) async {
    final probe = FakeServerConnectionProbe();
    await pumpSetup(
      tester,
      probe: probe,
      onSave: (_) async => throw Exception('write failed'),
    );
    await tester.enterText(serverField, 'https://settleora.example');
    await tester.tap(saveButton);
    await tester.pumpAndSettle();
    expect(find.text('Server verified'), findsOneWidget);

    await tester.tap(find.text('Use local mode'));
    await tester.pumpAndSettle();
    expect(find.text('Setup not saved'), findsNothing);
    expect(find.text('Server verified'), findsNothing);
    await tester.tap(find.text('Connect to server'));
    await tester.pumpAndSettle();
    expect(find.text('Server verified'), findsOneWidget);
  });

  testWidgets('keyboard submit runs the same deterministic server flow', (
    tester,
  ) async {
    final probe = FakeServerConnectionProbe();
    var saves = 0;
    await pumpSetup(tester, probe: probe, onSave: (_) async => saves += 1);
    await tester.enterText(serverField, 'https://settleora.example');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();

    expect(probe.calls, 1);
    expect(saves, 1);
    expect(find.text('Server verified'), findsOneWidget);
    expect(tester.getSize(saveButton).height, greaterThanOrEqualTo(48));
  });

  testWidgets('invalid URL keeps existing validation and never probes', (
    tester,
  ) async {
    final probe = FakeServerConnectionProbe();
    var saves = 0;
    await pumpSetup(tester, probe: probe, onSave: (_) async => saves += 1);
    await tester.enterText(serverField, '/relative');
    await tester.tap(saveButton);
    await tester.pumpAndSettle();

    expect(find.textContaining('absolute URL'), findsOneWidget);
    expect(find.text('Server not checked'), findsOneWidget);
    expect(probe.calls, 0);
    expect(saves, 0);
  });
}

final serverField = find.byKey(const Key('setup-server-base-url'));
final saveButton = find.byKey(const Key('setup-save'));

Future<void> pumpSetup(
  WidgetTester tester, {
  required FakeServerConnectionProbe probe,
  SettleoraAppConfiguration? initialConfiguration,
  Future<void> Function(SettleoraAppConfiguration)? onSave,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: SettleoraTheme.midnight(),
      home: SettleoraSetupScreen(
        initialConfiguration: initialConfiguration,
        serverConnectionProbe: probe,
        onSaveConfiguration: onSave ?? (_) async {},
      ),
    ),
  );
  await tester.pumpAndSettle();
}

String fieldText(WidgetTester tester) {
  return tester
      .widget<EditableText>(
        find.descendant(of: serverField, matching: find.byType(EditableText)),
      )
      .controller
      .text;
}

String visibleText(WidgetTester tester) {
  return tester
      .widgetList<Text>(find.byType(Text))
      .map((widget) => widget.data ?? '')
      .join('\n');
}

class FakeServerConnectionProbe implements SettleoraServerConnectionProbe {
  FakeServerConnectionProbe({this.result, List<Object>? failures})
    : failures = failures ?? <Object>[];

  final Future<void>? result;
  final List<Object> failures;
  final List<Uri> uris = [];

  int get calls => uris.length;

  @override
  Future<void> verify(Uri baseUri) async {
    uris.add(baseUri);
    if (failures.isNotEmpty) throw failures.removeAt(0);
    await (result ?? Future<void>.value());
  }
}
