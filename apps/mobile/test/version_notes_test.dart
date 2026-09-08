import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/app_configuration.dart';
import 'package:mobile/app/app_bootstrap.dart';
import 'package:mobile/app/secure_storage.dart';
import 'package:mobile/app/server_mode_shell.dart';
import 'package:mobile/app/version_notes.dart';
import 'package:mobile/main.dart';
import 'package:mobile/ui/settleora_components.dart';

import 'server_mode_shell_dashboard_test.dart' as dashboard;

void main() {
  group('local version-seen preference', () {
    test(
      'stores only the current release key through the low-level store',
      () async {
        final store = _MemoryKeyValueStore();
        final preference = LocalSettleoraVersionSeenPreference(
          keyValueStore: store,
        );

        expect(await preference.readSeenReleaseKey(), isNull);
        await preference.writeSeenReleaseKey(' 1.0.0+1 ');

        expect(store.values.length, 1);
        expect(store.values.values.single, '1.0.0+1');
        expect(await preference.readSeenReleaseKey(), '1.0.0+1');
      },
    );

    test('malformed oversized stored value is treated as unseen', () async {
      final store = _MemoryKeyValueStore();
      final preference = LocalSettleoraVersionSeenPreference(
        keyValueStore: store,
      );
      store.values['settleora.presentation.whats_new.seen_release_key.v1'] =
          'x' * 129;

      expect(await preference.readSeenReleaseKey(), isNull);
    });
  });

  testWidgets(
    'unseen notes open over setup and explicit close marks seen once',
    (tester) async {
      final preference = _FakeVersionSeenPreference();

      await _pumpApp(tester, preference: preference);

      expect(find.text('Settleora Setup'), findsOneWidget);
      expect(find.byType(SettleoraGuidanceContent), findsOneWidget);
      expect(find.text("What's New in Settleora 1.0"), findsOneWidget);

      final close = find.byKey(const Key('whats-new-close'));
      expect(tester.getSize(close).height, greaterThanOrEqualTo(48));
      await tester.tap(close);
      await tester.pumpAndSettle();

      expect(find.byType(SettleoraGuidanceContent), findsNothing);
      expect(find.text('Settleora Setup'), findsOneWidget);
      expect(preference.writeCalls, 1);
      expect(preference.seenKey, currentBundledVersionNotesKey);
      final focusedContext = FocusManager.instance.primaryFocus?.context;
      expect(
        focusedContext
            ?.findAncestorWidgetOfExactType<SettleoraBottomSheetFrame>(),
        isNull,
      );
    },
  );

  testWidgets('ordinary modal dismissal is skippable and marks seen', (
    tester,
  ) async {
    final preference = _FakeVersionSeenPreference();
    await _pumpApp(tester, preference: preference);

    await tester.tapAt(const Offset(8, 8));
    await tester.pumpAndSettle();

    expect(find.byType(SettleoraGuidanceContent), findsNothing);
    expect(find.text('Settleora Setup'), findsOneWidget);
    expect(preference.writeCalls, 1);
  });

  testWidgets('persisted current release does not open automatically', (
    tester,
  ) async {
    final preference = _FakeVersionSeenPreference(
      seenKey: currentBundledVersionNotesKey,
    );
    await _pumpApp(tester, preference: preference);

    expect(find.text('Settleora Setup'), findsOneWidget);
    expect(find.byType(SettleoraGuidanceContent), findsNothing);
    expect(preference.writeCalls, 0);
  });

  testWidgets('dismissed release stays closed and a changed release opens', (
    tester,
  ) async {
    final preference = _FakeVersionSeenPreference();
    final processGuard = SettleoraVersionNotesProcessGuard();
    await _pumpApp(tester, preference: preference, processGuard: processGuard);
    expect(find.byType(SettleoraGuidanceContent), findsOneWidget);
    await tester.tap(find.byKey(const Key('whats-new-close')));
    await tester.pumpAndSettle();
    expect(find.byType(SettleoraGuidanceContent), findsNothing);

    await _pumpApp(
      tester,
      preference: preference,
      processGuard: processGuard,
      notes: const SettleoraBundledVersionNotes(
        releaseKey: '1.0.0+2',
        heading: "What's New in Settleora 1.0 build 2",
      ),
    );
    expect(find.text("What's New in Settleora 1.0 build 2"), findsOneWidget);
  });

  testWidgets('preference read delay never blocks the setup surface', (
    tester,
  ) async {
    final completer = Completer<String?>();
    final preference = _FakeVersionSeenPreference(readCompleter: completer);

    await tester.pumpWidget(
      SettleoraMobileApp(
        secureStorage: _FakeSecureStorage(),
        versionSeenPreference: preference,
        versionNotesProcessGuard: SettleoraVersionNotesProcessGuard(),
      ),
    );
    await tester.pump();
    await tester.pump();

    expect(find.text('Settleora Setup'), findsOneWidget);
    expect(find.byType(SettleoraGuidanceContent), findsNothing);

    completer.complete(null);
    await tester.pump();
    await tester.pumpAndSettle();
    expect(find.byType(SettleoraGuidanceContent), findsOneWidget);
  });

  testWidgets('read failure leaves startup usable without a retry loop', (
    tester,
  ) async {
    final preference = _FakeVersionSeenPreference(readFailure: true);
    await _pumpApp(tester, preference: preference);

    expect(find.text('Settleora Setup'), findsOneWidget);
    expect(find.byType(SettleoraGuidanceContent), findsNothing);
    expect(preference.readCalls, 1);

    await tester.pumpWidget(
      SettleoraMobileApp(
        secureStorage: _FakeSecureStorage(),
        versionSeenPreference: preference,
        versionNotesProcessGuard: SettleoraVersionNotesProcessGuard(),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Settleora Setup'), findsOneWidget);
  });

  testWidgets('write failure closes and cannot re-show in the same process', (
    tester,
  ) async {
    final preference = _FakeVersionSeenPreference(writeFailure: true);
    final storage = _FakeSecureStorage();
    final processGuard = SettleoraVersionNotesProcessGuard();
    await _pumpApp(
      tester,
      preference: preference,
      storage: storage,
      processGuard: processGuard,
    );

    await tester.tap(find.byKey(const Key('whats-new-close')));
    await tester.pumpAndSettle();
    expect(find.text('Settleora Setup'), findsOneWidget);
    expect(preference.writeCalls, 1);

    await _pumpApp(
      tester,
      preference: preference,
      storage: storage,
      processGuard: processGuard,
    );
    expect(find.byType(SettleoraGuidanceContent), findsNothing);
    expect(preference.writeCalls, 1);
    expect(preference.readCalls, 2);
  });

  testWidgets('missing and invalid bundled payloads never trap startup', (
    tester,
  ) async {
    for (final notes in <SettleoraBundledVersionNotes?>[
      null,
      const SettleoraBundledVersionNotes(releaseKey: '', heading: "What's New"),
      const SettleoraBundledVersionNotes(releaseKey: '1.0.0+1', heading: '   '),
    ]) {
      await _pumpApp(
        tester,
        preference: _FakeVersionSeenPreference(),
        notes: notes,
      );
      expect(find.text('Settleora Setup'), findsOneWidget);
      expect(find.byType(SettleoraGuidanceContent), findsNothing);
    }
  });

  testWidgets('configured server shows notes before sign-in', (tester) async {
    final storage = _FakeSecureStorage(
      configuration: SettleoraAppConfiguration.server(
        serverBaseUri: Uri.parse('https://settleora.example/'),
      ),
    );
    await _pumpApp(
      tester,
      preference: _FakeVersionSeenPreference(),
      storage: storage,
    );

    expect(find.text('Sign in to Settleora'), findsOneWidget);
    expect(find.byType(SettleoraGuidanceContent), findsOneWidget);
  });

  testWidgets('local-only mode shows notes without creating a repository', (
    tester,
  ) async {
    var repositoryCreated = false;
    final storage = _FakeSecureStorage(
      configuration: const SettleoraAppConfiguration.local(),
    );
    await tester.pumpWidget(
      SettleoraMobileApp(
        secureStorage: storage,
        versionSeenPreference: _FakeVersionSeenPreference(),
        versionNotesProcessGuard: SettleoraVersionNotesProcessGuard(),
        receiptOcrReviewRepositoryFactory: (_, _) {
          repositoryCreated = true;
          return dashboard.FakeReceiptOcrReviewRepository();
        },
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Local Mode'), findsOneWidget);
    expect(find.byType(SettleoraGuidanceContent), findsOneWidget);
    expect(repositoryCreated, isFalse);
    await tester.tap(find.byKey(const Key('whats-new-close')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('bootstrap-connect-server')), findsOneWidget);
    final localLauncher = find.byKey(const Key('bootstrap-whats-new'));
    expect(localLauncher, findsOneWidget);
    await tester.tap(localLauncher);
    await tester.pumpAndSettle();
    expect(find.byType(SettleoraGuidanceContent), findsOneWidget);
    await tester.tap(find.byKey(const Key('whats-new-close')));
    await tester.pumpAndSettle();
    expect(tester.widget<AppButton>(localLauncher).focusNode?.hasFocus, isTrue);
  });

  testWidgets('manual local open wins a delayed automatic-read race', (
    tester,
  ) async {
    final readCompleter = Completer<String?>();
    final preference = _FakeVersionSeenPreference(readCompleter: readCompleter);
    await tester.pumpWidget(
      SettleoraMobileApp(
        secureStorage: _FakeSecureStorage(
          configuration: const SettleoraAppConfiguration.local(),
        ),
        versionSeenPreference: preference,
        versionNotesProcessGuard: SettleoraVersionNotesProcessGuard(),
      ),
    );
    await tester.pump();
    await tester.pump();

    await tester.tap(find.byKey(const Key('bootstrap-whats-new')));
    await tester.pumpAndSettle();
    expect(find.byType(SettleoraGuidanceContent), findsOneWidget);

    readCompleter.complete(null);
    await tester.pump();
    await tester.pumpAndSettle();
    expect(find.byType(SettleoraGuidanceContent), findsOneWidget);

    await tester.tap(find.byKey(const Key('whats-new-close')));
    await tester.pumpAndSettle();
    expect(find.byType(SettleoraGuidanceContent), findsNothing);
  });

  testWidgets('settings reopens the same seen notes and returns focus', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(900, 1600));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final processGuard = SettleoraVersionNotesProcessGuard();
    await _pumpShell(tester, processGuard: processGuard);
    await tester.tap(find.byKey(const Key('bottom-nav-more')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const Key('server-shell-more-settings')),
      240,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.ensureVisible(
      find.byKey(const Key('server-shell-more-settings')),
    );
    await tester.tap(find.byKey(const Key('server-shell-more-settings')));
    await tester.pumpAndSettle();

    final launcher = find.byKey(const Key('settings-whats-new'));
    expect(launcher, findsOneWidget);
    expect(find.text("What's New"), findsOneWidget);
    await tester.tap(launcher);
    await tester.pumpAndSettle();

    expect(find.byType(SettleoraGuidanceContent), findsOneWidget);
    expect(processGuard.hasAttempted(currentBundledVersionNotesKey), isTrue);
    expect(find.text(currentBundledVersionNotes.heading), findsOneWidget);
    await tester.tap(find.byKey(const Key('whats-new-close')));
    await tester.pumpAndSettle();

    final launcherFocus = find.descendant(
      of: launcher,
      matching: find.byWidgetPredicate(
        (widget) =>
            widget is Focus &&
            widget.focusNode?.debugLabel == 'settings-whats-new',
      ),
    );
    expect(launcherFocus, findsOneWidget);
    expect(tester.widget<Focus>(launcherFocus).focusNode?.hasFocus, isTrue);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    expect(find.byType(SettleoraGuidanceContent), findsOneWidget);
  });

  testWidgets('long localized-style notes scroll safely at 320px and 2x', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final longNotes = SettleoraBundledVersionNotes(
      releaseKey: '1.0.0+long',
      heading: "What's New in this longer localized Settleora release heading",
      description: 'Long localized description ' * 8,
      points: List.generate(
        8,
        (index) => 'Long localized product guidance point ${index + 1} ' * 5,
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: const TextScaler.linear(2)),
          child: child!,
        ),
        home: SettleoraAppBootstrap(
          secureStorage: _FakeSecureStorage(),
          versionSeenPreference: _FakeVersionSeenPreference(),
          versionNotesProcessGuard: SettleoraVersionNotesProcessGuard(),
          versionNotes: longNotes,
        ),
      ),
    );
    await tester.pumpAndSettle();

    final guidanceContext = tester.element(
      find.byType(SettleoraGuidanceContent),
    );
    expect(MediaQuery.textScalerOf(guidanceContext).scale(10), 20);
    expect(tester.takeException(), isNull);
    expect(find.byType(SingleChildScrollView), findsWidgets);
    final close = find.byKey(const Key('whats-new-close'));
    await tester.ensureVisible(close);
    await tester.pumpAndSettle();
    expect(tester.getSize(close).height, greaterThanOrEqualTo(48));
  });
}

