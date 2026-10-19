import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_provider.dart';

import '../../integration_test/support/receipt_ocr_fixture_contract.dart';

void main() {
  test(
    'unattempted and failed processing are distinct without private payloads',
    () {
      expect(receiptOcrFixtureProductObservation({}), [1, 0, 0, 0, 0, 0]);
      expect(receiptOcrFixtureProductObservation({}, processingFailed: true), [
        1,
        1,
        0,
        0,
        1,
        1,
      ]);
      expect(
        receiptOcrFixtureProductObservation(
          {},
          result: const ReceiptOcrResult.failed('private exception contents'),
        ),
        [1, 1, 0, 0, 1, 1],
      );
      expect(
        receiptOcrFixtureProductObservation(
          {},
          result: const ReceiptOcrResult.unsupported('private input details'),
        ),
        [1, 2, 0, 0, 1, 1],
      );
    },
  );

  test(
    'a preview evaluates only processing and the unchanged review contract',
    () {
      const preview = ReceiptOcrPreview();
      final expected = <String, Object?>{};
      final matches = receiptOcrFixtureReviewMatches(preview, expected);
      final observed = receiptOcrFixtureProductObservation(
        expected,
        result: const ReceiptOcrResult.extracted(preview),
      );
      expect(observed, [1, 3, 0, matches ? 1 : 2, 1, 0]);
      // No money, evidence-retention, UI, editability or usefulness check is set.
      expect(observed[4] & ~1, 0);
    },
  );

  test(
    'source-adjudicated arithmetic review is a candidate, never usable proof',
    () {
      const preview = ReceiptOcrPreview(
        currency: 'USD',
        total: '12.00',
        items: [
          ReceiptOcrItemCandidate(
            description: 'Item',
            lineTotal: '10.00',
            currency: 'USD',
          ),
        ],
      );
      final expected = <String, Object?>{
        'expected_review_condition':
            'printed total differs from visible charge-line arithmetic',
      };
      expect(receiptOcrFixtureReviewMatches(preview, expected), isTrue);
      expect(
        receiptOcrFixtureProductObservation(
          expected,
          result: const ReceiptOcrResult.extracted(preview),
        ),
        [1, 3, 4, 1, 1, 0],
      );
      expect(
        receiptOcrFixtureProductObservation(
          {},
          result: const ReceiptOcrResult.extracted(preview),
        ),
        [1, 3, 0, 2, 1, 0],
      );
    },
  );

  test('warning-free wrong money and currency retain strict failures', () {
    const preview = ReceiptOcrPreview(currency: 'EUR', total: '2.00');
    final expected = <String, Object?>{
      'currency': 'USD',
      'total': '12.00',
      'items': <Object?>[],
    };
    final before = receiptOcrFixtureFieldMismatches(
      preview,
      expected,
      'public',
    );
    final observation = receiptOcrFixtureProductObservation(
      expected,
      result: const ReceiptOcrResult.extracted(preview),
    );
    expect(preview.warnings, isEmpty);
    expect(before, containsAll(['currency', 'total']));
    expect(
      receiptOcrFixtureFieldMismatches(preview, expected, 'public'),
      before,
    );
    expect(observation, [1, 3, 0, 1, 1, 0]);
    // Processing success does not evaluate monetary/currency safety.
    expect(observation[4] & ~1, 0);
  });

  test(
    'unknown source review wording is bounded and cannot be a review candidate',
    () {
      expect(
        receiptOcrFixtureProductObservation({
          'expected_review_condition': 'private unexpected contract contents',
        }, result: const ReceiptOcrResult.extracted(ReceiptOcrPreview())),
        [1, 3, 7, 2, 1, 0],
      );
    },
  );

  test(
    'each existing review kind is identified without evaluating an absent draft',
    () {
      const conditions = [
        'printed unsupported fees need manual review',
        'printed combined taxes and fees need manual review',
        'printed fee and payment credit need manual review',
        'printed total differs from visible charge-line arithmetic',
        'printed item currency differs from charged receipt currency',
        'printed surcharge and account credit need manual review',
      ];
      for (var index = 0; index < conditions.length; index++) {
        expect(
          receiptOcrFixtureProductObservation({
            'expected_review_condition': conditions[index],
          }),
          [1, 0, index + 1, 0, 0, 0],
        );
      }
    },
  );
}
