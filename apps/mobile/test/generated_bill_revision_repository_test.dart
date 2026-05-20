import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/settleora_api_client.dart';
import 'package:mobile/bills/bill_revision_repository.dart';
import 'package:mobile/bills/generated_bill_revision_repository.dart';
import 'package:settleora_api_client/settleora_api.dart' as api;

void main() {
  group('GeneratedSettleoraBillRevisionRepository', () {
    test('requires a session before calling the generated client', () async {
      final client = FakeBillRevisionGeneratedClient();
      final repository = GeneratedSettleoraBillRevisionRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider(null),
      );

      final failure = await captureRevisionFailure(() {
        return repository.listBillRevisions(_billId);
      });

      expect(failure.kind, SettleoraBillRevisionFailureKind.sessionRequired);
      expect(client.listCalls, 0);
    });

    test('maps generated revision review context safely', () async {
      final client = FakeBillRevisionGeneratedClient(
        revisions: [sampleApiRevision()],
      );
      final repository = GeneratedSettleoraBillRevisionRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider('  redacted  '),
      );

      final revisions = await repository.listBillRevisions('  $_billId  ');
      final revision = await repository.getBillRevision(
        '  $_billId  ',
        '  $_revisionId  ',
      );

      expect(revisions.single.id, _revisionId);
      expect(revision.reviewContext.defaultViewMode, 'changed_only');
      expect(revision.reviewContext.changes.single.accessibleLabel, 'Changed');
      expect(revision.viewerActions.canApprove, isTrue);
      expect(revision.viewerActions.canReject, isTrue);
      expect(revision.viewerActions.canConfirmPayer, isTrue);
      expect(revision.viewerApprovalBasis?.acceptedAmount, '12.00');
      expect(revision.viewerApprovalBasis?.currency, 'USD');
      expect(revision.viewerApprovalBasis?.calculationHash, _hash);
      expect(client.accessTokens, ['redacted', 'redacted']);
      expect(client.lastBillId, _billId);
      expect(client.lastRevisionId, _revisionId);
    });

    test('approves with server-provided exact approval basis only', () async {
      final client = FakeBillRevisionGeneratedClient();
      final repository = GeneratedSettleoraBillRevisionRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );
      final revision = await repository.getBillRevision(_billId, _revisionId);

      await repository.approveBillRevision(revision);

      expect(client.approveCalls, 1);
      expect(client.lastApprovalBody?.acceptedAmount, '12.00');
      expect(client.lastApprovalBody?.currency, 'USD');
      expect(client.lastApprovalBody?.calculationHash, _hash);
    });

    test('confirms payer with server-provided calculation hash only', () async {
      final client = FakeBillRevisionGeneratedClient();
      final repository = GeneratedSettleoraBillRevisionRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );
      final revision = await repository.getBillRevision(_billId, _revisionId);

      await repository.confirmBillRevisionPayer(revision);

      expect(client.confirmPayerCalls, 1);
      expect(client.lastPayerConfirmationBody?.calculationHash, _hash);
    });

    test('calls generated no-body lifecycle mutation methods', () async {
      final client = FakeBillRevisionGeneratedClient();
      final repository = GeneratedSettleoraBillRevisionRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      final submitted = await repository.submitBillRevision(
        '  $_billId  ',
        '  $_revisionId  ',
      );
      final withdrawn = await repository.withdrawBillRevision(
        '  $_billId  ',
        '  $_revisionId  ',
      );
      final applied = await repository.applyBillRevision(
        '  $_billId  ',
        '  $_revisionId  ',
      );

      expect(client.submitCalls, 1);
      expect(client.withdrawCalls, 1);
      expect(client.applyCalls, 1);
      expect(client.lastBillId, _billId);
      expect(client.lastRevisionId, _revisionId);
      expect(
        submitted.status,
        api.ExpenseBillRevisionStatusValues.submittedForReview,
      );
      expect(
        withdrawn.status,
        api.ExpenseBillRevisionStatusValues.withdrawnByProposer,
      );
      expect(
        applied.status,
        api.ExpenseBillRevisionStatusValues.acceptedApplied,
      );
    });

    test(
      'does not fabricate payer confirmation without pending viewer basis',
      () async {
        final client = FakeBillRevisionGeneratedClient(
          detail: sampleApiRevision(
            payerConfirmationStatus:
                api.ExpenseBillPayerConfirmationStatusValues.confirmed,
          ),
        );
        final repository = GeneratedSettleoraBillRevisionRepository(
          client: client,
          accessTokenProvider: FakeAccessTokenProvider('redacted'),
        );
        final revision = await repository.getBillRevision(_billId, _revisionId);

        final failure = await captureRevisionFailure(() {
          return repository.confirmBillRevisionPayer(revision);
        });

        expect(failure.kind, SettleoraBillRevisionFailureKind.validation);
        expect(client.confirmPayerCalls, 0);
      },
    );

    test(
      'does not fabricate payer confirmation when server capability is false',
      () async {
        final client = FakeBillRevisionGeneratedClient(
          detail: sampleApiRevision(
            viewerActions: sampleApiViewerActions(canConfirmPayer: false),
          ),
        );
        final repository = GeneratedSettleoraBillRevisionRepository(
          client: client,
          accessTokenProvider: FakeAccessTokenProvider('redacted'),
        );
        final revision = await repository.getBillRevision(_billId, _revisionId);

        final failure = await captureRevisionFailure(() {
          return repository.confirmBillRevisionPayer(revision);
        });

        expect(failure.kind, SettleoraBillRevisionFailureKind.validation);
        expect(client.confirmPayerCalls, 0);
      },
    );

    test(
      'does not fabricate an approval body without a pending viewer basis',
      () async {
        final repository = GeneratedSettleoraBillRevisionRepository(
          client: FakeBillRevisionGeneratedClient(),
          accessTokenProvider: FakeAccessTokenProvider('redacted'),
        );
        final revision = await repository.getBillRevision(_billId, _revisionId);
        final unavailable = SettleoraBillRevision(
          id: revision.id,
          billId: revision.billId,
          groupId: revision.groupId,
          status: revision.status,
          totalAmount: revision.totalAmount,
          totalCurrency: revision.totalCurrency,
          calculationHash: revision.calculationHash,
          submittedAtUtc: revision.submittedAtUtc,
          updatedAtUtc: revision.updatedAtUtc,
          participants: revision.participants,
          payers: revision.payers,
          approvals: const [],
          viewerActions: revision.viewerActions,
          reviewContext: revision.reviewContext,
          viewerApprovalBasis: null,
        );

        final failure = await captureRevisionFailure(() {
          return repository.approveBillRevision(unavailable);
        });

        expect(failure.kind, SettleoraBillRevisionFailureKind.validation);
      },
    );

    test('does not approve when server capability is false', () async {
      final client = FakeBillRevisionGeneratedClient(
        detail: sampleApiRevision(
          viewerActions: sampleApiViewerActions(canApprove: false),
        ),
      );
      final repository = GeneratedSettleoraBillRevisionRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );
      final revision = await repository.getBillRevision(_billId, _revisionId);

      final failure = await captureRevisionFailure(() {
        return repository.approveBillRevision(revision);
      });

      expect(failure.kind, SettleoraBillRevisionFailureKind.validation);
      expect(client.approveCalls, 0);
    });

    test('maps generated failures to bounded revision failures', () async {
      final cases = <int, SettleoraBillRevisionFailureKind>{
        400: SettleoraBillRevisionFailureKind.validation,
        401: SettleoraBillRevisionFailureKind.sessionExpired,
        403: SettleoraBillRevisionFailureKind.denied,
        404: SettleoraBillRevisionFailureKind.unavailable,
        409: SettleoraBillRevisionFailureKind.conflict,
        500: SettleoraBillRevisionFailureKind.server,
      };

      for (final entry in cases.entries) {
        final repository = GeneratedSettleoraBillRevisionRepository(
          client: FakeBillRevisionGeneratedClient(
            failure: api.SettleoraApiException(
              entry.key,
              'Failure',
              _hiddenBody,
            ),
          ),
          accessTokenProvider: FakeAccessTokenProvider('redacted'),
        );

        final failure = await captureRevisionFailure(() {
          return repository.getBillRevision(_billId, _revisionId);
        });

        expect(failure.kind, entry.value);
        expect(failure.message, isNot(contains('internal-detail')));
        expect(failure.toString(), isNot(contains('internal-detail')));
      }
    });

    test('maps network failures to safe retry text', () async {
      final repository = GeneratedSettleoraBillRevisionRepository(
        client: FakeBillRevisionGeneratedClient(
          failure: const SocketException('internal socket detail'),
        ),
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      final failure = await captureRevisionFailure(() {
        return repository.getBillRevision(_billId, _revisionId);
      });

      expect(failure.kind, SettleoraBillRevisionFailureKind.network);
      expect(failure.message, isNot(contains('internal socket detail')));
    });
  });
}

