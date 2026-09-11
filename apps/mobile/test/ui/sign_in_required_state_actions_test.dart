import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/notifications/notification_repository.dart';
import 'package:mobile/notifications/notification_screen.dart';
import 'package:mobile/profile/profile_repository.dart';
import 'package:mobile/profile/profile_screen.dart';
import 'package:mobile/reports/monthly_report_screen.dart';
import 'package:mobile/reports/report_repository.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../helpers/settleora_visual_test_fonts.dart';
import '../monthly_report_screen_test.dart' as monthly;
import '../notification_screen_test.dart' as notifications;
import '../profile_screen_test.dart' as profile;

const _captureKey = Key('sign-in-required-state-action-capture');
final _output = settleoraVisualOutputDirectory(
  '20260908-0828-failure-retry-state-actions',
);

enum _Host { profile, monthlyReport, notifications }

extension on _Host {
  String get slug => switch (this) {
    _Host.profile => 'profile',
    _Host.monthlyReport => 'monthly-report',
    _Host.notifications => 'notification',
  };

  Key get actionKey => Key('$slug-sign-in-required');

  Key get retryKey => Key('$slug-retry');
}

class _Fixture {
  const _Fixture({
    required this.screen,
    required this.expectInitialLoad,
    required this.expectRetryReload,
    required this.expectNoMutations,
  });

  final Widget screen;
  final VoidCallback expectInitialLoad;
  final VoidCallback expectRetryReload;
  final VoidCallback expectNoMutations;
}

