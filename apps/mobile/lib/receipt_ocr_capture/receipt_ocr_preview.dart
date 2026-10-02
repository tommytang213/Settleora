const int receiptOcrReviewLineLimit = 100;

class ReceiptOcrPreview {
  const ReceiptOcrPreview({
    this.merchant,
    this.receiptDate,
    this.currency,
    this.currencyProvenance = ReceiptOcrCurrencyProvenance.explicit,
    this.subtotal,
    this.subtotalCurrency,
    this.subtotalHasExplicitCurrencyEvidence = false,
    this.tax,
    this.taxCurrency,
    this.taxHasExplicitCurrencyEvidence = false,
    this.taxIncludedInTotal = false,
    this.service,
    this.serviceCurrency,
    this.serviceHasExplicitCurrencyEvidence = false,
    this.tip,
    this.tipLabel,
    this.tipCurrency,
    this.tipHasExplicitCurrencyEvidence = false,
    this.shipping,
    this.shippingLabel,
    this.shippingCurrency,
    this.shippingHasExplicitCurrencyEvidence = false,
    this.discount,
    this.discountCurrency,
    this.discountHasExplicitCurrencyEvidence = false,
    this.discountBeforeSubtotal = false,
    this.adjustmentsComplete = true,
    this.incompleteAdjustmentReasons = const [],
    this.itemLineDecisions = const [],
    this.itemSelectionDecisions = const [],
    this.total,
    this.rawTextLineCount = 0,
    this.confidence,
    this.category,
    this.warnings = const [],
    this.items = const [],
    this.blocks = const [],
    this.runEvidence,
  });

  final String? merchant;
  final String? receiptDate;
  final String? currency;
  final ReceiptOcrCurrencyProvenance currencyProvenance;
  final String? subtotal;
  final String? subtotalCurrency;
  final bool subtotalHasExplicitCurrencyEvidence;
  final String? tax;
  final String? taxCurrency;
  final bool taxHasExplicitCurrencyEvidence;
  // A printed included-tax component describes the total, not an addition.
  final bool taxIncludedInTotal;
  final String? service;
  final String? serviceCurrency;
  final bool serviceHasExplicitCurrencyEvidence;
  final String? tip;
  final String? tipLabel;
  final String? tipCurrency;
  final bool tipHasExplicitCurrencyEvidence;
  final String? shipping;
  final String? shippingLabel;
  final String? shippingCurrency;
  final bool shippingHasExplicitCurrencyEvidence;
  final String? discount;
  final String? discountCurrency;
  final bool discountHasExplicitCurrencyEvidence;
  // Printed order is evidence for a before-subtotal promotion. This remains
  // provisional and never changes the printed subtotal or total.
  final bool discountBeforeSubtotal;
  final bool adjustmentsComplete;
  final List<ReceiptOcrIncompleteAdjustmentReason> incompleteAdjustmentReasons;
  final List<ReceiptOcrItemLineDecision> itemLineDecisions;
  // One fixed role per retained item, aligned with items for bounded tests.
  final List<ReceiptOcrItemLineDecision> itemSelectionDecisions;
  final String? total;
  final int rawTextLineCount;
  final double? confidence;
  final String? category;
  final List<String> warnings;
  final List<ReceiptOcrItemCandidate> items;
  final List<ReceiptOcrBlockEvidence> blocks;
  final ReceiptOcrRunEvidence? runEvidence;

  List<String> get reviewHints {
    return _receiptOcrReviewHints(this);
  }

  // Fixed vocabulary for bounded native acceptance diagnostics. No OCR text
  // or monetary values are included in this decision.
  ReceiptOcrReviewDecision get reviewHintDecision {
    var decision = ReceiptOcrReviewDecision.none;
    _receiptOcrReviewHints(this, onDecision: (value) => decision = value);
    return decision;
  }

  bool get hasApplyableFields {
    return merchant != null ||
        receiptDate != null ||
        currency != null ||
        items.isNotEmpty;
  }
}

enum ReceiptOcrCurrencyProvenance {
  explicit,
  contextInferred,
  defaultFallback,
  unresolved,
}

enum ReceiptOcrReviewDecision {
  none,
  itemSumUnavailableWithAdjustment,
  subtotalMismatch,
  incompleteAdjustmentWithSubtotal,
  referenceAdjustmentUnreconciledWithSubtotal,
  grandTotalMismatchWithSubtotal,
  foreignAdjustmentWithSubtotal,
  incompleteAdjustmentWithoutSubtotal,
  referenceAdjustmentUnreconciledWithoutSubtotal,
  grandTotalMismatchWithoutSubtotal,
  foreignAdjustmentWithoutSubtotal,
}