Future<SettleoraBillRevisionFailure> captureRevisionFailure(
  Future<Object?> Function() operation,
) async {
  try {
    await operation();
  } on SettleoraBillRevisionFailure catch (failure) {
    return failure;
  }

  fail('Expected SettleoraBillRevisionFailure.');
}

class FakeAccessTokenProvider implements SettleoraAccessTokenProvider {
  FakeAccessTokenProvider(this._accessToken);

  final String? _accessToken;

  @override
  Future<String?> accessToken() async => _accessToken;
}

class FakeBillRevisionGeneratedClient
    implements SettleoraBillRevisionGeneratedClient {
  FakeBillRevisionGeneratedClient({
    this.failure,
    List<api.BillRevisionResponse>? revisions,
    api.BillRevisionResponse? detail,
    api.BillRevisionResponse? approveResponse,
    api.BillRevisionResponse? rejectResponse,
    api.BillRevisionResponse? confirmPayerResponse,
    api.BillRevisionResponse? submitResponse,
    api.BillRevisionResponse? withdrawResponse,
    api.BillRevisionResponse? applyResponse,
  }) : revisions = revisions ?? [sampleApiRevision()],
       detail = detail ?? sampleApiRevision(),
       submitResponse = submitResponse ?? sampleApiRevision(),
       withdrawResponse =
           withdrawResponse ??
           sampleApiRevision(
             status: api.ExpenseBillRevisionStatusValues.withdrawnByProposer,
           ),
       approveResponse =
           approveResponse ??
           sampleApiRevision(
             approvals: [
               api.BillRevisionApprovalResponse(
                 participantUserProfileId: _profileId,
                 acceptedAmount: '12.00',
                 currency: 'USD',
                 status: api.ExpenseBillRevisionApprovalStatusValues.approved,
                 approvedAtUtc: _updatedAtUtc,
                 rejectedAtUtc: null,
                 invalidatedAtUtc: null,
               ),
             ],
           ),
       rejectResponse =
           rejectResponse ??
           sampleApiRevision(
             status: api.ExpenseBillRevisionStatusValues.rejected,
             rejectedAtUtc: _updatedAtUtc,
           ),
       confirmPayerResponse =
           confirmPayerResponse ??
           sampleApiRevision(
             payerConfirmationStatus:
                 api.ExpenseBillPayerConfirmationStatusValues.confirmed,
           ),
       applyResponse =
           applyResponse ??
           sampleApiRevision(
             status: api.ExpenseBillRevisionStatusValues.acceptedApplied,
           );

  final Object? failure;
  final List<api.BillRevisionResponse> revisions;
  final api.BillRevisionResponse detail;
  final api.BillRevisionResponse submitResponse;
  final api.BillRevisionResponse withdrawResponse;
  final api.BillRevisionResponse approveResponse;
  final api.BillRevisionResponse rejectResponse;
  final api.BillRevisionResponse confirmPayerResponse;
  final api.BillRevisionResponse applyResponse;
  final accessTokens = <String>[];
  int listCalls = 0;
  int getCalls = 0;
  int submitCalls = 0;
  int withdrawCalls = 0;
  int approveCalls = 0;
  int rejectCalls = 0;
  int confirmPayerCalls = 0;
  int applyCalls = 0;
  String? lastBillId;
  String? lastRevisionId;
  api.ApproveBillRevisionRequest? lastApprovalBody;
  api.ConfirmBillRevisionPayerRequest? lastPayerConfirmationBody;

  @override
  Future<api.BillRevisionListResponse> listBillRevisions(
    String billId, {
    required String accessToken,
  }) async {
    listCalls += 1;
    lastBillId = billId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return api.BillRevisionListResponse(revisions: revisions);
  }

  @override
  Future<api.BillRevisionResponse> getBillRevision(
    String billId,
    String revisionId, {
    required String accessToken,
  }) async {
    getCalls += 1;
    lastBillId = billId;
    lastRevisionId = revisionId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return detail;
  }

  @override
  Future<api.BillRevisionResponse> submitBillRevision(
    String billId,
    String revisionId, {
    required String accessToken,
  }) async {
    submitCalls += 1;
    lastBillId = billId;
    lastRevisionId = revisionId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return submitResponse;
  }

  @override
  Future<api.BillRevisionResponse> withdrawBillRevision(
    String billId,
    String revisionId, {
    required String accessToken,
  }) async {
    withdrawCalls += 1;
    lastBillId = billId;
    lastRevisionId = revisionId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return withdrawResponse;
  }

  @override
  Future<api.BillRevisionResponse> approveBillRevision(
    String billId,
    String revisionId,
    api.ApproveBillRevisionRequest body, {
    required String accessToken,
  }) async {
    approveCalls += 1;
    lastBillId = billId;
    lastRevisionId = revisionId;
    lastApprovalBody = body;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return approveResponse;
  }

  @override
  Future<api.BillRevisionResponse> rejectBillRevision(
    String billId,
    String revisionId, {
    required String accessToken,
  }) async {
    rejectCalls += 1;
    lastBillId = billId;
    lastRevisionId = revisionId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return rejectResponse;
  }

  @override
  Future<api.BillRevisionResponse> confirmBillRevisionPayer(
    String billId,
    String revisionId,
    api.ConfirmBillRevisionPayerRequest body, {
    required String accessToken,
  }) async {
    confirmPayerCalls += 1;
    lastBillId = billId;
    lastRevisionId = revisionId;
    lastPayerConfirmationBody = body;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return confirmPayerResponse;
  }

  @override
  Future<api.BillRevisionResponse> applyBillRevision(
    String billId,
    String revisionId, {
    required String accessToken,
  }) async {
    applyCalls += 1;
    lastBillId = billId;
    lastRevisionId = revisionId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return applyResponse;
  }

  void _throwIfNeeded() {
    final error = failure;
    if (error != null) {
      throw error;
    }
  }
}

