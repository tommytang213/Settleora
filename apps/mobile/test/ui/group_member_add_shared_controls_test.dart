import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/groups/group_list_screen.dart';
import 'package:mobile/groups/group_repository.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../group_list_screen_test.dart' as groups;
import '../helpers/settleora_visual_test_fonts.dart';

const _captureKey = Key('group-member-add-capture');
const _fieldKey = Key('group-member-profile-id');
const _roleKey = Key('group-member-role');
const _addKey = Key('group-member-add');
const _output =
    '/workspace/logs/settleora-visual-qa/20260908-0945-group-member-add';
const _rawProfileId = '  88888888-8888-8888-8888-888888888888  ';

Finder get _field => find.byKey(_fieldKey);
Finder get _editable =>
    find.descendant(of: _field, matching: find.byType(EditableText));
Finder get _textField =>
    find.descendant(of: _field, matching: find.byType(TextField));
Finder get _role => find.byKey(_roleKey);
Finder get _add => find.byKey(_addKey);

Future<void> _reveal(WidgetTester tester, Finder target) async {
  for (
    var attempt = 0;
    attempt < 12 && target.evaluate().isEmpty;
    attempt += 1
  ) {
    await tester.drag(find.byType(ListView), const Offset(0, -240));
    await tester.pumpAndSettle();
  }
  expect(target, findsOneWidget);
  await tester.ensureVisible(target);
  await tester.pumpAndSettle();
}

