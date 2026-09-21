import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/mlkit_receipt_ocr_provider.dart';
import 'package:mobile/receipt_ocr_capture/paddle_receipt_ocr_provider.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_provider.dart';

void main() {
  tearDown(() => debugDefaultTargetPlatformOverride = null);

  test('Android retains the accepted provider until native evidence lands', () {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    expect(defaultMobileReceiptOcrProvider(), isA<MlKitReceiptOcrProvider>());
  });

  test('non-Android platforms retain their accepted provider', () {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    expect(defaultMobileReceiptOcrProvider(), isA<MlKitReceiptOcrProvider>());
  });

  test('provider sends image bytes and parses ordered native blocks', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    final channel = _FakeChannel({
      'blocks': [
        {
          'text': 'TOTAL 12.50',
          'order': 2,
          'confidence': 0.91,
          'modelPackId': 'common',
          'modelVersion': 'v1',
          'textDirection': 'ltr',
          'points': [
            {'x': 1.0, 'y': 2.0},
          ],
        },
        {'text': 'Corner Cafe', 'order': 0},
        {'text': 'Tea 12.50', 'order': 1},
      ],
      'detectionModelPackId': 'detector',
      'detectionModelVersion': 'v2',
      'runtime': 'onnxruntime-android:1.21.1:cpu',
    });
    final provider = PaddleReceiptOcrProvider(channel: channel);

    final result = await provider.extractReceipt(
      ReceiptOcrRequest(
        bytes: const [1, 2, 3],
        contentType: 'image/jpeg',
        fallbackCurrency: 'USD',
      ),
    );

    expect(channel.received, Uint8List.fromList(const [1, 2, 3]));
    expect(result.status, ReceiptOcrStatus.extracted);
    expect(result.preview?.merchant, 'Corner Cafe');
    expect(result.preview?.total, '12.50');
    expect(result.preview?.blocks, hasLength(3));
    expect(result.preview?.blocks.last.modelPackId, 'common');
    expect(result.preview?.blocks.last.points.single.x, 1.0);
    expect(result.preview?.runEvidence?.detectionModelPackId, 'detector');
    expect(result.preview?.runEvidence?.runtime, contains('onnxruntime'));
  });

  test('provider maps channel failures to bounded manual fallback', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    final provider = PaddleReceiptOcrProvider(channel: _ThrowingChannel());
    final result = await provider.extractReceipt(
      ReceiptOcrRequest(bytes: const [1], contentType: 'image/jpeg'),
    );
    expect(result.status, ReceiptOcrStatus.failed);
    expect(result.message, contains('manual'));
    expect(result.failureCategory, ReceiptOcrFailureCategory.providerException);
  });

  test(
    'provider preserves only allowlisted native failure categories',
    () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      const expected = {
        'ocr_resource_lookup': ReceiptOcrFailureCategory.resourceLookup,
        'ocr_model_open': ReceiptOcrFailureCategory.modelOpen,
        'ocr_model_configuration': ReceiptOcrFailureCategory.modelConfiguration,
        'ocr_runtime_initialization':
            ReceiptOcrFailureCategory.runtimeInitialization,
        'ocr_input_validation': ReceiptOcrFailureCategory.inputValidation,
        'ocr_postprocessing': ReceiptOcrFailureCategory.postprocessing,
        'ocr_detection_inference': ReceiptOcrFailureCategory.detectionInference,
        'ocr_recognition_inference':
            ReceiptOcrFailureCategory.recognitionInference,
        'ocr_output_decode': ReceiptOcrFailureCategory.outputDecode,
        'private_native_code': ReceiptOcrFailureCategory.providerException,
      };
      for (final entry in expected.entries) {
        final provider = PaddleReceiptOcrProvider(
          channel: _PlatformExceptionChannel(entry.key),
        );
        final result = await provider.extractReceipt(
          ReceiptOcrRequest(bytes: const [1], contentType: 'image/jpeg'),
        );
        expect(result.failureCategory, entry.value, reason: entry.key);
        expect(result.message, isNot(contains('private')));
      }
    },
  );

  test('provider reconstructs split LTR and RTL boxes by native row', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    final provider = PaddleReceiptOcrProvider(
      channel: _FakeChannel({
        'blocks': [
          {'text': 'Corner Cafe', 'order': 0, 'row': 0},
          {'text': 'Tea', 'order': 1, 'row': 1},
          {'text': '12.50', 'order': 2, 'row': 1},
          {'text': 'TOTAL', 'order': 3, 'row': 2},
          {'text': '12.50', 'order': 4, 'row': 2},
          {'text': 'الإجمالي', 'order': 5, 'row': 3, 'textDirection': 'rtl'},
          {'text': 'دإ٢١،٧٩', 'order': 6, 'row': 3, 'textDirection': 'rtl'},
        ],
      }),
    );

    final result = await provider.extractReceipt(
      ReceiptOcrRequest(bytes: const [1], contentType: 'image/jpeg'),
    );

    expect(result.preview?.items.single.description, 'Tea');
    expect(result.preview?.items.single.lineTotal, '12.50');
    expect(result.preview?.total, '21.79');
    expect(result.preview?.currency, 'AED');
  });
}

class _FakeChannel implements PaddleReceiptOcrChannel {
  _FakeChannel(this.response);
  final Map<Object?, Object?> response;
  Uint8List? received;

  @override
  Future<Map<Object?, Object?>?> recognize(Uint8List imageBytes) async {
    received = imageBytes;
    return response;
  }
}

class _ThrowingChannel implements PaddleReceiptOcrChannel {
  @override
  Future<Map<Object?, Object?>?> recognize(Uint8List imageBytes) {
    throw StateError('private native details');
  }
}

class _PlatformExceptionChannel implements PaddleReceiptOcrChannel {
  _PlatformExceptionChannel(this.code);

  final String code;

  @override
  Future<Map<Object?, Object?>?> recognize(Uint8List imageBytes) {
    throw PlatformException(
      code: code,
      message: 'private native details',
      details: 'private native payload',
    );
  }
}
