import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:integration_test/integration_test.dart';
import 'package:mobile/bills/bill_attachment_file_input.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/bills/bill_repository.dart';
import 'package:mobile/receipt_ocr_capture/paddle_receipt_ocr_provider.dart';
import 'package:mobile/receipt_ocr_capture/receipt_image_artifact_processor.dart';
import 'package:mobile/receipt_ocr_capture/receipt_image_normalization_policy.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_provider.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  const fixtures = _NativeAcceptanceFixtures();
  const provider = PaddleReceiptOcrProvider();
  const artifactProcessor = ReceiptImageArtifactProcessor();

  testWidgets('all 101 real images match complete preview truth', (
    WidgetTester tester,
  ) async {
    final manifest =
        jsonDecode(utf8.decode(await fixtures.load('manifest.json')))
            as Map<String, Object?>;
    expect(manifest['schema_version'], 2);
    final entries = (manifest['fixtures']! as List<Object?>)
        .cast<Map<String, Object?>>();
    expect(entries, hasLength(101));
    final mismatches = <_BoundedMismatch>[];
    final fixtureDurationsMs = <int>[];
    final nativeDurationsMs = <int>[];
    final scriptResults = <String, _ScriptResult>{};
    var peakRssBytes = ProcessInfo.currentRss;
    int? nativeColdLoadTimeMs;
    String? runtime;

    for (final entry in entries) {
      final fixtureId = entry['id']! as String;
      final script = entry['script']! as String;
      final scriptResult = scriptResults.putIfAbsent(script, _ScriptResult.new);
      scriptResult.total += 1;
      final expected = entry['expected']! as Map<String, Object?>;
      final fixtureMismatches = <_BoundedMismatch>[];
      if (expected.keys.toSet().difference(_supportedExpectedKeys).isNotEmpty) {
        fixtureMismatches.add(_BoundedMismatch(fixtureId, 'manifest_shape'));
        mismatches.addAll(fixtureMismatches);
        continue;
      }
      final currencyResolution =
          entry['expected_currency_resolution'] as Map<String, Object?>?;
      final artifact = artifactProcessor.process(
        ReceiptImageArtifactRequest(
          sourceType: ReceiptImageSourceKind.importedImage,
          sourceContentType: 'image/jpeg',
          sourceBytes: await fixtures.load(entry['file']! as String),
          sourceExtension: 'jpeg',
          sourceLabel: fixtureId,
        ),
      );
      if (!artifact.accepted || !artifact.normalizedJpegProduced) {
        fixtureMismatches.add(_BoundedMismatch(fixtureId, 'normalization'));
      } else {
        final stopwatch = Stopwatch()..start();
        final rssSampler = Timer.periodic(const Duration(milliseconds: 25), (
          _,
        ) {
          if (ProcessInfo.currentRss > peakRssBytes) {
            peakRssBytes = ProcessInfo.currentRss;
          }
        });
        final result = await provider.extractReceipt(
          ReceiptOcrRequest(
            bytes: artifact.normalizedJpegBytes!,
            contentType: artifact.normalizedContentType!,
            fallbackCurrency: entry['fallback_currency'] as String?,
          ),
        );
        rssSampler.cancel();
        stopwatch.stop();
        fixtureDurationsMs.add(stopwatch.elapsedMilliseconds);
        final evidence = result.preview?.runEvidence;
        if (evidence?.totalTimeMs != null) {
          nativeDurationsMs.add(evidence!.totalTimeMs!);
        }
        nativeColdLoadTimeMs ??= evidence?.coldLoadTimeMs;
        runtime ??= evidence?.runtime;
        fixtureMismatches.addAll(
          _completePreviewMismatches(
            fixtureId,
            result,
            expected,
            currencyResolution: currencyResolution,
          ),
        );
      }
      if (fixtureMismatches.isEmpty) scriptResult.passed += 1;
      mismatches.addAll(fixtureMismatches);
    }

    final evidence = <String, Object?>{
      'schemaVersion': 1,
      'platform': Platform.operatingSystem,
      'completed': true,
      'fixtureCount': entries.length,
      'passedFixtureCount':
          entries.length - mismatches.map((e) => e.fixtureId).toSet().length,
      'mismatchCount': mismatches.length,
      'mismatches': mismatches.map((e) => e.toJson()).toList(growable: false),
      'runtime': runtime,
      'coldLoadTimeMs': nativeColdLoadTimeMs,
      'endToEndLatencyMs': _latencySummary(fixtureDurationsMs),
      'nativeLatencyMs': _latencySummary(nativeDurationsMs),
      'peakRssBytes': peakRssBytes,
      'perScript': {
        for (final entry in scriptResults.entries)
          entry.key: entry.value.toJson(),
      },
    };
    binding.reportData = evidence;
    // This marker is intentionally bounded to fixture IDs, field names, and
    // aggregate metrics. It never contains OCR text or receipt bytes.
    debugPrint('SETTLEORA_OCR_ACCEPTANCE=${jsonEncode(evidence)}');
    expect(
      mismatches.isEmpty,
      isTrue,
      reason: 'Bounded OCR mismatches: ${mismatches.join(',')}',
    );
  });

  testWidgets('a real fixture rotated 270 degrees matches complete truth', (
    WidgetTester tester,
  ) async {
    final manifest =
        jsonDecode(utf8.decode(await fixtures.load('manifest.json')))
            as Map<String, Object?>;
    final entry = (manifest['fixtures']! as List<Object?>)
        .cast<Map<String, Object?>>()
        .singleWhere(
          (fixture) => fixture['id'] == 'existing_12_freshmart_grocery_en_US',
        );
    final source = img.decodeImage(
      await fixtures.load(entry['file']! as String),
    );
    expect(source, isNotNull);
    final rotatedBytes = img.encodeJpg(
      img.copyRotate(source!, angle: 270),
      quality: 100,
    );
    final artifact = artifactProcessor.process(
      ReceiptImageArtifactRequest(
        sourceType: ReceiptImageSourceKind.importedImage,
        sourceContentType: 'image/jpeg',
        sourceBytes: rotatedBytes,
        sourceExtension: 'jpeg',
        sourceLabel: 'existing_12_freshmart_grocery_en_US-derived-rotate270',
      ),
    );
    expect(artifact.accepted, isTrue);
    expect(artifact.normalizedJpegProduced, isTrue);

    final result = await provider.extractReceipt(
      ReceiptOcrRequest(
        bytes: artifact.normalizedJpegBytes!,
        contentType: artifact.normalizedContentType!,
        fallbackCurrency: entry['fallback_currency'] as String?,
      ),
    );
    final mismatches = _completePreviewMismatches(
      'existing_12_freshmart_grocery_en_US-derived-rotate270',
      result,
      entry['expected']! as Map<String, Object?>,
      currencyResolution:
          entry['expected_currency_resolution'] as Map<String, Object?>?,
    );
    expect(
      mismatches.isEmpty,
      isTrue,
      reason: 'Bounded rotated OCR mismatches: ${mismatches.join(',')}',
    );
  });

  testWidgets('representative production receipt review UI uses real provider', (
    WidgetTester tester,
  ) async {
    final manifest =
        jsonDecode(utf8.decode(await fixtures.load('manifest.json')))
            as Map<String, Object?>;
    final entry = (manifest['fixtures']! as List<Object?>)
        .cast<Map<String, Object?>>()
        .singleWhere(
          (fixture) => fixture['id'] == 'existing_12_freshmart_grocery_en_US',
        );
    final input = _FixtureAttachmentInput(
      await fixtures.load(entry['file']! as String),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraPersonalBillCreateScreen(
          repository: _NoopBillRepository(),
          attachmentFileInput: input,
          receiptOcrProvider: provider,
          defaultCurrency: entry['fallback_currency'] as String?,
          scanReceiptOnStart: true,
        ),
      ),
    );

    final previewPanel = find.byKey(
      const Key('personal-bill-ocr-preview-panel'),
    );
    for (
      var attempt = 0;
      attempt < 3000 && previewPanel.evaluate().isEmpty;
      attempt += 1
    ) {
      await Future<void>.delayed(const Duration(milliseconds: 100));
      await tester.pump();
    }
    expect(previewPanel, findsOneWidget);
    expect(find.byKey(const Key('personal-bill-ocr-apply')), findsOneWidget);
    debugPrint(
      'SETTLEORA_OCR_UI_SMOKE=${jsonEncode({'schemaVersion': 1, 'platform': Platform.operatingSystem, 'completed': true, 'fixtureId': entry['id'], 'previewPanel': true, 'applyBoundaryVisible': true})}',
    );
  });
}

