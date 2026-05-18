import 'dart:async';
import 'dart:io';

import 'package:settleora_api_client/settleora_api.dart' as api;

import '../api/settleora_api_client.dart';
import 'settlement_repository.dart';

abstract interface class SettleoraSettlementGeneratedClient {
  Future<api.SettlementBalanceProjectionListResponse>
  listSettlementBalanceProjections({required String accessToken});

  Future<api.SettlementRequestListResponse> listSettlementRequests({
    required String accessToken,
  });

  Future<api.SettlementRequestResponse> getSettlementRequest(
    String settlementId, {
    required String accessToken,
  });

  Future<api.SettlementPaymentListResponse> listSettlementPayments(
    String settlementId, {
    required String accessToken,
  });

  Future<api.SettlementCounterpartyPaymentDetailsResponse>
  getSettlementCounterpartyPaymentDetails(
    String settlementId,
    String userProfileId, {
    required String accessToken,
  });

  Future<api.SettlementRequestResponse> cancelSettlementRequest(
    String settlementId, {
    required String accessToken,
  });

  Future<api.SettlementRequestResponse> disputeSettlementRequest(
    String settlementId, {
    required String accessToken,
  });

  Future<api.SettlementPaymentResponse> confirmSettlementPayment(
    String paymentId, {
    required String accessToken,
  });

  Future<api.SettlementPaymentResponse> cancelSettlementPayment(
    String paymentId, {
    required String accessToken,
  });

  Future<api.SettlementPaymentResponse> disputeSettlementPayment(
    String paymentId, {
    required String accessToken,
  });

  Future<api.SettlementPaymentResponse> confirmSettlementPaymentResidual(
    String paymentId,
    String residualId, {
    required String accessToken,
  });
}

