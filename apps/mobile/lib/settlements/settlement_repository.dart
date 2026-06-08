typedef SettleoraSettlementRequestStatus = String;
typedef SettleoraSettlementRequestLineStatus = String;
typedef SettleoraSettlementPaymentStatus = String;
typedef SettleoraSettlementBalanceDirection = String;
typedef SettleoraSettlementResidualDirection = String;
typedef SettleoraSettlementResidualPolicy = String;
typedef SettleoraSettlementResidualStatus = String;
typedef SettleoraPaymentDetailsVisibility = String;

class SettleoraSettlementRequestStatusValues {
  const SettleoraSettlementRequestStatusValues._();

  static const requested = 'requested';
  static const partiallyPaid = 'partially_paid';
  static const markedPaid = 'marked_paid';
  static const confirmed = 'confirmed';
  static const disputed = 'disputed';
  static const cancelled = 'cancelled';
}

class SettleoraSettlementPaymentStatusValues {
  const SettleoraSettlementPaymentStatusValues._();

  static const markedPaid = 'marked_paid';
  static const confirmed = 'confirmed';
  static const disputed = 'disputed';
  static const cancelled = 'cancelled';
}

class SettleoraSettlementResidualStatusValues {
  const SettleoraSettlementResidualStatusValues._();

  static const pendingReceiverConfirmation = 'pending_receiver_confirmation';
  static const confirmed = 'confirmed';
  static const carriedForward = 'carried_forward';
  static const waived = 'waived';
  static const credited = 'credited';
  static const disputed = 'disputed';
  static const cancelled = 'cancelled';
}

class SettleoraSettlementBalanceDirectionValues {
  const SettleoraSettlementBalanceDirectionValues._();

  static const incoming = 'incoming';
  static const outgoing = 'outgoing';
}

enum SettleoraSettlementFailureKind {
  sessionRequired,
  sessionExpired,
  denied,
  unavailable,
  conflict,
  validation,
  network,
  server,
}

class SettleoraSettlementFailure implements Exception {
  const SettleoraSettlementFailure({
    required this.kind,
    required this.message,
    this.statusCode,
  });

  factory SettleoraSettlementFailure.from(Object error) {
    if (error is SettleoraSettlementFailure) {
      return error;
    }

    return const SettleoraSettlementFailure(
      kind: SettleoraSettlementFailureKind.network,
      message:
          'The server is unavailable. Try again when the connection is back.',
    );
  }

  final SettleoraSettlementFailureKind kind;
  final String message;
  final int? statusCode;

  String get title {
    return switch (kind) {
      SettleoraSettlementFailureKind.sessionRequired => 'Sign in required',
      SettleoraSettlementFailureKind.sessionExpired => 'Sign in again',
      SettleoraSettlementFailureKind.denied => 'Settlements unavailable',
      SettleoraSettlementFailureKind.unavailable => 'Settlement unavailable',
      SettleoraSettlementFailureKind.conflict => 'Needs refresh',
      SettleoraSettlementFailureKind.validation => 'Unsupported request',
      SettleoraSettlementFailureKind.network => 'Server unavailable',
      SettleoraSettlementFailureKind.server => 'Settlements unavailable',
    };
  }

  @override
  String toString() {
    return 'SettleoraSettlementFailure($kind, statusCode: $statusCode)';
  }
}

class SettleoraSettlementBalanceSnapshot {
  const SettleoraSettlementBalanceSnapshot({
    required this.generatedAtUtc,
    required this.balances,
  });

  final DateTime generatedAtUtc;
  final List<SettleoraSettlementBalance> balances;
}

class SettleoraSettlementBalance {
  const SettleoraSettlementBalance({
    required this.counterpartyUserProfileId,
    required this.groupId,
    required this.direction,
    required this.currency,
    required this.selectedLineAmount,
    required this.pendingClaimedAmount,
    required this.confirmedClearedAmount,
    required this.remainingUnclaimedAmount,
    required this.confirmedRemainingResidualAmount,
    required this.waivedResidualAmount,
    required this.creditResidualAmount,
    required this.requestCount,
    required this.lineCount,
    required this.pendingPaymentCount,
    required this.confirmedPaymentCount,
  });

