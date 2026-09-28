import 'package:unorm_dart/unorm_dart.dart' as unicode_normalization;

import 'receipt_ocr_preview.dart';
import '../ui/settleora_form_fields.dart';

final _unicodeLetterPattern = RegExp(r'\p{L}', unicode: true);

class ReceiptOcrParser {
  const ReceiptOcrParser();

  ReceiptOcrPreview parse(
    String recognizedText, {
    String? fallbackCurrency,
    List<ReceiptOcrBlockEvidence> blocks = const [],
    ReceiptOcrRunEvidence? runEvidence,
  }) {
    final lines = recognizedText
        .split(RegExp(r'\r?\n'))
        .map(_normalizeOcrLine)
        .where((line) => line.isNotEmpty)
        .toList(growable: false);
    final warnings = <String>[];
    if (lines.isEmpty) {
      return const ReceiptOcrPreview(
        warnings: ['No readable receipt text was found.'],
      );
    }

    final layoutRows = _matchingLayoutRows(lines, blocks);
    final chargeTableRows = _chargeTableRows(lines);

    final currencyDetection = _detectCurrency(
      lines,
      fallbackCurrency: fallbackCurrency,
    );
    final currency = currencyDetection.currency;
    final layoutChargeItems = _extractLayoutChargeTableItems(
      lines,
      layoutRows,
      currency,
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
    );
    final merchantDetection = _detectMerchant(lines, layoutRows);
    final merchant = merchantDetection?.text;
    final itemCandidates = _extractItems(
      lines,
      currency,
      merchantLineIndices: merchantDetection?.lineIndices ?? const {},
      layoutRows: layoutRows,
      chargeTableRows: recognizedChargeRows,
      layoutChargeItems: layoutChargeItems,
    );
    final unresolvedItemLines = _countUnresolvedItemLikeLines(
      lines,
      merchantLineIndices: merchantDetection?.lineIndices ?? const {},
      layoutRows: layoutRows,
    );
    if (itemCandidates.isEmpty) {
      warnings.add('No clear item lines were detected.');
    }
    if (unresolvedItemLines > 0) {
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
      tax: amounts.tax,
      service: amounts.service,
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
    final joined = transactionCurrencyLines.join(' ').toUpperCase();
    final hasUsPostalAddress = _hasUsPostalAddress(transactionCurrencyLines);
    final explicitCode = _rankedExplicitCurrencyCode(transactionCurrencyLines);
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

    final normalizedFallback = _supportedCurrencyCode(fallbackCurrency);
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
          return (code: code, score: score, firstLine: firstLine);
        }).toList()..sort((left, right) {
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
  _explicitAdjustmentCurrencyFromLine(String line) {
    final boundedCodeCandidates = <String>{
      for (final match in RegExp(
        r'(?<![A-Za-z])([A-Z]{3})(?![A-Za-z])\s*[:=]?\s*[+-]?\s*\d',
      ).allMatches(line))
        match.group(1)!,
      for (final match in RegExp(
        r'\d(?:[\d,]*)(?:\.\d+)?\s*([A-Z]{3})(?![A-Za-z])',
      ).allMatches(line))
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
  }) {
    String? subtotal;
    String? tax;
    String? service;
    String? tip;
    String? tipLabel;
    String? tipCurrency;
    var tipHasExplicitCurrencyEvidence = false;
    String? shipping;
    String? shippingLabel;
    String? shippingCurrency;
    var shippingHasExplicitCurrencyEvidence = false;
    String? discount;
    final totalCandidates = <({String value, int score, int order})>[];

    for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      final line =
          _isFinancialLabelWithAdjacentAmount(lines, layoutRows, lineIndex)
          ? '${lines[lineIndex]} ${lines[lineIndex + 1]}'
          : lines[lineIndex];
      final normalized = line.toLowerCase();
      final amount = _lastAmountInLine(line, currency: currency);
      if (amount == null) {
        continue;
      }
      if (chargeTableRows.contains(lineIndex)) continue;

      if (_hasSubtotalLabel(line, normalized)) {
        subtotal ??= amount;
      } else if (_hasTaxLabel(line, normalized)) {
        tax ??= amount;
      } else if (_hasServiceChargeLabel(line, normalized)) {
        service ??= amount;
      } else if (_hasActualTipChargeLabel(line, normalized)) {
        if (tip == null) {
          tip = amount;
          tipLabel = _originalReceiptAdjustmentLabel(line, fallback: 'Tip');
          final adjustmentCurrency = _explicitAdjustmentCurrencyFromLine(line);
          tipCurrency = adjustmentCurrency.currency;
          tipHasExplicitCurrencyEvidence =
              adjustmentCurrency.hasExplicitEvidence;
        }
      } else if (_hasShippingLabel(line, normalized)) {
        if (shipping == null) {
          shipping = amount;
          shippingLabel = _originalReceiptAdjustmentLabel(
            line,
            fallback: 'Shipping',
          );
          final adjustmentCurrency = _explicitAdjustmentCurrencyFromLine(line);
          shippingCurrency = adjustmentCurrency.currency;
          shippingHasExplicitCurrencyEvidence =
              adjustmentCurrency.hasExplicitEvidence;
        }
      } else if (_hasDiscountLabel(line, normalized)) {
        discount ??= amount;
      } else if (_hasTotalLabel(line, normalized) &&
          !RegExp(
            r'\b(payment|tender|cash|change|previous|prior|reference)\b',
          ).hasMatch(normalized)) {
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

    final subtotalValue = subtotal == null ? null : double.tryParse(subtotal);
    final sameCurrencyTip =
        !tipHasExplicitCurrencyEvidence ||
        (currency != null && tipCurrency == currency);
    final sameCurrencyShipping =
        !shippingHasExplicitCurrencyEvidence ||
        (currency != null && shippingCurrency == currency);
    final discountMagnitude = discount == null
        ? null
        : double.tryParse(discount)?.abs();
    final supportedParts = [
      tax,
      service,
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
      tax: tax,
      service: service,
      tip: tip,
      tipLabel: tipLabel,
      tipCurrency: tipCurrency,
      tipHasExplicitCurrencyEvidence: tipHasExplicitCurrencyEvidence,
      shipping: shipping,
      shippingLabel: shippingLabel,
      shippingCurrency: shippingCurrency,
      shippingHasExplicitCurrencyEvidence: shippingHasExplicitCurrencyEvidence,
      discount: discount,
      total: total,
    );
  }

  List<ReceiptOcrItemCandidate> _extractItems(
    List<String> lines,
    String? currency, {
    Set<int> merchantLineIndices = const {},
    List<List<ReceiptOcrBlockEvidence>> layoutRows = const [],
    Set<int> chargeTableRows = const {},
    Map<int, ReceiptOcrItemCandidate> layoutChargeItems = const {},
  }) {
    final items = <ReceiptOcrItemCandidate>[];
    final wrappedDescriptionLines = <String>[];
    final leadingQuantityRows = _leadingQuantityColumnRows(lines, layoutRows);
    final fuelItem = _extractFuelItem(lines, currency);
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
      if ((_isAdministrativeLine(line) &&
              !chargeTableRows.contains(lineIndex)) ||
          _isContextualReceiptMetadataLine(lines, lineIndex) ||
          _isChargeTableHeader(line) ||
          merchantLineIndices.contains(lineIndex) ||
          (fuelItem != null && _isFuelMeasurementLine(line))) {
        wrappedDescriptionLines.clear();
        continue;
      }
      if (_isStandaloneAmountRow(line)) {
        wrappedDescriptionLines.clear();
        continue;
      }

      final match = RegExp(
        '^(.+?)\\s+($_currencyTokenPattern)?\\s*'
        "($_amountTokenPattern)"
        '(?:\\s*($_currencyTokenPattern))?\$',
        caseSensitive: false,
      ).firstMatch(line);
      if (match == null) {
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
          final amountCurrency =
              _explicitCurrencyFromLine(amountLine) ?? currency;
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
      final lineCurrency =
          _currencyFromItemToken(match.group(2) ?? match.group(4)) ?? currency;
      final lineConfidence = lineIndex < layoutRows.length
          ? _averageBlockConfidence(layoutRows[lineIndex])
          : null;
      final lineTotal = _normalizeAmount(
        match.group(3)!,
        currency: lineCurrency,
      );
      if (!_hasSubstantiveItemDescription(description) ||
          lineTotal == null ||
          _isLikelyNonItemDescription(description) ||
          !_hasTraceableItemAmountToken(line, match.group(3)!)) {
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

    return items.take(40).toList(growable: false);
  }

  Map<int, ReceiptOcrItemCandidate> _extractLayoutChargeTableItems(
    List<String> lines,
    List<List<ReceiptOcrBlockEvidence>> layoutRows,
    String? currency,
  ) {
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
                  r'\b(?:amount|total)\b',
                  caseSensitive: false,
                ).hasMatch(block.text),
          )
          .toList(growable: false);
      if (descriptionBlocks.isEmpty || amountBlocks.isEmpty) continue;
      final descriptionLeft = descriptionBlocks
          .expand((block) => block.points)
          .map((point) => point.x)
          .reduce((left, right) => left < right ? left : right);
      final amountLeft = amountBlocks
          .expand((block) => block.points)
          .map((point) => point.x)
          .reduce((left, right) => left < right ? left : right);
      final amountRight = amountBlocks
          .expand((block) => block.points)
          .map((point) => point.x)
          .reduce((left, right) => left > right ? left : right);
      if (amountLeft <= descriptionLeft || amountRight <= amountLeft) {
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
              return center >= descriptionLeft - 12 &&
                  center <= amountRight + 12;
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
        final amountCells = tableBlocks
            .where((block) {
              final left = block.points
                  .map((point) => point.x)
                  .reduce((a, b) => a < b ? a : b);
              final right = block.points
                  .map((point) => point.x)
                  .reduce((a, b) => a > b ? a : b);
              final center = (left + right) / 2;
              return center >= amountLeft - 12 &&
                  right >= amountLeft &&
                  _lineHasAmount(block.text);
            })
            .toList(growable: false);
        if (amountCells.isEmpty) continue;
        final amountCell = amountCells.last;
        final lineCurrency =
            _explicitCurrencyFromLine(amountCell.text) ?? currency;
        final lineTotal = _lastAmountInLine(
          amountCell.text,
          currency: lineCurrency,
        );
        if (lineTotal == null) continue;
        final description = _stripChargeTableColumns(
          _cleanDescription(
            tableBlocks
                .where((block) {
                  final right = block.points
                      .map((point) => point.x)
                      .reduce((a, b) => a > b ? a : b);
                  return right < amountLeft - 12 &&
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
            _isReceiptMetadataLine(description)) {
          continue;
        }
        items[rowIndex] = ReceiptOcrItemCandidate(
          description: description,
          lineTotal: lineTotal,
          currency: lineCurrency,
          confidence: _averageBlockConfidence(tableBlocks),
          category: 'item_line',
        );
      }
    }
    return items;
  }

  ReceiptOcrItemCandidate? _extractFuelItem(
    List<String> lines,
    String? currency,
  ) {
    String? description;
    String? quantity;
    String? unitPrice;
    String? lineTotal;
    for (final line in lines) {
      final fuel = RegExp(
        r'^(?:FUEL|PRODUCT)\s*[:#-]?\s+(.+)$',
        caseSensitive: false,
      ).firstMatch(line);
      if (fuel != null) {
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
        // Per-unit fuel rates commonly carry three decimal places even when
        // the transaction currency has two minor digits.
        unitPrice = _lastAmountInLine(line);
        continue;
      }
      if (_hasTotalLabel(line, line.toLowerCase())) {
        lineTotal = _lastAmountInLine(line, currency: currency);
      }
    }
    if (description == null ||
        description.isEmpty ||
        quantity == null ||
        unitPrice == null ||
        lineTotal == null) {
      return null;
    }
    return ReceiptOcrItemCandidate(
      description: description,
      quantity: quantity,
      unitPrice: unitPrice,
      lineTotal: lineTotal,
      currency: currency,
      category: 'item_line',
    );
  }

  bool _isFuelMeasurementLine(String line) => RegExp(
    r'^(?:FUEL|PRODUCT|GALLONS?|LIT(?:ER|RE)S?|PRICE\s*/\s*(?:GAL|L)|UNIT\s+PRICE)\b',
    caseSensitive: false,
  ).hasMatch(line);

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

double? _averageBlockConfidence(List<ReceiptOcrBlockEvidence> blocks) {
  final values = blocks.map((block) => block.confidence).nonNulls.toList();
  if (values.isEmpty) return null;
  return values.reduce((left, right) => left + right) / values.length;
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
Set<int> _chargeTableRows(List<String> lines) {
  final rows = <int>{};
  var inTable = false;
  for (var index = 0; index < lines.length; index++) {
    final line = lines[index];
    final lower = line.toLowerCase();
    if (_isChargeTableHeader(line)) {
      inTable = true;
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
    if (pricedRow != null &&
        !_isReceiptMetadataLine(line) &&
        _hasSubstantiveItemDescription(
          _cleanDescription(pricedRow.group(1)!),
        ) &&
        _hasTraceableItemAmountToken(line, pricedRow.group(3)!)) {
      rows.add(index);
    }
  }
  return rows;
}

bool _isChargeTableSectionBoundary(String line) {
  if (_lineHasAmount(line)) return false;
  return RegExp(
    r'^(?:payment\s+(?:coupon|information|summary)|remittance|important\s+messages?|(?:account|billing|usage)\s+(?:summary|information)|contact\s+us|notes?)\b',
    caseSensitive: false,
  ).hasMatch(line.trim());
}

bool _isChargeTableHeader(String line) {
  final lower = line.toLowerCase();
  return RegExp(r'\bdescription\b').hasMatch(lower) &&
      RegExp(r'\b(?:amount|total)\b').hasMatch(lower) &&
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
    this.tax,
    this.service,
    this.tip,
    this.tipLabel,
    this.tipCurrency,
    this.tipHasExplicitCurrencyEvidence = false,
    this.shipping,
    this.shippingLabel,
    this.shippingCurrency,
    this.shippingHasExplicitCurrencyEvidence = false,
    this.discount,
    this.total,
  });

  final String? subtotal;
  final String? tax;
  final String? service;
  final String? tip;
  final String? tipLabel;
  final String? tipCurrency;
  final bool tipHasExplicitCurrencyEvidence;
  final String? shipping;
  final String? shippingLabel;
  final String? shippingCurrency;
  final bool shippingHasExplicitCurrencyEvidence;
  final String? discount;
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
          .replaceAll('\u00a0', ' ');
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
    (match) => '${match.group(2)} ${match.group(1)}',
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
    RegExp(r'^(.*?)\s*(-?\d{1,6}(?:,\d{3})*(?:\.\d{1,3})?)\s*(د\.?إ)$'),
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
      _isNonTransactionCurrencyMetadataLine(line) ||
      normalized.contains('thank you');
}

bool _isPaymentMetadataLine(String line) {
  final normalized = line.toLowerCase().trim();
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

bool _isReceiptMetadataLine(String line) {
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
    RegExp(r"^[a-z .'-]+,?\s+[a-z]{2,3}\s+\d{4,5}(?:-\d{4})?$"),
    RegExp(r"^[a-z .'-]+,?\s+[a-z]{2}\s+[a-z]\d[a-z]\s?\d[a-z]\d$"),
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
      r'^\s*(?:(?:previous|prior|last|refund|reference|payment|paid)\s+)?(?:bill|invoice|statement|transaction|order|purchase|due|payment|refund|service|billing)\s+date\s*[:#-]?\s*(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|[a-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})\s*$',
    ),
    RegExp(r'\b(tel|phone|fax|whatsapp|mobile|contact)\b'),
    RegExp(r'\b(?:\+?\d[\d ()-]{6,}\d)\b'),
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

bool _isLikelyNonItemDescription(String description) {
  final normalized = description.toLowerCase().trim();
  if (normalized.isEmpty || _isReceiptMetadataLine(description)) {
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
          r'\b(?:sales\s+tax|tax|vat|gst|hst|iva)\b',
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
        'TVA',
        'MwSt.',
        'VAT',
        'KDV',
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

bool _hasTotalLabel(String line, String normalized) {
  return _hasEnglishReceiptLabel(
        normalized,
        RegExp(
          r'\b(total\s+amount\s+due|total\s+current\s+charges|refund\s+total|total\s+paid|paid\s+total|grand\s+total|amount\s+due|balance\s+due|total)\b',
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
