import 'package:unorm_dart/unorm_dart.dart' as unicode_normalization;

import 'receipt_ocr_preview.dart';
import '../ui/settleora_form_fields.dart';

final _unicodeLetterPattern = RegExp(r'\p{L}', unicode: true);
final _potentialReceiptAdjustmentLabelPattern = RegExp(
  r'\b(?:sales\s+tax|tax|vat|gst|hst|iva|tva|kdv|mwst|service(?:\s+(?:charge|fee))?|tip|gratuity|shipping|delivery(?:\s+(?:charge|fee))?|discount|coupon|promo\s+code|loyalty[\s-]+savings?|surcharge|charge|fee|refund|rebate|credit|deposit|levy|duty|donation|round(?:ing|[\s-]*off))\b',
  caseSensitive: false,
);
const _localizedReceiptAdjustmentLabels = [
  '消費税',
  '税',
  'الضريبة',
  '税额',
  '稅額',
  '부가세',
  'जीएसटी',
  'कर',
  'ภาษี',
  'ндс',
  'thuế',
  'サービス料',
  '服務費',
  '服务费',
  '서비스료',
  'सेवा शुल्क',
  'ค่าบริการ',
  'сервисный сбор',
  '割引',
  '値引',
];

bool _hasPotentialReceiptAdjustmentLabel(String line) {
  if (_isEmailOnlyMetadataLine(line)) return false;
  if (_isSuggestedTipLine(line.toLowerCase())) return false;
  if (_potentialReceiptAdjustmentLabelPattern.hasMatch(line)) return true;
  final folded = line.toLowerCase();
  return _localizedReceiptAdjustmentLabels.any(folded.contains);
}

bool _isEmailOnlyMetadataLine(String line) => RegExp(
  r'^\s*(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\s*)+$',
  caseSensitive: false,
).hasMatch(line);

class ReceiptOcrParser {
  const ReceiptOcrParser();

  ReceiptOcrPreview parse(
    String recognizedText, {
    String? fallbackCurrency,
    List<ReceiptOcrBlockEvidence> blocks = const [],
    ReceiptOcrRunEvidence? runEvidence,
  }) {
    final sourceLines = recognizedText
        .split(RegExp(r'\r?\n'))
        .where((line) => line.trim().isNotEmpty)
        .toList(growable: false);
    final lines = sourceLines.map(_normalizeOcrLine).toList(growable: false);
    final detachedAmountSignRows = <int>{
      for (var index = 0; index < sourceLines.length; index++)
        if (_hasDetachedAmountSign(sourceLines[index])) index,
    };
    final warnings = <String>[];
    if (lines.isEmpty) {
      return const ReceiptOcrPreview(
        warnings: ['No readable receipt text was found.'],
      );
    }

    final layoutRows = _matchingLayoutRows(lines, blocks);
    final chargeTable = _classifyChargeTableRows(
      lines,
      detachedAmountSignRows: detachedAmountSignRows,
    );
    final chargeTableRows = chargeTable.items;
    final layoutAdjustmentLines = {
      ..._layoutAdjustmentEvidenceLines(lines, layoutRows, {
        ...chargeTable.items,
        ...chargeTable.ambiguous,
      }),
    };

    final currencyDetection = _detectCurrency(
      lines,
      fallbackCurrency: fallbackCurrency,
    );
    final currency = currencyDetection.currency;
    final boundedUtility = _boundedUtilityColumnRecovery(
      lines,
      layoutRows,
      currency,
    );
    final ambiguousChargeRows = {
      ...chargeTable.ambiguous,
      ...boundedUtility.ambiguous,
    };
    layoutAdjustmentLines.removeWhere(
      (index, _) => boundedUtility.ambiguous.contains(index),
    );
    layoutAdjustmentLines.addAll(boundedUtility.adjustments);
    detachedAmountSignRows.removeAll({
      ...boundedUtility.items.keys,
      ...boundedUtility.adjustments.keys,
    });
    final layoutChargeItems = {
      ..._extractLayoutChargeTableItems(
        lines,
        layoutRows,
        currency,
        detachedAmountSignRows: detachedAmountSignRows,
        adjustmentRows: layoutAdjustmentLines.keys.toSet(),
      ),
      ...boundedUtility.items,
    };
    layoutChargeItems.removeWhere(
      (index, _) => boundedUtility.ambiguous.contains(index),
    );
    final recognizedChargeRows = {
      ...chargeTableRows,
      ...layoutChargeItems.keys,
    };
    final ambiguousRatedTaxRows = [
      for (var index = 0; index < lines.length; index++)
        if (_isAmbiguousRatedTaxCharge(lines[index]) ||
            (recognizedChargeRows.contains(index) &&
                _isRatedTaxNamedLine(lines[index])))
          index,
    ];
    final amounts = _extractLabeledAmounts(
      lines,
      currency,
      layoutRows: layoutRows,
      chargeTableRows: recognizedChargeRows,
      layoutChargeItemRows: layoutChargeItems.keys.toSet(),
      ambiguousChargeTableRows: ambiguousChargeRows,
      detachedAmountSignRows: detachedAmountSignRows,
      layoutAdjustmentLines: layoutAdjustmentLines,
    );
    final merchantDetection = _detectMerchant(lines, layoutRows);
    final merchant = merchantDetection?.text;
    final extractedItems = _extractItems(
      lines,
      currency,
      selectedTotal: amounts.total,
      merchantLineIndices: merchantDetection?.lineIndices ?? const {},
      layoutRows: layoutRows,
      chargeTableRows: recognizedChargeRows,
      ambiguousChargeTableRows: ambiguousChargeRows,
      layoutChargeItems: layoutChargeItems,
      layoutAdjustmentRows: layoutAdjustmentLines.keys.toSet(),
      detachedAmountSignRows: detachedAmountSignRows,
    );
    final itemCandidates = extractedItems.items;
    final dccCharge = _corroboratedDccCharge(lines);
    final hasCompletePricedItemEvidence =
        !extractedItems.truncated &&
        !extractedItems.unretainedPricedItem &&
        detachedAmountSignRows.isEmpty &&
        !ambiguousChargeRows.any(
          (index) =>
              !layoutChargeItems.containsKey(index) &&
              !layoutAdjustmentLines.containsKey(index),
        );
    // A corroborated charge and printed rate can establish a terminal DCC
    // footer boundary before unpriced-line completeness is evaluated. Other
    // unpriced lines still block the final charged-total suggestion below.
    final hasBoundedDccFooterBoundary =
        amounts.total == null &&
        _boundedDccChargedTotal(
              lines,
              itemCandidates,
              amounts,
              currency,
              dccCharge,
              hasCompleteItemEvidence: hasCompletePricedItemEvidence,
            ) !=
            null;
    final unresolvedItemLines = _countUnresolvedItemLikeLines(
      lines,
      merchantLineIndices: merchantDetection?.lineIndices ?? const {},
      merchantName: merchant,
      layoutRows: layoutRows,
      layoutChargeItemRows: layoutChargeItems.keys.toSet(),
      hasBoundedDccFooterBoundary: hasBoundedDccFooterBoundary,
      nonItemSummaryRows: extractedItems.nonItemSummaryRows,
      uncertainSummaryAmountRows: extractedItems.uncertainSummaryAmountRows,
    );
    final hasCompleteItemEvidence =
        hasCompletePricedItemEvidence && unresolvedItemLines == 0;
    final selectedTotal =
        amounts.total ??
        _boundedDccChargedTotal(
          lines,
          itemCandidates,
          amounts,
          currency,
          dccCharge,
          hasCompleteItemEvidence: hasCompleteItemEvidence,
        );
    if (dccCharge.hasSelection && dccCharge.currency == null) {
      warnings.add(
        'DCC selection needs a matching charged amount. Review the receipt currency.',
      );
    }
    if (dccCharge.currency != null &&
        itemCandidates.any(
          (item) =>
              item.currency != null && item.currency != dccCharge.currency,
        )) {
      warnings.add(
        'Item prices and the charged amount use different currencies. Review before applying.',
      );
    }
    if (dccCharge.currency != null &&
        currency != null &&
        currency != dccCharge.currency &&
        itemCandidates.any(
          (item) => item.currency != null && item.currency != currency,
        )) {
      warnings.add(
        'Item prices and the receipt currency differ. Review before applying.',
      );
    }
    if (itemCandidates.isEmpty) {
      warnings.add('No clear item lines were detected.');
    }
    if (ambiguousRatedTaxRows.isNotEmpty) {
      warnings.add(
        'A rated tax-named charge may be an item or tax. Review it before applying.',
      );
    }
    if (unresolvedItemLines > 0 ||
        detachedAmountSignRows.isNotEmpty ||
        ambiguousChargeRows.any(
          (index) =>
              !layoutChargeItems.containsKey(index) &&
              !layoutAdjustmentLines.containsKey(index),
        )) {
      warnings.add(
        'Some OCR lines need manual review because no traceable line amount was found.',
      );
    }
    if (selectedTotal == null && itemCandidates.isEmpty) {
      warnings.add('No clear total amount was detected.');
    }
    if (currencyDetection.usedFallbackForSymbolOnly) {
      warnings.add(
        'The receipt only shows a currency symbol. Using the current bill currency; review it before applying.',
      );
    } else if (currencyDetection.isSymbolOnly) {
      warnings.add(
        'The receipt only shows a currency symbol. Choose the currency before applying.',
      );
    }

    // The native evidence collector requires each typed reason once. Several
    // independent row paths can identify the same ambiguity; keep the reason
    // and its review warning without emitting duplicate protocol values.
    final incompleteAdjustmentReasons = <ReceiptOcrIncompleteAdjustmentReason>{
      if (!amounts.adjustmentsComplete)
        ReceiptOcrIncompleteAdjustmentReason.labeledAmountEvidence,
      ...amounts.incompleteReasons,
      if (extractedItems.truncated)
        ReceiptOcrIncompleteAdjustmentReason.itemLimit,
      if (extractedItems.unretainedPricedItem)
        ReceiptOcrIncompleteAdjustmentReason.unretainedPricedItem,
      if (detachedAmountSignRows.isNotEmpty)
        ReceiptOcrIncompleteAdjustmentReason.detachedAmountSign,
      if (ambiguousChargeRows.any(
        (index) =>
            !layoutChargeItems.containsKey(index) &&
            !layoutAdjustmentLines.containsKey(index),
      ))
        ReceiptOcrIncompleteAdjustmentReason.ambiguousChargeTable,
      if (ambiguousRatedTaxRows.isNotEmpty)
        ReceiptOcrIncompleteAdjustmentReason.ambiguousChargeTable,
      if (unresolvedItemLines > 0)
        ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine,
    }.toList(growable: false);

    // Keep the contact-column correction out of item/adjustment inference.
    // A repaired total must not newly reconcile discounts or clear the
    // incompleteness decisions established from the original evidence.
    final contactColumnTotals = <String>{
      for (var index = 0; index < lines.length; index++)
        if (!recognizedChargeRows.contains(index) &&
            !ambiguousChargeRows.contains(index) &&
            !detachedAmountSignRows.contains(index) &&
            !layoutAdjustmentLines.containsKey(index))
          ?_ownedTotalBesideContact(lines, layoutRows, index, currency),
    };

    return ReceiptOcrPreview(
      merchant: merchant,
      receiptDate: _detectDate(lines),
      currency: currency,
      currencyProvenance: currencyDetection.provenance,
      subtotal: amounts.subtotal,
      subtotalCurrency: amounts.subtotalCurrency,
      subtotalHasExplicitCurrencyEvidence:
          amounts.subtotalHasExplicitCurrencyEvidence,
      tax: amounts.tax,
      taxCurrency: amounts.taxCurrency,
      taxHasExplicitCurrencyEvidence: amounts.taxHasExplicitCurrencyEvidence,
      service: amounts.service,
      serviceCurrency: amounts.serviceCurrency,
      serviceHasExplicitCurrencyEvidence:
          amounts.serviceHasExplicitCurrencyEvidence,
      tip: amounts.tip,
      tipLabel: amounts.tipLabel,
      tipCurrency: amounts.tip == null
          ? null
          : amounts.tipHasExplicitCurrencyEvidence
          ? amounts.tipCurrency
          : currency,
      tipHasExplicitCurrencyEvidence:
          amounts.tip != null && amounts.tipHasExplicitCurrencyEvidence,
      shipping: amounts.shipping,
      shippingLabel: amounts.shippingLabel,
      shippingCurrency: amounts.shipping == null
          ? null
          : amounts.shippingHasExplicitCurrencyEvidence
          ? amounts.shippingCurrency
          : currency,
      shippingHasExplicitCurrencyEvidence:
          amounts.shipping != null &&
          amounts.shippingHasExplicitCurrencyEvidence,
      discount: amounts.discount,
      discountCurrency: amounts.discountCurrency,
      discountHasExplicitCurrencyEvidence:
          amounts.discountHasExplicitCurrencyEvidence,
      discountBeforeSubtotal: amounts.discountBeforeSubtotal,
      adjustmentsComplete:
          amounts.adjustmentsComplete &&
          ambiguousRatedTaxRows.isEmpty &&
          !extractedItems.truncated &&
          !extractedItems.unretainedPricedItem &&
          detachedAmountSignRows.isEmpty &&
          !ambiguousChargeRows.any(
            (index) =>
                !layoutChargeItems.containsKey(index) &&
                !layoutAdjustmentLines.containsKey(index),
          ) &&
          unresolvedItemLines == 0,
      incompleteAdjustmentReasons: incompleteAdjustmentReasons,
      total: contactColumnTotals.length == 1
          ? contactColumnTotals.single
          : selectedTotal,
      rawTextLineCount: lines.length,
      confidence: _averageBlockConfidence(blocks),
      category: 'receipt',
      warnings: warnings,
      items: itemCandidates,
      itemLineDecisions: extractedItems.lineDecisions,
      itemSelectionDecisions: extractedItems.itemSelectionDecisions,
      blocks: blocks,
      runEvidence: runEvidence,
    );
  }

  ({String text, Set<int> lineIndices})? _detectMerchant(
    List<String> lines,
    List<List<ReceiptOcrBlockEvidence>> layoutRows,
  ) {
    // A multi-column letterhead may put a slogan beside the first name block
    // and the rest of the issuer name several rows below. Join aligned header
    // blocks only when a later single block repeats that full identity.
    if (layoutRows.length == lines.length && layoutRows.length > 3) {
      final firstRow =
          layoutRows.first
              .where((block) => block.points.isNotEmpty)
              .toList(growable: false)
            ..sort((a, b) => _blockCenterX(a).compareTo(_blockCenterX(b)));
      if (firstRow.length > 1) {
        final first = firstRow.first;
        final firstName = first.text.trim();
        final documentRight = layoutRows
            .expand((row) => row)
            .expand((block) => block.points)
            .fold<double>(
              0,
              (right, point) => point.x > right ? point.x : right,
            );
        if (_hasSubstantiveItemDescription(firstName) &&
            !_lineHasAmount(firstName) &&
            !_isReceiptMetadataLine(firstName)) {
          for (
            var rowIndex = 1;
            rowIndex < layoutRows.length && rowIndex <= 5;
            rowIndex++
          ) {
            for (final block in layoutRows[rowIndex]) {
              final extension = block.text.trim();
              if (block.points.isEmpty ||
                  !_hasSubstantiveItemDescription(extension) ||
                  _lineHasAmount(extension) ||
                  _isReceiptMetadataLine(extension) ||
                  (_blockCenterX(block) - _blockCenterX(first)).abs() >
                      documentRight * 0.1) {
                continue;
              }
              final identity = '$firstName $extension';
              if (identity.length > 80) continue;
              final lastTotalRow = lines.lastIndexWhere(
                (line) => RegExp(
                  r'^\s*(?:grand\s+)?total\b',
                  caseSensitive: false,
                ).hasMatch(line),
              );
              if (lastTotalRow <= rowIndex) continue;
              var repeated = false;
              for (
                var footerRow = lastTotalRow + 1;
                footerRow < layoutRows.length;
                footerRow++
              ) {
                if (layoutRows[footerRow].any(
                  (block) => RegExp(
                    r'^\s*(?:(?:bill|billed|sold|ship|deliver|delivered|remit|pay)[\s-]*to|(?:customer|buyer|purchaser|recipient|payee|client|billing|shipping|remittance)\b|payment\s+to\b)',
                    caseSensitive: false,
                  ).hasMatch(block.text),
                )) {
                  break;
                }
                if (layoutRows[footerRow].any(
                  (later) =>
                      later.text.trim().toLowerCase() == identity.toLowerCase(),
                )) {
                  repeated = true;
                  break;
                }
              }
              if (repeated) {
                return (text: identity, lineIndices: {0, rowIndex});
              }
            }
          }
        }
      }
    }
    // A logo can share its OCR row with the document title while its second
    // word is printed below. Require the assembled identity to appear again
    // before a labeled metadata field before trusting that split header.
    if (lines.length > 2) {
      final titledLogo = RegExp(
        r'^\s*(.+?)\s+(?:invoice|receipt|statement|bill)\s*$',
        caseSensitive: false,
      ).firstMatch(lines.first);
      final first = titledLogo?.group(1)?.trim();
      final second = lines[1].trim();
      if (first != null &&
          _hasSubstantiveItemDescription(first) &&
          _hasSubstantiveItemDescription(second) &&
          second.split(RegExp(r'\s+')).length <= 3 &&
          !_lineHasAmount(second) &&
          !_isReceiptMetadataLine(second)) {
        final identity = '$first $second';
        var corroborated = false;
        for (final line in lines.skip(2).take(8)) {
          // A later customer or payee section cannot corroborate the issuer.
          if (_isChargeTableHeader(line) ||
              RegExp(
                r'^\s*(?:(?:bill|billed|sold|ship|deliver|delivered|remit|pay)[\s-]*to|(?:customer|buyer|purchaser|recipient|payee|client|billing|shipping|remittance)\b|payment\b|subtotal\b|total\b|thank\s+you\b|need\s+help\b|footer\b)',
                caseSensitive: false,
              ).hasMatch(line)) {
            break;
          }
          if (!line.toLowerCase().startsWith('${identity.toLowerCase()} ')) {
            continue;
          }
          final suffix = line.substring(identity.length).trim();
          if (RegExp(
            r'^(?:order|invoice|account|reference)\s*(?:number|no\.?|#)\s*[:：]?\s*(?=[A-Z0-9-]*\d)[A-Z0-9-]+\b',
            caseSensitive: false,
          ).hasMatch(suffix)) {
            corroborated = true;
            break;
          }
        }
        if (corroborated) {
          return (text: identity, lineIndices: {0, 1});
        }
      }
    }
    ({String text, int lineIndex, int score})? best;
    final documentRight = layoutRows
        .expand((row) => row)
        .expand((block) => block.points)
        .fold<double>(0, (right, point) => point.x > right ? point.x : right);
    for (var index = 0; index < lines.length && index < 10; index += 1) {
      final line = lines[index];
      if (_isAdministrativeLine(line) ||
          _isContextualReceiptMetadataLine(lines, index) ||
          _isChargeTableHeader(line) ||
          _lineHasAmount(line) ||
          (index + 1 < lines.length &&
              _isStandaloneAmountRow(lines[index + 1])) ||
          _isReceiptMetadataLine(line)) {
        continue;
      }
      final cleaned = _cleanDescription(line);
      if (!_hasSubstantiveItemDescription(cleaned)) continue;
      final lower = cleaned.toLowerCase();
      var score = 10 - index;
      if (index < layoutRows.length && layoutRows[index].isNotEmpty) {
        final row = layoutRows[index];
        final confidence = _averageBlockConfidence(row);
        if (confidence != null && confidence < 0.4) score -= 4;
        final xValues = row
            .expand((block) => block.points)
            .map((point) => point.x)
            .toList();
        if (documentRight > 0 && xValues.isNotEmpty) {
          final center =
              (xValues.reduce((a, b) => a < b ? a : b) +
                  xValues.reduce((a, b) => a > b ? a : b)) /
              2;
          if ((center - documentRight / 2).abs() < documentRight * 0.18) {
            score += 2;
          }
        }
      }
      if (RegExp(
        r'\b(invoice|statement|bill|receipt|report|account summary|usage summary)\b',
      ).hasMatch(lower)) {
        score -= 18;
      }
      if (RegExp(
        r'\b(utility|utilities|market|store|restaurant|cafe|pharmacy|hotel|company|corp|inc|ltd|llc)\b',
      ).hasMatch(lower)) {
        score += 5;
      }
      if (RegExp(
        r'\b(customer|account|reference|address|phone|email|website|service period)\b',
      ).hasMatch(lower)) {
        score -= 18;
      }
      if (best == null || score > best.score) {
        best = (text: cleaned, lineIndex: index, score: score);
      }
    }
    if (best == null) return null;
    final parts = <String>[best.text];
    final indices = <int>{best.lineIndex};
    for (
      var previousIndex = best.lineIndex - 1;
      previousIndex >= 0 && parts.length < 3;
      previousIndex--
    ) {
      final previous = lines[previousIndex];
      if (!_isUppercaseOrganizationSegment(previous) ||
          !_isUppercaseOrganizationSegment(parts.first) ||
          _isAdministrativeLine(previous) ||
          _isChargeTableHeader(previous) ||
          _isReceiptMetadataLine(previous) ||
          _lineHasAmount(previous)) {
        break;
      }
      parts.insert(0, _cleanDescription(previous));
      indices.add(previousIndex);
    }
    for (
      var nextIndex = best.lineIndex + 1;
      nextIndex < lines.length && parts.length < 3;
      nextIndex++
    ) {
      final next = lines[nextIndex];
      if (!_isUppercaseOrganizationSegment(parts.last) ||
          !_isUppercaseOrganizationSegment(next) ||
          _isAdministrativeLine(next) ||
          _isChargeTableHeader(next) ||
          _isReceiptMetadataLine(next) ||
          (nextIndex + 1 < lines.length &&
              _isStandaloneAmountRow(lines[nextIndex + 1])) ||
          _lineHasAmount(next)) {
        break;
      }
      parts.add(_cleanDescription(next));
      indices.add(nextIndex);
    }
    final organization = parts.join(' ');
    if (parts.length == 1 &&
        !organization.contains(' ') &&
        organization.length >= 4 &&
        best.lineIndex + 1 < lines.length) {
      final adjacentIdentitySegment = _foldOrganizationSegment(
        lines[best.lineIndex + 1],
      );
      final prefix = '${organization.toLowerCase()} ';
      for (var index = best.lineIndex + 1; index < lines.length; index++) {
        final candidate = _cleanDescription(lines[index]);
        if (!candidate.toLowerCase().startsWith(prefix) ||
            candidate.length > 80 ||
            _lineHasAmount(candidate) ||
            _isAdministrativeLine(candidate) ||
            _isReceiptMetadataLine(candidate) ||
            _detectDate([candidate]) != null) {
          continue;
        }
        final extension = candidate.substring(organization.length).trim();
        final extensionWords = extension.split(RegExp(r'\s+'));
        if (extensionWords.isEmpty ||
            extensionWords.length > 3 ||
            !extensionWords.every(_unicodeLetterPattern.hasMatch) ||
            _foldOrganizationSegment(extension) != adjacentIdentitySegment ||
            RegExp(
              r'\b(team|support|help)\b',
              caseSensitive: false,
            ).hasMatch(extension)) {
          continue;
        }
        return (text: candidate, lineIndices: {...indices, index});
      }
    }
    return (text: organization, lineIndices: indices);
  }

  String? _detectDate(List<String> lines) {
    ({String date, int score})? best;
    for (var index = 0; index < lines.length; index += 1) {
      final line = lines[index];
      final lower = line.toLowerCase();
      // Reading order only breaks nearby ties; an explicit role must remain
      // stronger than a distant unlabeled date on a long document.
      final positionScore = 100 - (index < 10 ? index : 10);
      final primaryLabel = RegExp(
        r'\b(bill|invoice|statement|transaction|order|purchase|issued)\s*(date|on)?\b',
      );
      final secondaryLabel = RegExp(
        r'\b(due|pay by|payment|paid|previous|prior|last|refund|reference|meter|reading|billing period|service period|period from|period to)\b',
      );
      void consider(String? date, int dateStart) {
        var score = positionScore;
        final labels =
            <({int start, bool secondary})>[
                ...primaryLabel
                    .allMatches(lower)
                    .map((match) => (start: match.start, secondary: false)),
                ...secondaryLabel
                    .allMatches(lower)
                    .map((match) => (start: match.start, secondary: true)),
              ].where((label) => label.start < dateStart).toList()
              ..sort((a, b) => a.start.compareTo(b.start));
        if (labels.isNotEmpty) {
          final nearest = labels.last;
          final priorQualifier =
              !nearest.secondary &&
              RegExp(
                r'\b(?:previous|prior|last|refund|reference|payment|paid)\s+$',
              ).hasMatch(lower.substring(0, nearest.start));
          score += nearest.secondary || priorQualifier ? -100 : 80;
        } else if (index > 0 && !_lineHasAmount(lines[index - 1])) {
          final previous = lines[index - 1].toLowerCase();
          if (secondaryLabel.hasMatch(previous)) {
            score -= 30;
          } else if (primaryLabel.hasMatch(previous)) {
            score += 20;
          }
        }
        if (date != null && (best == null || score > best!.score)) {
          best = (date: date, score: score);
        }
      }

      final monthMatches = RegExp(
        r'\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2}),?\s+(20\d{2}|19\d{2})\b',
        caseSensitive: false,
      ).allMatches(line);
      for (final month in monthMatches) {
        final monthIndex =
            const [
              'jan',
              'feb',
              'mar',
              'apr',
              'may',
              'jun',
              'jul',
              'aug',
              'sep',
              'oct',
              'nov',
              'dec',
            ].indexOf(month.group(1)!.substring(0, 3).toLowerCase()) +
            1;
        consider(
          _formatDate(
            int.parse(month.group(3)!),
            monthIndex,
            int.parse(month.group(2)!),
          ),
          month.start,
        );
      }
      final eastAsianMatches = RegExp(
        r'\b(20\d{2}|19\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?',
      ).allMatches(line);
      for (final eastAsian in eastAsianMatches) {
        final formatted = _formatDate(
          int.parse(eastAsian.group(1)!),
          int.parse(eastAsian.group(2)!),
          int.parse(eastAsian.group(3)!),
        );
        consider(formatted, eastAsian.start);
      }

      final isoMatches = RegExp(
        r'\b(20\d{2}|19\d{2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})\b',
      ).allMatches(line);
      for (final iso in isoMatches) {
        final formatted = _formatDate(
          int.parse(iso.group(1)!),
          int.parse(iso.group(2)!),
          int.parse(iso.group(3)!),
        );
        consider(formatted, iso.start);
      }

      final slashMatches = RegExp(
        r'\b(\d{1,2})/(\d{1,2})/(20\d{2}|19\d{2})\b',
      ).allMatches(line);
      for (final slash in slashMatches) {
        final first = int.parse(slash.group(1)!);
        final second = int.parse(slash.group(2)!);
        final year = int.parse(slash.group(3)!);
        final formatted = first > 12
            ? _formatDate(year, second, first)
            : _formatDate(year, first, second);
        consider(formatted, slash.start);
      }

      final separatedDateMatches = RegExp(
        r'\b(\d{1,2})([.-])(\d{1,2})\2(20\d{2}|19\d{2})\b',
      ).allMatches(line);
      for (final separatedDate in separatedDateMatches) {
        final first = int.parse(separatedDate.group(1)!);
        final separator = separatedDate.group(2)!;
        final second = int.parse(separatedDate.group(3)!);
        final year = int.parse(separatedDate.group(4)!);
        final formatted = first > 12 || (separator == '.' && second <= 12)
            ? _formatDate(year, second, first)
            : _formatDate(year, first, second);
        consider(formatted, separatedDate.start);
      }
    }
    return best?.date;
  }

  _ReceiptCurrencyDetection _detectCurrency(
    List<String> lines, {
    String? fallbackCurrency,
  }) {
    final transactionCurrencyLines = lines
        .where((line) => !_isNonTransactionCurrencyMetadataLine(line))
        .toList(growable: false);
    final normalizedFallback = _supportedCurrencyCode(fallbackCurrency);
    final primaryTotalLines = transactionCurrencyLines
        .where((line) => _isPrimaryTotalCurrencyLine(line, line.toLowerCase()))
        .toList(growable: false);
    if (primaryTotalLines.isEmpty) {
      final dccCharge = _corroboratedDccCharge(lines);
      if (dccCharge.currency != null) {
        final printedReceiptCurrencies = <String>{};
        for (final line in transactionCurrencyLines) {
          final normalized = line.toLowerCase();
          if (!RegExp(r'^\s*(?:currency|curr)\b').hasMatch(normalized) &&
              !_hasSubtotalLabel(line, normalized) &&
              !(RegExp(r'^\s*sub[\s-]?total\b').hasMatch(normalized) &&
                  _lineHasAmount(line))) {
            continue;
          }
          final lineCurrencies = <String>{
            ..._printedCurrencyMarkerMatches(line)
                .where((marker) => _currencyMarkerTouchesAmount(line, marker))
                .map((marker) => _currencyFromItemToken(marker.group(1)))
                .whereType<String>(),
            ...RegExp(
                  '(?:^\\s*(?:sub[\\s-]?total|currency|curr)\\b\\s*[:=]?\\s*|[/|;,]\\s*)'
                  '(${_supportedCurrencyCodes.join('|')})\\s*[:=]?\\s*$_amountTokenPattern'
                  '(?=\\s*(?:\$|[/|;,:)=+—–-]))',
                  caseSensitive: false,
                )
                .allMatches(line)
                .where((match) {
                  final ambiguousWord = _maskAmbiguousSupportedItemWords(
                    match.group(1)!,
                    maskUppercase: true,
                  ).trim().isEmpty;
                  final followedByProse = RegExp(
                    r'^\s*[—–-].*[\p{L}]',
                    unicode: true,
                  ).hasMatch(line.substring(match.end));
                  return !(ambiguousWord && followedByProse);
                })
                .map((match) => match.group(1)!.toUpperCase()),
            ?_rankedExplicitCurrencyCode([line]),
          };
          if (lineCurrencies.length > 1) {
            return const _ReceiptCurrencyDetection();
          }
          printedReceiptCurrencies.addAll(lineCurrencies);
        }
        if (printedReceiptCurrencies.length == 1) {
          return _ReceiptCurrencyDetection(
            currency: printedReceiptCurrencies.single,
            provenance: ReceiptOcrCurrencyProvenance.explicit,
          );
        }
        if (printedReceiptCurrencies.length > 1) {
          return const _ReceiptCurrencyDetection();
        }
        return _ReceiptCurrencyDetection(
          currency: dccCharge.currency,
          provenance: ReceiptOcrCurrencyProvenance.explicit,
        );
      }
    }
    // A single printed multi-amount total supplies a bounded selected amount.
    // Separate total rows still use the established role ranking below.
    if (primaryTotalLines.length == 1 &&
        RegExp(
              _amountTokenPattern,
            ).allMatches(primaryTotalLines.single).length >
            1) {
      final line = primaryTotalLines.single;
      final selected = _currencyAdjacentToSelectedAmount(
        line,
        normalizedFallback,
        allowPriorCurrencyConflict: true,
      );
      final amount = RegExp(_amountTokenPattern).allMatches(line).last;
      final before = line.substring(0, amount.start).trimRight();
      final after = line.substring(amount.end).trimLeft();
      // kr and Rs need receipt context or a bill fallback. Neither is an
      // explicit currency code on a multi-amount total.
      final contextualMarkerOnSelectedAmount =
          RegExp(
            r'(?<![\p{L}\p{N}])(?:kr|rs)\s*[:=]?\s*[+−]?\s*$',
            caseSensitive: false,
            unicode: true,
          ).hasMatch(before) ||
          RegExp(
            r'^\s*[:=]?\s*(?:kr|rs)(?![\p{L}\p{N}])',
            caseSensitive: false,
            unicode: true,
          ).hasMatch(after);
      if (contextualMarkerOnSelectedAmount) {
        final markerIsKr =
            RegExp(
              r'(?<![\p{L}\p{N}])kr\s*[:=]?\s*[+−]?\s*$',
              caseSensitive: false,
              unicode: true,
            ).hasMatch(before) ||
            RegExp(
              r'^\s*[:=]?\s*kr(?![\p{L}\p{N}])',
              caseSensitive: false,
              unicode: true,
            ).hasMatch(after);
        final compatible = markerIsKr
            ? const {'SEK', 'NOK', 'DKK'}
            : const {'INR', 'PKR'};
        // Only a receipt currency label may override this ambiguous total
        // marker. Earlier amounts on the same total line and differently
        // denominated items are not authority for the selected amount.
        final explicit = _rankedExplicitCurrencyCode(
          transactionCurrencyLines
              .where(
                (candidate) => RegExp(
                  r'^\s*(?:currency|curr)\b',
                  caseSensitive: false,
                ).hasMatch(candidate),
              )
              .toList(growable: false),
        );
        if (explicit != null) {
          return _ReceiptCurrencyDetection(
            currency: compatible.contains(explicit) ? explicit : null,
            provenance: compatible.contains(explicit)
                ? ReceiptOcrCurrencyProvenance.explicit
                : ReceiptOcrCurrencyProvenance.unresolved,
          );
        }
        final context = _contextualCurrency(
          transactionCurrencyLines.join(' ').toUpperCase(),
          hasUsPostalAddress: _hasUsPostalAddress(transactionCurrencyLines),
        );
        if (compatible.contains(context)) {
          return _ReceiptCurrencyDetection(
            currency: context,
            provenance: ReceiptOcrCurrencyProvenance.contextInferred,
          );
        }
        final useFallback = compatible.contains(normalizedFallback);
        return _ReceiptCurrencyDetection(
          currency: useFallback ? normalizedFallback : null,
          isSymbolOnly: true,
          usedFallbackForSymbolOnly: useFallback,
          provenance: useFallback
              ? ReceiptOcrCurrencyProvenance.defaultFallback
              : ReceiptOcrCurrencyProvenance.unresolved,
        );
      }
      if (selected.hasExplicitEvidence &&
          _supportedCurrencyCodes.contains(selected.currency)) {
        final bareDollar =
            RegExp(r'(?<![A-Za-z])\$$').hasMatch(before) ||
            after.startsWith(r'$');
        return _ReceiptCurrencyDetection(
          currency: selected.currency,
          isSymbolOnly: bareDollar,
          usedFallbackForSymbolOnly: bareDollar,
          provenance: bareDollar
              ? ReceiptOcrCurrencyProvenance.defaultFallback
              : ReceiptOcrCurrencyProvenance.explicit,
        );
      }
      if (selected.hasExplicitEvidence) {
        return const _ReceiptCurrencyDetection();
      }
    }
    if (primaryTotalLines.length == 1 &&
        RegExp(
              _amountTokenPattern,
            ).allMatches(primaryTotalLines.single).length ==
            1) {
      final attachedCode = _attachedSupportedCodeOnSelectedAmount(
        primaryTotalLines.single,
      );
      if (attachedCode != null) {
        return _ReceiptCurrencyDetection(
          currency: attachedCode,
          provenance: ReceiptOcrCurrencyProvenance.explicit,
        );
      }
    }
    final hasSelectedTotalSymbol = transactionCurrencyLines.any((line) {
      final normalized = line.toLowerCase();
      return _isPrimaryTotalCurrencyLine(line, normalized) &&
          _currencyAdjacentToSelectedAmount(
            line,
            normalizedFallback,
            allowPriorCurrencyConflict: true,
          ).hasExplicitEvidence;
    });
    final rankedCurrencyLines = transactionCurrencyLines
        .map((line) {
          final normalized = line.toLowerCase();
          if (_hasTotalLabel(line, normalized) ||
              _hasSubtotalLabel(line, normalized) ||
              _hasTaxLabel(line, normalized) ||
              _hasServiceChargeLabel(line, normalized) ||
              _hasDiscountLabel(line, normalized) ||
              RegExp(r'^\s*(?:currency|curr)\b').hasMatch(normalized)) {
            return line;
          }
          return _maskAmbiguousSupportedItemWords(
            line,
            maskUppercase: hasSelectedTotalSymbol,
          );
        })
        .toList(growable: false);
    final joined = transactionCurrencyLines.join(' ').toUpperCase();
    final hasUsPostalAddress = _hasUsPostalAddress(transactionCurrencyLines);
    final explicitCode = _rankedExplicitCurrencyCode(rankedCurrencyLines);
    if (explicitCode != null) {
      return _ReceiptCurrencyDetection(
        currency: explicitCode,
        provenance: ReceiptOcrCurrencyProvenance.explicit,
      );
    }

    if (_hasExplicitHongKongCurrencyMarker(joined)) {
      return const _ReceiptCurrencyDetection(
        currency: 'HKD',
        provenance: ReceiptOcrCurrencyProvenance.explicit,
      );
    }
    if (_hasExplicitUnitedStatesCurrencyMarker(joined)) {
      return const _ReceiptCurrencyDetection(
        currency: 'USD',
        provenance: ReceiptOcrCurrencyProvenance.explicit,
      );
    }
    if (joined.contains('د.إ') || joined.contains('دإ')) {
      return const _ReceiptCurrencyDetection(
        currency: 'AED',
        provenance: ReceiptOcrCurrencyProvenance.explicit,
      );
    }
    if (joined.contains('€')) {
      return const _ReceiptCurrencyDetection(
        currency: 'EUR',
        provenance: ReceiptOcrCurrencyProvenance.explicit,
      );
    }
    if (joined.contains('£')) {
      return const _ReceiptCurrencyDetection(
        currency: 'GBP',
        provenance: ReceiptOcrCurrencyProvenance.explicit,
      );
    }
    final explicitSymbolCurrency = _explicitSymbolCurrency(joined);
    if (explicitSymbolCurrency != null) {
      return _ReceiptCurrencyDetection(
        currency: explicitSymbolCurrency,
        provenance: ReceiptOcrCurrencyProvenance.explicit,
      );
    }

    final contextualCurrency = _contextualCurrency(
      joined,
      hasUsPostalAddress: hasUsPostalAddress,
    );
    if (contextualCurrency != null) {
      return _ReceiptCurrencyDetection(
        currency: contextualCurrency,
        provenance: ReceiptOcrCurrencyProvenance.contextInferred,
      );
    }

    if (normalizedFallback == 'USD' &&
        (RegExp(r'\b(UNITED\s+STATES|USA)\b').hasMatch(joined) ||
            hasUsPostalAddress)) {
      return const _ReceiptCurrencyDetection(
        currency: 'USD',
        provenance: ReceiptOcrCurrencyProvenance.contextInferred,
      );
    }
    final ambiguousSymbolPresent =
        joined.contains(r'$') ||
        joined.contains('¥') ||
        RegExp(r'\bKR\b').hasMatch(joined) ||
        RegExp(r'\bRS\b').hasMatch(joined);
    if (ambiguousSymbolPresent) {
      final fallbackMatchesSymbol = switch (normalizedFallback) {
        'JPY' || 'CNY' => joined.contains('¥'),
        'SEK' || 'NOK' || 'DKK' => RegExp(r'\bKR\b').hasMatch(joined),
        'INR' || 'PKR' => RegExp(r'\bRS\b').hasMatch(joined),
        null => false,
        _ => joined.contains(r'$'),
      };
      return _ReceiptCurrencyDetection(
        currency: fallbackMatchesSymbol ? normalizedFallback : null,
        isSymbolOnly: true,
        usedFallbackForSymbolOnly: fallbackMatchesSymbol,
        provenance: !fallbackMatchesSymbol
            ? ReceiptOcrCurrencyProvenance.unresolved
            : ReceiptOcrCurrencyProvenance.defaultFallback,
      );
    }
    return const _ReceiptCurrencyDetection();
  }

  bool _hasExplicitCurrencyCode(List<String> lines, String code) {
    final escapedCode = RegExp.escape(code);
    final labelledCode = RegExp(
      '(?:CURRENCY|CURRENCY\\s+CODE|CURR)\\s*[:#=-]?\\s*\\b$escapedCode\\b',
      caseSensitive: false,
    );
    final codeBeforeAmount = RegExp(
      "\\b$escapedCode\\b\\s*[:=]?\\s*${_explicitCodeAmountPattern(code)}\\s*\$",
      caseSensitive: false,
    );
    final amountBeforeCode = RegExp(
      "${_explicitCodeAmountPattern(code)}\\s*\\b$escapedCode\\b\\s*\$",
      caseSensitive: false,
    );
    final wholeUnitCode = RegExp(
      "(?:\\b$escapedCode\\b\\s*[:=]?\\s*-?\\d+|-?\\d+\\s*\\b$escapedCode\\b)\\s*\$",
      caseSensitive: false,
    );
    final wholeUnitEvidenceCount = lines.where(wholeUnitCode.hasMatch).length;

    return lines.any((line) {
      return labelledCode.hasMatch(line) ||
          codeBeforeAmount.hasMatch(line) ||
          amountBeforeCode.hasMatch(line) ||
          wholeUnitEvidenceCount >= 2 ||
          (wholeUnitCode.hasMatch(line) &&
              _hasWholeUnitCurrencyContext(line, code));
    });
  }

  String? _rankedExplicitCurrencyCode(List<String> lines) {
    final candidates = <String>{
      ..._supportedCurrencyCodes.where(
        (code) => _hasExplicitCurrencyCode(lines, code),
      ),
      ...lines.map(_explicitCurrencyFromLine).whereType<String>(),
    }.toList(growable: false);
    if (candidates.isEmpty) return null;

    final ranked =
        candidates.map((code) {
          var score = 0;
          var totalEvidenceCount = 0;
          var firstLine = lines.length;
          for (var index = 0; index < lines.length; index += 1) {
            final line = lines[index];
            if (!_hasExplicitCurrencyCode([line], code) &&
                _explicitCurrencyFromLine(line) != code) {
              continue;
            }
            if (index < firstLine) firstLine = index;
            final normalized = line.toLowerCase();
            if (_hasTotalLabel(line, normalized)) {
              totalEvidenceCount += 1;
              score += 1000;
            } else if (_hasSubtotalLabel(line, normalized) ||
                _hasTaxLabel(line, normalized) ||
                _hasServiceChargeLabel(line, normalized) ||
                _hasActualTipChargeLabel(line, normalized) ||
                _hasShippingLabel(line, normalized) ||
                _hasDiscountLabel(line, normalized)) {
              score += 200;
            } else if (_isNonTransactionCurrencyMetadataLine(line)) {
              score += 1;
            } else {
              score += 100;
            }
          }
          return (
            code: code,
            score: score,
            totalEvidenceCount: totalEvidenceCount,
            firstLine: firstLine,
          );
        }).toList()..sort((left, right) {
          // A printed, explicitly denominated total is stronger currency
          // evidence than any count of foreign-denominated item lines.
          final totalRoleOrder = (right.totalEvidenceCount > 0 ? 1 : 0)
              .compareTo(left.totalEvidenceCount > 0 ? 1 : 0);
          if (totalRoleOrder != 0) return totalRoleOrder;
          final scoreOrder = right.score.compareTo(left.score);
          if (scoreOrder != 0) return scoreOrder;
          final lineOrder = left.firstLine.compareTo(right.firstLine);
          if (lineOrder != 0) return lineOrder;
          return left.code.compareTo(right.code);
        });
    // This ranking receives transaction evidence only. Payment/tender and
    // reference/conversion rows can carry a settlement or DCC currency that
    // differs from the receipt transaction currency, so no code or symbol on
    // those rows may establish transaction currency.
    return ranked
        .where((candidate) => candidate.score >= 100)
        .firstOrNull
        ?.code;
  }

  String? _explicitCurrencyFromLine(String line) {
    return _explicitCurrencyFromNormalizedLine(line.toUpperCase());
  }

  ({String? currency, bool hasExplicitEvidence})
  _explicitAdjustmentCurrencyFromLine(String line, {String? receiptCurrency}) {
    if (_hasUnsupportedCurrencySymbolOnSelectedAmount(line)) {
      return (currency: null, hasExplicitEvidence: true);
    }
    final amounts = RegExp(_amountTokenPattern).allMatches(line).toList();
    final amountCount = amounts.length;
    final selectedAmount = amounts.lastOrNull;
    final adjacentPrintedMarkers = selectedAmount == null
        ? 0
        : _printedCurrencyMarkerMatches(line)
              .where(
                (marker) => _currencyMarkerAdjacentToSelectedHeaderAmount(
                  line,
                  marker,
                  selectedAmount,
                ),
              )
              .length;
    if (amountCount > 1 ||
        (amountCount == 1 && adjacentPrintedMarkers > 1) ||
        (receiptCurrency != null &&
            !_currencyCompatibleWithBareDollar(receiptCurrency) &&
            RegExp(r'(?<![A-Za-z])\$\s*[+-]?\d').hasMatch(line))) {
      return _currencyAdjacentToSelectedAmount(line, receiptCurrency);
    }
    // The bare yen sign denotes JPY or CNY. Keep the printed marker as
    // review-only currency evidence when neither is the transaction currency;
    // it must never inherit another receipt currency on save.
    if (line.contains('¥') &&
        receiptCurrency != null &&
        receiptCurrency != 'JPY' &&
        receiptCurrency != 'CNY') {
      return (
        currency: _currencyAdjacentToSelectedAmountWithYen(line) ?? '¥',
        hasExplicitEvidence: true,
      );
    }
    final boundedCodeCandidates = <String>{
      for (final match in RegExp(
        r'(?<![A-Za-z])([A-Z]{3})(?![A-Za-z])\s*[:=]?\s*[+-]?\s*\d',
      ).allMatches(line))
        if (!_nonCurrencyAdjustmentCodes.contains(match.group(1)!))
          match.group(1)!,
      for (final match in RegExp(
        r'\d(?:[\d,]*)(?:\.\d+)?\s*([A-Z]{3})(?![A-Za-z])',
      ).allMatches(line))
        if (!_nonCurrencyAdjustmentCodes.contains(match.group(1)!))
          match.group(1)!,
    };
    if (boundedCodeCandidates.isNotEmpty) {
      return (
        currency: boundedCodeCandidates.length == 1
            ? boundedCodeCandidates.single
            : null,
        hasExplicitEvidence: true,
      );
    }

    final recognizedCandidates = <String>{
      ..._supportedCurrencyCodes.where(
        (code) => _hasExplicitCurrencyCode([line], code),
      ),
      ?_explicitCurrencyFromLine(line),
    };
    return (
      currency: recognizedCandidates.length == 1
          ? recognizedCandidates.single
          : null,
      hasExplicitEvidence: recognizedCandidates.isNotEmpty,
    );
  }

  String? _ownedTotalBesideContact(
    List<String> lines,
    List<List<ReceiptOcrBlockEvidence>> rows,
    int index,
    String? currency,
  ) {
    if (currency == null || lines.length != rows.length) return null;
    final row = rows[index];
    bool hasGeometry(ReceiptOcrBlockEvidence block) =>
        block.points.length == 4 &&
        block.points.every((point) => point.x.isFinite && point.y.isFinite) &&
        _blockLeft(block) < _blockRight(block);
    // This proof covers a complete label, monetary cell and separate contact
    // cell only. Extra/merged cells retain the existing ambiguity path.
    if (row.length != 3 || row.any((block) => !hasGeometry(block))) {
      return null;
    }
    final ordered = [...row]
      ..sort((left, right) => _blockLeft(left).compareTo(_blockLeft(right)));
    final label = ordered[0];
    final money = ordered[1];
    final contact = ordered[2];
    final totalPrefix = RegExp(
      r'^(?:total\s+(?:amount\s+)?due|total\s+current\s+charges|'
      r'grand\s+total|amount\s+due|balance\s+due|payment\s+due|total)'
      r'(?=\s|[:：]|$)\s*[:：]?\s*',
      caseSensitive: false,
    );
    final labelText = _normalizeOcrLine(label.text);
    final labelMatch = totalPrefix.firstMatch(labelText);
    if (labelMatch == null || labelMatch.end != labelText.length) return null;
    final contactText = _normalizeOcrLine(contact.text);
    if (!RegExp(
      r'^(?:call\s+us\s+at|call|tel(?:ephone)?|phone|contact|help\s+desk)'
      r'\s*[:：]?\s*\+?\d[\d ()-]*\d$',
      caseSensitive: false,
    ).hasMatch(contactText)) {
      return null;
    }
    final phoneDigits = RegExp(r'\d').allMatches(contactText).length;
    if (phoneDigits < 7 || phoneDigits > 15) return null;
    double top(ReceiptOcrBlockEvidence block) =>
        block.points.map((p) => p.y).reduce((a, b) => a < b ? a : b);
    double bottom(ReceiptOcrBlockEvidence block) =>
        block.points.map((p) => p.y).reduce((a, b) => a > b ? a : b);
    double height(ReceiptOcrBlockEvidence block) => bottom(block) - top(block);
    if (ordered.any(
      (block) => height(block) <= 0 || _blockLeft(block) >= _blockRight(block),
    )) {
      return null;
    }
    bool aligned(
      ReceiptOcrBlockEvidence anchor,
      ReceiptOcrBlockEvidence other,
    ) {
      final overlap =
          (bottom(anchor) < bottom(other) ? bottom(anchor) : bottom(other)) -
          (top(anchor) > top(other) ? top(anchor) : top(other));
      final smallerHeight = height(anchor) < height(other)
          ? height(anchor)
          : height(other);
      return overlap >= smallerHeight / 2;
    }

    if (_blockRight(label) >= _blockLeft(money) ||
        _blockLeft(contact) - _blockRight(money) < height(money) ||
        !aligned(money, label) ||
        !aligned(money, contact)) {
      return null;
    }
    final financialSymbol = RegExp(r'[\p{Sc}%‰]', unicode: true);
    final detachedSign = RegExp(r'^[+\-−–—()]+$');
    final completePostal = RegExp(
      r"^[a-z .'-]+,\s*[a-z]{2}\s+\d{5}(?:-\d{4})?$",
      caseSensitive: false,
    );
    final completePoBox = RegExp(
      r'^(?:p\.?\s*o\.?\s*box|post\s+office\s+box)\s+\d+$',
      caseSensitive: false,
    );
    final dateLabel = RegExp(
      r'^(?:(?:bill|invoice|statement|transaction|order|purchase|due|payment|'
      r'service)\s+)?date\s*[:：]?$',
      caseSensitive: false,
    );
    final completeDate = RegExp(
      r'^(?:[a-z]{3,9}\.?\s+\d{1,2},?\s+(?:19|20)\d{2}|'
      r'(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|'
      r'\d{1,2}[-/.]\d{1,2}[-/.](?:19|20)\d{2})$',
      caseSensitive: false,
    );
    final allBlocks = rows.expand((row) => row).toList();
    final ownedDates =
        <ReceiptOcrBlockEvidence, List<ReceiptOcrBlockEvidence>>{};
    for (final dateHeading in allBlocks) {
      if (!hasGeometry(dateHeading) ||
          height(dateHeading) <= 0 ||
          !dateLabel.hasMatch(_normalizeOcrLine(dateHeading.text))) {
        continue;
      }
      final values = allBlocks.where((block) {
        final text = _normalizeOcrLine(block.text);
        return hasGeometry(block) &&
            height(block) > 0 &&
            _blockLeft(block) > _blockRight(dateHeading) &&
            aligned(dateHeading, block) &&
            completeDate.hasMatch(text) &&
            _detectDate([text]) != null;
      }).toList();
      if (values.length == 1) {
        final pair = [dateHeading, values.single];
        ownedDates[dateHeading] = pair;
        ownedDates[values.single] = pair;
      }
    }
    const weekday =
        r'(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|'
        r'fri(?:day)?|sat(?:urday)?|sun(?:day)?)';
    const clockTime = r'(?:[1-9]|1[0-2])(?::[0-5]\d)?\s*[ap]\.?m\.?';
    final supportSchedule = RegExp(
      '^$weekday(?:\\s*(?:[-–—]|to|through)\\s*$weekday)?'
      '\\s*,?\\s*$clockTime\\s*(?:[-–—]|to)\\s*$clockTime\$',
      caseSensitive: false,
    );
    final contactHeading = RegExp(
      r'^(?:need help|questions|contact(?: us)?|customer (?:service|support)|'
      r'help(?: desk)?|support)\s*[:?]?$',
      caseSensitive: false,
    );
    bool competesWithTotal(
      ReceiptOcrBlockEvidence other,
      ReceiptOcrBlockEvidence ownedLabel,
      ReceiptOcrBlockEvidence ownedMoney,
      double bandRight, {
      ReceiptOcrBlockEvidence? ownedContact,
    }) {
      final text = _normalizeOcrLine(other.text);
      if (text.isEmpty) return false;
      if (!hasGeometry(other) || height(other) <= 0) return true;
      // Only a complete schedule below, or a contact heading above, belongs
      // to the proven phone column. Unknown side-column text stays ambiguous.
      if (ownedContact != null &&
          _blockLeft(other) - _blockRight(ownedMoney) >= height(ownedMoney)) {
        if ((_blockLeft(other) >= _blockLeft(ownedContact) &&
                top(other) >= bottom(ownedContact) &&
                supportSchedule.hasMatch(text)) ||
            (_blockLeft(other) >=
                    _blockLeft(ownedContact) - height(ownedContact) / 2 &&
                _blockRight(other) <=
                    _blockRight(ownedContact) + height(ownedContact) / 2 &&
                bottom(other) <= top(ownedContact) &&
                contactHeading.hasMatch(text))) {
          return false;
        }
      }
      final bandTop = top(ownedLabel) < top(ownedMoney)
          ? top(ownedLabel)
          : top(ownedMoney);
      final bandBottom = bottom(ownedLabel) > bottom(ownedMoney)
          ? bottom(ownedLabel)
          : bottom(ownedMoney);
      final datePair = ownedDates[other];
      if (datePair != null &&
          (datePair.every((block) => bottom(block) <= bandTop) ||
              datePair.every((block) => top(block) >= bandBottom))) {
        // A complete, independently aligned date field owns its printed digits.
        return false;
      }
      final clearance =
          (height(ownedLabel) > height(ownedMoney)
              ? height(ownedLabel)
              : height(ownedMoney)) /
          2;
      // OCR grouping and token recognition cannot establish ownership. Scan
      // every block across the proven total/contact band. Excluding a vertical
      // neighbor requires at least half a label/value height of separation.
      return bottom(other) > bandTop - clearance &&
          top(other) < bandBottom + clearance &&
          _blockRight(other) > _blockLeft(ownedLabel) - height(ownedMoney) &&
          _blockLeft(other) < bandRight + height(ownedMoney);
    }

    bool hasCompetingNeighbor(
      List<ReceiptOcrBlockEvidence> owner,
      ReceiptOcrBlockEvidence ownedLabel,
      ReceiptOcrBlockEvidence ownedMoney, {
      ReceiptOcrBlockEvidence? ownedContact,
    }) {
      if (owner.any((block) => !hasGeometry(block) || height(block) <= 0)) {
        return true;
      }
      // Unrelated chart or postal cells do not expand the total's neighborhood.
      // The contact column expands it only after its ownership is established.
      final bandRight = _blockRight(ownedContact ?? ownedMoney);
      return rows
          .expand((blocks) => blocks)
          .any(
            (block) =>
                !owner.contains(block) &&
                competesWithTotal(
                  block,
                  ownedLabel,
                  ownedMoney,
                  bandRight,
                  ownedContact: ownedContact,
                ),
          );
    }

    // OCR row grouping can separate boxes of different heights. Use the same
    // complete neighborhood proof for this total and every agreeing repetition.
    if (hasCompetingNeighbor(row, label, money, ownedContact: contact)) {
      return null;
    }
    final completeMonetaryCell = RegExp(
      '^(?:(?:$_currencyTokenPattern)\\s*(?:$_amountTokenPattern)'
      '|(?:$_amountTokenPattern)\\s*(?:$_currencyTokenPattern))\$',
      caseSensitive: false,
    );
    String? ownedAmount(String text) {
      final normalized = _normalizeOcrLine(text);
      if (!completeMonetaryCell.hasMatch(normalized) ||
          !_isStandaloneAmountRow(normalized) ||
          _printedCurrencyMarkerMatches(normalized).length != 1 ||
          RegExp(_amountTokenPattern).allMatches(normalized).length != 1 ||
          _hasDetachedAmountSign(normalized)) {
        return null;
      }
      final printed = _currencyAdjacentToSelectedAmount(normalized, currency);
      final value = _lastAmountInLine(normalized, currency: currency);
      return printed.hasExplicitEvidence &&
              printed.currency == currency &&
              value != null &&
              !value.startsWith('-')
          ? value
          : null;
    }

    bool hasTotalEvidence(String text) {
      final normalized = _normalizeOcrLine(text);
      final lower = normalized.toLowerCase();
      // Preserve every existing total-recognition path, including joined labels
      // and multi-amount priority totals. The sentinel recognizes labels only.
      return _hasTotalLabel(normalized, lower) ||
          _isPrimaryTotalCurrencyLine(normalized, lower) ||
          _hasPriorityTotalLabel(normalized) ||
          (!_lineHasAmount(normalized) &&
              _hasTotalLabel('$normalized 0', '$lower 0'));
    }

    // The same printed heading can occupy one box, several words or separate
    // glyphs. Match adjacent fragments against the existing label vocabulary,
    // independently of row-wide text and unrelated agreeing totals. This is
    // only a conflict guard; fragmented fields never establish a new owner.
    String compactLabel(String text) => _normalizeOcrLine(text)
        .toLowerCase()
        .replaceAll(RegExp(r'[^\p{L}\p{M}\p{N}]', unicode: true), '');
    final totalHeadings = [
      ..._englishTotalLabels,
      '合計',
      ..._localizedTotalLabels,
    ].map(compactLabel).toSet();
    final fragments = allBlocks.where((block) {
      final text = compactLabel(block.text);
      return text.isNotEmpty &&
          hasGeometry(block) &&
          height(block) > 0 &&
          !hasTotalEvidence(block.text);
    }).toList();
    bool adjacentFragments(
      ReceiptOcrBlockEvidence a,
      ReceiptOcrBlockEvidence b,
    ) {
      final largerHeight = height(a) > height(b) ? height(a) : height(b);
      final horizontalGap = _blockLeft(a) >= _blockRight(b)
          ? _blockLeft(a) - _blockRight(b)
          : _blockLeft(b) - _blockRight(a);
      if (horizontalGap >= 0 &&
          aligned(a, b) &&
          (a.row == b.row || horizontalGap <= largerHeight * 2)) {
        return true;
      }
      final verticalGap = top(a) >= bottom(b)
          ? top(a) - bottom(b)
          : top(b) - bottom(a);
      return verticalGap >= 0 &&
          verticalGap <= largerHeight &&
          (_blockLeft(a) - _blockLeft(b)).abs() <= largerHeight / 2;
    }

    final fragmentNeighbors =
        <ReceiptOcrBlockEvidence, List<ReceiptOcrBlockEvidence>>{
          for (final block in fragments)
            block: fragments
                .where(
                  (other) => other != block && adjacentFragments(block, other),
                )
                .toList(),
        };
    var fragmentBudget = 512;
    bool hasUnresolvedFragmentedTotal(
      List<ReceiptOcrBlockEvidence> path,
      String text,
    ) {
      for (final next in fragmentNeighbors[path.last]!) {
        if (path.contains(next)) continue;
        final joined = '$text${compactLabel(next.text)}';
        final completesHeading = totalHeadings.any(joined.startsWith);
        if (!completesHeading &&
            !totalHeadings.any((heading) => heading.startsWith(joined))) {
          continue;
        }
        // Dense ambiguous layouts must decline, not silently exhaust a proof.
        if (--fragmentBudget < 0 || completesHeading) return true;
        if (hasUnresolvedFragmentedTotal([...path, next], joined)) return true;
      }
      return false;
    }

    if (fragments.any((block) {
      final text = compactLabel(block.text);
      return totalHeadings.any((heading) => heading.startsWith(text)) &&
          hasUnresolvedFragmentedTotal([block], text);
    })) {
      return null;
    }

    const months = [
      'january',
      'february',
      'march',
      'april',
      'may',
      'june',
      'july',
      'august',
      'september',
      'october',
      'november',
      'december',
    ];
    int monthIndex(ReceiptOcrBlockEvidence block) {
      final text = _normalizeOcrLine(block.text).toLowerCase();
      return months.indexWhere(
        (month) => text == month || text == month.substring(0, 3),
      );
    }

    bool belongsToCalendarAxis(
      ReceiptOcrBlockEvidence block,
      ReceiptOcrBlockEvidence axisValue,
    ) {
      if (!hasGeometry(block) || height(block) <= 0 || monthIndex(block) < 0) {
        return false;
      }
      final gap = _blockLeft(block) - _blockRight(axisValue);
      if (gap < height(axisValue) / 2 ||
          gap >= height(axisValue) ||
          bottom(block) <= top(axisValue) ||
          top(block) >= bottom(axisValue)) {
        return false;
      }
      final labels = rows.expand((row) => row).where((candidate) {
        return hasGeometry(candidate) &&
            height(candidate) > 0 &&
            monthIndex(candidate) >= 0 &&
            _blockLeft(candidate) - _blockRight(axisValue) >=
                height(axisValue) / 2 &&
            (top(candidate) + bottom(candidate)) / 2 > bottom(axisValue) &&
            aligned(block, candidate);
      }).toList()..sort((a, b) => _blockLeft(a).compareTo(_blockLeft(b)));
      // A complete ordered calendar axis establishes the adjacent word's role;
      // an isolated month-shaped fragment does not prove chart ownership.
      for (var i = 0; i + 2 < labels.length; i++) {
        final a = labels[i], b = labels[i + 1], c = labels[i + 2];
        if ((a == block || b == block || c == block) &&
            _blockRight(a) <= _blockLeft(b) &&
            _blockRight(b) <= _blockLeft(c) &&
            _blockLeft(b) - _blockRight(a) <= height(a) * 2 &&
            _blockLeft(c) - _blockRight(b) <= height(b) * 2 &&
            monthIndex(b) == (monthIndex(a) + 1) % 12 &&
            monthIndex(c) == (monthIndex(b) + 1) % 12) {
          return true;
        }
      }
      return false;
    }

    bool hasCalendarAxis(ReceiptOcrBlockEvidence value) => rows
        .expand((row) => row)
        .any((block) => belongsToCalendarAxis(block, value));

    bool sharesMetadataNeighborhood(
      ReceiptOcrBlockEvidence anchor,
      ReceiptOcrBlockEvidence other,
    ) {
      final clearance = height(anchor) / 2;
      return bottom(other) > top(anchor) - clearance &&
          top(other) < bottom(anchor) + clearance &&
          _blockLeft(anchor) - _blockRight(other) < height(anchor) &&
          _blockLeft(other) - _blockRight(anchor) < height(anchor);
    }

    bool chartHasAdjacentEvidence(ReceiptOcrBlockEvidence axis) {
      // Establish the connected tick column from its proven calendar axis.
      // Every accepted bare tick needs the same full neighborhood proof as the
      // initial value; a denomination beside a higher tick cannot be hidden by
      // that tick's proximity to another positively established chart member.
      final ticks = [axis];
      for (var i = 0; i < ticks.length; i++) {
        final current = ticks[i];
        final currentNumber = int.parse(_normalizeOcrLine(current.text));
        for (final candidate in allBlocks) {
          if (ticks.contains(candidate) ||
              !hasGeometry(candidate) ||
              height(candidate) <= 0) {
            continue;
          }
          final text = _normalizeOcrLine(candidate.text);
          final number = int.tryParse(text);
          if (number != null &&
              number > currentNumber &&
              RegExp(r'^\d+$').hasMatch(text) &&
              bottom(candidate) <= top(current) &&
              (_blockRight(candidate) - _blockRight(axis)).abs() <=
                  height(axis) / 2 &&
              height(candidate) >= height(axis) / 2 &&
              height(candidate) <= height(axis) * 2 &&
              sharesMetadataNeighborhood(current, candidate)) {
            ticks.add(candidate);
          }
        }
      }
      // Bare plotted values need positive ownership too: a complete ordered
      // calendar axis below, one matching month column, and the established
      // vertical tick range. Include them in the same closed neighborhood proof.
      final calendar = <ReceiptOcrBlockEvidence>{};
      for (final first in allBlocks.where(
        (block) => belongsToCalendarAxis(block, axis),
      )) {
        final labels =
            allBlocks
                .where(
                  (block) =>
                      hasGeometry(block) &&
                      height(block) > 0 &&
                      monthIndex(block) >= 0 &&
                      _blockLeft(block) >= _blockLeft(first) &&
                      aligned(first, block) &&
                      (top(block) + bottom(block)) / 2 > bottom(axis),
                )
                .toList()
              ..sort((a, b) => _blockLeft(a).compareTo(_blockLeft(b)));
        final run = [first];
        for (final next in labels.where((block) => block != first)) {
          final previous = run.last;
          if (_blockRight(previous) - _blockLeft(next) > height(axis) / 2 ||
              _blockLeft(next) - _blockRight(previous) > height(previous) * 2 ||
              monthIndex(next) != (monthIndex(previous) + 1) % 12) {
            break;
          }
          run.add(next);
        }
        if (run.length >= 3) calendar.addAll(run);
      }
      if (calendar.length < 3) return true;
      final plotTop = ticks.map(top).reduce((a, b) => a < b ? a : b);
      final maximum = ticks
          .map((tick) => int.parse(_normalizeOcrLine(tick.text)))
          .reduce((a, b) => a > b ? a : b);
      final members = <ReceiptOcrBlockEvidence>{...ticks};
      for (final block in allBlocks) {
        if (!hasGeometry(block) || height(block) <= 0) continue;
        final text = _normalizeOcrLine(block.text);
        final number = int.tryParse(text);
        final center = (_blockLeft(block) + _blockRight(block)) / 2;
        if (number != null &&
            number >= 0 &&
            number <= maximum &&
            RegExp(r'^\d+$').hasMatch(text) &&
            _blockLeft(block) - _blockRight(axis) >= height(axis) / 2 &&
            top(block) >= plotTop &&
            bottom(block) <= bottom(axis) &&
            height(block) >= height(axis) / 2 &&
            height(block) <= height(axis) * 2 &&
            calendar
                    .where(
                      (month) =>
                          center >= _blockLeft(month) &&
                          center <= _blockRight(month),
                    )
                    .length ==
                1) {
          members.add(block);
        }
      }
      final topTick = ticks.reduce((a, b) => top(a) < top(b) ? a : b);
      final chartRight = calendar
          .map(_blockRight)
          .reduce((a, b) => a > b ? a : b);
      final usageTitle = RegExp(
        r'^(?:kwh|m³|m3|therms?|gallons?|gal|units?|gb|minutes?|mins?|'
        r'liters?|litres?|ml|kg|lbs?|miles?|hours?|hrs?)\s+'
        r'(?:used|usage|consumed)$',
        caseSensitive: false,
      );
      for (final block in allBlocks) {
        if (hasGeometry(block) &&
            height(block) > 0 &&
            usageTitle.hasMatch(_normalizeOcrLine(block.text)) &&
            bottom(block) <= plotTop &&
            plotTop - bottom(block) < height(axis) &&
            (_blockLeft(block) - _blockLeft(topTick)).abs() <=
                height(axis) / 2 &&
            _blockRight(block) <= chartRight) {
          // A complete physical-usage heading above the plotted range owns its
          // unit words. Monetary units and appended amounts never qualify.
          members.add(block);
        }
      }
      for (final tick in members) {
        for (final other in allBlocks) {
          if (members.contains(other) ||
              _normalizeOcrLine(other.text).isEmpty) {
            continue;
          }
          if (!hasGeometry(other) || height(other) <= 0) return true;
          if (sharesMetadataNeighborhood(tick, other) &&
              !calendar.contains(other)) {
            return true;
          }
        }
      }
      return false;
    }

    bool metadataHasAdjacentEvidence(ReceiptOcrBlockEvidence metadata) {
      if (!hasGeometry(metadata) || height(metadata) <= 0) return true;
      if (RegExp(r'^\d+$').hasMatch(_normalizeOcrLine(metadata.text)) &&
          hasCalendarAxis(metadata)) {
        return chartHasAdjacentEvidence(metadata);
      }
      for (final block in allBlocks) {
        if (block == metadata || _normalizeOcrLine(block.text).isEmpty) {
          continue;
        }
        if (!hasGeometry(block) || height(block) <= 0) return true;
        if (!sharesMetadataNeighborhood(metadata, block)) continue;
        if (completePostal.hasMatch(_normalizeOcrLine(metadata.text)) &&
            completePoBox.hasMatch(_normalizeOcrLine(block.text)) &&
            bottom(block) <= top(metadata) &&
            (_blockLeft(block) - _blockLeft(metadata)).abs() <=
                height(metadata) / 2 &&
            _blockRight(block) <= _blockRight(metadata) &&
            height(block) >= height(metadata) / 2 &&
            height(block) <= height(metadata) * 2) {
          // A complete PO-box line above an aligned city/state/postal line
          // establishes the same address, not a competing monetary fragment.
          continue;
        }
        if (_isStandaloneAmountRow(metadata.text) &&
            belongsToCalendarAxis(block, metadata)) {
          continue;
        }
        // A fragment beside an apparent chart value can own its denomination
        // despite a different OCR row. No token classifier can exclude it.
        return true;
      }
      return false;
    }

    final value = ownedAmount(money.text);
    if (value == null) return null;
    // A phone-free projection must not newly reconcile a document that has a
    // competing or unresolved printed total. Agreeing repetitions are allowed;
    // unknown total syntax/currency/amount ownership declines this recovery.
    for (var otherIndex = 0; otherIndex < rows.length; otherIndex++) {
      if (otherIndex == index) continue;
      final other = rows[otherIndex];
      final labels = other
          .where((block) => totalPrefix.hasMatch(_normalizeOcrLine(block.text)))
          .toList();
      if (labels.isEmpty) {
        final effectiveLine =
            _isFinancialLabelWithAdjacentAmount(lines, rows, otherIndex)
            ? '${lines[otherIndex]} ${lines[otherIndex + 1]}'
            : lines[otherIndex];
        // Separate payment/support copy cannot erase a recognized total cell.
        // Unknown localized ownership declines even when its amount agrees.
        if (other.any((block) => hasTotalEvidence(block.text)) ||
            hasTotalEvidence(effectiveLine)) {
          return null;
        }
        continue;
      }
      if (labels.length != 1) return null;
      final text = _normalizeOcrLine(labels.single.text);
      final suffix = text.substring(totalPrefix.firstMatch(text)!.end);
      final monetaryCells = other
          .where(
            (block) =>
                block != labels.single &&
                _isStandaloneAmountRow(_normalizeOcrLine(block.text)) &&
                _hasChargeTableMonetaryEvidence(block.text),
          )
          .toList();
      final amounts = suffix.isNotEmpty
          ? [suffix]
          : monetaryCells.map((block) => block.text).toList();
      if (amounts.length != 1 || ownedAmount(amounts.single) != value) {
        return null;
      }
      final ownedMoney = suffix.isEmpty ? monetaryCells.single : labels.single;
      if (hasCompetingNeighbor(other, labels.single, ownedMoney) ||
          (suffix.isEmpty &&
              (_blockRight(labels.single) >= _blockLeft(ownedMoney) ||
                  !aligned(ownedMoney, labels.single)))) {
        return null;
      }
      final bandRight = _blockRight(ownedMoney);
      for (final extra in other) {
        if (extra == labels.single ||
            (suffix.isEmpty && extra == monetaryCells.single)) {
          continue;
        }
        final extraText = _normalizeOcrLine(extra.text);
        if (hasTotalEvidence(extraText) ||
            _printedCurrencyMarkerMatches(extraText).isNotEmpty ||
            _unsupportedIsoCurrencyMarkers(extraText).isNotEmpty ||
            financialSymbol.hasMatch(extraText) ||
            detachedSign.hasMatch(extraText)) {
          return null;
        }
        if (!RegExp(_amountTokenPattern).hasMatch(extraText)) {
          if (competesWithTotal(extra, labels.single, ownedMoney, bandRight)) {
            return null;
          }
          continue;
        }
        // A complete city/state/postal block owns its digits as address
        // metadata only outside the label/value corridor. Other numeric text
        // (including alternatives such as "or 90") remains competing evidence.
        if (metadataHasAdjacentEvidence(extra)) return null;
        final postal = completePostal.hasMatch(extraText);
        if (postal &&
            suffix.isEmpty &&
            hasGeometry(extra) &&
            hasGeometry(labels.single) &&
            hasGeometry(monetaryCells.single) &&
            height(extra) > 0 &&
            height(labels.single) > 0 &&
            height(monetaryCells.single) > 0 &&
            _blockRight(labels.single) < _blockLeft(monetaryCells.single) &&
            (_blockLeft(labels.single) - _blockRight(extra) >=
                    height(monetaryCells.single) ||
                _blockLeft(extra) - _blockRight(monetaryCells.single) >=
                    height(monetaryCells.single))) {
          continue;
        }
        if (!_isStandaloneAmountRow(extraText)) return null;
        // Separation alone does not prove that an unexplained number is a
        // chart value. Require its adjacent ordered calendar axis as well.
        if (suffix.isNotEmpty ||
            !hasGeometry(extra) ||
            !hasGeometry(monetaryCells.single) ||
            height(extra) <= 0 ||
            height(monetaryCells.single) <= 0 ||
            _blockLeft(extra) - _blockRight(monetaryCells.single) <
                height(monetaryCells.single) ||
            aligned(monetaryCells.single, extra) ||
            !hasCalendarAxis(extra)) {
          return null;
        }
      }
    }
    return value;
  }

  _LabeledReceiptAmounts _extractLabeledAmounts(
    List<String> lines,
    String? currency, {
    List<List<ReceiptOcrBlockEvidence>> layoutRows = const [],
    Set<int> chargeTableRows = const {},
    Set<int> layoutChargeItemRows = const {},
    Set<int> ambiguousChargeTableRows = const {},
    Set<int> detachedAmountSignRows = const {},
    Map<int, String> layoutAdjustmentLines = const {},
  }) {
    String? subtotal;
    int? selectedSubtotalRow;
    String? subtotalCurrency;
    var subtotalHasExplicitCurrencyEvidence = false;
    String? tax;
    String? taxCurrency;
    var taxHasExplicitCurrencyEvidence = false;
    final ratedTaxComponents =
        <({String rate, String amount, bool explicitCurrency})>[];
    final transactionTaxAmounts = <String>[];
    var hasUnratedTax = false;
    String? service;
    String? serviceCurrency;
    var serviceHasExplicitCurrencyEvidence = false;
    String? tip;
    String? tipLabel;
    String? tipCurrency;
    var tipHasExplicitCurrencyEvidence = false;
    String? shipping;
    String? shippingLabel;
    String? shippingCurrency;
    var shippingHasExplicitCurrencyEvidence = false;
    String? discount;
    String? discountCurrency;
    var discountHasExplicitCurrencyEvidence = false;
    final discountComponents =
        <({String amount, String label, String? currency, bool explicit})>[];
    final discountRows = <int>[];
    final adjustmentRoleCounts = <String, int>{};
    var adjustmentsComplete = true;
    final incompleteReasons = <ReceiptOcrIncompleteAdjustmentReason>{};
    var aggregatedRatedTax = false;
    final totalCandidates = <({String value, int score, int order})>[];
    var seenPrintedSubtotal = false;
    bool preferMatchingPrintedCurrency(
      String? existing,
      String? existingCurrency,
      bool existingHasExplicitEvidence,
      ({String? currency, bool hasExplicitEvidence}) printed,
    ) =>
        existing == null ||
        (currency != null &&
            existingHasExplicitEvidence &&
            existingCurrency != currency &&
            printed.hasExplicitEvidence &&
            printed.currency == currency);

    for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      if (_hasSubtotalLabel(lines[lineIndex], lines[lineIndex].toLowerCase())) {
        seenPrintedSubtotal = true;
      }
      // A printed registration or tax-context header describes the receipt.
      // Keep other malformed adjustment rows in the review path.
      if (!layoutAdjustmentLines.containsKey(lineIndex) &&
          _isPrintedTaxContextHeader(lines[lineIndex])) {
        continue;
      }
      if (lineIndex + 1 < lines.length &&
          _isBillChargeDetailHeader(lines, lineIndex + 1) &&
          !_lineHasAmount(lines[lineIndex])) {
        continue;
      }
      if (_isSupportedChargeTableHeader(lines, lineIndex)) continue;
      if (detachedAmountSignRows.contains(lineIndex)) {
        if (_hasPotentialReceiptAdjustmentLabel(lines[lineIndex])) {
          adjustmentsComplete = false;
          incompleteReasons.add(
            ReceiptOcrIncompleteAdjustmentReason.detachedLabeledSign,
          );
        }
        continue;
      }
      final line =
          layoutAdjustmentLines[lineIndex] ??
          (_isFinancialLabelWithAdjacentAmount(lines, layoutRows, lineIndex)
              ? '${lines[lineIndex]} ${lines[lineIndex + 1]}'
              : lines[lineIndex]);
      if (_isEmailOnlyMetadataLine(line)) continue;
      final normalized = line.toLowerCase();
      final hasPotentialAdjustment = _hasPotentialReceiptAdjustmentLabel(line);
      if ((chargeTableRows.contains(lineIndex) ||
              ambiguousChargeTableRows.contains(lineIndex)) &&
          !layoutAdjustmentLines.containsKey(lineIndex)) {
        if (hasPotentialAdjustment &&
            !layoutChargeItemRows.contains(lineIndex)) {
          adjustmentsComplete = false;
          incompleteReasons.add(
            ReceiptOcrIncompleteAdjustmentReason.chargeTableAdjustment,
          );
        }
        continue;
      }
      final adjustmentRoles = [
        if (_hasTaxLabel(
          line,
          normalized,
          allowDescriptiveTaxLabel: seenPrintedSubtotal,
        ))
          'tax',
        if (_hasServiceChargeLabel(line, normalized)) 'service',
        if (_hasActualTipChargeLabel(line, normalized)) 'tip',
        if (_hasShippingLabel(
          line,
          normalized,
          allowParenthesizedMethod: seenPrintedSubtotal,
        ))
          'shipping',
        if (_hasDiscountLabel(line, normalized)) 'discount',
      ];
      final adjustmentRole = adjustmentRoles.firstOrNull;
      final isSubtotal = _hasSubtotalLabel(line, normalized);
      final printedHeaderCurrency = isSubtotal || adjustmentRole != null
          ? _explicitAdjustmentCurrencyFromLine(line, receiptCurrency: currency)
          : null;
      final amountCurrency = printedHeaderCurrency?.hasExplicitEvidence == true
          ? printedHeaderCurrency!.currency
          : currency;
      final amount =
          _isPrimaryTotalCurrencyLine(line, normalized) &&
              !isSubtotal &&
              adjustmentRole == null
          ? _selectedTotalAmountInLine(line, currency: currency)
          : _lastAmountInLine(line, currency: amountCurrency);
      if (adjustmentRoles.length > 1) {
        adjustmentsComplete = false;
        incompleteReasons.add(
          ReceiptOcrIncompleteAdjustmentReason.multipleAdjustmentRoles,
        );
      }
      final lastAmountToken = RegExp(
        _amountTokenPattern,
      ).allMatches(line).lastOrNull;
      final selectedAmountIsRate =
          lastAmountToken != null &&
          RegExp(r'^\s*%').hasMatch(line.substring(lastAmountToken.end));
      if (adjustmentRole != null) {
        adjustmentRoleCounts.update(
          adjustmentRole,
          (count) => count + 1,
          ifAbsent: () => 1,
        );
        if (amount == null || selectedAmountIsRate) {
          adjustmentsComplete = false;
          incompleteReasons.add(
            ReceiptOcrIncompleteAdjustmentReason.adjustmentAmountMissingOrRate,
          );
        }
        final monetaryAmounts = RegExp(_amountTokenPattern)
            .allMatches(line)
            .where(
              (token) => !RegExp(r'^\s*%').hasMatch(line.substring(token.end)),
            )
            .length;
        if (monetaryAmounts != 1) {
          adjustmentsComplete = false;
          incompleteReasons.add(
            ReceiptOcrIncompleteAdjustmentReason.multipleMonetaryTokens,
          );
        }
      }
      if (adjustmentRole == null && hasPotentialAdjustment) {
        adjustmentsComplete = false;
        incompleteReasons.add(
          ReceiptOcrIncompleteAdjustmentReason.unclassifiedAdjustmentLabel,
        );
      }
      if (isSubtotal && (amount == null || selectedAmountIsRate)) {
        adjustmentsComplete = false;
        incompleteReasons.add(
          ReceiptOcrIncompleteAdjustmentReason.subtotalAmountMissingOrRate,
        );
      }
      if (amount == null || selectedAmountIsRate) continue;

      if (_hasSubtotalLabel(line, normalized)) {
        final printed = _explicitAdjustmentCurrencyFromLine(
          line,
          receiptCurrency: currency,
        );
        final retainedCurrency = subtotalHasExplicitCurrencyEvidence
            ? subtotalCurrency
            : currency;
        final printedCurrency = printed.hasExplicitEvidence
            ? printed.currency
            : currency;
        if (subtotal != null &&
            retainedCurrency == printedCurrency &&
            double.tryParse(subtotal) != double.tryParse(amount)) {
          adjustmentsComplete = false;
          incompleteReasons.add(
            ReceiptOcrIncompleteAdjustmentReason.conflictingSubtotal,
          );
        }
        if (preferMatchingPrintedCurrency(
          subtotal,
          subtotalCurrency,
          subtotalHasExplicitCurrencyEvidence,
          printed,
        )) {
          subtotal = amount;
          selectedSubtotalRow = lineIndex;
          subtotalCurrency = printed.currency;
          subtotalHasExplicitCurrencyEvidence = printed.hasExplicitEvidence;
        }
      } else if (adjustmentRole == 'tax') {
        final printed = _explicitAdjustmentCurrencyFromLine(
          line,
          receiptCurrency: currency,
        );
        if (!printed.hasExplicitEvidence || printed.currency == currency) {
          transactionTaxAmounts.add(amount);
        }
        final printedRate = RegExp(
          r'\b(?:sales\s+tax|tax|vat|gst|hst|iva|tva|kdv|mwst)\b\.?\s*\(?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*%\s*\)?',
        ).firstMatch(normalized);
        final rate = printedRate == null
            ? null
            : double.tryParse(
                printedRate.group(1)!.replaceAll(',', '.'),
              )?.toString();
        if (rate != null &&
            currency != null &&
            (!printed.hasExplicitEvidence || printed.currency == currency)) {
          ratedTaxComponents.add((
            rate: rate,
            amount: amount,
            explicitCurrency: printed.hasExplicitEvidence,
          ));
        } else {
          hasUnratedTax = true;
        }
        if (preferMatchingPrintedCurrency(
          tax,
          taxCurrency,
          taxHasExplicitCurrencyEvidence,
          printed,
        )) {
          tax = amount;
          taxCurrency = printed.currency;
          taxHasExplicitCurrencyEvidence = printed.hasExplicitEvidence;
        }
      } else if (_hasServiceChargeLabel(line, normalized)) {
        final printed = _explicitAdjustmentCurrencyFromLine(
          line,
          receiptCurrency: currency,
        );
        if (preferMatchingPrintedCurrency(
          service,
          serviceCurrency,
          serviceHasExplicitCurrencyEvidence,
          printed,
        )) {
          service = amount;
          serviceCurrency = printed.currency;
          serviceHasExplicitCurrencyEvidence = printed.hasExplicitEvidence;
        }
      } else if (_hasActualTipChargeLabel(line, normalized)) {
        final adjustmentCurrency = _explicitAdjustmentCurrencyFromLine(
          line,
          receiptCurrency: currency,
        );
        if (preferMatchingPrintedCurrency(
          tip,
          tipCurrency,
          tipHasExplicitCurrencyEvidence,
          adjustmentCurrency,
        )) {
          tip = amount;
          tipLabel = _originalReceiptAdjustmentLabel(line, fallback: 'Tip');
          tipCurrency = adjustmentCurrency.currency;
          tipHasExplicitCurrencyEvidence =
              adjustmentCurrency.hasExplicitEvidence;
        }
      } else if (adjustmentRole == 'shipping') {
        final adjustmentCurrency = _explicitAdjustmentCurrencyFromLine(
          line,
          receiptCurrency: currency,
        );
        if (preferMatchingPrintedCurrency(
          shipping,
          shippingCurrency,
          shippingHasExplicitCurrencyEvidence,
          adjustmentCurrency,
        )) {
          shipping = amount;
          shippingLabel = _originalReceiptAdjustmentLabel(
            line,
            fallback: 'Shipping',
          );
          shippingCurrency = adjustmentCurrency.currency;
          shippingHasExplicitCurrencyEvidence =
              adjustmentCurrency.hasExplicitEvidence;
        }
      } else if (_hasDiscountLabel(line, normalized)) {
        final printed = _explicitAdjustmentCurrencyFromLine(
          line,
          receiptCurrency: currency,
        );
        discountRows.add(lineIndex);
        if (amount.startsWith('-')) {
          discountComponents.add((
            amount: amount,
            label: _originalReceiptAdjustmentLabel(line, fallback: 'Discount'),
            currency: printed.currency,
            explicit: printed.hasExplicitEvidence,
          ));
        }
        if (preferMatchingPrintedCurrency(
          discount,
          discountCurrency,
          discountHasExplicitCurrencyEvidence,
          printed,
        )) {
          discount = amount;
          discountCurrency = printed.currency;
          discountHasExplicitCurrencyEvidence = printed.hasExplicitEvidence;
        }
      } else if (_isPrimaryTotalCurrencyLine(line, normalized)) {
        final selectedCurrency = _currencyAdjacentToSelectedAmount(
          line,
          currency,
          allowPriorCurrencyConflict: true,
        );
        final printedCurrencies = <String>{
          ..._supportedCurrencyCodes.where(
            (code) => _hasExplicitCurrencyCode([line], code),
          ),
          ?_explicitCurrencyFromLine(line),
        };
        // A DCC or reference total may be printed next to the transaction
        // total. It remains OCR evidence, but cannot supply the primary amount
        // when its explicit denomination conflicts with this draft currency.
        final selectedUnsupportedCurrency =
            _unsupportedIsoCodeAdjacentToSelectedAmount(line);
        if (_hasUnsupportedCurrencySymbolOnSelectedAmount(line) ||
            (RegExp(_amountTokenPattern).allMatches(line).length > 1 &&
                selectedCurrency.hasExplicitEvidence &&
                selectedCurrency.currency == null) ||
            (currency != null &&
                (selectedUnsupportedCurrency != null ||
                    (!selectedCurrency.hasExplicitEvidence &&
                        _hasUnsupportedIsoMonetaryEvidence(line)))) ||
            (selectedCurrency.hasExplicitEvidence
                ? currency != null &&
                      (selectedCurrency.currency == null ||
                          selectedCurrency.currency != currency)
                : currency != null &&
                      ((line.contains('¥') &&
                              currency != 'JPY' &&
                              currency != 'CNY') ||
                          (line.contains(r'$') &&
                              !_currencyCompatibleWithBareDollar(currency)) ||
                          (printedCurrencies.isNotEmpty &&
                              (printedCurrencies.length != 1 ||
                                  !printedCurrencies.contains(currency)))))) {
          continue;
        }
        var score = 10;
        if (_hasPriorityTotalLabel(line)) {
          score += 20;
        }
        if (RegExp(r'\bcurrent\s+charges\b').hasMatch(normalized)) {
          score -= 5;
        }
        if (RegExp(r'\b(?:total\s+paid|paid\s+total)\b').hasMatch(normalized)) {
          score -= 5;
        }
        if (RegExp(r'\bnet\s+payable\b').hasMatch(normalized)) {
          score += 5;
        }
        totalCandidates.add((value: amount, score: score, order: lineIndex));
      }
    }

    // Several printed rate rows can jointly describe one provisional tax
    // field. Aggregate only distinct rates in the established receipt
    // currency; a separate summary or conflicting denomination stays in
    // review rather than being double counted or converted.
    if (!hasUnratedTax &&
        currency != null &&
        ratedTaxComponents.length > 1 &&
        ratedTaxComponents.map((component) => component.rate).toSet().length ==
            ratedTaxComponents.length) {
      final aggregate = _sumSameCurrencyOcrAmounts(
        ratedTaxComponents.map((component) => component.amount),
        currency,
      );
      if (aggregate != null) {
        aggregatedRatedTax = true;
        tax = aggregate;
        taxHasExplicitCurrencyEvidence = ratedTaxComponents.every(
          (component) => component.explicitCurrency,
        );
        taxCurrency = taxHasExplicitCurrencyEvidence ? currency : null;
      }
    }
    // Multiple separately printed negative promotions can be one provisional
    // discount only when every component has the receipt currency and their
    // exact decimal sum reconciles a unique printed total. Duplicate labels,
    // missing/foreign amounts, or other incomplete adjustments stay in review.
    var aggregatedDiscount = false;
    if (currency != null &&
        adjustmentsComplete &&
        subtotal != null &&
        discountComponents.length > 1 &&
        discountComponents.length == adjustmentRoleCounts['discount'] &&
        (!subtotalHasExplicitCurrencyEvidence ||
            subtotalCurrency == currency) &&
        discountComponents.every(
          (component) => component.explicit && component.currency == currency,
        ) &&
        discountComponents
                .map((component) => component.label.toLowerCase())
                .toSet()
                .length ==
            discountComponents.length &&
        (!taxHasExplicitCurrencyEvidence || taxCurrency == currency) &&
        (!serviceHasExplicitCurrencyEvidence || serviceCurrency == currency) &&
        (!tipHasExplicitCurrencyEvidence || tipCurrency == currency) &&
        (!shippingHasExplicitCurrencyEvidence ||
            shippingCurrency == currency) &&
        adjustmentRoleCounts.entries.every(
          (entry) =>
              entry.key == 'discount' ||
              entry.value == 1 ||
              (entry.key == 'tax' && aggregatedRatedTax),
        )) {
      final magnitude = _sumSameCurrencyOcrAmounts(
        discountComponents.map((component) => component.amount.substring(1)),
        currency,
      );
      final subtotalMinor = _ocrAmountMinorUnits(subtotal, currency);
      final discountMinor = magnitude == null
          ? null
          : _ocrAmountMinorUnits(magnitude, currency);
      final totalMinor = totalCandidates.length == 1
          ? _ocrAmountMinorUnits(totalCandidates.single.value, currency)
          : null;
      final adjustmentParts = <String?>[tax, service, tip, shipping];
      final adjustmentMinors = adjustmentParts
          .whereType<String>()
          .map((value) => _ocrAmountMinorUnits(value, currency))
          .toList(growable: false);
      if (subtotalMinor != null &&
          discountMinor != null &&
          totalMinor != null &&
          adjustmentMinors.every((value) => value != null) &&
          subtotalMinor +
                  adjustmentMinors.whereType<int>().fold(0, (a, b) => a + b) -
                  discountMinor ==
              totalMinor) {
        aggregatedDiscount = true;
        discount = '-$magnitude';
        discountCurrency = currency;
        discountHasExplicitCurrencyEvidence = true;
      }
    }
    if (adjustmentRoleCounts.entries.any(
      (entry) =>
          entry.value > 1 &&
          (entry.key != 'tax' || !aggregatedRatedTax) &&
          (entry.key != 'discount' || !aggregatedDiscount),
    )) {
      adjustmentsComplete = false;
      incompleteReasons.add(
        ReceiptOcrIncompleteAdjustmentReason.repeatedAdjustmentRole,
      );
    }
    if (!aggregatedRatedTax && transactionTaxAmounts.toSet().length > 1) {
      // A component and a summary can carry the same tax role. Retaining one
      // arbitrary component as the draft's tax would assert the wrong amount.
      tax = null;
      taxCurrency = null;
      taxHasExplicitCurrencyEvidence = false;
    }

    final sameCurrencySubtotal =
        !subtotalHasExplicitCurrencyEvidence ||
        (currency != null && subtotalCurrency == currency);
    final subtotalValue = subtotal == null || !sameCurrencySubtotal
        ? null
        : double.tryParse(subtotal);
    final sameCurrencyTax =
        !taxHasExplicitCurrencyEvidence ||
        (currency != null && taxCurrency == currency);
    final sameCurrencyService =
        !serviceHasExplicitCurrencyEvidence ||
        (currency != null && serviceCurrency == currency);
    final sameCurrencyTip =
        !tipHasExplicitCurrencyEvidence ||
        (currency != null && tipCurrency == currency);
    final sameCurrencyShipping =
        !shippingHasExplicitCurrencyEvidence ||
        (currency != null && shippingCurrency == currency);
    final sameCurrencyDiscount =
        !discountHasExplicitCurrencyEvidence ||
        (currency != null && discountCurrency == currency);
    final discountMagnitude = discount == null || !sameCurrencyDiscount
        ? null
        : double.tryParse(discount)?.abs();
    final supportedParts = [
      if (sameCurrencyTax) tax,
      if (sameCurrencyService) service,
      if (sameCurrencyTip) tip,
      if (sameCurrencyShipping) shipping,
    ].map((value) => value == null ? null : double.tryParse(value));
    final supportedSum = subtotalValue == null
        ? null
        : subtotalValue +
              supportedParts.whereType<double>().fold<double>(
                0,
                (a, b) => a + b,
              ) -
              (discountMagnitude ?? 0);
    totalCandidates.sort((left, right) {
      int rank(({String value, int score, int order}) candidate) {
        final parsed = double.tryParse(candidate.value);
        final arithmetic =
            supportedSum != null &&
                parsed != null &&
                (parsed - supportedSum).abs() <= 0.02
            ? 4
            : 0;
        return candidate.score + arithmetic;
      }

      final scoreOrder = rank(right).compareTo(rank(left));
      return scoreOrder != 0 ? scoreOrder : right.order.compareTo(left.order);
    });
    final total = totalCandidates.firstOrNull?.value;

    return _LabeledReceiptAmounts(
      subtotal: subtotal,
      subtotalCurrency: subtotalCurrency,
      subtotalHasExplicitCurrencyEvidence: subtotalHasExplicitCurrencyEvidence,
      tax: tax,
      taxCurrency: taxCurrency,
      taxHasExplicitCurrencyEvidence: taxHasExplicitCurrencyEvidence,
      service: service,
      serviceCurrency: serviceCurrency,
      serviceHasExplicitCurrencyEvidence: serviceHasExplicitCurrencyEvidence,
      tip: tip,
      tipLabel: tipLabel,
      tipCurrency: tipCurrency,
      tipHasExplicitCurrencyEvidence: tipHasExplicitCurrencyEvidence,
      shipping: shipping,
      shippingLabel: shippingLabel,
      shippingCurrency: shippingCurrency,
      shippingHasExplicitCurrencyEvidence: shippingHasExplicitCurrencyEvidence,
      discount: discount,
      discountCurrency: discountCurrency,
      discountHasExplicitCurrencyEvidence: discountHasExplicitCurrencyEvidence,
      discountBeforeSubtotal:
          currency != null &&
          selectedSubtotalRow != null &&
          discountRows.length == 1 &&
          discountRows.single < selectedSubtotalRow &&
          discount?.startsWith('-') == true &&
          (!discountHasExplicitCurrencyEvidence ||
              discountCurrency == currency),
      adjustmentsComplete: adjustmentsComplete,
      incompleteReasons: incompleteReasons.toList(growable: false),
      total: total,
    );
  }

  ({
    List<ReceiptOcrItemCandidate> items,
    bool truncated,
    bool unretainedPricedItem,
    List<ReceiptOcrItemLineDecision> lineDecisions,
    List<ReceiptOcrItemLineDecision> itemSelectionDecisions,
    Set<int> nonItemSummaryRows,
    Set<int> uncertainSummaryAmountRows,
  })
  _extractItems(
    List<String> lines,
    String? currency, {
    String? selectedTotal,
    Set<int> merchantLineIndices = const {},
    List<List<ReceiptOcrBlockEvidence>> layoutRows = const [],
    Set<int> chargeTableRows = const {},
    Set<int> ambiguousChargeTableRows = const {},
    Map<int, ReceiptOcrItemCandidate> layoutChargeItems = const {},
    Set<int> layoutAdjustmentRows = const {},
    Set<int> detachedAmountSignRows = const {},
  }) {
    final items = <ReceiptOcrItemCandidate>[];
    final nonItemSummaryRows = <int>{};
    final uncertainSummaryAmountRows = <int>{};
    final itemSelectionDecisions = <ReceiptOcrItemLineDecision>[];
    final lineDecisions = List<ReceiptOcrItemLineDecision>.filled(
      lines.length,
      ReceiptOcrItemLineDecision.unclassified,
    );
    var unretainedPricedItem = false;
    final wrappedDescriptionLines = <String>[];
    var afterSubtotal = false;
    final leadingQuantityRows = _leadingQuantityColumnRows(lines, layoutRows);
    final hasFuelMeasurementLayout =
        lines.any(
          (line) => RegExp(
            r'^(?:GALLONS?|LIT(?:ER|RE)S?)\b',
            caseSensitive: false,
          ).hasMatch(line),
        ) &&
        lines.any(
          (line) => RegExp(
            r'^(?:PRICE\s*/\s*(?:GAL|L)|UNIT\s+PRICE)\b',
            caseSensitive: false,
          ).hasMatch(line),
        );
    final fuelItem = _extractFuelItem(
      lines,
      currency,
      selectedTotal: selectedTotal,
      merchantLineIndices: merchantLineIndices,
      detachedAmountSignRows: detachedAmountSignRows,
    );
    if (fuelItem != null) {
      items.add(fuelItem);
      itemSelectionDecisions.add(ReceiptOcrItemLineDecision.fuelItemSelected);
    }
    for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      final line = lines[lineIndex];
      if (_hasSubtotalLabel(line, line.toLowerCase())) {
        afterSubtotal = true;
      }
      if (layoutAdjustmentRows.contains(lineIndex)) {
        lineDecisions[lineIndex] =
            ReceiptOcrItemLineDecision.metadataOrHeaderSkipped;
        wrappedDescriptionLines.clear();
        continue;
      }
      final layoutChargeItem = layoutChargeItems[lineIndex];
      if (layoutChargeItem != null) {
        lineDecisions[lineIndex] =
            ReceiptOcrItemLineDecision.layoutChargeSelected;
        items.add(layoutChargeItem);
        itemSelectionDecisions.add(
          ReceiptOcrItemLineDecision.layoutChargeSelected,
        );
        wrappedDescriptionLines.clear();
        continue;
      }
      if (ambiguousChargeTableRows.contains(lineIndex)) {
        lineDecisions[lineIndex] =
            ReceiptOcrItemLineDecision.ambiguousChargeSkipped;
        wrappedDescriptionLines.clear();
        continue;
      }
      final ownedSummaryRows = _ownedSummaryCardHeaderRows(
        layoutRows,
        lineIndex,
        currency,
        selectedTotal,
        uncertainSummaryAmountRows,
      );
      if (ownedSummaryRows != null) {
        nonItemSummaryRows.addAll(ownedSummaryRows);
      }
      if (ownedSummaryRows != null ||
          (_isAdministrativeLine(line) &&
              !chargeTableRows.contains(lineIndex)) ||
          (afterSubtotal &&
              !chargeTableRows.contains(lineIndex) &&
              _hasShippingLabel(
                line,
                line.toLowerCase(),
                allowParenthesizedMethod: true,
              )) ||
          (!chargeTableRows.contains(lineIndex) &&
              _isPostSubtotalAdjustmentLine(
                line,
                allowDescriptiveTaxLabel: afterSubtotal,
                allowDescriptiveSurchargeLabel: afterSubtotal,
              ) &&
              (afterSubtotal || _hasExplicitTaxRate(line))) ||
          _isContextualReceiptMetadataLine(lines, lineIndex) ||
          _isChargeTableHeader(line) ||
          detachedAmountSignRows.contains(lineIndex) ||
          merchantLineIndices.contains(lineIndex) ||
          ((fuelItem != null || hasFuelMeasurementLayout) &&
              _isFuelMeasurementLine(line) &&
              !_isPricedFuelLine(line))) {
        lineDecisions[lineIndex] =
            ReceiptOcrItemLineDecision.metadataOrHeaderSkipped;
        wrappedDescriptionLines.clear();
        continue;
      }
      if (_isStandaloneAmountRow(line)) {
        lineDecisions[lineIndex] =
            ReceiptOcrItemLineDecision.standaloneAmountSkipped;
        wrappedDescriptionLines.clear();
        continue;
      }

      final layoutFallback = _extractLayoutItemFallback(
        lines,
        layoutRows,
        lineIndex,
        currency,
      );

      final match =
          _pricedItemRowPattern.firstMatch(line) ??
          _joinedSymbolPricedItemRowPattern.firstMatch(line);
      if (match == null) {
        if (layoutFallback != null) {
          lineDecisions[lineIndex] =
              ReceiptOcrItemLineDecision.layoutFallbackSelected;
          items.add(layoutFallback);
          itemSelectionDecisions.add(
            ReceiptOcrItemLineDecision.layoutFallbackSelected,
          );
          wrappedDescriptionLines.clear();
          continue;
        }
        final cleaned = _cleanDescription(line);
        if (lineIndex + 1 < lines.length &&
            _isWrappedItemDescriptionCandidate(cleaned) &&
            !_isLikelyNonItemDescription(cleaned) &&
            !_isStandaloneTenderLabel(cleaned) &&
            !_isFinancialLabelWithAdjacentAmount(
              lines,
              layoutRows,
              lineIndex,
            ) &&
            _isStandaloneAmountRow(lines[lineIndex + 1]) &&
            _isAdjacentRightColumnAmount(layoutRows, lineIndex)) {
          final amountLine = lines[lineIndex + 1];
          final amountCurrency = _itemCurrencyFromPrintedText(
            amountLine,
            currency,
          );
          final lineTotal = _lastAmountInLine(
            amountLine,
            currency: amountCurrency,
          );
          if (lineTotal != null) {
            lineDecisions[lineIndex] =
                ReceiptOcrItemLineDecision.adjacentAmountSelected;
            lineDecisions[lineIndex + 1] =
                ReceiptOcrItemLineDecision.adjacentAmountSelected;
            final wrappedDescription = wrappedDescriptionLines.join(' ');
            var description =
                _isStrongWrappedItemDescription(wrappedDescription)
                ? '$wrappedDescription $cleaned'
                : cleaned;
            if (items.isNotEmpty &&
                lineIndex > 0 &&
                lineDecisions[lineIndex - 1] ==
                    ReceiptOcrItemLineDecision.unpricedDescription &&
                _isPrintedModifierLine(lines[lineIndex - 1]) &&
                _isPrintedModifierLine(cleaned)) {
              description = description.replaceFirst(RegExp(r'^\+\s+'), '');
            }
            items.add(
              ReceiptOcrItemCandidate(
                description: description,
                lineTotal: lineTotal,
                currency: amountCurrency,
                currencyUnresolved: _selectedItemCurrencyUnresolved(
                  amountLine,
                  currency,
                ),
                confidence: _averageBlockConfidence([
                  ...layoutRows[lineIndex],
                  ...layoutRows[lineIndex + 1],
                ]),
                category: 'item_line',
              ),
            );
            itemSelectionDecisions.add(
              ReceiptOcrItemLineDecision.adjacentAmountSelected,
            );
            wrappedDescriptionLines.clear();
            lineIndex += 1;
            continue;
          }
        }
        if (_isPrintedModifierLine(line)) {
          // An unpriced modifier belongs to the preceding selection. Keep it
          // in raw review evidence instead of attaching it to the next charge.
          wrappedDescriptionLines.clear();
          lineDecisions[lineIndex] =
              ReceiptOcrItemLineDecision.unpricedDescription;
          continue;
        }
        if (lineIndex > 0 && _isWrappedItemDescriptionCandidate(cleaned)) {
          wrappedDescriptionLines.add(cleaned);
          // Keep the OCR continuation window bounded so unrelated earlier
          // receipt copy cannot be pulled into a later priced row.
          if (wrappedDescriptionLines.length > 3) {
            wrappedDescriptionLines.removeAt(0);
          }
        } else {
          wrappedDescriptionLines.clear();
        }
        final printedAmount = RegExp(_amountTokenPattern).firstMatch(line);
        if (printedAmount != null && _lineHasAmount(line)) {
          final description = _cleanDescription(
            line.substring(0, printedAmount.start),
          );
          if (_hasSubstantiveItemDescription(description) &&
              !_isLikelyNonItemDescription(description, pricedRow: true)) {
            unretainedPricedItem = true;
            lineDecisions[lineIndex] =
                ReceiptOcrItemLineDecision.unretainedPricedRow;
          }
        }
        if (lineDecisions[lineIndex] ==
            ReceiptOcrItemLineDecision.unclassified) {
          lineDecisions[lineIndex] =
              ReceiptOcrItemLineDecision.unpricedDescription;
        }
        continue;
      }

      var description = _cleanDescription(match.group(1)!);
      if (items.isNotEmpty &&
          lineIndex > 0 &&
          lineDecisions[lineIndex - 1] ==
              ReceiptOcrItemLineDecision.unpricedDescription &&
          _isPrintedModifierLine(lines[lineIndex - 1]) &&
          _isPrintedModifierLine(description)) {
        description = description.replaceFirst(RegExp(r'^\+\s+'), '');
      }
      if (chargeTableRows.contains(lineIndex)) {
        description = _stripChargeTableColumns(description);
      }
      final wrappedDescription = wrappedDescriptionLines.join(' ');
      if (_isStrongWrappedItemDescription(wrappedDescription)) {
        description = '$wrappedDescription $description';
      }
      wrappedDescriptionLines.clear();
      final lineCurrency = _itemCurrencyFromPrintedText(
        line,
        currency,
        token: match.group(2) ?? match.group(4),
      );
      final currencyUnresolved = _selectedItemCurrencyUnresolved(
        line,
        currency,
      );
      final lineConfidence = lineIndex < layoutRows.length
          ? _averageBlockConfidence(layoutRows[lineIndex])
          : null;
      final lineTotal = _normalizeAmount(
        match.group(3)!,
        currency: lineCurrency,
      );
      if (!_hasSubstantiveItemDescription(description) ||
          lineTotal == null ||
          _isLikelyNonItemDescription(description, pricedRow: true) ||
          !_hasTraceableItemAmountToken(line, match.group(3)!)) {
        lineDecisions[lineIndex] = layoutFallback != null
            ? ReceiptOcrItemLineDecision.layoutFallbackSelected
            : ReceiptOcrItemLineDecision.invalidPricedRow;
        if (layoutFallback != null) {
          items.add(layoutFallback);
          itemSelectionDecisions.add(
            ReceiptOcrItemLineDecision.layoutFallbackSelected,
          );
        } else if (_hasSubstantiveItemDescription(description) &&
            !_isLikelyNonItemDescription(description, pricedRow: true)) {
          unretainedPricedItem = true;
        }
        continue;
      }

      final quantityMatch = RegExp(
        r'^(.*?)\s+(\d{1,6}(?:\.\d{1,3})?)\s*'
        r'(?:kg|g|lb|lbs|oz|l|ml|gal|gallon|gallons)?\s*'
        r'[xX@]\s*(\d{1,6}(?:\.\d{1,3})?)'
        r'(?:\s*/\s*(?:kg|g|lb|lbs|oz|l|ml|gal|gallon|gallons))?$',
        caseSensitive: false,
      ).firstMatch(description);
      if (quantityMatch != null) {
        final quantity = quantityMatch.group(2)!;
        final unitPrice = _normalizeAmount(
          quantityMatch.group(3)!,
          currency: lineCurrency,
        );
        final cleanedName = _cleanDescription(quantityMatch.group(1)!);
        if (cleanedName.isNotEmpty) {
          lineDecisions[lineIndex] =
              ReceiptOcrItemLineDecision.quantityItemSelected;
          items.add(
            ReceiptOcrItemCandidate(
              description: cleanedName,
              quantity: quantity,
              unitPrice: unitPrice,
              lineTotal: lineTotal,
              currency: lineCurrency,
              currencyUnresolved: currencyUnresolved,
              confidence: lineConfidence,
              category: 'item_line',
            ),
          );
          itemSelectionDecisions.add(
            ReceiptOcrItemLineDecision.quantityItemSelected,
          );
          continue;
        }
      }

      final leadingQuantity = RegExp(
        r'^(\d{1,2})\s+(.+)$',
      ).firstMatch(description);
      if (leadingQuantityRows.contains(lineIndex) &&
          leadingQuantity != null &&
          int.parse(leadingQuantity.group(1)!) > 0 &&
          _hasSubstantiveItemDescription(leadingQuantity.group(2)!)) {
        lineDecisions[lineIndex] =
            ReceiptOcrItemLineDecision.leadingQuantityItemSelected;
        items.add(
          ReceiptOcrItemCandidate(
            description: _cleanDescription(leadingQuantity.group(2)!),
            quantity: leadingQuantity.group(1),
            lineTotal: lineTotal,
            currency: lineCurrency,
            currencyUnresolved: currencyUnresolved,
            confidence: lineConfidence,
            category: 'item_line',
          ),
        );
        itemSelectionDecisions.add(
          ReceiptOcrItemLineDecision.leadingQuantityItemSelected,
        );
        continue;
      }

      lineDecisions[lineIndex] = ReceiptOcrItemLineDecision.pricedItemSelected;
      items.add(
        ReceiptOcrItemCandidate(
          description: description,
          lineTotal: lineTotal,
          currency: lineCurrency,
          currencyUnresolved: currencyUnresolved,
          confidence: lineConfidence,
          category: 'item_line',
        ),
      );
      itemSelectionDecisions.add(ReceiptOcrItemLineDecision.pricedItemSelected);
    }

    if (fuelItem != null && items.length > 1) {
      // A receipt grand total cannot safely serve as the fuel line total when
      // another priced purchase is present. Keep the other traceable lines
      // and leave the fuel measurement for explicit review.
      items.remove(fuelItem);
      itemSelectionDecisions.removeAt(0);
      unretainedPricedItem = true;
    }
    if (fuelItem != null && items.contains(fuelItem)) {
      for (var index = 0; index < lines.length; index++) {
        if (merchantLineIndices.contains(index) ||
            _isPricedFuelLine(lines[index])) {
          continue;
        }
        final match = RegExp(
          r'^(?:FUEL|PRODUCT)\s*[:#-]?\s+(.+)$',
          caseSensitive: false,
        ).firstMatch(lines[index]);
        if (match != null &&
            _cleanDescription(match.group(1)!) == fuelItem.description) {
          lineDecisions[index] = ReceiptOcrItemLineDecision.fuelItemSelected;
          break;
        }
      }
    }

    return (
      items: items.take(40).toList(growable: false),
      truncated: items.length > 40,
      unretainedPricedItem: unretainedPricedItem,
      lineDecisions: lineDecisions,
      nonItemSummaryRows: nonItemSummaryRows,
      uncertainSummaryAmountRows: uncertainSummaryAmountRows,
      itemSelectionDecisions: itemSelectionDecisions
          .take(40)
          .toList(growable: false),
    );
  }

  ReceiptOcrItemCandidate? _extractLayoutItemFallback(
    List<String> lines,
    List<List<ReceiptOcrBlockEvidence>> layoutRows,
    int rowIndex,
    String? currency,
  ) {
    if (layoutRows.length != lines.length ||
        _isPaymentMetadataLine(lines[rowIndex]) ||
        _isAdministrativeLine(lines[rowIndex])) {
      return null;
    }
    final row = layoutRows[rowIndex];
    if (row.length < 2 || row.any((block) => block.points.isEmpty)) {
      return null;
    }
    final amountCellPattern = RegExp(
      '^\\s*(?:(?:$_currencyTokenPattern)\\s*)?$_amountTokenPattern'
      '(?:\\s*(?:$_currencyTokenPattern))?\\s*\$',
      caseSensitive: false,
    );
    bool hasMonetaryEvidence(ReceiptOcrBlockEvidence cell) {
      final cellText = _normalizeOcrLine(cell.text);
      final printed = _explicitAdjustmentCurrencyFromLine(
        cellText,
        receiptCurrency: currency,
      );
      final adjacentCurrency = _nearbyCurrencyOnlyBlocks(row, cell);
      if (adjacentCurrency.length > 1) return false;
      final cellCurrency = adjacentCurrency.isEmpty
          ? printed.currency ?? currency
          : _explicitAdjustmentCurrencyFromLine(
                  '${_normalizeOcrLine(adjacentCurrency.single.text)} $cellText',
                  receiptCurrency: currency,
                ).currency ??
                currency;
      final minorDigits = _currencyMinorUnitDigits(cellCurrency);
      return printed.hasExplicitEvidence ||
          (cellCurrency != null &&
              minorDigits == 0 &&
              RegExp(r'^\s*\d{1,9}\s*$').hasMatch(cellText)) ||
          (minorDigits > 0 &&
              RegExp('[.,]\\d{1,$minorDigits}\\b').hasMatch(cellText));
    }

    final amountCells = row
        .where((block) {
          final cellText = _normalizeOcrLine(block.text);
          return amountCellPattern.hasMatch(cellText) &&
              hasMonetaryEvidence(block);
        })
        .toList(growable: false);
    if (amountCells.length != 1) return null;
    final amountCell = amountCells.single;
    if (_nearbySignOnlyBlocks(row, amountCell).isNotEmpty) return null;
    final amountText = _normalizeOcrLine(amountCell.text);
    final amountLeft = amountCell.points
        .map((point) => point.x)
        .reduce((left, right) => left < right ? left : right);
    final amountRight = amountCell.points
        .map((point) => point.x)
        .reduce((left, right) => left > right ? left : right);
    final nearbyCurrencyBlocks = _nearbyCurrencyOnlyBlocks(row, amountCell);
    if (nearbyCurrencyBlocks.length > 1) return null;
    final currencyBlock = nearbyCurrencyBlocks.firstOrNull;
    final monetaryText = currencyBlock == null
        ? amountText
        : '${_normalizeOcrLine(currencyBlock.text)} $amountText';
    final rightToLeft = row.any(
      (block) =>
          block != amountCell &&
          block.textDirection == 'rtl' &&
          _unicodeLetterPattern.hasMatch(block.text),
    );
    final descriptionBlocks = row
        .where((block) {
          if (block == amountCell ||
              block == currencyBlock ||
              !_unicodeLetterPattern.hasMatch(block.text) ||
              amountCellPattern.hasMatch(_normalizeOcrLine(block.text))) {
            return false;
          }
          final left = block.points
              .map((point) => point.x)
              .reduce((a, b) => a < b ? a : b);
          final right = block.points
              .map((point) => point.x)
              .reduce((a, b) => a > b ? a : b);
          return rightToLeft
              ? left >= amountRight + 8
              : right <= amountLeft - 8;
        })
        .toList(growable: false);
    final description = _cleanDescription(
      descriptionBlocks.map((block) => block.text.trim()).join(' '),
    );
    if (!_hasSubstantiveItemDescription(description) ||
        _isLikelyNonItemDescription(description, pricedRow: true)) {
      return null;
    }
    final coreRow = '$description $monetaryText';
    if (_isAdministrativeLine(coreRow) ||
        _isPaymentMetadataLine(coreRow) ||
        _isReceiptMetadataLine(coreRow, allowBarePostal: false)) {
      return null;
    }
    // A bare integer could be an account or reference number. The fallback
    // uses a printed denomination or a zero-minor-unit receipt currency plus
    // a bounded amount cell; the geometry and metadata guards still apply.
    final printedCurrency = _explicitAdjustmentCurrencyFromLine(
      monetaryText,
      receiptCurrency: currency,
    );
    final lineCurrency = printedCurrency.hasExplicitEvidence
        ? printedCurrency.currency
        : currency;
    final minorDigits = _currencyMinorUnitDigits(lineCurrency);
    final decimalEvidence =
        minorDigits > 0 &&
        RegExp('[.,]\\d{1,$minorDigits}\\b').hasMatch(amountText);
    final zeroMinorIntegerEvidence =
        lineCurrency != null &&
        minorDigits == 0 &&
        RegExp(r'^\s*\d{1,9}\s*$').hasMatch(amountText);
    if (!printedCurrency.hasExplicitEvidence &&
        !decimalEvidence &&
        !zeroMinorIntegerEvidence) {
      return null;
    }
    final lineTotal = _lastAmountInLine(monetaryText, currency: lineCurrency);
    if (lineTotal == null) return null;
    return ReceiptOcrItemCandidate(
      description: description,
      lineTotal: lineTotal,
      currency: lineCurrency,
      currencyUnresolved:
          printedCurrency.hasExplicitEvidence && lineCurrency == null,
      confidence: _averageBlockConfidence(row),
      category: 'item_line',
    );
  }

  // Only this printed, bounded utility layout can recover a row whose
  // flattened text mixes a charge with a separate support panel. Other table
  // types and rows without a complete proof retain the existing parser paths.
  ({
    Map<int, ReceiptOcrItemCandidate> items,
    Map<int, String> adjustments,
    Set<int> ambiguous,
  })
  _boundedUtilityColumnRecovery(
    List<String> lines,
    List<List<ReceiptOcrBlockEvidence>> rows,
    String? currency,
  ) {
    final items = <int, ReceiptOcrItemCandidate>{};
    final adjustments = <int, String>{};
    final ambiguous = <int>{};
    final pluralFinancialRoles = RegExp(
      r'\b(?:taxes|tips|gratuities|discounts|coupons|surcharges|charges|fees|refunds|rebates|credits|deposits|levies|duties|donations|payments)\b',
      caseSensitive: false,
    );
    final strongFooterLabel = RegExp(
      r'(?:^sub[\s-]?total|\b(?:grand|refund)\s+total|'
      r'\btotal\s+(?:(?:amount\s+)?due|current\s+charges|paid|for)|'
      r'\bpaid\s+total|\b(?:amount|balance|payment)\s+due)\b',
      caseSensitive: false,
    );
    final discountRolePattern = RegExp(
      r'\b(?:discount|coupon|rebate)\b',
      caseSensitive: false,
    );
    final financialConjunction = RegExp(
      r'\b(?:and|or|with|plus|minus|less|versus|vs|after|before|'
      r'including|excluding|following|without|net\s+of|'
      r'for|in|by|as\s+of|via|on|from|to|at)\b|[&:：;,，；/|.!?]|'
      r'\s+[\p{Dash}➖]\s+',
      caseSensitive: false,
      unicode: true,
    );
    // Apply the same clause grammar to visible notes and outer labels. Notes
    // cannot erase financial evidence before a service or discount is selected.
    bool hasFinancialRole(String label, String monetaryText) =>
        (RegExp(r'^payment\b', caseSensitive: false).hasMatch(label.trim()) &&
            _isInvoicePaymentFooterCopy(label)) ||
        [
              _boundedUtilityRoleText(label),
              ..._boundedUtilityAnnotationRoles(label),
            ]
            .expand((role) => role.split(financialConjunction))
            .any(
              (role) => _hasBoundedUtilityFinancialPhrase(role, monetaryText),
            );
    bool hasAdjustmentRole(String label) =>
        [
          _boundedUtilityRoleText(label),
          ..._boundedUtilityAnnotationRoles(label),
        ].expand((role) => role.split(financialConjunction)).any((clause) {
          final role = _boundedUtilityRoleText(clause);
          if (_boundedUtilityServiceChargePhrase.hasMatch(
            _boundedUtilityFinancialWords(role),
          )) {
            return true;
          }
          if (!_hasPotentialReceiptAdjustmentLabel(role) &&
              !pluralFinancialRoles.hasMatch(role)) {
            return false;
          }
          final matches =
              [
                    ..._potentialReceiptAdjustmentLabelPattern.allMatches(role),
                    ...pluralFinancialRoles.allMatches(role),
                  ]
                  .where((match) {
                    // Service stays within a named phrase regardless of word order.
                    // Explicit Service Charge/Fee remains intact.
                    return !(match.group(0)!.toLowerCase() == 'service' &&
                        RegExp(r'\p{L}', unicode: true).hasMatch(
                          role.substring(0, match.start) +
                              role.substring(match.end),
                        ));
                  })
                  .toList(growable: false);
          if (matches.isEmpty) return false;
          // One singular or plural financial noun can occur anywhere in a named
          // service clause. A second role or established multiword charge cannot.
          return matches.length != 1 ||
              matches.single.group(0)!.contains(' ') ||
              !_boundedUtilityNamedServiceQualifier.hasMatch(
                role.substring(matches.single.end),
              );
        });
    // Boundary-only normalization joins OCR money/currency fragments without
    // admitting that denomination as a selectable amount or changing evidence.
    String boundaryText(String text) =>
        _normalizeOcrLine(text).replaceAllMapped(
          RegExp(r'(?<=\d)([A-Za-z]{3})(?![\p{L}\p{N}])', unicode: true),
          (match) => ' ${match.group(1)!}',
        );
    final discountLabelPattern = RegExp(
      r'^(?:[\p{L}\p{N} -]+\s+)?(?:discount|coupon|rebate)(?:\s*\([\p{L}\p{N} %.-]+\))?$',
      caseSensitive: false,
      unicode: true,
    );
    final terminalDiscountRole = RegExp(
      r'\b(discount|coupon|rebate)(?=(?:\s*\([\p{L}\p{N} %.-]+\))?$)',
      caseSensitive: false,
      unicode: true,
    );
    if (lines.length != rows.length || currency == null) {
      return (items: items, adjustments: adjustments, ambiguous: ambiguous);
    }
    for (var index = 0; index < rows.length; index++) {
      if (!_isBillChargeDetailHeader(lines, index)) continue;
      final header = rows[index];
      if (header.any((block) => block.points.isEmpty)) continue;
      ReceiptOcrBlockEvidence? heading(String name) {
        final matches = header.where(
          (block) => block.text.trim().toLowerCase() == name,
        );
        return matches.length == 1 ? matches.single : null;
      }

      final descriptionHeader = heading('description');
      final periodHeader = heading('service period');
      final amountHeader = heading('amount');
      if (descriptionHeader == null ||
          periodHeader == null ||
          amountHeader == null ||
          _blockLeft(descriptionHeader) >= _blockRight(descriptionHeader) ||
          _blockLeft(periodHeader) >= _blockRight(periodHeader) ||
          _blockRight(descriptionHeader) >= _blockLeft(periodHeader) ||
          _blockRight(periodHeader) >= _blockLeft(amountHeader) ||
          _blockLeft(amountHeader) >= _blockRight(amountHeader)) {
        continue;
      }
      final otherHeaders = header
          .where(
            (block) =>
                block != descriptionHeader &&
                block != periodHeader &&
                block != amountHeader,
          )
          .toList();
      if (otherHeaders.length > 1 ||
          otherHeaders.any(
            (block) => _blockLeft(block) <= _blockRight(amountHeader),
          )) {
        continue;
      }
      List<ReceiptOcrBlockEvidence> tableProjection(
        Iterable<ReceiptOcrBlockEvidence> sourceRow,
      ) => sourceRow
          .where((block) {
            if (block.points.isEmpty) return false;
            final center = (_blockLeft(block) + _blockRight(block)) / 2;
            return center <= _blockRight(amountHeader) + 12;
          })
          .toList(growable: false);

      List<ReceiptOcrBlockEvidence> adjacentAmountCells(
        List<ReceiptOcrBlockEvidence> sourceRow,
      ) {
        final amountCells = <ReceiptOcrBlockEvidence>[];
        for (final block in sourceRow) {
          final left = _blockLeft(block);
          final right = _blockRight(block);
          if (left >= right) return [];
          if (left >= _blockLeft(amountHeader) - 12 &&
              right <= _blockRight(amountHeader) + 12) {
            amountCells.add(block);
          } else if (left < _blockLeft(periodHeader) - 12 ||
              right > _blockLeft(amountHeader) - 12) {
            // A following description or a cell crossing column boundaries
            // cannot lend its money to the preceding footer label.
            return [];
          }
        }
        // Period-column text can accompany an independently owned amount.
        // This is boundary evidence only; it does not select adjacent money.
        return amountCells;
      }

      bool hasAdjacentOwnedAmount(
        List<List<ReceiptOcrBlockEvidence>> tableRows,
      ) {
        if (tableRows.length != 2 || tableRows.any((row) => row.isEmpty)) {
          return false;
        }
        // The printed Amount heading proves horizontal ownership even when
        // OCR merges a footer label and currency into one wide block.
        if (tableRows.last.any(
          (block) =>
              _blockLeft(block) >= _blockRight(block) ||
              _blockLeft(block) < _blockLeft(amountHeader) - 12 ||
              _blockRight(block) > _blockRight(amountHeader) + 12,
        )) {
          return false;
        }
        ({double top, double bottom}) bounds(
          List<ReceiptOcrBlockEvidence> row,
        ) {
          final ys = row
              .expand((block) => block.points)
              .map((point) => point.y);
          return (
            top: ys.reduce((a, b) => a < b ? a : b),
            bottom: ys.reduce((a, b) => a > b ? a : b),
          );
        }

        final label = bounds(tableRows.first);
        final amount = bounds(tableRows.last);
        final labelHeight = label.bottom - label.top;
        final amountHeight = amount.bottom - amount.top;
        final height = labelHeight > amountHeight ? labelHeight : amountHeight;
        final gap = amount.top - label.bottom;
        return height > 0 &&
            (amount.top + amount.bottom) / 2 >
                (label.top + label.bottom) / 2 + height * 0.5 &&
            gap >= -height * 0.5 &&
            gap <= height * 1.5;
      }

      for (var rowIndex = index + 1; rowIndex < rows.length; rowIndex++) {
        final line = lines[rowIndex];
        if (_isSupportedChargeTableHeader(lines, rowIndex) ||
            _isChargeTableSectionBoundary(line) ||
            _hasTotalLabel(line, line.toLowerCase()) ||
            _hasSubtotalLabel(line, line.toLowerCase())) {
          break;
        }
        final row = rows[rowIndex];
        // Adjacent footer evidence belongs to the table, independently of a
        // right-hand support panel on either physical OCR row.
        final projectedRows = [
          for (final sourceRow in rows.skip(rowIndex).take(2))
            tableProjection(sourceRow),
        ];
        final adjacentAmountRows = [
          projectedRows.first,
          if (projectedRows.length == 2)
            adjacentAmountCells(projectedRows.last),
        ];
        final followingAmountLine = adjacentAmountRows.length == 2
            ? boundaryText(
                adjacentAmountRows.last
                    .map((block) => block.text.trim())
                    .join(' '),
              )
            : '';
        final boundaryRow = [
          ...row,
          if (hasAdjacentOwnedAmount(adjacentAmountRows) &&
              (_isStandaloneAmountRow(followingAmountLine) ||
                  _hasUnsupportedIsoMonetaryEvidence(followingAmountLine)))
            ...adjacentAmountRows.last,
        ];
        // A printed total ends the table before service-row eligibility.
        // Preserve the existing whole-table projection for wide total labels,
        // and also check financial labels before the period column with owned
        // amount cells. Footer labels may begin at the page margin.
        final boundaryProjections = [
          tableProjection(boundaryRow),
          boundaryRow.where((block) {
            if (block.points.isEmpty) return false;
            final left = _blockLeft(block);
            final right = _blockRight(block);
            return left < _blockLeft(periodHeader) ||
                (left >= _blockLeft(amountHeader) - 12 &&
                    right <= _blockRight(amountHeader) + 12);
          }),
        ];
        if (boundaryProjections.any((blocks) {
          // OCR may merge or split a footer's label, date and amount.
          // Keep monetary evidence opaque during date recognition: 12.10 can
          // otherwise look like a numeric date. Raw evidence is never changed.
          final originalProjection = blocks
              .map((block) => boundaryText(block.text.trim()))
              .join(' ');
          final protectedMoney = <String, String>{};
          String protect(String value) {
            // A separate currency block can bind an already protected owned
            // amount. Flatten that earlier marker before protecting the pair.
            for (final entry in protectedMoney.entries) {
              value = value.replaceAll(entry.key, entry.value);
            }
            var marker = 'BOUNDEDMONEY${protectedMoney.length}TOKEN';
            while (originalProjection.contains(marker)) {
              marker += 'X';
            }
            protectedMoney[marker] = value;
            return marker;
          }

          // Denomination support controls selection, not whether printed money
          // ends a table. Keep known unsupported ISO codes opaque here as well.
          final boundaryCurrencyPattern = [
            _currencyTokenPattern,
            ..._unsupportedIsoCurrencyMarkers(
              originalProjection,
            ).map((marker) => RegExp.escape(marker.group(0)!)),
          ].join('|');
          // An exact printed Total role ends this table even when its amount
          // is unreadable or split across further rows and period cells. This
          // boundary selects no money; named products retain their other words.
          final totalRole = RegExp(
            r'^[^\p{L}\p{N}]*total',
            caseSensitive: false,
            unicode: true,
          ).firstMatch(originalProjection);
          if (totalRole != null) {
            var suffix = originalProjection.substring(totalRole.end);
            final currencyOnly = RegExp(
              '^(?:$boundaryCurrencyPattern)',
              caseSensitive: false,
              unicode: true,
            );
            while (true) {
              suffix = suffix.replaceFirst(
                RegExp(r'^[^\p{L}\p{N}]+', unicode: true),
                '',
              );
              if (suffix.isEmpty) return true;
              final marker = currencyOnly.firstMatch(suffix);
              if (marker == null) break;
              suffix = suffix.substring(marker.end);
            }
          }
          final ownedMoneyProjection = _normalizeOcrLine(
            blocks
                .map((block) {
                  final text = boundaryText(block.text.trim());
                  if (_blockLeft(block) >= _blockLeft(amountHeader) - 12 &&
                      _blockRight(block) <= _blockRight(amountHeader) + 12 &&
                      _isStandaloneAmountRow(text) &&
                      _hasChargeTableMonetaryEvidence(text)) {
                    return protect(text);
                  }
                  return text;
                })
                .join(' '),
          );
          final boundaryAmountPattern = [
            _amountTokenPattern,
            ...protectedMoney.keys.map(RegExp.escape),
          ].join('|');
          // A denomination before another amount belongs to that following
          // money, not to an earlier bare year in a printed billing period.
          // A clock or date fragment cannot take that following-money role.
          final suffixCurrencyPattern =
              '(?:$boundaryCurrencyPattern)'
              '(?!\\s*[:=]?\\s*(?:$boundaryAmountPattern)(?![.:/\\p{L}\\p{N}]))';
          final explicitMoney = RegExp(
            '(?<![\\p{L}\\p{N}])'
            '(?:(?:$boundaryCurrencyPattern)\\s*[:=]?\\s*(?:$boundaryAmountPattern)'
            '(?:\\s*$suffixCurrencyPattern)?|'
            '(?:$boundaryAmountPattern)\\s*$suffixCurrencyPattern)'
            '(?![\\p{L}\\p{N}])',
            caseSensitive: false,
            unicode: true,
          );
          final monetaryProjection = ownedMoneyProjection.replaceAllMapped(
            explicitMoney,
            (match) => protect(match.group(0)!),
          );
          // Named-date context spans OCR blocks, including margin labels.
          // Owned money cells and explicit currency remain protected first;
          // only contextual bare tokens such as 4,25 can belong to a date.
          final namedDates = RegExp(
            '(?<![\\p{L}\\p{N}])'
            "(?<!\\d[.,/'’])"
            '${_utilityDatePattern(allowFragmentedYear: true, allowTwoDigitYear: true, allowOrdinalDay: true, allowWeekdayContext: true)}'
            '(?![\\p{L}\\p{N}])',
            caseSensitive: false,
            unicode: true,
          ).allMatches(monetaryProjection).toList(growable: false);
          // Bare money may occur before or after a date. Do not match
          // fragments of slash/dot date tokens.
          final projection = monetaryProjection
              .replaceAllMapped(
                RegExp(
                  '(?<![\\p{L}\\p{N}./])($_amountTokenPattern)'
                  '(?![\\p{L}\\p{N}./])',
                  unicode: true,
                ),
                (match) {
                  final amount = match.group(1)!;
                  if (namedDates.any(
                    (date) =>
                        match.start >= date.start && match.end <= date.end,
                  )) {
                    return amount;
                  }
                  return _hasChargeTableMonetaryEvidence(amount) &&
                          _normalizeAmount(amount, currency: currency) != null
                      ? protect(amount)
                      : amount;
                },
              )
              .replaceFirst(RegExp(r'^[^\p{L}\p{N}]+', unicode: true), '');
          // A strong printed footer role ends recovery even if its date is
          // incomplete or unreadable. This does not select a monetary value.
          if (_isChargeTableSectionBoundary(projection) ||
              strongFooterLabel.hasMatch(projection)) {
            return true;
          }
          // The Total role and explicit billing-period qualifier remain
          // adjacent semantically even when printed money lies between them.
          var temporalRoleProjection = projection;
          for (final marker in protectedMoney.keys) {
            temporalRoleProjection = temporalRoleProjection.replaceAll(
              marker,
              ' ',
            );
          }
          final temporalRole = _boundedUtilityRoleText(temporalRoleProjection);
          // A Total financial noun keeps its aggregate role through leading
          // qualifiers and punctuation. Use the same word/phrase distinction as
          // item conflicts: a named service kind in that clause (Total Security
          // Plan) remains a product name, independently of its period evidence.
          // Explicit financial phrases and notes take precedence over that
          // naming exception, e.g. Service Charges or a separate tax note.
          if (protectedMoney.isNotEmpty &&
              _boundedUtilityFinancialWords(
                temporalRole,
              ).split(financialConjunction).any((totalClause) {
                final totalHead = RegExp(
                  r'\b(?:total|sub[\s-]?total)\b',
                  caseSensitive: false,
                ).firstMatch(totalClause);
                return totalHead != null &&
                    (!_boundedUtilityNamedServiceQualifier.hasMatch(
                          totalClause.substring(totalHead.end),
                        ) ||
                        hasAdjustmentRole(
                          totalClause.substring(totalHead.end),
                        ) ||
                        hasAdjustmentRole(temporalRoleProjection) ||
                        protectedMoney.values.any(
                          (money) =>
                              hasFinancialRole(temporalRoleProjection, money),
                        ));
              })) {
            return true;
          }
          if (protectedMoney.isNotEmpty &&
              (strongFooterLabel.hasMatch(temporalRole) ||
                  RegExp(
                    r'^(?:total|sub[\s-]?total)\s+(?:for\s+)?'
                    r'(?:(?:the|this|current)\s+)*(?:(?:billing|service|statement)\s+)?'
                    r'period\b',
                    caseSensitive: false,
                  ).hasMatch(temporalRole))) {
            return true;
          }
          final boundaryContexts = RegExp(
            r'(?<![\p{L}\p{N}])'
            r"(?<!\d[.,/'’])"
            '(?:${_utilityBoundaryDatePattern()}|'
            r'(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?:\s*[ap]m)?)'
            r'(?:(?![\p{L}\p{N}])|(?=T(?:[01]\d|2[0-3]):[0-5]\d))',
            caseSensitive: false,
            unicode: true,
          );
          // A printed Total role before a date or clock remains a boundary
          // despite other trailing temporal context. This selects no money;
          // an ordinary Total-prefixed service name is not an exact role.
          if (protectedMoney.isNotEmpty &&
              boundaryContexts.allMatches(projection).any((date) {
                var prefix = projection.substring(0, date.start);
                for (final marker in protectedMoney.keys) {
                  prefix = prefix.replaceAll(marker, ' ');
                }
                prefix = _boundedUtilityRoleText(prefix);
                final temporalIntroducer = RegExp(
                  r'\s+(?:as\s+of|on|at|for|from|to|through|thru|until|dated|'
                  r'(?:(?:the|this|current)\s+)*(?:(?:billing|service|statement)\s+)?'
                  r'period(?:\s+(?:ending|ended))?)\s*[:：]?$',
                  caseSensitive: false,
                );
                // Composed qualifiers, e.g. "for the billing period ending",
                // retain the same Total role. Each step removes a known suffix.
                while (temporalIntroducer.hasMatch(prefix)) {
                  prefix = prefix.replaceFirst(temporalIntroducer, '').trim();
                }
                return RegExp(
                  r'^(?:total|sub[\s-]?total)\s*[:：]?$',
                  caseSensitive: false,
                ).hasMatch(prefix.trim());
              })) {
            return true;
          }
          var text = projection.replaceAll(boundaryContexts, ' ');
          var labelWithoutMoney = text;
          for (final entry in protectedMoney.entries) {
            labelWithoutMoney = labelWithoutMoney.replaceAll(entry.key, ' ');
            text = text.replaceAll(entry.key, entry.value);
          }
          // Multiple date-like monetary cells must not hide an otherwise
          // exact Total role. This ends recovery without selecting any money.
          if (protectedMoney.isNotEmpty &&
              RegExp(
                r'^(?:total|sub[\s-]?total)\s*[:：]?$',
                caseSensitive: false,
              ).hasMatch(_boundedUtilityRoleText(labelWithoutMoney))) {
            return true;
          }
          final roleText = _boundedUtilityRoleText(text);
          return _hasTotalLabel(text, text.toLowerCase()) ||
              _hasSubtotalLabel(text, text.toLowerCase()) ||
              _hasTotalLabel(roleText, roleText.toLowerCase()) ||
              _hasSubtotalLabel(roleText, roleText.toLowerCase());
        })) {
          break;
        }
        // Conflicting financial roles remain ambiguous before any charge-row
        // eligibility check, including labels at the page margin. They do not
        // assert a recovered monetary value.
        final financialLabel = _normalizeOcrLine(
          _cleanDescription(
            row
                .where(
                  (block) =>
                      block.points.isNotEmpty &&
                      _blockLeft(block) < _blockLeft(periodHeader),
                )
                .map((block) => block.text.trim())
                .join(' '),
          ),
        );
        final financialMonetaryText = _normalizeOcrLine(
          row
              .where(
                (block) =>
                    block.points.isNotEmpty &&
                    _blockLeft(block) >= _blockLeft(amountHeader) - 12 &&
                    _blockRight(block) <= _blockRight(amountHeader) + 12,
              )
              .map((block) => block.text.trim())
              .join(' '),
        );
        if (_lineHasAmount(financialMonetaryText) &&
            discountRolePattern.hasMatch(financialLabel)) {
          // A named service can itself contain a discount word. Remove the
          // claimed terminal adjustment role, leaving the service and notes
          // intact for the same conflicting-role checks.
          final claimedRole =
              terminalDiscountRole.firstMatch(financialLabel) ??
              discountRolePattern.firstMatch(financialLabel)!;
          final otherRoleLabel = financialLabel.replaceRange(
            claimedRole.start,
            claimedRole.end,
            '',
          );
          final remainingRoleLabel = _boundedUtilityRoleText(
            otherRoleLabel,
          ).replaceAll(financialConjunction, ' ').trim();
          // A qualifier belonging to the discount must not obscure a
          // separate payment/account clause, e.g. Payment and Loyalty Discount.
          final otherRoleClauses = financialLabel
              .split(financialConjunction)
              .where((clause) => !discountRolePattern.hasMatch(clause))
              .map(_boundedUtilityRoleText);
          if ([
                remainingRoleLabel,
                ...otherRoleClauses,
                ..._boundedUtilityAnnotationRoles(financialLabel),
              ].any((role) => hasFinancialRole(role, financialMonetaryText)) ||
              hasAdjustmentRole(otherRoleLabel) ||
              _isAdministrativeLine('$otherRoleLabel $financialMonetaryText')) {
            ambiguous.add(rowIndex);
            continue;
          }
        }
        if (row.any((block) => block.points.isEmpty)) continue;
        final amountCells = row
            .where(
              (block) =>
                  _blockRight(block) >= _blockLeft(amountHeader) - 12 &&
                  _blockLeft(block) <= _blockRight(amountHeader) + 12 &&
                  RegExp(_amountTokenPattern).hasMatch(block.text),
            )
            .toList();
        if (amountCells.length != 1) continue;
        final amountCell = amountCells.single;
        if (_blockLeft(amountCell) < _blockLeft(amountHeader) - 12 ||
            _blockRight(amountCell) > _blockRight(amountHeader) + 12) {
          continue;
        }
        final monetaryText = _normalizeOcrLine(amountCell.text);
        final amountTokens = RegExp(
          _amountTokenPattern,
        ).allMatches(monetaryText).toList(growable: false);
        if (RegExp(r'[\p{Dash}➖]\s', unicode: true).hasMatch(amountCell.text) ||
            _hasDetachedAmountSign(amountCell.text) ||
            !_isStandaloneAmountRow(monetaryText) ||
            !_hasChargeTableMonetaryEvidence(monetaryText) ||
            amountTokens.length != 1 ||
            _printedCurrencyMarkerMatches(monetaryText).length > 1 ||
            _hasUnsupportedCurrencySymbolOnSelectedAmount(monetaryText) ||
            _unsupportedIsoCodeAdjacentToSelectedAmount(monetaryText) != null) {
          continue;
        }
        final printedCurrency = _currencyAdjacentToSelectedAmount(
          monetaryText,
          currency,
        );
        if (printedCurrency.hasExplicitEvidence &&
            printedCurrency.currency != currency) {
          // Declining same-currency recovery must not erase independently valid
          // foreign-denominated evidence or its existing review warnings.
          // An unresolved marker still cannot establish a candidate's currency.
          if (printedCurrency.currency == null) ambiguous.add(rowIndex);
          continue;
        }
        final selectedAmount = amountTokens.single;
        final lineTotal = _normalizeAmount(
          selectedAmount.group(0)!,
          currency: currency,
        );
        if (lineTotal == null) continue;
        final descriptionCells = row
            .where(
              (block) =>
                  block != amountCell &&
                  _blockLeft(block) >= _blockLeft(descriptionHeader) - 12 &&
                  _blockRight(block) < _blockLeft(periodHeader),
            )
            .toList();
        final descriptionText = descriptionCells
            .map((block) => block.text.trim())
            .join(' ');
        final description = _cleanDescription(descriptionText);
        final normalizedDescription = _normalizeOcrLine(description);
        final periodCells = row
            .where(
              (block) =>
                  block != amountCell &&
                  _blockLeft(block) >= _blockLeft(periodHeader) &&
                  _blockRight(block) <= _blockLeft(amountCell),
            )
            .toList();
        if (descriptionCells.isEmpty ||
            !descriptionCells.any(
              (block) => _blockLeft(block) <= _blockRight(descriptionHeader),
            ) ||
            !_matchesUtilityPeriod(
              periodCells.map((block) => block.text.trim()).join(' '),
            )) {
          continue;
        }
        final remaining = row
            .where(
              (block) =>
                  block != amountCell &&
                  !descriptionCells.contains(block) &&
                  !periodCells.contains(block),
            )
            .toList();
        if (remaining.isNotEmpty &&
            (otherHeaders.length != 1 ||
                remaining.any(
                  (block) =>
                      _blockLeft(block) <
                          _blockLeft(otherHeaders.single) - 12 ||
                      !_isBoundedUtilitySupportCopy(block.text),
                ))) {
          continue;
        }
        if (descriptionCells.any(
          (block) => RegExp(
            r'(?<![\p{L}\p{N}])[\p{Dash}➖]|[\p{Dash}➖](?![\p{L}\p{N}])',
            unicode: true,
          ).hasMatch(block.text),
        )) {
          continue;
        }
        final ownedText = '$normalizedDescription $monetaryText';
        final roleText =
            '${_boundedUtilityRoleText(normalizedDescription)} $monetaryText';
        final ownedLower = ownedText.toLowerCase();
        if (_hasTotalLabel(ownedText, ownedLower) ||
            _hasSubtotalLabel(ownedText, ownedLower) ||
            _hasTotalLabel(roleText, roleText.toLowerCase()) ||
            _hasSubtotalLabel(roleText, roleText.toLowerCase())) {
          break;
        }
        // A terminal fee role can retain a printed percentage without treating
        // that rate as a second monetary cell. Other notes/roles stay outside
        // this proof, and the original label is kept for adjustment review.
        final feeRole = RegExp(
          r'\b(?:fee|surcharge)(?:\s*\(\d+(?:[.,]\d+)?%\))?$',
          caseSensitive: false,
        ).firstMatch(normalizedDescription);
        final feeQualifier = feeRole == null
            ? null
            : normalizedDescription.substring(0, feeRole.start).trim();
        final hasOwnedFeeRole =
            feeQualifier != null &&
            // A shared amount on an item-plus-fee clause is not owned solely
            // by the terminal fee. Keep that row on its existing review path.
            !financialConjunction.hasMatch(feeQualifier) &&
            !feeQualifier.contains('+') &&
            !RegExp(
              r'\bincl(?:ud(?:e[ds]?|ing)|usive)?\b',
              caseSensitive: false,
            ).hasMatch(feeQualifier) &&
            !hasFinancialRole(feeQualifier, monetaryText) &&
            !hasAdjustmentRole(feeQualifier) &&
            !_isAdministrativeLine('$feeQualifier $monetaryText') &&
            !lineTotal.startsWith('-');
        if (!_hasSubstantiveItemDescription(normalizedDescription) ||
            _isAccountBalanceSummaryLine(ownedText) ||
            _isBoundedUtilityAccountRole(normalizedDescription, monetaryText) ||
            _isPaymentMetadataLine(ownedText) ||
            _isPaymentMetadataLine(roleText) ||
            _isStandaloneTenderLabel(
              _boundedUtilityRoleText(normalizedDescription),
            ) ||
            _isReceiptMetadataLine(ownedText) ||
            _isReceiptMetadataLine(
              normalizedDescription,
              allowBarePostal: false,
            ) ||
            _hasDetachedAmountSign(normalizedDescription) ||
            _printedCurrencyMarkerMatches(normalizedDescription).isNotEmpty ||
            _unsupportedIsoCurrencyMarkers(normalizedDescription).isNotEmpty ||
            RegExp(r'(?<=\d)[A-Za-z]{3}(?![\p{L}\p{N}])', unicode: true)
                .allMatches(normalizedDescription)
                .any(
                  (marker) => _unsupportedIsoCurrencyMarkers(
                    marker.group(0)!,
                  ).isNotEmpty,
                ) ||
            RegExp(r'\p{Sc}', unicode: true).hasMatch(normalizedDescription) ||
            RegExp(_amountTokenPattern)
                .allMatches(normalizedDescription)
                .any(
                  (token) =>
                      _hasChargeTableMonetaryEvidence(token.group(0)!) &&
                      !(hasOwnedFeeRole &&
                          token.start >= feeRole!.start &&
                          RegExp(r'^\s*%').hasMatch(
                            normalizedDescription.substring(token.end),
                          )),
                )) {
          continue;
        }
        if (hasOwnedFeeRole) {
          adjustments[rowIndex] = ownedText;
          continue;
        }
        if (discountLabelPattern.hasMatch(normalizedDescription)) {
          final separatedAmount = monetaryText.replaceRange(
            selectedAmount.start,
            selectedAmount.end,
            ' ${selectedAmount.group(0)!} ',
          );
          adjustments[rowIndex] = 'Discount ${separatedAmount.trim()}';
          continue;
        }
        // Established financial roles remain non-item evidence in this recovery
        // path. Keep the printed description and global classifiers intact.
        if (hasFinancialRole(normalizedDescription, monetaryText) ||
            pluralFinancialRoles.hasMatch(normalizedDescription) ||
            _hasPotentialReceiptAdjustmentLabel(normalizedDescription) ||
            _isAdministrativeLine(ownedText) ||
            _isAdministrativeLine(roleText)) {
          continue;
        }
        // Preserve the existing layout extractor's non-item fee grammar.
        if (RegExp(
              r'\b(?:fees?|surcharge)(?:\s*\([^)]*\))?$',
              caseSensitive: false,
            ).hasMatch(normalizedDescription) ||
            _isExplicitNonItemFeeLine(ownedText)) {
          continue;
        }
        if (lineTotal.startsWith('-')) continue;
        items[rowIndex] = ReceiptOcrItemCandidate(
          description: description,
          lineTotal: lineTotal,
          currency: currency,
          confidence: _averageBlockConfidence([
            ...descriptionCells,
            ...periodCells,
            amountCell,
          ]),
          category: 'item_line',
        );
      }
    }
    return (items: items, adjustments: adjustments, ambiguous: ambiguous);
  }

  Map<int, String> _layoutAdjustmentEvidenceLines(
    List<String> sourceLines,
    List<List<ReceiptOcrBlockEvidence>> layoutRows,
    Set<int> ambiguousRows,
  ) {
    if (sourceLines.length != layoutRows.length) return const {};
    final lines = <int, String>{};
    for (var rowIndex = 0; rowIndex < layoutRows.length; rowIndex++) {
      final hasPrintedSubtotalBlock = layoutRows[rowIndex].any(
        (block) => RegExp(
          r'^\s*sub[\s-]?total\s*$',
          caseSensitive: false,
        ).hasMatch(block.text),
      );
      final hasPrintedTaxBlock = layoutRows[rowIndex].any(
        (block) => RegExp(
          r'^(?:[\p{L}\p{N} -]+\s+)?(?:tax|vat|gst|hst|iva|tva|kdv|mwst)(?:\s*\(\d+(?:[.,]\d+)?%\))?$',
          caseSensitive: false,
          unicode: true,
        ).hasMatch(block.text.trim()),
      );
      if (!ambiguousRows.contains(rowIndex) &&
          !hasPrintedSubtotalBlock &&
          !hasPrintedTaxBlock) {
        continue;
      }
      var headerIndex = rowIndex - 1;
      while (headerIndex >= 0 &&
          !_isSupportedChargeTableHeader(sourceLines, headerIndex)) {
        if (RegExp(
              r'^\s*(?:total\b|payment\b|messages?\b|remittance\b)',
              caseSensitive: false,
            ).hasMatch(sourceLines[headerIndex]) ||
            _isChargeTableSectionBoundary(sourceLines[headerIndex])) {
          break;
        }
        headerIndex--;
      }
      if (headerIndex < 0 ||
          !_isSupportedChargeTableHeader(sourceLines, headerIndex)) {
        continue;
      }
      final amountHeaders = layoutRows[headerIndex]
          .where(
            (block) =>
                block.points.isNotEmpty &&
                RegExp(
                  r'^(?:amount|line\s+total|total)$',
                  caseSensitive: false,
                ).hasMatch(block.text.trim()),
          )
          .toList(growable: false);
      if (amountHeaders.length != 1) continue;
      final headerLeft = amountHeaders.single.points
          .map((point) => point.x)
          .reduce((a, b) => a < b ? a : b);
      final headerRight = amountHeaders.single.points
          .map((point) => point.x)
          .reduce((a, b) => a > b ? a : b);
      final rateHeaders = layoutRows[headerIndex]
          .where(
            (block) =>
                block.points.isNotEmpty &&
                RegExp(
                  r'^rate$',
                  caseSensitive: false,
                ).hasMatch(block.text.trim()),
          )
          .toList(growable: false);
      final row = layoutRows[rowIndex];
      // A numeric usage or quantity cell is item evidence even when the
      // charge name contains "tax"; a printed rate column is not required.
      if (_hasNumericUsageCell(layoutRows, headerIndex, rowIndex)) {
        continue;
      }
      final labels = row
          .where((block) {
            final description = block.text.trim();
            return RegExp(
                  r'^sub[\s-]?total$',
                  caseSensitive: false,
                ).hasMatch(description) ||
                RegExp(
                  r'^(?:[\p{L}\p{N} -]+\s+)?(?:tax|vat|gst|hst|iva|tva|kdv|mwst)(?:\s*\(\d+(?:[.,]\d+)?%\))?$',
                  caseSensitive: false,
                  unicode: true,
                ).hasMatch(description) ||
                RegExp(
                  r'^(?:[\p{L}\p{N} -]+\s+)?(?:discount|coupon|rebate)(?:\s*\([\p{L}\p{N} %.-]+\))?$',
                  caseSensitive: false,
                  unicode: true,
                ).hasMatch(description) ||
                RegExp(
                  r'^service\s+(?:charge|fee)$',
                  caseSensitive: false,
                ).hasMatch(description);
          })
          .toList(growable: false);
      final amountBlocks = row
          .where((block) {
            if (block.points.isEmpty || !_isStandaloneAmountRow(block.text)) {
              return false;
            }
            final left = block.points
                .map((point) => point.x)
                .reduce((a, b) => a < b ? a : b);
            final right = block.points
                .map((point) => point.x)
                .reduce((a, b) => a > b ? a : b);
            final center = (left + right) / 2;
            return center >= headerLeft - 12 && center <= headerRight + 12;
          })
          .toList(growable: false);
      if (labels.length != 1 || amountBlocks.length != 1) continue;
      final label = labels.single.text.trim();
      final amountBlock = amountBlocks.single;
      final currencyBlocks = _nearbyCurrencyOnlyBlocks(row, amountBlock);
      if (currencyBlocks.length > 1) continue;
      final monetaryText = currencyBlocks.isEmpty
          ? amountBlock.text.trim()
          : '${currencyBlocks.single.text.trim()} ${amountBlock.text.trim()}';
      if (!_hasChargeTableMonetaryEvidence(monetaryText)) continue;
      if (row.any((block) {
        if (block == amountBlock || currencyBlocks.contains(block)) {
          return false;
        }
        if (rateHeaders.length == 1 && block.points.isNotEmpty) {
          final rateCenter = _blockCenterX(rateHeaders.single);
          if ((_blockCenterX(block) - rateCenter).abs() <= 60) {
            return false;
          }
        }
        return RegExp(
              _currencyTokenPattern,
              caseSensitive: false,
            ).hasMatch(block.text) &&
            _lineHasAmount(block.text);
      })) {
        continue;
      }
      if (RegExp(
            r'\b(?:tax|vat|gst|hst|iva|tva|kdv|mwst)\b',
            caseSensitive: false,
          ).hasMatch(label) &&
          !_isChargeTableSummaryLine('$label $monetaryText')) {
        continue;
      }
      final isTax = RegExp(
        r'\b(?:tax|vat|gst|hst|iva|tva|kdv|mwst)(?:\s*\(\d+(?:[.,]\d+)?%\))?$',
        caseSensitive: false,
      ).hasMatch(label);
      final rate = RegExp(r'\d+(?:[.,]\d+)?%').firstMatch(label)?.group(0);
      lines[rowIndex] =
          RegExp(r'^sub[\s-]?total$', caseSensitive: false).hasMatch(label)
          ? 'Subtotal $monetaryText'
          : isTax
          ? 'Tax ${rate == null ? '' : '$rate '}$monetaryText'
          : RegExp(
              r'^service\s+(?:charge|fee)$',
              caseSensitive: false,
            ).hasMatch(label)
          ? 'Service Charge $monetaryText'
          : 'Discount $monetaryText';
    }
    return lines;
  }

  Map<int, ReceiptOcrItemCandidate> _extractLayoutChargeTableItems(
    List<String> lines,
    List<List<ReceiptOcrBlockEvidence>> layoutRows,
    String? currency, {
    Set<int> detachedAmountSignRows = const {},
    Set<int> adjustmentRows = const {},
  }) {
    if (layoutRows.length != lines.length) return const {};
    final items = <int, ReceiptOcrItemCandidate>{};
    for (var headerIndex = 0; headerIndex < lines.length; headerIndex++) {
      if (!_isSupportedChargeTableHeader(lines, headerIndex)) continue;
      final invoiceColumns = _isInvoiceProductTableHeader(lines[headerIndex]);
      final billDetailColumns = _isBillChargeDetailHeader(lines, headerIndex);
      final header = layoutRows[headerIndex];
      final descriptionBlocks = header
          .where(
            (block) =>
                block.points.isNotEmpty &&
                (RegExp(
                      r'\bdescription\b',
                      caseSensitive: false,
                    ).hasMatch(block.text) ||
                    (billDetailColumns &&
                        !RegExp(
                          r'\bdescription\b',
                          caseSensitive: false,
                        ).hasMatch(lines[headerIndex]) &&
                        RegExp(
                          r'^\s*service\s*$',
                          caseSensitive: false,
                        ).hasMatch(block.text)) ||
                    (invoiceColumns &&
                        RegExp(
                          r'\b(?:product|service)\b',
                          caseSensitive: false,
                        ).hasMatch(block.text))),
          )
          .toList(growable: false);
      final amountBlocks = header
          .where(
            (block) =>
                block.points.isNotEmpty &&
                RegExp(
                  r'\b(?:amount|total|charges?)\b',
                  caseSensitive: false,
                ).hasMatch(block.text),
          )
          .toList(growable: false);
      if (descriptionBlocks.isEmpty || amountBlocks.isEmpty) continue;
      final descriptionLeft = descriptionBlocks
          .expand((block) => block.points)
          .map((point) => point.x)
          .reduce((left, right) => left < right ? left : right);
      final descriptionRight = descriptionBlocks
          .expand((block) => block.points)
          .map((point) => point.x)
          .reduce((left, right) => left > right ? left : right);
      final amountLeft = amountBlocks
          .expand((block) => block.points)
          .map((point) => point.x)
          .reduce((left, right) => left < right ? left : right);
      final amountRight = amountBlocks
          .expand((block) => block.points)
          .map((point) => point.x)
          .reduce((left, right) => left > right ? left : right);
      final amountOnLeft = amountRight < descriptionLeft;
      final amountOnRight = descriptionRight < amountLeft;
      if ((!amountOnLeft && !amountOnRight) || amountRight <= amountLeft) {
        continue;
      }
      final intermediateHeaderEdges = header
          .where(
            (block) =>
                block.points.isNotEmpty &&
                !descriptionBlocks.contains(block) &&
                !amountBlocks.contains(block),
          )
          .expand((block) => block.points.map((point) => point.x))
          .where(
            (x) => amountOnLeft
                ? x < descriptionLeft && x > amountRight
                : x > descriptionRight && x < amountLeft,
          )
          .toList(growable: false);
      final descriptionColumnEdge = intermediateHeaderEdges.isEmpty
          ? (amountOnLeft ? amountRight : amountLeft)
          : amountOnLeft
          ? (descriptionLeft +
                    intermediateHeaderEdges.reduce((a, b) => a > b ? a : b)) /
                2
          : (descriptionRight +
                    intermediateHeaderEdges.reduce((a, b) => a < b ? a : b)) /
                2;

      for (
        var rowIndex = headerIndex + 1;
        rowIndex < lines.length;
        rowIndex++
      ) {
        if (_isSupportedChargeTableHeader(lines, rowIndex) ||
            _isChargeTableSectionBoundary(lines[rowIndex])) {
          break;
        }
        if (detachedAmountSignRows.contains(rowIndex) ||
            adjustmentRows.contains(rowIndex)) {
          continue;
        }
        final tableBlocks = layoutRows[rowIndex]
            .where((block) {
              if (block.points.isEmpty) return false;
              final center =
                  block.points
                          .map((point) => point.x)
                          .reduce(
                            (left, right) => left < right ? left : right,
                          ) /
                      2 +
                  block.points
                          .map((point) => point.x)
                          .reduce(
                            (left, right) => left > right ? left : right,
                          ) /
                      2;
              return center >=
                      (amountOnLeft ? amountLeft : descriptionLeft) - 12 &&
                  center <=
                      (amountOnLeft ? descriptionRight : amountRight) + 12;
            })
            .toList(growable: false);
        if (tableBlocks.isEmpty) continue;
        final tableText = _normalizeOcrLine(
          tableBlocks.map((block) => block.text.trim()).join(' '),
        );
        final lower = tableText.toLowerCase();
        if (_hasTotalLabel(tableText, lower) ||
            _hasSubtotalLabel(tableText, lower)) {
          break;
        }
        final hasNumericUsageCell = _hasNumericUsageCell(
          layoutRows,
          headerIndex,
          rowIndex,
        );
        if ((invoiceColumns || billDetailColumns
                ? _isAccountBalanceSummaryLine(tableText) ||
                      _isPaymentMetadataLine(tableText)
                : _isChargeTableSummaryLine(tableText) &&
                      !(_isRatedTaxNamedLine(tableText) &&
                          hasNumericUsageCell)) ||
            _isReceiptMetadataLine(tableText)) {
          continue;
        }
        final amountCells = tableBlocks
            .where((block) {
              final left = block.points
                  .map((point) => point.x)
                  .reduce((a, b) => a < b ? a : b);
              final right = block.points
                  .map((point) => point.x)
                  .reduce((a, b) => a > b ? a : b);
              final center = (left + right) / 2;
              return (amountOnLeft
                      ? center <= amountRight + 12 && left <= amountRight
                      : center >= amountLeft - 12 && right >= amountLeft) &&
                  _lineHasAmount(block.text);
            })
            .toList(growable: false);
        if (amountCells.isEmpty) continue;
        final amountCell = amountCells.last;
        // A detached sign cannot be dropped while promoting an otherwise
        // positive amount. Keep this row unresolved until the sign is bound.
        if (_hasUnboundChargeTableSign(tableBlocks, amountCell) ||
            _hasDetachedAmountSign(amountCell.text)) {
          continue;
        }
        final nearbyCurrencyBlocks = _nearbyCurrencyOnlyBlocks(
          tableBlocks,
          amountCell,
        );
        if (nearbyCurrencyBlocks.length > 1) continue;
        final currencyBlock = nearbyCurrencyBlocks.firstOrNull;
        final monetaryText = currencyBlock == null
            ? _normalizeOcrLine(amountCell.text)
            : '${_normalizeOcrLine(currencyBlock.text)} ${_normalizeOcrLine(amountCell.text)}';
        if (!_hasChargeTableMonetaryEvidence(monetaryText)) continue;
        final printedCurrency = _explicitAdjustmentCurrencyFromLine(
          monetaryText,
          receiptCurrency: currency,
        );
        final lineCurrency = printedCurrency.hasExplicitEvidence
            ? printedCurrency.currency
            : currency;
        final lineTotal = _lastAmountInLine(
          monetaryText,
          currency: lineCurrency,
        );
        if (lineTotal == null) continue;
        final columnDescription = _cleanDescription(
          tableBlocks
              .where((block) {
                if (block == currencyBlock) return false;
                final right = block.points
                    .map((point) => point.x)
                    .reduce((a, b) => a > b ? a : b);
                final left = block.points
                    .map((point) => point.x)
                    .reduce((a, b) => a < b ? a : b);
                final center = (left + right) / 2;
                return (amountOnLeft
                        ? left > amountRight + 12 &&
                              center >= descriptionColumnEdge
                        : right < amountLeft - 12 &&
                              center <= descriptionColumnEdge) &&
                    !_isStandaloneAmountRow(block.text) &&
                    !RegExp(
                      '^(?:$_currencyTokenPattern)\\s*[-+]?\\d',
                      caseSensitive: false,
                    ).hasMatch(block.text.trim()) &&
                    _unicodeLetterPattern.hasMatch(block.text);
              })
              .map((block) => block.text.trim())
              .join(' '),
        );
        final description = columnDescription;
        if (!_hasSubstantiveItemDescription(description) ||
            _isReceiptMetadataLine(description, allowBarePostal: false)) {
          continue;
        }
        if (RegExp(
              r'\b(?:fees?|surcharge)(?:\s*\([^)]*\))?$',
              caseSensitive: false,
            ).hasMatch(description) ||
            _isExplicitNonItemFeeLine('$description $monetaryText')) {
          continue;
        }
        items[rowIndex] = ReceiptOcrItemCandidate(
          description: description,
          lineTotal: lineTotal,
          currency: lineCurrency,
          currencyUnresolved:
              printedCurrency.hasExplicitEvidence && lineCurrency == null,
          confidence: _averageBlockConfidence(tableBlocks),
          category: 'item_line',
        );
      }
    }
    return items;
  }

  ReceiptOcrItemCandidate? _extractFuelItem(
    List<String> lines,
    String? currency, {
    String? selectedTotal,
    Set<int> merchantLineIndices = const {},
    Set<int> detachedAmountSignRows = const {},
  }) {
    String? description;
    String? quantity;
    String? unitPrice;
    for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      if (merchantLineIndices.contains(lineIndex)) continue;
      final line = lines[lineIndex];
      if (detachedAmountSignRows.contains(lineIndex)) return null;
      final fuel = RegExp(
        r'^(?:FUEL|PRODUCT)\s*[:#-]?\s+(.+)$',
        caseSensitive: false,
      ).firstMatch(line);
      if (fuel != null) {
        // A second priced fuel-labelled row is a separate purchase, not the
        // description of this synthetic fuel measurement item.
        if (description != null || _isPricedFuelLine(line)) return null;
        description = _cleanDescription(fuel.group(1)!);
        continue;
      }
      if (RegExp(
        r'^(?:GALLONS?|LIT(?:ER|RE)S?)\b',
        caseSensitive: false,
      ).hasMatch(line)) {
        quantity = _lastAmountInLine(line);
        continue;
      }
      if (RegExp(
        r'^(?:PRICE\s*/\s*(?:GAL|L)|UNIT\s+PRICE)\b',
        caseSensitive: false,
      ).hasMatch(line)) {
        final printedRateCurrency = _currencyAdjacentToSelectedAmount(
          line,
          currency,
        );
        if (_hasUnsupportedCurrencySymbolOnSelectedAmount(line) ||
            _unsupportedIsoCodeAdjacentToSelectedAmount(line) != null ||
            (printedRateCurrency.hasExplicitEvidence &&
                printedRateCurrency.currency != currency)) {
          return null;
        }
        // Per-unit fuel rates commonly carry three decimal places even when
        // the transaction currency has two minor digits.
        unitPrice = _lastAmountInLine(line);
        continue;
      }
    }
    final hasSelectedTransactionTotal =
        selectedTotal != null &&
        lines.any((line) {
          final normalized = line.toLowerCase();
          if (!_isPrimaryTotalCurrencyLine(line, normalized) ||
              RegExp(
                r'\b(?:paid|payment|tender|cash|change|reference|conversion)\b',
              ).hasMatch(normalized) ||
              _selectedTotalAmountInLine(line, currency: currency) !=
                  selectedTotal) {
            return false;
          }
          final printed = _currencyAdjacentToSelectedAmount(
            line,
            currency,
            allowPriorCurrencyConflict: true,
          );
          return !printed.hasExplicitEvidence ||
              (printed.currency != null && printed.currency == currency);
        });
    if (description == null ||
        description.isEmpty ||
        quantity == null ||
        unitPrice == null ||
        !hasSelectedTransactionTotal) {
      return null;
    }
    return ReceiptOcrItemCandidate(
      description: description,
      quantity: quantity,
      unitPrice: unitPrice,
      lineTotal: selectedTotal,
      currency: currency,
      category: 'item_line',
    );
  }

  bool _isFuelMeasurementLine(String line) => RegExp(
    r'^(?:FUEL|PRODUCT|GALLONS?|LIT(?:ER|RE)S?|PRICE\s*/\s*(?:GAL|L)|UNIT\s+PRICE)\b',
    caseSensitive: false,
  ).hasMatch(line);

  bool _isPricedFuelLine(String line) =>
      RegExp(r'^(?:FUEL|PRODUCT)\b', caseSensitive: false).hasMatch(line) &&
      _hasChargeTableMonetaryEvidence(line);

  int _countUnresolvedItemLikeLines(
    List<String> lines, {
    Set<int> merchantLineIndices = const {},
    String? merchantName,
    List<List<ReceiptOcrBlockEvidence>> layoutRows = const [],
    Set<int> layoutChargeItemRows = const {},
    bool hasBoundedDccFooterBoundary = false,
    Set<int> nonItemSummaryRows = const {},
    Set<int> uncertainSummaryAmountRows = const {},
  }) {
    var count = 0;
    final lastPricedTotal = lines.lastIndexWhere(
      (line) =>
          _hasTotalLabel(line, line.toLowerCase()) && _lineHasAmount(line),
    );
    final invoiceTableHeader = lines.indexWhere(_isInvoiceProductTableHeader);
    final buyerHeadingIndex = invoiceTableHeader < 0
        ? -1
        : lines
              .take(invoiceTableHeader)
              .toList()
              .indexWhere(
                (line) => RegExp(
                  r'^\s*(?:bill(?:ed)?|ship(?:ped)?|sold)\s+to\b',
                  caseSensitive: false,
                ).hasMatch(line),
              );
    final hasSelectedInvoiceTable =
        invoiceTableHeader >= 0 &&
        buyerHeadingIndex >= 0 &&
        layoutChargeItemRows.any((row) => row > invoiceTableHeader) &&
        !layoutChargeItemRows.any((row) => row < invoiceTableHeader);
    final postTotalPaymentSection =
        !hasSelectedInvoiceTable || lastPricedTotal < 0
        ? -1
        : lines.indexWhere(
            (line) => RegExp(
              r'^\s*payment\s+(?:confirmed|confirmation)\b',
              caseSensitive: false,
            ).hasMatch(line),
            lastPricedTotal + 1,
          );
    for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      final line = lines[lineIndex];
      if (merchantLineIndices.contains(lineIndex) ||
          nonItemSummaryRows.contains(lineIndex)) {
        continue;
      }
      // Only a recognized buyer heading, its bounded paired address rows,
      // and an address-backed country line are invoice copy. Other unpriced
      // lines before the table remain unresolved. Once the total is followed by
      // an explicit payment section, only recognizable payment/support copy
      // is footer evidence; a new unpriced item remains unresolved.
      // Keep any printed adjustment or modifier outside these exemptions.
      final isInvoiceBuyerCopy =
          hasSelectedInvoiceTable &&
          lineIndex < invoiceTableHeader &&
          (lineIndex == buyerHeadingIndex ||
              _isPairedInvoiceBuyerIdentityRow(
                layoutRows,
                buyerHeadingIndex,
                lineIndex,
                invoiceTableHeader,
              ) ||
              _isPairedInvoiceBuyerStructuralRow(
                layoutRows,
                buyerHeadingIndex,
                lineIndex,
              ) ||
              _isSingleInvoiceBuyerAddressRow(
                lines,
                layoutRows,
                buyerHeadingIndex,
                lineIndex,
              ) ||
              _isSingleInvoiceBuyerCountryRow(
                lines,
                layoutRows,
                buyerHeadingIndex,
                lineIndex,
              ) ||
              (lineIndex < buyerHeadingIndex &&
                  lineIndex <= 2 &&
                  RegExp(
                    r'\binvoice\b',
                    caseSensitive: false,
                  ).hasMatch(line)) ||
              (lineIndex < buyerHeadingIndex &&
                  _isAddressBackedInvoiceCountry(lines, lineIndex)));
      if ((isInvoiceBuyerCopy ||
              (postTotalPaymentSection >= 0 &&
                  lineIndex >= postTotalPaymentSection &&
                  _isInvoicePaymentFooterCopy(
                    line,
                    merchantName: merchantName,
                  ))) &&
          !_lineHasAmount(line) &&
          !_hasPotentialReceiptAdjustmentLabel(line) &&
          !_isPrintedModifierLine(line)) {
        continue;
      }
      if ((_isSeeYouSoonFooterPhrase(line) ||
              (_isNordicCourtesyFooterPhrase(line) &&
                  (layoutRows.isEmpty ||
                      _isCenteredPostTotalFooter(
                        lines,
                        layoutRows,
                        lineIndex,
                        lastPricedTotal,
                        assumeCourtesy: true,
                      )))) &&
          lastPricedTotal >= 0 &&
          lineIndex == lines.length - 1 &&
          _hasOnlyPaymentOrSuggestedTipAmountsBeforeCourtesy(
            lines,
            lastPricedTotal,
            lineIndex,
          )) {
        continue;
      }
      if (lineIndex + 1 < lines.length &&
          _isBillChargeDetailHeader(lines, lineIndex + 1) &&
          !_lineHasAmount(line)) {
        continue;
      }
      // A location printed directly below the merchant and directly above a
      // tax registration/rate header belongs to the receipt header. A bare
      // unpriced line elsewhere remains reviewable as a possible item.
      if (lineIndex > 0 &&
          lineIndex + 1 < lines.length &&
          merchantLineIndices.contains(lineIndex - 1) &&
          _isPrintedTaxContextHeader(lines[lineIndex + 1]) &&
          !_lineHasAmount(line) &&
          !_isPrintedModifierLine(line) &&
          RegExp(
            r'^[\p{L}][\p{L} .,-]{2,60}$',
            unicode: true,
          ).hasMatch(line.trim()) &&
          (RegExp(
                r'^(?:ciudad\s+de|city\s+of)\s+[\p{L}][\p{L} .-]{2,60},\s*[A-Z]{2,4}$',
                caseSensitive: false,
                unicode: true,
              ).hasMatch(line.trim()) ||
              RegExp(
                r',\s*(?:sverige|norge|pakistan|india)\s*$',
                caseSensitive: false,
              ).hasMatch(line) ||
              (RegExp(
                    r',\s*(?:new\s+delhi|delhi|mumbai)\s*$',
                    caseSensitive: false,
                  ).hasMatch(line) &&
                  RegExp(
                    r'^\s*gstin\b',
                    caseSensitive: false,
                  ).hasMatch(lines[lineIndex + 1])) ||
              (RegExp(
                    r'^(?:new\s+delhi|delhi|mumbai)$',
                    caseSensitive: false,
                  ).hasMatch(line.trim()) &&
                  RegExp(
                    r'^\s*gstin\b',
                    caseSensitive: false,
                  ).hasMatch(lines[lineIndex + 1])))) {
        continue;
      }
      final courtesy = _isReceiptCourtesyLine(line);
      if (courtesy &&
          hasBoundedDccFooterBoundary &&
          lastPricedTotal < 0 &&
          lineIndex == lines.length - 1 &&
          lineIndex > 0 &&
          _dccExchangeRatePattern.hasMatch(lines[lineIndex - 1])) {
        continue;
      }
      if ((!courtesy && _isAdministrativeLine(line)) ||
          _isSupportedChargeTableHeader(lines, lineIndex) ||
          (!courtesy && _isContextualReceiptMetadataLine(lines, lineIndex)) ||
          _dccExchangeRatePattern.hasMatch(line) ||
          _lineHasAmount(line) ||
          _detectDate([line]) != null) {
        continue;
      }
      if (_isCenteredPostTotalFooter(
        lines,
        layoutRows,
        lineIndex,
        lastPricedTotal,
      )) {
        continue;
      }
      if (courtesy &&
          layoutRows.isEmpty &&
          lastPricedTotal >= 0 &&
          lineIndex == lines.length - 1 &&
          _hasOnlyPaymentOrSuggestedTipAmountsBeforeCourtesy(
            lines,
            lastPricedTotal,
            lineIndex,
          )) {
        continue;
      }
      if (_isCardApplicationIdentifierLine(line) &&
          lastPricedTotal >= 0 &&
          lineIndex > lastPricedTotal &&
          lines
              .skip(lastPricedTotal + 1)
              .take(lineIndex - lastPricedTotal - 1)
              .any(_isPaymentMetadataLine)) {
        continue;
      }

      final cleaned = _cleanDescription(line);
      if (lineIndex + 1 < lines.length &&
          !_isPrintedModifierLine(line) &&
          _isWrappedItemDescriptionCandidate(cleaned) &&
          !nonItemSummaryRows.contains(lineIndex + 1) &&
          !uncertainSummaryAmountRows.contains(lineIndex + 1) &&
          _isPricedItemLine(lines[lineIndex + 1])) {
        continue;
      }
      if (lineIndex + 1 < lines.length &&
          !_isPrintedModifierLine(line) &&
          _isWrappedItemDescriptionCandidate(cleaned) &&
          !_isStandaloneTenderLabel(cleaned) &&
          !_isFinancialLabelWithAdjacentAmount(lines, layoutRows, lineIndex) &&
          _isStandaloneAmountRow(lines[lineIndex + 1]) &&
          _isAdjacentRightColumnAmount(layoutRows, lineIndex)) {
        continue;
      }
      final letterCount = _unicodeLetterPattern.allMatches(cleaned).length;
      if (letterCount >= 2 &&
          (courtesy || !_isLikelyNonItemDescription(cleaned))) {
        count += 1;
      }
    }

    return count;
  }
}

bool _isCardApplicationIdentifierLine(String line) => RegExp(
  r'^aid\s*[:#-]?\s*[a-f0-9]{10,32}$',
  caseSensitive: false,
).hasMatch(line.trim());

bool _isPaymentTerminalIdentifierLine(String line) => RegExp(
  r'^(?:terminal|term|till|pos)\s*(?:(?:id|no|number)\s*)?[:#-]?\s*[a-z]?\d{1,6}$',
  caseSensitive: false,
).hasMatch(line.trim());

bool _isCenteredPostTotalFooter(
  List<String> lines,
  List<List<ReceiptOcrBlockEvidence>> layoutRows,
  int lineIndex,
  int lastPricedTotal, {
  bool assumeCourtesy = false,
}) {
  if (lastPricedTotal < 0 ||
      lineIndex <= lastPricedTotal ||
      layoutRows.length != lines.length ||
      !_hasOnlyPaymentOrSuggestedTipAmountsBeforeCourtesy(
        lines,
        lastPricedTotal,
        lineIndex,
      ) ||
      (!assumeCourtesy && !_isReceiptCourtesyLine(lines[lineIndex]))) {
    return false;
  }
  final contentPoints = layoutRows
      .take(lineIndex)
      .expand((row) => row)
      .expand((block) => block.points)
      .toList(growable: false);
  final transactionPoints = <ReceiptOcrPoint>[
    for (var index = lastPricedTotal; index < lineIndex; index++)
      if (index == lastPricedTotal || _lineHasAmount(lines[index]))
        for (final block in layoutRows[index]) ...block.points,
  ];
  final footerPoints = layoutRows[lineIndex]
      .expand((block) => block.points)
      .toList(growable: false);
  if (contentPoints.isEmpty ||
      transactionPoints.isEmpty ||
      footerPoints.isEmpty) {
    return false;
  }
  final contentLeft = contentPoints
      .map((point) => point.x)
      .reduce((a, b) => a < b ? a : b);
  final contentRight = contentPoints
      .map((point) => point.x)
      .reduce((a, b) => a > b ? a : b);
  final footerLeft = footerPoints
      .map((point) => point.x)
      .reduce((a, b) => a < b ? a : b);
  final footerRight = footerPoints
      .map((point) => point.x)
      .reduce((a, b) => a > b ? a : b);
  final transactionBottom = transactionPoints
      .map((point) => point.y)
      .reduce((a, b) => a > b ? a : b);
  final footerTop = footerPoints
      .map((point) => point.y)
      .reduce((a, b) => a < b ? a : b);
  final contentWidth = contentRight - contentLeft;
  if (footerTop <= transactionBottom ||
      contentWidth <= 0 ||
      footerRight - footerLeft > contentWidth * 0.5) {
    return false;
  }
  final contentCenter = (contentLeft + contentRight) / 2;
  final footerCenter = (footerLeft + footerRight) / 2;
  return (footerCenter - contentCenter).abs() <= contentWidth * 0.15;
}

bool _hasOnlyPaymentOrSuggestedTipAmountsBeforeCourtesy(
  List<String> lines,
  int lastPricedTotal,
  int courtesyIndex,
) {
  var sawPayment = false;
  for (var index = lastPricedTotal + 1; index < lines.length; index++) {
    if (!_lineHasAmount(lines[index])) continue;
    if (index >= courtesyIndex) return false;
    if (_isPaymentMetadataLine(lines[index])) {
      sawPayment = true;
      continue;
    }
    if (sawPayment && _isDateOrTimeOnlyLine(lines[index].toLowerCase())) {
      continue;
    }
    if (sawPayment && _isPaymentTerminalIdentifierLine(lines[index])) {
      continue;
    }
    // Printed percentage suggestions are not a charged tip. Keep the final
    // courtesy footer in its role only when each intervening priced row has
    // this bounded suggestion shape.
    if (_isPrintedSuggestedTipOptionLine(lines[index])) continue;
    // A zero balance following tender rows closes the payment sequence. A
    // nonzero balance or an item whose name contains "Balance" still needs
    // review rather than being mistaken for settled payment evidence.
    if (sawPayment &&
        _isLabeledStandaloneMoneyLine(
          lines[index],
          RegExp(r'^balance\b', caseSensitive: false),
        ) &&
        RegExp(
          r'^0(?:\.0{1,3})?$',
        ).hasMatch(_lastAmountInLine(lines[index]) ?? '')) {
      continue;
    }
    return false;
  }
  return true;
}

bool _isBareInvoiceBuyerHeading(String text) => RegExp(
  r'^\s*(?:bill(?:ed)?|ship(?:ped)?|sold)\s+to\s*:?[\s]*$',
  caseSensitive: false,
).hasMatch(text);

bool _isInvoiceStreetLine(String text) => RegExp(
  r'^\s*\d{1,6}\s+[\p{L}][\p{L}\p{N} .,-]{2,70}$',
  unicode: true,
).hasMatch(text);

bool _isSingleInvoiceBuyerAddressRow(
  List<String> lines,
  List<List<ReceiptOcrBlockEvidence>> layoutRows,
  int headingIndex,
  int rowIndex,
) {
  if (headingIndex < 0 ||
      headingIndex >= layoutRows.length ||
      layoutRows[headingIndex].isEmpty ||
      layoutRows[headingIndex].first.points.isEmpty ||
      rowIndex != headingIndex + 2 ||
      rowIndex >= layoutRows.length ||
      rowIndex + 1 >= lines.length ||
      !_isInvoiceStreetLine(lines[rowIndex]) ||
      !_isInvoiceCountryOnly(lines[rowIndex + 1])) {
    return false;
  }
  final addressRow = layoutRows[rowIndex];
  if (addressRow.length != 1 || addressRow.single.points.isEmpty) return false;
  final headingLeft = layoutRows[headingIndex].first.points
      .map((point) => point.x)
      .reduce((x, y) => x < y ? x : y);
  final addressLeft = addressRow.single.points
      .map((point) => point.x)
      .reduce((x, y) => x < y ? x : y);
  return addressLeft >= headingLeft - 24 && addressLeft <= headingLeft + 96;
}

bool _isSingleInvoiceBuyerCountryRow(
  List<String> lines,
  List<List<ReceiptOcrBlockEvidence>> layoutRows,
  int headingIndex,
  int rowIndex,
) {
  if (headingIndex < 0 ||
      headingIndex >= layoutRows.length ||
      layoutRows[headingIndex].isEmpty ||
      layoutRows[headingIndex].first.points.isEmpty ||
      rowIndex <= headingIndex + 1 ||
      rowIndex > headingIndex + 5 ||
      rowIndex >= layoutRows.length ||
      !_isInvoiceCountryOnly(lines[rowIndex])) {
    return false;
  }
  final countryRow = layoutRows[rowIndex];
  if (countryRow.length != 1 || countryRow.single.points.isEmpty) return false;
  final headingLeft = layoutRows[headingIndex].first.points
      .map((point) => point.x)
      .reduce((x, y) => x < y ? x : y);
  final countryLeft = countryRow.single.points
      .map((point) => point.x)
      .reduce((x, y) => x < y ? x : y);
  return countryLeft >= headingLeft - 24 && countryLeft <= headingLeft + 96;
}

bool _isPairedInvoiceBuyerStructuralRow(
  List<List<ReceiptOcrBlockEvidence>> layoutRows,
  int headingIndex,
  int rowIndex,
) {
  if (headingIndex < 0 ||
      rowIndex <= headingIndex + 1 ||
      rowIndex > headingIndex + 5 ||
      rowIndex >= layoutRows.length) {
    return false;
  }
  final row = layoutRows[rowIndex];
  return row.length == 2 &&
      row.every(
        (block) =>
            _isReceiptMetadataLine(block.text) ||
            _isInvoiceCountryOnly(block.text),
      ) &&
      _isPairedInvoiceBuyerCopyRow(layoutRows, rowIndex);
}

bool _isPairedInvoiceBuyerIdentityRow(
  List<List<ReceiptOcrBlockEvidence>> layoutRows,
  int headingIndex,
  int rowIndex,
  int tableHeaderIndex,
) {
  if (headingIndex < 0 ||
      rowIndex != headingIndex + 1 ||
      rowIndex + 2 >= tableHeaderIndex ||
      headingIndex >= layoutRows.length ||
      !_isPairedInvoiceBuyerCopyRow(layoutRows, rowIndex)) {
    return false;
  }
  final headings = layoutRows[headingIndex];
  if (headings.length != 2 ||
      !headings.every((block) => _isBareInvoiceBuyerHeading(block.text))) {
    return false;
  }
  final names = [...layoutRows[rowIndex]]
    ..sort((a, b) => _blockLeft(a).compareTo(_blockLeft(b)));
  final streets = layoutRows[rowIndex + 1];
  if (streets.length != 2 ||
      !streets.every((block) => _isInvoiceStreetLine(block.text)) ||
      !_isPairedInvoiceBuyerCopyRow(layoutRows, rowIndex + 1)) {
    return false;
  }
  var countryIndex = -1;
  for (
    var index = rowIndex + 2;
    index < tableHeaderIndex &&
        index < layoutRows.length &&
        index <= headingIndex + 5;
    index++
  ) {
    final row = layoutRows[index];
    if (row.length == 2 &&
        row.every((block) => _isInvoiceCountryOnly(block.text)) &&
        _isPairedInvoiceBuyerCopyRow(layoutRows, index)) {
      countryIndex = index;
      break;
    }
  }
  if (countryIndex < 0) return false;
  final split = (_blockRight(names.first) + _blockLeft(names.last)) / 2;
  final emailsByColumn = [<String>{}, <String>{}];
  for (
    var index = countryIndex + 1;
    index < tableHeaderIndex &&
        index < layoutRows.length &&
        index <= headingIndex + 8;
    index++
  ) {
    for (final block in layoutRows[index]) {
      if (block.points.isEmpty) continue;
      for (final match in RegExp(
        r'[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}',
        caseSensitive: false,
      ).allMatches(block.text)) {
        emailsByColumn[_blockLeft(block) < split ? 0 : 1].add(
          match
              .group(0)!
              .split('@')
              .first
              .split('+')
              .first
              .toLowerCase()
              .replaceAll(RegExp(r'[^\p{L}\p{N}]', unicode: true), ''),
        );
      }
    }
  }
  final normalizedNames = <String>[];
  for (final block in names) {
    final name = block.text.trim();
    if (!RegExp(
          r'^[\p{L}][\p{L}\p{M}\p{N} .\x27-]{2,70}$',
          unicode: true,
        ).hasMatch(name) ||
        name.split(RegExp(r'\s+')).length < 2) {
      return false;
    }
    normalizedNames.add(
      name.toLowerCase().replaceAll(
        RegExp(r'[^\p{L}\p{N}]', unicode: true),
        '',
      ),
    );
  }
  final leftMatches = emailsByColumn[0].contains(normalizedNames[0]);
  final rightMatches = emailsByColumn[1].contains(normalizedNames[1]);
  if (leftMatches && rightMatches) return true;
  if (normalizedNames[0] != normalizedNames[1] || !leftMatches) return false;
  final orderedStreets = [...streets]
    ..sort((a, b) => _blockLeft(a).compareTo(_blockLeft(b)));
  final orderedCountries = [...layoutRows[countryIndex]]
    ..sort((a, b) => _blockLeft(a).compareTo(_blockLeft(b)));
  return orderedStreets.first.text.trim().toLowerCase() ==
          orderedStreets.last.text.trim().toLowerCase() &&
      orderedCountries.first.text.trim().toLowerCase() ==
          orderedCountries.last.text.trim().toLowerCase();
}

double _blockLeft(ReceiptOcrBlockEvidence block) =>
    block.points.map((point) => point.x).reduce((x, y) => x < y ? x : y);

double _blockRight(ReceiptOcrBlockEvidence block) =>
    block.points.map((point) => point.x).reduce((x, y) => x > y ? x : y);

bool _isPairedInvoiceBuyerCopyRow(
  List<List<ReceiptOcrBlockEvidence>> layoutRows,
  int rowIndex,
) {
  if (rowIndex < 0 || rowIndex >= layoutRows.length) return false;
  final row = layoutRows[rowIndex];
  if (row.length != 2 ||
      row.any(
        (block) =>
            block.points.isEmpty ||
            (_lineHasAmount(block.text) &&
                !_isReceiptMetadataLine(block.text)) ||
            _hasPotentialReceiptAdjustmentLabel(block.text),
      )) {
    return false;
  }
  final cells = [...row]
    ..sort(
      (a, b) => a.points
          .map((point) => point.x)
          .reduce((x, y) => x < y ? x : y)
          .compareTo(
            b.points.map((point) => point.x).reduce((x, y) => x < y ? x : y),
          ),
    );
  final leftRight = cells.first.points
      .map((point) => point.x)
      .reduce((x, y) => x > y ? x : y);
  final rightLeft = cells.last.points
      .map((point) => point.x)
      .reduce((x, y) => x < y ? x : y);
  return rightLeft >= leftRight + 24;
}

bool _isAddressBackedInvoiceCountry(List<String> lines, int index) {
  if (index < 1 || index + 1 >= lines.length) return false;
  if (!_isInvoiceCountryOnly(lines[index])) return false;
  return RegExp(
        r'\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b',
        caseSensitive: false,
      ).hasMatch(lines[index - 1]) &&
      RegExp(
        r'(?:@|\bwww\.|https?://|\b(?:phone|tel|support)\b)',
        caseSensitive: false,
      ).hasMatch(lines[index + 1]);
}

bool _isInvoiceCountryOnly(String line) => RegExp(
  r'^(?:united states|united kingdom|canada|australia|new zealand|singapore|hong kong|germany|france|india|brazil|mexico|japan|china|south korea|taiwan|thailand|malaysia|indonesia|philippines|vietnam|pakistan|bangladesh|united arab emirates|saudi arabia|israel|turkey|italy|spain|portugal|netherlands|belgium|switzerland|austria|sweden|norway|denmark|finland|ireland|poland|czech republic|south africa|nigeria|egypt|argentina|chile|colombia|peru)$',
  caseSensitive: false,
).hasMatch(line.trim());

bool _isInvoicePaymentFooterCopy(String line, {String? merchantName}) {
  final copy = line.trim();
  final recognized = <RegExp>[
    RegExp(
      r'^payment\s+(?:confirmed|confirmation)[.!:]?$',
      caseSensitive: false,
    ),
    RegExp(
      r'^thank\s+you\s+for\s+your\s+order[.!]?(?:\s+your\s+payment\s+(?:has\s+been\s+successfully\s+processed|is\s+complete)[.!]?)?$',
      caseSensitive: false,
    ),
    RegExp(
      r'^(?:(?:payment\s+(?:status|method|date)|confirmation\s+(?:number|id)):\s*)+$',
      caseSensitive: false,
    ),
    RegExp(
      r'^payment\s+status:\s*(?:paid(?:\s+in\s+full)?|complete|completed|confirmed|successful)[.!]?$',
      caseSensitive: false,
    ),
    RegExp(r'^paid\s+in\s+full[.!]?$', caseSensitive: false),
    RegExp(
      r'^need\s+help[?!.]?(?:\s+thank\s+you[.!]?)?$',
      caseSensitive: false,
    ),
    RegExp(
      r"^we(?:['’]re|\s+are)\s+here\s+to\s+help[.!]?$",
      caseSensitive: false,
    ),
  ].any((pattern) => pattern.hasMatch(copy));
  if (recognized) return true;
  final teamSignature = RegExp(
    r"^we(?:['’]re|\s+are)\s+here\s+to\s+help[.!]?\s+the\s+(.+)\s+team[.!]?$",
    caseSensitive: false,
  ).firstMatch(copy);
  if (teamSignature == null || merchantName == null) return false;
  String normalize(String value) =>
      value.toLowerCase().replaceAll(RegExp(r'\s+'), ' ').trim();
  return normalize(teamSignature.group(1)!) == normalize(merchantName);
}

bool _isSeeYouSoonFooterPhrase(String line) => RegExp(
  r'^see you soon[.!。！]?$',
  caseSensitive: false,
).hasMatch(line.trim());

bool _isNordicCourtesyFooterPhrase(String line) => RegExp(
  r'^takk\s*[/／]\s*tack[.!。！]?$',
  caseSensitive: false,
).hasMatch(line.trim());

bool _isReceiptCourtesyLine(String line) {
  final normalized = line
      .trim()
      .toLowerCase()
      .replaceFirst(RegExp(r'[.!。！]+$'), '')
      .trim();
  const courtesyPhrases = {
    'thank you',
    'thank you for shopping',
    'thank you for shopping local',
    'merci',
    'vielen dank',
    'gracias',
    'obrigado',
    'obrigada',
    '謝謝光臨',
    '谢谢光临',
    '多謝',
    '多谢',
    'धन्यवाद',
    'ขอบคุณ',
    '감사합니다',
    'ありがとうございます',
    'cảm ơn',
    'شكرا',
    'شكراً',
    'спасибо',
    'teşekkürler',
    'dziękujemy',
  };
  if (courtesyPhrases.contains(normalized)) return true;
  final translatedSegments = normalized.split(RegExp(r'\s*[/／]\s*'));
  return translatedSegments.length > 1 &&
      translatedSegments.every(
        (segment) => segment.isNotEmpty && courtesyPhrases.contains(segment),
      );
}

bool _hasUnsupportedCurrencySymbolOnSelectedAmount(String text) {
  final amount = RegExp(_amountTokenPattern).allMatches(text).lastOrNull;
  if (amount == null) return false;
  final supportedMarkers = _printedCurrencyMarkerMatches(text).toList();
  return RegExp(r'\p{Sc}', unicode: true).allMatches(text).any((symbol) {
    if (supportedMarkers.any(
      (marker) => marker.start <= symbol.start && marker.end >= symbol.end,
    )) {
      return false;
    }
    return _currencyMarkerAdjacentToSelectedHeaderAmount(text, symbol, amount);
  });
}

bool _currencyMarkerAdjacentToSelectedHeaderAmount(
  String text,
  RegExpMatch marker,
  RegExpMatch amount,
) {
  final between = marker.end <= amount.start
      ? text.substring(marker.end, amount.start)
      : marker.start >= amount.end
      ? text.substring(amount.end, marker.start)
      : null;
  return between != null && RegExp(r'^\s*[:=]?\s*[+−-]?\s*$').hasMatch(between);
}

double? _averageBlockConfidence(List<ReceiptOcrBlockEvidence> blocks) {
  final values = blocks.map((block) => block.confidence).nonNulls.toList();
  if (values.isEmpty) return null;
  return values.reduce((left, right) => left + right) / values.length;
}

List<ReceiptOcrBlockEvidence> _nearbyCurrencyOnlyBlocks(
  List<ReceiptOcrBlockEvidence> row,
  ReceiptOcrBlockEvidence amountCell,
) {
  if (amountCell.points.isEmpty) return const [];
  final amountLeft = amountCell.points
      .map((point) => point.x)
      .reduce((left, right) => left < right ? left : right);
  final amountRight = amountCell.points
      .map((point) => point.x)
      .reduce((left, right) => left > right ? left : right);
  final currencyOnlyPattern = RegExp(
    '^\\s*(?:$_currencyTokenPattern)\\s*\$',
    caseSensitive: false,
  );
  return row
      .where((block) {
        if (block == amountCell ||
            block.points.isEmpty ||
            !currencyOnlyPattern.hasMatch(_normalizeOcrLine(block.text))) {
          return false;
        }
        final left = block.points
            .map((point) => point.x)
            .reduce((a, b) => a < b ? a : b);
        final right = block.points
            .map((point) => point.x)
            .reduce((a, b) => a > b ? a : b);
        final gap = right <= amountLeft
            ? amountLeft - right
            : left >= amountRight
            ? left - amountRight
            : 0;
        return gap <= (amountRight - amountLeft) * 0.75 + 8;
      })
      .toList(growable: false);
}

List<ReceiptOcrBlockEvidence> _nearbySignOnlyBlocks(
  List<ReceiptOcrBlockEvidence> row,
  ReceiptOcrBlockEvidence amountCell,
) {
  if (amountCell.points.isEmpty) return const [];
  final amountLeft = amountCell.points
      .map((point) => point.x)
      .reduce((left, right) => left < right ? left : right);
  final amountWidth =
      amountCell.points
          .map((point) => point.x)
          .reduce((left, right) => left > right ? left : right) -
      amountLeft;
  final amountRight = amountLeft + amountWidth;
  return row
      .where((block) {
        if (block == amountCell ||
            block.points.isEmpty ||
            !RegExp(r'^\s*[-−]\s*$').hasMatch(block.text)) {
          return false;
        }
        final signLeft = block.points
            .map((point) => point.x)
            .reduce((left, right) => left < right ? left : right);
        final signRight = block.points
            .map((point) => point.x)
            .reduce((left, right) => left > right ? left : right);
        return (signRight <= amountLeft &&
                amountLeft - signRight <= amountWidth * 0.75 + 8) ||
            (signLeft >= amountRight &&
                signLeft - amountRight <= amountWidth * 0.75 + 8);
      })
      .toList(growable: false);
}

bool _hasUnboundChargeTableSign(
  List<ReceiptOcrBlockEvidence> row,
  ReceiptOcrBlockEvidence amountCell,
) {
  if (amountCell.points.isEmpty) return false;
  final amountLeft = amountCell.points
      .map((point) => point.x)
      .reduce((left, right) => left < right ? left : right);
  final amountRight = amountCell.points
      .map((point) => point.x)
      .reduce((left, right) => left > right ? left : right);
  final nearbySigns = _nearbySignOnlyBlocks(row, amountCell);
  for (final sign in row.where(
    (block) =>
        block.points.isNotEmpty && RegExp(r'^\s*[-−]\s*$').hasMatch(block.text),
  )) {
    if (nearbySigns.contains(sign)) return true;
    final signLeft = sign.points
        .map((point) => point.x)
        .reduce((left, right) => left < right ? left : right);
    final signRight = sign.points
        .map((point) => point.x)
        .reduce((left, right) => left > right ? left : right);
    // A sign under Usage may be a placeholder when a distinct printed rate
    // sits between it and Amount. Otherwise its direction is unresolved.
    final interveningRate = row.any((block) {
      if (block == sign ||
          block == amountCell ||
          block.points.isEmpty ||
          !_hasChargeTableMonetaryEvidence(block.text)) {
        return false;
      }
      final left = block.points
          .map((point) => point.x)
          .reduce((a, b) => a < b ? a : b);
      final right = block.points
          .map((point) => point.x)
          .reduce((a, b) => a > b ? a : b);
      return (signRight < amountLeft &&
              left > signRight &&
              right < amountLeft) ||
          (signLeft > amountRight && left > amountRight && right < signLeft);
    });
    if (!interveningRate) return true;
  }
  return false;
}

List<List<ReceiptOcrBlockEvidence>> _matchingLayoutRows(
  List<String> lines,
  List<ReceiptOcrBlockEvidence> blocks,
) {
  if (blocks.isEmpty) return const [];
  final byRow = <int, List<ReceiptOcrBlockEvidence>>{};
  for (final block in blocks) {
    (byRow[block.row] ??= []).add(block);
  }
  final rows = byRow.values.toList(growable: false);
  if (rows.length != lines.length) return const [];
  for (var index = 0; index < rows.length; index++) {
    final text = rows[index].map((block) => block.text.trim()).join(' ');
    if (_normalizeOcrLine(text) != lines[index]) return const [];
  }
  return rows;
}

// Some providers group a large summary-card amount with adjacent customer
// and invoice-date fields. A matching total alone does not make that row
// metadata: every block must have its own nearby, unambiguous printed label.
// Unknown content keeps the ordinary item path and all raw evidence intact.
Set<int>? _ownedSummaryCardHeaderRows(
  List<List<ReceiptOcrBlockEvidence>> rows,
  int rowIndex,
  String? currency,
  String? selectedTotal,
  Set<int> uncertainSummaryAmountRows,
) {
  if (rowIndex >= rows.length ||
      rowIndex == 0 ||
      selectedTotal == null ||
      currency == null) {
    return null;
  }
  final row = rows[rowIndex];
  if (row.length != 4) return null;
  final amounts = row.where((b) => _isStandaloneAmountRow(b.text)).toList();
  if (amounts.length != 1) return null;
  final amount = amounts.single;
  // Exclusion requires a strict cell and compatible evidence from every
  // printed denomination. Item-word masking (such as lowercase TRY/RUB)
  // must not erase a conflicting marker from a proven monetary cell.
  final moneyCell = RegExp(
    '^\\s*($_currencyTokenPattern)?\\s*($_amountTokenPattern)'
    '(?:\\s*($_currencyTokenPattern))?\\s*\$',
    caseSensitive: false,
  ).firstMatch(amount.text);
  if (moneyCell == null ||
      !_hasChargeTableMonetaryEvidence(amount.text) ||
      _lastAmountInLine(amount.text, currency: currency) != selectedTotal) {
    return null;
  }
  for (final marker in [
    moneyCell.group(1),
    moneyCell.group(3),
  ].whereType<String>()) {
    final printed = _currencyAdjacentToSelectedAmount(
      '$marker ${moneyCell.group(2)}',
      currency,
    );
    if (!printed.hasExplicitEvidence || printed.currency != currency) {
      return null;
    }
  }
  final dateLabels = row
      .where(
        (b) => RegExp(
          r'^(?:invoice|bill|statement) date\s*:?$',
          caseSensitive: false,
        ).hasMatch(b.text.trim()),
      )
      .toList();
  final dates = row
      .where(
        (b) => RegExp(
          r'^(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(?:[1-9]|[12]\d|3[01]),?\s+\d{4}$',
          caseSensitive: false,
        ).hasMatch(b.text.trim()),
      )
      .toList();
  if (dateLabels.length != 1 || dates.length != 1) return null;
  final dateLabel = dateLabels.single;
  final date = dates.single;
  final name = row.singleWhere(
    (b) => b != amount && b != dateLabel && b != date,
  );
  if (!RegExp(
    r'^[\p{L}\p{M}]+\.?(?:[ ’\x27-][\p{L}\p{M}]+\.?)*$',
    unicode: true,
  ).hasMatch(name.text.trim())) {
    return null;
  }

  final first = rowIndex > 3 ? rowIndex - 3 : 0;
  final preceding = rows.sublist(first, rowIndex).expand((r) => r).toList();
  final allBlocks = rows.expand((r) => r).toList(growable: false);
  final boxes =
      <
        ReceiptOcrBlockEvidence,
        ({double left, double top, double right, double bottom})
      >{};
  for (final block in allBlocks) {
    // Without a complete geometry map, cross-row competition is unresolved.
    if (block.points.length < 4 ||
        block.points.any((p) => !p.x.isFinite || !p.y.isFinite)) {
      return null;
    }
    final box = (
      left: _blockLeft(block),
      right: _blockRight(block),
      top: block.points.map((p) => p.y).reduce((a, b) => a < b ? a : b),
      bottom: block.points.map((p) => p.y).reduce((a, b) => a > b ? a : b),
    );
    if (box.right <= box.left || box.bottom <= box.top) {
      return null;
    }
    boxes[block] = box;
  }
  bool directlyBelow(
    ReceiptOcrBlockEvidence label,
    ReceiptOcrBlockEvidence value,
  ) {
    final a = boxes[label]!;
    final b = boxes[value]!;
    final height = a.bottom - a.top;
    return (b.left - a.left).abs() <= height * 0.5 &&
        b.top >= a.bottom &&
        b.top - a.bottom <= height;
  }

  // Competition is measured against every participant, independently of
  // which label/value supplied the rectangle used for gap measurement.
  double ownershipHeight(
    ReceiptOcrBlockEvidence label,
    ReceiptOcrBlockEvidence value,
    ReceiptOcrBlockEvidence neighbor,
  ) => [label, value, neighbor]
      .map((block) => boxes[block]!.bottom - boxes[block]!.top)
      .reduce((a, b) => a > b ? a : b);

  final totalLabels = preceding
      .where(
        (b) =>
            RegExp(
              r'^(?:total due|amount due|balance due|grand total)\s*:?$',
              caseSensitive: false,
            ).hasMatch(b.text.trim()) &&
            directlyBelow(b, amount),
      )
      .toList();
  final nameLabels = preceding
      .where(
        (b) =>
            RegExp(
              r'^(?:customer|client) name\s*:?$',
              caseSensitive: false,
            ).hasMatch(b.text.trim()) &&
            directlyBelow(b, name),
      )
      .toList();
  if (totalLabels.length != 1 || nameLabels.length != 1) return null;
  // A customer label above the value is insufficient if another nearby
  // block can describe the same value. Inspect all physical neighbors rather
  // than relying on a finite vocabulary of Item/Description/Product labels.
  final nameBox = boxes[name]!;
  if (allBlocks.any((b) {
    if (row.contains(b) || b == nameLabels.single || b == totalLabels.single) {
      return false;
    }
    final other = boxes[b]!;
    final horizontalGap = other.right < nameBox.left
        ? nameBox.left - other.right
        : other.left > nameBox.right
        ? other.left - nameBox.right
        : 0;
    final verticalGap = other.bottom < nameBox.top
        ? nameBox.top - other.bottom
        : other.top > nameBox.bottom
        ? other.top - nameBox.bottom
        : 0;
    final neighborHeight = ownershipHeight(nameLabels.single, name, b);
    return horizontalGap <= neighborHeight && verticalGap <= neighborHeight;
  })) {
    return null;
  }
  final amountBox = boxes[amount]!;
  if (row
      .where((b) => b != amount)
      .any((b) => boxes[b]!.right >= amountBox.left)) {
    return null;
  }
  final dateLabelBox = boxes[dateLabel]!;
  final dateBox = boxes[date]!;
  final dateHeight = dateLabelBox.bottom - dateLabelBox.top;
  final overlapTop = dateLabelBox.top > dateBox.top
      ? dateLabelBox.top
      : dateBox.top;
  final overlapBottom = dateLabelBox.bottom < dateBox.bottom
      ? dateLabelBox.bottom
      : dateBox.bottom;
  if (dateBox.left <= dateLabelBox.right ||
      dateBox.left - dateLabelBox.right > dateHeight * 4 ||
      overlapBottom - overlapTop < dateHeight * 0.5 ||
      boxes[name]!.right >= dateLabelBox.left) {
    return null;
  }
  final dateRegionTop = dateLabelBox.top < dateBox.top
      ? dateLabelBox.top
      : dateBox.top;
  final dateRegionBottom = dateLabelBox.bottom > dateBox.bottom
      ? dateLabelBox.bottom
      : dateBox.bottom;
  if (allBlocks.any((b) {
    if (b == dateLabel || b == date) return false;
    final other = boxes[b];
    if (other == null) return false;
    return other.right > dateLabelBox.left &&
        other.left < dateBox.right &&
        other.bottom > dateRegionTop &&
        other.top < dateRegionBottom;
  })) {
    return null;
  }

  // Nearby blocks must explain their own role. A finite date-heading list
  // cannot prove that unfamiliar words or fragmented headings are harmless.
  bool ownsSeparatePeriod(ReceiptOcrBlockEvidence label) {
    if (!RegExp(
      r'^(?:billing|service)\s+period\s*:?$',
      caseSensitive: false,
    ).hasMatch(_normalizeOcrLine(label.text))) {
      return false;
    }
    final a = boxes[label]!;
    final height = a.bottom - a.top;
    final values = allBlocks.where((b) {
      if (b == label || !_matchesUtilityPeriod(_normalizeOcrLine(b.text))) {
        return false;
      }
      final value = boxes[b]!;
      final top = a.top > value.top ? a.top : value.top;
      final bottom = a.bottom < value.bottom ? a.bottom : value.bottom;
      return value.left > a.right &&
          value.left - a.right <= height * 4 &&
          bottom - top >= height * 0.5;
    }).toList();
    if (values.length != 1) return false;
    final value = boxes[values.single]!;
    final top = a.top < value.top ? a.top : value.top;
    final bottom = a.bottom > value.bottom ? a.bottom : value.bottom;
    return !allBlocks.any((b) {
      if (b == label || b == values.single) return false;
      final other = boxes[b]!;
      return other.right > a.left &&
          other.left < value.right &&
          other.bottom > top &&
          other.top < bottom;
    });
  }

  final referenceLabel = RegExp(
    r'^(?:account|customer|client|invoice|bill|statement)\s+(?:no\.?|number|id|#)\s*:?$',
    caseSensitive: false,
  );
  final referenceValue = RegExp(r'^[A-Z0-9][A-Z0-9-]*$', caseSensitive: false);
  final inlineReference = RegExp(
    r'^(?:account|customer|client|invoice|bill|statement)\s+(?:no\.?|number|id|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]*)$',
    caseSensitive: false,
  );
  final referenceDigit = RegExp(r'\d');
  bool isReferenceValue(String text) =>
      referenceValue.hasMatch(text) && referenceDigit.hasMatch(text);
  bool isInlineReference(String text) {
    final match = inlineReference.firstMatch(text);
    return match != null && isReferenceValue(match.group(1)!);
  }

  Set<int>? retainDisputedSummary() {
    // A rejected monetary ownership proof cannot resolve a preceding
    // unpriced description through the ordinary item fallback.
    uncertainSummaryAmountRows.add(rowIndex);
    return null;
  }

  final ownedReferences = <ReceiptOcrBlockEvidence>{};
  for (final label in allBlocks) {
    if (!referenceLabel.hasMatch(_normalizeOcrLine(label.text))) continue;
    final a = boxes[label]!;
    final height = a.bottom - a.top;
    final values = allBlocks.where((b) {
      final text = _normalizeOcrLine(b.text);
      if (b == label || !isReferenceValue(text)) {
        return false;
      }
      final value = boxes[b]!;
      final top = a.top > value.top ? a.top : value.top;
      final bottom = a.bottom < value.bottom ? a.bottom : value.bottom;
      return value.left > a.right &&
          value.left - a.right <= height * 4 &&
          bottom - top >= height * 0.5;
    }).toList();
    if (values.length != 1) continue;
    final value = boxes[values.single]!;
    final top = a.top < value.top ? a.top : value.top;
    final bottom = a.bottom > value.bottom ? a.bottom : value.bottom;
    if (allBlocks.any((b) {
      if (b == label || b == values.single) return false;
      final other = boxes[b]!;
      return other.right > a.left &&
          other.left < value.right &&
          other.bottom > top &&
          other.top < bottom;
    })) {
      continue;
    }
    ownedReferences.addAll([label, values.single]);
  }
  for (final neighbor in allBlocks) {
    if (row.contains(neighbor) ||
        neighbor == nameLabels.single ||
        neighbor == totalLabels.single) {
      continue;
    }
    final other = boxes[neighbor]!;
    final horizontalGap = other.right < dateBox.left
        ? dateBox.left - other.right
        : other.left > dateBox.right
        ? other.left - dateBox.right
        : 0;
    final verticalGap = other.bottom < dateBox.top
        ? dateBox.top - other.bottom
        : other.top > dateBox.bottom
        ? other.top - dateBox.bottom
        : 0;
    final neighborHeight = ownershipHeight(dateLabel, date, neighbor);
    if (horizontalGap > neighborHeight * 4 || verticalGap > neighborHeight) {
      continue;
    }
    final text = _normalizeOcrLine(neighbor.text);
    if (ownedReferences.contains(neighbor) ||
        ownsSeparatePeriod(neighbor) ||
        _matchesUtilityPeriod(text) ||
        isInlineReference(text)) {
      continue;
    }
    return retainDisputedSummary();
  }

  // A large amount can overlap monetary fragments assigned to another OCR
  // row. Currency/sign cues and numeric-only fragments remain evidence even
  // when they cannot be selected as one amount. Every other neighbor must
  // have an explained nonfinancial role; absent keywords do not prove ownership.
  final currencyAtoms = RegExp(
    '(?:$_currencyTokenPattern|${_knownUnsupportedIsoCurrencyCodes.map(RegExp.escape).join('|')})',
    caseSensitive: false,
  );
  final boundedCurrencyAtoms = RegExp(
    '(?<![\\p{L}\\p{M}])${currencyAtoms.pattern}(?![\\p{L}\\p{M}])',
    caseSensitive: false,
    unicode: true,
  );
  final currencySymbol = RegExp(r'\p{Sc}', unicode: true);
  final punctuationOnly = RegExp(r'^[\p{P}\p{S}\s]+$', unicode: true);
  final rateSymbol = RegExp(r'[%‰‱٪؉؊％﹪]');
  final mixedSign = RegExp(
    r'[\p{Sm}*/➖()]|(?<![\p{L}\p{M}])\p{Dash}|\p{Dash}(?![\p{L}\p{M}])',
    unicode: true,
  );
  final digit = RegExp(r'\p{N}', unicode: true);
  final creditDebit = RegExp(
    r'(?<![\p{L}\p{M}])(?:c[.\s]*r\.?|d[.\s]*r\.?|credit|debit)(?![\p{L}\p{M}])',
    caseSensitive: false,
    unicode: true,
  );
  final words = RegExp(r'[\p{L}\p{M}]+', unicode: true);
  for (final neighbor in allBlocks) {
    if (row.contains(neighbor) || neighbor == totalLabels.single) continue;
    final other = boxes[neighbor];
    if (other == null) return retainDisputedSummary();
    final horizontalGap = other.right < amountBox.left
        ? amountBox.left - other.right
        : other.left > amountBox.right
        ? other.left - amountBox.right
        : 0;
    final verticalGap = other.bottom < amountBox.top
        ? amountBox.top - other.bottom
        : other.top > amountBox.bottom
        ? other.top - amountBox.bottom
        : 0;
    final neighborHeight = ownershipHeight(
      totalLabels.single,
      amount,
      neighbor,
    );
    if (horizontalGap > neighborHeight || verticalGap > neighborHeight * 0.5) {
      continue;
    }
    final text = _normalizeOcrLine(neighbor.text);
    // Check every existing named denomination independently: a priority
    // resolver must not conceal a second conflicting denomination phrase.
    final upper = text.toUpperCase();
    if ((_hasExplicitHongKongCurrencyMarker(upper) && currency != 'HKD') ||
        (_hasExplicitUnitedStatesCurrencyMarker(upper) && currency != 'USD')) {
      return retainDisputedSummary();
    }
    final markers = currencyAtoms
        .allMatches(text)
        .map((m) => m.group(0)!)
        .toList();
    // OCR can split HK$ (and other prefixed dollars) into two blocks.
    // Reconstruct only a complete known marker for compatibility inspection;
    // never rewrite the printed cell or the retained neighboring evidence.
    final compactMarker = text.replaceAll(RegExp(r'[\s.]'), '');
    final dollarPrefix = '$compactMarker\$';
    final wholeCurrencyAtom = RegExp(
      '^(?:${currencyAtoms.pattern})\$',
      caseSensitive: false,
    );
    final splitCurrencyMarker = !RegExp(r'\p{L}', unicode: true).hasMatch(text)
        ? null
        : wholeCurrencyAtom.hasMatch(compactMarker)
        ? compactMarker
        : wholeCurrencyAtom.hasMatch(dollarPrefix)
        ? dollarPrefix
        : null;
    final isCurrency =
        splitCurrencyMarker != null ||
        (markers.isNotEmpty &&
            text.replaceAll(currencyAtoms, '').trim().isEmpty);
    if (splitCurrencyMarker != null) markers.add(splitCurrencyMarker);
    // Only a complete period or explicitly labeled identifier explains a
    // neighboring number. A comparison's other operand may be in the amount
    // cell, so even one unexplained number must retain the ordinary fallback.
    final explainedMetadata =
        _matchesUtilityPeriod(text) || isInlineReference(text);
    final completeNamedCurrency = RegExp(
      r'^(?:(?:hong\s+kong|hk)|(?:us|u\.s\.|united\s+states))\s+dollars?$',
      caseSensitive: false,
    ).hasMatch(text);
    // Only balanced annotations may decorate a bounded status. Unknown prose
    // is not harmless merely because it misses known monetary keywords.
    const statusBrackets = {'(': ')', '[': ']', '{': '}'};
    final closingStatusBrackets = <String>[];
    var balancedStatus = true;
    final statusProjection = StringBuffer();
    for (final character in text.split('')) {
      final closing = statusBrackets[character];
      if (closing != null) {
        closingStatusBrackets.add(closing);
        statusProjection.write(' ');
      } else if (statusBrackets.containsValue(character)) {
        if (closingStatusBrackets.isEmpty ||
            closingStatusBrackets.removeLast() != character) {
          balancedStatus = false;
          break;
        }
        statusProjection.write(' ');
      } else {
        statusProjection.write(character);
      }
    }
    final statusText = statusProjection
        .toString()
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    final explainedStatus =
        balancedStatus &&
        closingStatusBrackets.isEmpty &&
        RegExp(
          r'^(?:pending(?:[ -]+review)?|(?:note\s+)?review|auto[ -]?pay\s+(?:enabled|disabled|active|inactive|pending))$',
          caseSensitive: false,
        ).hasMatch(statusText);
    final hasUnownedNumbers = digit.hasMatch(text) && !explainedMetadata;
    final hasUnownedSign = !explainedMetadata && mixedSign.hasMatch(text);
    // A single OCR letter can be one part of a split denomination such as
    // H + K + $. Without a complete compatible marker its ownership is unknown.
    final hasUnownedLetter =
        !isCurrency &&
        RegExp(r'^[\p{L}\p{M}]$', unicode: true).hasMatch(compactMarker);
    // The operator's numeric operand can live in the separate amount cell.
    // Complete periods and explicit references keep their own explained words.
    final hasTextualOperator =
        !explainedMetadata &&
        RegExp(
          r'(?<![\p{L}\p{M}])(?:plus|minus|less|more|versus|vs|negative|positive|'
          r'add(?:ed|ing|ition)?|subtract(?:ed|ing|ion)?|times|multiplied|divided|'
          r'per|each|incl(?:uded|uding|usive)?|excl(?:uded|uding|usive)?)(?![\p{L}\p{M}])',
          caseSensitive: false,
          unicode: true,
        ).hasMatch(text);
    // Recognize the existing financial roles in plural or beside joined
    // digits without changing shared classification or the raw OCR text.
    final financialWords = words
        .allMatches(text)
        .expand((match) {
          final word = match.group(0)!.toLowerCase();
          return [
            word,
            if (word.endsWith('s')) word.substring(0, word.length - 1),
            if (word.endsWith('es')) word.substring(0, word.length - 2),
            if (word.endsWith('ies')) '${word.substring(0, word.length - 3)}y',
          ];
        })
        .join(' ');
    final hasCompetingFinancialRole =
        !explainedMetadata &&
        [
          text,
          ..._boundedUtilityAnnotationRoles(text),
          financialWords,
        ].any((role) => _hasBoundedUtilityFinancialPhrase(role, amount.text));
    if (!isCurrency &&
        !boundedCurrencyAtoms.hasMatch(text) &&
        !currencySymbol.hasMatch(text) &&
        !punctuationOnly.hasMatch(text) &&
        !rateSymbol.hasMatch(text) &&
        !hasUnownedSign &&
        !hasUnownedLetter &&
        !hasTextualOperator &&
        !hasCompetingFinancialRole &&
        !creditDebit.hasMatch(financialWords) &&
        !_hasPotentialReceiptAdjustmentLabel(financialWords) &&
        !RegExp(
          r'\b(?:adjustment|percent|percentage|rate)\b',
        ).hasMatch(financialWords) &&
        !hasUnownedNumbers) {
      if (!explainedMetadata && !completeNamedCurrency && !explainedStatus) {
        // Keep the existing item fallback, but this disputed summary amount
        // cannot establish that a preceding unpriced description was resolved.
        // It is not an excluded row and receives no metadata exemption.
        return retainDisputedSummary();
      }
      continue;
    }
    if (!isCurrency) return retainDisputedSummary();
    for (final marker in markers) {
      final printed = _currencyAdjacentToSelectedAmount(
        '$marker ${moneyCell.group(2)}',
        currency,
      );
      if (!printed.hasExplicitEvidence || printed.currency != currency) {
        return retainDisputedSummary();
      }
    }
  }

  // No competing text may occupy either vertical label/value corridor.
  for (final pair in [
    (totalLabels.single, amount),
    (nameLabels.single, name),
  ]) {
    final label = boxes[pair.$1]!;
    final value = boxes[pair.$2]!;
    if (allBlocks.any((b) {
      if (b == pair.$1 || b == pair.$2) return false;
      final other = boxes[b];
      if (other == null) return false;
      return other.right > value.left &&
          other.left < value.right &&
          other.bottom > label.top &&
          other.top < value.bottom;
    })) {
      return null;
    }
  }
  // Only rows made entirely of proven labels are explained. A pending
  // description sharing a label row must still reach completeness accounting.
  final labels = {totalLabels.single, nameLabels.single};
  return {
    rowIndex,
    for (var index = first; index < rowIndex; index++)
      if (rows[index].isNotEmpty && rows[index].every(labels.contains)) index,
  };
}

bool _isAdjacentRightColumnAmount(
  List<List<ReceiptOcrBlockEvidence>> layoutRows,
  int descriptionIndex,
) {
  if (descriptionIndex + 1 >= layoutRows.length) return false;
  final descriptionPoints = layoutRows[descriptionIndex]
      .expand((block) => block.points)
      .toList(growable: false);
  final amountPoints = layoutRows[descriptionIndex + 1]
      .expand((block) => block.points)
      .toList(growable: false);
  if (descriptionPoints.isEmpty || amountPoints.isEmpty) return false;

  final descriptionRight = descriptionPoints
      .map((point) => point.x)
      .reduce((left, right) => left > right ? left : right);
  final amountLeft = amountPoints
      .map((point) => point.x)
      .reduce((left, right) => left < right ? left : right);
  final descriptionTop = descriptionPoints
      .map((point) => point.y)
      .reduce((top, value) => top < value ? top : value);
  final descriptionBottom = descriptionPoints
      .map((point) => point.y)
      .reduce((bottom, value) => bottom > value ? bottom : value);
  final amountTop = amountPoints
      .map((point) => point.y)
      .reduce((top, value) => top < value ? top : value);
  final amountBottom = amountPoints
      .map((point) => point.y)
      .reduce((bottom, value) => bottom > value ? bottom : value);
  final rowHeight =
      (descriptionBottom - descriptionTop) > (amountBottom - amountTop)
      ? descriptionBottom - descriptionTop
      : amountBottom - amountTop;
  final verticalGap = amountTop - descriptionBottom;
  final descriptionCenter = (descriptionTop + descriptionBottom) / 2;
  final amountCenter = (amountTop + amountBottom) / 2;
  return rowHeight > 0 &&
      amountCenter > descriptionCenter + rowHeight * 0.5 &&
      verticalGap >= -rowHeight * 0.5 &&
      verticalGap <= rowHeight * 1.5 &&
      amountLeft > descriptionRight + 8;
}

bool _isFinancialLabelWithAdjacentAmount(
  List<String> lines,
  List<List<ReceiptOcrBlockEvidence>> layoutRows,
  int labelIndex,
) {
  if (labelIndex + 1 >= lines.length ||
      !_isStandaloneAmountRow(lines[labelIndex + 1]) ||
      !_isAdjacentRightColumnAmount(layoutRows, labelIndex)) {
    return false;
  }
  final printedPair = '${lines[labelIndex]} ${lines[labelIndex + 1]}';
  return _isAdministrativeLine(printedPair) ||
      _isPaymentMetadataLine(printedPair);
}

// A printed charge table can contain usage and rate columns before its final
// amount. Those columns are evidence, but they are not part of the item name
// and they do not establish a bill-item quantity without a quantity label.
({Set<int> items, Set<int> ambiguous}) _classifyChargeTableRows(
  List<String> lines, {
  Set<int> detachedAmountSignRows = const {},
}) {
  final rows = <int>{};
  final ambiguous = <int>{};
  var inTable = false;
  var hasRateColumn = false;
  var hasUsageColumn = false;
  var requiresLayoutAmountColumn = false;
  for (var index = 0; index < lines.length; index++) {
    final line = lines[index];
    final lower = line.toLowerCase();
    if (_isSupportedChargeTableHeader(lines, index)) {
      inTable = true;
      hasRateColumn = RegExp(r'\brate\b', caseSensitive: false).hasMatch(line);
      hasUsageColumn = RegExp(
        r'\b(?:usage|qty|quantity)\b',
        caseSensitive: false,
      ).hasMatch(line);
      requiresLayoutAmountColumn =
          _isInvoiceProductTableHeader(line) ||
          _isBillChargeDetailHeader(lines, index);
      continue;
    }
    if (!inTable) continue;
    if (_hasTotalLabel(line, lower) ||
        _hasSubtotalLabel(line, lower) ||
        _isChargeTableSectionBoundary(line)) {
      inTable = false;
      continue;
    }
    final pricedRow = RegExp(
      '^(.+?)\\s+($_currencyTokenPattern)?\\s*'
      '($_amountTokenPattern)'
      '(?:\\s*($_currencyTokenPattern))?\$',
      caseSensitive: false,
    ).firstMatch(line);
    // A single monetary value under separate Rate and Amount columns has no
    // reliable role in flattened text. Geometry may still identify an Amount
    // cell; until then keep the row visible as unresolved review evidence.
    final prefix = pricedRow?.group(1)?.trim() ?? '';
    final ratedTaxWithUsage =
        hasUsageColumn &&
        _isRatedTaxNamedLine(line) &&
        (hasRateColumn
            ? _hasCompleteUsageRateColumns(prefix)
            : RegExp(
                r'(?:^|\s)[+\-−]?\d+(?:[.,]\d+)?(?:\s*(?:kwh|m³|m3|therms?|gallons?|gal|units?|gb|minutes?|mins?|liters?|litres?|ml|kg|lbs?|miles?|hours?|hrs?))?\s*$',
                caseSensitive: false,
              ).hasMatch(prefix));
    if (detachedAmountSignRows.contains(index)) {
      ambiguous.add(index);
      continue;
    }
    // An invoice's unit price or a bill's rate/date can be the last
    // recognized number when its final amount cell is missing. Only the
    // labeled amount column's geometry can select line money in these tables.
    if (requiresLayoutAmountColumn) {
      if (pricedRow != null) ambiguous.add(index);
      continue;
    }
    // A rated tax row in a table with both Usage and Rate columns needs
    // geometry to prove whether the numeric cell is usage or only a rate.
    if (pricedRow != null &&
        hasRateColumn &&
        _isRatedTaxNamedLine(line) &&
        !ratedTaxWithUsage &&
        RegExp(r'\d').hasMatch(
          prefix.replaceAll(RegExp(r'\(\s*\d+(?:[.,]\d+)?\s*%\s*\)'), ''),
        )) {
      ambiguous.add(index);
      continue;
    }
    if (pricedRow != null &&
        hasRateColumn &&
        (ratedTaxWithUsage || !_isChargeTableSummaryLine(line)) &&
        !_isReceiptMetadataLine(line) &&
        !_hasEarlierPrintedMonetaryAmount(prefix) &&
        !_hasCompleteUsageRateColumns(prefix)) {
      ambiguous.add(index);
      continue;
    }
    if (pricedRow != null &&
        (ratedTaxWithUsage || !_isChargeTableSummaryLine(line)) &&
        !_isReceiptMetadataLine(line) &&
        _hasChargeTableMonetaryEvidence(
          '${pricedRow.group(2) ?? ''} ${pricedRow.group(3)} ${pricedRow.group(4) ?? ''}',
        ) &&
        _hasSubstantiveItemDescription(
          _cleanDescription(pricedRow.group(1)!),
        ) &&
        _hasTraceableItemAmountToken(line, pricedRow.group(3)!)) {
      rows.add(index);
    }
  }
  return (items: rows, ambiguous: ambiguous);
}

bool _hasEarlierPrintedMonetaryAmount(String prefix) {
  return RegExp(
    '(?:^|\\s)(?:$_currencyTokenPattern)\\s*$_amountTokenPattern(?:\\s|\$)'
    '|(?:^|\\s)$_amountTokenPattern\\s*(?:$_currencyTokenPattern)(?:\\s|\$)',
    caseSensitive: false,
  ).hasMatch(prefix);
}

bool _hasDetachedAmountSign(String line) {
  if (RegExp(r'(?:^|\s)[-−]\s*$').hasMatch(line) && _lineHasAmount(line)) {
    return true;
  }
  final withoutTrailingPunctuation = line.trim().replaceFirst(
    RegExp(r'\s+\.$'),
    '',
  );
  final amounts = RegExp(
    _amountTokenPattern,
  ).allMatches(withoutTrailingPunctuation).toList(growable: false);
  if (amounts.isEmpty) return false;
  final beforeAmount = withoutTrailingPunctuation.substring(
    0,
    amounts.last.start,
  );
  return RegExp(r'[-−]\s+$').hasMatch(beforeAmount) ||
      RegExp(
        '(?:^|\\s)[-−]\\s+(?:$_currencyTokenPattern)?\\s*\$',
        caseSensitive: false,
      ).hasMatch(beforeAmount);
}

bool _hasCompleteUsageRateColumns(String prefix) {
  return RegExp(
    r'\b\d+(?:[.,]\d+)?\s*'
    r'(?:therms?|kwh|m³|m3|gallons?|gal|units?|gb|minutes?|mins?)?\s+'
    r'\d+(?:[.,]\d+)?\s*$',
    caseSensitive: false,
  ).hasMatch(prefix);
}

bool _isChargeTableSummaryLine(String line) {
  final normalized = line.toLowerCase();
  final jurisdictionalRatedTax =
      _hasExplicitTaxRate(line) &&
      RegExp(
        r'^\s*(?:state|local|county|city|municipal|federal|provincial|regional|sales|use|excise|tourist|tourism|occupancy|vat|gst|hst|value[ -]+added|goods[ -]+and[ -]+services)(?:\s+[\p{L}]+){0,2}\s+tax\b',
        caseSensitive: false,
        unicode: true,
      ).hasMatch(line);
  final ratedTaxNamedCharge = _isAmbiguousRatedTaxCharge(line);
  return _isAccountBalanceSummaryLine(line) ||
      (jurisdictionalRatedTax && _isPostSubtotalAdjustmentLine(line)) ||
      (!ratedTaxNamedCharge && _hasTaxLabel(line, normalized)) ||
      _isExplicitNonItemFeeLine(line) ||
      _hasDiscountLabel(line, normalized) ||
      _hasActualTipChargeLabel(line, normalized) ||
      _isPaymentMetadataLine(line);
}

bool _isAmbiguousRatedTaxCharge(String line) =>
    _isRatedTaxNamedLine(line) &&
    !RegExp(
      r'^\s*(?:state|local|county|city|municipal|federal|provincial|regional|sales|use|excise|tourist|tourism|occupancy|vat|gst|hst|value[ -]+added|goods[ -]+and[ -]+services)(?:\s+[\p{L}]+){0,2}\s+tax\b',
      caseSensitive: false,
      unicode: true,
    ).hasMatch(line);

bool _isRatedTaxNamedLine(String line) =>
    _hasExplicitTaxRate(line) &&
    RegExp(
      r'^\s*(?:[\p{L}]+[ -]+){1,3}tax\b',
      caseSensitive: false,
      unicode: true,
    ).hasMatch(line);

bool _hasNumericUsageCell(
  List<List<ReceiptOcrBlockEvidence>> layoutRows,
  int headerIndex,
  int rowIndex,
) {
  if (headerIndex >= layoutRows.length || rowIndex >= layoutRows.length) {
    return false;
  }
  final headers = layoutRows[headerIndex]
      .where(
        (block) =>
            block.points.isNotEmpty &&
            RegExp(
              r'^(?:usage|qty|quantity)$',
              caseSensitive: false,
            ).hasMatch(block.text.trim()),
      )
      .toList(growable: false);
  if (headers.length != 1) return false;
  final left = headers.single.points
      .map((point) => point.x)
      .reduce((a, b) => a < b ? a : b);
  final right = headers.single.points
      .map((point) => point.x)
      .reduce((a, b) => a > b ? a : b);
  return layoutRows[rowIndex].any((block) {
    if (block.points.isEmpty ||
        !RegExp(
          r'^\s*[+\-−]?\d+(?:[.,]\d+)?(?:\s*(?:kwh|m³|m3|therms?|gallons?|gal|units?|gb|minutes?|mins?|liters?|litres?|ml|kg|lbs?|miles?|hours?|hrs?))?\s*$',
          caseSensitive: false,
        ).hasMatch(block.text)) {
      return false;
    }
    final xs = block.points.map((point) => point.x);
    final center =
        (xs.reduce((a, b) => a < b ? a : b) +
            xs.reduce((a, b) => a > b ? a : b)) /
        2;
    return center >= left - 12 && center <= right + 12;
  });
}

bool _isPostSubtotalAdjustmentLine(
  String line, {
  bool allowDescriptiveTaxLabel = false,
  bool allowDescriptiveSurchargeLabel = false,
  bool taxOnly = false,
}) {
  final trimmed = line.trim();
  final match = RegExp(
    '^(?:[\\p{L}]+[ -]+){0,3}(?:${taxOnly ? 'tax' : 'tax|surcharge'})(?:\\s*\\(\\d{1,3}(?:[.,]\\d{1,2})?\\s*%\\))?\\s+',
    caseSensitive: false,
    unicode: true,
  ).firstMatch(trimmed);
  if (match != null && _isStandaloneAmountRow(trimmed.substring(match.end))) {
    return true;
  }
  if (allowDescriptiveTaxLabel) {
    final describedTax = RegExp(
      r'^(?:[\p{L}]+[ -]+){0,3}tax\s*\(\s*(?:federal|state|local|city|county|municipal|regional|provincial|standard|reduced|special|exempt|zero(?:[ -]rated)?|sales|use|vat|gst|hst)\s*\)\s+',
      caseSensitive: false,
      unicode: true,
    ).firstMatch(trimmed);
    if (describedTax != null &&
        _isStandaloneAmountRow(trimmed.substring(describedTax.end))) {
      return true;
    }
  }
  if (allowDescriptiveSurchargeLabel && !taxOnly) {
    final describedSurcharge = RegExp(
      r'^(?:[\p{L}]+[ -]+){0,3}surcharge\s*\([^)]{1,32}\)\s+',
      caseSensitive: false,
      unicode: true,
    ).firstMatch(trimmed);
    if (describedSurcharge != null &&
        _isStandaloneAmountRow(trimmed.substring(describedSurcharge.end))) {
      return true;
    }
  }
  return false;
}

bool _hasExplicitTaxRate(String line) => RegExp(
  r'\btax\b\s*(?:\(\s*\d{1,3}(?:[.,]\d{1,2})?\s*%\s*\)|\d{1,3}(?:[.,]\d{1,2})?\s*%)',
  caseSensitive: false,
).hasMatch(line);

// Role-only projections never replace the printed description or money.
String _boundedUtilityRoleText(String text) {
  var role = text;
  final notes = RegExp(r'\([^()]*\)|\[[^\[\]]*\]|\{[^{}]*\}');
  while (notes.hasMatch(role)) {
    role = role.replaceAll(notes, ' ');
  }
  return role
      .replaceFirst(RegExp(r'^[^\p{L}\p{N}]+', unicode: true), '')
      .replaceFirst(RegExp(r'[^\p{L}\p{N}]+$', unicode: true), '')
      // Joined alphabetic dashes are word separators for role classification,
      // not grounds to discard the original printed service name.
      .replaceAll(
        RegExp(r'(?<=\p{L})[\p{Dash}➖]+(?=\p{L})', unicode: true),
        ' ',
      )
      .replaceAll(RegExp(r'\bbalances\b', caseSensitive: false), 'balance')
      .replaceAll(RegExp(r'\bamounts\b', caseSensitive: false), 'amount')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
}

// Notes can contain financial evidence as well as harmless durations. Inspect
// every balanced annotation, including nested ones, before role-only cleanup.
Iterable<String> _boundedUtilityAnnotationRoles(String text) sync* {
  const pairs = {'(': ')', '[': ']', '{': '}'};
  final openings = <({int start, String closing})>[];
  for (var index = 0; index < text.length; index++) {
    final character = text[index];
    final closing = pairs[character];
    if (closing != null) {
      openings.add((start: index, closing: closing));
    } else if (openings.isNotEmpty && character == openings.last.closing) {
      final opening = openings.removeLast();
      yield text.substring(opening.start + 1, index);
    }
  }
}

bool _isBoundedUtilityAccountRole(String label, String monetaryText) {
  final role = _boundedUtilityRoleText(label);
  return _isAccountBalanceSummaryLine('$role $monetaryText') ||
      RegExp(
        r'^(?:(?:previous|prior|opening|closing|outstanding|remaining|current|ending|starting)\s+)?'
        r'(?:(?:account|statement)\s+)?balance(?:\s+(?:forward|brought\s+forward))?$',
        caseSensitive: false,
      ).hasMatch(role);
}

final _boundedUtilityNamedServiceQualifier = RegExp(
  r'\b(?:plans?|boards?|gateways?|services?|subscriptions?|packages?|products?)\b',
  caseSensitive: false,
);

// Explicit service-charge compounds stay financial in singular and plural,
// even when a following product-kind word would otherwise qualify the noun.
final _boundedUtilityServiceChargePhrase = RegExp(
  r'\bservices?\s+(?:charges?|fees?)\b',
  caseSensitive: false,
);

// Punctuation delimits words in role-only views, including reference markers
// such as Payment#1234. Preserve original service text and monetary evidence.
String _boundedUtilityFinancialWords(String label) => _boundedUtilityRoleText(
  label,
).replaceAll(RegExp(r'[^\p{L}\p{M}\p{N}]+', unicode: true), ' ').trim();

// Financial phrases survive leading and trailing qualifiers in bounded
// conflict and item checks; their position does not erase the printed role.
bool _hasBoundedUtilityFinancialPhrase(String label, String monetaryText) {
  final normalizedRole = _boundedUtilityFinancialWords(label);
  if (_boundedUtilityServiceChargePhrase.hasMatch(normalizedRole)) return true;
  final starts = [
    0,
    ...RegExp(r'\s+').allMatches(normalizedRole).map((match) => match.end),
  ];
  return starts.any((start) {
    final role = normalizedRole.substring(start);
    // A service-kind word stays within its name regardless of word order.
    // Longer explicit financial phrases still
    // pass through the normal classifiers below.
    final qualifier = _boundedUtilityNamedServiceQualifier.firstMatch(role);
    final ends = [
      ...RegExp(r'\s+').allMatches(role).map((match) => match.start),
      role.length,
    ];
    return ends.any((end) {
      final prefix = role.substring(0, end);
      if (qualifier != null &&
          qualifier.start == 0 &&
          qualifier.end == end &&
          RegExp(r'\p{L}', unicode: true).hasMatch(
            normalizedRole.substring(0, start) +
                normalizedRole.substring(start + end),
          )) {
        return false;
      }
      // A financial head remains financial when qualified. A printed service
      // kind, e.g. Payment Plan or Payment Processing Subscription, instead
      // requires the complete phrase to establish a conflicting financial role.
      if (end != role.length &&
          !prefix.contains(' ') &&
          _boundedUtilityNamedServiceQualifier.hasMatch(role.substring(end))) {
        return false;
      }
      return _isBoundedUtilityAccountRole(prefix, monetaryText) ||
          _isStandaloneTenderLabel(prefix) ||
          _isPaymentMetadataLine('$prefix $monetaryText') ||
          _isAdministrativeLine('$prefix $monetaryText');
    });
  });
}

bool _matchesUtilityPeriod(String text) => RegExp(
  '^${_utilityPeriodPattern()}\\s*\$',
  caseSensitive: false,
  unicode: true,
).hasMatch(text.trim());

String _utilityPeriodPattern() {
  final date = _utilityDatePattern();
  return '$date\\s*[\\p{Dash}➖]\\s*$date';
}

String _utilityBoundaryDatePattern() {
  final dayDate = _utilityDatePattern(
    allowNumericDates: true,
    allowFragmentedYear: true,
    allowTwoDigitYear: true,
    allowOrdinalDay: true,
    allowWeekdayContext: true,
    allowMonthYear: true,
  );
  // Quarter and fiscal/calendar-year context can label a financial total.
  // Require a printed year for these forms; Q1 Plan remains a service name.
  const year = r"(?:(?:1\s*9|2\s*0)\s*\d\s*\d|['’]?\s*\d\s*\d)";
  const quarter =
      r'(?:Q\s*[1-4]|quarter\s*[1-4]|'
      r'(?:[1-4](?:st|nd|rd|th)?|first|second|third|fourth)\s+quarter)';
  const yearLabel = r'(?:FY|CY|(?:fiscal|calendar)\s+year)';
  const qualifiedYear = '(?:$yearLabel\\s*)?$year';
  const quarterDate =
      '(?:$quarter\\s*[,/-]?\\s*$qualifiedYear|'
      '$qualifiedYear\\s*[,/-]?\\s*$quarter)';
  final date = '(?:$quarterDate|$yearLabel\\s*$year|$dayDate)';
  // A footer may print one date, a range, or an incomplete range. None of
  // these boundary-only forms broadens service-row monetary eligibility.
  return '$date(?:\\s*(?:[\\p{Dash}➖]|\\bto\\b)\\s*(?:$date)?)?';
}

String _utilityDatePattern({
  bool allowNumericDates = false,
  bool allowFragmentedYear = false,
  bool allowTwoDigitYear = false,
  bool allowOrdinalDay = false,
  bool allowWeekdayContext = false,
  bool allowMonthYear = false,
}) {
  const month =
      r'(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|'
      r'Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|'
      r'Nov(?:ember)?|Dec(?:ember)?)(?:\s*\.)?';
  const day = r'(?:0?[1-9]|[12]\d|3[01])';
  final fullYear = allowFragmentedYear
      ? r'(?:1\s*9|2\s*0)\s*\d\s*\d'
      : r'(?:19|20)\d{2}';
  final shortYear = allowFragmentedYear ? r'\d\s*\d' : r'\d{2}';
  final year = allowTwoDigitYear ? '(?:$fullYear|$shortYear)' : fullYear;
  final namedDay = allowOrdinalDay ? '$day(?:st|nd|rd|th)?' : day;
  const weekday =
      r'(?:Mon(?:day)?|Tue(?:s(?:day)?)?|Wed(?:nesday)?|'
      r'Thu(?:r(?:s(?:day)?)?)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)(?:\s*\.)?';
  const weekdayTag =
      '(?:$weekday|\\(\\s*$weekday\\s*\\)|\\[\\s*$weekday\\s*\\])';
  final weekdaySuffix = allowWeekdayContext ? '(?:\\s*,?\\s*$weekdayTag)?' : '';
  final namedDate =
      '(?:$month\\s*$namedDay|$namedDay\\s*$month)$weekdaySuffix'
      '(?:(?:\\s*,\\s*|\\s+)$year)?';
  // Numeric dates only identify a footer boundary. They never broaden the
  // complete named-date evidence required to recover a service amount.
  const numericMonth = r'(?:0?[1-9]|1[0-2])';
  const separator = r'\s*[./-]\s*';
  // Prefer day/month forms before a short year-first alternative, otherwise
  // 03/04/2 5 can be consumed as year 03, month 04, day 2 with a stray 5.
  final shortYearFirst = allowTwoDigitYear
      ? '|$shortYear$separator$numericMonth$separator$day'
      : '';
  final numericDate =
      '(?:$fullYear$separator$numericMonth$separator$day|'
      '$day$separator$numericMonth(?:$separator$year)?|'
      '$numericMonth$separator$day(?:$separator$year)?$shortYearFirst)';
  final dayDate = allowNumericDates ? '(?:$namedDate|$numericDate)' : namedDate;
  // Month/year billing context is a footer proof only. Prefer it before the
  // optional-year day syntax so March 2025 cannot be truncated to March 20.
  final date = allowMonthYear
      ? "(?:$month\\s*(?:[\\p{Dash}/,]\\s*)?(?:['’]\\s*)?$year|"
            '$numericMonth$separator$fullYear|$fullYear$separator$numericMonth|$dayDate)'
      : dayDate;
  // Weekday qualifiers identify footer context only. They cannot qualify a
  // service period for monetary recovery or consume an owned money cell.
  return allowWeekdayContext
      ? '(?:$weekdayTag\\s*,?\\s*)?$date$weekdaySuffix'
      : date;
}

bool _isBoundedUtilitySupportCopy(String text) {
  final normalized = _normalizeOcrLine(text);
  if (_hasPotentialReceiptAdjustmentLabel(normalized) ||
      _printedCurrencyMarkerMatches(normalized).isNotEmpty ||
      RegExp(r'\p{Sc}', unicode: true).hasMatch(normalized)) {
    return false;
  }
  // Only complete printed clock and weekday ranges explain detached signs.
  // Residual signs in punctuation retain uncertainty; hyphenated words do not.
  final withoutClocks = normalized.replaceAll(
    RegExp(
      r'(?<![\p{L}\p{N}])(?:[1-9]|1[0-2])(?::[0-5]\d)?\s*(?:am|pm)\s*[-−–]\s*'
      r'(?:[1-9]|1[0-2])(?::[0-5]\d)?\s*(?:am|pm)(?![\p{L}\p{N}])',
      caseSensitive: false,
      unicode: true,
    ),
    '',
  );
  const weekday =
      r'(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|'
      r'Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)';
  final withoutRanges = withoutClocks.replaceAll(
    RegExp(
      '\\b$weekday\\s*[\\p{Dash}➖]\\s*$weekday\\b',
      caseSensitive: false,
      unicode: true,
    ),
    '',
  );
  return !RegExp(
        r'\d|(?<!\p{L})[\p{Dash}➖]|[\p{Dash}➖](?!\p{L})',
        unicode: true,
      ).hasMatch(withoutRanges) &&
      _unicodeLetterPattern.hasMatch(normalized);
}

bool _hasChargeTableMonetaryEvidence(String monetaryText) {
  final amountTokens = RegExp(_amountTokenPattern).allMatches(monetaryText);
  if (amountTokens.isEmpty) return false;
  final printedAmount = amountTokens.last.group(0)!;
  return RegExp(
        _currencyTokenPattern,
        caseSensitive: false,
      ).hasMatch(monetaryText) ||
      RegExp(r'[.,]\d+\b').hasMatch(printedAmount);
}

bool _isChargeTableSectionBoundary(String line) {
  return RegExp(
    r'^(?:payment\s+(?:coupon|information|summary)|remittance|important\s+messages?|(?:account|billing|usage)\s+(?:summary|information)|contact\s+us|notes?)\b',
    caseSensitive: false,
  ).hasMatch(line.trim());
}

bool _isChargeTableHeader(String line) {
  final lower = line.toLowerCase();
  return (RegExp(r'\bdescription\b').hasMatch(lower) &&
          RegExp(r'\b(?:amount|total|charges?)\b').hasMatch(lower) &&
          RegExp(
            r'\b(?:rate|usage|qty|quantity|therms|kwh|units?)\b',
          ).hasMatch(lower)) ||
      _isInvoiceProductTableHeader(line);
}

bool _isSupportedChargeTableHeader(List<String> lines, int index) =>
    _isChargeTableHeader(lines[index]) ||
    _isBillChargeDetailHeader(lines, index);

bool _isBillChargeDetailHeader(List<String> lines, int index) {
  if (index == 0) return false;
  if (_lineHasAmount(lines[index - 1])) return false;
  final lower = lines[index].toLowerCase();
  final hasDescription = RegExp(r'\bdescription\b').hasMatch(lower);
  final hasServiceColumn =
      RegExp(r'^service\b').hasMatch(lower) &&
      RegExp(r'\b(?:usage|rate)\b').hasMatch(lower);
  if ((!hasDescription && !hasServiceColumn) ||
      !RegExp(r'\bamount\b').hasMatch(lower)) {
    return false;
  }
  return RegExp(
    r'\b(?:current\s+charges?\s+detail|charges?\s+for\s+(?:this|the|current)\s+period|(?:itemized|detailed)\s+charges?|charges?\s+(?:detail|breakdown))\b',
    caseSensitive: false,
  ).hasMatch(lines[index - 1]);
}

bool _isInvoiceProductTableHeader(String line) {
  final lower = line.toLowerCase();
  return RegExp(r'\bproduct\s*(?:/|&)\s*service\b').hasMatch(lower) &&
      RegExp(r'\btotal\b').hasMatch(lower) &&
      RegExp(r'\b(?:sku|item\s*(?:no|number)|code)\b').hasMatch(lower) &&
      RegExp(r'\b(?:qty|quantity)\b').hasMatch(lower) &&
      RegExp(r'\bunit\s*price\b').hasMatch(lower);
}

String _stripChargeTableColumns(String description) {
  final trailingColumns = RegExp(
    '^(.*?)\\s+(?:(?:$_currencyTokenPattern)?\\s*$_amountTokenPattern\\s*){1,2}\$',
    caseSensitive: false,
  ).firstMatch(description);
  final name = _cleanDescription(trailingColumns?.group(1) ?? description)
      .replaceFirst(
        RegExp(
          '\\s+(?:(?:$_currencyTokenPattern)\\s*)?\\d+(?:[.,]\\d+)?\\s*(?:/\\s*|per\\s+)(?:therms?|kwh|m³|m3|gallons?|gal|units?|gb|minutes?|mins?)\\s*\$',
          caseSensitive: false,
        ),
        '',
      )
      .replaceFirst(
        RegExp(
          r'\s+\d+(?:[.,]\d+)?\s*(?:therms?|kwh|m³|m3|gallons?|gal|units?|gb|minutes?|mins?)$',
          caseSensitive: false,
        ),
        '',
      );
  return _hasSubstantiveItemDescription(name) ? name : description;
}

class _LabeledReceiptAmounts {
  const _LabeledReceiptAmounts({
    this.subtotal,
    this.subtotalCurrency,
    this.subtotalHasExplicitCurrencyEvidence = false,
    this.tax,
    this.taxCurrency,
    this.taxHasExplicitCurrencyEvidence = false,
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
    this.incompleteReasons = const [],
    this.total,
  });

  final String? subtotal;
  final String? subtotalCurrency;
  final bool subtotalHasExplicitCurrencyEvidence;
  final String? tax;
  final String? taxCurrency;
  final bool taxHasExplicitCurrencyEvidence;
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
  final bool discountBeforeSubtotal;
  final bool adjustmentsComplete;
  final List<ReceiptOcrIncompleteAdjustmentReason> incompleteReasons;
  final String? total;
}

class _ReceiptCurrencyDetection {
  const _ReceiptCurrencyDetection({
    this.currency,
    this.isSymbolOnly = false,
    this.usedFallbackForSymbolOnly = false,
    this.provenance = ReceiptOcrCurrencyProvenance.unresolved,
  });

  final String? currency;
  final bool isSymbolOnly;
  final bool usedFallbackForSymbolOnly;
  final ReceiptOcrCurrencyProvenance provenance;
}

// Keeps bounded acceptance diagnostics aligned with the parser's input grammar.
// Callers must emit only fixed diagnostic enums, never the normalized text.
String normalizeReceiptOcrLineForDiagnostics(String value) =>
    _normalizeOcrLine(value);

enum ReceiptOcrUnretainedPatternReason {
  recognizedCurrencySuffixStillRejected,
  otherSuffixDeletionWouldMatch,
  suffixAndBoundaryInsertionWouldMatch,
  trailingTextOtherMismatch,
  amountBoundaryInsertionWouldMatch,
  joinedAmountOtherMismatch,
  other,
}

// Only fixed reasons leave this helper. It uses the exact item-row grammar
// used by selection and never returns receipt text or an amount.
ReceiptOcrUnretainedPatternReason diagnoseReceiptOcrUnretainedRow(
  String source,
) {
  final line = _normalizeOcrLine(source);
  final amounts = RegExp(_amountTokenPattern).allMatches(line).toList();
  if (amounts.isEmpty) return ReceiptOcrUnretainedPatternReason.other;
  final last = amounts.last;
  final prefix = line.substring(0, last.start);
  final amount = line.substring(last.start, last.end);
  final suffix = line.substring(last.end).trim();
  final hasJoinedBoundary =
      prefix.isNotEmpty && !RegExp(r'\s$').hasMatch(prefix);
  if (suffix.isNotEmpty) {
    if (RegExp(
      '^(?:$_currencyTokenPattern)\$',
      caseSensitive: false,
    ).hasMatch(suffix)) {
      return ReceiptOcrUnretainedPatternReason
          .recognizedCurrencySuffixStillRejected;
    }
    if (_pricedItemRowPattern.hasMatch('$prefix$amount')) {
      return ReceiptOcrUnretainedPatternReason.otherSuffixDeletionWouldMatch;
    }
    if (hasJoinedBoundary &&
        _pricedItemRowPattern.hasMatch('$prefix $amount')) {
      return ReceiptOcrUnretainedPatternReason
          .suffixAndBoundaryInsertionWouldMatch;
    }
    return ReceiptOcrUnretainedPatternReason.trailingTextOtherMismatch;
  }
  if (hasJoinedBoundary) {
    return _pricedItemRowPattern.hasMatch('$prefix $amount')
        ? ReceiptOcrUnretainedPatternReason.amountBoundaryInsertionWouldMatch
        : ReceiptOcrUnretainedPatternReason.joinedAmountOtherMismatch;
  }
  return ReceiptOcrUnretainedPatternReason.other;
}

String _normalizeOcrLine(String value) {
  const digitSources =
      '٠١٢٣٤٥٦٧٨٩'
      '۰۱۲۳۴۵۶۷۸۹'
      '०१२३४५६७८९'
      '๐๑๒๓๔๕๖๗๘๙';
  var normalized =
      _normalizeFullwidthOcrText(
            _normalizeArabicPresentationForms(value).replaceAll('\u0640', ''),
          )
          .replaceAll('\u066b', '.')
          .replaceAll('\u066c', ',')
          .replaceAll('\u00a0', ' ')
          .replaceAll('−', '-');
  for (var index = 0; index < digitSources.length; index += 1) {
    normalized = normalized.replaceAll(
      digitSources[index],
      (index % 10).toString(),
    );
  }
  normalized = normalized.replaceAllMapped(
    RegExp(
      r'(?<![A-Za-z0-9])(Rs|kr)(?=\d[\d,]*(?:\.\d{1,3}|,\d{2})(?![A-Za-z0-9]))',
      caseSensitive: false,
    ),
    (match) => '${match.group(1)} ',
  );
  normalized = normalized.replaceAllMapped(
    RegExp(
      '([+-])\\s*($_currencyTokenPattern)\\s*(?=\\d)',
      caseSensitive: false,
    ),
    (match) {
      if (match.group(1) == '+' &&
          RegExp(
            _amountTokenPattern,
          ).hasMatch(normalized.substring(0, match.start))) {
        return match.group(0)!;
      }
      return '${match.group(2)} ${match.group(1)}';
    },
  );
  normalized = normalized.replaceAllMapped(
    RegExp(r'(?<=\d)\u060c(?=\d{1,2}(?:\D|$))'),
    (_) => '.',
  );
  normalized = normalized.replaceAllMapped(
    RegExp(r'(?<=\d)\u060c(?=\d)'),
    (_) => ',',
  );
  normalized = normalized.replaceFirstMapped(
    // Keep the complete printed amount together before moving a trailing
    // AED marker. A permissive prefix used to swallow comma decimals and
    // leave only the fractional digits as the apparent amount.
    RegExp(r'^(.*?)\s+(-?\d+(?:[.,]\d+)*)\s*(د\.?إ)$'),
    (match) => '${match.group(1)} ${match.group(3)} ${match.group(2)}',
  );
  return normalized.trim();
}

String _normalizeArabicPresentationForms(String value) {
  final normalized = StringBuffer();
  for (final rune in value.runes) {
    if ((rune >= 0xFB50 && rune <= 0xFDFF) ||
        (rune >= 0xFE70 && rune <= 0xFEFF)) {
      normalized.write(unicode_normalization.nfkc(String.fromCharCode(rune)));
    } else {
      normalized.writeCharCode(rune);
    }
  }
  return normalized.toString();
}

String _normalizeFullwidthOcrText(String value) {
  return String.fromCharCodes(
    value.runes.map((rune) {
      if (rune == 0x3000) return 0x20;
      if (rune >= 0xFF01 && rune <= 0xFF5E) return rune - 0xFEE0;
      return switch (rune) {
        0xFFE1 => 0x00A3,
        0xFFE5 => 0x00A5,
        0xFFE6 => 0x20A9,
        _ => rune,
      };
    }),
  );
}

// Recognition may preserve currency evidence that the authoritative API does
// not yet accept for bill mutation. Keep that evidence separate from the
// shared selectable/API-aligned currency policy so OCR never expands financial
// authority as a side effect of recognizing a receipt.
const _ocrRecognizedCurrencyCodes = <String>{
  'AED',
  'AUD',
  'BHD',
  'BRL',
  'CAD',
  'CHF',
  'CNY',
  'EUR',
  'GBP',
  'HKD',
  'INR',
  'JPY',
  'KRW',
  'KWD',
  'MXN',
  'NOK',
  'NZD',
  'PKR',
  'PLN',
  'RUB',
  'SEK',
  'SGD',
  'THB',
  'TRY',
  'TWD',
  'USD',
  'VND',
};
final _supportedCurrencyCodes = _ocrRecognizedCurrencyCodes;
final _currencyTokenPattern = [
  ..._supportedCurrencyCodes,
  r'HK$',
  r'US$',
  r'CA$',
  r'A$',
  r'S$',
  r'NZ$',
  r'NT$',
  r'R$',
  r'$',
  '€',
  '£',
  '¥',
  '₹',
  '₩',
  '₺',
  '₫',
  'đ',
  'zł',
  'kr',
  'Rs',
  'د.إ',
  'دإ',
].map(RegExp.escape).join('|');
const _amountTokenPattern =
    r"-?(?:\d{1,3}(?:[ \u00a0]\d{3})+(?:[.,]\d{1,3})?|\d+(?:[.,'’]\d+)*)";
final _pricedItemRowPattern = RegExp(
  '^(.+?)\\s+($_currencyTokenPattern)?\\s*'
  '($_amountTokenPattern)'
  '(?:\\s*($_currencyTokenPattern))?\$',
  caseSensitive: false,
);
// A printed currency symbol supplies a reusable amount boundary even when
// recognition joins it to the description. Alphabetic codes stay excluded:
// a joined code and number can be a product identifier.
final _joinedSymbolPricedItemRowPattern = RegExp(
  '^(.+?)([\$€£¥₹₩₺₫đ])\\s*($_amountTokenPattern)\\s*\$',
  caseSensitive: false,
  unicode: true,
);

const _nonCurrencyAdjustmentCodes = {
  'TAX',
  'TIP',
  'VAT',
  'TVA',
  'IVA',
  'KDV',
  'GST',
  'HST',
  'FEE',
  'DUE',
  'NET',
  'PAY',
  'BAL',
  'SUB',
  'OFF',
  'SVC',
  'SRV',
  'SHP',
  'DSC',
  'AMT',
};

String? _supportedCurrencyCode(String? value) {
  final normalized = settleoraNormalizeCurrencyCode(value);
  return _ocrRecognizedCurrencyCodes.contains(normalized) ? normalized : null;
}

bool _hasExplicitHongKongCurrencyMarker(String joined) {
  return joined.contains('HK\$') ||
      RegExp(r'\bHKD?\s*\$').hasMatch(joined) ||
      RegExp(r'\b(HONG\s+KONG|HK)\s+DOLLARS?\b').hasMatch(joined) ||
      RegExp(r'\bH\.?\s*K\.?\b').hasMatch(joined);
}

bool _hasExplicitUnitedStatesCurrencyMarker(String joined) {
  return joined.contains('US\$') ||
      RegExp(r'\bUSD?\s*\$').hasMatch(joined) ||
      RegExp(r'\b(US|U\.S\.|UNITED\s+STATES)\s+DOLLARS?\b').hasMatch(joined);
}

String? _explicitSymbolCurrency(String joined) {
  const markers = <String, String>{
    r'CA$': 'CAD',
    r'NZ$': 'NZD',
    r'NT$': 'TWD',
    r'A$': 'AUD',
    r'S$': 'SGD',
    r'R$': 'BRL',
    '₹': 'INR',
    '₩': 'KRW',
    '₺': 'TRY',
    '₫': 'VND',
    'ZŁ': 'PLN',
  };
  for (final marker in markers.entries) {
    if (joined.contains(marker.key)) return marker.value;
  }
  return null;
}

String? _contextualCurrency(String joined, {required bool hasUsPostalAddress}) {
  if (joined.contains(r'$')) {
    if (RegExp(
          r'\b(HONG\s+KONG|KOWLOON|CAUSEWAY\s+BAY|HK)\b',
        ).hasMatch(joined) ||
        joined.contains('+852')) {
      return 'HKD';
    }
    if (RegExp(
          r'\b(CANADA|TORONTO|VANCOUVER|ONTARIO|QUEBEC)\b',
        ).hasMatch(joined) ||
        RegExp(r'\bHST\b').hasMatch(joined) ||
        RegExp(r'\b[A-Z]\d[A-Z][ -]?\d[A-Z]\d\b').hasMatch(joined)) {
      return 'CAD';
    }
    if (RegExp(
      r'\b(AUSTRALIA|SYDNEY|MELBOURNE|BRISBANE|NSW|VIC|QLD|ABN)\b',
    ).hasMatch(joined)) {
      return 'AUD';
    }
    if (RegExp(
      r'\b(SINGAPORE|ORCHARD|GST\s*(REG|REGISTRATION))\b',
    ).hasMatch(joined)) {
      return 'SGD';
    }
    if (RegExp(
      r'\b(NEW\s+ZEALAND|AUCKLAND|WELLINGTON|GST\s*NO)\b',
    ).hasMatch(joined)) {
      return 'NZD';
    }
    if (RegExp(
      r'\b(MEXICO|MÉXICO|CDMX|CANCUN|CANCÚN|IVA)\b',
    ).hasMatch(joined)) {
      return 'MXN';
    }
    if (RegExp(r'\b(UNITED\s+STATES|USA|SALES\s+TAX)\b').hasMatch(joined) ||
        hasUsPostalAddress) {
      return 'USD';
    }
  }

  if (joined.contains('¥')) {
    if (RegExp(r'[\u3040-\u30ff]|東京|大阪|日本').hasMatch(joined)) {
      return 'JPY';
    }
    if (RegExp(r'[\u4e00-\u9fff]').hasMatch(joined) &&
        RegExp(r'(上海|北京|中国|人民幣|人民币)').hasMatch(joined)) {
      return 'CNY';
    }
  }
  if (RegExp(r'\bKR\b', caseSensitive: false).hasMatch(joined)) {
    if (RegExp(r'\b(STOCKHOLM|SWEDEN|MOMS)\b').hasMatch(joined)) {
      return 'SEK';
    }
    if (RegExp(r'\b(OSLO|NORWAY|MVA)\b').hasMatch(joined)) {
      return 'NOK';
    }
  }
  if (RegExp(r'\bRS\b', caseSensitive: false).hasMatch(joined)) {
    if (RegExp(r'\b(INDIA|DELHI|MUMBAI|GSTIN)\b').hasMatch(joined)) {
      return 'INR';
    }
    if (RegExp(r'\b(PAKISTAN|KARACHI|LAHORE|STRN)\b').hasMatch(joined)) {
      return 'PKR';
    }
  }
  if (joined.contains('ZŁ')) {
    return 'PLN';
  }
  return null;
}

bool _hasUsPostalAddress(List<String> lines) {
  final cityStateZip = RegExp(
    r"^[a-z][a-z .'-]{1,40}(,?)\s+(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\s+\d{5}(?:-\d{4})?$",
    caseSensitive: false,
  );
  for (var index = 0; index < lines.length; index++) {
    final match = cityStateZip.firstMatch(lines[index].trim());
    if (match == null) continue;
    if (match.group(1) == ',') return true;
    var addressIndex = index - 1;
    while (addressIndex >= 0 &&
        _isAddressContinuationLine(lines[addressIndex])) {
      addressIndex -= 1;
    }
    if (addressIndex >= 0 && _isStreetAddressLine(lines[addressIndex])) {
      return true;
    }
  }
  return false;
}

bool _lineHasAmount(String line) {
  return _lastAmountInLine(line) != null;
}

bool _isStandaloneAmountRow(String line) {
  if (RegExp(
        '^\\s*(?:(?:$_currencyTokenPattern)\\s*)?$_amountTokenPattern'
        '(?:\\s*(?:$_currencyTokenPattern))?\\s*\$',
        caseSensitive: false,
      ).hasMatch(line) &&
      _lineHasAmount(line)) {
    return true;
  }
  final amount = RegExp(_amountTokenPattern).firstMatch(line);
  if (amount == null || !_lineHasAmount(line)) return false;
  final remaining =
      '${line.substring(0, amount.start)} ${line.substring(amount.end)}'
          .replaceAll(RegExp(r'[\s$€£¥₹₩฿₱]'), '')
          .trim();
  return remaining.isEmpty || _supportedCurrencyCode(remaining) != null;
}

bool _isStandaloneTenderLabel(String line) => RegExp(
  r'^(?:cash|change|payment|tender|paid|card|credit[ -]?card|debit[ -]?card|visa|mastercard|master card|amex|american express)$',
  caseSensitive: false,
).hasMatch(line.trim());

String? _lastAmountInLine(String line, {String? currency}) {
  final matches = RegExp(
    '(?<![A-Za-z0-9])$_amountTokenPattern(?![A-Za-z0-9])',
  ).allMatches(line).toList(growable: false);
  if (matches.isEmpty) {
    return null;
  }

  return _normalizeAmount(matches.last.group(0)!, currency: currency);
}

String? _selectedTotalAmountInLine(String line, {String? currency}) {
  final selected = RegExp(_amountTokenPattern).allMatches(line).lastOrNull;
  if (selected != null &&
      _supportedCurrencyCodes.contains(
        _currencyAdjacentToSelectedAmount(
          line,
          currency,
          allowPriorCurrencyConflict: true,
        ).currency,
      )) {
    return _normalizeAmount(selected.group(0)!, currency: currency);
  }
  return _lastAmountInLine(line, currency: currency);
}

String? _attachedSupportedCodeOnSelectedAmount(String line) {
  final selected = RegExp(_amountTokenPattern).allMatches(line).lastOrNull;
  if (selected == null) return null;
  final before = line.substring(0, selected.start);
  final after = line.substring(selected.end);
  final preceding = RegExp(
    r'(?<![\p{L}\p{N}])([A-Za-z]{3})$',
    unicode: true,
  ).firstMatch(before)?.group(1)?.toUpperCase();
  final following = RegExp(
    r'^([A-Za-z]{3})(?![\p{L}\p{N}])',
    unicode: true,
  ).firstMatch(after)?.group(1)?.toUpperCase();
  if (preceding != null && following != null && preceding != following) {
    return null;
  }
  final code = preceding ?? following;
  return _supportedCurrencyCodes.contains(code) ? code : null;
}

String _originalReceiptAdjustmentLabel(
  String line, {
  required String fallback,
}) {
  final matches = RegExp(
    '(?<![A-Za-z0-9])$_amountTokenPattern(?![A-Za-z0-9])',
  ).allMatches(line).toList(growable: false);
  if (matches.isEmpty) return fallback;

  final amount = matches.last;
  var beforeAmount = line.substring(0, amount.start);
  var afterAmount = line.substring(amount.end);
  beforeAmount = beforeAmount.replaceFirst(
    RegExp(
      '(?<![\\p{L}\\p{N}])(?:$_currencyTokenPattern)\\s*[:=]?\\s*\$',
      caseSensitive: false,
      unicode: true,
    ),
    ' ',
  );
  afterAmount = afterAmount.replaceFirst(
    RegExp(
      '^\\s*[:=]?\\s*(?:$_currencyTokenPattern)(?=\\s|\$)\\s*',
      caseSensitive: false,
    ),
    ' ',
  );
  final label = '$beforeAmount $afterAmount'
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim()
      .replaceAll(RegExp(r'^[\s:;|=,-]+|[\s:;|=,-]+$'), '')
      .trim();
  if (label.isEmpty) return fallback;

  return _truncateUtf16WithoutSplitting(label, 120);
}

String _truncateUtf16WithoutSplitting(String value, int maxCodeUnits) {
  if (value.length <= maxCodeUnits) return value;

  var end = maxCodeUnits;
  final lastIncluded = value.codeUnitAt(end - 1);
  if (lastIncluded >= 0xD800 && lastIncluded <= 0xDBFF) {
    end -= 1;
  }
  return value.substring(0, end);
}

String? _normalizeAmount(String value, {String? currency}) {
  var normalized = value.replaceAll(RegExp(r"[\s'’]"), '').trim();
  if (normalized.contains(',') && normalized.contains('.')) {
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replaceAll('.', '').replaceAll(',', '.');
    } else {
      normalized = normalized.replaceAll(',', '');
    }
  } else if (normalized.contains(',')) {
    final unsigned = normalized.startsWith('-')
        ? normalized.substring(1)
        : normalized;
    final currencyScale = currency == null
        ? null
        : _currencyMinorUnitDigits(currency);
    final looksGrouped =
        RegExp(r'^\d{1,3}(?:,\d{2})*,\d{3}$').hasMatch(unsigned) ||
        RegExp(r'^\d{1,3}(?:,\d{3})+$').hasMatch(unsigned);
    final singleThreeDigitSeparator = ','.allMatches(unsigned).length == 1;
    if (looksGrouped && !(currencyScale == 3 && singleThreeDigitSeparator)) {
      normalized = normalized.replaceAll(',', '');
    } else if (RegExp(r',\d{1,3}$').hasMatch(normalized)) {
      normalized = normalized.replaceAll(',', '.');
    }
  } else if (normalized.contains('.')) {
    final unsigned = normalized.startsWith('-')
        ? normalized.substring(1)
        : normalized;
    final currencyScale = currency == null
        ? null
        : _currencyMinorUnitDigits(currency);
    if (RegExp(r'^\d{1,3}(?:\.\d{3})+$').hasMatch(unsigned) &&
        (currencyScale != null && currencyScale != 3 ||
            '.'.allMatches(unsigned).length > 1)) {
      normalized = normalized.replaceAll('.', '');
    }
  }
  if (!RegExp(r'^-?\d+(?:\.\d{1,3})?$').hasMatch(normalized)) {
    return null;
  }
  return normalized;
}

String _explicitCodeAmountPattern(String code) {
  if (const {'JPY', 'KRW', 'VND'}.contains(code)) {
    return _amountTokenPattern;
  }
  // A bare integer after a three-letter token is too weak: product/marketing
  // text such as `TRY 2` must not outrank an actual monetary symbol.
  return r"-?(?:\d{1,3}(?:[ \u00a0]\d{3})+(?:[.,]\d{1,3})?|\d+(?:[.,'’]\d+)+)";
}

bool _hasWholeUnitCurrencyContext(String line, String code) {
  final normalized = line.toLowerCase();
  if (_hasSubtotalLabel(line, normalized) ||
      _hasTaxLabel(line, normalized) ||
      _hasServiceChargeLabel(line, normalized) ||
      _hasActualTipChargeLabel(line, normalized) ||
      _hasShippingLabel(line, normalized) ||
      _hasDiscountLabel(line, normalized) ||
      _hasTotalLabel(line, normalized)) {
    return true;
  }

  final escapedCode = RegExp.escape(code);
  final codeBeforeAmount = RegExp(
    '^(.+?)\\s+\\b$escapedCode\\b\\s*[:=]?\\s*-?\\d+\\s*\$',
    caseSensitive: false,
  ).firstMatch(line);
  final amountBeforeCode = RegExp(
    '^(.+?)\\s+-?\\d+\\s*\\b$escapedCode\\b\\s*\$',
    caseSensitive: false,
  ).firstMatch(line);
  final description = _cleanDescription(
    (codeBeforeAmount ?? amountBeforeCode)?.group(1) ?? '',
  );
  return _hasSubstantiveItemDescription(description) &&
      _unicodeLetterPattern.hasMatch(description) &&
      !_isLikelyNonItemDescription(description) &&
      !_isReceiptMetadataLine(description);
}

int _currencyMinorUnitDigits(String? currency) {
  return switch (currency?.trim().toUpperCase()) {
    'JPY' || 'KRW' || 'VND' => 0,
    'KWD' || 'BHD' => 3,
    _ => 2,
  };
}

int? _ocrAmountMinorUnits(String amount, String currency) {
  final minorDigits = _currencyMinorUnitDigits(currency);
  final match = RegExp(r'^(-?)(\d+)(?:\.(\d{1,3}))?$').firstMatch(amount);
  if (match == null) return null;
  final fraction = match.group(3) ?? '';
  if (fraction.length > minorDigits) return null;
  final whole = int.tryParse(match.group(2)!);
  final minor = fraction.isEmpty
      ? 0
      : int.tryParse(fraction.padRight(minorDigits, '0'));
  if (whole == null || minor == null) return null;
  final scale = switch (minorDigits) {
    0 => 1,
    3 => 1000,
    _ => 100,
  };
  final value = whole * scale + minor;
  return match.group(1) == '-' ? -value : value;
}

String? _sumSameCurrencyOcrAmounts(Iterable<String> amounts, String currency) {
  final minorDigits = _currencyMinorUnitDigits(currency);
  final scale = switch (minorDigits) {
    0 => 1,
    3 => 1000,
    _ => 100,
  };
  var totalMinor = 0;
  var count = 0;
  for (final amount in amounts) {
    final match = RegExp(r'^(\d+)(?:\.(\d{1,3}))?$').firstMatch(amount);
    if (match == null) return null;
    final whole = int.tryParse(match.group(1)!);
    final fraction = match.group(2) ?? '';
    if (whole == null || fraction.length > minorDigits) return null;
    final minor = fraction.isEmpty
        ? 0
        : int.tryParse(fraction.padRight(minorDigits, '0'));
    if (minor == null) return null;
    totalMinor += whole * scale + minor;
    count += 1;
  }
  if (count < 2) return null;
  final whole = totalMinor ~/ scale;
  if (minorDigits == 0) return '$whole';
  final fraction = (totalMinor % scale).toString().padLeft(minorDigits, '0');
  return '$whole.$fraction';
}

String _cleanDescription(String value) {
  return value
      .replaceAll(RegExp(r'\s+'), ' ')
      .replaceAll(RegExp(r'^[*#\-\s]+'), '')
      .trim();
}

bool _isPrintedModifierLine(String line) =>
    RegExp(r'^\+\s+\p{L}', unicode: true).hasMatch(line.trim());

bool _isAdministrativeLine(String line) {
  final normalized = line.toLowerCase();
  return _hasSubtotalLabel(line, normalized) ||
      _hasTaxLabel(line, normalized) ||
      _isExplicitNonItemFeeLine(line) ||
      _hasServiceChargeLabel(line, normalized) ||
      _hasActualTipChargeLabel(line, normalized) ||
      _isSuggestedTipLine(normalized) ||
      _hasShippingLabel(line, normalized) ||
      _hasDiscountLabel(line, normalized) ||
      _hasTotalLabel(line, normalized) ||
      _isAccountBalanceSummaryLine(line) ||
      _isNonTransactionCurrencyMetadataLine(line) ||
      _isReceiptCourtesyLine(line);
}

bool _isAccountBalanceSummaryLine(String line) =>
    RegExp(
      r'^(?:(?:previous|prior|opening|closing|outstanding)\s+balance|balance\s+(?:forward|brought\s+forward)|payments?\s+(?:received|made)|current\s+(?:[\p{L}]+\s+){0,3}charges)\b',
      caseSensitive: false,
      unicode: true,
    ).hasMatch(line.trim()) ||
    _isLabeledStandaloneMoneyLine(
      line,
      RegExp(r'^balance\b', caseSensitive: false),
    ) ||
    _isLabeledStandaloneMoneyLine(
      line,
      RegExp(r'^account\s+credit\b', caseSensitive: false),
    ) ||
    _isLabeledStandaloneMoneyLine(
      line,
      RegExp(r'^(?:amount\s+paid|remaining\s+balance)\b', caseSensitive: false),
    );

bool _isLabeledStandaloneMoneyLine(String line, RegExp label) {
  final trimmed = line.trim();
  final match = label.firstMatch(trimmed);
  if (match == null) return false;
  final remainder = trimmed
      .substring(match.end)
      .replaceFirst(RegExp(r'^\s*[:：]\s*'), '')
      .trim();
  return _isStandaloneAmountRow(remainder);
}

bool _isExplicitNonItemFeeLine(String line) => _isLabeledStandaloneMoneyLine(
  line,
  RegExp(
    r'^(?:tourism|tourist|resort|destination|facility|municipal)\s+fee\b',
    caseSensitive: false,
  ),
);

bool _isPaymentMetadataLine(String line) {
  final normalized = line.toLowerCase().trim();
  if (_isLabeledStandaloneMoneyLine(
    line,
    RegExp(r'^(?:deposit\s+paid|paid\s+deposit)\b', caseSensitive: false),
  )) {
    return true;
  }
  if (RegExp(
        r'^(?:payment\s+(?:coupon|information|summary)|remittance)\b',
      ).hasMatch(normalized) &&
      _lineHasAmount(line)) {
    return true;
  }
  // These labels describe settlement evidence, not merchandise. Keep the
  // recognition rule anchored so a product name containing the word is not
  // excluded solely for that reason.
  if (RegExp(
        r'^(?:gotówka|reszta|nakit|para üstü|tiền mặt|tiền thừa|dinheiro|troco|espèces|monnaie|наличные|сдача|نقدا|نقداً|الباقي|現金|お釣り|现金|現金支付|找零|현금|거스름돈|เงินสด|เงินทอน|नकद|बाकी)(?:\s|[:：])',
        caseSensitive: false,
      ).hasMatch(normalized) &&
      _lineHasAmount(line)) {
    return true;
  }
  final paymentPrefix = RegExp(r'^(?:payment|tender)\b').firstMatch(normalized);
  if (paymentPrefix != null &&
      _hasCurrencyMetadataShape(
        normalized.substring(paymentPrefix.end).trimLeft(),
      ) &&
      _lineHasAmount(line)) {
    return true;
  }
  if (RegExp(r'^(?:gift|prepaid)[ -]?card\b').hasMatch(normalized) &&
      _lineHasAmount(line)) {
    return true;
  }
  if (RegExp(
        r'^paid\s+(?:by\s+)?(?:cash|card|credit[ -]?card|debit[ -]?card|visa|mastercard|master card|amex|american express)\b',
      ).hasMatch(normalized) &&
      _lineHasAmount(line)) {
    return true;
  }
  if (RegExp(r'^(?:credit|debit)[ -]?card\b').hasMatch(normalized) &&
      _lineHasAmount(line)) {
    return true;
  }
  if (RegExp(
    r'^(cash|change|card|visa|mastercard|master card|amex|american express)\b',
  ).hasMatch(normalized)) {
    return _lineHasAmount(line) ||
        RegExp(
          r'\b(payment|paid|tender|ending|approval|auth|charged)\b',
        ).hasMatch(normalized);
  }
  if (RegExp(
    r'^(?:approval|auth(?:orization)?)\s*[:#=-]?\s*[a-z0-9-]*\d[a-z0-9-]*\b',
  ).hasMatch(normalized)) {
    return true;
  }
  return RegExp(
    r'\b(card\s+(?:charged|payment|tender|ending|number|no)|charged\s+(?:to\s+)?card|approval\s*(?:code|no|#|number)|auth(?:orization)?\s*(?:code|no|#|number))\b',
  ).hasMatch(normalized);
}

bool _isNonTransactionCurrencyMetadataLine(String line) {
  if (_isPaymentMetadataLine(line) || _isAccountBalanceSummaryLine(line)) {
    return true;
  }
  if (_isLabeledStandaloneMoneyLine(
    line,
    RegExp(r'^dcc\s+selected\b', caseSensitive: false),
  )) {
    return true;
  }
  final trimmed = line.trim();
  if (RegExp(
        r'^(?:reference|conversion|dcc)\s+(?:total|amount)\b',
        caseSensitive: false,
      ).hasMatch(trimmed) &&
      _lineHasAmount(trimmed) &&
      _lineHasCurrencyMarkerOrCode(trimmed)) {
    return true;
  }
  final prefix = RegExp(
    r'^(?:payment|tender|(?:gift|prepaid)[ -]?card|paid\s+(?:by\s+)?(?:cash|card|credit[ -]?card|debit[ -]?card|visa|mastercard|master card|amex|american express)|(?:credit|debit)[ -]?card|cash|change|card|visa|mastercard|master card|amex|american express|dcc|reference|conversion)\b',
    caseSensitive: false,
  ).firstMatch(trimmed);
  if (prefix == null) {
    return false;
  }
  final remainder = trimmed.substring(prefix.end).trimLeft();
  return _hasCurrencyMetadataShape(remainder) &&
      (_lineHasAmount(line) || _lineHasCurrencyMarkerOrCode(line));
}

({bool hasSelection, String? currency, String? amount}) _corroboratedDccCharge(
  List<String> lines,
) {
  final selected = <({String currency, String amount, String canonical})>[];
  final charged = <({String currency, String amount, String canonical})>[];
  final selectionPattern = RegExp(
    '^\\s*dcc\\s+selected\\s+([A-Za-z]{3})\\s+($_amountTokenPattern)\\s*\$',
    caseSensitive: false,
  );
  final chargedPattern = RegExp(
    '^\\s*card\\s+charged\\s+([A-Za-z]{3})\\s+($_amountTokenPattern)\\s*\$',
    caseSensitive: false,
  );
  var hasSelection = false;
  var selectionCount = 0;
  var chargeCount = 0;
  for (final line in lines) {
    final selection = selectionPattern.firstMatch(line);
    final charge = chargedPattern.firstMatch(line);
    if (selection != null) {
      hasSelection = true;
      selectionCount++;
    }
    if (charge != null) chargeCount++;
    final match = selection ?? charge;
    if (match == null) continue;
    final currency = _supportedCurrencyCode(match.group(1));
    final amount = _normalizeAmount(match.group(2)!, currency: currency);
    if (currency == null || amount == null || amount.startsWith('-')) continue;
    final parts = amount.split('.');
    final fraction = parts.length == 2
        ? parts[1].replaceFirst(RegExp(r'0+$'), '')
        : '';
    final canonicalAmount = fraction.isEmpty
        ? parts[0]
        : '${parts[0]}.$fraction';
    final evidence = (
      currency: currency,
      amount: amount,
      canonical: canonicalAmount,
    );
    if (selection != null) {
      selected.add(evidence);
    } else {
      charged.add(evidence);
    }
  }
  if (selectionCount == 1 &&
      chargeCount == 1 &&
      selected.length == 1 &&
      charged.length == 1 &&
      selected.single.currency == charged.single.currency &&
      selected.single.canonical == charged.single.canonical) {
    return (
      hasSelection: true,
      currency: charged.single.currency,
      amount: charged.single.amount,
    );
  }
  return (hasSelection: hasSelection, currency: null, amount: null);
}

final _dccExchangeRatePattern = RegExp(
  r'^\s*exchange\s+rate\s+(\d{1,8}[.,]\d{3,8})\s+([A-Z]{3})\s*/\s*([A-Z]{3})\s*$',
  caseSensitive: false,
);

BigInt? _dccAmountThousandths(String? amount) {
  if (amount == null || !RegExp(r'^\d{1,12}(?:\.\d{1,3})?$').hasMatch(amount)) {
    return null;
  }
  final parts = amount.split('.');
  return BigInt.parse(parts.first) * BigInt.from(1000) +
      BigInt.parse(parts.length == 2 ? parts[1].padRight(3, '0') : '000');
}

bool _dccRateConsistentWithPrintedAmounts(
  RegExpMatch rate,
  List<ReceiptOcrItemCandidate> items,
  String chargedAmount,
  String itemCurrency,
  String chargedCurrency,
) {
  final charged = _dccAmountThousandths(chargedAmount);
  if (charged == null || charged == BigInt.zero) return false;
  final printed = rate.group(1)!.replaceAll(',', '.').split('.');
  final scale = BigInt.from(10).pow(printed[1].length);
  final rateUnits = BigInt.parse(printed[0]) * scale + BigInt.parse(printed[1]);
  if (rateUnits == BigInt.zero) return false;
  var itemSum = BigInt.zero;
  for (final item in items) {
    final amount = _dccAmountThousandths(item.lineTotal);
    if (amount == null || amount == BigInt.zero) return false;
    itemSum += amount;
  }
  final difference = (itemSum * scale - charged * rateUnits).abs();
  final itemQuantum = BigInt.from(
    10,
  ).pow(3 - _currencyMinorUnitDigits(itemCurrency));
  final chargedQuantum = BigInt.from(
    10,
  ).pow(3 - _currencyMinorUnitDigits(chargedCurrency));
  // Bound only the last printed rate digit and currency rounding. This
  // checks evidence consistency; it never converts an item for application.
  final twiceTolerance =
      charged +
      chargedQuantum * rateUnits +
      itemQuantum * BigInt.from(items.length) * scale;
  return difference * BigInt.from(2) <= twiceTolerance;
}

String? _boundedDccChargedTotal(
  List<String> lines,
  List<ReceiptOcrItemCandidate> items,
  _LabeledReceiptAmounts amounts,
  String? receiptCurrency,
  ({bool hasSelection, String? currency, String? amount}) dccCharge, {
  required bool hasCompleteItemEvidence,
}) {
  if (!hasCompleteItemEvidence ||
      dccCharge.amount == null ||
      dccCharge.currency != receiptCurrency ||
      !amounts.adjustmentsComplete ||
      amounts.incompleteReasons.isNotEmpty ||
      amounts.subtotal != null ||
      amounts.tax != null ||
      amounts.service != null ||
      amounts.tip != null ||
      amounts.shipping != null ||
      amounts.discount != null ||
      items.isEmpty ||
      items.any(
        (item) =>
            item.lineTotal == null ||
            item.currency == null ||
            item.currency == receiptCurrency ||
            item.currencyUnresolved,
      )) {
    return null;
  }
  final itemCurrencies = items.map((item) => item.currency!).toSet();
  if (itemCurrencies.length != 1) return null;
  final itemCurrency = itemCurrencies.single;
  final rates = lines
      .map(_dccExchangeRatePattern.firstMatch)
      .whereType<RegExpMatch>()
      .toList(growable: false);
  if (rates.length != 1 ||
      rates.single.group(2)!.toUpperCase() != itemCurrency ||
      rates.single.group(3)!.toUpperCase() != receiptCurrency ||
      !_dccRateConsistentWithPrintedAmounts(
        rates.single,
        items,
        dccCharge.amount!,
        itemCurrency,
        receiptCurrency!,
      )) {
    return null;
  }
  final cardCharge = RegExp(
    '^\\s*card\\s+charged\\s+[A-Z]{3}\\s+($_amountTokenPattern)\\s*\$',
    caseSensitive: false,
  );
  for (final line in lines) {
    final lower = line.toLowerCase();
    if (_hasTotalLabel(line, lower) ||
        _hasSubtotalLabel(line, lower) ||
        RegExp(
          r'^\s*(?:currency|curr)\b',
          caseSensitive: false,
        ).hasMatch(line) ||
        RegExp(
          r'\b(?:partial|split|installment|deposit|refund|reversal|cashback|remaining|balance|unpaid)\b',
          caseSensitive: false,
        ).hasMatch(line) ||
        ((_isPaymentMetadataLine(line) ||
                RegExp(
                  r'^\s*(?:payment|tender|paid(?:\s+by)?|cash|change|(?:gift|prepaid|credit|debit)[ -]?card|card|visa|mastercard|master\s+card|amex|bank\s+transfer)\b',
                  caseSensitive: false,
                ).hasMatch(line)) &&
            !cardCharge.hasMatch(line))) {
      return null;
    }
  }
  return dccCharge.amount;
}

bool _hasCurrencyMetadataShape(String remainder) {
  const qualifierPattern =
      r'(?:amount|currency|conversion|reference|rate|charged|cash|card|credit[ -]?card|debit[ -]?card|visa|mastercard|master card|amex|american express)';
  final currencyPattern = '(?:$_currencyTokenPattern)';
  final amountPattern = '(?:$_amountTokenPattern)';
  return RegExp(
    '^(?:[:#=\\-]\\s*)?'
    '(?:$qualifierPattern(?:\\s*[:#=\\-]\\s*|\\s+)){0,3}'
    '(?:$currencyPattern(?:\\s+$amountPattern)?|'
    '$amountPattern(?:\\s+$currencyPattern)?)'
    '\\s*\$',
    caseSensitive: false,
  ).hasMatch(remainder);
}

bool _lineHasCurrencyMarkerOrCode(String line) {
  final normalized = line.toUpperCase();
  return _supportedCurrencyCodes.any(
        (code) => RegExp('\\b${RegExp.escape(code)}\\b').hasMatch(normalized),
      ) ||
      _explicitCurrencyFromNormalizedLine(normalized) != null ||
      normalized.contains(r'$') ||
      normalized.contains('¥') ||
      normalized.contains('ZŁ') ||
      RegExp(r'\b(?:KR|RS)\b').hasMatch(normalized);
}

String? _explicitCurrencyFromNormalizedLine(String normalized) {
  if (_hasExplicitHongKongCurrencyMarker(normalized)) return 'HKD';
  if (_hasExplicitUnitedStatesCurrencyMarker(normalized)) return 'USD';
  if (normalized.contains('د.إ') || normalized.contains('دإ')) return 'AED';
  if (normalized.contains('€')) return 'EUR';
  if (normalized.contains('£')) return 'GBP';
  // The đồng marker is also a Vietnamese letter. Only an amount-adjacent
  // occurrence establishes receipt currency.
  if (RegExp(
    r'(?:\d\s*Đ(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])Đ\s*\d)',
    unicode: true,
  ).hasMatch(normalized)) {
    return 'VND';
  }
  return _explicitSymbolCurrency(normalized);
}

String? _currencyFromItemToken(String? token) {
  if (token == null) return null;
  final normalized = token.trim().toUpperCase();
  if (normalized == 'Đ') return 'VND';
  return _supportedCurrencyCode(normalized) ??
      _explicitCurrencyFromNormalizedLine(normalized);
}

bool _currencyCompatibleWithBareDollar(String? currency) => const {
  'AUD',
  'BRL',
  'CAD',
  'HKD',
  'MXN',
  'NZD',
  'SGD',
  'TWD',
  'USD',
}.contains(currency);

String? _itemCurrencyFromPrintedText(
  String text,
  String? receiptCurrency, {
  String? token,
}) {
  final itemText = _maskAmbiguousSupportedItemWords(text);
  final unsupportedSelected = _unsupportedIsoCodeAdjacentToSelectedAmount(
    itemText,
  );
  if (unsupportedSelected != null) return unsupportedSelected;
  final selected = _currencyAdjacentToSelectedAmount(itemText, receiptCurrency);
  if (selected.hasExplicitEvidence) return selected.currency;
  if (itemText.contains('¥') &&
      receiptCurrency != null &&
      receiptCurrency != 'JPY' &&
      receiptCurrency != 'CNY') {
    return _currencyAdjacentToSelectedAmountWithYen(itemText) ?? '¥';
  }
  final itemToken =
      token == null || _maskAmbiguousSupportedItemWords(token).trim().isEmpty
      ? null
      : token;
  return _currencyFromItemToken(itemToken) ??
      _explicitCurrencyFromNormalizedLine(itemText.toUpperCase()) ??
      receiptCurrency;
}

bool _selectedItemCurrencyUnresolved(String text, String? receiptCurrency) {
  final itemText = _maskAmbiguousSupportedItemWords(text);
  if (_unsupportedIsoCodeAdjacentToSelectedAmount(itemText) != null) {
    return true;
  }
  final selected = _currencyAdjacentToSelectedAmount(itemText, receiptCurrency);
  if (selected.hasExplicitEvidence && selected.currency != null) return false;
  if (_hasUnsupportedIsoMonetaryEvidence(itemText)) return true;
  return selected.hasExplicitEvidence && selected.currency == null;
}

String _maskAmbiguousSupportedItemWords(
  String text, {
  bool maskUppercase = false,
}) => text.replaceAllMapped(
  RegExp(
    r'(?<![\p{L}\p{N}])(?:rub|try)(?![\p{L}])',
    caseSensitive: false,
    unicode: true,
  ),
  (match) {
    final token = match.group(0)!;
    return token == token.toUpperCase() && !maskUppercase
        ? token
        : ' ' * token.length;
  },
);

// Bounded CLDR currency-code vocabulary for provisional unsupported OCR
// evidence. These codes never expand the app or API currency policy.
const _knownUnsupportedIsoCurrencyCodes = <String>{
  'ADP',
  'AFA',
  'AFN',
  'ALK',
  'ALL',
  'AMD',
  'ANG',
  'AOA',
  'AOK',
  'AON',
  'AOR',
  'ARA',
  'ARL',
  'ARM',
  'ARP',
  'ARS',
  'ATS',
  'AWG',
  'AZM',
  'AZN',
  'BAD',
  'BAM',
  'BAN',
  'BBD',
  'BDT',
  'BEC',
  'BEF',
  'BEL',
  'BGL',
  'BGM',
  'BGN',
  'BGO',
  'BIF',
  'BMD',
  'BND',
  'BOB',
  'BOL',
  'BOP',
  'BOV',
  'BRB',
  'BRC',
  'BRE',
  'BRN',
  'BRR',
  'BRZ',
  'BSD',
  'BTN',
  'BUK',
  'BWP',
  'BYB',
  'BYN',
  'BYR',
  'BZD',
  'CDF',
  'CHE',
  'CHW',
  'CLE',
  'CLF',
  'CLP',
  'CNH',
  'CNX',
  'COP',
  'COU',
  'CRC',
  'CSD',
  'CSK',
  'CUC',
  'CUP',
  'CVE',
  'CYP',
  'CZK',
  'DDM',
  'DEM',
  'DJF',
  'DKK',
  'DOP',
  'DZD',
  'ECS',
  'ECV',
  'EEK',
  'EGP',
  'ERN',
  'ESA',
  'ESB',
  'ESP',
  'ETB',
  'FIM',
  'FJD',
  'FKP',
  'FRF',
  'GEK',
  'GEL',
  'GHC',
  'GHS',
  'GIP',
  'GMD',
  'GNF',
  'GNS',
  'GQE',
  'GRD',
  'GTQ',
  'GWE',
  'GWP',
  'GYD',
  'HNL',
  'HRD',
  'HRK',
  'HTG',
  'HUF',
  'IDR',
  'IEP',
  'ILP',
  'ILR',
  'ILS',
  'IQD',
  'IRR',
  'ISJ',
  'ISK',
  'ITL',
  'JMD',
  'JOD',
  'KES',
  'KGS',
  'KHR',
  'KMF',
  'KPW',
  'KRH',
  'KRO',
  'KYD',
  'KZT',
  'LAK',
  'LBP',
  'LKR',
  'LRD',
  'LSL',
  'LTL',
  'LTT',
  'LUC',
  'LUF',
  'LUL',
  'LVL',
  'LVR',
  'LYD',
  'MAD',
  'MAF',
  'MCF',
  'MDC',
  'MDL',
  'MGA',
  'MGF',
  'MKD',
  'MKN',
  'MLF',
  'MMK',
  'MNT',
  'MOP',
  'MRO',
  'MRU',
  'MTL',
  'MTP',
  'MUR',
  'MVP',
  'MVR',
  'MWK',
  'MXP',
  'MXV',
  'MYR',
  'MZE',
  'MZM',
  'MZN',
  'NAD',
  'NGN',
  'NIC',
  'NIO',
  'NLG',
  'NPR',
  'OMR',
  'PAB',
  'PEI',
  'PEN',
  'PES',
  'PGK',
  'PHP',
  'PLZ',
  'PTE',
  'PYG',
  'QAR',
  'RHD',
  'ROL',
  'RON',
  'RSD',
  'RUR',
  'RWF',
  'SAR',
  'SBD',
  'SCR',
  'SDD',
  'SDG',
  'SDP',
  'SHP',
  'SIT',
  'SKK',
  'SLE',
  'SLL',
  'SOS',
  'SRD',
  'SRG',
  'SSP',
  'STD',
  'STN',
  'SUR',
  'SVC',
  'SYP',
  'SZL',
  'TJR',
  'TJS',
  'TMM',
  'TMT',
  'TND',
  'TOP',
  'TPE',
  'TRL',
  'TTD',
  'TZS',
  'UAH',
  'UAK',
  'UGS',
  'UGX',
  'USN',
  'USS',
  'UYI',
  'UYP',
  'UYU',
  'UYW',
  'UZS',
  'VEB',
  'VED',
  'VEF',
  'VES',
  'VNN',
  'VUV',
  'WST',
  'XAF',
  'XAG',
  'XAU',
  'XBA',
  'XBB',
  'XBC',
  'XBD',
  'XCD',
  'XDR',
  'XEU',
  'XFO',
  'XFU',
  'XOF',
  'XPD',
  'XPF',
  'XPT',
  'XRE',
  'XSU',
  'XTS',
  'XUA',
  'XXX',
  'YDD',
  'YER',
  'YUD',
  'YUM',
  'YUN',
  'YUR',
  'ZAL',
  'ZAR',
  'ZMK',
  'ZMW',
  'ZRN',
  'ZRZ',
  'ZWD',
  'ZWL',
  'ZWR',
};

// These currency codes also read as ordinary item words when OCR emits mixed
// or lowercase text. Their letter case alone cannot turn a product word into
// a foreign monetary marker; uppercase printed code still counts as evidence.
const _ambiguousLowercaseIsoCurrencyWords = <String>{
  'ALL',
  'BAD',
  'BAN',
  'BOB',
  'BOL',
  'COP',
  'CUP',
  'GEL',
  'MAD',
  'MOP',
  'PEN',
  'TOP',
  'TRY',
};
Iterable<RegExpMatch> _unsupportedIsoCurrencyMarkers(String text) sync* {
  for (final match in RegExp(
    r'(?<![\p{L}\p{N}])([A-Za-z]{3})(?![\p{L}])',
    unicode: true,
  ).allMatches(text)) {
    final code = match.group(1)!.toUpperCase();
    if (_knownUnsupportedIsoCurrencyCodes.contains(code) &&
        (match.group(1) == code ||
            !_ambiguousLowercaseIsoCurrencyWords.contains(code)) &&
        !_nonCurrencyAdjustmentCodes.contains(code)) {
      yield match;
    }
  }
}

String? _unsupportedIsoCodeAdjacentToSelectedAmount(String text) {
  final amount = RegExp(_amountTokenPattern).allMatches(text).lastOrNull;
  if (amount == null) return null;
  for (final marker in _unsupportedIsoCurrencyMarkers(text)) {
    if (marker.end <= amount.start &&
        RegExp(
          r'^\s*[:=]?\s*$',
        ).hasMatch(text.substring(marker.end, amount.start))) {
      return marker.group(1)!.toUpperCase();
    }
    if (marker.start >= amount.end &&
        text.substring(amount.end, marker.start).trim().isEmpty) {
      return marker.group(1)!.toUpperCase();
    }
  }
  return null;
}

bool _hasUnsupportedIsoMonetaryEvidence(String text) =>
    _unsupportedIsoCurrencyMarkers(
      text,
    ).any((marker) => _currencyMarkerTouchesAmount(text, marker));

bool _currencyMarkerTouchesAmount(String text, RegExpMatch marker) {
  final before = text.substring(0, marker.start);
  final after = text.substring(marker.end);
  final afterMarker = after.trimLeft();
  final markerEndsAmount =
      afterMarker.isEmpty || RegExp(r'^[/:,;|)=+\]\-]').hasMatch(afterMarker);
  final followingAmount = RegExp(
    '^\\s*[:=]?\\s*$_amountTokenPattern',
  ).firstMatch(after);
  final afterFollowingAmount = followingAmount == null
      ? null
      : after.substring(followingAmount.end).trimLeft();
  final markerText = marker.group(0)!;
  final printedSymbolOrAbbreviation =
      !RegExp(r'^[A-Za-z]+$').hasMatch(markerText) ||
      RegExp(r'^(?:kr|Rs)$', caseSensitive: false).hasMatch(markerText);
  // Adjacent bare numbers may be quantities. Printed symbols, abbreviations,
  // and uppercase codes give monetary evidence; title-case words do not.
  final firstAmountLooksMonetary =
      followingAmount != null &&
      (printedSymbolOrAbbreviation || markerText == markerText.toUpperCase());
  final amountEndsCell =
      afterFollowingAmount != null &&
      (afterFollowingAmount.isEmpty ||
          RegExp(r'^[/:,;|)=+\]\-.]').hasMatch(afterFollowingAmount) ||
          (firstAmountLooksMonetary &&
              RegExp(
                '^(?:and|plus|or|vs\\.?|versus|to)\\s+'
                '$_currencyTokenPattern\\s*$_amountTokenPattern',
                caseSensitive: false,
                unicode: true,
              ).hasMatch(afterFollowingAmount)) ||
          (firstAmountLooksMonetary &&
              RegExp(
                '^(?:$_currencyTokenPattern\\s*)?$_amountTokenPattern',
                caseSensitive: false,
                unicode: true,
              ).hasMatch(afterFollowingAmount)));
  final precedingAmount = RegExp(
    '($_amountTokenPattern)\\s*[:=]?\\s*\$',
  ).firstMatch(before);
  final trailingMarkerHasMonetaryAmount =
      precedingAmount != null &&
      (precedingAmount.group(1)!.contains('.') ||
          precedingAmount.group(1)!.contains(',') ||
          printedSymbolOrAbbreviation) &&
      (printedSymbolOrAbbreviation || markerText == markerText.toUpperCase()) &&
      RegExp(
        '^\\s*(?:$_currencyTokenPattern\\s*)?$_amountTokenPattern',
        caseSensitive: false,
        unicode: true,
      ).hasMatch(after);
  final trailingMarkerHasWordSeparatedAmount =
      precedingAmount != null &&
      (printedSymbolOrAbbreviation || markerText == markerText.toUpperCase()) &&
      RegExp(
        '^(?:and|plus|or|vs\\.?|versus|to)\\s+'
        '$_currencyTokenPattern\\s*$_amountTokenPattern',
        caseSensitive: false,
        unicode: true,
      ).hasMatch(after.trimLeft());
  return (markerEndsAmount && precedingAmount != null) ||
      amountEndsCell ||
      trailingMarkerHasMonetaryAmount ||
      trailingMarkerHasWordSeparatedAmount;
}

String? _currencyAdjacentToSelectedAmountWithYen(String text) {
  return _currencyAdjacentToSelectedAmount(text, null).currency;
}

Iterable<RegExpMatch> _printedCurrencyMarkerMatches(String text) sync* {
  yield* RegExp(
    '(?<![\\p{L}\\p{N}])($_currencyTokenPattern)(?![\\p{L}])',
    caseSensitive: false,
    unicode: true,
  ).allMatches(text);
  // A supported printed marker can touch its earlier amount. The following
  // monetary-context check excludes a bare code embedded in product/SKU text.
  yield* RegExp(
    '(?<=\\d)($_currencyTokenPattern)(?![\\p{L}\\p{N}])',
    caseSensitive: false,
    unicode: true,
  ).allMatches(text);
}

({String? currency, bool hasExplicitEvidence})
_currencyAdjacentToSelectedAmount(
  String text,
  String? receiptCurrency, {
  bool allowPriorCurrencyConflict = false,
}) {
  final amount = RegExp(_amountTokenPattern).allMatches(text).lastOrNull;
  if (amount == null) return (currency: null, hasExplicitEvidence: false);
  final before = text.substring(0, amount.start).trimRight();
  final after = text.substring(amount.end).trimLeft();
  final preceding = RegExp(
    '(?<![\\p{L}\\p{N}])($_currencyTokenPattern)\\s*[:=]?\\s*[+−]?\\s*\$',
    caseSensitive: false,
    unicode: true,
  ).firstMatch(before);
  final following = RegExp(
    '^\\s*[:=]?\\s*($_currencyTokenPattern)(?![\\p{L}])',
    caseSensitive: false,
    unicode: true,
  ).firstMatch(after);
  String? resolve(String? token) {
    if (token == null) return null;
    if (token.toLowerCase() == 'kr') {
      return const {'SEK', 'NOK', 'DKK'}.contains(receiptCurrency)
          ? receiptCurrency
          : null;
    }
    if (token.toLowerCase() == 'rs') {
      return const {'INR', 'PKR'}.contains(receiptCurrency)
          ? receiptCurrency
          : null;
    }
    if (token == '¥') {
      return receiptCurrency == 'JPY' || receiptCurrency == 'CNY'
          ? receiptCurrency
          : '¥';
    }
    if (token == r'$') {
      if (!_currencyCompatibleWithBareDollar(receiptCurrency)) return null;
      if (allowPriorCurrencyConflict) return receiptCurrency;
      final hasConflictingDenomination = _printedCurrencyMarkerMatches(text)
          .any((match) {
            final otherMarker = match.group(1);
            if (otherMarker == r'$' ||
                !_currencyMarkerTouchesAmount(text, match)) {
              return false;
            }
            final otherCurrency = otherMarker == '¥'
                ? (receiptCurrency == 'JPY' || receiptCurrency == 'CNY'
                      ? receiptCurrency
                      : '¥')
                : _currencyFromItemToken(otherMarker);
            return otherCurrency != receiptCurrency;
          });
      return hasConflictingDenomination ? null : receiptCurrency;
    }
    return _currencyFromItemToken(token);
  }

  final left = resolve(preceding?.group(1));
  final right = resolve(following?.group(1));
  final selectedTokens = preceding != null || following != null;
  if (preceding != null &&
      following != null &&
      (left == null || right == null || left != right)) {
    return (currency: null, hasExplicitEvidence: true);
  }
  if (selectedTokens) {
    return (currency: left ?? right, hasExplicitEvidence: true);
  }
  final otherPrintedCurrency = _printedCurrencyMarkerMatches(
    text,
  ).any((match) => _currencyMarkerTouchesAmount(text, match));
  return (currency: null, hasExplicitEvidence: otherPrintedCurrency);
}

bool _isContextualReceiptMetadataLine(List<String> lines, int index) {
  final line = lines[index];
  if (_isReceiptMetadataLine(line)) return true;
  if (!_isCityPostalLine(line) || index == 0) return false;
  var addressIndex = index - 1;
  while (addressIndex >= 0 && _isAddressContinuationLine(lines[addressIndex])) {
    addressIndex -= 1;
  }
  return addressIndex >= 0 && _isStreetAddressLine(lines[addressIndex]);
}

bool _isStreetAddressLine(String line) => RegExp(
  r'\b\d{1,6}\s+[\w\s.#-]+\b(st|street|rd|road|ave|avenue|blvd|boulevard|lane|ln|drive|dr|way|plaza|building|tower|floor|fl|unit|suite|shop|room|rm)\b',
  caseSensitive: false,
).hasMatch(line);

bool _isCityPostalLine(String line) => RegExp(
  r"^[a-z][a-z .'-]{1,40}\s+\d{5}(?:-\d{4})?$",
  caseSensitive: false,
).hasMatch(line.trim());

bool _isAddressContinuationLine(String line) => RegExp(
  r'^\s*(room|rm|suite|unit|shop|floor|fl|level|lvl|block|blk|building|bldg|tower)\b\s*[#-]?\s*(?:[a-z]?\d[\w-]*|[a-z])\s*$',
  caseSensitive: false,
).hasMatch(line.trim());

bool _isReceiptMetadataLine(String line, {bool allowBarePostal = true}) {
  final normalized = line.toLowerCase().trim();
  if (normalized.isEmpty) {
    return true;
  }
  if (_isReceiptCourtesyLine(line)) return true;
  if (_isDateOrTimeOnlyLine(normalized)) {
    return true;
  }
  if (_isPrintedTaxContextHeader(line)) return true;
  if (RegExp(
    r"^([a-z][a-z .'-]{1,40},\s*[a-z]{2}\s+\d{5}(?:-\d{4})?)(?:\s+\1)+$",
    caseSensitive: false,
  ).hasMatch(normalized)) {
    return true;
  }
  if (RegExp(
    r'\bdue\s+date\s*[:：]\s*(?:[a-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})\s*$',
    caseSensitive: false,
  ).hasMatch(normalized)) {
    return true;
  }

  final metadataPatterns = [
    RegExp(
      r'\b\d{1,6}\s+[\w\s.#-]+\b(st|street|rd|road|ave|avenue|blvd|boulevard|lane|ln|drive|dr|way|plaza|building|tower|floor|fl|unit|suite|shop|room|rm)\b',
    ),
    RegExp(
      r'\b(room|rm|suite|unit|shop|floor|fl|level|lvl|block|blk|building|bldg|tower)\b\s*[#-]?\s*(?:[a-z]?\d[\w-]*|[a-z])\b',
    ),
    RegExp(r'\b\d{1,2}\s*/\s*f\b'),
    RegExp(r'\b(p\.?\s*o\.?\s*box|po box)\b'),
    RegExp(r'\b(zip|postal|postcode)\s*[:#-]?\s*[a-z0-9 -]{3,10}\b'),
    RegExp(r"^[a-z .'-]+,\s*[a-z]{2}\s+\d{5}(?:-\d{4})?$"),
    // Bare postal lines remain metadata. A priced product description can
    // have the same shape, so it needs an explicit comma to count as address.
    RegExp(
      allowBarePostal
          ? r"^[a-z .'-]+,?\s+[a-z]{2,3}\s+\d{4,5}(?:-\d{4})?$"
          : r"^[a-z .'-]+,\s*[a-z]{2,3}\s+\d{4,5}(?:-\d{4})?$",
    ),
    RegExp(
      allowBarePostal
          ? r"^[a-z .'-]+,?\s+[a-z]{2}\s+[a-z]\d[a-z]\s?\d[a-z]\d$"
          : r"^[a-z .'-]+,\s*[a-z]{2}\s+[a-z]\d[a-z]\s?\d[a-z]\d$",
    ),
    RegExp(
      r"^[a-z .'-]+\b(?:road|street|avenue|ave|lane|drive|boulevard|blvd)\b,\s*[a-z .'-]+\s+\d{4,6}$",
    ),
    RegExp(
      r'^\s*(date|dated|issued|printed|reprinted)\s*[:#-]?\s*\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\b',
    ),
    RegExp(
      r'^\s*(?:(?:(?:current|previous|prior|present|last)\s+)?(?:meter\s+)?reading|(?:meter|account|customer|reference)\s+(?:number|no|id))(?:\s*\([^)]{1,20}\))?\s*[:#-]?\s*\d+(?:[.,]\d+)*\s*$',
    ),
    RegExp(
      r'^\s*(?:(?:previous|prior|last|refund|reference|payment|paid)\s+)?(?:bill|invoice|statement|transaction|order|purchase|due|payment|refund|service|billing)\s+date\s*[:#-]?\s*(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|[a-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})\s*$',
    ),
    RegExp(r'\b(tel|phone|fax|whatsapp|mobile|contact)\b'),
    RegExp(r'\b(?:\+?\d[\d ()-]{6,}\d)\b(?![.,]\d)'),
    RegExp(r'\b(www\.|https?://|\.com\b|\.net\b|\.org\b|\.hk\b|@[\w.-]+\.)'),
    RegExp(r'\b(email|instagram|facebook|wechat|line id|twitter|xhs)\b'),
    RegExp(
      r'^\s*(?:qty|quantity)\b.*\b(?:item|description|product|price|amount|total)\b',
    ),
    RegExp(r'\b(tax\s*id|tin|gst\s*no|vat\s*no|business\s*no|br\s*no)\b'),
    RegExp(r'^\s*strn\s*[:#-]?\s*\d{6,15}\s*$'),
    RegExp(r'^\s*(invoice|receipt|check|cheque|ticket)\s*(no|#|number|num)?\b'),
    RegExp(
      r'\b(table|tbl|branch|cashier|server|staff|register|reg|terminal|term|till|pos|order|ord|reference|ref)\b\s*[:#-]?\s*[a-z0-9-]+\b',
    ),
    // A word after "Store" can be a priced product or promotion. A printed
    // store identifier needs an actual identifier shape before it is metadata.
    RegExp(r'\bstore\b\s*[:#-]?\s*[a-z0-9-]*\d[a-z0-9-]*\b'),
    RegExp(r'\b(open|close|closed|served|powered by|welcome|visit again)\b'),
  ];

  return metadataPatterns.any((pattern) => pattern.hasMatch(normalized));
}

bool _isPrintedTaxContextHeader(String line) {
  final normalized = line.toLowerCase().trim();
  return RegExp(
        r'^(?:moms|mva)\s+\d{1,2}(?:[.,]\d{1,2})?\s*%$',
      ).hasMatch(normalized) ||
      RegExp(r'^gstin\s*[:#-]?\s*[a-z0-9]{15}$').hasMatch(normalized) ||
      RegExp(r'^strn\s*[:#-]?\s*\d{6,15}$').hasMatch(normalized) ||
      RegExp(
        r'^(?:abn|acn|nzbn|ruc|rfc|(?:gst|hst|vat|tax)\s*(?:reg(?:istration)?|id|no|number))\s*[:#-]?\s*[a-z0-9][a-z0-9\s-]{3,}$',
      ).hasMatch(normalized) ||
      RegExp(
        r'^(?:(?:sales\s+)?tax|vat|gst|hst|iva)\s+(?:applies|included|incluido|inclusive|applied)$',
      ).hasMatch(normalized);
}

bool _isLikelyNonItemDescription(String description, {bool pricedRow = false}) {
  final normalized = description.toLowerCase().trim();
  if (normalized.isEmpty ||
      _isReceiptMetadataLine(description, allowBarePostal: !pricedRow)) {
    return true;
  }

  final metadataOnlyPatterns = [
    RegExp(r'\b(address|location|merchant|customer\s*copy)\b'),
    RegExp(r'\b(?:g|lg|ug|b)?/?f\b|\b(ground|basement|lower|upper)\s+floor\b'),
    RegExp(
      r'\b(?:mall|plaza|arcade|centre|center|tower|building|bldg|hotel|terminal|station)\b$',
    ),
    RegExp(
      r'\b(?:mall|plaza|arcade|centre|center|tower|building|bldg)\s+(?:hong\s+kong|hk|kowloon|central|causeway\s+bay|tsim\s+sha\s+tsui)\b',
    ),
    RegExp(
      r'^(?:hong\s+kong|hk|kowloon|central|causeway\s+bay|tsim\s+sha\s+tsui)\b',
    ),
  ];

  return metadataOnlyPatterns.any((pattern) => pattern.hasMatch(normalized));
}

bool _isDateOrTimeOnlyLine(String normalized) {
  final compact = normalized
      .replaceAll(RegExp(r'\b(am|pm)\b'), '')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
  return RegExp(r'^\d{1,2}[:.]\d{2}(?::\d{2})?$').hasMatch(compact) ||
      RegExp(r'^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$').hasMatch(compact) ||
      RegExp(r'^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$').hasMatch(compact) ||
      RegExp(
        r'^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}[:.]\d{2}(?::\d{2})?$',
      ).hasMatch(compact) ||
      RegExp(
        r'^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\s+\d{1,2}[:.]\d{2}(?::\d{2})?$',
      ).hasMatch(compact);
}

bool _hasTraceableItemAmountToken(String line, String amountToken) {
  // Flattened columns can end in an administrative date. Its year (or day)
  // is not an item price, even when another column contains descriptive copy.
  // A separate amount cell can still be recovered by the layout fallback.
  const calendarDate =
      r'(?:[a-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}|'
      r'\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|'
      r'\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})';
  final administrativeDate = RegExp(
    r'\b(?:(?:bill|invoice|statement|payment|due|service|order)\s+date|'
    r'billing\s+period)\s*[:#-]?\s*'
    '$calendarDate(?:\\s*[-–—]\\s*$calendarDate)?\\s*\$',
    caseSensitive: false,
  ).firstMatch(line);
  if (administrativeDate != null &&
      line.lastIndexOf(amountToken) >= administrativeDate.start) {
    return false;
  }

  // A product/SKU suffix such as USD123 is not printed monetary evidence.
  // Adjacent alphabetic currency markers are too ambiguous to promote into
  // an item amount; explicit symbols and separated codes remain usable.
  if (RegExp(
    '(?<![A-Za-z0-9])(?:${_supportedCurrencyCodes.join('|')}|Rs|kr)'
    '${RegExp.escape(amountToken)}(?:\\s+(?:$_currencyTokenPattern))?\\s*\$',
    caseSensitive: false,
  ).hasMatch(line)) {
    return false;
  }
  final normalizedToken = _normalizeAmount(amountToken);
  if (normalizedToken == null) {
    return false;
  }

  if (normalizedToken.contains('.')) {
    return true;
  }

  final tokenValue = int.tryParse(normalizedToken);
  if (tokenValue == null) {
    return false;
  }

  if (tokenValue >= 10) {
    return true;
  }

  return RegExp(
    '($_currencyTokenPattern)',
    caseSensitive: false,
  ).hasMatch(line);
}

bool _hasSubtotalLabel(String line, String normalized) {
  return _hasEnglishReceiptLabel(
        normalized,
        RegExp(r'\bsub[\s-]?total\b', caseSensitive: false),
      ) ||
      _hasJapaneseReceiptLabel(line, const ['小計']) ||
      _hasLocalizedReceiptLabel(line, const [
        'المجموع الفرعي',
        '小计',
        '小計',
        '소계',
        'उप-योग',
        'उपयोग',
        'ยอดรวมย่อย',
        'Подытог',
        'подытог',
        'Sous-total',
        'Zwischensumme',
        'Suma',
        'Ara toplam',
        'Tạm tính',
      ]);
}

bool _hasTaxLabel(
  String line,
  String normalized, {
  bool allowDescriptiveTaxLabel = false,
}) {
  return _hasEnglishReceiptLabel(
        normalized,
        RegExp(
          r'\b(?:(?:city|state|local|county|municipal|tourist|tourism|occupancy)\s+tax|sales\s+tax|tax|vat|gst|hst|iva|tva|kdv|mwst)\b\.?',
          caseSensitive: false,
        ),
      ) ||
      (_isPostSubtotalAdjustmentLine(
            line,
            allowDescriptiveTaxLabel: allowDescriptiveTaxLabel,
            taxOnly: true,
          ) &&
          RegExp(r'\btax\b', caseSensitive: false).hasMatch(normalized) &&
          (allowDescriptiveTaxLabel || _hasExplicitTaxRate(line))) ||
      _hasJapaneseReceiptLabel(line, const ['消費税', '税']) ||
      _hasLocalizedReceiptLabel(line, const [
        'الضريبة',
        '税额',
        '稅額',
        '부가세',
        'जीएसटी',
        'कर',
        'ภาษี',
        'НДС',
        'ндс',
        'Thuế',
      ]);
}

bool _hasServiceChargeLabel(String line, String normalized) {
  return _hasEnglishReceiptLabel(
        normalized,
        RegExp(r'\bservice\s*(charge|fee)?\b', caseSensitive: false),
      ) ||
      _hasJapaneseReceiptLabel(line, const ['サービス料']) ||
      _hasLocalizedReceiptLabel(line, const [
        '服務費',
        '服务费',
        '서비스료',
        'सेवा शुल्क',
        'ค่าบริการ',
        'Сервисный сбор',
        'сервисный сбор',
      ]);
}

bool _hasActualTipChargeLabel(String line, String normalized) {
  if (_isSuggestedTipLine(normalized)) return false;
  final labelPattern = RegExp(
    r'\b(?:actual\s+tip|gratuity|tip)\b',
    caseSensitive: false,
  );
  return _hasEnglishReceiptLabel(normalized, labelPattern) ||
      _hasEnglishReceiptLabel(
        _withoutBoundedExplicitCurrencyCode(line).toLowerCase(),
        labelPattern,
      );
}

bool _isSuggestedTipLine(String normalized) => RegExp(
  r'\b(?:suggested|optional|recommended)\s+tip\b',
).hasMatch(normalized);

bool _isPrintedSuggestedTipOptionLine(String line) => RegExp(
  '^\\s*(?:suggested|optional|recommended)\\s+tip\\s+'
  '\\d{1,3}(?:[.,]\\d{1,2})?\\s*%\\s+'
  '(?:$_currencyTokenPattern)?\\s*$_amountTokenPattern'
  '(?:\\s*(?:$_currencyTokenPattern))?\\s*\$',
  caseSensitive: false,
).hasMatch(line);

bool _isWrappedItemDescriptionCandidate(String description) {
  if (description.length < 2 ||
      _lineHasAmount(description) ||
      _isChargeTableHeader(description) ||
      _isAdministrativeLine(description) ||
      _isReceiptMetadataLine(description) ||
      _isLikelyNonItemDescription(description)) {
    return false;
  }
  return _unicodeLetterPattern.allMatches(description).length >= 2;
}

bool _isStrongWrappedItemDescription(String description) {
  final words = description
      .split(RegExp(r'\s+'))
      .where((word) => _unicodeLetterPattern.hasMatch(word))
      .toList(growable: false);
  final letters = description.replaceAll(
    RegExp(r'[^\p{L}]', unicode: true),
    '',
  );
  final hasCasedLetters = letters.toLowerCase() != letters.toUpperCase();
  if (hasCasedLetters) {
    if (words.length < 3 || description.length < 12) return false;
    if (letters == letters.toUpperCase()) return false;
    if (!words.every(_isTitleCaseContinuationWord)) return false;
  } else if (_unicodeLetterPattern.allMatches(letters).length < 6) {
    // Scripts such as Arabic, Thai, and Han do not have letter case and may
    // not use spaces between words. Require enough letters instead of a
    // Latin-style word count while retaining the administrative-line guard.
    return false;
  }
  return !RegExp(
    r'^(?:item|description|item description|product|product description|details)$',
    caseSensitive: false,
  ).hasMatch(description.trim());
}

bool _isTitleCaseContinuationWord(String word) {
  final letters = word.replaceAll(RegExp(r'[^\p{L}]', unicode: true), '');
  if (letters.isEmpty) return true;
  final first = String.fromCharCode(letters.runes.first);
  return first == first.toUpperCase() && first != first.toLowerCase();
}

bool _hasSubstantiveItemDescription(String description) {
  final letters = description.runes
      .where(
        (rune) => _unicodeLetterPattern.hasMatch(String.fromCharCode(rune)),
      )
      .toList(growable: false);
  if (letters.length >= 2) return true;
  // A single Han, Hangul, Kana, or other non-ASCII letter can be a complete
  // product name; retain it when a traceable price is present.
  return letters.length == 1 && letters.single > 0x7f;
}

bool _isUppercaseOrganizationSegment(String value) {
  final letters = value.replaceAll(RegExp(r'[^\p{L}]', unicode: true), '');
  return letters.length >= 3 &&
      letters.toUpperCase() == letters &&
      letters.toLowerCase() != letters;
}

String _foldOrganizationSegment(String value) =>
    value.toLowerCase().replaceAll(RegExp(r'[^\p{L}\p{N}]', unicode: true), '');

double _blockCenterX(ReceiptOcrBlockEvidence block) {
  final xs = block.points.map((point) => point.x);
  return (xs.reduce((a, b) => a < b ? a : b) +
          xs.reduce((a, b) => a > b ? a : b)) /
      2;
}

Set<int> _leadingQuantityColumnRows(
  List<String> lines,
  List<List<ReceiptOcrBlockEvidence>> layoutRows,
) {
  final accepted = <int>{};
  final run = <({int index, double centerX})>[];
  void finishRun() {
    final firstIndex = run.isEmpty ? 0 : run.first.index;
    final headerStart = firstIndex > 10 ? firstIndex - 10 : 0;
    final hasQuantityHeader = lines
        .sublist(headerStart, firstIndex)
        .any(
          (line) => RegExp(
            r'^\s*(?:qty|quantity)\b.*\b(?:item|description|product|price|amount|total)\b',
            caseSensitive: false,
          ).hasMatch(line),
        );
    if (hasQuantityHeader &&
        run.isNotEmpty &&
        run.map((entry) => entry.centerX).reduce((a, b) => a < b ? a : b) +
                12 >=
            run.map((entry) => entry.centerX).reduce((a, b) => a > b ? a : b)) {
      accepted.addAll(run.map((entry) => entry.index));
    }
    run.clear();
  }

  for (var index = 0; index < lines.length; index++) {
    final line = lines[index];
    final match = RegExp(r'^(\d{1,2})\s+').firstMatch(line);
    final row = index < layoutRows.length
        ? layoutRows[index]
        : const <ReceiptOcrBlockEvidence>[];
    if (match == null ||
        !_isPricedItemLine(line) ||
        row.length < 3 ||
        row.first.text.trim() != match.group(1) ||
        row.first.points.length != 4 ||
        row[1].points.length != 4) {
      finishRun();
      continue;
    }
    final quantityPoints = row.first.points;
    final descriptionPoints = row[1].points;
    final quantityRight = quantityPoints
        .map((point) => point.x)
        .reduce((a, b) => a > b ? a : b);
    final descriptionLeft = descriptionPoints
        .map((point) => point.x)
        .reduce((a, b) => a < b ? a : b);
    if (quantityRight >= descriptionLeft) {
      finishRun();
      continue;
    }
    final quantityLeft = quantityPoints
        .map((point) => point.x)
        .reduce((a, b) => a < b ? a : b);
    run.add((index: index, centerX: (quantityLeft + quantityRight) / 2));
  }
  finishRun();
  return accepted;
}

bool _isPricedItemLine(String line) {
  if (_isAdministrativeLine(line) || _isReceiptMetadataLine(line)) {
    return false;
  }
  final match = RegExp(
    '^(.+?)\\s+($_currencyTokenPattern)?\\s*'
    '($_amountTokenPattern)'
    '(?:\\s*(?:$_currencyTokenPattern))?\$',
    caseSensitive: false,
  ).firstMatch(line);
  if (match == null) return false;
  final description = _cleanDescription(match.group(1)!);
  return _hasSubstantiveItemDescription(description) &&
      !_isLikelyNonItemDescription(description) &&
      _hasTraceableItemAmountToken(line, match.group(3)!);
}

bool _hasShippingLabel(
  String line,
  String normalized, {
  bool allowParenthesizedMethod = false,
}) {
  final labelPattern = RegExp(
    r'\b(shipping|delivery)(?:\s+(?:fee|charge)|\s*(?:(?:&|and)\s*)?handling(?:\s+(?:fee|charge))?)?\b',
    caseSensitive: false,
  );
  return _hasEnglishReceiptLabel(normalized, labelPattern) ||
      (allowParenthesizedMethod &&
          _hasEnglishReceiptLabel(
            normalized.replaceFirstMapped(
              RegExp(
                r'\b(shipping|delivery)\s*\((?:standard|express|priority|ground|overnight|economy|expedited|tracked|local|international|same[ -]day|next[ -]day)\)',
                caseSensitive: false,
              ),
              (match) => match.group(1)!,
            ),
            labelPattern,
          )) ||
      _hasEnglishReceiptLabel(
        _withoutBoundedExplicitCurrencyCode(line).toLowerCase(),
        labelPattern,
      );
}

String _withoutBoundedExplicitCurrencyCode(String line) {
  return line
      .replaceAll(
        RegExp(r'(?<![A-Za-z])([A-Z]{3})(?![A-Za-z])(?=\s*[:=]?\s*[+-]?\s*\d)'),
        ' ',
      )
      .replaceAll(RegExp(r'(?<=\d)\s*([A-Z]{3})(?![A-Za-z])'), ' ');
}

bool _hasDiscountLabel(String line, String normalized) {
  return _hasEnglishReceiptLabel(
        normalized,
        RegExp(r'\b(discount|coupon)\b', caseSensitive: false),
      ) ||
      (_lastAmountInLine(line)?.startsWith('-') == true &&
          _isLabeledStandaloneMoneyLine(
            line,
            RegExp(r'^(?:promotion|promo)\b', caseSensitive: false),
          )) ||
      (_lastAmountInLine(line)?.startsWith('-') == true &&
          _hasEnglishReceiptLabel(
            normalized,
            RegExp(
              r'\b(?:(?:store|loyalty|member|promo(?:tional)?|voucher|reward|basket|order)\s+(?:coupon|discount)|promo\s+code)\b',
              caseSensitive: false,
            ),
          )) ||
      _hasJapaneseReceiptLabel(line, const ['割引', '値引']);
}

bool _isPrimaryTotalCurrencyLine(String line, String normalized) {
  if (RegExp(r'^\s*payment\s+due\b').hasMatch(normalized) &&
      _hasTotalLabel(line, normalized)) {
    return true;
  }
  if (RegExp(
    r'\b(payment|tender|cash|change|previous|prior|reference)\b',
  ).hasMatch(normalized)) {
    return false;
  }
  return _hasTotalLabel(line, normalized) ||
      (RegExp(
            r'^\s*(?:grand\s+total|total\s+(?:amount\s+)?due|total|amount\s+due|balance\s+due)\b',
          ).hasMatch(normalized) &&
          (RegExp(_amountTokenPattern).allMatches(line).length > 1 ||
              _attachedSupportedCodeOnSelectedAmount(line) != null));
}

const _englishTotalLabels = [
  'total amount due',
  'total due',
  'total current charges',
  'refund total',
  'total paid',
  'paid total',
  'grand total',
  'amount due',
  'balance due',
  'payment due',
  'total',
];
const _localizedTotalLabels = [
  'الإجمالي',
  '合计',
  '總計',
  '합계',
  'कुल',
  'ยอดสุทธิ',
  'Итого',
  'итого',
  'Gesamt',
  'Razem',
  'Toplam',
  'Tổng',
];

bool _hasTotalLabel(String line, String normalized) {
  return _hasEnglishReceiptLabel(
        normalized,
        RegExp(
          '\\b(${_englishTotalLabels.map((label) => label.replaceAll(' ', r'\s+')).join('|')})\\b',
          caseSensitive: false,
        ),
      ) ||
      _hasJapaneseReceiptLabel(line, const ['合計']) ||
      _hasLocalizedReceiptLabel(line, _localizedTotalLabels);
}

bool _hasPriorityTotalLabel(String line) {
  const label =
      r'(?:total\s+(?:amount\s+)?due|grand\s+total|balance\s+due|amount\s+due)';
  if (_hasEnglishReceiptLabel(line.toLowerCase(), RegExp('\\b$label\\b'))) {
    return true;
  }
  // A total can show several currency amounts. Each extra amount needs its
  // own currency marker: a bare edition year is not another monetary cell.
  final prefix = RegExp(
    '^\\s*$label\\b',
    caseSensitive: false,
  ).firstMatch(line);
  if (prefix == null) return false;
  const separators = r'[\s:=/|;,&()\[\]]';
  final separatorPattern = RegExp('$separators+');
  final cellPattern = RegExp(
    '(?:(?:$_currencyTokenPattern)\\s*[:=]?\\s*\\+?\\s*$_amountTokenPattern'
    '|\\+?\\s*$_amountTokenPattern\\s*[:=]?\\s*(?:$_currencyTokenPattern))'
    '(?=$separators|\$)',
    caseSensitive: false,
  );
  var offset = prefix.end;
  var cells = 0;
  while (offset < line.length) {
    offset = separatorPattern.matchAsPrefix(line, offset)?.end ?? offset;
    if (offset == line.length) break;
    final cell = cellPattern.matchAsPrefix(line, offset);
    if (cell == null) return false;
    cells++;
    offset = cell.end;
  }
  return cells > 0;
}

bool _hasEnglishReceiptLabel(String normalized, RegExp labelPattern) {
  final label = labelPattern.firstMatch(normalized);
  if (label == null) {
    return false;
  }

  final amounts = RegExp(_amountTokenPattern).allMatches(normalized).toList();
  if (amounts.isEmpty) {
    return false;
  }
  final amount = amounts.last;

  final labelEndsBeforeAmount = label.end <= amount.start;
  final labelStartsAfterAmount = label.start >= amount.end;
  if (!labelEndsBeforeAmount && !labelStartsAfterAmount) {
    return false;
  }

  final leadingText = normalized.substring(0, amount.start).trim();
  final trailingText = normalized.substring(amount.end).trim();
  final textBesideAmount = labelEndsBeforeAmount ? leadingText : trailingText;
  final compactLabel = textBesideAmount
      .replaceAll(
        RegExp(
          '(?<![A-Za-z0-9])(?:$_currencyTokenPattern)(?![A-Za-z0-9])',
          caseSensitive: false,
        ),
        ' ',
      )
      .replaceAll(RegExp(r'[^\w\s%.\-]'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();

  if (!labelPattern.hasMatch(compactLabel)) {
    return false;
  }

  final remaining = compactLabel
      .replaceFirst(labelPattern, ' ')
      .replaceAll(
        RegExp(
          '\\b(${_supportedCurrencyCodes.join('|')})\\b',
          caseSensitive: false,
        ),
        ' ',
      )
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();

  return remaining.isEmpty ||
      RegExp(r'^\d{1,3}(?:\.\d+)?%$').hasMatch(remaining);
}

bool _hasJapaneseReceiptLabel(String line, List<String> labels) {
  final amount = RegExp(_amountTokenPattern).firstMatch(line);
  if (amount == null) {
    return false;
  }

  for (final label in labels) {
    final labelIndex = line.indexOf(label);
    if (labelIndex < 0) {
      continue;
    }
    if (labelIndex + label.length <= amount.start || labelIndex >= amount.end) {
      return true;
    }
  }

  return false;
}

bool _hasLocalizedReceiptLabel(String line, List<String> labels) {
  final amount = RegExp(_amountTokenPattern).firstMatch(line);
  if (amount == null) return false;
  final foldedLine = line.toLowerCase();
  return labels.any((label) {
    final index = foldedLine.indexOf(label.toLowerCase());
    return index >= 0 &&
        (index + label.length <= amount.start || index >= amount.end);
  });
}

String? _formatDate(int year, int month, int day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  final calendarDate = DateTime.utc(year, month, day);
  if (calendarDate.year != year ||
      calendarDate.month != month ||
      calendarDate.day != day) {
    return null;
  }

  return '${year.toString().padLeft(4, '0')}-'
      '${month.toString().padLeft(2, '0')}-'
      '${day.toString().padLeft(2, '0')}';
}
