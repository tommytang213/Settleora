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
      final currencyCell = rows[row].length == 3 && col == 1;
      final x = col == 0
          ? 50.0
          : currencyCell
          ? 630.0
          : 700.0;
      final width = currencyCell ? 60.0 : 180.0, y = row * 50.0;
      blocks.add(
        ReceiptOcrBlockEvidence(
          text: rows[row][col],
          row: row,
          order: blocks.length,
          confidence: 0.99,
          points: [
            ReceiptOcrPoint(x: x, y: y),
            ReceiptOcrPoint(x: x + width, y: y),
            ReceiptOcrPoint(x: x + width, y: y + 30),
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

  for (final geometry in [false, true]) {
    for (final money in [
      r'-USD$ USD1.00',
      r'1.00USD USD$-',
      r'-USD$1.00',
      r'1.00USD$-',
      '-USD USD1.00',
      '+USD USD1.00',
      '-usd USD USD1.00',
      r'-USD $1.00',
      '1.00USD USD-',
      '1.00USD USD+',
      '1.00USD usd USD-',
      r'1.00$ USD-',
    ]) {
      test('repeated currency retains signed uncertainty $geometry $money', () {
        final p = _preview([
          ['SAMPLE SHOP'],
          ['Tea USD 1.00'],
          ['소계 $money'],
          ['Total USD 1.00'],
        ], geometry: geometry);
        expect(p.subtotal, isNull);
        expect(p.adjustmentsComplete, isFalse);
        expect(p.reviewHints, isNotEmpty);
        if (geometry) {
          expect(p.blocks.any((b) => b.text == '소계 $money'), isTrue);
        }
        final saved = receiptOcrReviewSaveRequestFromPreview(
          p,
          originalCurrency: 'USD',
        );
        expect(saved, isNotNull);
        expect(saved!.status, ReceiptOcrReviewStatusValues.provisional);
        expect(saved.subtotalAmount, isNull);
        expect(
          saved.taxReconciliationMode,
          ReceiptOcrTaxReconciliationModeValues.unresolved,
        );
      });
    }
    for (final entry in {
      'USD USD1.00': '1.00',
      '1.00USD USD': '1.00',
      'USD USD-1.00': '-1.00',
      '-1.00USD USD': '-1.00',
    }.entries) {
      test(
        'repeated currency preserves an owned sign $geometry ${entry.key}',
        () {
          final p = _preview([
            ['SAMPLE SHOP'],
            ['Tea USD ${entry.value}'],
            ['소계 ${entry.key}'],
            ['Total USD ${entry.value}'],
          ], geometry: geometry);
          expect(p.subtotal, entry.value);
          final saved = receiptOcrReviewSaveRequestFromPreview(
            p,
            originalCurrency: 'USD',
          );
          expect(saved, isNotNull);
          // Negative draft evidence remains visible; the existing save boundary
          // omits negative summary amounts from financial fields.
          expect(
            saved!.subtotalAmount,
            entry.value.startsWith('-') ? isNull : entry.value,
          );
        },
      );
    }
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

  for (final table in [false, true]) {
    for (final entry in <({String marker, String money, String? currency})>[
      (marker: 'EUR', money: 'USD10.00', currency: null),
      (marker: 'eur', money: 'USD10.00', currency: null),
      (marker: 'USD', money: 'EUR10.00', currency: null),
      (marker: 'USD', money: '10.00EUR', currency: null),
      (marker: '€', money: 'USD10.00', currency: null),
      (marker: 'EUR', money: r'$10.00', currency: null),
      (marker: 'USD', money: 'USD10.00', currency: 'USD'),
      (marker: 'USD', money: r'$10.00', currency: 'USD'),
      (marker: 'EUR', money: 'EUR10.00', currency: 'EUR'),
      (marker: '€', money: 'EUR10.00', currency: 'EUR'),
    ]) {
      test('owned monetary cells keep every denomination $table $entry', () {
        final p = _preview([
          ['SAMPLE SHOP'],
          if (table) ...[
            ['Current Charges Detail'],
            ['Description', 'Amount'],
          ],
          ['Notebook', entry.marker, entry.money],
          ['Subtotal USD 10.00'],
          ['Total USD 10.00'],
        ]);
        expect(p.currency, 'USD');
        // The ordinary dollar row already uses the text-item path. Preserve
        // that description while retaining its owned currency conflict.
        expect(
          p.items.single.description,
          !table && entry.money.startsWith(r'$')
              ? 'Notebook ${entry.marker}'
              : 'Notebook',
        );
        expect(p.items.single.lineTotal, '10.00');
        expect(p.items.single.currency, entry.currency);
        expect(p.items.single.currencyUnresolved, entry.currency == null);
        final saved = receiptOcrReviewSaveRequestFromPreview(
          p,
          originalCurrency: 'USD',
        );
        expect(saved, isNotNull);
        expect(saved!.status, ReceiptOcrReviewStatusValues.provisional);
        expect(
          saved.lines.single.lineTotalAmount,
          entry.currency == 'USD' ? '10.00' : isNull,
        );
        expect(p.blocks.any((b) => b.text == entry.marker), isTrue);
        expect(p.blocks.any((b) => b.text == entry.money), isTrue);
      });
    }
  }

  for (final money in [
    'USD10.00₦',
    'USD10.00₽',
    'USD10.00฿',
    '₦USD10.00',
    '₽USD10.00',
    '฿USD10.00',
    'BIF USD10.00',
    'USD10.00 BIF',
  ]) {
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

  for (final role in [
    'Subtotal',
    'Tax',
    'Service Charge',
    'Tip',
    'Shipping',
    'Discount',
  ]) {
    for (final entry in <({String money, String? currency})>[
      (money: 'EUR USD1.00', currency: null),
      (money: 'USD1.00 EUR', currency: null),
      (money: '1.00USD EUR', currency: null),
      (money: '₦USD1.00', currency: null),
      (money: 'BIF USD1.00', currency: null),
      (money: 'USD USD1.00', currency: 'USD'),
      (money: 'USD1.00 USD', currency: 'USD'),
      (money: 'EUR EUR1.00', currency: 'EUR'),
    ]) {
      test(
        'summary monetary chain retains every denomination $role $entry',
        () {
          final p = _preview([
            ['SAMPLE SHOP'],
            ['Tea USD 1.00'],
            if (role != 'Subtotal') ['Subtotal USD 1.00'],
            ['$role ${entry.money}'],
            ['Total USD 1.00'],
          ], geometry: false);
          final evidence = switch (role) {
            'Subtotal' => (
              p.subtotal,
              p.subtotalCurrency,
              p.subtotalHasExplicitCurrencyEvidence,
            ),
            'Tax' => (p.tax, p.taxCurrency, p.taxHasExplicitCurrencyEvidence),
            'Service Charge' => (
              p.service,
              p.serviceCurrency,
              p.serviceHasExplicitCurrencyEvidence,
            ),
            'Tip' => (p.tip, p.tipCurrency, p.tipHasExplicitCurrencyEvidence),
            'Shipping' => (
              p.shipping,
              p.shippingCurrency,
              p.shippingHasExplicitCurrencyEvidence,
            ),
            _ => (
              p.discount,
              p.discountCurrency,
              p.discountHasExplicitCurrencyEvidence,
            ),
          };
          expect(
            evidence.$1,
            entry.currency == null ? anyOf(isNull, '1.00') : '1.00',
          );
          expect(evidence.$2, entry.currency);
          if (evidence.$1 != null) expect(evidence.$3, isTrue);
          final saved = receiptOcrReviewSaveRequestFromPreview(
            p,
            originalCurrency: 'USD',
          );
          expect(saved, isNotNull);
          expect(saved!.status, ReceiptOcrReviewStatusValues.provisional);
          if (entry.currency == null) {
            expect(p.adjustmentsComplete, isFalse);
            expect(p.reviewHints, isNotEmpty);
            expect(
              saved.taxReconciliationMode,
              ReceiptOcrTaxReconciliationModeValues.unresolved,
            );
          }
          if (!['Tip', 'Shipping'].contains(role)) {
            final value = switch (role) {
              'Subtotal' => saved.subtotalAmount,
              'Tax' => saved.taxAmount,
              'Service Charge' => saved.serviceChargeAmount,
              _ => saved.discountAmount,
            };
            expect(value, entry.currency == 'USD' ? '1.00' : isNull);
          }
        },
      );
    }
  }
  for (final money in [
    'EUR USD1.00',
    'EUR / USD1.00',
    'EUR or USD1.00',
    'EUR|USD1.00',
    'USD1.00 EUR',
    '1.00USD EUR',
    '₦USD1.00',
    'BIF USD1.00',
    'USD USD1.00',
    'USD1.00 USD',
  ]) {
    test('primary total monetary chain retains conflict $money', () {
      final matching = money == 'USD USD1.00' || money == 'USD1.00 USD';
      final p = _preview([
        ['SAMPLE SHOP'],
        ['Tea USD 1.00'],
        ['Subtotal USD 1.00'],
        ['Total $money'],
      ], geometry: false);
      expect(p.total, matching ? '1.00' : isNull);
      final saved = receiptOcrReviewSaveRequestFromPreview(
        p,
        originalCurrency: 'USD',
      );
      expect(saved!.grandTotalAmount, matching ? '1.00' : isNull);
      if (!matching && money != 'USD1.00 EUR') {
        expect(p.adjustmentsComplete, isFalse);
        expect(p.warnings, contains('No clear total amount was detected.'));
        expect(
          saved.taxReconciliationMode,
          ReceiptOcrTaxReconciliationModeValues.unresolved,
        );
      }
    });
  }
  test('summary chain does not absorb separated reference text', () {
    final p = _preview([
      ['SAMPLE SHOP'],
      ['Tea USD 1.00'],
      ['Subtotal EUR reference USD1.00'],
      ['Total USD 1.00'],
    ], geometry: false);
    // This row was not admitted as a subtotal before this repair.
    expect(p.subtotal, isNull);
  });
  test('summary chain does not absorb a separate reference amount', () {
    final p = _preview([
      ['SAMPLE SHOP'],
      ['Tea USD 1.00'],
      ['Subtotal USD 1.00'],
      ['Total EUR 9.00 / USD1.00'],
    ], geometry: false);
    expect(p.total, '1.00');
  });
  for (final label in ['소계', '小計']) {
    for (final money in [
      'EUR USD1.00',
      'EUR / USD1.00',
      'EUR or USD1.00',
      'EUR|USD1.00',
      '₦USD1.00',
      'USD USD1.00',
    ]) {
      test('joined localized summary currency chain $label $money', () {
        final matching = money == 'USD USD1.00';
        final p = _preview([
          ['SAMPLE SHOP'],
          ['Tea USD 1.00'],
          ['$label$money'],
          ['Total USD 1.00'],
        ], geometry: false);
        expect(p.subtotal, '1.00');
        expect(p.subtotalCurrency, matching ? 'USD' : isNull);
        final saved = receiptOcrReviewSaveRequestFromPreview(
          p,
          originalCurrency: 'USD',
        );
        expect(saved!.subtotalAmount, matching ? '1.00' : isNull);
        if (!matching) expect(p.adjustmentsComplete, isFalse);
      });
    }
  }
  for (final label in ['합계', '合計']) {
    for (final money in ['EUR USD1.00', 'USD USD1.00']) {
      test('joined localized total currency chain $label $money', () {
        final matching = money == 'USD USD1.00';
        final p = _preview([
          ['SAMPLE SHOP'],
          ['Tea USD 1.00'],
          ['Subtotal USD 1.00'],
          ['$label$money'],
        ], geometry: false);
        expect(p.total, matching ? '1.00' : isNull);
        if (!matching) expect(p.adjustmentsComplete, isFalse);
      });
    }
  }
  test('recognized nonleading localized label retains currency conflict', () {
    final p = _preview([
      ['SAMPLE SHOP'], ['Tea USD 1.00'],
      ['Summary 소계EUR USD1.00'], ['Total USD 1.00'],
    ], geometry: false);
    expect(p.subtotal, '1.00');
    expect(p.subtotalCurrency, isNull);
    expect(p.adjustmentsComplete, isFalse);
  });
  test('recognized nonleading total label retains currency conflict', () {
    final p = _preview([
      ['SAMPLE SHOP'], ['Tea USD 1.00'], ['Subtotal USD 1.00'],
      ['Receipt 合計EUR USD1.00'],
    ], geometry: false);
    expect(p.total, isNull);
    expect(p.adjustmentsComplete, isFalse);
  });

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
