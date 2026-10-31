import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_provider.dart';

// Fixed labels distinguish strict header mismatch shapes without retaining
// receipt values or treating a warning-free value as calibrated confidence.
Map<String, Object> receiptOcrHeaderFieldEvidence(
  ReceiptOcrPreview? preview,
  Map<String, Object?> expected,
) {
  final actual = <String, String?>{
    'merchant': preview?.merchant,
    'date': preview?.receiptDate,
    'currency': preview?.currency,
    'subtotal': preview?.subtotal,
    'tax': preview?.tax,
    'service': preview?.service,
    'tip': preview?.tip,
    'shipping': preview?.shipping,
    'discount': preview?.discount,
    'total': preview?.total,
  };
  return {
    'headerFieldStates': {
      for (final entry in actual.entries)
        entry.key: preview == null
            ? 'noPreview'
            : _headerFieldState(entry.key, entry.value, expected),
    },
  };
}

String _headerFieldState(
  String field,
  String? actual,
  Map<String, Object?> expected,
) {
  final mismatches = <String>[];
  _collectField(mismatches, '', field, actual, expected);
  if (mismatches.isEmpty) {
    return actual == null ? 'matchingAbsence' : 'matchingValue';
  }
  if (actual == null) return 'missingValue';
  if (expected[field] == null) return 'unexpectedValue';
  return 'differentValue';
}

// Ordinary preview warnings are distinct from reconciliation review hints.
// Emit only fixed categories and counts, never warning or receipt text. An
// unknown warning remains counted so a future wording change cannot hide it.
Map<String, Object> receiptOcrPreviewWarningEvidence(
  ReceiptOcrPreview? preview,
) {
  const categories = {
    'No readable receipt text was found.': 'noReadableText',
    'DCC selection needs a matching charged amount. Review the receipt currency.':
        'dccAmountMissing',
    'Item prices and the charged amount use different currencies. Review before applying.':
        'itemChargedCurrencyConflict',
    'Item prices and the receipt currency differ. Review before applying.':
        'itemReceiptCurrencyConflict',
    'No clear item lines were detected.': 'noItems',
    'A rated tax-named charge may be an item or tax. Review it before applying.':
        'ratedTaxAmbiguity',
    'Some OCR lines need manual review because no traceable line amount was found.':
        'untraceableItemAmount',
    'No clear total amount was detected.': 'noTotal',
    'The receipt only shows a currency symbol. Using the current bill currency; review it before applying.':
        'currencyFallback',
    'The receipt only shows a currency symbol. Choose the currency before applying.':
        'symbolCurrencyUnresolved',
    'Conflicting receipt dates were detected. Review the receipt date.':
        'conflictingDate',
    'Stay dates were detected without a transaction date. Review the receipt date.':
        'stayOnlyDate',
  };
  final counts = <String, int>{
    for (final category in categories.values) category: 0,
    'unknownWarning': 0,
  };
  for (final warning in preview?.warnings ?? const <String>[]) {
    final category = categories[warning] ?? 'unknownWarning';
    counts[category] = counts[category]! + 1;
  }
  return {
    'previewPresent': preview != null,
    'previewWarningCount': preview?.warnings.length ?? 0,
    'previewWarningCategoryCounts': counts,
  };
}

