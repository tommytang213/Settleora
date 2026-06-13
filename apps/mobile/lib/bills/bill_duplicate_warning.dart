import '../receipt_ocr_capture/receipt_ocr_preview.dart';
import 'bill_repository.dart';

class BillDuplicateWarningCandidate {
  const BillDuplicateWarningCandidate({
    required this.billId,
    required this.merchantName,
    required this.billDate,
    required this.totalAmount,
    required this.totalCurrency,
  });

  factory BillDuplicateWarningCandidate.fromSummary(SettleoraBillSummary bill) {
    return BillDuplicateWarningCandidate(
      billId: bill.id,
      merchantName: bill.merchantName,
      billDate: bill.billDate,
      totalAmount: bill.totalAmount,
      totalCurrency: bill.totalCurrency,
    );
  }

  final String billId;
  final String? merchantName;
  final String billDate;
  final String totalAmount;
  final String totalCurrency;
}

class BillDuplicateWarning {
  const BillDuplicateWarning({
    required this.title,
    required this.message,
    required this.reason,
    required this.matchedBillId,
  });

  final String title;
  final String message;
  final String reason;
  final String matchedBillId;
}

BillDuplicateWarning? possibleReceiptDuplicateWarning({
  required ReceiptOcrPreview preview,
  required Iterable<BillDuplicateWarningCandidate> existingBills,
}) {
  final previewCurrency = preview.currency?.trim().toUpperCase();
  final previewTotal = _parseExactDecimalAmount(preview.total);
  final previewDate = _normalizeBillDate(preview.receiptDate);
  final previewMerchant = _normalizeMerchant(preview.merchant);

  if (previewCurrency == null ||
      previewCurrency.isEmpty ||
      previewTotal == null ||
      previewDate == null ||
      previewMerchant.isEmpty) {
    return null;
  }

  for (final bill in existingBills) {
    final billCurrency = bill.totalCurrency.trim().toUpperCase();
    if (billCurrency != previewCurrency) {
      continue;
    }

    final billTotal = _parseExactDecimalAmount(bill.totalAmount);
    if (billTotal == null ||
        !_exactDecimalAmountsEqual(previewTotal, billTotal)) {
      continue;
    }

    if (_normalizeBillDate(bill.billDate) != previewDate) {
      continue;
    }

    if (!_merchantLooksSimilar(
      previewMerchant,
      _normalizeMerchant(bill.merchantName),
    )) {
      continue;
    }

    return BillDuplicateWarning(
      title: 'Possible duplicate receipt',
      message: 'This looks similar to an existing bill. Review before saving.',
      reason: 'Matched merchant, date, total, and currency.',
      matchedBillId: bill.billId,
    );
  }

  return null;
}

String? _normalizeBillDate(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }

  final match = RegExp(
    r'^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$',
  ).firstMatch(trimmed);
  if (match == null) {
    return null;
  }

  final year = int.tryParse(match.group(1)!);
  final month = int.tryParse(match.group(2)!);
  final day = int.tryParse(match.group(3)!);
  if (year == null ||
      month == null ||
      day == null ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31) {
    return null;
  }
  final parsedDate = DateTime.utc(year, month, day);
  if (parsedDate.year != year ||
      parsedDate.month != month ||
      parsedDate.day != day) {
    return null;
  }

  return '${year.toString().padLeft(4, '0')}-'
      '${month.toString().padLeft(2, '0')}-'
      '${day.toString().padLeft(2, '0')}';
}

String _normalizeMerchant(String? value) {
  final normalized = (value ?? '')
      .toLowerCase()
      .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
      .trim();
  if (normalized.isEmpty) {
    return '';
  }

  return normalized
      .split(RegExp(r'\s+'))
      .where((token) => token.isNotEmpty)
      .join(' ');
}

bool _merchantLooksSimilar(String left, String right) {
  if (left.isEmpty || right.isEmpty) {
    return false;
  }
  if (left == right) {
    return true;
  }

  final leftTokens = left
      .split(' ')
      .where((token) => token.length >= 3)
      .toSet();
  final rightTokens = right
      .split(' ')
      .where((token) => token.length >= 3)
      .toSet();
  if (leftTokens.isEmpty || rightTokens.isEmpty) {
    return false;
  }

  final overlap = leftTokens.intersection(rightTokens).length;
  return overlap >= 2;
}

bool _exactDecimalAmountsEqual(
  _ExactDecimalAmount left,
  _ExactDecimalAmount right,
) {
  final scale = left.scale > right.scale ? left.scale : right.scale;
  return left.value * _bigIntPow10(scale - left.scale) ==
      right.value * _bigIntPow10(scale - right.scale);
}

_ExactDecimalAmount? _parseExactDecimalAmount(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }

  final match = RegExp(r'^(\d+)(?:\.(\d+))?$').firstMatch(trimmed);
  if (match == null) {
    return null;
  }

  final whole = match.group(1)!;
  final fractional = match.group(2) ?? '';
  final digits = '$whole$fractional'.replaceFirst(RegExp(r'^0+(?=\d)'), '');
  return _ExactDecimalAmount(
    value: BigInt.parse(digits.isEmpty ? '0' : digits),
    scale: fractional.length,
  );
}

BigInt _bigIntPow10(int exponent) {
  var value = BigInt.one;
  for (var index = 0; index < exponent; index += 1) {
    value *= BigInt.from(10);
  }
  return value;
}

class _ExactDecimalAmount {
  const _ExactDecimalAmount({required this.value, required this.scale});

  final BigInt value;
  final int scale;
}
