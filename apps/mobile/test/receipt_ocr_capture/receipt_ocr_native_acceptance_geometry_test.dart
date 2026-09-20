import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

import '../../integration_test/receipt_ocr_real_provider_test.dart';

ReceiptOcrBlockEvidence block(List<ReceiptOcrPoint> points) =>
    ReceiptOcrBlockEvidence(
      text: 'bounded',
      order: 0,
      row: 0,
      confidence: 0.9,
      modelPackId: 'pack',
      modelVersion: 'version',
      textDirection: 'ltr',
      points: points,
    );

void main() {
  test(
    'native acceptance geometry requires a bounded positive-area polygon',
    () {
      expect(
        isValidNativeOcrBlockGeometry(
          block(const [
            ReceiptOcrPoint(x: 0, y: 0),
            ReceiptOcrPoint(x: 10, y: 0),
            ReceiptOcrPoint(x: 10, y: 10),
            ReceiptOcrPoint(x: 0, y: 10),
          ]),
          imageWidth: 10,
          imageHeight: 10,
        ),
        isTrue,
      );
      for (final malformed in [
        const [
          ReceiptOcrPoint(x: 1, y: 1),
          ReceiptOcrPoint(x: 1, y: 1),
          ReceiptOcrPoint(x: 1, y: 1),
          ReceiptOcrPoint(x: 1, y: 1),
        ],
        const [
          ReceiptOcrPoint(x: 0, y: 0),
          ReceiptOcrPoint(x: 1, y: 1),
          ReceiptOcrPoint(x: 2, y: 2),
          ReceiptOcrPoint(x: 3, y: 3),
        ],
        const [
          ReceiptOcrPoint(x: -1, y: 0),
          ReceiptOcrPoint(x: 10, y: 0),
          ReceiptOcrPoint(x: 10, y: 10),
          ReceiptOcrPoint(x: 0, y: 10),
        ],
        const [
          ReceiptOcrPoint(x: 0, y: 0),
          ReceiptOcrPoint(x: 11, y: 0),
          ReceiptOcrPoint(x: 10, y: 10),
          ReceiptOcrPoint(x: 0, y: 10),
        ],
      ]) {
        expect(
          isValidNativeOcrBlockGeometry(
            block(malformed),
            imageWidth: 10,
            imageHeight: 10,
          ),
          isFalse,
        );
      }
    },
  );
}
