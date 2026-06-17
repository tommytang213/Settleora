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

    final imagePath = request.imagePath?.trim();
    if (imagePath == null || imagePath.isEmpty) {
      return const ReceiptOcrResult.failed(
        'The selected receipt image could not be prepared for reading. You can still enter the bill manually.',
      );
    }

    final textRecognizer = TextRecognizer(script: TextRecognitionScript.latin);
    try {
      final image = InputImage.fromFilePath(imagePath);
      final recognizedText = await textRecognizer.processImage(image);
      final text = recognizedText.text.trim();
      if (text.isEmpty) {
        return const ReceiptOcrResult.failed(
          'No readable receipt text was found. You can still enter the bill manually.',
        );
      }

      return ReceiptOcrResult.extracted(parser.parse(text));
    } catch (_) {
      return const ReceiptOcrResult.failed(
        'Receipt reading failed. You can still enter the bill manually.',
      );
    } finally {
      await textRecognizer.close();
    }
  }
}
