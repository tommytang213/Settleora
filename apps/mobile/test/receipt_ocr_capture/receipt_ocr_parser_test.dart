import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/mlkit_receipt_ocr_provider.dart';
import 'package:mobile/receipt_ocr_capture/receipt_image_normalization_policy.dart';
import 'package:mobile/receipt_ocr_capture/receipt_intake_safety.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_provider.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';
import 'package:mobile/receipt_ocr_capture/unsupported_receipt_ocr_provider.dart';
import 'package:mobile/ui/settleora_form_fields.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

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
    expect(preview.items.last.quantity, '1');
    expect(preview.items.last.lineTotal, '18.00');
    expect(preview.reviewHints, isEmpty);
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
    expect(preview.reviewHints, [
      'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
    ]);
  });

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
    expect(hongKongContext.currency, 'HKD');
    expect(
      hongKongContext.currencyProvenance,
      ReceiptOcrCurrencyProvenance.contextInferred,
    );
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
  });

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
  });

  test(
    'preview avoids grand total mismatch warning when charges can explain it',
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

      expect(preview.reviewHints, [
        'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.',
      ]);
      expect(
        preview.reviewHints,
        isNot(contains('OCR item total differs from detected grand total.')),
      );
    },
  );

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
