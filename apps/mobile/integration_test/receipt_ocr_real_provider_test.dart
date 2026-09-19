import 'dart:convert';
import 'dart:io';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:integration_test/integration_test.dart';
import 'package:mobile/receipt_ocr_capture/paddle_receipt_ocr_provider.dart';
import 'package:mobile/receipt_ocr_capture/receipt_image_artifact_processor.dart';
import 'package:mobile/receipt_ocr_capture/receipt_image_normalization_policy.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_provider.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  const fixtures = _NativeAcceptanceFixtures();
  const provider = PaddleReceiptOcrProvider();
  const artifactProcessor = ReceiptImageArtifactProcessor();

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
      expect(
        expected.keys.toSet().difference(_supportedExpectedKeys),
        isEmpty,
        reason: '$fixtureId contains unvalidated expected keys',
      );
      final currencyResolution =
          entry['expected_currency_resolution'] as Map<String, Object?>?;
      final artifact = artifactProcessor.process(
        ReceiptImageArtifactRequest(
          sourceType: ReceiptImageSourceKind.importedImage,
          sourceContentType: 'image/jpeg',
          sourceBytes: await fixtures.load(entry['file']! as String),
          sourceExtension: 'jpeg',
          sourceLabel: fixtureId,
        ),
      );
      expect(artifact.accepted, isTrue, reason: fixtureId);
      expect(artifact.normalizedJpegProduced, isTrue, reason: fixtureId);
      final result = await provider.extractReceipt(
        ReceiptOcrRequest(
          bytes: artifact.normalizedJpegBytes!,
          contentType: artifact.normalizedContentType!,
          fallbackCurrency: entry['fallback_currency'] as String?,
        ),
      );

      _expectCompletePreview(
        fixtureId,
        result,
        expected,
        currencyResolution: currencyResolution,
      );
    }
  });

  testWidgets('a real fixture rotated 270 degrees matches complete truth', (
    WidgetTester tester,
  ) async {
    final manifest =
        jsonDecode(utf8.decode(await fixtures.load('manifest.json')))
            as Map<String, Object?>;
    final entry = (manifest['fixtures']! as List<Object?>)
        .cast<Map<String, Object?>>()
        .singleWhere(
          (fixture) => fixture['id'] == 'existing_12_freshmart_grocery_en_US',
        );
    final source = img.decodeImage(
      await fixtures.load(entry['file']! as String),
    );
    expect(source, isNotNull);
    final rotatedBytes = img.encodeJpg(
      img.copyRotate(source!, angle: 270),
      quality: 100,
    );
    final artifact = artifactProcessor.process(
      ReceiptImageArtifactRequest(
        sourceType: ReceiptImageSourceKind.importedImage,
        sourceContentType: 'image/jpeg',
        sourceBytes: rotatedBytes,
        sourceExtension: 'jpeg',
        sourceLabel: 'existing_12_freshmart_grocery_en_US-derived-rotate270',
      ),
    );
    expect(artifact.accepted, isTrue);
    expect(artifact.normalizedJpegProduced, isTrue);

    final result = await provider.extractReceipt(
      ReceiptOcrRequest(
        bytes: artifact.normalizedJpegBytes!,
        contentType: artifact.normalizedContentType!,
        fallbackCurrency: entry['fallback_currency'] as String?,
      ),
    );
    _expectCompletePreview(
      'existing_12_freshmart_grocery_en_US-derived-rotate270',
      result,
      entry['expected']! as Map<String, Object?>,
      currencyResolution:
          entry['expected_currency_resolution'] as Map<String, Object?>?,
    );
  });
}

const _supportedExpectedKeys = <String>{
  'merchant',
  'date',
  'currency',
  'subtotal',
  'tax',
  'service',
  'tip',
  'shipping',
  'discount',
  'total',
  'items',
  'expected_review_condition',
};

