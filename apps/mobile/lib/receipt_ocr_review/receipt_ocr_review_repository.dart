typedef ReceiptOcrReviewStatus = String;

class ReceiptOcrReviewStatusValues {
  const ReceiptOcrReviewStatusValues._();

  static const ReceiptOcrReviewStatus provisional = 'provisional';
  static const ReceiptOcrReviewStatus reviewed = 'reviewed';
}

typedef ReceiptOcrReviewSource = String;

class ReceiptOcrReviewSourceValues {
  const ReceiptOcrReviewSourceValues._();

  static const ReceiptOcrReviewSource onDevice = 'on_device';
  static const ReceiptOcrReviewSource manualEntry = 'manual_entry';
  static const ReceiptOcrReviewSource importedReviewedData =
      'imported_reviewed_data';
}

typedef ReceiptOcrReviewAdjustmentKind = String;

class ReceiptOcrReviewAdjustmentKindValues {
  const ReceiptOcrReviewAdjustmentKindValues._();

  static const ReceiptOcrReviewAdjustmentKind tip = 'tip';
  static const ReceiptOcrReviewAdjustmentKind shipping = 'shipping';
  static const ReceiptOcrReviewAdjustmentKind fee = 'fee';
  static const ReceiptOcrReviewAdjustmentKind surcharge = 'surcharge';
  static const ReceiptOcrReviewAdjustmentKind deposit = 'deposit';
  static const ReceiptOcrReviewAdjustmentKind credit = 'credit';
  static const ReceiptOcrReviewAdjustmentKind other = 'other';
}

typedef ReceiptOcrReviewAdjustmentDirection = String;

class ReceiptOcrReviewAdjustmentDirectionValues {
  const ReceiptOcrReviewAdjustmentDirectionValues._();

  static const ReceiptOcrReviewAdjustmentDirection charge = 'charge';
  static const ReceiptOcrReviewAdjustmentDirection credit = 'credit';
}

typedef ReceiptOcrReviewApplyPreviewIssueCode = String;

class ReceiptOcrReviewApplyPreviewIssueCodeValues {
  const ReceiptOcrReviewApplyPreviewIssueCodeValues._();

  static const ReceiptOcrReviewApplyPreviewIssueCode unsupportedReviewStatus =
      'unsupported_review_status';
  static const ReceiptOcrReviewApplyPreviewIssueCode unsupportedReviewSource =
      'unsupported_review_source';
  static const ReceiptOcrReviewApplyPreviewIssueCode missingCurrency =
      'missing_currency';
  static const ReceiptOcrReviewApplyPreviewIssueCode unsupportedCurrency =
      'unsupported_currency';
  static const ReceiptOcrReviewApplyPreviewIssueCode currencyMismatch =
      'currency_mismatch';
  static const ReceiptOcrReviewApplyPreviewIssueCode missingGrandTotal =
      'missing_grand_total';
  static const ReceiptOcrReviewApplyPreviewIssueCode emptyLineSet =
      'empty_line_set';
  static const ReceiptOcrReviewApplyPreviewIssueCode lineTotalMissing =
      'line_total_missing';
  static const ReceiptOcrReviewApplyPreviewIssueCode unsupportedLineState =
      'unsupported_line_state';
  static const ReceiptOcrReviewApplyPreviewIssueCode lineTotalMismatch =
      'line_total_mismatch';
  static const ReceiptOcrReviewApplyPreviewIssueCode lineSumMismatch =
      'line_sum_mismatch';
  static const ReceiptOcrReviewApplyPreviewIssueCode headerTotalMismatch =
      'header_total_mismatch';
  static const ReceiptOcrReviewApplyPreviewIssueCode adjustmentsNotAutoApplied =
      'adjustments_not_auto_applied';
  static const ReceiptOcrReviewApplyPreviewIssueCode
  adjustmentCurrencyNotReconciled = 'adjustment_currency_not_reconciled';
}

class ReceiptOcrReviewRoute {
  const ReceiptOcrReviewRoute({
    required this.billId,
    required this.fileId,
    this.groupId,
  });

