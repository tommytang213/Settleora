import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:mobile/receipt_ocr_capture/receipt_image_artifact_processor.dart';
import 'package:mobile/receipt_ocr_capture/receipt_image_normalization_policy.dart';

const ridgeId = 'existing_13_ridge_restaurant_en_US';
const sourceSha =
    'ee60af99bb233c8d99b4678373b713d22e74127c44cf68e61db794f448e1356e';
const normalizedSha =
    '261b6f1831617873bad6da93cefe54c050e70d10ec283dfdc6af9286602e10ec';

void main(List<String> args) {
  try {
    if (args.length != 2) throw StateError('rejected');
    final root = args[0];
    final manifest =
        jsonDecode(
              File(
                '$root/apps/mobile/test/fixtures/receipt_ocr/manifest.json',
              ).readAsStringSync(),
            )
            as Map<String, dynamic>;
    final entry = (manifest['fixtures'] as List)
        .cast<Map<String, dynamic>>()
        .singleWhere((row) => row['id'] == ridgeId);
    final relative = entry['file'] as String;
    if (relative.startsWith('/') ||
        relative.split('/').contains('..') ||
        entry['fallback_currency'] != 'USD')
      throw StateError('rejected');
    final original = File(
      '$root/apps/mobile/test/fixtures/receipt_ocr/$relative',
    ).readAsBytesSync();
    if (original.length != 377208 ||
        sha256.convert(original).toString() != sourceSha) {
      throw StateError('rejected');
    }
    List<int>? normalized;
    for (var index = 0; index < 2; index++) {
      final result = const ReceiptImageArtifactProcessor().process(
        ReceiptImageArtifactRequest(
          sourceType: ReceiptImageSourceKind.importedImage,
          sourceContentType: 'image/jpeg',
          sourceBytes: original,
          sourceExtension: 'jpeg',
          sourceLabel: ridgeId,
        ),
      );
      final bytes = result.normalizedJpegBytes;
      if (!result.accepted ||
          bytes == null ||
          result.normalizedContentType != 'image/jpeg' ||
          bytes.length != 263039 ||
          result.width != 1086 ||
          result.height != 1448 ||
          sha256.convert(bytes).toString() != normalizedSha) {
        throw StateError('rejected');
      }
      normalized ??= bytes;
    }
    final output = File(args[1]);
    output.createSync(exclusive: true);
    output.writeAsBytesSync(normalized!, flush: true);
    stdout.writeln(
      'SETTLEORA_ARM64_INPUT=' +
          jsonEncode({
            'schemaVersion': 1,
            'fixtureId': ridgeId,
            'sourceBytes': 377208,
            'sourceSHA256': sourceSha,
            'bytes': 263039,
            'sha256': normalizedSha,
            'width': 1086,
            'height': 1448,
            'normalizationRuns': 2,
            'jpegQuality': 88,
            'thumbnailMaxDimension': 320,
            'maximumDimension': 2048,
            'fallbackCurrency': 'USD',
            'providerCalls': 0,
          }),
    );
  } catch (_) {
    stderr.writeln('arm64_runtime_input_rejected');
    exitCode = 98;
  }
}
