import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_repository.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrPreview _preview(
  List<List<String>> rows, {
  bool geometry = true,
  String? fallback,
}) {
  final blocks = <ReceiptOcrBlockEvidence>[];
  for (var row = 0; row < rows.length; row++) {
    for (var col = 0; col < rows[row].length; col++) {
      final x = col == 0 ? 50.0 : 700.0, y = row * 50.0;
      blocks.add(
        ReceiptOcrBlockEvidence(
          text: rows[row][col],
          row: row,
          order: blocks.length,
          confidence: 0.99,
          points: [
            ReceiptOcrPoint(x: x, y: y),
            ReceiptOcrPoint(x: x + 180, y: y),
            ReceiptOcrPoint(x: x + 180, y: y + 30),
            ReceiptOcrPoint(x: x, y: y + 30),
          ],
        ),
      );
    }
  }
  return const ReceiptOcrParser().parse(
    rows.map((r) => r.join(' ')).join('\n'),
    blocks: geometry ? blocks : const [],
    fallbackCurrency: fallback,
  );
}

void main() {
  test('recognized prefix keeps the complete subtotal', () {
    final p = _preview([
      ['SAMPLE SHOP'],
      ['Soup USD 14000'],
      ['Subtotal', 'USD14,000'],
      ['Total USD 14000'],
    ]);
    expect(p.subtotal, '14000');
  });
  test('recognized suffix keeps the complete subtotal', () {
    final p = _preview([
      ['SAMPLE SHOP'],
      ['Soup USD 14000'],
      ['Subtotal', '14,000USD'],
      ['Total USD 14000'],
    ]);
    expect(p.subtotal, '14000');
  });
  test(
    'owned item cells keep whole amounts with attached recognized codes',
    () {
      final p = _preview([
        ['SAMPLE SHOP'],
        ['Soup', 'USD11,000'],
        ['Tea', 'USD3,000'],
        ['Subtotal USD 14000'],
        ['Total USD 14000'],
      ]);
      expect(p.items.map((i) => i.lineTotal), ['11000', '3000']);
    },
  );
  test('an unrecognized prefix never yields a numeric tail', () {
    final p = _preview([
      ['SAMPLE SHOP'],
      ['소계', 'Q14,000'],
    ], geometry: false);
    expect(p.subtotal, anyOf(isNull, '14000'));
  });
  test('an unrecognized suffix never yields a numeric head', () {
    final p = _preview([
      ['SAMPLE SHOP'],
      ['Subtotal', '14,000Q'],
    ], geometry: false);
    expect(p.subtotal, anyOf(isNull, '14000'));
  });
  test('unrecognized prefix cannot discard the printed minus sign', () {
    final p = _preview([
      ['SAMPLE SHOP'],
      ['소계', 'Q-14,000'],
    ], geometry: false);
    expect(p.subtotal, anyOf(isNull, '-14000'));
  });
  test('a product identifier cannot yield a numeric tail', () {
    final p = _preview([
      ['SAMPLE SHOP'],
      ['소계', 'SKU14,000'],
    ], geometry: false);
    expect(p.subtotal, isNull);
  });

  final valid = <String, String>{
    'USD1,234.56': '1234.56',
    '1,234.56USD': '1234.56',
    'USD-1,234.56': '-1234.56',
    '-1,234.56USD': '-1234.56',
    '-USD1,234.56': '-1234.56',
    'USD+1,234.56': '1234.56',
    '+USD1,234.56': '1234.56',
    'EUR1.234,56': '1234.56',
    '1.234,56EUR': '1234.56',
    'EUR-1.234,56': '-1234.56',
    'EUR1 234,56': '1234.56',
    'EUR1 234,56': '1234.56',
    "CHF1'234.56": '1234.56',
    'CHF1’234.56': '1234.56',
    'INR1,23,456.78': '123456.78',
    'INR-1,23,456.78': '-123456.78',
    'KRW14,000': '14000',
    'KWD1,234': '1.234',
    'KWD1.234': '1.234',
    'KWD1,234.567': '1234.567',
    'USD1,234,567.89': '1234567.89',
    'EUR1.234.567,89': '1234567.89',
    'USD0.05': '0.05',
    'USD-0.05': '-0.05',
  };
  for (final entry in valid.entries) {
    test('whole subtotal preserves ${entry.key}', () {
      final p = _preview([
        ['SAMPLE SHOP'],
        ['Subtotal', entry.key],
      ]);
      expect(p.subtotal, entry.value);
      expect(p.blocks.last.text, entry.key);
    });
  }

  for (final value in [
    'SKU14,000',
    '14,000SKU',
    'XUSD14,000',
    '14,000USDX',
    'W14,000',
    'W-14,000',
    '14,000W',
    '2026/09/17',
    '2026-09-17',
    '2026.09.17',
    'AB-123-456',
    'USD1,23,45.67',
    'USD12.34,56',
    "USD12'34.56",
    'USD1,234.5.6',
    'USD1,234,',
    'USD1,,234',
    'USD--14,000',
    'USD+-14,000',
    'USD-+14,000',
    'USD++14,000',
    '-USD-14,000',
    '+USD-14,000',
    '-USD+14,000',
    '+USD+14,000',
    '14,000USD-',
    '14,000USD+',
    '-14,000USD-',
    '-14,000USD+',
    'USD-14,000-',
    'USD14,000+',
  ]) {
    test('does not salvage malformed or identifier amount $value', () {
      final p = _preview([
        ['SAMPLE SHOP'],
        ['소계', value],
      ]);
      expect(p.subtotal, isNull);
      expect(p.adjustmentsComplete, isFalse);
      expect(p.blocks.last.text, value);
    });
  }

  test('attached amount retains adjustment labels and signed discounts', () {
    final p = _preview([
      ['SAMPLE SHOP'],
      ['Notebook USD 100.00'],
      ['Subtotal USD100.00'],
      ['Tax USD7.50'],
      ['Tip USD1.25'],
      ['Shipping USD2.50'],
      ['Discount USD-10.00'],
      ['Total USD101.25'],
    ]);
    expect(p.subtotal, '100.00');
    expect(p.tax, '7.50');
    expect(p.tip, '1.25');
    expect(p.tipLabel, 'Tip');
    expect(p.shipping, '2.50');
    expect(p.shippingLabel, 'Shipping');
    expect(p.discount, '-10.00');
    expect(p.total, '101.25');
  });

  test('refund keeps negative item and total signs', () {
    final p = _preview([
      ['SAMPLE SHOP'],
      ['Notebook', 'USD-1,234.50'],
      ['Subtotal USD-1,234.50'],
      ['Refund total USD-1,234.50'],
    ]);
    expect(p.items.single.lineTotal, '-1234.50');
    expect(p.subtotal, '-1234.50');
    expect(p.total, '-1234.50');
  });

  test('currency conflict stays unresolved at the whole amount', () {
    final p = _preview([
      ['SAMPLE SHOP'],
      ['Notebook USD 10.00'],
      ['Subtotal USD14,000EUR'],
      ['Total USD 10.00'],
    ]);
    expect(p.subtotalCurrency, isNull);
    expect(p.subtotalHasExplicitCurrencyEvidence, isTrue);
    expect(p.reviewHints, isNotEmpty);
    final saved = receiptOcrReviewSaveRequestFromPreview(
      p,
      originalCurrency: 'USD',
    );
    expect(saved, isNotNull);
    expect(saved!.status, ReceiptOcrReviewStatusValues.provisional);
    expect(
      saved.taxReconciliationMode,
      ReceiptOcrTaxReconciliationModeValues.unresolved,
    );
  });

  test('numeric product names and explicit item prices remain separate', () {
    final p = _preview([
      ['SAMPLE SHOP'],
      ['1 Day Pass', 'USD10.00'],
      ['2 Pack Batteries', 'USD5.00'],
      ['Model SKU14000', 'USD3.00'],
      ['Subtotal USD18.00'],
      ['Total USD18.00'],
    ]);
    expect(p.items.map((i) => i.description), [
      '1 Day Pass',
      '2 Pack Batteries',
      'Model SKU14000',
    ]);
    expect(p.items.map((i) => i.quantity), [null, null, null]);
    expect(p.items.map((i) => i.lineTotal), ['10.00', '5.00', '3.00']);
  });

  for (final table in [false, true]) {
    for (final money in [
      'eur10.00',
      'eUr10.00',
      '10.00eur',
      '10.00eUr',
      'EUR10.00',
      '10.00EUR',
    ]) {
      test('owned foreign denomination survives table=$table $money', () {
        final p = _preview([
          ['SAMPLE SHOP'],
          if (table) ...[
            ['Current Charges Detail'],
            ['Description', 'Amount'],
          ],
          ['Notebook', money],
          ['Subtotal USD 10.00'],
          ['Total USD 10.00'],
        ]);
        expect(p.currency, 'USD');
        expect(p.items.single.description, 'Notebook');
        expect(p.items.single.lineTotal, '10.00');
        expect(p.items.single.currency, 'EUR');
        if (table) {
          expect(
            p.itemSelectionDecisions.single,
            ReceiptOcrItemLineDecision.layoutChargeSelected,
          );
        }
        final saved = receiptOcrReviewSaveRequestFromPreview(
          p,
          originalCurrency: 'USD',
        );
        expect(saved, isNotNull);
        expect(saved!.status, ReceiptOcrReviewStatusValues.provisional);
        expect(saved.lines.single.text, 'Notebook');
        expect(saved.lines.single.lineTotalAmount, isNull);
        expect(p.blocks.any((b) => b.text == money), isTrue);
      });
    }
  }

  for (final money in ['USD10.00₦', 'USD10.00₽', 'USD10.00฿']) {
    test('whole charge-table cell retains currency conflict $money', () {
      final p = _preview([
        ['SAMPLE SHOP'],
        ['Current Charges Detail'],
        ['Description', 'Amount'],
        ['Notebook', money],
        ['Total USD 10.00'],
      ]);
      expect(p.items.single.lineTotal, '10.00');
      expect(p.items.single.currency, isNull);
      expect(p.items.single.currencyUnresolved, isTrue);
      final saved = receiptOcrReviewSaveRequestFromPreview(
        p,
        originalCurrency: 'USD',
      );
      expect(saved!.status, ReceiptOcrReviewStatusValues.provisional);
      expect(saved.lines.single.lineTotalAmount, isNull);
      expect(p.blocks.any((b) => b.text == money), isTrue);
    });
  }

  for (final neighbor in [
    null,
    'EUR',
    '-',
    '99',
    'Extra Purchase',
    'crossed',
  ]) {
    test('independent footer ownership retains boundary $neighbor', () {
      final original = _preview([
        ['SAMPLE SHOP'],
        ['Total USD1,234,'],
        ['Notebook USD 42.00'],
        ['Total Current Charges', 'USD42.00'],
      ]);
      final blocks = [
        for (final b in original.blocks)
          if (neighbor == 'crossed' && b.row == 3 && b.text == 'USD42.00')
            ReceiptOcrBlockEvidence(
              text: b.text,
              row: b.row,
              order: b.order,
              confidence: b.confidence,
              points: [b.points[0], b.points[2], b.points[1], b.points[3]],
            )
          else
            b,
        if (neighbor != null && neighbor != 'crossed')
          ReceiptOcrBlockEvidence(
            text: neighbor,
            row: 4,
            order: 20,
            confidence: 0.99,
            // A separate logical row still competes in the footer's band.
            points: const [
              ReceiptOcrPoint(x: 885, y: 150),
              ReceiptOcrPoint(x: 1040, y: 150),
              ReceiptOcrPoint(x: 1040, y: 180),
              ReceiptOcrPoint(x: 885, y: 180),
            ],
          ),
      ];
      final rows = <int, List<String>>{};
      for (final b in blocks) {
        (rows[b.row] ??= []).add(b.text);
      }
      final p = const ReceiptOcrParser().parse(
        rows.values.map((r) => r.join(' ')).join('\n'),
        blocks: blocks,
      );
      expect(p.total, neighbor == null ? '42.00' : isNull);
      expect(p.adjustmentsComplete, isFalse);
      expect(p.blocks, blocks);
    });
  }
}