  final String counterpartyUserProfileId;
  final String? groupId;
  final SettleoraSettlementBalanceDirection direction;
  final String currency;
  final String selectedLineAmount;
  final String pendingClaimedAmount;
  final String confirmedClearedAmount;
  final String remainingUnclaimedAmount;
  final String confirmedRemainingResidualAmount;
  final String waivedResidualAmount;
  final String creditResidualAmount;
  final int requestCount;
  final int lineCount;
  final int pendingPaymentCount;
  final int confirmedPaymentCount;
}

class SettleoraSettlementRequest {
  const SettleoraSettlementRequest({
    required this.id,
    required this.sourceExpenseBillId,
    required this.groupId,
    required this.debtorUserProfileId,
    required this.creditorUserProfileId,
    required this.amount,
    required this.currency,
    required this.status,
    required this.requestedByUserProfileId,
    required this.requestedAtUtc,
    required this.createdAtUtc,
    required this.updatedAtUtc,
    required this.lines,
  });

  final String id;
  final String sourceExpenseBillId;
  final String? groupId;
  final String debtorUserProfileId;
  final String creditorUserProfileId;
  final String amount;
  final String currency;
  final SettleoraSettlementRequestStatus status;
  final String requestedByUserProfileId;
  final DateTime requestedAtUtc;
  final DateTime createdAtUtc;
  final DateTime updatedAtUtc;
  final List<SettleoraSettlementRequestLine> lines;

  bool get canCancel =>
      status == SettleoraSettlementRequestStatusValues.requested;

  bool get canDispute =>
      status == SettleoraSettlementRequestStatusValues.requested ||
      status == SettleoraSettlementRequestStatusValues.partiallyPaid ||
      status == SettleoraSettlementRequestStatusValues.markedPaid;

  bool isDebtor(String currentUserProfileId) =>
      currentUserProfileId.trim() == debtorUserProfileId;

  bool isCreditor(String currentUserProfileId) =>
      currentUserProfileId.trim() == creditorUserProfileId;

  bool isRequester(String currentUserProfileId) =>
      currentUserProfileId.trim() == requestedByUserProfileId;

  bool isParticipant(String currentUserProfileId) =>
      isDebtor(currentUserProfileId) || isCreditor(currentUserProfileId);

  bool canCancelFor(String currentUserProfileId) =>
      canCancel && isRequester(currentUserProfileId);

  bool canDisputeFor(String currentUserProfileId) =>
      canDispute && isParticipant(currentUserProfileId);

  String? counterpartyFor(String currentUserProfileId) {
    final trimmed = currentUserProfileId.trim();
    if (trimmed.isEmpty) {
      return null;
    }

    if (trimmed == debtorUserProfileId) {
      return creditorUserProfileId;
    }

    if (trimmed == creditorUserProfileId) {
      return debtorUserProfileId;
    }

    return null;
  }
}

class SettleoraSettlementRequestLine {
  const SettleoraSettlementRequestLine({
    required this.id,
    required this.sourceExpenseBillId,
    required this.sourceBillRevisionId,
    required this.sourceCandidateKey,
    required this.exactAmount,
    required this.currency,
    required this.allocationOrder,
    required this.status,
    required this.createdAtUtc,
    required this.updatedAtUtc,
  });

  final String id;
  final String sourceExpenseBillId;
  final String? sourceBillRevisionId;
  final String? sourceCandidateKey;
  final String exactAmount;
  final String currency;
  final int allocationOrder;
  final SettleoraSettlementRequestLineStatus status;
  final DateTime createdAtUtc;
  final DateTime updatedAtUtc;
}