List<String> receiptOcrFixtureFieldMismatches(
  ReceiptOcrPreview preview,
  Map<String, Object?> expected,
  String fixtureId,
) {
  final mismatches = <String>[];
  _collectField(mismatches, fixtureId, 'merchant', preview.merchant, expected);
  _collectField(mismatches, fixtureId, 'date', preview.receiptDate, expected);
  _collectField(mismatches, fixtureId, 'currency', preview.currency, expected);
  _collectField(mismatches, fixtureId, 'subtotal', preview.subtotal, expected);
  _collectField(mismatches, fixtureId, 'tax', preview.tax, expected);
  _collectField(mismatches, fixtureId, 'service', preview.service, expected);
  _collectField(mismatches, fixtureId, 'tip', preview.tip, expected);
  _collectField(mismatches, fixtureId, 'shipping', preview.shipping, expected);
  _collectField(mismatches, fixtureId, 'discount', preview.discount, expected);
  _collectField(mismatches, fixtureId, 'total', preview.total, expected);

  final expectedItems = (expected['items']! as List<Object?>)
      .map((item) => ReceiptOcrFixtureItem.fromManifest(item, fixtureId))
      .toList(growable: false);
  if (preview.items.length != expectedItems.length) {
    mismatches.add('items.length');
  }
  final comparedItemCount = preview.items.length < expectedItems.length
      ? preview.items.length
      : expectedItems.length;
  for (var index = 0; index < comparedItemCount; index += 1) {
    final expectedItem = expectedItems[index];
    final actualItem = preview.items[index];
    if (_normalizedText(actualItem.description) !=
        _normalizedText(expectedItem.description)) {
      mismatches.add('items[$index].description');
    }
    if (actualItem.lineTotal != expectedItem.lineTotal) {
      mismatches.add('items[$index].lineTotal');
    }
    if (actualItem.quantity != expectedItem.quantity) {
      mismatches.add('items[$index].quantity');
    }
    if (actualItem.unitPrice != expectedItem.unitPrice) {
      mismatches.add('items[$index].unitPrice');
    }
    if (actualItem.currency !=
        (expectedItem.currency ?? expected['currency'])) {
      mismatches.add('items[$index].currency');
    }
  }

  return mismatches;
}

// These conditions describe adjudicated source roles, never permission to
// ignore arbitrary warnings or change the independent field/item assertions.
// Marker-only tuple v1: branch enum order, then item-decision enum order.
// The exact-source collector restores the historical named map before all
// existing ownership/count checks. Null preview keeps the former all-zero map.
// Do not clamp invalid counters: the collector must reject them, not repair them.
List<List<int>> receiptOcrUnresolvedBranchMarkerCounts(
  ReceiptOcrPreview? preview,
) => List<List<int>>.unmodifiable([
  for (final branch in ReceiptOcrUnresolvedOtherBranch.values)
    List<int>.unmodifiable([
      for (final decision in ReceiptOcrItemLineDecision.values)
        preview?.unresolvedOtherBranchDecisionCounts[branch]?[decision] ?? 0,
    ]),
]);

// Observation only: the matcher below remains the sole acceptance decision.
enum ReceiptOcrReviewRoleFailure {
  unavailable,
  matched,
  invalidContract,
  roleRowAbsent,
  ambiguousRoleRow,
  contextMismatch,
  amountBoundaryMismatch,
  extraneousColumn,
  forbiddenIncompleteReason,
  warningMismatch,
  decisionHintMismatch,
}

ReceiptOcrReviewRoleFailure receiptOcrFixtureReviewFailure(
  ReceiptOcrPreview preview,
  Map<String, Object?> expected,
) {
  var failure = ReceiptOcrReviewRoleFailure.invalidContract;
  final matches = receiptOcrFixtureReviewMatches(
    preview,
    expected,
    onFailure: (value) => failure = value,
  );
  return matches ? ReceiptOcrReviewRoleFailure.matched : failure;
}

