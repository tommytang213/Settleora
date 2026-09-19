const int receiptOcrReviewLineLimit = 100;

class ReceiptOcrPreview {
  const ReceiptOcrPreview({
    this.merchant,
    this.receiptDate,
    this.currency,
    this.currencyProvenance = ReceiptOcrCurrencyProvenance.explicit,
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
    this.rawTextLineCount = 0,
    this.confidence,
    this.category,
    this.warnings = const [],
    this.items = const [],
    this.blocks = const [],
    this.runEvidence,
  });

  final String? merchant;
  final String? receiptDate;
  final String? currency;
  final ReceiptOcrCurrencyProvenance currencyProvenance;
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
  final int rawTextLineCount;
  final double? confidence;
  final String? category;
  final List<String> warnings;
  final List<ReceiptOcrItemCandidate> items;
  final List<ReceiptOcrBlockEvidence> blocks;
  final ReceiptOcrRunEvidence? runEvidence;

  List<String> get reviewHints {
    return _receiptOcrReviewHints(this);
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

class ReceiptOcrRunEvidence {
  const ReceiptOcrRunEvidence({
    this.detectionModelPackId,
    this.detectionModelVersion,
    this.runtime,
  });
  final String? detectionModelPackId;
  final String? detectionModelVersion;
  final String? runtime;
}

class ReceiptOcrItemCandidate {
  const ReceiptOcrItemCandidate({
    required this.description,
    this.quantity,
    this.unitPrice,
    this.lineTotal,
    this.currency,
    this.confidence,
    this.category,
  });

  final String description;
  final String? quantity;
  final String? unitPrice;
  final String? lineTotal;
  final String? currency;
  final double? confidence;
  final String? category;
}

List<String> _receiptOcrReviewHints(ReceiptOcrPreview preview) {
  final itemTotal = _sumReceiptOcrItemLineTotals(preview.items);
  if (itemTotal == null) {
    return const [];
  }

  final subtotal = _parseReceiptOcrReviewAmount(preview.subtotal);
  if (_hasReviewAmountText(preview.subtotal)) {
    if (subtotal == null) {
      return const [];
    }
    if (!_receiptOcrAmountsClose(itemTotal, subtotal)) {
      return const [
        'OCR item total differs from detected subtotal. Review the receipt before applying.',
      ];
    }

    final total = _parseReceiptOcrReviewAmount(preview.total);
    if (total != null &&
        _hasReceiptOcrReferenceAdjustment(preview) &&
        !_receiptOcrAmountsClose(itemTotal, total)) {
      return const [
        'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
      ];
    }

    return const [];
  }

  final total = _parseReceiptOcrReviewAmount(preview.total);
  if (total == null) {
    return const [];
  }

  if (_hasReceiptOcrReferenceAdjustment(preview)) {
    if (!_receiptOcrAmountsClose(itemTotal, total)) {
      return const [
        'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
      ];
    }
    return const [];
  }

  if (!_receiptOcrAmountsClose(itemTotal, total)) {
    return const [
      'OCR item total differs from detected grand total. Review the receipt before applying.',
    ];
  }

  return const [];
}

int? _sumReceiptOcrItemLineTotals(List<ReceiptOcrItemCandidate> items) {
  int? total;
  for (final item in items) {
    final amount = _parseReceiptOcrReviewAmount(item.lineTotal);
    if (amount == null) {
      continue;
    }
    total = (total ?? 0) + amount;
  }

  return total;
}

bool _hasReceiptOcrReferenceAdjustment(ReceiptOcrPreview preview) {
  final amounts = [
    _parseReceiptOcrReviewAmount(preview.tax),
    _parseReceiptOcrReviewAmount(preview.service),
    if (_adjustmentCurrencyMatchesReview(
      reviewCurrency: preview.currency,
      adjustmentCurrency: preview.tipCurrency,
      hasExplicitCurrencyEvidence: preview.tipHasExplicitCurrencyEvidence,
    ))
      _parseReceiptOcrReviewAmount(preview.tip),
    if (_adjustmentCurrencyMatchesReview(
      reviewCurrency: preview.currency,
      adjustmentCurrency: preview.shippingCurrency,
      hasExplicitCurrencyEvidence: preview.shippingHasExplicitCurrencyEvidence,
    ))
      _parseReceiptOcrReviewAmount(preview.shipping),
    _parseReceiptOcrReviewAmount(preview.discount),
  ];
  return amounts.any((amount) => amount != null && amount != 0);
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

bool _receiptOcrAmountsClose(int left, int right) {
  return (left - right).abs() <= 10;
}

int? _parseReceiptOcrReviewAmount(String? value) {
  final normalized = value?.trim();
  if (normalized == null ||
      !RegExp(r'^-?\d+(?:\.\d{1,3})?$').hasMatch(normalized)) {
    return null;
  }

  final sign = normalized.startsWith('-') ? -1 : 1;
  final unsigned = normalized.startsWith('-')
      ? normalized.substring(1)
      : normalized;
  final parts = unsigned.split('.');
  final major = int.tryParse(parts.first);
  if (major == null) {
    return null;
  }

  final fraction = parts.length == 2 ? parts[1].padRight(3, '0') : '000';
  final minor = int.tryParse(fraction);
  if (minor == null) {
    return null;
  }

  return sign * ((major * 1000) + minor);
}
