import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/paddle_receipt_ocr_provider.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_provider.dart';

void main() {
  tearDown(() => debugDefaultTargetPlatformOverride = null);

  test('Android default provider is PaddleOCR', () {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    expect(defaultMobileReceiptOcrProvider(), isA<PaddleReceiptOcrProvider>());
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