bool receiptOcrFixtureReviewMatches(
  ReceiptOcrPreview preview,
  Map<String, Object?> expected, {
  void Function(ReceiptOcrReviewRoleFailure)? onFailure,
}) {
  final condition = expected['expected_review_condition'];
  const unsupportedConditions = {
    'printed unsupported fees need manual review',
    'printed combined taxes and fees need manual review',
    'printed fee and payment credit need manual review',
  };
  if (unsupportedConditions.contains(condition)) {
    return _unsupportedRolesMatch(preview, expected, onFailure: onFailure);
  }
  if (expected.containsKey('expected_review_roles')) {
    onFailure?.call(ReceiptOcrReviewRoleFailure.invalidContract);
    return false;
  }
  final expectedReviewCondition =
      expected['expected_review_condition'] as String?;
  final expectedHints = expectedReviewCondition == null
      ? const <String>[]
      : expectedReviewCondition ==
            'printed total differs from visible charge-line arithmetic'
      ? const <String>[
          'OCR item total differs from detected grand total. Review the receipt before applying.',
        ]
      : expectedReviewCondition ==
            'printed item currency differs from charged receipt currency'
      ? const <String>[
          'Some item prices use a different currency from the receipt. Review before applying.',
        ]
      : expectedReviewCondition ==
            'printed surcharge and account credit need manual review'
      ? const <String>[
          'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
        ]
      : null;
  final actualHints = preview.reviewHints;
  final printedAdjustmentReviewIncomplete =
      expectedReviewCondition ==
          'printed surcharge and account credit need manual review' &&
      (preview.adjustmentsComplete ||
          !preview.incompleteAdjustmentReasons.contains(
            ReceiptOcrIncompleteAdjustmentReason.unclassifiedAdjustmentLabel,
          ) ||
          !preview.incompleteAdjustmentReasons.contains(
            ReceiptOcrIncompleteAdjustmentReason.chargeTableAdjustment,
          ));
  final matches =
      expectedHints != null &&
      actualHints.length == expectedHints.length &&
      actualHints.asMap().entries.every(
        (entry) => entry.value == expectedHints[entry.key],
      ) &&
      !printedAdjustmentReviewIncomplete;
  if (!matches) {
    onFailure?.call(
      expectedHints == null
          ? ReceiptOcrReviewRoleFailure.invalidContract
          : printedAdjustmentReviewIncomplete
          ? ReceiptOcrReviewRoleFailure.forbiddenIncompleteReason
          : ReceiptOcrReviewRoleFailure.decisionHintMismatch,
    );
  }
  return matches;
}

