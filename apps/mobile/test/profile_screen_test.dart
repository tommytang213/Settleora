import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/settleora_api_client.dart';
import 'package:mobile/app/auth_session_repository.dart';
import 'package:mobile/app/secure_storage.dart';
import 'package:mobile/app/server_mode_shell.dart';
import 'package:mobile/bills/bill_repository.dart';
import 'package:mobile/bills/bill_sync_controller.dart';
import 'package:mobile/groups/group_repository.dart';
import 'package:mobile/notifications/notification_repository.dart';
import 'package:mobile/profile/profile_repository.dart';
import 'package:mobile/profile/profile_screen.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_repository.dart';
import 'package:mobile/recurring_bills/recurring_bill_repository.dart';
import 'package:mobile/reports/report_repository.dart';
import 'package:mobile/settlements/settlement_repository.dart';
import 'package:mobile/sync/sync_queue.dart';
import 'package:mobile/sync/sync_queue_processor.dart';
import 'package:mobile/sync/sync_repository.dart';

void main() {
  testWidgets('authenticated server shell opens profile screen', (
    tester,
  ) async {
    final profileRepository = FakeProfileRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraAuthenticatedServerShell(
          currentUser: sampleCurrentUser(),
          receiptOcrReviewRepository: FakeReceiptOcrReviewRepository(),
          billRepository: FakeBillRepository(),
          settlementRepository: FakeSettlementRepository(),
          recurringBillRepository: FakeRecurringBillRepository(),
          groupRepository: FakeGroupRepository(),
          notificationRepository: FakeNotificationRepository(),
          reportRepository: FakeMonthlyReportRepository(),
          profileRepository: profileRepository,
          billSyncController: sampleSyncController(),
          authRepository: FakeAuthRepository(),
          accessTokenProvider: const FakeAccessTokenProvider('redacted-token'),
          onSessionEnded: (_) async {},
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('server-shell-profile')));
    await tester.pumpAndSettle();

    expect(find.text('Profile'), findsWidgets);
    expect(profileRepository.profileReadCalls, 1);
    expect(profileRepository.paymentReadCalls, 1);
  });

  testWidgets('profile screen loads profile and payment details', (
    tester,
  ) async {
    final repository = FakeProfileRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraProfileScreen(
          repository: repository,
          currentUser: sampleCurrentUser(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('profile-summary')), findsOneWidget);
    expect(find.text('Taylor'), findsWidgets);
    expect(find.text('Signed in - USD'), findsOneWidget);
    expect(
      find.byKey(const Key('profile-account-boundary-readout')),
      findsOneWidget,
    );
    expect(
      find.textContaining(
        'Account and profile details are shown only after sign-in.',
      ),
      findsOneWidget,
    );
    expect(
      find.textContaining(
        'Refresh if something looks stale before sharing payment information.',
      ),
      findsOneWidget,
    );
    expect(find.byKey(const Key('profile-payment-summary')), findsOneWidget);
    expect(find.text('Payment details on file'), findsOneWidget);
    expect(find.text('Bank transfer'), findsWidgets);
    expect(find.text('pay.example/taylor'), findsWidgets);
    expect(find.text('Settlement counterparties'), findsWidgets);
    expect(
      find.text(
        'Settlement counterparties means details can be shown only inside an eligible settlement or payment relationship.',
      ),
      findsOneWidget,
    );
    expect(
      find.text('Access is checked before these details are shown.'),
      findsOneWidget,
    );
    expect(
      find.text(
        'Payment details are not globally visible. Access is checked before details are shown.',
      ),
      findsOneWidget,
    );
    expect(
      find.text(
        'Changing this value saves who should be allowed to request access.',
      ),
      findsOneWidget,
    );
    expect(find.text('QR available'), findsOneWidget);
    expect(find.textContaining('image/png'), findsOneWidget);
    expect(find.textContaining('2.0 KB'), findsOneWidget);
    expect(find.textContaining('updated'), findsOneWidget);
    expect(
      find.byKey(const Key('profile-visual-preference-readout')),
      findsNothing,
    );
    expect(
      find.textContaining('Custom appearance settings are not available'),
      findsNothing,
    );
    expect(visibleText(tester), isNot(contains(_profileId)));
    expect(visibleText(tester), isNot(contains(_paymentProfileId)));
    expect(visibleText(tester), isNot(contains(_qrFileId)));
  });

  testWidgets('profile screen explains every payment visibility value', (
    tester,
  ) async {
    final cases = <String, String>{
      SettleoraPaymentDetailsVisibilityValues.private:
          'Private means this self profile readout is for you only and does not grant counterparty access.',
      SettleoraPaymentDetailsVisibilityValues.settlementCounterpartiesOnly:
          'Settlement counterparties means details can be shown only inside an eligible settlement or payment relationship.',
      SettleoraPaymentDetailsVisibilityValues.groupMembersWhenShared:
          'Group members when shared means details can be shown only in a concrete shared group, bill, settlement, or payment context.',
    };

    for (final entry in cases.entries) {
      final repository = FakeProfileRepository(
        paymentDetails: samplePaymentDetails(visibility: entry.key),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraProfileScreen(
            repository: repository,
            currentUser: sampleCurrentUser(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.text(settleoraPaymentDetailsVisibilityLabel(entry.key)),
        findsWidgets,
      );
      expect(find.text(entry.value), findsOneWidget);
      expect(
        find.textContaining(
          'Only people involved in an eligible settlement can see these details.',
        ),
        findsOneWidget,
      );

      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    }
  });

  testWidgets('profile screen shows empty payment details state', (
    tester,
  ) async {
    final repository = FakeProfileRepository(
      paymentDetails: emptyPaymentDetails(),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraProfileScreen(
          repository: repository,
          currentUser: sampleCurrentUser(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('profile-payment-summary')), findsOneWidget);
    expect(find.text('No payment details yet'), findsOneWidget);
    expect(find.text('Not set'), findsWidgets);
    expect(find.text('Settlement counterparties'), findsWidgets);
    expect(
      find.text(
        'Blank or cleared payment fields mean there is no payment text to show.',
      ),
      findsOneWidget,
    );
    expect(
      find.text(
        'This is the default visibility for payment details that are not configured yet.',
      ),
      findsOneWidget,
    );
    expect(find.text('QR not linked'), findsOneWidget);
    expect(find.text('No QR payment image is linked yet.'), findsOneWidget);
  });

  testWidgets('profile readout suppresses unsafe raw payment and QR text', (
    tester,
  ) async {
    final repository = FakeProfileRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraProfileScreen(
          repository: repository,
          currentUser: sampleCurrentUser(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final text = visibleText(tester);
    expect(text, isNot(contains(_profileId)));
    expect(text, isNot(contains(_paymentProfileId)));
    expect(text, isNot(contains(_qrFileId)));
    expect(text, isNot(contains('/api/v1/users/me/payment-details')));
    expect(text, isNot(contains('/var/lib/settleora/storage/payment_qr.png')));
    expect(text, isNot(contains('provider-object-key')));
    expect(text, isNot(contains('vault-key-envelope')));
    expect(text, isNot(contains('qr-bytes-base64')));
    expect(text, isNot(contains('request body')));
    expect(text, isNot(contains('redacted-token')));
    expect(text, isNot(contains('StackTrace')));
    expect(text, isNot(contains('unrelated-user@example.test')));
    expect(find.text('Upload QR'), findsNothing);
    expect(find.text('Remove QR'), findsNothing);
    expect(find.text('Read QR content'), findsNothing);
    expect(find.byType(Image), findsNothing);
  });

  testWidgets('profile screen updates profile and payment details', (
    tester,
  ) async {
    final repository = FakeProfileRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraProfileScreen(
          repository: repository,
          currentUser: sampleCurrentUser(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('profile-display-name')),
      'Morgan',
    );
    await selectDropdownValue(
      tester,
      const Key('profile-default-currency'),
      'HKD - Hong Kong Dollar',
    );
    await tester.tap(find.byKey(const Key('profile-save')));
    await tester.pumpAndSettle();

    expect(repository.profileUpdateCalls, 1);
    expect(repository.lastProfileUpdate?.displayName, 'Morgan');
    expect(repository.lastProfileUpdate?.defaultCurrency, 'HKD');
    expect(find.text('Profile updated.'), findsOneWidget);

    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();

    await tester.dragUntilVisible(
      find.byKey(const Key('profile-payment-save')),
      find.byType(ListView),
      const Offset(0, -320),
    );
    await selectDropdownValue(
      tester,
      const Key('profile-payment-method'),
      'FPS',
    );
    await tester.enterText(
      find.byKey(const Key('profile-payment-handle')),
      '  fps-id  ',
    );
    await tester.enterText(
      find.byKey(const Key('profile-payment-note')),
      '  Thanks for settling.  ',
    );
    await tester.ensureVisible(find.byKey(const Key('profile-payment-save')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('profile-payment-save')));
    await tester.pumpAndSettle();

    expect(repository.paymentUpdateCalls, 1);
    expect(repository.lastPaymentUpdate?.preferredMethodLabel, 'FPS');
    expect(repository.lastPaymentUpdate?.paymentHandle, 'fps-id');
    expect(repository.lastPaymentUpdate?.paymentNote, 'Thanks for settling.');
    expect(
      repository.lastPaymentUpdate?.visibility,
      SettleoraPaymentDetailsVisibilityValues.settlementCounterpartiesOnly,
    );
    expect(find.text('Payment details updated.'), findsOneWidget);
    expect(find.text('FPS'), findsWidgets);
    expect(find.text('fps-id'), findsWidgets);
    expect(find.text('Thanks for settling.'), findsWidgets);
  });

  testWidgets('profile and payment saves ignore duplicate submits', (
    tester,
  ) async {
    final profileSave = Completer<void>();
    final paymentSave = Completer<void>();
    final repository = FakeProfileRepository(
      profileUpdateCompleter: profileSave,
      paymentUpdateCompleter: paymentSave,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraProfileScreen(
          repository: repository,
          currentUser: sampleCurrentUser(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('profile-display-name')),
      'Morgan',
    );
    await tester.tap(find.byKey(const Key('profile-save')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('profile-save')));
    await tester.pump();

    expect(repository.profileUpdateCalls, 1);
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('profile-save')))
          .onPressed,
      isNull,
    );

    profileSave.complete();
    await tester.pumpAndSettle();

    await tester.dragUntilVisible(
      find.byKey(const Key('profile-payment-save')),
      find.byType(ListView),
      const Offset(0, -320),
    );
    await selectDropdownValue(
      tester,
      const Key('profile-payment-method'),
      'FPS',
    );
    tester.testTextInput.hide();
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('profile-payment-save')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('profile-payment-save')));
    await tester.pump();
    await tester.tap(
      find.byKey(const Key('profile-payment-save')),
      warnIfMissed: false,
    );
    await tester.pump();

    expect(repository.paymentUpdateCalls, 1);
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('profile-payment-save')))
          .onPressed,
      isNull,
    );

    paymentSave.complete();
    await tester.pumpAndSettle();
  });

  testWidgets('save keeps returned state when follow-up refresh fails', (
    tester,
  ) async {
    final repository = FakeProfileRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraProfileScreen(
          repository: repository,
          currentUser: sampleCurrentUser(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    repository.nextProfileReadFailure = const SettleoraProfileFailure(
      kind: SettleoraProfileFailureKind.network,
      message: 'The server is unavailable. Try again later.',
    );

    await tester.enterText(
      find.byKey(const Key('profile-display-name')),
      'Morgan',
    );
    await tester.tap(find.byKey(const Key('profile-save')));
    await tester.pumpAndSettle();

    expect(find.text('Morgan'), findsWidgets);
    expect(
      find.text(
        'Saved on the server, but the follow-up refresh failed. Refresh account details before saving again.',
      ),
      findsOneWidget,
    );
    expect(
      find.text('Profile saved. Refresh before saving again.'),
      findsOneWidget,
    );
    expect(repository.profileUpdateCalls, 1);
  });

  testWidgets('profile screen shows safe repository validation errors', (
    tester,
  ) async {
    const hiddenValue = 'secret-payment-handle';
    final repository = FakeProfileRepository(
      profileUpdateFailure: const SettleoraProfileFailure(
        kind: SettleoraProfileFailureKind.validation,
        message: 'Enter a display name.',
      ),
      paymentUpdateFailure: const SettleoraProfileFailure(
        kind: SettleoraProfileFailureKind.validation,
        message:
            'The account details are no longer valid. Refresh and try again.',
        statusCode: 422,
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraProfileScreen(
          repository: repository,
          currentUser: sampleCurrentUser(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('profile-display-name')),
      '   ',
    );
    await tester.tap(find.byKey(const Key('profile-save')));
    await tester.pumpAndSettle();

    expect(find.text('Enter a display name.'), findsOneWidget);

    await tester.dragUntilVisible(
      find.byKey(const Key('profile-payment-save')),
      find.byType(ListView),
      const Offset(0, -320),
    );
    await tester.enterText(
      find.byKey(const Key('profile-payment-handle')),
      hiddenValue,
    );
    tester.testTextInput.hide();
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('profile-payment-save')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('profile-payment-save')));
    await tester.pumpAndSettle();

    expect(
      find.text(
        'The account details are no longer valid. Refresh and try again.',
      ),
      findsOneWidget,
    );
    expect(visibleText(tester), isNot(contains(hiddenValue)));
  });

  testWidgets('profile screen validates overlong payment input locally', (
    tester,
  ) async {
    final repository = FakeProfileRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraProfileScreen(
          repository: repository,
          currentUser: sampleCurrentUser(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.dragUntilVisible(
      find.byKey(const Key('profile-payment-save')),
      find.byType(ListView),
      const Offset(0, -320),
    );
    await tester.enterText(
      find.byKey(const Key('profile-payment-handle')),
      'x' * 321,
    );
    tester.testTextInput.hide();
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('profile-payment-save')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('profile-payment-save')));
    await tester.pumpAndSettle();

    expect(
      find.text('Payment handle must be 320 characters or fewer.'),
      findsOneWidget,
    );
    expect(repository.paymentUpdateCalls, 0);
    expect(visibleText(tester), isNot(contains('x' * 321)));
  });

  testWidgets('profile payment cancel restores existing values', (
    tester,
  ) async {
    final repository = FakeProfileRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraProfileScreen(
          repository: repository,
          currentUser: sampleCurrentUser(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.dragUntilVisible(
      find.byKey(const Key('profile-payment-cancel')),
      find.byType(ListView),
      const Offset(0, -320),
    );
    await selectDropdownValue(
      tester,
      const Key('profile-payment-method'),
      'PayMe',
    );
    await tester.enterText(
      find.byKey(const Key('profile-payment-handle')),
      'discard-me',
    );
    tester.testTextInput.hide();
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('profile-payment-cancel')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('profile-payment-cancel')));
    await tester.pumpAndSettle();

    final handleField = tester.widget<TextField>(
      find.byKey(const Key('profile-payment-handle')),
    );

    expect(find.text('Bank transfer'), findsWidgets);
    expect(handleField.controller?.text, 'pay.example/taylor');
    expect(repository.paymentUpdateCalls, 0);
    expect(visibleText(tester), isNot(contains('discard-me')));
  });

  testWidgets('profile screen handles expired sessions safely', (tester) async {
    String? sessionEndedNotice;
    final repository = FakeProfileRepository(
      loadFailure: const SettleoraProfileFailure(
        kind: SettleoraProfileFailureKind.sessionExpired,
        message:
            'Your session has expired. Sign in again before loading account details.',
        statusCode: 401,
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraProfileScreen(
          repository: repository,
          currentUser: sampleCurrentUser(),
          onSessionEnded: (notice) async {
            sessionEndedNotice = notice;
          },
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Sign in again'), findsOneWidget);
    expect(find.byKey(const Key('profile-sign-in-required')), findsOneWidget);
    expect(visibleText(tester), isNot(contains('redacted-token')));

    await tester.tap(find.byKey(const Key('profile-sign-in-required')));
    await tester.pumpAndSettle();

    expect(
      sessionEndedNotice,
      'Your session has expired. Sign in again before loading account details.',
    );
  });
}

class FakeProfileRepository implements SettleoraProfileRepository {
  FakeProfileRepository({
    SettleoraSelfProfile? profile,
    SettleoraSelfPaymentDetails? paymentDetails,
    this.loadFailure,
    this.profileUpdateFailure,
    this.paymentUpdateFailure,
    this.profileUpdateCompleter,
    this.paymentUpdateCompleter,
  }) : profile = profile ?? sampleProfile(),
       paymentDetails = paymentDetails ?? samplePaymentDetails();

  SettleoraSelfProfile profile;
  SettleoraSelfPaymentDetails paymentDetails;
  final SettleoraProfileFailure? loadFailure;
  final SettleoraProfileFailure? profileUpdateFailure;
  final SettleoraProfileFailure? paymentUpdateFailure;
  final Completer<void>? profileUpdateCompleter;
  final Completer<void>? paymentUpdateCompleter;
  SettleoraProfileFailure? nextProfileReadFailure;
  SettleoraProfileFailure? nextPaymentReadFailure;
  int profileReadCalls = 0;
  int paymentReadCalls = 0;
  int profileUpdateCalls = 0;
  int paymentUpdateCalls = 0;
  SettleoraSelfProfileUpdate? lastProfileUpdate;
  SettleoraSelfPaymentDetailsUpdate? lastPaymentUpdate;

  @override
  Future<SettleoraSelfProfile> getSelfProfile() async {
    profileReadCalls += 1;
    final failure = nextProfileReadFailure;
    if (failure != null) {
      nextProfileReadFailure = null;
      throw failure;
    }
    _throwLoadIfNeeded();
    return profile;
  }

  @override
  Future<SettleoraSelfProfile> updateSelfProfile(
    SettleoraSelfProfileUpdate update,
  ) async {
    profileUpdateCalls += 1;
    lastProfileUpdate = update;
    await profileUpdateCompleter?.future;
    final failure = profileUpdateFailure;
    if (failure != null) {
      throw failure;
    }

    profile = SettleoraSelfProfile(
      id: profile.id,
      displayName: update.displayName.trim(),
      defaultCurrency: _blankToNull(update.defaultCurrency)?.toUpperCase(),
      createdAtUtc: profile.createdAtUtc,
      updatedAtUtc: _updatedAtUtc,
    );
    return profile;
  }

  @override
  Future<SettleoraSelfPaymentDetails> getSelfPaymentDetails() async {
    paymentReadCalls += 1;
    final failure = nextPaymentReadFailure;
    if (failure != null) {
      nextPaymentReadFailure = null;
      throw failure;
    }
    _throwLoadIfNeeded();
    return paymentDetails;
  }

  @override
  Future<SettleoraSelfPaymentDetails> updateSelfPaymentDetails(
    SettleoraSelfPaymentDetailsUpdate update,
  ) async {
    paymentUpdateCalls += 1;
    lastPaymentUpdate = update;
    await paymentUpdateCompleter?.future;
    final failure = paymentUpdateFailure;
    if (failure != null) {
      throw failure;
    }

    paymentDetails = SettleoraSelfPaymentDetails(
      isConfigured: true,
      id: paymentDetails.id,
      preferredMethodLabel: _blankToNull(update.preferredMethodLabel),
      paymentHandle: _blankToNull(update.paymentHandle),
      paymentNote: _blankToNull(update.paymentNote),
      visibility: update.visibility,
      qrFile: paymentDetails.qrFile,
      createdAtUtc: paymentDetails.createdAtUtc,
      updatedAtUtc: _updatedAtUtc,
    );
    return paymentDetails;
  }

  void _throwLoadIfNeeded() {
    final failure = loadFailure;
    if (failure != null) {
      throw failure;
    }
  }
}

class FakeReceiptOcrReviewRepository implements ReceiptOcrReviewRepository {
  @override
  Future<List<ReceiptOcrReviewSummary>> listReviews({
    ReceiptOcrReviewStatus? status,
    ReceiptOcrReviewSource? source,
    int? limit,
  }) async {
    return const [];
  }

  @override
  Future<ReceiptOcrReviewDetail> getReview(ReceiptOcrReviewRoute route) {
    throw UnimplementedError();
  }

  @override
  Future<ReceiptOcrReviewDetail> saveReview(
    ReceiptOcrReviewRoute route,
    ReceiptOcrReviewSaveRequest request,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<void> deleteReview(ReceiptOcrReviewRoute route) {
    throw UnimplementedError();
  }

  @override
  Future<ReceiptOcrReviewApplyPreview> previewApply(
    ReceiptOcrReviewRoute route,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<ReceiptOcrReviewApplyResult> applyReview(
    ReceiptOcrReviewRoute route, {
    required DateTime expectedReviewUpdatedAtUtc,
  }) {
    throw UnimplementedError();
  }
}

class FakeRecurringBillRepository implements SettleoraRecurringBillRepository {
  @override
  Future<List<SettleoraRecurringBillTemplateSummary>> listTemplates({
    SettleoraRecurringBillTemplateStatus? status,
    String? groupId,
    String? fromDate,
    String? toDate,
    int maxItems = 100,
  }) async {
    return const [];
  }

  @override
  Future<List<SettleoraRecurringBillForecastOccurrence>> listForecast({
    String? fromDate,
    String? toDate,
    int limit = 30,
    String? groupId,
  }) async {
    return const [];
  }

  @override
  Future<SettleoraRecurringBillTemplateDetail> getTemplate(String templateId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraRecurringBillTemplateDetail> createTemplate(
    SettleoraRecurringBillCreateDraft draft,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraRecurringBillTemplateDetail> updateTemplate({
    required String templateId,
    required SettleoraRecurringBillUpdateDraft draft,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraRecurringBillTemplateDetail> pauseTemplate(
    String templateId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraRecurringBillTemplateDetail> resumeTemplate(
    String templateId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraRecurringBillTemplateDetail> archiveTemplate(
    String templateId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraRecurringBillDraftResult> generateDraft({
    required String templateId,
    required String occurrenceDate,
  }) {
    throw UnimplementedError();
  }
}

class FakeBillRepository implements SettleoraBillRepository {
  @override
  Future<SettleoraBillDetail> createPersonalBill(
    SettleoraPersonalBillCreateDraft draft,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillDetail> createGroupBill(
    String groupId,
    SettleoraGroupBillCreateDraft draft,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<void> submitGroupBill(String groupId, String billId) {
    throw UnimplementedError();
  }

  @override
  Future<void> acceptGroupBillParticipant(
    String groupId,
    String billId,
    String userProfileId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<void> rejectGroupBillParticipant(
    String groupId,
    String billId,
    String userProfileId,
    SettleoraBillParticipantRejectionReasonCode reasonCode,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillDetail> getGroupBill(String groupId, String billId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillDetail> getPersonalBill(String billId) {
    throw UnimplementedError();
  }

  @override
  Future<List<SettleoraBillSummary>> listGroupBills(
    String groupId, {
    int limit = 50,
  }) async {
    return const [];
  }

  @override
  Future<List<SettleoraBillSummary>> listPersonalBills({int limit = 50}) async {
    return const [];
  }
}

class FakeSettlementRepository implements SettleoraSettlementRepository {
  @override
  Future<SettleoraSettlementBalanceSnapshot> listBalances() async {
    return SettleoraSettlementBalanceSnapshot(
      generatedAtUtc: _updatedAtUtc,
      balances: const [],
    );
  }

  @override
  Future<List<SettleoraSettlementRequest>> listSettlementRequests() async {
    return const [];
  }

  @override
  Future<SettleoraSettlementRequest> getSettlementRequest(String settlementId) {
    throw UnimplementedError();
  }

  @override
  Future<List<SettleoraSettlementPayment>> listSettlementPayments(
    String settlementId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementPayment> markSettlementPaymentPaid({
    required String settlementId,
    required String amount,
    required String currency,
    required String paymentDate,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementCounterpartyPaymentDetails>
  getCounterpartyPaymentDetails({
    required String settlementId,
    required String userProfileId,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementRequest> cancelSettlementRequest(
    String settlementId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementRequest> disputeSettlementRequest(
    String settlementId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementPayment> confirmSettlementPayment(
    String paymentId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementPayment> cancelSettlementPayment(String paymentId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementPayment> disputeSettlementPayment(
    String paymentId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementPayment> confirmSettlementPaymentResidual({
    required String paymentId,
    required String residualId,
  }) {
    throw UnimplementedError();
  }
}

class FakeGroupRepository implements SettleoraGroupRepository {
  @override
  Future<List<SettleoraGroup>> listGroups() async {
    return const [];
  }

  @override
  Future<SettleoraGroup> createGroup(SettleoraGroupSaveRequest request) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraGroup> getGroup(String groupId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraGroup> updateGroup(
    String groupId,
    SettleoraGroupSaveRequest request,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<List<SettleoraGroupMember>> listGroupMembers(String groupId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraGroupMember> addGroupMember(
    String groupId,
    SettleoraGroupMemberAddRequest request,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraGroupMember> updateGroupMember(
    String groupId,
    String userProfileId,
    SettleoraGroupMemberRoleUpdate update,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<void> removeGroupMember(String groupId, String userProfileId) {
    throw UnimplementedError();
  }
}

class FakeNotificationRepository implements SettleoraNotificationRepository {
  @override
  Future<List<SettleoraNotificationRow>> listNotifications({
    SettleoraNotificationStatus? status,
    int limit = 50,
    DateTime? before,
  }) async {
    return const [];
  }

  @override
  Future<SettleoraNotificationSummary> getNotificationSummary() async {
    return const SettleoraNotificationSummary(
      unreadCount: 0,
      attentionCount: 0,
      urgentCount: 0,
    );
  }

  @override
  Future<SettleoraNotificationRow> markNotificationRead(String notificationId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraNotificationSummary> markAllNotificationsRead() {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraNotificationRow> archiveNotification(String notificationId) {
    throw UnimplementedError();
  }
}

class FakeMonthlyReportRepository implements SettleoraMonthlyReportRepository {
  @override
  Future<SettleoraMonthlyReport> getMonthlyReport({
    required String month,
    String? groupId,
  }) async {
    return SettleoraMonthlyReport(
      month: month,
      groupId: groupId,
      generatedAtUtc: DateTime.utc(2026, 5, 18, 9),
      billCount: 0,
      totalByCurrency: const [],
      actorShareByCurrency: const [],
      actorPaidByCurrency: const [],
      reconciliationCounts: const [],
      settlementRequestCounts: const [],
      settlementPaymentCounts: const [],
    );
  }
}

class FakeAuthRepository implements SettleoraAuthRepository {
  @override
  Future<SettleoraCurrentUser> currentUser({
    required String accessToken,
  }) async {
    return sampleCurrentUser();
  }

  @override
  Future<SettleoraServerSessionMaterial> signIn(
    SettleoraSignInSubmission submission,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraServerSessionMaterial> refreshSession({
    required String refreshCredential,
    String? deviceLabel,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<void> signOutCurrentSession({required String accessToken}) async {}

  @override
  Future<void> signOutAllCurrentAccountSessions({
    required String accessToken,
  }) async {}

  @override
  Future<List<SettleoraSessionSummary>> listSessions({
    required String accessToken,
  }) async {
    return const [];
  }

  @override
  Future<void> revokeSession({
    required String sessionId,
    required String accessToken,
  }) async {}
}

class FakeAccessTokenProvider implements SettleoraAccessTokenProvider {
  const FakeAccessTokenProvider(this._accessToken);

  final String? _accessToken;

  @override
  Future<String?> accessToken() async => _accessToken;
}

class MemorySyncQueueStore extends SettleoraSyncQueueStore {
  MemorySyncQueueStore();

  var state = SettleoraSyncQueueState.empty();

  @override
  final int maxItemCount = 100;

  @override
  Future<SettleoraSyncQueueState> read() async => state;

  @override
  Future<void> write(SettleoraSyncQueueState state) async {
    this.state = state;
  }
}

class FakeSyncRepository implements SettleoraSyncRepository {
  @override
  Future<SettleoraSyncOperationResult> submitOperation(
    SettleoraSyncQueueItem item,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSyncChangeFeed> listChanges({
    int? sinceVersion,
    int? limit,
    SettleoraSyncResourceType? resourceType,
  }) {
    throw UnimplementedError();
  }
}

SettleoraBillSyncController sampleSyncController() {
  final store = MemorySyncQueueStore();
  return SettleoraBillSyncController(
    queueStore: store,
    queueProcessor: SettleoraSyncQueueProcessor(
      queueStore: store,
      repository: FakeSyncRepository(),
    ),
  );
}

SettleoraCurrentUser sampleCurrentUser() {
  return SettleoraCurrentUser(
    userProfileId: _profileId,
    displayName: 'Taylor',
    defaultCurrency: 'USD',
    roles: const ['user'],
    sessionExpiresAtUtc: DateTime.utc(2026, 5, 19),
  );
}

SettleoraSelfProfile sampleProfile() {
  return SettleoraSelfProfile(
    id: _profileId,
    displayName: 'Taylor',
    defaultCurrency: 'USD',
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

SettleoraSelfPaymentDetails samplePaymentDetails({
  String visibility =
      SettleoraPaymentDetailsVisibilityValues.settlementCounterpartiesOnly,
}) {
  return SettleoraSelfPaymentDetails(
    isConfigured: true,
    id: _paymentProfileId,
    preferredMethodLabel: 'Bank transfer',
    paymentHandle: 'pay.example/taylor',
    paymentNote: null,
    visibility: visibility,
    qrFile: SettleoraSelfPaymentQrFile(
      contentType: 'image/png',
      sizeBytes: 2048,
      updatedAtUtc: _updatedAtUtc,
    ),
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

SettleoraSelfPaymentDetails emptyPaymentDetails() {
  return SettleoraSelfPaymentDetails(
    isConfigured: false,
    id: null,
    preferredMethodLabel: null,
    paymentHandle: null,
    paymentNote: null,
    visibility:
        SettleoraPaymentDetailsVisibilityValues.settlementCounterpartiesOnly,
    qrFile: null,
    createdAtUtc: null,
    updatedAtUtc: null,
  );
}

String? _blankToNull(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }

  return trimmed;
}

String visibleText(WidgetTester tester) {
  return tester
      .widgetList<Text>(find.byType(Text))
      .map((widget) => widget.data)
      .whereType<String>()
      .join('\n');
}

Future<void> selectDropdownValue(
  WidgetTester tester,
  Key fieldKey,
  String nextLabel,
) async {
  final field = find.byKey(fieldKey);
  await tester.ensureVisible(field);
  await tester.pumpAndSettle();
  await tester.tap(
    find.descendant(
      of: field,
      matching: find.byType(DropdownButtonFormField<String?>),
    ),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.text(nextLabel).last);
  await tester.pumpAndSettle();
}

const _profileId = '11111111-1111-1111-1111-111111111111';
const _paymentProfileId = '22222222-2222-2222-2222-222222222222';
const _qrFileId = '33333333-3333-3333-3333-333333333333';
final _createdAtUtc = DateTime.utc(2026, 5, 18, 9);
final _updatedAtUtc = DateTime.utc(2026, 5, 18, 10);
