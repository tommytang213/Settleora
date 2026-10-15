import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';
import '../../integration_test/support/receipt_ocr_fixture_contract.dart';

void main() {
  test('absent preview differs from a preview with no ordinary warnings', () {
    final absent = receiptOcrPreviewWarningEvidence(null);
    final present = receiptOcrPreviewWarningEvidence(const ReceiptOcrPreview());
    expect(absent['previewPresent'], isFalse);
    expect(present['previewPresent'], isTrue);
    expect(absent['previewWarningCount'], 0);
    expect(present['previewWarningCount'], 0);
    expect(
      absent['previewWarningCategoryCounts'],
      present['previewWarningCategoryCounts'],
    );
  });

  const warnings = {
    'No readable receipt text was found.': 'noReadableText',
    'DCC selection needs a matching charged amount. Review the receipt currency.':
        'dccAmountMissing',
    'Item prices and the charged amount use different currencies. Review before applying.':
        'itemChargedCurrencyConflict',
    'Item prices and the receipt currency differ. Review before applying.':
        'itemReceiptCurrencyConflict',
    'No clear item lines were detected.': 'noItems',
    'A rated tax-named charge may be an item or tax. Review it before applying.':
        'ratedTaxAmbiguity',
    'Some OCR lines need manual review because no traceable line amount was found.':
        'untraceableItemAmount',
    'No clear total amount was detected.': 'noTotal',
    'The receipt only shows a currency symbol. Using the current bill currency; review it before applying.':
        'currencyFallback',
    'The receipt only shows a currency symbol. Choose the currency before applying.':
        'symbolCurrencyUnresolved',
    'Conflicting receipt dates were detected. Review the receipt date.':
        'conflictingDate',
    'Stay dates were detected without a transaction date. Review the receipt date.':
        'stayOnlyDate',
  };
  for (final entry in warnings.entries) {
    test('ordinary warning emits only fixed category: ${entry.value}', () {
      final evidence = receiptOcrPreviewWarningEvidence(
        ReceiptOcrPreview(warnings: [entry.key]),
      );
      final counts =
          evidence['previewWarningCategoryCounts']! as Map<String, int>;
      expect(evidence['previewWarningCount'], 1);
      expect(counts[entry.value], 1);
      expect(counts.values.reduce((a, b) => a + b), 1);
      expect(jsonEncode(evidence), isNot(contains(entry.key)));
    });
  }

  test('unknown content stays counted without exposing its text', () {
    const input = 'Synthetic private receipt content 123.45';
    final evidence = receiptOcrPreviewWarningEvidence(
      const ReceiptOcrPreview(warnings: [input]),
    );
    expect(evidence['previewWarningCount'], 1);
    expect(
      (evidence['previewWarningCategoryCounts']! as Map)['unknownWarning'],
      1,
    );
    expect(jsonEncode(evidence), isNot(contains(input)));
    expect(jsonEncode(evidence), isNot(contains('123.45')));
  });

  test('duplicate and mixed warnings retain multiplicity', () {
    final evidence = receiptOcrPreviewWarningEvidence(
      const ReceiptOcrPreview(
        warnings: [
          'No clear item lines were detected.',
          'No clear item lines were detected.',
          'Unknown synthetic warning',
        ],
      ),
    );
    final counts =
        evidence['previewWarningCategoryCounts']! as Map<String, int>;
    expect(evidence['previewWarningCount'], 3);
    expect(counts['noItems'], 2);
    expect(counts['unknownWarning'], 1);
    expect(counts.values.reduce((a, b) => a + b), 3);
  });

  test('reconciliation hint does not count as an ordinary warning', () {
    const preview = ReceiptOcrPreview(
      currency: 'USD',
      subtotal: '10.00',
      total: '15.00',
      items: [
        ReceiptOcrItemCandidate(
          description: 'Generic item',
          lineTotal: '10.00',
          currency: 'USD',
        ),
      ],
    );
    expect(preview.reviewHints, isNotEmpty);
    expect(receiptOcrPreviewWarningEvidence(preview)['previewWarningCount'], 0);
  });

  test(
    'real parser missing-text warning remains independent of review hints',
    () {
      final preview = const ReceiptOcrParser().parse('');
      expect(preview.reviewHints, isEmpty);
      final evidence = receiptOcrPreviewWarningEvidence(preview);
      expect(evidence['previewPresent'], isTrue);
      expect(evidence['previewWarningCount'], 1);
      expect(
        (evidence['previewWarningCategoryCounts']! as Map)['noReadableText'],
        1,
      );
    },
  );
}