const _supportedExpectedKeys = <String>{
  'merchant',
  'date',
  'currency',
  'subtotal',
  'tax',
  'service',
  'tip',
  'shipping',
  'discount',
  'total',
  'items',
  'expected_review_condition',
};

List<_BoundedMismatch> _completePreviewMismatches(
  String fixtureId,
  ReceiptOcrResult result,
  Map<String, Object?> expected, {
  Map<String, Object?>? currencyResolution,
}) {
  final mismatches = <_BoundedMismatch>[];
  final preview = result.preview;
  if (result.status != ReceiptOcrStatus.extracted || preview == null) {
    return [_BoundedMismatch(fixtureId, 'provider_status')];
  }
  _collectField(mismatches, fixtureId, 'merchant', preview.merchant, expected);
  _collectField(mismatches, fixtureId, 'date', preview.receiptDate, expected);
  _collectField(mismatches, fixtureId, 'currency', preview.currency, expected);
  _collectField(mismatches, fixtureId, 'subtotal', preview.subtotal, expected);
  _collectField(mismatches, fixtureId, 'tax', preview.tax, expected);
  _collectField(mismatches, fixtureId, 'service', preview.service, expected);
  _collectField(mismatches, fixtureId, 'tip', preview.tip, expected);
  _collectField(mismatches, fixtureId, 'shipping', preview.shipping, expected);
  _collectField(mismatches, fixtureId, 'discount', preview.discount, expected);
  _collectField(mismatches, fixtureId, 'total', preview.total, expected);

  final expectedItems = (expected['items']! as List<Object?>)
      .map((item) => _ExpectedItem.fromManifest(item, fixtureId))
      .toList(growable: false);
  if (preview.items.length != expectedItems.length) {
    mismatches.add(_BoundedMismatch(fixtureId, 'items.length'));
  }
  final comparedItemCount = preview.items.length < expectedItems.length
      ? preview.items.length
      : expectedItems.length;
  for (var index = 0; index < comparedItemCount; index += 1) {
    final expectedItem = expectedItems[index];
    final actualItem = preview.items[index];
    if (_normalizedText(actualItem.description) !=
        _normalizedText(expectedItem.description)) {
      mismatches.add(_BoundedMismatch(fixtureId, 'items[$index].description'));
    }
    if (actualItem.lineTotal != expectedItem.lineTotal) {
      mismatches.add(_BoundedMismatch(fixtureId, 'items[$index].lineTotal'));
    }
    if (expectedItem.quantity != null &&
        actualItem.quantity != expectedItem.quantity) {
      mismatches.add(_BoundedMismatch(fixtureId, 'items[$index].quantity'));
    }
    if (expectedItem.unitPrice != null &&
        actualItem.unitPrice != expectedItem.unitPrice) {
      mismatches.add(_BoundedMismatch(fixtureId, 'items[$index].unitPrice'));
    }
  }

  if (currencyResolution != null) {
    if (preview.currencyProvenance !=
        _currencyProvenance(currencyResolution['source']! as String)) {
      mismatches.add(_BoundedMismatch(fixtureId, 'currency_provenance'));
    }
  }
  final expectedReviewCondition =
      expected['expected_review_condition'] as String?;
  if (expectedReviewCondition != null) {
    if (expectedReviewCondition !=
            'printed total differs from visible charge-line arithmetic' ||
        !preview.reviewHints.contains(
          'OCR item total differs from detected grand total. Review the receipt before applying.',
        )) {
      mismatches.add(_BoundedMismatch(fixtureId, 'review_condition'));
    }
  }
  if (preview.blocks.isEmpty) {
    mismatches.add(_BoundedMismatch(fixtureId, 'ocr_evidence'));
  }
  final expectedRuntime = Platform.isIOS
      ? 'onnxruntime-objc:1.24.3:cpu'
      : 'onnxruntime-android:1.21.1:cpu';
  if (preview.runEvidence?.runtime != expectedRuntime) {
    mismatches.add(_BoundedMismatch(fixtureId, 'runtime_evidence'));
  }
  return mismatches;
}

