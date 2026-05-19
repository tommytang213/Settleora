typedef SettleoraBillRevisionStatus = String;
typedef SettleoraBillRevisionApprovalStatus = String;
typedef SettleoraBillRevisionPayerConfirmationStatus = String;
typedef SettleoraBillRevisionReviewViewMode = String;
typedef SettleoraBillRevisionReviewBaselineType = String;
typedef SettleoraBillRevisionReviewRecommendationReason = String;
typedef SettleoraBillRevisionReviewChangeCategory = String;
typedef SettleoraBillRevisionReviewSupportStatus = String;
typedef SettleoraBillRevisionReviewSummaryViewerImpact = String;
typedef SettleoraBillRevisionReviewChangeType = String;
typedef SettleoraBillRevisionReviewChangeScope = String;
typedef SettleoraBillRevisionReviewChangeViewerImpact = String;

class SettleoraBillRevisionStatusValues {
  const SettleoraBillRevisionStatusValues._();

  static const SettleoraBillRevisionStatus draftRevision = 'draft_revision';
  static const SettleoraBillRevisionStatus submittedForReview =
      'submitted_for_review';
  static const SettleoraBillRevisionStatus withdrawnByProposer =
      'withdrawn_by_proposer';
  static const SettleoraBillRevisionStatus supersededByResubmission =
      'superseded_by_resubmission';
  static const SettleoraBillRevisionStatus rejected = 'rejected';
  static const SettleoraBillRevisionStatus acceptedApplied = 'accepted_applied';
  static const SettleoraBillRevisionStatus cancelledByAuthorizedEditor =
      'cancelled_by_authorized_editor';
}

class SettleoraBillRevisionApprovalStatusValues {
  const SettleoraBillRevisionApprovalStatusValues._();

  static const SettleoraBillRevisionApprovalStatus pendingReview =
      'pending_review';
  static const SettleoraBillRevisionApprovalStatus approved = 'approved';
  static const SettleoraBillRevisionApprovalStatus rejected = 'rejected';
  static const SettleoraBillRevisionApprovalStatus invalidatedBySupersession =
      'invalidated_by_supersession';
}

class SettleoraBillRevisionPayerConfirmationStatusValues {
  const SettleoraBillRevisionPayerConfirmationStatusValues._();

  static const SettleoraBillRevisionPayerConfirmationStatus
  pendingConfirmation = 'pending_confirmation';
  static const SettleoraBillRevisionPayerConfirmationStatus confirmed =
      'confirmed';
  static const SettleoraBillRevisionPayerConfirmationStatus rejected =
      'rejected';
}

class SettleoraBillRevisionReviewViewModeValues {
  const SettleoraBillRevisionReviewViewModeValues._();

  static const SettleoraBillRevisionReviewViewMode fullBill = 'full_bill';
  static const SettleoraBillRevisionReviewViewMode changedOnly = 'changed_only';
}

class SettleoraBillRevisionReviewBaselineTypeValues {
  const SettleoraBillRevisionReviewBaselineTypeValues._();

  static const SettleoraBillRevisionReviewBaselineType noPriorBaseline =
      'no_prior_baseline';
  static const SettleoraBillRevisionReviewBaselineType activeAcceptedBill =
      'active_accepted_bill';
  static const SettleoraBillRevisionReviewBaselineType
  previousRevisionApproval = 'previous_revision_approval';
  static const SettleoraBillRevisionReviewBaselineType
  previousRevisionRejection = 'previous_revision_rejection';
}

class SettleoraBillRevisionReviewRecommendationReasonValues {
  const SettleoraBillRevisionReviewRecommendationReasonValues._();

  static const SettleoraBillRevisionReviewRecommendationReason
  noPriorBaselineFullBillRecommended =
      'no_prior_baseline_full_bill_recommended';
  static const SettleoraBillRevisionReviewRecommendationReason
  baselineAvailableFullViewOptional = 'baseline_available_full_view_optional';
}

class SettleoraBillRevisionReviewChangeCategoryValues {
  const SettleoraBillRevisionReviewChangeCategoryValues._();

