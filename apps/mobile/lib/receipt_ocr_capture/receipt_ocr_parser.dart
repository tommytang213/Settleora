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

    final currency = _detectCurrency(lines);
    final amounts = _extractLabeledAmounts(lines);
    final itemCandidates = _extractItems(lines, currency);
    if (itemCandidates.isEmpty) {
      warnings.add('No clear item lines were detected.');
    }
    if (amounts.total == null && itemCandidates.isEmpty) {
      warnings.add('No clear total amount was detected.');
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

  String? _detectCurrency(List<String> lines) {
    final joined = lines.join(' ').toUpperCase();
    for (final code in _supportedCurrencyCodes) {
      if (RegExp('\\b$code\\b').hasMatch(joined)) {
        return code;
      }
    }
    if (joined.contains('HK\$')) {
      return 'HKD';
    }
    if (joined.contains(r'$')) {
      return 'USD';
    }
    return null;
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

      if (normalized.contains('subtotal') || normalized.contains('sub total')) {
        subtotal ??= amount;
      } else if (normalized.contains('tax') ||
          normalized.contains('vat') ||
          normalized.contains('gst')) {
        tax ??= amount;
      } else if (normalized.contains('service')) {
        service ??= amount;
      } else if (normalized.contains('discount') ||
          normalized.contains('coupon')) {
        discount ??= amount;
      } else if (normalized.contains('grand total') ||
          normalized.contains('total') ||
          normalized.contains('amount due') ||
          normalized.contains('balance')) {
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
  return normalized.contains('subtotal') ||
      normalized.contains('sub total') ||
      normalized.contains('total') ||
      normalized.contains('tax') ||
      normalized.contains('service') ||
      normalized.contains('discount') ||
      normalized.contains('coupon') ||
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

String? _formatDate(int year, int month, int day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return '${year.toString().padLeft(4, '0')}-'
      '${month.toString().padLeft(2, '0')}-'
      '${day.toString().padLeft(2, '0')}';
}
