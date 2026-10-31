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
    this.unresolvedItemLikeCount = 0,
    this.unresolvedItemLikeRoleCounts = const {},
    this.nordicFooterOwnershipFailureCounts = const {},
    this.unresolvedOtherBranchDecisionCounts = const {},
    this.total,
    this.rawTextLineCount = 0,
    this.confidence,
    this.category,
    this.warnings = const [],
    this.items = const [],
    this.blocks = const [],
    this.runEvidence,
    this.parserDiagnostics,
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
  // Fixed count vocabularies for native diagnostics; no row identity or text.
  final int unresolvedItemLikeCount;
  final Map<ReceiptOcrUnresolvedItemLikeRole, int> unresolvedItemLikeRoleCounts;
  final Map<ReceiptOcrNordicFooterOwnershipFailure, int>
  nordicFooterOwnershipFailureCounts;
  final Map<
    ReceiptOcrUnresolvedOtherBranch,
    Map<ReceiptOcrItemLineDecision, int>
  >
  unresolvedOtherBranchDecisionCounts;
  final String? total;
  final int rawTextLineCount;
  final double? confidence;
  final String? category;
  final List<String> warnings;
  final List<ReceiptOcrItemCandidate> items;
  final List<ReceiptOcrBlockEvidence> blocks;
  final ReceiptOcrRunEvidence? runEvidence;
  final ReceiptOcrParserDiagnostics? parserDiagnostics;

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

enum ReceiptOcrUnresolvedItemLikeRole { nordicCourtesy, other }

enum ReceiptOcrUnresolvedOtherBranch {
  explicitModifier,
  ordinaryCourtesy,
  otherDescription,
}

enum ReceiptOcrNordicFooterOwnershipFailure {
  noTotal,
  notLastRow,
  notAfterTotal,
  layoutRowCountMismatch,
  unownedFinancialEvidence,
  missingBounds,
  overlapTransaction,
  nonpositiveContentWidth,
  footerTooWide,
  footerOffCenter,
  other,
}

enum ReceiptOcrReviewDecision {
  none,
  foreignItemCurrency,
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

enum ReceiptOcrNumericRoutingStatus { observed, unavailable, invalid }

// Run-level candidate shape only, before recovery/emission. These observations
// neither identify a receipt field nor establish that an alternative is right.
class ReceiptOcrNumericRoutingObservation {
  const ReceiptOcrNumericRoutingObservation._(
    this.status, {
    this.counts = const {},
    this.selectedDigitCountBins = const {},
  });

  static const stage = 'selectedOrientationPreRecovery';
  static const countKeys = [
    'observedCropCount',
    'numericCandidateCropCount',
    'eligibleNumericCandidateCropCount',
    'competingEligibleNumericCandidateCropCount',
    'eligibleNumericLiteralDisagreementCropCount',
    'selectedShorterThanEligibleNumericAlternateCropCount',
    'selectedShorterThanAnyNumericAlternateCropCount',
  ];
  static const binKeys = [
    'noSelection',
    'nonNumeric',
    'one',
    'two',
    'three',
    'four',
    'fiveToEight',
    'ninePlus',
  ];
  static const unavailable = ReceiptOcrNumericRoutingObservation._(
    ReceiptOcrNumericRoutingStatus.unavailable,
  );
  static const invalid = ReceiptOcrNumericRoutingObservation._(
    ReceiptOcrNumericRoutingStatus.invalid,
  );

  final ReceiptOcrNumericRoutingStatus status;
  final Map<String, int> counts;
  final Map<String, int> selectedDigitCountBins;

  static bool _exactKeys(Map<Object?, Object?> value, List<String> keys) =>
      value.length == keys.length && keys.every(value.containsKey);

  static Map<String, int>? _counts(Object? value, List<String> keys) {
    if (value is! Map<Object?, Object?> || !_exactKeys(value, keys)) {
      return null;
    }
    if (keys.any(
      (key) =>
          value[key] is! int ||
          (value[key]! as int) < 0 ||
          (value[key]! as int) > 256,
    )) {
      return null;
    }
    return Map.unmodifiable({for (final key in keys) key: value[key]! as int});
  }