  static const SettleoraBillRevisionReviewChangeCategory billTotal =
      'bill_total';
  static const SettleoraBillRevisionReviewChangeCategory participantShare =
      'participant_share';
  static const SettleoraBillRevisionReviewChangeCategory payerContribution =
      'payer_contribution';
  static const SettleoraBillRevisionReviewChangeCategory payerRole =
      'payer_role';
  static const SettleoraBillRevisionReviewChangeCategory item = 'item';
  static const SettleoraBillRevisionReviewChangeCategory itemSplit =
      'item_split';
  static const SettleoraBillRevisionReviewChangeCategory adjustment =
      'adjustment';
  static const SettleoraBillRevisionReviewChangeCategory
  attachmentReceiptOcrReview = 'attachment_receipt_ocr_review';
  static const SettleoraBillRevisionReviewChangeCategory noteMetadata =
      'note_metadata';
}

class SettleoraBillRevisionReviewSupportStatusValues {
  const SettleoraBillRevisionReviewSupportStatusValues._();

  static const SettleoraBillRevisionReviewSupportStatus supported = 'supported';
  static const SettleoraBillRevisionReviewSupportStatus
  unsupportedInCurrentRevisionSnapshot =
      'unsupported_in_current_revision_snapshot';
}

class SettleoraBillRevisionReviewSummaryViewerImpactValues {
  const SettleoraBillRevisionReviewSummaryViewerImpactValues._();

  static const SettleoraBillRevisionReviewSummaryViewerImpact viewerAffected =
      'viewer_affected';
  static const SettleoraBillRevisionReviewSummaryViewerImpact viewerUnaffected =
      'viewer_unaffected';
  static const SettleoraBillRevisionReviewSummaryViewerImpact notAvailable =
      'not_available';
}

class SettleoraBillRevisionReviewChangeScopeValues {
  const SettleoraBillRevisionReviewChangeScopeValues._();

  static const SettleoraBillRevisionReviewChangeScope billTotal = 'bill_total';
  static const SettleoraBillRevisionReviewChangeScope participantShare =
      'participant_share';
  static const SettleoraBillRevisionReviewChangeScope payerContribution =
      'payer_contribution';
  static const SettleoraBillRevisionReviewChangeScope payerRole = 'payer_role';
}

enum SettleoraBillRevisionFailureKind {
  sessionRequired,
  sessionExpired,
  denied,
  unavailable,
  conflict,
  validation,
  network,
  server,
}

class SettleoraBillRevisionFailure implements Exception {
  const SettleoraBillRevisionFailure({
    required this.kind,
    required this.message,
    this.statusCode,
  });

  factory SettleoraBillRevisionFailure.from(Object error) {
    if (error is SettleoraBillRevisionFailure) {
      return error;
    }

    return const SettleoraBillRevisionFailure(
      kind: SettleoraBillRevisionFailureKind.network,
      message:
          'The server is unavailable. Try again when the connection is back.',
    );
  }

  final SettleoraBillRevisionFailureKind kind;
  final String message;
  final int? statusCode;

  String get title {
    return switch (kind) {
      SettleoraBillRevisionFailureKind.sessionRequired => 'Sign in required',
      SettleoraBillRevisionFailureKind.sessionExpired => 'Sign in again',
      SettleoraBillRevisionFailureKind.denied => 'Revision unavailable',
      SettleoraBillRevisionFailureKind.unavailable => 'Revision unavailable',
      SettleoraBillRevisionFailureKind.conflict => 'Refresh needed',
      SettleoraBillRevisionFailureKind.validation => 'Unsupported request',
      SettleoraBillRevisionFailureKind.network => 'Server unavailable',
      SettleoraBillRevisionFailureKind.server => 'Revision unavailable',
    };
  }

  @override
  String toString() =>
      'SettleoraBillRevisionFailure($kind, statusCode: $statusCode)';
}

class SettleoraBillRevision {
  const SettleoraBillRevision({
    required this.id,
    required this.billId,
    required this.groupId,
    required this.status,
    required this.totalAmount,
    required this.totalCurrency,
    required this.calculationHash,
    required this.submittedAtUtc,
    required this.updatedAtUtc,
    required this.participants,
    required this.payers,
    required this.approvals,
    required this.reviewContext,
    required this.viewerApprovalBasis,
  });

  final String id;
  final String billId;
  final String? groupId;
  final SettleoraBillRevisionStatus status;
  final String totalAmount;
  final String totalCurrency;
  final String calculationHash;
  final DateTime? submittedAtUtc;
  final DateTime updatedAtUtc;
  final List<SettleoraBillRevisionParticipant> participants;
  final List<SettleoraBillRevisionPayer> payers;
  final List<SettleoraBillRevisionApproval> approvals;
  final SettleoraBillRevisionReviewContext reviewContext;
  final SettleoraBillRevisionApprovalBasis? viewerApprovalBasis;

