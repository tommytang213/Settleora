import 'receipt_ocr_preview.dart';

class ReceiptOcrParser {
  const ReceiptOcrParser();

  ReceiptOcrPreview parse(String recognizedText) {
    final lines = recognizedText
        .split(RegExp(r'\r?\n'))
        .map((line) => line.trim())
        .where((line) => line.isNotEmpty)
        .toList(growable: false);
    final warnings = <String>[];
    if (lines.isEmpty) {
      return const ReceiptOcrPreview(
        warnings: ['No readable receipt text was found.'],
      );
    }

    final currencyDetection = _detectCurrency(lines);
    final currency = currencyDetection.currency;
    final amounts = _extractLabeledAmounts(lines);
    final itemCandidates = _extractItems(lines, currency);
    if (itemCandidates.isEmpty) {
      warnings.add('No clear item lines were detected.');
    }
    if (amounts.total == null && itemCandidates.isEmpty) {
      warnings.add('No clear total amount was detected.');
    }
    if (currencyDetection.isSymbolOnly) {
      warnings.add(
        'Currency was inferred from a symbol. Confirm the currency before applying.',
      );
    }

    return ReceiptOcrPreview(
      merchant: _detectMerchant(lines),
      receiptDate: _detectDate(lines),
      currency: currency,
      subtotal: amounts.subtotal,
      tax: amounts.tax,
      service: amounts.service,
      discount: amounts.discount,
      total: amounts.total,
      rawTextLineCount: lines.length,
      category: 'receipt',
      warnings: warnings,
      items: itemCandidates,
    );
  }

  String? _detectMerchant(List<String> lines) {
    for (final line in lines.take(5)) {
      if (_isAdministrativeLine(line) || _lineHasAmount(line)) {
        continue;
      }
      return _cleanDescription(line);
    }

    return null;
  }

  String? _detectDate(List<String> lines) {
    for (final line in lines) {
      final iso = RegExp(
        r'\b(20\d{2}|19\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b',
      ).firstMatch(line);
      if (iso != null) {
        return _formatDate(
          int.parse(iso.group(1)!),
          int.parse(iso.group(2)!),
          int.parse(iso.group(3)!),
        );
      }

      final slash = RegExp(
        r'\b(\d{1,2})/(\d{1,2})/(20\d{2}|19\d{2})\b',
      ).firstMatch(line);
      if (slash != null) {
        final first = int.parse(slash.group(1)!);
        final second = int.parse(slash.group(2)!);
        final year = int.parse(slash.group(3)!);
        if (first > 12) {
          return _formatDate(year, second, first);
        }
        return _formatDate(year, first, second);
      }
    }

    return null;
  }

  _ReceiptCurrencyDetection _detectCurrency(List<String> lines) {
    final joined = lines.join(' ').toUpperCase();
    for (final code in _supportedCurrencyCodes) {
      if (RegExp('\\b$code\\b').hasMatch(joined)) {
        return _ReceiptCurrencyDetection(currency: code);
      }
    }
    if (joined.contains('HK\$')) {
      return const _ReceiptCurrencyDetection(currency: 'HKD');
    }
    if (joined.contains(r'$')) {
      return const _ReceiptCurrencyDetection(
        currency: 'USD',
        isSymbolOnly: true,
      );
    }
    return const _ReceiptCurrencyDetection();
  }