class SettleoraSettlementPayment {
  const SettleoraSettlementPayment({
    required this.id,
    required this.settlementRequestId,
    required this.paidByUserProfileId,
    required this.receivedByUserProfileId,
    required this.amount,
    required this.currency,
    required this.status,
    required this.paymentDate,
    required this.claimedAtUtc,
    required this.createdAtUtc,
    required this.updatedAtUtc,
    required this.allocations,
    required this.residuals,
    required this.settlementRequestStatus,
  });

  final String id;
  final String settlementRequestId;
  final String paidByUserProfileId;
  final String receivedByUserProfileId;
  final String amount;
  final String currency;
  final SettleoraSettlementPaymentStatus status;
  final String paymentDate;
  final DateTime claimedAtUtc;
  final DateTime createdAtUtc;
  final DateTime updatedAtUtc;
  final List<SettleoraSettlementPaymentAllocation> allocations;
  final List<SettleoraSettlementPaymentResidual> residuals;
  final SettleoraSettlementRequestStatus settlementRequestStatus;

  bool get hasPendingResiduals =>
      residuals.any((residual) => residual.canConfirm);

  bool get canConfirm =>
      status == SettleoraSettlementPaymentStatusValues.markedPaid &&
      !hasPendingResiduals;

  bool get canCancel =>
      status == SettleoraSettlementPaymentStatusValues.markedPaid;

  bool get canDispute =>
      status == SettleoraSettlementPaymentStatusValues.markedPaid;

  bool isPayer(String currentUserProfileId) =>
      currentUserProfileId.trim() == paidByUserProfileId;

  bool isReceiver(String currentUserProfileId) =>
      currentUserProfileId.trim() == receivedByUserProfileId;

  bool canConfirmFor(String currentUserProfileId) =>
      canConfirm && isReceiver(currentUserProfileId);

  bool canCancelFor(String currentUserProfileId) =>
      canCancel && isPayer(currentUserProfileId);

  bool canDisputeFor(String currentUserProfileId) =>
      canDispute && isReceiver(currentUserProfileId);
}

class SettleoraSettlementPaymentAllocation {
  const SettleoraSettlementPaymentAllocation({
    required this.id,
    required this.settlementRequestLineId,
    required this.clearedAmount,
    required this.currency,
    required this.allocationOrder,
    required this.createdAtUtc,
  });

  final String id;
  final String settlementRequestLineId;
  final String clearedAmount;
  final String currency;
  final int allocationOrder;
  final DateTime createdAtUtc;
}

class SettleoraSettlementPaymentResidual {
  const SettleoraSettlementPaymentResidual({
    required this.id,
    required this.settlementPaymentId,
    required this.settlementRequestId,
    required this.direction,
    required this.amount,
    required this.currency,
    required this.policy,
    required this.status,
    required this.createdAtUtc,
    required this.resolvedAtUtc,
  });

  final String id;
  final String settlementPaymentId;
  final String settlementRequestId;
  final SettleoraSettlementResidualDirection direction;
  final String amount;
  final String currency;
  final SettleoraSettlementResidualPolicy policy;
  final SettleoraSettlementResidualStatus status;
  final DateTime createdAtUtc;
  final DateTime? resolvedAtUtc;

  bool get canConfirm =>
      status ==
      SettleoraSettlementResidualStatusValues.pendingReceiverConfirmation;
}

class SettleoraSettlementCounterpartyPaymentDetails {
  const SettleoraSettlementCounterpartyPaymentDetails({
    required this.userProfileId,
    required this.isConfigured,
    required this.preferredMethodLabel,
    required this.paymentHandle,
    required this.paymentNote,
    required this.visibilityApplied,
    required this.hasQrFile,
  });

  final String userProfileId;
  final bool isConfigured;
  final String? preferredMethodLabel;
  final String? paymentHandle;
  final String? paymentNote;
  final SettleoraPaymentDetailsVisibility visibilityApplied;
  final bool hasQrFile;
}

abstract interface class SettleoraSettlementRepository {
  Future<SettleoraSettlementBalanceSnapshot> listBalances();

  Future<List<SettleoraSettlementRequest>> listSettlementRequests();