  factory ReceiptOcrReviewRoute.fromSummary(ReceiptOcrReviewSummary summary) {
    return ReceiptOcrReviewRoute(
      billId: summary.billId,
      fileId: summary.fileId,
      groupId: summary.groupId,
    );
  }

  final String billId;
  final String fileId;
  final String? groupId;

  bool get isGroupReview => groupId != null;
}

class ReceiptOcrReviewSummary {
  const ReceiptOcrReviewSummary({
    required this.reviewId,
    required this.billId,
    required this.groupId,
    required this.fileId,
    required this.status,
    required this.source,
    required this.merchantText,
    required this.currency,
    required this.lineCount,
    required this.createdAtUtc,
    required this.updatedAtUtc,
  });

  final String reviewId;
  final String billId;
  final String? groupId;
  final String fileId;
  final ReceiptOcrReviewStatus status;
  final ReceiptOcrReviewSource source;
  final String? merchantText;
  final String? currency;
  final int lineCount;
  final DateTime createdAtUtc;
  final DateTime updatedAtUtc;
}

class ReceiptOcrReviewDetail {
  const ReceiptOcrReviewDetail({
    required this.id,
    required this.billId,
    required this.fileId,
    required this.groupId,
    required this.status,
    required this.source,
    required this.merchantText,
    required this.receiptIssuedAtUtc,
    required this.currency,
    required this.subtotalAmount,
    required this.taxAmount,
    required this.serviceChargeAmount,
    required this.discountAmount,
    required this.grandTotalAmount,
    required this.lines,
    this.adjustmentEvidence = const [],
    required this.createdAtUtc,
    required this.updatedAtUtc,
  });

  final String id;
  final String billId;
  final String fileId;
  final String? groupId;
  final ReceiptOcrReviewStatus status;
  final ReceiptOcrReviewSource source;
  final String? merchantText;
  final DateTime? receiptIssuedAtUtc;
  final String? currency;
  final String? subtotalAmount;
  final String? taxAmount;
  final String? serviceChargeAmount;
  final String? discountAmount;
  final String? grandTotalAmount;
  final List<ReceiptOcrReviewLine> lines;
  final List<ReceiptOcrReviewAdjustment> adjustmentEvidence;
  final DateTime createdAtUtc;
  final DateTime updatedAtUtc;
}

class ReceiptOcrReviewAdjustment {
  const ReceiptOcrReviewAdjustment({
    required this.id,
    required this.sortOrder,
    required this.kind,
    required this.originalLabel,
    required this.amount,
    required this.currency,
    required this.direction,
    required this.createdAtUtc,
    required this.updatedAtUtc,
  });

  final String id;
  final int sortOrder;
  final ReceiptOcrReviewAdjustmentKind kind;
  final String originalLabel;
  final String amount;
  final String currency;
  final ReceiptOcrReviewAdjustmentDirection direction;
  final DateTime createdAtUtc;
  final DateTime updatedAtUtc;
}

class ReceiptOcrReviewLine {
  const ReceiptOcrReviewLine({
    required this.id,
    required this.sortOrder,
    required this.text,
    required this.quantity,
    required this.unitPriceAmount,
    required this.lineTotalAmount,
    required this.createdAtUtc,
    required this.updatedAtUtc,
  });

  final String id;
  final int sortOrder;
  final String text;
  final String? quantity;
  final String? unitPriceAmount;
  final String? lineTotalAmount;
  final DateTime createdAtUtc;
  final DateTime updatedAtUtc;
}

class ReceiptOcrReviewSaveRequest {
  const ReceiptOcrReviewSaveRequest({
    required this.status,
    required this.source,
    required this.merchantText,
    required this.receiptIssuedAtUtc,
    required this.currency,
    required this.subtotalAmount,
    required this.taxAmount,
    required this.serviceChargeAmount,
    required this.discountAmount,
    required this.grandTotalAmount,
    required this.lines,
    this.adjustmentEvidence = const [],
  });