  _LabeledReceiptAmounts _extractLabeledAmounts(List<String> lines) {
    String? subtotal;
    String? tax;
    String? service;
    String? discount;
    String? total;

    for (final line in lines) {
      final normalized = line.toLowerCase();
      final amount = _lastAmountInLine(line);
      if (amount == null) {
        continue;
      }

      if (_hasSubtotalLabel(line, normalized)) {
        subtotal ??= amount;
      } else if (_hasTaxLabel(line, normalized)) {
        tax ??= amount;
      } else if (_hasServiceChargeLabel(line, normalized)) {
        service ??= amount;
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
      discount: discount,
      total: total,
    );
  }

  List<ReceiptOcrItemCandidate> _extractItems(
    List<String> lines,
    String? currency,
  ) {
    final items = <ReceiptOcrItemCandidate>[];
    for (final line in lines) {
      if (_isAdministrativeLine(line)) {
        continue;
      }

      final match = RegExp(
        r'^(.+?)\s+([A-Z]{3}|HK\$|\$)?\s*(-?\d{1,6}(?:,\d{3})*(?:\.\d{1,3})?|-?\d+\.\d{1,3})$',
        caseSensitive: false,
      ).firstMatch(line);
      if (match == null) {
        continue;
      }

      final description = _cleanDescription(match.group(1)!);
      final lineTotal = _normalizeAmount(match.group(3)!);
      if (description.length < 2 ||
          lineTotal == null ||
          lineTotal.startsWith('-')) {
        continue;
      }

      final quantityMatch = RegExp(
        r'^(.*?)\s+(\d{1,3})\s*[xX@]\s*(\d{1,6}(?:\.\d{1,3})?)$',
      ).firstMatch(description);
      if (quantityMatch != null) {
        final quantity = quantityMatch.group(2)!;
        final unitPrice = _normalizeAmount(quantityMatch.group(3)!);
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
}

class _LabeledReceiptAmounts {
  const _LabeledReceiptAmounts({
    this.subtotal,
    this.tax,
    this.service,
    this.discount,
    this.total,
  });

  final String? subtotal;
  final String? tax;
  final String? service;
  final String? discount;
  final String? total;
}

class _ReceiptCurrencyDetection {
  const _ReceiptCurrencyDetection({this.currency, this.isSymbolOnly = false});

  final String? currency;
  final bool isSymbolOnly;
}

const _supportedCurrencyCodes = <String>{
  'USD',
  'HKD',
  'EUR',
  'GBP',
  'JPY',
  'KWD',
  'BHD',
};

bool _lineHasAmount(String line) {
  return _lastAmountInLine(line) != null;
}

String? _lastAmountInLine(String line) {
  final matches = RegExp(
    r'(?<![A-Za-z0-9])-?\d{1,6}(?:,\d{3})*(?:\.\d{1,3})?(?![A-Za-z0-9])',
  ).allMatches(line).toList(growable: false);
  if (matches.isEmpty) {
    return null;
  }

  return _normalizeAmount(matches.last.group(0)!);
}

String? _normalizeAmount(String value) {
  final normalized = value.replaceAll(',', '').trim();
  if (!RegExp(r'^-?\d+(?:\.\d{1,3})?$').hasMatch(normalized)) {
    return null;
  }
  return normalized;
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

bool _hasSubtotalLabel(String line, String normalized) {
  return _hasEnglishReceiptLabel(
        normalized,
        RegExp(r'\bsub[\s-]?total\b', caseSensitive: false),
      ) ||
      _hasJapaneseReceiptLabel(line, const ['小計']);
}

bool _hasTaxLabel(String line, String normalized) {
  return _hasEnglishReceiptLabel(
        normalized,
        RegExp(r'\b(tax|vat|gst)\b', caseSensitive: false),
      ) ||
      _hasJapaneseReceiptLabel(line, const ['消費税', '税']);
}

bool _hasServiceChargeLabel(String line, String normalized) {
  return _hasEnglishReceiptLabel(
        normalized,
        RegExp(r'\bservice\s*(charge|fee)?\b', caseSensitive: false),
      ) ||
      _hasJapaneseReceiptLabel(line, const ['サービス料']);
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
      _hasJapaneseReceiptLabel(line, const ['合計']);
}

bool _hasEnglishReceiptLabel(String normalized, RegExp labelPattern) {
  final label = labelPattern.firstMatch(normalized);
  if (label == null) {
    return false;
  }

  final amount = RegExp(
    r'-?\d{1,6}(?:,\d{3})*(?:\.\d{1,3})?',
  ).firstMatch(normalized);
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
        RegExp(r'\b(usd|hkd|eur|gbp|jpy|kwd|bhd)\b', caseSensitive: false),
        ' ',
      )
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();

  return remaining.isEmpty;
}

bool _hasJapaneseReceiptLabel(String line, List<String> labels) {
  final amount = RegExp(r'-?\d{1,6}(?:,\d{3})*(?:\.\d{1,3})?').firstMatch(line);
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

String? _formatDate(int year, int month, int day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return '${year.toString().padLeft(4, '0')}-'
      '${month.toString().padLeft(2, '0')}-'
      '${day.toString().padLeft(2, '0')}';
}