bool _unsupportedRolesMatch(
  ReceiptOcrPreview preview,
  Map<String, Object?> expected, {
  void Function(ReceiptOcrReviewRoleFailure)? onFailure,
}) {
  bool fail(ReceiptOcrReviewRoleFailure failure) {
    onFailure?.call(failure);
    return false;
  }

  final roles = expected['expected_review_roles'];
  if (roles is! List<Object?> || roles.isEmpty || roles.length > 4) {
    return fail(ReceiptOcrReviewRoleFailure.invalidContract);
  }
  final rows = <int, List<ReceiptOcrBlockEvidence>>{};
  for (final block in preview.blocks) {
    (rows[block.row] ??= []).add(block);
  }
  for (final blocks in rows.values) {
    blocks.sort((a, b) => a.order.compareTo(b.order));
  }
  final kinds = <String>[];
  final labels = <String>{};
  for (final role in roles) {
    if (role is! Map<String, Object?> ||
        (role.length != 3 && role.length != 4) ||
        role.keys.any(
          (key) => !{'kind', 'label', 'amount', 'source_context'}.contains(key),
        )) {
      return fail(ReceiptOcrReviewRoleFailure.invalidContract);
    }
    final kind = role['kind'];
    final label = role['label'];
    final amount = role['amount'];
    final sourceContext = role['source_context'];
    if (role.containsKey('source_context') &&
        (sourceContext is! String ||
            sourceContext.trim().isEmpty ||
            sourceContext.length > 100)) {
      return fail(ReceiptOcrReviewRoleFailure.invalidContract);
    }
    if (kind is! String ||
        label is! String ||
        amount is! String ||
        !{'fee', 'combined_tax_fee', 'payment_credit'}.contains(kind) ||
        label.trim().isEmpty ||
        label.length > 100 ||
        !RegExp(r'^-?(?:0|[1-9]\d*)\.\d{2}$').hasMatch(amount)) {
      return fail(ReceiptOcrReviewRoleFailure.invalidContract);
    }
    if ((kind == 'payment_credit') != amount.startsWith('-')) {
      return fail(ReceiptOcrReviewRoleFailure.invalidContract);
    }
    final normalizedLabel = _normalizedText(label).toLowerCase();
    if (!labels.add(normalizedLabel)) {
      return fail(ReceiptOcrReviewRoleFailure.invalidContract);
    }
    kinds.add(kind);
    final currency = expected['currency'];
    if (currency is! String || !RegExp(r'^[A-Z]{3}$').hasMatch(currency)) {
      return fail(ReceiptOcrReviewRoleFailure.invalidContract);
    }
    final currencyPattern =
        '(?:${RegExp.escape(currency.toLowerCase())}|'
        r'\$)';
    final signedAmount = amount.startsWith('-')
        ? r'[-−]\s*' + RegExp.escape(amount.substring(1))
        : r'\+?\s*' + RegExp.escape(amount);
    final amountPattern = RegExp(
      '^(?:$currencyPattern\\s*)?$signedAmount(?:\\s*$currencyPattern)?\$',
    );
    final normalizedContext = sourceContext is String
        ? _normalizedText(sourceContext).toLowerCase()
        : null;
    // Fold equivalent printed separators only inside declared non-money
    // context. Never rewrite the amount or its sign.
    final contextPattern = normalizedContext == null
        ? null
        : RegExp(
            '^${RegExp.escape(normalizedContext).replaceAll(RegExp(r'[-–—]'), r'[-–—]')}'
            r'(?=\s|$)',
          );
    final placeholderContext =
        normalizedContext != null &&
        RegExp(r'^[-–—](?: [-–—])+$').hasMatch(normalizedContext);
    var sawLabel = false;
    var sawContext = false;
    var sawAmount = false;
    final matchingRows = rows.values.where((blocks) {
      // A source role may span several OCR blocks. Only a separate, distant,
      // nonnumeric column after the amount may be excluded from its row.
      for (var end = 1; end <= blocks.length; end++) {
        final line = _normalizedText(
          blocks.take(end).map((b) => b.text).join(' '),
        ).toLowerCase();
        if (!line.startsWith(normalizedLabel)) continue;
        sawLabel = true;
        var tail = line
            .substring(normalizedLabel.length)
            .replaceFirst(RegExp(r'^\s*[:：]?\s*'), '');
        if (contextPattern != null) {
          final match = contextPattern.firstMatch(tail);
          if (match == null) continue;
          tail = tail.substring(match.end).trimLeft();
        }
        // The printed empty cells precede a currency-prefixed amount. Without
        // that boundary a spaced negative sign could masquerade as a cell.
        if (placeholderContext && !RegExp('^$currencyPattern').hasMatch(tail)) {
          continue;
        }
        sawContext = true;
        if (!amountPattern.hasMatch(tail)) continue;
        sawAmount = true;
        if (end == blocks.length) return true;
        final amountBlock = blocks[end - 1];
        if (amountBlock.points.length != 4 ||
            amountBlock.points.any((p) => !p.x.isFinite || !p.y.isFinite)) {
          continue;
        }
        final right = amountBlock.points
            .map((p) => p.x)
            .reduce((a, b) => a > b ? a : b);
        final top = amountBlock.points
            .map((p) => p.y)
            .reduce((a, b) => a < b ? a : b);
        final bottom = amountBlock.points
            .map((p) => p.y)
            .reduce((a, b) => a > b ? a : b);
        if (bottom <= top || !right.isFinite) continue;
        if (blocks
            .skip(end)
            .every(
              (block) =>
                  block.points.length == 4 &&
                  block.points.every(
                    (p) =>
                        p.x.isFinite &&
                        p.y.isFinite &&
                        p.x > right + 2 * (bottom - top),
                  ) &&
                  RegExp(r'^[a-zA-Z ]+$').hasMatch(block.text) &&
                  !labels.contains(_normalizedText(block.text).toLowerCase()),
            )) {
          return true;
        }
      }
      return false;
    }).length;
    if (matchingRows != 1) {
      return fail(
        matchingRows > 1
            ? ReceiptOcrReviewRoleFailure.ambiguousRoleRow
            : !sawLabel
            ? ReceiptOcrReviewRoleFailure.roleRowAbsent
            : !sawContext
            ? ReceiptOcrReviewRoleFailure.contextMismatch
            : !sawAmount
            ? ReceiptOcrReviewRoleFailure.amountBoundaryMismatch
            : ReceiptOcrReviewRoleFailure.extraneousColumn,
      );
    }
  }
  final condition = expected['expected_review_condition'];
  final hotel =
      condition == 'printed fee and payment credit need manual review';
  if (condition == 'printed unsupported fees need manual review' &&
      (kinds.length != 2 ||
          kinds.any((kind) => kind != 'fee') ||
          expected['subtotal'] != null)) {
    return fail(ReceiptOcrReviewRoleFailure.invalidContract);
  }
  if (condition == 'printed combined taxes and fees need manual review' &&
      (kinds.length != 1 ||
          kinds.single != 'combined_tax_fee' ||
          expected['tax'] != null)) {
    return fail(ReceiptOcrReviewRoleFailure.invalidContract);
  }
  if (hotel &&
      (kinds.length != 2 ||
          !kinds.contains('fee') ||
          !kinds.contains('payment_credit') ||
          expected['date'] != null ||
          preview.receiptDate != null ||
          expected['discount'] != null ||
          preview.discount != null ||
          expected['subtotal'] == null)) {
    return fail(ReceiptOcrReviewRoleFailure.invalidContract);
  }
  const allowedReasons = {
    ReceiptOcrIncompleteAdjustmentReason.labeledAmountEvidence,
    ReceiptOcrIncompleteAdjustmentReason.unclassifiedAdjustmentLabel,
    ReceiptOcrIncompleteAdjustmentReason.chargeTableAdjustment,
    ReceiptOcrIncompleteAdjustmentReason.unretainedPricedItem,
    ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine,
  };
  if (preview.adjustmentsComplete ||
      !preview.incompleteAdjustmentReasons.contains(
        ReceiptOcrIncompleteAdjustmentReason.unclassifiedAdjustmentLabel,
      ) ||
      preview.incompleteAdjustmentReasons.any(
        (reason) => !allowedReasons.contains(reason),
      )) {
    return fail(ReceiptOcrReviewRoleFailure.forbiddenIncompleteReason);
  }
  const incompleteWarning =
      'Some OCR lines need manual review because no traceable line amount was found.';
  const stayWarning =
      'Stay dates were detected without a transaction date. Review the receipt date.';
  final allowedWarnings = {incompleteWarning, if (hotel) stayWarning};
  if (preview.warnings.toSet().length != preview.warnings.length ||
      preview.warnings.any((warning) => !allowedWarnings.contains(warning)) ||
      (hotel && !preview.warnings.contains(stayWarning))) {
    return fail(ReceiptOcrReviewRoleFailure.warningMismatch);
  }
  // A combined tax/fee row remains ambiguous whether or not the source prints
  // a subtotal. The exact decision and hint must match that printed structure.
  final expectedDecision = expected['subtotal'] == null
      ? ReceiptOcrReviewDecision.incompleteAdjustmentWithoutSubtotal
      : ReceiptOcrReviewDecision.subtotalMismatch;
  final expectedHint = expected['subtotal'] == null
      ? 'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.'
      : 'OCR item total differs from detected subtotal. Review the receipt before applying.';
  final matches =
      preview.reviewHintDecision == expectedDecision &&
      preview.reviewHints.length == 1 &&
      preview.reviewHints.single == expectedHint;
  if (!matches) return fail(ReceiptOcrReviewRoleFailure.decisionHintMismatch);
  return true;
}

