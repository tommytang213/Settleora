import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/settlements/settlement_list_screen.dart';
import 'package:mobile/settlements/settlement_repository.dart';

void main() {
  testWidgets('settlement list opens detail and confirms residuals', (
    tester,
  ) async {
    final repository = FakeSettlementRepository(
      balances: [sampleBalance()],
      requests: [sampleRequest()],
      detail: sampleRequest(),
      payments: [samplePayment()],
      paymentDetails: samplePaymentDetails(),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraSettlementListScreen(
          repository: repository,
          currentUserProfileId: _debtorUserProfileId,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Settlements'), findsOneWidget);
    expect(find.text('Outgoing balance'), findsOneWidget);
    expect(find.text('7.50 USD'), findsOneWidget);
    expect(find.text('10.00 USD'), findsOneWidget);
    expect(repository.listBalancesCalls, 1);
    expect(repository.listRequestsCalls, 1);

    await tester.tap(find.text('10.00 USD'));
    await tester.pumpAndSettle();

    expect(find.text('Counterparty Payment Details'), findsOneWidget);
    expect(find.text('Bank transfer'), findsOneWidget);
    expect(find.text('Payments'), findsOneWidget);
    expect(find.text('2.50 USD'), findsOneWidget);
    expect(repository.getRequestCalls, 1);
    expect(repository.listPaymentsCalls, 1);
    expect(repository.paymentDetailsCalls, 1);
    expect(repository.lastPaymentDetailsUserProfileId, _creditorUserProfileId);

    final residualConfirm = find.byKey(
      const ValueKey('settlement-residual-confirm-0-0'),
    );
    await tester.ensureVisible(residualConfirm);
    await tester.pumpAndSettle();
    await tester.tap(residualConfirm);
    await tester.pumpAndSettle();

    expect(repository.confirmResidualCalls, 1);
    expect(repository.lastResidualId, _residualId);
    expect(find.text('Residual confirmed.'), findsOneWidget);
  });

  testWidgets('settlement list shows bounded session failure state', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraSettlementListScreen(
          repository: FakeSettlementRepository(
            failure: const SettleoraSettlementFailure(
              kind: SettleoraSettlementFailureKind.sessionRequired,
              message: 'Sign in before loading settlements.',
            ),
          ),
          currentUserProfileId: _debtorUserProfileId,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Sign in required'), findsOneWidget);
    expect(find.text('Sign in before loading settlements.'), findsOneWidget);
    expect(find.textContaining(_settlementId), findsNothing);
  });
}

class FakeSettlementRepository implements SettleoraSettlementRepository {
  FakeSettlementRepository({
    this.failure,
    this.balances = const [],
    this.requests = const [],
    SettleoraSettlementRequest? detail,
    this.payments = const [],
    this.paymentDetails,
  }) : detail = detail ?? sampleRequest();

  final SettleoraSettlementFailure? failure;
  final List<SettleoraSettlementBalance> balances;
  final List<SettleoraSettlementRequest> requests;
  SettleoraSettlementRequest detail;
  List<SettleoraSettlementPayment> payments;
  final SettleoraSettlementCounterpartyPaymentDetails? paymentDetails;
  int listBalancesCalls = 0;
  int listRequestsCalls = 0;
  int getRequestCalls = 0;
  int listPaymentsCalls = 0;
  int paymentDetailsCalls = 0;
  int cancelRequestCalls = 0;
  int disputeRequestCalls = 0;
  int confirmPaymentCalls = 0;
  int cancelPaymentCalls = 0;
  int disputePaymentCalls = 0;
  int confirmResidualCalls = 0;
  String? lastPaymentDetailsUserProfileId;
  String? lastResidualId;

  @override
  Future<SettleoraSettlementBalanceSnapshot> listBalances() async {
    listBalancesCalls += 1;
    _throwIfNeeded();
    return SettleoraSettlementBalanceSnapshot(
      generatedAtUtc: _generatedAtUtc,
      balances: balances,
    );
  }

  @override
  Future<List<SettleoraSettlementRequest>> listSettlementRequests() async {
    listRequestsCalls += 1;
    _throwIfNeeded();
    return requests;
  }

  @override
  Future<SettleoraSettlementRequest> getSettlementRequest(
    String settlementId,
  ) async {
    getRequestCalls += 1;
    _throwIfNeeded();
    return detail;
  }

  @override
  Future<List<SettleoraSettlementPayment>> listSettlementPayments(
    String settlementId,
  ) async {
    listPaymentsCalls += 1;
    _throwIfNeeded();
    return payments;
  }

  @override
  Future<SettleoraSettlementCounterpartyPaymentDetails>
  getCounterpartyPaymentDetails({
    required String settlementId,
    required String userProfileId,
  }) async {
    paymentDetailsCalls += 1;
    lastPaymentDetailsUserProfileId = userProfileId;
    _throwIfNeeded();
    return paymentDetails ?? samplePaymentDetails();
  }

  @override
  Future<SettleoraSettlementRequest> cancelSettlementRequest(
    String settlementId,
  ) async {
    cancelRequestCalls += 1;
    detail = sampleRequest(
      status: SettleoraSettlementRequestStatusValues.cancelled,
    );
    return detail;
  }

  @override
  Future<SettleoraSettlementRequest> disputeSettlementRequest(
    String settlementId,
  ) async {
    disputeRequestCalls += 1;
    detail = sampleRequest(
      status: SettleoraSettlementRequestStatusValues.disputed,
    );
    return detail;
  }

  @override
  Future<SettleoraSettlementPayment> confirmSettlementPayment(
    String paymentId,
  ) async {
    confirmPaymentCalls += 1;
    final payment = samplePayment(
      status: SettleoraSettlementPaymentStatusValues.confirmed,
      residualStatus: SettleoraSettlementResidualStatusValues.confirmed,
    );
    payments = [payment];
    return payment;
  }

  @override
  Future<SettleoraSettlementPayment> cancelSettlementPayment(
    String paymentId,
  ) async {
    cancelPaymentCalls += 1;
    final payment = samplePayment(
      status: SettleoraSettlementPaymentStatusValues.cancelled,
    );
    payments = [payment];
    return payment;
  }

  @override
  Future<SettleoraSettlementPayment> disputeSettlementPayment(
    String paymentId,
  ) async {
    disputePaymentCalls += 1;
    final payment = samplePayment(
      status: SettleoraSettlementPaymentStatusValues.disputed,
    );
    payments = [payment];
    return payment;
  }

  @override
  Future<SettleoraSettlementPayment> confirmSettlementPaymentResidual({
    required String paymentId,
    required String residualId,
  }) async {
    confirmResidualCalls += 1;
    lastResidualId = residualId;
    final payment = samplePayment(
      residualStatus: SettleoraSettlementResidualStatusValues.confirmed,
    );
    payments = [payment];
    return payment;
  }

  void _throwIfNeeded() {
    final failure = this.failure;
    if (failure != null) {
      throw failure;
    }
  }
}

SettleoraSettlementBalance sampleBalance() {
  return const SettleoraSettlementBalance(
    counterpartyUserProfileId: _creditorUserProfileId,
    groupId: null,
    direction: SettleoraSettlementBalanceDirectionValues.outgoing,
    currency: 'USD',
    selectedLineAmount: '10.00',
    pendingClaimedAmount: '2.50',
    confirmedClearedAmount: '0.00',
    remainingUnclaimedAmount: '7.50',
    confirmedRemainingResidualAmount: '0.00',
    waivedResidualAmount: '0.00',
    creditResidualAmount: '0.00',
    requestCount: 1,
    lineCount: 1,
    pendingPaymentCount: 1,
    confirmedPaymentCount: 0,
  );
}

SettleoraSettlementRequest sampleRequest({
  String status = SettleoraSettlementRequestStatusValues.requested,
}) {
  return SettleoraSettlementRequest(
    id: _settlementId,
    sourceExpenseBillId: _billId,
    groupId: null,
    debtorUserProfileId: _debtorUserProfileId,
    creditorUserProfileId: _creditorUserProfileId,
    amount: '10.00',
    currency: 'USD',
    status: status,
    requestedByUserProfileId: _creditorUserProfileId,
    requestedAtUtc: _requestedAtUtc,
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
    lines: [
      SettleoraSettlementRequestLine(
        id: _lineId,
        sourceExpenseBillId: _billId,
        sourceBillRevisionId: null,
        sourceCandidateKey: 'candidate-key',
        exactAmount: '10.00',
        currency: 'USD',
        allocationOrder: 0,
        status: 'open',
        createdAtUtc: _createdAtUtc,
        updatedAtUtc: _updatedAtUtc,
      ),
    ],
  );
}

SettleoraSettlementPayment samplePayment({
  String status = SettleoraSettlementPaymentStatusValues.markedPaid,
  String residualStatus =
      SettleoraSettlementResidualStatusValues.pendingReceiverConfirmation,
}) {
  return SettleoraSettlementPayment(
    id: _paymentId,
    settlementRequestId: _settlementId,
    paidByUserProfileId: _debtorUserProfileId,
    receivedByUserProfileId: _creditorUserProfileId,
    amount: '2.50',
    currency: 'USD',
    status: status,
    paymentDate: '2026-05-17',
    claimedAtUtc: _claimedAtUtc,
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
    allocations: [
      SettleoraSettlementPaymentAllocation(
        id: _allocationId,
        settlementRequestLineId: _lineId,
        clearedAmount: '2.50',
        currency: 'USD',
        allocationOrder: 0,
        createdAtUtc: _createdAtUtc,
      ),
    ],
    residuals: [
      SettleoraSettlementPaymentResidual(
        id: _residualId,
        settlementPaymentId: _paymentId,
        settlementRequestId: _settlementId,
        direction: 'underpayment',
        amount: '7.50',
        currency: 'USD',
        policy: 'remaining_balance',
        status: residualStatus,
        createdAtUtc: _createdAtUtc,
        resolvedAtUtc: null,
      ),
    ],
    settlementRequestStatus:
        SettleoraSettlementRequestStatusValues.partiallyPaid,
  );
}

SettleoraSettlementCounterpartyPaymentDetails samplePaymentDetails() {
  return const SettleoraSettlementCounterpartyPaymentDetails(
    userProfileId: _creditorUserProfileId,
    isConfigured: true,
    preferredMethodLabel: 'Bank transfer',
    paymentHandle: 'pay.example/receiver',
    paymentNote: null,
    visibilityApplied: 'settlement_counterparties_only',
    hasQrFile: true,
  );
}

const _settlementId = '11111111-1111-1111-1111-111111111111';
const _paymentId = '22222222-2222-2222-2222-222222222222';
const _residualId = '33333333-3333-3333-3333-333333333333';
const _billId = '44444444-4444-4444-4444-444444444444';
const _lineId = '55555555-5555-5555-5555-555555555555';
const _allocationId = '66666666-6666-6666-6666-666666666666';
const _debtorUserProfileId = '77777777-7777-7777-7777-777777777777';
const _creditorUserProfileId = '88888888-8888-8888-8888-888888888888';
final _generatedAtUtc = DateTime.utc(2026, 5, 17, 9);
final _requestedAtUtc = DateTime.utc(2026, 5, 17, 10);
final _claimedAtUtc = DateTime.utc(2026, 5, 17, 10, 30);
final _createdAtUtc = DateTime.utc(2026, 5, 17, 10);
final _updatedAtUtc = DateTime.utc(2026, 5, 17, 11);