enum ReceiptOcrIncompleteAdjustmentReason {
  labeledAmountEvidence,
  detachedLabeledSign,
  chargeTableAdjustment,
  multipleAdjustmentRoles,
  adjustmentAmountMissingOrRate,
  multipleMonetaryTokens,
  unclassifiedAdjustmentLabel,
  subtotalAmountMissingOrRate,
  conflictingSubtotal,
  repeatedAdjustmentRole,
  itemLimit,
  unretainedPricedItem,
  detachedAmountSign,
  ambiguousChargeTable,
  unresolvedItemLikeLine,
}

enum ReceiptOcrItemLineDecision {
  unclassified,
  fuelItemSelected,
  layoutChargeSelected,
  ambiguousChargeSkipped,
  metadataOrHeaderSkipped,
  standaloneAmountSkipped,
  layoutFallbackSelected,
  adjacentAmountSelected,
  unpricedDescription,
  unretainedPricedRow,
  invalidPricedRow,
  quantityItemSelected,
  leadingQuantityItemSelected,
  pricedItemSelected,
}

class ReceiptOcrPoint {
  const ReceiptOcrPoint({required this.x, required this.y});
  final double x;
  final double y;
}

class ReceiptOcrBlockEvidence {
  const ReceiptOcrBlockEvidence({
    required this.text,
    required this.order,
    this.row = 0,
    this.confidence,
    this.modelPackId,
    this.modelVersion,
    this.textDirection,
    this.points = const [],
  });
  final String text;
  final int order;
  final int row;
  final double? confidence;
  final String? modelPackId;
  final String? modelVersion;
  final String? textDirection;
  final List<ReceiptOcrPoint> points;
}

class ReceiptOcrRunEvidence {
  const ReceiptOcrRunEvidence({
    this.detectionModelPackId,
    this.detectionModelVersion,
    this.runtime,
    this.coldLoadTimeMs,
    this.detectionTimeMs,
    this.recognitionTimeMs,
    this.totalTimeMs,
  });
  final String? detectionModelPackId;
  final String? detectionModelVersion;
  final String? runtime;
  final int? coldLoadTimeMs;
  final int? detectionTimeMs;
  final int? recognitionTimeMs;
  final int? totalTimeMs;
}

class ReceiptOcrItemCandidate {
  const ReceiptOcrItemCandidate({
    required this.description,
    this.quantity,
    this.unitPrice,
    this.lineTotal,
    this.currency,
    this.currencyUnresolved = false,
    this.confidence,
    this.category,
  });

  final String description;
  final String? quantity;
  final String? unitPrice;
  final String? lineTotal;
  final String? currency;
  final bool currencyUnresolved;
  final double? confidence;
  final String? category;
}

