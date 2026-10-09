import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

// Generic printed table transcriptions, never private native OCR captures.
void main() {
  for (final mirrored in [false, true]) {
    test(
      'fully owned utility taxes need no extra review mirrored=$mirrored',
      () {
        final receipt = _utilityTable(
          mirrored: mirrored,
          variant: 'taxes only',
        );
        final preview = receipt.parse();
        expect(preview.tax, '1.50');
        expect(preview.total, '46.50');
        expect(preview.items.map((item) => item.lineTotal), ['40.00', '5.00']);
        expect(preview.adjustmentsComplete, isTrue);
        expect(preview.reviewHints, isEmpty);
        expect(preview.blocks, receipt.blocks);
      },
    );

    test('utility roles survive every item selector mirrored=$mirrored', () {
      final receipt = _utilityTable(mirrored: mirrored);
      final preview = receipt.parse();
      expect(preview.items.map((item) => item.description), [
        'Network Service',
        'Tax Guide',
      ]);
      expect(preview.items.map((item) => item.lineTotal), ['40.00', '5.00']);
      expect(preview.tax, '1.50');
      expect(preview.total, '49.20');
      // Printed charge arithmetic is 49.00. Never balance the twenty-cent
      // discrepancy or invent a destination for the unsupported fee/surcharge.
      expect(preview.service, isNull);
      expect(preview.adjustmentsComplete, isFalse);
      expect(preview.reviewHints, isNotEmpty);
      expect(preview.blocks, receipt.blocks);
    });

    for (final heading in [
      'Details of Current Charges',
      'Current Charges Detail',
      'Charges for this period',
    ]) {
      test('two-column combined adjustment $heading mirrored=$mirrored', () {
        final receipt = _utilityTable(
          mirrored: mirrored,
          usageColumns: false,
          heading: heading,
          combined: true,
        );
        final preview = receipt.parse();
        expect(preview.items.map((item) => item.description), [
          'Network Service',
          'Tax Guide',
        ]);
        expect(preview.tax, isNull);
        expect(preview.service, isNull);
        expect(preview.adjustmentsComplete, isFalse);
        expect(preview.reviewHints, isNotEmpty);
        expect(preview.blocks, receipt.blocks);
      });
    }

    for (final variant in [
      'missing amount',
      'missing label',
      'missing geometry',
      'crossed geometry',
      'extra amount',
      'foreign amount',
      'conflicting currency',
      'outside money',
      'outside financial label',
      'negative tax',
      'detached sign',
      'negative rate',
      'foreign rate',
      'conflicting rate',
      'missing rate header',
      'foreign usage',
    ]) {
      test('utility uncertainty $variant mirrored=$mirrored', () {
        final receipt = _utilityTable(mirrored: mirrored, variant: variant);
        final preview = receipt.parse();
        expect(preview.tax, isNot('1.50'));
        expect(preview.total, '49.20');
        expect(preview.adjustmentsComplete, isFalse);
        expect(preview.reviewHints, isNotEmpty);
        expect(preview.blocks, receipt.blocks);
      });
    }

    test('negative unsupported fee stays visible mirrored=$mirrored', () {
      final receipt = _utilityTable(
        mirrored: mirrored,
        variant: 'negative fee',
      );
      final preview = receipt.parse();
      expect(preview.items.map((item) => item.description), [
        'Network Service',
        'Tax Guide',
      ]);
      expect(preview.tax, '1.50');
      expect(preview.service, isNull);
      expect(preview.discount, isNull);
      expect(preview.adjustmentsComplete, isFalse);
      expect(preview.reviewHints, isNotEmpty);
      expect(preview.blocks, receipt.blocks);
    });

    for (final product in [
      'State Tax Software',
      'Local Tax Guide',
      'Tax Return Kit',
    ]) {
      test('priced tax-like table product $product mirrored=$mirrored', () {
        final receipt = _utilityTable(mirrored: mirrored, product: product);
        final preview = receipt.parse();
        expect(preview.items.map((item) => item.description), [
          'Network Service',
          product,
        ]);
        expect(preview.tax, '1.50');
        expect(preview.blocks, receipt.blocks);
      });
    }

    for (final variant in ['duplicate tax', 'tax summary', 'included tax']) {
      test('utility components retain $variant mirrored=$mirrored', () {
        final receipt = _utilityTable(mirrored: mirrored, variant: variant);
        final preview = receipt.parse();
        expect(preview.tax, isNull);
        expect(preview.adjustmentsComplete, isFalse);
        expect(preview.reviewHints, isNotEmpty);
        expect(preview.blocks, receipt.blocks);
      });
    }
  }

  for (final product in ['Tax Guide', 'Tax Software', 'Tax Toolkit']) {
    test('ordinary priced product remains an item: $product', () {
      final preview = const ReceiptOcrParser().parse(
        'Example Store\n2026-09-17\n$product USD 5.00\nTotal USD 5.00',
      );
      expect(preview.items.single.description, product);
      expect(preview.items.single.lineTotal, '5.00');
      expect(preview.tax, isNull);
    });
  }
}