  final ReceiptOcrReviewStatus status;
  final ReceiptOcrReviewSource source;
  final String? merchantText;
  final DateTime? receiptIssuedAtUtc;
  final String? currency;
  final String? subtotalAmount;
  final String? taxAmount;
  final String? serviceChargeAmount;
  final String? discountAmount;
  final String? grandTotalAmount;
  final List<ReceiptOcrReviewLineSaveRequest> lines;
  final List<ReceiptOcrReviewAdjustmentSaveRequest> adjustmentEvidence;
}

class ReceiptOcrReviewAdjustmentSaveRequest {
  const ReceiptOcrReviewAdjustmentSaveRequest({
    required this.kind,
    required this.originalLabel,
    required this.amount,
    required this.currency,
    required this.direction,
  });

  final ReceiptOcrReviewAdjustmentKind kind;
  final String originalLabel;
  final String amount;
  final String currency;
  final ReceiptOcrReviewAdjustmentDirection direction;
}

class ReceiptOcrReviewLineSaveRequest {
  const ReceiptOcrReviewLineSaveRequest({
    required this.text,
    required this.quantity,
    required this.unitPriceAmount,
    required this.lineTotalAmount,
  });

  final String text;
  final String? quantity;
  final String? unitPriceAmount;
  final String? lineTotalAmount;
}

class ReceiptOcrReviewApplyPreview {
  const ReceiptOcrReviewApplyPreview({
    required this.reviewId,
    required this.billId,
    required this.groupId,
    required this.fileId,
    required this.status,
    required this.source,
    required this.proposedMerchantText,
    required this.proposedReceiptIssuedAtUtc,
    required this.proposedCurrency,
    required this.proposedSubtotalAmount,
    required this.proposedTaxAmount,
    required this.proposedServiceChargeAmount,
    required this.proposedDiscountAmount,
    required this.proposedGrandTotalAmount,
    required this.proposedLines,
    this.adjustmentEvidence = const [],
    required this.summary,
    required this.canApply,
    required this.blockedReasons,
    required this.warnings,
    required this.createdAtUtc,
    required this.updatedAtUtc,
  });

  final String reviewId;
  final String billId;
  final String? groupId;
  final String fileId;
  final ReceiptOcrReviewStatus status;
  final ReceiptOcrReviewSource source;
  final String? proposedMerchantText;
  final DateTime? proposedReceiptIssuedAtUtc;
  final String? proposedCurrency;
  final String? proposedSubtotalAmount;
  final String? proposedTaxAmount;
  final String? proposedServiceChargeAmount;
  final String? proposedDiscountAmount;
  final String? proposedGrandTotalAmount;
  final List<ReceiptOcrReviewPreviewLine> proposedLines;
  final List<ReceiptOcrReviewAdjustment> adjustmentEvidence;
  final ReceiptOcrReviewPreviewSummary summary;
  final bool canApply;
  final List<ReceiptOcrReviewApplyPreviewIssueCode> blockedReasons;
  final List<ReceiptOcrReviewApplyPreviewIssueCode> warnings;
  final DateTime createdAtUtc;
  final DateTime updatedAtUtc;
}

class ReceiptOcrReviewPreviewLine {
  const ReceiptOcrReviewPreviewLine({
    required this.reviewLineId,
    required this.sortOrder,
    required this.text,
    required this.quantity,
    required this.unitPriceAmount,
    required this.lineTotalAmount,
    required this.proposedLineTotalAmount,
  });

  final String reviewLineId;
  final int sortOrder;
  final String text;
  final String? quantity;
  final String? unitPriceAmount;
  final String? lineTotalAmount;
  final String? proposedLineTotalAmount;
}

class ReceiptOcrReviewPreviewSummary {
  const ReceiptOcrReviewPreviewSummary({
    required this.lineCount,
    required this.linesWithProposedTotalCount,
    required this.linesMissingProposedTotalCount,
    this.adjustmentEvidenceCount = 0,
    this.autoAppliedAdjustmentCount = 0,
    required this.proposedLineTotalSumAmount,
    this.reconciledAdjustmentChargeTotalAmount,
    this.reconciledAdjustmentCreditTotalAmount,
    required this.expectedHeaderTotalAmount,
  });