void _collectField(
  List<String> mismatches,
  String fixtureId,
  String field,
  String? actual,
  Map<String, Object?> expected,
) {
  final expectedValue = expected[field];
  if (field == 'merchant' && expectedValue is String) {
    if (_normalizedText(actual) != _normalizedText(expectedValue)) {
      mismatches.add(field);
    }
    return;
  }
  if (actual != expectedValue) {
    mismatches.add(field);
  }
}

String _normalizedText(String? value) =>
    (value ?? '').replaceAll(RegExp(r'\s+'), ' ').trim();

class ReceiptOcrFixtureItem {
  const ReceiptOcrFixtureItem({
    required this.description,
    required this.lineTotal,
    this.quantity,
    this.unitPrice,
    this.currency,
  });

  factory ReceiptOcrFixtureItem.fromManifest(Object? value, String fixtureId) {
    if (value case [final String description, final String lineTotal]) {
      return ReceiptOcrFixtureItem(
        description: description,
        lineTotal: lineTotal,
      );
    }
    if (value is Map<String, Object?>) {
      const supportedKeys = {
        'description',
        'quantity',
        'unit_price',
        'line_total',
        'currency',
      };
      final unknownKeys = value.keys.toSet().difference(supportedKeys);
      if (unknownKeys.isNotEmpty) {
        throw StateError(
          '$fixtureId item contains unvalidated keys: $unknownKeys',
        );
      }
      final description = value['description'];
      final quantity = value['quantity'];
      final unitPrice = value['unit_price'];
      final lineTotal = value['line_total'];
      final currency = value['currency'];
      if (description is! String ||
          lineTotal is! String ||
          (quantity != null && quantity is! String) ||
          (unitPrice != null && unitPrice is! String) ||
          (currency != null &&
              (currency is! String ||
                  (currency != '¥' &&
                      !RegExp(r'^[A-Z]{3}$').hasMatch(currency))))) {
        throw StateError('$fixtureId item ground truth must use strings');
      }
      return ReceiptOcrFixtureItem(
        description: description,
        quantity: quantity as String?,
        unitPrice: unitPrice as String?,
        lineTotal: lineTotal,
        currency: currency as String?,
      );
    }
    throw StateError('$fixtureId has an unsupported item representation');
  }