void _collectField(
  List<_BoundedMismatch> mismatches,
  String fixtureId,
  String field,
  String? actual,
  Map<String, Object?> expected,
) {
  if (!expected.containsKey(field)) return;
  final expectedValue = expected[field];
  if (field == 'merchant' && expectedValue is String) {
    if (_normalizedText(actual) != _normalizedText(expectedValue)) {
      mismatches.add(_BoundedMismatch(fixtureId, field));
    }
    return;
  }
  if (actual != expectedValue) {
    mismatches.add(_BoundedMismatch(fixtureId, field));
  }
}

String _normalizedText(String? value) =>
    (value ?? '').replaceAll(RegExp(r'\s+'), ' ').trim();

Map<String, int?> _latencySummary(List<int> values) {
  if (values.isEmpty) {
    return const {
      'sampleCount': 0,
      'cold': null,
      'warmP50': null,
      'warmP95': null,
      'max': null,
    };
  }
  final warm = values.length > 1 ? (values.sublist(1)..sort()) : <int>[];
  int? percentile(double fraction) {
    if (warm.isEmpty) return null;
    final index = ((warm.length - 1) * fraction).ceil();
    return warm[index];
  }

  return {
    'sampleCount': values.length,
    'cold': values.first,
    'warmP50': percentile(0.50),
    'warmP95': percentile(0.95),
    'max': values.reduce((left, right) => left > right ? left : right),
  };
}

class _BoundedMismatch {
  const _BoundedMismatch(this.fixtureId, this.field);

