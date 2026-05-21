import 'dart:async';
import 'dart:io';

import 'package:settleora_api_client/settleora_api.dart' as api;

import '../api/settleora_api_client.dart';
import 'bill_revision_repository.dart';

abstract interface class SettleoraBillRevisionGeneratedClient {
  Future<api.BillRevisionListResponse> listBillRevisions(
    String billId, {
    required String accessToken,
  });

  Future<api.BillRevisionResponse> createBillRevision(
    String billId,
    api.CreateBillRevisionProposalRequest body, {
    required String accessToken,
  });

  Future<api.BillRevisionResponse> getBillRevision(
    String billId,
    String revisionId, {
    required String accessToken,
  });

  Future<api.BillRevisionResponse> reviseBillRevision(
    String billId,
    String revisionId,
    api.CreateBillRevisionProposalRequest body, {
    required String accessToken,
  });

  Future<api.BillRevisionResponse> submitBillRevision(
    String billId,
    String revisionId, {
    required String accessToken,
  });

  Future<api.BillRevisionResponse> withdrawBillRevision(
    String billId,
    String revisionId, {
    required String accessToken,
  });

  Future<api.BillRevisionResponse> approveBillRevision(
    String billId,
    String revisionId,
    api.ApproveBillRevisionRequest body, {
    required String accessToken,
  });

  Future<api.BillRevisionResponse> rejectBillRevision(
    String billId,
    String revisionId, {
    required String accessToken,
  });

  Future<api.BillRevisionResponse> confirmBillRevisionPayer(
    String billId,
    String revisionId,
    api.ConfirmBillRevisionPayerRequest body, {
    required String accessToken,
  });

  Future<api.BillRevisionResponse> applyBillRevision(
    String billId,
    String revisionId, {
    required String accessToken,
  });
}

