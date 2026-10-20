import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrPreview preview({
  List<String> items = const ['10.000'],
  String? subtotal,
  String? tax,
  String? service,
  String? tip,
  String? shipping,
  String? discount,
  String total = '11.000',
  bool included = false,
  bool beforeSubtotal = false,
}) => ReceiptOcrPreview(
  currency: 'KWD',
  subtotal: subtotal,
  tax: tax,
  service: service,
  tip: tip,
  shipping: shipping,
  discount: discount,
  taxIncludedInTotal: included,
  discountBeforeSubtotal: beforeSubtotal,
  total: total,
  items: [
    for (final amount in items)
      ReceiptOcrItemCandidate(
        description: 'Generic item',
        lineTotal: amount,
        currency: 'KWD',
      ),
  ],
);

void expectDecision(
  ReceiptOcrPreview value,
  ReceiptOcrReviewDecision decision,
) {
  final printed = [
    value.subtotal,
    value.tax,
    value.service,
    value.tip,
    value.shipping,
    value.discount,
    value.total,
    ...value.items.map((item) => item.lineTotal),
  ];
  expect(value.reviewHintDecision, decision);
  expect(
    value.reviewHints,
    decision == ReceiptOcrReviewDecision.none ? isEmpty : isNotEmpty,
  );
  expect([
    value.subtotal,
    value.tax,
    value.service,
    value.tip,
    value.shipping,
    value.discount,
    value.total,
    ...value.items.map((item) => item.lineTotal),
  ], printed);
}

void main() {
  const wrappedOne = '18446744073709552.616';
  const unreconciled =
      ReceiptOcrReviewDecision.referenceAdjustmentUnreconciledWithoutSubtotal;
  for (final (name, value) in [
    ('tax scale', preview(tax: wrappedOne)),
    ('service scale', preview(service: wrappedOne)),
    ('tip scale', preview(tip: wrappedOne)),
    ('shipping scale', preview(shipping: wrappedOne)),
    ('discount scale', preview(discount: wrappedOne, total: '9.000')),
    (
      'negative discount scale',
      preview(discount: '-$wrappedOne', total: '9.000'),
    ),
    ('item scale', preview(items: ['18446744073709561.616'], tax: '1.000')),
    (
      'adjustment sum',
      preview(tax: '9223372036854775.808', service: '9223372036854776.808'),
    ),
    (
      'included gross tax scale',
      preview(tax: wrappedOne, included: true, total: '10.000'),
    ),
    ('included net tax scale', preview(tax: wrappedOne, included: true)),
    (
      'negative included tax',
      preview(tax: '-18446744073709550.616', included: true, total: '10.000'),
    ),
    (
      'negative minimum discount',
      preview(
        items: ['0.000'],
        discount: '-9223372036854775.808',
        total: '9223372036854775.808',
      ),
    ),
  ]) {
    test(
      '$name cannot silence an adjustment mismatch',
      () => expectDecision(value, unreconciled),
    );
  }

  test('item sum cannot wrap to a matching grand total', () {
    expectDecision(
      preview(
        items: ['9223372036854775.808', '9223372036854775.808', '10.000'],
        total: '10.000',
      ),
      ReceiptOcrReviewDecision.grandTotalMismatchWithoutSubtotal,
    );
  });
  test('minimum native difference cannot pass absolute tolerance', () {
    expectDecision(
      preview(items: ['0.000'], total: '9223372036854775.808'),
      ReceiptOcrReviewDecision.grandTotalMismatchWithoutSubtotal,
    );
  });
  test('subtotal cannot wrap to matching items', () {
    expectDecision(
      preview(subtotal: '18446744073709561.616', total: '10.000'),
      ReceiptOcrReviewDecision.subtotalMismatch,
    );
  });
  test('wrapped adjustment retains warning with matching subtotal', () {
    expectDecision(
      preview(subtotal: '10.000', tax: wrappedOne),
      ReceiptOcrReviewDecision.referenceAdjustmentUnreconciledWithSubtotal,
    );
  });
  test('wrapped discount cannot corroborate discounted subtotal', () {
    expectDecision(
      preview(
        discount: wrappedOne,
        beforeSubtotal: true,
        subtotal: '9.000',
        total: '9.000',
      ),
      ReceiptOcrReviewDecision.subtotalMismatch,
    );
  });
  for (final (name, value) in [
    ('ordinary additive tax', preview(tax: '1.000')),
    (
      'included gross tax',
      preview(tax: '1.000', included: true, total: '10.000'),
    ),
    ('included net tax', preview(tax: '1.000', included: true)),
    ('ordinary discount', preview(discount: '1.000', total: '9.000')),
    (
      'zero before-subtotal discount',
      preview(
        subtotal: '10.000',
        discount: '0.000',
        beforeSubtotal: true,
        total: '10.000',
      ),
    ),
    ('one-cent tolerance', preview(tax: '1.000', total: '11.010')),
    (
      'huge valid sum',
      preview(
        items: ['9223372036854775808.000'],
        tax: '1.000',
        total: '9223372036854775809.000',
      ),
    ),
    (
      'huge included gross tax',
      preview(
        items: ['9223372036854775808.000'],
        tax: '9223372036854775807.000',
        included: true,
        total: '9223372036854775808.000',
      ),
    ),
  ]) {
    test(
      '$name remains quiet',
      () => expectDecision(value, ReceiptOcrReviewDecision.none),
    );
  }
  test('beyond one-cent tolerance still warns', () {
    expectDecision(preview(tax: '1.000', total: '11.011'), unreconciled);
  });
}