  final int lineCount;
  final int linesWithProposedTotalCount;
  final int linesMissingProposedTotalCount;
  final int adjustmentEvidenceCount;
  final int autoAppliedAdjustmentCount;
  final String? proposedLineTotalSumAmount;
  final String? reconciledAdjustmentChargeTotalAmount;
  final String? reconciledAdjustmentCreditTotalAmount;
  final String? expectedHeaderTotalAmount;
}

class ReceiptOcrReviewApplyResult {
  const ReceiptOcrReviewApplyResult({
    required this.reviewId,
    required this.billId,
    required this.groupId,
    required this.fileId,
    required this.applyMode,
    required this.appliedItemCount,
    required this.currency,
    required this.subtotalAmount,
    required this.grandTotalAmount,
    required this.summary,
    required this.blockedReasons,
    required this.warnings,
    required this.appliedAtUtc,
  });

  final String reviewId;
  final String billId;
  final String? groupId;
  final String fileId;
  final String applyMode;
  final int appliedItemCount;
  final String currency;
  final String? subtotalAmount;
  final String? grandTotalAmount;
  final ReceiptOcrReviewPreviewSummary summary;
  final List<ReceiptOcrReviewApplyPreviewIssueCode> blockedReasons;
  final List<ReceiptOcrReviewApplyPreviewIssueCode> warnings;
  final DateTime appliedAtUtc;
}

enum ReceiptOcrReviewFailureKind {
  unauthenticated,
  denied,
  unavailable,
  conflict,
  validation,
  network,
  server,
}

class ReceiptOcrReviewFailure implements Exception {
  const ReceiptOcrReviewFailure({
    required this.kind,
    required this.message,
    this.statusCode,
  });

  factory ReceiptOcrReviewFailure.from(Object error) {
    if (error is ReceiptOcrReviewFailure) {
      return error;
    }

    return const ReceiptOcrReviewFailure(
      kind: ReceiptOcrReviewFailureKind.network,
      message:
          'The server is unavailable. Try again when the connection is back.',
    );
  }

  final ReceiptOcrReviewFailureKind kind;
  final String message;
  final int? statusCode;

  String get title {
    return switch (kind) {
      ReceiptOcrReviewFailureKind.unauthenticated => 'Sign in required',
      ReceiptOcrReviewFailureKind.denied => 'Access unavailable',
      ReceiptOcrReviewFailureKind.unavailable => 'Review unavailable',
      ReceiptOcrReviewFailureKind.conflict => 'Refresh required',
      ReceiptOcrReviewFailureKind.validation => 'Unsupported request',
      ReceiptOcrReviewFailureKind.network => 'Server unavailable',
      ReceiptOcrReviewFailureKind.server => 'Review unavailable',
    };
  }

  @override
  String toString() =>
      'ReceiptOcrReviewFailure($kind, statusCode: $statusCode)';
}

abstract class ReceiptOcrReviewRepository {
  Future<List<ReceiptOcrReviewSummary>> listReviews({
    ReceiptOcrReviewStatus? status,
    ReceiptOcrReviewSource? source,
    int? limit,
  });

  Future<ReceiptOcrReviewDetail> getReview(ReceiptOcrReviewRoute route);

  Future<ReceiptOcrReviewDetail> saveReview(
    ReceiptOcrReviewRoute route,
    ReceiptOcrReviewSaveRequest request,
  );

  Future<void> deleteReview(ReceiptOcrReviewRoute route);

  Future<ReceiptOcrReviewApplyPreview> previewApply(
    ReceiptOcrReviewRoute route,
  );

  Future<ReceiptOcrReviewApplyResult> applyReview(
    ReceiptOcrReviewRoute route, {
    required DateTime expectedReviewUpdatedAtUtc,
  });
}