  // Optional malformed diagnostics must not convert a successful OCR response
  // into provider failure, and their payload must never enter retained evidence.
  static ReceiptOcrNumericRoutingObservation fromChannel(Object? value) {
    try {
      if (value is! Map<Object?, Object?> ||
          value['schemaVersion'] != 1 ||
          value['schemaVersion'] is! int ||
          value['stage'] != stage) {
        return invalid;
      }
      const envelope = ['schemaVersion', 'stage', 'status'];
      if (value['status'] == 'unavailable' || value['status'] == 'invalid') {
        if (!_exactKeys(value, envelope)) return invalid;
        return value['status'] == 'unavailable' ? unavailable : invalid;
      }
      if (value['status'] != 'observed' ||
          !_exactKeys(value, [
            ...envelope,
            ...countKeys,
            'selectedDigitCountBins',
          ])) {
        return invalid;
      }
      final counts = _counts({
        for (final key in countKeys) key: value[key],
      }, countKeys);
      final bins = _counts(value['selectedDigitCountBins'], binKeys);
      if (counts == null || bins == null) return invalid;
      final observed = counts[countKeys[0]]!;
      final anyNumeric = counts[countKeys[1]]!;
      final eligible = counts[countKeys[2]]!;
      final competing = counts[countKeys[3]]!;
      final disagreement = counts[countKeys[4]]!;
      final eligibleShorter = counts[countKeys[5]]!;
      final anyShorter = counts[countKeys[6]]!;
      final selectedNumeric =
          bins.values.fold(0, (a, b) => a + b) -
          bins['noSelection']! -
          bins['nonNumeric']!;
      if (bins.values.fold(0, (a, b) => a + b) != observed ||
          disagreement > competing ||
          competing > eligible ||
          eligible > anyNumeric ||
          anyNumeric > observed ||
          eligible > observed - bins['noSelection']! ||
          selectedNumeric > eligible ||
          eligibleShorter > anyShorter ||
          anyShorter > selectedNumeric ||
          eligibleShorter > disagreement) {
        return invalid;
      }
      return ReceiptOcrNumericRoutingObservation._(
        ReceiptOcrNumericRoutingStatus.observed,
        counts: counts,
        selectedDigitCountBins: bins,
      );
    } catch (_) {
      return invalid;
    }
  }

  Map<String, Object> toBoundedEvidence() => {
    'schemaVersion': 1,
    'stage': stage,
    'status': status.name,
    if (status == ReceiptOcrNumericRoutingStatus.observed) ...{
      // Version 1 fixes these tuple orders to countKeys/binKeys. Repeating the
      // long channel keys for 101 fixtures would exceed the marker byte bound.
      'counts': [for (final key in countKeys) counts[key]!],
      'bins': [for (final key in binKeys) selectedDigitCountBins[key]!],
    },
  };
}

// Fixed tuple vocabulary: counts only, never source text, values or geometry.
// Opt-in parser observations cannot participate in selection or review policy.
enum ReceiptOcrQuantityPredicate {
  candidate,
  pricedRow,
  rowMatched,
  separateDigitCell,
  geometryPresent,
  separatedCells,
  headingFound,
  headingGeometry,
  underQuantityHeading,
  underItemHeading,
  alignedRun,
  accepted,
  failPricedRow,
  failRowMatch,
  failDigitCell,
  failGeometry,
  failSeparatedCells,
  failHeading,
  failHeadingGeometry,
  failHeadingOwnership,
  failRunAlignment,
}

enum ReceiptOcrDateStage { original, normalized, projected }

enum ReceiptOcrDatePredicate {
  namedMonth,
  eastAsian,
  yearFirst,
  slash,
  separated,
  middleDot,
  validCandidate,
  invalidCandidate,
  stayExcluded,
  primaryRole,
  secondaryRole,
  otherRole,
  conflict,
  selected,
  stayOnly,
  noSelection,
  selectedPrimary,
  selectedSecondary,
  selectedOther,
}

class ReceiptOcrParserDiagnostics {
  ReceiptOcrParserDiagnostics._(this.quantity, this.dates, this._invalid);
  final bool _invalid;
  final List<int> quantity;
  final List<List<int>> dates;
  Map<String, Object> toBoundedEvidence() => {
    'schemaVersion': 1,
    'status': _invalid ? 'invalid' : 'observed',
    if (!_invalid) ...{'quantity': quantity, 'dates': dates},
  };
  static const Map<String, Object> unavailable = {
    'schemaVersion': 1,
    'status': 'unavailable',
  };
}

// Only typed fixed enum increments are accepted. No externally supplied keys,
// strings, callbacks or channel payload can be retained by this collector.
class ReceiptOcrPredicateCounter {
  bool _invalid = false;
  void invalidate() {
    _invalid = true;
  }