api.BillRevisionResponse sampleApiRevision({
  String status = api.ExpenseBillRevisionStatusValues.submittedForReview,
  DateTime? rejectedAtUtc,
  List<api.BillRevisionApprovalResponse>? approvals,
  String payerConfirmationStatus =
      api.ExpenseBillPayerConfirmationStatusValues.pendingConfirmation,
  api.BillRevisionViewerActionsResponse? viewerActions,
}) {
  return api.BillRevisionResponse(
    id: _revisionId,
    billId: _billId,
    groupId: null,
    proposalCreatorUserProfileId: _profileId,
    supersedesExpenseBillRevisionId: null,
    supersededByExpenseBillRevisionId: null,
    status: status,
    totalAmount: '12.00',
    totalCurrency: 'USD',
    calculationHash: _hash,
    submittedAtUtc: _createdAtUtc,
    withdrawnAtUtc: null,
    supersededAtUtc: null,
    rejectedAtUtc: rejectedAtUtc,
    appliedAtUtc: null,
    cancelledAtUtc: null,
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
    participants: const [
      api.BillRevisionParticipantResponse(
        userProfileId: _profileId,
        resolvedShareAmount: '12.00',
        resolvedShareCurrency: 'USD',
        affectedByRevision: true,
      ),
    ],
    payers: [
      api.BillRevisionPayerResponse(
        userProfileId: _profileId,
        amount: '12.00',
        currency: 'USD',
        requiresPayerConfirmation: true,
        payerConfirmationStatus: payerConfirmationStatus,
      ),
    ],
    approvals:
        approvals ??
        const [
          api.BillRevisionApprovalResponse(
            participantUserProfileId: _profileId,
            acceptedAmount: '12.00',
            currency: 'USD',
            status: api.ExpenseBillRevisionApprovalStatusValues.pendingReview,
            approvedAtUtc: null,
            rejectedAtUtc: null,
            invalidatedAtUtc: null,
          ),
        ],
    reviewContext: sampleReviewContext(
      payerConfirmationStatus: payerConfirmationStatus,
    ),
    viewerActions:
        viewerActions ??
        sampleApiViewerActions(
          canWithdraw:
              status == api.ExpenseBillRevisionStatusValues.submittedForReview,
          canRevise:
              status == api.ExpenseBillRevisionStatusValues.submittedForReview,
          canApprove:
              status == api.ExpenseBillRevisionStatusValues.submittedForReview,
          canReject:
              status == api.ExpenseBillRevisionStatusValues.submittedForReview,
          canConfirmPayer:
              status ==
                  api.ExpenseBillRevisionStatusValues.submittedForReview &&
              payerConfirmationStatus ==
                  api
                      .ExpenseBillPayerConfirmationStatusValues
                      .pendingConfirmation,
        ),
  );
}

