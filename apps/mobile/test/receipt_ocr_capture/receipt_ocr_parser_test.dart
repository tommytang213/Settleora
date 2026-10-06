import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/mlkit_receipt_ocr_provider.dart';
import 'package:mobile/receipt_ocr_capture/receipt_image_normalization_policy.dart';
import 'package:mobile/receipt_ocr_capture/receipt_intake_safety.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_provider.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';
import 'package:mobile/receipt_ocr_capture/unsupported_receipt_ocr_provider.dart';
import 'package:mobile/ui/settleora_form_fields.dart';

ReceiptOcrBlockEvidence _layoutBlock(
  String text,
  int order,
  int row,
  double left,
  double right, {
  String? textDirection,
}) => ReceiptOcrBlockEvidence(
  text: text,
  order: order,
  row: row,
  textDirection: textDirection,
  points: [
    ReceiptOcrPoint(x: left, y: row * 20),
    ReceiptOcrPoint(x: right, y: row * 20),
    ReceiptOcrPoint(x: right, y: row * 20 + 12),
    ReceiptOcrPoint(x: left, y: row * 20 + 12),
  ],
);

List<ReceiptOcrBlockEvidence> _boundedUtilityBlocks({
  String support = 'Mon - Fri, 8 AM - 8 PM PT',
  String period = 'Feb 5 – Mar 4, 2025',
  bool splitDescription = false,
  bool extraInteriorHeading = false,
  String description = 'Internet Plan 500',
  String serviceAmount = r'$59.99',
  String discountAmount = r'-$10.00',
}) => [
  _layoutBlock('Network Utility', 0, 0, 20, 350),
  _layoutBlock('Current Charges Detail', 1, 1, 20, 717),
  _layoutBlock('Description', 2, 2, 49, 140),
  if (extraInteriorHeading) _layoutBlock('Reference', 3, 2, 310, 365),
  _layoutBlock('Service Period', 4, 2, 417, 529),
  _layoutBlock('Amount', 5, 2, 652, 717),
  _layoutBlock('Support', 6, 2, 828, 960),
  if (splitDescription) ...[
    _layoutBlock('Internet', 7, 3, 50, 140),
    _layoutBlock('Plan 500', 8, 3, 180, 383),
  ] else
    _layoutBlock(description, 7, 3, 50, 383),
  _layoutBlock(period, 9, 3, 417, 567),
  _layoutBlock(serviceAmount, 10, 3, 659, 716),
  _layoutBlock(support, 11, 3, 828, 1020),
  _layoutBlock('Loyalty Discount (12 months)', 12, 4, 51, 265),
  _layoutBlock(period, 13, 4, 417, 566),
  _layoutBlock(discountAmount, 14, 4, 652, 718),
  _layoutBlock('Live Chat', 15, 4, 827, 907),
  _layoutBlock('State Tax', 16, 5, 51, 193),
  _layoutBlock(period, 17, 5, 417, 566),
  _layoutBlock(r'$4.31', 18, 5, 667, 717),
  _layoutBlock('Total Current Charges USD 54.30', 19, 6, 50, 717),
];

ReceiptOcrPreview _parseBoundedUtility(List<ReceiptOcrBlockEvidence> blocks) {
  final rows = <int, List<String>>{};
  for (final block in blocks) {
    (rows[block.row] ??= []).add(block.text);
  }
  return const ReceiptOcrParser().parse(
    rows.values.map((row) => row.join(' ')).join('\n'),
    fallbackCurrency: 'USD',
    blocks: blocks,
  );
}

List<ReceiptOcrBlockEvidence> _summaryCardBlocks() {
  final blocks = <ReceiptOcrBlockEvidence>[];
  void block(
    String text,
    int row,
    double left,
    double top,
    double right,
    double bottom,
  ) {
    blocks.add(
      ReceiptOcrBlockEvidence(
        text: text,
        row: row,
        order: blocks.length,
        points: [
          ReceiptOcrPoint(x: left, y: top),
          ReceiptOcrPoint(x: right, y: top),
          ReceiptOcrPoint(x: right, y: bottom),
          ReceiptOcrPoint(x: left, y: bottom),
        ],
      ),
    );
  }

  block('Orbit Communications', 0, 35, 35, 335, 55);
  block('Internet Service Bill', 1, 35, 133, 343, 163);
  block('Total Due', 2, 761, 162, 875, 191);
  block('Customer Name', 3, 34, 192, 157, 213);
  block('Account Number', 3, 372, 194, 494, 212);
  block('AC987654321', 3, 530, 193, 639, 214);
  block('Alex Q. Sample', 4, 35, 216, 187, 237);
  block('Invoice Date', 4, 371, 229, 467, 249);
  block('Apr 5, 2026', 4, 531, 230, 623, 250);
  block('USD 42.00', 4, 761, 198, 945, 254);
  block('Current Charges Detail', 5, 49, 675, 310, 695);
  block('Description', 6, 49, 725, 140, 747);
  block('Service Period', 6, 417, 725, 529, 745);
  block('Amount', 6, 652, 725, 717, 747);
  block('Broadband Plan', 7, 50, 758, 383, 779);
  block('Mar 5 – Apr 4, 2026', 7, 417, 758, 567, 778);
  block('USD 35.00', 7, 650, 756, 717, 780);
  block('Router Rental', 8, 51, 789, 193, 811);
  block('Mar 5 – Apr 4, 2026', 8, 417, 791, 566, 809);
  block('USD 7.00', 8, 650, 788, 717, 812);
  block('Total Current Charges', 9, 57, 976, 241, 997);
  block('USD 42.00', 9, 642, 974, 717, 1002);
  return blocks;
}

ReceiptOcrBlockEvidence _summaryBlockVariant(
  ReceiptOcrBlockEvidence block, {
  String? text,
  double dx = 0,
  double dy = 0,
  bool withGeometry = true,
}) => ReceiptOcrBlockEvidence(
  text: text ?? block.text,
  row: block.row,
  order: block.order,
  points: withGeometry
      ? block.points
            .map((p) => ReceiptOcrPoint(x: p.x + dx, y: p.y + dy))
            .toList()
      : const [],
);

List<ReceiptOcrBlockEvidence> _ownedFeeBlocks({
  bool sidebar = false,
  String label = 'Municipal Connectivity Fee (2.00%)',
  double scale = 1,
  String period = 'Feb 5 - Mar 4, 2025',
  String? amount = 'USD 0.89',
  bool duplicateAmount = false,
  bool supportHeader = true,
}) {
  final blocks = <ReceiptOcrBlockEvidence>[];
  void cell(String text, int row, double x, double right) {
    blocks.add(
      ReceiptOcrBlockEvidence(
        text: text,
        row: row,
        order: blocks.length,
        points: [
          ReceiptOcrPoint(x: x * scale, y: row * 40 * scale),
          ReceiptOcrPoint(x: right * scale, y: row * 40 * scale),
          ReceiptOcrPoint(x: right * scale, y: (row * 40 + 20) * scale),
          ReceiptOcrPoint(x: x * scale, y: (row * 40 + 20) * scale),
        ],
      ),
    );
  }

  cell('Sample Utility', 0, 50, 250);
  cell('Current Charges Detail', 1, 50, 320);
  cell('Description', 2, 50, 180);
  cell('Service Period', 2, 420, 540);
  cell('Amount', 2, 650, 720);
  if (supportHeader) cell('Support', 2, 780, 940);
  cell('Broadband Plan', 3, 50, 270);
  cell('Feb 5 - Mar 4, 2025', 3, 420, 610);
  cell('USD 20.00', 3, 650, 720);
  cell(label, 4, 50, 350);
  cell(period, 4, 420, 610);
  if (amount != null) cell(amount, 4, 650, 720);
  if (duplicateAmount) cell('USD 0.90', 4, 650, 720);
  if (sidebar) cell('Help Center', 4, 780, 940);
  cell('Total Current Charges', 5, 50, 300);
  cell('USD 20.89', 5, 650, 720);
  return blocks;
}

void main() {
  group('included-tax currency ownership', () {
    for (final cell in <(String, String?)>[
      ('eur4.00', 'EUR'),
      ('4.00eur', 'EUR'),
      ('Eur4.00', 'EUR'),
      ('kr4.00', null),
      ('4.00kr', null),
      ('Rs4.00', null),
      ('4.00Rs', null),
      (r'$4.00', null),
      ('¥4.00', '¥'),
    ]) {
      test('foreign or ambiguous tax cell keeps evidence: ${cell.$1}', () {
        for (final label in ['VAT included', 'VAT included 20%']) {
          final preview = const ReceiptOcrParser().parse(
            'Sample Shop\nNotebook GBP 20.00\nTotal incl. VAT GBP 24.00\n'
            '$label ${cell.$1}',
          );
          expect(preview.currency, 'GBP');
          expect(preview.total, '24.00');
          expect(preview.tax, '4.00');
          expect(preview.taxCurrency, cell.$2);
          expect(preview.taxHasExplicitCurrencyEvidence, isTrue);
          expect(preview.reviewHints, isNotEmpty);
        }
      });
    }
    for (final cell in [
      ('GBP', 'gbp4.00'),
      ('GBP', '4.00gBp'),
      ('SEK', 'kr4.00'),
      ('INR', '4.00Rs'),
      ('USD', r'$4.00'),
      ('JPY', '¥4'),
    ]) {
      test('compatible tax currency remains owned: ${cell.$1} ${cell.$2}', () {
        for (final label in ['VAT included', 'VAT included 20%']) {
          final preview = const ReceiptOcrParser().parse(
            'Sample Shop\nNotebook ${cell.$1} 20.00\n'
            'Total incl. VAT ${cell.$1} 24.00\n$label ${cell.$2}',
          );
          expect(preview.currency, cell.$1);
          expect(double.parse(preview.tax!), 4);
          expect(preview.taxCurrency, cell.$1);
          expect(preview.taxHasExplicitCurrencyEvidence, isTrue);
        }
      });
    }
    test('bare tax amount does not invent printed currency evidence', () {
      final preview = const ReceiptOcrParser().parse(
        'Sample Shop\nNotebook GBP 20.00\nTotal incl. VAT GBP 24.00\n'
        'VAT included 4.00',
      );
      expect(preview.tax, '4.00');
      expect(preview.taxCurrency, isNull);
      expect(preview.taxHasExplicitCurrencyEvidence, isFalse);
    });
  });

  test(
    'included-tax extraction preserves a printed net item without inventing a subtotal',
    () {
      final preview = const ReceiptOcrParser().parse(
        'Sample Shop\nNotebook GBP 20.00\nTotal incl. VAT GBP 24.00\n'
        'VAT included 20% GBP 4.00',
      );
      // Preserve printed net lines. The downstream contribution gate blocks
      // Apply until the reviewed rows represent the gross receipt amount.
      expect(preview.items.single.lineTotal, '20.00');
      expect(preview.total, '24.00');
      expect(preview.tax, '4.00');
      expect(preview.subtotal, isNull);
    },
  );

  test('included-tax attached code preserves the complete amount token', () {
    for (final amount in ['4.00', '4.25']) {
      final preview = const ReceiptOcrParser().parse(
        'Sample Shop\nNotebook GBP 24.00\nTotal incl. VAT GBP24.00\n'
        'VAT included 20% GBP$amount',
      );
      expect(preview.tax, amount);
      expect(preview.total, '24.00');
      expect(preview.items.single.lineTotal, '24.00');
      expect(preview.taxIncludedInTotal, isTrue);
      expect(
        preview.reviewHints,
        isEmpty,
        reason:
            '${preview.incompleteAdjustmentReasons} ${preview.reviewHintDecision}',
      );
    }
  });

  for (final label in ['VAT included', 'Included VAT', 'VAT (included)']) {
    test('review round two distinct included rates aggregate $label', () {
      final preview = const ReceiptOcrParser().parse(
        'Sample Shop\nBook GBP 11.00\nNotebook GBP 12.00\n'
        'Total incl. VAT GBP 23.00\n'
        '$label 10% GBP 1.00\n$label 20% GBP 2.00',
      );
      expect(preview.tax, '3.00');
      expect(preview.total, '23.00');
      expect(preview.taxIncludedInTotal, isTrue);
      expect(preview.items, hasLength(2));
      expect(preview.reviewHints, isEmpty);
    });
  }

  group('included-tax financial summary ownership', () {
    for (final pair in [
      ('Total incl. VAT', 'VAT included 20%'),
      ('Total including GST', 'GST included'),
      ('Grand total inclusive of sales tax', 'Included sales tax (20%)'),
      ('Total (VAT included)', 'VAT included (20%)'),
    ]) {
      test('complete labels ${pair.$1} and ${pair.$2}', () {
        final texts = [
          'Sample Shop',
          'Notebook GBP 24.00',
          '${pair.$1} GBP 24.00',
          '${pair.$2} GBP 4.00',
        ];
        final blocks = [
          for (final (index, text) in texts.indexed)
            _layoutBlock(text, index, index, 20, 350),
        ];
        final preview = const ReceiptOcrParser().parse(
          texts.join('\n'),
          blocks: blocks,
        );
        expect(preview.total, '24.00');
        expect(preview.tax, '4.00');
        expect(preview.taxCurrency, 'GBP');
        expect(preview.subtotal, isNull);
        expect(preview.items, hasLength(1));
        expect(preview.items.single.lineTotal, '24.00');
        expect(preview.blocks, same(blocks));
        // The integrated mode preserves printed tax without adding it twice.
        expect(preview.taxIncludedInTotal, isTrue);
        expect(
          preview.reviewHints,
          isEmpty,
          reason:
              '${preview.incompleteAdjustmentReasons} ${preview.reviewHintDecision}',
        );
      });
    }

    for (final description in [
      'VAT Included Guide',
      'Included Tax Workbook',
      'Total incl. VAT Handbook',
      'Total (VAT included) Poster',
      'Notebook VAT included',
    ]) {
      test('product name survives: $description', () {
        final preview = const ReceiptOcrParser().parse(
          'Sample Shop\n$description GBP 24.00\nTotal GBP 24.00',
        );
        expect(preview.total, '24.00');
        expect(preview.tax, isNull);
        expect(preview.items, hasLength(1));
        expect(preview.items.single.description, description);
        expect(preview.items.single.lineTotal, '24.00');
      });
    }

    for (final line in [
      'VAT included 20% GBP 4.00 GBP 5.00',
      'VAT included 20% GBP 4.00 EUR 4.00',
      'VAT included 20% GBP 4.00 service GBP 2.00',
      'VAT included 20% GBP 4.00 | Tax GBP 1.00',
      'Notebook GBP 24.00 VAT included 20% GBP 4.00',
      'Total incl. VAT GBP 24.00 GBP 28.00',
      'Total incl. VAT GBP 24.00 EUR 28.00',
      'Total incl. VAT GBP 24.00 | service GBP 2.00',
      'VAT included',
      'VAT included 20%',
      'VAT included (20% GBP 4.00',
      'Total incl. GBP 24.00',
      'Total incl. GBP 24.00 GBP 28.00',
      'Total (VAT included GBP 24.00 GBP 28.00',
      'Total included GBP 24.00',
      'Total incl. VAT',
    ]) {
      test('ambiguous or incomplete row stays unowned: $line', () {
        final texts = [
          'Sample Shop',
          'Notebook GBP 24.00',
          'Total GBP 24.00',
          line,
        ];
        final blocks = [
          for (final (index, text) in texts.indexed)
            _layoutBlock(text, index, index, 20, 350),
        ];
        final preview = const ReceiptOcrParser().parse(
          texts.join('\n'),
          blocks: blocks,
        );
        expect(preview.tax, isNull);
        expect(preview.total, '24.00');
        expect(preview.blocks, same(blocks));
      });
    }
  });

  test('included-tax total never invents a missing tax or net subtotal', () {
    final preview = const ReceiptOcrParser().parse(
      'Sample Shop\nNotebook GBP 24.00\nTotal incl. VAT GBP 24.00',
    );
    expect(preview.total, '24.00');
    expect(preview.tax, isNull);
    expect(preview.subtotal, isNull);
    expect(preview.items, hasLength(1));
    expect(preview.reviewHints, isEmpty);
  });

  test('included-tax conflicting printed tax remains unresolved', () {
    final preview = const ReceiptOcrParser().parse(
      'Sample Shop\nNotebook GBP 24.00\nTotal incl. VAT GBP 24.00\n'
      'VAT included 20% GBP 4.00\nVAT GBP 5.00',
    );
    expect(preview.total, '24.00');
    expect(preview.tax, isNull);
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.reviewHints, isNotEmpty);
    expect(preview.items, hasLength(1));
  });

  test(
    'included-tax recognition leaves exclusive tax reconciliation intact',
    () {
      final preview = const ReceiptOcrParser().parse(
        'Sample Shop\nNotebook GBP 24.00\nSubtotal GBP 24.00\n'
        'VAT GBP 4.00\nTotal GBP 28.00',
      );
      expect(preview.total, '28.00');
      expect(preview.tax, '4.00');
      expect(preview.subtotal, '24.00');
      expect(preview.items.single.lineTotal, '24.00');
      expect(preview.reviewHints, isEmpty);
    },
  );

  test('included-tax summary labels preserve gross total and tax evidence', () {
    final preview = const ReceiptOcrParser().parse('''
Sample Shop
Notebook GBP 24.00
Total incl. VAT GBP 24.00
VAT included 20% GBP 4.00
''');
    expect(preview.total, '24.00');
    expect(preview.tax, '4.00');
    expect(preview.items, hasLength(1));
    expect(preview.items.single.description, 'Notebook');
    expect(preview.items.single.lineTotal, '24.00');
  });

  group('owned total beside a contact column', () {
    List<ReceiptOcrBlockEvidence> chartTickEvidence(
      double scale, {
      String? fragment,
      bool higher = false,
      String? point,
      double pointLeft = 841,
      String? pointFragment,
      String? title = 'Therms Used',
      double titleLeft = 790,
    }) {
      ReceiptOcrBlockEvidence cell(
        String text,
        int row,
        double left,
        double top,
        double right,
        double bottom,
      ) => ReceiptOcrBlockEvidence(
        text: text,
        row: row,
        order: row * 1000 + left.round(),
        points: [
          ReceiptOcrPoint(x: left * scale, y: top * scale),
          ReceiptOcrPoint(x: right * scale, y: top * scale),
          ReceiptOcrPoint(x: right * scale, y: bottom * scale),
          ReceiptOcrPoint(x: left * scale, y: bottom * scale),
        ],
      );
      return [
        cell('Sample Utility', 0, 50, 0, 300, 20),
        cell('Broadband Plan', 1, 50, 60, 300, 80),
        cell('USD 86.27', 1, 600, 60, 720, 80),
        if (title != null)
          cell(
            title,
            2,
            titleLeft,
            higher ? 88 : 114,
            titleLeft + 130,
            higher ? 108 : 134,
          ),
        if (fragment != null)
          cell(fragment, 2, 750, higher ? 113 : 139, 785, higher ? 124 : 150),
        if (higher) cell('100', 2, 790, 113, 830, 133),
        cell('50', 2, 790, 139, 830, 159),
        if (point != null) cell(point, 2, pointLeft, 132, pointLeft + 24, 152),
        if (pointFragment != null) cell(pointFragment, 2, 869, 132, 890, 143),
        cell('Total', 3, 50, 180, 300, 200),
        cell('USD 86.27', 3, 600, 180, 720, 200),
        cell('0', 3, 800, 165, 830, 185),
        cell('Nov', 4, 841, 181, 866, 196),
        cell('Dec', 4, 871, 181, 896, 196),
        cell('Jan', 4, 901, 181, 926, 196),
        cell('Grand Total', 5, 50, 300, 300, 320),
        cell(r'$86.27', 5, 600, 300, 720, 320),
        cell('Call us at 1-800-555-0199', 5, 800, 300, 1050, 320),
      ];
    }

    void verifyChartPositive(
      List<ReceiptOcrBlockEvidence> blocks,
      String reason,
    ) {
      final rows = <int, List<String>>{};
      for (final b in blocks) {
        (rows[b.row] ??= []).add(b.text);
      }
      final preview = const ReceiptOcrParser().parse(
        rows.values.map((r) => r.join(' ')).join('\n'),
        fallbackCurrency: 'USD',
        blocks: blocks,
      );
      expect(preview.total, '86.27', reason: reason);
      expect(preview.blocks, blocks, reason: reason);
    }

    void verifyChartNegative(
      List<ReceiptOcrBlockEvidence> blocks,
      String reason,
    ) {
      final rows = <int, List<String>>{};
      for (final b in blocks) {
        (rows[b.row] ??= []).add(b.text);
      }
      final preview = const ReceiptOcrParser().parse(
        rows.values.map((r) => r.join(' ')).join('\n'),
        fallbackCurrency: 'USD',
        blocks: blocks,
      );
      expect(preview.total, '0199', reason: reason);
      expect(preview.blocks, blocks, reason: reason);
    }

    List<ReceiptOcrBlockEvidence> fragmentedTotalEvidence(
      List<String> heading,
      double scale, {
      bool vertical = false,
      bool splitRows = false,
      bool reverse = false,
      bool agreeing = true,
      List<String> amount = const ['USD 90.00'],
      bool splitOwnedMoney = false,
    }) {
      ReceiptOcrBlockEvidence b(
        String t,
        int row,
        double left,
        double top,
        double right,
        double bottom,
      ) => ReceiptOcrBlockEvidence(
        text: t,
        row: row,
        order: row * 1000 + left.round(),
        points: [
          ReceiptOcrPoint(x: left * scale, y: top * scale),
          ReceiptOcrPoint(x: right * scale, y: top * scale),
          ReceiptOcrPoint(x: right * scale, y: bottom * scale),
          ReceiptOcrPoint(x: left * scale, y: bottom * scale),
        ],
      );
      return [
        b('Sample Utility', 0, 50, 0, 300, 20),
        b('Broadband Plan', 1, 50, 60, 300, 80),
        b('USD 86.27', 1, 600, 60, 720, 80),
        if (agreeing) ...[
          b('Total', 2, 50, 120, 300, 140),
          b('USD 86.27', 2, 600, 120, 720, 140),
        ],
        b('Contact us for payment options', 2, 1300, 120, 1600, 140),
        for (var i = 0; i < heading.length; i++)
          b(
            heading[i],
            splitRows ? 2 + i : 2,
            vertical ? 800 : 800 + (reverse ? heading.length - 1 - i : i) * 90,
            vertical ? 120 + i * 24 : 120,
            vertical ? 875 : 875 + (reverse ? heading.length - 1 - i : i) * 90,
            vertical ? 140 + i * 24 : 140,
          ),
        for (var i = 0; i < amount.length; i++)
          b(amount[i], 12 + i, 800 + i * 60, 370, 850 + i * 60, 390),
        b('Grand Total', 20, 50, 500, 300, 520),
        if (splitOwnedMoney) ...[
          b('US', 20, 580, 500, 600, 520),
          b(r'D $86', 20, 610, 500, 680, 520),
          b('.27', 21, 684, 500, 720, 520),
        ] else
          b(r'$86.27', 20, 600, 500, 720, 520),
        b('Call us at 1-800-555-0199', 20, 800, 500, 1050, 520),
      ];
    }

    void verifyFragmented(List<ReceiptOcrBlockEvidence> blocks, String reason) {
      final rows = <int, List<String>>{};
      for (final b in blocks) {
        (rows[b.row] ??= []).add(b.text);
      }
      final text = rows.values.map((r) => r.join(' ')).join('\n');
      final preview = const ReceiptOcrParser().parse(
        text,
        fallbackCurrency: 'USD',
        blocks: blocks,
      );
      expect(preview.total, '0199', reason: reason);
      expect(preview.blocks, blocks, reason: reason);
    }

    List<ReceiptOcrBlockEvidence> ambiguousChart(double scale, String kind) {
      final blocks = chartTickEvidence(
        scale,
        higher: true,
        point: '85',
        title: 'Therms Used',
      );
      final text = kind == 'titles' ? 'kWh Used' : '90';
      final left = kind == 'point' ? 841.0 : 790.0;
      final right = kind == 'point'
          ? 865.0
          : kind == 'titles'
          ? 920.0
          : 830.0;
      final top = kind == 'titles' ? 88.0 : 115.0;
      blocks.add(
        ReceiptOcrBlockEvidence(
          text: text,
          row: 2,
          order: 2999,
          points: [
            ReceiptOcrPoint(x: left * scale, y: top * scale),
            ReceiptOcrPoint(x: right * scale, y: top * scale),
            ReceiptOcrPoint(x: right * scale, y: (top + 20) * scale),
            ReceiptOcrPoint(x: left * scale, y: (top + 20) * scale),
          ],
        ),
      );
      return blocks;
    }

    ReceiptOcrBlockEvidence changed(
      ReceiptOcrBlockEvidence b, {
      String? text,
      double dx = 0,
      double dy = 0,
    }) => ReceiptOcrBlockEvidence(
      text: text ?? b.text,
      row: b.row,
      order: b.order,
      points: b.points
          .map((p) => ReceiptOcrPoint(x: p.x + dx, y: p.y + dy))
          .toList(),
    );
    List<ReceiptOcrBlockEvidence> boundary(
      String kind,
      double scale, {
      String fragment = 'USD',
      double gap = 15,
    }) {
      if (kind == 'horizontal' || kind == 'vertical') {
        final blocks = fragmentedTotalEvidence(
          ['Payment', 'Due'],
          scale,
          vertical: kind == 'vertical',
          splitRows: kind == 'vertical',
        );
        return blocks
            .map(
              (b) => b.text == 'Due'
                  ? changed(
                      b,
                      dx: kind == 'horizontal' ? -16 * scale : 0,
                      dy: kind == 'vertical' ? -5 * scale : 0,
                    )
                  : b,
            )
            .toList();
      }
      final blocks = chartTickEvidence(
        scale,
        higher: true,
        point: kind == 'lower_bound' ? '5' : '85',
        title: kind == 'title' ? fragment : 'Therms Used',
      );
      if (kind == 'lower_bound') {
        return blocks
            .map((b) => b.text == '0' ? changed(b, text: '10') : b)
            .toList();
      }
      if (kind == 'title') {
        return blocks
            .map(
              (b) =>
                  b.text == fragment ? changed(b, dy: -(gap - 5) * scale) : b,
            )
            .toList();
      }
      blocks.add(
        ReceiptOcrBlockEvidence(
          text: fragment,
          row: 4,
          order: 4999,
          points: [
            ReceiptOcrPoint(x: 931 * scale, y: 181 * scale),
            ReceiptOcrPoint(x: 1040 * scale, y: 181 * scale),
            ReceiptOcrPoint(x: 1040 * scale, y: 196 * scale),
            ReceiptOcrPoint(x: 931 * scale, y: 196 * scale),
          ],
        ),
      );
      return blocks;
    }

    List<ReceiptOcrBlockEvidence> yearPanel(String kind, double scale) {
      final base = chartTickEvidence(
        scale,
        higher: true,
        point: '85',
        title: kind == 'title_missing' ? null : 'Therms Used',
      );
      ReceiptOcrBlockEvidence b(
        String text,
        int row,
        int order,
        double left,
        double top,
        double right,
        double bottom,
      ) => ReceiptOcrBlockEvidence(
        text: text,
        row: row,
        order: order,
        points: [
          ReceiptOcrPoint(x: left * scale, y: top * scale),
          ReceiptOcrPoint(x: right * scale, y: top * scale),
          ReceiptOcrPoint(x: right * scale, y: bottom * scale),
          ReceiptOcrPoint(x: left * scale, y: bottom * scale),
        ],
      );
      final years = kind == 'bad_years'
          ? '2023 2024 2024'
          : kind == 'short_row'
          ? '2023 2024'
          : kind == 'money_suffix'
          ? '2023 2023 2024 USD90.00'
          : '2023 2023 2024';
      return [
        ...base
            .where((b) => b.row != 5)
            .map(
              (b) => kind == 'decimal_axis' && b.text == '0'
                  ? changed(b, text: '0.00')
                  : b,
            ),
        b(years, 5, 5000, 841, 196, kind == 'wrong_width' ? 940 : 926, 213),
        if (kind == 'foreign_beside') b('USD', 5, 5001, 930, 196, 960, 213),
        if (kind == 'foreign_below') b('USD', 6, 6001, 841, 220, 870, 237),
        ...base
            .where((b) => b.row == 5)
            .map(
              (b) => ReceiptOcrBlockEvidence(
                text: b.text,
                row: 9,
                order: b.order + 4000,
                points: b.points,
              ),
            ),
      ];
    }

    test('overlapping fragments preserve the complete heading conflict', () {
      for (final kind in ['horizontal', 'vertical']) {
        for (final scale in [0.5, 1.0, 2.0]) {
          verifyChartNegative(boundary(kind, scale), '$kind $scale');
        }
      }
    });
    test('plotted values must fit the actual lower tick bound', () {
      for (final scale in [0.5, 1.0, 2.0]) {
        final blocks = boundary('lower_bound', scale);
        verifyChartNegative(blocks, '$scale');
        verifyChartPositive(
          blocks
              .map((b) => b.text == '5' ? changed(b, text: '85') : b)
              .toList(),
          'valid lower bound $scale',
        );
      }
    });
    test('every calendar member checks adjacent evidence', () {
      for (final fragment in ['USD 90.00', 'HK', 'or90', 'unknown']) {
        for (final scale in [0.5, 1.0, 2.0]) {
          verifyChartNegative(
            boundary('calendar', scale, fragment: fragment),
            '$fragment $scale',
          );
          final edge = boundary('calendar', scale, fragment: fragment);
          final last = edge.last;
          edge[edge.length - 1] = changed(last, dx: 6 * scale);
          verifyChartNegative(
            edge,
            'outside panel but adjacent: $fragment $scale',
          );
        }
      }
    });
    test('unknown headings cannot escape inside the accepted title region', () {
      for (final gap in [10.0, 15.0, 19.0]) {
        for (final scale in [0.5, 1.0, 2.0]) {
          verifyChartPositive(
            boundary('title', scale, fragment: 'Therms Used', gap: gap),
            '$gap $scale',
          );
          for (final fragment in ['USD', 'Therms Used USD90.00', 'unknown']) {
            verifyChartNegative(
              boundary('title', scale, fragment: fragment, gap: gap),
              '$gap $fragment $scale',
            );
          }
        }
      }
    });

    test('bounded usage panels require complete unambiguous year captions', () {
      for (final scale in [0.5, 1.0, 2.0]) {
        verifyChartPositive(yearPanel('valid', scale), 'valid $scale');
        for (final kind in [
          'bad_years',
          'short_row',
          'money_suffix',
          'wrong_width',
          'foreign_beside',
          'foreign_below',
          'decimal_axis',
          'title_missing',
        ]) {
          verifyChartNegative(yearPanel(kind, scale), '$kind $scale');
        }
      }
    });
    test('chart fields require unique ownership', () {
      for (final kind in ['point', 'ticks', 'titles']) {
        for (final scale in [0.5, 1.0, 2.0]) {
          verifyChartNegative(ambiguousChart(scale, kind), '$kind $scale');
        }
      }
    });

    test('punctuated heading fragments preserve competing totals', () {
      for (final heading in [
        ['(Payment', 'Due)'],
        ['[Amount', 'Due]'],
        ['「合', '計」'],
        ['(Pay', 'ment', 'Due)'],
      ]) {
        for (final scale in [0.5, 1.0, 2.0]) {
          verifyFragmented(
            fragmentedTotalEvidence(heading, scale),
            '$heading $scale',
          );
        }
      }
    });
    test('each accepted chart tick checks its own neighboring evidence', () {
      for (final scale in [0.5, 1.0, 2.0]) {
        for (final higher in [false, true]) {
          verifyChartPositive(
            chartTickEvidence(scale, higher: higher),
            '$scale $higher',
          );
          for (final fragment in ['USD', 'HK', r'$', '-', 'or90', 'unknown']) {
            verifyChartNegative(
              chartTickEvidence(scale, fragment: fragment, higher: higher),
              '$scale $fragment $higher',
            );
          }
        }
      }
    });

    test(
      'closed chart ownership preserves only proven plotted values and headings',
      () {
        for (final scale in [0.5, 1.0, 2.0]) {
          for (final title in [
            null,
            'Therms Used',
            'kWh consumed',
            'units usage',
          ]) {
            (title == null ? verifyChartNegative : verifyChartPositive)(
              chartTickEvidence(scale, higher: true, point: '85', title: title),
              '$scale $title',
            );
          }
          for (final point in ['150', 'USD85', '85 maybe', '+85']) {
            verifyChartNegative(
              chartTickEvidence(scale, higher: true, point: point),
              '$scale $point',
            );
          }
          verifyChartNegative(
            chartTickEvidence(scale, higher: true, point: '85', pointLeft: 825),
            '$scale misaligned',
          );
          for (final fragment in ['USD', 'HK', r'$', '-', 'or90', 'unknown']) {
            verifyChartNegative(
              chartTickEvidence(
                scale,
                higher: true,
                point: '85',
                pointFragment: fragment,
              ),
              '$scale $fragment',
            );
          }
          for (final title in ['USD', 'Therms Used USD90.00', 'maybe']) {
            verifyChartNegative(
              chartTickEvidence(scale, higher: true, point: '85', title: title),
              '$scale $title',
            );
          }
          verifyChartNegative(
            chartTickEvidence(
              scale,
              higher: true,
              point: '85',
              title: 'Therms Used',
              titleLeft: 750,
            ),
            '$scale displaced title',
          );
        }
      },
    );

    test('fragmented headings preserve conflicting total evidence', () {
      for (final heading in [
        ['Payment', 'Due'],
        ['Amount', 'Due'],
        ['Balance', 'Due'],
        ['Pay', 'ment', 'Due'],
        ['A', 'm', 'o', 'u', 'n', 't', 'D', 'u', 'e'],
        ['合', '計'],
        ['總', '計'],
        ['Ges', 'amt'],
        ['ยอด', 'สุทธิ'],
        ['Payment', 'DueUSD90.00'],
        ['Bal', 'ance', r'Due$90.00'],
      ]) {
        for (final scale in [0.5, 1.0, 2.0]) {
          for (final shape in [
            'horizontal',
            'cross-row',
            'vertical',
            'reverse',
            'no-repetition',
          ]) {
            final blocks = fragmentedTotalEvidence(
              heading,
              scale,
              vertical: shape == 'vertical',
              splitRows: shape == 'cross-row' || shape == 'vertical',
              reverse: shape == 'reverse',
              agreeing: shape != 'no-repetition',
            );
            verifyFragmented(blocks, '$heading $scale $shape');
          }
        }
      }
    });
    test(
      'fragmented currency and amount cells never establish total ownership',
      () {
        for (final scale in [0.5, 1.0, 2.0]) {
          for (final amount in [
            ['US', 'D', '90', '.00'],
            [r'$', '90', '.', '00'],
            ['HK', r'$', '90.00'],
            ['90.00', 'A', 'RS'],
            ['-', 'USD', '90.00'],
          ]) {
            for (final splitOwnedMoney in [false, true]) {
              final blocks = fragmentedTotalEvidence(
                ['Pay', 'ment', 'Due'],
                scale,
                splitRows: true,
                amount: amount,
                splitOwnedMoney: splitOwnedMoney,
              );
              verifyFragmented(blocks, '$amount $scale $splitOwnedMoney');
            }
          }
        }
      },
    );

    ReceiptOcrPreview parse({
      double scale = 1,
      String label = 'Total Current Charges',
      String contact = 'Call us at 1-800-555-0199',
      String totalMoney = r'$86.27',
      bool crossRowMoney = false,
      double crossRowMoneyLeft = 730,
      String crossRowText = 'USD 90.00',
      bool crossRowSupport = false,
      String supportText = 'Mon-Fri 8 am-5 pm',
      double supportLeft = 800,
      double supportOffset = -28,
      bool tallTotalLabel = false,
      String? phoneHeading,
      double headingLeft = 798,
      double headingOffset = 50,
      String itemAmount = 'USD 86.27',
      List<String> adjustments = const [],
      bool splitLocalizedTotal = false,
      bool priorCrossRowMoney = false,
      bool priorSideChart = false,
      bool completeCalendarAxis = true,
      List<String> calendarMonths = const ['Nov', 'Dec', 'Jan'],
      double calendarPeerOffset = -52,
      String? chartFragment,
      String? priorTotal,
      String? priorAmount,
      String? priorExtra,
      double priorExtraOffset = 0,
      double priorExtraLeft = 800,
      double priorExtraRight = 950,
      bool includeGeometry = true,
    }) {
      ReceiptOcrBlockEvidence cell(
        String text,
        int row,
        double left,
        double right, {
        double offset = 0,
        double cellHeight = 20,
      }) => ReceiptOcrBlockEvidence(
        text: text,
        order: row * 1000 + left.round(),
        row: row,
        points: includeGeometry
            ? [
                ReceiptOcrPoint(
                  x: left * scale,
                  y: (row * 60 + offset) * scale,
                ),
                ReceiptOcrPoint(
                  x: right * scale,
                  y: (row * 60 + offset) * scale,
                ),
                ReceiptOcrPoint(
                  x: right * scale,
                  y: (row * 60 + cellHeight + offset) * scale,
                ),
                ReceiptOcrPoint(
                  x: left * scale,
                  y: (row * 60 + cellHeight + offset) * scale,
                ),
              ]
            : const [],
      );
      final totalRow =
          (splitLocalizedTotal || priorCrossRowMoney || priorSideChart)
          ? 4
          : 3 + adjustments.length;
      final blocks = [
        cell('Sample Utility', 0, 50, 300),
        cell('Broadband Plan', 1, 50, 300),
        cell(itemAmount, 1, 600, 720),
        for (var index = 0; index < adjustments.length; index++)
          cell(adjustments[index], index + 2, 50, 720),
        if (splitLocalizedTotal) ...[
          cell('合計', 2, 50, 300),
          cell('USD 90.00', 3, 600, 720, offset: -35),
        ],
        if (priorCrossRowMoney) ...[
          cell('Total', 2, 50, 300, offset: 10),
          cell('USD 86.27', 2, 600, 720, cellHeight: 40),
          cell('USD 90.00', 3, 730, 790, offset: -28, cellHeight: 10),
        ],
        if (priorSideChart) ...[
          cell('Total', 2, 50, 300, offset: 10),
          cell('USD 86.27', 2, 600, 720, cellHeight: 40),
          cell('0', 2, 780, 795, offset: -10, cellHeight: 19),
          cell('compared to last month', 2, 900, 1050),
          cell(calendarMonths[0], 3, 810, 840, offset: -52, cellHeight: 15),
          if (completeCalendarAxis) ...[
            cell(
              calendarMonths[1],
              3,
              850,
              880,
              offset: calendarPeerOffset,
              cellHeight: 15,
            ),
            cell(
              calendarMonths[2],
              3,
              890,
              920,
              offset: calendarPeerOffset,
              cellHeight: 15,
            ),
          ],
          if (chartFragment != null)
            cell(chartFragment, 3, 760, 780, offset: -54, cellHeight: 6),
        ],
        if (priorTotal != null)
          cell(priorTotal, 2, 50, priorAmount == null ? 720 : 300),
        if (priorAmount != null) cell(priorAmount, 2, 600, 720),
        if (priorExtra != null)
          cell(
            priorExtra,
            2,
            priorExtraLeft,
            priorExtraRight,
            offset: priorExtraOffset,
          ),
        if (phoneHeading != null)
          cell(
            phoneHeading,
            totalRow - 1,
            headingLeft,
            headingLeft + 100,
            offset: headingOffset,
            cellHeight: 18,
          ),
        cell(
          label,
          totalRow,
          50,
          300,
          offset: !tallTotalLabel && (crossRowMoney || crossRowSupport)
              ? 10
              : 0,
          cellHeight: tallTotalLabel ? 40 : 20,
        ),
        cell(
          totalMoney,
          totalRow,
          600,
          720,
          offset: tallTotalLabel ? 10 : 0,
          cellHeight: !tallTotalLabel && (crossRowMoney || crossRowSupport)
              ? 40
              : 20,
        ),
        cell(
          contact,
          totalRow,
          800,
          1050,
          offset: (crossRowMoney || crossRowSupport) ? 10 : 0,
        ),
        if (crossRowMoney)
          cell(
            crossRowText,
            totalRow + 1,
            crossRowMoneyLeft,
            crossRowMoneyLeft + 60,
            offset: -28,
            cellHeight: 10,
          ),
        if (crossRowSupport)
          cell(
            supportText,
            totalRow + 1,
            supportLeft,
            1050,
            offset: supportOffset,
            cellHeight: 10,
          ),
      ];
      final rows = <int, List<String>>{};
      for (final block in blocks) {
        (rows[block.row] ??= []).add(block.text);
      }
      final preview = const ReceiptOcrParser().parse(
        rows.values.map((row) => row.join(' ')).join('\n'),
        fallbackCurrency: 'USD',
        blocks: blocks,
      );
      expect(preview.blocks, blocks);
      return preview;
    }

    test('keeps the printed amount across phone suffixes and scales', () {
      for (final scale in [0.5, 1.0, 2.0]) {
        for (final label in [
          'Total Current Charges',
          'Total Due',
          'Grand Total',
        ]) {
          for (final suffix in ['0199', '0123', '434']) {
            expect(
              parse(
                scale: scale,
                label: label,
                contact: 'Call us at 1-800-555-$suffix',
              ).total,
              '86.27',
              reason: '$scale $label $suffix',
            );
          }
        }
      }
    });

    test('retains a genuine conflicting total and its review', () {
      for (final scale in [0.5, 1.0, 2.0]) {
        final preview = parse(
          scale: scale,
          label: 'Grand Total',
          priorTotal: 'Grand Total USD 90.00',
        );
        expect(preview.total, '90.00');
        expect(preview.reviewHints, isNotEmpty);
      }
    });

    test('preserves joined-label multi-amount total conflicts', () {
      for (final scale in [0.5, 1.0, 2.0]) {
        for (final label in ['Grand Total', 'Total Due', 'Balance Due']) {
          final preview = parse(
            scale: scale,
            label: 'Grand Total',
            priorTotal: '$label\$90.00 / USD 91.00',
          );
          expect(preview.total, '91.00');
          expect(preview.reviewHints, isNotEmpty);
        }
      }
    });

    test('retains competing cells beside an otherwise matching total', () {
      for (final scale in [0.5, 1.0, 2.0]) {
        for (final split in [false, true]) {
          final preview = parse(
            scale: scale,
            label: 'Grand Total',
            priorTotal: split ? 'Grand Total' : 'Grand Total USD 86.27',
            priorAmount: split ? 'USD 86.27' : null,
            priorExtra: '90',
          );
          expect(preview.total, '0199');
        }
      }
    });

    test('retains split localized totals and text-bearing alternatives', () {
      for (final scale in [0.5, 1.0, 2.0]) {
        expect(
          parse(
            scale: scale,
            label: 'Grand Total',
            splitLocalizedTotal: true,
          ).total,
          '0199',
        );
        for (final extra in ['or 90', 'alternative 90.00', '90 otherwise']) {
          expect(
            parse(
              scale: scale,
              label: 'Grand Total',
              priorTotal: 'Grand Total',
              priorAmount: 'USD 86.27',
              priorExtra: extra,
            ).total,
            '0199',
          );
        }
      }
    });

    test('separate payment copy cannot hide localized total evidence', () {
      for (final scale in [0.5, 1.0, 2.0]) {
        for (final label in ['Gesamt', '合計', 'الإجمالي']) {
          for (final copy in [
            'Payment information',
            'Cash payments',
            'Reference',
          ]) {
            final preview = parse(
              scale: scale,
              label: 'Grand Total',
              priorTotal: label,
              priorAmount: 'USD 90.00',
              priorExtra: copy,
            );
            expect(preview.total, '0199');
            expect(preview.reviewHints, isNotEmpty);
          }
        }
      }
    });

    test('does not reconcile discounts or clear their existing review', () {
      for (final scale in [0.5, 1.0, 2.0]) {
        final preview = parse(
          scale: scale,
          label: 'Grand Total',
          itemAmount: 'USD 100.00',
          adjustments: [
            'Subtotal USD 100.00',
            'Discount USD -5.00',
            'Coupon USD -8.73',
          ],
        );
        expect(preview.total, '86.27');
        expect(preview.discount, '-5.00');
        expect(preview.adjustmentsComplete, isFalse);
        expect(
          preview.incompleteAdjustmentReasons,
          containsAll([
            ReceiptOcrIncompleteAdjustmentReason.repeatedAdjustmentRole,
            ReceiptOcrIncompleteAdjustmentReason.labeledAmountEvidence,
          ]),
        );
        expect(preview.reviewHints, isNotEmpty);
      }
    });

    test('requires one complete monetary denomination', () {
      for (final scale in [0.5, 1.0, 2.0]) {
        for (final money in [r'$86.27฿', r'$86.27₦', r'$86.27₽']) {
          expect(
            parse(scale: scale, label: 'Grand Total', totalMoney: money).total,
            '0199',
          );
        }
      }
    });

    test('retains detached financial markers beside another total', () {
      for (final scale in [0.5, 1.0, 2.0]) {
        for (final symbol in ['-', '%', 'ARS']) {
          expect(
            parse(
              scale: scale,
              label: 'Grand Total',
              priorTotal: 'Grand Total',
              priorAmount: 'USD 86.27',
              priorExtra: symbol,
            ).total,
            '0199',
          );
        }
      }
    });

    test('checks competing money across OCR row assignments', () {
      for (final scale in [0.5, 1.0, 2.0]) {
        for (final left in [730.0, 770.0, 810.0]) {
          for (final text in [
            'USD 90.00',
            'ARS',
            'or90',
            '1e2',
            'HK',
            'maybe',
          ]) {
            expect(
              parse(
                scale: scale,
                label: 'Grand Total',
                crossRowMoney: true,
                crossRowMoneyLeft: left,
                crossRowText: text,
              ).total,
              '0199',
            );
          }
        }
        for (final fragment in [
          ('or90', 730.0),
          ('1e2', 730.0),
          ('HK', 540.0),
          ('CA', 540.0),
          ('R', 575.0),
          ('maybe', 540.0),
        ]) {
          expect(
            parse(
              scale: scale,
              label: 'Grand Total',
              crossRowMoney: true,
              crossRowMoneyLeft: fragment.$2,
              crossRowText: fragment.$1,
            ).total,
            '0199',
          );
        }
        expect(
          parse(
            scale: scale,
            label: 'Grand Total',
            crossRowSupport: true,
          ).total,
          '86.27',
        );
      }
    });

    test('only a complete schedule beneath the phone owns support numbers', () {
      for (final scale in [0.5, 1.0, 2.0]) {
        for (final schedule in [
          'Mon-Fri 8 am-5 pm',
          'Monday - Friday, 7 AM - 7 PM',
          'Saturday 10:30 AM to 2 PM',
        ]) {
          expect(
            parse(
              scale: scale,
              crossRowSupport: true,
              supportText: schedule,
            ).total,
            '86.27',
          );
          for (final displaced in [
            parse(
              scale: scale,
              crossRowSupport: true,
              supportText: schedule,
              supportLeft: 740,
            ),
            parse(
              scale: scale,
              crossRowSupport: true,
              supportText: schedule,
              supportOffset: -38,
            ),
          ]) {
            expect(displaced.total, '0199');
          }
        }
        for (final ambiguous in [
          'Mon-Fri USD 90',
          'Monday - Friday, 7 AM - 7 PM or90',
          'Mon-Fri 8 am-5 pm HK',
        ]) {
          expect(
            parse(
              scale: scale,
              crossRowSupport: true,
              supportText: ambiguous,
            ).total,
            '0199',
          );
        }
      }
    });

    test('checks competing evidence across the label and amount heights', () {
      for (final scale in [0.5, 1.0, 2.0]) {
        for (final text in [r'$90.00', 'or90', 'HK', 'maybe']) {
          final preview = parse(
            scale: scale,
            label: 'Grand Total',
            tallTotalLabel: true,
            crossRowMoney: true,
            crossRowMoneyLeft: 310,
            crossRowText: text,
          );
          expect(preview.total, '0199');
          expect(preview.reviewHints, isNotEmpty);
        }
      }
    });

    test('a complete contact heading must belong to the phone column', () {
      for (final scale in [0.5, 1.0, 2.0]) {
        for (final heading in [
          'Need Help?',
          'Contact Us',
          'Customer Support',
        ]) {
          expect(
            parse(
              scale: scale,
              crossRowSupport: true,
              phoneHeading: heading,
            ).total,
            '86.27',
          );
          for (final displaced in [
            parse(
              scale: scale,
              crossRowSupport: true,
              phoneHeading: heading,
              headingLeft: 740,
            ),
            parse(
              scale: scale,
              crossRowSupport: true,
              phoneHeading: heading,
              headingOffset: 55,
            ),
          ]) {
            expect(displaced.total, '0199');
          }
        }
        for (final unknown in ['Need Help or90', 'Customer USD 90', 'Maybe']) {
          expect(
            parse(
              scale: scale,
              crossRowSupport: true,
              phoneHeading: unknown,
            ).total,
            '0199',
          );
        }
      }
    });

    test('checks geometry around every agreeing total', () {
      for (final scale in [0.5, 1.0, 2.0]) {
        expect(
          parse(
            scale: scale,
            label: 'Grand Total',
            priorCrossRowMoney: true,
          ).total,
          '0199',
        );
        for (final extra in ['HK', 'maybe']) {
          expect(
            parse(
              scale: scale,
              label: 'Grand Total',
              priorTotal: 'Total',
              priorAmount: 'USD 86.27',
              priorExtra: extra,
              priorExtraLeft: 540,
              priorExtraRight: 600,
            ).total,
            '0199',
          );
        }
      }
    });

    test('calendar words alone do not prove nonfinancial chart ownership', () {
      for (final scale in [0.5, 1.0, 2.0]) {
        expect(parse(scale: scale, priorSideChart: true).total, '0199');
      }
    });

    test(
      'numeric metadata requires independent ownership of adjacent fragments',
      () {
        for (final scale in [0.5, 1.0, 2.0]) {
          for (final fragment in ['USD', r'$', 'HK', 'or90', 'maybe', '%']) {
            final preview = parse(
              scale: scale,
              priorSideChart: true,
              chartFragment: fragment,
            );
            expect(preview.total, '0199');
            expect(preview.reviewHints, isNotEmpty);
          }
          expect(
            parse(
              scale: scale,
              priorSideChart: true,
              completeCalendarAxis: false,
            ).total,
            '0199',
          );
          for (final months in [
            ['Nov', 'Jan', 'Feb'],
            ['Nov', 'Nov', 'Nov'],
            ['Nov', 'USD 90', 'Jan'],
          ]) {
            expect(
              parse(
                scale: scale,
                priorSideChart: true,
                calendarMonths: months,
              ).total,
              '0199',
            );
          }
          expect(
            parse(
              scale: scale,
              priorSideChart: true,
              calendarPeerOffset: -12,
            ).total,
            '0199',
          );
        }
      },
    );

    test(
      'requires scale-relative separation from vertical neighboring evidence',
      () {
        for (final scale in [0.5, 1.0, 2.0]) {
          for (final offset in [-20.0, -19.0, -17.0, -5.0]) {
            for (final text in ['USD 90.00', 'HK', 'or90', 'maybe']) {
              final preview = parse(
                scale: scale,
                label: 'Grand Total',
                crossRowSupport: true,
                supportText: text,
                supportLeft: 730,
                supportOffset: offset,
              );
              expect(preview.total, '0199');
              expect(preview.reviewHints, isNotEmpty);
            }
          }
        }
      },
    );

    test('only aligned bare ticks belong to a proven calendar axis', () {
      for (final scale in [0.5, 1.0, 2.0]) {
        for (final tick in ['50', 'USD 50', '+50', '50 maybe']) {
          ReceiptOcrBlockEvidence cell(
            String text,
            int row,
            double left,
            double top,
            double right,
            double bottom,
          ) => ReceiptOcrBlockEvidence(
            text: text,
            row: row,
            order: row * 1000 + left.round(),
            points: [
              ReceiptOcrPoint(x: left * scale, y: top * scale),
              ReceiptOcrPoint(x: right * scale, y: top * scale),
              ReceiptOcrPoint(x: right * scale, y: bottom * scale),
              ReceiptOcrPoint(x: left * scale, y: bottom * scale),
            ],
          );
          final blocks = [
            cell('Sample Utility', 0, 50, 0, 300, 20),
            cell('Broadband Plan', 1, 50, 60, 300, 80),
            cell('USD 86.27', 1, 600, 60, 720, 80),
            cell(tick, 2, 790, 139, 830, 159),
            cell('Total', 3, 50, 180, 300, 200),
            cell('USD 86.27', 3, 600, 180, 720, 200),
            cell('0', 3, 800, 165, 830, 185),
            cell('Nov', 4, 841, 181, 866, 196),
            cell('Dec', 4, 871, 181, 896, 196),
            cell('Jan', 4, 901, 181, 926, 196),
            cell('Grand Total', 5, 50, 300, 300, 320),
            cell(r'$86.27', 5, 600, 300, 720, 320),
            cell('Call us at 1-800-555-0199', 5, 800, 300, 1050, 320),
          ];
          final rows = <int, List<String>>{};
          for (final block in blocks) {
            (rows[block.row] ??= []).add(block.text);
          }
          final preview = const ReceiptOcrParser().parse(
            rows.values.map((row) => row.join(' ')).join('\n'),
            fallbackCurrency: 'USD',
            blocks: blocks,
          );
          // The original unlabelled input remains a negative control: the
          // published selection/review survives without positive usage ownership.
          expect(preview.total, '0199');
          final strong = [
            ...blocks,
            cell('Therms Used', 2, 789, 114, 919, 134),
          ];
          final strongRows = <int, List<String>>{};
          for (final block in strong) {
            (strongRows[block.row] ??= []).add(block.text);
          }
          final owned = const ReceiptOcrParser().parse(
            strongRows.values.map((row) => row.join(' ')).join('\n'),
            fallbackCurrency: 'USD',
            blocks: strong,
          );
          expect(owned.total, tick == '50' ? '86.27' : '0199');
          expect(owned.blocks, strong);
          expect(preview.blocks, blocks);
        }
      }
    });

    test('nearby dates and addresses require complete independent fields', () {
      for (final scale in [0.5, 1.0, 2.0]) {
        for (final kind in [
          'valid',
          'invalid_date',
          'money_date',
          'unknown_label',
          'overlap',
          'duplicate_date',
          'money_address',
          'misaligned_address',
        ]) {
          ReceiptOcrBlockEvidence cell(
            String text,
            int row,
            double left,
            double top,
            double right,
            double bottom,
          ) => ReceiptOcrBlockEvidence(
            text: text,
            row: row,
            order: row * 1000 + left.round(),
            points: [
              ReceiptOcrPoint(x: left * scale, y: top * scale),
              ReceiptOcrPoint(x: right * scale, y: top * scale),
              ReceiptOcrPoint(x: right * scale, y: bottom * scale),
              ReceiptOcrPoint(x: left * scale, y: bottom * scale),
            ],
          );
          final dateTop = kind == 'overlap' ? 145.0 : 124.0;
          final blocks = [
            cell('Sample Utility', 0, 50, 0, 300, 20),
            cell('Broadband Plan', 1, 50, 60, 300, 80),
            cell('USD 86.27', 1, 600, 60, 720, 80),
            cell(
              kind == 'unknown_label' ? 'Reference' : 'Due Date:',
              2,
              50,
              dateTop,
              300,
              dateTop + 20,
            ),
            cell(
              kind == 'invalid_date'
                  ? 'Feb 30, 2025'
                  : kind == 'money_date'
                  ? 'USD 90.00'
                  : 'Apr 4, 2025',
              2,
              600,
              dateTop,
              750,
              dateTop + 20,
            ),
            if (kind == 'duplicate_date')
              cell('Apr 5, 2025', 2, 760, dateTop, 890, dateTop + 20),
            cell(
              kind == 'money_address'
                  ? 'P.O. Box 1234 USD 90'
                  : 'P.O. Box 1234',
              2,
              kind == 'misaligned_address' ? 740 : 800,
              128,
              880,
              148,
            ),
            cell('Total', 3, 50, 150, 300, 170),
            cell('USD 86.27', 3, 600, 150, 720, 170),
            cell('Example City, NY 12345', 3, 800, 150, 950, 170),
            cell('Grand Total', 4, 50, 240, 300, 260),
            cell(r'$86.27', 4, 600, 240, 720, 260),
            cell('Call us at 1-800-555-0199', 4, 800, 240, 1050, 260),
          ];
          final rows = <int, List<String>>{};
          for (final block in blocks) {
            (rows[block.row] ??= []).add(block.text);
          }
          final preview = const ReceiptOcrParser().parse(
            rows.values.map((row) => row.join(' ')).join('\n'),
            fallbackCurrency: 'USD',
            blocks: blocks,
          );
          expect(
            preview.total,
            kind == 'valid' ? '86.27' : '0199',
            reason: kind,
          );
          expect(preview.blocks, blocks);
        }
      }
    });

    test('retains unresolved totals in supported scripts', () {
      for (final scale in [0.5, 1.0, 2.0]) {
        for (final label in ['合計', '合计', 'Gesamt', 'الإجمالي']) {
          expect(
            parse(scale: scale, label: 'Grand Total', priorTotal: label).total,
            '0199',
          );
        }
      }
    });

    test('an agreeing total cannot absorb another unresolved total label', () {
      for (final scale in [0.5, 1.0, 2.0]) {
        for (final label in ['合計', '合计', 'Gesamt', 'الإجمالي']) {
          final preview = parse(
            scale: scale,
            label: 'Grand Total',
            priorTotal: 'Total',
            priorAmount: 'USD 86.27',
            priorExtra: label,
          );
          expect(preview.total, '0199');
          expect(preview.reviewHints, isNotEmpty);
        }
      }
    });

    test(
      'computed hints distinguish reconciled source from a real discrepancy',
      () {
        for (final scale in [0.5, 1.0, 2.0]) {
          for (final discount in ['-13.73', '-13.53']) {
            final preview = parse(
              scale: scale,
              label: 'Grand Total',
              itemAmount: 'USD 100.00',
              adjustments: ['Subtotal USD 100.00', 'Discount USD $discount'],
            );
            expect(preview.total, '86.27');
            expect(preview.discount, discount);
            expect(preview.adjustmentsComplete, isTrue);
            expect(preview.incompleteAdjustmentReasons, isEmpty);
            expect(
              preview.reviewHintDecision,
              discount == '-13.73'
                  ? ReceiptOcrReviewDecision.none
                  : ReceiptOcrReviewDecision
                        .referenceAdjustmentUnreconciledWithSubtotal,
            );
            expect(preview.reviewHints.isEmpty, discount == '-13.73');
          }
        }
      },
    );

    test('keeps postal digits outside a repeated total ownership corridor', () {
      for (final scale in [0.5, 1.0, 2.0]) {
        expect(
          parse(
            scale: scale,
            priorTotal: 'Total Amount Due',
            priorAmount: 'USD 86.27',
            priorExtra: 'Example City, NY 12345-6789',
          ).total,
          '86.27',
        );
      }
    });

    test('does not assume a separated bare number belongs to a chart', () {
      for (final scale in [0.5, 1.0, 2.0]) {
        expect(
          parse(
            scale: scale,
            priorTotal: 'Total Amount Due',
            priorAmount: 'USD 86.27',
            priorExtra: '0',
            priorExtraOffset: -15,
          ).total,
          '0199',
        );
      }
    });

    test('requires geometry and does not discard unknown side-column text', () {
      final noGeometry = parse(includeGeometry: false);
      expect(noGeometry.total, '0199');
      expect(noGeometry.reviewHints, isNotEmpty);
      for (final scale in [0.5, 1.0, 2.0]) {
        final competing = parse(scale: scale, contact: 'Total USD 90.00');
        expect(competing.total, '90.00');
        expect(competing.reviewHints, isNotEmpty);
        final unknown = parse(scale: scale, contact: 'Chart usage 434');
        expect(unknown.total, '434');
        expect(unknown.reviewHints, isNotEmpty);
      }
    });
  });

  test(
    'owned fee role and incomplete evidence are invariant to support copy',
    () {
      for (final label in [
        'Municipal Connectivity Fee (2.00%)',
        'Regulatory Recovery Fee',
        'Connection Surcharge',
      ]) {
        for (final scale in [0.5, 1.0, 2.0]) {
          final without = _parseBoundedUtility(
            _ownedFeeBlocks(label: label, scale: scale),
          );
          for (final sidebar in [false, true]) {
            final blocks = _ownedFeeBlocks(
              label: label,
              scale: scale,
              sidebar: sidebar,
            );
            final p = _parseBoundedUtility(blocks);
            expect(p.blocks, blocks);
            expect(p.items.map((i) => i.description), ['Broadband Plan']);
            expect(p.items.single.lineTotal, '20.00');
            expect(p.total, '20.89');
            expect(p.subtotal, isNull);
            expect(p.tax, isNull);
            expect(p.service, isNull);
            expect(p.tip, isNull);
            expect(p.shipping, isNull);
            expect(p.discount, isNull);
            expect(p.adjustmentsComplete, isFalse);
            expect(
              p.incompleteAdjustmentReasons,
              contains(
                ReceiptOcrIncompleteAdjustmentReason
                    .unclassifiedAdjustmentLabel,
              ),
            );
            expect(p.reviewHints, isNotEmpty);
            expect(p.reviewHints, without.reviewHints);
            expect(p.warnings, isEmpty, reason: '$label $sidebar $scale');
            expect(
              p.itemLineDecisions[4],
              ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
            );
          }
        }
      }
    },
  );
  test('item-inclusive fee clauses preserve genuine service candidates', () {
    for (final connector in [
      'including',
      'with',
      'and',
      'plus',
      '+',
      '/',
      '&',
    ]) {
      for (final scale in [0.5, 1.0, 2.0]) {
        final label = 'Router Rental $connector Regulatory Fee';
        final blocks = _ownedFeeBlocks(
          label: label,
          sidebar: true,
          scale: scale,
        );
        final p = _parseBoundedUtility(blocks);
        expect(p.items.length, 2, reason: '$connector $scale');
        expect(p.items.last.description, startsWith(label));
        expect(p.items.last.lineTotal, '0.89');
        expect(p.blocks, blocks);
        expect(p.adjustmentsComplete, isFalse);
        expect(p.reviewHints, isNotEmpty);
        expect(p.service, isNull);
      }
    }
  });
  test('owned fee recovery does not absorb named merchandise', () {
    for (final sidebar in [false, true]) {
      for (final scale in [0.5, 1.0, 2.0]) {
        final p = _parseBoundedUtility(
          _ownedFeeBlocks(
            label: 'Coffee Service Manual',
            sidebar: sidebar,
            scale: scale,
          ),
        );
        expect(p.items.map((i) => i.description), [
          'Broadband Plan',
          'Coffee Service Manual',
        ]);
        expect(p.warnings, isEmpty);
        expect(p.reviewHints, isEmpty);
      }
    }
  });
  test(
    'incomplete fee ownership retains uncertainty and raw monetary evidence',
    () {
      final variants = [
        _ownedFeeBlocks(amount: null),
        _ownedFeeBlocks(duplicateAmount: true),
        _ownedFeeBlocks(period: 'Feb 5 -'),
        _ownedFeeBlocks(amount: 'EUR 0.89'),
        _ownedFeeBlocks(amount: 'USD - 0.89'),
        _ownedFeeBlocks(amount: 'USD -0.89'),
        _ownedFeeBlocks(amount: 'USD EUR 0.89'),
        _ownedFeeBlocks(label: 'Tax and Connectivity Fee'),
        _ownedFeeBlocks(label: 'Payment and Connectivity Fee'),
        _ownedFeeBlocks(label: 'Connectivity Fee (tax included)'),
        _ownedFeeBlocks(sidebar: true, supportHeader: false),
      ];
      for (var i = 0; i < variants.length; i++) {
        final p = _parseBoundedUtility(variants[i]);
        expect(p.blocks, variants[i]);
        expect(p.adjustmentsComplete, isFalse, reason: 'variant $i');
        expect(p.reviewHints, isNotEmpty, reason: 'variant $i');
        expect(p.service, isNull);
        expect(p.subtotal, isNull);
      }
    },
  );

  test('ownership uses shared geometry and numeric reference evidence', () {
    ReceiptOcrBlockEvidence box(
      String text,
      int row,
      double left,
      double top,
      double right,
      double bottom,
      int order,
    ) => ReceiptOcrBlockEvidence(
      text: text,
      row: row,
      order: order,
      points: [
        ReceiptOcrPoint(x: left, y: top),
        ReceiptOcrPoint(x: right, y: top),
        ReceiptOcrPoint(x: right, y: bottom),
        ReceiptOcrPoint(x: left, y: bottom),
      ],
    );
    for (final scale in [0.5, 1.0, 2.0]) {
      ReceiptOcrBlockEvidence scaled(ReceiptOcrBlockEvidence b) =>
          ReceiptOcrBlockEvidence(
            text: b.text,
            row: b.row,
            order: b.order,
            points: b.points
                .map((p) => ReceiptOcrPoint(x: p.x * scale, y: p.y * scale))
                .toList(),
          );
      for (final labelHeight in [20.0, 40.0, 60.0]) {
        for (final valueHeight in [20.0, 40.0, 60.0]) {
          if (labelHeight > valueHeight * 2) continue;
          for (final otherHeight in [20.0, 40.0, 60.0]) {
            final basis = [
              labelHeight,
              valueHeight,
              otherHeight,
            ].reduce((a, b) => a > b ? a : b);
            for (final distant in [false, true]) {
              final original = _summaryCardBlocks();
              final blocks = <ReceiptOcrBlockEvidence>[];
              for (var i = 0; i < original.length; i++) {
                final b = original[i];
                blocks.add(
                  b.text == 'Invoice Date'
                      ? box(
                          b.text,
                          4,
                          371,
                          229,
                          467,
                          229 + labelHeight,
                          b.order,
                        )
                      : b.text == 'Apr 5, 2026'
                      ? box(
                          b.text,
                          4,
                          531,
                          230,
                          623,
                          230 + valueHeight,
                          b.order,
                        )
                      : b,
                );
                if (b.row == 5 && original[i + 1].row != 5) {
                  final bottom = (229 + labelHeight) > (230 + valueHeight)
                      ? 229 + labelHeight
                      : 230 + valueHeight;
                  final top = bottom + basis * (distant ? 3 : 0.5);
                  blocks.add(
                    box('Pay Before', 5, 531, top, 623, top + otherHeight, 30),
                  );
                }
              }
              final evidence = blocks.map(scaled).toList();
              final p = _parseBoundedUtility(evidence);
              expect(
                p.itemLineDecisions[4] ==
                    ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
                distant,
                reason:
                    'label=$labelHeight value=$valueHeight other=$otherHeight distant=$distant scale=$scale',
              );
              expect(p.blocks, containsAll(evidence));
            }
          }
        }
      }
      for (final prefix in [
        'Invoice No',
        'Bill Number',
        'Statement #',
        'Account No',
        'Customer ID',
      ]) {
        for (final id in [
          'INV99',
          'A-9',
          '2026',
          'ALPHA',
          'Previous-Balance',
          'Amount-Paid',
          'Credit',
          'Tax',
          'Discount',
        ]) {
          for (final distant in [false, true]) {
            final original = _summaryCardBlocks();
            final blocks = <ReceiptOcrBlockEvidence>[];
            for (var i = 0; i < original.length; i++) {
              final b = original[i];
              blocks.add(b);
              if (b.row == 3 && original[i + 1].row != 3) {
                blocks.add(
                  box(
                    '$prefix $id',
                    3,
                    distant ? 1355 : 955,
                    240,
                    distant ? 1600 : 1200,
                    260,
                    30,
                  ),
                );
              }
            }
            final evidence = blocks.map(scaled).toList();
            final p = _parseBoundedUtility(evidence);
            expect(
              p.itemLineDecisions[4] ==
                  ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
              distant || ['INV99', 'A-9', '2026'].contains(id),
              reason: '$prefix $id distant=$distant scale=$scale',
            );
            expect(p.blocks, containsAll(evidence));
          }
        }
      }
    }
  });

  test('disputed reference metadata cannot price a pending description', () {
    for (final reference in [
      'Invoice No INV99',
      'Invoice No Previous-Balance',
      'Invoice No ALPHA',
    ]) {
      for (final pending in [false, true]) {
        final blocks = <ReceiptOcrBlockEvidence>[];
        for (final b in _summaryCardBlocks()) {
          if (b.row == 1) continue;
          final row = b.row == 2
              ? 1
              : b.row == 3
              ? 2
              : b.row;
          if (b.text == 'Total Due' || b.text == 'Customer Name') {
            blocks.add(
              ReceiptOcrBlockEvidence(
                text: 'Invoice No INV99',
                row: row,
                order: 31,
                points: const [
                  ReceiptOcrPoint(x: 1000, y: 160),
                  ReceiptOcrPoint(x: 1190, y: 160),
                  ReceiptOcrPoint(x: 1190, y: 180),
                  ReceiptOcrPoint(x: 1000, y: 180),
                ],
              ),
            );
          }
          blocks.add(
            ReceiptOcrBlockEvidence(
              text: b.text,
              row: row,
              order: b.order,
              points: b.points,
            ),
          );
          if (b.text == 'AC987654321') {
            blocks.add(
              ReceiptOcrBlockEvidence(
                text: reference,
                row: 2,
                order: 32,
                points: const [
                  ReceiptOcrPoint(x: 955, y: 240),
                  ReceiptOcrPoint(x: 1200, y: 240),
                  ReceiptOcrPoint(x: 1200, y: 260),
                  ReceiptOcrPoint(x: 955, y: 260),
                ],
              ),
            );
            if (pending) {
              blocks.add(
                const ReceiptOcrBlockEvidence(
                  text: 'Premium Router Bundle',
                  row: 3,
                  order: 33,
                  points: [
                    ReceiptOcrPoint(x: 1250, y: 185),
                    ReceiptOcrPoint(x: 1450, y: 185),
                    ReceiptOcrPoint(x: 1450, y: 205),
                    ReceiptOcrPoint(x: 1250, y: 205),
                  ],
                ),
              );
            }
          }
        }
        final p = _parseBoundedUtility(blocks);
        expect(
          p.warnings.any((w) => w.contains('no traceable line amount')),
          pending,
          reason: '$reference pending=$pending',
        );
        expect(
          p.incompleteAdjustmentReasons.contains(
            ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine,
          ),
          pending,
          reason: '$reference pending=$pending',
        );
        expect(p.blocks, containsAll(blocks));
      }
    }
  });

  test('summary ownership measures competing heading sizes independently', () {
    ReceiptOcrBlockEvidence extra(
      String text,
      double left,
      double top,
      double right,
      double bottom,
    ) => ReceiptOcrBlockEvidence(
      text: text,
      row: 3,
      order: 30,
      points: [
        ReceiptOcrPoint(x: left, y: top),
        ReceiptOcrPoint(x: right, y: top),
        ReceiptOcrPoint(x: right, y: bottom),
        ReceiptOcrPoint(x: left, y: bottom),
      ],
    );
    for (final scale in [0.5, 1.0, 2.0]) {
      ReceiptOcrBlockEvidence scaled(ReceiptOcrBlockEvidence b) =>
          ReceiptOcrBlockEvidence(
            text: b.text,
            row: b.row,
            order: b.order,
            points: b.points
                .map((p) => ReceiptOcrPoint(x: p.x * scale, y: p.y * scale))
                .toList(),
          );
      for (final distant in [false, true]) {
        for (final field in ['date', 'name', 'amount']) {
          final original = _summaryCardBlocks();
          final blocks = <ReceiptOcrBlockEvidence>[];
          for (var i = 0; i < original.length; i++) {
            final b = original[i];
            if (field == 'date' &&
                (b.text == 'Account Number' || b.text == 'AC987654321')) {
              continue;
            }
            blocks.add(
              _summaryBlockVariant(
                b,
                text: field == 'name' && b.text == 'Alex Q. Sample'
                    ? 'Router Rental'
                    : b.text,
              ),
            );
            if (b.text == 'Customer Name') {
              blocks.add(switch (field) {
                'date' => extra(
                  'Pay Before',
                  531,
                  distant ? 30 : 130,
                  623,
                  distant ? 100 : 200,
                ),
                'name' => extra(
                  'Item',
                  distant ? -200 : -60,
                  205,
                  distant ? -140 : 0,
                  247,
                ),
                _ => extra(
                  'Unit Price',
                  distant ? 1310 : 1010,
                  180,
                  distant ? 1410 : 1110,
                  250,
                ),
              });
            }
          }
          final evidence = blocks.map(scaled).toList();
          final p = _parseBoundedUtility(evidence);
          expect(
            p.itemLineDecisions[4] ==
                ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
            distant,
            reason: '$field distant=$distant scale=$scale',
          );
          expect(p.blocks, containsAll(evidence));
        }
      }
      // Already owned neighboring fields do not become competing headings
      // just because their columns are close or one field is printed larger.
      final tight = _summaryCardBlocks()
          .map(
            (b) => b.text == 'Invoice Date'
                ? _summaryBlockVariant(b, dx: -170)
                : b.text == 'Apr 5, 2026'
                ? _summaryBlockVariant(b, dx: -172)
                : b,
          )
          .map(scaled)
          .toList();
      final p = _parseBoundedUtility(tight);
      expect(
        p.itemLineDecisions[4],
        ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
        reason: 'owned tight fields scale=$scale',
      );
      expect(p.blocks, containsAll(tight));
    }
  });

  test('date ownership requires positively explained nearby metadata', () {
    ReceiptOcrBlockEvidence extra(
      String text,
      int row,
      double left,
      double top,
      double right,
      double bottom,
      int order,
    ) => ReceiptOcrBlockEvidence(
      text: text,
      row: row,
      order: order,
      points: [
        ReceiptOcrPoint(x: left, y: top),
        ReceiptOcrPoint(x: right, y: top),
        ReceiptOcrPoint(x: right, y: bottom),
        ReceiptOcrPoint(x: left, y: bottom),
      ],
    );
    for (final scale in [0.5, 1.0, 2.0]) {
      ReceiptOcrBlockEvidence scaled(ReceiptOcrBlockEvidence b) =>
          ReceiptOcrBlockEvidence(
            text: b.text,
            row: b.row,
            order: b.order,
            points: b.points
                .map((p) => ReceiptOcrPoint(x: p.x * scale, y: p.y * scale))
                .toList(),
          );
      for (final distant in [false, true]) {
        for (final text in [
          'Pay Before',
          'Valid Until',
          'Unrecognized Heading',
          '有効期限',
          'Exp|ir|es',
          'P|a|y|B|y',
        ]) {
          final original = _summaryCardBlocks();
          final blocks = <ReceiptOcrBlockEvidence>[];
          for (var i = 0; i < original.length; i++) {
            final b = original[i];
            blocks.add(b);
            if (b.row == 3 && original[i + 1].row != 3) {
              final parts = text.split('|');
              final y = distant ? 107.0 : 207.0;
              for (var j = 0; j < parts.length; j++) {
                blocks.add(
                  extra(
                    parts[j],
                    3,
                    531 + j * 30,
                    y,
                    558 + j * 30,
                    y + 20,
                    30 + j,
                  ),
                );
              }
            }
          }
          final evidence = blocks.map(scaled).toList();
          final p = _parseBoundedUtility(evidence);
          expect(
            p.itemLineDecisions[4] ==
                ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
            distant,
            reason: '$text distant=$distant scale=$scale',
          );
          expect(p.blocks, containsAll(evidence));
        }
      }
      for (final label in [
        'Account Number',
        'Account No.',
        'Customer ID',
        'Client Number',
        'Invoice No',
        'Bill Number',
        'Statement #',
      ]) {
        for (final variant in [
          'valid',
          'missing',
          'duplicate',
          'unexplained',
          'money',
          'obstructed',
        ]) {
          final original = _summaryCardBlocks();
          final blocks = <ReceiptOcrBlockEvidence>[];
          for (var i = 0; i < original.length; i++) {
            final b = original[i];
            if (b.text == 'AC987654321' && variant == 'missing') continue;
            blocks.add(
              _summaryBlockVariant(
                b,
                text: b.text == 'Account Number'
                    ? label
                    : b.text == 'AC987654321' && variant == 'unexplained'
                    ? 'UNEXPLAINED'
                    : b.text == 'AC987654321' && variant == 'money'
                    ? 'USD 42.00'
                    : b.text,
              ),
            );
            if (b.text == 'AC987654321') {
              if (variant == 'duplicate') {
                blocks.add(extra('ID1234', 3, 530, 193, 639, 214, 30));
              }
              if (variant == 'obstructed') {
                blocks.add(extra('Note', 3, 498, 193, 525, 214, 30));
              }
            }
          }
          final evidence = blocks.map(scaled).toList();
          final p = _parseBoundedUtility(evidence);
          expect(
            p.itemLineDecisions[4] ==
                ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
            variant == 'valid',
            reason: '$label $variant scale=$scale',
          );
          expect(p.blocks, containsAll(evidence));
        }
      }
      for (final reference in [
        'Account No AC12345',
        'Invoice Number INV99',
        'Statement # 12345',
      ]) {
        final original = _summaryCardBlocks();
        final blocks = <ReceiptOcrBlockEvidence>[];
        for (final b in original) {
          if (b.text == 'Account Number') continue;
          blocks.add(
            _summaryBlockVariant(
              b,
              text: b.text == 'AC987654321' ? reference : b.text,
            ),
          );
        }
        final evidence = blocks.map(scaled).toList();
        final p = _parseBoundedUtility(evidence);
        expect(
          p.itemLineDecisions[4],
          ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
          reason: '$reference scale=$scale',
        );
        expect(p.blocks, containsAll(evidence));
      }
    }
  });

  test('summary ownership retains competing date and name owners', () {
    ReceiptOcrBlockEvidence label(
      String text,
      int row,
      double left,
      double top,
      double right,
      double bottom,
      int order,
    ) => ReceiptOcrBlockEvidence(
      text: text,
      row: row,
      order: order,
      points: [
        ReceiptOcrPoint(x: left, y: top),
        ReceiptOcrPoint(x: right, y: top),
        ReceiptOcrPoint(x: right, y: bottom),
        ReceiptOcrPoint(x: left, y: bottom),
      ],
    );
    for (final scale in [0.5, 1.0, 2.0]) {
      ReceiptOcrBlockEvidence scaled(ReceiptOcrBlockEvidence b) =>
          ReceiptOcrBlockEvidence(
            text: b.text,
            row: b.row,
            order: b.order,
            points: b.points
                .map((p) => ReceiptOcrPoint(x: p.x * scale, y: p.y * scale))
                .toList(),
          );
      for (final distant in [false, true]) {
        for (final heading in [
          'Expires',
          'Expiry',
          'Received',
          'Created',
          'Posted',
          'Processed',
          'Shipped',
          'Ordered',
          'Purchased',
          'Pay By',
        ]) {
          for (final split in [false, true]) {
            final original = _summaryCardBlocks();
            final blocks = <ReceiptOcrBlockEvidence>[];
            for (var i = 0; i < original.length; i++) {
              final b = original[i];
              blocks.add(b);
              if (b.row == 3 && original[i + 1].row != 3) {
                final y = distant ? 107.0 : 207.0;
                if (split) {
                  // Keep the existing account fields around both fragments.
                  final words = heading == 'Pay By'
                      ? ['Pay', 'By']
                      : [heading.substring(0, 3), heading.substring(3)];
                  blocks.add(label(words[0], 3, 531, y, 568, y + 20, 30));
                  blocks.add(label(words[1], 3, 572, y, 623, y + 20, 31));
                } else {
                  blocks.add(label(heading, 3, 531, y, 623, y + 20, 30));
                }
              }
            }
            final evidence = blocks.map(scaled).toList();
            final p = _parseBoundedUtility(evidence);
            expect(
              p.itemLineDecisions[4] ==
                  ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
              distant,
              reason:
                  'date=$heading split=$split distant=$distant scale=$scale',
            );
            expect(p.blocks, containsAll(evidence));
          }
        }
        for (final heading in [
          'Item',
          'Description',
          'Product',
          'Service',
          'SKU',
          '品目',
          'Unknown Label',
        ]) {
          for (final side in ['left', 'right', 'above', 'below']) {
            for (final laterRow in [false, true]) {
              final original = _summaryCardBlocks();
              final blocks = <ReceiptOcrBlockEvidence>[];
              final dx = distant ? 1300.0 : 0.0;
              final extra = switch (side) {
                'left' => label(
                  heading,
                  laterRow ? 5 : 3,
                  -dx,
                  216,
                  30 - dx,
                  237,
                  30,
                ),
                'right' => label(
                  heading,
                  laterRow ? 5 : 3,
                  192 + dx,
                  216,
                  222 + dx,
                  237,
                  30,
                ),
                'above' => label(
                  heading,
                  laterRow ? 5 : 3,
                  35 + dx,
                  190,
                  80 + dx,
                  211,
                  30,
                ),
                _ => label(
                  heading,
                  laterRow ? 5 : 3,
                  35 + dx,
                  242,
                  80 + dx,
                  263,
                  30,
                ),
              };
              for (var i = 0; i < original.length; i++) {
                final b = original[i];
                blocks.add(
                  _summaryBlockVariant(
                    b,
                    text: b.text == 'Alex Q. Sample' ? 'Router Rental' : b.text,
                  ),
                );
                final target = laterRow ? 5 : 3;
                if (b.row == target && original[i + 1].row != target) {
                  blocks.add(extra);
                }
              }
              final evidence = blocks.map(scaled).toList();
              final p = _parseBoundedUtility(evidence);
              expect(
                p.itemLineDecisions[4] ==
                    ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
                distant,
                reason:
                    'name=$heading side=$side later=$laterRow distant=$distant scale=$scale',
              );
              expect(p.blocks, containsAll(evidence));
            }
          }
        }
      }
    }
  });

  test('summary-card proof retains unexplained neighbors and split headings', () {
    ReceiptOcrBlockEvidence extra(
      String text,
      int row,
      double left,
      double top,
      double right,
      double bottom,
      int order,
    ) => ReceiptOcrBlockEvidence(
      text: text,
      row: row,
      order: order,
      points: [
        ReceiptOcrPoint(x: left, y: top),
        ReceiptOcrPoint(x: right, y: top),
        ReceiptOcrPoint(x: right, y: bottom),
        ReceiptOcrPoint(x: left, y: bottom),
      ],
    );
    for (final scale in [0.5, 1.0, 2.0]) {
      ReceiptOcrBlockEvidence scaled(ReceiptOcrBlockEvidence b) =>
          ReceiptOcrBlockEvidence(
            text: b.text,
            row: b.row,
            order: b.order,
            points: b.points
                .map((p) => ReceiptOcrPoint(x: p.x * scale, y: p.y * scale))
                .toList(),
          );
      for (final distant in [false, true]) {
        for (final spec in [
          ('Unit Price', false),
          ('Unit', false),
          ('Price', false),
          ('Hong Kong', false),
          ('Dollars', false),
          ('Alpha Beta', false),
          ('MonthlyPrice', false),
          ('単価', false),
          ('AutoPay Enabled', true),
          ('AutoPay Disabled', true),
          ('Auto Pay Active', true),
          ('Pending', true),
          ('[{Pending}]', true),
          ('Note [Review]', true),
          ('[Pending', false),
          ('Pending]', false),
          ('[{Pending}] Unit Price', false),
        ]) {
          final original = _summaryCardBlocks();
          final blocks = <ReceiptOcrBlockEvidence>[];
          for (var i = 0; i < original.length; i++) {
            final b = original[i];
            blocks.add(b);
            if (b.row == 3 && original[i + 1].row != 3) {
              blocks.add(
                extra(
                  spec.$1,
                  3,
                  distant ? 1300 : 955,
                  240,
                  distant ? 1450 : 1105,
                  258,
                  30,
                ),
              );
            }
          }
          final evidence = blocks.map(scaled).toList();
          final p = _parseBoundedUtility(evidence);
          expect(
            p.itemLineDecisions[4] ==
                ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
            distant || spec.$2,
            reason: '${spec.$1} distant=$distant scale=$scale',
          );
          expect(p.blocks, containsAll(evidence));
        }
        for (final stacked in [false, true]) {
          for (final crossRow in [false, true]) {
            final blocks = <ReceiptOcrBlockEvidence>[];
            for (final b in _summaryCardBlocks()) {
              if (b.text == 'Account Number' || b.text == 'AC987654321') {
                continue;
              }
              blocks.add(b);
              if (b.text == 'Total Due' && crossRow) {
                blocks.add(
                  extra(
                    'Pay',
                    2,
                    531,
                    (stacked ? 183 : 207) - (distant ? 100 : 0),
                    568,
                    (stacked ? 203 : 227) - (distant ? 100 : 0),
                    30,
                  ),
                );
              }
              if (b.text == 'Customer Name') {
                if (!crossRow) {
                  blocks.add(
                    extra(
                      'Pay',
                      3,
                      531,
                      (stacked ? 183 : 207) - (distant ? 100 : 0),
                      568,
                      (stacked ? 203 : 227) - (distant ? 100 : 0),
                      30,
                    ),
                  );
                }
                blocks.add(
                  extra(
                    'By',
                    3,
                    stacked ? 531 : 572,
                    207 - (distant ? 100 : 0),
                    stacked ? 559 : 600,
                    227 - (distant ? 100 : 0),
                    31,
                  ),
                );
              }
            }
            final evidence = blocks.map(scaled).toList();
            final p = _parseBoundedUtility(evidence);
            expect(
              p.itemLineDecisions[4] ==
                  ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
              distant,
              reason:
                  'Pay/By stacked=$stacked crossRow=$crossRow distant=$distant scale=$scale',
            );
            expect(p.blocks, containsAll(evidence));
          }
          final blocks = <ReceiptOcrBlockEvidence>[];
          final original = _summaryCardBlocks();
          for (var i = 0; i < original.length; i++) {
            final b = original[i];
            blocks.add(
              _summaryBlockVariant(
                b,
                text: b.row == 4 && b.text == 'USD 42.00' ? r'$42.00' : b.text,
              ),
            );
            if (b.row == 3 && original[i + 1].row != 3) {
              final dx = distant ? 500.0 : 0.0;
              blocks.add(
                extra('Hong Kong', 3, 955 + dx, 198, 1048 + dx, 218, 30),
              );
              blocks.add(
                extra(
                  'Dollars',
                  3,
                  (stacked ? 955 : 1052) + dx,
                  stacked ? 222 : 198,
                  (stacked ? 1035 : 1132) + dx,
                  stacked ? 242 : 218,
                  31,
                ),
              );
            }
          }
          final evidence = blocks.map(scaled).toList();
          final p = _parseBoundedUtility(evidence);
          expect(
            p.itemLineDecisions[4] ==
                ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
            distant,
            reason:
                'split denomination stacked=$stacked distant=$distant scale=$scale',
          );
          expect(p.blocks, containsAll(evidence));
        }
      }
    }
  });

  test('summary-card ownership includes neighboring monetary fragments', () {
    for (final spec in [
      for (final prefix in [
        ('HK', false),
        ('hk', false),
        ('H.K.', false),
        ('ＨＫ', false),
        ('CA', false),
        ('NZ', false),
        ('NT', false),
        ('A', false),
        ('S', false),
        ('R', false),
        ('US', true),
        ('U.S.', true),
        ('U.S.D.', true),
        ('D.Z.D.', false),
      ]) ...[
        (3, prefix.$1, 710.0, 194.0, prefix.$2),
        (5, prefix.$1, 955.0, 240.0, prefix.$2),
        (5, prefix.$1, 1300.0, 240.0, true),
      ],
      for (final qualifier in [
        'Payments',
        'payments',
        'PAYMENTS',
        '[Payments]',
        '{Payments}',
        '[{Payments}]',
      ]) ...[
        (3, qualifier, 710.0, 194.0, false),
        (5, qualifier, 955.0, 240.0, false),
        (5, qualifier, 1300.0, 240.0, true),
      ],
      for (final qualifier in [
        'Less',
        'minus',
        'plus',
        'per cent',
        'per mille',
        'versus',
        'vs',
        'subtract',
        'negative',
        'positive',
        'times',
        'divided by',
        'including',
        'includes',
        'included',
        'inclusive of',
        'incl.',
        'incl',
        'excluding',
        'per month',
        'each',
        'H',
        'K',
        'D.',
      ]) ...[
        (3, qualifier, 710.0, 194.0, false),
        (5, qualifier, 955.0, 240.0, false),
        (5, qualifier, 1300.0, 240.0, true),
      ],
      for (final phrase in [
        ('Hong Kong Dollars', false),
        ('HK Dollars', false),
        ('US Dollars', true),
        ('U.S. Dollars', true),
        ('United States Dollars', true),
        ('Hong Kong Dollars and US Dollars', false),
      ]) ...[
        (3, phrase.$1, 710.0, 194.0, phrase.$2),
        (5, phrase.$1, 955.0, 240.0, phrase.$2),
        (5, phrase.$1, 1300.0, 240.0, true),
      ],
      for (final qualifier in [
        'C.R.',
        'D.R.',
        'C R',
        'D R',
        'Note C.R.',
        'Note D.R.',
        '٪ p.a.',
        '؉ p.a.',
        '؊ p.a.',
        '％ p.a.',
        '﹪ p.a.',
      ]) ...[
        (3, qualifier, 710.0, 194.0, false),
        (5, qualifier, 955.0, 240.0, false),
        (5, qualifier, 1300.0, 240.0, true),
      ],
      (3, 'EUR', 710.0, 194.0, false),
      (3, 'ＥＵＲ', 710.0, 194.0, false),
      (5, 'ＥＵＲ', 955.0, 240.0, false),
      (5, 'ＵＳＤ１２．００', 955.0, 260.0, false),
      (3, '₱', 710.0, 194.0, false),
      (5, '₿', 955.0, 240.0, false),
      (5, 'Pending', 800.0, 240.0, false),
      (5, 'Pending', 475.0, 231.0, false),
      (5, 'Pending', 35.0, 218.0, false),
      (3, 'ＵＳＤ', 710.0, 194.0, true),
      (5, 'ＥＵＲ', 1300.0, 240.0, true),
      (5, '₱', 955.0, 600.0, true),
      (5, 'Pending', 1300.0, 240.0, true),

      (5, '(', 955.0, 240.0, false),
      (5, ')', 955.0, 240.0, false),
      (5, '(', 1300.0, 240.0, true),
      for (final marker in [
        'CR',
        'cr',
        'Cr',
        'DR',
        'dr',
        'dR',
        'credit',
        'Debit',
      ]) ...[
        (3, marker, 710.0, 194.0, false),
        (5, marker, 955.0, 240.0, false),
        (3, marker, 1300.0, 194.0, true),
        (5, marker, 955.0, 600.0, true),
      ],
      (5, '12.00 CR', 955.0, 240.0, false),
      (5, '12.00 and 42.00', 955.0, 240.0, false),
      (5, '12.00DR', 955.0, 240.0, false),
      (5, 'CR 1200', 955.0, 240.0, false),
      (5, '1200 DR', 955.0, 240.0, false),
      (5, '1200 and 4200', 955.0, 240.0, false),
      (5, '1200 less 4200', 955.0, 240.0, false),
      (5, 'less 1200', 955.0, 240.0, false),
      (5, 'versus 1200', 955.0, 240.0, false),
      (5, 'Compare with 1200', 955.0, 240.0, false),
      (5, 'Invoice No INV99', 955.0, 240.0, true),
      (5, 'Invoice No INV-99', 955.0, 240.0, true),
      (5, 'Pending-review', 955.0, 240.0, true),
      for (final qualifier in [
        '[Amount Paid]',
        '{Previous Balance}',
        'Note [Amount Paid]',
        'Note {Previous Balance}',
        '[{Amount Paid}]',
        '{[Previous Balance]}',
        '{Note [Payment Received]}',
        '[Note {Closing Balance}]',
      ]) ...[
        (3, qualifier, 710.0, 194.0, false),
        (5, qualifier, 955.0, 240.0, false),
        (5, qualifier, 1300.0, 240.0, true),
      ],
      (5, '[Pending]', 955.0, 240.0, true),
      (5, '{Pending}', 955.0, 240.0, true),
      (5, '[{Pending}]', 955.0, 240.0, true),
      (5, 'Note [Review]', 955.0, 240.0, true),

      for (final qualifier in [
        'Previous Balance',
        'Amount Paid',
        'Estimated Previous Balance',
        'Payments Received',
        'Payment',
        'Cash',
        'Card Charged',
        'Closing Balance',
      ]) ...[
        (3, qualifier, 710.0, 194.0, false),
        (5, qualifier, 955.0, 240.0, false),
        (5, qualifier, 1300.0, 240.0, true),
      ],
      for (final marker in [
        '% p.a.',
        '− pending',
        '+ pending',
        '(pending)',
        '/ month',
        '* estimate',
        '‰ rate',
      ]) ...[
        (3, marker, 710.0, 194.0, false),
        (5, marker, 955.0, 240.0, false),
        (5, marker, 1300.0, 240.0, true),
      ],

      (5, 'Invoice No 1200', 955.0, 240.0, true),
      (5, 'Invoice No USD 1200', 955.0, 240.0, false),
      (5, 'Invoice No INV99 1200', 955.0, 240.0, false),
      for (final rate in [
        '%',
        '‰',
        '‱',
        'percent',
        'percentages',
        'rates',
      ]) ...[
        (3, rate, 710.0, 194.0, false),
        (5, rate, 955.0, 240.0, false),
        (5, rate, 1300.0, 240.0, true),
      ],

      (5, '1200 versus 4200', 955.0, 240.0, false),
      (5, 'Compare 1200 against 4200', 955.0, 240.0, false),
      for (final qualifier in [
        'Service Charge 1200',
        'Adjustment 1200',
        'Tax',
        'Discount',
        'Refund',
        'Fee',
        'Taxes',
        'Discounts',
        'Fees',
        'Duties',
        'Credits',
        'Debits',
        'Adjustment1200',
        'Fee1200',
      ]) ...[
        (3, qualifier, 710.0, 194.0, false),
        (5, qualifier, 955.0, 240.0, false),
        (5, qualifier, 1300.0, 240.0, true),
      ],

      (5, '1200 moins 4200', 955.0, 240.0, false),
      (5, '1200 less 4200', 1300.0, 240.0, true),
      (5, 'Mar 5, 2026 – Apr 4, 2026', 955.0, 240.0, true),
      (5, 'Mar5,2026–Apr4,2026', 955.0, 240.0, true),
      (5, 'Mar 5, 2026 – Apr 4, 2026 CR', 955.0, 240.0, false),
      (5, 'Mar 5, 2026 – Apr 4, 2026 1200', 955.0, 240.0, false),

      (5, '12.00 CR', 1300.0, 240.0, true),
      (5, '12.00 and 42.00', 955.0, 600.0, true),
      (5, 'EUR +12.00', 955.0, 240.0, false),
      (5, 'EUR 12.00 / USD 42.00', 955.0, 240.0, false),
      (5, '12', 955.0, 240.0, false),
      (5, '1200', 955.0, 240.0, false),
      (5, 'Pending', 955.0, 240.0, true),
      (5, 'EUR +12.00', 1300.0, 240.0, true),
      (5, '1200', 955.0, 600.0, true),
      (5, 'EUR', 955.0, 240.0, false),
      (3, 'try', 710.0, 194.0, false),
      (5, 'rUb', 955.0, 240.0, false),
      (3, 'DZD', 710.0, 194.0, false),
      (5, r'EUR $', 955.0, 240.0, false),
      (3, '−', 710.0, 194.0, false),
      (5, 'EUR −', 955.0, 240.0, false),
      (5, 'USD 12.00', 955.0, 260.0, false),
      (5, r'DZD $12.00', 955.0, 260.0, false),
      (5, 'USD / USD', 955.0, 240.0, false),
      (3, 'USD', 710.0, 194.0, true),
      (5, r'USD $', 955.0, 240.0, true),
      (5, 'EUR', 1300.0, 240.0, true),
      (5, 'EUR', 955.0, 600.0, true),
    ]) {
      for (final scale in [0.5, 1.0, 2.0]) {
        final original = _summaryCardBlocks();
        final blocks = <ReceiptOcrBlockEvidence>[];
        for (var index = 0; index < original.length; index++) {
          final b = original[index];
          blocks.add(
            b.row == 4 && b.text == 'USD 42.00'
                ? _summaryBlockVariant(b, text: r'$42.00')
                : b,
          );
          if (b.row == spec.$1 &&
              (index + 1 == original.length ||
                  original[index + 1].row != b.row)) {
            blocks.add(
              ReceiptOcrBlockEvidence(
                text: spec.$2,
                row: b.row,
                order: 30,
                points: [
                  ReceiptOcrPoint(x: spec.$3, y: spec.$4),
                  ReceiptOcrPoint(x: spec.$3 + 41, y: spec.$4),
                  ReceiptOcrPoint(x: spec.$3 + 41, y: spec.$4 + 18),
                  ReceiptOcrPoint(x: spec.$3, y: spec.$4 + 18),
                ],
              ),
            );
          }
        }
        final scaled = blocks
            .map(
              (b) => ReceiptOcrBlockEvidence(
                text: b.text,
                row: b.row,
                order: b.order,
                points: b.points
                    .map((p) => ReceiptOcrPoint(x: p.x * scale, y: p.y * scale))
                    .toList(),
              ),
            )
            .toList();
        final preview = _parseBoundedUtility(scaled);
        final reason = '$spec at $scale';
        expect(preview.currency, 'USD', reason: reason);
        expect(preview.total, '42.00', reason: reason);
        expect(
          preview.itemLineDecisions[4] ==
              ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
          spec.$5,
          reason: reason,
        );
        expect(preview.blocks, containsAll(scaled), reason: reason);
      }
    }
  });

  test(
    'summary-card ownership checks split prefixes and alternative date owners',
    () {
      for (final scale in [0.5, 1.0, 2.0]) {
        ReceiptOcrBlockEvidence scaled(ReceiptOcrBlockEvidence b) =>
            ReceiptOcrBlockEvidence(
              text: b.text,
              row: b.row,
              order: b.order,
              points: b.points
                  .map((p) => ReceiptOcrPoint(x: p.x * scale, y: p.y * scale))
                  .toList(),
            );
        for (final distant in [false, true]) {
          for (final fragments in [
            ['H', 'K'],
            ['E', 'U', 'R'],
            ['U', 'S'],
            ['D', 'Z', 'D'],
          ]) {
            final blocks = <ReceiptOcrBlockEvidence>[];
            final original = _summaryCardBlocks();
            for (var i = 0; i < original.length; i++) {
              final b = original[i];
              blocks.add(
                _summaryBlockVariant(
                  b,
                  text: b.row == 4 && b.text == 'USD 42.00'
                      ? r'$42.00'
                      : b.text,
                ),
              );
              if (b.row == 3 && original[i + 1].row != 3) {
                for (var j = 0; j < fragments.length; j++) {
                  final left = 701.0 + j * 16 + (distant ? 600 : 0);
                  blocks.add(
                    ReceiptOcrBlockEvidence(
                      text: fragments[j],
                      row: 3,
                      order: 30 + j,
                      points: [
                        ReceiptOcrPoint(x: left, y: 214),
                        ReceiptOcrPoint(x: left + 13, y: 214),
                        ReceiptOcrPoint(x: left + 13, y: 232),
                        ReceiptOcrPoint(x: left, y: 232),
                      ],
                    ),
                  );
                }
              }
            }
            final evidence = blocks.map(scaled).toList();
            final p = _parseBoundedUtility(evidence);
            expect(
              p.itemLineDecisions[4] ==
                  ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
              distant,
              reason: '$fragments distant=$distant scale=$scale',
            );
            expect(p.blocks, containsAll(evidence));
          }
        }
        for (final heading in ['Billing Period', 'Service Period']) {
          for (final variant in [
            'owned',
            'missing',
            'extra-money',
            'duplicate',
            'corridor',
            'incomplete',
          ]) {
            final blocks = <ReceiptOcrBlockEvidence>[];
            for (final b in _summaryCardBlocks()) {
              blocks.add(
                ReceiptOcrBlockEvidence(
                  text: b.text,
                  row: b.row >= 5 ? b.row + 1 : b.row,
                  order: b.order,
                  points: b.points,
                ),
              );
              if (b.row == 4 && b.text == 'USD 42.00') {
                blocks.add(
                  ReceiptOcrBlockEvidence(
                    text: heading,
                    row: 5,
                    order: 30,
                    points: const [
                      ReceiptOcrPoint(x: 371, y: 264),
                      ReceiptOcrPoint(x: 467, y: 264),
                      ReceiptOcrPoint(x: 467, y: 284),
                      ReceiptOcrPoint(x: 371, y: 284),
                    ],
                  ),
                );
                if (variant != 'missing') {
                  for (var n = 0; n < (variant == 'duplicate' ? 2 : 1); n++) {
                    blocks.add(
                      ReceiptOcrBlockEvidence(
                        text: variant == 'extra-money'
                            ? 'Mar 5, 2026 – Apr 4, 2026 1200'
                            : variant == 'incomplete'
                            ? 'Mar 5, 2026 –'
                            : 'Mar 5, 2026 – Apr 4, 2026',
                        row: 5,
                        order: 31 + n,
                        points: const [
                          ReceiptOcrPoint(x: 531, y: 265),
                          ReceiptOcrPoint(x: 699, y: 265),
                          ReceiptOcrPoint(x: 699, y: 285),
                          ReceiptOcrPoint(x: 531, y: 285),
                        ],
                      ),
                    );
                  }
                }
                if (variant == 'corridor') {
                  blocks.add(
                    const ReceiptOcrBlockEvidence(
                      text: 'Note',
                      row: 5,
                      order: 34,
                      points: [
                        ReceiptOcrPoint(x: 485, y: 265),
                        ReceiptOcrPoint(x: 515, y: 265),
                        ReceiptOcrPoint(x: 515, y: 285),
                        ReceiptOcrPoint(x: 485, y: 285),
                      ],
                    ),
                  );
                }
              }
            }
            final evidence = blocks.map(scaled).toList();
            final p = _parseBoundedUtility(evidence);
            expect(
              p.itemLineDecisions[4] ==
                  ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
              variant == 'owned',
              reason: '$heading $variant scale=$scale',
            );
            expect(p.blocks, containsAll(evidence));
          }
        }
        for (final heading in [
          'Due Date',
          'Issued on',
          'Payment Date',
          'Due',
          'Expires',
          'Date',
          'InvoiceDate',
          'Bill',
          'Invoice',
          'Statement',
          'Transaction',
          'Order',
          'Purchase',
          'Issued',
          'Pay By',
          'Payment',
          'Paid',
          'Previous',
          'Prior',
          'Last',
          'Refund',
          'Reference',
          'Meter',
          'Reading',
          'Billing Period',
          'Service Period',
          'Period From',
          'Period To',
        ]) {
          for (final position in [
            (531.0, 207.0, false),
            (531.0, 253.0, false),
            (640.0, 230.0, false),
            (531.0, 130.0, true),
          ]) {
            final blocks = <ReceiptOcrBlockEvidence>[];
            for (final b in _summaryCardBlocks()) {
              if (b.text == 'Account Number' || b.text == 'AC987654321') {
                continue;
              }
              blocks.add(b);
              if (b.text == 'Customer Name') {
                blocks.add(
                  ReceiptOcrBlockEvidence(
                    text: heading,
                    row: 3,
                    order: 30,
                    points: [
                      ReceiptOcrPoint(x: position.$1, y: position.$2),
                      ReceiptOcrPoint(x: position.$1 + 92, y: position.$2),
                      ReceiptOcrPoint(x: position.$1 + 92, y: position.$2 + 20),
                      ReceiptOcrPoint(x: position.$1, y: position.$2 + 20),
                    ],
                  ),
                );
              }
            }
            final evidence = blocks.map(scaled).toList();
            final p = _parseBoundedUtility(evidence);
            expect(
              p.itemLineDecisions[4] ==
                  ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
              position.$3,
              reason: '$heading $position scale=$scale',
            );
            expect(p.blocks, containsAll(evidence));
          }
        }
      }
    },
  );

  test('summary-card date ownership rejects staggered competing labels', () {
    for (final shift in [-11.0, 9.0]) {
      for (final competing in [false, true]) {
        for (final scale in [0.5, 1.0, 2.0]) {
          final original = _summaryCardBlocks();
          final blocks = <ReceiptOcrBlockEvidence>[];
          for (var index = 0; index < original.length; index++) {
            final block = original[index];
            blocks.add(
              block.text == 'Apr 5, 2026'
                  ? _summaryBlockVariant(block, dy: shift)
                  : block,
            );
            if (competing && block.row == 5 && original[index + 1].row != 5) {
              final top = shift < 0 ? 209.0 : 249.0;
              blocks.add(
                ReceiptOcrBlockEvidence(
                  text: 'Due Date',
                  row: 5,
                  order: 30,
                  points: [
                    ReceiptOcrPoint(x: 371, y: top),
                    ReceiptOcrPoint(x: 467, y: top),
                    ReceiptOcrPoint(x: 467, y: top + 20),
                    ReceiptOcrPoint(x: 371, y: top + 20),
                  ],
                ),
              );
            }
          }
          final scaled = blocks
              .map(
                (block) => ReceiptOcrBlockEvidence(
                  text: block.text,
                  row: block.row,
                  order: block.order,
                  points: block.points
                      .map(
                        (point) => ReceiptOcrPoint(
                          x: point.x * scale,
                          y: point.y * scale,
                        ),
                      )
                      .toList(),
                ),
              )
              .toList();
          final preview = _parseBoundedUtility(scaled);
          expect(
            preview.itemLineDecisions[4] ==
                ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
            !competing,
            reason: '$shift $competing $scale',
          );
          expect(preview.blocks, containsAll(scaled));
        }
      }
    }
  });

  test('whole-unit neighboring evidence declines JPY summary ownership', () {
    for (final fragment in [
      '1200',
      'CR 1200',
      '1200 DR',
      '1200 and 4200',
      '1200 less 4200',
      '1200 versus 4200',
      'Compare 1200 against 4200',
      '1200 moins 4200',
      'less 1200',
      'versus 1200',
      'Compare with 1200',
    ]) {
      for (final competing in [false, true]) {
        final original = _summaryCardBlocks();
        final blocks = <ReceiptOcrBlockEvidence>[];
        for (var index = 0; index < original.length; index++) {
          final block = original[index];
          blocks.add(
            _summaryBlockVariant(
              block,
              text: block.text.replaceAll('USD', 'JPY'),
            ),
          );
          if (competing && block.row == 5 && original[index + 1].row != 5) {
            blocks.add(
              ReceiptOcrBlockEvidence(
                text: fragment,
                row: 5,
                order: 30,
                points: [
                  ReceiptOcrPoint(x: 955, y: 240),
                  ReceiptOcrPoint(x: 1090, y: 240),
                  ReceiptOcrPoint(x: 1090, y: 258),
                  ReceiptOcrPoint(x: 955, y: 258),
                ],
              ),
            );
          }
        }
        final preview = _parseBoundedUtility(blocks);
        expect(preview.currency, 'JPY');
        expect(
          preview.itemLineDecisions[4] ==
              ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
          !competing,
        );
        expect(preview.blocks, containsAll(blocks));
      }
    }
  });

  test(
    'summary-card proven labels preserve completeness without hiding items',
    () {
      for (final grouped in [false, true]) {
        for (final pending in [false, true]) {
          for (final distant in [false, true]) {
            final blocks = <ReceiptOcrBlockEvidence>[];
            for (final b in _summaryCardBlocks()) {
              if ([
                'Internet Service Bill',
                'Account Number',
                'AC987654321',
              ].contains(b.text)) {
                continue;
              }
              blocks.add(
                ReceiptOcrBlockEvidence(
                  text: b.text,
                  row: grouped && b.row == 2 ? 3 : b.row,
                  order: b.order,
                  points: b.points,
                ),
              );
              if (pending && b.text == 'Customer Name') {
                blocks.add(
                  ReceiptOcrBlockEvidence(
                    text: 'Premium Router Bundle',
                    row: 3,
                    order: 30,
                    points: [
                      ReceiptOcrPoint(x: distant ? 1200 : 1000, y: 185),
                      ReceiptOcrPoint(x: distant ? 1380 : 1180, y: 185),
                      ReceiptOcrPoint(x: distant ? 1380 : 1180, y: 205),
                      ReceiptOcrPoint(x: distant ? 1200 : 1000, y: 205),
                    ],
                  ),
                );
              }
            }
            final preview = _parseBoundedUtility(blocks);
            final reason = 'grouped=$grouped pending=$pending distant=$distant';
            // Nearby unexplained prose keeps fallback and its uncertainty; a
            // distant pending description cannot borrow the proven summary amount.
            expect(preview.items.map((i) => i.lineTotal), [
              if (pending && !distant) '42.00',
              '35.00',
              '7.00',
            ], reason: reason);
            expect(
              preview.warnings.any(
                (w) => w.contains('no traceable line amount'),
              ),
              pending,
              reason: reason,
            );
            expect(
              preview.incompleteAdjustmentReasons.contains(
                ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine,
              ),
              pending,
              reason: reason,
            );
            expect(preview.adjustmentsComplete, !pending, reason: reason);
            expect(preview.blocks, containsAll(blocks), reason: reason);
          }
        }
      }
    },
  );

  test('summary-card exclusion preserves pending description uncertainty', () {
    final blocks = <ReceiptOcrBlockEvidence>[];
    for (final b in _summaryCardBlocks()) {
      if (b.row == 1) continue;
      final row = b.row == 2
          ? 1
          : b.row == 3
          ? 2
          : b.row;
      // Recognized metadata on the label rows prevents unrelated header
      // warnings from masking the missing item's completeness check.
      if (b.text == 'Total Due' || b.text == 'Customer Name') {
        blocks.add(
          ReceiptOcrBlockEvidence(
            text: 'Invoice No INV99',
            row: row,
            order: 31,
            points: const [
              ReceiptOcrPoint(x: 1000, y: 160),
              ReceiptOcrPoint(x: 1190, y: 160),
              ReceiptOcrPoint(x: 1190, y: 180),
              ReceiptOcrPoint(x: 1000, y: 180),
            ],
          ),
        );
      }
      blocks.add(
        ReceiptOcrBlockEvidence(
          text: b.text,
          row: row,
          order: b.order,
          points: b.points,
        ),
      );
      if (b.text == 'AC987654321') {
        blocks.add(
          const ReceiptOcrBlockEvidence(
            // Outside the summary's monetary neighborhood, but still on
            // the preceding logical row used by completeness accounting.
            text: 'Premium Router Bundle',
            row: 3,
            order: 30,
            points: [
              ReceiptOcrPoint(x: 1200, y: 185),
              ReceiptOcrPoint(x: 1380, y: 185),
              ReceiptOcrPoint(x: 1380, y: 205),
              ReceiptOcrPoint(x: 1200, y: 205),
            ],
          ),
        );
      }
    }
    final preview = _parseBoundedUtility(blocks);
    expect(
      preview.itemLineDecisions[4],
      ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
    );
    expect(preview.items.map((i) => i.description), [
      'Broadband Plan',
      'Router Rental',
    ]);
    expect(
      preview.warnings.any((w) => w.contains('no traceable line amount')),
      isTrue,
    );
    expect(
      preview.incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
    );
    expect(preview.blocks, containsAll(blocks));
    final withoutPending = _parseBoundedUtility(
      blocks.where((b) => b.text != 'Premium Router Bundle').toList(),
    );
    expect(
      withoutPending.warnings.any(
        (w) => w.contains('no traceable line amount'),
      ),
      isFalse,
    );
    expect(
      withoutPending.incompleteAdjustmentReasons,
      isNot(
        contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
      ),
    );
  });

  test('summary-card exclusion requires unambiguous printed denominations', () {
    for (final money in [
      '42.00%',
      'USD 42.00%',
      r'EUR $42.00',
      r'$42.00 EUR',
      r'USD €42.00',
      'EUR 42.00 USD',
      r'USD $42.00',
      r'$42.00 $',
      'usd 42.00 USD',
      for (final marker in ['try', 'Try', 'tRy', 'rub', 'Rub', 'rUb']) ...[
        '$marker 42.00 USD',
        'USD 42.00 $marker',
      ],
    ]) {
      final blocks = _summaryCardBlocks()
          .map(
            (b) => b.row == 4 && b.text == 'USD 42.00'
                ? _summaryBlockVariant(b, text: money)
                : b,
          )
          .toList();
      final preview = _parseBoundedUtility(blocks);
      if (money == r'$42.00 $' || money == 'usd 42.00 USD') {
        expect(
          preview.itemLineDecisions[4],
          ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
          reason: money,
        );
      } else {
        expect(
          preview.itemLineDecisions[4],
          isNot(ReceiptOcrItemLineDecision.metadataOrHeaderSkipped),
          reason: money,
        );
      }
      expect(preview.blocks, containsAll(blocks), reason: money);
    }
    for (final code in ['TRY', 'RUB']) {
      final blocks = _summaryCardBlocks()
          .map(
            (b) => _summaryBlockVariant(
              b,
              text: b.row == 4 && b.text == 'USD 42.00'
                  ? '${code.toLowerCase()} 42.00 $code'
                  : b.text.replaceAll('USD', code),
            ),
          )
          .toList();
      final preview = _parseBoundedUtility(blocks);
      expect(preview.currency, code);
      expect(
        preview.itemLineDecisions[4],
        ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
        reason: code,
      );
      expect(preview.items.map((i) => i.description), [
        'Broadband Plan',
        'Router Rental',
      ], reason: code);
      expect(preview.blocks, containsAll(blocks), reason: code);
    }
  });

  test(
    'summary-card total belongs to its label, not adjacent header fields',
    () {
      for (final sample in [(0.5, 'USD '), (1.0, r'$'), (2.0, 'USD ')]) {
        final scale = sample.$1;
        final blocks = _summaryCardBlocks()
            .map(
              (b) => ReceiptOcrBlockEvidence(
                text: b.text.replaceAll('USD ', sample.$2),
                row: b.row,
                order: b.order,
                points: b.points
                    .map(
                      (p) => ReceiptOcrPoint(
                        x: p.x * scale + 10,
                        y: p.y * scale + 15,
                      ),
                    )
                    .toList(),
              ),
            )
            .toList();
        final preview = _parseBoundedUtility(blocks);
        expect(preview.items.map((i) => i.description), [
          'Broadband Plan',
          'Router Rental',
        ]);
        expect(preview.items.map((i) => i.lineTotal), ['35.00', '7.00']);
        expect(preview.total, '42.00');
        expect(preview.blocks, containsAll(blocks));
        expect(
          preview.itemLineDecisions[4],
          ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
        );
      }
    },
  );

  test(
    'summary-card ownership declines incomplete or conflicting evidence',
    () {
      final variants = <String, List<ReceiptOcrBlockEvidence>>{};
      void variant(
        String label,
        ReceiptOcrBlockEvidence Function(ReceiptOcrBlockEvidence) change,
      ) {
        variants[label] = _summaryCardBlocks().map(change).toList();
      }

      variant(
        'no geometry',
        (b) => _summaryBlockVariant(b, withGeometry: false),
      );
      variant(
        'one missing geometry',
        (b) => b.text == 'Alex Q. Sample'
            ? _summaryBlockVariant(b, withGeometry: false)
            : b,
      );
      variant(
        'unlocated later evidence',
        (b) => b.row == 9 ? _summaryBlockVariant(b, withGeometry: false) : b,
      );
      variant(
        'distant label',
        (b) => b.text == 'Total Due' ? _summaryBlockVariant(b, dy: -80) : b,
      );
      variant(
        'unrelated column',
        (b) => b.text == 'Total Due' ? _summaryBlockVariant(b, dx: -250) : b,
      );
      variant(
        'product total label',
        (b) => b.text == 'Total Due'
            ? _summaryBlockVariant(b, text: 'Total Security Plan')
            : b,
      );
      variant(
        'unowned description',
        (b) => b.text == 'Customer Name'
            ? _summaryBlockVariant(b, text: 'Description')
            : b,
      );
      variant(
        'unowned date',
        (b) => b.text == 'Invoice Date'
            ? _summaryBlockVariant(b, text: 'Invoice Date Planner')
            : b,
      );
      variant(
        'non-date value',
        (b) => b.text == 'Apr 5, 2026'
            ? _summaryBlockVariant(b, text: 'Edition 5, 2026')
            : b,
      );
      variant(
        'date displaced',
        (b) => b.text == 'Apr 5, 2026' ? _summaryBlockVariant(b, dy: 70) : b,
      );
      variant(
        'currency conflict',
        (b) => b.row == 4 && b.text == 'USD 42.00'
            ? _summaryBlockVariant(b, text: 'EUR 42.00')
            : b,
      );
      variant(
        'different amount',
        (b) => b.row == 4 && b.text == 'USD 42.00'
            ? _summaryBlockVariant(b, text: 'USD 43.00')
            : b,
      );
      variant(
        'second amount',
        (b) => b.text == 'Apr 5, 2026'
            ? _summaryBlockVariant(b, text: 'USD 5.00')
            : b,
      );
      variant(
        'degenerate geometry',
        (b) => b.text == 'Total Due'
            ? ReceiptOcrBlockEvidence(
                text: b.text,
                row: b.row,
                order: b.order,
                points: List.filled(4, b.points.first),
              )
            : b,
      );
      variant(
        'nonfinite geometry',
        (b) =>
            b.text == 'Total Due' ? _summaryBlockVariant(b, dx: double.nan) : b,
      );
      final original = _summaryCardBlocks();
      final totalLabel = original.singleWhere((b) => b.text == 'Total Due');
      variants['competing label'] = [
        for (final b in original) ...[
          b,
          if (b.text == 'AC987654321')
            ReceiptOcrBlockEvidence(
              text: 'Balance Due',
              row: 3,
              order: 30,
              points: totalLabel.points,
            ),
        ],
      ];
      for (final text in ['Balance Due', 'Pending']) {
        variants['intervening $text'] = [
          for (final b in original) ...[
            b,
            if (b.text == 'AC987654321')
              ReceiptOcrBlockEvidence(
                text: text,
                row: 3,
                order: 30,
                points: totalLabel.points
                    .map((p) => ReceiptOcrPoint(x: p.x, y: p.y + 31))
                    .toList(),
              ),
          ],
        ];
      }
      for (final entry in variants.entries) {
        final preview = _parseBoundedUtility(entry.value);
        expect(
          preview.itemLineDecisions[4],
          isNot(ReceiptOcrItemLineDecision.metadataOrHeaderSkipped),
          reason: entry.key,
        );
        expect(
          preview.items.any((i) => i.description.contains('Alex Q. Sample')),
          isTrue,
          reason: entry.key,
        );
        expect(preview.blocks, containsAll(entry.value), reason: entry.key);
      }
    },
  );

  test(
    'summary-card ownership preserves nearby genuine items and fee evidence',
    () {
      final original = _summaryCardBlocks();
      final blocks = <ReceiptOcrBlockEvidence>[
        for (final b in original) ...[
          b,
          if (b.row == 4 && b.text == 'USD 42.00')
            ReceiptOcrBlockEvidence(
              text: 'Total Security Plan USD 42.00',
              row: 4,
              order: 30,
              points: [
                const ReceiptOcrPoint(x: 1000, y: 220),
                const ReceiptOcrPoint(x: 1350, y: 220),
                const ReceiptOcrPoint(x: 1350, y: 250),
                const ReceiptOcrPoint(x: 1000, y: 250),
              ],
            ),
        ],
      ];
      final preview = _parseBoundedUtility(blocks);
      expect(
        preview.items.any(
          (i) =>
              i.description.contains('Total Security Plan') &&
              i.lineTotal == '42.00',
        ),
        isTrue,
      );
      expect(
        preview.itemLineDecisions[4],
        isNot(ReceiptOcrItemLineDecision.metadataOrHeaderSkipped),
      );
      expect(
        preview.items.any((i) => i.description == 'Broadband Plan'),
        isTrue,
      );
      expect(preview.blocks, containsAll(blocks));

      // An independently priced fee is retained even when the summary is owned.
      final withFee = [
        ...original,
        ReceiptOcrBlockEvidence(
          text: 'County Network Fee USD 2.00',
          order: 30,
          row: 10,
          points: const [
            ReceiptOcrPoint(x: 50, y: 1030),
            ReceiptOcrPoint(x: 717, y: 1030),
            ReceiptOcrPoint(x: 717, y: 1050),
            ReceiptOcrPoint(x: 50, y: 1050),
          ],
        ),
      ];
      final feePreview = _parseBoundedUtility(withFee);
      expect(
        feePreview.itemLineDecisions[4],
        ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
      );
      expect(
        feePreview.items.any(
          (i) => i.description == 'County Network Fee' && i.lineTotal == '2.00',
        ),
        isTrue,
      );
      expect(feePreview.blocks, containsAll(withFee));
    },
  );

  test('qualified footers retain owned amounts beside adjacent periods', () {
    List<ReceiptOcrBlockEvidence> splitFooter(
      String label, {
      String period = 'Feb 5 – Mar 4, 2025',
      String money = 'USD 54.30',
      bool extraDescription = false,
    }) {
      final original = _boundedUtilityBlocks(
        description: 'Next Month Estimate',
      );
      return [
        ...original.where((b) => b.row < 3),
        _layoutBlock(label, 7, 3, 50, 716),
        if (extraDescription)
          _layoutBlock('Independent Reference', 8, 4, 50, 383),
        _layoutBlock(period, 9, 4, 417, 567),
        _layoutBlock(money, 10, 4, 659, 716),
        for (final b in original.where((b) => b.row >= 3))
          _layoutBlock(
            b.text,
            b.order + 5,
            b.row + 2,
            b.points[0].x,
            b.points[1].x,
          ),
      ];
    }

    for (final label in [
      'Final Total',
      'Final Subtotal',
      'Final Sub Total',
      'Revised Total',
      'Summary and Final Total',
    ]) {
      for (final period in [
        'Feb 5 – Mar 4, 2025',
        'March 2025',
        'Printed period unclear',
      ]) {
        for (final money in ['USD 54.30', '54.30']) {
          final blocks = splitFooter(label, period: period, money: money);
          final preview = _parseBoundedUtility(blocks);
          expect(
            preview.items.any((i) => i.lineTotal == '59.99'),
            isFalse,
            reason: '$label | $period | $money',
          );
          expect(preview.blocks, containsAll(blocks));
        }
      }
    }
    for (final label in [
      'Final Total Security Plan',
      'Premium Subtotal Plan',
      'Payment Plan with Total Security Plan',
      'Balance Board for Total Security Plan',
    ]) {
      final blocks = splitFooter(label);
      final preview = _parseBoundedUtility(blocks);
      expect(
        preview.items.any((i) => i.lineTotal == '59.99'),
        isTrue,
        reason: label,
      );
      expect(preview.blocks, containsAll(blocks));
    }
    for (final label in ['Final Total', 'Final Subtotal']) {
      final blocks = splitFooter(label, extraDescription: true);
      final preview = _parseBoundedUtility(blocks);
      expect(
        preview.items.any((i) => i.lineTotal == '59.99'),
        isTrue,
        reason: label,
      );
      expect(preview.blocks, containsAll(blocks));
    }
  });
  test('established footer phrases survive leading qualifiers', () {
    for (final label in [
      'Final Total Amount Due',
      'Adjusted Total Amount Due',
      'Corrected Grand Total',
      'Final Amount Due',
      'Net Balance Due',
      'Final Payment Due',
      'Revised Total including Tax',
      'Current Grand Total',
      'Final Subtotal',
      'Final Sub Total',
      'Final Total for Billing Cycle 47',
      'Summary and Final Total',
      'Taxes and Total',
      'Summary for Total',
    ]) {
      final original = _boundedUtilityBlocks(
        description: 'Next Month Estimate',
      );
      final blocks = [
        ...original.where((b) => b.row < 3),
        _layoutBlock(label, 7, 3, 50, 640),
        _layoutBlock('USD 54.30', 9, 3, 659, 716),
        _layoutBlock('Contact us', 10, 3, 828, 1020),
        for (final b in original.where((b) => b.row >= 3))
          _layoutBlock(
            b.text,
            b.order + 4,
            b.row + 1,
            b.points[0].x,
            b.points[1].x,
          ),
      ];
      final preview = _parseBoundedUtility(blocks);
      expect(
        preview.items.any((i) => i.lineTotal == '59.99'),
        isFalse,
        reason: label,
      );
      expect(preview.blocks, containsAll(blocks));
    }
    for (final label in [
      'Final Total Security Plan',
      'Premium Subtotal Plan',
      'Final Payment Plan',
      'Payment Plan with Total Security Plan',
      'Balance Board for Total Security Plan',
      'Payment Processing Subscription',
    ]) {
      final blocks = _boundedUtilityBlocks(description: label);
      final preview = _parseBoundedUtility(blocks);
      expect(
        preview.items.any(
          (i) => i.description == label && i.lineTotal == '59.99',
        ),
        isTrue,
        reason: label,
      );
      expect(preview.blocks, containsAll(blocks));
    }
  });
  test('plural service-charge compounds preserve financial ambiguity', () {
    final expectedDiscounts = <String, String?>{
      for (final role in ['Service Charges', 'Service Fees'])
        for (final kind in ['Plan', 'Package', 'Subscription'])
          '$role $kind Discount (12 months)': null,
      'Services Charges Plan Discount (12 months)': null,
      'Services Fees Plan Discount (12 months)': null,
      'Service-Charges Plan Discount (12 months)': null,
      'Service-Fees Plan Discount (12 months)': null,
      'Internet Service Charges Plan Discount (12 months)': null,
      'Internet Service Fees Plan Discount (12 months)': null,
      'Service Plan Discount (12 months)': '-10.00',
      'Internet Service Plan Discount (12 months)': '-10.00',
      'Service Package Discount (12 months)': '-10.00',
      'Customer Service Discount (12 months)': '-10.00',
    };
    for (final entry in expectedDiscounts.entries) {
      final blocks = _boundedUtilityBlocks(discountAmount: 'USD -10.00');
      final i = blocks.indexWhere((b) => b.order == 12);
      blocks[i] = _layoutBlock(entry.key, 12, 4, 51, 383);
      final j = blocks.indexWhere((b) => b.order == 15);
      blocks[j] = _layoutBlock('Mon - Fri, 8 AM - 8 PM PT', 15, 4, 828, 1020);
      final preview = _parseBoundedUtility(blocks);
      expect(preview.discount, entry.value, reason: entry.key);
      if (entry.value == null) expect(preview.reviewHints, isNotEmpty);
      expect(preview.blocks, containsAll(blocks));
    }
  });
  test(
    'qualified Total roles retain aggregate and named-service distinctions',
    () {
      for (final label in [
        'Total: for Billing Cycle 47',
        'Total：for Billing Cycle 47',
        'Total=for Billing Cycle 47',
        'Total_for Billing Cycle 47',
        'Total#for Billing Cycle 47',
        'Total including Tax',
        'Total incl. Tax',
        'Total excluding Tax',
        'Total before Discount',
        'Total after Discount',
        'Total payable after Tax',
        'Total Taxes Included',
        'Total (including Tax)',
        'Total Service Charge',
        'Total Service Charges',
        'Total Service Fee',
        'Total Service Tax',
        'Total Service Discount',
        'Total Service Fees',
        'Total Service Taxes',
        'Total Service Discounts',
        'Total Internet Service (Tax)',
        'Total Security Plan (Service Charge)',
        'Total Credit Monitoring Service (Payment Received)',
        'Total Service (Charge)',
      ]) {
        for (final mergedMoney in [false, true]) {
          final original = _boundedUtilityBlocks(
            description: 'Next Month Estimate',
          );
          final blocks = [
            ...original.where((b) => b.row < 3),
            _layoutBlock(
              mergedMoney ? '$label USD 54.30' : label,
              7,
              3,
              50,
              mergedMoney ? 717 : 640,
            ),
            if (!mergedMoney) _layoutBlock('USD 54.30', 9, 3, 659, 716),
            _layoutBlock('Contact us', 10, 3, 828, 1020),
            for (final b in original.where((b) => b.row >= 3))
              _layoutBlock(
                b.text,
                b.order + 4,
                b.row + 1,
                b.points[0].x,
                b.points[1].x,
              ),
          ];
          final preview = _parseBoundedUtility(blocks);
          expect(
            preview.items.any((i) => i.lineTotal == '59.99'),
            isFalse,
            reason: '$label | $mergedMoney',
          );
          expect(preview.blocks, containsAll(blocks));
        }
      }
      for (final label in [
        'Total Security Plan',
        'Total Internet Plan',
        'Total Q1 Plan',
        'Total FY Plan',
        'Total_Internet_Plan',
        'Total#Security#Plan',
        'Total Care Package',
      ]) {
        final blocks = _boundedUtilityBlocks(description: label);
        final preview = _parseBoundedUtility(blocks);
        expect(
          preview.items.any(
            (i) => i.description == label && i.lineTotal == '59.99',
          ),
          isTrue,
          reason: label,
        );
        expect(preview.blocks, containsAll(blocks));
      }
    },
  );
  test('named Total service rows preserve following genuine charges', () {
    for (final label in [
      'Total Internet Service',
      'Total Tax Preparation Service',
      'Total Credit Monitoring Service',
      'Total Service Plan',
      'Total Security Plan',
      'Total Service Package',
    ]) {
      final original = _boundedUtilityBlocks(
        description: 'Next Month Estimate',
      );
      final blocks = [
        ...original.where((b) => b.row < 3),
        _layoutBlock('$label USD', 7, 3, 50, 716),
        _layoutBlock('Contact us', 8, 3, 828, 1020),
        _layoutBlock('54.30', 9, 4, 659, 716),
        for (final b in original.where((b) => b.row >= 3))
          _layoutBlock(
            b.text,
            b.order + 4,
            b.row + 2,
            b.points[0].x,
            b.points[1].x,
          ),
      ];
      final preview = _parseBoundedUtility(blocks);
      expect(
        preview.items.any(
          (i) =>
              i.description == 'Next Month Estimate' && i.lineTotal == '59.99',
        ),
        isTrue,
        reason: label,
      );
      expect(preview.blocks, containsAll(blocks));
    }
  });
  test('footer roles survive month formatting and money placement', () {
    for (final (label, mergedMoney) in [
      for (final context in [
        'Mar-2025',
        'Mar ’25',
        "Mar '25",
        'Mar/2025',
        'Mar.2025',
        'Mar–2025',
        'Mar-25',
        'Mar/25',
        'Mar 2 0 2 5',
        "Mar '2 5",
        'March—2025',
      ])
        ('Total $context', false),
      for (final label in [
        'Total USD 54.30 for Billing Cycle 47',
        r'Total $54.30 for Billing Cycle 47',
        'Total 54.30 USD for Billing Cycle 47',
        'Total ZAR 54.30 for Billing Cycle 47',
        'Total 54.30 for Billing Cycle 47',
        'USD 54.30 Total for Billing Cycle 47',
        'Total USD 54.30 for Weeks 1 to 4',
      ])
        (label, true),
    ]) {
      final original = _boundedUtilityBlocks(
        description: 'Next Month Estimate',
      );
      final blocks = [
        ...original.where((b) => b.row < 3),
        _layoutBlock(label, 7, 3, 50, mergedMoney ? 717 : 640),
        if (!mergedMoney) _layoutBlock('USD 54.30', 9, 3, 659, 716),
        _layoutBlock('Contact us', 10, 3, 828, 1020),
        for (final b in original.where((b) => b.row >= 3))
          _layoutBlock(
            b.text,
            b.order + 4,
            b.row + 1,
            b.points[0].x,
            b.points[1].x,
          ),
      ];
      final preview = _parseBoundedUtility(blocks);
      expect(
        preview.items.any((i) => i.lineTotal == '59.99'),
        isFalse,
        reason: label,
      );
      expect(preview.blocks, containsAll(blocks));
    }
  });
  test('quarter and fiscal periods retain the printed Total role', () {
    for (final context in [
      'Q1 2025',
      'Q4 2026',
      '2025 Q1',
      'Quarter 1 2025',
      '1st Quarter 2025',
      'First Quarter 2025',
      'Q1 FY2025',
      'FY2025 Q1',
      'Q1/2025',
      'Q12025',
      'Q1 2025 - Q2 2025',
      'FY2025',
      'Fiscal Year 2025',
      'Calendar Year 2025',
      'Q1 25',
      '25 Q1',
      'FY25 Q1',
      'Q1 FY25',
      'FY25',
      'Fiscal Year 25',
      'Q1 2 5',
      'Q1 ’25',
      'Spring Season',
      'Billing Cycle 47',
      'Weeks 1 to 4',
      'Cycle A',
    ]) {
      final original = _boundedUtilityBlocks(
        description: 'Next Month Estimate',
      );
      final blocks = [
        ...original.where((b) => b.row < 3),
        _layoutBlock('Total for $context', 7, 3, 50, 640),
        _layoutBlock(r'$54.30', 9, 3, 659, 716),
        _layoutBlock('Contact us', 10, 3, 828, 1020),
        for (final b in original.where((b) => b.row >= 3))
          _layoutBlock(
            b.text,
            b.order + 4,
            b.row + 1,
            b.points[0].x,
            b.points[1].x,
          ),
      ];
      final preview = _parseBoundedUtility(blocks);
      expect(
        preview.items.any((i) => i.lineTotal == '59.99'),
        isFalse,
        reason: context,
      );
      expect(preview.blocks, containsAll(blocks));
    }
    for (final label in [
      'Total Q1 Plan',
      'Total Quarter Plan',
      'Total FY Plan',
    ]) {
      final blocks = _boundedUtilityBlocks(description: label);
      final preview = _parseBoundedUtility(blocks);
      expect(
        preview.items.any(
          (i) => i.description == label && i.lineTotal == '59.99',
        ),
        isTrue,
        reason: label,
      );
      expect(preview.blocks, containsAll(blocks));
    }
  });

  test('exact Total role survives separately printed amount context', () {
    for (final label in [
      'Total',
      'Total USD',
      r'Total $',
      'Total ZAR',
      'Total (USD)',
      r'Total USD $',
      'Total USD / EUR',
      'Total: (ZAR)',
    ]) {
      for (final period in [
        'Feb 5 – Mar 4, 2025',
        'March 2025',
        'Printed period unclear',
      ]) {
        final original = _boundedUtilityBlocks(
          description: 'Next Month Estimate',
        );
        final blocks = [
          ...original.where((b) => b.row < 3),
          _layoutBlock(label, 7, 3, 50, 716),
          _layoutBlock(period, 8, 4, 417, 567),
          _layoutBlock('54.30', 9, 4, 659, 716),
          for (final b in original.where((b) => b.row >= 3))
            _layoutBlock(
              b.text,
              b.order + 4,
              b.row + 2,
              b.points[0].x,
              b.points[1].x,
            ),
        ];
        final preview = _parseBoundedUtility(blocks);
        expect(
          preview.items.any((i) => i.lineTotal == '59.99'),
          isFalse,
          reason: '$label | $period',
        );
        expect(preview.blocks, containsAll(blocks));
      }
    }
  });
  test(
    'financial phrase position preserves conflict and service distinctions',
    () {
      for (final label in [
        'Partial Payment',
        'Full Payment',
        'Final Payment',
        'Initial Payment',
        'Additional Payment',
        'Advance Payment',
        'Payment#1234',
        'Payment=received',
        'Payment@1234',
        'Payment+received',
        'Payment_received',
        'Payment<received',
        'Payment>received',
        r'Payment\received',
        'Payment~received',
      ]) {
        final serviceBlocks = _boundedUtilityBlocks(description: label);
        final service = _parseBoundedUtility(serviceBlocks);
        expect(
          service.items.any((i) => i.lineTotal == '59.99'),
          isFalse,
          reason: label,
        );
        expect(service.reviewHints, isNotEmpty);
        expect(service.blocks, containsAll(serviceBlocks));
        final blocks = _boundedUtilityBlocks(discountAmount: 'USD -10.00');
        final i = blocks.indexWhere((b) => b.order == 12);
        blocks[i] = _layoutBlock('Loyalty Discount ($label)', 12, 4, 51, 383);
        final j = blocks.indexWhere((b) => b.order == 15);
        blocks[j] = _layoutBlock('Mon - Fri, 8 AM - 8 PM PT', 15, 4, 828, 1020);
        final discount = _parseBoundedUtility(blocks);
        expect(discount.discount, isNull, reason: label);
        expect(discount.reviewHints, isNotEmpty);
        expect(discount.blocks, containsAll(blocks));
      }
      for (final label in [
        'Partial Payment Plan',
        'Full Payment Gateway',
        'Additional Payment Subscription',
        'Payment#Plan',
        'Payment=Plan',
        'Payment_Gateway',
        'Payment+Processing Subscription',
      ]) {
        final blocks = _boundedUtilityBlocks(description: label);
        final preview = _parseBoundedUtility(blocks);
        expect(
          preview.items.any(
            (i) => i.description == label && i.lineTotal == '59.99',
          ),
          isTrue,
          reason: label,
        );
        expect(preview.blocks, containsAll(blocks));
      }
    },
  );

  test('merged footer width does not change adjacent amount ownership', () {
    for (final label in [
      'Total USD',
      'Total ZAR',
      r'Total $',
      'Total ＵＳＤ',
      'Total for March 2025 USD',
      'Total March 2025 USD',
    ]) {
      for (final right in [383.0, 716.0]) {
        for (final support in [false, true]) {
          final original = _boundedUtilityBlocks(
            description: 'Next Month Estimate',
          );
          final blocks = [
            ...original.where((b) => b.row < 3),
            _layoutBlock(label, 7, 3, 50, right),
            if (support) _layoutBlock('Contact us', 8, 3, 828, 1020),
            _layoutBlock('54.30', 9, 4, 659, 716),
            if (support)
              _layoutBlock('Hours Mon - Fri 8 AM - 8 PM', 10, 4, 828, 1020),
            for (final b in original.where((b) => b.row >= 3))
              _layoutBlock(
                b.text,
                b.order + 4,
                b.row + 2,
                b.points[0].x,
                b.points[1].x,
              ),
          ];
          final preview = _parseBoundedUtility(blocks);
          expect(
            preview.items.any((i) => i.lineTotal == '59.99'),
            isFalse,
            reason: '$label | $right | $support',
          );
          expect(preview.blocks, containsAll(blocks));
        }
      }
    }
  });

  test('currency-only footer cells do not widen the adjacent label', () {
    for (final label in ['Total', 'Total:', 'Subtotal']) {
      for (final code in [
        'USD',
        'ZAR',
        r'$',
        'ＵＳＤ',
        'USD:',
        'ZAR:',
        'USD =',
        r'$:',
      ]) {
        for (final support in [false, true]) {
          {
            final original = _boundedUtilityBlocks(
              description: 'Next Month Estimate',
            );
            final blocks = [
              ...original.where((b) => b.row < 3),
              _layoutBlock(label, 7, 3, 50, 140),
              _layoutBlock(code, 8, 3, 659, 716),
              if (support) _layoutBlock('Contact us', 9, 3, 828, 1020),
              _layoutBlock('54.30', 10, 4, 659, 716),
              if (support)
                _layoutBlock('Hours Mon - Fri 8 AM - 8 PM', 11, 4, 828, 1020),
              for (final b in original.where((b) => b.row >= 3))
                _layoutBlock(
                  b.text,
                  b.order + 6,
                  b.row + 2,
                  b.points[0].x,
                  b.points[1].x,
                ),
            ];
            final after = _parseBoundedUtility(blocks);
            expect(after.items.any((i) => i.lineTotal == '59.99'), isFalse);
            expect(after.blocks, containsAll(blocks));
          }
        }
      }
    }
  });
  test('terminal discount role preserves named plans', () {
    for (final label in [
      'Coupon Plan Discount',
      'Discount Plan Discount',
      'Rebate Plan Coupon',
    ]) {
      for (final note in ['', ' (12 months)']) {
        for (final support in [false, true]) {
          {
            final blocks = _boundedUtilityBlocks(
              discountAmount: 'USD -10.00',
            ).where((b) => b.row != 5).toList();
            if (!support) blocks.removeWhere((b) => b.order == 15);
            final i = blocks.indexWhere((b) => b.order == 12);
            blocks[i] = _layoutBlock('$label$note', 12, 4, 51, 383);
            final after = _parseBoundedUtility(blocks);
            expect(after.discount, '-10.00');
            expect(after.discountCurrency, 'USD');
            expect(after.blocks, containsAll(blocks));
          }
        }
      }
    }
  });

  test('support copy cannot change a bounded adjacent footer', () {
    for (final support in [
      'Contact us',
      'Call 1800 1234',
      'Hours: Mon - Fri, 8 AM - 8 PM PT',
      'Balance - USD 10.00',
    ]) {
      for (final placement in ['label', 'amount', 'both']) {
        for (final money in [r'$54.30', 'ZAR 54.30', '54.30ZAR', 'ＵＳＤ ５４．３０']) {
          final original = _boundedUtilityBlocks(
            description: 'Next Month Estimate',
          );
          final blocks = [
            ...original.where((b) => b.row < 3),
            _layoutBlock('Total', 7, 3, 50, 140),
            if (placement != 'amount') _layoutBlock(support, 8, 3, 828, 1020),
            _layoutBlock(money, 9, 4, 659, 716),
            if (placement != 'label') _layoutBlock(support, 10, 4, 828, 1020),
            for (final b in original.where((b) => b.row >= 3))
              _layoutBlock(
                b.text,
                b.order + 4,
                b.row + 2,
                b.points[0].x,
                b.points[1].x,
              ),
          ];
          final preview = _parseBoundedUtility(blocks);
          expect(
            preview.items.any((item) => item.lineTotal == '59.99'),
            isFalse,
            reason: '$support | $placement | $money',
          );
          expect(preview.blocks, containsAll(blocks));
        }
      }
    }
  });

  test(
    'declined currency recovery retains existing foreign evidence and warnings',
    () {
      for (final code in ['EUR', 'GBP', 'CAD']) {
        final serviceBlocks = _boundedUtilityBlocks()
            .where((b) => b.row < 4 || b.row == 6)
            .toList();
        serviceBlocks.removeWhere((b) => b.order == 11);
        final amountIndex = serviceBlocks.indexWhere(
          (b) => b.text == r'$59.99',
        );
        serviceBlocks[amountIndex] = _layoutBlock(
          '$code 59.99',
          10,
          3,
          659,
          716,
        );
        final service = _parseBoundedUtility(serviceBlocks);
        expect(service.currency, 'USD');
        expect(service.items.single.currency, code);
        expect(service.items.single.lineTotal, '59.99');
        expect(
          service.reviewHintDecision,
          ReceiptOcrReviewDecision.foreignItemCurrency,
        );
        expect(service.reviewHints, isNotEmpty);
        expect(service.blocks, containsAll(serviceBlocks));
        final discountBlocks = _boundedUtilityBlocks(
          discountAmount: '$code -10.00',
        ).where((b) => b.row != 5).toList();
        discountBlocks.removeWhere((b) => b.order == 11 || b.order == 15);
        final discount = _parseBoundedUtility(discountBlocks);
        expect(discount.currency, 'USD');
        expect(discount.discount, '-10.00');
        expect(discount.discountCurrency, code);
        expect(discount.reviewHints, isNotEmpty);
        expect(discount.blocks, containsAll(discountBlocks));
      }
    },
  );

  test('bounded recovery respects adjacent total rows', () {
    for (final label in ['Total', 'Subtotal', 'Total:']) {
      for (final money in [
        r'$54.30',
        'USD 54.30',
        '54.30',
        'ZAR 54.30',
        '54.30 ZAR',
        'ZAR: 54.30',
        '54.30ZAR',
        'ZAR54.30',
        '54.30CLP',
      ]) {
        final original = _boundedUtilityBlocks(
          description: 'Next Month Estimate',
        );
        final blocks = [
          ...original.where((b) => b.row < 3),
          _layoutBlock(label, 7, 3, 50, 140),
          _layoutBlock(money, 8, 4, 659, 716),
          for (final b in original.where((b) => b.row >= 3))
            _layoutBlock(
              b.text,
              b.order + 2,
              b.row + 2,
              b.points[0].x,
              b.points[1].x,
            ),
        ];
        final preview = _parseBoundedUtility(blocks);
        expect(preview.items.any((item) => item.lineTotal == '59.99'), isFalse);
        expect(preview.blocks, containsAll(blocks));
      }
    }
  });

  test('unsupported denominations cannot obscure a printed total boundary', () {
    for (final money in ['ZAR 54.30', '54.30 ZAR', 'ZAR: 54.30', '54.30 INR']) {
      for (final merged in [false, true]) {
        final original = _boundedUtilityBlocks(
          description: 'Next Month Estimate',
        );
        final blocks = [
          ...original.where((b) => b.row < 3),
          _layoutBlock(
            merged ? 'Total $money' : 'Total',
            7,
            3,
            50,
            merged ? 717 : 140,
          ),
          if (!merged) _layoutBlock(money, 8, 3, 659, 716),
          for (final b in original.where((b) => b.row >= 3))
            _layoutBlock(
              b.text,
              b.order + 2,
              b.row + 1,
              b.points[0].x,
              b.points[1].x,
            ),
        ];
        final preview = _parseBoundedUtility(blocks);
        expect(preview.items.any((item) => item.lineTotal == '59.99'), isFalse);
        expect(preview.blocks, containsAll(blocks));
      }
    }
    for (final code in ['ZAR', 'USD']) {
      for (final suffix in [false, true]) {
        final original = _boundedUtilityBlocks(
          description: 'Next Month Estimate',
        );
        final blocks = [
          ...original.where((b) => b.row < 3),
          _layoutBlock('Total', 7, 3, 50, 140),
          _layoutBlock(suffix ? '54.30' : code, 8, 3, 642, 657),
          _layoutBlock(suffix ? code : '54.30', 9, 3, 659, 716),
          for (final b in original.where((b) => b.row >= 3))
            _layoutBlock(
              b.text,
              b.order + 3,
              b.row + 1,
              b.points[0].x,
              b.points[1].x,
            ),
        ];
        final preview = _parseBoundedUtility(blocks);
        expect(preview.items.any((item) => item.lineTotal == '59.99'), isFalse);
        expect(preview.blocks, containsAll(blocks));
      }
    }
  });

  test(
    'named service discounts retain whole-phrase financial classification',
    () {
      final expectedDiscounts = <String, String?>{
        'Service Plan Discount (12 months)': '-10.00',
        'Credit Monitoring Subscription Discount (12 months)': '-10.00',
        'Service Package Discount (12 months)': '-10.00',
        'Credit Monitoring Product Discount (12 months)': '-10.00',
        'Internet Service Plan Discount (12 months)': '-10.00',
        'Premium Service Plan Discount (12 months)': '-10.00',
        'Internet Service Package Discount (12 months)': '-10.00',
        'Internet Service Discount (12 months)': '-10.00',
        'Internet Service Loyalty Discount (12 months)': '-10.00',
        'Service Loyalty Discount (12 months)': '-10.00',
        'Service Provider Discount (12 months)': '-10.00',
        'Service Provider Loyalty Discount (12 months)': '-10.00',
        'Internet Service Seasonal Discount (12 months)': '-10.00',
        'Internet Service Renewal Discount (12 months)': '-10.00',
        'Internet Service Promotional Discount (12 months)': '-10.00',
        'Credit Monitoring Service Loyalty Discount (12 months)': '-10.00',
        'Internet Service Charge Loyalty Discount': null,
        'Internet Service Tax Loyalty Discount': null,
        'Internet Service Loyalty Discount (Partial Payment)': null,
        'Internet Service and Payment Loyalty Discount': null,
        'Internet Service Fee Seasonal Discount': null,
        'Premium Service Discount (12 months)': '-10.00',
        'Tax Preparation Service Discount (12 months)': '-10.00',
        'Credit Monitoring Service Discount (12 months)': '-10.00',
        'Customer Service Discount (12 months)': '-10.00',
        'Internet Services Discount (12 months)': '-10.00',
        'Internet Service Tax Discount (12 months)': null,
        'Internet Service and Tax Discount (12 months)': null,
        'Internet Service Discount (Tax)': null,
        'Payment Received Service Discount (12 months)': null,
        'Payments Gateway Subscription Discount (12 months)': '-10.00',
        'Loyalty Discount (Internet Service Plan)': '-10.00',
        'Loyalty Discount (Payments Gateway Subscription)': '-10.00',
        'Service Charge Discount (12 months)': null,
        'Credit Applied Discount (12 months)': null,
        'Service Plan Discount (Payment received)': null,
        'Service Plan Discount and Tax': null,
        'Internet Service Plan Tax Discount (12 months)': null,
        'Service Charge Plan Discount (12 months)': null,
        'Payment Received Subscription Discount (12 months)': null,
        'Internet Service Charge Plan Discount (12 months)': null,
        'Internet Service Plan Discount (Tax)': null,
      };
      for (final entry in expectedDiscounts.entries) {
        final label = entry.key;
        final namedService = entry.value != null;
        for (final support in [false, true]) {
          final blocks = _boundedUtilityBlocks(discountAmount: 'USD -10.00');
          final i = blocks.indexWhere(
            (b) => b.text == 'Loyalty Discount (12 months)',
          );
          blocks[i] = _layoutBlock(label, 12, 4, 51, 383);
          if (!support) blocks.removeWhere((b) => b.text == 'Live Chat');
          final preview = _parseBoundedUtility(blocks);
          expect(preview.discount, entry.value);
          expect(preview.reviewHints, namedService ? isEmpty : isNotEmpty);
          expect(preview.blocks, containsAll(blocks));
        }
      }
    },
  );

  test(
    'bounded utility columns recover service and discount beside support',
    () {
      for (final split in [false, true]) {
        final blocks = _boundedUtilityBlocks(splitDescription: split);
        final preview = _parseBoundedUtility(blocks);
        expect(preview.items.map((item) => item.description), [
          'Internet Plan 500',
        ]);
        expect(preview.items.single.lineTotal, '59.99');
        expect(preview.discount, '-10.00');
        expect(preview.tax, '4.31');
        expect(preview.total, '54.30');
        expect(preview.reviewHints, isEmpty);
        expect(preview.blocks, containsAll(blocks));
      }
    },
  );

  test('bounded utility recovery never clears a panel credit sign', () {
    for (final support in [
      'Credit - 10',
      for (final suffix in [
        '(-)',
        '[−]',
        '{﹣}',
        '(－)',
        '( - )',
        '-;',
        '(-) Contact us',
        'Contact - us',
      ])
        'Mon - Fri, 8 AM - 8 PM PT $suffix',
      'Credit - USD 10',
      '-',
      'Support ＵＳＤ １０．００; 8 AM - 8 PM PT',
      for (final sign in [
        '-',
        '−',
        '﹣',
        '－',
        '‐',
        '‑',
        '‒',
        '–',
        '—',
        '⁻',
        '₋',
        '﹘',
        '➖',
      ])
        'Mon - Fri, 8 AM - 8 PM PT $sign',
    ]) {
      final blocks = _boundedUtilityBlocks(support: support);
      final preview = _parseBoundedUtility(blocks);
      expect(
        preview.items.any((item) => item.description == 'Internet Plan 500'),
        isFalse,
        reason: support,
      );
      expect(preview.reviewHints, isNotEmpty, reason: support);
      expect(preview.blocks, containsAll(blocks));
    }
    for (final support in [
      'Monday – Friday, 8 AM - 8 PM PT',
      'Live-chat, Mon - Fri, 8 AM - 8 PM PT',
      '(Mon - Fri), 8 AM - 8 PM PT',
    ]) {
      final blocks = _boundedUtilityBlocks(support: support);
      final preview = _parseBoundedUtility(blocks);
      expect(preview.items.any((item) => item.lineTotal == '59.99'), isTrue);
      expect(preview.reviewHints, isEmpty);
      expect(preview.blocks, containsAll(blocks));
    }
    for (final dayDash in ['-', '–', '‐', '‒']) {
      final blocks = _boundedUtilityBlocks(
        support: 'Mon $dayDash Fri, 8 AM - 8 PM PT',
      );
      final preview = _parseBoundedUtility(blocks);
      expect(preview.items.any((item) => item.lineTotal == '59.99'), isTrue);
      expect(preview.reviewHints, isEmpty);
      expect(preview.blocks, containsAll(blocks));
    }
  });

  test('bounded recovery normalizes the complete owned monetary token', () {
    for (final serviceAmount in ['USD59.99', '59.99USD']) {
      for (final discountAmount in ['USD-10.00', '-10.00USD']) {
        final blocks = _boundedUtilityBlocks(
          serviceAmount: serviceAmount,
          discountAmount: discountAmount,
        );
        final preview = _parseBoundedUtility(blocks);
        expect(preview.items.single.lineTotal, '59.99');
        expect(preview.discount, '-10.00');
        expect(preview.reviewHints, isEmpty);
        expect(preview.blocks, containsAll(blocks));
      }
    }
  });

  test('bounded utility recovery requires complete owned period evidence', () {
    for (final period in ['Feb 5 –', 'Feb 5 – Mar 4, 2025 USD 10.00']) {
      final blocks = _boundedUtilityBlocks(period: period);
      final preview = _parseBoundedUtility(blocks);
      expect(
        preview.items.any((item) => item.description == 'Internet Plan 500'),
        isFalse,
        reason: period,
      );
      expect(preview.reviewHints, isNotEmpty, reason: period);
      expect(preview.blocks, containsAll(blocks));
    }
    final blocks = _boundedUtilityBlocks(extraInteriorHeading: true);
    final preview = _parseBoundedUtility(blocks);
    expect(
      preview.items.any((item) => item.description == 'Internet Plan 500'),
      isFalse,
    );
    expect(preview.blocks, containsAll(blocks));
  });

  test('bounded recovery does not accept detached signs or stray currency', () {
    final signed = _boundedUtilityBlocks(discountAmount: '- USD 10،00');
    final signedPreview = _parseBoundedUtility(signed);
    expect(signedPreview.discount, isNull);
    expect(signedPreview.blocks, containsAll(signed));
    final currency = _boundedUtilityBlocks(description: 'Internet Plan USD');
    final currencyPreview = _parseBoundedUtility(currency);
    expect(
      currencyPreview.items.any(
        (item) => item.description == 'Internet Plan USD',
      ),
      isFalse,
    );
    expect(currencyPreview.reviewHints, isNotEmpty);
    expect(currencyPreview.blocks, containsAll(currency));
  });

  test(
    'bounded recovery resolves contextual money markers before promotion',
    () {
      for (final marker in ['Rs', 'kr']) {
        for (final money in [
          '$marker 59.99',
          '59.99 $marker',
          '${marker}59.99',
          '59.99$marker',
        ]) {
          final blocks = _boundedUtilityBlocks(serviceAmount: money);
          final preview = _parseBoundedUtility(blocks);
          expect(
            preview.items.any((item) => item.lineTotal == '59.99'),
            isFalse,
          );
          expect(preview.reviewHints, isNotEmpty);
          expect(preview.blocks, containsAll(blocks));
        }
        for (final money in ['$marker -10.00', '-10.00 $marker']) {
          final blocks = _boundedUtilityBlocks(discountAmount: money);
          final preview = _parseBoundedUtility(blocks);
          expect(preview.discount, isNull);
          expect(preview.reviewHints, isNotEmpty);
          expect(preview.blocks, containsAll(blocks));
        }
      }
    },
  );

  test('bounded recovery stops at a total before service-row eligibility', () {
    for (final label in ['Total Amount Due', 'Subtotal']) {
      for (final period in ['', 'Feb 5 – Mar 4, 2025', 'Feb 5 –']) {
        final original = _boundedUtilityBlocks(
          description: 'Next Month Estimate',
        );
        for (final (labelLeft, labelRight, periodLeft, periodRight) in [
          (50.0, 383.0, 417.0, 567.0),
          (50.0, 430.0, 440.0, 640.0),
          (20.0, 430.0, 440.0, 640.0),
          if (period.isEmpty) (50.0, 620.0, 417.0, 567.0),
        ]) {
          final blocks = [
            ...original.where((block) => block.row < 3),
            _layoutBlock(label, 7, 3, labelLeft, labelRight),
            if (period.isNotEmpty)
              _layoutBlock(period, 8, 3, periodLeft, periodRight),
            _layoutBlock(r'$54.30', 9, 3, 659, 716),
            _layoutBlock('Help 24/7', 10, 3, 828, 1020),
            for (final block in original.where((block) => block.row >= 3))
              _layoutBlock(
                block.text,
                block.order + 4,
                block.row + 1,
                block.points[0].x,
                block.points[1].x,
              ),
          ];
          final preview = _parseBoundedUtility(blocks);
          expect(
            preview.items.any(
              (item) => item.description == 'Next Month Estimate',
            ),
            isFalse,
          );
          expect(preview.blocks, containsAll(blocks));
        }
      }
    }
  });

  test('bounded recovery stops at merged total and period blocks', () {
    for (final label in ['Total Amount Due', 'Subtotal']) {
      for (final period in ['Feb 5 – Mar 4, 2025', 'Feb 5 –']) {
        for (final (footer, separateAmount) in [
          ('$label $period', true),
          ('$label $period \$54.30', false),
          ('$label \$54.30 $period', false),
        ]) {
          final original = _boundedUtilityBlocks(
            description: 'Next Month Estimate',
          );
          final blocks = [
            ...original.where((block) => block.row < 3),
            _layoutBlock(footer, 7, 3, 50, separateAmount ? 640 : 717),
            if (separateAmount) _layoutBlock(r'$54.30', 9, 3, 659, 716),
            _layoutBlock('Contact us', 10, 3, 828, 1020),
            for (final block in original.where((block) => block.row >= 3))
              _layoutBlock(
                block.text,
                block.order + 4,
                block.row + 1,
                block.points[0].x,
                block.points[1].x,
              ),
          ];
          final preview = _parseBoundedUtility(blocks);
          expect(
            preview.items.any((item) => item.lineTotal == '59.99'),
            isFalse,
          );
          expect(preview.blocks, containsAll(blocks));
        }
      }
    }
  });

  test('bounded utility periods tolerate split OCR punctuation', () {
    for (final label in ['Total Amount Due', 'Subtotal', 'Total']) {
      for (final (dateHead, dateTail, left, right) in [
        ('Feb 5 – Mar 4', r', 2025 $54.30', 50.0, 560.0),
        ('Feb 5 – Mar', r'. 4, 2025 $54.30', 50.0, 560.0),
        ('Feb 5', r', 2025 – Mar 4, 2025 $54.30', 50.0, 560.0),
        ('Feb 5 — Mar 4, 2025', r'$54.30', 50.0, 560.0),
        ('Feb 5 ‒ Mar 4, 2025', r'$54.30', 50.0, 560.0),
        ('Feb 5 ﹣ Mar 4, 2025', r'$54.30', 50.0, 560.0),
        ('Mar', r'4,25 $54.30', 50.0, 560.0),
        ('March', r'4,99 $54.30', 50.0, 560.0),
        ('Feb 5,25 – Mar', r'4,25 $54.30', 50.0, 560.0),
        ('Mar', r'4,25 $54.30', 0.0, 35.0),
      ]) {
        final original = _boundedUtilityBlocks(
          description: 'Next Month Estimate',
        );
        final blocks = [
          ...original.where((block) => block.row < 3),
          _layoutBlock('$label $dateHead', 7, 3, left, right),
          _layoutBlock(dateTail, 9, 3, 565, 717),
          _layoutBlock('Contact us', 10, 3, 828, 1020),
          for (final block in original.where((block) => block.row >= 3))
            _layoutBlock(
              block.text,
              block.order + 4,
              block.row + 1,
              block.points[0].x,
              block.points[1].x,
            ),
        ];
        final preview = _parseBoundedUtility(blocks);
        expect(preview.items.any((item) => item.lineTotal == '59.99'), isFalse);
        expect(preview.blocks, containsAll(blocks));
      }
    }
    for (final period in ['Feb 5 – Mar . 4 , 2025', 'Feb 5 — Mar 4, 2025']) {
      final preview = _parseBoundedUtility(
        _boundedUtilityBlocks(period: period),
      );
      expect(preview.items.single.lineTotal, '59.99');
      expect(preview.reviewHints, isEmpty);
    }
  });

  test('strong utility footer roles survive unresolved period text', () {
    for (final label in [
      'Total Amount Due',
      'Subtotal',
      'Balance Due',
      'Total Current Charges',
    ]) {
      for (final detail in [
        'Feb 5 – Mar 4 , 20 25',
        '2025/02/05 – 2025/03/04',
        '(billing period unreadable)',
      ]) {
        final original = _boundedUtilityBlocks(
          description: 'Next Month Estimate',
        );
        final blocks = [
          ...original.where((block) => block.row < 3),
          _layoutBlock('$label $detail', 7, 3, 50, 640),
          _layoutBlock(r'$54.30', 9, 3, 659, 716),
          _layoutBlock('Contact us', 10, 3, 828, 1020),
          for (final block in original.where((block) => block.row >= 3))
            _layoutBlock(
              block.text,
              block.order + 4,
              block.row + 1,
              block.points[0].x,
              block.points[1].x,
            ),
        ];
        final preview = _parseBoundedUtility(blocks);
        expect(preview.items.any((item) => item.lineTotal == '59.99'), isFalse);
        expect(preview.blocks, containsAll(blocks));
      }
    }
  });

  test('decorated and numeric-date footers stop bounded recovery', () {
    final footers = [
      for (final label in [
        'Total Amount Due',
        'Subtotal',
        'Balance Due',
        'Total Current Charges',
      ])
        for (final decoration in ['* ', '# ', '• '])
          '$decoration$label 2025/02/05 – 2025/03/04',
      for (final period in [
        '2025/02/05 – 2025/03/04',
        '05/02/2025 – 04/03/2025',
        '2025-02-05 – 2025-03-04',
        '05.02.2025 – 04.03.2025',
        '02/05 – 03/04',
        '2025/03/04',
        '04/03/2025',
        'Mar 4, 2025',
        '2025/02/05 to 2025/03/04',
        'Feb 5 to Mar 4, 2025',
        '2025/02/05 TO 2025/03/04',
        '2025/02/05 to',
        'Mar 4, 20 25',
        'Mar 4, 2 0 2 5',
        'Mar 4, 202 5',
        '20 25/03/04',
        'Feb 5 to Mar 4, 20 25',
        '03/04/25',
        '03.04.25',
        '03-04-25',
        'Mar 4, 25',
        'Mar 4,25',
        'Mar 4,2025',
        'March 4,25',
        '4 Mar,25',
        'Feb 5,25 – Mar 4,25',
        'Mar 4,99',
        'Mar 4,00',
        '4 Mar 25',
        '03/01/25 - 03/04/25',
        'Feb 5, 25 – Mar 4, 25',
        '03/01/2025 to 03/04/25',
        'Mar 4, 2 5',
        '03/04/2 5',
        '25/03/04',
        '12.10',
      ])
        'Total $period',
      for (final section in [
        'Payment Summary',
        'Remittance',
        'Account Summary',
        'Contact us',
      ])
        for (final decoration in ['* ', '# ', '• ']) '$decoration$section',
    ];
    for (final footer in footers) {
      final original = _boundedUtilityBlocks(
        description: 'Next Month Estimate',
      );
      final blocks = [
        ...original.where((block) => block.row < 3),
        _layoutBlock(footer, 7, 3, 50, 640),
        _layoutBlock(r'$54.30', 9, 3, 659, 716),
        _layoutBlock('Contact us', 10, 3, 828, 1020),
        for (final block in original.where((block) => block.row >= 3))
          _layoutBlock(
            block.text,
            block.order + 4,
            block.row + 1,
            block.points[0].x,
            block.points[1].x,
          ),
      ];
      final preview = _parseBoundedUtility(blocks);
      expect(
        preview.items.any((item) => item.lineTotal == '59.99'),
        isFalse,
        reason: footer,
      );
      expect(preview.blocks, containsAll(blocks));
    }
    for (final period in [
      '2025/02/05 – 2025/03/04',
      'Feb 5 – Mar 4, 20 25',
      'Feb 5 to Mar 4, 2025',
      'Feb 5, 25 – Mar 4, 25',
      'Feb 5th – Mar 4th, 2025',
      'Feb 1st,25 – Mar 3rd,25',
      'Tue Feb 5 – Tue Mar 4, 2025',
      'Feb 5 – Mar 4, 2025 Tuesday',
    ]) {
      final preview = _parseBoundedUtility(
        _boundedUtilityBlocks(period: period),
      );
      expect(preview.items.any((item) => item.lineTotal == '59.99'), isFalse);
      expect(preview.reviewHints, isNotEmpty);
    }
  });

  test('footer date recognition preserves separate and merged money', () {
    final unexpectedRecoveries = <String>[];
    for (final money in [
      r'$12.10',
      r'$1.20',
      '12.10',
      '1.20',
      '3.04',
      'USD12.10',
      '12.10USD',
      '12.10 USD',
      '12,10',
      "1'234.10",
      '1,234.10',
    ]) {
      for (final (footer, separateMoney) in [
        ('Total Mar 4, 2025', true),
        ('Total Mar 4, 2025 $money', false),
        ('Total $money Mar 4, 2025', false),
        ('Total Mar 4,25', true),
        ('Total Mar 4,25 $money', false),
        ('Total $money Mar 4,25', false),
        for (final date in [
          'Mar 4th, 2025',
          'March 1st,25',
          '4th Mar 2025',
          'Feb 2nd,25 – Mar 3rd,25',
          'Mar 21st, 2025',
          'Mar 22nd, 2025',
          'Mar 23rd, 2025',
          'Mar 31st, 2025',
          'Tue Mar 4, 2025',
          'Tuesday, Mar 4, 2025',
          'Tue. Mar 4,25',
          'Tues., Mar 4th, 2025',
          'Mar 4, 2025 Tuesday',
          'Mar 4,25, Tue.',
          'Tuesday 03/04/2025',
          '03/04/25 Tuesday',
          'Mon Mar 3 – Tue Mar 4,25',
          'Mar 3 (Mon) – Mar 4 (Tue), 2025',
          'Tuesday, 4th March 2025',
          'Thu., Mar 4, 2025',
          'Mar 4, 2025 12:30',
          'as of Mar 4, 2025',
          'Mar 4, 2025 12:30:45 PM',
          'Mar 4, 2025 12:30 UTC',
          'Tuesday Mar 4th, 2025 at 12:30',
          '2025-03-04T12:30:45Z',
          '2025-03-04T12:30:45+09:00',
          'on Mar 4, 2025',
          'through Mar 4, 2025',
          'dated Mar 4, 2025',
          'for Mar 4, 2025',
          'period ending Mar 4, 2025',
          '12:30',
          'at 12:30 PM',
          '12:30:45 UTC',
          'as of 12:30',
          'for billing period ending Mar 4, 2025',
          'for billing period March 2025',
          'for March 2025',
          'March 2025',
          'for billing period 03/2025',
          'for billing period Q1 2025',
          'for period ending March 2025',
          'for period ending Mar 4, 2025',
          'for the billing period ending Mar 4, 2025',
          'for this billing period ending Mar 4, 2025',
          'for service period ending Mar 4, 2025',
          'for statement period ending Mar 4, 2025',
          'for billing period Mar 4, 2025',
          'for the current billing period ending Mar 4, 2025',
        ]) ...[
          ('Total $date', true),
          ('Total $money $date', false),
          ('Total $date $money', false),
        ],
      ]) {
        final original = _boundedUtilityBlocks(
          description: 'Next Month Estimate',
        );
        final blocks = [
          ...original.where((block) => block.row < 3),
          _layoutBlock(footer, 7, 3, 50, separateMoney ? 640 : 717),
          if (separateMoney) _layoutBlock(money, 9, 3, 659, 716),
          _layoutBlock('Contact us', 10, 3, 828, 1020),
          for (final block in original.where((block) => block.row >= 3))
            _layoutBlock(
              block.text,
              block.order + 4,
              block.row + 1,
              block.points[0].x,
              block.points[1].x,
            ),
        ];
        final preview = _parseBoundedUtility(blocks);
        if (preview.items.any((item) => item.lineTotal == '59.99')) {
          unexpectedRecoveries.add(
            '$footer | $money | separateMoney=$separateMoney',
          );
        }
        expect(preview.blocks, containsAll(blocks));
      }
    }
    expect(unexpectedRecoveries, isEmpty);
  });

  test('mixed payment and discount stays ambiguous beside clock support', () {
    for (final label in [
      'Payment and Discount (12 months)',
      'Payment with Discount (12 months)',
      'Tender and Discount (12 months)',
      'Payment & Discount (12 months)',
      'Cash and Discount (12 months)',
      'Deposit Paid and Discount (12 months)',
      'Payment and Loyalty Discount (12 months)',
      'Amount Paid and Loyalty Discount (12 months)',
      'Balance and Loyalty Discount (12 months)',
      'Payment with Loyalty Coupon (12 months)',
      'Tender and Seasonal Rebate (12 months)',
      'Amount Paid & Loyalty Discount (12 months)',
      'Balance and Monthly Loyalty Discount (12 months)',
      'Payment (received) and Loyalty Discount (12 months)',
      'Payment or Loyalty Discount (12 months)',
      'Amount Paid or Loyalty Discount (12 months)',
      'Balance or Loyalty Discount (12 months)',
      'Tender or Seasonal Rebate (12 months)',
      'Payment plus Loyalty Discount (12 months)',
      'Amount Paid less Loyalty Discount (12 months)',
      'Balance versus Loyalty Discount (12 months)',
      'Tender minus Seasonal Rebate (12 months)',
      'Amount Paid after Loyalty Discount (12 months)',
      'Amount Paid before Loyalty Discount (12 months)',
      'Amount Paid including Loyalty Discount (12 months)',
      'Amount Paid excluding Loyalty Discount (12 months)',
      'Amount Paid following Loyalty Discount (12 months)',
      'Amount Paid without Loyalty Discount (12 months)',
      'Amount Paid net of Loyalty Discount (12 months)',
      'Loyalty Discount (Amount Paid)',
      'Loyalty Discount (Current Balance)',
      'Loyalty Discount (Paid)',
      'Loyalty Discount (Payment)',
      'Loyalty Discount (Tax)',
      'Loyalty Discount (Fees)',
      'Loyalty Discount [Amount Paid]',
      'Loyalty Discount {Amount Paid}',
      'Loyalty Discount ((Amount Paid))',
      'Loyalty Discount (Paid (12 months))',
      'Loyalty Discount (notes [Amount Paid])',
      'Loyalty Discount [notes (Amount Paid)]',
      'Loyalty Discount (Payment in March)',
      'Loyalty Discount (Balance after March)',
      'Loyalty Discount (Tender by Cheque)',
      'Loyalty Discount (Payment: received)',
      'Loyalty Discount [Payment in March]',
      'Loyalty Discount {Payment via Bank}',
      'Loyalty Discount ((Payment in March))',
      'Loyalty Discount (12 months; Payment in March)',
      'Loyalty Discount (Payment-received)',
      'Loyalty Discount (Payment–received)',
      'Loyalty Discount (Amount-Paid)',
      'Loyalty Discount (Balance-for-March)',
      'Loyalty Discount [Payment-received]',
      'Loyalty Discount ((Payment-received))',
      'Loyalty Discount (Tender-received)',
      'Loyalty Discount (Payment pending)',
      'Loyalty Discount (Tender accepted)',
      'Loyalty Discount (Payment has been received)',
      'Loyalty Discount (Payment confirmed)',
      'Loyalty Discount (Payment complete)',
      'Loyalty Discount (Payment successful)',
      'Loyalty Discount (Payment processing)',
      'Loyalty Discount (Payment status: confirmed)',
    ]) {
      final blocks = _boundedUtilityBlocks();
      final labelIndex = blocks.indexWhere(
        (block) => block.text == 'Loyalty Discount (12 months)',
      );
      blocks[labelIndex] = _layoutBlock(label, 12, 4, 51, 383);
      final supportIndex = blocks.indexWhere(
        (block) => block.text == 'Live Chat',
      );
      blocks[supportIndex] = _layoutBlock(
        'Mon - Fri, 8 AM - 8 PM PT',
        15,
        4,
        827,
        1020,
      );
      final preview = _parseBoundedUtility(blocks);
      expect(preview.discount, isNull, reason: label);
      expect(preview.reviewHints, isNotEmpty, reason: label);
      expect(preview.blocks, containsAll(blocks));
    }
    for (final label in [
      'Payment Plan Discount (12 months)',
      'Balance Board Discount (12 months)',
      'Monthly Loyalty Discount (12 months)',
      'Loyalty Discount (Payment Plan)',
      'Loyalty Discount (Balance Board)',
      'Loyalty Discount (Monthly rate)',
      'Payment-Plan Discount (12 months)',
      'Balance-Board Discount (12 months)',
      'Loyalty Discount (Payment-Plan)',
      'Loyalty Discount (Balance-Board)',
    ]) {
      final blocks = _boundedUtilityBlocks();
      final index = blocks.indexWhere(
        (block) => block.text == 'Loyalty Discount (12 months)',
      );
      blocks[index] = _layoutBlock(label, 12, 4, 51, 383);
      final preview = _parseBoundedUtility(blocks);
      expect(preview.discount, '-10.00', reason: label);
      expect(preview.reviewHints, isEmpty, reason: label);
      expect(preview.blocks, containsAll(blocks));
    }
  });

  test('bounded discounts retain evidence of conflicting financial roles', () {
    List<ReceiptOcrBlockEvidence> blocksWithLabel(
      String label, [
      String? period,
      bool wide = false,
    ]) {
      final blocks = _boundedUtilityBlocks();
      final index = blocks.indexWhere(
        (block) => block.text == 'Loyalty Discount (12 months)',
      );
      blocks[index] = _layoutBlock(
        label,
        12,
        4,
        wide ? 20 : 51,
        wide ? 430 : 265,
      );
      if (period != null) {
        final periodIndex = blocks.indexWhere(
          (block) => block.row == 4 && block.order == 13,
        );
        if (period.isEmpty) {
          blocks.removeAt(periodIndex);
        } else {
          blocks[periodIndex] = _layoutBlock(period, 13, 4, 417, 566);
        }
      }
      if (wide && period != '') {
        final periodIndex = blocks.indexWhere(
          (block) => block.row == 4 && block.order == 13,
        );
        blocks[periodIndex] = _layoutBlock(
          blocks[periodIndex].text,
          13,
          4,
          440,
          640,
        );
      }
      return blocks;
    }

    for (final label in [
      'Tax and Discount (12 months)',
      'Balance and Discount (12 months)',
      'Amount Paid and Discount (12 months)',
      'Current Balance and Discount (12 months)',
      'Previous Balances and Discount (12 months)',
      'Tax & Discount (12 months)',
      'Balance & Discount (12 months)',
      'Tax Discount (12 months)',
      'Service Charge and Discount (12 months)',
      'Fees and Discount (12 months)',
      'Shipping and Discount',
      'Tax and Coupon (12 months)',
      'Tax and Rebate (12 months)',
      'Discount and Rebate (12 months)',
      'Tax and Ｄｉｓｃｏｕｎｔ (12 months)',
      'Tax and Ｃｏｕｐｏｎ (12 months)',
      'Tax and Ｒｅｂａｔｅ (12 months)',
    ]) {
      for (final period in <String?>[null, '', 'Feb 5 –']) {
        for (final wide in [false, true]) {
          final blocks = blocksWithLabel(label, period, wide);
          final preview = _parseBoundedUtility(blocks);
          expect(preview.discount, isNull, reason: label);
          expect(preview.reviewHints, isNotEmpty, reason: label);
          expect(preview.blocks, containsAll(blocks));
        }
      }
    }
    for (final role in [
      'Discount',
      'Coupon',
      'Rebate',
      'Ｄｉｓｃｏｕｎｔ',
      'Ｃｏｕｐｏｎ',
      'Ｒｅｂａｔｅ',
    ]) {
      final preview = _parseBoundedUtility(
        blocksWithLabel('Loyalty $role (12 months)'),
      );
      expect(preview.discount, '-10.00');
      expect(preview.reviewHints, isEmpty);
    }
  });

  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'bounded recovery preserves summary and description-sign exclusions',
    () {
      for (final description in [
        'Previous Balance',
        'Amount Paid (12 months)',
        'Amount Paid in Advance',
        'Amount Paid today',
        'Remaining Balance for March',
        'Current Balance account 1234',
        'Previous Account Balance as of March',
        'Account Credit carryover',
        'Deposit Paid in Advance',
        'Amount Paid reference 1234',
        'Balance after March',
        'Balance before March',
        'Payment after March',
        'Tender before March',
        'Balance for March',
        'Payment in March',
        'Tender by Cheque',
        'Balance as of March',
        'Payment via Bank',
        'Payment on March 4',
        'Payment from Bank',
        'Payment to Account',
        'Tender at Counter',
        'Paid',
        'Paid:',
        'Payment:',
        'Tender:',
        'Current Balance:',
        'Balance:',
        'Amount Paid:',
        '• Paid：',
        'Current Balance.',
        'Amount Paid;',
        'Paid [12 months]',
        'Payment',
        'Tender',
        'Card',
        'Credit Card',
        'Debit Card',
        'Visa',
        'Mastercard',
        '• Amount Paid [12 months]',
        '• Balance [12 months]',
        '◆ Amount Paid [12 months]',
        '◆ Balance [12 months]',
        '※ Amount Paid [12 months]',
        '※ Balance [12 months]',
        'Amount Paid [12 months]',
        'Balance [12 months]',
        'Current Balance [12 months]',
        'Account Credit [12 months]',
        'Deposit Paid [12 months]',
        'Amount Paid {12 months}',
        'Balance [monthly (12 months)]',
        'Balance (12 months)',
        'Previous Balances',
        'Remaining Balance (12 months)',
        'Balances (12 months)',
        'Amounts Paid (12 months)',
        'Account Credit (12 months)',
        'Deposit Paid (12 months)',
        'Paid Deposit (12 months)',
        'Total Amount Due (12 months)',
        'Subtotal (12 months)',
        'Balance Due (12 months)',
        'Cash (12 months)',
        'Current Balance',
        'Account Balance',
        'Ending Balance',
        'Starting Balance',
        'Current Balances (12 months)',
        'Previous Statement Balance',
        'Previous Account Balance',
        'Outstanding Account Balance',
        'Payments Received',
        'Balance',
        'Amount Paid',
        'Remaining Balance',
        'Total Amount Due',
        'Subtotal',
        'Taxes and Regulatory Fees',
        'Taxes and Regulatory Fees (Monthly)',
        'DCC Selected',
        'Suggested Tip',
        'Taxes',
        'Tips',
        'Discounts',
        'Payments',
        'Gratuities',
        'Coupons',
        'Surcharges',
        'Fees',
        'Fee Monthly',
        'Fees Monthly',
        'Monthly Fee May',
        'Monthly Fees May',
        'Refunds',
        'Rebates',
        'Credits',
        'Deposits',
        'Levies',
        'Duties',
        'Donations',
        'Internet Plan -10.00 (12 months)',
        'Internet Plan 10.00 (12 months)',
        'Internet Plan -10 (12 months)',
        '-10 Internet Plan',
        'Internet Plan (-) 12 months',
        'Internet Plan (- 10) (12 months)',
        'Internet Plan (10-)',
        'Internet Plan (10−)',
        'Internet Plan (10－)',
        'Internet Plan (﹣10)',
        'Internet Plan (10﹣)',
        'Internet Plan﹣ 10 (12 months)',
        'Internet Plan (﹣ 10)',
        'Internet Plan 10-',
        'Internet Plan (10 -)',
        'Internet Plan (10-) 12 months',
        'Internet Plan 10- (12 months)',
        'Internet Plan- 10 (12 months)',
        'Internet Plan− 10 (12 months)',
        'Internet Plan－ 10 (12 months)',
        'Internet Plan-(10)',
        'Internet Plan- (10)',
        'Internet Plan- (10) 12 months',
        'Internet Plan XPF 10',
        'Internet Plan XPF 10 (12 months)',
        'Internet Plan 10 XPF (12 months)',
        'Internet Plan 10XPF (12 months)',
        'Internet Plan ＵＳＤ',
        'Payment finalised',
        'Tender acknowledgement',
        'Balance carried',
        'Payment verified',
        'Payment confirmed',
        'Payment complete',
        'Payment successful',
        'Payment confirmation',
        'Payment success',
        'Payment paid',
        'Payment processing',
        'Payment authorized',
        'Payment authorised',
        'Payment captured',
        'Payment rejected',
        'Payment status: successful',
        'Confirmed Payment',
        'Successful Payment',
        'Tender-received',
        'Tender received',
        'Payment pending',
        'Tender processed',
        'Payment completed',
        'Payment declined',
        'Tender accepted',
        'Payment scheduled',
        'Payment has been received',
        'Tender not received',
        'Payment partially processed',
        'Payment awaiting confirmation',
        'Pending Payment',
        'Received Tender',
        'Processed Payment',
        'Scheduled Payment',
        'Payment-received',
        'Payment‐received',
        'Payment‑received',
        'Payment–received',
        'Payment—received',
        'Payments-received',
        'Amount-Paid',
        'Balance-for-March',
        'Payment-made',
        'Internet Plan (Payment-received)',
        'Payment: received',
        'Payment：received',
        'Tender; cheque',
        'Balance, March',
        'Payment / received',
        'Payment | received',
        'Payment - received',
        'Amount Paid: March',
        'Internet Plan (Payment in March)',
        'Internet Plan (Amount Paid)',
        'Internet Plan [Balance after March]',
        'Internet Plan (Tender by Cheque)',
        'Paid by Cash',
        'Gift Card',
        'Payment Summary',
        'Cash',
        '- Internet Plan 500',
      ]) {
        final blocks = _boundedUtilityBlocks(description: description);
        final preview = _parseBoundedUtility(blocks);
        expect(preview.items.any((item) => item.lineTotal == '59.99'), isFalse);
        expect(preview.reviewHints, isNotEmpty);
        expect(preview.blocks, containsAll(blocks));
      }
      for (final sign in [
        '-',
        '−',
        '－',
        '﹣',
        '‐',
        '‑',
        '‒',
        '–',
        '—',
        '⁻',
        '₋',
        '﹘',
        '➖',
      ]) {
        for (final description in [
          'Internet Plan (${sign}10)',
          'Internet Plan (10$sign)',
          'Internet Plan$sign 10 (12 months)',
          'Internet Plan ($sign 10)',
        ]) {
          final evidence = _boundedUtilityBlocks(description: description);
          final result = _parseBoundedUtility(evidence);
          expect(
            result.items.any((item) => item.lineTotal == '59.99'),
            isFalse,
          );
          expect(result.reviewHints, isNotEmpty);
          expect(result.blocks, containsAll(evidence));
        }

        final blocks = _boundedUtilityBlocks();
        final index = blocks.indexWhere((b) => b.text == 'Internet Plan 500');
        blocks[index] = _layoutBlock('Internet Plan 500', 8, 3, 60, 383);
        blocks.insert(index, _layoutBlock(sign, 7, 3, 50, 58));
        final preview = _parseBoundedUtility(blocks);
        expect(preview.items.any((item) => item.lineTotal == '59.99'), isFalse);
        expect(preview.reviewHints, isNotEmpty);
        expect(preview.blocks, containsAll(blocks));
      }
      for (final description in [
        'Internet Plan-10',
        'Internet Plan 10-20',
        'Internet Plans 500',
        'Internet Services',
      ]) {
        final namedPlan = _parseBoundedUtility(
          _boundedUtilityBlocks(description: description),
        );
        expect(namedPlan.items.single.description, description);
        expect(namedPlan.items.single.lineTotal, '59.99');
        expect(namedPlan.reviewHints, isEmpty);
      }
      for (final description in [
        'Payment Plan 500',
        'Balance Board Plan',
        'Monthly Internet Plan',
        'Balance Board with Internet',
        'Payment Plan with Internet',
        'Balance Board for Internet',
        'Payment Plan for Internet',
        'Payment-Plan 500',
        'Balance-Board Plan',
        'Internet-Plan 500',
        'Tuesday Plan',
        'Payment Gateway Subscription',
        'Payment Processing Subscription',
        'Payment Processing Package',
        'Payment Plan Received',
        'Total Internet Plan',
        'Pending Payment Plan',
        'Received Balance Board Plan',
        'Payment Plan: Internet',
        'Balance Board / Internet',
        'Internet Plan (Payment Plan)',
        'Internet Plan (Balance Board)',
      ]) {
        final blocks = _boundedUtilityBlocks(description: description);
        final preview = _parseBoundedUtility(blocks);
        expect(
          preview.items.any(
            (item) =>
                item.description == description && item.lineTotal == '59.99',
          ),
          isTrue,
        );
        expect(preview.reviewHints, isEmpty);
        expect(preview.blocks, containsAll(blocks));
      }
      final totalNamedPlan = _parseBoundedUtility(
        _boundedUtilityBlocks(description: 'Total Security Plan'),
      );
      expect(
        totalNamedPlan.items.any(
          (item) =>
              item.description == 'Total Security Plan' &&
              item.lineTotal == '59.99',
        ),
        isTrue,
      );
    },
  );

  test('bounded item diagnostics retain fixed grammar and origin roles', () {
    expect(
      diagnoseReceiptOcrUnretainedRow('Coffee 12.00 note'),
      ReceiptOcrUnretainedPatternReason.otherSuffixDeletionWouldMatch,
    );
    expect(
      diagnoseReceiptOcrUnretainedRow('Coffee12.00'),
      ReceiptOcrUnretainedPatternReason.amountBoundaryInsertionWouldMatch,
    );
    expect(
      diagnoseReceiptOcrUnretainedRow('Coffee12.00 zł'),
      ReceiptOcrUnretainedPatternReason.recognizedCurrencySuffixStillRejected,
    );
    final preview = const ReceiptOcrParser().parse(
      'Cafe\nCoffee 12.00\nTotal USD 12.00',
    );
    expect(preview.items, hasLength(1));
    expect(preview.itemSelectionDecisions, [
      ReceiptOcrItemLineDecision.pricedItemSelected,
    ]);
    expect(preview.itemSelectionDecisions.length, preview.items.length);
  });

  test('selectable currencies remain aligned with API financial policy', () {
    expect(
      settleoraSupportedCurrencies.map((currency) => currency.code).toList(),
      ['HKD', 'USD', 'EUR', 'GBP', 'JPY', 'KWD', 'BHD'],
    );
    expect(settleoraIsSupportedCurrency('AED'), isFalse);
    expect(settleoraIsSupportedCurrency('THB'), isFalse);
  });

  test('parser extracts provisional HKD receipt candidates', () {
    const parser = ReceiptOcrParser();

    final preview = parser.parse('''
Corner Market
2026-06-12
Milk 2 x 12.50 25.00
Bread 18.00
Subtotal HKD 43.00
Tax 0.00
Total HKD 43.00
Thank you
''');

    expect(preview.merchant, 'Corner Market');
    expect(preview.receiptDate, '2026-06-12');
    expect(preview.currency, 'HKD');
    expect(preview.currencyProvenance, ReceiptOcrCurrencyProvenance.explicit);
    expect(preview.subtotal, '43.00');
    expect(preview.tax, '0.00');
    expect(preview.total, '43.00');
    expect(preview.rawTextLineCount, 8);
    expect(preview.items, hasLength(2));
    expect(preview.items.first.description, 'Milk');
    expect(preview.items.first.quantity, '2');
    expect(preview.items.first.unitPrice, '12.50');
    expect(preview.items.first.lineTotal, '25.00');
    expect(preview.items.last.description, 'Bread');
    expect(preview.items.last.quantity, isNull);
    expect(preview.items.last.lineTotal, '18.00');
    expect(preview.reviewHints, isEmpty);
    expect(preview.reviewHintDecision, ReceiptOcrReviewDecision.none);
    expect(preview.itemLineDecisions, hasLength(preview.rawTextLineCount));
    expect(
      preview.itemLineDecisions[2],
      ReceiptOcrItemLineDecision.quantityItemSelected,
    );
    expect(
      preview.itemLineDecisions[3],
      ReceiptOcrItemLineDecision.pricedItemSelected,
    );
  });

  test('parser extracts English receipt totals and charges conservatively', () {
    const parser = ReceiptOcrParser();

    final preview = parser.parse('''
Travel Cafe
2026/06/13
Pasta 18.00
Coffee 5.50
Sub total USD 23.50
Coupon -2.00
Service charge 2.35
VAT 1.65
Grand Total USD 25.50
Card 25.50
''');

    expect(preview.currency, 'USD');
    expect(preview.subtotal, '23.50');
    expect(preview.discount, '-2.00');
    expect(preview.service, '2.35');
    expect(preview.tax, '1.65');
    expect(preview.total, '25.50');
    expect(preview.items.map((item) => item.description), ['Pasta', 'Coffee']);
    expect(preview.reviewHints, isEmpty);
  });

  test(
    'bill title above provider and due date above bill date select semantic roles',
    () {
      final preview = const ReceiptOcrParser().parse('''
UTILITY BILL
Northstar Gas Utility
Account Number: 123456
Due Date: Apr 28, 2025
Bill Date: Apr 10, 2025
Billing Period: Mar 11, 2025 - Apr 09, 2025
Current Gas Charges USD 86.27
Total Amount Due USD 86.27
''');
      expect(preview.merchant, 'Northstar Gas Utility');
      expect(preview.receiptDate, '2025-04-10');
      expect(preview.total, '86.27');
    },
  );

  test(
    'unprinted quantity remains unknown while printed quantity is retained',
    () {
      final preview = const ReceiptOcrParser().parse('''
Corner Market
Milk 2 x 12.50 25.00
Bread 18.00
Total USD 43.00
''');
      expect(preview.items.first.quantity, '2');
      expect(preview.items.last.quantity, isNull);
    },
  );

  test('labeled statement dates and billing periods do not become prices', () {
    final preview = const ReceiptOcrParser().parse('''
Harbor Utility
Reliable service. Statement Date: Apr 10, 2025
Billing Period: Mar 01, 2025 – Mar 31, 2025
Electricity USD 12.00
Total USD 12.00
''');
    expect(preview.items.map((item) => item.description), ['Electricity']);
    expect(preview.items.single.lineTotal, '12.00');
  });

  test('a separate priced item survives an adjacent statement date', () {
    final preview = const ReceiptOcrParser().parse(
      'Harbor Utility\nCoffee USD 5.00 Bill Date: Apr 10, 2025\n'
      'Total USD 5.00',
      blocks: [
        _layoutBlock('Harbor Utility', 0, 0, 20, 250),
        _layoutBlock('Coffee', 1, 1, 20, 160),
        _layoutBlock('USD 5.00', 2, 1, 250, 330),
        _layoutBlock('Bill Date:', 3, 1, 500, 610),
        _layoutBlock('Apr 10, 2025', 4, 1, 640, 790),
        _layoutBlock('Total USD 5.00', 5, 2, 20, 330),
      ],
    );
    expect(preview.items.single.description, 'Coffee');
    expect(preview.items.single.lineTotal, '5.00');
  });

  test('a printed price after a dated description remains an item', () {
    final preview = const ReceiptOcrParser().parse('''
Print Shop
Statement Date: Apr 10, 2025 Calendar USD 20.00
Total Due Guide USD 5.00
Total USD 25.00
''');
    expect(preview.items.map((item) => item.lineTotal), ['20.00', '5.00']);
    expect(preview.items.last.description, 'Total Due Guide');
  });

  test('total due is a summary and outranks current charges', () {
    final preview = const ReceiptOcrParser().parse('''
Harbor Internet
Internet Plan USD 50.00
Total Due USD 40.00
Total Current Charges USD 50.00
''');
    expect(preview.items.map((item) => item.description), ['Internet Plan']);
    expect(preview.total, '40.00');
    expect(preview.reviewHints, isNotEmpty);
  });

  test('numbered total-due product names do not outrank a printed total', () {
    final preview = const ReceiptOcrParser().parse('''
Bookshop
Total Due Guide 2025 USD 5.00
Notebook USD 20.00
Total USD 25.00
''');
    expect(preview.total, '25.00');
    expect(preview.items.map((item) => item.description), [
      'Total Due Guide 2025',
      'Notebook',
    ]);
  });

  test('multi-currency amount due keeps priority over another total', () {
    for (final label in ['Amount Due', 'Total Amount Due', 'Total Due']) {
      for (final amounts in [
        'EUR 72.00 / USD 80.00',
        'EUR 72.00, USD 80.00',
        '72.00 EUR / 80.00 USD',
        'EUR72.00; USD80.00',
        'EUR: 72.00 / USD: 80.00',
        'EUR=72.00 / USD=80.00',
        '72.00: EUR / 80.00: USD',
        'EUR +72.00 / USD +80.00',
        '+72.00 EUR / +80.00 USD',
      ]) {
        final preview = const ReceiptOcrParser().parse('''
Harbor Hotel
Room USD 100.00
Deposit Paid USD 20.00
$label $amounts
Total USD 100.00
''');
        expect(preview.currency, 'USD', reason: '$label $amounts');
        expect(preview.total, '80.00', reason: '$label $amounts');
      }
    }
  });

  test('a bare edition year cannot supply another priority monetary cell', () {
    final preview = const ReceiptOcrParser().parse('''
Bookshop
Total Due 2025 USD 5.00
Notebook USD 20.00
Total USD 25.00
''');
    expect(preview.total, '25.00');
    expect(preview.items.map((item) => item.description), [
      'Total Due 2025',
      'Notebook',
    ]);
  });

  test(
    'amount due outranks current charges and tender without rewriting values',
    () {
      final preview = const ReceiptOcrParser().parse('''
River Utility
Service date: 2025-04-01
Bill Date: 2025-04-10
Due Date: 2025-04-28
Subtotal USD 80.00
Tax USD 6.27
Total Amount Due USD 86.27
Cash Tender USD 100.00
Change USD 13.73
Total Current Charges USD 80.00
''');
      expect(preview.receiptDate, '2025-04-10');
      expect(preview.total, '86.27');
    },
  );

  test(
    'stacked organization and leading item quantities retain reading order',
    () {
      final preview = const ReceiptOcrParser().parse(
        '''
THE RIDGE
KITCHEN + BAR
789 Summit Blvd
Qty Item Price
1 Margherita Pizza 14.00
2 House Red (gls) 18.00
1 Tiramisu 8.00
Subtotal USD 40.00
Total USD 40.00
''',
        blocks: [
          _layoutBlock('THE RIDGE', 0, 0, 100, 260),
          _layoutBlock('KITCHEN + BAR', 1, 1, 90, 270),
          _layoutBlock('789 Summit Blvd', 2, 2, 110, 260),
          _layoutBlock('Qty Item Price', 3, 3, 20, 350),
          _layoutBlock('1', 4, 4, 20, 28),
          _layoutBlock('Margherita Pizza', 5, 4, 55, 220),
          _layoutBlock('14.00', 6, 4, 310, 350),
          _layoutBlock('2', 7, 5, 20, 28),
          _layoutBlock('House Red (gls)', 8, 5, 55, 220),
          _layoutBlock('18.00', 9, 5, 310, 350),
          _layoutBlock('1', 10, 6, 20, 28),
          _layoutBlock('Tiramisu', 11, 6, 55, 180),
          _layoutBlock('8.00', 12, 6, 310, 350),
          _layoutBlock('Subtotal USD 40.00', 13, 7, 100, 350),
          _layoutBlock('Total USD 40.00', 14, 8, 100, 350),
        ],
      );
      expect(preview.merchant, 'THE RIDGE KITCHEN + BAR');
      expect(preview.items.map((item) => item.description), [
        'Margherita Pizza',
        'House Red (gls)',
        'Tiramisu',
      ]);
      expect(preview.items.map((item) => item.quantity), ['1', '2', '1']);
      expect(
        preview.warnings,
        isNot(
          contains(
            'Some OCR lines need manual review because no traceable line amount was found.',
          ),
        ),
      );
    },
  );

  test('a number-prefixed product stays a name without a quantity column', () {
    final preview = const ReceiptOcrParser().parse('''
Corner Market
7 Up Soda 2.50
Total USD 2.50
''');
    expect(preview.items.single.description, '7 Up Soda');
    expect(preview.items.single.quantity, isNull);
  });

  test('repeated numeric product prefixes remain names without geometry', () {
    final preview = const ReceiptOcrParser().parse('''
Corner Market
7 Up Soda 2.50
7 Grain Bread 3.00
8 Ball Toy 4.00
Total USD 9.50
''');
    expect(preview.items.map((item) => item.description), [
      '7 Up Soda',
      '7 Grain Bread',
      '8 Ball Toy',
    ]);
    expect(preview.items.every((item) => item.quantity == null), isTrue);
  });

  test(
    'reconciling subtotal does not turn numbered products into quantities',
    () {
      const rows = [
        ('1', 'Day Pass', '14.00'),
        ('1', 'Year Calendar', '11.00'),
        ('2', 'Pack Batteries', '18.00'),
        ('1', 'More Thing', '8.00'),
      ];
      final preview = const ReceiptOcrParser().parse(
        'Market\n1 Day Pass 14.00\n1 Year Calendar 11.00\n'
        '2 Pack Batteries 18.00\n1 More Thing 8.00\n'
        'Subtotal 51.00\nTotal 51.00',
        blocks: [
          _layoutBlock('Market', 0, 0, 150, 500),
          for (final (index, row) in rows.indexed) ...[
            _layoutBlock(row.$1, index * 3 + 1, index + 1, 20, 30),
            _layoutBlock(row.$2, index * 3 + 2, index + 1, 65, 280),
            _layoutBlock(row.$3, index * 3 + 3, index + 1, 390, 470),
          ],
          _layoutBlock('Subtotal 51.00', 13, 5, 65, 470),
          _layoutBlock('Total 51.00', 14, 6, 65, 470),
        ],
      );
      expect(preview.items.map((item) => item.description), [
        '1 Day Pass',
        '1 Year Calendar',
        '2 Pack Batteries',
        '1 More Thing',
      ]);
      expect(preview.items.every((item) => item.quantity == null), isTrue);
    },
  );

  test(
    'repeated numeric product prefixes remain names with aligned geometry',
    () {
      final preview = const ReceiptOcrParser().parse(
        'Corner Market\n7 Up Soda 2.50\n7 Grain Bread 3.00\nTotal USD 5.50',
        blocks: [
          _layoutBlock('Corner Market', 0, 0, 20, 220),
          _layoutBlock('7', 1, 1, 20, 28),
          _layoutBlock('Up Soda', 2, 1, 55, 220),
          _layoutBlock('2.50', 3, 1, 310, 350),
          _layoutBlock('7', 4, 2, 20, 28),
          _layoutBlock('Grain Bread', 5, 2, 55, 220),
          _layoutBlock('3.00', 6, 2, 310, 350),
          _layoutBlock('Total USD 5.50', 7, 3, 20, 350),
        ],
      );
      expect(preview.items.map((item) => item.description), [
        '7 Up Soda',
        '7 Grain Bread',
      ]);
      expect(preview.items.every((item) => item.quantity == null), isTrue);
    },
  );

  test(
    'small aligned product prefixes remain names without a quantity header',
    () {
      final preview = const ReceiptOcrParser().parse(
        'Corner Market\n2 Pack Batteries 3.00\n3 Bean Soup 4.00\nTotal USD 7.00',
        blocks: [
          _layoutBlock('Corner Market', 0, 0, 20, 220),
          _layoutBlock('2', 1, 1, 20, 28),
          _layoutBlock('Pack Batteries', 2, 1, 55, 220),
          _layoutBlock('3.00', 3, 1, 310, 350),
          _layoutBlock('3', 4, 2, 20, 28),
          _layoutBlock('Bean Soup', 5, 2, 55, 220),
          _layoutBlock('4.00', 6, 2, 310, 350),
          _layoutBlock('Total USD 7.00', 7, 3, 20, 350),
        ],
      );
      expect(preview.items.map((item) => item.description), [
        '2 Pack Batteries',
        '3 Bean Soup',
      ]);
      expect(preview.items.every((item) => item.quantity == null), isTrue);
    },
  );

  test('priced modifier marker is not part of the item name', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Burger Lab
Combo Meal USD 15.00
+ Large Fries
+ No Onion
+ Extra Cheese USD 1.50
Iced Tea USD 3.00
Subtotal USD 19.50
Tax USD 1.76
Total USD 21.26
Thank you
''');
    expect(preview.items.map((item) => item.description), [
      'Combo Meal',
      'Extra Cheese',
      'Iced Tea',
    ]);
    expect(preview.items.map((item) => item.lineTotal), [
      '15.00',
      '1.50',
      '3.00',
    ]);
    expect(preview.reviewHints, isNotEmpty);
    final oneUnpricedModifier = parser.parse('''
Burger Lab
Combo Meal USD 15.00
+ No Onion
+ Extra Cheese USD 1.50
Total USD 16.50
''');
    expect(oneUnpricedModifier.items.map((item) => item.description), [
      'Combo Meal',
      'Extra Cheese',
    ]);
    expect(oneUnpricedModifier.reviewHints, isNotEmpty);

    final firstItem = parser.parse('''
Book Shop
+ Energy Drink USD 5.00
Total USD 5.00
''');
    expect(firstItem.items.single.description, '+ Energy Drink');
    final separateProduct = parser.parse('''
Book Shop
Notebook USD 2.00
+ Energy Drink USD 5.00
Total USD 7.00
''');
    expect(separateProduct.items.last.description, '+ Energy Drink');
    final consecutiveProducts = parser.parse('''
Book Shop
+ Energy Drink USD 5.00
+ Energy Bar USD 3.00
Total USD 8.00
''');
    expect(consecutiveProducts.items.map((item) => item.description), [
      '+ Energy Drink',
      '+ Energy Bar',
    ]);
  });

  test('priced modifier keeps an adjacent right-column amount', () {
    final preview = const ReceiptOcrParser().parse(
      'Burger Lab\nCombo Meal USD 15.00\n+ Large Fries\n'
      '+ Extra Cheese\nUSD 1.50\nTotal USD 16.50',
      blocks: [
        _layoutBlock('Burger Lab', 0, 0, 20, 250),
        _layoutBlock('Combo Meal USD 15.00', 1, 1, 20, 350),
        _layoutBlock('+ Large Fries', 2, 2, 20, 220),
        _layoutBlock('+ Extra Cheese', 3, 3, 20, 220),
        _layoutBlock('USD 1.50', 4, 4, 310, 350),
        _layoutBlock('Total USD 16.50', 5, 5, 20, 350),
      ],
    );
    expect(preview.items.map((item) => item.description), [
      'Combo Meal',
      'Extra Cheese',
    ]);
    expect(preview.items.map((item) => item.lineTotal), ['15.00', '1.50']);
    expect(preview.reviewHints, isNotEmpty);
  });

  test('an explicit quantity header supports quantities above three', () {
    final preview = const ReceiptOcrParser().parse(
      'Corner Market\nQty Item Price\n4 Rolls 8.00\n5 Pens 10.00\nTotal USD 18.00',
      blocks: [
        _layoutBlock('Corner Market', 0, 0, 20, 220),
        _layoutBlock('Qty Item Price', 1, 1, 20, 350),
        _layoutBlock('4', 2, 2, 20, 28),
        _layoutBlock('Rolls', 3, 2, 55, 220),
        _layoutBlock('8.00', 4, 2, 310, 350),
        _layoutBlock('5', 5, 3, 20, 28),
        _layoutBlock('Pens', 6, 3, 55, 220),
        _layoutBlock('10.00', 7, 3, 310, 350),
        _layoutBlock('Total USD 18.00', 8, 4, 20, 350),
      ],
    );
    expect(preview.items.map((item) => item.description), ['Rolls', 'Pens']);
    expect(preview.items.map((item) => item.quantity), ['4', '5']);
  });

  test('a one-row quantity column remains usable with a header', () {
    final preview = const ReceiptOcrParser().parse(
      'Corner Market\nQty Item Price\n4 Rolls 8.00\nTotal USD 8.00',
      blocks: [
        _layoutBlock('Corner Market', 0, 0, 20, 220),
        _layoutBlock('Qty Item Price', 1, 1, 20, 350),
        _layoutBlock('4', 2, 2, 20, 28),
        _layoutBlock('Rolls', 3, 2, 55, 220),
        _layoutBlock('8.00', 4, 2, 310, 350),
        _layoutBlock('Total USD 8.00', 5, 3, 20, 350),
      ],
    );
    expect(preview.items.single.description, 'Rolls');
    expect(preview.items.single.quantity, '4');
  });

  test('three uppercase organization rows are consumed as one role', () {
    final preview = const ReceiptOcrParser().parse('''
THE
RIDGE
KITCHEN + BAR
Coffee USD 4.00
Total USD 4.00
''');
    expect(preview.merchant, 'THE RIDGE KITCHEN + BAR');
    expect(
      preview.warnings,
      isNot(
        contains(
          'Some OCR lines need manual review because no traceable line amount was found.',
        ),
      ),
    );
  });

  test('uppercase charge columns do not extend the merchant', () {
    final preview = const ReceiptOcrParser().parse('''
HARBOR UTILITY
DESCRIPTION USAGE RATE AMOUNT
Water Charge USD 12.00
Total USD 12.00
''');
    expect(preview.merchant, 'HARBOR UTILITY');
  });

  test('keyword-bearing third organization row retains preceding rows', () {
    final preview = const ReceiptOcrParser().parse('''
THE
RIDGE
KITCHEN MARKET
Coffee USD 4.00
Total USD 4.00
''');
    expect(preview.merchant, 'THE RIDGE KITCHEN MARKET');
    expect(
      preview.warnings,
      isNot(
        contains(
          'Some OCR lines need manual review because no traceable line amount was found.',
        ),
      ),
    );
  });

  test('an uppercase item before a standalone amount stays out of merchant', () {
    final preview = const ReceiptOcrParser().parse('''
CORNER MARKET
BREAD
2.50
Total USD 2.50
''');
    expect(preview.merchant, 'CORNER MARKET');
    expect(
      preview.warnings,
      contains(
        'Some OCR lines need manual review because no traceable line amount was found.',
      ),
    );
    final competingKeywordItem = const ReceiptOcrParser().parse('''
FRESH FOODS
MARKET SALAD
12.00
Total USD 12.00
''');
    expect(competingKeywordItem.merchant, 'FRESH FOODS');
    final shortItemName = const ReceiptOcrParser().parse('''
Corner Cafe
Tea 12.50
Total USD 12.50
''');
    expect(shortItemName.merchant, 'Corner Cafe');
    expect(shortItemName.items.single.description, 'Tea');
  });

  test('adjacent right-column amount is reviewable item evidence', () {
    const text = 'Corner Market\nBread\nUSD 2.50\nTotal USD 2.50';
    final preview = const ReceiptOcrParser().parse(
      text,
      blocks: [
        _layoutBlock('Corner Market', 0, 0, 20, 220),
        _layoutBlock('Bread', 1, 1, 20, 150),
        _layoutBlock('USD 2.50', 2, 2, 310, 350),
        _layoutBlock('Total USD 2.50', 3, 3, 20, 350),
      ],
    );
    expect(preview.merchant, 'Corner Market');
    expect(preview.items, hasLength(1));
    expect(preview.items.single.description, 'Bread');
    expect(preview.items.single.lineTotal, '2.50');
    expect(preview.items.single.currency, 'USD');
    expect(
      preview.warnings,
      isNot(
        contains(
          'Some OCR lines need manual review because no traceable line amount was found.',
        ),
      ),
    );

    final withoutGeometry = const ReceiptOcrParser().parse(text);
    expect(withoutGeometry.items, isEmpty);
    final leftAlignedAmount = const ReceiptOcrParser().parse(
      text,
      blocks: [
        _layoutBlock('Corner Market', 0, 0, 20, 220),
        _layoutBlock('Bread', 1, 1, 20, 150),
        _layoutBlock('USD 2.50', 2, 2, 20, 100),
        _layoutBlock('Total USD 2.50', 3, 3, 20, 350),
      ],
    );
    expect(leftAlignedAmount.items, isEmpty);
    final distantAmount = const ReceiptOcrParser().parse(
      text,
      blocks: [
        _layoutBlock('Corner Market', 0, 0, 20, 220),
        _layoutBlock('Bread', 1, 1, 20, 150),
        _layoutBlock('USD 2.50', 2, 20, 310, 350),
        _layoutBlock('Total USD 2.50', 3, 21, 20, 350),
      ],
    );
    expect(distantAmount.items, isEmpty);

    const withTender =
        'Corner Market\nBread USD 2.50\nCash\nUSD 5.00\nTotal USD 2.50';
    final tender = const ReceiptOcrParser().parse(
      withTender,
      blocks: [
        _layoutBlock('Corner Market', 0, 0, 20, 220),
        _layoutBlock('Bread USD 2.50', 1, 1, 20, 350),
        _layoutBlock('Cash', 2, 2, 20, 150),
        _layoutBlock('USD 5.00', 3, 3, 310, 350),
        _layoutBlock('Total USD 2.50', 4, 4, 20, 350),
      ],
    );
    expect(tender.items.map((item) => item.description), ['Bread']);

    const splitFinancial =
        'Corner Market\nBread USD 2.50\nAmount Due\nUSD 2.50\nCash Tendered\nUSD 5.00';
    final splitRoles = const ReceiptOcrParser().parse(
      splitFinancial,
      blocks: [
        _layoutBlock('Corner Market', 0, 0, 20, 220),
        _layoutBlock('Bread USD 2.50', 1, 1, 20, 350),
        _layoutBlock('Amount Due', 2, 2, 20, 150),
        _layoutBlock('USD 2.50', 3, 3, 310, 350),
        _layoutBlock('Cash Tendered', 4, 4, 20, 150),
        _layoutBlock('USD 5.00', 5, 5, 310, 350),
      ],
    );
    expect(splitRoles.total, '2.50');
    expect(splitRoles.items.map((item) => item.description), ['Bread']);

    final overlappingRows = const ReceiptOcrParser().parse(
      text,
      blocks: [
        _layoutBlock('Corner Market', 0, 0, 20, 220),
        _layoutBlock('Bread', 1, 1, 20, 150),
        const ReceiptOcrBlockEvidence(
          text: 'USD 2.50',
          order: 2,
          row: 2,
          points: [
            ReceiptOcrPoint(x: 310, y: 30),
            ReceiptOcrPoint(x: 350, y: 30),
            ReceiptOcrPoint(x: 350, y: 42),
            ReceiptOcrPoint(x: 310, y: 42),
          ],
        ),
        _layoutBlock('Total USD 2.50', 3, 3, 20, 350),
      ],
    );
    expect(overlappingRows.items.map((item) => item.description), ['Bread']);
  });

  test('adjacent priced rows accept trailing and leading local symbols', () {
    const parser = ReceiptOcrParser();
    final polish = parser.parse(
      'Sklep Warszawa\nZupa\n35,50 zł\nKawa\n12,00 zł\nRazem 47,50 zł',
      blocks: [
        _layoutBlock('Sklep Warszawa', 0, 0, 20, 280),
        _layoutBlock('Zupa', 1, 1, 20, 120),
        _layoutBlock('35,50 zł', 2, 2, 300, 390),
        _layoutBlock('Kawa', 3, 3, 20, 120),
        _layoutBlock('12,00 zł', 4, 4, 300, 390),
        _layoutBlock('Razem 47,50 zł', 5, 5, 20, 390),
      ],
    );
    expect(polish.items.map((item) => item.description), ['Zupa', 'Kawa']);
    expect(polish.items.map((item) => item.lineTotal), ['35.50', '12.00']);

    final turkish = parser.parse(
      'İstanbul Market\nYemek\n₺400,00\nÇay\n₺56,70\nToplam ₺456,70',
      blocks: [
        _layoutBlock('İstanbul Market', 0, 0, 20, 280),
        _layoutBlock('Yemek', 1, 1, 20, 120),
        _layoutBlock('₺400,00', 2, 2, 300, 390),
        _layoutBlock('Çay', 3, 3, 20, 120),
        _layoutBlock('₺56,70', 4, 4, 300, 390),
        _layoutBlock('Toplam ₺456,70', 5, 5, 20, 390),
      ],
    );
    expect(turkish.items.map((item) => item.description), ['Yemek', 'Çay']);
    expect(turkish.items.map((item) => item.lineTotal), ['400.00', '56.70']);
  });

  test('joined printed currency symbols delimit priced items', () {
    final preview = const ReceiptOcrParser().parse('''
Market
Tea₺56,70
Rice₩11,000
Noodlesđ120.000
SKUUSD123
Total ₺56,70
''');
    expect(preview.items.map((item) => item.description), [
      'Tea',
      'Rice',
      'Noodles',
    ]);
    expect(preview.items.map((item) => item.currency), ['TRY', 'KRW', 'VND']);
    expect(preview.items.map((item) => item.lineTotal), [
      '56.70',
      '11000',
      '120000',
    ]);
  });

  test('printed dong suffix stays a currency rather than discarded text', () {
    final preview = const ReceiptOcrParser().parse('''
Market
Noodles 120.000 đ
Tea 80.000 đ
Total 200.000 đ
''');
    expect(preview.currency, 'VND');
    expect(preview.items.map((item) => item.description), ['Noodles', 'Tea']);
    expect(preview.items.map((item) => item.lineTotal), ['120000', '80000']);
    expect(preview.items.every((item) => item.currency == 'VND'), isTrue);
  });

  test('Vietnamese letters without amount adjacency do not set currency', () {
    final preview = const ReceiptOcrParser().parse('''
Đà Lạt Market
Tea 12.00
Total 12.00
''');
    expect(preview.currency, isNull);
  });

  test('distinct printed negative promotions reconcile as one discount', () {
    final preview = const ReceiptOcrParser().parse('''
Market
Cereal USD 6.00
Milk USD 4.00
Subtotal USD 10.00
Store Coupon USD -2.00
Loyalty Discount USD -1.00
Tax USD 0.49
Total USD 7.49
''');
    expect(preview.items.map((item) => item.description), ['Cereal', 'Milk']);
    expect(preview.discount, '-3.00');
    expect(preview.adjustmentsComplete, isTrue);
    expect(preview.reviewHints, isEmpty);
  });

  test('negative standalone promotion is evidence, not merchandise', () {
    final preview = const ReceiptOcrParser().parse('''
Promo Cafe
Coffee USD 5.00
Promotion USD -5.00
Subtotal USD 5.00
Discount USD -5.00
Total USD 0.00
''');
    expect(preview.items.map((item) => item.description), ['Coffee']);
    expect(preview.total, '0.00');

    final merchandise = const ReceiptOcrParser().parse('''
Market
Promotion Mug USD 5.00
Total USD 5.00
''');
    expect(merchandise.items.map((item) => item.description), [
      'Promotion Mug',
    ]);
  });

  test('DCC selected amount is payment context, not merchandise', () {
    final preview = const ReceiptOcrParser().parse(r'''
Central Card Terminal
Hong Kong Central
Dinner HK$780
DCC Selected USD 100
CARD CHARGED USD 100.00
Exchange Rate 7.8000 HKD/USD
''', fallbackCurrency: 'HKD');
    expect(preview.items.map((item) => item.description), ['Dinner']);
    expect(preview.currency, 'USD');
    expect(preview.currencyProvenance, ReceiptOcrCurrencyProvenance.explicit);
    expect(preview.items.single.currency, 'HKD');
    expect(preview.items.single.lineTotal, '780');
    expect(preview.total, '100.00');
    expect(preview.reviewHints, [
      'Some item prices use a different currency from the receipt. Review before applying.',
    ]);
    expect(
      preview.warnings,
      contains(
        'Item prices and the charged amount use different currencies. Review before applying.',
      ),
    );

    final uncorroborated = const ReceiptOcrParser().parse(r'''
Central Card Terminal
Dinner HK$780
DCC Selected USD 100
''', fallbackCurrency: 'HKD');
    expect(uncorroborated.currency, 'HKD');
    expect(
      uncorroborated.warnings,
      contains(
        'DCC selection needs a matching charged amount. Review the receipt currency.',
      ),
    );

    final mismatchedCharge = const ReceiptOcrParser().parse(r'''
Central Card Terminal
Dinner HK$780
DCC Selected USD 100
CARD CHARGED USD 90
''', fallbackCurrency: 'HKD');
    expect(mismatchedCharge.currency, 'HKD');
    expect(
      mismatchedCharge.warnings,
      contains(
        'DCC selection needs a matching charged amount. Review the receipt currency.',
      ),
    );

    final explicitTotal = const ReceiptOcrParser().parse(r'''
Central Card Terminal
Dinner HK$780
Total HKD 780
DCC Selected USD 100
CARD CHARGED USD 100
''', fallbackCurrency: 'HKD');
    expect(explicitTotal.currency, 'HKD');
    expect(
      explicitTotal.currencyProvenance,
      ReceiptOcrCurrencyProvenance.explicit,
    );
    expect(
      explicitTotal.warnings,
      contains(
        'Item prices and the charged amount use different currencies. Review before applying.',
      ),
    );

    final conflictingHeader = const ReceiptOcrParser().parse(r'''
Central Card Terminal
Dinner USD 100
Total HKD 100
DCC Selected USD 100
CARD CHARGED USD 100
''', fallbackCurrency: 'HKD');
    expect(conflictingHeader.currency, 'HKD');
    expect(conflictingHeader.items.single.currency, 'USD');
    expect(
      conflictingHeader.warnings,
      contains(
        'Item prices and the receipt currency differ. Review before applying.',
      ),
    );

    for (final explicitReceiptLine in ['Currency HKD', 'Subtotal HKD 780']) {
      final printedCurrency = const ReceiptOcrParser().parse('''
Central Card Terminal
Dinner HKD 780
$explicitReceiptLine
DCC Selected USD 100
CARD CHARGED USD 100
''', fallbackCurrency: 'HKD');
      expect(printedCurrency.currency, 'HKD', reason: explicitReceiptLine);
      expect(
        printedCurrency.currencyProvenance,
        ReceiptOcrCurrencyProvenance.explicit,
        reason: explicitReceiptLine,
      );
      expect(
        printedCurrency.warnings,
        contains(
          'Item prices and the charged amount use different currencies. Review before applying.',
        ),
        reason: explicitReceiptLine,
      );
    }

    for (final explicitReceiptLine in ['Currency HKD', 'Subtotal HKD 780']) {
      final multipleForeignItems = const ReceiptOcrParser().parse('''
Central Card Terminal
Dinner USD 10
Lunch USD 20
Snack USD 30
$explicitReceiptLine
DCC Selected USD 100
CARD CHARGED USD 100
''', fallbackCurrency: 'HKD');
      expect(multipleForeignItems.currency, 'HKD', reason: explicitReceiptLine);
      expect(
        multipleForeignItems.warnings,
        contains(
          'Item prices and the receipt currency differ. Review before applying.',
        ),
        reason: explicitReceiptLine,
      );
    }
    final conflictingPrintedCurrencies = const ReceiptOcrParser().parse('''
Central Card Terminal
Dinner HKD 780
Currency HKD
Subtotal USD 100
DCC Selected USD 100
CARD CHARGED USD 100
''', fallbackCurrency: 'HKD');
    expect(conflictingPrintedCurrencies.currency, isNull);
    final mixedSubtotal = const ReceiptOcrParser().parse('''
Central Card Terminal
Dinner HKD 780
Subtotal HKD 780 / USD 100
DCC Selected USD 100
CARD CHARGED USD 100
''', fallbackCurrency: 'HKD');
    expect(mixedSubtotal.currency, isNull);
    final mixedSubtotalWithProse = const ReceiptOcrParser().parse('''
Central Card Terminal
Dinner HKD 780
Subtotal HKD 780 / USD 100 — try our app
DCC Selected USD 100
CARD CHARGED USD 100
''', fallbackCurrency: 'HKD');
    expect(mixedSubtotalWithProse.currency, isNull);
    final subtotalWithProse = const ReceiptOcrParser().parse('''
Central Card Terminal
Dinner USD 100
Subtotal USD 100 — try our app
DCC Selected USD 100
CARD CHARGED USD 100
''', fallbackCurrency: 'HKD');
    expect(subtotalWithProse.currency, 'USD');
    final subtotalWithUppercaseProse = const ReceiptOcrParser().parse('''
Central Card Terminal
Dinner USD 100
Subtotal USD 100 — TRY 1 FREE
DCC Selected USD 100
CARD CHARGED USD 100
''', fallbackCurrency: 'HKD');
    expect(subtotalWithUppercaseProse.currency, 'USD');
    final separatedPromotionProse = const ReceiptOcrParser().parse('''
Central Card Terminal
Dinner USD 100
Subtotal USD 100 / TRY 1 FREE
DCC Selected USD 100
CARD CHARGED USD 100
''', fallbackCurrency: 'HKD');
    expect(separatedPromotionProse.currency, 'USD');
    final separatedFreePromotion = const ReceiptOcrParser().parse('''
Central Card Terminal
Dinner USD 100
Subtotal USD 100 / TRY 1 — FREE
DCC Selected USD 100
CARD CHARGED USD 100
''', fallbackCurrency: 'HKD');
    expect(separatedFreePromotion.currency, 'USD');
    final separatedPromoCopy = const ReceiptOcrParser().parse('''
Central Card Terminal
Dinner USD 100
Subtotal USD 100 / TRY 1 — SAVE MORE
DCC Selected USD 100
CARD CHARGED USD 100
''', fallbackCurrency: 'HKD');
    expect(separatedPromoCopy.currency, 'USD');
    for (final suffix in ['TRY 1 — (FREE)', 'TRY 1 — 2 FREE']) {
      final decoratedPromoCopy = const ReceiptOcrParser().parse('''
Central Card Terminal
Dinner USD 100
Subtotal USD 100 / $suffix
DCC Selected USD 100
CARD CHARGED USD 100
''', fallbackCurrency: 'HKD');
      expect(decoratedPromoCopy.currency, 'USD', reason: suffix);
    }
    final decimalPromoCopy = const ReceiptOcrParser().parse('''
Central Card Terminal
Dinner USD 100
Subtotal USD 100 / TRY 1.00 — FREE
DCC Selected USD 100
CARD CHARGED USD 100
''', fallbackCurrency: 'HKD');
    expect(decimalPromoCopy.currency, 'USD');

    final unresolvedHeader = const ReceiptOcrParser().parse(r'''
Karachi Grill
Currency USD
Dinner USD 100
Total Rs 100 Rs 200
DCC Selected USD 100
CARD CHARGED USD 100
''', fallbackCurrency: 'PKR');
    expect(unresolvedHeader.currency, isNull);
    expect(
      unresolvedHeader.warnings,
      isNot(
        contains(
          'Item prices and the receipt currency differ. Review before applying.',
        ),
      ),
    );

    final conflictingSelection = const ReceiptOcrParser().parse(r'''
Central Card Terminal
Dinner HK$780
DCC Selected ZZZ 100
DCC Selected USD 100
CARD CHARGED USD 100
''', fallbackCurrency: 'HKD');
    expect(conflictingSelection.currency, 'HKD');
    expect(
      conflictingSelection.warnings,
      contains(
        'DCC selection needs a matching charged amount. Review the receipt currency.',
      ),
    );

    final merchandise = const ReceiptOcrParser().parse('''
Store
DCC Selected Tee USD 10.00
Total USD 10.00
''');
    expect(merchandise.items.map((item) => item.description), [
      'DCC Selected Tee',
    ]);
  });

  test('DCC charged-total fallback excludes partial and stronger evidence', () {
    const parser = ReceiptOcrParser();
    const base = r'''Central Card Terminal
Dinner HK$780.00
DCC Selected USD 100.00
CARD CHARGED USD 100.00
Exchange Rate 7.8000 HKD/USD''';
    final charged = parser.parse(base, fallbackCurrency: 'HKD');
    expect(charged.currency, 'USD');
    expect(charged.total, '100.00');
    expect(charged.items.single.currency, 'HKD');
    expect(charged.items.single.lineTotal, '780.00');
    expect(charged.reviewHints, [
      'Some item prices use a different currency from the receipt. Review before applying.',
    ]);
    final grouped = parser.parse(r'''Central Card Terminal
Dinner HK$7,800.00
DCC Selected USD 1,000.00
CARD CHARGED USD 1,000.00
Exchange Rate 7.8000 HKD/USD''', fallbackCurrency: 'HKD');
    expect(grouped.currency, 'USD');
    expect(grouped.total, '1000.00');
    expect(grouped.items.single.currency, 'HKD');
    expect(grouped.items.single.lineTotal, '7800.00');
    final unresolvedItem = parser.parse(
      '$base\nMystery snack',
      fallbackCurrency: 'HKD',
    );
    expect(unresolvedItem.total, isNull);
    expect(unresolvedItem.adjustmentsComplete, isFalse);
    final crowdedItems = List.generate(
      41,
      (index) => 'Menu $index HK\$1.00',
    ).join('\n');
    final truncatedItems = parser.parse(
      base.replaceFirst('Dinner HK\$780.00', crowdedItems),
      fallbackCurrency: 'HKD',
    );
    expect(truncatedItems.items, hasLength(40));
    expect(truncatedItems.total, isNull);
    expect(truncatedItems.adjustmentsComplete, isFalse);

    for (final extra in [
      'Cash USD 5.00',
      'Gift card applied',
      'Cash paid',
      'Bank transfer',
      'Paid by bank transfer USD 5.00',
      'Split tender',
      'Partial payment',
      'Refund USD 5.00',
      'Deposit Paid USD 5.00',
      'Convenience fee USD 5.00',
      'Currency USD',
      'Subtotal HKD 780.00',
      'Exchange Rate 7.8000 USD/HKD',
      'Exchange Rate 7.7000 HKD/USD',
      'Exchange Rate 7.7990 HKD/USD',
      'Exchange Rate 0.0000 HKD/USD',
    ]) {
      final text = extra.startsWith('Exchange Rate')
          ? base.replaceFirst('Exchange Rate 7.8000 HKD/USD', extra)
          : '$base\n$extra';
      final result = parser.parse(text, fallbackCurrency: 'HKD');
      expect(result.total, isNull, reason: extra);
    }
    final unpaidBalance = parser.parse(
      '$base\nBalance Due USD 5.00',
      fallbackCurrency: 'HKD',
    );
    expect(unpaidBalance.total, '5.00');
    final printedTotal = parser.parse(
      '$base\nTotal HKD 780.00',
      fallbackCurrency: 'HKD',
    );
    expect(printedTotal.total, '780.00');
    expect(printedTotal.currency, 'HKD');
    final noRate = parser.parse(
      base.replaceFirst('Exchange Rate 7.8000 HKD/USD', ''),
      fallbackCurrency: 'HKD',
    );
    expect(noRate.total, isNull);
    expect(noRate.reviewHints, [
      'Some item prices use a different currency from the receipt. Review before applying.',
    ]);
  });

  test('provider-row DCC courtesy footer follows corroborated charge', () {
    // Exact row text captured locally from the checked-in DCC fixture image.
    // No recognized row text is emitted by hosted native acceptance.
    const providerRows = r'''Central Card Terminal
Hong Kong Central
Date: 2026-09-17
Dinner HK$780.00
DCC Selected USD 100.00
CARD CHARGED USD 100.00
Exchange Rate 7.8000 HKD/USD
Thank you''';
    const parser = ReceiptOcrParser();
    final charged = parser.parse(providerRows, fallbackCurrency: 'HKD');
    expect(charged.total, '100.00');
    expect(charged.adjustmentsComplete, isTrue);
    expect(charged.items.single.lineTotal, '780.00');
    expect(charged.items.single.currency, 'HKD');
    expect(charged.reviewHints, [
      'Some item prices use a different currency from the receipt. Review before applying.',
    ]);

    for (final extra in ['Unpriced dessert', 'Thank you']) {
      final unresolved = parser.parse(
        providerRows.replaceFirst(
          'DCC Selected USD 100.00',
          '$extra\nDCC Selected USD 100.00',
        ),
        fallbackCurrency: 'HKD',
      );
      expect(unresolved.total, isNull, reason: extra);
      expect(unresolved.adjustmentsComplete, isFalse, reason: extra);
    }
    for (final changed in [
      providerRows.replaceFirst(
        'Exchange Rate 7.8000 HKD/USD',
        'Exchange Rate 7.7000 HKD/USD',
      ),
      providerRows.replaceFirst(
        'Exchange Rate 7.8000 HKD/USD',
        'Split tender\nExchange Rate 7.8000 HKD/USD',
      ),
      providerRows.replaceFirst(
        'CARD CHARGED USD 100.00',
        'CARD CHARGED USD 100.00\nCARD CHARGED USD 100.00',
      ),
    ]) {
      expect(parser.parse(changed, fallbackCurrency: 'HKD').total, isNull);
    }
  });

  test('printed taxi tip remains a tip charge, not merchandise', () {
    final preview = const ReceiptOcrParser().parse('''
Metro Taxi
Fare USD 24.50
Toll USD 3.00
Tip USD 5.00
Total USD 32.50
''');
    expect(preview.items.map((item) => item.description), ['Fare', 'Toll']);
    expect(preview.tip, '5.00');
    expect(preview.total, '32.50');
  });

  test('unreconciled or duplicate promotions remain in review', () {
    for (final rows in [
      'Store Coupon USD -2.00\nLoyalty Discount USD -1.00',
      'Store Coupon USD -2.00\nStore Coupon USD -1.00',
    ]) {
      final preview = const ReceiptOcrParser().parse('''
Market
Cereal USD 10.00
Subtotal USD 10.00
$rows
Total USD 8.00
''');
      expect(preview.adjustmentsComplete, isFalse);
      expect(preview.reviewHints, isNotEmpty);
    }
  });

  test('foreign tax cannot make repeated discounts look reconciled', () {
    final preview = const ReceiptOcrParser().parse('''
Market
Cereal USD 10.00
Subtotal USD 10.00
Store Coupon USD -2.00
Loyalty Discount USD -1.00
Tax EUR 0.49
Total USD 7.49
''');
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.reviewHints, isNotEmpty);
  });

  test('foreign subtotal and duplicate totals keep promotions in review', () {
    for (final rows in [
      'Subtotal EUR 10.00',
      'Subtotal USD 10.00\nTotal USD 7.00',
    ]) {
      final preview = const ReceiptOcrParser().parse('''
Market
Cereal USD 10.00
$rows
Store Coupon USD -2.00
Loyalty Discount USD -1.00
Total USD 7.00
''');
      expect(preview.adjustmentsComplete, isFalse);
      expect(preview.reviewHints, isNotEmpty);
    }
  });

  test(
    'negative promo code is a discount and positive coupon sale is an item',
    () {
      final preview = const ReceiptOcrParser().parse('''
Market
Headphones USD 120.00
Store Coupon USD 5.00
Promo Code USD -20.00
Total USD 105.00
''');
      expect(preview.discount, '-20.00');
      expect(preview.items.map((item) => item.description), [
        'Headphones',
        'Store Coupon',
      ]);
    },
  );

  test(
    'printed before-subtotal discount reconciles without a false warning',
    () {
      final preview = const ReceiptOcrParser().parse('''
Shop Invoice
Headphones USD 120.00
Promo Code USD -20.00
Subtotal USD 100.00
Shipping USD 9.99
Tax USD 8.80
Grand Total USD 118.79
''');
      expect(preview.items.map((item) => item.description), ['Headphones']);
      expect(preview.discount, '-20.00');
      expect(preview.discountBeforeSubtotal, isTrue);
      expect(preview.reviewHints, isEmpty);

      final afterSubtotal = const ReceiptOcrParser().parse('''
Shop Invoice
Headphones USD 120.00
Subtotal USD 100.00
Promo Code USD -20.00
Shipping USD 9.99
Tax USD 8.80
Grand Total USD 118.79
''');
      expect(afterSubtotal.discountBeforeSubtotal, isFalse);
      expect(afterSubtotal.reviewHints, isNotEmpty);
    },
  );

  test('split tenders and a printed balance stay out of merchandise', () {
    final preview = const ReceiptOcrParser().parse('''
Family Market
Groceries USD 40.00
Total USD 40.00
Paid Cash USD 15.00
Paid Card USD 25.00
Balance USD 0.00
''');
    expect(preview.items.map((item) => item.description), ['Groceries']);
    expect(preview.total, '40.00');
  });

  test('a foreign balance cannot set a symbol-only transaction currency', () {
    final preview = const ReceiptOcrParser().parse('''
Store
Groceries \$10.00
Total \$10.00
Balance EUR 0.00
''');
    expect(preview.currency, isNot('EUR'));
    expect(preview.warnings, isNotEmpty);
  });

  test('a paid deposit is payment evidence and remains under review', () {
    final preview = const ReceiptOcrParser().parse('''
Hotel
Room Night 09/15 USD 180.00
Room Night 09/16 USD 180.00
City Tax USD 18.00
Tourism Fee USD 10.00
Subtotal USD 388.00
Deposit Paid USD -100.00
Amount Due USD 288.00
''');
    expect(preview.items.map((item) => item.description), [
      'Room Night 09/15',
      'Room Night 09/16',
    ]);
    expect(preview.tax, '18.00');
    expect(preview.subtotal, '388.00');
    expect(preview.discount, isNull);
    expect(preview.reviewHints, isNotEmpty);
  });

  test('role words inside priced product names remain items', () {
    final preview = const ReceiptOcrParser().parse('''
Store
Balance Board USD 19.99
Tourism Fee Package USD 12.00
Deposit Paid Pass USD 5.00
Total USD 36.99
''');
    expect(preview.items.map((item) => item.description), [
      'Balance Board',
      'Tourism Fee Package',
      'Deposit Paid Pass',
    ]);
  });

  test('postal and registration headers do not become merchandise', () {
    const parser = ReceiptOcrParser();
    final us = parser.parse('''
Pike Street Deli
Seattle WA 98101
Sales Tax applies
Sandwich \$12.50
Coffee \$4.00
Subtotal \$16.50
Sales Tax \$1.70
Total \$18.20
''');
    final australia = parser.parse('''
Harbour Bakery
Sydney NSW 2000
ABN 12 345 678 901
Flat White \$5.50
Toastie \$13.00
Subtotal \$18.50
GST \$1.68
Total \$20.18
''');
    final singapore = parser.parse('''
Orchard Kopi
Orchard Road, Singapore 238801
GST Reg M2-1234567-8
Kopi \$2.20
Toast Set \$6.80
Subtotal \$9.00
GST \$0.81
Total \$9.81
''');
    expect(us.items.map((item) => item.description), ['Sandwich', 'Coffee']);
    expect(us.tax, '1.70');
    expect(us.adjustmentsComplete, isTrue);
    expect(us.reviewHints, isEmpty);
    expect(
      us.warnings,
      isNot(
        contains(
          'Some OCR lines need manual review because no traceable line amount was found.',
        ),
      ),
    );
    expect(australia.items.map((item) => item.description), [
      'Flat White',
      'Toastie',
    ]);
    expect(australia.tax, '1.68');
    expect(singapore.items.map((item) => item.description), [
      'Kopi',
      'Toast Set',
    ]);
    expect(singapore.tax, '0.81');
    expect(singapore.adjustmentsComplete, isTrue);
    expect(singapore.reviewHints, isEmpty);
    final mexico = parser.parse('''
Mercado Centro
Ciudad de México, CDMX
IVA incluido
Tacos \$90.00
Agua \$35.00
Subtotal \$125.00
IVA \$20.00
Total \$145.00
''');
    expect(mexico.items.map((item) => item.description), ['Tacos', 'Agua']);
    expect(mexico.tax, '20.00');
  });

  test('priced products with region-shaped codes remain editable items', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Corner Shop
Widget Pro AB 12345 19.99
Widget CA 12345 12.00
Total 31.99
''');

    expect(preview.items.map((item) => item.description), [
      'Widget Pro AB 12345',
      'Widget CA 12345',
    ]);
    expect(preview.items.map((item) => item.lineTotal), ['19.99', '12.00']);
  });

  test('image-transcribed location headers do not require item review', () {
    // These rows are transcribed from the repository fixture images, not from
    // Android/iOS provider output. Native OCR may split or change these rows.
    const parser = ReceiptOcrParser();
    final receipts = <({String text, String currency, List<String> items})>[
      (
        text: r'''Pike Street Deli
Seattle, WA 98101
Sales Tax applies
Fecha/Date: 2026-09-17
Sandwich $12.50
Coffee $4.00
Subtotal $16.50
Sales Tax $1.70
Total $18.20
Thank you / Gracias / 多謝''',
        currency: 'USD',
        items: ['Sandwich', 'Coffee'],
      ),
      (
        text: r'''Mercado Centro
Ciudad de México, CDMX
IVA incluido
Fecha/Date: 2026-09-17
Tacos $90.00
Agua $35.00
Subtotal $125.00
IVA $20.00
Total $145.00
Thank you / Gracias / 多謝''',
        currency: 'MXN',
        items: ['Tacos', 'Agua'],
      ),
    ];
    for (final receipt in receipts) {
      final preview = parser.parse(receipt.text);
      expect(preview.items.map((item) => item.description), receipt.items);
      expect(preview.currency, receipt.currency);
      expect(preview.adjustmentsComplete, isTrue, reason: receipt.text);
      expect(preview.reviewHints, isEmpty, reason: receipt.text);
    }

    final genuineUnpricedItem = parser.parse(r'''Pike Street Deli
Seattle, WA 98101
Sales Tax applies
Sandwich $12.50
Coffee $4.00
Unpriced dessert
Subtotal $16.50
Sales Tax $1.70
Total $18.20''');
    expect(genuineUnpricedItem.reviewHints, isNotEmpty);
    for (final size in ['XL', 'XXL']) {
      final unpricedSize = parser.parse('''Corner Cafe
Latte, $size
Sales Tax applies
Coffee 4.00
Sales Tax 0.40
Total 4.40''');
      expect(unpricedSize.reviewHints, isNotEmpty, reason: size);
    }
  });

  test(
    'image-transcribed grocery footer after tender and date stays bounded',
    () {
      // Source-image transcription only; this is not a captured provider row set.
      const imageText = '''FreshMart
Good Food. Brighter Days.
456 Oak Avenue
Pinecrest, NY 10077
(555) 987-6543
Bananas 1.25
Organic Milk 3.49
Whole Grain Bread 2.99
Large Eggs 3.29
Spring Mix 2.50
SUBTOTAL 13.52
SALES TAX (7.00%) 0.95
TOTAL 14.47
Visa 1111 14.47
04/12/2025 10:23 AM
Thank you for shopping local!''';
      final preview = const ReceiptOcrParser().parse(
        imageText,
        fallbackCurrency: 'USD',
      );
      expect(preview.items.map((item) => item.description), [
        'Bananas',
        'Organic Milk',
        'Whole Grain Bread',
        'Large Eggs',
        'Spring Mix',
      ]);
      // The source-image slogan remains unresolved without provider row/layout
      // evidence; the footer rule must not silently clear that warning.
      expect(preview.adjustmentsComplete, isFalse);
      expect(
        preview.incompleteAdjustmentReasons,
        contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
      );
      final withoutSlogan = const ReceiptOcrParser().parse(
        imageText.replaceFirst('Good Food. Brighter Days.\n', ''),
        fallbackCurrency: 'USD',
      );
      expect(withoutSlogan.adjustmentsComplete, isTrue);
      expect(withoutSlogan.reviewHints, isEmpty);
      final unpricedHeaderProduct = const ReceiptOcrParser().parse('''Market
Chocolate Cookie. Family Size
456 Oak Avenue
Coffee 4.00
Sales Tax 0.40
Total 4.40''');
      expect(unpricedHeaderProduct.reviewHints, isNotEmpty);
    },
  );

  test('charge table uses its columns despite neighboring panel text', () {
    final preview = const ReceiptOcrParser().parse(
      'Harbor Utility\n'
      'Description Therms Rate Amount Important Messages\n'
      'Customer Charge - USD 15.00 USD 15.00 Save energy\n'
      'Delivery Charge 76 therms 0.4120/therm USD 31.31 Go paperless\n'
      'State Gas Tax 76 USD 0.0280 USD 2.13 Budget reminder\n'
      'Total Current Charges USD 48.44',
      blocks: [
        _layoutBlock('Harbor Utility', 0, 0, 20, 350),
        _layoutBlock('Description', 1, 1, 20, 150),
        _layoutBlock('Therms', 2, 1, 170, 210),
        _layoutBlock('Rate', 3, 1, 230, 270),
        _layoutBlock('Amount', 4, 1, 310, 350),
        _layoutBlock('Important Messages', 5, 1, 500, 700),
        _layoutBlock('Customer Charge', 6, 2, 20, 160),
        _layoutBlock('-', 7, 2, 170, 210),
        _layoutBlock('USD 15.00', 8, 2, 230, 270),
        _layoutBlock('USD 15.00', 9, 2, 310, 350),
        _layoutBlock('Save energy', 10, 2, 500, 700),
        _layoutBlock('Delivery Charge', 11, 3, 20, 160),
        _layoutBlock('76 therms', 12, 3, 170, 210),
        _layoutBlock('0.4120/therm', 13, 3, 230, 270),
        // A wider recognized amount cell can start left of the header edge.
        _layoutBlock('USD 31.31', 14, 3, 285, 350),
        _layoutBlock('Go paperless', 15, 3, 500, 700),
        _layoutBlock('State Gas Tax', 16, 4, 20, 160),
        _layoutBlock('76', 17, 4, 170, 210),
        _layoutBlock('USD 0.0280', 18, 4, 230, 270),
        _layoutBlock('USD 2.13', 19, 4, 310, 350),
        _layoutBlock('Budget reminder', 20, 4, 500, 700),
        _layoutBlock('Total Current Charges USD 48.44', 21, 5, 20, 350),
      ],
    );
    expect(preview.items.map((item) => item.description), [
      'Customer Charge',
      'Delivery Charge',
      'State Gas Tax',
    ]);
    expect(preview.items.map((item) => item.lineTotal), [
      '15.00',
      '31.31',
      '2.13',
    ]);
    expect(preview.shipping, isNull);
    expect(preview.tax, isNull);
  });

  test('invoice columns keep product names separate from codes and prices', () {
    final preview = const ReceiptOcrParser().parse(
      'Warehouse\n'
      'Product / Service SKU Qty Unit Price Total\n'
      'Ergonomic Chair EP-1001 1 USD 199.99 USD 199.99\n'
      'Desk Mat DM-100 1 USD 19.99 USD 19.99\n'
      'Subtotal USD 219.98\nTax USD 0.02\nTotal USD 220.00',
      blocks: [
        _layoutBlock('Warehouse', 0, 0, 20, 350),
        _layoutBlock('Product / Service', 1, 1, 90, 300),
        _layoutBlock('SKU', 2, 1, 520, 600),
        _layoutBlock('Qty', 3, 1, 620, 650),
        _layoutBlock('Unit Price', 4, 1, 680, 790),
        _layoutBlock('Total', 5, 1, 850, 960),
        _layoutBlock('Ergonomic Chair', 6, 2, 90, 420),
        _layoutBlock('EP-1001', 7, 2, 520, 600),
        _layoutBlock('1', 8, 2, 620, 650),
        _layoutBlock('USD 199.99', 9, 2, 680, 790),
        _layoutBlock('USD 199.99', 10, 2, 850, 960),
        _layoutBlock('Desk Mat', 11, 3, 90, 420),
        _layoutBlock('DM-100', 12, 3, 520, 600),
        _layoutBlock('1', 13, 3, 620, 650),
        _layoutBlock('USD 19.99', 14, 3, 680, 790),
        _layoutBlock('USD 19.99', 15, 3, 850, 960),
        _layoutBlock('Subtotal USD 219.98', 16, 4, 680, 960),
        _layoutBlock('Tax USD 0.02', 17, 5, 680, 960),
        _layoutBlock('Total USD 220.00', 18, 6, 680, 960),
      ],
    );
    expect(preview.items.map((item) => item.description), [
      'Ergonomic Chair',
      'Desk Mat',
    ]);
    expect(preview.items.map((item) => item.lineTotal), ['199.99', '19.99']);
    expect(preview.reviewHints, isEmpty);
  });

  test('country-named unpriced products remain unresolved inside a table', () {
    final rows = <List<({String text, double left, double right})>>[
      [(text: 'Harbor Market', left: 20, right: 370)],
      [(text: 'Bill To: Alex Chen', left: 20, right: 250)],
      [
        (text: 'Product / Service', left: 90, right: 300),
        (text: 'SKU', left: 520, right: 600),
        (text: 'Qty', left: 620, right: 650),
        (text: 'Unit Price', left: 680, right: 790),
        (text: 'Total', left: 850, right: 960),
      ],
      [
        (text: 'Bread', left: 90, right: 300),
        (text: 'BR-100', left: 520, right: 600),
        (text: '1', left: 620, right: 650),
        (text: 'USD 10.00', left: 680, right: 790),
        (text: 'USD 10.00', left: 850, right: 960),
      ],
      [(text: 'Turkey', left: 90, right: 300)],
      [(text: 'Subtotal USD 10.00', left: 680, right: 960)],
      [(text: 'Total USD 10.00', left: 680, right: 960)],
    ];
    var order = 0;
    final preview = const ReceiptOcrParser().parse(
      rows.map((row) => row.map((cell) => cell.text).join(' ')).join('\n'),
      blocks: [
        for (var row = 0; row < rows.length; row++)
          for (final cell in rows[row])
            _layoutBlock(cell.text, order++, row, cell.left, cell.right),
      ],
    );
    expect(preview.items.single.description, 'Bread');
    expect(preview.items.single.lineTotal, '10.00');
    expect(preview.blocks.any((block) => block.text == 'Turkey'), isTrue);
    expect(
      preview.incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
    );
    expect(preview.reviewHints, isNotEmpty);
  });

  test('invoice table bounds customer copy and confirmed payment footer', () {
    ReceiptOcrPreview parse({
      bool unresolvedTableLine = false,
      bool unresolvedBuyerIntervalLine = false,
      bool unresolvedPairedBuyerIntervalLine = false,
      bool unresolvedFooterLine = false,
      bool mergedFooterItemLine = false,
      bool mergedCourtesyItemLine = false,
      bool populatedPaymentStatus = false,
      String? merchantTeamName,
      bool merchantTeamPunctuation = false,
      bool mergedTeamItemLine = false,
      bool singleColumnBuyer = false,
      bool inlineBuyerName = false,
      bool firstBuyerLineIsItem = false,
      bool distinctBuyerNames = false,
      bool singleBuyerCountry = false,
      bool singleBuyerStreet = false,
      bool distinctBuyerCountries = false,
      String buyerCountry = 'United States',
      bool pairedBuyerStreet = true,
      bool buyerEmailMatchesItems = false,
      bool swapBuyerEmailColumns = false,
      bool taggedBuyerEmail = false,
      bool missingBuyerHeadingPoints = false,
      bool buyerHeading = true,
    }) {
      final rows = <List<({String text, double left, double right})>>[
        [(text: 'BrightDesk Supplies', left: 20, right: 370)],
        [(text: 'Office Supply Invoice', left: 20, right: 370)],
        [
          (
            text: buyerHeading
                ? inlineBuyerName
                      ? 'Bill To: Alex Chen'
                      : 'Bill To'
                : 'Order Summary',
            left: 20,
            right: 150,
          ),
          if (!singleColumnBuyer && !inlineBuyerName)
            (text: 'Ship To', left: 510, right: 640),
        ],
        [
          (
            text: firstBuyerLineIsItem ? 'Warranty Extension' : 'Alex Chen',
            left: 20,
            right: 170,
          ),
          if (!singleColumnBuyer && !inlineBuyerName)
            (
              text: firstBuyerLineIsItem
                  ? 'Extra Cable'
                  : distinctBuyerNames
                  ? 'Morgan Lee'
                  : 'Alex Chen',
              left: 510,
              right: 660,
            ),
        ],
        if (!singleColumnBuyer && !inlineBuyerName && pairedBuyerStreet)
          [
            (text: '123 Main Street', left: 20, right: 210),
            (text: '123 Main Street', left: 510, right: 700),
          ],
        if (unresolvedPairedBuyerIntervalLine)
          [
            (text: 'Warranty Extension', left: 20, right: 200),
            (text: 'Extra Cable', left: 510, right: 660),
          ],
        if (!singleColumnBuyer && !inlineBuyerName)
          [
            (text: 'United States', left: 20, right: 190),
            (
              text: distinctBuyerCountries ? 'Canada' : 'United States',
              left: 510,
              right: 680,
            ),
          ],
        if (singleColumnBuyer && singleBuyerStreet)
          [(text: '123 Main Street', left: 20, right: 210)],
        if (singleColumnBuyer && singleBuyerCountry)
          [(text: buyerCountry, left: 20, right: 190)],
        if (!singleColumnBuyer && !inlineBuyerName)
          [
            (
              text: buyerEmailMatchesItems
                  ? swapBuyerEmailColumns
                        ? 'extra.cable@example.com'
                        : 'warranty.extension@example.com'
                  : taggedBuyerEmail
                  ? 'alex.chen+invoices@example.com'
                  : 'alex.chen@example.com',
              left: 20,
              right: 300,
            ),
            if (distinctBuyerNames ||
                distinctBuyerCountries ||
                buyerEmailMatchesItems)
              (
                text: buyerEmailMatchesItems
                    ? swapBuyerEmailColumns
                          ? 'warranty.extension@example.com'
                          : 'extra.cable@example.com'
                    : taggedBuyerEmail
                    ? distinctBuyerNames
                          ? 'morgan.lee+shipping@example.com'
                          : 'alex.chen+shipping@example.com'
                    : distinctBuyerCountries
                    ? 'alex.chen@example.com'
                    : 'morgan.lee@example.com',
                left: 510,
                right: 790,
              ),
          ],
        if (unresolvedBuyerIntervalLine)
          [(text: 'Warranty Extension', left: 90, right: 420)],
        [
          (text: 'Product / Service', left: 90, right: 300),
          (text: 'SKU', left: 520, right: 600),
          (text: 'Qty', left: 620, right: 650),
          (text: 'Unit Price', left: 680, right: 790),
          (text: 'Total', left: 850, right: 960),
        ],
        [
          (text: 'Desk Chair', left: 90, right: 420),
          (text: 'DC-100', left: 520, right: 600),
          (text: '1', left: 620, right: 650),
          (text: 'USD 10.00', left: 680, right: 790),
          (text: 'USD 10.00', left: 850, right: 960),
        ],
        [
          (text: 'Desk Mat', left: 90, right: 420),
          (text: 'DM-100', left: 520, right: 600),
          (text: '1', left: 620, right: 650),
          (text: 'USD 5.00', left: 680, right: 790),
          (text: 'USD 5.00', left: 850, right: 960),
        ],
        if (unresolvedTableLine)
          [(text: 'Unpriced Cable', left: 90, right: 420)],
        [(text: 'Subtotal USD 15.00', left: 680, right: 960)],
        [(text: 'Tax USD 0.75', left: 680, right: 960)],
        [(text: 'Total USD 15.75', left: 680, right: 960)],
        [
          (
            text: mergedFooterItemLine
                ? 'Payment Confirmed Unpriced Cable'
                : 'Payment Confirmed',
            left: 20,
            right: 400,
          ),
        ],
        if (unresolvedFooterLine)
          [(text: 'Unpriced Cable', left: 90, right: 420)],
        [
          (
            text: mergedCourtesyItemLine
                ? 'Thank you for your order! Unpriced Cable'
                : 'Thank you for your order! Your payment is complete.',
            left: 20,
            right: 700,
          ),
        ],
        [
          (
            text: populatedPaymentStatus
                ? 'Payment Status: Paid'
                : 'Payment Status: Payment Method:',
            left: 20,
            right: 550,
          ),
        ],
        [(text: 'Need Help? Thank you!', left: 20, right: 500)],
        [
          (
            text: mergedTeamItemLine
                ? "We're here to help! The Unpriced Cable Team"
                : merchantTeamName != null
                ? "We're here to help! The $merchantTeamName Team${merchantTeamPunctuation ? '.' : ''}"
                : "We're here to help!",
            left: 20,
            right: 400,
          ),
        ],
      ];
      var order = 0;
      final blocks = <ReceiptOcrBlockEvidence>[
        for (var row = 0; row < rows.length; row++)
          for (final cell in rows[row])
            if (missingBuyerHeadingPoints && row == 2)
              ReceiptOcrBlockEvidence(
                text: cell.text,
                order: order++,
                row: row,
                points: const [],
              )
            else
              _layoutBlock(cell.text, order++, row, cell.left, cell.right),
      ];
      return const ReceiptOcrParser().parse(
        rows.map((row) => row.map((cell) => cell.text).join(' ')).join('\n'),
        fallbackCurrency: 'USD',
        blocks: blocks,
      );
    }

    final complete = parse();
    expect(complete.items.map((item) => item.lineTotal), ['10.00', '5.00']);
    expect(complete.reviewHints, isEmpty);
    expect(
      parse(singleColumnBuyer: true).incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
    );
    final singleBuyerAmbiguity = parse(singleColumnBuyer: true).reviewHints;
    expect(
      parse(singleColumnBuyer: true, singleBuyerCountry: true).reviewHints,
      singleBuyerAmbiguity,
    );
    expect(
      parse(
        singleColumnBuyer: true,
        singleBuyerStreet: true,
        singleBuyerCountry: true,
      ).reviewHints,
      singleBuyerAmbiguity,
    );
    for (final country in ['Germany', 'France', 'India']) {
      expect(
        parse(
          singleColumnBuyer: true,
          singleBuyerCountry: true,
          buyerCountry: country,
        ).reviewHints,
        singleBuyerAmbiguity,
      );
    }
    expect(
      parse(
        singleColumnBuyer: true,
        firstBuyerLineIsItem: true,
      ).incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
    );
    expect(
      parse(
        singleColumnBuyer: true,
        firstBuyerLineIsItem: true,
        singleBuyerCountry: true,
        buyerCountry: 'Germany',
      ).incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
    );
    expect(
      parse(
        singleColumnBuyer: true,
        singleBuyerStreet: true,
        singleBuyerCountry: true,
        missingBuyerHeadingPoints: true,
      ).incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
    );
    expect(
      parse(
        singleColumnBuyer: true,
        singleBuyerCountry: true,
        unresolvedBuyerIntervalLine: true,
      ).incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
    );
    expect(parse(distinctBuyerCountries: true).reviewHints, isEmpty);
    final distinctBuyer = parse(distinctBuyerNames: true);
    expect(distinctBuyer.reviewHints, isEmpty);
    expect(parse(taggedBuyerEmail: true).reviewHints, isEmpty);
    expect(
      parse(distinctBuyerNames: true, taggedBuyerEmail: true).reviewHints,
      isEmpty,
    );
    expect(
      parse(firstBuyerLineIsItem: true).incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
    );
    expect(
      parse(
        firstBuyerLineIsItem: true,
        buyerEmailMatchesItems: true,
        pairedBuyerStreet: false,
      ).incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
    );
    expect(
      parse(
        firstBuyerLineIsItem: true,
        buyerEmailMatchesItems: true,
        swapBuyerEmailColumns: true,
      ).incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
    );
    expect(distinctBuyer.merchant, isNot('Alex Chen Morgan Lee'));
    final inlineBuyerItem = parse(
      inlineBuyerName: true,
      firstBuyerLineIsItem: true,
    );
    expect(inlineBuyerItem.merchant, isNot('Warranty Extension'));
    expect(
      inlineBuyerItem.incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
    );
    expect(
      parse(
        singleColumnBuyer: true,
        unresolvedBuyerIntervalLine: true,
      ).incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
    );

    expect(
      parse(populatedPaymentStatus: true).reviewHints,
      complete.reviewHints,
    );
    final team = parse(merchantTeamName: complete.merchant);
    expect(team.reviewHints, complete.reviewHints);
    expect(
      parse(
        merchantTeamName: complete.merchant,
        merchantTeamPunctuation: true,
      ).reviewHints,
      complete.reviewHints,
    );

    final unresolved = parse(unresolvedTableLine: true);
    expect(unresolved.reviewHints, isNotEmpty);
    expect(
      unresolved.incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
    );

    final unresolvedBuyerInterval = parse(unresolvedBuyerIntervalLine: true);
    expect(
      unresolvedBuyerInterval.incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
    );
    final unresolvedPairedBuyerInterval = parse(
      unresolvedPairedBuyerIntervalLine: true,
    );
    expect(
      unresolvedPairedBuyerInterval.incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
    );

    final withoutBuyerBoundary = parse(buyerHeading: false);
    expect(withoutBuyerBoundary.reviewHints, isNotEmpty);

    final unresolvedFooter = parse(unresolvedFooterLine: true);
    expect(
      unresolvedFooter.incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
    );

    for (final merged in [
      parse(mergedFooterItemLine: true),
      parse(mergedCourtesyItemLine: true),
      parse(mergedTeamItemLine: true),
    ]) {
      expect(
        merged.incompleteAdjustmentReasons,
        contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
      );
    }
  });

  test('payment confirmation alone does not hide an unpriced item', () {
    final preview = const ReceiptOcrParser().parse('''
Store
Milk USD 5.00
Total USD 5.00
Payment Confirmed
Warranty Extension''');
    expect(
      preview.incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
    );
  });

  test('missing invoice total cell cannot promote a unit price', () {
    final preview = const ReceiptOcrParser().parse(
      'Warehouse\nProduct / Service SKU Qty Unit Price Total\n'
      'Ergonomic Chair EP-1001 1 USD 199.99\n'
      'Total USD 199.99',
      blocks: [
        _layoutBlock('Warehouse', 0, 0, 20, 350),
        _layoutBlock('Product / Service', 1, 1, 90, 300),
        _layoutBlock('SKU', 2, 1, 520, 600),
        _layoutBlock('Qty', 3, 1, 620, 650),
        _layoutBlock('Unit Price', 4, 1, 680, 790),
        _layoutBlock('Total', 5, 1, 850, 960),
        _layoutBlock('Ergonomic Chair', 6, 2, 90, 420),
        _layoutBlock('EP-1001', 7, 2, 520, 600),
        _layoutBlock('1', 8, 2, 620, 650),
        _layoutBlock('USD 199.99', 9, 2, 680, 790),
        _layoutBlock('Total USD 199.99', 10, 3, 680, 960),
      ],
    );
    expect(preview.items, isEmpty);
    expect(preview.reviewHints, isNotEmpty);
  });

  test(
    'bill charge detail classifies dated discounts and taxes by column role',
    () {
      final preview = const ReceiptOcrParser().parse(
        'Network Utility\nCurrent Charges Detail\n'
        'Description Service Period Amount\n'
        'Internet Plan Feb 5 - Mar 4 USD 59.99\n'
        'Loyalty Discount Feb 5 - Mar 4 USD -10.00\n'
        'State Tax Feb 5 - Mar 4 USD 4.31\n'
        'Total Current Charges USD 54.30',
        blocks: [
          _layoutBlock('Network Utility', 0, 0, 20, 350),
          _layoutBlock('Current Charges Detail', 1, 1, 20, 350),
          _layoutBlock('Description', 2, 2, 20, 300),
          _layoutBlock('Service Period', 3, 2, 370, 550),
          _layoutBlock('Amount', 4, 2, 600, 700),
          _layoutBlock('Internet Plan', 5, 3, 20, 300),
          _layoutBlock('Feb 5 - Mar 4', 6, 3, 370, 550),
          _layoutBlock('USD 59.99', 7, 3, 600, 700),
          _layoutBlock('Loyalty Discount', 8, 4, 20, 300),
          _layoutBlock('Feb 5 - Mar 4', 9, 4, 370, 550),
          _layoutBlock('USD -10.00', 10, 4, 600, 700),
          _layoutBlock('State Tax', 11, 5, 20, 300),
          _layoutBlock('Feb 5 - Mar 4', 12, 5, 370, 550),
          _layoutBlock('USD 4.31', 13, 5, 600, 700),
          _layoutBlock('Total Current Charges USD 54.30', 14, 6, 20, 700),
        ],
      );
      expect(preview.items.map((item) => item.description), ['Internet Plan']);
      expect(preview.items.map((item) => item.lineTotal), ['59.99']);
      expect(preview.discount, '-10.00');
      expect(preview.tax, '4.31');
      expect(preview.reviewHints, isEmpty);
    },
  );

  test('two-column bill detail keeps rate evidence in description', () {
    final preview = const ReceiptOcrParser().parse(
      'Water Utility\nCharges for This Period\nDescription Amount\n'
      'Water Charge (25 m3 @ USD 1.80) USD 45.00\n'
      'State Water Tax (2.5%) USD 2.64\n'
      'Total Amount Due USD 47.64',
      blocks: [
        _layoutBlock('Water Utility', 0, 0, 20, 350),
        _layoutBlock('Charges for This Period', 1, 1, 20, 350),
        _layoutBlock('Description', 2, 2, 20, 300),
        _layoutBlock('Amount', 3, 2, 600, 700),
        _layoutBlock('Water Charge (25 m3 @ USD 1.80)', 4, 3, 20, 550),
        _layoutBlock('USD 45.00', 5, 3, 600, 700),
        _layoutBlock('State Water Tax (2.5%)', 6, 4, 20, 550),
        _layoutBlock('USD 2.64', 7, 4, 600, 700),
        _layoutBlock('Total Amount Due USD 47.64', 8, 5, 20, 700),
      ],
    );
    expect(preview.items.map((item) => item.description), [
      'Water Charge (25 m3 @ USD 1.80)',
    ]);
    expect(preview.items.map((item) => item.lineTotal), ['45.00']);
    expect(preview.tax, '2.64');
    expect(
      preview.adjustmentsComplete,
      isTrue,
      reason: preview.incompleteAdjustmentReasons.toString(),
    );
    expect(preview.reviewHints, isEmpty);
  });

  test('service usage rate amount table selects only final charge cells', () {
    final preview = const ReceiptOcrParser().parse(
      'Municipal Utility\nCurrent Charges Detail\n'
      'Service Usage Rate Amount\n'
      'Electricity 620 kWh USD 0.1580/kWh USD 97.96\n'
      'Water 9,000 gallons USD 0.0055/gallon USD 49.50\n'
      'Wastewater Service 9,000 gallons USD 0.0038/gallon USD 34.20\n'
      'Subtotal USD 181.66\nCity Utilities Tax USD 9.08\n'
      'State Energy Surcharge USD 2.73\n'
      'Total Current Charges USD 193.47\n'
      'Account Credit USD -31.00\nTotal Amount Due USD 162.47',
      blocks: [
        _layoutBlock('Municipal Utility', 0, 0, 20, 350),
        _layoutBlock('Current Charges Detail', 1, 1, 20, 700),
        _layoutBlock('Service', 2, 2, 20, 250),
        _layoutBlock('Usage', 3, 2, 280, 400),
        _layoutBlock('Rate', 4, 2, 430, 560),
        _layoutBlock('Amount', 5, 2, 600, 700),
        _layoutBlock('Electricity', 6, 3, 20, 250),
        _layoutBlock('620 kWh', 7, 3, 280, 400),
        _layoutBlock('USD 0.1580/kWh', 8, 3, 430, 560),
        _layoutBlock('USD 97.96', 9, 3, 600, 700),
        _layoutBlock('Water', 10, 4, 20, 250),
        _layoutBlock('9,000 gallons', 11, 4, 280, 400),
        _layoutBlock('USD 0.0055/gallon', 12, 4, 430, 560),
        _layoutBlock('USD 49.50', 13, 4, 600, 700),
        _layoutBlock('Wastewater Service', 14, 5, 20, 250),
        _layoutBlock('9,000 gallons', 15, 5, 280, 400),
        _layoutBlock('USD 0.0038/gallon', 16, 5, 430, 560),
        _layoutBlock('USD 34.20', 17, 5, 600, 700),
        _layoutBlock('Subtotal USD 181.66', 18, 6, 20, 700),
        _layoutBlock('City Utilities Tax USD 9.08', 19, 7, 20, 700),
        _layoutBlock('State Energy Surcharge USD 2.73', 20, 8, 20, 700),
        _layoutBlock('Total Current Charges USD 193.47', 21, 9, 20, 700),
        _layoutBlock('Account Credit USD -31.00', 22, 10, 20, 700),
        _layoutBlock('Total Amount Due USD 162.47', 23, 11, 20, 700),
      ],
    );
    expect(preview.items.map((item) => item.description), [
      'Electricity',
      'Water',
      'Wastewater Service',
    ]);
    expect(preview.items.map((item) => item.lineTotal), [
      '97.96',
      '49.50',
      '34.20',
    ]);

    final missingAmount = const ReceiptOcrParser().parse(
      'Municipal Utility\nCurrent Charges Detail\n'
      'Service Usage Rate Amount\nElectricity 620 kWh USD 0.1580/kWh\n'
      'Total Amount Due USD 97.96',
      blocks: [
        _layoutBlock('Municipal Utility', 0, 0, 20, 350),
        _layoutBlock('Current Charges Detail', 1, 1, 20, 700),
        _layoutBlock('Service', 2, 2, 20, 250),
        _layoutBlock('Usage', 3, 2, 280, 400),
        _layoutBlock('Rate', 4, 2, 430, 560),
        _layoutBlock('Amount', 5, 2, 600, 700),
        _layoutBlock('Electricity', 6, 3, 20, 250),
        _layoutBlock('620 kWh', 7, 3, 280, 400),
        _layoutBlock('USD 0.1580/kWh', 8, 3, 430, 560),
        _layoutBlock('Total Amount Due USD 97.96', 9, 4, 20, 700),
      ],
    );
    expect(missingAmount.items, isEmpty);
    expect(missingAmount.reviewHints, isNotEmpty);
  });

  test('a second charge table after subtotal keeps its classified rows', () {
    final preview = const ReceiptOcrParser().parse(
      'Utility\nBase Item USD 10.00\nSubtotal USD 10.00\n'
      'Description Usage Rate Amount\n'
      'Energy Surcharge 2 kWh USD 0.50 USD 1.00\nTotal USD 11.00',
    );
    expect(
      preview.items.any(
        (item) =>
            item.description.contains('Energy Surcharge') &&
            item.lineTotal == '1.00',
      ),
      isTrue,
    );
  });

  test('priced tax-named service after subtotal remains an item', () {
    final preview = const ReceiptOcrParser().parse(
      'Services\nBase Filing USD 10.00\nSubtotal USD 10.00\n'
      'Tax Preparation Service USD 20.00\nTotal USD 30.00',
    );
    expect(
      preview.items.any(
        (item) =>
            item.description == 'Tax Preparation Service' &&
            item.lineTotal == '20.00',
      ),
      isTrue,
    );
  });

  test('two-column bill keeps a numbered product name', () {
    final preview = const ReceiptOcrParser().parse(
      'Network Utility\nCurrent Charges Detail\nDescription Amount\n'
      'Internet Plan 500 USD 5.00\nTotal Current Charges USD 5.00',
      blocks: [
        _layoutBlock('Network Utility', 0, 0, 20, 350),
        _layoutBlock('Current Charges Detail', 1, 1, 20, 350),
        _layoutBlock('Description', 2, 2, 20, 300),
        _layoutBlock('Amount', 3, 2, 600, 700),
        _layoutBlock('Internet Plan 500', 4, 3, 20, 550),
        _layoutBlock('USD 5.00', 5, 3, 600, 700),
        _layoutBlock('Total Current Charges USD 5.00', 6, 4, 20, 700),
      ],
    );
    expect(preview.items.single.description, 'Internet Plan 500');
    expect(preview.items.single.lineTotal, '5.00');
  });

  test(
    'bill detail fee stays review evidence while priced products survive',
    () {
      final preview = const ReceiptOcrParser().parse(
        'Utility\nCurrent Charges Detail\nDescription Amount\n'
        'Tax Return Kit USD 10.00\nRegulatory Recovery Fee USD 2.00\n'
        'Total Current Charges USD 12.00',
        blocks: [
          _layoutBlock('Utility', 0, 0, 20, 350),
          _layoutBlock('Current Charges Detail', 1, 1, 20, 350),
          _layoutBlock('Description', 2, 2, 20, 300),
          _layoutBlock('Amount', 3, 2, 600, 700),
          _layoutBlock('Tax Return Kit', 4, 3, 20, 300),
          _layoutBlock('USD 10.00', 5, 3, 600, 700),
          _layoutBlock('Regulatory Recovery Fee', 6, 4, 20, 300),
          _layoutBlock('USD 2.00', 7, 4, 600, 700),
          _layoutBlock('Total Current Charges USD 12.00', 8, 5, 20, 700),
        ],
      );
      expect(preview.items.map((item) => item.description), ['Tax Return Kit']);
      expect(preview.reviewHints, isNotEmpty);
    },
  );

  test('missing adjustment amount cell cannot promote a printed rate', () {
    final preview = const ReceiptOcrParser().parse(
      'Utility\nCurrent Charges Detail\nDescription Rate Amount\n'
      'Sales Tax USD 0.15\nTotal Current Charges USD 12.00',
      blocks: [
        _layoutBlock('Utility', 0, 0, 20, 350),
        _layoutBlock('Current Charges Detail', 1, 1, 20, 350),
        _layoutBlock('Description', 2, 2, 20, 150),
        _layoutBlock('Rate', 3, 2, 230, 270),
        _layoutBlock('Amount', 4, 2, 310, 350),
        _layoutBlock('Sales Tax', 5, 3, 20, 150),
        _layoutBlock('USD 0.15', 6, 3, 230, 270),
        _layoutBlock('Total Current Charges USD 12.00', 7, 4, 20, 350),
      ],
    );
    expect(preview.tax, isNull);
    expect(preview.items, isEmpty);
    expect(preview.reviewHints, isNotEmpty);
  });

  test('bill fees surcharge and account credit remain review evidence', () {
    final preview = const ReceiptOcrParser().parse(
      'Utility\nCurrent Charges Detail\nDescription Amount\n'
      'Water Plan USD 20.00\nService Fee USD 3.00\n'
      'Taxes and Regulatory Fees USD 2.00\n'
      'Energy Surcharge USD 1.00\nTotal Current Charges USD 26.00\n'
      'Account Credit USD -5.00\nAmount Due USD 21.00',
      blocks: [
        _layoutBlock('Utility', 0, 0, 20, 350),
        _layoutBlock('Current Charges Detail', 1, 1, 20, 350),
        _layoutBlock('Description', 2, 2, 20, 300),
        _layoutBlock('Amount', 3, 2, 600, 700),
        _layoutBlock('Water Plan', 4, 3, 20, 300),
        _layoutBlock('USD 20.00', 5, 3, 600, 700),
        _layoutBlock('Service Fee', 6, 4, 20, 300),
        _layoutBlock('USD 3.00', 7, 4, 600, 700),
        _layoutBlock('Taxes and Regulatory Fees', 8, 5, 20, 300),
        _layoutBlock('USD 2.00', 9, 5, 600, 700),
        _layoutBlock('Energy Surcharge', 10, 6, 20, 300),
        _layoutBlock('USD 1.00', 11, 6, 600, 700),
        _layoutBlock('Total Current Charges USD 26.00', 12, 7, 20, 700),
        _layoutBlock('Account Credit USD -5.00', 13, 8, 20, 700),
        _layoutBlock('Amount Due USD 21.00', 14, 9, 20, 700),
      ],
    );
    expect(preview.items.map((item) => item.description), ['Water Plan']);
    expect(preview.service, '3.00');
    expect(preview.tax, isNull);
    expect(preview.discount, isNull);
    expect(preview.reviewHints, isNotEmpty);
  });

  test('missing two-column bill amount cannot promote a printed rate', () {
    final preview = const ReceiptOcrParser().parse(
      'Water Utility\nCharges for This Period\nDescription Amount\n'
      'Water Charge 25 m3 @ USD 1.80\nTotal Amount Due USD 45.00',
      blocks: [
        _layoutBlock('Water Utility', 0, 0, 20, 350),
        _layoutBlock('Charges for This Period', 1, 1, 20, 350),
        _layoutBlock('Description', 2, 2, 20, 300),
        _layoutBlock('Amount', 3, 2, 600, 700),
        _layoutBlock('Water Charge 25 m3 @ USD 1.80', 4, 3, 20, 550),
        _layoutBlock('Total Amount Due USD 45.00', 5, 4, 20, 700),
      ],
    );
    expect(preview.items, isEmpty);
    expect(preview.reviewHints, isNotEmpty);
  });

  test('charge table associates a separate foreign currency cell', () {
    final preview = const ReceiptOcrParser().parse(
      'Market\n'
      'Description Usage Rate Amount\n'
      'Souvenir EUR 9.00\n'
      'Total USD 10.00',
      blocks: [
        _layoutBlock('Market', 0, 0, 20, 350),
        _layoutBlock('Description', 1, 1, 20, 150),
        _layoutBlock('Usage', 2, 1, 170, 210),
        _layoutBlock('Rate', 3, 1, 230, 270),
        _layoutBlock('Amount', 4, 1, 310, 350),
        _layoutBlock('Souvenir', 5, 2, 20, 150),
        _layoutBlock('EUR', 6, 2, 280, 305),
        _layoutBlock('9.00', 7, 2, 310, 350),
        _layoutBlock('Total USD 10.00', 8, 3, 20, 350),
      ],
    );

    expect(preview.currency, 'USD');
    expect(preview.items.single.description, 'Souvenir');
    expect(preview.items.single.currency, 'EUR');
    expect(preview.items.single.lineTotal, '9.00');
    expect(preview.reviewHints, [
      'Some item prices use a different currency from the receipt. Review before applying.',
    ]);
  });

  test('amount-bearing payment summary ends a layout charge table', () {
    final preview = const ReceiptOcrParser().parse(
      'Harbor Utility\nDescription Usage Rate Amount\n'
      'Water Charge USD 12.00\nPayment Summary USD 12.00\n'
      'Remittance USD 12.00',
      blocks: [
        _layoutBlock('Harbor Utility', 0, 0, 20, 350),
        _layoutBlock('Description', 1, 1, 20, 150),
        _layoutBlock('Usage', 2, 1, 170, 210),
        _layoutBlock('Rate', 3, 1, 230, 270),
        _layoutBlock('Amount', 4, 1, 310, 350),
        _layoutBlock('Water Charge', 5, 2, 20, 150),
        _layoutBlock('USD 12.00', 6, 2, 310, 350),
        _layoutBlock('Payment Summary', 7, 3, 20, 150),
        _layoutBlock('USD 12.00', 8, 3, 310, 350),
        _layoutBlock('Remittance', 9, 4, 20, 150),
        _layoutBlock('USD 12.00', 10, 4, 310, 350),
      ],
    );
    expect(preview.items.map((item) => item.description), ['Water Charge']);
  });

  test('payment due footer is a total, not a charge-table item', () {
    final preview = const ReceiptOcrParser().parse(
      'Harbor Utility\nDescription Usage Rate Amount\n'
      'Water Charge USD 12.00\nPayment Due USD 12.00',
      blocks: [
        _layoutBlock('Harbor Utility', 0, 0, 20, 350),
        _layoutBlock('Description', 1, 1, 20, 150),
        _layoutBlock('Usage', 2, 1, 170, 210),
        _layoutBlock('Rate', 3, 1, 230, 270),
        _layoutBlock('Amount', 4, 1, 310, 350),
        _layoutBlock('Water Charge', 5, 2, 20, 150),
        _layoutBlock('USD 12.00', 6, 2, 310, 350),
        _layoutBlock('Payment Due', 7, 3, 20, 150),
        _layoutBlock('USD 12.00', 8, 3, 310, 350),
      ],
    );
    expect(preview.items.map((item) => item.description), ['Water Charge']);
    expect(preview.total, '12.00');
  });

  test('mirrored right-to-left charge columns recover amount cells', () {
    final preview = const ReceiptOcrParser().parse(
      'متجر دبي\nAmount Rate Usage Description\n'
      '12.50 د.إ 0.50 25 قهوة\nTotal 12.50 د.إ',
      blocks: [
        _layoutBlock('متجر دبي', 0, 0, 200, 400, textDirection: 'rtl'),
        _layoutBlock('Amount', 1, 1, 20, 80),
        _layoutBlock('Rate', 2, 1, 120, 165),
        _layoutBlock('Usage', 3, 1, 190, 235),
        _layoutBlock('Description', 4, 1, 300, 400, textDirection: 'rtl'),
        _layoutBlock('12.50 د.إ', 5, 2, 20, 80),
        _layoutBlock('0.50', 6, 2, 120, 165),
        _layoutBlock('25', 7, 2, 190, 235),
        _layoutBlock('قهوة', 8, 2, 300, 400, textDirection: 'rtl'),
        _layoutBlock('Total 12.50 د.إ', 9, 3, 20, 400),
      ],
    );
    expect(preview.items.map((item) => item.description), ['قهوة']);
    expect(preview.items.single.lineTotal, '12.50');
  });

  test('RTL usage placeholder separated by rate keeps charge row', () {
    final preview = const ReceiptOcrParser().parse(
      'متجر دبي\nAmount Rate Usage Description\n'
      '12.50 د.إ 0.50 - قهوة\nTotal 12.50 د.إ',
      blocks: [
        _layoutBlock('متجر دبي', 0, 0, 200, 400, textDirection: 'rtl'),
        _layoutBlock('Amount', 1, 1, 20, 80),
        _layoutBlock('Rate', 2, 1, 120, 165),
        _layoutBlock('Usage', 3, 1, 190, 235),
        _layoutBlock('Description', 4, 1, 300, 400, textDirection: 'rtl'),
        _layoutBlock('12.50 د.إ', 5, 2, 20, 80),
        _layoutBlock('0.50', 6, 2, 120, 165),
        _layoutBlock('-', 7, 2, 190, 235),
        _layoutBlock('قهوة', 8, 2, 300, 400, textDirection: 'rtl'),
        _layoutBlock('Total 12.50 د.إ', 9, 3, 20, 400),
      ],
    );
    expect(preview.items.map((item) => item.description), ['قهوة']);
    expect(preview.items.single.lineTotal, '12.50');
  });

  test('a fuller repeated organization identity outranks its short logo', () {
    final preview = const ReceiptOcrParser().parse('''
Harborline
Water Services
Clean water for everyone
WATER SERVICE BILL
Bill Date: 2026-09-17
Water Charge USD 25.00
Total Amount Due USD 25.00
PAYMENT COUPON
Harborline Loyalty Card
Harborline Water Services
Harborline Water Services Team
''');
    expect(preview.merchant, 'Harborline Water Services');
    expect(preview.items.map((item) => item.description), ['Water Charge']);

    final spacedLogo = const ReceiptOcrParser().parse('''
NimbusShop
M a r k e t p l a c e
INVOICE
NimbusShop Marketplace
Invoice Date: 2026-09-17
Desk Mat USD 19.99
Total USD 19.99
''');
    expect(spacedLogo.merchant, 'NimbusShop Marketplace');
  });

  test(
    'split logo before a document title needs repeated identity evidence',
    () {
      final corroborated = const ReceiptOcrParser().parse('''
Northstar INVOICE
Marketplace
Everyday essentials
Northstar Marketplace Order Number: ORD-247
Desk Mat USD 19.99
Total USD 19.99
''');
      expect(corroborated.merchant, 'Northstar Marketplace');

      for (final orderLabel in ['Order #247', 'Order No. 247']) {
        final alternate = const ReceiptOcrParser().parse('''
Northstar INVOICE
Marketplace
Everyday essentials
Northstar Marketplace $orderLabel
Desk Mat USD 19.99
Total USD 19.99
''');
        expect(alternate.merchant, 'Northstar Marketplace');
      }

      final missingIdentifier = const ReceiptOcrParser().parse('''
Northstar INVOICE
Marketplace
Everyday essentials
Northstar Marketplace Order Number: Pending
Desk Mat USD 19.99
Total USD 19.99
''');
      expect(missingIdentifier.merchant, isNot('Northstar Marketplace'));

      final uncorroborated = const ReceiptOcrParser().parse('''
Northstar INVOICE
Marketplace
Everyday essentials
Unrelated Vendor Order Number: ORD-247
Desk Mat USD 19.99
Total USD 19.99
''');
      expect(uncorroborated.merchant, isNot('Northstar Marketplace'));

      final competingCustomer = const ReceiptOcrParser().parse('''
Northstar INVOICE
Marketplace
Bill To
Northstar Marketplace Account Number: C-247
Payment Method: Card
Desk Mat USD 19.99
Total USD 19.99
''');
      expect(competingCustomer.merchant, isNot('Northstar Marketplace'));

      for (final buyerHeading in [
        'Sold To',
        'Billed To',
        'Bill-To:',
        'Ship-To:',
        'Recipient',
        'Client',
        'Billing',
        'Billing Information',
        'Remit To',
        'Pay To',
      ]) {
        final buyerIdentity = const ReceiptOcrParser().parse('''
Northstar INVOICE
Marketplace
$buyerHeading
Northstar Marketplace Account Number: C-247
Desk Mat USD 19.99
Total USD 19.99
''');
        expect(
          buyerIdentity.merchant,
          isNot('Northstar Marketplace'),
          reason: '$buyerHeading cannot corroborate issuer identity',
        );
      }

      final competingPayee = const ReceiptOcrParser().parse('''
Northstar INVOICE
Marketplace
Payee
Northstar Marketplace Reference Number: P-247
Desk Mat USD 19.99
Total USD 19.99
''');
      expect(competingPayee.merchant, isNot('Northstar Marketplace'));

      final footerRepeat = const ReceiptOcrParser().parse('''
Northstar INVOICE
Marketplace
Desk Mat USD 19.99
Total USD 19.99
Thank you for your purchase
Northstar Marketplace Order Number: F-247
''');
      expect(footerRepeat.merchant, isNot('Northstar Marketplace'));
    },
  );

  test('foreign-currency adjustments do not corroborate a receipt total', () {
    final preview = const ReceiptOcrParser().parse('''
Corner Store
Subtotal USD 90.00
Tip EUR 20.00
Total EUR 110.00
Total USD 100.00
''');
    expect(preview.currency, 'USD');
    expect(preview.tipCurrency, 'EUR');
    expect(preview.total, '100.00');
  });

  test('printed total paid and refund total remain review candidates', () {
    final paid = const ReceiptOcrParser().parse('''
Corner Store
Bread USD 12.00
Total Paid USD 12.00
Cash Tender USD 20.00
Change USD 8.00
''');
    expect(paid.total, '12.00');

    final partialPayment = const ReceiptOcrParser().parse('''
Corner Store
Bread USD 12.00
Total USD 12.00
Total Paid USD 5.00
''');
    expect(partialPayment.total, '12.00');

    final refund = const ReceiptOcrParser().parse('''
Corner Store
Returned Bread USD -12.00
Refund Total USD -12.00
Cash Tender USD 12.00
''');
    expect(refund.total, '-12.00');
  });

  test('explicit bill date outranks print date after a due date', () {
    final preview = const ReceiptOcrParser().parse('''
River Utility
Print Date: 2025-04-05
Due Date: 2025-04-28
Bill Date: 2025-04-10
Total USD 10.00
''');
    expect(preview.receiptDate, '2025-04-10');
  });

  test('bill due date stays secondary to a later transaction date', () {
    final preview = const ReceiptOcrParser().parse('''
River Utility
Bill Due Date: 2025-04-28
Transaction Date: 2025-04-10
Total USD 10.00
''');
    expect(preview.receiptDate, '2025-04-10');
  });

  test(
    'explicit bill date outranks an early unlabeled date on a long bill',
    () {
      final lines = <String>[
        'River Utility',
        '2025-04-01',
        ...List<String>.generate(90, (index) => 'Service note ${index + 1}'),
        'Bill Date: 2025-04-10',
        'Total USD 10.00',
      ];
      final preview = const ReceiptOcrParser().parse(lines.join('\n'));
      expect(preview.receiptDate, '2025-04-10');
    },
  );

  test('two date roles on one line select the bill date', () {
    final preview = const ReceiptOcrParser().parse('''
River Utility
Due Date: 2025-04-28 Bill Date: 2025-04-10
Total USD 10.00
''');
    expect(preview.receiptDate, '2025-04-10');
  });

  test('final total outranks current charges', () {
    final preview = const ReceiptOcrParser().parse('''
River Utility
Current Charges USD 10.00
Total USD 12.00
''');
    expect(preview.total, '12.00');
  });

  test(
    'layout rows retain recognition confidence on matched item evidence',
    () {
      final preview = const ReceiptOcrParser().parse(
        'Corner Market\nBread 18.00\nTotal USD 18.00',
        blocks: const [
          ReceiptOcrBlockEvidence(
            text: 'Corner Market',
            order: 0,
            row: 0,
            confidence: 0.91,
          ),
          ReceiptOcrBlockEvidence(
            text: 'Bread',
            order: 1,
            row: 1,
            confidence: 0.8,
          ),
          ReceiptOcrBlockEvidence(
            text: '18.00',
            order: 2,
            row: 1,
            confidence: 0.6,
          ),
          ReceiptOcrBlockEvidence(
            text: 'Total USD 18.00',
            order: 3,
            row: 2,
            confidence: 0.92,
          ),
        ],
      );
      expect(preview.items.single.confidence, closeTo(0.7, 0.001));
      expect(preview.blocks, hasLength(4));
    },
  );

  test('parser preserves weighted quantity and unit-price evidence', () {
    const parser = ReceiptOcrParser();

    final preview = parser.parse('''
Green Basket Market
Date: 2026-09-17
Apples 1.250 kg @ 3.99/kg USD 4.99
Tomatoes 0.850 kg @ 5.49/kg USD 4.67
Subtotal USD 9.66
Total USD 9.66
''');

    expect(preview.items, hasLength(2));
    expect(preview.items.first.description, 'Apples');
    expect(preview.items.first.quantity, '1.250');
    expect(preview.items.first.unitPrice, '3.99');
    expect(preview.items.first.lineTotal, '4.99');
    expect(preview.items.last.description, 'Tomatoes');
    expect(preview.items.last.quantity, '0.850');
    expect(preview.items.last.unitPrice, '5.49');
    expect(preview.items.last.lineTotal, '4.67');
  });

  test('parser combines separate fuel measurement fields into one item', () {
    const parser = ReceiptOcrParser();

    final preview = parser.parse(r'''
WESTSIDE FUEL
DATE 04/10/2025 8:17 AM
PUMP 4
FUEL Regular Unleaded
GALLONS 12.563
PRICE/GAL $3.599
TOTAL $45.22
''', fallbackCurrency: 'USD');

    expect(preview.items, hasLength(1));
    expect(preview.items.single.description, 'Regular Unleaded');
    expect(preview.items.single.quantity, '12.563');
    expect(preview.items.single.unitPrice, '3.599');
    expect(preview.items.single.lineTotal, '45.22');
    expect(
      preview.itemLineDecisions[3],
      ReceiptOcrItemLineDecision.fuelItemSelected,
    );
  });

  test('fuel row decision skips matching merchant text', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse(r'''
FUEL Regular Unleaded
DATE 04/10/2025
FUEL Regular Unleaded
GALLONS 12.563
PRICE/GAL $3.599
TOTAL $45.22
''', fallbackCurrency: 'USD');

    expect(preview.items, hasLength(1));
    expect(preview.items.single.description, 'Regular Unleaded');
    expect(
      preview.itemLineDecisions[0],
      isNot(ReceiptOcrItemLineDecision.fuelItemSelected),
    );
    expect(
      preview.itemLineDecisions[2],
      ReceiptOcrItemLineDecision.fuelItemSelected,
    );
  });

  test('fuel shortcut leaves detached signed money unresolved', () {
    const parser = ReceiptOcrParser();
    for (final signedLine in [
      'TOTAL USD− 3.00',
      'PRICE/GAL USD− 2.00',
      'GALLONS − 1.5',
    ]) {
      final preview = parser.parse('''
WESTSIDE FUEL
FUEL Regular Unleaded
GALLONS 1.5
PRICE/GAL USD 2.00
TOTAL USD 3.00
$signedLine
''');
      expect(
        preview.items,
        isEmpty,
        reason: 'signed fuel field must stay unresolved',
      );
      expect(
        preview.warnings,
        contains(
          'Some OCR lines need manual review because no traceable line amount was found.',
        ),
        reason: signedLine,
      );
    }
  });

  test('fuel item uses selected transaction total, not payment evidence', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
WESTSIDE FUEL
FUEL Regular Unleaded
GALLONS 12.563
PRICE/GAL USD 3.599
TOTAL USD 45.22
TOTAL PAID EUR 41.00
''');

    expect(preview.total, '45.22');
    expect(preview.items, hasLength(1));
    expect(preview.items.single.lineTotal, '45.22');
    expect(preview.items.single.currency, 'USD');

    final paymentOnly = parser.parse('''
WESTSIDE FUEL
FUEL Regular Unleaded
GALLONS 12.563
PRICE/GAL USD 3.599
TOTAL PAID USD 45.22
''');
    expect(paymentOnly.items, isEmpty);
  });

  test('fuel unit rate with conflicting printed currency stays unresolved', () {
    const parser = ReceiptOcrParser();
    for (final rate in ['PRICE/GAL EUR 3.599', 'PRICE/GAL ₱3.599']) {
      final preview = parser.parse('''
WESTSIDE FUEL
FUEL Regular Unleaded
GALLONS 12.563
$rate
TOTAL USD 45.22
''');
      expect(preview.items, isEmpty, reason: 'conflicting printed unit rate');
    }
  });

  test('second priced fuel row cannot replace measured fuel description', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
WESTSIDE FUEL
FUEL Regular Unleaded
GALLONS 10.000
PRICE/GAL USD 3.000
FUEL ADDITIVE USD 5.00
TOTAL USD 35.00
''');

    expect(preview.items, hasLength(1));
    expect(preview.items.single.description, 'FUEL ADDITIVE');
    expect(preview.items.single.lineTotal, '5.00');
    expect(preview.items.single.quantity, isNull);
  });

  test('ordinary fuel-named item remains an editable item', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Corner Store
Fuel USD 5.00
Total USD 5.00
''');

    expect(preview.items, hasLength(1));
    expect(preview.items.single.lineTotal, '5.00');
  });

  test(
    'parser quarantines an ambiguous fuel grand total with another item',
    () {
      const parser = ReceiptOcrParser();

      final preview = parser.parse(r'''
WESTSIDE FUEL
FUEL Regular Unleaded
GALLONS 10.000
PRICE/GAL USD 3.000
Snack USD 2.00
TOTAL USD 32.00
''');

      expect(preview.items, hasLength(1));
      expect(preview.items.single.description, 'Snack');
      expect(preview.items.single.lineTotal, '2.00');
    },
  );

  test('parser preserves signed refund item evidence', () {
    const parser = ReceiptOcrParser();

    final preview = parser.parse(r'''
Fashion Outlet Returns
Date: 2026-09-17
Returned Jacket USD -79.99
Restocking Fee USD 5.00
Total USD -74.99
''');

    expect(preview.items, hasLength(2));
    expect(preview.items.first.description, 'Returned Jacket');
    expect(preview.items.first.lineTotal, '-79.99');
    expect(preview.items.last.description, 'Restocking Fee');
    expect(preview.items.last.lineTotal, '5.00');
    expect(preview.total, '-74.99');

    final symbolPrefixed = parser.parse(r'''
Fashion Outlet Returns
Returned Jacket -$79.99
Total -$79.99
''');
    expect(symbolPrefixed.items.single.description, 'Returned Jacket');
    expect(symbolPrefixed.items.single.lineTotal, '-79.99');
    expect(symbolPrefixed.total, '-79.99');
  });

  test('parser leaves symbol-only currency blank for review', () {
    const parser = ReceiptOcrParser();

    final preview = parser.parse(r'''
Coffee Bar
2026-06-13
Latte $5.50
Total $5.50
''');

    expect(preview.currency, isNull);
    expect(preview.currencyProvenance, ReceiptOcrCurrencyProvenance.unresolved);
    expect(
      preview.warnings,
      contains(
        'The receipt only shows a currency symbol. Choose the currency before applying.',
      ),
    );
  });

  test('explicit HK markers and context produce HKD', () {
    const parser = ReceiptOcrParser();

    final explicitCode = parser.parse(r'''
Harbour Market
Total HKD 88.00
''');
    final explicitSymbol = parser.parse(r'''
Harbour Market
Tea HK$18.00
Total HK$18.00
''');
    final hongKongContext = parser.parse(r'''
Harbour Market
Hong Kong
Tea $18.00
Total $18.00
''');

    expect(explicitCode.currency, 'HKD');
    expect(explicitSymbol.currency, 'HKD');
    expect(explicitSymbol.total, '18.00');
    expect(hongKongContext.currency, 'HKD');
    expect(
      hongKongContext.currencyProvenance,
      ReceiptOcrCurrencyProvenance.contextInferred,
    );
  });

  test('currency prefixes beside a total label retain the printed total', () {
    const parser = ReceiptOcrParser();
    for (final prefix in const [
      r'HK$',
      r'US$',
      r'CA$',
      r'A$',
      r'S$',
      r'NZ$',
      r'NT$',
      r'R$',
      'Rs',
      'kr',
      '₹',
      '€',
    ]) {
      final preview = parser.parse(
        'Corner Shop\nItem A ${prefix}12.00\nTotal ${prefix}12.00',
      );
      expect(preview.total, '12.00', reason: prefix);
    }

    final tender = parser.parse(
      'Corner Shop\nItem A HK\$12.00\nPayment HK\$12.00',
    );
    expect(tender.total, isNull);

    final productCode = parser.parse(
      'Corner Shop\nModel USD123\nVoucher Rs123\nDevice INR123.45\nTotal USD 12.00',
    );
    expect(productCode.items, isEmpty);
    expect(productCode.total, '12.00');

    final pricedCode = parser.parse(
      'Corner Shop\nModel USD123 USD 123.00\nTotal USD 123.00',
    );
    expect(pricedCode.items.map((item) => item.description), ['Model USD123']);
    expect(pricedCode.items.single.lineTotal, '123.00');

    final annotated = parser.parse(
      'Corner Shop\nItem A HK\$12.00\nSubtotal (8.25%) HK\$12.00\n'
      'Total (HKD) HK\$12.00',
    );
    expect(annotated.subtotal, '12.00');
    expect(annotated.total, '12.00');
  });

  test('ambiguous dollar uses fallback currency instead of USD', () {
    const parser = ReceiptOcrParser();

    final preview = parser.parse(r'''
Coffee Bar
Latte $5.50
Total $5.50
''', fallbackCurrency: 'HKD');

    expect(preview.currency, 'HKD');
    expect(
      preview.currencyProvenance,
      ReceiptOcrCurrencyProvenance.defaultFallback,
    );
    expect(preview.items.single.currency, 'HKD');
    expect(
      preview.warnings,
      contains(
        'The receipt only shows a currency symbol. Using the current bill currency; review it before applying.',
      ),
    );
  });

  test('USD fallback needs matching country evidence for bare amounts', () {
    const parser = ReceiptOcrParser();
    const receipt = '''
Corner Market
Denver, CO 80202
Bread 4.00
Total 4.00
''';
    final supported = parser.parse(receipt, fallbackCurrency: 'USD');
    final conflicting = parser.parse(receipt, fallbackCurrency: 'HKD');
    final unsupported = parser.parse(
      'Corner Market\nBread 4.00\nTotal 4.00',
      fallbackCurrency: 'USD',
    );
    expect(supported.currency, 'USD');
    expect(
      supported.currencyProvenance,
      ReceiptOcrCurrencyProvenance.contextInferred,
    );
    expect(supported.items.single.currency, 'USD');
    expect(conflicting.currency, isNull);
    expect(unsupported.currency, isNull);
  });

  test('ambiguous yen kr and Rs markers use matching fallbacks', () {
    const parser = ReceiptOcrParser();
    final cases = <({String text, String fallback})>[
      (text: 'Noodle Shop\nNoodles ¥60\nTotal ¥60', fallback: 'JPY'),
      (text: 'Corner Shop\nBread kr 40.00\nTotal kr 40.00', fallback: 'SEK'),
      (text: 'Tea Shop\nTea Rs 80.00\nTotal Rs 80.00', fallback: 'INR'),
    ];

    for (final fixture in cases) {
      final preview = parser.parse(
        fixture.text,
        fallbackCurrency: fixture.fallback,
      );
      expect(preview.currency, fixture.fallback, reason: fixture.text);
      expect(
        preview.currencyProvenance,
        ReceiptOcrCurrencyProvenance.defaultFallback,
        reason: fixture.text,
      );
    }

    final stateAndZip = parser.parse(r'''Pike Deli
Seattle, WA 98101
Total $18.20''');
    expect(stateAndZip.items, isEmpty);
  });

  test('numeric marketing text does not masquerade as a currency amount', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse(r'''
Corner Cafe
TRY 2 FOR 1
Latte $5.50
Total $5.50
''', fallbackCurrency: 'USD');

    expect(preview.currency, 'USD');
    expect(
      preview.currencyProvenance,
      ReceiptOcrCurrencyProvenance.defaultFallback,
    );

    final trailingInteger = parser.parse(r'''
Corner Cafe
TRY 2
Latte $5.50
Total $5.50
''', fallbackCurrency: 'USD');
    expect(trailingInteger.currency, 'USD');
    expect(
      trailingInteger.currencyProvenance,
      ReceiptOcrCurrencyProvenance.defaultFallback,
    );
  });

  test('transaction symbols outrank later card conversion codes', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Corner Cafe
Coffee €5.00
Total €5.00
Card charged USD 5.40
''');

    expect(preview.currency, 'EUR');
    expect(preview.items.single.currency, 'EUR');
  });

  test('parser resolves ambiguous symbols only from receipt context', () {
    const parser = ReceiptOcrParser();
    final cases = <({String text, String? currency})>[
      (
        text: r'''Pike Deli
Seattle, WA 98101
Total $18.20''',
        currency: 'USD',
      ),
      (
        text: r'''Maple Cafe
Toronto ON
HST
Total $11.02''',
        currency: 'CAD',
      ),
      (
        text: r'''Bakehouse
Sydney NSW
ABN 123
Total $20.18''',
        currency: 'AUD',
      ),
      (
        text: r'''Orchard Kopi
Singapore
GST Reg
Total $9.81''',
        currency: 'SGD',
      ),
      (
        text: r'''Auckland Corner
New Zealand
GST No
Total $14.13''',
        currency: 'NZD',
      ),
      (
        text: r'''Mercado
Mexico CDMX
IVA
Total $145.00''',
        currency: 'MXN',
      ),
      (text: '東京食堂\nラーメン ¥980\n合計 ¥1180', currency: 'JPY'),
      (text: '上海面馆\n牛肉面 ¥48.00\n合计 ¥56.00', currency: 'CNY'),
      (text: 'Noodle Shop\nNoodles ¥50\nTotal ¥60', currency: null),
      (text: 'Stockholm Cafe\nMoms\nTotal 75 kr', currency: 'SEK'),
      (text: 'Oslo Bakeri\nMVA\nTotal 75 kr', currency: 'NOK'),
      (text: 'Nordic Shop\nTotal 45 kr', currency: null),
      (text: 'Delhi Snacks\nGSTIN 123\nTotal Rs 550.00', currency: 'INR'),
      (text: 'Karachi Grill\nSTRN 123\nTotal Rs 550.00', currency: 'PKR'),
      (text: 'Central Store\nTotal Rs 100.00', currency: null),
    ];

    for (final fixture in cases) {
      final preview = parser.parse(fixture.text);
      expect(preview.currency, fixture.currency, reason: fixture.text);
      expect(
        preview.currencyProvenance,
        fixture.currency == null
            ? ReceiptOcrCurrencyProvenance.unresolved
            : ReceiptOcrCurrencyProvenance.contextInferred,
        reason: fixture.text,
      );
    }
  });

  test('context-backed kr and Rs markers retain item and total money', () {
    const parser = ReceiptOcrParser();
    final cases =
        <({String text, String currency, String total, List<String> amounts})>[
          (
            text:
                'Stockholm Cafe\nStockholm, Sverige\nMoms 12%\n'
                'Dato/Datum 2026-09-17\nCoffee 45 kr\nBread 30 kr\n'
                'Total 75 kr\nTakk / Tack',
            currency: 'SEK',
            total: '75',
            amounts: ['45', '30'],
          ),
          (
            text:
                'Oslo Bakeri\nOslo, Norge\nMVA 15%\n'
                'Dato/Datum 2026-09-17\nCoffee 45 kr\nBread 30 kr\n'
                'Total 75 kr\nTakk / Tack',
            currency: 'NOK',
            total: '75',
            amounts: ['45', '30'],
          ),
          (
            text:
                'Delhi Snacks\nConnaught Place, New Delhi\n'
                'GSTIN 07AAAAA0000A1Z5\nDate 2026-09-17\n'
                'Meal Rs 450.00\nTea Rs 100.00\nTotal Rs 550.00\nThank you',
            currency: 'INR',
            total: '550.00',
            amounts: ['450.00', '100.00'],
          ),
          (
            text:
                'Karachi Grill\nKarachi, Pakistan\nSTRN 1234567\n'
                'Meal Rs 450.00\nTea Rs 100.00\nTotal Rs 550.00',
            currency: 'PKR',
            total: '550.00',
            amounts: ['450.00', '100.00'],
          ),
        ];
    for (final fixture in cases) {
      final preview = parser.parse(fixture.text);
      expect(preview.currency, fixture.currency, reason: fixture.text);
      expect(preview.total, fixture.total, reason: fixture.text);
      expect(
        preview.items.map((item) => item.lineTotal),
        fixture.amounts,
        reason: fixture.text,
      );
      expect(
        preview.items.map((item) => item.currency),
        everyElement(fixture.currency),
        reason: fixture.text,
      );
      expect(preview.reviewHints, isEmpty, reason: fixture.text);
    }
    final ambiguous = parser.parse('Nordic Shop\nCoffee 45 kr\nTotal 45 kr');
    expect(ambiguous.currency, isNull);
    expect(ambiguous.items.single.currency, isNull);
  });

  test('priced or uncertain tax context remains reviewable', () {
    const parser = ReceiptOcrParser();
    final pricedTax = parser.parse(
      'Stockholm Cafe\nStockholm, Sverige\nCoffee 45 kr\n'
      'Moms 12% 5 kr\nTotal 50 kr',
    );
    expect(pricedTax.reviewHints, isNotEmpty);

    final uncertainItem = parser.parse(
      'Delhi Snacks\nGSTIN 07AAAAA0000A1Z5\n'
      'Meal Rs 450.00\nExtra Sauce\nTotal Rs 450.00',
    );
    expect(uncertainItem.reviewHints, isNotEmpty);
    final topUnpricedProduct = parser.parse(
      'Stockholm Cafe\nLatte, large\nMoms 12%\n'
      'Coffee 45 kr\nTotal 45 kr',
    );
    expect(topUnpricedProduct.reviewHints, isNotEmpty);
    for (final name in ['Tack', 'Takk']) {
      final namedMerchant = parser.parse('$name\nCoffee 45 kr\nTotal 45 kr');
      expect(namedMerchant.merchant, name);
    }
  });

  test(
    'Nordic courtesy text needs footer layout before suppressing review',
    () {
      const parser = ReceiptOcrParser();
      const text = 'Cafe\nCoffee USD 45.00\nTotal USD 45.00\nTakk / Tack';
      List<ReceiptOcrBlockEvidence> blocks(double left, double right) => [
        _layoutBlock('Cafe', 0, 0, 20, 120),
        _layoutBlock('Coffee USD 45.00', 1, 1, 20, 350),
        _layoutBlock('Total USD 45.00', 2, 2, 20, 350),
        _layoutBlock('Takk / Tack', 3, 3, left, right),
      ];
      expect(parser.parse(text, blocks: blocks(150, 220)).reviewHints, isEmpty);
      expect(
        parser.parse(text, blocks: blocks(20, 100)).reviewHints,
        isNotEmpty,
      );
    },
  );

  test(
    'multi-amount kr and Rs totals do not promote bill fallback to explicit',
    () {
      const parser = ReceiptOcrParser();
      final pakistan = parser.parse(
        'Karachi Grill\nKarachi, Pakistan\nMeal Rs 100.00\n'
        'Total Rs 100.00 Rs 200.00',
        fallbackCurrency: 'INR',
      );
      expect(pakistan.currency, 'PKR');
      expect(
        pakistan.currencyProvenance,
        ReceiptOcrCurrencyProvenance.contextInferred,
      );

      final foreignItem = parser.parse(
        'Karachi Grill\nKarachi, Pakistan\nMeal USD 10.00\n'
        'Total Rs 100.00 Rs 200.00',
        fallbackCurrency: 'INR',
      );
      expect(foreignItem.currency, 'PKR');
      expect(
        foreignItem.currencyProvenance,
        ReceiptOcrCurrencyProvenance.contextInferred,
      );

      final swedenWithForeignItem = parser.parse(
        'Stockholm Cafe\nMoms\nCake EUR 10.00\n'
        'Total 100 kr 200 kr',
        fallbackCurrency: 'NOK',
      );
      expect(swedenWithForeignItem.currency, 'SEK');
      expect(
        swedenWithForeignItem.currencyProvenance,
        ReceiptOcrCurrencyProvenance.contextInferred,
      );
      final earlierForeignAmount = parser.parse(
        'Karachi Grill\nKarachi, Pakistan\n'
        'Total USD 100.00 Rs 200.00',
        fallbackCurrency: 'INR',
      );
      expect(earlierForeignAmount.currency, 'PKR');
      expect(
        earlierForeignAmount.currencyProvenance,
        ReceiptOcrCurrencyProvenance.contextInferred,
      );
      final printedConflict = parser.parse(
        'Karachi Grill\nCurrency USD\nTotal Rs 100.00 Rs 200.00',
        fallbackCurrency: 'PKR',
      );
      expect(printedConflict.currency, isNull);
      expect(
        printedConflict.currencyProvenance,
        ReceiptOcrCurrencyProvenance.unresolved,
      );

      final fallback = parser.parse(
        'Central Store\nMeal Rs 100.00\nTotal Rs 100.00 Rs 200.00',
        fallbackCurrency: 'INR',
      );
      expect(fallback.currency, 'INR');
      expect(
        fallback.currencyProvenance,
        ReceiptOcrCurrencyProvenance.defaultFallback,
      );
      expect(
        fallback.warnings,
        contains(
          'The receipt only shows a currency symbol. Using the current bill currency; review it before applying.',
        ),
      );
    },
  );

  test('parser normalizes supported locale amount conventions', () {
    const parser = ReceiptOcrParser();
    final cases = <({String text, String currency, List<String> values})>[
      (
        text:
            'Bistro Lumière\nSoupe 8,50 €\nCafé 3,20 €\nSous-total 11,70 €\nTVA 1,17 €\nTotal 12,87 €',
        currency: 'EUR',
        values: ['8.50', '3.20', '11.70', '1.17', '12.87'],
      ),
      (
        text:
            'Berlin Technik\nMonitor 1.199,00 €\nKabel 35,56 €\nZwischensumme 1.234,56 €\nMwSt. 234,57 €\nGesamt 1.469,13 €',
        currency: 'EUR',
        values: ['1199.00', '35.56', '1234.56', '234.57', '1469.13'],
      ),
      (
        text:
            "Zürich Markt\nGerät CHF 1'199.50\nZubehör CHF 35.00\nSubtotal CHF 1'234.50\nMwSt. CHF 99.95\nTotal CHF 1'334.45",
        currency: 'CHF',
        values: ['1199.50', '35.00', '1234.50', '99.95', '1334.45'],
      ),
      (
        text:
            'Mumbai Electronics\nLaptop ₹ 1,20,000.00\nMouse ₹ 3,456.78\nSubtotal ₹ 1,23,456.78\nGST ₹ 22,222.22\nTotal ₹ 1,45,679.00',
        currency: 'INR',
        values: ['120000.00', '3456.78', '123456.78', '22222.22', '145679.00'],
      ),
      (
        text:
            'Quán Hà Nội\nPhở 120.000 ₫\nCà phê 80.000 ₫\nTạm tính 200.000 ₫\nThuế 20.000 ₫\nTổng 220.000 ₫',
        currency: 'VND',
        values: ['120000', '80000', '200000', '20000', '220000'],
      ),
      (
        text:
            'Köln Markt\nGerät EUR 1.234\nKabel EUR 20.00\nSubtotal EUR 1.254\nTax EUR 0.00\nTotal EUR 1.254',
        currency: 'EUR',
        values: ['1234', '20.00', '1254', '0.00', '1254'],
      ),
      (
        text:
            'Kuwait Cafe\nCoffee KWD 1.234\nCake KWD 2.345\nSubtotal KWD 3.579\nTax KWD 0.000\nTotal KWD 3.579',
        currency: 'KWD',
        values: ['1.234', '2.345', '3.579', '0.000', '3.579'],
      ),
      (
        text:
            'Kuwait Cafe\nCoffee KWD 1,234\nCake KWD 2,345\nSubtotal KWD 3,579\nTax KWD 0,000\nTotal KWD 3,579',
        currency: 'KWD',
        values: ['1.234', '2.345', '3.579', '0.000', '3.579'],
      ),
      (
        text:
            'Manama Cafe\nCoffee BHD 1,234\nCake BHD 2,345\nSubtotal BHD 3,579\nTax BHD 0,000\nTotal BHD 3,579',
        currency: 'BHD',
        values: ['1.234', '2.345', '3.579', '0.000', '3.579'],
      ),
    ];

    for (final fixture in cases) {
      final preview = parser.parse(fixture.text);
      expect(preview.currency, fixture.currency, reason: fixture.text);
      expect(
        preview.items.map((item) => item.lineTotal),
        fixture.values.take(2),
      );
      expect(preview.subtotal, fixture.values[2]);
      expect(preview.tax, fixture.values[3]);
      expect(preview.total, fixture.values[4]);
    }
  });

  test('printed localized tax labels do not compete with currency codes', () {
    const parser = ReceiptOcrParser();
    final cases = <({String text, String currency, String tax})>[
      (
        text: '''
Boulangerie Lumière
Baguette 2,20 EUR
Croissant 3,10 EUR
Café 4,50 EUR
Sous-total 9,80 EUR
TVA 0,98 EUR
Total 10,78 EUR
''',
        currency: 'EUR',
        tax: '0.98',
      ),
      (
        text: '''
Mercado Centro
Tacos MXN 90.00
Agua MXN 35.00
Subtotal MXN 125.00
IVA MXN 20.00
Total MXN 145.00
''',
        currency: 'MXN',
        tax: '20.00',
      ),
      (
        text: '''
Istanbul Cafe
Tea TRY 20.00
Cake TRY 30.00
Subtotal TRY 50.00
KDV TRY 5.00
Total TRY 55.00
''',
        currency: 'TRY',
        tax: '5.00',
      ),
    ];
    for (final receipt in cases) {
      final preview = parser.parse(receipt.text);
      expect(preview.currency, receipt.currency);
      expect(preview.tax, receipt.tax);
      expect(preview.taxCurrency, receipt.currency);
      expect(preview.reviewHints, isEmpty);
    }
  });

  test('printed included VAT is informational and not a purchased item', () {
    final preview = const ReceiptOcrParser().parse('''
London Books
17/09/2026
Book GBP 24.00
Total incl. VAT GBP 24.00
VAT included 20% GBP 4.00
Thank you
''');

    expect(preview.currency, 'GBP');
    expect(preview.items.map((item) => item.description), ['Book']);
    expect(preview.items.single.lineTotal, '24.00');
    expect(preview.total, '24.00');
    expect(preview.tax, '4.00');
    expect(preview.taxCurrency, 'GBP');
    expect(preview.taxIncludedInTotal, isTrue);
    expect(preview.reviewHints, isEmpty);
  });

  test('included tax remains reviewable when printed amounts conflict', () {
    final preview = const ReceiptOcrParser().parse('''
London Books
Book GBP 24.00
Total incl. VAT GBP 25.00
VAT included 20% GBP 4.00
''');

    expect(preview.items.map((item) => item.description), ['Book']);
    expect(preview.total, '25.00');
    expect(preview.tax, '4.00');
    expect(preview.reviewHints, isNotEmpty);
  });

  test('explicit included VAT can accompany a plain printed total', () {
    final preview = const ReceiptOcrParser().parse('''
London Books
Book GBP 24.00
Total GBP 24.00
VAT included 20% GBP 4.00
''');

    expect(preview.taxIncludedInTotal, isTrue);
    expect(preview.total, '24.00');
    expect(preview.tax, '4.00');
    expect(preview.reviewHintDecision, ReceiptOcrReviewDecision.none);
  });

  test('included VAT reconciles a net subtotal under gross item prices', () {
    final preview = const ReceiptOcrParser().parse('''
London Books
Book GBP 24.00
Subtotal GBP 20.00
VAT included 20% GBP 4.00
Total GBP 24.00
''');

    expect(preview.items.single.lineTotal, '24.00');
    expect(preview.subtotal, '20.00');
    expect(preview.taxIncludedInTotal, isTrue);
    expect(preview.reviewHintDecision, ReceiptOcrReviewDecision.none);
  });

  test('included VAT cannot hide a contradictory pre-subtotal discount', () {
    const preview = ReceiptOcrPreview(
      currency: 'GBP',
      subtotal: '20.00',
      tax: '4.00',
      taxIncludedInTotal: true,
      discount: '-5.00',
      discountBeforeSubtotal: true,
      total: '19.00',
      items: [ReceiptOcrItemCandidate(description: 'Book', lineTotal: '24.00')],
    );

    expect(
      preview.reviewHintDecision,
      ReceiptOcrReviewDecision.subtotalMismatch,
    );
  });

  test('included VAT and a separately added service fee reconcile', () {
    final preview = const ReceiptOcrParser().parse('''
London Books
Book GBP 24.00
VAT included 20% GBP 4.00
Service fee GBP 2.00
Total GBP 26.00
''');

    expect(preview.items.single.lineTotal, '24.00');
    expect(preview.tax, '4.00');
    expect(preview.service, '2.00');
    expect(preview.taxIncludedInTotal, isTrue);
    expect(preview.total, '26.00');
    expect(preview.reviewHintDecision, ReceiptOcrReviewDecision.none);
  });

  test('included VAT reconciles a printed net subtotal when supported', () {
    const parser = ReceiptOcrParser();
    final balanced = parser.parse('''
London Books
Book GBP 20.00
Subtotal GBP 20.00
Total incl. VAT GBP 24.00
VAT included 20% GBP 4.00
''');
    expect(balanced.items.single.lineTotal, '20.00');
    expect(balanced.subtotal, '20.00');
    expect(balanced.total, '24.00');
    expect(balanced.tax, '4.00');
    expect(balanced.taxIncludedInTotal, isTrue);
    expect(balanced.reviewHints, isEmpty);

    final conflicting = parser.parse('''
London Books
Book GBP 20.00
Subtotal GBP 20.00
Total incl. VAT GBP 25.00
VAT included 20% GBP 4.00
''');
    expect(conflicting.reviewHints, isNotEmpty);
  });

  test('ordinary additive VAT and merchandise wording keep their roles', () {
    const parser = ReceiptOcrParser();
    final additive = parser.parse('''
London Books
Book GBP 20.00
VAT 20% GBP 4.00
Total GBP 24.00
''');
    expect(additive.items.map((item) => item.description), ['Book']);
    expect(additive.tax, '4.00');
    expect(additive.taxIncludedInTotal, isFalse);
    expect(additive.reviewHints, isEmpty);

    final merchandise = parser.parse('''
London Books
VAT Included Guide GBP 12.00
Total GBP 12.00
''');
    expect(merchandise.items.map((item) => item.description), [
      'VAT Included Guide',
    ]);
    expect(merchandise.tax, isNull);
    expect(merchandise.taxIncludedInTotal, isFalse);
  });

  test('mixed included and additive tax rows stay unresolved', () {
    final preview = const ReceiptOcrParser().parse('''
London Books
Book GBP 20.00
Subtotal GBP 20.00
VAT included 10% GBP 2.00
Sales tax 20% GBP 4.00
Total GBP 24.00
''');
    expect(preview.currency, 'GBP');
    expect(preview.tax, isNull);
    expect(preview.taxIncludedInTotal, isFalse);
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.reviewHints, isNotEmpty);
  });

  test('parser preserves actual tip and shipping preview values', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Harbor Grill
Burger USD 18.00
Beer USD 8.00
Subtotal USD 26.00
Shipping USD 9.99
Actual Tip USD 5.00
Total USD 40.99
''');

    expect(preview.shipping, '9.99');
    expect(preview.shippingLabel, 'Shipping');
    expect(preview.shippingCurrency, 'USD');
    expect(preview.tip, '5.00');
    expect(preview.tipLabel, 'Actual Tip');
    expect(preview.tipCurrency, 'USD');
    expect(preview.items.map((item) => item.description), ['Burger', 'Beer']);

    final suffixed = parser.parse('''
Harbor Grill
Burger USD 18.00
Shipping Fee USD 9.99
Delivery Charge USD 2.00
Total USD 29.99
''');
    expect(suffixed.shipping, '9.99');
    expect(suffixed.shippingLabel, 'Shipping Fee');
    expect(suffixed.items.map((item) => item.description), ['Burger']);

    final handling = parser.parse('''
Harbor Grill
Burger USD 18.00
Shipping & Handling USD 4.50
Shipping and Handling USD 4.50
Total USD 27.00
''');
    expect(handling.shipping, '4.50');
    expect(handling.shippingLabel, 'Shipping & Handling');
    expect(handling.items.map((item) => item.description), ['Burger']);

    final combined = parser.parse('''
Harbor Grill
Burger USD 18.00
Shipping & Handling Fee USD 2.00
Total USD 20.00
''');
    expect(combined.shipping, '2.00');
    expect(combined.shippingLabel, 'Shipping & Handling Fee');
    expect(combined.items.map((item) => item.description), ['Burger']);

    final embeddedCurrencyCode = parser.parse('''
Harbor Grill
Burger USD 18.00
Delivery USD 4.00
Total USD 22.00
''');
    expect(embeddedCurrencyCode.shipping, '4.00');
    expect(
      embeddedCurrencyCode.shippingLabel,
      'Delivery',
      reason:
          'TRY inside Delivery is printed label text, not a currency token.',
    );

    final percentageLabel = parser.parse('''
Harbor Grill
Burger USD 18.00
Gratuity 18% USD 3.24
Total USD 21.24
''');
    expect(percentageLabel.tip, '3.24');
    expect(percentageLabel.tipLabel, 'Gratuity 18%');

    final compactCurrencyMarker = parser.parse('''
Harbor Grill
Burger USD 18.00
Delivery:\$4.00
Total USD 22.00
''');
    expect(compactCurrencyMarker.shipping, '4.00');
    expect(compactCurrencyMarker.shippingLabel, 'Delivery');

    final emojiSuffix = List.filled(60, '😀').join();
    final boundedUnicodeLabel = parser.parse('''
Harbor Grill
Burger USD 18.00
Actual Tip $emojiSuffix USD 3.24
Total USD 21.24
''');
    expect(boundedUnicodeLabel.tip, '3.24');
    expect(boundedUnicodeLabel.tipLabel, isNotNull);
    expect(boundedUnicodeLabel.tipLabel!.length, lessThanOrEqualTo(120));
    expect(boundedUnicodeLabel.tipLabel!.runes.last, 0x1F600);

    final distinctAdjustmentCurrency = parser.parse('''
Harbor Grill
Burger USD 18.00
Tip EUR 2.00
Total USD 20.00
''');
    expect(distinctAdjustmentCurrency.currency, 'USD');
    expect(distinctAdjustmentCurrency.tip, '2.00');
    expect(distinctAdjustmentCurrency.tipCurrency, 'EUR');

    final unsupportedAdjustmentCurrency = parser.parse('''
Harbor Grill
Burger USD 18.00
Tip XPF 2.00
Total USD 20.00
''');
    expect(unsupportedAdjustmentCurrency.currency, 'USD');
    expect(unsupportedAdjustmentCurrency.tip, '2.00');
    expect(unsupportedAdjustmentCurrency.tipCurrency, 'XPF');
    expect(
      unsupportedAdjustmentCurrency.tipHasExplicitCurrencyEvidence,
      isTrue,
    );

    final ambiguousAdjustmentCurrency = parser.parse('''
Harbor Grill
Burger USD 18.00
Tip XPF 2.00 CHF
Total USD 20.00
''');
    expect(ambiguousAdjustmentCurrency.tip, '2.00');
    expect(ambiguousAdjustmentCurrency.tipCurrency, isNull);
    expect(ambiguousAdjustmentCurrency.tipHasExplicitCurrencyEvidence, isTrue);
  });

  test('utility charge table keeps usage and rate out of item names', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Gas Utility
Bill Date Apr 10, 2025
Description Therms Rate Amount
Customer Charge (per account) - \$15.00 \$15.00
Delivery Charge 76 \$0.4120 \$31.31
State Gas Tax 76 \$0.0280 \$2.13
Total Current Charges \$48.44
Total Amount Due \$48.44
''', fallbackCurrency: 'USD');

    expect(preview.shipping, isNull);
    expect(preview.tax, isNull);
    expect(preview.items.map((item) => item.description), [
      'Customer Charge (per account)',
      'Delivery Charge',
      'State Gas Tax',
    ]);
    expect(preview.items.map((item) => item.lineTotal), [
      '15.00',
      '31.31',
      '2.13',
    ]);
    expect(preview.items.every((item) => item.quantity == null), isTrue);
    final singleAmountRow = parser.parse('''
Power Utility
Description Usage Rate Amount
Delivery Charge \$31.31
Total Amount Due \$31.31
''', fallbackCurrency: 'USD');
    expect(singleAmountRow.shipping, isNull);
    expect(singleAmountRow.items, isEmpty);
    expect(
      singleAmountRow.warnings.any(
        (warning) => warning.contains('Some OCR lines'),
      ),
      isTrue,
    );

    final deliveryFeeRow = parser.parse('''
Power Utility
Description Usage Rate Amount
Delivery Fee USD 5.00
Total Amount Due USD 5.00
''');
    expect(deliveryFeeRow.shipping, isNull);
    expect(deliveryFeeRow.items, isEmpty);
    expect(
      deliveryFeeRow.warnings.any(
        (warning) => warning.contains('Some OCR lines'),
      ),
      isTrue,
    );

    const rateOnlyText = '''
Power Utility
Description Rate Amount
Delivery Charge USD 0.15
Total Amount Due USD 0.15
''';
    final rateOnlyBlocks = [
      _layoutBlock('Power Utility', 0, 0, 20, 350),
      _layoutBlock('Description', 1, 1, 20, 150),
      _layoutBlock('Rate', 2, 1, 230, 270),
      _layoutBlock('Amount', 3, 1, 310, 350),
      _layoutBlock('Delivery Charge', 4, 2, 20, 160),
      _layoutBlock('USD 0.15', 5, 2, 230, 270),
      _layoutBlock('Total Amount Due USD 0.15', 6, 3, 20, 350),
    ];
    for (final draft in [
      parser.parse(rateOnlyText),
      parser.parse(rateOnlyText, blocks: rateOnlyBlocks),
    ]) {
      expect(draft.items, isEmpty);
      expect(
        draft.warnings.any((warning) => warning.contains('Some OCR lines')),
        isTrue,
      );
    }

    const mixedTable = '''
Power Utility
Description Usage Rate Amount
Meter Reading 12345
Current Meter Reading 12345.67
Previous Meter Reading (kWh) 12.34
Delivery Charge 76 \$0.412
Tier 1 76 therms \$0.41
Delivery Charge 12.5 therms \$0.41
Service Charge USD 5.00
Delivery Fee USD 2.00
Total Amount Due USD 7.00
''';
    final mixedBlocks = [
      _layoutBlock('Power Utility', 0, 0, 20, 350),
      _layoutBlock('Description', 1, 1, 20, 150),
      _layoutBlock('Usage', 2, 1, 170, 210),
      _layoutBlock('Rate', 3, 1, 230, 270),
      _layoutBlock('Amount', 4, 1, 310, 350),
      _layoutBlock('Meter Reading', 5, 2, 20, 160),
      _layoutBlock('12345', 6, 2, 310, 350),
      _layoutBlock('Current Meter Reading', 7, 3, 20, 160),
      _layoutBlock('12345.67', 8, 3, 310, 350),
      _layoutBlock('Previous Meter Reading (kWh)', 9, 4, 20, 160),
      _layoutBlock('12.34', 10, 4, 310, 350),
      _layoutBlock('Delivery Charge', 11, 5, 20, 160),
      _layoutBlock('76', 12, 5, 170, 210),
      _layoutBlock('\$0.412', 13, 5, 230, 270),
      _layoutBlock('Tier 1', 14, 6, 20, 160),
      _layoutBlock('76 therms', 15, 6, 170, 210),
      _layoutBlock('\$0.41', 16, 6, 230, 270),
      _layoutBlock('Delivery Charge', 17, 7, 20, 160),
      _layoutBlock('12.5 therms', 18, 7, 170, 210),
      _layoutBlock('\$0.41', 19, 7, 230, 270),
      _layoutBlock('Service Charge', 20, 8, 20, 160),
      _layoutBlock('USD 5.00', 21, 8, 310, 350),
      _layoutBlock('Delivery Fee', 22, 9, 20, 160),
      _layoutBlock('USD 2.00', 23, 9, 310, 350),
      _layoutBlock('Total Amount Due USD 7.00', 24, 10, 20, 350),
    ];
    final unlocatedDraft = parser.parse(mixedTable);
    expect(unlocatedDraft.service, isNull);
    expect(unlocatedDraft.shipping, isNull);
    expect(unlocatedDraft.items, isEmpty);
    expect(
      unlocatedDraft.warnings.any(
        (warning) => warning.contains('Some OCR lines'),
      ),
      isTrue,
    );
    final locatedDraft = parser.parse(mixedTable, blocks: mixedBlocks);
    expect(locatedDraft.service, '5.00');
    expect(locatedDraft.shipping, isNull);
    expect(locatedDraft.items, isEmpty);
    expect(locatedDraft.reviewHints, isNotEmpty);

    final unitBearing = parser.parse('''
Power Utility
Description Usage Rate Amount
Delivery Charge 76 therms \$0.4120 \$31.31
Electric Service 120 kWh \$0.1400 \$16.80
Water Charge 76 therms \$5.00
Total Amount Due \$53.11
''', fallbackCurrency: 'USD');
    expect(unitBearing.items.map((item) => item.description), [
      'Delivery Charge',
      'Electric Service',
    ]);
    expect(unitBearing.items.map((item) => item.lineTotal), ['31.31', '16.80']);
    expect(
      unitBearing.warnings,
      contains(
        'Some OCR lines need manual review because no traceable line amount was found.',
      ),
    );

    const waterText = '''
Power Utility
Description Usage Rate Amount
Water Charge 76 therms \$5.00
Total Amount Due \$5.00
''';
    final waterBlocks = [
      _layoutBlock('Power Utility', 0, 0, 20, 350),
      _layoutBlock('Description', 1, 1, 20, 150),
      _layoutBlock('Usage', 2, 1, 170, 210),
      _layoutBlock('Rate', 3, 1, 230, 270),
      _layoutBlock('Amount', 4, 1, 310, 350),
      _layoutBlock('Water Charge', 5, 2, 20, 160),
      _layoutBlock('76 therms', 6, 2, 170, 210),
      _layoutBlock('\$5.00', 7, 2, 310, 350),
      _layoutBlock('Total Amount Due \$5.00', 8, 3, 20, 350),
    ];
    final locatedWater = parser.parse(
      waterText,
      fallbackCurrency: 'USD',
      blocks: waterBlocks,
    );
    expect(locatedWater.items.map((item) => item.description), [
      'Water Charge',
    ]);
    expect(locatedWater.items.single.lineTotal, '5.00');
    expect(
      locatedWater.warnings,
      isNot(
        contains(
          'Some OCR lines need manual review because no traceable line amount was found.',
        ),
      ),
    );
  });

  test('foreign tax and service do not support a transaction total', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Market USD
Subtotal USD 90.00
Tax EUR 20.00
Service Charge EUR 5.00
Total USD 115.00
Total USD 90.00
''');

    expect(preview.currency, 'USD');
    expect(preview.tax, '20.00');
    expect(preview.service, '5.00');
    expect(preview.total, '90.00');
  });

  test('foreign subtotal and discount do not support total arithmetic', () {
    const parser = ReceiptOcrParser();
    final foreignSubtotal = parser.parse('''
Market USD
Subtotal EUR 90.00
Tax USD 10.00
Total USD 100.00
Total USD 110.00
''');
    expect(foreignSubtotal.currency, 'USD');
    expect(foreignSubtotal.subtotalCurrency, 'EUR');
    expect(foreignSubtotal.subtotalHasExplicitCurrencyEvidence, isTrue);
    expect(foreignSubtotal.total, '110.00');

    final foreignDiscount = parser.parse('''
Market USD
Subtotal USD 100.00
Discount EUR 10.00
Total USD 90.00
Total USD 100.00
''');
    expect(foreignDiscount.discountCurrency, 'EUR');
    expect(foreignDiscount.discountHasExplicitCurrencyEvidence, isTrue);
    expect(foreignDiscount.total, '100.00');
  });

  test('opposing printed markers leave a single header amount unresolved', () {
    const parser = ReceiptOcrParser();
    for (final label in ['Subtotal', 'Tax', 'Service Charge', 'Discount']) {
      final preview = parser.parse('''
Market
Coffee USD 10.00
$label €1.00 USD
Total USD 11.00
''');
      expect(preview.currency, 'USD');
      switch (label) {
        case 'Subtotal':
          expect(preview.subtotalCurrency, isNull);
          expect(preview.subtotalHasExplicitCurrencyEvidence, isTrue);
        case 'Tax':
          expect(preview.taxCurrency, isNull);
          expect(preview.taxHasExplicitCurrencyEvidence, isTrue);
        case 'Service Charge':
          expect(preview.serviceCurrency, isNull);
          expect(preview.serviceHasExplicitCurrencyEvidence, isTrue);
        case 'Discount':
          expect(preview.discountCurrency, isNull);
          expect(preview.discountHasExplicitCurrencyEvidence, isTrue);
      }
    }

    final sameCurrency = parser.parse('''
Market
Tax €1.00 EUR
Total EUR 11.00
''');
    expect(sameCurrency.taxCurrency, 'EUR');
    expect(sameCurrency.taxHasExplicitCurrencyEvidence, isTrue);

    for (final printedTax in ['Tax €+1.00 USD', 'Tax 5% €+1.00 USD']) {
      final opposedSigned = parser.parse('''
Market
Coffee USD 10.00
$printedTax
Total USD 11.00
''');
      expect(opposedSigned.taxCurrency, isNull);
      expect(opposedSigned.taxHasExplicitCurrencyEvidence, isTrue);
    }

    final negative = parser.parse('''
Euro Market
Tax €−1.00
Total EUR 9.00
''');
    expect(negative.tax, '-1.00');
    expect(negative.taxCurrency, 'EUR');

    final detachedNegative = parser.parse('''
Euro Market
Tax €− 1.00
Total EUR 9.00
''');
    expect(detachedNegative.tax, isNull);
    expect(
      detachedNegative.warnings.any(
        (warning) => warning.contains('manual review'),
      ),
      isTrue,
    );

    for (final marker in ['USD', 'JPY', 'Rs', 'kr']) {
      final detachedAfterCode = parser.parse('''
Market
Tax $marker− 1.00
Total USD 9.00
''');
      expect(detachedAfterCode.tax, isNull, reason: marker);
      expect(
        detachedAfterCode.warnings.any(
          (warning) => warning.contains('manual review'),
        ),
        isTrue,
        reason: marker,
      );
    }

    for (final printedTax in [
      'Tax ₱1.00 USD',
      'Tax ₱1.00',
      'Tax ₱+1.00 USD',
      'Tax ₱−1.00 USD',
    ]) {
      final unsupported = parser.parse('''
Market
Coffee USD 10.00
$printedTax
Total USD 11.00
''');
      expect(unsupported.taxCurrency, isNull);
      expect(unsupported.taxHasExplicitCurrencyEvidence, isTrue);
    }
  });

  test('printed total currency outranks repeated foreign item prices', () {
    const parser = ReceiptOcrParser();
    final text = [
      'Market',
      for (var index = 0; index < 12; index++) 'Souvenir $index EUR 1.00',
      'Grand Total USD 12.00',
    ].join('\n');
    final preview = parser.parse(text);

    expect(preview.currency, 'USD');
    expect(preview.total, '12.00');
    expect(preview.items, hasLength(12));
    expect(preview.items.every((item) => item.currency == 'EUR'), isTrue);
  });

  test('unmarked charge columns retain complete usage and rate rows', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Power Utility
Description Usage Rate Charges
Delivery Charge 76 0.4120 31.31
Total Amount Due USD 31.31
''');

    expect(preview.items.map((item) => item.description), ['Delivery Charge']);
    expect(preview.items.single.lineTotal, '31.31');
    expect(preview.items.single.quantity, isNull);
  });

  test('detached charge sign stays unresolved for review', () {
    const parser = ReceiptOcrParser();
    const text = '''
Power Utility
Description Usage Rate Amount
Solar Credit - \$15.00
Total Amount Due \$15.00
''';
    final blocks = [
      _layoutBlock('Power Utility', 0, 0, 20, 350),
      _layoutBlock('Description', 1, 1, 20, 150),
      _layoutBlock('Usage', 2, 1, 170, 210),
      _layoutBlock('Rate', 3, 1, 230, 270),
      _layoutBlock('Amount', 4, 1, 310, 350),
      _layoutBlock('Solar Credit', 5, 2, 20, 160),
      _layoutBlock('-', 6, 2, 290, 300),
      _layoutBlock('\$15.00', 7, 2, 310, 350),
      _layoutBlock('Total Amount Due \$15.00', 8, 3, 20, 350),
    ];
    for (final preview in [
      parser.parse(text),
      parser.parse(text, blocks: blocks),
    ]) {
      expect(preview.items, isEmpty);
      expect(
        preview.warnings,
        contains(
          'Some OCR lines need manual review because no traceable line amount was found.',
        ),
      );
    }
  });

  test('layout charge amount cell with spaced minus stays unresolved', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse(
      'Power Utility\nDescription Usage Rate Amount\nSolar Credit €− 15.00\nTotal Amount Due EUR 15.00',
      blocks: [
        _layoutBlock('Power Utility', 0, 0, 20, 350),
        _layoutBlock('Description', 1, 1, 20, 150),
        _layoutBlock('Usage', 2, 1, 170, 210),
        _layoutBlock('Rate', 3, 1, 230, 270),
        _layoutBlock('Amount', 4, 1, 310, 350),
        _layoutBlock('Solar Credit', 5, 2, 20, 160),
        _layoutBlock('€− 15.00', 6, 2, 310, 350),
        _layoutBlock('Total Amount Due EUR 15.00', 7, 3, 20, 350),
      ],
    );

    expect(preview.items, isEmpty);
    expect(
      preview.warnings,
      contains(
        'Some OCR lines need manual review because no traceable line amount was found.',
      ),
    );
  });

  test('charge sign separated by currency cell stays unresolved', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse(
      'Power Utility\nDescription Usage Rate Amount\nSolar Credit - USD 15.00\nTotal Amount Due USD 15.00',
      blocks: [
        _layoutBlock('Power Utility', 0, 0, 20, 350),
        _layoutBlock('Description', 1, 1, 20, 150),
        _layoutBlock('Usage', 2, 1, 170, 210),
        _layoutBlock('Rate', 3, 1, 230, 270),
        _layoutBlock('Amount', 4, 1, 310, 350),
        _layoutBlock('Solar Credit', 5, 2, 20, 160),
        _layoutBlock('-', 6, 2, 230, 240),
        _layoutBlock('USD', 7, 2, 260, 295),
        _layoutBlock('15.00', 8, 2, 310, 350),
        _layoutBlock('Total Amount Due USD 15.00', 9, 3, 20, 350),
      ],
    );

    expect(preview.items, isEmpty);
    expect(
      preview.warnings,
      contains(
        'Some OCR lines need manual review because no traceable line amount was found.',
      ),
    );
  });

  test('trailing detached sign stays unresolved in item and charge rows', () {
    const parser = ReceiptOcrParser();
    final item = parser.parse(
      'Market USD\nSolar Credit \$15.00 -\nTotal USD 15.00',
      blocks: [
        _layoutBlock('Market USD', 0, 0, 20, 350),
        _layoutBlock('Solar Credit', 1, 1, 20, 160),
        _layoutBlock('\$15.00', 2, 1, 310, 350),
        _layoutBlock('-', 3, 1, 355, 365),
        _layoutBlock('Total USD 15.00', 4, 2, 20, 350),
      ],
    );
    expect(item.items, isEmpty);
    expect(
      item.warnings,
      contains(
        'Some OCR lines need manual review because no traceable line amount was found.',
      ),
    );

    final charge = parser.parse(
      'Power Utility\nDescription Usage Rate Amount\nDelivery Credit 76 0.4120 USD 31.31 -\nTotal Amount Due USD 31.31',
      blocks: [
        _layoutBlock('Power Utility', 0, 0, 20, 350),
        _layoutBlock('Description', 1, 1, 20, 150),
        _layoutBlock('Usage', 2, 1, 170, 210),
        _layoutBlock('Rate', 3, 1, 230, 270),
        _layoutBlock('Amount', 4, 1, 310, 350),
        _layoutBlock('Delivery Credit', 5, 2, 20, 160),
        _layoutBlock('76', 6, 2, 170, 210),
        _layoutBlock('0.4120', 7, 2, 230, 270),
        _layoutBlock('USD', 8, 2, 280, 305),
        _layoutBlock('31.31', 9, 2, 310, 350),
        _layoutBlock('-', 10, 2, 355, 365),
        _layoutBlock('Total Amount Due USD 31.31', 11, 3, 20, 350),
      ],
    );
    expect(charge.items, isEmpty);
    expect(
      charge.warnings,
      contains(
        'Some OCR lines need manual review because no traceable line amount was found.',
      ),
    );
  });

  test('charge sign between rate and currency stays unresolved', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse(
      'Power Utility\nDescription Usage Rate Amount\nSolar Credit 76 0.4120 - USD 31.31\nTotal Amount Due USD 31.31',
      blocks: [
        _layoutBlock('Power Utility', 0, 0, 20, 350),
        _layoutBlock('Description', 1, 1, 20, 150),
        _layoutBlock('Usage', 2, 1, 170, 210),
        _layoutBlock('Rate', 3, 1, 230, 270),
        _layoutBlock('Amount', 4, 1, 310, 350),
        _layoutBlock('Solar Credit', 5, 2, 20, 160),
        _layoutBlock('76', 6, 2, 170, 210),
        _layoutBlock('0.4120', 7, 2, 230, 265),
        _layoutBlock('-', 8, 2, 267, 275),
        _layoutBlock('USD', 9, 2, 280, 305),
        _layoutBlock('31.31', 10, 2, 310, 350),
        _layoutBlock('Total Amount Due USD 31.31', 11, 3, 20, 350),
      ],
    );
    expect(preview.items, isEmpty);
    expect(
      preview.warnings,
      contains(
        'Some OCR lines need manual review because no traceable line amount was found.',
      ),
    );
  });

  test('uppercase adjustment labels do not become currency evidence', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Market USD
Meal USD 90.00
Subtotal USD 90.00
TAX 5.00
SERVICE 0.00
Total USD 90.00
Total USD 95.00
''');

    expect(preview.currency, 'USD');
    expect(preview.tax, '5.00');
    expect(preview.taxCurrency, isNull);
    expect(preview.taxHasExplicitCurrencyEvidence, isFalse);
    expect(preview.total, '95.00');
    expect(preview.reviewHints, isEmpty);
  });

  test('bare dollar tax stays review-only under explicit euro total', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse(r'''
Exchange Cafe
Coffee EUR 9.00
Tax $1.00
Total EUR 10.00
''');

    expect(preview.currency, 'EUR');
    expect(preview.tax, '1.00');
    expect(preview.taxCurrency, isNull);
    expect(preview.taxHasExplicitCurrencyEvidence, isTrue);
  });

  test('tax abbreviation inside priced item does not become tax header', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Euro Deli
Food VAT 5% item EUR 20.00
Wine VAT 20% item EUR 15.00
Subtotal EUR 35.00
VAT 5% EUR 1.00
VAT 20% EUR 3.00
Total EUR 39.00
''');

    expect(preview.currency, 'EUR');
    expect(preview.items.map((item) => item.description).toList(), [
      'Food VAT 5% item',
      'Wine VAT 20% item',
    ]);
    expect(preview.tax, '4.00');
    expect(preview.total, '39.00');
  });

  test('unsupported printed item ISO code stays unresolved', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Exchange Cafe
Coffee XPF 10.00
Total USD 10.00
''');

    expect(preview.currency, 'USD');
    expect(preview.items.single.currency, 'XPF');
    expect(preview.items.single.currencyUnresolved, isTrue);
  });

  test('lowercase unsupported ISO code stays unresolved', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Exchange Cafe
Coffee xpf 10.00
Total USD 10.00
''');

    expect(preview.currency, 'USD');
    expect(preview.items.single.currency, 'XPF');
    expect(preview.items.single.currencyUnresolved, isTrue);
  });

  test('ordinary lowercase currency-code word stays an item word', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Office Shop
Blue pen 10.00
Total USD 10.00
''');

    expect(preview.currency, 'USD');
    expect(preview.items.single.currency, 'USD');
    expect(preview.items.single.currencyUnresolved, isFalse);
    expect(preview.items.single.lineTotal, '10.00');
  });

  test('lowercase supported code word stays an item word', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
BBQ Shop
BBQ rub 10.00
Total USD 10.00
''');

    expect(preview.currency, 'USD');
    expect(preview.items.single.currency, 'USD');
    expect(preview.items.single.currencyUnresolved, isFalse);
    expect(preview.items.single.lineTotal, '10.00');
  });

  test('lowercase item word cannot set receipt-wide currency', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse(r'''
BBQ Shop
BBQ rub 10.00
Total $10.00
''', fallbackCurrency: 'USD');

    expect(preview.currency, 'USD');
    expect(preview.items.single.currency, 'USD');
    expect(preview.items.single.currencyUnresolved, isFalse);
  });

  test('uppercase ambiguous item word cannot outrank total dollar', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse(r'''
BBQ Shop
BBQ RUB 10.00
Total $10.00
''', fallbackCurrency: 'USD');

    expect(preview.currency, 'USD');
    expect(preview.total, '10.00');
    expect(preview.items.single.currency, 'RUB');
  });

  test('supported selected total marker outranks uppercase item word', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
BBQ Shop
BBQ RUB 10.00
Total ₹10.00
''');

    expect(preview.currency, 'INR');
    expect(preview.total, '10.00');
    expect(preview.items.single.currency, 'RUB');
  });

  test('receipt currency follows the selected amount on mixed total', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse(r'''
Market
Coffee USD 10.00
Total €9.00 $10.00
''', fallbackCurrency: 'USD');

    expect(preview.currency, 'USD');
    expect(preview.total, '10.00');
  });

  test('unsupported symbol on selected total stays provisional', () {
    const parser = ReceiptOcrParser();
    for (final printedTotal in ['Total ₱10.00', 'Total USD 9.00 ₱10.00']) {
      final preview = parser.parse('''
Market
Coffee USD 10.00
$printedTotal
''');

      expect(preview.currency, 'USD');
      expect(preview.total, isNull);
    }
  });

  test(
    'attached code total keeps the selected amount and currency together',
    () {
      const parser = ReceiptOcrParser();
      final preview = parser.parse('''
Market
Coffee USD 10.00
Total €9.00 USD10.00
''');

      expect(preview.currency, 'USD');
      expect(preview.total, '10.00');
    },
  );

  test('single total with attached code establishes currency', () {
    const parser = ReceiptOcrParser();
    for (final printedTotal in ['Total USD10.00', 'Total 10.00USD']) {
      final preview = parser.parse('''
Market
Coffee 10.00
$printedTotal
''');

      expect(preview.currency, 'USD');
      expect(preview.total, '10.00');
    }
  });

  test('mixed total with unbound selected dollar stays unresolved', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Market
Coffee 10.00
Total €9.00 \$10.00
''');

    expect(preview.currency, isNull);
    expect(preview.total, isNull);
  });

  test(
    'uppercase item code remains evidence without selected total symbol',
    () {
      const parser = ReceiptOcrParser();
      final preview = parser.parse('''
BBQ Shop
BBQ RUB 10.00
Total 10.00
''');

      expect(preview.currency, 'RUB');
    },
  );

  test('lowercase supported code on total remains printed evidence', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Coffee 10.00
Total rub 10.00
''');

    expect(preview.currency, 'RUB');
  });

  test('earlier unsupported item money does not hide selected USD amount', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Exchange Cafe
Coffee XPF 100 / USD 1.00
Total USD 1.00
''');

    expect(preview.currency, 'USD');
    expect(preview.items.single.currency, 'USD');
    expect(preview.items.single.currencyUnresolved, isFalse);
    expect(preview.items.single.lineTotal, '1.00');
  });

  test('earlier unsupported total does not erase selected supported total', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Exchange Cafe
Coffee USD 1.00
Grand Total XPF 100 / USD 1.00
''');

    expect(preview.currency, 'USD');
    expect(preview.total, '1.00');
  });

  test('selected total symbol outranks an earlier different symbol', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Euro Deli
Food EUR 9.00
Total € / £9.00
''');

    expect(preview.currency, 'EUR');
    expect(preview.total, isNull);
  });

  test('distinct tax rates are not added across printed currencies', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Euro Deli
Food EUR 20.00
VAT 5% EUR 1.00
VAT 20% USD 3.00
Total EUR 21.00
''');

    expect(preview.currency, 'EUR');
    expect(preview.tax, '1.00');
    expect(preview.taxCurrency, 'EUR');
  });

  test('duplicate printed tax rate is not counted twice', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Euro Deli
Food EUR 20.00
VAT 5% EUR 1.00
VAT 5% EUR 1.00
Total EUR 21.00
''');

    expect(preview.currency, 'EUR');
    expect(preview.tax, '1.00');
  });

  test('zero-minor-unit item amount is recoverable from geometry', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse(
      'Market JPY\nCurrency JPY\nRamen 1200 .\nTotal JPY 1200 .',
      blocks: [
        _layoutBlock('Market JPY', 0, 0, 20, 350),
        _layoutBlock('Currency JPY', 1, 1, 20, 350),
        _layoutBlock('Ramen', 2, 2, 20, 120),
        _layoutBlock('1200', 3, 2, 300, 420),
        _layoutBlock('.', 4, 2, 440, 450),
        _layoutBlock('Total JPY 1200', 5, 3, 20, 350),
        _layoutBlock('.', 6, 3, 440, 450),
      ],
    );

    expect(preview.currency, 'JPY');
    expect(preview.merchant, 'Market JPY');
    expect(preview.items.map((item) => item.description), ['Ramen']);
    expect(preview.items.single.lineTotal, '1200');
    expect(preview.items.single.currency, 'JPY');
  });

  test('foreign zero-minor amount cell uses its adjacent currency block', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse(
      'Market USD\nSouvenir JPY 1200 .\nTotal USD 10.00',
      blocks: [
        _layoutBlock('Market USD', 0, 0, 20, 350),
        _layoutBlock('Souvenir', 1, 1, 20, 150),
        _layoutBlock('JPY', 2, 1, 260, 295),
        _layoutBlock('1200', 3, 1, 300, 420),
        _layoutBlock('.', 4, 1, 440, 450),
        _layoutBlock('Total USD 10.00', 5, 2, 20, 350),
      ],
    );

    expect(preview.currency, 'USD');
    expect(preview.items.map((item) => item.description), ['Souvenir']);
    expect(preview.items.single.lineTotal, '1200');
    expect(preview.items.single.currency, 'JPY');
  });

  test('detached sign outside a charge table never becomes positive', () {
    const parser = ReceiptOcrParser();
    const text = 'Market USD\nSolar Credit - \$15.00 .\nTotal USD 15.00';
    final blocks = [
      _layoutBlock('Market USD', 0, 0, 20, 350),
      _layoutBlock('Solar Credit', 1, 1, 20, 160),
      _layoutBlock('-', 2, 1, 290, 300),
      _layoutBlock('\$15.00', 3, 1, 310, 350),
      _layoutBlock('.', 4, 1, 440, 450),
      _layoutBlock('Total USD 15.00', 5, 2, 20, 350),
    ];
    for (final preview in [
      parser.parse(text),
      parser.parse(text, blocks: blocks),
    ]) {
      expect(preview.items, isEmpty);
      expect(
        preview.warnings,
        contains(
          'Some OCR lines need manual review because no traceable line amount was found.',
        ),
      );
    }
  });

  test('charge-table tax summary stays tax beside a tax-named charge', () {
    const parser = ReceiptOcrParser();
    const text = '''
Gas Utility
Description Usage Rate Amount
State Gas Tax 76 \$0.0280 \$2.13
Tax \$0.50
Total Amount Due \$2.63
''';
    final blocks = [
      _layoutBlock('Gas Utility', 0, 0, 20, 350),
      _layoutBlock('Description', 1, 1, 20, 150),
      _layoutBlock('Usage', 2, 1, 170, 210),
      _layoutBlock('Rate', 3, 1, 230, 270),
      _layoutBlock('Amount', 4, 1, 310, 350),
      _layoutBlock('State Gas Tax', 5, 2, 20, 160),
      _layoutBlock('76', 6, 2, 170, 210),
      _layoutBlock('\$0.0280', 7, 2, 230, 270),
      _layoutBlock('\$2.13', 8, 2, 310, 350),
      _layoutBlock('Tax', 9, 3, 20, 160),
      _layoutBlock('\$0.50', 10, 3, 310, 350),
      _layoutBlock('Total Amount Due \$2.63', 11, 4, 20, 350),
    ];

    final withoutLayout = parser.parse(text, fallbackCurrency: 'USD');
    expect(withoutLayout.tax, '0.50');
    expect(withoutLayout.items.map((item) => item.description), [
      'State Gas Tax',
    ]);

    final withLayout = parser.parse(
      text,
      fallbackCurrency: 'USD',
      blocks: blocks,
    );
    expect(withLayout.items.map((item) => item.description), ['State Gas Tax']);
    expect(withLayout.items.single.lineTotal, '2.13');
    expect(withLayout.tax, '0.50');
  });

  test('labeled bill columns keep service and rated taxes out of items', () {
    const text = '''
Water Utility
Charges for this period
Description Amount
Water Charge (25 m3 @ \$1.80) \$45.00
Sewer Charge (25 m3 @ \$2.10) \$52.50
Service Fee \$8.00
State Water Tax (2.5%) \$2.64
Local Utility Tax (1.5%) \$1.58
Total Amount Due \$109.72
''';
    final blocks = [
      _layoutBlock('Water Utility', 0, 0, 20, 350),
      _layoutBlock('Charges for this period', 1, 1, 20, 350),
      _layoutBlock('Description', 2, 2, 20, 200),
      _layoutBlock('Amount', 3, 2, 300, 350),
      _layoutBlock('Water Charge (25 m3 @ \$1.80)', 4, 3, 20, 260),
      _layoutBlock('\$45.00', 5, 3, 300, 350),
      _layoutBlock('Sewer Charge (25 m3 @ \$2.10)', 6, 4, 20, 260),
      _layoutBlock('\$52.50', 7, 4, 300, 350),
      _layoutBlock('Service Fee', 8, 5, 20, 200),
      _layoutBlock('\$8.00', 9, 5, 300, 350),
      _layoutBlock('State Water Tax (2.5%)', 10, 6, 20, 260),
      _layoutBlock('\$2.64', 11, 6, 300, 350),
      _layoutBlock('Local Utility Tax (1.5%)', 12, 7, 20, 260),
      _layoutBlock('\$1.58', 13, 7, 300, 350),
      _layoutBlock('Total Amount Due \$109.72', 14, 8, 20, 350),
    ];

    final preview = const ReceiptOcrParser().parse(
      text,
      fallbackCurrency: 'USD',
      blocks: blocks,
    );
    expect(preview.items.map((item) => item.description), [
      'Water Charge (25 m3 @ \$1.80)',
      'Sewer Charge (25 m3 @ \$2.10)',
    ]);
    expect(preview.service, '8.00');
    expect(preview.tax, '4.22');
    expect(preview.total, '109.72');
    expect(preview.reviewHints, isEmpty);
  });

  test('charge-table account summaries stay out of itemized charges', () {
    const parser = ReceiptOcrParser();
    const text = '''
Gas Utility
Description Usage Rate Amount
Previous Balance \$72.41
Payments Received -\$72.41
Service Plan \$12.00
Total Amount Due \$12.00
''';
    final blocks = [
      _layoutBlock('Gas Utility', 0, 0, 20, 350),
      _layoutBlock('Description', 1, 1, 20, 150),
      _layoutBlock('Usage', 2, 1, 170, 210),
      _layoutBlock('Rate', 3, 1, 230, 270),
      _layoutBlock('Amount', 4, 1, 310, 350),
      _layoutBlock('Previous Balance', 5, 2, 20, 160),
      _layoutBlock('\$72.41', 6, 2, 310, 350),
      _layoutBlock('Payments Received', 7, 3, 20, 160),
      _layoutBlock('-\$72.41', 8, 3, 310, 350),
      _layoutBlock('Service Plan', 9, 4, 20, 160),
      _layoutBlock('\$12.00', 10, 4, 310, 350),
      _layoutBlock('Total Amount Due \$12.00', 11, 5, 20, 350),
    ];

    final unlocated = parser.parse(text, fallbackCurrency: 'USD');
    expect(unlocated.items, isEmpty);
    expect(unlocated.total, '12.00');
    expect(
      unlocated.warnings.any((warning) => warning.contains('Some OCR lines')),
      isTrue,
    );
    final located = parser.parse(text, fallbackCurrency: 'USD', blocks: blocks);
    expect(located.items.map((item) => item.description), ['Service Plan']);
    expect(located.items.single.lineTotal, '12.00');
    expect(located.total, '12.00');
    expect(
      located.warnings.any((warning) => warning.contains('Some OCR lines')),
      isFalse,
    );
  });

  test('layout monetary cells recover items from noisy flattened rows', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse(
      '''
Sklep Warszawa
Zupa 35,50 zł .
Kawa 12,00 zł .
Cash 60,00 zł .
Change 12,50 zł .
Razem 47,50 zł .
''',
      blocks: [
        _layoutBlock('Sklep Warszawa', 0, 0, 20, 350),
        _layoutBlock('Zupa', 1, 1, 20, 120),
        _layoutBlock('35,50 zł', 2, 1, 300, 420),
        _layoutBlock('.', 3, 1, 440, 450),
        _layoutBlock('Kawa', 4, 2, 20, 120),
        _layoutBlock('12,00 zł', 5, 2, 300, 420),
        _layoutBlock('.', 6, 2, 440, 450),
        _layoutBlock('Cash', 7, 3, 20, 120),
        _layoutBlock('60,00 zł', 8, 3, 300, 420),
        _layoutBlock('.', 9, 3, 440, 450),
        _layoutBlock('Change', 10, 4, 20, 120),
        _layoutBlock('12,50 zł', 11, 4, 300, 420),
        _layoutBlock('.', 12, 4, 440, 450),
        _layoutBlock('Razem', 13, 5, 20, 120),
        _layoutBlock('47,50 zł', 14, 5, 300, 420),
        _layoutBlock('.', 15, 5, 440, 450),
      ],
    );

    expect(preview.currency, 'PLN');
    expect(preview.items.map((item) => item.description), ['Zupa', 'Kawa']);
    expect(preview.items.map((item) => item.lineTotal), ['35.50', '12.00']);
  });

  test('layout monetary fallback respects right-to-left description side', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse(
      '''
متجر دبي
قهوة 12.50 د.إ .
الإجمالي 12.50 د.إ .
''',
      blocks: [
        _layoutBlock('متجر دبي', 0, 0, 200, 400, textDirection: 'rtl'),
        _layoutBlock('قهوة', 1, 1, 300, 400, textDirection: 'rtl'),
        _layoutBlock('12.50 د.إ', 2, 1, 30, 150, textDirection: 'ltr'),
        _layoutBlock('.', 3, 1, 10, 20),
        _layoutBlock('الإجمالي', 4, 2, 300, 400, textDirection: 'rtl'),
        _layoutBlock('12.50 د.إ', 5, 2, 30, 150, textDirection: 'ltr'),
        _layoutBlock('.', 6, 2, 10, 20),
      ],
    );

    expect(preview.items.map((item) => item.description), ['قهوة']);
    expect(preview.items.single.lineTotal, '12.50');
    expect(preview.items.single.currency, 'AED');
  });

  test('layout fallback does not promote a noisy postal row to an item', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse(
      '''
Pike Deli
Seattle WA 98101 .
Sandwich 12.50 .
Total 12.50 .
''',
      blocks: [
        _layoutBlock('Pike Deli', 0, 0, 20, 350),
        _layoutBlock('Seattle WA', 1, 1, 20, 170),
        _layoutBlock('98101', 2, 1, 300, 420),
        _layoutBlock('.', 3, 1, 440, 450),
        _layoutBlock('Sandwich', 4, 2, 20, 170),
        _layoutBlock('12.50', 5, 2, 300, 420),
        _layoutBlock('.', 6, 2, 440, 450),
        _layoutBlock('Total', 7, 3, 20, 170),
        _layoutBlock('12.50', 8, 3, 300, 420),
        _layoutBlock('.', 9, 3, 440, 450),
      ],
    );

    expect(preview.items.map((item) => item.description), ['Sandwich']);
  });

  test('layout fallback preserves a foreign item cell currency', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse(
      '''
Corner Cafe
Coffee USD 10.00
Souvenir EUR 9.00 .
Total USD 10.00
''',
      blocks: [
        _layoutBlock('Corner Cafe', 0, 0, 20, 350),
        _layoutBlock('Coffee USD 10.00', 1, 1, 20, 350),
        _layoutBlock('Souvenir', 2, 2, 20, 150),
        _layoutBlock('EUR 9.00', 3, 2, 300, 420),
        _layoutBlock('.', 4, 2, 440, 450),
        _layoutBlock('Total USD 10.00', 5, 3, 20, 350),
      ],
    );

    expect(preview.currency, 'USD');
    expect(preview.items.last.description, 'Souvenir');
    expect(preview.items.last.currency, 'EUR');
    expect(preview.items.last.lineTotal, '9.00');
    expect(preview.reviewHints, [
      'Some item prices use a different currency from the receipt. Review before applying.',
    ]);
  });

  test('layout fallback rejects bare identifier amounts', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse(
      '''
Corner Cafe
Member ID 123456 .
Coffee 12.50 .
Total 12.50
''',
      blocks: [
        _layoutBlock('Corner Cafe', 0, 0, 20, 350),
        _layoutBlock('Member ID', 1, 1, 20, 150),
        _layoutBlock('123456', 2, 1, 300, 420),
        _layoutBlock('.', 3, 1, 440, 450),
        _layoutBlock('Coffee', 4, 2, 20, 150),
        _layoutBlock('12.50', 5, 2, 300, 420),
        _layoutBlock('.', 6, 2, 440, 450),
        _layoutBlock('Total 12.50', 7, 3, 20, 350),
      ],
    );

    expect(preview.items.map((item) => item.description), ['Coffee']);
    expect(preview.items.single.lineTotal, '12.50');
  });

  test('account balance summaries do not become geometry-backed items', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse(
      '''
Gas Utility
Previous Balance \$72.41 .
Payments Received -\$72.41 .
Balance Forward \$0.00 .
Current Gas Charges \$86.27 .
Service Plan \$12.00 .
Total Amount Due \$86.27 .
''',
      blocks: [
        _layoutBlock('Gas Utility', 0, 0, 20, 350),
        _layoutBlock('Previous Balance', 1, 1, 20, 180),
        _layoutBlock('\$72.41', 2, 1, 300, 420),
        _layoutBlock('.', 3, 1, 440, 450),
        _layoutBlock('Payments Received', 4, 2, 20, 180),
        _layoutBlock('-\$72.41', 5, 2, 300, 420),
        _layoutBlock('.', 6, 2, 440, 450),
        _layoutBlock('Balance Forward', 7, 3, 20, 180),
        _layoutBlock('\$0.00', 8, 3, 300, 420),
        _layoutBlock('.', 9, 3, 440, 450),
        _layoutBlock('Current Gas Charges', 10, 4, 20, 180),
        _layoutBlock('\$86.27', 11, 4, 300, 420),
        _layoutBlock('.', 12, 4, 440, 450),
        _layoutBlock('Service Plan', 13, 5, 20, 180),
        _layoutBlock('\$12.00', 14, 5, 300, 420),
        _layoutBlock('.', 15, 5, 440, 450),
        _layoutBlock('Total Amount Due', 16, 6, 20, 180),
        _layoutBlock('\$86.27', 17, 6, 300, 420),
        _layoutBlock('.', 18, 6, 440, 450),
      ],
    );

    expect(preview.items.map((item) => item.description), ['Service Plan']);
    expect(preview.items.single.lineTotal, '12.00');
    expect(preview.total, '86.27');
  });

  test('layout fallback excludes localized tender and change rows', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse(
      '''
Sklep Warszawa
Zupa 35,50 zł .
Gotówka 60,00 zł .
Reszta 24,50 zł .
Razem 35,50 zł .
''',
      blocks: [
        _layoutBlock('Sklep Warszawa', 0, 0, 20, 350),
        _layoutBlock('Zupa', 1, 1, 20, 120),
        _layoutBlock('35,50 zł', 2, 1, 300, 420),
        _layoutBlock('.', 3, 1, 440, 450),
        _layoutBlock('Gotówka', 4, 2, 20, 120),
        _layoutBlock('60,00 zł', 5, 2, 300, 420),
        _layoutBlock('.', 6, 2, 440, 450),
        _layoutBlock('Reszta', 7, 3, 20, 120),
        _layoutBlock('24,50 zł', 8, 3, 300, 420),
        _layoutBlock('.', 9, 3, 440, 450),
        _layoutBlock('Razem', 10, 4, 20, 120),
        _layoutBlock('35,50 zł', 11, 4, 300, 420),
        _layoutBlock('.', 12, 4, 440, 450),
      ],
    );

    expect(preview.items.map((item) => item.description), ['Zupa']);
    expect(preview.items.single.lineTotal, '35.50');
  });

  test('layout fallback selects a priced cell beside bare quantity', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse(
      'Market\nApples 2 \$3.00 .\nTotal \$3.00 .',
      blocks: [
        _layoutBlock('Market', 0, 0, 20, 350),
        _layoutBlock('Apples', 1, 1, 20, 120),
        _layoutBlock('2', 2, 1, 170, 185),
        _layoutBlock('\$3.00', 3, 1, 300, 420),
        _layoutBlock('.', 4, 1, 440, 450),
        _layoutBlock('Total', 5, 2, 20, 120),
        _layoutBlock('\$3.00', 6, 2, 300, 420),
        _layoutBlock('.', 7, 2, 440, 450),
      ],
    );

    expect(preview.items.map((item) => item.description), ['Apples']);
    expect(preview.items.single.lineTotal, '3.00');
  });

  test('layout fallback normalizes native-script amount cells', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse(
      'متجر دبي\nقهوة ١٢٫٥٠ د.إ .\nالإجمالي ١٢٫٥٠ د.إ .',
      blocks: [
        _layoutBlock('متجر دبي', 0, 0, 200, 400, textDirection: 'rtl'),
        _layoutBlock('قهوة', 1, 1, 300, 400, textDirection: 'rtl'),
        _layoutBlock('١٢٫٥٠ د.إ', 2, 1, 30, 150, textDirection: 'ltr'),
        _layoutBlock('.', 3, 1, 10, 20),
        _layoutBlock('الإجمالي', 4, 2, 300, 400, textDirection: 'rtl'),
        _layoutBlock('١٢٫٥٠ د.إ', 5, 2, 30, 150, textDirection: 'ltr'),
        _layoutBlock('.', 6, 2, 10, 20),
      ],
    );

    expect(preview.items.map((item) => item.description), ['قهوة']);
    expect(preview.items.single.lineTotal, '12.50');
    expect(preview.items.single.currency, 'AED');
  });

  test('layout fallback pairs split foreign currency with amount', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse(
      'Corner Cafe\nCoffee USD 10.00\nSouvenir EUR 9.00 .\nTotal USD 10.00',
      blocks: [
        _layoutBlock('Corner Cafe', 0, 0, 20, 350),
        _layoutBlock('Coffee USD 10.00', 1, 1, 20, 350),
        _layoutBlock('Souvenir', 2, 2, 20, 150),
        _layoutBlock('EUR', 3, 2, 260, 295),
        _layoutBlock('9.00', 4, 2, 300, 420),
        _layoutBlock('.', 5, 2, 440, 450),
        _layoutBlock('Total USD 10.00', 6, 3, 20, 350),
      ],
    );

    expect(preview.items.last.description, 'Souvenir');
    expect(preview.items.last.currency, 'EUR');
    expect(preview.items.last.lineTotal, '9.00');
    expect(preview.reviewHints, [
      'Some item prices use a different currency from the receipt. Review before applying.',
    ]);
  });

  test('long charge tables retain late rows until a printed total', () {
    const parser = ReceiptOcrParser();
    final chargeRows = List.generate(
      24,
      (index) => 'Charge ${index + 1} 2 therms \$0.5000 \$1.00',
    );
    final text = [
      'Harbor Utility',
      'Description Usage Rate Amount',
      ...chargeRows,
      'Total Amount Due \$24.00',
    ].join('\n');
    final flattened = parser.parse(text, fallbackCurrency: 'USD');
    expect(flattened.items, hasLength(24));
    expect(flattened.items.last.description, 'Charge 24');
    expect(flattened.items.last.lineTotal, '1.00');

    final blocks = <ReceiptOcrBlockEvidence>[
      _layoutBlock('Harbor Utility', 0, 0, 20, 350),
      _layoutBlock('Description', 1, 1, 20, 150),
      _layoutBlock('Usage', 2, 1, 170, 210),
      _layoutBlock('Rate', 3, 1, 230, 270),
      _layoutBlock('Amount', 4, 1, 310, 350),
      for (var index = 0; index < 24; index++) ...[
        _layoutBlock('Charge ${index + 1}', 5 + index * 4, index + 2, 20, 150),
        _layoutBlock('2 therms', 6 + index * 4, index + 2, 170, 210),
        _layoutBlock('\$0.5000', 7 + index * 4, index + 2, 230, 270),
        _layoutBlock('\$1.00', 8 + index * 4, index + 2, 310, 350),
      ],
      _layoutBlock('Total Amount Due \$24.00', 101, 26, 20, 350),
    ];
    final layout = parser.parse(text, fallbackCurrency: 'USD', blocks: blocks);
    expect(layout.items, hasLength(24));
    expect(layout.items.last.description, 'Charge 24');
    expect(layout.items.last.lineTotal, '1.00');
  });

  test('parser treats a city ZIP row as metadata only beside an address', () {
    const parser = ReceiptOcrParser();
    final addressed = parser.parse('''
Pike Deli
123 Main St
Suite 2
Seattle 98101
Coffee USD 18.20
Total USD 18.20
''');
    final standalone = parser.parse('''
Pike Deli
Seattle 98101
Total USD 98101.00
''');

    expect(addressed.merchant, 'Pike Deli');
    expect(addressed.items.map((item) => item.description), ['Coffee']);
    expect(standalone.items.map((item) => item.description), ['Seattle']);
  });

  test('USD postal context requires an address-shaped row', () {
    const parser = ReceiptOcrParser();
    final productCode = parser.parse('''
Corner Shop
Widget CA 12345
Coffee \$12.00
Total \$12.00
''', fallbackCurrency: 'USD');
    expect(productCode.currency, 'USD');
    expect(
      productCode.currencyProvenance,
      ReceiptOcrCurrencyProvenance.defaultFallback,
    );

    final address = parser.parse('''
Corner Shop
123 Main St
Riverside CA 92507
Coffee \$12.00
Total \$12.00
''', fallbackCurrency: 'USD');
    expect(address.currency, 'USD');
    expect(
      address.currencyProvenance,
      ReceiptOcrCurrencyProvenance.contextInferred,
    );
  });

  test('repeated address and mixed due date rows stay out of items', () {
    final preview = const ReceiptOcrParser().parse('''
Northport Supply
Northport, CA 92507 Northport, CA 92507
Customer Due Date: Mar 25, 2025
Notebook 12.00
Total USD 12.00
''');
    expect(preview.items.map((item) => item.description), ['Notebook']);
    expect(preview.items.single.lineTotal, '12.00');
  });

  test(
    'qualified shipping tax and payment rows keep their financial roles',
    () {
      final preview = const ReceiptOcrParser().parse('''
Municipal Market
Notebook 12.00
Subtotal 12.00
County Utilities Tax (5%) 0.60
Shipping (Express) 2.00
Total USD 14.60
Amount Paid: USD 14.60
Remaining Balance: USD 0.00
''');
      expect(preview.items.map((item) => item.description), ['Notebook']);
      expect(preview.tax, '0.60');
      expect(preview.shipping, '2.00');
    },
  );

  test('metadata words inside priced product names remain merchandise', () {
    final preview = const ReceiptOcrParser().parse('''
Bookshop
Shipping Container Kit 19.00
Shipping (Container) 7.00
Delivery (Pizza) 12.00
Tax (Board Game) 9.00
Tax Planning Guide 9.00
Due Date Planner 4.00
Remaining Balance Workbook 5.00
Subtotal USD 65.00
Total USD 65.00
''');
    expect(preview.items.map((item) => item.description), [
      'Shipping Container Kit',
      'Shipping (Container)',
      'Delivery (Pizza)',
      'Tax (Board Game)',
      'Tax Planning Guide',
      'Due Date Planner',
      'Remaining Balance Workbook',
    ]);
  });

  test(
    'a priced parenthesized product after a subtotal is not a delivery fee',
    () {
      final preview = const ReceiptOcrParser().parse('''
Bookshop
Notebook 5.00
Subtotal 5.00
Delivery (Pizza) 12.00
Total USD 17.00
''');
      expect(preview.items.map((item) => item.description), [
        'Notebook',
        'Delivery (Pizza)',
      ]);
      expect(preview.shipping, isNull);
    },
  );

  test('post-subtotal charge-table rows remain traceable items', () {
    final preview = const ReceiptOcrParser().parse('''
Market
Widget USD 5.00
Subtotal USD 5.00
Description Usage Amount
Energy Surcharge USD 1.00
Shipping (Express) USD 2.00
Total USD 8.00
''');
    expect(preview.items.map((item) => item.description), [
      'Widget',
      'Energy Surcharge',
      'Shipping (Express)',
    ]);
    expect(preview.items.map((item) => item.lineTotal), [
      '5.00',
      '1.00',
      '2.00',
    ]);
    expect(preview.shipping, isNull);
  });

  test('post-subtotal descriptive tax remains an adjustment', () {
    for (final taxLabel in ['Tax (Reduced)', 'Tax (Federal)']) {
      final preview = const ReceiptOcrParser().parse('''
Market
Notebook 12.00
Subtotal 12.00
$taxLabel 0.60
Total USD 12.60
''');
      expect(preview.items.map((item) => item.description), ['Notebook']);
      expect(preview.tax, '0.60');
    }
  });

  test('parenthesized distinct tax rates aggregate after subtotal', () {
    final preview = const ReceiptOcrParser().parse('''
Utility
Water Usage USD 10.00
Subtotal USD 10.00
County Utilities Tax (5%) USD 0.50
Local Utilities Tax (2%) USD 0.20
Total USD 10.70
''');
    expect(preview.items.map((item) => item.description), ['Water Usage']);
    expect(preview.tax, '0.70');
  });

  test('tax-named product after subtotal remains merchandise', () {
    final preview = const ReceiptOcrParser().parse('''
Bookshop
Notebook USD 5.00
Subtotal USD 5.00
Tax (Board Game) USD 9.00
Total USD 14.00
''');
    expect(preview.items.map((item) => item.description), [
      'Notebook',
      'Tax (Board Game)',
    ]);
    expect(preview.tax, isNull);
  });

  test(
    'pre-subtotal flat surcharge remains an item outside a charge table',
    () {
      final preview = const ReceiptOcrParser().parse('''
Utility
Energy Surcharge 1.00
Subtotal 1.00
Total USD 1.00
''');
      expect(preview.items.map((item) => item.description), [
        'Energy Surcharge',
      ]);
      expect(preview.items.single.lineTotal, '1.00');
    },
  );

  test('tax-named charge-table lines retain priced item evidence', () {
    final preview = const ReceiptOcrParser().parse('''
Utility
Description Usage Amount
Energy Tax USD 1.00
Total USD 1.00
''');
    expect(preview.items.map((item) => item.description), ['Energy Tax']);
    expect(preview.items.single.lineTotal, '1.00');
    expect(preview.tax, isNull);
  });

  test('rated tax-named charge-table item retains priced evidence', () {
    final preview = const ReceiptOcrParser().parse('''
Utility
Description Usage Amount
Energy Tax (5%) USD 1.00
Total USD 1.00
''');
    expect(preview.items.map((item) => item.description), ['Energy Tax (5%)']);
    expect(preview.items.single.lineTotal, '1.00');
    expect(preview.tax, isNull);
    expect(preview.adjustmentsComplete, isFalse);
    expect(
      preview.incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.ambiguousChargeTable),
    );
    expect(
      preview.incompleteAdjustmentReasons.toSet().length,
      preview.incompleteAdjustmentReasons.length,
    );
    expect(preview.warnings, contains(contains('may be an item or tax')));
  });

  test('rated tax row unresolved by rate and amount keeps unique reasons', () {
    final preview = const ReceiptOcrParser().parse('''
Utility
Description Usage Rate Amount
Energy Tax (5%) 620 USD 0.15
Total USD 0.15
''');
    expect(
      preview.incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.ambiguousChargeTable),
    );
    expect(
      preview.incompleteAdjustmentReasons.toSet().length,
      preview.incompleteAdjustmentReasons.length,
    );
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.warnings, contains(contains('may be an item or tax')));
    final serializedReasons =
        jsonDecode(
              jsonEncode(
                preview.incompleteAdjustmentReasons
                    .map((reason) => reason.name)
                    .toList(),
              ),
            )
            as List<dynamic>;
    expect(serializedReasons.toSet().length, serializedReasons.length);
  });

  test('amount-column geometry excludes adjacent usage-chart numbers', () {
    ReceiptOcrPreview parse({
      bool conflictingMoney = false,
      bool rateCurrency = false,
    }) {
      final blocks = <ReceiptOcrBlockEvidence>[
        _layoutBlock('CURRENT CHARGES DETAIL', 0, 0, 20, 400),
        _layoutBlock('USAGE SUMMARY', 1, 0, 740, 980),
        _layoutBlock('Service', 2, 1, 20, 150),
        _layoutBlock('Usage', 3, 1, 275, 335),
        _layoutBlock('Rate', 4, 1, 420, 475),
        _layoutBlock('Amount', 5, 1, 600, 665),
        _layoutBlock('Electricity (kWh)', 6, 1, 755, 900),
        _layoutBlock('Electricity', 7, 2, 20, 150),
        _layoutBlock('62 kWh', 8, 2, 275, 335),
        _layoutBlock('USD 0.1580/kWh', 9, 2, 420, 525),
        _layoutBlock('USD 9.80', 10, 2, 600, 665),
        _layoutBlock('800', 11, 2, 710, 750),
        _layoutBlock('Water', 12, 3, 20, 150),
        _layoutBlock('900 gallons', 13, 3, 275, 350),
        _layoutBlock('USD 0.0055/gallon', 14, 3, 420, 540),
        _layoutBlock('USD 4.95', 15, 3, 600, 665),
        _layoutBlock('600', 16, 3, 710, 750),
        _layoutBlock('Subtotal', 17, 4, 20, 150),
        _layoutBlock('USD 14.75', 18, 4, 600, 665),
        _layoutBlock(conflictingMoney ? 'USD 999.00' : '200', 19, 4, 710, 780),
        _layoutBlock('City Utilities Tax (5%)', 20, 5, 20, 260),
        if (rateCurrency) _layoutBlock('USD 0.05', 29, 5, 420, 475),
        _layoutBlock('USD 0.74', 21, 5, 600, 665),
        _layoutBlock('0', 22, 5, 710, 750),
        _layoutBlock('Oct Nov Dec', 23, 5, 780, 970),
        _layoutBlock('State Energy Surcharge (1.5%)', 24, 6, 20, 300),
        _layoutBlock('USD 0.22', 25, 6, 600, 665),
        _layoutBlock('2024 2025', 26, 6, 780, 970),
        _layoutBlock('Total Current Charges', 27, 7, 20, 250),
        _layoutBlock('USD 15.71', 28, 7, 600, 665),
      ];
      final rows = <int, List<String>>{};
      for (final block in blocks) {
        (rows[block.row] ??= <String>[]).add(block.text);
      }
      return const ReceiptOcrParser().parse(
        rows.values.map((parts) => parts.join(' ')).join('\n'),
        fallbackCurrency: 'USD',
        blocks: blocks,
      );
    }

    final preview = parse();
    expect(preview.subtotal, '14.75');
    expect(preview.tax, '0.74');
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.incompleteAdjustmentReasons, isNotEmpty);

    final withRateCurrency = parse(rateCurrency: true);
    expect(withRateCurrency.tax, '0.74');

    final conflicting = parse(conflictingMoney: true);
    expect(conflicting.subtotal, isNull);
    expect(conflicting.adjustmentsComplete, isFalse);
  });

  test('aligned letterhead needs a repeated full issuer block', () {
    ReceiptOcrPreview parse(
      String footer, {
      String? footerSection,
      bool sameFooterRow = false,
    }) {
      final blocks = <ReceiptOcrBlockEvidence>[
        _layoutBlock('Northbank', 0, 0, 180, 330),
        _layoutBlock('Powering', 1, 0, 870, 1030),
        _layoutBlock('100 Main Avenue', 2, 1, 600, 800),
        _layoutBlock('Power & Water', 3, 2, 180, 330),
        _layoutBlock('Communities', 4, 2, 870, 1030),
        _layoutBlock('UTILITY BILL', 5, 3, 20, 300),
        _layoutBlock('Electricity USD 10.00', 6, 4, 20, 340),
        _layoutBlock('Total USD 10.00', 7, 5, 20, 340),
        if (footerSection != null) _layoutBlock(footerSection, 8, 6, 20, 370),
        _layoutBlock(footer, 9, footerSection == null ? 6 : 7, 20, 370),
        if (sameFooterRow)
          _layoutBlock('Bill To', 11, footerSection == null ? 6 : 7, 420, 520),
        _layoutBlock(
          'Reliable Service',
          10,
          footerSection == null ? 6 : 7,
          870,
          1030,
        ),
      ];
      final rows = <int, List<String>>{};
      for (final block in blocks) {
        (rows[block.row] ??= <String>[]).add(block.text);
      }
      return const ReceiptOcrParser().parse(
        rows.values.map((parts) => parts.join(' ')).join('\n'),
        blocks: blocks,
        fallbackCurrency: 'USD',
      );
    }

    expect(
      parse('Northbank Power & Water').merchant,
      'Northbank Power & Water',
    );
    expect(
      parse('Northbank Power & Electric').merchant,
      isNot('Northbank Power & Water'),
    );
    for (final section in ['Bill To', 'Pay To', 'Remit To']) {
      expect(
        parse('Northbank Power & Water', footerSection: section).merchant,
        isNot('Northbank Power & Water'),
        reason: '$section cannot corroborate the issuer from a later section',
      );
    }
    expect(
      parse('Northbank Power & Water', sameFooterRow: true).merchant,
      isNot('Northbank Power & Water'),
    );
  });

  test('unfamiliar rated tax summary remains reviewable', () {
    final preview = const ReceiptOcrParser().parse('''
Market
Description Amount
Widget USD 5.00
Luxury Tax (5%) USD 0.50
Total USD 5.50
''');
    expect(preview.items.map((item) => item.description), ['Widget']);
    expect(preview.adjustmentsComplete, isFalse);
    expect(
      preview.incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.ambiguousChargeTable),
    );
    expect(preview.warnings, contains(contains('may be an item or tax')));
  });

  test('standard multiword rated tax remains a tax adjustment', () {
    final preview = const ReceiptOcrParser().parse('''
Market
Description Amount
Widget USD 5.00
Value Added Tax (5%) USD 0.25
Total USD 5.25
''');
    expect(preview.items.map((item) => item.description), ['Widget']);
    expect(preview.tax, '0.25');
    expect(
      preview.warnings,
      isNot(contains(contains('may be an item or tax'))),
    );
  });

  test('rated sales tax in a charge table remains a tax adjustment', () {
    final preview = const ReceiptOcrParser().parse('''
Market
Description Amount
Widget USD 5.00
Sales Tax (5%) USD 0.25
Total USD 5.25
''');
    expect(preview.items.map((item) => item.description), ['Widget']);
    expect(preview.tax, '0.25');
  });

  test('parenthesized included tax stays out of merchandise', () {
    final preview = const ReceiptOcrParser().parse('''
Market
Widget USD 10.00
Subtotal USD 9.50
Tax (Included) USD 0.50
Total USD 10.00
''');
    expect(preview.items.map((item) => item.description), ['Widget']);
    expect(preview.tax, '0.50');
    expect(preview.taxIncludedInTotal, isTrue);
  });

  test('tourism tax qualifier remains a printed tax adjustment', () {
    final preview = const ReceiptOcrParser().parse('''
Hotel
Room USD 5.00
Subtotal USD 5.00
Tax (Tourism) USD 0.50
Total USD 5.50
''');
    expect(preview.items.map((item) => item.description), ['Room']);
    expect(preview.tax, '0.50');
  });

  test('unknown single-word tax qualifier remains review evidence', () {
    final preview = const ReceiptOcrParser().parse('''
Market
Widget USD 5.00
Subtotal USD 5.00
Tax (Ecology) USD 0.50
Total USD 5.50
''');
    expect(preview.items.map((item) => item.description), ['Widget']);
    expect(preview.tax, isNull);
    expect(
      preview.incompleteAdjustmentReasons,
      contains(
        ReceiptOcrIncompleteAdjustmentReason.unclassifiedAdjustmentLabel,
      ),
    );
  });

  test('unknown tax levy qualifier remains review evidence', () {
    final preview = const ReceiptOcrParser().parse('''
Market
Widget USD 5.00
Subtotal USD 5.00
Tax (Environmental Levy) USD 0.50
Total USD 5.50
''');
    expect(preview.items.map((item) => item.description), ['Widget']);
    expect(preview.tax, isNull);
    expect(
      preview.incompleteAdjustmentReasons,
      contains(
        ReceiptOcrIncompleteAdjustmentReason.unclassifiedAdjustmentLabel,
      ),
    );
  });

  test(
    'layout charge table retains rated tax-named items with or without usage',
    () {
      for (final withUsage in [false, true]) {
        final offset = withUsage ? 0 : 1;
        final header = withUsage
            ? 'Description Usage Amount'
            : 'Description Amount';
        final row = withUsage
            ? 'Energy Tax (5%) 1 USD 1.00'
            : 'Energy Tax (5%) USD 1.00';
        final blocks = [
          _layoutBlock('Utility', 0, 0, 20, 350),
          if (!withUsage)
            _layoutBlock('Charges for this period', 1, 1, 20, 350),
          _layoutBlock('Description', 1 + offset, 1 + offset, 20, 160),
          if (withUsage) _layoutBlock('Usage', 2, 1, 175, 225),
          _layoutBlock(
            'Amount',
            (withUsage ? 3 : 2) + offset,
            1 + offset,
            300,
            350,
          ),
          _layoutBlock(
            'Energy Tax (5%)',
            (withUsage ? 4 : 3) + offset,
            2 + offset,
            20,
            160,
          ),
          if (withUsage) _layoutBlock('1', 5, 2, 175, 225),
          _layoutBlock(
            'USD 1.00',
            (withUsage ? 6 : 4) + offset,
            2 + offset,
            300,
            350,
          ),
          _layoutBlock(
            'Total',
            (withUsage ? 7 : 5) + offset,
            3 + offset,
            20,
            160,
          ),
          _layoutBlock(
            'USD 1.00',
            (withUsage ? 8 : 6) + offset,
            3 + offset,
            300,
            350,
          ),
        ];
        final preview = const ReceiptOcrParser().parse(
          'Utility\n${withUsage ? '' : 'Charges for this period\n'}$header\n$row\nTotal USD 1.00',
          blocks: blocks,
        );
        expect(
          preview.items.map((item) => item.description),
          ['Energy Tax (5%)'],
          reason: 'withUsage=$withUsage',
        );
        expect(preview.items.single.lineTotal, '1.00');
        expect(preview.tax, isNull);
      }
    },
  );

  test('layout sales-tax summary stays an adjustment beside priced items', () {
    final preview = const ReceiptOcrParser().parse(
      '''
Market
Charges for this period
Description Amount
Widget USD 5.00
Sales Tax (5%) USD 0.25
Total USD 5.25
''',
      blocks: [
        _layoutBlock('Market', 0, 0, 20, 350),
        _layoutBlock('Charges for this period', 1, 1, 20, 350),
        _layoutBlock('Description', 2, 2, 20, 160),
        _layoutBlock('Amount', 3, 2, 300, 350),
        _layoutBlock('Widget', 4, 3, 20, 160),
        _layoutBlock('USD 5.00', 5, 3, 300, 350),
        _layoutBlock('Sales Tax (5%)', 6, 4, 20, 160),
        _layoutBlock('USD 0.25', 7, 4, 300, 350),
        _layoutBlock('Total', 8, 5, 20, 160),
        _layoutBlock('USD 5.25', 9, 5, 300, 350),
      ],
    );
    expect(preview.items.map((item) => item.description), ['Widget']);
    expect(preview.tax, '0.25');
  });

  test('numeric usage keeps rated tax-named charge rows reviewable', () {
    for (final label in [
      'State Gas Tax',
      'Sales Tax',
      'Value Added Tax',
      'Goods and Services Tax',
      'Energy Tax',
    ]) {
      final preview = const ReceiptOcrParser().parse(
        'Utility\nDescription Usage Amount\n$label (5%) 1 USD 1.00\nTotal USD 1.00',
        blocks: [
          _layoutBlock('Utility', 0, 0, 20, 350),
          _layoutBlock('Description', 1, 1, 20, 160),
          _layoutBlock('Usage', 2, 1, 175, 225),
          _layoutBlock('Amount', 3, 1, 300, 350),
          _layoutBlock('$label (5%)', 4, 2, 20, 160),
          _layoutBlock('1', 5, 2, 175, 225),
          _layoutBlock('USD 1.00', 6, 2, 300, 350),
          _layoutBlock('Total', 7, 3, 20, 160),
          _layoutBlock('USD 1.00', 8, 3, 300, 350),
        ],
      );
      expect(preview.items.map((item) => item.description), [
        '$label (5%)',
      ], reason: label);
      expect(preview.items.single.lineTotal, '1.00', reason: label);
      expect(preview.tax, isNull, reason: label);
      expect(preview.adjustmentsComplete, isFalse, reason: label);
      expect(
        preview.incompleteAdjustmentReasons,
        contains(ReceiptOcrIncompleteAdjustmentReason.ambiguousChargeTable),
        reason: label,
      );
    }
  });

  test('rated tax summary without usage stays an adjustment', () {
    for (final label in [
      'State Gas Tax',
      'Sales Tax',
      'Value Added Tax',
      'Goods and Services Tax',
    ]) {
      final preview = const ReceiptOcrParser().parse(
        'Market\nDescription Usage Amount\nWidget 1 USD 5.00\n$label (5%) USD 0.25\nTotal USD 5.25',
        blocks: [
          _layoutBlock('Market', 0, 0, 20, 350),
          _layoutBlock('Description', 1, 1, 20, 160),
          _layoutBlock('Usage', 2, 1, 175, 225),
          _layoutBlock('Amount', 3, 1, 300, 350),
          _layoutBlock('Widget', 4, 2, 20, 160),
          _layoutBlock('1', 5, 2, 175, 225),
          _layoutBlock('USD 5.00', 6, 2, 300, 350),
          _layoutBlock('$label (5%)', 7, 3, 20, 160),
          _layoutBlock('USD 0.25', 8, 3, 300, 350),
          _layoutBlock('Total', 9, 4, 20, 160),
          _layoutBlock('USD 5.25', 10, 4, 300, 350),
        ],
      );
      expect(preview.items.map((item) => item.description), [
        'Widget',
      ], reason: label);
      expect(preview.tax, '0.25', reason: label);
    }
  });

  test('numeric quantity also retains a tax-named charge', () {
    final preview = const ReceiptOcrParser().parse(
      'Utility\nDescription Qty Amount\nState Gas Tax (5%) 1 USD 1.00\nTotal USD 1.00',
      blocks: [
        _layoutBlock('Utility', 0, 0, 20, 350),
        _layoutBlock('Description', 1, 1, 20, 160),
        _layoutBlock('Qty', 2, 1, 175, 225),
        _layoutBlock('Amount', 3, 1, 300, 350),
        _layoutBlock('State Gas Tax (5%)', 4, 2, 20, 160),
        _layoutBlock('1', 5, 2, 175, 225),
        _layoutBlock('USD 1.00', 6, 2, 300, 350),
        _layoutBlock('Total', 7, 3, 20, 160),
        _layoutBlock('USD 1.00', 8, 3, 300, 350),
      ],
    );
    expect(preview.items.map((item) => item.description), [
      'State Gas Tax (5%)',
    ]);
    expect(preview.adjustmentsComplete, isFalse);
  });

  test('explicit post-subtotal rated tax remains an adjustment', () {
    final preview = const ReceiptOcrParser().parse('''
Market
Description Usage Amount
Widget 1 USD 5.00
Subtotal USD 5.00
State Gas Tax (5%) USD 0.25
Total USD 5.25
''');
    expect(preview.items.map((item) => item.description), ['Widget']);
    expect(preview.tax, '0.25');
  });

  test('a Rate value alone cannot stand in for missing Usage', () {
    final preview = const ReceiptOcrParser().parse(
      '''
Market
Description Usage Rate Amount
Widget 1 5.00 USD 5.00
Sales Tax (5%) 0.05 USD 0.25
Total USD 5.25
''',
      blocks: [
        _layoutBlock('Market', 0, 0, 20, 350),
        _layoutBlock('Description', 1, 1, 20, 160),
        _layoutBlock('Usage', 2, 1, 175, 220),
        _layoutBlock('Rate', 3, 1, 230, 280),
        _layoutBlock('Amount', 4, 1, 300, 350),
        _layoutBlock('Widget', 5, 2, 20, 160),
        _layoutBlock('1', 6, 2, 175, 220),
        _layoutBlock('5.00', 7, 2, 230, 280),
        _layoutBlock('USD 5.00', 8, 2, 300, 350),
        _layoutBlock('Sales Tax (5%)', 9, 3, 20, 160),
        _layoutBlock('0.05', 10, 3, 230, 280),
        _layoutBlock('USD 0.25', 11, 3, 300, 350),
        _layoutBlock('Total', 12, 4, 20, 160),
        _layoutBlock('USD 5.25', 13, 4, 300, 350),
      ],
    );
    expect(
      preview.items.map((item) => item.description),
      isNot(contains('Sales Tax (5%) 0.05')),
    );
    expect(preview.tax, '0.25');
    final withoutGeometry = const ReceiptOcrParser().parse('''
Market
Description Usage Rate Amount
Widget 1 5.00 USD 5.00
Sales Tax (5%) 0.05 USD 0.25
Total USD 5.25
''');
    expect(
      withoutGeometry.items.map((item) => item.description),
      isNot(contains('Sales Tax (5%) 0.05')),
    );
    expect(withoutGeometry.adjustmentsComplete, isFalse);
  });

  test('signed unit-bearing Usage remains distinct from a tax summary', () {
    for (final usage in ['-1 kWh', '+2 liters']) {
      final preview = const ReceiptOcrParser().parse(
        'Utility\nDescription Usage Amount\nState Gas Tax (5%) $usage USD 1.00\nTotal USD 1.00',
        blocks: [
          _layoutBlock('Utility', 0, 0, 20, 350),
          _layoutBlock('Description', 1, 1, 20, 160),
          _layoutBlock('Usage', 2, 1, 175, 225),
          _layoutBlock('Amount', 3, 1, 300, 350),
          _layoutBlock('State Gas Tax (5%)', 4, 2, 20, 160),
          _layoutBlock(usage, 5, 2, 175, 225),
          _layoutBlock('USD 1.00', 6, 2, 300, 350),
          _layoutBlock('Total', 7, 3, 20, 160),
          _layoutBlock('USD 1.00', 8, 3, 300, 350),
        ],
      );
      expect(preview.items.map((item) => item.description), [
        'State Gas Tax (5%)',
      ], reason: usage);
      expect(preview.adjustmentsComplete, isFalse, reason: usage);
    }
  });

  test('complete flattened Usage and Rate retain rated tax-named items', () {
    for (final label in ['Energy Tax', 'State Gas Tax']) {
      final preview = const ReceiptOcrParser().parse(
        'Utility\nDescription Usage Rate Amount\n$label (5%) 1 0.05 USD 1.00\nTotal USD 1.00',
      );
      expect(preview.items, hasLength(1), reason: label);
      expect(preview.items.single.description, contains(label), reason: label);
      expect(preview.items.single.lineTotal, '1.00', reason: label);
      expect(preview.adjustmentsComplete, isFalse, reason: label);
    }
  });

  test('rated tax with no Usage or Rate cell remains a flat summary', () {
    final preview = const ReceiptOcrParser().parse('''
Market
Description Usage Rate Amount
Widget 1 5.00 USD 5.00
Sales Tax (5%) USD 0.25
Total USD 5.25
''');
    expect(
      preview.items.map((item) => item.description),
      isNot(contains('Sales Tax (5%)')),
    );
    expect(preview.tax, '0.25');
  });

  test('descriptive surcharge after subtotal stays review evidence', () {
    final preview = const ReceiptOcrParser().parse('''
Utility
Widget USD 5.00
Subtotal USD 5.00
Fuel Surcharge (Winter) USD 1.00
Total USD 6.00
''');
    expect(preview.items.map((item) => item.description), ['Widget']);
    expect(
      preview.incompleteAdjustmentReasons,
      contains(
        ReceiptOcrIncompleteAdjustmentReason.unclassifiedAdjustmentLabel,
      ),
    );
  });

  test('tax-named surcharge after subtotal is not assigned to tax', () {
    final preview = const ReceiptOcrParser().parse('''
Utility
Widget USD 5.00
Subtotal USD 5.00
Tax Surcharge USD 1.00
Total USD 6.00
''');
    expect(preview.tax, isNull);
    expect(
      preview.incompleteAdjustmentReasons,
      contains(
        ReceiptOcrIncompleteAdjustmentReason.unclassifiedAdjustmentLabel,
      ),
    );
  });

  test('previous bill date does not outrank the current bill date', () {
    final preview = const ReceiptOcrParser().parse('''
Harbor Utility
Previous Bill Date 2025-01-01
Bill Date 2025-02-01
Due Date 2025-02-28
Current Charges USD 20.00
Total Amount Due USD 20.00
''');
    expect(preview.receiptDate, '2025-02-01');
  });

  test('positive printed discount reduces arithmetic total ranking', () {
    final preview = const ReceiptOcrParser().parse('''
Harbor Shop
Subtotal USD 100.00
Discount USD 20.00
Total USD 120.00
Total USD 80.00
''');
    expect(preview.discount, '20.00');
    expect(preview.total, '80.00');
  });

  test('a service date on a priced row does not hide the item', () {
    final preview = const ReceiptOcrParser().parse('''
City Parking
Transaction Date 2026-09-28
09/28/2026 Parking USD 20.00
Total USD 20.00
''');
    expect(preview.items, hasLength(1));
    expect(preview.items.single.description, contains('Parking'));
    expect(preview.items.single.lineTotal, '20.00');
  });

  test('parser preserves merchant headings containing card or invoice', () {
    const parser = ReceiptOcrParser();
    final cardMerchant = parser.parse('''
Central Card Terminal
Coffee USD 5.00
Total USD 5.00
''');
    final invoiceMerchant = parser.parse('''
Online Shop Invoice
Cable USD 8.00
Total USD 8.00
''');

    expect(cardMerchant.merchant, 'Central Card Terminal');
    expect(invoiceMerchant.merchant, 'Online Shop Invoice');
  });

  test('parser ranks transaction currency above card conversion currency', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Coffee House
Coffee USD 5.00
Total USD 5.00
Card charged EUR 4.60
''');

    expect(preview.currency, 'USD');
    expect(preview.items.map((item) => item.description), ['Coffee']);
    expect(preview.items.single.currency, 'USD');
  });

  test('payment-only currency never establishes transaction currency', () {
    const parser = ReceiptOcrParser();
    for (final paymentLine in const [
      'Payment USD 5.00',
      'Tender USD 5.00',
      'Gift Card USD 5.00',
      'Prepaid-Card USD 5.00',
      'Paid by cash USD 5.00',
      'Paid cash USD 5.00',
      'Credit Card USD 5.00',
      'Debit Card USD 5.00',
      'Credit-Card USD 5.00',
      'Paid by credit card USD 5.00',
      'Paid debit-card USD 5.00',
      'Paid by card USD 5.00',
      'Card charged EUR 4.60',
    ]) {
      final unresolved = parser.parse('''
Corner Cafe
Coffee \$5.00
Total \$5.00
$paymentLine
''');
      expect(unresolved.currency, isNull, reason: paymentLine);
      expect(
        unresolved.currencyProvenance,
        ReceiptOcrCurrencyProvenance.unresolved,
        reason: paymentLine,
      );

      final contextual = parser.parse('''
Corner Cafe
Coffee \$5.00
Total \$5.00
$paymentLine
''', fallbackCurrency: 'HKD');
      expect(contextual.currency, 'HKD', reason: paymentLine);
      expect(
        contextual.currencyProvenance,
        ReceiptOcrCurrencyProvenance.defaultFallback,
        reason: paymentLine,
      );
    }
  });

  test(
    'reference conversion currency never establishes transaction currency',
    () {
      const parser = ReceiptOcrParser();
      for (final referenceLine in const [
        'Reference EUR 4.60',
        'Reference amount EUR 4.60',
        'DCC EUR 4.60',
        'DCC conversion EUR 4.60',
        'Conversion amount EUR 4.60',
      ]) {
        final preview = parser.parse('''
Corner Cafe
Coffee \$5.00
Total \$5.00
$referenceLine
''');

        expect(preview.currency, isNull, reason: referenceLine);
        expect(
          preview.currencyProvenance,
          ReceiptOcrCurrencyProvenance.unresolved,
          reason: referenceLine,
        );
      }
    },
  );

  test('non-transaction metadata symbols never establish currency', () {
    const parser = ReceiptOcrParser();
    for (final metadataLine in const [
      'Reference € 4.60',
      'Conversion amount £ 4.60',
      'DCC HK\$ 4.60',
      'Card charged US\$ 5.00',
      'DCC د.إ 4.60',
      'Reference CA\$ 4.60',
      'Reference ₹ 4.60',
      'DCC ₩ 4600',
      'Conversion amount ¥ 720',
      'Reference \$ 4.60',
      'Reference currency EUR',
      'DCC currency GBP',
      'Tender currency AED',
      'Reference HK\$',
      'Payment €',
      'Card charged US\$',
      'Conversion amount ₹',
      'DCC ¥',
      'Reference KR',
      'Payment A\$',
      'Payment S\$',
      'Payment NZ\$',
      'Payment NT\$',
      'Payment R\$',
      'Payment ₺',
      'Payment ₫',
      'Payment zł',
      'Payment Rs',
      'Payment \$',
      'Reference currency: EUR',
      'Payment currency= AED',
      'DCC amount# GBP',
      'Card charged- US\$',
      'Conversion amount: HK\$',
      'Tender currency: \$',
    ]) {
      final preview = parser.parse('''
Corner Cafe
Coffee 5.00
Total 5.00
$metadataLine
''', fallbackCurrency: 'USD');

      expect(preview.currency, isNull, reason: metadataLine);
      expect(
        preview.currencyProvenance,
        ReceiptOcrCurrencyProvenance.unresolved,
        reason: metadataLine,
      );
      expect(
        preview.currencyProvenance,
        isNot(ReceiptOcrCurrencyProvenance.defaultFallback),
      );
    }
  });

  test('transaction currency outranks different metadata symbols', () {
    const parser = ReceiptOcrParser();
    for (final metadataLine in const [
      'Reference € 4.60',
      'Conversion amount £ 4.60',
      'DCC HK\$ 4.60',
      'Card charged US\$ 5.00',
      'DCC د.إ 4.60',
      'Reference ₹ 4.60',
      'Reference currency EUR',
      'DCC currency GBP',
      'Tender currency AED',
      'Reference HK\$',
      'Payment €',
      'Payment zł',
      'Reference currency: EUR',
      'Payment currency= AED',
      'DCC amount# GBP',
      'Card charged- HK\$',
    ]) {
      final preview = parser.parse('''
Corner Cafe
Coffee USD 5.00
Total USD 5.00
$metadataLine
''');

      expect(preview.currency, 'USD', reason: metadataLine);
      expect(
        preview.currencyProvenance,
        ReceiptOcrCurrencyProvenance.explicit,
        reason: metadataLine,
      );
    }
  });

  test('metadata-like merchandise names retain transaction currency', () {
    const parser = ReceiptOcrParser();
    for (final itemLine in const [
      'Reference Book EUR 9.00',
      'Conversion Adapter PLN 12.00',
      'Tender Greens USD 8.00',
      'Payment Terminal GBP 14.00',
      'Payment Card Reader EUR 16.00',
      'Reference Currency Guide PLN 18.00',
      'Conversion Rate Book USD 20.00',
      'Tender Cash Box GBP 22.00',
      'Payment Card-Reader EUR 24.00',
    ]) {
      final expectedCurrency = itemLine.split(
        ' ',
      )[itemLine.split(' ').length - 2];
      final preview = parser.parse('''
Corner Market
$itemLine
Total ${itemLine.split(' ').last}
''');

      expect(preview.currency, expectedCurrency, reason: itemLine);
      expect(
        preview.currencyProvenance,
        ReceiptOcrCurrencyProvenance.explicit,
        reason: itemLine,
      );
    }
  });

  test('non-transaction currency metadata never becomes merchandise', () {
    const parser = ReceiptOcrParser();
    for (final metadataLine in const [
      'DCC HK\$ 5.00',
      'Reference € 4.60',
      'Conversion amount £ 4.60',
      'Reference currency: EUR',
      'Payment currency= AED',
      'DCC amount# GBP',
    ]) {
      final preview = parser.parse('''
Corner Cafe
Coffee USD 5.00
$metadataLine
Total USD 5.00
''');

      expect(preview.items.map((item) => item.description), [
        'Coffee',
      ], reason: metadataLine);
      expect(
        preview.warnings,
        isNot(
          contains(
            'Some OCR lines need manual review because no traceable line amount was found.',
          ),
        ),
        reason: metadataLine,
      );
    }
  });

  test('items preserve explicit currency distinct from receipt currency', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Corner Cafe
Imported tea 2 x 2.00 EUR 4.00
Coffee USD 5.00
Total USD 9.00
''');

    expect(preview.currency, 'USD');
    expect(preview.items.first.description, 'Imported tea');
    expect(preview.items.first.quantity, '2');
    expect(preview.items.first.unitPrice, '2.00');
    expect(preview.items.first.lineTotal, '4.00');
    expect(preview.items.first.currency, 'EUR');
    expect(preview.items.last.currency, 'USD');
  });

  test('context currency outranks internally separated metadata currency', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Hong Kong Cafe
Coffee \$5.00
Total \$5.00
Reference currency: EUR
''');

    expect(preview.currency, 'HKD');
    expect(
      preview.currencyProvenance,
      ReceiptOcrCurrencyProvenance.contextInferred,
    );
  });

  test('parser separates charged tips and excludes suggested tip options', () {
    const parser = ReceiptOcrParser();

    final charged = parser.parse('''
Metro Taxi
Fare USD 24.50
Toll USD 3.00
Tip USD 5.00
Total USD 32.50
''');
    final suggested = parser.parse('''
Downtown Bistro
Pasta USD 20.00
Suggested Tip 15% USD 3.27
Suggested Tip 20% USD 4.36
Total USD 20.00
''');

    expect(charged.tip, '5.00');
    expect(charged.items.map((item) => item.description), ['Fare', 'Toll']);
    expect(suggested.items.map((item) => item.description), ['Pasta']);
    expect(suggested.adjustmentsComplete, isTrue);
    expect(suggested.reviewHints, isEmpty);
  });

  test('post-total suggested tips permit final courtesy without charge', () {
    const parser = ReceiptOcrParser();
    final suggested = parser.parse('''
Downtown Bistro
Date: 2026-09-17
Pasta USD 20.00
Subtotal USD 20.00
Tax USD 1.80
Total USD 21.80
Suggested Tip 15% USD 3.27
Suggested Tip 18% USD 3.92
Suggested Tip 20% USD 4.36
Thank you
''');
    expect(suggested.items.map((item) => item.description), ['Pasta']);
    expect(suggested.tax, '1.80');
    expect(suggested.total, '21.80');
    expect(suggested.tip, isNull);
    expect(suggested.reviewHints, isEmpty);

    final actualCharge = parser.parse('''
Downtown Bistro
Pasta USD 20.00
Subtotal USD 20.00
Tax USD 1.80
Total USD 21.80
Tip USD 3.27
Thank you
''');
    expect(actualCharge.tip, '3.27');
    expect(actualCharge.reviewHints, isNotEmpty);
  });

  test('centered unpriced footer after final total does not require review', () {
    const parser = ReceiptOcrParser();
    final centered = parser.parse(
      'Corner Cafe\nBread USD 5.00\nTotal USD 5.00\nMerci',
      blocks: [
        _layoutBlock('Corner Cafe', 0, 0, 350, 650),
        _layoutBlock('Bread USD 5.00', 1, 1, 100, 900),
        _layoutBlock('Total USD 5.00', 2, 2, 100, 900),
        _layoutBlock('Merci', 3, 3, 450, 550),
      ],
    );
    final leftAligned = parser.parse(
      'Corner Cafe\nBread USD 5.00\nTotal USD 5.00\nUnpriced item',
      blocks: [
        _layoutBlock('Corner Cafe', 0, 0, 350, 650),
        _layoutBlock('Bread USD 5.00', 1, 1, 100, 900),
        _layoutBlock('Total USD 5.00', 2, 2, 100, 900),
        _layoutBlock('Unpriced item', 3, 3, 100, 300),
      ],
    );
    final centeredUnresolved = parser.parse(
      'Corner Cafe\nBread USD 5.00\nTotal USD 5.00\nUnpriced item',
      blocks: [
        _layoutBlock('Corner Cafe', 0, 0, 350, 650),
        _layoutBlock('Bread USD 5.00', 1, 1, 100, 900),
        _layoutBlock('Total USD 5.00', 2, 2, 100, 900),
        _layoutBlock('Unpriced item', 3, 3, 450, 550),
      ],
    );
    final courtesyNamedItem = parser.parse(
      'Corner Cafe\nBread USD 5.00\nTotal USD 5.00\nThank You Gift',
      blocks: [
        _layoutBlock('Corner Cafe', 0, 0, 350, 650),
        _layoutBlock('Bread USD 5.00', 1, 1, 100, 900),
        _layoutBlock('Total USD 5.00', 2, 2, 100, 900),
        _layoutBlock('Thank You Gift', 3, 3, 450, 550),
      ],
    );
    final leftAlignedCourtesy = parser.parse(
      'Corner Cafe\nBread USD 5.00\nTotal USD 5.00\nThank You',
      blocks: [
        _layoutBlock('Corner Cafe', 0, 0, 350, 650),
        _layoutBlock('Bread USD 5.00', 1, 1, 100, 900),
        _layoutBlock('Total USD 5.00', 2, 2, 100, 900),
        _layoutBlock('Thank You', 3, 3, 100, 300),
      ],
    );
    final shoppingFooter = parser.parse(
      'Corner Cafe\nBread USD 5.00\nTotal USD 5.00\nThank you for shopping',
    );
    final leftAlignedShopping = parser.parse(
      'Corner Cafe\nBread USD 5.00\nTotal USD 5.00\nThank you for shopping',
      blocks: [
        _layoutBlock('Corner Cafe', 0, 0, 350, 650),
        _layoutBlock('Bread USD 5.00', 1, 1, 100, 900),
        _layoutBlock('Total USD 5.00', 2, 2, 100, 900),
        _layoutBlock('Thank you for shopping', 3, 3, 100, 300),
      ],
    );
    final shoppingNamedItem = parser.parse(
      'Corner Cafe\nBread USD 5.00\nTotal USD 5.00\nThank You for Shopping Bag',
    );

    expect(centered.reviewHints, isEmpty);
    expect(leftAligned.reviewHints, isNotEmpty);
    expect(centeredUnresolved.reviewHints, isNotEmpty);
    expect(courtesyNamedItem.reviewHints, isNotEmpty);
    expect(leftAlignedCourtesy.reviewHints, isNotEmpty);
    expect(shoppingFooter.reviewHints, isEmpty);
    expect(leftAlignedShopping.reviewHints, isNotEmpty);
    expect(shoppingNamedItem.reviewHints, isNotEmpty);
  });

  test('card authorization identifiers after total do not require review', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Tech Kiosk
Date: 2026-09-17
Cable USD 19.99
Total USD 19.99
VISA **** 4242
AUTH 738291
AID A0000000031010
Terminal 003
Thank you
''');

    expect(preview.items, hasLength(1));
    expect(preview.items.single.description, 'Cable');
    expect(preview.total, '19.99');
    expect(preview.reviewHints, isEmpty);

    final uncorroborated = parser.parse('''
Tech Kiosk
Cable USD 19.99
Total USD 19.99
AID A0000000031010
''');
    final uncorroboratedTerminal = parser.parse('''
Tech Kiosk
Cable USD 19.99
Total USD 19.99
Terminal 003
Thank you
''');
    final pricedTerminal = parser.parse('''
Tech Kiosk
Cable USD 19.99
Total USD 19.99
VISA **** 4242
Terminal USD 3.00
Thank you
''');
    expect(uncorroborated.reviewHints, isNotEmpty);
    expect(uncorroboratedTerminal.reviewHints, isNotEmpty);
    expect(pricedTerminal.reviewHints, isNotEmpty);
  });

  test('source-visible see you soon footer does not mask an item', () {
    const parser = ReceiptOcrParser();
    final footer = parser.parse(
      'Cafe\nBread USD 5.00\nTotal USD 5.00\nSee you soon!',
    );
    final namedItem = parser.parse(
      'Cafe\nBread USD 5.00\nTotal USD 5.00\nSee you soon! Gift',
    );
    expect(footer.reviewHints, isEmpty);
    expect(namedItem.reviewHints, isNotEmpty);
    final splitLineItem = parser.parse(
      'Cafe\nSee You Soon\nUSD 5.00\nTotal USD 5.00',
      blocks: [
        _layoutBlock('Cafe', 0, 0, 20, 200),
        _layoutBlock('See You Soon', 1, 1, 20, 200),
        _layoutBlock('USD 5.00', 2, 2, 310, 350),
        _layoutBlock('Total USD 5.00', 3, 3, 20, 350),
      ],
    );
    expect(splitLineItem.items.single.description, 'See You Soon');
    expect(splitLineItem.items.single.lineTotal, '5.00');
  });

  test('courtesy footer after tender needs final placement and item safety', () {
    const parser = ReceiptOcrParser();
    final centeredAfterTender = parser.parse(
      'Cafe\nBread USD 5.00\nTotal USD 5.00\nCash USD 10.00\nChange USD 5.00\nThank you for shopping',
      blocks: [
        _layoutBlock('Cafe', 0, 0, 350, 650),
        _layoutBlock('Bread USD 5.00', 1, 1, 100, 900),
        _layoutBlock('Total USD 5.00', 2, 2, 700, 900),
        _layoutBlock('Cash USD 10.00', 3, 3, 700, 900),
        _layoutBlock('Change USD 5.00', 4, 4, 700, 900),
        _layoutBlock('Thank you for shopping', 5, 5, 450, 550),
      ],
    );
    final leftAlignedAfterTender = parser.parse(
      'Cafe\nBread USD 5.00\nTotal USD 5.00\nCash USD 10.00\nChange USD 5.00\nThank you for shopping',
      blocks: [
        _layoutBlock('Cafe', 0, 0, 350, 650),
        _layoutBlock('Bread USD 5.00', 1, 1, 100, 900),
        _layoutBlock('Total USD 5.00', 2, 2, 700, 900),
        _layoutBlock('Cash USD 10.00', 3, 3, 700, 900),
        _layoutBlock('Change USD 5.00', 4, 4, 700, 900),
        _layoutBlock('Thank you for shopping', 5, 5, 100, 300),
      ],
    );
    final footerBeforeTender = parser.parse(
      'Cafe\nBread USD 5.00\nTotal USD 5.00\nThank you for shopping\nCash USD 10.00',
      blocks: [
        _layoutBlock('Cafe', 0, 0, 350, 650),
        _layoutBlock('Bread USD 5.00', 1, 1, 100, 900),
        _layoutBlock('Total USD 5.00', 2, 2, 700, 900),
        _layoutBlock('Thank you for shopping', 3, 3, 450, 550),
        _layoutBlock('Cash USD 10.00', 4, 4, 700, 900),
      ],
    );
    final pricedItemAfterTotal = parser.parse(
      'Cafe\nBread USD 5.00\nTotal USD 5.00\nGift USD 2.00\nThank you for shopping',
      blocks: [
        _layoutBlock('Cafe', 0, 0, 350, 650),
        _layoutBlock('Bread USD 5.00', 1, 1, 100, 900),
        _layoutBlock('Total USD 5.00', 2, 2, 700, 900),
        _layoutBlock('Gift USD 2.00', 3, 3, 100, 900),
        _layoutBlock('Thank you for shopping', 4, 4, 450, 550),
      ],
    );
    final noLayoutAfterTender = parser.parse(
      'Cafe\nBread USD 5.00\nTotal USD 5.00\nCash USD 10.00\nChange USD 5.00\nThank you for shopping',
    );
    final noLayoutWithMerchandise = parser.parse(
      'Cafe\nBread USD 5.00\nTotal USD 5.00\nGift USD 2.00\nThank you for shopping',
    );

    expect(centeredAfterTender.reviewHints, isEmpty);
    expect(leftAlignedAfterTender.reviewHints, isNotEmpty);
    expect(footerBeforeTender.reviewHints, isNotEmpty);
    expect(pricedItemAfterTotal.reviewHints, isNotEmpty);
    expect(noLayoutAfterTender.reviewHints, isEmpty);
    expect(noLayoutWithMerchandise.reviewHints, isNotEmpty);
    expect(
      noLayoutWithMerchandise.items.map((item) => item.description),
      contains('Gift'),
    );
  });

  test(
    'multilingual final courtesy requires known phrases and footer position',
    () {
      const parser = ReceiptOcrParser();
      final centered = parser.parse(
        'Bakery\nBread USD 5.00\nTotal USD 5.00\nThank you / Gracias / 多謝',
        blocks: [
          _layoutBlock('Bakery', 0, 0, 350, 650),
          _layoutBlock('Bread USD 5.00', 1, 1, 100, 900),
          _layoutBlock('Total USD 5.00', 2, 2, 700, 900),
          _layoutBlock('Thank you / Gracias / 多謝', 3, 3, 370, 630),
        ],
      );
      final leftAligned = parser.parse(
        'Bakery\nBread USD 5.00\nTotal USD 5.00\nThank you / Gracias / 多謝',
        blocks: [
          _layoutBlock('Bakery', 0, 0, 350, 650),
          _layoutBlock('Bread USD 5.00', 1, 1, 100, 900),
          _layoutBlock('Total USD 5.00', 2, 2, 700, 900),
          _layoutBlock('Thank you / Gracias / 多謝', 3, 3, 100, 360),
        ],
      );
      final unknownSegment = parser.parse(
        'Bakery\nBread USD 5.00\nTotal USD 5.00\nThank you / Gift',
        blocks: [
          _layoutBlock('Bakery', 0, 0, 350, 650),
          _layoutBlock('Bread USD 5.00', 1, 1, 100, 900),
          _layoutBlock('Total USD 5.00', 2, 2, 700, 900),
          _layoutBlock('Thank you / Gift', 3, 3, 450, 550),
        ],
      );

      expect(centered.reviewHints, isEmpty);
      expect(leftAligned.reviewHints, isNotEmpty);
      expect(unknownSegment.reviewHints, isNotEmpty);
    },
  );

  test(
    'settled split tender permits only a zero balance before final courtesy',
    () {
      const parser = ReceiptOcrParser();
      ReceiptOcrPreview parseWithBalance(String balance) => parser.parse(
        'Market\nGroceries USD 40.00\nTotal USD 40.00\nPaid Cash USD 15.00\nPaid Card USD 25.00\n$balance\nThank you',
        blocks: [
          _layoutBlock('Market', 0, 0, 350, 650),
          _layoutBlock('Groceries USD 40.00', 1, 1, 100, 900),
          _layoutBlock('Total USD 40.00', 2, 2, 700, 900),
          _layoutBlock('Paid Cash USD 15.00', 3, 3, 700, 900),
          _layoutBlock('Paid Card USD 25.00', 4, 4, 700, 900),
          _layoutBlock(balance, 5, 5, 700, 900),
          _layoutBlock('Thank you', 6, 6, 450, 550),
        ],
      );

      final settled = parseWithBalance('Balance USD 0.00');
      final unpaid = parseWithBalance('Balance USD 2.00');
      final merchandise = parseWithBalance('Balance Board USD 2.00');
      expect(settled.items.map((item) => item.description), ['Groceries']);
      expect(settled.reviewHints, isEmpty);
      expect(unpaid.reviewHints, isNotEmpty);
      expect(merchandise.reviewHints, isNotEmpty);
      expect(
        merchandise.items.map((item) => item.description),
        contains('Balance Board'),
      );
    },
  );

  test('parser excludes a bare approval identifier from items', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Corner Cafe
Coffee USD 5.00
Approval 123456
Total USD 5.00
''');

    expect(preview.items.map((item) => item.description), ['Coffee']);
    expect(preview.total, '5.00');

    for (final metadata in const [
      'Approval: 123456',
      'Auth: 123456',
      'Payment USD 5.00',
      'Tender USD 5.00',
      'Gift Card USD 5.00',
      'Prepaid-Card USD 5.00',
      'Paid by cash USD 5.00',
      'Paid cash USD 5.00',
      'Credit Card USD 5.00',
      'Debit Card USD 5.00',
      'Credit-Card USD 5.00',
      'Paid by credit card USD 5.00',
      'Paid debit-card USD 5.00',
      'Paid by card USD 5.00',
    ]) {
      final punctuated = parser.parse('''
Corner Cafe
Coffee USD 5.00
$metadata
Total USD 5.00
''');
      expect(punctuated.items.map((item) => item.description), [
        'Coffee',
      ], reason: metadata);
    }
  });

  test('parser preserves regular and nonbreaking space grouped amounts', () {
    const parser = ReceiptOcrParser();
    for (final separator in const [' ', '\u00a0']) {
      final preview = parser.parse('''
Paris Cafe
Coffee EUR 1${separator}234,50
Total EUR 1${separator}234,50
''');
      expect(preview.currency, 'EUR', reason: separator.codeUnits.toString());
      expect(preview.items.single.description, 'Coffee');
      expect(preview.items.single.lineTotal, '1234.50');
      expect(preview.total, '1234.50');
    }
  });

  test('parser joins a wrapped description to its following priced line', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Home Goods Depot
Premium Stainless Steel
Water Bottle 1L - Blue USD 24.99
Replacement Filter Pack USD 12.50
Total USD 37.49
''');

    expect(preview.items.map((item) => item.description), [
      'Premium Stainless Steel Water Bottle 1L - Blue',
      'Replacement Filter Pack',
    ]);
    expect(
      preview.warnings,
      isNot(
        contains(
          'Some OCR lines need manual review because no traceable line amount was found.',
        ),
      ),
    );
  });

  test('parser excludes a detected non-first merchant from wrapped items', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
WELCOME
The Wonderful Corner Cafe
Coffee USD 5.00
Total USD 5.00
''');

    expect(preview.merchant, 'The Wonderful Corner Cafe');
    expect(preview.items.single.description, 'Coffee');
  });

  test('parser excludes only the detected merchant row by identity', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Fresh Apple Market
Fresh Apple Market
Pie USD 5.00
Total USD 5.00
''');

    expect(preview.merchant, 'Fresh Apple Market');
    expect(preview.items.single.description, 'Fresh Apple Market Pie');
  });

  test('parser preserves multiple wrapped description rows', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Home Goods Depot
Premium Stainless
Steel Water Bottle
Blue USD 24.99
Total USD 24.99
''');

    expect(
      preview.items.single.description,
      'Premium Stainless Steel Water Bottle Blue',
    );
  });

  test('parser preserves wrapped descriptions in caseless scripts', () {
    const parser = ReceiptOcrParser();
    final arabic = parser.parse('''
متجر المنزل
زجاجة مياه فولاذية ممتازة
زرقاء AED 24.99
الإجمالي AED 24.99
''');
    final thai = parser.parse('''
ร้านของใช้
ขวดน้ำสแตนเลสคุณภาพสูง
สีฟ้า THB 249.00
ยอดสุทธิ THB 249.00
''');

    expect(arabic.items.single.description, 'زجاجة مياه فولاذية ممتازة زرقاء');
    expect(thai.items.single.description, 'ขวดน้ำสแตนเลสคุณภาพสูง สีฟ้า');
  });

  test('parser does not join an unrelated slogan to a priced item', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Neighborhood Market
Fresh food every day
Milk USD 3.00
Total USD 3.00
''');

    expect(preview.items.single.description, 'Milk');
  });

  test('parser preserves substantive one-glyph item descriptions', () {
    const parser = ReceiptOcrParser();
    final korean = parser.parse('''
서울 찻집
차 KRW 3500
합계 KRW 3500
''');
    final han = parser.parse('''
茶館
茶 JPY 500
合計 JPY 500
''');

    expect(korean.items.single.description, '차');
    expect(han.items.single.description, '茶');
  });

  test('parser preserves Card merchant headings without payment evidence', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Card Factory
Birthday Card USD 4.00
Total USD 4.00
''');

    expect(preview.merchant, 'Card Factory');
    expect(preview.items.single.description, 'Birthday Card');
  });

  test('parser matches localized receipt labels without case sensitivity', () {
    const parser = ReceiptOcrParser();
    final german = parser.parse('''
Köln Markt
Kaffee EUR 8,00
ZWISCHENSUMME EUR 8,00
GESAMT EUR 8,00
''');
    final french = parser.parse('''
Café Paris
Croissant EUR 8,00
SOUS-TOTAL EUR 8,00
TOTAL EUR 8,00
''');

    expect(german.subtotal, '8.00');
    expect(german.total, '8.00');
    expect(german.items.map((item) => item.description), ['Kaffee']);
    expect(french.subtotal, '8.00');
    expect(french.total, '8.00');
    expect(french.items.map((item) => item.description), ['Croissant']);
  });

  test('parser does not prepend a receipt column header to an item', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Corner Cafe
ITEM DESCRIPTION
Coffee USD 5.00
Total USD 5.00
''');

    expect(preview.items.single.description, 'Coffee');
  });

  test('parser normalizes Arabic-Indic AED receipt values', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
متجر دبي
Date: ٢٠٢٦-٠٩-١٧
قهوة ١٢٫٥٠ د.إ
حلوى ٨٫٢٥ د.إ
المجموع الفرعي ٢٠٫٧٥ د.إ
الضريبة ١٫٠٤ د.إ
الإجمالي ٢١٫٧٩ د.إ
''');

    expect(preview.merchant, 'متجر دبي');
    expect(preview.receiptDate, '2026-09-17');
    expect(preview.currency, 'AED');
    expect(preview.currencyProvenance, ReceiptOcrCurrencyProvenance.explicit);
    expect(preview.subtotal, '20.75');
    expect(preview.tax, '1.04');
    expect(preview.total, '21.79');
    expect(preview.items.map((item) => item.description), ['قهوة', 'حلوى']);
    expect(preview.items.map((item) => item.lineTotal), ['12.50', '8.25']);
  });

  test('trailing AED marker retains the whole comma-decimal amount', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
متجر دبي
قهوة ١٢,٥٠ د.إ
حلوى ٨,٢٥ د.إ
المجموع الفرعي ٢٠,٧٥ د.إ
الضريبة ١,٠٤ د.إ
الإجمالي ٢١,٧٩ د.إ
''');

    expect(preview.currency, 'AED');
    expect(preview.subtotal, '20.75');
    expect(preview.tax, '1.04');
    expect(preview.total, '21.79');
    expect(preview.items.map((item) => item.lineTotal), ['12.50', '8.25']);
  });

  test('parser normalizes Devanagari and Thai receipt digits', () {
    const parser = ReceiptOcrParser();
    final devanagari = parser.parse('''
दिल्ली कैफे
चाय INR १२.५०
कुल INR १२.५०
''');
    final thai = parser.parse('''
ร้านสยาม
ชา THB ๑๒.๕๐
ยอดสุทธิ THB ๑๒.๕๐
''');

    expect(devanagari.currency, 'INR');
    expect(devanagari.items.single.lineTotal, '12.50');
    expect(devanagari.total, '12.50');
    expect(thai.currency, 'THB');
    expect(thai.items.single.lineTotal, '12.50');
    expect(thai.total, '12.50');
  });

  test('parser extracts bundled Global Core labels and dates', () {
    const parser = ReceiptOcrParser();
    final cases =
        <
          ({
            String text,
            String date,
            String subtotal,
            String tax,
            String? service,
            String total,
          })
        >[
          (
            text:
                '上海便利店\n日期: 2026年09月17日\n鲜肉包 CNY 26.00\n小计 CNY 26.00\n税额 CNY 2.04\n合计 CNY 28.04',
            date: '2026-09-17',
            subtotal: '26.00',
            tax: '2.04',
            service: null,
            total: '28.04',
          ),
          (
            text:
                '台北好味食堂\n日期: 2026/09/17\n牛肉麵 TWD 120\n小計 TWD 120\n服務費 TWD 12\n稅額 TWD 6\n總計 TWD 138',
            date: '2026-09-17',
            subtotal: '120',
            tax: '6',
            service: '12',
            total: '138',
          ),
          (
            text:
                '서울마켓\n날짜: 2026. 09. 17.\n비빔밥 KRW 11000\n소계 KRW 11000\n부가세 KRW 1100\n합계 KRW 12100',
            date: '2026-09-17',
            subtotal: '11000',
            tax: '1100',
            service: null,
            total: '12100',
          ),
          (
            text:
                'दिल्ली भोजनालय\nदिनांक: 17/09/2026\nथाली INR 250.00\nउप-योग INR 250.00\nजीएसटी INR 12.50\nसेवा शुल्क INR 12.50\nकुल INR 275.00',
            date: '2026-09-17',
            subtotal: '250.00',
            tax: '12.50',
            service: '12.50',
            total: '275.00',
          ),
          (
            text:
                'ร้านอาหารสยาม\nวันที่ 17/09/2026\nผัดไทย THB 80.00\nยอดรวมย่อย THB 80.00\nภาษี THB 5.60\nยอดสุทธิ THB 85.60',
            date: '2026-09-17',
            subtotal: '80.00',
            tax: '5.60',
            service: null,
            total: '85.60',
          ),
          (
            text:
                'Кафе Север\nДата: 17.09.2026\nСуп RUB 350.00\nПодытог RUB 350.00\nНДС RUB 70.00\nИтого RUB 420.00',
            date: '2026-09-17',
            subtotal: '350.00',
            tax: '70.00',
            service: null,
            total: '420.00',
          ),
        ];

    for (final fixture in cases) {
      final preview = parser.parse(fixture.text);
      expect(preview.receiptDate, fixture.date, reason: fixture.text);
      expect(preview.subtotal, fixture.subtotal);
      expect(preview.tax, fixture.tax);
      expect(preview.service, fixture.service);
      expect(preview.total, fixture.total);
      expect(preview.items, hasLength(1), reason: fixture.text);
    }
  });

  test('parser disambiguates dotted day-first and dashed dates', () {
    const parser = ReceiptOcrParser();

    expect(
      parser.parse('Corner Cafe\nDate 09-17-2026\nTotal USD 5.00').receiptDate,
      '2026-09-17',
    );
    expect(
      parser.parse('Corner Cafe\nDate 09.17.2026\nTotal USD 5.00').receiptDate,
      '2026-09-17',
    );
    expect(
      parser.parse('Corner Cafe\nDate 17.09.2026\nTotal EUR 5.00').receiptDate,
      '2026-09-17',
    );
    expect(
      parser.parse('Corner Cafe\nDate 04.05.2026\nTotal EUR 5.00').receiptDate,
      '2026-05-04',
    );
    expect(
      parser
          .parse(
            'Corner Cafe\nDate 02.31.2026\nDate 09.17.2026\nTotal USD 5.00',
          )
          .receiptDate,
      '2026-09-17',
    );
    expect(
      parser
          .parse(
            'Corner Cafe\nDate 02.31.2026 Reprinted 09.17.2026\nTotal USD 5.00',
          )
          .receiptDate,
      '2026-09-17',
    );
    final missingMerchant = parser.parse('Date 09.17.2026\nTotal USD 5.00');
    expect(missingMerchant.merchant, isNull);
    expect(missingMerchant.receiptDate, '2026-09-17');
  });

  test('parser normalizes fullwidth CJK monetary glyphs', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('東京麺店\nラーメン ￥１，２００\n合計 ￥１，２００');

    expect(preview.currency, 'JPY');
    expect(
      preview.currencyProvenance,
      ReceiptOcrCurrencyProvenance.contextInferred,
    );
    expect(preview.items.single.description, 'ラーメン');
    expect(preview.items.single.lineTotal, '1200');
    expect(preview.total, '1200');
  });

  test('parser accepts native Arabic prefix currency and U+060C decimal', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('الإجمالي دإ٢١،٧٩');

    expect(preview.currency, 'AED');
    expect(preview.currencyProvenance, ReceiptOcrCurrencyProvenance.explicit);
    expect(preview.total, '21.79');
  });

  test('parser compatibility-normalizes Arabic presentation forms', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('ﺍﻹﺟﻤﺎﻟﻲ ﺩ.ﺇ٥');

    expect(preview.currency, 'AED');
    expect(preview.currencyProvenance, ReceiptOcrCurrencyProvenance.explicit);
    expect(preview.total, '5');
    expect(preview.items, isEmpty);
  });

  test('parser preserves U+060C thousands grouping', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('الإجمالي دإ١،٢٣٤');

    expect(preview.currency, 'AED');
    expect(preview.total, '1234');
  });

  test('parser keeps whole-number AED item amounts traceable', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Dubai Cafe
Coffee AED 5
Cake 7 AED
قهوة ٣ د.إ
TOTAL AED 15
''');

    expect(preview.currency, 'AED');
    expect(preview.items.map((item) => item.description), [
      'Coffee',
      'Cake',
      'قهوة',
    ]);
    expect(preview.items.map((item) => item.lineTotal), ['5', '7', '3']);
    expect(preview.total, '15');
  });

  test('parser treats an English-only AED code as explicit currency', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Dubai Cafe
Coffee AED 5
TOTAL AED 5
''');

    expect(preview.currency, 'AED');
    expect(preview.currencyProvenance, ReceiptOcrCurrencyProvenance.explicit);
    expect(preview.items.single.currency, 'AED');
    expect(preview.total, '5');
  });

  test('single whole-unit coded item is explicit monetary evidence', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('Coffee USD 5');

    expect(preview.currency, 'USD');
    expect(preview.currencyProvenance, ReceiptOcrCurrencyProvenance.explicit);
    expect(preview.items.single.description, 'Coffee');
    expect(preview.items.single.lineTotal, '5');
  });

  test('ambiguous dollar uses USD only when fallback is USD', () {
    const parser = ReceiptOcrParser();

    final preview = parser.parse(r'''
Coffee Bar
Latte $5.50
Total $5.50
''', fallbackCurrency: 'USD');

    expect(preview.currency, 'USD');
    expect(preview.items.single.currency, 'USD');
  });

  test('explicit USD markers override HKD fallback', () {
    const parser = ReceiptOcrParser();

    final codePreview = parser.parse(r'''
Travel Cafe
Pasta USD 18.00
Total USD 18.00
''', fallbackCurrency: 'HKD');
    final symbolPreview = parser.parse(r'''
Travel Cafe
Pasta US$18.00
Total US$18.00
''', fallbackCurrency: 'HKD');

    expect(codePreview.currency, 'USD');
    expect(symbolPreview.currency, 'USD');
  });

  test('currency codes require monetary or labelled context', () {
    const parser = ReceiptOcrParser();

    final marketingText = parser.parse(r'''
Coffee Bar
TRY OUR NEW LATTE
Latte $5.50
Total $5.50
''', fallbackCurrency: 'USD');
    final labelledCurrency = parser.parse('''
Istanbul Cafe
Currency: TRY
Tea 120.00
Total 120.00
''');

    expect(marketingText.currency, 'USD');
    expect(
      marketingText.currencyProvenance,
      ReceiptOcrCurrencyProvenance.defaultFallback,
    );
    expect(marketingText.items.single.currency, 'USD');
    expect(labelledCurrency.currency, 'TRY');
    expect(
      labelledCurrency.currencyProvenance,
      ReceiptOcrCurrencyProvenance.explicit,
    );
  });

  test('foreign-currency total does not replace the transaction total', () {
    const parser = ReceiptOcrParser();
    final compared = parser.parse('''
Exchange Cafe
Coffee USD 100.00
Total USD 100.00
Total EUR 90.00
''');
    expect(compared.currency, 'USD');
    expect(compared.total, '100.00');
  });

  test('bare yen reference total does not replace a USD transaction total', () {
    const parser = ReceiptOcrParser();
    final compared = parser.parse('''
Exchange Cafe
Coffee USD 80.00
Total USD 80.00
Total ¥12000
''');
    expect(compared.currency, 'USD');
    expect(compared.total, '80.00');
  });

  test('bare dollar total cannot become a euro transaction total', () {
    const parser = ReceiptOcrParser();
    final compared = parser.parse(r'''
Exchange Cafe
Coffee EUR 90.00
Total $100.00
''');
    expect(compared.currency, 'EUR');
    expect(compared.total, isNull);

    final compatible = parser.parse(r'''
Exchange Cafe
Coffee USD 3.00
Total $3.00
''');
    expect(compatible.currency, 'USD');
    expect(compatible.total, '3.00');
  });

  test('bare yen item and tax retain review-only currency against USD', () {
    const parser = ReceiptOcrParser();
    final compared = parser.parse('''
Exchange Cafe
Coffee ¥12000
Tax ¥100
Total USD 80.00
''');
    expect(compared.currency, 'USD');
    expect(compared.total, '80.00');
    expect(compared.items.single.description, 'Coffee');
    expect(compared.items.single.currency, '¥');
    expect(compared.tax, '100');
    expect(compared.taxCurrency, '¥');
    expect(compared.taxHasExplicitCurrencyEvidence, isTrue);
  });

  test('reference total does not establish transaction currency', () {
    const parser = ReceiptOcrParser();
    final compared = parser.parse('''
Exchange Cafe
Reference Total EUR 90.00
Coffee USD 60.00
Tea USD 40.00
Total 100.00
''');
    expect(compared.currency, 'USD');
    expect(compared.total, '100.00');
  });

  test('mixed yen and USD row binds currency to its selected amount', () {
    const parser = ReceiptOcrParser();
    final compared = parser.parse('''
Exchange Cafe
Coffee ¥150 / USD 1.00
Tax ¥150 / USD 1.00
Total USD 2.00
''');
    expect(compared.currency, 'USD');
    expect(
      compared.items.where(
        (item) => item.lineTotal == '1.00' && item.currency == 'USD',
      ),
      isNotEmpty,
    );
    // The multi-amount tax row remains unresolved rather than assigning the
    // selected USD number to the unrelated yen marker.
    expect(compared.tax, isNull);
  });

  test('foreign header amount uses its printed minor-unit scale', () {
    for (final amount in ['1.000', '1,000']) {
      final preview = const ReceiptOcrParser().parse('''
Market
Meal USD 10.00
Tax KWD $amount
Total USD 10.00
''');
      expect(preview.currency, 'USD', reason: amount);
      expect(preview.taxCurrency, 'KWD', reason: amount);
      expect(preview.taxHasExplicitCurrencyEvidence, isTrue, reason: amount);
      expect(preview.tax, '1.000', reason: amount);
    }
  });

  test('mixed rows bind supported symbols to the selected amount', () {
    const parser = ReceiptOcrParser();
    for (final (symbol, code) in [
      (r'US$', 'USD'),
      (r'HK$', 'HKD'),
      ('€', 'EUR'),
      ('£', 'GBP'),
    ]) {
      final compared = parser.parse('''
Exchange Cafe
Coffee ¥150 / $symbol 1.00
Tax ¥150 / $symbol 1.00
Total $symbol 2.00
''');
      expect(compared.currency, code, reason: symbol);
      expect(
        compared.items.where(
          (item) => item.lineTotal == '1.00' && item.currency == code,
        ),
        isNotEmpty,
        reason: symbol,
      );
      expect(compared.tax, isNull, reason: symbol);
    }
  });

  test('mixed row without selected amount currency remains unresolved', () {
    const parser = ReceiptOcrParser();
    final compared = parser.parse('''
Exchange Cafe
Coffee ¥150 / 1.00
Tax ¥150 / 1.00
Total USD 2.00
''');
    expect(compared.currency, 'USD');
    expect(
      compared.items
          .where((item) => item.lineTotal == '1.00')
          .every((item) => item.currency == null),
      isTrue,
      reason: compared.items
          .where((item) => item.lineTotal == '1.00')
          .map((item) => item.currency)
          .toList()
          .toString(),
    );
    expect(
      compared.items
          .where((item) => item.lineTotal == '1.00')
          .every((item) => item.currencyUnresolved),
      isTrue,
    );
    expect(compared.tax, isNull);
  });

  test('item name suffix cannot become selected amount currency', () {
    const parser = ReceiptOcrParser();
    final compared = parser.parse('''
Corner Bakery
2 Pastry 3.00
Total USD 3.00
''');
    expect(compared.currency, 'USD');
    expect(
      compared.items.where(
        (item) => item.lineTotal == '3.00' && item.currency == 'USD',
      ),
      isNotEmpty,
    );
  });

  test('bare dollar in a mixed row cannot inherit euro currency', () {
    const parser = ReceiptOcrParser();
    final compared = parser.parse('''
Exchange Cafe
Coffee ¥150 / \$1.00
Total €2.00
''');
    expect(compared.currency, 'EUR');
    expect(
      compared.items.where(
        (item) =>
            item.lineTotal == '1.00' &&
            item.currency == null &&
            item.currencyUnresolved,
      ),
      isNotEmpty,
    );
  });

  test('word-separated foreign amount keeps selected dollar unresolved', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse(r'''
Exchange Cafe
Coffee EUR 10.00 and $1.00
Total USD 1.00
''');

    expect(preview.currency, 'USD');
    expect(
      preview.items.where(
        (item) => item.lineTotal == '1.00' && item.currencyUnresolved,
      ),
      isNotEmpty,
    );
  });

  test('word-separated trailing foreign code keeps dollar unresolved', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse(r'''
Exchange Cafe
Coffee 10.00 EUR and $1.00
Total USD 1.00
''');

    expect(preview.currency, 'USD');
    expect(
      preview.items.where(
        (item) => item.lineTotal == '1.00' && item.currencyUnresolved,
      ),
      isNotEmpty,
    );
  });

  test('word-separated whole-unit foreign code keeps dollar unresolved', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse(r'''
Exchange Cafe
Coffee 10 EUR and $1.00
Total USD 1.00
''');

    expect(preview.currency, 'USD');
    expect(
      preview.items.where(
        (item) => item.lineTotal == '1.00' && item.currencyUnresolved,
      ),
      isNotEmpty,
    );
  });

  test('ordinary multi-number dollar item inherits established currency', () {
    const parser = ReceiptOcrParser();
    final compared = parser.parse(r'''
Exchange Cafe
2 Coffee $3.00
Total USD 3.00
''');
    expect(compared.currency, 'USD');
    expect(
      compared.items.where(
        (item) => item.lineTotal == '3.00' && item.currency == 'USD',
      ),
      isNotEmpty,
    );
    expect(
      compared.items
          .where((item) => item.lineTotal == '3.00')
          .every((item) => !item.currencyUnresolved),
      isTrue,
    );

    for (final itemLine in [
      r'Coffee HKD 10.00 / $1.00',
      r'Coffee HKD 10.00 $1.00',
      r'Coffee HKD 10 $1.00',
      r'Coffee 10.00 HKD $1.00',
      r'Coffee 10 € $1.00',
      r'Coffee 10 £ $1.00',
      r'Coffee 10 kr $1.00',
      r'Coffee 10 Rs $1.00',
      r'Coffee kr 10 $1.00',
      r'Coffee Rs 10 $1.00',
      r'Coffee €10 = $1.00',
      r'Coffee 10 € = $1.00',
      r'Coffee 10€ = $1.00',
      r'Coffee 10EUR = $1.00',
      r'Coffee 10HK$ = $1.00',
      r'Coffee EUR10.00 + $1.00',
      r'Coffee 10.00 EUR + $1.00',
    ]) {
      final conflicted = parser.parse('''
Exchange Cafe
$itemLine
Total USD 1.00
''');
      expect(
        conflicted.items.where(
          (item) => item.lineTotal == '1.00' && item.currencyUnresolved,
        ),
        isNotEmpty,
        reason: itemLine,
      );
    }
  });

  test('opposing markers beside one amount remain unresolved', () {
    const parser = ReceiptOcrParser();
    for (final scenario in [
      (item: 'Coffee USD 3.00 €', total: 'Total USD 3.00', currency: 'USD'),
      (item: r'Coffee EUR 3.00 $', total: 'Total EUR 3.00', currency: 'EUR'),
    ]) {
      final compared = parser.parse('''
Exchange Cafe
${scenario.item}
${scenario.total}
''');
      expect(compared.currency, scenario.currency);
      expect(
        compared.items.where(
          (item) => item.lineTotal == '3.00' && item.currencyUnresolved,
        ),
        isNotEmpty,
        reason: scenario.item,
      );
    }
  });

  test('item words that resemble currency codes do not conflict', () {
    const parser = ReceiptOcrParser();
    for (final itemLine in [
      r'2 Try Special $3.00',
      r'Try 2 Special $3.00',
      r'Try 2 $3.00',
      r'Try 2.0 $3.00',
      r'2.0 Try $3.00',
    ]) {
      final compared = parser.parse('''
Exchange Cafe
$itemLine
Total USD 3.00
''');
      expect(compared.currency, 'USD', reason: itemLine);
      expect(
        compared.items.where(
          (item) => item.lineTotal == '3.00' && item.currency == 'USD',
        ),
        isNotEmpty,
        reason: itemLine,
      );
      expect(
        compared.items
            .where((item) => item.lineTotal == '3.00')
            .every((item) => !item.currencyUnresolved),
        isTrue,
        reason: itemLine,
      );
    }
  });

  test('single printed dollar item cannot inherit euro currency', () {
    const parser = ReceiptOcrParser();
    final compared = parser.parse(r'''
Exchange Cafe
Coffee $9.00
Total EUR 9.00
''');
    expect(compared.currency, 'EUR');
    expect(
      compared.items.where(
        (item) =>
            item.lineTotal == '9.00' &&
            item.currency == null &&
            item.currencyUnresolved,
      ),
      isNotEmpty,
    );
  });

  test('matching-currency adjustment supersedes an earlier foreign one', () {
    const parser = ReceiptOcrParser();
    final compared = parser.parse('''
Exchange Cafe
Subtotal EUR 90.00
Subtotal USD 100.00
Tax EUR 8.00
Tax USD 10.00
Service EUR 4.00
Service USD 5.00
Tip EUR 2.00
Tip USD 3.00
Shipping EUR 6.00
Shipping USD 7.00
Discount EUR 9.00
Discount USD 11.00
Total USD 114.00
''');
    expect(compared.currency, 'USD');
    expect(compared.subtotal, '100.00');
    expect(compared.subtotalCurrency, 'USD');
    expect(compared.tax, '10.00');
    expect(compared.taxCurrency, 'USD');
    expect(compared.service, '5.00');
    expect(compared.serviceCurrency, 'USD');
    expect(compared.tip, '3.00');
    expect(compared.tipCurrency, 'USD');
    expect(compared.shipping, '7.00');
    expect(compared.shippingCurrency, 'USD');
    expect(compared.discount, '11.00');
    expect(compared.discountCurrency, 'USD');
  });

  test('parser ignores address header block and keeps real items', () {
    const parser = ReceiptOcrParser();

    final preview = parser.parse('''
Harbour Noodle
Shop 3, 12 Market Road
3/F Central Building
Tel: +852 2345 6789
Order #3
Beef Noodle 58.00
Iced Tea 18.00
Total HKD 76.00
Thank you
''');

    expect(preview.merchant, 'Harbour Noodle');
    expect(preview.currency, 'HKD');
    expect(preview.total, '76.00');
    expect(preview.items.map((item) => item.description), [
      'Beef Noodle',
      'Iced Tea',
    ]);
    expect(preview.items.map((item) => item.lineTotal), ['58.00', '18.00']);
    expect(
      preview.items.map((item) => item.description).join(' '),
      isNot(contains('Market Road')),
    );
    expect(preview.items.map((item) => item.lineTotal), isNot(contains('3')));
  });

  test('parser rejects mall address and unit digits as line items', () {
    const parser = ReceiptOcrParser();

    final preview = parser.parse('''
Harbour Kitchen
IFC Mall 100
Shop 3
3/F Central Tower
Tel 2345 6789
Opening Hours 11:00-22:00
Order #3
Wonton Noodle 68.00
Milk Tea 18.00
Total HKD 86.00
Thank you
''');

    expect(preview.merchant, 'Harbour Kitchen');
    expect(preview.currency, 'HKD');
    expect(preview.total, '86.00');
    expect(preview.items.map((item) => item.description), [
      'Wonton Noodle',
      'Milk Tea',
    ]);
    expect(preview.items.map((item) => item.lineTotal), ['68.00', '18.00']);
    expect(
      preview.items.map((item) => item.description).join(' '),
      isNot(contains('IFC Mall')),
    );
    expect(preview.items.map((item) => item.lineTotal), isNot(contains('3')));
    expect(preview.items.map((item) => item.lineTotal), isNot(contains('100')));
  });

  test('parser does not promote contact and counter numbers as amounts', () {
    const parser = ReceiptOcrParser();

    final preview = parser.parse('''
Corner Deli
Store 3
Table 3
Register 3
Cashier 3
Phone 555-0103
Sandwich 8.50
Total USD 8.50
''');

    expect(preview.items, hasLength(1));
    expect(preview.items.single.description, 'Sandwich');
    expect(preview.items.single.lineTotal, '8.50');
    expect(preview.items.map((item) => item.lineTotal), isNot(contains('3')));
  });

  test('parser rejects noisy isolated single digit item totals', () {
    const parser = ReceiptOcrParser();

    final preview = parser.parse('''
Cafe Stand
Noise 3
Tea 12
Total 12
''');

    expect(preview.items, hasLength(1));
    expect(preview.items.single.description, 'Tea');
    expect(preview.items.single.lineTotal, '12');
    expect(preview.items.map((item) => item.lineTotal), isNot(contains('3')));
  });

  test('parser warns when item-looking text has no traceable amount', () {
    const parser = ReceiptOcrParser();

    final preview = parser.parse('''
Cafe Stand
Mystery Cake
Total HKD 24.00
''');

    expect(preview.items, isEmpty);
    expect(
      preview.warnings,
      contains(
        'Some OCR lines need manual review because no traceable line amount was found.',
      ),
    );
  });

  test('preview hints when item line totals differ from detected subtotal', () {
    const preview = ReceiptOcrPreview(
      currency: 'HKD',
      subtotal: '45.00',
      total: '45.00',
      items: [
        ReceiptOcrItemCandidate(description: 'Milk', lineTotal: '25.00'),
        ReceiptOcrItemCandidate(description: 'Bread', lineTotal: '18.00'),
      ],
    );

    expect(preview.reviewHints, [
      'OCR item total differs from detected subtotal. Review the receipt before applying.',
    ]);
    expect(
      preview.reviewHintDecision,
      ReceiptOcrReviewDecision.subtotalMismatch,
    );
  });

  test('unresolved item currency cannot corroborate receipt arithmetic', () {
    const preview = ReceiptOcrPreview(
      currency: 'EUR',
      subtotal: '2.00',
      total: '2.00',
      items: [
        ReceiptOcrItemCandidate(
          description: 'Mixed-currency item',
          lineTotal: '1.00',
          currencyUnresolved: true,
        ),
      ],
    );
    expect(preview.reviewHints, isEmpty);
  });

  test('unresolved item currency retains printed adjustment warning', () {
    for (final foreignAdjustment in [false, true]) {
      final preview = ReceiptOcrPreview(
        currency: 'EUR',
        tax: '1.00',
        taxCurrency: foreignAdjustment ? 'USD' : 'EUR',
        taxHasExplicitCurrencyEvidence: true,
        total: '3.00',
        items: const [
          ReceiptOcrItemCandidate(
            description: 'Mixed-currency item',
            lineTotal: '2.00',
            currencyUnresolved: true,
          ),
        ],
      );
      expect(preview.reviewHints, [
        'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
      ], reason: 'foreign adjustment: $foreignAdjustment');
    }
  });

  test(
    'preview omits warning when charges exactly reconcile the grand total',
    () {
      const preview = ReceiptOcrPreview(
        currency: 'HKD',
        subtotal: '43.00',
        tax: '2.00',
        service: '3.00',
        total: '48.00',
        items: [
          ReceiptOcrItemCandidate(description: 'Milk', lineTotal: '25.00'),
          ReceiptOcrItemCandidate(description: 'Bread', lineTotal: '18.00'),
        ],
      );

      expect(preview.reviewHints, isEmpty);
    },
  );

  test('preview retains warning when adjustments do not reconcile', () {
    const preview = ReceiptOcrPreview(
      currency: 'HKD',
      subtotal: '43.00',
      tax: '2.00',
      service: '3.00',
      total: '49.00',
      items: [ReceiptOcrItemCandidate(description: 'Meal', lineTotal: '43.00')],
    );
    expect(preview.reviewHints, [
      'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
    ]);
  });

  test('equal item and grand totals still review a printed adjustment', () {
    for (final subtotal in [null, '10.00']) {
      final preview = ReceiptOcrPreview(
        currency: 'USD',
        subtotal: subtotal,
        tax: '2.00',
        total: '10.00',
        items: const [
          ReceiptOcrItemCandidate(description: 'Meal', lineTotal: '10.00'),
        ],
      );
      expect(preview.reviewHints, [
        'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
      ], reason: 'subtotal=$subtotal');
    }
  });

  test('parser retains warning when a repeated charge is not represented', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Market
Meal 10.00
Service charge USD 2.00
Service charge USD 3.00
Total USD 12.00
''');
    expect(preview.adjustmentsComplete, isFalse);
    expect(
      preview.incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.labeledAmountEvidence),
    );
    expect(
      preview.incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.repeatedAdjustmentRole),
    );
    expect(preview.reviewHints, [
      'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
    ]);
  });

  test('parser retains warning when a printed adjustment is malformed', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Market
Meal 10.00
Tax unreadable
Service charge USD 2.00
Total USD 12.00
''');
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.reviewHints, [
      'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
    ]);
  });

  test('parser does not treat a numbered malformed charge as complete', () {
    const parser = ReceiptOcrParser();
    final preview = parser.parse('''
Market
Meal 10.00
Tax reference 123
Service charge USD 2.00
Total USD 12.00
''');
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.reviewHints, [
      'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
    ]);
  });

  test('qualified malformed adjustment keeps review warning', () {
    final preview = const ReceiptOcrParser().parse('''
Market
Meal 10.00
Local tax reference 123
Service charge USD 2.00
Total USD 12.00
''');
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.reviewHints, [
      'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
    ]);
  });

  test('charge-table adjustment prevents unproven reconciliation', () {
    final preview = const ReceiptOcrParser().parse('''
Market
Description Usage Rate Amount
Base Charge 10 \$1.00 \$10.00
Delivery Charge 2 \$1.00 \$2.00
Subtotal USD 12.00
Tax USD 1.00
Total USD 13.00
''');
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.reviewHints, [
      'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
    ]);
  });

  test('detached signed service row keeps adjustment warning', () {
    final preview = const ReceiptOcrParser().parse('''
Market
Meal 10.00
Service - \$1.00 .
Tax USD 2.00
Total USD 12.00
''');
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.reviewHints, [
      'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
    ]);
  });

  test('localized amountless adjustments keep review warning', () {
    for (final label in ['消費税', 'الضريبة', '割引']) {
      final preview = const ReceiptOcrParser().parse('''
Market
Meal 10.00
$label unreadable
Service charge USD 2.00
Total USD 12.00
''');
      expect(preview.adjustmentsComplete, isFalse, reason: label);
      expect(preview.reviewHints, [
        'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
      ], reason: label);
    }
  });

  test('unclassified surcharge keeps adjustment warning', () {
    final preview = const ReceiptOcrParser().parse('''
Market
Meal 10.00
Surcharge USD 1.00
Tax USD 1.00
Total USD 12.00
''');
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.reviewHints, [
      'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
    ]);
  });

  test('item truncation keeps adjustment warning', () {
    final itemLines = List.filled(41, 'Meal 1.00').join('\n');
    final preview = const ReceiptOcrParser().parse('''
Market
$itemLines
Tax USD 1.00
Total USD 41.00
''');
    expect(preview.items, hasLength(40));
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.reviewHints, [
      'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
    ]);
  });

  test('unpriced item-like row keeps adjustment warning', () {
    final preview = const ReceiptOcrParser().parse('''
Market
Meal 10.00
Unpriced item
Tax USD 2.00
Total USD 12.00
''');
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.reviewHints, [
      'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
    ]);
  });

  test('unclassified convenience fee keeps adjustment warning', () {
    final preview = const ReceiptOcrParser().parse('''
Market
Meal 10.00
Convenience fee USD 1.00
Tax USD 1.00
Total USD 12.00
''');
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.reviewHints, [
      'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
    ]);
  });

  test('printed rounding row keeps adjustment warning', () {
    for (final label in ['Rounding', 'Round off']) {
      final preview = const ReceiptOcrParser().parse('''
Market
Meal 10.00
$label USD 1.00
Tax USD 1.00
Total USD 12.00
''');
      expect(preview.adjustmentsComplete, isFalse, reason: label);
      expect(preview.reviewHints, [
        'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
      ], reason: label);
    }
  });

  test('unretained priced item keeps adjustment warning', () {
    final preview = const ReceiptOcrParser().parse('''
Market
Meal 10.00
Bread 2.00 unreadable
Tax USD 2.00
Total USD 12.00
''');
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.reviewHints, [
      'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
    ]);
  });

  test('two localized adjustment roles on one line keep warning', () {
    final preview = const ReceiptOcrParser().parse('''
Market
Meal 10.00
消費税 USD 1.00 サービス料 USD 2.00
Total USD 12.00
''');
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.reviewHints, [
      'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
    ]);
  });

  test('two amounts under one localized adjustment keep warning', () {
    for (final row in ['消費税 USD 1.00 USD 2.00', '割引 USD 1.00 USD 2.00']) {
      final preview = const ReceiptOcrParser().parse('''
Market
Meal 10.00
$row
Total USD 12.00
''');
      expect(preview.adjustmentsComplete, isFalse, reason: row);
      expect(preview.reviewHints, [
        'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
      ], reason: row);
    }
  });

  test('unclassified charge and refund rows keep adjustment warning', () {
    for (final label in ['Handling charge', 'Refund']) {
      final preview = const ReceiptOcrParser().parse('''
Market
Meal 10.00
$label USD 1.00
Tax USD 1.00
Total USD 12.00
''');
      expect(preview.adjustmentsComplete, isFalse, reason: label);
      expect(preview.reviewHints, [
        'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
      ], reason: label);
    }
  });

  test('conflicting printed subtotals keep review warning', () {
    final preview = const ReceiptOcrParser().parse('''
Market
Meal USD 10.00
Subtotal USD 10.00
Subtotal USD 11.00
Tax USD 2.00
Total USD 12.00
''');
    expect(preview.subtotal, '10.00');
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.reviewHints, [
      'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
    ]);
  });

  test('unparseable additional printed subtotal keeps review warning', () {
    final preview = const ReceiptOcrParser().parse('''
Market
Meal USD 10.00
Subtotal USD 10.00
Subtotal USD --
Tax USD 2.00
Total USD 12.00
''');
    expect(preview.subtotal, '10.00');
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.reviewHints, [
      'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
    ]);
  });

  test('loyalty savings row remains unresolved adjustment evidence', () {
    final preview = const ReceiptOcrParser().parse('''
Market
Meal USD 10.00
Loyalty Savings USD -1.00
Tax USD 1.00
Total USD 10.00
''');
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.reviewHints, [
      'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
    ]);
  });

  test('percentage-only tax does not count as a monetary adjustment', () {
    final preview = const ReceiptOcrParser().parse('''
Market
Meal 10.00
Tax 2%
Service charge USD 2.00
Total USD 12.00
''');
    expect(preview.tax, isNull);
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.reviewHints, [
      'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
    ]);
  });

  test('unparseable-only adjustment keeps warning at equal grand total', () {
    for (final subtotalLine in ['', 'Subtotal USD 10.00\n']) {
      final preview = const ReceiptOcrParser().parse('''
Market
Meal 10.00
${subtotalLine}Tax 2%
Total USD 10.00
''');
      expect(preview.tax, isNull);
      expect(preview.adjustmentsComplete, isFalse);
      expect(preview.reviewHints, [
        'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
      ]);
    }
  });

  test('zero printed adjustment does not hide grand-total conflict', () {
    const preview = ReceiptOcrPreview(
      currency: 'USD',
      subtotal: '10.00',
      tax: '0.00',
      total: '12.00',
      items: [ReceiptOcrItemCandidate(description: 'Meal', lineTotal: '10.00')],
    );
    expect(preview.reviewHints, [
      'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
    ]);
  });

  test('unresolved review currency cannot corroborate adjustments', () {
    const preview = ReceiptOcrPreview(
      tax: '2.00',
      total: '12.00',
      items: [ReceiptOcrItemCandidate(description: 'Meal', lineTotal: '10.00')],
    );
    expect(preview.reviewHints, [
      'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
    ]);
  });

  test('foreign-only adjustment keeps grand-total warning', () {
    const preview = ReceiptOcrPreview(
      currency: 'USD',
      subtotal: '10.00',
      tax: '2.00',
      taxCurrency: 'EUR',
      taxHasExplicitCurrencyEvidence: true,
      total: '12.00',
      items: [ReceiptOcrItemCandidate(description: 'Meal', lineTotal: '10.00')],
    );
    expect(preview.reviewHints, [
      'OCR item total differs from detected grand total. Review the receipt before applying.',
    ]);
  });

  test('foreign-only adjustment keeps warning at equal grand total', () {
    for (final subtotal in <String?>[null, '10.00']) {
      final preview = ReceiptOcrPreview(
        currency: 'USD',
        subtotal: subtotal,
        tax: '2.00',
        taxCurrency: 'EUR',
        taxHasExplicitCurrencyEvidence: true,
        total: '10.00',
        items: const [
          ReceiptOcrItemCandidate(description: 'Meal', lineTotal: '10.00'),
        ],
      );
      expect(preview.reviewHints, [
        'Detected adjustment currency differs from receipt currency. Review before applying.',
      ]);
    }
  });

  test('detached-sign priced item keeps adjustment warning', () {
    final preview = const ReceiptOcrParser().parse('''
Market
Meal 10.00
Bread - \$1.00 .
Tax USD 2.00
Total USD 12.00
''');
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.reviewHints, [
      'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
    ]);
  });

  test('preview does not reconcile a partial item total', () {
    const preview = ReceiptOcrPreview(
      currency: 'HKD',
      subtotal: '43.00',
      tax: '2.00',
      total: '45.00',
      items: [
        ReceiptOcrItemCandidate(description: 'Meal', lineTotal: '43.00'),
        ReceiptOcrItemCandidate(description: 'Unpriced item'),
      ],
    );
    expect(preview.reviewHints, [
      'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
    ]);
  });

  test('preview reconciles signed and magnitude discount evidence', () {
    for (final discount in ['-2.00', '2.00']) {
      final preview = ReceiptOcrPreview(
        currency: 'USD',
        subtotal: '10.00',
        discount: discount,
        total: '8.00',
        items: const [
          ReceiptOcrItemCandidate(description: 'Meal', lineTotal: '10.00'),
        ],
      );
      expect(preview.reviewHints, isEmpty);
    }
  });

  test('preview hints against grand total only without detected charges', () {
    const preview = ReceiptOcrPreview(
      currency: 'HKD',
      total: '45.00',
      items: [
        ReceiptOcrItemCandidate(description: 'Milk', lineTotal: '25.00'),
        ReceiptOcrItemCandidate(description: 'Bread', lineTotal: '18.00'),
      ],
    );

    expect(preview.reviewHints, [
      'OCR item total differs from detected grand total. Review the receipt before applying.',
    ]);
  });

  test('preview does not use cross-currency adjustments for reconciliation', () {
    const preview = ReceiptOcrPreview(
      currency: 'USD',
      tip: '2.00',
      tipCurrency: 'XPF',
      tipHasExplicitCurrencyEvidence: true,
      total: '45.00',
      items: [ReceiptOcrItemCandidate(description: 'Milk', lineTotal: '43.00')],
    );

    expect(preview.reviewHints, [
      'OCR item total differs from detected grand total. Review the receipt before applying.',
    ]);
  });

  test('preview excludes foreign tax and service from charge explanation', () {
    const preview = ReceiptOcrPreview(
      currency: 'USD',
      tax: '20.00',
      taxCurrency: 'EUR',
      taxHasExplicitCurrencyEvidence: true,
      service: '5.00',
      serviceCurrency: 'EUR',
      serviceHasExplicitCurrencyEvidence: true,
      total: '115.00',
      items: [ReceiptOcrItemCandidate(description: 'Meal', lineTotal: '90.00')],
    );

    expect(preview.reviewHints, [
      'OCR item total differs from detected grand total. Review the receipt before applying.',
    ]);
  });

  test('preview ignores foreign subtotal and discount arithmetic', () {
    const preview = ReceiptOcrPreview(
      currency: 'USD',
      subtotal: '100.00',
      subtotalCurrency: 'EUR',
      subtotalHasExplicitCurrencyEvidence: true,
      discount: '10.00',
      discountCurrency: 'EUR',
      discountHasExplicitCurrencyEvidence: true,
      total: '80.00',
      items: [ReceiptOcrItemCandidate(description: 'Meal', lineTotal: '90.00')],
    );
    expect(preview.reviewHints, [
      'OCR item total differs from detected grand total. Review the receipt before applying.',
    ]);
  });

  test(
    'preview ignores malformed review amounts without misleading warning',
    () {
      const preview = ReceiptOcrPreview(
        currency: 'HKD',
        subtotal: 'HKD 43.00',
        total: '48..00',
        tax: '5.00',
        items: [
          ReceiptOcrItemCandidate(description: 'Milk', lineTotal: '25.00'),
          ReceiptOcrItemCandidate(description: 'Bread', lineTotal: '18.xx'),
        ],
      );

      expect(preview.reviewHints, isEmpty);
    },
  );

  test('parser extracts minimal Japanese receipt totals and charges', () {
    const parser = ReceiptOcrParser();

    final preview = parser.parse('''
東京カフェ
2026-06-13
ラテ 450
パン 320
小計 770
割引 -50
消費税 72
サービス料 80
合計 872
''');

    expect(preview.subtotal, '770');
    expect(preview.discount, '-50');
    expect(preview.tax, '72');
    expect(preview.service, '80');
    expect(preview.total, '872');
    expect(preview.items.map((item) => item.description), ['ラテ', 'パン']);
  });

  test('parser avoids treating ordinary item names as totals or charges', () {
    const parser = ReceiptOcrParser();

    final preview = parser.parse('''
Corner Store
Total cereal 4.50
Service bell 3.00
Tax guide book 12.00
Amount due USD 19.50
''');

    expect(preview.total, '19.50');
    expect(preview.tax, isNull);
    expect(preview.service, isNull);
    expect(preview.items.map((item) => item.description), [
      'Total cereal',
      'Service bell',
      'Tax guide book',
    ]);
  });

  test('parser keeps uncertain text provisional with warnings', () {
    const parser = ReceiptOcrParser();

    final preview = parser.parse('''
Receipt
Thank you
''');

    expect(preview.hasApplyableFields, isFalse);
    expect(preview.warnings, contains('No clear item lines were detected.'));
    expect(preview.warnings, contains('No clear total amount was detected.'));
  });

  test('parser warns about unresolved item rows in every Global Core script', () {
    const parser = ReceiptOcrParser();
    const unresolvedDescriptions = [
      'Crème brûlée',
      'Борщ домашний',
      'خبز طازج',
      'ताज़ी रोटी',
      'তাজা রুটি',
      'புதிய ரொட்டி',
      'తాజా రొట్టె',
      'ข้าวผัด',
      '김치찌개',
      '焼き魚',
      '炒飯',
    ];

    for (final unresolvedDescription in unresolvedDescriptions) {
      final preview = parser.parse('''
Global Market
Known item USD 4.00
$unresolvedDescription
Total USD 4.00
''');

      expect(
        preview.warnings,
        contains(
          'Some OCR lines need manual review because no traceable line amount was found.',
        ),
        reason: 'missing warning for $unresolvedDescription',
      );
    }
  });

  test('unsupported provider returns manual-entry fallback', () async {
    const provider = UnsupportedReceiptOcrProvider();

    final result = await provider.extractReceipt(
      ReceiptOcrRequest(bytes: const [1, 2, 3], contentType: 'image/png'),
    );

    expect(result.status, ReceiptOcrStatus.unsupported);
    expect(result.preview, isNull);
    expect(result.message, contains('manual'));
  });

  test(
    'ml kit provider safely fails for invalid encoded image bytes',
    () async {
      const provider = MlKitReceiptOcrProvider();

      final result = await provider.extractReceipt(
        ReceiptOcrRequest(bytes: const [1, 2, 3], contentType: 'image/jpeg'),
      );

      expect(result.status, ReceiptOcrStatus.failed);
      expect(result.message, contains('manual'));
    },
  );

  test('fakeable provider can return structured preview', () async {
    final provider = _FakeReceiptOcrProvider(
      const ReceiptOcrResult.extracted(
        ReceiptOcrPreview(
          merchant: 'Coffee Bar',
          currency: 'USD',
          items: [
            ReceiptOcrItemCandidate(
              description: 'Latte',
              quantity: '1',
              lineTotal: '5.50',
              currency: 'USD',
            ),
          ],
        ),
      ),
    );

    final result = await provider.extractReceipt(
      ReceiptOcrRequest(bytes: const [7, 8, 9], contentType: 'image/jpeg'),
    );

    expect(provider.calls, 1);
    expect(provider.lastRequest?.bytes, const [7, 8, 9]);
    expect(provider.lastRequest?.contentType, 'image/jpeg');
    expect(result.preview?.merchant, 'Coffee Bar');
  });

  test('receipt intake safety warns from metadata without contents', () {
    final review = reviewReceiptIntakeSafety(
      const ReceiptIntakeSafetyMetadata(
        sourceType: ReceiptIntakeSourceType.fileImport,
        filename: 'receipt.bmp',
        contentType: 'image/bmp',
        sizeBytes: ReceiptIntakePolicy.largeFileWarningBytes + 1,
        nativeCameraAvailable: false,
      ),
    );

    expect(receiptIntakeSourceLabel(review.sourceType), 'File import');
    expect(
      review.warnings,
      contains(
        'Server-mode OCR data stays provisional until the API validates and accepts it.',
      ),
    );
    expect(
      review.warnings,
      contains('Receipt file type is not supported for receipt OCR review.'),
    );
    expect(
      review.warnings,
      contains(
        'Receipt filename extension is not supported for receipt OCR review.',
      ),
    );
    expect(
      review.warnings,
      contains(
        'Receipt file is large. Upload or OCR may fail; review before saving.',
      ),
    );
    expect(
      review.warnings,
      contains('Native camera capture is unavailable in this build.'),
    );
  });

  test('receipt intake safety warns when source or size are unavailable', () {
    final review = reviewReceiptIntakeSafety(
      const ReceiptIntakeSafetyMetadata(
        sourceType: ReceiptIntakeSourceType.unknown,
        filename: 'receipt',
        contentType: 'image/jpeg',
      ),
    );

    expect(review.sourceType, ReceiptIntakeSourceType.unknown);
    expect(
      review.warnings,
      contains(
        'Receipt filename extension is missing. Review the import source.',
      ),
    );
    expect(
      review.warnings,
      contains('Receipt file size metadata is missing. Review before upload.'),
    );
    expect(
      review.warnings,
      contains(
        'Receipt source is unavailable. Treat the import as manual review only.',
      ),
    );
  });

  test('normalization policy accepts JPEG as preferred target', () {
    final review = ReceiptImageNormalizationPolicy.review(
      const ReceiptImageNormalizationPolicyInput(
        sourceKind: ReceiptImageSourceKind.capturedPhoto,
        sourceLabel: r'C:\private\receipt.jpg',
        mediaType: 'image/jpeg',
        extension: 'jpg',
        sizeBytes: 2048,
      ),
    );

    expect(review.decision, ReceiptImageHandlingDecision.accepted);
    expect(review.normalizedJpegExpected, isTrue);
    expect(review.originalRetainedByPolicy, isFalse);
    expect(review.thumbnailExpected, isTrue);
    expect(review.byteNormalizationPerformed, isFalse);
    expect(review.reasonCodes, contains('preferred_jpeg_input'));
    expect(review.reasonCodes, contains('normalization_not_performed'));
    expect(review.sourceLabel, 'receipt.jpg');
    expect(review.safeDiagnosticSummary, isNot(contains(r'C:\private')));
    expect(review.safeDiagnosticSummary, isNot(contains('receipt.jpg')));
  });

  test(
    'normalization policy accepts PNG and WEBP but requires JPEG derivative',
    () {
      final pngReview = ReceiptImageNormalizationPolicy.review(
        const ReceiptImageNormalizationPolicyInput(
          sourceKind: ReceiptImageSourceKind.importedImage,
          sourceLabel: 'receipt.png',
          mediaType: 'image/png',
          extension: 'png',
          sizeBytes: 2048,
        ),
      );
      final webpReview = ReceiptImageNormalizationPolicy.review(
        const ReceiptImageNormalizationPolicyInput(
          sourceKind: ReceiptImageSourceKind.importedImage,
          sourceLabel: 'receipt.webp',
          mediaType: 'image/webp',
          extension: 'webp',
          sizeBytes: 2048,
        ),
      );

      expect(pngReview.decision, ReceiptImageHandlingDecision.accepted);
      expect(webpReview.decision, ReceiptImageHandlingDecision.accepted);
      expect(
        pngReview.reasonCodes,
        contains('image_input_needs_jpeg_derivative'),
      );
      expect(
        webpReview.reasonCodes,
        contains('image_input_needs_jpeg_derivative'),
      );
      expect(
        pngReview.displayLines,
        contains('Image prep: receipt image was kept as provided.'),
      );
    },
  );

  test('normalization policy limits PDF and rejects unknown or HEIC', () {
    final pdfReview = ReceiptImageNormalizationPolicy.review(
      const ReceiptImageNormalizationPolicyInput(
        sourceKind: ReceiptImageSourceKind.importedPdf,
        sourceLabel: 'receipt.pdf',
        mediaType: 'application/pdf',
        extension: 'pdf',
        sizeBytes: 2048,
      ),
    );
    final unknownReview = ReceiptImageNormalizationPolicy.review(
      const ReceiptImageNormalizationPolicyInput(
        sourceKind: ReceiptImageSourceKind.unknown,
        sourceLabel: 'receipt.bmp',
        mediaType: 'image/bmp',
        extension: 'bmp',
        sizeBytes: 2048,
      ),
    );
    final heicReview = ReceiptImageNormalizationPolicy.review(
      const ReceiptImageNormalizationPolicyInput(
        sourceKind: ReceiptImageSourceKind.importedImage,
        sourceLabel: 'receipt.heic',
        mediaType: 'image/heic',
        extension: 'heic',
        sizeBytes: 2048,
      ),
    );

    expect(pdfReview.decision, ReceiptImageHandlingDecision.limited);
    expect(
      pdfReview.reasonCodes,
      contains('pdf_document_not_image_normalized'),
    );
    expect(unknownReview.decision, ReceiptImageHandlingDecision.unsupported);
    expect(
      unknownReview.reasonCodes,
      contains('unknown_or_unsupported_file_type'),
    );
    expect(heicReview.decision, ReceiptImageHandlingDecision.unsupported);
    expect(
      heicReview.reasonCodes,
      contains('heic_not_supported_by_current_mobile_seam'),
    );
  });

  test(
    'normalization policy warns on size and dimensions without contents',
    () {
      final review = ReceiptImageNormalizationPolicy.review(
        const ReceiptImageNormalizationPolicyInput(
          sourceKind: ReceiptImageSourceKind.importedImage,
          sourceLabel: 'receipt.png',
          mediaType: 'image/png',
          extension: 'png',
          sizeBytes: ReceiptImageNormalizationPolicy.largeFileWarningBytes + 1,
          width: 5000,
          height: 4000,
        ),
      );

      expect(review.reasonCodes, contains('large_file_warning'));
      expect(review.reasonCodes, contains('large_dimension_warning'));
      expect(review.messages.join(' '), contains('Receipt file is large'));
      expect(review.safeDiagnosticSummary, isNot(contains('merchant')));
      expect(review.safeDiagnosticSummary, isNot(contains('payment')));
    },
  );
}

class _FakeReceiptOcrProvider implements ReceiptOcrProvider {
  _FakeReceiptOcrProvider(this.result);

  final ReceiptOcrResult result;
  int calls = 0;
  ReceiptOcrRequest? lastRequest;

  @override
  Future<ReceiptOcrResult> extractReceipt(ReceiptOcrRequest request) async {
    calls += 1;
    lastRequest = request;
    return result;
  }
}