List<String> _receiptOcrReviewHints(
  ReceiptOcrPreview preview, {
  void Function(ReceiptOcrReviewDecision)? onDecision,
}) {
  final itemTotal = _sumReceiptOcrItemLineTotals(
    preview.items,
    reviewCurrency: preview.currency,
  );
  if (itemTotal == null) {
    if (_parseReceiptOcrReviewAmount(preview.total) != null &&
        (!preview.adjustmentsComplete ||
            _hasReceiptOcrReferenceAdjustment(preview) ||
            _hasReceiptOcrForeignAdjustment(preview))) {
      onDecision?.call(
        ReceiptOcrReviewDecision.itemSumUnavailableWithAdjustment,
      );
      return const [
        'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
      ];
    }
    return const [];
  }

  final subtotalMatchesCurrency = _adjustmentCurrencyMatchesReview(
    reviewCurrency: preview.currency,
    adjustmentCurrency: preview.subtotalCurrency,
    hasExplicitCurrencyEvidence: preview.subtotalHasExplicitCurrencyEvidence,
  );
  final subtotal = subtotalMatchesCurrency
      ? _parseReceiptOcrReviewAmount(preview.subtotal)
      : null;
  if (subtotalMatchesCurrency && _hasReviewAmountText(preview.subtotal)) {
    if (subtotal == null) {
      return const [];
    }
    final beforeSubtotalDiscount =
        preview.discountBeforeSubtotal &&
            _adjustmentCurrencyMatchesReview(
              reviewCurrency: preview.currency,
              adjustmentCurrency: preview.discountCurrency,
              hasExplicitCurrencyEvidence:
                  preview.discountHasExplicitCurrencyEvidence,
            )
        ? _parseReceiptOcrReviewAmount(preview.discount)
        : null;
    if (!_receiptOcrAmountsClose(itemTotal, subtotal) &&
        (beforeSubtotalDiscount == null ||
            !_receiptOcrAmountsClose(
              itemTotal + beforeSubtotalDiscount,
              subtotal,
            ))) {
      onDecision?.call(ReceiptOcrReviewDecision.subtotalMismatch);
      return const [
        'OCR item total differs from detected subtotal. Review the receipt before applying.',
      ];
    }

    final total = _parseReceiptOcrReviewAmount(preview.total);
    if (total != null && !preview.adjustmentsComplete) {
      onDecision?.call(
        ReceiptOcrReviewDecision.incompleteAdjustmentWithSubtotal,
      );
      return const [
        'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
      ];
    }
    if (total != null && _hasReceiptOcrReferenceAdjustment(preview)) {
      final adjustments = _reconcilableReceiptOcrAdjustments(preview);
      if (preview.adjustmentsComplete &&
          (preview.currency?.trim().isNotEmpty ?? false) &&
          _hasCompleteReceiptOcrItemLineTotals(preview.items) &&
          adjustments != null &&
          _receiptOcrAmountsClose(itemTotal + adjustments, total)) {
        return const [];
      }
      onDecision?.call(
        ReceiptOcrReviewDecision.referenceAdjustmentUnreconciledWithSubtotal,
      );
      return const [
        'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
      ];
    }

    if (total != null && !_receiptOcrAmountsClose(itemTotal, total)) {
      onDecision?.call(ReceiptOcrReviewDecision.grandTotalMismatchWithSubtotal);
      return const [
        'OCR item total differs from detected grand total. Review the receipt before applying.',
      ];
    }

    if (_hasReceiptOcrForeignAdjustment(preview)) {
      onDecision?.call(ReceiptOcrReviewDecision.foreignAdjustmentWithSubtotal);
      return const [
        'Detected adjustment currency differs from receipt currency. Review before applying.',
      ];
    }

    return const [];
  }

  final total = _parseReceiptOcrReviewAmount(preview.total);
  if (total == null) {
    return const [];
  }

  if (!preview.adjustmentsComplete) {
    onDecision?.call(
      ReceiptOcrReviewDecision.incompleteAdjustmentWithoutSubtotal,
    );
    return const [
      'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
    ];
  }

  if (_hasReceiptOcrReferenceAdjustment(preview)) {
    final adjustments = _reconcilableReceiptOcrAdjustments(preview);
    if (preview.adjustmentsComplete &&
        (preview.currency?.trim().isNotEmpty ?? false) &&
        _hasCompleteReceiptOcrItemLineTotals(preview.items) &&
        adjustments != null &&
        _receiptOcrAmountsClose(itemTotal + adjustments, total)) {
      return const [];
    }
    onDecision?.call(
      ReceiptOcrReviewDecision.referenceAdjustmentUnreconciledWithoutSubtotal,
    );
    return const [
      'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
    ];
  }

  if (!_receiptOcrAmountsClose(itemTotal, total)) {
    onDecision?.call(
      ReceiptOcrReviewDecision.grandTotalMismatchWithoutSubtotal,
    );
    return const [
      'OCR item total differs from detected grand total. Review the receipt before applying.',
    ];
  }

  if (_hasReceiptOcrForeignAdjustment(preview)) {
    onDecision?.call(ReceiptOcrReviewDecision.foreignAdjustmentWithoutSubtotal);
    return const [
      'Detected adjustment currency differs from receipt currency. Review before applying.',
    ];
  }

  return const [];
}

int? _sumReceiptOcrItemLineTotals(
  List<ReceiptOcrItemCandidate> items, {
  String? reviewCurrency,
}) {
  int? total;
  for (final item in items) {
    if (item.currencyUnresolved) return null;
    final amount = _parseReceiptOcrReviewAmount(item.lineTotal);
    if (amount == null) {
      continue;
    }
    final printedCurrency = item.currency?.trim().toUpperCase();
    if (printedCurrency != null &&
        printedCurrency.isNotEmpty &&
        reviewCurrency != null &&
        printedCurrency != reviewCurrency.trim().toUpperCase()) {
      // A foreign-denominated item remains review evidence, but its number
      // cannot corroborate a subtotal or total in the receipt currency.
      return null;
    }
    total = (total ?? 0) + amount;
  }

  return total;
}

bool _hasCompleteReceiptOcrItemLineTotals(List<ReceiptOcrItemCandidate> items) {
  return items.every(
    (item) => _parseReceiptOcrReviewAmount(item.lineTotal) != null,
  );
}

