import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:mobile/receipt_ocr_capture/receipt_image_artifact_processor.dart';
import 'package:mobile/receipt_ocr_capture/receipt_image_normalization_policy.dart';

void main() {
  const processor = ReceiptImageArtifactProcessor();

  test('produces normalized JPEG and thumbnail bytes from PNG input', () {
    final source = _pngBytes(width: 640, height: 480);

    final result = processor.process(
      ReceiptImageArtifactRequest(
        sourceType: ReceiptImageSourceKind.importedImage,
        sourceContentType: 'image/png',
        sourceExtension: '.png',
        sourceLabel: r'C:\Users\tester\Pictures\dinner receipt.png',
        sourceBytes: source,
      ),
    );

    expect(result.accepted, isTrue);
    expect(result.normalizedContentType, 'image/jpeg');
    expect(result.normalizedJpegBytes, isNotNull);
    expect(result.thumbnailJpegBytes, isNotNull);
    expect(result.width, 640);
    expect(result.height, 480);
    expect(result.thumbnailWidth, 320);
    expect(result.thumbnailHeight, 240);
    expect(result.sourceLabel, 'dinner receipt.png');
    expect(result.originalRetainedByPolicy, isFalse);
    expect(result.cacheReadiness.secureLocalCacheImplemented, isFalse);
    expect(
      result.cacheReadiness.message,
      contains('Secure/encrypted local receipt artifact cache is deferred'),
    );

    final normalized = img.decodeJpg(result.normalizedJpegBytes!);
    final thumbnail = img.decodeJpg(result.thumbnailJpegBytes!);
    expect(normalized?.width, 640);
    expect(normalized?.height, 480);
    expect(thumbnail?.width, 320);
    expect(thumbnail?.height, 240);
  });

  test('produces normalized JPEG and thumbnail bytes from JPEG input', () {
    final source = _jpegBytes(width: 240, height: 120);

    final result = processor.process(
      ReceiptImageArtifactRequest(
        sourceType: ReceiptImageSourceKind.capturedPhoto,
        sourceContentType: 'image/jpeg',
        sourceExtension: 'jpg',
        sourceLabel: 'camera.jpg',
        sourceBytes: source,
      ),
    );

    expect(result.accepted, isTrue);
    expect(result.normalizedJpegProduced, isTrue);
    expect(result.thumbnailJpegProduced, isTrue);
    expect(result.width, 240);
    expect(result.height, 120);
    expect(result.thumbnailWidth, 240);
    expect(result.thumbnailHeight, 120);
  });

  test('bakes JPEG EXIF orientation before native OCR', () {
    final image = _sampleImage(120, 240)..exif.imageIfd.orientation = 6;
    final source = Uint8List.fromList(img.encodeJpg(image));

    final result = processor.process(
      ReceiptImageArtifactRequest(
        sourceType: ReceiptImageSourceKind.capturedPhoto,
        sourceContentType: 'image/jpeg',
        sourceExtension: 'jpg',
        sourceLabel: 'portrait-camera.jpg',
        sourceBytes: source,
      ),
    );

    expect(result.accepted, isTrue);
    expect(result.width, 240);
    expect(result.height, 120);
    final normalized = img.decodeJpg(result.normalizedJpegBytes!);
    expect(normalized?.width, 240);
    expect(normalized?.height, 120);
    expect(normalized?.exif.imageIfd.hasOrientation, isFalse);
  });

  test('selects decoder from bytes when metadata and extension disagree', () {
    final result = processor.process(
      ReceiptImageArtifactRequest(
        sourceType: ReceiptImageSourceKind.importedImage,
        sourceContentType: 'image/jpeg',
        sourceExtension: 'jpg',
        sourceLabel: 'wrong-extension.jpg',
        sourceBytes: _pngBytes(width: 64, height: 32),
      ),
    );

    expect(result.accepted, isTrue);
    expect(result.width, 64);
    expect(result.height, 32);
    expect(result.reasonCodes, contains('source_metadata_type_mismatch'));
  });

  test('rejects decodable image formats outside the receipt allowlist', () {
    final result = processor.process(
      ReceiptImageArtifactRequest(
        sourceType: ReceiptImageSourceKind.importedImage,
        sourceContentType: 'image/gif',
        sourceExtension: 'gif',
        sourceLabel: 'animated-receipt.gif',
        sourceBytes: img.encodeGif(_sampleImage(32, 16)),
      ),
    );

    expect(result.status, ReceiptImageArtifactStatus.unsupported);
    expect(result.normalizedJpegBytes, isNull);
    expect(result.reasonCodes, contains('unknown_or_unsupported_file_type'));
  });

  test('marks PDF document input limited without page extraction', () {
    final result = processor.process(
      const ReceiptImageArtifactRequest(
        sourceType: ReceiptImageSourceKind.importedPdf,
        sourceContentType: 'application/pdf',
        sourceExtension: 'pdf',
        sourceLabel: '/tmp/receipt.pdf',
        sourceBytes: [0x25, 0x50, 0x44, 0x46],
      ),
    );

    expect(result.status, ReceiptImageArtifactStatus.limited);
    expect(result.normalizedJpegBytes, isNull);
    expect(result.thumbnailJpegBytes, isNull);
    expect(result.reasonCodes, contains('pdf_document_not_image_normalized'));
    expect(result.sourceLabel, 'receipt.pdf');
  });

  test('rejects HEIC safely without claiming decode support', () {
    final result = processor.process(
      const ReceiptImageArtifactRequest(
        sourceType: ReceiptImageSourceKind.importedImage,
        sourceContentType: 'image/heic',
        sourceExtension: 'heic',
        sourceLabel: '/private/mobile/receipt.heic',
        sourceBytes: [1, 2, 3, 4],
      ),
    );

    expect(result.status, ReceiptImageArtifactStatus.unsupported);
    expect(result.normalizedJpegBytes, isNull);
    expect(result.thumbnailJpegBytes, isNull);
    expect(result.reasonCodes, contains('heic_decoder_unavailable'));
    expect(result.safeDiagnosticSummary, isNot(contains('/private/mobile')));
  });

  test('rejects over-limit pixel dimensions before full image decode', () {
    final source = _pngWithDeclaredDimensions(width: 5000, height: 4000);

    final result = processor.process(
      ReceiptImageArtifactRequest(
        sourceType: ReceiptImageSourceKind.importedImage,
        sourceContentType: 'image/png',
        sourceExtension: 'png',
        sourceLabel: 'compressed-large-receipt.png',
        sourceBytes: source,
      ),
    );

    expect(source.length, lessThan(1024));
    expect(result.status, ReceiptImageArtifactStatus.unsupported);
    expect(result.normalizedJpegBytes, isNull);
    expect(result.thumbnailJpegBytes, isNull);
    expect(
      result.reasonCodes,
      contains('image_dimensions_exceed_processing_limit'),
    );
    expect(result.reasonCodes, isNot(contains('image_decode_failed')));
  });

  test('rejects an over-limit single dimension before full decode', () {
    final result = processor.process(
      ReceiptImageArtifactRequest(
        sourceType: ReceiptImageSourceKind.importedImage,
        sourceContentType: 'image/png',
        sourceExtension: 'png',
        sourceLabel: 'too-wide-receipt.png',
        sourceBytes: _pngWithDeclaredDimensions(width: 8193, height: 1),
      ),
    );

    expect(result.status, ReceiptImageArtifactStatus.unsupported);
    expect(
      result.reasonCodes,
      contains('image_dimensions_exceed_processing_limit'),
    );
  });

  test(
    'diagnostics avoid OCR text, receipt contents, paths, and private data',
    () {
      final result = processor.process(
        ReceiptImageArtifactRequest(
          sourceType: ReceiptImageSourceKind.importedImage,
          sourceContentType: 'image/png',
          sourceExtension: 'png',
          sourceLabel:
              '/Users/alice/Receipts/Coffee Visa 4111 alice@example.com token.png',
          sourceBytes: _pngBytes(width: 32, height: 16),
        ),
      );

      expect(result.safeDiagnosticSummary, isNot(contains('/Users/alice')));
      expect(result.safeDiagnosticSummary, isNot(contains('Coffee')));
      expect(result.safeDiagnosticSummary, isNot(contains('4111')));
      expect(
        result.safeDiagnosticSummary,
        isNot(contains('alice@example.com')),
      );
      expect(result.safeDiagnosticSummary, isNot(contains('token')));
      expect(
        result.warnings.join('\n'),
        isNot(contains('Coffee Visa 4111 alice@example.com token')),
      );
    },
  );
}

Uint8List _pngBytes({required int width, required int height}) {
  return Uint8List.fromList(img.encodePng(_sampleImage(width, height)));
}

Uint8List _jpegBytes({required int width, required int height}) {
  return Uint8List.fromList(img.encodeJpg(_sampleImage(width, height)));
}

Uint8List _pngWithDeclaredDimensions({
  required int width,
  required int height,
}) {
  final bytes = _pngBytes(width: 1, height: 1);
  final data = ByteData.sublistView(bytes);
  data.setUint32(16, width, Endian.big);
  data.setUint32(20, height, Endian.big);
  data.setUint32(29, _crc32(bytes.sublist(12, 29)), Endian.big);
  return bytes;
}

int _crc32(List<int> bytes) {
  var crc = 0xffffffff;
  for (final byte in bytes) {
    crc ^= byte;
    for (var bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) == 1 ? (crc >> 1) ^ 0xedb88320 : crc >> 1;
    }
  }
  return (crc ^ 0xffffffff) & 0xffffffff;
}

img.Image _sampleImage(int width, int height) {
  final image = img.Image(width: width, height: height);
  for (final pixel in image) {
    pixel
      ..r = pixel.x % 255
      ..g = pixel.y % 255
      ..b = 80;
  }
  return image;
}
