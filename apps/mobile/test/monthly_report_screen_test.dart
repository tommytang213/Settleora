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
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_repository.dart';
import 'package:mobile/recurring_bills/recurring_bill_repository.dart';
import 'package:mobile/reports/monthly_report_screen.dart';
import 'package:mobile/reports/report_repository.dart';
import 'package:mobile/settlements/settlement_repository.dart';
import 'package:mobile/sync/sync_queue.dart';
import 'package:mobile/sync/sync_queue_processor.dart';
import 'package:mobile/sync/sync_repository.dart';

void main() {
  testWidgets('monthly report screen shows loading and loaded content', (
    tester,
  ) async {
    final repository = FakeMonthlyReportRepository.manual();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraMonthlyReportScreen(
          repository: repository,
          initialMonth: '2026-05',
          groupId: _groupId,
          groupLabel: 'Roommates',
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Loading monthly report'), findsOneWidget);

    repository.completeReport(sampleReport());
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('monthly-report-summary')), findsOneWidget);
    expect(find.text('Roommates'), findsOneWidget);
    expect(find.textContaining('Server monthly aggregate'), findsOneWidget);
    expect(find.text('Bills'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
    expect(find.text('Total by currency'), findsOneWidget);
    expect(find.text('123.4500 USD'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('Your share by currency'),
      180,
      scrollable: find.byType(Scrollable).first,
    );

    expect(find.text('Your share by currency'), findsOneWidget);
    expect(find.text('41.1500 USD'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('You paid by currency'),
      180,
      scrollable: find.byType(Scrollable).first,
    );

    expect(find.text('You paid by currency'), findsOneWidget);
    expect(find.text('90.00 USD'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('Reconciliation'),
      240,
      scrollable: find.byType(Scrollable).first,
    );

    expect(find.text('Reconciliation'), findsOneWidget);
    expect(find.text('Unreconciled: 1'), findsOneWidget);
    expect(find.text('Other status: Future Status: 2'), findsOneWidget);
    expect(find.text('Settlement requests'), findsOneWidget);
    expect(find.text('Partially paid: 1'), findsOneWidget);
    expect(find.text('Settlement payments'), findsOneWidget);
    expect(find.text('Confirmed: 1'), findsOneWidget);
    expect(visibleText(tester), isNot(contains(_groupId)));
  });

  testWidgets('monthly report screen renders zero report state', (
    tester,
  ) async {
    final repository = FakeMonthlyReportRepository(
      report: sampleReport(
        billCount: 0,
        totalByCurrency: const [],
        actorShareByCurrency: const [],
        actorPaidByCurrency: const [],
        reconciliationCounts: const [
          SettleoraMonthlyReportStatusCount(status: 'unreconciled', count: 0),
        ],
        settlementRequestCounts: const [
          SettleoraMonthlyReportStatusCount(status: 'requested', count: 0),
        ],
        settlementPaymentCounts: const [
          SettleoraMonthlyReportStatusCount(status: 'marked_paid', count: 0),
        ],
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraMonthlyReportScreen(
          repository: repository,
          initialMonth: '2026-05',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('No monthly report activity'), findsOneWidget);
    expect(find.textContaining('The server returned no bills'), findsOneWidget);
    expect(find.text('No totals'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('Unreconciled: 0'),
      240,
      scrollable: find.byType(Scrollable).first,
    );

    expect(find.text('Unreconciled: 0'), findsOneWidget);
  });

  testWidgets('monthly report search filters loaded aggregate rows', (
    tester,
  ) async {
    final repository = FakeMonthlyReportRepository(
      report: sampleReport(
        totalByCurrency: const [
          SettleoraMonthlyReportCurrencyTotal(
            currency: 'USD',
            amount: '123.4500',
          ),
          SettleoraMonthlyReportCurrencyTotal(currency: 'EUR', amount: '50.00'),
        ],
        actorShareByCurrency: const [
          SettleoraMonthlyReportCurrencyTotal(
            currency: 'USD',
            amount: '41.1500',
          ),
        ],
        actorPaidByCurrency: const [
          SettleoraMonthlyReportCurrencyTotal(currency: 'JPY', amount: '9000'),
        ],
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraMonthlyReportScreen(
          repository: repository,
          initialMonth: '2026-05',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('monthly-report-search')),
      'eur',
    );
    await tester.pumpAndSettle();

    expect(find.text('1 matching report rows'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('50.00 EUR'),
      180,
      scrollable: find.byType(Scrollable).first,
    );

    expect(find.text('50.00 EUR'), findsOneWidget);
    expect(find.text('123.4500 USD'), findsNothing);
    expect(find.text('9000 JPY'), findsNothing);
    expect(find.textContaining('Totals and bill count remain'), findsOneWidget);
  });

  testWidgets('monthly report section chips filter loaded report buckets', (
    tester,
  ) async {
    final repository = FakeMonthlyReportRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraMonthlyReportScreen(
          repository: repository,
          initialMonth: '2026-05',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('monthly-report-filter-requests')));
    await tester.pumpAndSettle();

    expect(find.text('1 matching report rows'), findsOneWidget);
    expect(find.text('123.4500 USD'), findsNothing);
    expect(find.text('Unreconciled: 1'), findsNothing);

    await tester.scrollUntilVisible(
      find.text('Partially paid: 1'),
      240,
      scrollable: find.byType(Scrollable).first,
    );

    expect(find.text('Partially paid: 1'), findsOneWidget);
  });

  testWidgets('monthly report combines search and filters safely', (
    tester,
  ) async {
    final repository = FakeMonthlyReportRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraMonthlyReportScreen(
          repository: repository,
          initialMonth: '2026-05',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(
      find.byKey(const Key('monthly-report-filter-reconciliation')),
    );
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('monthly-report-search')),
      'future',
    );
    await tester.pumpAndSettle();

    expect(find.text('1 matching report rows'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('Other status: Future Status: 2'),
      240,
      scrollable: find.byType(Scrollable).first,
    );

    expect(find.text('Other status: Future Status: 2'), findsOneWidget);
    expect(find.text('Partially paid: 1'), findsNothing);
  });

  testWidgets('monthly report clear control resets discovery state', (
    tester,
  ) async {
    final repository = FakeMonthlyReportRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraMonthlyReportScreen(
          repository: repository,
          initialMonth: '2026-05',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('monthly-report-filter-payments')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('monthly-report-search')),
      'confirmed',
    );
    await tester.pumpAndSettle();

    expect(find.text('1 matching report rows'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.byKey(const Key('monthly-report-clear-discovery')),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.ensureVisible(
      find.byKey(const Key('monthly-report-clear-discovery')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('monthly-report-clear-discovery')));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const Key('monthly-report-clear-discovery')),
      findsNothing,
    );
    expect(find.text('123.4500 USD'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('Unreconciled: 1'),
      240,
      scrollable: find.byType(Scrollable).first,
    );

    expect(find.text('Unreconciled: 1'), findsOneWidget);
  });

  testWidgets('monthly report distinguishes filtered empty from true empty', (
    tester,
  ) async {
    final repository = FakeMonthlyReportRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraMonthlyReportScreen(
          repository: repository,
          initialMonth: '2026-05',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('No monthly report activity'), findsNothing);

    await tester.enterText(
      find.byKey(const Key('monthly-report-search')),
      'does-not-match-report',
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.text('No matching report rows'),
      180,
      scrollable: find.byType(Scrollable).first,
    );

    expect(find.text('No matching report rows'), findsOneWidget);
    expect(
      find.textContaining('Clear local search or filters'),
      findsOneWidget,
    );
    expect(find.text('No monthly report activity'), findsNothing);

    await tester.tap(find.byKey(const Key('monthly-report-clear-discovery')));
    await tester.pumpAndSettle();

    expect(find.text('No matching report rows'), findsNothing);
    expect(find.text('123.4500 USD'), findsOneWidget);
  });

  testWidgets('monthly report screen navigates previous and next months', (
    tester,
  ) async {
    final repository = FakeMonthlyReportRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraMonthlyReportScreen(
          repository: repository,
          initialMonth: '2026-05',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('monthly-report-previous-month')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('monthly-report-next-month')));
    await tester.pumpAndSettle();

    expect(repository.requestedMonths, ['2026-05', '2026-04', '2026-05']);
  });

  testWidgets('monthly report screen retries and refreshes safely', (
    tester,
  ) async {
    final repository = FakeMonthlyReportRepository(
      loadFailures: [
        const SettleoraMonthlyReportFailure(
          kind: SettleoraMonthlyReportFailureKind.network,
          message:
              'The server is unavailable. Try again when the connection is back.',
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraMonthlyReportScreen(
          repository: repository,
          initialMonth: '2026-05',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Server unavailable'), findsOneWidget);
    expect(find.byKey(const Key('monthly-report-retry')), findsOneWidget);

    await tester.tap(find.byKey(const Key('monthly-report-retry')));
    await tester.pumpAndSettle();

    expect(find.text('123.4500 USD'), findsOneWidget);

    await tester.tap(find.byKey(const Key('monthly-report-refresh')));
    await tester.pumpAndSettle();

    expect(repository.calls, 3);
  });

  testWidgets('monthly report screen handles expired sessions safely', (
    tester,
  ) async {
    String? sessionEndedNotice;
    final repository = FakeMonthlyReportRepository(
      loadFailures: [
        const SettleoraMonthlyReportFailure(
          kind: SettleoraMonthlyReportFailureKind.sessionExpired,
          message:
              'Your session has expired. Sign in again before loading monthly reports.',
          statusCode: 401,
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraMonthlyReportScreen(
          repository: repository,
          initialMonth: '2026-05',
          onSessionEnded: (notice) async {
            sessionEndedNotice = notice;
          },
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Sign in again'), findsOneWidget);
    expect(
      find.byKey(const Key('monthly-report-sign-in-required')),
      findsOneWidget,
    );
    expect(visibleText(tester), isNot(contains('redacted-token')));

    await tester.tap(find.byKey(const Key('monthly-report-sign-in-required')));
    await tester.pumpAndSettle();

    expect(
      sessionEndedNotice,
      'Your session has expired. Sign in again before loading monthly reports.',
    );
  });

  testWidgets('authenticated server shell opens monthly report screen', (
    tester,
  ) async {
    final reportRepository = FakeMonthlyReportRepository();

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
          reportRepository: reportRepository,
          profileRepository: FakeProfileRepository(),
          billSyncController: sampleSyncController(),
          authRepository: FakeAuthRepository(),
          accessTokenProvider: const FakeAccessTokenProvider('redacted-token'),
          onSessionEnded: (_) async {},
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('server-shell-reports')),
      180,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.ensureVisible(find.byKey(const Key('server-shell-reports')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('server-shell-reports')));
    await tester.pumpAndSettle();

    expect(find.text('Monthly report'), findsWidgets);
    expect(find.text('123.4500 USD'), findsOneWidget);
    expect(reportRepository.calls, 1);
  });

  testWidgets('monthly report screen clarifies personal and group scope', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraMonthlyReportScreen(
          repository: FakeMonthlyReportRepository(
            report: sampleReport(month: '2026-06'),
          ),
          initialMonth: '2026-06',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Personal report'), findsOneWidget);
    expect(find.text('2026-06'), findsWidgets);

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraMonthlyReportScreen(
          repository: FakeMonthlyReportRepository(),
          initialMonth: '2026-05',
          groupId: _groupId,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Group report'), findsOneWidget);
    expect(visibleText(tester), isNot(contains(_groupId)));
  });

  testWidgets('monthly report screen sanitizes unsafe failure messages', (
    tester,
  ) async {
    String? sessionEndedNotice;
    final repository = FakeMonthlyReportRepository(
      loadFailures: [
        const SettleoraMonthlyReportFailure(
          kind: SettleoraMonthlyReportFailureKind.sessionExpired,
          message:
              'GET /api/v1/monthly-reports failed with bearer redacted-token at /workspace/app.dart StackTrace',
          statusCode: 401,
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraMonthlyReportScreen(
          repository: repository,
          initialMonth: '2026-05',
          onSessionEnded: (notice) async {
            sessionEndedNotice = notice;
          },
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Sign in again'), findsOneWidget);
    expect(visibleText(tester), isNot(contains('/api/v1')));
    expect(visibleText(tester), isNot(contains('redacted-token')));
    expect(visibleText(tester), isNot(contains('/workspace')));
    expect(
      find.text(
        'Your session has expired. Sign in again before loading monthly reports.',
      ),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const Key('monthly-report-sign-in-required')));
    await tester.pumpAndSettle();

    expect(
      sessionEndedNotice,
      'Your session has expired. Sign in again before loading monthly reports.',
    );
  });
}

class FakeMonthlyReportRepository implements SettleoraMonthlyReportRepository {
  FakeMonthlyReportRepository({this.report, this.loadFailures = const []})
    : _reportCompleter = null;

  FakeMonthlyReportRepository.manual()
    : report = null,
      loadFailures = const [],
      _reportCompleter = Completer<SettleoraMonthlyReport>();

  final SettleoraMonthlyReport? report;
  final List<SettleoraMonthlyReportFailure> loadFailures;
  final Completer<SettleoraMonthlyReport>? _reportCompleter;
  final requestedMonths = <String>[];
  final requestedGroupIds = <String?>[];
  int calls = 0;

  void completeReport(SettleoraMonthlyReport value) {
    _reportCompleter?.complete(value);
  }

  @override
  Future<SettleoraMonthlyReport> getMonthlyReport({
    required String month,
    String? groupId,
  }) async {
    calls += 1;
    requestedMonths.add(month);
    requestedGroupIds.add(groupId);
    if (loadFailures.length >= calls) {
      throw loadFailures[calls - 1];
    }

    final completer = _reportCompleter;
    if (completer != null) {
      return completer.future;
    }

    return report ?? sampleReport(month: month);
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
      generatedAtUtc: _generatedAtUtc,
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

class FakeProfileRepository implements SettleoraProfileRepository {
  @override
  Future<SettleoraSelfProfile> getSelfProfile() {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSelfProfile> updateSelfProfile(
    SettleoraSelfProfileUpdate update,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSelfPaymentDetails> getSelfPaymentDetails() {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSelfPaymentDetails> updateSelfPaymentDetails(
    SettleoraSelfPaymentDetailsUpdate update,
  ) {
    throw UnimplementedError();
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

SettleoraMonthlyReport sampleReport({
  String month = '2026-05',
  int billCount = 3,
  List<SettleoraMonthlyReportCurrencyTotal>? totalByCurrency,
  List<SettleoraMonthlyReportCurrencyTotal>? actorShareByCurrency,
  List<SettleoraMonthlyReportCurrencyTotal>? actorPaidByCurrency,
  List<SettleoraMonthlyReportStatusCount>? reconciliationCounts,
  List<SettleoraMonthlyReportStatusCount>? settlementRequestCounts,
  List<SettleoraMonthlyReportStatusCount>? settlementPaymentCounts,
}) {
  return SettleoraMonthlyReport(
    month: month,
    groupId: _groupId,
    generatedAtUtc: _generatedAtUtc,
    billCount: billCount,
    totalByCurrency:
        totalByCurrency ??
        const [
          SettleoraMonthlyReportCurrencyTotal(
            currency: 'USD',
            amount: '123.4500',
          ),
        ],
    actorShareByCurrency:
        actorShareByCurrency ??
        const [
          SettleoraMonthlyReportCurrencyTotal(
            currency: 'USD',
            amount: '41.1500',
          ),
        ],
    actorPaidByCurrency:
        actorPaidByCurrency ??
        const [
          SettleoraMonthlyReportCurrencyTotal(currency: 'USD', amount: '90.00'),
        ],
    reconciliationCounts:
        reconciliationCounts ??
        const [
          SettleoraMonthlyReportStatusCount(status: 'unreconciled', count: 1),
          SettleoraMonthlyReportStatusCount(status: 'future_status', count: 2),
        ],
    settlementRequestCounts:
        settlementRequestCounts ??
        const [
          SettleoraMonthlyReportStatusCount(status: 'partially_paid', count: 1),
        ],
    settlementPaymentCounts:
        settlementPaymentCounts ??
        const [
          SettleoraMonthlyReportStatusCount(status: 'confirmed', count: 1),
        ],
  );
}

String visibleText(WidgetTester tester) {
  return tester
      .widgetList<Text>(find.byType(Text))
      .map((widget) => widget.data)
      .whereType<String>()
      .join('\n');
}

const _groupId = '66666666-6666-6666-6666-666666666666';
const _profileId = '44444444-4444-4444-4444-444444444444';
final _generatedAtUtc = DateTime.utc(2026, 5, 18, 9);