  Future<SettleoraSettlementRequest> getSettlementRequest(String settlementId);

  Future<List<SettleoraSettlementPayment>> listSettlementPayments(
    String settlementId,
  );

  Future<SettleoraSettlementPayment> markSettlementPaymentPaid({
    required String settlementId,
    required String amount,
    required String currency,
    required String paymentDate,
  });

  Future<SettleoraSettlementCounterpartyPaymentDetails>
  getCounterpartyPaymentDetails({
    required String settlementId,
    required String userProfileId,
  });

  Future<SettleoraSettlementRequest> cancelSettlementRequest(
    String settlementId,
  );

  Future<SettleoraSettlementRequest> disputeSettlementRequest(
    String settlementId,
  );

  Future<SettleoraSettlementPayment> confirmSettlementPayment(String paymentId);

  Future<SettleoraSettlementPayment> cancelSettlementPayment(String paymentId);

  Future<SettleoraSettlementPayment> disputeSettlementPayment(String paymentId);

  Future<SettleoraSettlementPayment> confirmSettlementPaymentResidual({
    required String paymentId,
    required String residualId,
  });
}

String settleoraSettlementRequestStatusLabel(
  SettleoraSettlementRequestStatus status,
) {
  return switch (status) {
    SettleoraSettlementRequestStatusValues.requested => 'Requested',
    SettleoraSettlementRequestStatusValues.partiallyPaid => 'Partially paid',
    SettleoraSettlementRequestStatusValues.markedPaid => 'Marked paid',
    SettleoraSettlementRequestStatusValues.confirmed => 'Confirmed',
    SettleoraSettlementRequestStatusValues.disputed => 'Disputed',
    SettleoraSettlementRequestStatusValues.cancelled => 'Cancelled',
    _ => _titleFromCode(status),
  };
}

String settleoraSettlementPaymentStatusLabel(
  SettleoraSettlementPaymentStatus status,
) {
  return switch (status) {
    SettleoraSettlementPaymentStatusValues.markedPaid => 'Marked paid',
    SettleoraSettlementPaymentStatusValues.confirmed => 'Confirmed',
    SettleoraSettlementPaymentStatusValues.disputed => 'Disputed',
    SettleoraSettlementPaymentStatusValues.cancelled => 'Cancelled',
    _ => _titleFromCode(status),
  };
}

String settleoraSettlementResidualStatusLabel(
  SettleoraSettlementResidualStatus status,
) {
  return switch (status) {
    SettleoraSettlementResidualStatusValues.pendingReceiverConfirmation =>
      'Pending receiver confirmation',
    SettleoraSettlementResidualStatusValues.confirmed => 'Confirmed',
    SettleoraSettlementResidualStatusValues.carriedForward => 'Carried forward',
    SettleoraSettlementResidualStatusValues.waived => 'Waived',
    SettleoraSettlementResidualStatusValues.credited => 'Credited',
    SettleoraSettlementResidualStatusValues.disputed => 'Disputed',
    SettleoraSettlementResidualStatusValues.cancelled => 'Cancelled',
    _ => _titleFromCode(status),
  };
}

String settleoraSettlementBalanceDirectionLabel(
  SettleoraSettlementBalanceDirection direction,
) {
  return switch (direction) {
    SettleoraSettlementBalanceDirectionValues.incoming => 'Incoming',
    SettleoraSettlementBalanceDirectionValues.outgoing => 'Outgoing',
    _ => _titleFromCode(direction),
  };
}

String settleoraSettlementRequestLineStatusLabel(
  SettleoraSettlementRequestLineStatus status,
) {
  return _titleFromCode(status);
}

String settleoraSettlementResidualPolicyLabel(
  SettleoraSettlementResidualPolicy policy,
) {
  return _titleFromCode(policy);
}

String settleoraSettlementResidualDirectionLabel(
  SettleoraSettlementResidualDirection direction,
) {
  return _titleFromCode(direction);
}

String _titleFromCode(String code) {
  return code
      .split('_')
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}