class SettleoraGeneratedSettlementClient
    implements SettleoraSettlementGeneratedClient {
  const SettleoraGeneratedSettlementClient(this._client);

  final api.SettleoraApiClient _client;

  @override
  Future<api.SettlementBalanceProjectionListResponse>
  listSettlementBalanceProjections({required String accessToken}) {
    return _client.listSettlementBalanceProjections(accessToken: accessToken);
  }

  @override
  Future<api.SettlementRequestListResponse> listSettlementRequests({
    required String accessToken,
  }) {
    return _client.listSettlementRequests(accessToken: accessToken);
  }

  @override
  Future<api.SettlementRequestResponse> getSettlementRequest(
    String settlementId, {
    required String accessToken,
  }) {
    return _client.getSettlementRequest(settlementId, accessToken: accessToken);
  }

  @override
  Future<api.SettlementPaymentListResponse> listSettlementPayments(
    String settlementId, {
    required String accessToken,
  }) {
    return _client.listSettlementPayments(
      settlementId,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.SettlementCounterpartyPaymentDetailsResponse>
  getSettlementCounterpartyPaymentDetails(
    String settlementId,
    String userProfileId, {
    required String accessToken,
  }) {
    return _client.getSettlementCounterpartyPaymentDetails(
      settlementId,
      userProfileId,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.SettlementRequestResponse> cancelSettlementRequest(
    String settlementId, {
    required String accessToken,
  }) {
    return _client.cancelSettlementRequest(
      settlementId,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.SettlementRequestResponse> disputeSettlementRequest(
    String settlementId, {
    required String accessToken,
  }) {
    return _client.disputeSettlementRequest(
      settlementId,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.SettlementPaymentResponse> confirmSettlementPayment(
    String paymentId, {
    required String accessToken,
  }) {
    return _client.confirmSettlementPayment(
      paymentId,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.SettlementPaymentResponse> cancelSettlementPayment(
    String paymentId, {
    required String accessToken,
  }) {
    return _client.cancelSettlementPayment(paymentId, accessToken: accessToken);
  }

  @override
  Future<api.SettlementPaymentResponse> disputeSettlementPayment(
    String paymentId, {
    required String accessToken,
  }) {
    return _client.disputeSettlementPayment(
      paymentId,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.SettlementPaymentResponse> confirmSettlementPaymentResidual(
    String paymentId,
    String residualId, {
    required String accessToken,
  }) {
    return _client.confirmSettlementPaymentResidual(
      paymentId,
      residualId,
      accessToken: accessToken,
    );
  }
}

class GeneratedSettleoraSettlementRepository
    implements SettleoraSettlementRepository {
  GeneratedSettleoraSettlementRepository({
    required SettleoraSettlementGeneratedClient client,
    required SettleoraAccessTokenProvider accessTokenProvider,
  }) : _client = client,
       _accessTokenProvider = accessTokenProvider;

  factory GeneratedSettleoraSettlementRepository.fromConfiguration({
    required SettleoraApiConfiguration configuration,
    required SettleoraAccessTokenProvider accessTokenProvider,
    SettleoraGeneratedApiClientFactory clientFactory =
        const SettleoraGeneratedApiClientFactory(),
  }) {
    return GeneratedSettleoraSettlementRepository(
      client: SettleoraGeneratedSettlementClient(
        clientFactory.create(configuration),
      ),
      accessTokenProvider: accessTokenProvider,
    );
  }

  final SettleoraSettlementGeneratedClient _client;
  final SettleoraAccessTokenProvider _accessTokenProvider;

  @override
  Future<SettleoraSettlementBalanceSnapshot> listBalances() {
    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.listSettlementBalanceProjections(
          accessToken: accessToken,
        );
        return SettleoraSettlementBalanceSnapshot(
          generatedAtUtc: response.generatedAtUtc.toUtc(),
          balances: response.balances.map(_mapBalance).toList(growable: false),
        );
      } on SettleoraSettlementFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<List<SettleoraSettlementRequest>> listSettlementRequests() {
    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.listSettlementRequests(
          accessToken: accessToken,
        );
        return response.settlements.map(_mapRequest).toList(growable: false);
      } on SettleoraSettlementFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraSettlementRequest> getSettlementRequest(String settlementId) {
    final trimmedSettlementId = _requireId(
      settlementId,
      message: 'Choose a settlement before opening details.',
    );
    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.getSettlementRequest(
          trimmedSettlementId,
          accessToken: accessToken,
        );
        return _mapRequest(response);
      } on SettleoraSettlementFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<List<SettleoraSettlementPayment>> listSettlementPayments(
    String settlementId,
  ) {
    final trimmedSettlementId = _requireId(
      settlementId,
      message: 'Choose a settlement before loading payments.',
    );
    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.listSettlementPayments(
          trimmedSettlementId,
          accessToken: accessToken,
        );
        return response.payments.map(_mapPayment).toList(growable: false);
      } on SettleoraSettlementFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraSettlementCounterpartyPaymentDetails>
  getCounterpartyPaymentDetails({
    required String settlementId,
    required String userProfileId,
  }) {
    final trimmedSettlementId = _requireId(
      settlementId,
      message: 'Choose a settlement before loading payment details.',
    );
    final trimmedUserProfileId = _requireId(
      userProfileId,
      message: 'Choose a settlement counterparty before loading details.',
    );
    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.getSettlementCounterpartyPaymentDetails(
          trimmedSettlementId,
          trimmedUserProfileId,
          accessToken: accessToken,
        );
        return _mapCounterpartyPaymentDetails(response);
      } on SettleoraSettlementFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraSettlementRequest> cancelSettlementRequest(
    String settlementId,
  ) {
    return _mutateRequest(
      settlementId,
      _client.cancelSettlementRequest,
      missingIdMessage: 'Choose a settlement before cancelling it.',
    );
  }

  @override
  Future<SettleoraSettlementRequest> disputeSettlementRequest(
    String settlementId,
  ) {
    return _mutateRequest(
      settlementId,
      _client.disputeSettlementRequest,
      missingIdMessage: 'Choose a settlement before disputing it.',
    );
  }

  @override
  Future<SettleoraSettlementPayment> confirmSettlementPayment(
    String paymentId,
  ) {
    return _mutatePayment(
      paymentId,
      _client.confirmSettlementPayment,
      missingIdMessage: 'Choose a payment before confirming it.',
    );
  }

  @override
  Future<SettleoraSettlementPayment> cancelSettlementPayment(String paymentId) {
    return _mutatePayment(
      paymentId,
      _client.cancelSettlementPayment,
      missingIdMessage: 'Choose a payment before cancelling it.',
    );
  }

  @override
  Future<SettleoraSettlementPayment> disputeSettlementPayment(
    String paymentId,
  ) {
    return _mutatePayment(
      paymentId,
      _client.disputeSettlementPayment,
      missingIdMessage: 'Choose a payment before disputing it.',
    );
  }

  @override
  Future<SettleoraSettlementPayment> confirmSettlementPaymentResidual({
    required String paymentId,
    required String residualId,
  }) {
    final trimmedPaymentId = _requireId(
      paymentId,
      message: 'Choose a payment before confirming a residual.',
    );
    final trimmedResidualId = _requireId(
      residualId,
      message: 'Choose a residual before confirming it.',
    );
    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.confirmSettlementPaymentResidual(
          trimmedPaymentId,
          trimmedResidualId,
          accessToken: accessToken,
        );
        return _mapPayment(response);
      } on SettleoraSettlementFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  Future<SettleoraSettlementRequest> _mutateRequest(
    String settlementId,
    Future<api.SettlementRequestResponse> Function(
      String settlementId, {
      required String accessToken,
    })
    operation, {
    required String missingIdMessage,
  }) {
    final trimmedSettlementId = _requireId(
      settlementId,
      message: missingIdMessage,
    );
    return _withAccessToken((accessToken) async {
      try {
        final response = await operation(
          trimmedSettlementId,
          accessToken: accessToken,
        );
        return _mapRequest(response);
      } on SettleoraSettlementFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  Future<SettleoraSettlementPayment> _mutatePayment(
    String paymentId,
    Future<api.SettlementPaymentResponse> Function(
      String paymentId, {
      required String accessToken,
    })
    operation, {
    required String missingIdMessage,
  }) {
    final trimmedPaymentId = _requireId(paymentId, message: missingIdMessage);
    return _withAccessToken((accessToken) async {
      try {
        final response = await operation(
          trimmedPaymentId,
          accessToken: accessToken,
        );
        return _mapPayment(response);
      } on SettleoraSettlementFailure {
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
      throw const SettleoraSettlementFailure(
        kind: SettleoraSettlementFailureKind.sessionRequired,
        message: 'Sign in before loading settlements.',
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

SettleoraSettlementBalance _mapBalance(
  api.SettlementBalanceProjectionResponse response,
) {
  return SettleoraSettlementBalance(
    counterpartyUserProfileId: response.counterpartyUserProfileId,
    groupId: response.groupId,
    direction: response.direction,
    currency: response.currency,
    selectedLineAmount: response.selectedLineAmount,
    pendingClaimedAmount: response.pendingClaimedAmount,
    confirmedClearedAmount: response.confirmedClearedAmount,
    remainingUnclaimedAmount: response.remainingUnclaimedAmount,
    confirmedRemainingResidualAmount: response.confirmedRemainingResidualAmount,
    waivedResidualAmount: response.waivedResidualAmount,
    creditResidualAmount: response.creditResidualAmount,
    requestCount: response.requestCount,
    lineCount: response.lineCount,
    pendingPaymentCount: response.pendingPaymentCount,
    confirmedPaymentCount: response.confirmedPaymentCount,
  );
}

SettleoraSettlementRequest _mapRequest(api.SettlementRequestResponse response) {
  return SettleoraSettlementRequest(
    id: response.id,
    sourceExpenseBillId: response.sourceExpenseBillId,
    groupId: response.groupId,
    debtorUserProfileId: response.debtorUserProfileId,
    creditorUserProfileId: response.creditorUserProfileId,
    amount: response.amount,
    currency: response.currency,
    status: response.status,
    requestedByUserProfileId: response.requestedByUserProfileId,
    requestedAtUtc: response.requestedAtUtc.toUtc(),
    createdAtUtc: response.createdAtUtc.toUtc(),
    updatedAtUtc: response.updatedAtUtc.toUtc(),
    lines: response.lines.map(_mapRequestLine).toList(growable: false),
  );
}

SettleoraSettlementRequestLine _mapRequestLine(
  api.SettlementRequestLineResponse response,
) {
  return SettleoraSettlementRequestLine(
    id: response.id,
    sourceExpenseBillId: response.sourceExpenseBillId,
    sourceBillRevisionId: response.sourceBillRevisionId,
    sourceCandidateKey: response.sourceCandidateKey,
    exactAmount: response.exactAmount,
    currency: response.currency,
    allocationOrder: response.allocationOrder,
    status: response.status,
    createdAtUtc: response.createdAtUtc.toUtc(),
    updatedAtUtc: response.updatedAtUtc.toUtc(),
  );
}

SettleoraSettlementPayment _mapPayment(api.SettlementPaymentResponse response) {
  return SettleoraSettlementPayment(
    id: response.paymentId,
    settlementRequestId: response.settlementRequestId,
    paidByUserProfileId: response.paidByUserProfileId,
    receivedByUserProfileId: response.receivedByUserProfileId,
    amount: response.amount,
    currency: response.currency,
    status: response.status,
    paymentDate: response.paymentDate,
    claimedAtUtc: response.claimedAtUtc.toUtc(),
    createdAtUtc: response.createdAtUtc.toUtc(),
    updatedAtUtc: response.updatedAtUtc.toUtc(),
    allocations: response.allocations
        .map(_mapAllocation)
        .toList(growable: false),
    residuals: response.residuals.map(_mapResidual).toList(growable: false),
    settlementRequestStatus: response.settlementRequestStatus,
  );
}

SettleoraSettlementPaymentAllocation _mapAllocation(
  api.SettlementPaymentAllocationResponse response,
) {
  return SettleoraSettlementPaymentAllocation(
    id: response.id,
    settlementRequestLineId: response.settlementRequestLineId,
    clearedAmount: response.clearedAmount,
    currency: response.currency,
    allocationOrder: response.allocationOrder,
    createdAtUtc: response.createdAtUtc.toUtc(),
  );
}

SettleoraSettlementPaymentResidual _mapResidual(
  api.SettlementPaymentResidualResponse response,
) {
  return SettleoraSettlementPaymentResidual(
    id: response.id,
    settlementPaymentId: response.settlementPaymentId,
    settlementRequestId: response.settlementRequestId,
    direction: response.direction,
    amount: response.amount,
    currency: response.currency,
    policy: response.policy,
    status: response.status,
    createdAtUtc: response.createdAtUtc.toUtc(),
    resolvedAtUtc: response.resolvedAtUtc?.toUtc(),
  );
}

SettleoraSettlementCounterpartyPaymentDetails _mapCounterpartyPaymentDetails(
  api.SettlementCounterpartyPaymentDetailsResponse response,
) {
  return SettleoraSettlementCounterpartyPaymentDetails(
    userProfileId: response.userProfileId,
    isConfigured: response.isConfigured,
    preferredMethodLabel: response.preferredMethodLabel,
    paymentHandle: response.paymentHandle,
    paymentNote: response.paymentNote,
    visibilityApplied: response.visibilityApplied,
    hasQrFile: response.qrFile != null,
  );
}

SettleoraSettlementFailure _mapFailure(Object error) {
  if (error is api.SettleoraApiException) {
    return switch (error.statusCode) {
      400 || 422 => SettleoraSettlementFailure(
        kind: SettleoraSettlementFailureKind.validation,
        message:
            'The settlement request is no longer valid. Refresh and try again.',
        statusCode: error.statusCode,
      ),
      401 => const SettleoraSettlementFailure(
        kind: SettleoraSettlementFailureKind.sessionExpired,
        message:
            'Your session has expired. Sign in again before loading settlements.',
        statusCode: 401,
      ),
      403 => const SettleoraSettlementFailure(
        kind: SettleoraSettlementFailureKind.denied,
        message: 'Settlements are not available to this account.',
        statusCode: 403,
      ),
      404 || 410 => SettleoraSettlementFailure(
        kind: SettleoraSettlementFailureKind.unavailable,
        message: 'The settlement is no longer available.',
        statusCode: error.statusCode,
      ),
      409 => const SettleoraSettlementFailure(
        kind: SettleoraSettlementFailureKind.conflict,
        message: 'Refresh the settlement and try again.',
        statusCode: 409,
      ),
      >= 500 => SettleoraSettlementFailure(
        kind: SettleoraSettlementFailureKind.server,
        message: 'Settlements are unavailable right now. Try again later.',
        statusCode: error.statusCode,
      ),
      _ => SettleoraSettlementFailure(
        kind: SettleoraSettlementFailureKind.server,
        message: 'Settlements are unavailable right now. Try again later.',
        statusCode: error.statusCode,
      ),
    };
  }

  if (error is SocketException ||
      error is HttpException ||
      error is HandshakeException ||
      error is TimeoutException ||
      error is IOException) {
    return const SettleoraSettlementFailure(
      kind: SettleoraSettlementFailureKind.network,
      message:
          'The server is unavailable. Try again when the connection is back.',
    );
  }

  return const SettleoraSettlementFailure(
    kind: SettleoraSettlementFailureKind.server,
    message: 'Settlements are unavailable right now. Try again later.',
  );
}

String _requireId(String value, {required String message}) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    throw SettleoraSettlementFailure(
      kind: SettleoraSettlementFailureKind.validation,
      message: message,
    );
  }

  return trimmed;
}
