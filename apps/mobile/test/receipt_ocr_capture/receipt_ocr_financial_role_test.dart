import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import '../support/financial_role_receipt.dart';

void main() {
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