  bool get isSubmittedForReview =>
      status == SettleoraBillRevisionStatusValues.submittedForReview;

  bool get isTerminal {
    return status == SettleoraBillRevisionStatusValues.withdrawnByProposer ||
        status == SettleoraBillRevisionStatusValues.supersededByResubmission ||
        status == SettleoraBillRevisionStatusValues.rejected ||
        status == SettleoraBillRevisionStatusValues.acceptedApplied ||
        status == SettleoraBillRevisionStatusValues.cancelledByAuthorizedEditor;
  }

  bool get canApprove => isSubmittedForReview && viewerApprovalBasis != null;

  bool get canReject => isSubmittedForReview;

  bool get requiresViewerPayerConfirmation =>
      reviewContext
          .viewerFinancialImpact
          .payerImpact
          ?.requiresPayerConfirmation ??
      false;
}

class SettleoraBillRevisionApprovalBasis {
  const SettleoraBillRevisionApprovalBasis({
    required this.acceptedAmount,
    required this.currency,
    required this.calculationHash,
  });

  final String acceptedAmount;
  final String currency;
  final String calculationHash;
}

class SettleoraBillRevisionParticipant {
  const SettleoraBillRevisionParticipant({
    required this.userProfileId,
    required this.resolvedShareAmount,
    required this.resolvedShareCurrency,
    required this.affectedByRevision,
  });

  final String userProfileId;
  final String resolvedShareAmount;
  final String resolvedShareCurrency;
  final bool affectedByRevision;
}

class SettleoraBillRevisionPayer {
  const SettleoraBillRevisionPayer({
    required this.userProfileId,
    required this.amount,
    required this.currency,
    required this.requiresPayerConfirmation,
    required this.payerConfirmationStatus,
  });

  final String userProfileId;
  final String amount;
  final String currency;
  final bool requiresPayerConfirmation;
  final SettleoraBillRevisionPayerConfirmationStatus payerConfirmationStatus;
}

class SettleoraBillRevisionApproval {
  const SettleoraBillRevisionApproval({
    required this.participantUserProfileId,
    required this.acceptedAmount,
    required this.currency,
    required this.status,
    required this.approvedAtUtc,
    required this.rejectedAtUtc,
    required this.invalidatedAtUtc,
  });

  final String participantUserProfileId;
  final String acceptedAmount;
  final String currency;
  final SettleoraBillRevisionApprovalStatus status;
  final DateTime? approvedAtUtc;
  final DateTime? rejectedAtUtc;
  final DateTime? invalidatedAtUtc;
}

class SettleoraBillRevisionReviewContext {
  const SettleoraBillRevisionReviewContext({
    required this.viewerUserProfileId,
    required this.baseline,
    required this.defaultViewMode,
    required this.fullViewRecommendedReason,
    required this.viewerFinancialImpact,
    required this.changeSummary,
    required this.changes,
    required this.limitations,
  });

  final String viewerUserProfileId;
  final SettleoraBillRevisionReviewBaseline baseline;
  final SettleoraBillRevisionReviewViewMode defaultViewMode;
  final SettleoraBillRevisionReviewRecommendationReason
  fullViewRecommendedReason;
  final SettleoraBillRevisionViewerFinancialImpact viewerFinancialImpact;
  final List<SettleoraBillRevisionChangeCategorySummary> changeSummary;
  final List<SettleoraBillRevisionChange> changes;
  final List<String> limitations;

  bool get hasSafeChangedOnlyBaseline =>
      baseline.baselineType !=
      SettleoraBillRevisionReviewBaselineTypeValues.noPriorBaseline;
}

class SettleoraBillRevisionReviewBaseline {
  const SettleoraBillRevisionReviewBaseline({
    required this.baselineType,
    required this.baselineBillRevisionId,
    required this.baselineRevisionStatus,
    required this.baselineReviewedAtUtc,
    required this.derivationReason,
  });

  final SettleoraBillRevisionReviewBaselineType baselineType;
  final String? baselineBillRevisionId;
  final SettleoraBillRevisionStatus? baselineRevisionStatus;
  final DateTime? baselineReviewedAtUtc;
  final String derivationReason;
}