void main() {
  setUpAll(loadSettleoraVisualTestFonts);

  for (final host in _Host.values) {
    testWidgets(
      '${host.slug} preserves both sign-in classifications and gate',
      (tester) async {
        for (final kind in ['required', 'expired']) {
          final fixture = _fixture(
            host,
            failureKind: kind,
            onSessionEnded: (_) async {},
          );
          await _pump(tester, fixture.screen);

          expect(find.byKey(host.actionKey), findsOneWidget);
          expect(find.byKey(Key('${host.slug}-retry')), findsNothing);
        }

        final nullCallback = _fixture(host, failureKind: 'expired');
        await _pump(tester, nullCallback.screen);
        expect(find.byKey(host.actionKey), findsNothing);
        expect(find.byKey(Key('${host.slug}-retry')), findsOneWidget);

        final otherFailure = _fixture(
          host,
          failureKind: 'network',
          onSessionEnded: (_) async {},
        );
        await _pump(tester, otherFailure.screen);
        expect(find.byKey(host.actionKey), findsNothing);
        expect(find.byKey(host.retryKey), findsOneWidget);
        expect(find.text('Server unavailable'), findsOneWidget);
        expect(find.byIcon(Icons.cloud_off_outlined), findsOneWidget);
      },
    );

    for (final narrow in [false, true]) {
      final viewport = narrow ? '320-2x' : '390-1x';
      testWidgets(
        '${host.slug} $viewport uses the production shared failure actions',
        (tester) async {
          var callbackCalls = 0;
          String? callbackMessage;
          final fixture = _fixture(
            host,
            failureKind: 'expired',
            onSessionEnded: (message) async {
              callbackCalls += 1;
              callbackMessage = message;
            },
          );

          await setSettleoraMobileViewport(tester, width: narrow ? 320 : 390);
          await tester.pumpWidget(
            RepaintBoundary(
              key: _captureKey,
              child: MaterialApp(
                debugShowCheckedModeBanner: false,
                theme: SettleoraTheme.midnight(),
                builder: (context, child) => MediaQuery(
                  data: MediaQuery.of(
                    context,
                  ).copyWith(textScaler: TextScaler.linear(narrow ? 2 : 1)),
                  child: child!,
                ),
                home: fixture.screen,
              ),
            ),
          );
          await tester.pumpAndSettle();

          final action = find.byKey(host.actionKey);
          expect(action, findsOneWidget);
          expect(
            find.ancestor(
              of: action,
              matching: find.byType(SettleoraStatePanel),
            ),
            findsOneWidget,
          );
          final button = tester.widget<AppButton>(action);
          expect(button.label, 'Sign In');
          expect(button.icon, Icons.login_outlined);
          expect(button.variant, AppButtonVariant.primary);
          expect(button.expanded, isFalse);
          expect(button.isLoading, isFalse);
          expect(button.onPressed, isNotNull);
          expect(find.text('Sign in again'), findsOneWidget);
          expect(find.byIcon(Icons.lock_outline), findsOneWidget);
          expect(find.text(_message(host, 'expired')), findsOneWidget);
          expect(find.byIcon(Icons.login_outlined), findsOneWidget);
          expect(tester.getSize(action).height, greaterThanOrEqualTo(48));
          expect(tester.getSize(action).width, greaterThanOrEqualTo(48));
          expect(tester.takeException(), isNull);

          final semantics = tester.ensureSemantics();
          final data = tester.getSemantics(action).getSemanticsData();
          expect(data.label, 'Sign In');
          expect(data.flagsCollection.isButton, isTrue);
          expect(data.flagsCollection.isEnabled.name, 'isTrue');
          expect(data.hasAction(SemanticsAction.tap), isTrue);
          expect(_semanticLabelCount(tester, 'Sign In'), 1);

          await _png(tester, '${host.slug}-$viewport-sign-in');
          final previousHighlightStrategy =
              FocusManager.instance.highlightStrategy;
          FocusManager.instance.highlightStrategy =
              FocusHighlightStrategy.alwaysTraditional;
          addTearDown(() {
            FocusManager.instance.highlightStrategy = previousHighlightStrategy;
          });
          await _focusWithKeyboard(tester, action);
          await tester.pumpAndSettle();
          await _png(tester, '${host.slug}-$viewport-focused');

          await tester.tap(action);
          await tester.pumpAndSettle();
          expect(callbackCalls, 1);
          expect(callbackMessage, _message(host, 'expired'));
          fixture.expectNoMutations();
          semantics.dispose();

          final otherFailure = _fixture(
            host,
            failureKind: 'network',
            onSessionEnded: (_) async {},
          );
          await _pumpCapture(tester, otherFailure.screen, narrow: narrow);
          expect(find.byKey(host.actionKey), findsNothing);
          final retry = find.byKey(host.retryKey);
          expect(retry, findsOneWidget);
          expect(
            find.ancestor(
              of: retry,
              matching: find.byType(SettleoraStatePanel),
            ),
            findsOneWidget,
          );
          final retryButton = tester.widget<AppButton>(retry);
          expect(retryButton.label, 'Retry');
          expect(retryButton.icon, Icons.refresh);
          expect(retryButton.variant, AppButtonVariant.secondary);
          expect(retryButton.expanded, isFalse);
          expect(retryButton.isLoading, isFalse);
          expect(retryButton.onPressed, isNotNull);
          expect(tester.getSize(retry).height, greaterThanOrEqualTo(48));
          expect(tester.getSize(retry).width, greaterThanOrEqualTo(48));
          otherFailure.expectInitialLoad();

          final retrySemantics = tester.ensureSemantics();
          final retryData = tester.getSemantics(retry).getSemanticsData();
          expect(retryData.label, 'Retry');
          expect(retryData.flagsCollection.isButton, isTrue);
          expect(retryData.flagsCollection.isEnabled.name, 'isTrue');
          expect(retryData.hasAction(SemanticsAction.tap), isTrue);
          expect(_semanticLabelCount(tester, 'Retry'), 1);
          await _png(tester, '${host.slug}-$viewport-non-sign-in');
          await _focusWithKeyboard(tester, retry);
          await tester.pumpAndSettle();
          await _png(tester, '${host.slug}-$viewport-retry-focused');

          await tester.tap(retry);
          await tester.pumpAndSettle();
          otherFailure.expectRetryReload();
          otherFailure.expectNoMutations();
          retrySemantics.dispose();
        },
      );
    }
  }
}

