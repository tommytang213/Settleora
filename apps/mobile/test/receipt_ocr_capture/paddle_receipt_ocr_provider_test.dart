import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/mlkit_receipt_ocr_provider.dart';
import 'package:mobile/receipt_ocr_capture/paddle_receipt_ocr_provider.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_provider.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

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
          'row': 2,
          'confidence': 0.91,
          'modelPackId': 'common',
          'modelVersion': 'v1',
          'textDirection': 'ltr',
          'points': [
            {'x': 1.0, 'y': 2.0},
          ],
        },
        {'text': 'Corner Cafe', 'order': 0, 'row': 0},
        {'text': 'Tea 12.50', 'order': 1, 'row': 1},
      ],
      'detectionModelPackId': 'detector',
      'detectionModelVersion': 'v2',
      'runtime': 'onnxruntime-android:1.21.1:cpu',
      'coldLoadTimeMs': 80,
      'detectionTimeMs': 20,
      'recognitionTimeMs': 30,
      'totalTimeMs': 55,
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
    expect(result.preview?.runEvidence?.coldLoadTimeMs, 80);
    expect(result.preview?.runEvidence?.detectionTimeMs, 20);
    expect(result.preview?.runEvidence?.recognitionTimeMs, 30);
    expect(result.preview?.runEvidence?.totalTimeMs, 55);
    expect(result.preview?.runEvidence?.numericRoutingObservation, isNull);
  });

  test(
    'provider preserves valid bounded numeric observations without altering receipt values',
    () async {
      final payload = _numericObservation();
      final result = await _providerWithObservation(payload);
      expect(result.status, ReceiptOcrStatus.extracted);
      expect(result.preview?.total, '12.50');
      expect(result.preview?.items.single.lineTotal, '12.50');
      final observation =
          result.preview!.runEvidence!.numericRoutingObservation!;
      expect(observation.status, ReceiptOcrNumericRoutingStatus.observed);
      expect(observation.toBoundedEvidence(), {
        'schemaVersion': 1,
        'stage': ReceiptOcrNumericRoutingObservation.stage,
        'status': 'observed',
        'counts': [3, 3, 3, 2, 1, 1, 2],
        'bins': [0, 0, 3, 0, 0, 0, 0, 0],
      });
      payload['observedCropCount'] = 250;
      expect(observation.counts['observedCropCount'], 3);
      expect(
        () => observation.counts['observedCropCount'] = 1,
        throwsUnsupportedError,
      );
      expect(
        () => observation.selectedDigitCountBins['one'] = 1,
        throwsUnsupportedError,
      );
    },
  );

  test(
    'optional malformed routing evidence never breaks a successful OCR response or echoes payload',
    () async {
      final valid = _numericObservation();
      for (final payload in <Object?>[
        null,
        'private diagnostic text',
        [],
        {...valid, 'schemaVersion': 1.0},
        {...valid, 'stage': 'private stage'},
        {...valid, 'status': 'private status'},
        {...valid, 'text': 'private diagnostic text'},
        {...valid, 'observedCropCount': 257},
        {...valid, 'numericCandidateCropCount': -1},
        {...valid, 'eligibleNumericCandidateCropCount': 1},
        {...valid, 'competingEligibleNumericCandidateCropCount': 0},
        {...valid, 'eligibleNumericLiteralDisagreementCropCount': 0},
        {...valid, 'selectedShorterThanAnyNumericAlternateCropCount': 0},
        {...valid, 'selectedShorterThanEligibleNumericAlternateCropCount': 3},
        {
          ...valid,
          'selectedDigitCountBins': {'one': 3},
        },
        {
          ...valid,
          'selectedDigitCountBins': {
            ...valid['selectedDigitCountBins']! as Map<String, int>,
            'one': 4,
          },
        },
      ]) {
        final result = await _providerWithObservation(payload);
        expect(result.status, ReceiptOcrStatus.extracted);
        expect(result.preview?.total, '12.50');
        final observation =
            result.preview!.runEvidence!.numericRoutingObservation!;
        expect(observation.toBoundedEvidence(), {
          'schemaVersion': 1,
          'stage': ReceiptOcrNumericRoutingObservation.stage,
          'status': 'invalid',
        });
      }
    },
  );

  test(
    'numeric evidence tuple order is fixed and impossible no-selection is rejected',
    () {
      final asymmetric = {
        ..._numericObservation(),
        'observedCropCount': 64,
        'numericCandidateCropCount': 56,
        'eligibleNumericCandidateCropCount': 48,
        'competingEligibleNumericCandidateCropCount': 40,
        'eligibleNumericLiteralDisagreementCropCount': 32,
        'selectedShorterThanEligibleNumericAlternateCropCount': 16,
        'selectedShorterThanAnyNumericAlternateCropCount': 24,
        'selectedDigitCountBins': {
          'noSelection': 10,
          'nonNumeric': 6,
          'one': 1,
          'two': 3,
          'three': 5,
          'four': 7,
          'fiveToEight': 11,
          'ninePlus': 21,
        },
      };
      final observed = ReceiptOcrNumericRoutingObservation.fromChannel(
        asymmetric,
      );
      expect(observed.toBoundedEvidence(), {
        'schemaVersion': 1,
        'stage': ReceiptOcrNumericRoutingObservation.stage,
        'status': 'observed',
        'counts': [64, 56, 48, 40, 32, 16, 24],
        'bins': [10, 6, 1, 3, 5, 7, 11, 21],
      });
      final impossible = {
        ..._numericObservation(),
        'observedCropCount': 1,
        'numericCandidateCropCount': 1,
        'eligibleNumericCandidateCropCount': 1,
        'competingEligibleNumericCandidateCropCount': 0,
        'eligibleNumericLiteralDisagreementCropCount': 0,
        'selectedShorterThanEligibleNumericAlternateCropCount': 0,
        'selectedShorterThanAnyNumericAlternateCropCount': 0,
        'selectedDigitCountBins': {
          'noSelection': 1,
          'nonNumeric': 0,
          'one': 0,
          'two': 0,
          'three': 0,
          'four': 0,
          'fiveToEight': 0,
          'ninePlus': 0,
        },
      };
      expect(
        ReceiptOcrNumericRoutingObservation.fromChannel(impossible).status,
        ReceiptOcrNumericRoutingStatus.invalid,
      );
    },
  );

  test('unavailable numeric observations do not invent zero observations', () {
    const unavailable = ReceiptOcrNumericRoutingObservation.unavailable;
    expect(
      ReceiptOcrNumericRoutingObservation.fromChannel(
        unavailable.toBoundedEvidence(),
      ).status,
      ReceiptOcrNumericRoutingStatus.unavailable,
    );
    expect(
      unavailable.toBoundedEvidence().keys,
      unorderedEquals(['schemaVersion', 'stage', 'status']),
    );
    final zero = _numericObservation();
    for (final key in ReceiptOcrNumericRoutingObservation.countKeys) {
      zero[key] = 0;
    }
    zero['selectedDigitCountBins'] = {
      for (final key in ReceiptOcrNumericRoutingObservation.binKeys) key: 0,
    };
    expect(
      ReceiptOcrNumericRoutingObservation.fromChannel(zero).status,
      ReceiptOcrNumericRoutingStatus.observed,
    );
    expect(
      ReceiptOcrNumericRoutingObservation.fromChannel({
        ...unavailable.toBoundedEvidence(),
        'observedCropCount': 0,
      }).status,
      ReceiptOcrNumericRoutingStatus.invalid,
    );
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
    expect(result.message, isNot(contains('private native details')));
  });

  test('provider rejects blocks without a native row field', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    final provider = PaddleReceiptOcrProvider(
      channel: _FakeChannel({
        'blocks': [
          {'text': 'TOTAL 12.50', 'order': 0},
        ],
      }),
    );

    final result = await provider.extractReceipt(
      ReceiptOcrRequest(bytes: const [1], contentType: 'image/jpeg'),
    );

    expect(result.status, ReceiptOcrStatus.failed);
    expect(
      result.failureCategory,
      ReceiptOcrFailureCategory.invalidProviderResponse,
    );
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
        'ocr_runtime_initialization_opencv':
            ReceiptOcrFailureCategory.runtimeInitializationOpenCv,
        'ocr_runtime_initialization_onnxruntime':
            ReceiptOcrFailureCategory.runtimeInitializationOnnxRuntime,
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
        expect(
          result.failureCategory?.boundedEvidenceField,
          entry.key == 'private_native_code' ? 'provider_exception' : entry.key,
          reason: entry.key,
        );
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

Map<String, Object> _numericObservation() => {
  'schemaVersion': 1,
  'stage': ReceiptOcrNumericRoutingObservation.stage,
  'status': 'observed',
  'observedCropCount': 3,
  'numericCandidateCropCount': 3,
  'eligibleNumericCandidateCropCount': 3,
  'competingEligibleNumericCandidateCropCount': 2,
  'eligibleNumericLiteralDisagreementCropCount': 1,
  'selectedShorterThanEligibleNumericAlternateCropCount': 1,
  'selectedShorterThanAnyNumericAlternateCropCount': 2,
  'selectedDigitCountBins': {
    'noSelection': 0,
    'nonNumeric': 0,
    'one': 3,
    'two': 0,
    'three': 0,
    'four': 0,
    'fiveToEight': 0,
    'ninePlus': 0,
  },
};

Future<ReceiptOcrResult> _providerWithObservation(Object? observation) =>
    PaddleReceiptOcrProvider(
      channel: _FakeChannel({
        'blocks': [
          {'text': 'Corner Cafe', 'order': 0, 'row': 0},
          {'text': 'Tea 12.50', 'order': 1, 'row': 1},
          {'text': 'TOTAL 12.50', 'order': 2, 'row': 2},
        ],
        'numericRoutingObservation': observation,
      }),
    ).extractReceipt(
      ReceiptOcrRequest(
        bytes: const [1],
        contentType: 'image/jpeg',
        fallbackCurrency: 'USD',
      ),
    );

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
