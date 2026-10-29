import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';
import '../../integration_test/support/receipt_ocr_fixture_contract.dart';

ReceiptOcrPreview _preview(Map<String, String?> fields) => ReceiptOcrPreview(
  merchant: fields['merchant'],
  receiptDate: fields['date'],
  currency: fields['currency'],
  subtotal: fields['subtotal'],
  tax: fields['tax'],
  service: fields['service'],
  tip: fields['tip'],
  shipping: fields['shipping'],
  discount: fields['discount'],
  total: fields['total'],
);

void main() {
  const values = {
    'merchant': 'Synthetic Private Merchant',
    'date': '2026-08-09',
    'currency': 'USD',
    'subtotal': '72.19',
    'tax': '72.19',
    'service': '72.19',
    'tip': '72.19',
    'shipping': '72.19',
    'discount': '72.19',
    'total': '72.19',
  };
  for (final field in values.keys) {
    for (final state in [
      'matchingValue',
      'matchingAbsence',
      'missingValue',
      'differentValue',
      'unexpectedValue',
      'noPreview',
    ]) {
      test('bounded header evidence: $field $state', () {
        final expected = <String, Object?>{
          'items': <Object?>[],
          if (state != 'matchingAbsence' && state != 'unexpectedValue')
            field: values[field],
        };
        final actual = <String, String?>{
          if (state != 'missingValue' && state != 'matchingAbsence')
            field: state == 'differentValue'
                ? 'Different Private Value'
                : values[field],
        };
        final preview = state == 'noPreview' ? null : _preview(actual);
        final evidence = receiptOcrHeaderFieldEvidence(preview, expected);
        final states = evidence['headerFieldStates']! as Map<String, String>;
        expect(states.keys.toSet(), values.keys.toSet());
        expect(states[field], state);
        expect(
          states.values.where((v) => v == 'noPreview').length,
          preview == null ? 10 : 0,
        );
        if (preview != null) {
          final strict = receiptOcrFixtureFieldMismatches(
            preview,
            expected,
            'synthetic',
          );
          expect(
            strict.contains(field),
            [
              'missingValue',
              'differentValue',
              'unexpectedValue',
            ].contains(state),
          );
        }
        final encoded = jsonEncode(evidence);
        for (final value in [...values.values, 'Different Private Value']) {
          expect(encoded, isNot(contains(value)));
        }
      });
    }
  }

  test('merchant normalization is exactly the existing strict comparison', () {
    final result = receiptOcrHeaderFieldEvidence(
      const ReceiptOcrPreview(merchant: '  Synthetic\n Merchant  '),
      {'merchant': 'Synthetic Merchant'},
    );
    expect((result['headerFieldStates']! as Map)['merchant'], 'matchingValue');
    final changedCase = receiptOcrHeaderFieldEvidence(
      const ReceiptOcrPreview(merchant: 'synthetic merchant'),
      {'merchant': 'Synthetic Merchant'},
    );
    expect(
      (changedCase['headerFieldStates']! as Map)['merchant'],
      'differentValue',
    );
  });

  test(
    'explicit null and omitted expectations share legacy absence semantics',
    () {
      const preview = ReceiptOcrPreview(total: '72.19');
      expect(
        receiptOcrHeaderFieldEvidence(preview, {}),
        receiptOcrHeaderFieldEvidence(preview, {'total': null}),
      );
    },
  );

  test('warnings do not relabel a matching field or establish confidence', () {
    final quiet = receiptOcrHeaderFieldEvidence(
      const ReceiptOcrPreview(total: '72.19'),
      {'total': '72.19'},
    );
    final warned = receiptOcrHeaderFieldEvidence(
      const ReceiptOcrPreview(
        total: '72.19',
        warnings: ['Synthetic private warning'],
      ),
      {'total': '72.19'},
    );
    expect(quiet, warned);
    expect(quiet.keys, ['headerFieldStates']);
  });

  test('unknown expectation keys cannot become diagnostic keys or content', () {
    final result = receiptOcrHeaderFieldEvidence(const ReceiptOcrPreview(), {
      'Private field': 'Private content',
    });
    expect(jsonEncode(result), isNot(contains('Private')));
    expect((result['headerFieldStates']! as Map).length, 10);
  });
}
