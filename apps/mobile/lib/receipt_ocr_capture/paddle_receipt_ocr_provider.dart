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
      final blocks = <Map<Object?, Object?>>[];
      for (final rawBlock in rawBlocks) {
        if (rawBlock is! Map) return _failed;
        blocks.add(rawBlock);
      }
      blocks.sort((left, right) => _order(left).compareTo(_order(right)));
      final evidence = <ReceiptOcrBlockEvidence>[];
      for (final block in blocks) {
        final parsed = _blockEvidence(block);
        if (parsed == null) return _failed;
        evidence.add(parsed);
      }
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
            coldLoadTimeMs: response?['coldLoadTimeMs'] as int?,
            detectionTimeMs: response?['detectionTimeMs'] as int?,
            recognitionTimeMs: response?['recognitionTimeMs'] as int?,
            totalTimeMs: response?['totalTimeMs'] as int?,
          ),
        ),
      );
    } on PlatformException catch (error) {
      return _nativeFailure(error.code);
    } catch (_) {
      // Retain only a bounded category. Native exception text may contain OCR
      // content, local paths, or provider diagnostics and must not escape the
      // provider boundary.
      return _providerExceptionFailed;
    }
  }

  static int _order(Map<Object?, Object?> block) =>
      block['order'] is int ? block['order']! as int : 1 << 30;

  static ReceiptOcrBlockEvidence? _blockEvidence(Map<Object?, Object?> block) {
    final text = block['text'];
    final row = block['row'];
    if (text is! String || text.trim().isEmpty || row is! int) return null;
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
      row: row,
      confidence: (block['confidence'] as num?)?.toDouble(),
      modelPackId: block['modelPackId'] as String?,
      modelVersion: block['modelVersion'] as String?,
      textDirection: block['textDirection'] as String?,
      points: points,
    );
  }

  static const _failed = ReceiptOcrResult.failed(
    'Receipt reading failed. You can still enter the bill manually.',
    failureCategory: ReceiptOcrFailureCategory.invalidProviderResponse,
  );

  static const _providerExceptionFailed = ReceiptOcrResult.failed(
    'Receipt reading failed. You can still enter the bill manually.',
    failureCategory: ReceiptOcrFailureCategory.providerException,
  );

  static ReceiptOcrResult _nativeFailure(String code) {
    final category = switch (code) {
      'ocr_resource_lookup' => ReceiptOcrFailureCategory.resourceLookup,
      'ocr_model_open' => ReceiptOcrFailureCategory.modelOpen,
      'ocr_model_configuration' => ReceiptOcrFailureCategory.modelConfiguration,
      'ocr_runtime_initialization' =>
        ReceiptOcrFailureCategory.runtimeInitialization,
      'ocr_input_validation' => ReceiptOcrFailureCategory.inputValidation,
      'ocr_postprocessing' => ReceiptOcrFailureCategory.postprocessing,
      'ocr_detection_inference' => ReceiptOcrFailureCategory.detectionInference,
      'ocr_recognition_inference' =>
        ReceiptOcrFailureCategory.recognitionInference,
      'ocr_output_decode' => ReceiptOcrFailureCategory.outputDecode,
      _ => ReceiptOcrFailureCategory.providerException,
    };
    return ReceiptOcrResult.failed(
      'Receipt reading failed. You can still enter the bill manually.',
      failureCategory: category,
    );
  }
}

ReceiptOcrProvider defaultMobileReceiptOcrProvider() {
  // Keep Paddle explicitly injectable until physical-device acceptance binds
  // this catalog/runtime identity. The accepted production default changes in
  // the evidence-gated follow-up, never merely because the adapter is present.
  return const MlKitReceiptOcrProvider();
}