  final String description;
  final String? quantity;
  final String? unitPrice;
  final String lineTotal;
  // Match the preview's exact evidence: an ISO code or the unresolved printed
  // yen marker. A marker does not resolve the receipt's currency/provenance.
  final String? currency;
}

// Diagnostic facts only. Tuple v1 is:
// [version, processingState, sourceReviewKind, reviewMatch, checked, failed].
// Processing: 0 not attempted, 1 failed, 2 completed without an extracted
// preview, 3 completed with one. Failures include normalization/comparison
// exceptions, so state 1 does not attribute a failure to the OCR provider.
// Review kind 0 means no declared condition; 1..6 are existing source contracts;
// 7 is unrecognized. Review match: 0 unassessed, 1 matched, 2 mismatched.
//
// Only check bit 0 (fixture processing) has a witness in v1. Money/currency
// authority, evidence retention, contradiction/ambiguity visibility, Apply/save,
// editability and usefulness remain unassessed. Adding those checks requires
// actual source/UI witnesses and a reviewed schema extension. A matched review
// contract, strict pass or warning-free preview is never a usable-draft proof.
List<int> receiptOcrFixtureProductObservation(
  Map<String, Object?> expected, {
  ReceiptOcrResult? result,
  bool processingFailed = false,
}) {
  final condition = expected['expected_review_condition'];
  final kind = switch (condition) {
    null => 0,
    'printed unsupported fees need manual review' => 1,
    'printed combined taxes and fees need manual review' => 2,
    'printed fee and payment credit need manual review' => 3,
    'printed total differs from visible charge-line arithmetic' => 4,
    'printed item currency differs from charged receipt currency' => 5,
    'printed surcharge and account credit need manual review' => 6,
    _ => 7,
  };
  if (processingFailed || result?.status == ReceiptOcrStatus.failed) {
    return [1, 1, kind, 0, 1, 1];
  }
  if (result == null) return [1, 0, kind, 0, 0, 0];
  final preview = result.preview;
  if (result.status != ReceiptOcrStatus.extracted || preview == null) {
    return [1, 2, kind, 0, 1, 1];
  }
  final matches = receiptOcrFixtureReviewMatches(preview, expected);
  return [1, 3, kind, matches ? 1 : 2, 1, 0];
}
