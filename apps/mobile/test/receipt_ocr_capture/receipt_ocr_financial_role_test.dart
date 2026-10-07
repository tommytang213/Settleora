import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import '../support/financial_role_receipt.dart';

void main() {
  for (final period in [false, true]) {
    for (final role in ['Discounts', 'Coupons', 'Rebates']) {
      for (final fragments in [
        [role, '(7.00)'],
        ['7.00', role],
        [role, '(7)'],
      ]) {
        test(
          'role-number evidence remains unresolved: $fragments period=$period',
          () {
            final source = financialRoleReceipt(
              fragments.join(' '),
              labelBlocks: fragments,
              total: 'USD 18.00',
              servicePeriod: period ? 'Feb 5 - Mar 4, 2025' : null,
            );
            final preview = const ReceiptOcrParser().parse(
              source.text,
              blocks: source.blocks,
            );
            expect(preview.items.single.description, "Resident's Water Plan");
            expect(preview.adjustmentsComplete, isFalse);
            expect(preview.reviewHints, isNotEmpty);
            expect(preview.blocks, source.blocks);
          },
        );
      }
      for (final qualifier in ['(10%)', '(PROMO7)', '(Ref 7)']) {
        test(
          'role-number known qualifier stays complete: $role $qualifier period=$period',
          () {
            final source = financialRoleReceipt(
              '$role $qualifier',
              labelBlocks: [role, qualifier],
              total: 'USD 18.00',
              servicePeriod: period ? 'Feb 5 - Mar 4, 2025' : null,
            );
            final preview = const ReceiptOcrParser().parse(
              source.text,
              blocks: source.blocks,
            );
            expect(preview.items.single.description, "Resident's Water Plan");
            expect(preview.discount, '2.00');
            expect(preview.adjustmentsComplete, isTrue);
            expect(preview.reviewHints, isEmpty);
            expect(preview.blocks, source.blocks);
          },
        );
      }
    }
    for (final role in ['Service Charge', 'Service Fees']) {
      for (final rate in ['10%', '(10%)', '10.5%', '(10.5%)']) {
        test(
          'role-number service rate stays complete: $role $rate period=$period',
          () {
            final source = financialRoleReceipt(
              '$role $rate',
              labelBlocks: [role, rate],
              servicePeriod: period ? 'Feb 5 - Mar 4, 2025' : null,
            );
            final preview = const ReceiptOcrParser().parse(
              source.text,
              blocks: source.blocks,
            );
            expect(preview.items.single.description, "Resident's Water Plan");
            expect(preview.service, '2.00');
            expect(preview.discount, isNull);
            expect(preview.adjustmentsComplete, isTrue);
            expect(preview.reviewHints, isEmpty);
            expect(preview.blocks, source.blocks);
          },
        );
      }
    }
  }
  for (final amountOnLeft in [false, true]) {
    for (final fragments in [
      ['Taxes', 'Advisory Plan'],
      ['Discounts', 'Book'],
    ]) {
      test(
        'complete column retains gap product: $fragments left=$amountOnLeft',
        () {
          final source = financialRoleReceipt(
            fragments.join(' '),
            labelBlocks: fragments,
            labelBounds: [(left: 20, right: 160), (left: 330, right: 380)],
            amountOnLeft: amountOnLeft,
          );
          final preview = const ReceiptOcrParser().parse(
            source.text,
            blocks: source.blocks,
          );
          expect(
            preview.items.map((item) => (item.description, item.lineTotal)),
            [("Resident's Water Plan", '20.00'), (fragments.join(' '), '2.00')],
          );
          expect(preview.tax, isNull);
          expect(preview.discount, isNull);
          expect(preview.adjustmentsComplete, isTrue);
          expect(preview.reviewHints, isEmpty);
          expect(preview.blocks, source.blocks);
        },
      );
    }
  }
  for (final period in [false, true]) {
    for (final fragments in [
      ['Taxes', '7'],
      ['Taxes', '7.00'],
      ['Tax.', '7'],
    ]) {
      test(
        'complete column preserves unresolved number: $fragments period=$period',
        () {
          final source = financialRoleReceipt(
            fragments.join(' '),
            labelBlocks: fragments,
            servicePeriod: period ? 'Feb 5 - Mar 4, 2025' : null,
          );
          final preview = const ReceiptOcrParser().parse(
            source.text,
            blocks: source.blocks,
          );
          expect(preview.items.single.description, "Resident's Water Plan");
          expect(preview.tax, isNull);
          expect(preview.adjustmentsComplete, isFalse);
          expect(preview.reviewHints, isNotEmpty);
          expect(preview.blocks, source.blocks);
        },
      );
    }
    for (final rate in ['7%', '(7%)']) {
      test(
        'complete column retains known split percentage: $rate period=$period',
        () {
          final source = financialRoleReceipt(
            'Taxes $rate',
            labelBlocks: ['Taxes', rate],
            servicePeriod: period ? 'Feb 5 - Mar 4, 2025' : null,
          );
          final preview = const ReceiptOcrParser().parse(
            source.text,
            blocks: source.blocks,
          );
          expect(preview.items.single.description, "Resident's Water Plan");
          expect(preview.tax, '2.00');
          expect(preview.adjustmentsComplete, isTrue);
          expect(preview.reviewHints, isEmpty);
          expect(preview.blocks, source.blocks);
        },
      );
    }
  }
  for (final period in [false, true]) {
    for (final fragments
        in period
            ? [
                ['Taxes', 'Advisory Plan'],
                ['Tax', 'Advisory Plan'],
                ['Discounts', 'Plan'],
                ['Coupons', 'Plan'],
              ]
            : [
                ['Taxes', 'Advisory Plan'],
                ['Taxes', 'Return Kit'],
                ['Discounts', 'Book'],
                ['Coupons', 'Guide'],
                ['Rebates', 'Software'],
                ['Tax', 'Advisory Plan'],
              ]) {
      for (final fragmented in [false, true]) {
        test(
          'fragmented named product keeps whole description: $fragments period=$period fragmented=$fragmented',
          () {
            final source = financialRoleReceipt(
              fragments.join(' '),
              labelBlocks: fragmented ? fragments : null,
              servicePeriod: period ? 'Feb 5 - Mar 4, 2025' : null,
            );
            final preview = const ReceiptOcrParser().parse(
              source.text,
              blocks: source.blocks,
            );
            expect(
              preview.items.map((item) => (item.description, item.lineTotal)),
              [
                ("Resident's Water Plan", '20.00'),
                (fragments.join(' '), '2.00'),
              ],
            );
            expect(preview.tax, isNull);
            expect(preview.discount, isNull);
            expect(preview.service, isNull);
            expect(preview.adjustmentsComplete, isTrue);
            expect(preview.reviewHints, isEmpty);
            expect(preview.blocks, source.blocks);
          },
        );
      }
    }
  }
  for (final fragments in [
    ['Taxes', 'Miscellaneous'],
    ['Discounts', 'Miscellaneous'],
  ]) {
    test(
      'fragmented unknown financial suffix stays unresolved: $fragments',
      () {
        final source = financialRoleReceipt(
          fragments.join(' '),
          labelBlocks: fragments,
        );
        final preview = const ReceiptOcrParser().parse(
          source.text,
          blocks: source.blocks,
        );
        expect(preview.items.single.description, "Resident's Water Plan");
        expect(preview.tax, isNull);
        expect(preview.discount, isNull);
        expect(preview.adjustmentsComplete, isFalse);
        expect(preview.reviewHints, isNotEmpty);
      },
    );
  }
  for (final fragments in [
    ['State', 'Taxes'],
    ['Service', 'Charges'],
  ]) {
    test('fragmented complete header retains whole role: $fragments', () {
      final source = financialRoleReceipt(
        fragments.join(' '),
        labelBlocks: fragments,
      );
      final preview = const ReceiptOcrParser().parse(
        source.text,
        blocks: source.blocks,
      );
      expect(preview.items.single.description, "Resident's Water Plan");
      expect(preview.tax, fragments.first == 'State' ? '2.00' : null);
      expect(preview.service, fragments.first == 'Service' ? '2.00' : null);
      expect(preview.adjustmentsComplete, isTrue);
      expect(preview.reviewHints, isEmpty);
    });
  }
  for (final item in [
    'Taxes Plan',
    'Discounts Plan',
    'Coupons Plan',
    'Water Services',
  ]) {
    test('bounded period columns retain one named plural role: $item', () {
      final source = financialRoleReceipt(
        'Tax.',
        item: item,
        servicePeriod: 'Feb 5 - Mar 4, 2025',
      );
      final preview = const ReceiptOcrParser().parse(
        source.text,
        blocks: source.blocks,
      );
      expect(preview.items.single.description, item);
      expect(preview.tax, '2.00');
      expect(preview.adjustmentsComplete, isTrue);
      expect(preview.reviewHints, isEmpty);
    });
  }
  for (final mode in ['none', 'merged', 'split']) {
    for (final label in [
      'Tax',
      'Tax:',
      'Tax.',
      'Taxes',
      'Taxes:',
      'Taxes.',
      'Service Charge',
      'Service Charge.',
      'Service Charges',
      'Service Fees.',
      'Tips',
      'Tips.',
      'Shipping Fee',
      'Shipping Charges',
      'Shipping and Handling Fees',
      'Delivery Fee',
      'Delivery Charges',
    ]) {
      test(
        '$mode maps complete $label to header money, retaining item punctuation',
        () {
          final source = financialRoleReceipt(label, mode: mode);
          final preview = const ReceiptOcrParser().parse(
            source.text,
            blocks: source.blocks,
          );
          expect(preview.items.map((i) => (i.description, i.lineTotal)), [
            ("Resident's Water Plan", '20.00'),
          ]);
          expect(preview.tax, label.startsWith('Tax') ? '2.00' : null);
          expect(preview.service, label.startsWith('Service') ? '2.00' : null);
          expect(preview.tip, label.startsWith('Tip') ? '2.00' : null);
          expect(
            preview.shipping,
            label.startsWith('Shipping') || label.startsWith('Delivery')
                ? '2.00'
                : null,
          );
          expect(preview.adjustmentsComplete, isTrue);
          expect(preview.reviewHints, isEmpty);
          expect(preview.blocks, source.blocks);
        },
      );
    }
    for (final label in [
      'Service Fee and Tax',
      'Tax and Service Charge',
      'Tax / Service Fee',
      'Service Charge (Tax)',
      'Tax 5% and Service Fee',
      'Service Charge (5% Tax)',
      'Service Charge Plan',
      'Monthly Service Fee',
      'Taxes and Fees',
      'Discounts and Tips',
      'Shipping Fee and Tax',
      'Environmental Levy',
      'Regulatory Fee',
      'Charges',
      'Fees',
      'Surcharges',
      'Refunds',
      'Credits',
      'Deposits',
      'Levies',
      'Duties',
      'Donations',
    ]) {
      test('$mode keeps compound $label unresolved', () {
        final source = financialRoleReceipt(label, mode: mode);
        final preview = const ReceiptOcrParser().parse(
          source.text,
          blocks: source.blocks,
        );
        expect(preview.items.map((i) => i.description), [
          "Resident's Water Plan",
        ]);
        expect(preview.tax, isNull);
        expect(preview.service, isNull);
        expect(preview.adjustmentsComplete, isFalse);
        expect(preview.reviewHints, isNotEmpty);
        expect(preview.blocks, source.blocks);
      });
    }
    test('$mode retains period in an ordinary product name', () {
      final source = financialRoleReceipt(
        'Tax.',
        mode: mode,
        item: 'Resident Water Co.',
      );
      final preview = const ReceiptOcrParser().parse(
        source.text,
        blocks: source.blocks,
      );
      expect(preview.items.single.description, 'Resident Water Co.');
      expect(preview.tax, '2.00');
    });
  }
  for (final mode in ['none', 'merged', 'split']) {
    test('$mode keeps suggested plural tips out of header money', () {
      final source = financialRoleReceipt(
        'Suggested Tips',
        mode: mode,
        total: 'USD 20.00',
      );
      final preview = const ReceiptOcrParser().parse(
        source.text,
        blocks: source.blocks,
      );
      expect(preview.items.single.description, "Resident's Water Plan");
      expect(preview.tip, isNull);
      expect(preview.adjustmentsComplete, isTrue);
      expect(preview.reviewHints, isEmpty);
    });
    for (final label in [
      'Discounts',
      'Discounts.',
      'Coupons',
      'Coupons.',
      'Rebates',
      'Rebates.',
    ]) {
      test('$mode retains plural $label as a discount', () {
        final source = financialRoleReceipt(
          label,
          mode: mode,
          total: 'USD 18.00',
        );
        final preview = const ReceiptOcrParser().parse(
          source.text,
          blocks: source.blocks,
        );
        expect(preview.items.single.description, "Resident's Water Plan");
        expect(preview.discount, '2.00');
        expect(preview.adjustmentsComplete, isTrue);
        expect(preview.reviewHints, isEmpty);
        expect(preview.blocks, source.blocks);
      });
    }
  }
  for (final labels in [
    ['Tax.', 'and Service Fee'],
    ['Service Charge.', 'and Tax'],
    ['Tax.', 'and', 'Service', 'Fee'],
    ['Taxes.', 'and Fees'],
  ]) {
    test('fragmented financial labels retain all roles: $labels', () {
      final source = financialRoleReceipt(
        labels.join(' '),
        labelBlocks: labels,
      );
      final preview = const ReceiptOcrParser().parse(
        source.text,
        blocks: source.blocks,
      );
      expect(preview.items.map((i) => (i.description, i.lineTotal)), [
        ("Resident's Water Plan", '20.00'),
      ]);
      expect(preview.tax, isNull);
      expect(preview.service, isNull);
      expect(preview.adjustmentsComplete, isFalse);
      expect(preview.reviewHints, isNotEmpty);
      expect(preview.rawTextLineCount, source.text.split('\n').length);
      expect(preview.blocks, source.blocks);
    });
  }
  for (final item in [
    'Tax Advisory Plan',
    'Tax Return Kit',
    'Taxes Advisory Plan',
    'Taxes Return Kit',
    'Tips Guide',
    'Discounts Book',
    'Energy Charges',
    'Water Services',
    'Payment Processing Subscription',
    'Water Service',
    'Energy Charge',
  ]) {
    for (final mode in ['none', 'merged', 'split']) {
      test('$mode retains named product $item', () {
        final source = financialRoleReceipt('Tax.', mode: mode, item: item);
        final preview = const ReceiptOcrParser().parse(
          source.text,
          blocks: source.blocks,
        );
        expect(preview.items.single.description, item);
        expect(preview.tax, '2.00');
        expect(preview.reviewHints, isEmpty);
      });
    }
  }
  for (final mode in ['none', 'merged', 'split']) {
    for (final label in ['Tax.', 'Taxes.']) {
      for (final amount in ['USD 1.00 USD 2.00', '2.00%', '- USD 2.00']) {
        test(
          '$mode does not promote competing/rate/signed $label amount $amount',
          () {
            final source = financialRoleReceipt(
              label,
              mode: mode,
              amount: amount,
            );
            final preview = const ReceiptOcrParser().parse(
              source.text,
              blocks: source.blocks,
            );
            expect(preview.items.map((i) => i.description), [
              "Resident's Water Plan",
            ]);
            expect(preview.adjustmentsComplete, isFalse);
            expect(preview.reviewHints, isNotEmpty);
          },
        );
      }
    }
  }
  for (final row in [
    'Water Plan 03/04/2025',
    'Water Plan 0.10',
    'Water Plan USD 0.10',
    'Water Plan 5%',
    'Water Plan -',
  ]) {
    test('text column ambiguity stays unresolved: $row', () {
      final source = financialRoleReceipt('Tax.', mode: 'none', item: row);
      final preview = const ReceiptOcrParser().parse(source.text);
      expect(preview.items, isEmpty);
      expect(preview.adjustmentsComplete, isFalse);
      expect(preview.reviewHints, isNotEmpty);
    });
  }
  for (final columns in [
    ['Description', 'Rate', 'Amount'],
    ['Description', 'Date', 'Amount'],
    ['Description', 'Quantity', 'Amount'],
  ]) {
    test('missing final amount in ${columns.join(' ')} needs geometry', () {
      final source = financialRoleReceipt(
        'Tax.',
        mode: 'none',
        columns: columns,
      );
      final preview = const ReceiptOcrParser().parse(source.text);
      expect(preview.items, isEmpty);
      expect(preview.adjustmentsComplete, isFalse);
    });
  }
}