class SettleoraBillRevisionViewerFinancialImpact {
  const SettleoraBillRevisionViewerFinancialImpact({
    required this.previousShare,
    required this.proposedShare,
    required this.deltaShare,
    required this.affectedByRevision,
    required this.isPayer,
    required this.payerImpact,
  });

  final SettleoraBillRevisionMoneyValue? previousShare;
  final SettleoraBillRevisionMoneyValue? proposedShare;
  final SettleoraBillRevisionMoneyValue? deltaShare;
  final bool affectedByRevision;
  final bool isPayer;
  final SettleoraBillRevisionPayerFinancialImpact? payerImpact;
}

class SettleoraBillRevisionPayerFinancialImpact {
  const SettleoraBillRevisionPayerFinancialImpact({
    required this.previousContribution,
    required this.proposedContribution,
    required this.deltaContribution,
    required this.requiresPayerConfirmation,
    required this.payerConfirmationStatus,
  });

  final SettleoraBillRevisionMoneyValue? previousContribution;
  final SettleoraBillRevisionMoneyValue? proposedContribution;
  final SettleoraBillRevisionMoneyValue? deltaContribution;
  final bool requiresPayerConfirmation;
  final SettleoraBillRevisionPayerConfirmationStatus? payerConfirmationStatus;
}

class SettleoraBillRevisionMoneyValue {
  const SettleoraBillRevisionMoneyValue({
    required this.amount,
    required this.currency,
  });

  final String amount;
  final String currency;
}

class SettleoraBillRevisionChangeCategorySummary {
  const SettleoraBillRevisionChangeCategorySummary({
    required this.category,
    required this.supportStatus,
    required this.changeCount,
    required this.viewerImpact,
  });

  final SettleoraBillRevisionReviewChangeCategory category;
  final SettleoraBillRevisionReviewSupportStatus supportStatus;
  final int changeCount;
  final SettleoraBillRevisionReviewSummaryViewerImpact viewerImpact;
}

class SettleoraBillRevisionChange {
  const SettleoraBillRevisionChange({
    required this.changeId,
    required this.changeType,
    required this.changeScope,
    required this.fieldPath,
    required this.relatedUserProfileId,
    required this.before,
    required this.after,
    required this.viewerImpact,
    required this.accessibleLabel,
    required this.reason,
  });

  final String changeId;
  final SettleoraBillRevisionReviewChangeType changeType;
  final SettleoraBillRevisionReviewChangeScope changeScope;
  final String fieldPath;
  final String? relatedUserProfileId;
  final SettleoraBillRevisionDisplayValue? before;
  final SettleoraBillRevisionDisplayValue? after;
  final SettleoraBillRevisionReviewChangeViewerImpact viewerImpact;
  final String accessibleLabel;
  final String reason;
}

class SettleoraBillRevisionDisplayValue {
  const SettleoraBillRevisionDisplayValue({
    required this.displayValue,
    required this.amount,
    required this.currency,
  });

  final String displayValue;
  final String? amount;
  final String? currency;
}

abstract class SettleoraBillRevisionRepository {
  Future<List<SettleoraBillRevision>> listBillRevisions(String billId);

  Future<SettleoraBillRevision> getBillRevision(
    String billId,
    String revisionId,
  );

  Future<SettleoraBillRevision> approveBillRevision(
    SettleoraBillRevision revision,
  );

  Future<SettleoraBillRevision> rejectBillRevision(
    String billId,
    String revisionId,
  );
}

String settleoraBillRevisionStatusLabel(SettleoraBillRevisionStatus status) {
  return switch (status) {
    SettleoraBillRevisionStatusValues.draftRevision => 'Draft revision',
    SettleoraBillRevisionStatusValues.submittedForReview =>
      'Submitted for review',
    SettleoraBillRevisionStatusValues.withdrawnByProposer =>
      'Withdrawn by proposer',
    SettleoraBillRevisionStatusValues.supersededByResubmission =>
      'Superseded by resubmission',
    SettleoraBillRevisionStatusValues.rejected => 'Rejected',
    SettleoraBillRevisionStatusValues.acceptedApplied => 'Accepted applied',
    SettleoraBillRevisionStatusValues.cancelledByAuthorizedEditor =>
      'Cancelled by authorized editor',
    _ => _titleFromCode(status),
  };
}

