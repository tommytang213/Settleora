import 'dart:convert';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mobile/receipt_ocr_capture/paddle_receipt_ocr_provider.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_provider.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  const fixtures = _AndroidAcceptanceFixtures();
  const provider = PaddleReceiptOcrProvider();

  testWidgets('all 101 real images match complete preview truth', (
    WidgetTester tester,
  ) async {
    final manifest =
        jsonDecode(utf8.decode(await fixtures.load('manifest.json')))
            as Map<String, Object?>;
    expect(manifest['schema_version'], 2);
    final entries = (manifest['fixtures']! as List<Object?>)
        .cast<Map<String, Object?>>();
    expect(entries, hasLength(101));

    for (final entry in entries) {
      final fixtureId = entry['id']! as String;
      final expected = entry['expected']! as Map<String, Object?>;
      final currencyResolution =
          entry['expected_currency_resolution'] as Map<String, Object?>?;
      final fallbackCurrency =
          currencyResolution?['source'] == 'default_fallback'
          ? (currencyResolution?['currency'] as String?)
          : null;
      final result = await provider.extractReceipt(
        ReceiptOcrRequest(
          bytes: await fixtures.load(entry['file']! as String),
          contentType: 'image/jpeg',
          fallbackCurrency: fallbackCurrency,
        ),
      );

      expect(result.status, ReceiptOcrStatus.extracted, reason: fixtureId);
      final preview = result.preview!;
      _expectField(fixtureId, 'merchant', preview.merchant, expected);
      _expectField(fixtureId, 'date', preview.receiptDate, expected);
      _expectField(fixtureId, 'currency', preview.currency, expected);
      _expectField(fixtureId, 'subtotal', preview.subtotal, expected);
      _expectField(fixtureId, 'tax', preview.tax, expected);
      _expectField(fixtureId, 'service', preview.service, expected);
      _expectField(fixtureId, 'discount', preview.discount, expected);
      _expectField(fixtureId, 'total', preview.total, expected);

      final expectedItems = (expected['items']! as List<Object?>)
          .cast<List<Object?>>();
      expect(preview.items, hasLength(expectedItems.length), reason: fixtureId);
      for (var index = 0; index < expectedItems.length; index += 1) {
        expect(
          _normalizedText(preview.items[index].description),
          _normalizedText(expectedItems[index][0] as String),
          reason: '$fixtureId item[$index].description',
        );
        expect(
          preview.items[index].lineTotal,
          expectedItems[index][1],
          reason: '$fixtureId item[$index].lineTotal',
        );
      }

      if (currencyResolution != null) {
        expect(
          preview.currencyProvenance,
          _currencyProvenance(currencyResolution['source']! as String),
          reason: '$fixtureId currency provenance',
        );
      }
      expect(preview.blocks, isNotEmpty, reason: '$fixtureId OCR evidence');
      expect(
        preview.runEvidence?.runtime,
        'onnxruntime-android-cpu',
        reason: '$fixtureId runtime evidence',
      );
    }
  });
}

void _expectField(
  String fixtureId,
  String field,
  String? actual,
  Map<String, Object?> expected,
) {
  if (!expected.containsKey(field)) return;
  final expectedValue = expected[field];
  if (field == 'merchant' && expectedValue is String) {
    expect(
      _normalizedText(actual),
      _normalizedText(expectedValue),
      reason: '$fixtureId $field',
    );
    return;
  }
  expect(actual, expectedValue, reason: '$fixtureId $field');
}

String _normalizedText(String? value) =>
    (value ?? '').replaceAll(RegExp(r'\s+'), ' ').trim();

ReceiptOcrCurrencyProvenance _currencyProvenance(String source) {
  return switch (source) {
    'explicit' => ReceiptOcrCurrencyProvenance.explicit,
    'context_inferred' => ReceiptOcrCurrencyProvenance.contextInferred,
    'default_fallback' => ReceiptOcrCurrencyProvenance.defaultFallback,
    'unresolved' => ReceiptOcrCurrencyProvenance.unresolved,
    _ => throw StateError('Unknown manifest currency source'),
  };
}

class _AndroidAcceptanceFixtures {
  const _AndroidAcceptanceFixtures();

  static const _channel = MethodChannel(
    'com.settleora.mobile/receipt_ocr_acceptance',
  );

  Future<Uint8List> load(String path) async {
    final bytes = await _channel.invokeMethod<Uint8List>('loadFixture', {
      'path': path,
    });
    if (bytes == null || bytes.isEmpty) {
      throw StateError('OCR acceptance fixture unavailable');
    }
    return bytes;
  }
}
