import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/profile/profile_repository.dart';
import 'package:mobile/profile/profile_screen.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_form_fields.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../helpers/settleora_visual_test_fonts.dart';
import '../profile_screen_test.dart' as fixtures;

const _output =
    '/workspace/logs/settleora-visual-qa/20260907-1548-profile-form';
const _capture = Key('profile-form-capture');
Finder control(String key) => find.byKey(Key(key));
Finder textField(String key) =>
    find.descendant(of: control(key), matching: find.byType(TextField));
TextField field(WidgetTester tester, String key) =>
    tester.widget<TextField>(textField(key));

Future<void> mount(
  WidgetTester tester,
  fixtures.FakeProfileRepository repository, {
  double width = 800,
  double height = 2400,
  double scale = 1,
  bool light = false,
}) async {
  await setSettleoraMobileViewport(tester, width: width, height: height);
  await tester.pumpWidget(
    RepaintBoundary(
      key: _capture,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: light ? SettleoraTheme.light() : SettleoraTheme.midnight(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: SettleoraProfileScreen(
          repository: repository,
          currentUser: fixtures.sampleCurrentUser(),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> capture(WidgetTester tester, String name) async {
  expect(tester.takeException(), isNull);
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.byKey(_capture),
    );
    final image = await boundary.toImage(pixelRatio: 1);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(_output).create(recursive: true);
    await File('$_output/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

Future<void> show(WidgetTester tester, String key, {bool busy = false}) async {
  final scroll = tester.state<ScrollableState>(
    find
        .descendant(
          of: find.byType(ListView),
          matching: find.byType(Scrollable),
        )
        .first,
  );
  scroll.position.jumpTo(0);
  await tester.pump();
  for (var i = 0; control(key).evaluate().isEmpty && i < 30; i++) {
    scroll.position.jumpTo(
      (scroll.position.pixels + 300).clamp(0, scroll.position.maxScrollExtent),
    );
    await tester.pump();
  }
  await Scrollable.ensureVisible(tester.element(control(key)), alignment: 0.1);
  if (busy) {
    await tester.pump(const Duration(milliseconds: 120));
  } else {
    await tester.pumpAndSettle();
  }
}

void main() {
  testWidgets(
    'shared fields preserve values, limits, multiline, semantics and keyboard order',
    (tester) async {
      final semantics = tester.ensureSemantics();

      final repository = fixtures.FakeProfileRepository();
      await mount(tester, repository);
      expect(find.byType(AppTextField), findsNWidgets(3));
      expect(field(tester, 'profile-display-name').controller!.text, 'Taylor');
      expect(field(tester, 'profile-display-name').maxLength, 160);
      expect(
        field(tester, 'profile-display-name').textInputAction,
        TextInputAction.next,
      );
      await tester.enterText(control('profile-display-name'), 'x' * 161);
      expect(field(tester, 'profile-display-name').controller!.text, 'x' * 160);
      await tester.enterText(control('profile-display-name'), ' Morgan ');
      await tester.testTextInput.receiveAction(TextInputAction.next);
      await tester.pump();
      expect(
        FocusManager.instance.primaryFocus!.context!
            .findAncestorWidgetOfExactType<CurrencySelector>(),
        isNotNull,
      );
      await tester.tap(control('profile-save'));
      await tester.pumpAndSettle();
      expect(repository.lastProfileUpdate!.displayName, ' Morgan ');
      expect(repository.profileUpdateCalls, 1);
      expect(field(tester, 'profile-display-name').controller!.text, 'Morgan');
      await tester.enterText(control('profile-payment-handle'), 'x' * 321);
      expect(
        field(tester, 'profile-payment-handle').controller!.text.length,
        321,
      );
      expect(field(tester, 'profile-payment-handle').maxLength, 320);
      expect(
        field(tester, 'profile-payment-handle').maxLengthEnforcement,
        MaxLengthEnforcement.none,
      );
      await tester.testTextInput.receiveAction(TextInputAction.next);
      await tester.pump();
      final noteEditable = tester.widget<EditableText>(
        find.descendant(
          of: control('profile-payment-note'),
          matching: find.byType(EditableText),
        ),
      );
      expect(noteEditable.focusNode.hasFocus, isTrue);
      expect(noteEditable.keyboardType, TextInputType.multiline);
      expect(field(tester, 'profile-payment-note').maxLines, 3);
      expect(field(tester, 'profile-payment-note').maxLength, 1000);
      expect(field(tester, 'profile-payment-note').textInputAction, isNull);
      expect(
        field(tester, 'profile-payment-note').maxLengthEnforcement,
        MaxLengthEnforcement.none,
      );
      await tester.enterText(
        control('profile-payment-note'),
        'Line one\nLine two',
      );
      expect(
        field(tester, 'profile-payment-note').controller!.text,
        'Line one\nLine two',
      );
      for (final key in [
        'profile-display-name',
        'profile-payment-handle',
        'profile-payment-note',
      ]) {
        final editable = find.descendant(
          of: control(key),
          matching: find.byType(EditableText),
        );
        final data = tester.getSemantics(editable).getSemanticsData();
        expect(data.label, contains(field(tester, key).decoration!.labelText!));
        expect(data.flagsCollection.isTextField, isTrue);
      }
      semantics.dispose();
    },
  );

  testWidgets('payment method changes keep exact dynamic field and helper copy', (
    tester,
  ) async {
    await mount(tester, fixtures.FakeProfileRepository());
    const copies = {
      'Bank transfer': [
        'Bank transfer details',
        'Use account, bank, or payee details that a settlement counterparty needs.',
        'Transfer note',
        'Optional reference, memo, or transfer instructions.',
      ],
      'FPS': [
        'FPS ID',
        'Phone, email, FPS ID, or account alias.',
        'FPS note',
        'Optional payment reference or instructions.',
      ],
      'PayMe': [
        'PayMe handle or link',
        'PayMe username, phone, or payment link.',
        'PayMe note',
        'Optional reference or payer instructions.',
      ],
      'Cash': [
        'Cash instructions',
        'Short handoff or meet-up instructions.',
        'Cash note',
        'Optional change, timing, or handoff note.',
      ],
    };
    for (final entry in copies.entries) {
      await fixtures.selectDropdownValue(
        tester,
        const Key('profile-payment-method'),
        entry.key,
      );
      final handle = field(tester, 'profile-payment-handle').decoration!;
      final note = field(tester, 'profile-payment-note').decoration!;
      expect([
        handle.labelText,
        (handle.helper as Text).data,
        note.labelText,
        (note.helper as Text).data,
      ], entry.value);
    }
  });

  testWidgets(
    'overlong note rejects without saving and cancel clears failure and restores loaded values',
    (tester) async {
      final repository = fixtures.FakeProfileRepository();
      await mount(tester, repository);
      await tester.enterText(control('profile-payment-note'), 'n' * 1001);
      expect(
        field(tester, 'profile-payment-note').controller!.text.length,
        1001,
      );
      await tester.tap(control('profile-payment-save'));
      await tester.pumpAndSettle();
      expect(
        find.text('Payment note must be 1000 characters or fewer.'),
        findsOneWidget,
      );
      expect(repository.paymentUpdateCalls, 0);
      await tester.enterText(control('profile-payment-handle'), 'discard');
      await tester.enterText(control('profile-payment-note'), 'discard note');
      await tester.tap(control('profile-payment-cancel'));
      await tester.pumpAndSettle();
      expect(
        field(tester, 'profile-payment-handle').controller!.text,
        repository.paymentDetails.paymentHandle,
      );
      expect(
        field(tester, 'profile-payment-note').controller!.text,
        repository.paymentDetails.paymentNote ?? '',
      );
      expect(
        find.text('Payment note must be 1000 characters or fewer.'),
        findsNothing,
      );
    },
  );

  for (final payment in [false, true]) {
    testWidgets(
      'all actions disable during ${payment ? 'payment' : 'profile'} save',
      (tester) async {
        final semantics = tester.ensureSemantics();

        final pending = Completer<void>();
        final repository = fixtures.FakeProfileRepository(
          profileUpdateCompleter: payment ? null : pending,
          paymentUpdateCompleter: payment ? pending : null,
        );
        await mount(tester, repository);
        final key = payment ? 'profile-payment-save' : 'profile-save';
        await tester.tap(control(key));
        await tester.pump();
        for (final action in [
          'profile-save',
          'profile-payment-save',
          'profile-payment-cancel',
        ]) {
          final button = find.descendant(
            of: control(action),
            matching: find.byType(FilledButton),
          );
          expect(tester.widget<FilledButton>(button).onPressed, isNull);
          expect(
            tester
                .getSemantics(control(action))
                .getSemanticsData()
                .flagsCollection
                .isEnabled,
            ui.Tristate.isFalse,
          );
          await tester.tap(control(action));
          await tester.pump();
          expect(tester.getSize(button).height, greaterThanOrEqualTo(48));
        }
        expect(
          tester.getSemantics(control(key)).getSemanticsData().value,
          'In progress',
        );
        expect(find.byType(CircularProgressIndicator), findsOneWidget);
        expect(repository.profileUpdateCalls, payment ? 0 : 1);
        expect(repository.paymentUpdateCalls, payment ? 1 : 0);
        pending.complete();
        await tester.pumpAndSettle();
        expect(find.byType(CircularProgressIndicator), findsNothing);
        semantics.dispose();
      },
    );
  }

  testWidgets(
    'loading AppButton blocks supplied callback and exposes progress',
    (tester) async {
      var calls = 0;
      final semantics = tester.ensureSemantics();

      await tester.pumpWidget(
        MaterialApp(
          theme: SettleoraTheme.midnight(),
          home: Scaffold(
            body: AppButton(
              label: 'Save',
              isLoading: true,
              onPressed: () => calls++,
            ),
          ),
        ),
      );
      await tester.tap(find.byType(AppButton));
      await tester.pump();
      expect(calls, 0);
      final data = tester
          .getSemantics(find.byType(AppButton))
          .getSemanticsData();
      expect(data.label, 'Save');
      expect(data.value, 'In progress');
      expect(data.hasAction(ui.SemanticsAction.tap), isFalse);
      semantics.dispose();
    },
  );

  for (final scale in [1.0, 2.0]) {
    for (final state in ['normal', 'error', 'profile-busy', 'payment-busy']) {
      testWidgets('captures production Profile $state at ${scale}x', (
        tester,
      ) async {
        await tester.runAsync(loadSettleoraVisualTestFonts);
        final pending = Completer<void>();
        final repository = fixtures.FakeProfileRepository(
          profileUpdateCompleter: state == 'profile-busy' ? pending : null,
          paymentUpdateCompleter: state == 'payment-busy' ? pending : null,
          profileUpdateFailure: state == 'error'
              ? const SettleoraProfileFailure(
                  kind: SettleoraProfileFailureKind.validation,
                  message: 'Enter a display name.',
                )
              : null,
        );
        await mount(
          tester,
          repository,
          width: scale == 1 ? 390 : 320,
          height: 844,
          scale: scale,
        );
        final busy = state.endsWith('busy');
        if (state == 'error' || state == 'profile-busy') {
          await show(tester, 'profile-save');
          await tester.tap(control('profile-save'));
          if (busy) {
            await tester.pump(const Duration(milliseconds: 120));
          } else {
            await tester.pumpAndSettle();
          }
        }
        if (state == 'payment-busy') {
          await show(tester, 'profile-payment-save');
          await tester.tap(control('profile-payment-save'));
          await tester.pump(const Duration(milliseconds: 120));
        }
        await show(tester, 'profile-display-name', busy: busy);
        await capture(tester, '$state-profile-${scale}x');
        await show(tester, 'profile-save', busy: busy);
        await capture(tester, '$state-profile-action-${scale}x');
        if (state == 'error') {
          await show(tester, 'profile-payment-handle');
          await tester.enterText(control('profile-payment-handle'), 'x' * 321);
          tester.testTextInput.hide();
          await show(tester, 'profile-payment-save');
          await tester.tap(control('profile-payment-save'));
          await tester.pumpAndSettle();
          expect(
            find.text('Payment details must be 320 characters or fewer.'),
            findsOneWidget,
          );
        }

        await show(tester, 'profile-payment-handle', busy: busy);
        await capture(tester, '$state-payment-fields-${scale}x');
        await show(tester, 'profile-payment-cancel', busy: busy);
        await capture(tester, '$state-payment-actions-${scale}x');
        if (busy) {
          pending.complete();
          await tester.pumpAndSettle();
        }
      });
    }
  }
}
