class ReceiptOcrPreview {
  const ReceiptOcrPreview({
    this.merchant,
    this.receiptDate,
    this.currency,
    this.subtotal,
    this.tax,
    this.service,
    this.discount,
    this.total,
    this.rawTextLineCount = 0,
    this.confidence,
    this.category,
    this.warnings = const [],
    this.items = const [],
  });

  final String? merchant;
  final String? receiptDate;
  final String? currency;
  final String? subtotal;
  final String? tax;
  final String? service;
  final String? discount;
  final String? total;
  final int rawTextLineCount;
  final double? confidence;
  final String? category;
  final List<String> warnings;
  final List<ReceiptOcrItemCandidate> items;

  bool get hasApplyableFields {
    return merchant != null ||
        receiptDate != null ||
        currency != null ||
        items.isNotEmpty;
  }
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