String settleoraBillRevisionBaselineLabel(
  SettleoraBillRevisionReviewBaselineType baselineType,
) {
  return switch (baselineType) {
    SettleoraBillRevisionReviewBaselineTypeValues.noPriorBaseline =>
      'No prior baseline',
    SettleoraBillRevisionReviewBaselineTypeValues.activeAcceptedBill =>
      'Active accepted bill',
    SettleoraBillRevisionReviewBaselineTypeValues.previousRevisionApproval =>
      'Previous revision approval',
    SettleoraBillRevisionReviewBaselineTypeValues.previousRevisionRejection =>
      'Previous revision rejection',
    _ => _titleFromCode(baselineType),
  };
}

String settleoraBillRevisionRecommendationLabel(
  SettleoraBillRevisionReviewRecommendationReason reason,
) {
  return switch (reason) {
    SettleoraBillRevisionReviewRecommendationReasonValues
        .noPriorBaselineFullBillRecommended =>
      'Full bill review is recommended because no safe prior baseline exists.',
    SettleoraBillRevisionReviewRecommendationReasonValues
        .baselineAvailableFullViewOptional =>
      'Changed-only review can start from the server-selected baseline.',
    _ => _titleFromCode(reason),
  };
}

String settleoraBillRevisionChangeCategoryLabel(
  SettleoraBillRevisionReviewChangeCategory category,
) {
  return switch (category) {
    SettleoraBillRevisionReviewChangeCategoryValues.billTotal => 'Bill total',
    SettleoraBillRevisionReviewChangeCategoryValues.participantShare =>
      'Participant share',
    SettleoraBillRevisionReviewChangeCategoryValues.payerContribution =>
      'Payer contribution',
    SettleoraBillRevisionReviewChangeCategoryValues.payerRole => 'Payer role',
    SettleoraBillRevisionReviewChangeCategoryValues.item => 'Item',
    SettleoraBillRevisionReviewChangeCategoryValues.itemSplit => 'Item split',
    SettleoraBillRevisionReviewChangeCategoryValues.adjustment => 'Adjustment',
    SettleoraBillRevisionReviewChangeCategoryValues
        .attachmentReceiptOcrReview =>
      'Attachment, receipt, or OCR review',
    SettleoraBillRevisionReviewChangeCategoryValues.noteMetadata =>
      'Note or metadata',
    _ => _titleFromCode(category),
  };
}

String settleoraBillRevisionChangeScopeLabel(
  SettleoraBillRevisionReviewChangeScope scope,
) {
  return switch (scope) {
    SettleoraBillRevisionReviewChangeScopeValues.billTotal => 'Bill total',
    SettleoraBillRevisionReviewChangeScopeValues.participantShare =>
      'Participant share',
    SettleoraBillRevisionReviewChangeScopeValues.payerContribution =>
      'Payer contribution',
    SettleoraBillRevisionReviewChangeScopeValues.payerRole => 'Payer role',
    _ => _titleFromCode(scope),
  };
}

String settleoraBillRevisionSupportStatusLabel(
  SettleoraBillRevisionReviewSupportStatus status,
) {
  return switch (status) {
    SettleoraBillRevisionReviewSupportStatusValues.supported => 'Supported',
    SettleoraBillRevisionReviewSupportStatusValues
        .unsupportedInCurrentRevisionSnapshot =>
      'Unsupported in current snapshot',
    _ => _titleFromCode(status),
  };
}

String settleoraBillRevisionViewerImpactLabel(
  SettleoraBillRevisionReviewSummaryViewerImpact impact,
) {
  return switch (impact) {
    SettleoraBillRevisionReviewSummaryViewerImpactValues.viewerAffected =>
      'Affects you',
    SettleoraBillRevisionReviewSummaryViewerImpactValues.viewerUnaffected =>
      'No direct impact',
    SettleoraBillRevisionReviewSummaryViewerImpactValues.notAvailable =>
      'Not available',
    _ => _titleFromCode(impact),
  };
}

String settleoraBillRevisionChangeViewerImpactLabel(
  SettleoraBillRevisionReviewChangeViewerImpact impact,
) {
  return switch (impact) {
    'direct_viewer_money_impact' => 'Direct money impact',
    'direct_viewer_payer_impact' => 'Direct payer impact',
    'bill_context' => 'Bill context',
    'no_direct_viewer_impact' => 'No direct impact',
    _ => _titleFromCode(impact),
  };
}

String _titleFromCode(String code) {
  return code
      .split('_')
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}