  final _quantity = List<int>.filled(
    ReceiptOcrQuantityPredicate.values.length,
    0,
  );
  final _dates = List.generate(
    ReceiptOcrDateStage.values.length,
    (_) => List<int>.filled(ReceiptOcrDatePredicate.values.length, 0),
  );
  void quantity(ReceiptOcrQuantityPredicate predicate) {
    final i = predicate.index;
    if (_quantity[i] < 256) _quantity[i]++;
  }

  void date(ReceiptOcrDateStage stage, ReceiptOcrDatePredicate predicate) {
    final counts = _dates[stage.index];
    if (counts[predicate.index] < 256) counts[predicate.index]++;
  }

  ReceiptOcrParserDiagnostics freeze() => ReceiptOcrParserDiagnostics._(
    _invalid ? const [] : List.unmodifiable(_quantity),
    _invalid
        ? const []
        : List.unmodifiable(
            _dates.map((counts) => List<int>.unmodifiable(counts)),
          ),
    _invalid,
  );
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
    this.numericRoutingObservation,
  });
  final String? detectionModelPackId;
  final String? detectionModelVersion;
  final String? runtime;
  final int? coldLoadTimeMs;
  final int? detectionTimeMs;
  final int? recognitionTimeMs;
  final int? totalTimeMs;
  final ReceiptOcrNumericRoutingObservation? numericRoutingObservation;
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
    if (preview.currency != null &&
        preview.items.any(
          (item) => item.currency != null && item.currency != preview.currency,
        )) {
      onDecision?.call(ReceiptOcrReviewDecision.foreignItemCurrency);
      return const [
        'Some item prices use a different currency from the receipt. Review before applying.',
      ];
    }
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
  final includedTax =
      preview.taxIncludedInTotal &&
          _adjustmentCurrencyMatchesReview(
            reviewCurrency: preview.currency,
            adjustmentCurrency: preview.taxCurrency,
            hasExplicitCurrencyEvidence: preview.taxHasExplicitCurrencyEvidence,
          )
      ? _parseReceiptOcrReviewAmount(preview.tax)
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
    final subtotalMatchesItems =
        (beforeSubtotalDiscount == null ||
            beforeSubtotalDiscount == BigInt.zero) &&
        _receiptOcrAmountsClose(itemTotal, subtotal);
    final subtotalMatchesDiscountedItems =
        beforeSubtotalDiscount != null &&
        _receiptOcrAmountsClose(
          itemTotal - beforeSubtotalDiscount.abs(),
          subtotal,
        );
    // A discount before the subtotal leaves the printed tax/discount
    // order unresolved for the saved review's subtotal-based tax mode.
    final subtotalMatchesGrossItems =
        includedTax != null &&
        !preview.discountBeforeSubtotal &&
        _receiptOcrAmountsClose(itemTotal, subtotal + includedTax);
    if (!subtotalMatchesItems &&
        !subtotalMatchesDiscountedItems &&
        !subtotalMatchesGrossItems) {
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
      if (preview.adjustmentsComplete &&
          (preview.currency?.trim().isNotEmpty ?? false) &&
          _hasCompleteReceiptOcrItemLineTotals(preview.items) &&
          _receiptOcrAdjustmentsReconcile(
            preview,
            itemTotal,
            total,
            allowNetIncludedTaxItems:
                subtotalMatchesItems || subtotalMatchesDiscountedItems,
          )) {
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
  final adjustmentsReconcile =
      total != null &&
      preview.adjustmentsComplete &&
      (preview.currency?.trim().isNotEmpty ?? false) &&
      _hasCompleteReceiptOcrItemLineTotals(preview.items) &&
      _hasReceiptOcrReferenceAdjustment(preview) &&
      _receiptOcrAdjustmentsReconcile(preview, itemTotal, total);
  // Preserve existing mismatch/incomplete-evidence warning priority. A
  // foreign subtotal still needs a hint where receipt arithmetic is quiet.
  if (!subtotalMatchesCurrency &&
      _hasReviewAmountText(preview.subtotal) &&
      (total == null || adjustmentsReconcile)) {
    onDecision?.call(ReceiptOcrReviewDecision.foreignAdjustmentWithoutSubtotal);
    return const [
      'Detected adjustment currency differs from receipt currency. Review before applying.',
    ];
  }

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
    if (adjustmentsReconcile) {
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

BigInt? _sumReceiptOcrItemLineTotals(
  List<ReceiptOcrItemCandidate> items, {
  String? reviewCurrency,
}) {
  BigInt? total;
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
    total = (total ?? BigInt.zero) + amount;
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
    (
      preview.subtotal,
      preview.subtotalCurrency,
      preview.subtotalHasExplicitCurrencyEvidence,
    ),
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

BigInt? _reconcilableReceiptOcrAdjustments(ReceiptOcrPreview preview) {
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
  var total = BigInt.zero;
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
        ? BigInt.zero
        : isDiscount
        ? -amount.abs()
        : amount;
    found = true;
  }
  return found ? total : null;
}

bool _receiptOcrAdjustmentsReconcile(
  ReceiptOcrPreview preview,
  BigInt itemTotal,
  BigInt total, {
  bool allowNetIncludedTaxItems = true,
}) {
  final adjustments = _reconcilableReceiptOcrAdjustments(preview);
  if (adjustments == null) return false;
  final tax = preview.taxIncludedInTotal
      ? _parseReceiptOcrReviewAmount(preview.tax)
      : null;
  if (preview.taxIncludedInTotal && (tax == null || tax.isNegative)) {
    return false;
  }
  if (_receiptOcrAmountsClose(itemTotal + adjustments, total)) {
    // An included component cannot exceed the entire gross item base.
    // Keep contradictory printed amounts and their review hint intact.
    return !preview.taxIncludedInTotal || tax! <= itemTotal;
  }
  // Printed items may instead be net of the included component, unless the
  // subtotal reconciled only by treating these same items as gross. Keep one
  // interpretation across both checks rather than counting included tax twice.
  return allowNetIncludedTaxItems &&
      preview.taxIncludedInTotal &&
      _receiptOcrAmountsClose(itemTotal + adjustments + tax!, total);
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

bool _receiptOcrAmountsClose(BigInt left, BigInt right) {
  return (left - right).abs() <= BigInt.from(10);
}

BigInt? _parseReceiptOcrReviewAmount(String? value) {
  final normalized = value?.trim();
  if (normalized == null ||
      !RegExp(r'^-?\d+(?:\.\d{1,3})?$').hasMatch(normalized)) {
    return null;
  }

  final negative = normalized.startsWith('-');
  final unsigned = normalized.startsWith('-')
      ? normalized.substring(1)
      : normalized;
  final parts = unsigned.split('.');
  final major = BigInt.tryParse(parts.first);
  if (major == null) {
    return null;
  }

  final fraction = parts.length == 2 ? parts[1].padRight(3, '0') : '000';
  final minor = BigInt.tryParse(fraction);
  if (minor == null) {
    return null;
  }

  // Provisional OCR values may exceed native integer limits. Keep scaling,
  // sums and comparisons exact so overflow cannot suppress a review hint.
  final amount = major * BigInt.from(1000) + minor;
  return negative ? -amount : amount;
}
