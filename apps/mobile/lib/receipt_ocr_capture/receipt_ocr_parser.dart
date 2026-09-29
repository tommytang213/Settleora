import 'package:unorm_dart/unorm_dart.dart' as unicode_normalization;

import 'receipt_ocr_preview.dart';
import '../ui/settleora_form_fields.dart';

final _unicodeLetterPattern = RegExp(r'\p{L}', unicode: true);
final _potentialReceiptAdjustmentLabelPattern = RegExp(
  r'\b(?:sales\s+tax|tax|vat|gst|hst|iva|tva|kdv|mwst|service(?:\s+(?:charge|fee))?|tip|gratuity|shipping|delivery(?:\s+(?:charge|fee))?|discount|coupon|surcharge|fee)\b',
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
  if (_potentialReceiptAdjustmentLabelPattern.hasMatch(line)) return true;
  final folded = line.toLowerCase();
  return _localizedReceiptAdjustmentLabels.any(folded.contains);
}

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

    final currencyDetection = _detectCurrency(
      lines,
      fallbackCurrency: fallbackCurrency,
    );
    final currency = currencyDetection.currency;
    final layoutChargeItems = _extractLayoutChargeTableItems(
      lines,
      layoutRows,
      currency,
      detachedAmountSignRows: detachedAmountSignRows,
    );
    final recognizedChargeRows = {
      ...chargeTableRows,
      ...layoutChargeItems.keys,
    };
    final amounts = _extractLabeledAmounts(
      lines,
      currency,
      layoutRows: layoutRows,
      chargeTableRows: recognizedChargeRows,
      ambiguousChargeTableRows: chargeTable.ambiguous,
      detachedAmountSignRows: detachedAmountSignRows,
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
      ambiguousChargeTableRows: chargeTable.ambiguous,
      layoutChargeItems: layoutChargeItems,
      detachedAmountSignRows: detachedAmountSignRows,
    );
    final itemCandidates = extractedItems.items;
    final unresolvedItemLines = _countUnresolvedItemLikeLines(
      lines,
      merchantLineIndices: merchantDetection?.lineIndices ?? const {},
      layoutRows: layoutRows,
    );
    if (itemCandidates.isEmpty) {
      warnings.add('No clear item lines were detected.');
    }
    if (unresolvedItemLines > 0 ||
        detachedAmountSignRows.isNotEmpty ||
        chargeTable.ambiguous.any(
          (index) => !layoutChargeItems.containsKey(index),
        )) {
      warnings.add(
        'Some OCR lines need manual review because no traceable line amount was found.',
      );
    }
    if (amounts.total == null && itemCandidates.isEmpty) {
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
      adjustmentsComplete:
          amounts.adjustmentsComplete &&
          !extractedItems.truncated &&
          unresolvedItemLines == 0,
      total: amounts.total,
      rawTextLineCount: lines.length,
      confidence: _averageBlockConfidence(blocks),
      category: 'receipt',
      warnings: warnings,
      items: itemCandidates,
      blocks: blocks,
      runEvidence: runEvidence,
    );
  }

  ({String text, Set<int> lineIndices})? _detectMerchant(
    List<String> lines,
    List<List<ReceiptOcrBlockEvidence>> layoutRows,
  ) {
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
      if (selected.hasExplicitEvidence &&
          _supportedCurrencyCodes.contains(selected.currency)) {
        final amount = RegExp(_amountTokenPattern).allMatches(line).last;
        final before = line.substring(0, amount.start).trimRight();
        final after = line.substring(amount.end).trimLeft();
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

  _LabeledReceiptAmounts _extractLabeledAmounts(
    List<String> lines,
    String? currency, {
    List<List<ReceiptOcrBlockEvidence>> layoutRows = const [],
    Set<int> chargeTableRows = const {},
    Set<int> ambiguousChargeTableRows = const {},
    Set<int> detachedAmountSignRows = const {},
  }) {
    String? subtotal;
    String? subtotalCurrency;
    var subtotalHasExplicitCurrencyEvidence = false;
    String? tax;
    String? taxCurrency;
    var taxHasExplicitCurrencyEvidence = false;
    final ratedTaxComponents =
        <({String rate, String amount, bool explicitCurrency})>[];
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
    final adjustmentRoleCounts = <String, int>{};
    var adjustmentsComplete = true;
    var aggregatedRatedTax = false;
    final totalCandidates = <({String value, int score, int order})>[];
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
      if (detachedAmountSignRows.contains(lineIndex)) {
        if (_hasPotentialReceiptAdjustmentLabel(lines[lineIndex])) {
          adjustmentsComplete = false;
        }
        continue;
      }
      final line =
          _isFinancialLabelWithAdjacentAmount(lines, layoutRows, lineIndex)
          ? '${lines[lineIndex]} ${lines[lineIndex + 1]}'
          : lines[lineIndex];
      final normalized = line.toLowerCase();
      final amount = _isPrimaryTotalCurrencyLine(line, normalized)
          ? _selectedTotalAmountInLine(line, currency: currency)
          : _lastAmountInLine(line, currency: currency);
      final hasPotentialAdjustment = _hasPotentialReceiptAdjustmentLabel(line);
      if (chargeTableRows.contains(lineIndex) ||
          ambiguousChargeTableRows.contains(lineIndex)) {
        if (hasPotentialAdjustment) adjustmentsComplete = false;
        continue;
      }
      final adjustmentRole = _hasTaxLabel(line, normalized)
          ? 'tax'
          : _hasServiceChargeLabel(line, normalized)
          ? 'service'
          : _hasActualTipChargeLabel(line, normalized)
          ? 'tip'
          : _hasShippingLabel(line, normalized)
          ? 'shipping'
          : _hasDiscountLabel(line, normalized)
          ? 'discount'
          : null;
      if (adjustmentRole != null) {
        adjustmentRoleCounts.update(
          adjustmentRole,
          (count) => count + 1,
          ifAbsent: () => 1,
        );
        if (amount == null) adjustmentsComplete = false;
      }
      if (adjustmentRole == null && hasPotentialAdjustment) {
        adjustmentsComplete = false;
      }
      if (amount == null) continue;

      if (_hasSubtotalLabel(line, normalized)) {
        final printed = _explicitAdjustmentCurrencyFromLine(
          line,
          receiptCurrency: currency,
        );
        if (preferMatchingPrintedCurrency(
          subtotal,
          subtotalCurrency,
          subtotalHasExplicitCurrencyEvidence,
          printed,
        )) {
          subtotal = amount;
          subtotalCurrency = printed.currency;
          subtotalHasExplicitCurrencyEvidence = printed.hasExplicitEvidence;
        }
      } else if (_hasTaxLabel(line, normalized)) {
        final printed = _explicitAdjustmentCurrencyFromLine(
          line,
          receiptCurrency: currency,
        );
        final printedRate = RegExp(
          r'\b(?:sales\s+tax|tax|vat|gst|hst|iva|tva|kdv|mwst)\b\.?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*%',
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
      } else if (_hasShippingLabel(line, normalized)) {
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
        if (RegExp(
          r'\b(total\s+amount\s+due|grand\s+total|balance\s+due|amount\s+due)\b',
        ).hasMatch(normalized)) {
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
    if (adjustmentRoleCounts.entries.any(
      (entry) => entry.value > 1 && (entry.key != 'tax' || !aggregatedRatedTax),
    )) {
      adjustmentsComplete = false;
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
      adjustmentsComplete: adjustmentsComplete,
      total: total,
    );
  }

  ({List<ReceiptOcrItemCandidate> items, bool truncated}) _extractItems(
    List<String> lines,
    String? currency, {
    String? selectedTotal,
    Set<int> merchantLineIndices = const {},
    List<List<ReceiptOcrBlockEvidence>> layoutRows = const [],
    Set<int> chargeTableRows = const {},
    Set<int> ambiguousChargeTableRows = const {},
    Map<int, ReceiptOcrItemCandidate> layoutChargeItems = const {},
    Set<int> detachedAmountSignRows = const {},
  }) {
    final items = <ReceiptOcrItemCandidate>[];
    final wrappedDescriptionLines = <String>[];
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
    }
    for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      final line = lines[lineIndex];
      final layoutChargeItem = layoutChargeItems[lineIndex];
      if (layoutChargeItem != null) {
        items.add(layoutChargeItem);
        wrappedDescriptionLines.clear();
        continue;
      }
      if (ambiguousChargeTableRows.contains(lineIndex)) {
        wrappedDescriptionLines.clear();
        continue;
      }
      if ((_isAdministrativeLine(line) &&
              !chargeTableRows.contains(lineIndex)) ||
          _isContextualReceiptMetadataLine(lines, lineIndex) ||
          _isChargeTableHeader(line) ||
          detachedAmountSignRows.contains(lineIndex) ||
          merchantLineIndices.contains(lineIndex) ||
          ((fuelItem != null || hasFuelMeasurementLayout) &&
              _isFuelMeasurementLine(line) &&
              !_isPricedFuelLine(line))) {
        wrappedDescriptionLines.clear();
        continue;
      }
      if (_isStandaloneAmountRow(line)) {
        wrappedDescriptionLines.clear();
        continue;
      }

      final layoutFallback = _extractLayoutItemFallback(
        lines,
        layoutRows,
        lineIndex,
        currency,
      );

      final match = RegExp(
        '^(.+?)\\s+($_currencyTokenPattern)?\\s*'
        "($_amountTokenPattern)"
        '(?:\\s*($_currencyTokenPattern))?\$',
        caseSensitive: false,
      ).firstMatch(line);
      if (match == null) {
        if (layoutFallback != null) {
          items.add(layoutFallback);
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
            final wrappedDescription = wrappedDescriptionLines.join(' ');
            final description =
                _isStrongWrappedItemDescription(wrappedDescription)
                ? '$wrappedDescription $cleaned'
                : cleaned;
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
            wrappedDescriptionLines.clear();
            lineIndex += 1;
            continue;
          }
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
        continue;
      }

      var description = _cleanDescription(match.group(1)!);
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
        if (layoutFallback != null) items.add(layoutFallback);
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
        continue;
      }

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
    }

    if (fuelItem != null && items.length > 1) {
      // A receipt grand total cannot safely serve as the fuel line total when
      // another priced purchase is present. Keep the other traceable lines
      // and leave the fuel measurement for explicit review.
      items.remove(fuelItem);
    }

    return (
      items: items.take(40).toList(growable: false),
      truncated: items.length > 40,
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

  Map<int, ReceiptOcrItemCandidate> _extractLayoutChargeTableItems(
    List<String> lines,
    List<List<ReceiptOcrBlockEvidence>> layoutRows,
    String? currency, {
    Set<int> detachedAmountSignRows = const {},
  }) {
    if (layoutRows.length != lines.length) return const {};
    final items = <int, ReceiptOcrItemCandidate>{};
    for (var headerIndex = 0; headerIndex < lines.length; headerIndex++) {
      if (!_isChargeTableHeader(lines[headerIndex])) continue;
      final header = layoutRows[headerIndex];
      final descriptionBlocks = header
          .where(
            (block) =>
                block.points.isNotEmpty &&
                RegExp(
                  r'\bdescription\b',
                  caseSensitive: false,
                ).hasMatch(block.text),
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

      for (
        var rowIndex = headerIndex + 1;
        rowIndex < lines.length;
        rowIndex++
      ) {
        if (_isChargeTableHeader(lines[rowIndex]) ||
            _isChargeTableSectionBoundary(lines[rowIndex])) {
          break;
        }
        if (detachedAmountSignRows.contains(rowIndex)) continue;
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
        if (_isChargeTableSummaryLine(tableText) ||
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
        final description = _stripChargeTableColumns(
          _cleanDescription(
            tableBlocks
                .where((block) {
                  if (block == currencyBlock) return false;
                  final right = block.points
                      .map((point) => point.x)
                      .reduce((a, b) => a > b ? a : b);
                  return (amountOnLeft
                          ? block.points
                                    .map((point) => point.x)
                                    .reduce((a, b) => a < b ? a : b) >
                                amountRight + 12
                          : right < amountLeft - 12) &&
                      !_isStandaloneAmountRow(block.text) &&
                      !RegExp(
                        '^(?:$_currencyTokenPattern)\\s*[-+]?\\d',
                        caseSensitive: false,
                      ).hasMatch(block.text.trim()) &&
                      _unicodeLetterPattern.hasMatch(block.text);
                })
                .map((block) => block.text.trim())
                .join(' '),
          ),
        );
        if (!_hasSubstantiveItemDescription(description) ||
            _isReceiptMetadataLine(description, allowBarePostal: false)) {
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
    List<List<ReceiptOcrBlockEvidence>> layoutRows = const [],
  }) {
    var count = 0;
    for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      final line = lines[lineIndex];
      if (merchantLineIndices.contains(lineIndex)) {
        continue;
      }
      if (_isAdministrativeLine(line) ||
          _isChargeTableHeader(line) ||
          _isContextualReceiptMetadataLine(lines, lineIndex) ||
          _lineHasAmount(line) ||
          _detectDate([line]) != null) {
        continue;
      }

      final cleaned = _cleanDescription(line);
      if (lineIndex + 1 < lines.length &&
          _isWrappedItemDescriptionCandidate(cleaned) &&
          _isPricedItemLine(lines[lineIndex + 1])) {
        continue;
      }
      if (lineIndex + 1 < lines.length &&
          _isWrappedItemDescriptionCandidate(cleaned) &&
          !_isStandaloneTenderLabel(cleaned) &&
          !_isFinancialLabelWithAdjacentAmount(lines, layoutRows, lineIndex) &&
          _isStandaloneAmountRow(lines[lineIndex + 1]) &&
          _isAdjacentRightColumnAmount(layoutRows, lineIndex)) {
        continue;
      }
      final letterCount = _unicodeLetterPattern.allMatches(cleaned).length;
      if (letterCount >= 2 && !_isLikelyNonItemDescription(cleaned)) {
        count += 1;
      }
    }

    return count;
  }
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
  for (var index = 0; index < lines.length; index++) {
    final line = lines[index];
    final lower = line.toLowerCase();
    if (_isChargeTableHeader(line)) {
      inTable = true;
      hasRateColumn = RegExp(r'\brate\b', caseSensitive: false).hasMatch(line);
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
    if (detachedAmountSignRows.contains(index)) {
      ambiguous.add(index);
      continue;
    }
    if (pricedRow != null &&
        hasRateColumn &&
        !_isChargeTableSummaryLine(line) &&
        !_isReceiptMetadataLine(line) &&
        !_hasEarlierPrintedMonetaryAmount(prefix) &&
        !_hasCompleteUsageRateColumns(prefix)) {
      ambiguous.add(index);
      continue;
    }
    if (pricedRow != null &&
        !_isChargeTableSummaryLine(line) &&
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
  return _isAccountBalanceSummaryLine(line) ||
      _hasTaxLabel(line, normalized) ||
      _hasDiscountLabel(line, normalized) ||
      _hasActualTipChargeLabel(line, normalized) ||
      _isPaymentMetadataLine(line);
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
  return RegExp(r'\bdescription\b').hasMatch(lower) &&
      RegExp(r'\b(?:amount|total|charges?)\b').hasMatch(lower) &&
      RegExp(r'\b(?:rate|usage|therms|kwh|units?)\b').hasMatch(lower);
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
    this.adjustmentsComplete = true,
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
  final bool adjustmentsComplete;
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
  'zł',
  'kr',
  'Rs',
  'د.إ',
  'دإ',
].map(RegExp.escape).join('|');
const _amountTokenPattern =
    r"-?(?:\d{1,3}(?:[ \u00a0]\d{3})+(?:[.,]\d{1,3})?|\d+(?:[.,'’]\d+)*)";

const _nonCurrencyAdjustmentCodes = {
  'TAX',
  'TIP',
  'VAT',
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

bool _isAdministrativeLine(String line) {
  final normalized = line.toLowerCase();
  return _hasSubtotalLabel(line, normalized) ||
      _hasTaxLabel(line, normalized) ||
      _hasServiceChargeLabel(line, normalized) ||
      _hasActualTipChargeLabel(line, normalized) ||
      _isSuggestedTipLine(normalized) ||
      _hasShippingLabel(line, normalized) ||
      _hasDiscountLabel(line, normalized) ||
      _hasTotalLabel(line, normalized) ||
      _isAccountBalanceSummaryLine(line) ||
      _isNonTransactionCurrencyMetadataLine(line) ||
      normalized.contains('thank you');
}

bool _isAccountBalanceSummaryLine(String line) => RegExp(
  r'^(?:(?:previous|prior|opening|closing|outstanding)\s+balance|balance\s+(?:forward|brought\s+forward)|payments?\s+(?:received|made)|current\s+(?:[\p{L}]+\s+){0,3}charges)\b',
  caseSensitive: false,
  unicode: true,
).hasMatch(line.trim());

bool _isPaymentMetadataLine(String line) {
  final normalized = line.toLowerCase().trim();
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
  if (_isPaymentMetadataLine(line)) {
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
  return _explicitSymbolCurrency(normalized);
}

String? _currencyFromItemToken(String? token) {
  if (token == null) return null;
  final normalized = token.trim().toUpperCase();
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

  if (_isDateOrTimeOnlyLine(normalized)) {
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
      r'^(?:abn|acn|nzbn|ruc|rfc|(?:gst|hst|vat|tax)\s*(?:reg(?:istration)?|id|no|number))\s*[:#-]?\s*[a-z0-9][a-z0-9\s-]{3,}$',
    ),
    RegExp(
      r'^(?:(?:sales\s+)?tax|vat|gst|hst|iva)\s+(?:applies|included|incluido|inclusive|applied)$',
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
    RegExp(r'^\s*(invoice|receipt|check|cheque|ticket)\s*(no|#|number|num)?\b'),
    RegExp(
      r'\b(table|tbl|store|branch|cashier|server|staff|register|reg|terminal|term|till|pos|order|ord|reference|ref)\b\s*[:#-]?\s*[a-z0-9-]+\b',
    ),
    RegExp(
      r'\b(open|close|closed|served|powered by|thank you|welcome|visit again)\b',
    ),
  ];

  return metadataPatterns.any((pattern) => pattern.hasMatch(normalized));
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

bool _hasTaxLabel(String line, String normalized) {
  return _hasEnglishReceiptLabel(
        normalized,
        RegExp(
          r'\b(?:sales\s+tax|tax|vat|gst|hst|iva|tva|kdv|mwst)\b\.?',
          caseSensitive: false,
        ),
      ) ||
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

bool _hasShippingLabel(String line, String normalized) {
  final labelPattern = RegExp(
    r'\b(shipping|delivery)(?:\s+(?:fee|charge)|\s*(?:(?:&|and)\s*)?handling(?:\s+(?:fee|charge))?)?\b',
    caseSensitive: false,
  );
  return _hasEnglishReceiptLabel(normalized, labelPattern) ||
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
            r'^\s*(?:grand\s+total|total\s+amount\s+due|total|amount\s+due|balance\s+due)\b',
          ).hasMatch(normalized) &&
          (RegExp(_amountTokenPattern).allMatches(line).length > 1 ||
              _attachedSupportedCodeOnSelectedAmount(line) != null));
}

bool _hasTotalLabel(String line, String normalized) {
  return _hasEnglishReceiptLabel(
        normalized,
        RegExp(
          r'\b(total\s+amount\s+due|total\s+current\s+charges|refund\s+total|total\s+paid|paid\s+total|grand\s+total|amount\s+due|balance\s+due|payment\s+due|total)\b',
          caseSensitive: false,
        ),
      ) ||
      _hasJapaneseReceiptLabel(line, const ['合計']) ||
      _hasLocalizedReceiptLabel(line, const [
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
      ]);
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