  final String fixtureId;
  final String field;

  Map<String, String> toJson() => {'fixtureId': fixtureId, 'field': field};

  @override
  String toString() => '$fixtureId:$field';
}

class _ScriptResult {
  int total = 0;
  int passed = 0;

  Map<String, int> toJson() => {'total': total, 'passed': passed};
}

ReceiptOcrCurrencyProvenance _currencyProvenance(String source) {
  return switch (source) {
    'explicit' => ReceiptOcrCurrencyProvenance.explicit,
    'context_inferred' => ReceiptOcrCurrencyProvenance.contextInferred,
    'default_fallback' => ReceiptOcrCurrencyProvenance.defaultFallback,
    'unresolved' => ReceiptOcrCurrencyProvenance.unresolved,
    _ => throw StateError('Unknown manifest currency source'),
  };
}

class _ExpectedItem {
  const _ExpectedItem({
    required this.description,
    required this.lineTotal,
    this.quantity,
    this.unitPrice,
  });

  factory _ExpectedItem.fromManifest(Object? value, String fixtureId) {
    if (value case [final String description, final String lineTotal]) {
      return _ExpectedItem(description: description, lineTotal: lineTotal);
    }
    if (value is Map<String, Object?>) {
      const supportedKeys = {
        'description',
        'quantity',
        'unit_price',
        'line_total',
      };
      final unknownKeys = value.keys.toSet().difference(supportedKeys);
      if (unknownKeys.isNotEmpty) {
        throw StateError(
          '$fixtureId item contains unvalidated keys: $unknownKeys',
        );
      }
      final description = value['description'];
      final quantity = value['quantity'];
      final unitPrice = value['unit_price'];
      final lineTotal = value['line_total'];
      if (description is! String ||
          lineTotal is! String ||
          (quantity != null && quantity is! String) ||
          (unitPrice != null && unitPrice is! String)) {
        throw StateError('$fixtureId item ground truth must use strings');
      }
      return _ExpectedItem(
        description: description,
        quantity: quantity as String?,
        unitPrice: unitPrice as String?,
        lineTotal: lineTotal,
      );
    }
    throw StateError('$fixtureId has an unsupported item representation');
  }

  final String description;
  final String? quantity;
  final String? unitPrice;
  final String lineTotal;
}

class _FixtureAttachmentInput implements SettleoraBillAttachmentFileInput {
  _FixtureAttachmentInput(this.bytes);

  final Uint8List bytes;

  @override
  Future<SettleoraPickedBillAttachmentFile?> pickAttachmentFile({
    required Set<String> allowedContentTypes,
  }) async {
    return pickedBillAttachmentFileFromBytes(
      filename: 'acceptance-receipt.jpg',
      contentType: 'image/jpeg',
      bytes: bytes,
      allowedContentTypes: allowedContentTypes,
    );
  }
}

class _NoopBillRepository implements SettleoraBillRepository {
  Never _unexpected() => throw StateError('Unexpected acceptance UI mutation');

  @override
  Future<SettleoraBillDetail> createGroupBill(
    String groupId,
    SettleoraGroupBillCreateDraft draft,
  ) async => _unexpected();

  @override
  Future<SettleoraBillDetail> createPersonalBill(
    SettleoraPersonalBillCreateDraft draft,
  ) async => _unexpected();

  @override
  Future<SettleoraBillDetail> getGroupBill(
    String groupId,
    String billId,
  ) async => _unexpected();

  @override
  Future<SettleoraBillDetail> getPersonalBill(String billId) async =>
      _unexpected();

  @override
  Future<List<SettleoraBillSummary>> listGroupBills(
    String groupId, {
    int limit = 50,
  }) async => _unexpected();

  @override
  Future<List<SettleoraBillSummary>> listPersonalBills({
    int limit = 50,
  }) async => _unexpected();

  @override
  Future<void> acceptGroupBillParticipant(
    String groupId,
    String billId,
    String userProfileId,
  ) async => _unexpected();

  @override
  Future<void> rejectGroupBillParticipant(
    String groupId,
    String billId,
    String userProfileId,
    SettleoraBillParticipantRejectionReasonCode reasonCode,
  ) async => _unexpected();

  @override
  Future<void> submitGroupBill(String groupId, String billId) async =>
      _unexpected();
}

class _NativeAcceptanceFixtures {
  const _NativeAcceptanceFixtures();

  static const _channel = MethodChannel(
    'com.settleora.mobile/receipt_ocr_acceptance',
  );

  Future<Uint8List> load(String path) async {
    final bytes = await _channel.invokeMethod<Uint8List>('loadFixture', {
      'path': path,
    });
    if (bytes == null || bytes.isEmpty) {
      throw StateError('OCR acceptance fixture unavailable');
    }
    return bytes;
  }
}