class SettleoraBillRevisionApiGeneratedClient
    implements SettleoraBillRevisionGeneratedClient {
  const SettleoraBillRevisionApiGeneratedClient(this._client);

  final api.SettleoraApiClient _client;

  @override
  Future<api.BillRevisionListResponse> listBillRevisions(
    String billId, {
    required String accessToken,
  }) {
    return _client.listBillRevisions(billId, accessToken: accessToken);
  }

  @override
  Future<api.BillRevisionResponse> createBillRevision(
    String billId,
    api.CreateBillRevisionProposalRequest body, {
    required String accessToken,
  }) {
    return _client.createBillRevision(billId, body, accessToken: accessToken);
  }

  @override
  Future<api.BillRevisionResponse> getBillRevision(
    String billId,
    String revisionId, {
    required String accessToken,
  }) {
    return _client.getBillRevision(
      billId,
      revisionId,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.BillRevisionResponse> reviseBillRevision(
    String billId,
    String revisionId,
    api.CreateBillRevisionProposalRequest body, {
    required String accessToken,
  }) {
    return _client.reviseBillRevision(
      billId,
      revisionId,
      body,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.BillRevisionResponse> submitBillRevision(
    String billId,
    String revisionId, {
    required String accessToken,
  }) {
    return _client.submitBillRevision(
      billId,
      revisionId,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.BillRevisionResponse> withdrawBillRevision(
    String billId,
    String revisionId, {
    required String accessToken,
  }) {
    return _client.withdrawBillRevision(
      billId,
      revisionId,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.BillRevisionResponse> approveBillRevision(
    String billId,
    String revisionId,
    api.ApproveBillRevisionRequest body, {
    required String accessToken,
  }) {
    return _client.approveBillRevision(
      billId,
      revisionId,
      body,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.BillRevisionResponse> rejectBillRevision(
    String billId,
    String revisionId, {
    required String accessToken,
  }) {
    return _client.rejectBillRevision(
      billId,
      revisionId,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.BillRevisionResponse> confirmBillRevisionPayer(
    String billId,
    String revisionId,
    api.ConfirmBillRevisionPayerRequest body, {
    required String accessToken,
  }) {
    return _client.confirmBillRevisionPayer(
      billId,
      revisionId,
      body,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.BillRevisionResponse> applyBillRevision(
    String billId,
    String revisionId, {
    required String accessToken,
  }) {
    return _client.applyBillRevision(
      billId,
      revisionId,
      accessToken: accessToken,
    );
  }
}

class GeneratedSettleoraBillRevisionRepository
    implements SettleoraBillRevisionRepository {
  GeneratedSettleoraBillRevisionRepository({
    required SettleoraBillRevisionGeneratedClient client,
    required SettleoraAccessTokenProvider accessTokenProvider,
  }) : _client = client,
       _accessTokenProvider = accessTokenProvider;

  factory GeneratedSettleoraBillRevisionRepository.fromConfiguration({
    required SettleoraApiConfiguration configuration,
    required SettleoraAccessTokenProvider accessTokenProvider,
    SettleoraGeneratedApiClientFactory clientFactory =
        const SettleoraGeneratedApiClientFactory(),
  }) {
    return GeneratedSettleoraBillRevisionRepository(
      client: SettleoraBillRevisionApiGeneratedClient(
        clientFactory.create(configuration),
      ),
      accessTokenProvider: accessTokenProvider,
    );
  }

  final SettleoraBillRevisionGeneratedClient _client;
  final SettleoraAccessTokenProvider _accessTokenProvider;

  @override
  Future<List<SettleoraBillRevision>> listBillRevisions(String billId) {
    final trimmedBillId = _requiredId(
      billId,
      blankMessage: 'Choose a bill before loading revisions.',
    );

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.listBillRevisions(
          trimmedBillId,
          accessToken: accessToken,
        );
        return response.revisions.map(_mapRevision).toList(growable: false);
      } on SettleoraBillRevisionFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraBillRevision> createBillRevision(
    String billId,
    SettleoraBillRevisionProposalSnapshot proposal,
  ) {
    final trimmedBillId = _requiredId(
      billId,
      blankMessage: 'Choose a bill before creating a revision proposal.',
    );
    final body = _mapProposalRequest(proposal);

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.createBillRevision(
          trimmedBillId,
          body,
          accessToken: accessToken,
        );
        return _mapRevision(response);
      } on SettleoraBillRevisionFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraBillRevision> getBillRevision(
    String billId,
    String revisionId,
  ) {
    final trimmedBillId = _requiredId(
      billId,
      blankMessage: 'Choose a bill before opening a revision.',
    );
    final trimmedRevisionId = _requiredId(
      revisionId,
      blankMessage: 'Choose a revision before opening review.',
    );

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.getBillRevision(
          trimmedBillId,
          trimmedRevisionId,
          accessToken: accessToken,
        );
        return _mapRevision(response);
      } on SettleoraBillRevisionFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraBillRevision> reviseBillRevision(
    String billId,
    String revisionId,
    SettleoraBillRevisionProposalSnapshot proposal,
  ) {
    final trimmedBillId = _requiredId(
      billId,
      blankMessage: 'Choose a bill before revising a proposal.',
    );
    final trimmedRevisionId = _requiredId(
      revisionId,
      blankMessage: 'Choose a revision before revising it.',
    );
    final body = _mapProposalRequest(proposal);

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.reviseBillRevision(
          trimmedBillId,
          trimmedRevisionId,
          body,
          accessToken: accessToken,
        );
        return _mapRevision(response);
      } on SettleoraBillRevisionFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraBillRevision> submitBillRevision(
    String billId,
    String revisionId,
  ) {
    final trimmedBillId = _requiredId(
      billId,
      blankMessage: 'Choose a bill before submitting a revision.',
    );
    final trimmedRevisionId = _requiredId(
      revisionId,
      blankMessage: 'Choose a revision before submitting it.',
    );

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.submitBillRevision(
          trimmedBillId,
          trimmedRevisionId,
          accessToken: accessToken,
        );
        return _mapRevision(response);
      } on SettleoraBillRevisionFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraBillRevision> withdrawBillRevision(
    String billId,
    String revisionId,
  ) {
    final trimmedBillId = _requiredId(
      billId,
      blankMessage: 'Choose a bill before withdrawing a revision.',
    );
    final trimmedRevisionId = _requiredId(
      revisionId,
      blankMessage: 'Choose a revision before withdrawing it.',
    );

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.withdrawBillRevision(
          trimmedBillId,
          trimmedRevisionId,
          accessToken: accessToken,
        );
        return _mapRevision(response);
      } on SettleoraBillRevisionFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraBillRevision> approveBillRevision(
    SettleoraBillRevision revision,
  ) {
    final approvalBasis = revision.viewerApprovalBasis;
    if (!revision.canApprove || approvalBasis == null) {
      throw const SettleoraBillRevisionFailure(
        kind: SettleoraBillRevisionFailureKind.validation,
        message:
            'The server did not return a pending approval basis for this viewer. Refresh before trying again.',
      );
    }

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.approveBillRevision(
          revision.billId,
          revision.id,
          api.ApproveBillRevisionRequest(
            acceptedAmount: approvalBasis.acceptedAmount,
            currency: approvalBasis.currency,
            calculationHash: approvalBasis.calculationHash,
          ),
          accessToken: accessToken,
        );
        return _mapRevision(response);
      } on SettleoraBillRevisionFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraBillRevision> rejectBillRevision(
    String billId,
    String revisionId,
  ) {
    final trimmedBillId = _requiredId(
      billId,
      blankMessage: 'Choose a bill before rejecting a revision.',
    );
    final trimmedRevisionId = _requiredId(
      revisionId,
      blankMessage: 'Choose a revision before rejecting it.',
    );

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.rejectBillRevision(
          trimmedBillId,
          trimmedRevisionId,
          accessToken: accessToken,
        );
        return _mapRevision(response);
      } on SettleoraBillRevisionFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraBillRevision> confirmBillRevisionPayer(
    SettleoraBillRevision revision,
  ) {
    if (!revision.canConfirmPayer) {
      throw const SettleoraBillRevisionFailure(
        kind: SettleoraBillRevisionFailureKind.validation,
        message:
            'The server did not return a pending payer confirmation basis for this viewer. Refresh before trying again.',
      );
    }

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.confirmBillRevisionPayer(
          revision.billId,
          revision.id,
          api.ConfirmBillRevisionPayerRequest(
            calculationHash: revision.calculationHash,
          ),
          accessToken: accessToken,
        );
        return _mapRevision(response);
      } on SettleoraBillRevisionFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraBillRevision> applyBillRevision(
    String billId,
    String revisionId,
  ) {
    final trimmedBillId = _requiredId(
      billId,
      blankMessage: 'Choose a bill before applying a revision.',
    );
    final trimmedRevisionId = _requiredId(
      revisionId,
      blankMessage: 'Choose a revision before applying it.',
    );

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.applyBillRevision(
          trimmedBillId,
          trimmedRevisionId,
          accessToken: accessToken,
        );
        return _mapRevision(response);
      } on SettleoraBillRevisionFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  Future<T> _withAccessToken<T>(
    Future<T> Function(String accessToken) operation,
  ) async {
    final accessToken = await _readAccessToken();
    if (accessToken == null) {
      throw const SettleoraBillRevisionFailure(
        kind: SettleoraBillRevisionFailureKind.sessionRequired,
        message: 'Sign in before loading bill revisions.',
      );
    }

    return operation(accessToken);
  }

  Future<String?> _readAccessToken() async {
    try {
      final accessToken = await _accessTokenProvider.accessToken();
      final trimmed = accessToken?.trim();
      if (trimmed == null || trimmed.isEmpty) {
        return null;
      }

      return trimmed;
    } catch (_) {
      return null;
    }
  }
}

api.CreateBillRevisionProposalRequest _mapProposalRequest(
  SettleoraBillRevisionProposalSnapshot proposal,
) {
  if (proposal.participants.isEmpty) {
    throw const SettleoraBillRevisionFailure(
      kind: SettleoraBillRevisionFailureKind.validation,
      message: 'Add at least one participant share before saving a proposal.',
    );
  }
  if (proposal.payers.isEmpty) {
    throw const SettleoraBillRevisionFailure(
      kind: SettleoraBillRevisionFailureKind.validation,
      message: 'Add at least one payer contribution before saving a proposal.',
    );
  }

  return api.CreateBillRevisionProposalRequest(
    totalAmount: _requiredText(
      proposal.totalAmount,
      blankMessage: 'Enter a proposal total amount before saving.',
    ),
    totalCurrency: _requiredCurrency(
      proposal.totalCurrency,
      blankMessage: 'Choose a proposal total currency before saving.',
    ),
    participants: proposal.participants
        .map(_mapProposalParticipantRequest)
        .toList(growable: false),
    payers: proposal.payers
        .map(_mapProposalPayerRequest)
        .toList(growable: false),
  );
}

api.BillRevisionProposalParticipantRequest _mapProposalParticipantRequest(
  SettleoraBillRevisionProposalParticipantRow row,
) {
  return api.BillRevisionProposalParticipantRequest(
    userProfileId: _requiredId(
      row.userProfileId,
      blankMessage: 'Choose a participant before saving a proposal.',
    ),
    resolvedShareAmount: _requiredText(
      row.resolvedShareAmount,
      blankMessage: 'Enter each participant share before saving a proposal.',
    ),
    resolvedShareCurrency: _requiredCurrency(
      row.resolvedShareCurrency,
      blankMessage:
          'Choose each participant share currency before saving a proposal.',
    ),
  );
}

api.BillRevisionProposalPayerRequest _mapProposalPayerRequest(
  SettleoraBillRevisionProposalPayerRow row,
) {
  return api.BillRevisionProposalPayerRequest(
    userProfileId: _requiredId(
      row.userProfileId,
      blankMessage: 'Choose a payer before saving a proposal.',
    ),
    amount: _requiredText(
      row.amount,
      blankMessage: 'Enter each payer contribution before saving a proposal.',
    ),
    currency: _requiredCurrency(
      row.currency,
      blankMessage:
          'Choose each payer contribution currency before saving a proposal.',
    ),
  );
}

SettleoraBillRevision _mapRevision(api.BillRevisionResponse response) {
  final reviewContext = _mapReviewContext(response.reviewContext);
  final approvals = response.approvals
      .map(_mapApproval)
      .toList(growable: false);
  final viewerPendingApprovals = approvals
      .where(
        (approval) =>
            approval.participantUserProfileId ==
                reviewContext.viewerUserProfileId &&
            approval.status ==
                SettleoraBillRevisionApprovalStatusValues.pendingReview,
      )
      .toList(growable: false);
  final viewerApprovalBasis = viewerPendingApprovals.length == 1
      ? SettleoraBillRevisionApprovalBasis(
          acceptedAmount: viewerPendingApprovals.single.acceptedAmount,
          currency: viewerPendingApprovals.single.currency,
          calculationHash: response.calculationHash,
        )
      : null;

  return SettleoraBillRevision(
    id: response.id,
    billId: response.billId,
    groupId: response.groupId,
    status: response.status,
    totalAmount: response.totalAmount,
    totalCurrency: response.totalCurrency,
    calculationHash: response.calculationHash,
    submittedAtUtc: response.submittedAtUtc?.toUtc(),
    updatedAtUtc: response.updatedAtUtc.toUtc(),
    participants: response.participants
        .map(_mapParticipant)
        .toList(growable: false),
    payers: response.payers.map(_mapPayer).toList(growable: false),
    approvals: approvals,
    viewerActions: _mapViewerActions(response.viewerActions),
    reviewContext: reviewContext,
    viewerApprovalBasis: viewerApprovalBasis,
  );
}

SettleoraBillRevisionViewerActions _mapViewerActions(
  api.BillRevisionViewerActionsResponse response,
) {
  return SettleoraBillRevisionViewerActions(
    canSubmit: response.canSubmit,
    canWithdraw: response.canWithdraw,
    canRevise: response.canRevise,
    canApprove: response.canApprove,
    canReject: response.canReject,
    canConfirmPayer: response.canConfirmPayer,
    canApply: response.canApply,
  );
}

SettleoraBillRevisionParticipant _mapParticipant(
  api.BillRevisionParticipantResponse response,
) {
  return SettleoraBillRevisionParticipant(
    userProfileId: response.userProfileId,
    resolvedShareAmount: response.resolvedShareAmount,
    resolvedShareCurrency: response.resolvedShareCurrency,
    affectedByRevision: response.affectedByRevision,
  );
}

SettleoraBillRevisionPayer _mapPayer(api.BillRevisionPayerResponse response) {
  return SettleoraBillRevisionPayer(
    userProfileId: response.userProfileId,
    amount: response.amount,
    currency: response.currency,
    requiresPayerConfirmation: response.requiresPayerConfirmation,
    payerConfirmationStatus: response.payerConfirmationStatus,
  );
}

SettleoraBillRevisionApproval _mapApproval(
  api.BillRevisionApprovalResponse response,
) {
  return SettleoraBillRevisionApproval(
    participantUserProfileId: response.participantUserProfileId,
    acceptedAmount: response.acceptedAmount,
    currency: response.currency,
    status: response.status,
    approvedAtUtc: response.approvedAtUtc?.toUtc(),
    rejectedAtUtc: response.rejectedAtUtc?.toUtc(),
    invalidatedAtUtc: response.invalidatedAtUtc?.toUtc(),
  );
}

SettleoraBillRevisionReviewContext _mapReviewContext(
  api.BillRevisionReviewContextResponse response,
) {
  return SettleoraBillRevisionReviewContext(
    viewerUserProfileId: response.viewerUserProfileId,
    baseline: _mapBaseline(response.baseline),
    defaultViewMode: response.defaultViewMode,
    fullViewRecommendedReason: response.fullViewRecommendedReason,
    viewerFinancialImpact: _mapViewerFinancialImpact(
      response.viewerFinancialImpact,
    ),
    changeSummary: response.changeSummary
        .map(_mapChangeCategorySummary)
        .toList(growable: false),
    changes: response.changes.map(_mapChange).toList(growable: false),
    limitations: response.limitations,
  );
}

SettleoraBillRevisionReviewBaseline _mapBaseline(
  api.BillRevisionReviewBaselineResponse response,
) {
  return SettleoraBillRevisionReviewBaseline(
    baselineType: response.baselineType,
    baselineBillRevisionId: response.baselineBillRevisionId,
    baselineRevisionStatus: response.baselineRevisionStatus,
    baselineReviewedAtUtc: response.baselineReviewedAtUtc?.toUtc(),
    derivationReason: response.derivationReason,
  );
}

SettleoraBillRevisionViewerFinancialImpact _mapViewerFinancialImpact(
  api.BillRevisionViewerFinancialImpactResponse response,
) {
  return SettleoraBillRevisionViewerFinancialImpact(
    previousShare: _mapMoneyValue(response.previousShare),
    proposedShare: _mapMoneyValue(response.proposedShare),
    deltaShare: _mapMoneyValue(response.deltaShare),
    affectedByRevision: response.affectedByRevision,
    isPayer: response.isPayer,
    payerImpact: _mapPayerImpact(response.payerImpact),
  );
}

SettleoraBillRevisionPayerFinancialImpact? _mapPayerImpact(
  api.BillRevisionPayerFinancialImpactResponse? response,
) {
  if (response == null) {
    return null;
  }

  return SettleoraBillRevisionPayerFinancialImpact(
    previousContribution: _mapMoneyValue(response.previousContribution),
    proposedContribution: _mapMoneyValue(response.proposedContribution),
    deltaContribution: _mapMoneyValue(response.deltaContribution),
    requiresPayerConfirmation: response.requiresPayerConfirmation,
    payerConfirmationStatus: response.payerConfirmationStatus,
  );
}

SettleoraBillRevisionMoneyValue? _mapMoneyValue(
  api.BillRevisionMoneyValueResponse? response,
) {
  if (response == null) {
    return null;
  }

  return SettleoraBillRevisionMoneyValue(
    amount: response.amount,
    currency: response.currency,
  );
}

SettleoraBillRevisionChangeCategorySummary _mapChangeCategorySummary(
  api.BillRevisionChangeCategorySummaryResponse response,
) {
  return SettleoraBillRevisionChangeCategorySummary(
    category: response.category,
    supportStatus: response.supportStatus,
    changeCount: response.changeCount,
    viewerImpact: response.viewerImpact,
  );
}

SettleoraBillRevisionChange _mapChange(
  api.BillRevisionChangeResponse response,
) {
  return SettleoraBillRevisionChange(
    changeId: response.changeId,
    changeType: response.changeType,
    changeScope: response.changeScope,
    fieldPath: response.fieldPath,
    relatedUserProfileId: response.relatedUserProfileId,
    before: _mapDisplayValue(response.before),
    after: _mapDisplayValue(response.after),
    viewerImpact: response.viewerImpact,
    accessibleLabel: response.accessibleLabel,
    reason: response.reason,
  );
}

SettleoraBillRevisionDisplayValue? _mapDisplayValue(
  api.BillRevisionDisplayValueResponse? response,
) {
  if (response == null) {
    return null;
  }

  return SettleoraBillRevisionDisplayValue(
    displayValue: response.displayValue,
    amount: response.amount,
    currency: response.currency,
  );
}

SettleoraBillRevisionFailure _mapFailure(Object error) {
  if (error is api.SettleoraApiException) {
    return switch (error.statusCode) {
      400 || 422 => SettleoraBillRevisionFailure(
        kind: SettleoraBillRevisionFailureKind.validation,
        message:
            'The revision request is no longer valid. Refresh and try again.',
        statusCode: error.statusCode,
      ),
      401 => const SettleoraBillRevisionFailure(
        kind: SettleoraBillRevisionFailureKind.sessionExpired,
        message:
            'Your session has expired. Sign in again before reviewing revisions.',
        statusCode: 401,
      ),
      403 => const SettleoraBillRevisionFailure(
        kind: SettleoraBillRevisionFailureKind.denied,
        message: 'This revision is not available to this account.',
        statusCode: 403,
      ),
      404 || 410 => SettleoraBillRevisionFailure(
        kind: SettleoraBillRevisionFailureKind.unavailable,
        message: 'The bill revision is no longer available.',
        statusCode: error.statusCode,
      ),
      409 => const SettleoraBillRevisionFailure(
        kind: SettleoraBillRevisionFailureKind.conflict,
        message:
            'The revision changed before this action completed. Refresh before trying again.',
        statusCode: 409,
      ),
      >= 500 => SettleoraBillRevisionFailure(
        kind: SettleoraBillRevisionFailureKind.server,
        message: 'Bill revisions are unavailable right now. Try again later.',
        statusCode: error.statusCode,
      ),
      _ => SettleoraBillRevisionFailure(
        kind: SettleoraBillRevisionFailureKind.server,
        message: 'Bill revisions are unavailable right now. Try again later.',
        statusCode: error.statusCode,
      ),
    };
  }

  if (error is SocketException ||
      error is HttpException ||
      error is HandshakeException ||
      error is TimeoutException ||
      error is IOException) {
    return const SettleoraBillRevisionFailure(
      kind: SettleoraBillRevisionFailureKind.network,
      message:
          'The server is unavailable. Try again when the connection is back.',
    );
  }

  return const SettleoraBillRevisionFailure(
    kind: SettleoraBillRevisionFailureKind.server,
    message: 'Bill revisions are unavailable right now. Try again later.',
  );
}

String _requiredId(String value, {required String blankMessage}) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    throw SettleoraBillRevisionFailure(
      kind: SettleoraBillRevisionFailureKind.validation,
      message: blankMessage,
    );
  }

  return trimmed;
}

String _requiredText(String value, {required String blankMessage}) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    throw SettleoraBillRevisionFailure(
      kind: SettleoraBillRevisionFailureKind.validation,
      message: blankMessage,
    );
  }

  return trimmed;
}

String _requiredCurrency(String value, {required String blankMessage}) {
  return _requiredText(value, blankMessage: blankMessage).toUpperCase();
}
