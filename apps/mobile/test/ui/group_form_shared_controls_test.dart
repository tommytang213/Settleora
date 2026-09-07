import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/groups/group_list_screen.dart';
import 'package:mobile/groups/group_repository.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../group_list_screen_test.dart' as fixtures;
import '../helpers/settleora_visual_test_fonts.dart';

const _output = '/workspace/logs/settleora-visual-qa/20260907-1725-group-form';
const _captureKey = Key('group-form-capture');
Finder control(String key) => find.byKey(Key('group-form-$key'));
Finder get editable =>
    find.descendant(of: control('name'), matching: find.byType(EditableText));
TextField field(WidgetTester tester) => tester.widget<TextField>(
  find.descendant(of: control('name'), matching: find.byType(TextField)),
);

Future<void> mount(
  WidgetTester tester,
  fixtures.FakeGroupRepository repository, {
  bool rename = false,
  double width = 390,
  double scale = 1,
  double inset = 0,
  bool light = false,
}) async {
  await setSettleoraMobileViewport(tester, width: width);
  await tester.pumpWidget(
    RepaintBoundary(
      key: _captureKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: light ? SettleoraTheme.light() : SettleoraTheme.midnight(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(scale),
            viewInsets: EdgeInsets.only(bottom: inset),
          ),
          child: child!,
        ),
        home: SettleoraGroupListScreen(
          repository: repository,
          billRepository: fixtures.FakeBillRepository(),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  if (rename) {
    await tester.tap(find.text('Trip Crew'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('group-detail-edit')));
  } else {
    await tester.tap(find.byKey(const Key('group-list-create')));
  }
  await tester.pumpAndSettle();
}

fixtures.FakeGroupRepository repository({bool failure = false}) =>
    fixtures.FakeGroupRepository(
      groups: [fixtures.sampleGroup()],
      actionFailure: failure
          ? const SettleoraGroupFailure(
              kind: SettleoraGroupFailureKind.validation,
              message: 'Enter a group name.',
            )
          : null,
    );

Future<void> capture(WidgetTester tester, String name) async {
  expect(tester.takeException(), isNull);
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.byKey(_captureKey),
    );
    final image = await boundary.toImage(pixelRatio: 1);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(_output).create(recursive: true);
    await File('$_output/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

void main() {
  for (final rename in [false, true]) {
    final mode = rename ? 'rename' : 'create';
    testWidgets('$mode preserves value, focus, limit, semantics and keyboard', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();

      final repo = repository();
      await mount(tester, repo, rename: rename);
      expect(find.text(rename ? 'Edit Group' : 'Create Group'), findsOneWidget);
      expect(find.byType(SettleoraDialogFrame), findsOneWidget);
      expect(tester.widget(control('name')), isA<AppTextField>());
      expect(field(tester).controller!.text, rename ? 'Trip Crew' : '');
      expect(field(tester).autofocus, isTrue);
      expect(tester.widget<EditableText>(editable).focusNode.hasFocus, isTrue);
      expect(tester.testTextInput.isVisible, isTrue);
      expect(field(tester).maxLength, 160);
      expect(field(tester).maxLengthEnforcement, isNull);
      expect(field(tester).maxLines, 1);
      expect(field(tester).decoration!.labelText, 'Name');
      expect(field(tester).decoration!.errorText, isNull);
      await tester.enterText(control('name'), 'x' * 161);
      expect(field(tester).controller!.text, 'x' * 160);
      await tester.enterText(control('name'), '  House 🏡  ');
      await tester.pump();
      final fieldSemantics = tester.getSemantics(editable).getSemanticsData();
      expect(fieldSemantics.label, 'Name');
      expect(fieldSemantics.value, '  House 🏡  ');
      expect(fieldSemantics.flagsCollection.isTextField, isTrue);
      expect(fieldSemantics.flagsCollection.isEnabled.name, 'isTrue');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      expect(tester.widget<EditableText>(editable).focusNode.hasFocus, isFalse);
      expect(repo.createCalls + repo.updateCalls, 0);
      for (final key in ['save', 'cancel']) {
        expect(tester.widget(control(key)), isA<AppButton>());
        expect(tester.getSize(control(key)).height, greaterThanOrEqualTo(48));
        expect(tester.getSize(control(key)).width, greaterThanOrEqualTo(48));
        expect(
          tester.getSemantics(control(key)),
          matchesSemantics(
            label: key == 'save' ? 'Save' : 'Cancel',
            isButton: true,
            hasEnabledState: true,
            isEnabled: true,
            hasTapAction: true,
          ),
        );
      }
      await tester.tap(control('save'));
      await tester.pumpAndSettle();
      expect(repo.lastGroupSave!.name, '  House 🏡  ');
      expect(repo.createCalls, rename ? 0 : 1);
      expect(repo.updateCalls, rename ? 1 : 0);
      if (rename) expect(repo.lastGroupId, fixtures.sampleGroup().id);
      expect(find.byType(SettleoraDialogFrame), findsNothing);
      semantics.dispose();
    });

    for (final dismissal in ['cancel', 'back', 'barrier']) {
      testWidgets('$mode $dismissal returns no mutation', (tester) async {
        final repo = repository();
        await mount(tester, repo, rename: rename);
        await tester.enterText(control('name'), 'Discard me');
        if (dismissal == 'cancel') {
          await tester.tap(control('cancel'));
        } else if (dismissal == 'back') {
          await tester.binding.handlePopRoute();
        } else {
          await tester.tapAt(const Offset(5, 5));
        }
        await tester.pumpAndSettle();
        expect(repo.createCalls + repo.updateCalls, 0);
        expect(repo.lastGroupSave, isNull);
        expect(find.byType(SettleoraDialogFrame), findsNothing);
        expect(find.text('Trip Crew'), findsWidgets);
        expect(tester.takeException(), isNull);
      });
    }

    for (final value in ['', '   ']) {
      testWidgets(
        '$mode passes ${value.length}-length invalid value to caller',
        (tester) async {
          final repo = repository(failure: true);
          await mount(tester, repo, rename: rename);
          await tester.enterText(control('name'), value);
          await tester.tap(control('save'));
          await tester.pumpAndSettle();
          expect(repo.lastGroupSave!.name, value);
          expect(repo.createCalls + repo.updateCalls, 1);
          expect(find.byType(SettleoraDialogFrame), findsNothing);
          expect(find.text('Enter a group name.'), findsOneWidget);
        },
      );
    }

    testWidgets('$mode repeated pointer and semantic save cannot pop caller', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();

      final repo = repository();
      await mount(tester, repo, rename: rename);
      await tester.enterText(control('name'), 'Once');
      final callback = tester.widget<AppButton>(control('save')).onPressed!;
      final node = tester.getSemantics(control('save'));
      tester.binding.rootPipelineOwner.visitChildren((owner) {
        owner.semanticsOwner?.performAction(node.id, ui.SemanticsAction.tap);
      });
      callback();
      callback();
      await tester.pumpAndSettle();
      expect(repo.createCalls + repo.updateCalls, 1);
      expect(find.text('Once'), findsWidgets);
      expect(tester.takeException(), isNull);
      semantics.dispose();
    });

    for (final scale in [1.0, 2.0]) {
      testWidgets('$mode production dialog captures at ${scale}x', (
        tester,
      ) async {
        await tester.runAsync(loadSettleoraVisualTestFonts);
        final repo = repository();
        await mount(
          tester,
          repo,
          rename: rename,
          width: scale == 2 ? 320 : 390,
          scale: scale,
        );
        expect(find.byType(SettleoraDialogFrame), findsOneWidget);
        expect(tester.widget(control('name')), isA<AppTextField>());
        await capture(tester, '$mode-normal-${scale}x');
        await tester.enterText(control('name'), '');
        await tester.pumpAndSettle();
        expect(field(tester).controller!.text, isEmpty);
        expect(find.text('0/160'), findsOneWidget);
        await capture(tester, '$mode-empty-${scale}x');
        await tester.tap(control('cancel'));
        await tester.pumpAndSettle();
        // Re-mount with a simulated keyboard inset; the field is really focused.
        await tester.pumpWidget(const SizedBox.shrink());
        await mount(
          tester,
          repository(),
          rename: rename,
          width: scale == 2 ? 320 : 390,
          scale: scale,
          inset: 300,
        );
        expect(
          tester.widget<EditableText>(editable).focusNode.hasFocus,
          isTrue,
        );
        for (final key in ['name', 'save', 'cancel']) {
          expect(control(key).hitTestable(), findsOneWidget);
          expect(tester.getRect(control(key)).bottom, lessThanOrEqualTo(544));
        }
        await capture(tester, '$mode-keyboard-${scale}x');
        await tester.pumpWidget(const SizedBox.shrink());
        await mount(
          tester,
          repository(),
          rename: rename,
          width: scale == 2 ? 320 : 390,
          scale: scale,
          light: true,
        );
        await capture(tester, '$mode-light-${scale}x');
      });
    }
  }

  testWidgets('message-bearing shared dialog keeps existing content', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: SettleoraTheme.light(),
        home: const Scaffold(
          body: SettleoraDialogFrame(
            title: 'Title',
            message: 'Existing message',
            actions: [],
            child: Text('Existing child'),
          ),
        ),
      ),
    );
    expect(find.text('Existing message'), findsOneWidget);
    expect(find.text('Existing child'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
