part of 'receipt_ocr_review_screen.dart';

const _refreshReceiptOcrReviewsLabel = 'Refresh receipt reviews';
const _retryReceiptOcrReviewsLabel = 'Retry loading receipt reviews';
const _receiptOcrReviewDetailLabel = 'Receipt OCR review detail';
const _refreshReceiptOcrReviewLabel = 'Refresh receipt review';
const _editReceiptOcrReviewLabel = 'Edit receipt review';
const _cancelReceiptOcrReviewEditLabel = 'Cancel receipt review edit';
const _saveReceiptOcrReviewLabel = 'Save receipt review';
const _savingReceiptOcrReviewLabel = 'Saving receipt review';
const _deleteReceiptOcrReviewLabel = 'Delete saved OCR review';
const _deletingReceiptOcrReviewLabel = 'Deleting saved OCR review';
const _cancelReceiptOcrReviewDeletionLabel = 'Cancel receipt review deletion';
const _confirmReceiptOcrReviewDeletionLabel = 'Confirm delete saved OCR review';
const _previewReceiptOcrReviewApplyLabel = 'Preview bill draft changes';
const _loadingReceiptOcrReviewApplyPreviewLabel = 'Loading bill draft preview';
const _applyReceiptOcrReviewLabel = 'Apply OCR review to bill draft';
const _applyingReceiptOcrReviewLabel = 'Applying OCR review to bill draft';
const _cancelReceiptOcrReviewApplyLabel =
    'Cancel applying OCR review to bill draft';
const _confirmReceiptOcrReviewApplyLabel =
    'Confirm apply OCR review to bill draft';
const _provisionalReceiptOcrReviewSemanticLabel =
    'Provisional OCR data. Review before applying.';
const _headerOcrCandidatesSemanticLabel = 'Header OCR candidates, provisional';
const _totalOcrCandidatesSemanticLabel = 'Total OCR candidates, provisional';
const _lineOcrCandidatesSemanticLabel = 'Line OCR candidates, provisional';
const _lineOcrCandidateSemanticLabel = 'Line OCR candidate';
const _ocrReviewIssueSemanticLabel = 'OCR review issue';
const _receiptOcrBusyDisabledSemanticLabel =
    'Disabled while receipt review action is in progress';

class _SemanticButtonLabel extends StatelessWidget {
  const _SemanticButtonLabel({
    required this.label,
    required this.child,
    this.enabled = true,
  });

  final String label;
  final Widget child;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: label,
      child: Semantics(
        button: true,
        enabled: enabled,
        excludeSemantics: true,
        label: label,
        child: child,
      ),
    );
  }
}

String _busyActionSemanticLabel(String actionLabel) {
  return '$actionLabel. $_receiptOcrBusyDisabledSemanticLabel.';
}

String _receiptOcrReviewSummarySemanticLabel(ReceiptOcrReviewSummary review) {
  final scope = review.groupId == null ? 'personal bill' : 'group bill';
  final status = _receiptOcrReviewStatusSemanticLabel(review.status);
  final lineCount = _receiptOcrReviewLineCountSemanticLabel(review.lineCount);
  final currency = _receiptOcrReviewCurrencySemanticLabel(review.currency);

  return 'Open $scope receipt review. Scope: $scope. Status: $status. '
      '$lineCount. $currency. OCR data is provisional until applied by the server.';
}

String _receiptOcrReviewStatusSemanticLabel(ReceiptOcrReviewStatus status) {
  return switch (status) {
    ReceiptOcrReviewStatusValues.provisional => 'Provisional',
    ReceiptOcrReviewStatusValues.reviewed => 'Reviewed',
    _ => 'Other status',
  };
}

String _receiptOcrReviewLineCountSemanticLabel(int lineCount) {
  if (lineCount <= 0) {
    return 'No line candidates';
  }

  if (lineCount == 1) {
    return '1 line candidate';
  }

  if (lineCount > 50) {
    return '50 or more line candidates';
  }

  return '$lineCount line candidates';
}

String _receiptOcrReviewCurrencySemanticLabel(String? currency) {
  if (currency == null || currency.trim().isEmpty) {
    return 'No currency candidate';
  }

  final normalized = currency.trim().toUpperCase();
  if (!RegExp(r'^[A-Z]{3}$').hasMatch(normalized)) {
    return 'Currency candidate present';
  }

  return 'Currency candidate $normalized';
}