Future<void> _pumpApp(
  WidgetTester tester, {
  required _FakeVersionSeenPreference preference,
  _FakeSecureStorage? storage,
  SettleoraBundledVersionNotes? notes = currentBundledVersionNotes,
  SettleoraVersionNotesProcessGuard? processGuard,
}) async {
  await tester.pumpWidget(
    SettleoraMobileApp(
      key: UniqueKey(),
      secureStorage: storage ?? _FakeSecureStorage(),
      versionSeenPreference: preference,
      versionNotesProcessGuard:
          processGuard ?? SettleoraVersionNotesProcessGuard(),
      versionNotes: notes,
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _pumpShell(
  WidgetTester tester, {
  SettleoraVersionNotesProcessGuard? processGuard,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: SettleoraAuthenticatedServerShell(
        currentUser: dashboard.sampleCurrentUser(),
        receiptOcrReviewRepository: dashboard.FakeReceiptOcrReviewRepository(),
        billRepository: dashboard.FakeBillRepository(),
        settlementRepository: dashboard.FakeSettlementRepository(),
        recurringBillRepository: dashboard.FakeRecurringBillRepository(),
        groupRepository: dashboard.FakeGroupRepository(),
        notificationRepository: dashboard.FakeNotificationRepository(),
        reportRepository: dashboard.FakeMonthlyReportRepository(),
        profileRepository: dashboard.FakeProfileRepository(),
        billSyncController: dashboard.sampleBillSyncController(),
        authRepository: dashboard.FakeAuthRepository(),
        accessTokenProvider: dashboard.FakeAccessTokenProvider(),
        onSessionEnded: (_) async {},
        versionNotesProcessGuard: processGuard,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

class _FakeVersionSeenPreference implements SettleoraVersionSeenPreference {
  _FakeVersionSeenPreference({
    this.seenKey,
    this.readFailure = false,
    this.writeFailure = false,
    this.readCompleter,
  });

  String? seenKey;
  final bool readFailure;
  final bool writeFailure;
  final Completer<String?>? readCompleter;
  int readCalls = 0;
  int writeCalls = 0;

  @override
  Future<String?> readSeenReleaseKey() async {
    readCalls += 1;
    if (readFailure) {
      throw StateError('preference read unavailable');
    }
    return readCompleter?.future ?? seenKey;
  }

  @override
  Future<void> writeSeenReleaseKey(String releaseKey) async {
    writeCalls += 1;
    if (writeFailure) {
      throw StateError('preference write unavailable');
    }
    seenKey = releaseKey;
  }
}

class _MemoryKeyValueStore implements SecureKeyValueStore {
  final Map<String, String> values = {};

  @override
  Future<void> delete(String key) async => values.remove(key);

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;
}

class _FakeSecureStorage implements SettleoraSecureStorageBoundary {
  _FakeSecureStorage({this.configuration});

  SettleoraAppConfiguration? configuration;
  SettleoraServerSessionMaterial? session;

  @override
  Future<void> clearServerSession() async => session = null;

  @override
  Future<SettleoraAppConfiguration?> readAppConfiguration() async =>
      configuration;

  @override
  Future<SettleoraServerSessionMaterial?> readServerSession() async => session;

  @override
  Future<void> writeAppConfiguration(
    SettleoraAppConfiguration configuration,
  ) async => this.configuration = configuration;

  @override
  Future<void> writeServerSession(
    SettleoraServerSessionMaterial session,
  ) async => this.session = session;
}
