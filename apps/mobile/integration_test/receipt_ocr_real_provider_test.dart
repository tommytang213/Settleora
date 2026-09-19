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
  var networkIsolated = false;

  testWidgets('native acceptance runner has no external network', (
    WidgetTester tester,
  ) async {
    final failure = _BoundedFailureStage('network_canary');
    await failure.run(() async {
      if (Platform.isIOS) {
        expect(
          Platform.environment['SETTLEORA_OCR_NETWORK_ISOLATION'],
          'socket_interpose_v1',
          reason: 'The iOS runner must scope isolation to the test app.',
        );
        expect(
          Platform.environment['SETTLEORA_OCR_NETWORK_INTERPOSER_LOADED'],
          '1',
          reason: 'The iOS network interposer must positively attest loading.',
        );
      }
      Socket? socket;
      try {
        socket = await Socket.connect(
          InternetAddress('1.1.1.1'),
          443,
          timeout: const Duration(seconds: 3),
        );
      } on SocketException catch (error) {
        if (Platform.isIOS) {
          expect(
            error.osError?.errorCode,
            51,
            reason: 'The iOS interposer must deny with Darwin ENETUNREACH.',
          );
        }
      } on TimeoutException {
        expect(
          Platform.isIOS,
          isFalse,
          reason: 'An iOS timeout does not prove the interposer denied access.',
        );
      }
      await socket?.close();
      networkIsolated = socket == null;
      expect(
        networkIsolated,
        isTrue,
        reason: 'Native OCR acceptance must run without external networking.',
      );
    });
  });

  testWidgets('all 101 real images match complete preview truth', (
    WidgetTester tester,
  ) async {
    final failure = _BoundedFailureStage('corpus_manifest');
    await failure.run(() async {
      final manifest =
          jsonDecode(utf8.decode(await fixtures.load('manifest.json')))
              as Map<String, Object?>;
      expect(manifest['schema_version'], 2);
      final entries = (manifest['fixtures']! as List<Object?>)
          .cast<Map<String, Object?>>();
      expect(entries, hasLength(101));
      final modelCatalog = _NativeModelCatalogEvidence.fromJson(
        jsonDecode(
              await rootBundle.loadString(
                'assets/receipt_ocr_models/catalog.json',
              ),
            )
            as Map<String, Object?>,
      );
      final mismatches = <_BoundedMismatch>[];
      final fixtureDurationsMs = <int>[];
      final nativeDurationsMs = <int>[];
      final scriptResults = <String, _ScriptResult>{};
      var peakRssBytes = ProcessInfo.currentRss;
      int? nativeColdLoadTimeMs;
      String? runtime;

      for (final entry in entries) {
        final fixtureId = entry['id']! as String;
        failure.set('corpus_fixture_load', fixtureId: fixtureId);
        final script = entry['script']! as String;
        final scriptResult = scriptResults.putIfAbsent(
          script,
          _ScriptResult.new,
        );
        scriptResult.total += 1;
        final expected = entry['expected']! as Map<String, Object?>;
        final fixtureMismatches = <_BoundedMismatch>[];
        if (expected.keys
            .toSet()
            .difference(_supportedExpectedKeys)
            .isNotEmpty) {
          fixtureMismatches.add(_BoundedMismatch(fixtureId, 'manifest_shape'));
          mismatches.addAll(fixtureMismatches);
          continue;
        }
        final currencyResolution =
            entry['expected_currency_resolution'] as Map<String, Object?>?;
        final fixtureBytes = await fixtures.load(entry['file']! as String);
        failure.set('corpus_normalization', fixtureId: fixtureId);
        final artifact = artifactProcessor.process(
          ReceiptImageArtifactRequest(
            sourceType: ReceiptImageSourceKind.importedImage,
            sourceContentType: 'image/jpeg',
            sourceBytes: fixtureBytes,
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
          try {
            failure.set('corpus_provider', fixtureId: fixtureId);
            final result = await provider.extractReceipt(
              ReceiptOcrRequest(
                bytes: artifact.normalizedJpegBytes!,
                contentType: artifact.normalizedContentType!,
                fallbackCurrency: entry['fallback_currency'] as String?,
              ),
            );
            final evidence = result.preview?.runEvidence;
            if (evidence?.totalTimeMs != null) {
              nativeDurationsMs.add(evidence!.totalTimeMs!);
            }
            nativeColdLoadTimeMs ??= evidence?.coldLoadTimeMs;
            runtime ??= evidence?.runtime;
            failure.set('corpus_comparison', fixtureId: fixtureId);
            fixtureMismatches.addAll(
              _completePreviewMismatches(
                fixtureId,
                result,
                expected,
                script: script,
                modelCatalog: modelCatalog,
                currencyResolution: currencyResolution,
              ),
            );
          } catch (_) {
            // Preserve only a bounded category. Native exception details can
            // contain OCR text, local paths, or provider diagnostics and must
            // never enter retained acceptance evidence.
            fixtureMismatches.add(
              _BoundedMismatch(fixtureId, 'provider_exception'),
            );
          } finally {
            rssSampler.cancel();
            stopwatch.stop();
            fixtureDurationsMs.add(stopwatch.elapsedMilliseconds);
          }
        }
        if (fixtureMismatches.isEmpty) scriptResult.passed += 1;
        mismatches.addAll(fixtureMismatches);
      }

      failure.set('corpus_evidence');
      final evidence = <String, Object?>{
        'schemaVersion': 1,
        'platform': Platform.operatingSystem,
        'completed': true,
        'networkIsolated': networkIsolated,
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
  });

  testWidgets('a real fixture rotated 270 degrees matches complete truth', (
    WidgetTester tester,
  ) async {
    final failure = _BoundedFailureStage('rotation_manifest');
    await failure.run(() async {
      final manifest =
          jsonDecode(utf8.decode(await fixtures.load('manifest.json')))
              as Map<String, Object?>;
      final entry = (manifest['fixtures']! as List<Object?>)
          .cast<Map<String, Object?>>()
          .singleWhere(
            (fixture) => fixture['id'] == 'existing_12_freshmart_grocery_en_US',
          );
      final modelCatalog = _NativeModelCatalogEvidence.fromJson(
        jsonDecode(
              await rootBundle.loadString(
                'assets/receipt_ocr_models/catalog.json',
              ),
            )
            as Map<String, Object?>,
      );
      failure.set(
        'rotation_fixture_load',
        fixtureId: 'existing_12_freshmart_grocery_en_US',
      );
      final source = img.decodeImage(
        await fixtures.load(entry['file']! as String),
      );
      expect(source, isNotNull);
      final rotatedBytes = img.encodeJpg(
        img.copyRotate(source!, angle: 270),
        quality: 100,
      );
      failure.set(
        'rotation_normalization',
        fixtureId: 'existing_12_freshmart_grocery_en_US',
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

      failure.set(
        'rotation_provider',
        fixtureId: 'existing_12_freshmart_grocery_en_US',
      );
      final result = await provider.extractReceipt(
        ReceiptOcrRequest(
          bytes: artifact.normalizedJpegBytes!,
          contentType: artifact.normalizedContentType!,
          fallbackCurrency: entry['fallback_currency'] as String?,
        ),
      );
      failure.set(
        'rotation_comparison',
        fixtureId: 'existing_12_freshmart_grocery_en_US',
      );
      final mismatches = _completePreviewMismatches(
        'existing_12_freshmart_grocery_en_US-derived-rotate270',
        result,
        entry['expected']! as Map<String, Object?>,
        script: entry['script']! as String,
        modelCatalog: modelCatalog,
        currencyResolution:
            entry['expected_currency_resolution'] as Map<String, Object?>?,
      );
      expect(
        mismatches.isEmpty,
        isTrue,
        reason: 'Bounded rotated OCR mismatches: ${mismatches.join(',')}',
      );
    });
  });

  testWidgets('representative production receipt review UI uses real provider', (
    WidgetTester tester,
  ) async {
    final failure = _BoundedFailureStage('ui_manifest');
    await failure.run(() async {
      final manifest =
          jsonDecode(utf8.decode(await fixtures.load('manifest.json')))
              as Map<String, Object?>;
      final entry = (manifest['fixtures']! as List<Object?>)
          .cast<Map<String, Object?>>()
          .singleWhere(
            (fixture) => fixture['id'] == 'existing_12_freshmart_grocery_en_US',
          );
      failure.set(
        'ui_fixture_load',
        fixtureId: 'existing_12_freshmart_grocery_en_US',
      );
      final input = _FixtureAttachmentInput(
        await fixtures.load(entry['file']! as String),
      );

      failure.set(
        'ui_render',
        fixtureId: 'existing_12_freshmart_grocery_en_US',
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
      failure.set(
        'ui_evidence',
        fixtureId: 'existing_12_freshmart_grocery_en_US',
      );
      debugPrint(
        'SETTLEORA_OCR_UI_SMOKE=${jsonEncode({'schemaVersion': 1, 'platform': Platform.operatingSystem, 'completed': true, 'fixtureId': entry['id'], 'previewPanel': true, 'applyBoundaryVisible': true})}',
      );
    });
  });
}

class _BoundedFailureStage {
  _BoundedFailureStage(this.stage);

  String stage;
  String? fixtureId;

  void set(String value, {String? fixtureId}) {
    stage = value;
    this.fixtureId = fixtureId;
  }

  Future<void> run(Future<void> Function() body) async {
    try {
      await body();
    } catch (_) {
      // Retain only a bounded stage and fixture identifier. Exception text can
      // contain receipt data, provider diagnostics, or local paths.
      debugPrint(
        'SETTLEORA_OCR_DIAGNOSTIC=${jsonEncode({'schemaVersion': 1, 'platform': Platform.operatingSystem, 'stage': stage, 'fixtureId': fixtureId})}',
      );
      rethrow;
    }
  }
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
  required String script,
  required _NativeModelCatalogEvidence modelCatalog,
  Map<String, Object?>? currencyResolution,
}) {
  final mismatches = <_BoundedMismatch>[];
  final preview = result.preview;
  if (result.status != ReceiptOcrStatus.extracted || preview == null) {
    return [
      _BoundedMismatch(
        fixtureId,
        result.failureCategory == ReceiptOcrFailureCategory.providerException
            ? 'provider_exception'
            : 'provider_status',
      ),
    ];
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
  } else {
    for (final block in preview.blocks) {
      if (!modelCatalog.isRecognizer(block.modelPackId) ||
          block.modelVersion == null ||
          modelCatalog.versionFor(block.modelPackId) != block.modelVersion) {
        mismatches.add(_BoundedMismatch(fixtureId, 'model_version'));
        break;
      }
    }
    final expectedPack = modelCatalog.recognizerForScript(script);
    if (!preview.blocks.any((block) => block.modelPackId == expectedPack)) {
      mismatches.add(_BoundedMismatch(fixtureId, 'model_route'));
    }
  }
  if (preview.runEvidence?.detectionModelPackId !=
          modelCatalog.detectionPackId ||
      preview.runEvidence?.detectionModelVersion !=
          modelCatalog.versionFor(modelCatalog.detectionPackId)) {
    mismatches.add(_BoundedMismatch(fixtureId, 'detection_model'));
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

class _NativeModelCatalogEvidence {
  const _NativeModelCatalogEvidence({
    required this.detectionPackId,
    required this.packVersions,
    required this.recognizerRoutes,
  });

  factory _NativeModelCatalogEvidence.fromJson(Map<String, Object?> value) {
    final rawPacks = value['packs'];
    if (rawPacks is! List<Object?> || rawPacks.isEmpty) {
      throw StateError('Native model catalog has no packs');
    }
    final versions = <String, String>{};
    final routes = <String, String>{};
    String? detectionPackId;
    for (final rawPack in rawPacks) {
      if (rawPack is! Map<String, Object?>) {
        throw StateError('Native model catalog pack is invalid');
      }
      final packId = rawPack['modelPackId'];
      final version = rawPack['modelVersion'];
      final rawScripts = rawPack['routeScripts'];
      if (packId is! String ||
          version is! String ||
          rawScripts is! List<Object?> ||
          rawScripts.isEmpty ||
          versions.containsKey(packId)) {
        throw StateError('Native model catalog identity is invalid');
      }
      versions[packId] = version;
      for (final rawScript in rawScripts) {
        if (rawScript is! String) {
          throw StateError('Native model catalog route is invalid');
        }
        if (rawScript == 'Any') {
          if (detectionPackId != null) {
            throw StateError(
              'Native model catalog detection route is ambiguous',
            );
          }
          detectionPackId = packId;
        } else if (routes.putIfAbsent(rawScript, () => packId) != packId) {
          throw StateError(
            'Native model catalog recognition route is ambiguous',
          );
        }
      }
    }
    if (detectionPackId == null) {
      throw StateError('Native model catalog detection route is missing');
    }
    return _NativeModelCatalogEvidence(
      detectionPackId: detectionPackId,
      packVersions: versions,
      recognizerRoutes: routes,
    );
  }

  final String detectionPackId;
  final Map<String, String> packVersions;
  final Map<String, String> recognizerRoutes;

  String? versionFor(String? packId) => packVersions[packId];

  bool isRecognizer(String? packId) =>
      packId != null && recognizerRoutes.values.contains(packId);

  String recognizerForScript(String fixtureScript) {
    final catalogScript = switch (fixtureScript) {
      'Chinese' => 'HanSimplified',
      _ => fixtureScript,
    };
    final packId = recognizerRoutes[catalogScript];
    if (packId == null) {
      throw StateError('Fixture script has no catalog recognition route');
    }
    return packId;
  }
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