_Fixture _fixture(
  _Host host, {
  required String failureKind,
  Future<void> Function(String? message)? onSessionEnded,
}) {
  switch (host) {
    case _Host.profile:
      final repository = profile.FakeProfileRepository(
        loadFailure: failureKind == 'network'
            ? null
            : SettleoraProfileFailure(
                kind: switch (failureKind) {
                  'required' => SettleoraProfileFailureKind.sessionRequired,
                  _ => SettleoraProfileFailureKind.sessionExpired,
                },
                message: _message(host, failureKind),
              ),
      );
      if (failureKind == 'network') {
        repository.nextProfileReadFailure = SettleoraProfileFailure(
          kind: SettleoraProfileFailureKind.network,
          message: _message(host, failureKind),
        );
      }
      return _Fixture(
        screen: SettleoraProfileScreen(
          repository: repository,
          currentUser: profile.sampleCurrentUser(),
          onSessionEnded: onSessionEnded,
        ),
        expectInitialLoad: () {
          expect(repository.profileReadCalls, 1);
          expect(repository.paymentReadCalls, 0);
        },
        expectRetryReload: () {
          expect(repository.profileReadCalls, 2);
          expect(repository.paymentReadCalls, 1);
        },
        expectNoMutations: () {
          expect(repository.profileUpdateCalls, 0);
          expect(repository.paymentUpdateCalls, 0);
        },
      );
    case _Host.monthlyReport:
      final repository = monthly.FakeMonthlyReportRepository(
        loadFailures: [
          SettleoraMonthlyReportFailure(
            kind: switch (failureKind) {
              'required' => SettleoraMonthlyReportFailureKind.sessionRequired,
              'expired' => SettleoraMonthlyReportFailureKind.sessionExpired,
              _ => SettleoraMonthlyReportFailureKind.network,
            },
            message: _message(host, failureKind),
          ),
        ],
      );
      return _Fixture(
        screen: SettleoraMonthlyReportScreen(
          repository: repository,
          initialMonth: '2026-05',
          onSessionEnded: onSessionEnded,
        ),
        expectInitialLoad: () {
          expect(repository.calls, 1);
          expect(repository.requestedMonths, ['2026-05']);
          expect(repository.requestedGroupIds, [null]);
        },
        expectRetryReload: () {
          expect(repository.calls, 2);
          expect(repository.requestedMonths, ['2026-05', '2026-05']);
          expect(repository.requestedGroupIds, [null, null]);
        },
        expectNoMutations: () {},
      );
    case _Host.notifications:
      final repository = notifications.FakeNotificationRepository(
        loadFailures: [
          SettleoraNotificationFailure(
            kind: switch (failureKind) {
              'required' => SettleoraNotificationFailureKind.sessionRequired,
              'expired' => SettleoraNotificationFailureKind.sessionExpired,
              _ => SettleoraNotificationFailureKind.network,
            },
            message: _message(host, failureKind),
          ),
        ],
      );
      return _Fixture(
        screen: SettleoraNotificationScreen(
          repository: repository,
          onSessionEnded: onSessionEnded,
        ),
        expectInitialLoad: () {
          expect(repository.summaryCalls, 1);
          expect(repository.listCalls, 0);
        },
        expectRetryReload: () {
          expect(repository.summaryCalls, 2);
          expect(repository.listCalls, 1);
        },
        expectNoMutations: () {
          expect(repository.markReadCalls, 0);
          expect(repository.markAllReadCalls, 0);
          expect(repository.archiveCalls, 0);
          expect(repository.restoreCalls, 0);
        },
      );
  }
}

String _message(_Host host, String failureKind) {
  if (failureKind == 'network') {
    return 'The server is unavailable. Try again when the connection is back.';
  }
  if (failureKind == 'required') {
    return switch (host) {
      _Host.profile => 'Sign in before loading account details.',
      _Host.monthlyReport => 'Sign in before loading monthly reports.',
      _Host.notifications => 'Sign in before loading notifications.',
    };
  }
  return switch (host) {
    _Host.profile =>
      'Your session has expired. Sign in again before loading account details.',
    _Host.monthlyReport =>
      'Your session has expired. Sign in again before loading monthly reports.',
    _Host.notifications =>
      'Your session has expired. Sign in again before loading notifications.',
  };
}

Future<void> _pump(WidgetTester tester, Widget screen) async {
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump();
  await tester.pumpWidget(
    MaterialApp(theme: SettleoraTheme.light(), home: screen),
  );
  await tester.pumpAndSettle();
}

Future<void> _pumpCapture(
  WidgetTester tester,
  Widget screen, {
  required bool narrow,
}) async {
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump();
  await tester.pumpWidget(
    RepaintBoundary(
      key: _captureKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.midnight(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(narrow ? 2 : 1)),
          child: child!,
        ),
        home: screen,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _focusWithKeyboard(WidgetTester tester, Finder action) async {
  for (var index = 0; index < 8; index += 1) {
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    final context = FocusManager.instance.primaryFocus?.context;
    if (context == null) continue;
    final focusedWidget = find.byWidgetPredicate(
      (widget) => identical(widget, context.widget),
    );
    if (find
        .ancestor(of: focusedWidget, matching: action)
        .evaluate()
        .isNotEmpty) {
      return;
    }
  }
  fail('Keyboard traversal did not reach the shared sign-in action.');
}

int _semanticLabelCount(WidgetTester tester, String label) {
  final owner = tester.binding.renderViews.first.owner!.semanticsOwner!;
  var count = 0;
  owner.rootSemanticsNode!.visitChildren((node) {
    bool visit(SemanticsNode current) {
      if (current.getSemanticsData().label == label) count += 1;
      current.visitChildren(visit);
      return true;
    }

    visit(node);
    return true;
  });
  return count;
}

Future<void> _png(WidgetTester tester, String name) async {
  await tester.pump();
  expect(tester.takeException(), isNull, reason: name);
  await tester.runAsync(() async {
    final image = await tester
        .renderObject<RenderRepaintBoundary>(find.byKey(_captureKey))
        .toImage(pixelRatio: 1);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(_output).create(recursive: true);
    await File('$_output/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}