class _TableReceipt {
  final blocks = <ReceiptOcrBlockEvidence>[];

  void cell(
    String text,
    int row,
    double left,
    double right, {
    bool mirrored = false,
    bool geometry = true,
  }) {
    if (mirrored) {
      final oldLeft = left;
      left = 1100 - right;
      right = 1100 - oldLeft;
    }
    blocks.add(
      ReceiptOcrBlockEvidence(
        text: text,
        order: blocks.length,
        row: row,
        points: geometry
            ? [
                ReceiptOcrPoint(x: left, y: row * 35),
                ReceiptOcrPoint(x: right, y: row * 35),
                ReceiptOcrPoint(x: right, y: row * 35 + 20),
                ReceiptOcrPoint(x: left, y: row * 35 + 20),
              ]
            : [],
      ),
    );
  }

  ReceiptOcrPreview parse() {
    final rows = <int, List<String>>{};
    for (final block in blocks) {
      (rows[block.row] ??= []).add(block.text);
    }
    return const ReceiptOcrParser().parse(
      rows.values.map((row) => row.join(' ')).join('\n'),
      blocks: blocks,
      fallbackCurrency: 'USD',
    );
  }
}

_TableReceipt _utilityTable({
  bool mirrored = false,
  bool usageColumns = true,
  String heading = 'Details of Current Charges',
  bool combined = false,
  String variant = '',
  String product = 'Tax Guide',
}) {
  final receipt = _TableReceipt();
  void cell(
    String text,
    int row,
    double left,
    double right, {
    bool geometry = true,
  }) => receipt.cell(
    text,
    row,
    left,
    right,
    mirrored: mirrored,
    geometry: geometry,
  );
  cell('Example Utility', 0, 30, 260);
  cell('Bill Date: 2026-09-17', 1, 30, 260);
  cell(heading, 2, 30, 320);
  cell('Description', 3, 30, 140);
  if (usageColumns) {
    cell('Usage', 3, 350, 410);
    if (variant != 'missing rate header') cell('Rate', 3, 480, 550);
  }
  cell('Amount', 3, 660, 730);
  cell('Information', 3, 850, 1040);
  void charge(String label, String amount, int row) {
    cell(label, row, 30, 300);
    if (usageColumns) {
      cell('10', row, 360, 400);
      cell('USD 0.1200', row, 470, 560);
    }
    cell(amount, row, 660, 730);
  }

  charge('Network Service', 'USD 40.00', 4);
  charge(product, 'USD 5.00', 5);
  if (combined) {
    charge('Taxes and Regulatory Fees', 'USD 4.00', 6);
  } else {
    if (variant != 'missing label') {
      cell('State Utility Tax', 6, 30, 300);
    }
    if (usageColumns) {
      cell(variant == 'foreign usage' ? 'EUR 10' : '10', 6, 360, 400);
      cell(
        switch (variant) {
          'negative rate' => 'USD -0.1200',
          'foreign rate' => 'EUR 0.1200',
          'conflicting rate' => 'EUR USD 0.1200',
          _ => 'USD 0.1200',
        },
        6,
        470,
        560,
      );
    }
    if (variant != 'missing amount') {
      cell(
        switch (variant) {
          'foreign amount' => 'EUR 1.20',
          'conflicting currency' => 'EUR USD 1.20',
          'negative tax' => 'USD -1.20',
          _ => 'USD 1.20',
        },
        6,
        variant == 'crossed geometry' ? 490 : 660,
        730,
        geometry: variant != 'missing geometry',
      );
    }
    if (variant == 'extra amount') cell('USD 2.00', 6, 670, 735);
    if (variant == 'detached sign') cell('-', 6, 640, 650);
    cell(
      switch (variant) {
        'outside money' => 'USD 7.00',
        'outside financial label' => 'Fee',
        _ => 'Go Paperless',
      },
      6,
      850,
      1040,
    );
    charge(
      variant == 'duplicate tax' ? 'State Utility Tax' : 'Local Utility Tax',
      'USD 0.30',
      7,
    );
    if (variant != 'taxes only') {
      charge(
        'Environmental Program Fee',
        variant == 'negative fee' ? 'USD -2.00' : 'USD 2.00',
        8,
      );
      cell('Use our online portal', 8, 850, 1040);
      charge('Energy Assistance Surcharge', 'USD 0.50', 9);
    }
    if (variant == 'tax summary') cell('Tax USD 1.50', 10, 30, 300);
    if (variant == 'included tax') {
      cell('VAT included USD 1.50', 10, 30, 300);
    }
  }
  cell('Total Current Charges', 11, 30, 300);
  cell(variant == 'taxes only' ? 'USD 46.50' : 'USD 49.20', 11, 660, 730);
  return receipt;
}
