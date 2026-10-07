import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

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
bool receiptOcrFixtureReviewMatches(
  ReceiptOcrPreview preview,
  Map<String, Object?> expected,
) {
  final condition = expected['expected_review_condition'];
  const unsupportedConditions = {
    'printed unsupported fees need manual review',
    'printed combined taxes and fees need manual review',
    'printed fee and payment credit need manual review',
  };
  if (unsupportedConditions.contains(condition)) {
    return _unsupportedRolesMatch(preview, expected);
  }
  if (expected.containsKey('expected_review_roles')) return false;
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
  return expectedHints != null &&
      actualHints.length == expectedHints.length &&
      actualHints.asMap().entries.every(
        (entry) => entry.value == expectedHints[entry.key],
      ) &&
      !printedAdjustmentReviewIncomplete;
}

bool _unsupportedRolesMatch(
  ReceiptOcrPreview preview,
  Map<String, Object?> expected,
) {
  final roles = expected['expected_review_roles'];
  if (roles is! List<Object?> || roles.isEmpty || roles.length > 4)
    return false;
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
        ))
      return false;
    final kind = role['kind'];
    final label = role['label'];
    final amount = role['amount'];
    final sourceContext = role['source_context'];
    if (role.containsKey('source_context') &&
        (sourceContext is! String ||
            sourceContext.trim().isEmpty ||
            sourceContext.length > 100))
      return false;
    if (kind is! String ||
        label is! String ||
        amount is! String ||
        !{'fee', 'combined_tax_fee', 'payment_credit'}.contains(kind) ||
        label.trim().isEmpty ||
        label.length > 100 ||
        !RegExp(r'^-?(?:0|[1-9]\d*)\.\d{2}$').hasMatch(amount))
      return false;
    if ((kind == 'payment_credit') != amount.startsWith('-')) return false;
    final normalizedLabel = _normalizedText(label).toLowerCase();
    if (!labels.add(normalizedLabel)) return false;
    kinds.add(kind);
    final currency = expected['currency'];
    if (currency is! String || !RegExp(r'^[A-Z]{3}$').hasMatch(currency))
      return false;
    final currencyPattern =
        '(?:${RegExp.escape(currency.toLowerCase())}|'
        r'\$)';
    final signedAmount = amount.startsWith('-')
        ? r'[-−]\s*' + RegExp.escape(amount.substring(1))
        : r'\+?\s*' + RegExp.escape(amount);
    final amountPattern = RegExp(
      '^(?:$currencyPattern'
              r'\s*)?' +
          signedAmount +
          r'(?:\s*' +
          currencyPattern +
          r')?$',
    );
    final sourcePrefix = _normalizedText(
      '$label${sourceContext == null ? '' : ' $sourceContext'}',
    ).toLowerCase();
    final matchingRows = rows.values.where((blocks) {
      // A source role may span several OCR blocks. Only a separate, distant,
      // nonnumeric column after the amount may be excluded from its row.
      for (var end = 1; end <= blocks.length; end++) {
        final line = _normalizedText(
          blocks.take(end).map((b) => b.text).join(' '),
        ).toLowerCase();
        if (!line.startsWith(sourcePrefix)) continue;
        final tail = line
            .substring(sourcePrefix.length)
            .replaceFirst(RegExp(r'^\s*[:：]?\s*'), '');
        if (!amountPattern.hasMatch(tail)) continue;
        if (end == blocks.length) return true;
        final amountBlock = blocks[end - 1];
        if (amountBlock.points.length != 4 ||
            amountBlock.points.any((p) => !p.x.isFinite || !p.y.isFinite))
          continue;
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
            ))
          return true;
      }
      return false;
    }).length;
    if (matchingRows != 1) return false;
  }
  final condition = expected['expected_review_condition'];
  final hotel =
      condition == 'printed fee and payment credit need manual review';
  if (condition == 'printed unsupported fees need manual review' &&
      (kinds.length != 2 ||
          kinds.any((kind) => kind != 'fee') ||
          expected['subtotal'] != null))
    return false;
  if (condition == 'printed combined taxes and fees need manual review' &&
      (kinds.length != 1 ||
          kinds.single != 'combined_tax_fee' ||
          expected['tax'] != null ||
          expected['subtotal'] == null))
    return false;
  if (hotel &&
      (kinds.length != 2 ||
          !kinds.contains('fee') ||
          !kinds.contains('payment_credit') ||
          expected['date'] != null ||
          preview.receiptDate != null ||
          expected['discount'] != null ||
          preview.discount != null ||
          expected['subtotal'] == null))
    return false;
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
      ))
    return false;
  const incompleteWarning =
      'Some OCR lines need manual review because no traceable line amount was found.';
  const stayWarning =
      'Stay dates were detected without a transaction date. Review the receipt date.';
  final allowedWarnings = {incompleteWarning, if (hotel) stayWarning};
  if (preview.warnings.toSet().length != preview.warnings.length ||
      preview.warnings.any((warning) => !allowedWarnings.contains(warning)) ||
      (hotel && !preview.warnings.contains(stayWarning)))
    return false;
  final expectedDecision = expected['subtotal'] == null
      ? ReceiptOcrReviewDecision.incompleteAdjustmentWithoutSubtotal
      : ReceiptOcrReviewDecision.subtotalMismatch;
  final expectedHint = expected['subtotal'] == null
      ? 'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.'
      : 'OCR item total differs from detected subtotal. Review the receipt before applying.';
  return preview.reviewHintDecision == expectedDecision &&
      preview.reviewHints.length == 1 &&
      preview.reviewHints.single == expectedHint;
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
                  !RegExp(r'^[A-Z]{3}$').hasMatch(currency)))) {
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
  final String? currency;
}
