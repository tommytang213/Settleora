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

    final currencyDetection = _detectCurrency(
      lines,
      fallbackCurrency: fallbackCurrency,
    );
    final currency = currencyDetection.currency;
    final amounts = _extractLabeledAmounts(lines, currency);
    final itemCandidates = _extractItems(lines, currency);
    final merchant = _detectMerchant(lines);
    final unresolvedItemLines = _countUnresolvedItemLikeLines(
      lines,
      merchant: merchant,
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
      shipping: amounts.shipping,
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

  String? _detectMerchant(List<String> lines) {
    for (final line in lines.take(5)) {
      if (_isAdministrativeLine(line) ||
          _isReceiptMetadataLine(line) ||
          _lineHasAmount(line)) {
        continue;
      }
      return _cleanDescription(line);
    }

    return null;
  }

  String? _detectDate(List<String> lines) {
    for (final line in lines) {
      final eastAsian = RegExp(
        r'\b(20\d{2}|19\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?',
      ).firstMatch(line);
      if (eastAsian != null) {
        final formatted = _formatDate(
          int.parse(eastAsian.group(1)!),
          int.parse(eastAsian.group(2)!),
          int.parse(eastAsian.group(3)!),
        );
        if (formatted != null) return formatted;
      }

      final iso = RegExp(
        r'\b(20\d{2}|19\d{2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})\b',
      ).firstMatch(line);
      if (iso != null) {
        final formatted = _formatDate(
          int.parse(iso.group(1)!),
          int.parse(iso.group(2)!),
          int.parse(iso.group(3)!),
        );
        if (formatted != null) return formatted;
      }

      final slash = RegExp(
        r'\b(\d{1,2})/(\d{1,2})/(20\d{2}|19\d{2})\b',
      ).firstMatch(line);
      if (slash != null) {
        final first = int.parse(slash.group(1)!);
        final second = int.parse(slash.group(2)!);
        final year = int.parse(slash.group(3)!);
        final formatted = first > 12
            ? _formatDate(year, second, first)
            : _formatDate(year, first, second);
        if (formatted != null) return formatted;
      }

      final separatedDate = RegExp(
        r'\b(\d{1,2})[.-](\d{1,2})[.-](20\d{2}|19\d{2})\b',
      ).firstMatch(line);
      if (separatedDate != null) {
        final first = int.parse(separatedDate.group(1)!);
        final second = int.parse(separatedDate.group(2)!);
        final year = int.parse(separatedDate.group(3)!);
        final formatted = first > 12
            ? _formatDate(year, second, first)
            : _formatDate(year, first, second);
        if (formatted != null) return formatted;
      }
    }

    return null;
  }

  _ReceiptCurrencyDetection _detectCurrency(
    List<String> lines, {
    String? fallbackCurrency,
  }) {
    final joined = lines.join(' ').toUpperCase();
    for (final code in _supportedCurrencyCodes) {
      if (_hasExplicitCurrencyCode(lines, code)) {
        return _ReceiptCurrencyDetection(
          currency: code,
          provenance: ReceiptOcrCurrencyProvenance.explicit,
        );
      }
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

    final contextualCurrency = _contextualCurrency(joined);
    if (contextualCurrency != null) {
      return _ReceiptCurrencyDetection(
        currency: contextualCurrency,
        provenance: ReceiptOcrCurrencyProvenance.contextInferred,
      );
    }

    final normalizedFallback = _supportedCurrencyCode(fallbackCurrency);
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

  _LabeledReceiptAmounts _extractLabeledAmounts(
    List<String> lines,
    String? currency,
  ) {
    String? subtotal;
    String? tax;
    String? service;
    String? tip;
    String? shipping;
    String? discount;
    String? total;

    for (final line in lines) {
      final normalized = line.toLowerCase();
      final amount = _lastAmountInLine(line, currency: currency);
      if (amount == null) {
        continue;
      }

      if (_hasSubtotalLabel(line, normalized)) {
        subtotal ??= amount;
      } else if (_hasTaxLabel(line, normalized)) {
        tax ??= amount;
      } else if (_hasServiceChargeLabel(line, normalized)) {
        service ??= amount;
      } else if (_hasActualTipChargeLabel(line, normalized)) {
        tip ??= amount;
      } else if (_hasShippingLabel(line, normalized)) {
        shipping ??= amount;
      } else if (_hasDiscountLabel(line, normalized)) {
        discount ??= amount;
      } else if (_hasTotalLabel(line, normalized)) {
        total = amount;
      }
    }

    return _LabeledReceiptAmounts(
      subtotal: subtotal,
      tax: tax,
      service: service,
      tip: tip,
      shipping: shipping,
      discount: discount,
      total: total,
    );
  }

  List<ReceiptOcrItemCandidate> _extractItems(
    List<String> lines,
    String? currency,
  ) {
    final items = <ReceiptOcrItemCandidate>[];
    final wrappedDescriptionLines = <String>[];
    final fuelItem = _extractFuelItem(lines, currency);
    if (fuelItem != null) {
      items.add(fuelItem);
    }
    for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      final line = lines[lineIndex];
      if (_isAdministrativeLine(line) ||
          _isReceiptMetadataLine(line) ||
          (fuelItem != null && _isFuelMeasurementLine(line))) {
        wrappedDescriptionLines.clear();
        continue;
      }

      final match = RegExp(
        '^(.+?)\\s+($_currencyTokenPattern)?\\s*'
        "($_amountTokenPattern)"
        '(?:\\s*(?:$_currencyTokenPattern))?\$',
        caseSensitive: false,
      ).firstMatch(line);
      if (match == null) {
        final cleaned = _cleanDescription(line);
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
      final wrappedDescription = wrappedDescriptionLines.join(' ');
      if (_isStrongWrappedItemDescription(wrappedDescription)) {
        description = '$wrappedDescription $description';
      }
      wrappedDescriptionLines.clear();
      final lineTotal = _normalizeAmount(match.group(3)!, currency: currency);
      if (description.length < 2 ||
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
          currency: currency,
        );
        final cleanedName = _cleanDescription(quantityMatch.group(1)!);
        if (cleanedName.isNotEmpty) {
          items.add(
            ReceiptOcrItemCandidate(
              description: cleanedName,
              quantity: quantity,
              unitPrice: unitPrice,
              lineTotal: lineTotal,
              currency: currency,
              category: 'item_line',
            ),
          );
          continue;
        }
      }

      items.add(
        ReceiptOcrItemCandidate(
          description: description,
          quantity: '1',
          lineTotal: lineTotal,
          currency: currency,
          category: 'item_line',
        ),
      );
    }

    return items.take(40).toList(growable: false);
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

  int _countUnresolvedItemLikeLines(List<String> lines, {String? merchant}) {
    var count = 0;
    for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      final line = lines[lineIndex];
      if (merchant != null && _cleanDescription(line) == merchant) {
        continue;
      }
      if (_isAdministrativeLine(line) ||
          _isReceiptMetadataLine(line) ||
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

class _LabeledReceiptAmounts {
  const _LabeledReceiptAmounts({
    this.subtotal,
    this.tax,
    this.service,
    this.tip,
    this.shipping,
    this.discount,
    this.total,
  });

  final String? subtotal;
  final String? tax;
  final String? service;
  final String? tip;
  final String? shipping;
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
  const digitSources = '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹';
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
const _amountTokenPattern = r"-?\d+(?:[.,'’]\d+)*";

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
  };
  for (final marker in markers.entries) {
    if (joined.contains(marker.key)) return marker.value;
  }
  return null;
}

String? _contextualCurrency(String joined) {
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
    if (RegExp(
          r'\b(UNITED\s+STATES|USA|SEATTLE|SALES\s+TAX)\b',
        ).hasMatch(joined) ||
        RegExp(r'\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b').hasMatch(joined)) {
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

bool _lineHasAmount(String line) {
  return _lastAmountInLine(line) != null;
}

String? _lastAmountInLine(String line, {String? currency}) {
  final matches = RegExp(
    '(?<![A-Za-z0-9])$_amountTokenPattern(?![A-Za-z0-9])',
  ).allMatches(line).toList(growable: false);
  if (matches.isEmpty) {
    return null;
  }

  return _normalizeAmount(matches.last.group(0)!, currency: currency);
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
  return r"-?\d+(?:[.,'’]\d+)+";
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
  return description.length >= 2 &&
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
      normalized.contains('cash') ||
      normalized.contains('change') ||
      normalized.contains('visa') ||
      normalized.contains('mastercard') ||
      normalized.contains('card') ||
      normalized.contains('approval') ||
      normalized.contains('invoice') ||
      normalized.contains('receipt') ||
      normalized.contains('thank you');
}

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
      r'\b(room|rm|suite|unit|shop|floor|fl|level|lvl|block|blk|building|bldg|tower)\s*[#-]?\s*\w+\b',
    ),
    RegExp(r'\b\d{1,2}\s*/\s*f\b'),
    RegExp(r'\b(p\.?\s*o\.?\s*box|po box)\b'),
    RegExp(r'\b(zip|postal|postcode)\s*[:#-]?\s*[a-z0-9 -]{3,10}\b'),
    RegExp(r'\b(tel|phone|fax|whatsapp|mobile|contact)\b'),
    RegExp(r'\b(?:\+?\d[\d ()-]{6,}\d)\b'),
    RegExp(r'\b(www\.|https?://|\.com\b|\.net\b|\.org\b|\.hk\b|@[\w.-]+\.)'),
    RegExp(r'\b(email|instagram|facebook|wechat|line id|twitter|xhs)\b'),
    RegExp(r'\b(tax\s*id|tin|gst\s*no|vat\s*no|business\s*no|br\s*no)\b'),
    RegExp(r'\b(invoice|receipt|check|cheque|ticket)\s*(no|#|number|num)?\b'),
    RegExp(
      r'\b(table|tbl|store|branch|cashier|server|staff|register|reg|terminal|term|till|pos|order|ord|reference|ref)\s*[:#-]?\s*[a-z0-9-]+\b',
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
        RegExp(r'\b(tax|vat|gst)\b', caseSensitive: false),
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
  return _hasEnglishReceiptLabel(
    normalized,
    RegExp(r'\b(?:actual\s+tip|gratuity)\b', caseSensitive: false),
  );
}

bool _isSuggestedTipLine(String normalized) => RegExp(
  r'\b(?:suggested|optional|recommended)\s+tip\b',
).hasMatch(normalized);

bool _isWrappedItemDescriptionCandidate(String description) {
  if (description.length < 2 ||
      _lineHasAmount(description) ||
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
  return description.length >= 2 &&
      !_isLikelyNonItemDescription(description) &&
      _hasTraceableItemAmountToken(line, match.group(3)!);
}

bool _hasShippingLabel(String line, String normalized) {
  return _hasEnglishReceiptLabel(
    normalized,
    RegExp(r'\b(shipping|delivery)\b', caseSensitive: false),
  );
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
          r'\b(grand\s+total|amount\s+due|balance\s+due|total)\b',
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

  final amount = RegExp(_amountTokenPattern).firstMatch(normalized);
  if (amount == null) {
    return false;
  }

  final labelEndsBeforeAmount = label.end <= amount.start;
  final labelStartsAfterAmount = label.start >= amount.end;
  if (!labelEndsBeforeAmount && !labelStartsAfterAmount) {
    return false;
  }

  final leadingText = normalized.substring(0, amount.start).trim();
  final trailingText = normalized.substring(amount.end).trim();
  final textBesideAmount = labelEndsBeforeAmount ? leadingText : trailingText;
  final compactLabel = textBesideAmount
      .replaceAll(RegExp(r'[^\w\s-]'), ' ')
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

  return remaining.isEmpty;
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
