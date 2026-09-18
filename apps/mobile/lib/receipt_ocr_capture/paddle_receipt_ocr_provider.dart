import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'mlkit_receipt_ocr_provider.dart';
import 'receipt_ocr_parser.dart';
import 'receipt_ocr_provider.dart';
import 'receipt_ocr_preview.dart';

abstract interface class PaddleReceiptOcrChannel {
  Future<Map<Object?, Object?>?> recognize(Uint8List imageBytes);
}

class MethodChannelPaddleReceiptOcrChannel implements PaddleReceiptOcrChannel {
  const MethodChannelPaddleReceiptOcrChannel();

  static const _channel = MethodChannel('com.settleora.mobile/receipt_ocr');

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
    if (kIsWeb ||
        (defaultTargetPlatform != TargetPlatform.android &&
            defaultTargetPlatform != TargetPlatform.iOS)) {
      return const ReceiptOcrResult.unsupported(
        'Paddle receipt reading is available on Android and iOS. You can still enter the bill manually.',
      );
    }
    if (request.bytes.isEmpty) {
      return const ReceiptOcrResult.failed(
        'The selected receipt image could not be prepared for reading. You can still enter the bill manually.',
      );
    }

    try {
      final response = await channel.recognize(
        Uint8List.fromList(request.bytes),
      );
      final rawBlocks = response?['blocks'];
      if (rawBlocks is! List) return _failed;
      final blocks = rawBlocks.whereType<Map>().toList()
        ..sort((left, right) => _order(left).compareTo(_order(right)));
      final evidence = blocks
          .map(_blockEvidence)
          .whereType<ReceiptOcrBlockEvidence>()
          .toList(growable: false);
      final rows = <int, List<String>>{};
      for (final block in evidence) {
        (rows[block.row] ??= <String>[]).add(block.text.trim());
      }
      final text = rows.values.map((row) => row.join(' ')).join('\n');
      if (text.isEmpty) return _failed;
      return ReceiptOcrResult.extracted(
        parser.parse(
          text,
          fallbackCurrency: request.fallbackCurrency,
          blocks: evidence,
          runEvidence: ReceiptOcrRunEvidence(
            detectionModelPackId: response?['detectionModelPackId'] as String?,
            detectionModelVersion:
                response?['detectionModelVersion'] as String?,
            runtime: response?['runtime'] as String?,
          ),
        ),
      );
    } catch (_) {
      return _failed;
    }
  }

  static int _order(Map<Object?, Object?> block) =>
      block['order'] is int ? block['order']! as int : 1 << 30;

  static ReceiptOcrBlockEvidence? _blockEvidence(Map<Object?, Object?> block) {
    final text = block['text'];
    if (text is! String || text.trim().isEmpty) return null;
    final rawPoints = block['points'];
    final points = rawPoints is List
        ? rawPoints
              .whereType<Map>()
              .map((point) {
                final x = point['x'];
                final y = point['y'];
                if (x is! num || y is! num) return null;
                return ReceiptOcrPoint(x: x.toDouble(), y: y.toDouble());
              })
              .whereType<ReceiptOcrPoint>()
              .toList(growable: false)
        : const <ReceiptOcrPoint>[];
    return ReceiptOcrBlockEvidence(
      text: text.trim(),
      order: _order(block),
      row: block['row'] is int ? block['row']! as int : _order(block),
      confidence: (block['confidence'] as num?)?.toDouble(),
      modelPackId: block['modelPackId'] as String?,
      modelVersion: block['modelVersion'] as String?,
      textDirection: block['textDirection'] as String?,
      points: points,
    );
  }

  static const _failed = ReceiptOcrResult.failed(
    'Receipt reading failed. You can still enter the bill manually.',
  );
}

ReceiptOcrProvider defaultMobileReceiptOcrProvider() {
  // Paddle remains explicitly injectable until the real-provider native
  // acceptance gate records an accepted catalog/runtime identity.
  return const MlKitReceiptOcrProvider();
}
