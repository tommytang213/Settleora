import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/app_configuration.dart';
import 'package:mobile/app/auth_session_repository.dart';
import 'package:mobile/app/secure_storage.dart';
import 'package:mobile/main.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_repository.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_screen.dart';

void main() {
  testWidgets('default app starts at setup when no mode is configured', (
    tester,
  ) async {
    final storage = FakeSecureStorage();

    await tester.pumpWidget(SettleoraMobileApp(secureStorage: storage));
    await tester.pumpAndSettle();

    expect(find.text('Settleora Setup'), findsOneWidget);
    expect(find.text('Connect'), findsOneWidget);
    expect(find.text('Local'), findsOneWidget);
  });

  testWidgets('setup saves local mode without creating a server repository', (
    tester,
  ) async {
    final storage = FakeSecureStorage();
    var repositoryCreated = false;

    await tester.pumpWidget(
      SettleoraMobileApp(
        secureStorage: storage,
        receiptOcrReviewRepositoryFactory: (_, _) {
          repositoryCreated = true;
          return FakeReceiptOcrReviewRepository();
        },
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Local'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('setup-save')));
    await tester.pumpAndSettle();

    expect(storage.configuration?.mode, SettleoraAppMode.local);
    expect(storage.clearServerSessionCalls, 1);
    expect(repositoryCreated, isFalse);
    expect(find.text('Local Mode'), findsOneWidget);
    expect(find.textContaining('Server collaboration'), findsOneWidget);
  });

  testWidgets('setup rejects invalid server base URLs before saving', (
    tester,
  ) async {
    final storage = FakeSecureStorage();

    await tester.pumpWidget(SettleoraMobileApp(secureStorage: storage));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('setup-server-base-url')),
      '/relative',
    );
    await tester.tap(find.byKey(const Key('setup-save')));
    await tester.pumpAndSettle();

    expect(storage.configuration, isNull);
    expect(find.textContaining('absolute URL'), findsOneWidget);
  });

  testWidgets('server configuration without a session shows sign-in UI', (
    tester,
  ) async {
    final storage = FakeSecureStorage(
      configuration: SettleoraAppConfiguration.server(
        serverBaseUri: Uri.parse('https://settleora.example/'),
      ),
    );

    await tester.pumpWidget(SettleoraMobileApp(secureStorage: storage));
    await tester.pumpAndSettle();

    expect(find.text('Sign in to Settleora'), findsOneWidget);
    expect(find.byKey(const Key('sign-in-identifier')), findsOneWidget);
    expect(find.byKey(const Key('sign-in-password')), findsOneWidget);
    expect(find.text('Receipt Reviews'), findsNothing);
  });

  testWidgets('sign-in validation rejects blank input before auth calls', (
    tester,
  ) async {
    final storage = FakeSecureStorage(
      configuration: SettleoraAppConfiguration.server(
        serverBaseUri: Uri.parse('https://settleora.example/'),
      ),
    );
    final authRepository = FakeAuthRepository();

    await tester.pumpWidget(
      SettleoraMobileApp(
        secureStorage: storage,
        authRepositoryFactory: (_) => authRepository,
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('sign-in-submit')));
    await tester.pumpAndSettle();

    expect(find.text('Enter your account identifier.'), findsOneWidget);
    expect(find.text('Enter your password.'), findsOneWidget);
    expect(authRepository.signInCalls, 0);
    expect(storage.session, isNull);
  });

  testWidgets('successful sign-in stores session and reaches the shell', (
    tester,
  ) async {
    final storage = FakeSecureStorage(
      configuration: SettleoraAppConfiguration.server(
        serverBaseUri: Uri.parse('https://settleora.example/'),
      ),
    );
    final authRepository = FakeAuthRepository(
      signInSession: sampleSessionMaterial(),
    );
    final repository = FakeReceiptOcrReviewRepository(listResponse: const []);

    await tester.pumpWidget(
      SettleoraMobileApp(
        secureStorage: storage,
        authRepositoryFactory: (_) => authRepository,
        now: () => DateTime.utc(2026, 5, 14),
        receiptOcrReviewRepositoryFactory: (_, _) => repository,
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('sign-in-identifier')),
      'owner@example.test',
    );
    await tester.enterText(
      find.byKey(const Key('sign-in-password')),
      'redacted-password',
    );
    await tester.tap(find.byKey(const Key('sign-in-submit')));
    await tester.pumpAndSettle();

    expect(authRepository.signInCalls, 1);
    expect(authRepository.currentUserCalls, 1);
    expect(authRepository.lastAccessToken, 'redacted-signed-in-access');
    expect(storage.writeServerSessionCalls, 1);
    expect(storage.session?.accessToken, 'redacted-signed-in-access');
    expect(storage.session?.refreshCredential, 'redacted-signed-in-refresh');
    expect(find.byKey(const Key('server-shell-current-user')), findsOneWidget);
    expect(find.text('Taylor'), findsOneWidget);
    expect(find.text('Receipt Reviews'), findsOneWidget);
    expect(repository.listCalls, 0);

    await tester.tap(find.byKey(const Key('server-shell-receipt-reviews')));
    await tester.pumpAndSettle();

    expect(find.text('No receipt reviews'), findsOneWidget);
    expect(repository.listCalls, 1);
  });

  testWidgets('server mode with a verified session opens the shell', (
    tester,
  ) async {
    final storage = FakeSecureStorage(
      configuration: SettleoraAppConfiguration.server(
        serverBaseUri: Uri.parse('https://settleora.example/'),
      ),
      session: SettleoraServerSessionMaterial(
        accessToken: 'saved-access-token',
        accessSessionExpiresAtUtc: DateTime.utc(2026, 5, 15),
      ),
    );
    final authRepository = FakeAuthRepository();
    final repository = FakeReceiptOcrReviewRepository(listResponse: const []);

    await tester.pumpWidget(
      SettleoraMobileApp(
        secureStorage: storage,
        authRepositoryFactory: (_) => authRepository,
        now: () => DateTime.utc(2026, 5, 14),
        receiptOcrReviewRepositoryFactory: (_, _) => repository,
      ),
    );
    await tester.pumpAndSettle();

    expect(authRepository.currentUserCalls, 1);
    expect(authRepository.lastAccessToken, 'saved-access-token');
    expect(find.byKey(const Key('server-shell-current-user')), findsOneWidget);
    expect(find.text('Receipt Reviews'), findsOneWidget);
    expect(repository.listCalls, 0);

    await tester.tap(find.byKey(const Key('server-shell-receipt-reviews')));
    await tester.pumpAndSettle();

    expect(find.text('No receipt reviews'), findsOneWidget);
    expect(repository.listCalls, 1);
  });

  testWidgets('bootstrap refreshes an expired access session before shell', (
    tester,
  ) async {
    final storage = FakeSecureStorage(
      configuration: SettleoraAppConfiguration.server(
        serverBaseUri: Uri.parse('https://settleora.example/'),
      ),
      session: SettleoraServerSessionMaterial(
        accessToken: 'expired-access-token',
        accessSessionExpiresAtUtc: DateTime.utc(2026, 5, 13),
        refreshCredential: 'saved-refresh-token',
        refreshIdleExpiresAtUtc: DateTime.utc(2026, 5, 16),
        refreshAbsoluteExpiresAtUtc: DateTime.utc(2026, 6, 14),
      ),
    );
    final authRepository = FakeAuthRepository(
      refreshedSession: SettleoraServerSessionMaterial(
        accessToken: 'rotated-access-token',
        accessSessionExpiresAtUtc: DateTime.utc(2026, 5, 15),
        refreshCredential: 'rotated-refresh-token',
        refreshIdleExpiresAtUtc: DateTime.utc(2026, 5, 16),
        refreshAbsoluteExpiresAtUtc: DateTime.utc(2026, 6, 14),
      ),
    );

    await tester.pumpWidget(
      SettleoraMobileApp(
        secureStorage: storage,
        authRepositoryFactory: (_) => authRepository,
        now: () => DateTime.utc(2026, 5, 14),
      ),
    );
    await tester.pumpAndSettle();

    expect(authRepository.refreshCalls, 1);
    expect(authRepository.lastRefreshCredential, 'saved-refresh-token');
    expect(authRepository.currentUserCalls, 1);
    expect(authRepository.lastAccessToken, 'rotated-access-token');
    expect(storage.session?.accessToken, 'rotated-access-token');
    expect(storage.session?.refreshCredential, 'rotated-refresh-token');
    expect(find.byKey(const Key('server-shell-current-user')), findsOneWidget);
    expect(find.text('Receipt Reviews'), findsOneWidget);
  });

  testWidgets('denied sign-in maps to a safe UI failure', (tester) async {
    const password = 'redacted-password-value';
    final storage = FakeSecureStorage(
      configuration: SettleoraAppConfiguration.server(
        serverBaseUri: Uri.parse('https://settleora.example/'),
      ),
    );
    final authRepository = FakeAuthRepository(
      signInFailure: const SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.invalidCredentials,
        message: 'Unable to sign in with the submitted information.',
        statusCode: 401,
      ),
    );

    await tester.pumpWidget(
      SettleoraMobileApp(
        secureStorage: storage,
        authRepositoryFactory: (_) => authRepository,
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('sign-in-identifier')),
      'owner@example.test',
    );
    await tester.enterText(find.byKey(const Key('sign-in-password')), password);
    await tester.tap(find.byKey(const Key('sign-in-submit')));
    await tester.pumpAndSettle();

    expect(authRepository.signInCalls, 1);
    expect(storage.session, isNull);
    expect(find.text('Sign-in failed'), findsOneWidget);
    expect(
      find.text('Unable to sign in with the submitted information.'),
      findsOneWidget,
    );
    final passwordField = tester.widget<EditableText>(
      find.descendant(
        of: find.byKey(const Key('sign-in-password')),
        matching: find.byType(EditableText),
      ),
    );
    expect(passwordField.obscureText, isTrue);
    expect(visibleText(tester), isNot(contains(password)));
    expect(visibleText(tester), isNot(contains('redacted-access-material')));
  });

  testWidgets('network sign-in failure maps to a safe retry state', (
    tester,
  ) async {
    final storage = FakeSecureStorage(
      configuration: SettleoraAppConfiguration.server(
        serverBaseUri: Uri.parse('https://settleora.example/'),
      ),
    );
    final authRepository = FakeAuthRepository(
      signInFailure: const SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.network,
        message:
            'The server is unavailable. Check the connection and try again.',
      ),
    );

    await tester.pumpWidget(
      SettleoraMobileApp(
        secureStorage: storage,
        authRepositoryFactory: (_) => authRepository,
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('sign-in-identifier')),
      'owner@example.test',
    );
    await tester.enterText(
      find.byKey(const Key('sign-in-password')),
      'redacted-password',
    );
    await tester.tap(find.byKey(const Key('sign-in-submit')));
    await tester.pumpAndSettle();

    expect(find.text('Server unavailable'), findsOneWidget);
    expect(
      find.text(
        'The server is unavailable. Check the connection and try again.',
      ),
      findsOneWidget,
    );
    expect(find.byKey(const Key('sign-in-submit')), findsOneWidget);
  });

  testWidgets('invalid stored session returns to sign-in and clears session', (
    tester,
  ) async {
    final storage = FakeSecureStorage(
      configuration: SettleoraAppConfiguration.server(
        serverBaseUri: Uri.parse('https://settleora.example/'),
      ),
      session: SettleoraServerSessionMaterial(
        accessToken: 'expired-access-token',
        accessSessionExpiresAtUtc: DateTime.utc(2026, 5, 15),
      ),
    );
    final authRepository = FakeAuthRepository(
      currentUserFailure: const SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.sessionExpired,
        message: 'Your session has expired. Sign in again.',
        statusCode: 401,
      ),
    );

    await tester.pumpWidget(
      SettleoraMobileApp(
        secureStorage: storage,
        authRepositoryFactory: (_) => authRepository,
        now: () => DateTime.utc(2026, 5, 14),
      ),
    );
    await tester.pumpAndSettle();

    expect(authRepository.currentUserCalls, 1);
    expect(authRepository.lastAccessToken, 'expired-access-token');
    expect(storage.clearServerSessionCalls, 1);
    expect(storage.session, isNull);
    expect(find.text('Sign in to Settleora'), findsOneWidget);
    expect(
      find.text('Your session has expired. Sign in again.'),
      findsOneWidget,
    );
    expect(find.text('Receipt Reviews'), findsNothing);
    expect(find.textContaining('expired-access-token'), findsNothing);
  });

  testWidgets('sign out revokes the current session and clears local storage', (
    tester,
  ) async {
    final storage = FakeSecureStorage(
      configuration: SettleoraAppConfiguration.server(
        serverBaseUri: Uri.parse('https://settleora.example/'),
      ),
      session: sampleSessionMaterial(),
    );
    final authRepository = FakeAuthRepository();

    await tester.pumpWidget(
      SettleoraMobileApp(
        secureStorage: storage,
        authRepositoryFactory: (_) => authRepository,
        now: () => DateTime.utc(2026, 5, 14),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('server-shell-sign-out')));
    await tester.pumpAndSettle();

    expect(authRepository.signOutCurrentCalls, 1);
    expect(authRepository.lastAccessToken, 'redacted-signed-in-access');
    expect(storage.session, isNull);
    expect(find.text('Sign in to Settleora'), findsOneWidget);
    expect(find.text('Signed out.'), findsOneWidget);
  });

  testWidgets(
    'server-unreachable sign out clears local storage only after confirmation',
    (tester) async {
      final storage = FakeSecureStorage(
        configuration: SettleoraAppConfiguration.server(
          serverBaseUri: Uri.parse('https://settleora.example/'),
        ),
        session: sampleSessionMaterial(),
      );
      final authRepository = FakeAuthRepository(
        signOutCurrentFailure: const SettleoraAuthFailure(
          kind: SettleoraAuthFailureKind.network,
          message:
              'The server is unavailable. Check the connection and try again.',
        ),
      );

      await tester.pumpWidget(
        SettleoraMobileApp(
          secureStorage: storage,
          authRepositoryFactory: (_) => authRepository,
          now: () => DateTime.utc(2026, 5, 14),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('server-shell-sign-out')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(authRepository.signOutCurrentCalls, 1);
      expect(storage.session, isNotNull);
      expect(find.text('Server unavailable'), findsOneWidget);

      await tester.tap(find.byKey(const Key('sign-out-local-confirm')));
      await tester.pumpAndSettle();

      expect(storage.session, isNull);
      expect(find.text('Sign in to Settleora'), findsOneWidget);
      expect(find.textContaining('Signed out on this device'), findsOneWidget);
    },
  );

  testWidgets('session list displays safe metadata and revokes a session', (
    tester,
  ) async {
    final storage = FakeSecureStorage(
      configuration: SettleoraAppConfiguration.server(
        serverBaseUri: Uri.parse('https://settleora.example/'),
      ),
      session: sampleSessionMaterial(),
    );
    final authRepository = FakeAuthRepository(
      sessions: [
        sampleSessionSummary(
          id: 'current-session-id-not-visible',
          isCurrent: true,
          deviceLabel: null,
        ),
        sampleSessionSummary(
          id: 'other-session-id-not-visible',
          isCurrent: false,
          deviceLabel: 'Tablet',
        ),
      ],
    );

    await tester.pumpWidget(
      SettleoraMobileApp(
        secureStorage: storage,
        authRepositoryFactory: (_) => authRepository,
        now: () => DateTime.utc(2026, 5, 14),
      ),
    );
    await tester.pumpAndSettle();

    await scrollToShellTile(tester, const Key('server-shell-sessions'));
    await tester.tap(find.byKey(const Key('server-shell-sessions')));
    await tester.pumpAndSettle();

    expect(authRepository.listSessionsCalls, 1);
    expect(find.text('This device'), findsOneWidget);
    expect(find.text('Tablet'), findsOneWidget);
    expect(find.text('Current'), findsOneWidget);
    expect(
      visibleText(tester),
      isNot(contains('current-session-id-not-visible')),
    );
    expect(
      visibleText(tester),
      isNot(contains('other-session-id-not-visible')),
    );
    expect(visibleText(tester), isNot(contains('redacted-signed-in-access')));
    expect(visibleText(tester), isNot(contains('redacted-signed-in-refresh')));

    await tester.tap(find.byKey(const Key('session-revoke-1')));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Revoke'));
    await tester.pumpAndSettle();

    expect(authRepository.revokeSessionCalls, 1);
    expect(authRepository.lastRevokedSessionId, 'other-session-id-not-visible');
  });

  testWidgets(
    'session list sign-out-all clears local session after backend call',
    (tester) async {
      final storage = FakeSecureStorage(
        configuration: SettleoraAppConfiguration.server(
          serverBaseUri: Uri.parse('https://settleora.example/'),
        ),
        session: sampleSessionMaterial(),
      );
      final authRepository = FakeAuthRepository(
        sessions: [sampleSessionSummary(isCurrent: true)],
      );

      await tester.pumpWidget(
        SettleoraMobileApp(
          secureStorage: storage,
          authRepositoryFactory: (_) => authRepository,
          now: () => DateTime.utc(2026, 5, 14),
        ),
      );
      await tester.pumpAndSettle();

      await scrollToShellTile(tester, const Key('server-shell-sessions'));
      await tester.tap(find.byKey(const Key('server-shell-sessions')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('session-list-sign-out-all')));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Sign Out All'));
      await tester.pumpAndSettle();

      expect(authRepository.signOutAllCalls, 1);
      expect(authRepository.lastAccessToken, 'redacted-signed-in-access');
      expect(storage.session, isNull);
      expect(find.text('Sign in to Settleora'), findsOneWidget);
    },
  );

  testWidgets('queue renders empty state from repository', (tester) async {
    final repository = FakeReceiptOcrReviewRepository(listResponse: const []);

    await tester.pumpWidget(
      MaterialApp(home: ReceiptOcrReviewQueueScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    expect(find.text('No receipt reviews'), findsOneWidget);
    expect(repository.listCalls, 1);
  });

  testWidgets('queue maps denied responses to a safe state', (tester) async {
    final repository = FakeReceiptOcrReviewRepository(
      listFailure: const ReceiptOcrReviewFailure(
        kind: ReceiptOcrReviewFailureKind.denied,
        message: 'This receipt review is not available to this account.',
        statusCode: 403,
      ),
    );

    await tester.pumpWidget(
      MaterialApp(home: ReceiptOcrReviewQueueScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    expect(find.text('Access unavailable'), findsOneWidget);
    expect(
      find.text('This receipt review is not available to this account.'),
      findsOneWidget,
    );
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('detail shows review candidates and blocked preview reasons', (
    tester,
  ) async {
    final repository = FakeReceiptOcrReviewRepository(
      listResponse: [sampleSummary()],
      reviewResponse: sampleReview(),
      previewResponse: samplePreview(canApply: false),
    );

    await tester.pumpWidget(
      MaterialApp(home: ReceiptOcrReviewQueueScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();

    expect(find.text('Line candidates'), findsOneWidget);
    expect(find.text('Milk'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('Preview apply'), 500);
    await tester.tap(find.text('Preview apply'));
    await tester.pumpAndSettle();

    expect(find.text('Blocked by server preview'), findsOneWidget);
    expect(find.text('Currency mismatch'), findsOneWidget);

    final applyButton = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Apply to draft'),
    );
    expect(applyButton.onPressed, isNull);
  });

  testWidgets('apply requires explicit confirmation', (tester) async {
    final repository = FakeReceiptOcrReviewRepository(
      reviewResponse: sampleReview(),
      previewResponse: samplePreview(),
      applyResponse: sampleApplyResult(),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: ReceiptOcrReviewDetailScreen(
          repository: repository,
          summary: sampleSummary(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(find.text('Preview apply'), 500);
    await tester.tap(find.text('Preview apply'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Apply to draft'));
    await tester.pumpAndSettle();

    expect(find.text('Apply reviewed lines?'), findsOneWidget);
    expect(repository.applyCalls, 0);

    await tester.tap(find.widgetWithText(FilledButton, 'Apply'));
    await tester.pumpAndSettle();

    expect(repository.applyCalls, 1);
    expect(find.text('Applied to draft'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
  });

  testWidgets('detail edit mode saves bounded header and line changes', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeReceiptOcrReviewRepository(
      reviewResponse: sampleReview(),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: ReceiptOcrReviewDetailScreen(
          repository: repository,
          summary: sampleSummary(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.edit_outlined));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const Key('receipt-review-edit-merchant')),
      findsOneWidget,
    );

    await tester.enterText(
      find.byKey(const Key('receipt-review-edit-merchant')),
      'Corner Shop',
    );
    await tester.dragUntilVisible(
      find.byKey(const Key('receipt-review-edit-line-add')),
      verticalScrollable(),
      const Offset(0, -300),
    );
    await tester.ensureVisible(
      find.byKey(const Key('receipt-review-edit-line-add')),
    );
    await tester.tap(find.byKey(const Key('receipt-review-edit-line-add')));
    await tester.pumpAndSettle();

    await tester.dragUntilVisible(
      find.byKey(const ValueKey('receipt-review-edit-line-text-0')),
      verticalScrollable(),
      const Offset(0, -300),
    );
    await tester.enterText(
      find.byKey(const ValueKey('receipt-review-edit-line-text-0')),
      'Oat Milk',
    );

    await tester.dragUntilVisible(
      find.byKey(const ValueKey('receipt-review-edit-line-text-2')),
      verticalScrollable(),
      const Offset(0, -300),
    );
    await tester.enterText(
      find.byKey(const ValueKey('receipt-review-edit-line-text-2')),
      'Eggs',
    );

    await tester.dragUntilVisible(
      find.byKey(const ValueKey('receipt-review-edit-line-remove-2')),
      verticalScrollable(),
      const Offset(0, -300),
    );
    await tester.ensureVisible(
      find.byKey(const ValueKey('receipt-review-edit-line-remove-2')),
    );
    await tester.tap(
      find.byKey(const ValueKey('receipt-review-edit-line-remove-2')),
    );
    await tester.pumpAndSettle();

    await tester.dragUntilVisible(
      find.byKey(const Key('receipt-review-edit-save')),
      verticalScrollable(),
      const Offset(0, -300),
    );
    await tester.ensureVisible(
      find.byKey(const Key('receipt-review-edit-save')),
    );
    await tester.drag(verticalScrollable(), const Offset(0, -80));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('receipt-review-edit-save')));
    await tester.pumpAndSettle();

    expect(repository.saveCalls, 1);
    expect(repository.applyCalls, 0);
    expect(repository.lastSaveRoute?.billId, sampleSummary().billId);
    expect(repository.lastSaveRequest?.merchantText, 'Corner Shop');
    expect(repository.lastSaveRequest?.currency, 'USD');
    expect(repository.lastSaveRequest?.lines.map((line) => line.text), [
      'Oat Milk',
      'Bread',
    ]);
    expect(find.byKey(const Key('receipt-review-edit-merchant')), findsNothing);
    expect(find.text('Corner Shop'), findsOneWidget);
    expect(find.text('Applied to draft'), findsNothing);
  });

  testWidgets('cancel exits edit mode without saving', (tester) async {
    await useLargeSurface(tester);
    final repository = FakeReceiptOcrReviewRepository(
      reviewResponse: sampleReview(),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: ReceiptOcrReviewDetailScreen(
          repository: repository,
          summary: sampleSummary(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.edit_outlined));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('receipt-review-edit-merchant')),
      'Unsaved Store',
    );

    await tester.dragUntilVisible(
      find.byKey(const Key('receipt-review-edit-cancel')),
      verticalScrollable(),
      const Offset(0, -300),
    );
    await tester.ensureVisible(
      find.byKey(const Key('receipt-review-edit-cancel')),
    );
    await tester.tap(find.byKey(const Key('receipt-review-edit-cancel')));
    await tester.pumpAndSettle();

    expect(repository.saveCalls, 0);
    expect(find.byKey(const Key('receipt-review-edit-merchant')), findsNothing);
    expect(find.text('Corner Market'), findsOneWidget);
    expect(find.text('Unsaved Store'), findsNothing);
  });

  testWidgets('save failure displays a safe bounded message', (tester) async {
    await useLargeSurface(tester);
    final repository = FakeReceiptOcrReviewRepository(
      reviewResponse: sampleReview(),
      saveFailure: const ReceiptOcrReviewFailure(
        kind: ReceiptOcrReviewFailureKind.validation,
        message:
            'The receipt review request is no longer valid. Refresh and try again.',
        statusCode: 422,
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: ReceiptOcrReviewDetailScreen(
          repository: repository,
          summary: sampleSummary(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.edit_outlined));
    await tester.pumpAndSettle();

    await tester.dragUntilVisible(
      find.byKey(const Key('receipt-review-edit-save')),
      verticalScrollable(),
      const Offset(0, -300),
    );
    await tester.ensureVisible(
      find.byKey(const Key('receipt-review-edit-save')),
    );
    await tester.drag(verticalScrollable(), const Offset(0, -80));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('receipt-review-edit-save')));
    await tester.pumpAndSettle();

    expect(repository.saveCalls, 1);
    expect(find.text('Unsupported request'), findsOneWidget);
    expect(
      find.text(
        'The receipt review request is no longer valid. Refresh and try again.',
      ),
      findsOneWidget,
    );
  });
}

class FakeReceiptOcrReviewRepository implements ReceiptOcrReviewRepository {
  FakeReceiptOcrReviewRepository({
    this.listResponse,
    this.listFailure,
    this.reviewResponse,
    this.reviewFailure,
    this.previewResponse,
    this.previewFailure,
    this.applyResponse,
    this.applyFailure,
    this.saveResponse,
    this.saveFailure,
    this.deleteFailure,
  });

  List<ReceiptOcrReviewSummary>? listResponse;
  ReceiptOcrReviewFailure? listFailure;
  ReceiptOcrReviewDetail? reviewResponse;
  ReceiptOcrReviewFailure? reviewFailure;
  ReceiptOcrReviewApplyPreview? previewResponse;
  ReceiptOcrReviewFailure? previewFailure;
  ReceiptOcrReviewApplyResult? applyResponse;
  ReceiptOcrReviewFailure? applyFailure;
  ReceiptOcrReviewDetail? saveResponse;
  ReceiptOcrReviewFailure? saveFailure;
  ReceiptOcrReviewFailure? deleteFailure;
  int listCalls = 0;
  int applyCalls = 0;
  int saveCalls = 0;
  int deleteCalls = 0;
  ReceiptOcrReviewRoute? lastSaveRoute;
  ReceiptOcrReviewSaveRequest? lastSaveRequest;

  @override
  Future<List<ReceiptOcrReviewSummary>> listReviews({
    ReceiptOcrReviewStatus? status,
    ReceiptOcrReviewSource? source,
    int? limit,
  }) async {
    listCalls += 1;
    final failure = listFailure;
    if (failure != null) {
      throw failure;
    }

    return listResponse ?? const [];
  }

  @override
  Future<ReceiptOcrReviewDetail> getReview(ReceiptOcrReviewRoute route) async {
    final failure = reviewFailure;
    if (failure != null) {
      throw failure;
    }

    return reviewResponse ?? sampleReview();
  }

  @override
  Future<ReceiptOcrReviewDetail> saveReview(
    ReceiptOcrReviewRoute route,
    ReceiptOcrReviewSaveRequest request,
  ) async {
    saveCalls += 1;
    lastSaveRoute = route;
    lastSaveRequest = request;
    final failure = saveFailure;
    if (failure != null) {
      throw failure;
    }

    return saveResponse ?? sampleReviewFromSaveRequest(request);
  }

  @override
  Future<void> deleteReview(ReceiptOcrReviewRoute route) async {
    deleteCalls += 1;
    final failure = deleteFailure;
    if (failure != null) {
      throw failure;
    }
  }

  @override
  Future<ReceiptOcrReviewApplyPreview> previewApply(
    ReceiptOcrReviewRoute route,
  ) async {
    final failure = previewFailure;
    if (failure != null) {
      throw failure;
    }

    return previewResponse ?? samplePreview();
  }

  @override
  Future<ReceiptOcrReviewApplyResult> applyReview(
    ReceiptOcrReviewRoute route, {
    required DateTime expectedReviewUpdatedAtUtc,
  }) async {
    applyCalls += 1;
    final failure = applyFailure;
    if (failure != null) {
      throw failure;
    }

    return applyResponse ?? sampleApplyResult();
  }
}

class FakeSecureStorage implements SettleoraSecureStorageBoundary {
  FakeSecureStorage({this.configuration, this.session});

  SettleoraAppConfiguration? configuration;
  SettleoraServerSessionMaterial? session;
  int clearServerSessionCalls = 0;
  int writeServerSessionCalls = 0;

  @override
  Future<SettleoraAppConfiguration?> readAppConfiguration() async {
    return configuration;
  }

  @override
  Future<void> writeAppConfiguration(
    SettleoraAppConfiguration configuration,
  ) async {
    this.configuration = configuration;
  }

  @override
  Future<SettleoraServerSessionMaterial?> readServerSession() async {
    return session;
  }

  @override
  Future<void> writeServerSession(
    SettleoraServerSessionMaterial session,
  ) async {
    writeServerSessionCalls += 1;
    this.session = session;
  }

  @override
  Future<void> clearServerSession() async {
    clearServerSessionCalls += 1;
    session = null;
  }
}

class FakeAuthRepository implements SettleoraAuthRepository {
  FakeAuthRepository({
    SettleoraServerSessionMaterial? signInSession,
    SettleoraServerSessionMaterial? refreshedSession,
    SettleoraCurrentUser? currentUserResponse,
    List<SettleoraSessionSummary>? sessions,
    this.signInFailure,
    this.currentUserFailure,
    this.refreshFailure,
    this.signOutCurrentFailure,
    this.signOutAllFailure,
    this.listSessionsFailure,
    this.revokeSessionFailure,
  }) : signInSession = signInSession ?? sampleSessionMaterial(),
       refreshedSession = refreshedSession ?? sampleRefreshedSessionMaterial(),
       currentUserResponse = currentUserResponse ?? sampleCurrentUser(),
       sessions = sessions ?? [sampleSessionSummary(isCurrent: true)];

  final SettleoraServerSessionMaterial signInSession;
  final SettleoraServerSessionMaterial refreshedSession;
  final SettleoraCurrentUser currentUserResponse;
  final List<SettleoraSessionSummary> sessions;
  final SettleoraAuthFailure? signInFailure;
  final SettleoraAuthFailure? currentUserFailure;
  final SettleoraAuthFailure? refreshFailure;
  final SettleoraAuthFailure? signOutCurrentFailure;
  final SettleoraAuthFailure? signOutAllFailure;
  final SettleoraAuthFailure? listSessionsFailure;
  final SettleoraAuthFailure? revokeSessionFailure;
  int signInCalls = 0;
  int currentUserCalls = 0;
  int refreshCalls = 0;
  int signOutCurrentCalls = 0;
  int signOutAllCalls = 0;
  int listSessionsCalls = 0;
  int revokeSessionCalls = 0;
  SettleoraSignInSubmission? lastSignInSubmission;
  String? lastAccessToken;
  String? lastRefreshCredential;
  String? lastRevokedSessionId;

  @override
  Future<SettleoraServerSessionMaterial> signIn(
    SettleoraSignInSubmission submission,
  ) async {
    signInCalls += 1;
    lastSignInSubmission = submission;
    final failure = signInFailure;
    if (failure != null) {
      throw failure;
    }

    return signInSession;
  }

  @override
  Future<SettleoraCurrentUser> currentUser({
    required String accessToken,
  }) async {
    currentUserCalls += 1;
    lastAccessToken = accessToken;
    final failure = currentUserFailure;
    if (failure != null) {
      throw failure;
    }

    return currentUserResponse;
  }

  @override
  Future<SettleoraServerSessionMaterial> refreshSession({
    required String refreshCredential,
    String? deviceLabel,
  }) async {
    refreshCalls += 1;
    lastRefreshCredential = refreshCredential;
    final failure = refreshFailure;
    if (failure != null) {
      throw failure;
    }

    return refreshedSession;
  }

  @override
  Future<void> signOutCurrentSession({required String accessToken}) async {
    signOutCurrentCalls += 1;
    lastAccessToken = accessToken;
    final failure = signOutCurrentFailure;
    if (failure != null) {
      throw failure;
    }
  }

  @override
  Future<void> signOutAllCurrentAccountSessions({
    required String accessToken,
  }) async {
    signOutAllCalls += 1;
    lastAccessToken = accessToken;
    final failure = signOutAllFailure;
    if (failure != null) {
      throw failure;
    }
  }

  @override
  Future<List<SettleoraSessionSummary>> listSessions({
    required String accessToken,
  }) async {
    listSessionsCalls += 1;
    lastAccessToken = accessToken;
    final failure = listSessionsFailure;
    if (failure != null) {
      throw failure;
    }

    return sessions;
  }

  @override
  Future<void> revokeSession({
    required String sessionId,
    required String accessToken,
  }) async {
    revokeSessionCalls += 1;
    lastRevokedSessionId = sessionId;
    lastAccessToken = accessToken;
    final failure = revokeSessionFailure;
    if (failure != null) {
      throw failure;
    }
  }
}

SettleoraServerSessionMaterial sampleSessionMaterial() {
  return SettleoraServerSessionMaterial(
    accessToken: 'redacted-signed-in-access',
    accessSessionExpiresAtUtc: DateTime.utc(2026, 5, 15),
    refreshCredential: 'redacted-signed-in-refresh',
    refreshIdleExpiresAtUtc: DateTime.utc(2026, 5, 16),
    refreshAbsoluteExpiresAtUtc: DateTime.utc(2026, 6, 14),
  );
}

SettleoraServerSessionMaterial sampleRefreshedSessionMaterial() {
  return SettleoraServerSessionMaterial(
    accessToken: 'refreshed-access-token',
    accessSessionExpiresAtUtc: DateTime.utc(2026, 5, 15),
    refreshCredential: 'refreshed-refresh-token',
    refreshIdleExpiresAtUtc: DateTime.utc(2026, 5, 16),
    refreshAbsoluteExpiresAtUtc: DateTime.utc(2026, 6, 14),
  );
}

SettleoraCurrentUser sampleCurrentUser() {
  return SettleoraCurrentUser(
    userProfileId: 'user-profile-id-not-displayed',
    displayName: 'Taylor',
    defaultCurrency: 'USD',
    roles: const ['user'],
    sessionExpiresAtUtc: DateTime.utc(2026, 5, 15),
  );
}

SettleoraSessionSummary sampleSessionSummary({
  String id = 'current-session-id',
  bool isCurrent = false,
  String? deviceLabel = 'This device',
}) {
  return SettleoraSessionSummary(
    id: id,
    isCurrent: isCurrent,
    status: 'active',
    issuedAtUtc: DateTime.utc(2026, 5, 14, 12),
    expiresAtUtc: DateTime.utc(2026, 5, 15, 12),
    lastSeenAtUtc: DateTime.utc(2026, 5, 14, 12, 30),
    deviceLabel: deviceLabel,
  );
}

ReceiptOcrReviewSummary sampleSummary() {
  return ReceiptOcrReviewSummary(
    reviewId: '11111111-1111-1111-1111-111111111111',
    billId: '22222222-2222-2222-2222-222222222222',
    groupId: null,
    fileId: '33333333-3333-3333-3333-333333333333',
    status: ReceiptOcrReviewStatusValues.reviewed,
    source: ReceiptOcrReviewSourceValues.onDevice,
    merchantText: 'Corner Market',
    currency: 'USD',
    lineCount: 2,
    createdAtUtc: sampleTime,
    updatedAtUtc: sampleTime,
  );
}

ReceiptOcrReviewDetail sampleReview({
  String merchantText = 'Corner Market',
  List<ReceiptOcrReviewLine>? lines,
}) {
  return ReceiptOcrReviewDetail(
    id: '11111111-1111-1111-1111-111111111111',
    billId: '22222222-2222-2222-2222-222222222222',
    fileId: '33333333-3333-3333-3333-333333333333',
    groupId: null,
    status: ReceiptOcrReviewStatusValues.reviewed,
    source: ReceiptOcrReviewSourceValues.onDevice,
    merchantText: merchantText,
    receiptIssuedAtUtc: sampleTime,
    currency: 'USD',
    subtotalAmount: '10.00',
    taxAmount: '0.80',
    serviceChargeAmount: null,
    discountAmount: null,
    grandTotalAmount: '10.80',
    lines: lines ?? sampleReviewLines(),
    createdAtUtc: sampleTime,
    updatedAtUtc: sampleTime,
  );
}

List<ReceiptOcrReviewLine> sampleReviewLines() {
  return [
    ReceiptOcrReviewLine(
      id: '44444444-4444-4444-4444-444444444444',
      sortOrder: 0,
      text: 'Milk',
      quantity: '1',
      unitPriceAmount: '4.00',
      lineTotalAmount: '4.00',
      createdAtUtc: sampleTime,
      updatedAtUtc: sampleTime,
    ),
    ReceiptOcrReviewLine(
      id: '55555555-5555-5555-5555-555555555555',
      sortOrder: 1,
      text: 'Bread',
      quantity: '1',
      unitPriceAmount: '6.00',
      lineTotalAmount: '6.00',
      createdAtUtc: sampleTime,
      updatedAtUtc: sampleTime,
    ),
  ];
}

ReceiptOcrReviewDetail sampleReviewFromSaveRequest(
  ReceiptOcrReviewSaveRequest request,
) {
  return sampleReview(
    merchantText: request.merchantText ?? 'Receipt review',
    lines: [
      for (var index = 0; index < request.lines.length; index++)
        ReceiptOcrReviewLine(
          id: 'saved-line-$index',
          sortOrder: index,
          text: request.lines[index].text,
          quantity: request.lines[index].quantity,
          unitPriceAmount: request.lines[index].unitPriceAmount,
          lineTotalAmount: request.lines[index].lineTotalAmount,
          createdAtUtc: sampleTime,
          updatedAtUtc: sampleTime,
        ),
    ],
  );
}

ReceiptOcrReviewApplyPreview samplePreview({bool canApply = true}) {
  return ReceiptOcrReviewApplyPreview(
    reviewId: '11111111-1111-1111-1111-111111111111',
    billId: '22222222-2222-2222-2222-222222222222',
    groupId: null,
    fileId: '33333333-3333-3333-3333-333333333333',
    status: ReceiptOcrReviewStatusValues.reviewed,
    source: ReceiptOcrReviewSourceValues.onDevice,
    proposedMerchantText: 'Corner Market',
    proposedReceiptIssuedAtUtc: sampleTime,
    proposedCurrency: 'USD',
    proposedSubtotalAmount: '10.00',
    proposedTaxAmount: '0.80',
    proposedServiceChargeAmount: null,
    proposedDiscountAmount: null,
    proposedGrandTotalAmount: '10.80',
    proposedLines: [
      ReceiptOcrReviewPreviewLine(
        reviewLineId: '44444444-4444-4444-4444-444444444444',
        sortOrder: 0,
        text: 'Milk',
        quantity: '1',
        unitPriceAmount: '4.00',
        lineTotalAmount: '4.00',
        proposedLineTotalAmount: '4.00',
      ),
    ],
    summary: const ReceiptOcrReviewPreviewSummary(
      lineCount: 2,
      linesWithProposedTotalCount: 2,
      linesMissingProposedTotalCount: 0,
      proposedLineTotalSumAmount: '10.00',
      expectedHeaderTotalAmount: '10.80',
    ),
    canApply: canApply,
    blockedReasons: canApply
        ? const []
        : const [ReceiptOcrReviewApplyPreviewIssueCodeValues.currencyMismatch],
    warnings: const [],
    createdAtUtc: sampleTime,
    updatedAtUtc: sampleTime,
  );
}

ReceiptOcrReviewApplyResult sampleApplyResult() {
  return ReceiptOcrReviewApplyResult(
    reviewId: '11111111-1111-1111-1111-111111111111',
    billId: '22222222-2222-2222-2222-222222222222',
    groupId: null,
    fileId: '33333333-3333-3333-3333-333333333333',
    applyMode: 'replace_draft_ocr_items',
    appliedItemCount: 2,
    currency: 'USD',
    subtotalAmount: '10.00',
    grandTotalAmount: '10.80',
    summary: const ReceiptOcrReviewPreviewSummary(
      lineCount: 2,
      linesWithProposedTotalCount: 2,
      linesMissingProposedTotalCount: 0,
      proposedLineTotalSumAmount: '10.00',
      expectedHeaderTotalAmount: '10.80',
    ),
    blockedReasons: const [],
    warnings: const [],
    appliedAtUtc: sampleTime,
  );
}

final sampleTime = DateTime.utc(2026, 5, 13, 12);

String visibleText(WidgetTester tester) {
  return tester
      .widgetList<Text>(find.byType(Text))
      .map((widget) => widget.data)
      .whereType<String>()
      .join('\n');
}

Finder verticalScrollable() {
  return find.byWidgetPredicate(
    (widget) =>
        widget is Scrollable && widget.axisDirection == AxisDirection.down,
  );
}

Future<void> scrollToShellTile(WidgetTester tester, Key key) async {
  final tile = find.byKey(key);
  await tester.dragUntilVisible(
    tile,
    verticalScrollable().first,
    const Offset(0, -300),
  );
  await tester.ensureVisible(tile);
  await tester.pumpAndSettle();
}

Future<void> useLargeSurface(WidgetTester tester) async {
  await tester.binding.setSurfaceSize(const Size(900, 1600));
  addTearDown(() => tester.binding.setSurfaceSize(null));
}