void _expectCompletePreview(
  String fixtureId,
  ReceiptOcrResult result,
  Map<String, Object?> expected, {
  Map<String, Object?>? currencyResolution,
}) {
  expect(result.status, ReceiptOcrStatus.extracted, reason: fixtureId);
  final preview = result.preview!;
  _expectField(fixtureId, 'merchant', preview.merchant, expected);
  _expectField(fixtureId, 'date', preview.receiptDate, expected);
  _expectField(fixtureId, 'currency', preview.currency, expected);
  _expectField(fixtureId, 'subtotal', preview.subtotal, expected);
  _expectField(fixtureId, 'tax', preview.tax, expected);
  _expectField(fixtureId, 'service', preview.service, expected);
  _expectField(fixtureId, 'tip', preview.tip, expected);
  _expectField(fixtureId, 'shipping', preview.shipping, expected);
  _expectField(fixtureId, 'discount', preview.discount, expected);
  _expectField(fixtureId, 'total', preview.total, expected);

  final expectedItems = (expected['items']! as List<Object?>)
      .map((item) => _ExpectedItem.fromManifest(item, fixtureId))
      .toList(growable: false);
  expect(preview.items, hasLength(expectedItems.length), reason: fixtureId);
  for (var index = 0; index < expectedItems.length; index += 1) {
    final expectedItem = expectedItems[index];
    final actualItem = preview.items[index];
    expect(
      _normalizedText(actualItem.description),
      _normalizedText(expectedItem.description),
      reason: '$fixtureId item[$index].description',
    );
    expect(
      actualItem.lineTotal,
      expectedItem.lineTotal,
      reason: '$fixtureId item[$index].lineTotal',
    );
    if (expectedItem.quantity != null) {
      expect(
        actualItem.quantity,
        expectedItem.quantity,
        reason: '$fixtureId item[$index].quantity',
      );
    }
    if (expectedItem.unitPrice != null) {
      expect(
        actualItem.unitPrice,
        expectedItem.unitPrice,
        reason: '$fixtureId item[$index].unitPrice',
      );
    }
  }

  if (currencyResolution != null) {
    expect(
      preview.currencyProvenance,
      _currencyProvenance(currencyResolution['source']! as String),
      reason: '$fixtureId currency provenance',
    );
  }
  final expectedReviewCondition =
      expected['expected_review_condition'] as String?;
  if (expectedReviewCondition != null) {
    expect(
      expectedReviewCondition,
      'printed total differs from visible charge-line arithmetic',
      reason: '$fixtureId unsupported review condition',
    );
    expect(
      preview.reviewHints,
      contains(
        'OCR item total differs from detected grand total. Review the receipt before applying.',
      ),
      reason: '$fixtureId review condition',
    );
  }
  expect(preview.blocks, isNotEmpty, reason: '$fixtureId OCR evidence');
  expect(
    preview.runEvidence?.runtime,
    Platform.isIOS
        ? 'onnxruntime-objc:1.24.3:cpu'
        : 'onnxruntime-android:1.21.1:cpu',
    reason: '$fixtureId runtime evidence',
  );
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

class _ExpectedItem {
  const _ExpectedItem({
    required this.description,
    required this.lineTotal,
    this.quantity,
    this.unitPrice,
  });

  factory _ExpectedItem.fromManifest(Object? value, String fixtureId) {
    if (value case [final String description, final String lineTotal]) {
      return _ExpectedItem(description: description, lineTotal: lineTotal);
    }
    if (value is Map<String, Object?>) {
      const supportedKeys = {
        'description',
        'quantity',
        'unit_price',
        'line_total',
      };
      final unknownKeys = value.keys.toSet().difference(supportedKeys);
      if (unknownKeys.isNotEmpty) {
        throw StateError(
          '$fixtureId item contains unvalidated keys: $unknownKeys',
        );
      }
      final description = value['description'];
      final quantity = value['quantity'];
      final unitPrice = value['unit_price'];
      final lineTotal = value['line_total'];
      if (description is! String ||
          lineTotal is! String ||
          (quantity != null && quantity is! String) ||
          (unitPrice != null && unitPrice is! String)) {
        throw StateError('$fixtureId item ground truth must use strings');
      }
      return _ExpectedItem(
        description: description,
        quantity: quantity as String?,
        unitPrice: unitPrice as String?,
        lineTotal: lineTotal,
      );
    }
    throw StateError('$fixtureId has an unsupported item representation');
  }

  final String description;
  final String? quantity;
  final String? unitPrice;
  final String lineTotal;
}

class _NativeAcceptanceFixtures {
  const _NativeAcceptanceFixtures();

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
