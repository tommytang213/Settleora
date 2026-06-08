import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/settleora_api_client.dart';
import 'package:mobile/settlements/generated_settlement_repository.dart';
import 'package:mobile/settlements/settlement_repository.dart';
import 'package:settleora_api_client/settleora_api.dart' as api;

void main() {
  group('GeneratedSettleoraSettlementRepository', () {
    test('requires a session before calling the generated client', () async {
      final client = FakeSettlementGeneratedClient();
      final repository = GeneratedSettleoraSettlementRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider(null),
      );

      final failure = await captureSettlementFailure(() {
        return repository.listBalances();
      });

      expect(failure.kind, SettleoraSettlementFailureKind.sessionRequired);
      expect(client.balanceCalls, 0);
    });

    test(
      'maps generated settlement reads into bounded mobile models',
      () async {
        final tokenProvider = FakeAccessTokenProvider('  redacted  ');
        final client = FakeSettlementGeneratedClient();
        final repository = GeneratedSettleoraSettlementRepository(
          client: client,
          accessTokenProvider: tokenProvider,
        );

        final balances = await repository.listBalances();
        final requests = await repository.listSettlementRequests();
        final detail = await repository.getSettlementRequest(
          ' $_settlementId ',
        );
        final payments = await repository.listSettlementPayments(_settlementId);
        final paymentDetails = await repository.getCounterpartyPaymentDetails(
          settlementId: _settlementId,
          userProfileId: _creditorUserProfileId,
        );

        expect(balances.generatedAtUtc, _generatedAtUtc);
        expect(balances.balances.single.remainingUnclaimedAmount, '7.50');
        expect(requests.single.id, _settlementId);
        expect(detail.lines.single.exactAmount, '10.00');
        expect(payments.single.id, _paymentId);
        expect(payments.single.residuals.single.canConfirm, isTrue);
        expect(paymentDetails.preferredMethodLabel, 'Bank transfer');
        expect(paymentDetails.hasQrFile, isTrue);
        expect(client.lastSettlementId, _settlementId);
        expect(client.lastUserProfileId, _creditorUserProfileId);
        expect(client.accessTokens, [
          'redacted',
          'redacted',
          'redacted',
          'redacted',
          'redacted',
        ]);
        expect(tokenProvider.calls, 5);
      },
    );

    test('maps settlement mutations and trims route IDs', () async {
      final client = FakeSettlementGeneratedClient();
      final repository = GeneratedSettleoraSettlementRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      final request = await repository.cancelSettlementRequest(
        ' $_settlementId ',
      );
      final payment = await repository.confirmSettlementPaymentResidual(
        paymentId: ' $_paymentId ',
        residualId: ' $_residualId ',
      );

      expect(request.id, _settlementId);
      expect(payment.id, _paymentId);
      expect(client.cancelRequestCalls, 1);
      expect(client.confirmResidualCalls, 1);
      expect(client.lastSettlementId, _settlementId);
      expect(client.lastPaymentId, _paymentId);
      expect(client.lastResidualId, _residualId);
    });

    test(
      'creates a settlement payment claim through the generated client',
      () async {
        final client = FakeSettlementGeneratedClient();
        final repository = GeneratedSettleoraSettlementRepository(
          client: client,
          accessTokenProvider: FakeAccessTokenProvider('redacted'),
        );

        final payment = await repository.markSettlementPaymentPaid(
          settlementId: ' $_settlementId ',
          amount: ' 10.00 ',
          currency: ' USD ',
          paymentDate: ' 2026-05-18 ',
        );

        expect(payment.id, _paymentId);
        expect(client.createPaymentCalls, 1);
        expect(client.lastSettlementId, _settlementId);
        expect(client.lastCreatePaymentAmount, '10.00');
        expect(client.lastCreatePaymentCurrency, 'USD');
        expect(client.lastCreatePaymentDate, '2026-05-18');
      },
    );

    test('maps generated failures to bounded safe failures', () async {
      final repository = GeneratedSettleoraSettlementRepository(
        client: FakeSettlementGeneratedClient(
          failure: api.SettleoraApiException(409, 'Conflict', _hiddenBody),
        ),
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      final failure = await captureSettlementFailure(() {
        return repository.listSettlementRequests();
      });

      expect(failure.kind, SettleoraSettlementFailureKind.conflict);
      expect(failure.statusCode, 409);
      expect(failure.message, isNot(contains('internal-detail')));
      expect(failure.toString(), isNot(contains('internal-detail')));
    });

    test('maps network errors to safe retry text', () async {
      final repository = GeneratedSettleoraSettlementRepository(
        client: FakeSettlementGeneratedClient(
          failure: const SocketException('internal socket detail'),
        ),
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      final failure = await captureSettlementFailure(() {
        return repository.listBalances();
      });

      expect(failure.kind, SettleoraSettlementFailureKind.network);
      expect(failure.message, isNot(contains('internal socket detail')));
    });
  });
}

Future<SettleoraSettlementFailure> captureSettlementFailure(
  Future<Object?> Function() operation,
) async {
  try {
    await operation();
  } on SettleoraSettlementFailure catch (failure) {
    return failure;
  }

  fail('Expected SettleoraSettlementFailure.');
}

class FakeAccessTokenProvider implements SettleoraAccessTokenProvider {
  FakeAccessTokenProvider(this._accessToken);

  final String? _accessToken;
  int calls = 0;

  @override
  Future<String?> accessToken() async {
    calls += 1;
    return _accessToken;
  }
}

class FakeSettlementGeneratedClient
    implements SettleoraSettlementGeneratedClient {
  FakeSettlementGeneratedClient({this.failure});

  final Object? failure;
  final accessTokens = <String>[];
  int balanceCalls = 0;
  int listRequestCalls = 0;
  int getRequestCalls = 0;
  int listPaymentCalls = 0;
  int paymentDetailsCalls = 0;
  int createPaymentCalls = 0;
  int cancelRequestCalls = 0;
  int disputeRequestCalls = 0;
  int confirmPaymentCalls = 0;
  int cancelPaymentCalls = 0;
  int disputePaymentCalls = 0;
  int confirmResidualCalls = 0;
  String? lastSettlementId;
  String? lastPaymentId;
  String? lastResidualId;
  String? lastUserProfileId;
  String? lastCreatePaymentAmount;
  String? lastCreatePaymentCurrency;
  String? lastCreatePaymentDate;

  @override
  Future<api.SettlementBalanceProjectionListResponse>
  listSettlementBalanceProjections({required String accessToken}) async {
    balanceCalls += 1;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return api.SettlementBalanceProjectionListResponse(
      generatedAtUtc: _generatedAtUtc,
      balances: [sampleApiBalance()],
    );
  }

  @override
  Future<api.SettlementRequestListResponse> listSettlementRequests({
    required String accessToken,
  }) async {
    listRequestCalls += 1;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return api.SettlementRequestListResponse(settlements: [sampleApiRequest()]);
  }

  @override
  Future<api.SettlementRequestResponse> getSettlementRequest(
    String settlementId, {
    required String accessToken,
  }) async {
    getRequestCalls += 1;
    lastSettlementId = settlementId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return sampleApiRequest();
  }

  @override
  Future<api.SettlementPaymentListResponse> listSettlementPayments(
    String settlementId, {
    required String accessToken,
  }) async {
    listPaymentCalls += 1;
    lastSettlementId = settlementId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return api.SettlementPaymentListResponse(payments: [sampleApiPayment()]);
  }

  @override
  Future<api.SettlementPaymentResponse> createSettlementPaymentClaim(
    String settlementId,
    api.CreateSettlementPaymentRequest body, {
    required String accessToken,
  }) async {
    createPaymentCalls += 1;
    lastSettlementId = settlementId;
    lastCreatePaymentAmount = body.amount;
    lastCreatePaymentCurrency = body.currency;
    lastCreatePaymentDate = body.paymentDate;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return sampleApiPayment(
      amount: body.amount,
      currency: body.currency,
      paymentDate: body.paymentDate,
    );
  }

  @override
  Future<api.SettlementCounterpartyPaymentDetailsResponse>
  getSettlementCounterpartyPaymentDetails(
    String settlementId,
    String userProfileId, {
    required String accessToken,
  }) async {
    paymentDetailsCalls += 1;
    lastSettlementId = settlementId;
    lastUserProfileId = userProfileId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return sampleApiPaymentDetails();
  }

  @override
  Future<api.SettlementRequestResponse> cancelSettlementRequest(
    String settlementId, {
    required String accessToken,
  }) async {
    cancelRequestCalls += 1;
    lastSettlementId = settlementId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return sampleApiRequest(
      status: api.SettlementRequestStatusValues.cancelled,
    );
  }

  @override
  Future<api.SettlementRequestResponse> disputeSettlementRequest(
    String settlementId, {
    required String accessToken,
  }) async {
    disputeRequestCalls += 1;
    lastSettlementId = settlementId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return sampleApiRequest(status: api.SettlementRequestStatusValues.disputed);
  }

  @override
  Future<api.SettlementPaymentResponse> confirmSettlementPayment(
    String paymentId, {
    required String accessToken,
  }) async {
    confirmPaymentCalls += 1;
    lastPaymentId = paymentId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return sampleApiPayment(
      status: api.SettlementPaymentStatusValues.confirmed,
    );
  }

  @override
  Future<api.SettlementPaymentResponse> cancelSettlementPayment(
    String paymentId, {
    required String accessToken,
  }) async {
    cancelPaymentCalls += 1;
    lastPaymentId = paymentId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return sampleApiPayment(
      status: api.SettlementPaymentStatusValues.cancelled,
    );
  }

  @override
  Future<api.SettlementPaymentResponse> disputeSettlementPayment(
    String paymentId, {
    required String accessToken,
  }) async {
    disputePaymentCalls += 1;
    lastPaymentId = paymentId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return sampleApiPayment(status: api.SettlementPaymentStatusValues.disputed);
  }

  @override
  Future<api.SettlementPaymentResponse> confirmSettlementPaymentResidual(
    String paymentId,
    String residualId, {
    required String accessToken,
  }) async {
    confirmResidualCalls += 1;
    lastPaymentId = paymentId;
    lastResidualId = residualId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return sampleApiPayment(
      residualStatus: api.SettlementResidualStatusValues.confirmed,
    );
  }

  void _throwIfNeeded() {
    final error = failure;
    if (error != null) {
      throw error;
    }
  }
}

api.SettlementBalanceProjectionResponse sampleApiBalance() {
  return const api.SettlementBalanceProjectionResponse(
    counterpartyUserProfileId: _creditorUserProfileId,
    groupId: null,
    direction: api.SettlementBalanceDirectionValues.outgoing,
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

api.SettlementRequestResponse sampleApiRequest({
  String status = api.SettlementRequestStatusValues.requested,
}) {
  return api.SettlementRequestResponse(
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
      api.SettlementRequestLineResponse(
        id: _lineId,
        sourceExpenseBillId: _billId,
        sourceBillRevisionId: null,
        sourceCandidateKey: 'candidate-key',
        exactAmount: '10.00',
        currency: 'USD',
        allocationOrder: 0,
        status: api.SettlementRequestLineStatusValues.open,
        createdAtUtc: _createdAtUtc,
        updatedAtUtc: _updatedAtUtc,
      ),
    ],
  );
}

api.SettlementPaymentResponse sampleApiPayment({
  String status = api.SettlementPaymentStatusValues.markedPaid,
  String amount = '2.50',
  String currency = 'USD',
  String paymentDate = '2026-05-17',
  String residualStatus =
      api.SettlementResidualStatusValues.pendingReceiverConfirmation,
}) {
  return api.SettlementPaymentResponse(
    paymentId: _paymentId,
    settlementRequestId: _settlementId,
    paidByUserProfileId: _debtorUserProfileId,
    receivedByUserProfileId: _creditorUserProfileId,
    amount: amount,
    currency: currency,
    status: status,
    paymentDate: paymentDate,
    claimedAtUtc: _claimedAtUtc,
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
    allocations: [
      api.SettlementPaymentAllocationResponse(
        id: _allocationId,
        settlementRequestLineId: _lineId,
        clearedAmount: amount,
        currency: currency,
        allocationOrder: 0,
        createdAtUtc: _createdAtUtc,
      ),
    ],
    residuals: [
      api.SettlementPaymentResidualResponse(
        id: _residualId,
        settlementPaymentId: _paymentId,
        settlementRequestId: _settlementId,
        direction: api.SettlementResidualDirectionValues.underpayment,
        amount: '7.50',
        currency: 'USD',
        policy: api.SettlementResidualPolicyValues.remainingBalance,
        status: residualStatus,
        createdAtUtc: _createdAtUtc,
      ),
    ],
    settlementRequestStatus: api.SettlementRequestStatusValues.partiallyPaid,
  );
}

api.SettlementCounterpartyPaymentDetailsResponse sampleApiPaymentDetails() {
  return api.SettlementCounterpartyPaymentDetailsResponse(
    userProfileId: _creditorUserProfileId,
    isConfigured: true,
    preferredMethodLabel: 'Bank transfer',
    paymentHandle: 'pay.example/receiver',
    paymentNote: null,
    visibilityApplied:
        api.PaymentDetailsVisibilityValues.settlementCounterpartiesOnly,
    qrFile: api.SettlementCounterpartyPaymentDetailsQrFileResponse(
      id: _qrFileId,
      contentType: 'image/png',
      sizeBytes: 128,
      updatedAtUtc: _updatedAtUtc,
    ),
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
const _qrFileId = '99999999-9999-9999-9999-999999999999';
const _hiddenBody = {'detail': 'internal-detail'};
final _generatedAtUtc = DateTime.utc(2026, 5, 17, 9);
final _requestedAtUtc = DateTime.utc(2026, 5, 17, 10);
final _claimedAtUtc = DateTime.utc(2026, 5, 17, 10, 30);
final _createdAtUtc = DateTime.utc(2026, 5, 17, 10);
final _updatedAtUtc = DateTime.utc(2026, 5, 17, 11);
