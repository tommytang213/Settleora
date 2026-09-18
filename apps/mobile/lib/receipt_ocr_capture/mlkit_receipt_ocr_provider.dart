import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';

import 'receipt_ocr_parser.dart';
import 'receipt_ocr_provider.dart';

class MlKitReceiptOcrProvider implements ReceiptOcrProvider {
  const MlKitReceiptOcrProvider({this.parser = const ReceiptOcrParser()});

  final ReceiptOcrParser parser;

  @override
  Future<ReceiptOcrResult> extractReceipt(ReceiptOcrRequest request) async {
    if (kIsWeb ||
        (defaultTargetPlatform != TargetPlatform.android &&
            defaultTargetPlatform != TargetPlatform.iOS)) {
      return const ReceiptOcrResult.unsupported(
        'Receipt reading is available on iOS and Android. You can still enter the bill manually.',
      );
    }

    if (request.bytes.isEmpty) {
      return const ReceiptOcrResult.failed(
        'The selected receipt image could not be prepared for reading. You can still enter the bill manually.',
      );
    }

    final textRecognizer = TextRecognizer(script: TextRecognitionScript.latin);
    Directory? stagingDirectory;
    try {
      stagingDirectory = await Directory.systemTemp.createTemp(
        'settleora-receipt-ocr-',
      );
      final stagedImage = File('${stagingDirectory.path}/receipt.jpg');
      await stagedImage.writeAsBytes(request.bytes, flush: true);
      final image = InputImage.fromFilePath(stagedImage.path);
      final recognizedText = await textRecognizer.processImage(image);
      final text = recognizedText.text.trim();
      if (text.isEmpty) {
        return const ReceiptOcrResult.failed(
          'No readable receipt text was found. You can still enter the bill manually.',
        );
      }

      return ReceiptOcrResult.extracted(
        parser.parse(text, fallbackCurrency: request.fallbackCurrency),
      );
    } catch (_) {
      return const ReceiptOcrResult.failed(
        'Receipt reading failed. You can still enter the bill manually.',
      );
    } finally {
      try {
        await textRecognizer.close();
      } catch (_) {
        // OCR teardown cannot replace the bounded recognition result.
      }
      if (stagingDirectory != null) {
        try {
          await stagingDirectory.delete(recursive: true);
        } catch (_) {
          // Best-effort disposal only; never surface local receipt paths.
        }
      }
    }
  }
}