bool _hasReceiptOcrReferenceAdjustment(ReceiptOcrPreview preview) {
  final entries = [
    (preview.tax, preview.taxCurrency, preview.taxHasExplicitCurrencyEvidence),
    (
      preview.service,
      preview.serviceCurrency,
      preview.serviceHasExplicitCurrencyEvidence,
    ),
    (preview.tip, preview.tipCurrency, preview.tipHasExplicitCurrencyEvidence),
    (
      preview.shipping,
      preview.shippingCurrency,
      preview.shippingHasExplicitCurrencyEvidence,
    ),
    (
      preview.discount,
      preview.discountCurrency,
      preview.discountHasExplicitCurrencyEvidence,
    ),
  ];
  return entries.any(
    (entry) =>
        _adjustmentCurrencyMatchesReview(
          reviewCurrency: preview.currency,
          adjustmentCurrency: entry.$2,
          hasExplicitCurrencyEvidence: entry.$3,
        ) &&
        _parseReceiptOcrReviewAmount(entry.$1) != null,
  );
}

bool _hasReceiptOcrForeignAdjustment(ReceiptOcrPreview preview) {
  final entries = [
    (preview.tax, preview.taxCurrency, preview.taxHasExplicitCurrencyEvidence),
    (
      preview.service,
      preview.serviceCurrency,
      preview.serviceHasExplicitCurrencyEvidence,
    ),
    (preview.tip, preview.tipCurrency, preview.tipHasExplicitCurrencyEvidence),
    (
      preview.shipping,
      preview.shippingCurrency,
      preview.shippingHasExplicitCurrencyEvidence,
    ),
    (
      preview.discount,
      preview.discountCurrency,
      preview.discountHasExplicitCurrencyEvidence,
    ),
  ];
  return entries.any(
    (entry) =>
        _hasReviewAmountText(entry.$1) &&
        !_adjustmentCurrencyMatchesReview(
          reviewCurrency: preview.currency,
          adjustmentCurrency: entry.$2,
          hasExplicitCurrencyEvidence: entry.$3,
        ),
  );
}

int? _reconcilableReceiptOcrAdjustments(ReceiptOcrPreview preview) {
  final entries = [
    (
      preview.tax,
      preview.taxCurrency,
      preview.taxHasExplicitCurrencyEvidence,
      false,
      preview.taxIncludedInTotal,
    ),
    (
      preview.service,
      preview.serviceCurrency,
      preview.serviceHasExplicitCurrencyEvidence,
      false,
      false,
    ),
    (
      preview.tip,
      preview.tipCurrency,
      preview.tipHasExplicitCurrencyEvidence,
      false,
      false,
    ),
    (
      preview.shipping,
      preview.shippingCurrency,
      preview.shippingHasExplicitCurrencyEvidence,
      false,
      false,
    ),
    (
      preview.discount,
      preview.discountCurrency,
      preview.discountHasExplicitCurrencyEvidence,
      true,
      false,
    ),
  ];
  var total = 0;
  var found = false;
  for (final (
        text,
        currency,
        hasExplicitCurrencyEvidence,
        isDiscount,
        isIncluded,
      )
      in entries) {
    if (!_hasReviewAmountText(text)) continue;
    if (!_adjustmentCurrencyMatchesReview(
      reviewCurrency: preview.currency,
      adjustmentCurrency: currency,
      hasExplicitCurrencyEvidence: hasExplicitCurrencyEvidence,
    )) {
      return null;
    }
    final amount = _parseReceiptOcrReviewAmount(text);
    if (amount == null) return null;
    total += isIncluded
        ? 0
        : isDiscount
        ? -amount.abs()
        : amount;
    found = true;
  }
  return found ? total : null;
}

bool _adjustmentCurrencyMatchesReview({
  required String? reviewCurrency,
  required String? adjustmentCurrency,
  required bool hasExplicitCurrencyEvidence,
}) {
  if (!hasExplicitCurrencyEvidence) return true;
  final normalizedReview = reviewCurrency?.trim().toUpperCase();
  final normalizedAdjustment = adjustmentCurrency?.trim().toUpperCase();
  return normalizedReview != null &&
      normalizedReview.isNotEmpty &&
      normalizedAdjustment == normalizedReview;
}

bool _hasReviewAmountText(String? value) {
  return (value ?? '').trim().isNotEmpty;
}

bool _receiptOcrAmountsClose(int left, int right) {
  return (left - right).abs() <= 10;
}

int? _parseReceiptOcrReviewAmount(String? value) {
  final normalized = value?.trim();
  if (normalized == null ||
      !RegExp(r'^-?\d+(?:\.\d{1,3})?$').hasMatch(normalized)) {
    return null;
  }

  final sign = normalized.startsWith('-') ? -1 : 1;
  final unsigned = normalized.startsWith('-')
      ? normalized.substring(1)
      : normalized;
  final parts = unsigned.split('.');
  final major = int.tryParse(parts.first);
  if (major == null) {
    return null;
  }

  final fraction = parts.length == 2 ? parts[1].padRight(3, '0') : '000';
  final minor = int.tryParse(fraction);
  if (minor == null) {
    return null;
  }

  return sign * ((major * 1000) + minor);
}
