import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

import '../../integration_test/support/receipt_ocr_fixture_contract.dart';

void main() {
  Map<String, Object?> expected() => {
    'currency': null,
    'items': [
      {'description': 'Soup', 'line_total': '8', 'currency': '¥'},
      {'description': 'Tea', 'line_total': '5', 'currency': '¥'},
    ],
  };

  ReceiptOcrPreview draft({String? itemCurrency = '¥', String? currency}) =>
      ReceiptOcrPreview(
        currency: currency,
        items: [
          ReceiptOcrItemCandidate(
            description: 'Soup',
            lineTotal: '8',
            currency: itemCurrency,
          ),
          ReceiptOcrItemCandidate(
            description: 'Tea',
            lineTotal: '5',
            currency: itemCurrency,
          ),
        ],
      );

  test('exact printed yen marker is distinct from resolved currency', () {
    expect(
      receiptOcrFixtureFieldMismatches(draft(), expected(), 'synthetic'),
      isEmpty,
    );
  });

  for (final currency in [null, 'JPY', 'CNY', 'USD']) {
    test('missing or substituted item marker still fails: $currency', () {
      expect(
        receiptOcrFixtureFieldMismatches(
          draft(itemCurrency: currency),
          expected(),
          'synthetic',
        ),
        ['items[0].currency', 'items[1].currency'],
      );
    });
  }

  for (final currency in ['JPY', 'CNY']) {
    test('invented receipt denomination still fails: $currency', () {
      expect(
        receiptOcrFixtureFieldMismatches(
          draft(currency: currency),
          expected(),
          'synthetic',
        ),
        ['currency'],
      );
    });
  }

  test('legacy null item expectation still compares exactly', () {
    final legacy = {
      'currency': null,
      'items': [
        ['Soup', '8'],
        ['Tea', '5'],
      ],
    };
    expect(receiptOcrFixtureFieldMismatches(draft(), legacy, 'synthetic'), [
      'items[0].currency',
      'items[1].currency',
    ]);
  });

  for (final currency in ['', 'yen', 'JPY/CNY', r'$', '€', '¥ ', '¥JPY', 1]) {
    test(
      'unsupported fixture currency representation is rejected: $currency',
      () {
        expect(
          () => ReceiptOcrFixtureItem.fromManifest({
            'description': 'Soup',
            'line_total': '8',
            'currency': currency,
          }, 'synthetic'),
          throwsStateError,
        );
      },
    );
  }

  test('wrong money remains a mismatch with the correct printed marker', () {
    final changed = expected();
    (changed['items']! as List).first['line_total'] = '9';
    expect(receiptOcrFixtureFieldMismatches(draft(), changed, 'synthetic'), [
      'items[0].lineTotal',
    ]);
  });

  test('parser preserves unresolved marker and save withholds its money', () {
    final parsed = const ReceiptOcrParser().parse('''
Harbor Kitchen
Date 2027-08-23
Soup ¥8
Tea ¥5
Total ¥13
''');
    expect(parsed.currency, isNull);
    expect(parsed.currencyProvenance, ReceiptOcrCurrencyProvenance.unresolved);
    expect(parsed.items.map((item) => item.currency), ['¥', '¥']);
    expect(
      parsed.warnings,
      contains(
        'The receipt only shows a currency symbol. Choose the currency before applying.',
      ),
    );
    expect(
      receiptOcrFixtureFieldMismatches(parsed, {
        ...expected(),
        'merchant': 'Harbor Kitchen',
        'date': '2027-08-23',
        'total': '13',
      }, 'synthetic'),
      isEmpty,
    );
    final lines = receiptOcrReviewLinesFromPreview(parsed);
    expect(lines.map((line) => line.text), ['Soup', 'Tea']);
    expect(
      lines.every(
        (line) => line.lineTotalAmount == null && line.unitPriceAmount == null,
      ),
      isTrue,
    );
  });
}