api.BillRevisionViewerActionsResponse sampleApiViewerActions({
  bool canSubmit = false,
  bool canWithdraw = true,
  bool canRevise = true,
  bool canApprove = true,
  bool canReject = true,
  bool canConfirmPayer = true,
  bool canApply = false,
}) {
  return api.BillRevisionViewerActionsResponse(
    canSubmit: canSubmit,
    canWithdraw: canWithdraw,
    canRevise: canRevise,
    canApprove: canApprove,
    canReject: canReject,
    canConfirmPayer: canConfirmPayer,
    canApply: canApply,
  );
}

api.BillRevisionReviewContextResponse sampleReviewContext({
  String payerConfirmationStatus =
      api.ExpenseBillPayerConfirmationStatusValues.pendingConfirmation,
}) {
  return api.BillRevisionReviewContextResponse(
    viewerUserProfileId: _profileId,
    baseline: api.BillRevisionReviewBaselineResponse(
      baselineType: api.BillRevisionReviewBaselineTypeValues.activeAcceptedBill,
      baselineBillRevisionId: '11111111-1111-1111-1111-111111111111',
      baselineRevisionStatus:
          api.ExpenseBillRevisionStatusValues.acceptedApplied,
      baselineReviewedAtUtc: null,
      derivationReason: 'Server selected the active accepted bill baseline.',
    ),
    defaultViewMode: api.BillRevisionReviewViewModeValues.changedOnly,
    fullViewRecommendedReason: api
        .BillRevisionReviewRecommendationReasonValues
        .baselineAvailableFullViewOptional,
    viewerFinancialImpact: api.BillRevisionViewerFinancialImpactResponse(
      previousShare: api.BillRevisionMoneyValueResponse(
        amount: '10.00',
        currency: 'USD',
      ),
      proposedShare: api.BillRevisionMoneyValueResponse(
        amount: '12.00',
        currency: 'USD',
      ),
      deltaShare: api.BillRevisionMoneyValueResponse(
        amount: '2.00',
        currency: 'USD',
      ),
      affectedByRevision: true,
      isPayer: true,
      payerImpact: api.BillRevisionPayerFinancialImpactResponse(
        previousContribution: api.BillRevisionMoneyValueResponse(
          amount: '10.00',
          currency: 'USD',
        ),
        proposedContribution: api.BillRevisionMoneyValueResponse(
          amount: '12.00',
          currency: 'USD',
        ),
        deltaContribution: api.BillRevisionMoneyValueResponse(
          amount: '2.00',
          currency: 'USD',
        ),
        requiresPayerConfirmation: true,
        payerConfirmationStatus: payerConfirmationStatus,
      ),
    ),
    changeSummary: [
      api.BillRevisionChangeCategorySummaryResponse(
        category: api.BillRevisionReviewChangeCategoryValues.billTotal,
        supportStatus: api.BillRevisionReviewSupportStatusValues.supported,
        changeCount: 1,
        viewerImpact:
            api.BillRevisionReviewSummaryViewerImpactValues.viewerAffected,
      ),
    ],
    changes: [
      api.BillRevisionChangeResponse(
        changeId: 'change-1',
        changeType: api.BillRevisionReviewChangeTypeValues.billTotalChanged,
        changeScope: api.BillRevisionReviewChangeScopeValues.billTotal,
        fieldPath: 'total',
        relatedUserProfileId: null,
        before: api.BillRevisionDisplayValueResponse(
          displayValue: '10.00 USD',
          amount: '10.00',
          currency: 'USD',
        ),
        after: api.BillRevisionDisplayValueResponse(
          displayValue: '12.00 USD',
          amount: '12.00',
          currency: 'USD',
        ),
        viewerImpact: api
            .BillRevisionReviewChangeViewerImpactValues
            .directViewerMoneyImpact,
        accessibleLabel: 'Changed',
        reason: 'Bill total changed.',
      ),
    ],
    limitations: ['last_view_without_approval_or_rejection_not_persisted'],
  );
}

const _billId = '22222222-2222-2222-2222-222222222222';
const _revisionId = '33333333-3333-3333-3333-333333333333';
const _profileId = '44444444-4444-4444-4444-444444444444';
const _hash =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const _hiddenBody = {'detail': 'internal-detail'};
final _createdAtUtc = DateTime.utc(2026, 5, 18, 10);
final _updatedAtUtc = DateTime.utc(2026, 5, 18, 11);