Future<void> _mount(
  WidgetTester tester,
  groups.FakeGroupRepository repository, {
  required double width,
  required double scale,
  double inset = 0,
}) async {
  await setSettleoraMobileViewport(tester, width: width);
  await tester.pumpWidget(
    RepaintBoundary(
      key: _captureKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.midnight(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(scale),
            viewInsets: EdgeInsets.only(bottom: inset),
          ),
          child: child!,
        ),
        home: SettleoraGroupDetailScreen(
          repository: repository,
          billRepository: groups.FakeBillRepository(),
          groupId: groups.sampleGroup().id,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  await _reveal(tester, _field);
}

Future<void> _selectOwner(WidgetTester tester) async {
  await tester.ensureVisible(_role);
  await tester.pumpAndSettle();
  await tester.tap(_role);
  await tester.pumpAndSettle();
  await tester.tap(find.text('Owner').last);
  await tester.pumpAndSettle();
}

Future<void> _capture(WidgetTester tester, String name) async {
  await tester.pump();
  expect(tester.takeException(), isNull, reason: name);
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

void _expectControlContract(WidgetTester tester) {
  expect(tester.widget(_field), isA<AppTextField>());
  final sharedField = tester.widget<AppTextField>(_field);
  expect(sharedField.controller, isNotNull);
  expect(sharedField.label, 'User profile ID');
  expect(sharedField.labelAbove, isTrue);
  expect(sharedField.textInputAction, TextInputAction.next);
  expect(sharedField.enabled, isTrue);
  expect(sharedField.autofocus, isFalse);

  final textField = tester.widget<TextField>(_textField);
  expect(textField.textInputAction, TextInputAction.next);
  expect(textField.enabled, isTrue);
  expect(textField.autofocus, isFalse);

  final role = tester.widget<DropdownButton<String>>(_role);
  expect(role.value, SettleoraGroupRoleValues.member);
  expect(role.items!.map((item) => item.value), [
    SettleoraGroupRoleValues.owner,
    SettleoraGroupRoleValues.member,
  ]);
  expect(role.items!.map((item) => (item.child as Text).data), [
    'Owner',
    'Member',
  ]);
  expect(role.onChanged, isNotNull);

  expect(tester.widget(_add), isA<AppButton>());
  final add = tester.widget<AppButton>(_add);
  expect(add.label, 'Add Member');
  expect(add.icon, Icons.person_add_alt_1_outlined);
  expect(add.variant, AppButtonVariant.primary);
  expect(add.isLoading, isFalse);
  expect(add.onPressed, isNotNull);
  expect(tester.getSize(_add).height, greaterThanOrEqualTo(48));
  expect(tester.getSize(_add).width, greaterThanOrEqualTo(48));
  expect(
    tester.getSemantics(_add),
    matchesSemantics(
      label: 'Add Member',
      isButton: true,
      hasEnabledState: true,
      isEnabled: true,
      hasTapAction: true,
    ),
  );
}

void main() {
  setUpAll(loadSettleoraVisualTestFonts);

  testWidgets('member add shared controls preserve exact mechanics', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final repository = groups.FakeGroupRepository(
      group: groups.sampleGroup(),
      members: [groups.sampleMember(displayName: 'Taylor')],
    );
    await _mount(tester, repository, width: 390, scale: 1);
    _expectControlContract(tester);

    final controller = tester.widget<AppTextField>(_field).controller!;
    await tester.tap(_textField);
    await tester.pump();
    expect(tester.widget<EditableText>(_editable).focusNode.hasFocus, isTrue);
    expect(tester.testTextInput.isVisible, isTrue);
    await tester.enterText(_textField, _rawProfileId);
    expect(controller.text, _rawProfileId);
    await tester.testTextInput.receiveAction(TextInputAction.next);
    await tester.pump();
    expect(tester.widget<EditableText>(_editable).focusNode.hasFocus, isFalse);

    await _selectOwner(tester);
    expect(
      tester.widget<DropdownButton<String>>(_role).value,
      SettleoraGroupRoleValues.owner,
    );
    await tester.tap(_add);
    await tester.pumpAndSettle();

    expect(repository.addMemberCalls, 1);
    expect(repository.lastGroupId, groups.sampleGroup().id);
    expect(repository.lastMemberAdd!.userProfileId, _rawProfileId);
    expect(repository.lastMemberAdd!.role, SettleoraGroupRoleValues.owner);
    expect(controller.text, isEmpty);
    expect(
      tester.widget<DropdownButton<String>>(_role).value,
      SettleoraGroupRoleValues.member,
    );
    expect(find.text('Member added.'), findsOneWidget);
    expect(find.text('Morgan'), findsOneWidget);
    expect(tester.widget<AppButton>(_add).isLoading, isFalse);
    expect(tester.widget<AppButton>(_add).onPressed, isNotNull);
    semantics.dispose();
  });

  testWidgets('member add loading disables action and blocks duplicates', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final completer = Completer<SettleoraGroupMember>();
    final repository = groups.FakeGroupRepository(
      group: groups.sampleGroup(),
      members: [groups.sampleMember(displayName: 'Taylor')],
      addMemberCompleter: completer,
    );
    await _mount(tester, repository, width: 390, scale: 1);
    await tester.enterText(_textField, _rawProfileId);
    final callback = tester.widget<AppButton>(_add).onPressed!;
    callback();
    callback();
    callback();
    await tester.pump();

    expect(repository.addMemberCalls, 1);
    final add = tester.widget<AppButton>(_add);
    expect(add.isLoading, isTrue);
    expect(add.onPressed, isNull);
    expect(tester.widget<DropdownButton<String>>(_role).onChanged, isNull);
    expect(
      find.descendant(
        of: _add,
        matching: find.byType(CircularProgressIndicator),
      ),
      findsOneWidget,
    );
    expect(
      tester.getSize(
        find.descendant(
          of: _add,
          matching: find.byType(CircularProgressIndicator),
        ),
      ),
      const Size.square(18),
    );
    expect(
      tester.getSemantics(_add),
      matchesSemantics(
        label: 'Add Member',
        value: 'In progress',
        isButton: true,
        hasEnabledState: true,
        isEnabled: false,
      ),
    );

    completer.complete(
      groups.sampleMember(
        userProfileId: _rawProfileId.trim(),
        displayName: 'Morgan',
      ),
    );
    await tester.pumpAndSettle();
    expect(repository.addMemberCalls, 1);
    expect(tester.widget<AppButton>(_add).isLoading, isFalse);
    expect(tester.widget<DropdownButton<String>>(_role).onChanged, isNotNull);
    semantics.dispose();
  });

  testWidgets('member mutation guard blocks concurrent member add', (
    tester,
  ) async {
    final updateCompleter = Completer<SettleoraGroupMember>();
    final repository = groups.FakeGroupRepository(
      group: groups.sampleGroup(),
      members: [groups.sampleMember(displayName: 'Taylor')],
      updateMemberCompleter: updateCompleter,
    );
    await _mount(tester, repository, width: 390, scale: 1);
    await tester.enterText(_textField, _rawProfileId);

    final menu = find.byKey(
      const ValueKey(
        'group-member-actions-22222222-2222-2222-2222-222222222222',
      ),
    );
    await _reveal(tester, menu);
    await tester.tap(menu);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Make Owner'));
    await tester.pump();
    expect(repository.updateMemberCalls, 1);

    tester.widget<AppButton>(_add).onPressed!();
    await tester.pump();
    expect(repository.addMemberCalls, 0);
    expect(tester.widget<AppButton>(_add).isLoading, isFalse);

    updateCompleter.complete(
      groups.sampleMember(
        displayName: 'Taylor',
        role: SettleoraGroupRoleValues.owner,
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(_add);
    await tester.pumpAndSettle();
    expect(repository.addMemberCalls, 1);
  });

  testWidgets('member add failure preserves form and clears busy state', (
    tester,
  ) async {
    final repository = groups.FakeGroupRepository(
      group: groups.sampleGroup(),
      members: [groups.sampleMember(displayName: 'Taylor')],
      actionFailure: const SettleoraGroupFailure(
        kind: SettleoraGroupFailureKind.validation,
        message: 'Choose a profile that can join this group.',
      ),
    );
    await _mount(tester, repository, width: 390, scale: 1);
    final controller = tester.widget<AppTextField>(_field).controller!;
    await tester.enterText(_textField, _rawProfileId);
    await _selectOwner(tester);
    await tester.tap(_add);
    await tester.pumpAndSettle();

    expect(repository.addMemberCalls, 1);
    expect(
      find.text('Choose a profile that can join this group.'),
      findsOneWidget,
    );
    expect(controller.text, _rawProfileId);
    expect(
      tester.widget<DropdownButton<String>>(_role).value,
      SettleoraGroupRoleValues.owner,
    );
    expect(tester.widget<AppButton>(_add).isLoading, isFalse);
    expect(tester.widget<AppButton>(_add).onPressed, isNotNull);
  });

  testWidgets('member add replaces a returned profile without duplicate rows', (
    tester,
  ) async {
    final replacement = groups.sampleMember(
      displayName: 'Taylor Updated',
      role: SettleoraGroupRoleValues.owner,
    );
    final repository = groups.FakeGroupRepository(
      group: groups.sampleGroup(),
      members: [groups.sampleMember(displayName: 'Taylor')],
      addMemberResult: replacement,
    );
    await _mount(tester, repository, width: 390, scale: 1);
    await tester.enterText(_textField, groups.sampleMember().userProfileId);
    await tester.tap(_add);
    await tester.pumpAndSettle();

    expect(repository.addMemberCalls, 1);
    await _reveal(
      tester,
      find.byKey(
        const ValueKey(
          'group-member-actions-22222222-2222-2222-2222-222222222222',
        ),
      ),
    );
    expect(find.text('Taylor Updated'), findsOneWidget);
    expect(find.text('Taylor'), findsNothing);
    expect(
      find.byKey(
        const ValueKey(
          'group-member-actions-22222222-2222-2222-2222-222222222222',
        ),
      ),
      findsOneWidget,
    );
  });

  for (final narrow in [false, true]) {
    final width = narrow ? 320.0 : 390.0;
    final scale = narrow ? 2.0 : 1.0;
    final suffix = narrow ? '320-2x' : '390-1x';

    testWidgets('$suffix captures production member-add states', (
      tester,
    ) async {
      final completer = Completer<SettleoraGroupMember>();
      final repository = groups.FakeGroupRepository(
        group: groups.sampleGroup(),
        members: [groups.sampleMember(displayName: 'Taylor')],
        addMemberCompleter: completer,
      );
      await _mount(tester, repository, width: width, scale: scale);
      _expectControlContract(tester);
      await _capture(tester, '$suffix-normal-default-role');

      await tester.enterText(_textField, _rawProfileId);
      await tester.pump();
      expect(
        tester.widget<AppTextField>(_field).controller!.text,
        _rawProfileId,
      );
      final labelRect = tester.getRect(find.text('User profile ID'));
      final editRect = tester.getRect(_editable);
      expect(labelRect.bottom, lessThanOrEqualTo(editRect.top));
      await _capture(tester, '$suffix-populated-profile-id');

      await _selectOwner(tester);
      await _capture(tester, '$suffix-owner-role-selected');

      await tester.tap(_add);
      await tester.pump();
      expect(tester.widget<AppButton>(_add).isLoading, isTrue);
      await _capture(tester, '$suffix-add-busy-disabled');

      completer.complete(
        groups.sampleMember(
          userProfileId: _rawProfileId.trim(),
          displayName: 'Morgan',
          role: SettleoraGroupRoleValues.owner,
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(_field);
      await tester.pumpAndSettle();
      expect(tester.widget<AppTextField>(_field).controller!.text, isEmpty);
      expect(
        tester.widget<DropdownButton<String>>(_role).value,
        SettleoraGroupRoleValues.member,
      );
      await _capture(tester, '$suffix-success-reset');

      await tester.tap(_textField);
      await tester.pump();
      expect(tester.widget<EditableText>(_editable).focusNode.hasFocus, isTrue);
      await _capture(tester, '$suffix-profile-field-focused');

      for (final control in [_field, _role, _add]) {
        await tester.ensureVisible(control);
        await tester.pumpAndSettle();
        final rect = tester.getRect(control);
        expect(rect.left, greaterThanOrEqualTo(0));
        expect(rect.right, lessThanOrEqualTo(width));
      }
      expect(tester.takeException(), isNull);
    });

    testWidgets('$suffix captures production member-add failure', (
      tester,
    ) async {
      final repository = groups.FakeGroupRepository(
        group: groups.sampleGroup(),
        members: [groups.sampleMember(displayName: 'Taylor')],
        actionFailure: const SettleoraGroupFailure(
          kind: SettleoraGroupFailureKind.validation,
          message: 'Choose a profile that can join this group.',
        ),
      );
      await _mount(tester, repository, width: width, scale: scale);
      await tester.enterText(_textField, _rawProfileId);
      await tester.tap(_add);
      await tester.pumpAndSettle();
      final failure = find.text('Choose a profile that can join this group.');
      for (
        var attempt = 0;
        attempt < 12 && failure.evaluate().isEmpty;
        attempt += 1
      ) {
        await tester.drag(find.byType(ListView), const Offset(0, 240));
        await tester.pumpAndSettle();
      }
      expect(failure, findsOneWidget);
      await tester.ensureVisible(failure);
      await tester.pumpAndSettle();
      await _capture(tester, '$suffix-failure');
    });

    testWidgets('$suffix keeps focused controls reachable above keyboard', (
      tester,
    ) async {
      await _mount(
        tester,
        groups.FakeGroupRepository(
          group: groups.sampleGroup(),
          members: [groups.sampleMember(displayName: 'Taylor')],
        ),
        width: width,
        scale: scale,
        inset: 300,
      );
      await tester.tap(_textField);
      await tester.pumpAndSettle();
      expect(tester.widget<EditableText>(_editable).focusNode.hasFocus, isTrue);
      expect(tester.testTextInput.isVisible, isTrue);
      for (final control in [_field, _role, _add]) {
        await tester.ensureVisible(control);
        await tester.pumpAndSettle();
        expect(control.hitTestable(), findsOneWidget);
        expect(tester.getRect(control).bottom, lessThanOrEqualTo(544));
      }
      await _capture(tester, '$suffix-keyboard-focus-reachable');
      expect(tester.takeException(), isNull);
    });
  }
}
