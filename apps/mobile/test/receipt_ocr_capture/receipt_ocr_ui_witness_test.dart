import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/bills/bill_repository.dart';
import 'package:mobile/receipt_ocr_capture/receipt_image_artifact_processor.dart';
import 'package:mobile/receipt_ocr_capture/receipt_image_normalization_policy.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_provider.dart';

import '../../integration_test/support/receipt_ocr_ui_witness.dart';

void main() {
  final source = Uint8List.fromList(
    img.encodeJpg(img.Image(width: 600, height: 800)),
  );
  final artifact = const ReceiptImageArtifactProcessor().process(
    ReceiptImageArtifactRequest(
      sourceType: ReceiptImageSourceKind.importedImage,
      sourceContentType: 'image/jpeg',
      sourceExtension: 'jpeg',
      sourceBytes: source,
    ),
  );
  ReceiptOcrRequest request({String? currency = 'USD'}) => ReceiptOcrRequest(
    bytes: artifact.normalizedJpegBytes!,
    contentType: artifact.normalizedContentType!,
    fallbackCurrency: currency,
  );
  const preview = ReceiptOcrPreview(
    merchant: 'Public synthetic shop',
    receiptDate: '2026-10-19',
    currency: 'USD',
    subtotal: '10.00',
    tax: '1.00',
    total: '11.00',
    warnings: [
      'Public warning one',
      'Public warning two',
      'Public warning three',
      'Public warning four',
    ],
    items: [
      ReceiptOcrItemCandidate(
        description: 'Public synthetic item',
        quantity: '2',
        unitPrice: '5.00',
        lineTotal: '10.00',
        currency: 'USD',
      ),
    ],
  );

  testWidgets(
    'a transient real manual-draft mutation stays failed after restoration',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraPersonalBillCreateScreen(
            repository: _UnexpectedRepository(),
            defaultCurrency: 'USD',
          ),
        ),
      );
      await tester.pumpAndSettle();
      final observer = ReceiptOcrUiDraftIsolation(tester);
      expect(observer.observe(tester), isTrue);
      final field = find.byKey(const Key('personal-bill-merchant-name'));
      final original = tester.widget<TextFormField>(field).controller!.text;
      await tester.enterText(field, 'Public transient draft mutation');
      await tester.pumpAndSettle();
      expect(observer.observe(tester), isFalse);
      await tester.enterText(field, original);
      await tester.pumpAndSettle();
      expect(tester.widget<TextFormField>(field).controller!.text, original);
      expect(observer.observe(tester), isFalse);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'real edit, rebuild and reset preserve the manual draft and source',
    (tester) async {
      final observed = await receiptOcrUiWitness(
        tester,
        sourceBytes: source,
        sourceRequest: request(),
        result: const ReceiptOcrResult.extracted(preview),
      );
      expect(observed, [1, 3, 511, 0, 1, 0]);
      expect(preview.merchant, 'Public synthetic shop');
      expect(preview.items.single.description, 'Public synthetic item');
      // Four preserved source warnings do not claim four visible warnings, full
      // ambiguity coverage, safe money, saved-review Apply or draft usefulness.
      expect(preview.warnings.length, 4);
      expect(jsonEncode(observed), isNot(contains('Public')));
    },
  );

  testWidgets(
    'adjacent different previews get fresh screen state without a cache',
    (tester) async {
      final first = await receiptOcrUiWitness(
        tester,
        sourceBytes: source,
        sourceRequest: request(),
        result: const ReceiptOcrResult.extracted(preview),
      );
      const secondPreview = ReceiptOcrPreview(
        merchant: 'Other public merchant',
        currency: 'USD',
      );
      final second = await receiptOcrUiWitness(
        tester,
        sourceBytes: source,
        sourceRequest: request(),
        result: const ReceiptOcrResult.extracted(secondPreview),
      );
      expect(first, [1, 3, 511, 0, 1, 0]);
      expect(second, [1, 3, 503, 0, 1, 0]);
    },
  );

  testWidgets(
    'a missing preview is unavailable and never replaced by another result',
    (tester) async {
      for (final result in [
        const ReceiptOcrResult.failed('Private exception sentinel'),
        const ReceiptOcrResult.unsupported('Private input sentinel'),
      ]) {
        expect(
          await receiptOcrUiWitness(
            tester,
            sourceBytes: source,
            sourceRequest: request(),
            result: result,
          ),
          [1, 1, 0, 0, 0, 0],
        );
      }
    },
  );

  testWidgets('null corpus fallback is unequal to the actual screen default', (
    tester,
  ) async {
    expect(
      await receiptOcrUiWitness(
        tester,
        sourceBytes: source,
        sourceRequest: request(currency: null),
        result: const ReceiptOcrResult.extracted(preview),
      ),
      [1, 2, 1, 1, 1, 0],
    );
  });

  testWidgets(
    'byte, content-type and image-path differences cannot yield a positive replay',
    (tester) async {
      for (final unequal in [
        ReceiptOcrRequest(
          bytes: [0, 1, 2],
          contentType: 'image/jpeg',
          fallbackCurrency: 'USD',
        ),
        ReceiptOcrRequest(
          bytes: request().bytes,
          contentType: 'image/png',
          fallbackCurrency: 'USD',
        ),
        ReceiptOcrRequest(
          bytes: request().bytes,
          contentType: 'image/jpeg',
          imagePath: 'private-path-sentinel',
          fallbackCurrency: 'USD',
        ),
      ]) {
        final observed = await receiptOcrUiWitness(
          tester,
          sourceBytes: source,
          sourceRequest: unequal,
          result: const ReceiptOcrResult.extracted(preview),
        );
        expect(observed, [1, 2, 1, 1, 1, 0]);
        expect(jsonEncode(observed), isNot(contains('private')));
      }
    },
  );

  testWidgets(
    'a blank merchant and no items still permit the measured merchant operation',
    (tester) async {
      expect(
        await receiptOcrUiWitness(
          tester,
          sourceBytes: source,
          sourceRequest: request(),
          result: const ReceiptOcrResult.extracted(ReceiptOcrPreview()),
        ),
        [1, 3, 503, 0, 1, 0],
      );
    },
  );
}

class _UnexpectedRepository implements SettleoraBillRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw StateError('Unexpected public widget-test repository call');
}
