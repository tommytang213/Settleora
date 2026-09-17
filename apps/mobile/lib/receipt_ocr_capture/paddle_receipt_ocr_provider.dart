import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'mlkit_receipt_ocr_provider.dart';
import 'receipt_ocr_parser.dart';
import 'receipt_ocr_provider.dart';

abstract interface class PaddleReceiptOcrChannel {
  Future<Map<Object?, Object?>?> recognize(Uint8List imageBytes);
}

class MethodChannelPaddleReceiptOcrChannel implements PaddleReceiptOcrChannel {
  const MethodChannelPaddleReceiptOcrChannel();

  static const _channel = MethodChannel(
    'com.settleora.mobile/receipt_ocr',
  );

  @override
  Future<Map<Object?, Object?>?> recognize(Uint8List imageBytes) async {
    return _channel.invokeMapMethod<Object?, Object?>('recognize', {
      'imageBytes': imageBytes,
    });
  }
}

class PaddleReceiptOcrProvider implements ReceiptOcrProvider {
  const PaddleReceiptOcrProvider({
    this.parser = const ReceiptOcrParser(),
    this.channel = const MethodChannelPaddleReceiptOcrChannel(),
  });

  final ReceiptOcrParser parser;
  final PaddleReceiptOcrChannel channel;

  @override
  Future<ReceiptOcrResult> extractReceipt(ReceiptOcrRequest request) async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) {
      return const ReceiptOcrResult.unsupported(
        'Paddle receipt reading is available on Android. You can still enter the bill manually.',
      );
    }
    if (request.bytes.isEmpty) {
      return const ReceiptOcrResult.failed(
        'The selected receipt image could not be prepared for reading. You can still enter the bill manually.',
      );
    }

    try {
      final response = await channel.recognize(Uint8List.fromList(request.bytes));
      final rawBlocks = response?['blocks'];
      if (rawBlocks is! List) return _failed;
      final blocks = rawBlocks.whereType<Map>().toList()
        ..sort((left, right) => _order(left).compareTo(_order(right)));
      final text = blocks
          .map((block) => block['text'])
          .whereType<String>()
          .map((value) => value.trim())
          .where((value) => value.isNotEmpty)
          .join('\n');
      if (text.isEmpty) return _failed;
      return ReceiptOcrResult.extracted(
        parser.parse(text, fallbackCurrency: request.fallbackCurrency),
      );
    } catch (_) {
      return _failed;
    }
  }

  static int _order(Map<Object?, Object?> block) =>
      block['order'] is int ? block['order']! as int : 1 << 30;

  static const _failed = ReceiptOcrResult.failed(
    'Receipt reading failed. You can still enter the bill manually.',
  );
}

ReceiptOcrProvider defaultMobileReceiptOcrProvider() {
  if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
    return const PaddleReceiptOcrProvider();
  }
  return const MlKitReceiptOcrProvider();
}
