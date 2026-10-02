import 'dart:async';
import 'dart:convert';
import 'dart:ffi';
import 'dart:io';
import 'dart:isolate';
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
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_provider.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_form_fields.dart';

final class _DarwinDlInfo extends Struct {
  external Pointer<Int8> imagePath;
  external Pointer<Void> imageBase;
  external Pointer<Int8> symbolName;
  external Pointer<Void> symbolAddress;
}

final class _RecordingReceiptOcrProvider implements ReceiptOcrProvider {
  _RecordingReceiptOcrProvider(this.delegate);

  final ReceiptOcrProvider delegate;
  ReceiptOcrResult? lastResult;

  @override
  Future<ReceiptOcrResult> extractReceipt(ReceiptOcrRequest request) async {
    final result = await delegate.extractReceipt(request);
    lastResult = result;
    return result;
  }
}

String? _inAppNetworkInterposerPath() {
  final executable = Platform.resolvedExecutable;
  final separator = executable.lastIndexOf('/');
  if (separator < 1) return null;
  final expected =
      '${executable.substring(0, separator)}/Frameworks/libSettleoraOcrNetworkDeny.dylib';
  return FileSystemEntity.typeSync(expected, followLinks: false) ==
          FileSystemEntityType.file
      ? expected
      : null;
}

String? _boundedNativeString(Pointer<Int8> pointer) {
  if (pointer.address == 0) return null;
  final bytes = <int>[];
  final unsigned = pointer.cast<Uint8>();
  for (var index = 0; index < 4096; index++) {
    final byte = unsigned[index];
    if (byte == 0) return utf8.decode(bytes);
    bytes.add(byte);
  }
  return null;
}

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  const fixtures = _NativeAcceptanceFixtures();
  const provider = PaddleReceiptOcrProvider();
  const artifactProcessor = ReceiptImageArtifactProcessor();
  var networkIsolated = false;

  test('bounded diagnostic matches whole item and amount tokens', () {
    expect(_containsAmountToken('Item USD 12.00', '2.00'), isFalse);
    expect(_containsAmountToken('Item USD 20.0', '2.00'), isFalse);
    expect(_containsAmountToken('Item USD 123.450', '1234.50'), isFalse);
    expect(_containsAmountToken('Item USD 2.00', '2.00'), isTrue);
    expect(_containsAmountToken('Item USD 2,00', '2.00'), isTrue);
    expect(_containsAmountToken('Item USD -2.00', '2.00'), isFalse);
    expect(_containsAmountToken('Item USD -2.00', '-2.00'), isTrue);
    expect(_containsAmountToken('Item -\$2.00', '2.00'), isFalse);
    expect(_containsAmountToken('Item -\$2.00', '-2.00'), isTrue);
    expect(_containsAmountToken('Item USD 1,234.50', '1234.50'), isTrue);
    expect(_containsAmountToken("Item USD 1'234.50", '234.50'), isFalse);
    expect(_containsAmountToken("Item USD 1'234.50", '1234.50'), isTrue);
    expect(_containsAmountToken('Total 1.469,13', '1469.13'), isTrue);
    expect(_containsAmountToken('Total 1.469,13', '469.13'), isFalse);
    expect(_containsAmountToken('Subtotal 1.234,56', '1234.56'), isTrue);
    expect(_containsIsoDateToken('Dated 2025/04/17', '2025-04-17'), isTrue);
    expect(_containsIsoDateToken('Dated 2025/04/170', '2025-04-17'), isFalse);
    expect(_containsIsoDateToken('Dated Apr 17, 2025', '2025-04-17'), isTrue);
    expect(_containsIsoDateToken('Dated Apr 17, 2025', '2025-04-07'), isFalse);
    expect(
      _boundedUnretainedRowShape('Item 1,234.00 trailing'),
      'trailingText',
    );
    expect(_boundedUnretainedRowShape('Item 123.00,'), 'trailingSymbol');
    expect(_boundedUnretainedRowShape('Item123.00'), 'joinedAmount');
    expect(_boundedUnretainedRowShape('Item 2 x 123.00'), 'multipleAmounts');
    expect(_boundedUnretainedRowShape('Item 123.00'), 'other');
    expect(_boundedUnretainedRowShape('Item ١٢٣.٠٠'), 'other');
    expect(_boundedUnretainedRowShape('Item ๑๒๓.๐๐'), 'other');
    final firstRow = _recognitionWordTokens('Fresh');
    final secondRow = _recognitionWordTokens('Bread');
    final expected = _recognitionWordTokens('Fresh Bread');
    expect(_containsWordSequence(firstRow, expected), isFalse);
    expect(_containsWordSequence(secondRow, expected), isFalse);
    expect(
      _containsWordSequence([...firstRow, ...secondRow], expected),
      isTrue,
    );
  });

  testWidgets('native acceptance runner has no external network', (
    WidgetTester tester,
  ) async {
    final failure = _BoundedFailureStage('network_environment');
    await failure.run(() async {
      if (Platform.isIOS) {
        expect(
          const String.fromEnvironment('SETTLEORA_OCR_NETWORK_ISOLATION'),
          'socket_interpose_v1',
          reason: 'The iOS runner must identify the isolated test invocation.',
        );
        var interposerLoaded = false;
        try {
          failure.set('network_interposer_file');
          final interposerPath = _inAppNetworkInterposerPath();
          expect(
            interposerPath,
            isNotNull,
            reason: 'The iOS interposer must be a regular in-app file.',
          );
          failure.set('network_interposer_process');
          final process = DynamicLibrary.process();
          failure.set('network_interposer_malloc');
          final allocate = process
              .lookupFunction<
                Pointer<Void> Function(IntPtr),
                Pointer<Void> Function(int)
              >('malloc');
          failure.set('network_interposer_free');
          final release = process
              .lookupFunction<
                Void Function(Pointer<Void>),
                void Function(Pointer<Void>)
              >('free');
          failure.set('network_interposer_dladdr');
          final imageForSymbol = process
              .lookupFunction<
                Int32 Function(Pointer<Void>, Pointer<_DarwinDlInfo>),
                int Function(Pointer<Void>, Pointer<_DarwinDlInfo>)
              >('dladdr');
          failure.set('network_interposer_dyld_count_lookup');
          final imageCount = process
              .lookupFunction<Uint32 Function(), int Function()>(
                '_dyld_image_count',
              );
          failure.set('network_interposer_dyld_name_lookup');
          final imageName = process
              .lookupFunction<
                Pointer<Int8> Function(Uint32),
                Pointer<Int8> Function(int)
              >('_dyld_get_image_name');
          failure.set('network_interposer_dyld_count');
          final beforeCount = imageCount();
          expect(beforeCount, inInclusiveRange(1, 4096));
          failure.set('network_interposer_path');
          final expectedImage = File(
            interposerPath!,
          ).resolveSymbolicLinksSync();
          var loadedImageCount = 0;
          for (var index = 0; index < beforeCount; index++) {
            final candidate = _boundedNativeString(imageName(index));
            if (candidate == null ||
                !candidate.endsWith('/libSettleoraOcrNetworkDeny.dylib')) {
              continue;
            }
            expect(
              File(candidate).resolveSymbolicLinksSync(),
              expectedImage,
              reason: 'No alternate interposer image may be loaded.',
            );
            loadedImageCount++;
          }
          failure.set('network_interposer_loaded_image');
          if (loadedImageCount != 1) {
            const injectedPath =
                '@executable_path/Frameworks/libSettleoraOcrNetworkDeny.dylib';
            final launchHasInterposer =
                Platform.environment['DYLD_INSERT_LIBRARIES']
                    ?.split(':')
                    .contains(injectedPath) ==
                true;
            final constructorMarked =
                Platform
                    .environment['SETTLEORA_OCR_NETWORK_INTERPOSER_LOADED'] ==
                '1';
            failure.set(
              !launchHasInterposer
                  ? 'network_interposer_launch_environment'
                  : !constructorMarked
                  ? 'network_interposer_dyld_injection'
                  : 'network_interposer_loaded_image',
            );
          }
          expect(
            loadedImageCount,
            1,
            reason: 'The exact in-app interposer must already be loaded.',
          );
          // Look up only among images that were already globally loaded by
          // dyld. dladdr below proves the symbol came from the one in-app image.
          failure.set('network_interposer_symbol');
          final symbol = process.lookup<NativeFunction<Int32 Function()>>(
            'settleora_network_interposer_loaded',
          );
          expect(
            imageCount(),
            beforeCount,
            reason: 'Looking up the interposer symbol must not load an image.',
          );
          failure.set('network_interposer_image');
          final imageInfo = allocate(
            sizeOf<_DarwinDlInfo>(),
          ).cast<_DarwinDlInfo>();
          expect(imageInfo.address, isNot(0));
          try {
            expect(imageForSymbol(symbol.cast<Void>(), imageInfo), isNot(0));
            final observed = _boundedNativeString(imageInfo.ref.imagePath);
            expect(observed, isNotNull);
            expect(
              File(observed!).resolveSymbolicLinksSync(),
              expectedImage,
              reason: 'The loaded symbol must come from the in-app dylib.',
            );
          } finally {
            release(imageInfo.cast<Void>());
          }
          failure.set('network_interposer_constructor');
          interposerLoaded = symbol.asFunction<int Function()>()() == 1;
        } catch (_) {
          // The bounded failure stage below is the only emitted diagnostic.
        }
        expect(
          interposerLoaded,
          isTrue,
          reason:
              'The iOS network interposer constructor must positively attest loading.',
        );
      }
      failure.set('network_probe');
      Socket? socket;
      var numericAddressDenied = false;
      var numericOutcome = 'not_run';
      try {
        socket = await Socket.connect(
          InternetAddress('1.1.1.1'),
          443,
          timeout: const Duration(seconds: 3),
        );
        numericOutcome = 'connected';
      } on SocketException catch (error) {
        numericAddressDenied = true;
        numericOutcome = error.osError?.errorCode == (Platform.isIOS ? 51 : 101)
            ? 'denied_expected'
            : 'denied_other';
        failure.set('network_denial_contract');
        expect(
          error.osError?.errorCode,
          Platform.isIOS ? 51 : 101,
          reason: Platform.isIOS
              ? 'The iOS interposer must deny with Darwin ENETUNREACH.'
              : 'The isolated Android emulator must deny with Linux ENETUNREACH.',
        );
      } on TimeoutException {
        numericOutcome = 'timeout';
        expect(
          Platform.isIOS,
          isFalse,
          reason: 'An iOS timeout does not prove the interposer denied access.',
        );
      }
      await socket?.close();
      failure.set('loopback_round_trip_probe');
      final loopbackPassed = await _proveLoopbackRoundTrip();
      expect(
        loopbackPassed,
        isTrue,
        reason: 'Native OCR acceptance isolation must preserve loopback.',
      );
      failure.set('hostname_resolution_probe');
      var hostnameResolutionDenied = false;
      var hostnameOutcome = 'resolved';
      try {
        final addresses = await InternetAddress.lookup('example.com');
        hostnameOutcome = addresses.isEmpty ? 'empty_result' : 'resolved';
      } on SocketException {
        hostnameResolutionDenied = true;
        hostnameOutcome = 'denied';
      }
      failure.set('network_isolation');
      failure.probeOutcomes = {
        'numeric': numericOutcome,
        'loopback': loopbackPassed ? 'passed' : 'failed',
        'hostname': hostnameOutcome,
      };
      networkIsolated =
          socket == null && numericAddressDenied && hostnameResolutionDenied;
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
    final failure = _BoundedFailureStage('corpus_manifest_load');
    await failure.run(() async {
      final manifest =
          jsonDecode(utf8.decode(await fixtures.load('manifest.json')))
              as Map<String, Object?>;
      failure.set('corpus_manifest_contract');
      expect(manifest['schema_version'], 2);
      final entries = (manifest['fixtures']! as List<Object?>)
          .cast<Map<String, Object?>>();
      expect(entries, hasLength(101));
      failure.set('corpus_catalog_load');
      final modelCatalog = _NativeModelCatalogEvidence.fromJson(
        jsonDecode(utf8.decode(await fixtures.loadModelCatalog()))
            as Map<String, Object?>,
      );
      final mismatches = <_BoundedMismatch>[];
      final recognitionCoverage = <Map<String, Object>>[];
      final fixtureDurationsMs = <int>[];
      final nativeDurationsMs = <int>[];
      final scriptResults = <String, _ScriptResult>{};
      final rssSampler = await _ProcessRssSampler.start();
      int? nativeColdLoadTimeMs;
      String? runtime;
      int? peakRssBytes;
      try {
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
          final coverageIndex = recognitionCoverage.length;
          recognitionCoverage.add(
            _boundedRecognitionCoverage(
              fixtureId,
              const ReceiptOcrResult.failed(''),
              expected,
            ),
          );
          final fixtureMismatches = <_BoundedMismatch>[];
          if (expected.keys
              .toSet()
              .difference(_supportedExpectedKeys)
              .isNotEmpty) {
            fixtureMismatches.add(
              _BoundedMismatch(fixtureId, 'manifest_shape'),
            );
            mismatches.addAll(fixtureMismatches);
            continue;
          }
          final currencyResolution =
              entry['expected_currency_resolution'] as Map<String, Object?>?;
          final fixtureBytes = await fixtures.load(entry['file']! as String);
          final stopwatch = Stopwatch()..start();
          try {
            failure.set('corpus_normalization', fixtureId: fixtureId);
            ReceiptImageArtifactResult? artifact;
            try {
              artifact = artifactProcessor.process(
                ReceiptImageArtifactRequest(
                  sourceType: ReceiptImageSourceKind.importedImage,
                  sourceContentType: 'image/jpeg',
                  sourceBytes: fixtureBytes,
                  sourceExtension: 'jpeg',
                  sourceLabel: fixtureId,
                ),
              );
            } catch (_) {
              fixtureMismatches.add(
                _BoundedMismatch(fixtureId, 'normalization'),
              );
            }
            if (artifact == null ||
                !artifact.accepted ||
                !artifact.normalizedJpegProduced) {
              if (fixtureMismatches.isEmpty) {
                fixtureMismatches.add(
                  _BoundedMismatch(fixtureId, 'normalization'),
                );
              }
            } else {
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
                // Sideways native text points use the upright document frame.
                // The immutable 90-degree corpus variant stores landscape bytes.
                final sidewaysCorpusVariant =
                    entry['image_variant'] == 'rotate 90 degrees';
                fixtureMismatches.addAll(
                  _completePreviewMismatches(
                    fixtureId,
                    result,
                    expected,
                    script: script,
                    modelCatalog: modelCatalog,
                    currencyResolution: currencyResolution,
                    imageWidth: sidewaysCorpusVariant
                        ? artifact.height!
                        : artifact.width!,
                    imageHeight: sidewaysCorpusVariant
                        ? artifact.width!
                        : artifact.height!,
                  ),
                );
                recognitionCoverage[coverageIndex] =
                    _boundedRecognitionCoverage(fixtureId, result, expected);
              } catch (_) {
                // Preserve only a bounded category. Native exception details can
                // contain OCR text, local paths, or provider diagnostics and must
                // never enter retained acceptance evidence.
                fixtureMismatches.add(
                  _BoundedMismatch(fixtureId, 'provider_exception'),
                );
              }
            }
          } finally {
            stopwatch.stop();
            fixtureDurationsMs.add(stopwatch.elapsedMilliseconds);
          }
          if (fixtureMismatches.isEmpty) scriptResult.passed += 1;
          mismatches.addAll(fixtureMismatches);
        }
      } finally {
        peakRssBytes = await rssSampler.stop();
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
        'recognitionCoverage': recognitionCoverage,
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
    final failure = _BoundedFailureStage('rotation_manifest_load');
    await failure.run(() async {
      final manifest =
          jsonDecode(utf8.decode(await fixtures.load('manifest.json')))
              as Map<String, Object?>;
      failure.set('rotation_fixture_select');
      final entry = (manifest['fixtures']! as List<Object?>)
          .cast<Map<String, Object?>>()
          .singleWhere(
            (fixture) => fixture['id'] == 'existing_12_freshmart_grocery_en_US',
          );
      failure.set('rotation_catalog_load');
      final modelCatalog = _NativeModelCatalogEvidence.fromJson(
        jsonDecode(utf8.decode(await fixtures.loadModelCatalog()))
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
        // Native sideways orientation maps block points into the upright
        // document frame, whose axes are swapped from this 270-degree image.
        imageWidth: artifact.height!,
        imageHeight: artifact.width!,
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
    final failure = _BoundedFailureStage('ui_manifest_load');
    await failure.run(() async {
      final manifest =
          jsonDecode(utf8.decode(await fixtures.load('manifest.json')))
              as Map<String, Object?>;
      failure.set('ui_fixture_select');
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
      final recordingProvider = _RecordingReceiptOcrProvider(provider);

      failure.set(
        'ui_render',
        fixtureId: 'existing_12_freshmart_grocery_en_US',
      );
      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraPersonalBillCreateScreen(
            repository: _NoopBillRepository(),
            attachmentFileInput: input,
            receiptOcrProvider: recordingProvider,
            defaultCurrency: entry['fallback_currency'] as String?,
            scanReceiptOnStart: true,
          ),
        ),
      );

      final previewPanel = find.byKey(
        const Key('personal-bill-ocr-preview-panel'),
      );
      final applyControl = find.byKey(const Key('personal-bill-ocr-apply'));
      final statusControl = find.byKey(const Key('personal-bill-ocr-status'));
      for (
        var attempt = 0;
        attempt < 3000 && applyControl.evaluate().isEmpty;
        attempt += 1
      ) {
        await Future<void>.delayed(const Duration(milliseconds: 100));
        await tester.pump();
        if (statusControl.evaluate().isNotEmpty &&
            find
                .descendant(of: statusControl, matching: find.text('Reading'))
                .evaluate()
                .isEmpty) {
          break;
        }
      }
      expect(previewPanel, findsOneWidget);
      expect(applyControl, findsOneWidget);
      failure.set(
        'ui_provider_status',
        fixtureId: 'existing_12_freshmart_grocery_en_US',
      );
      expect(recordingProvider.lastResult?.status, ReceiptOcrStatus.extracted);
      failure.set(
        'ui_provider_preview',
        fixtureId: 'existing_12_freshmart_grocery_en_US',
      );
      final actualPreview = recordingProvider.lastResult?.preview;
      expect(actualPreview, isNotNull);
      failure.set(
        'ui_provider_fields',
        fixtureId: 'existing_12_freshmart_grocery_en_US',
      );
      expect(
        [
          actualPreview!.merchant,
          actualPreview.receiptDate,
          actualPreview.total,
        ].any((value) => value != null && value.isNotEmpty),
        isTrue,
      );
      failure.set(
        'ui_merchant_binding',
        fixtureId: 'existing_12_freshmart_grocery_en_US',
      );
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const Key('personal-bill-ocr-edit-merchant')),
            )
            .controller
            ?.text,
        actualPreview.merchant ?? '',
      );
      failure.set(
        'ui_date_binding',
        fixtureId: 'existing_12_freshmart_grocery_en_US',
      );
      expect(
        tester
            .widget<DateField>(
              find.byKey(const Key('personal-bill-ocr-edit-date')),
            )
            .controller
            .text,
        actualPreview.receiptDate ?? '',
      );
      failure.set(
        'ui_total_binding',
        fixtureId: 'existing_12_freshmart_grocery_en_US',
      );
      final totalFinder = find.descendant(
        of: previewPanel,
        matching: find.textContaining('Grand total suggested:'),
      );
      if (actualPreview.total == null || actualPreview.total!.isEmpty) {
        expect(totalFinder, findsNothing);
      } else {
        final renderedTotal = tester.widget<Text>(totalFinder).data!;
        const totalPrefix = 'Grand total suggested: ';
        const totalSuffix = ' (review only)';
        expect(renderedTotal.startsWith(totalPrefix), isTrue);
        expect(renderedTotal.endsWith(totalSuffix), isTrue);
        final amountAndCurrency = renderedTotal.substring(
          totalPrefix.length,
          renderedTotal.length - totalSuffix.length,
        );
        final totalParts = amountAndCurrency.split(' ');
        final previewCurrency = actualPreview.currency?.trim().toUpperCase();
        if (previewCurrency != null && previewCurrency.isNotEmpty) {
          expect(totalParts.length, 2);
          expect(totalParts.first, matches(RegExp(r'^[A-Z]{3}$')));
          expect(totalParts.first, previewCurrency);
        } else {
          expect(totalParts.length, 1);
        }
        expect(totalParts.last, actualPreview.total);
      }
      failure.set(
        'ui_apply_handoff',
        fixtureId: 'existing_12_freshmart_grocery_en_US',
      );
      failure.set(
        'ui_apply_selection',
        fixtureId: 'existing_12_freshmart_grocery_en_US',
      );
      void requireApplyOption(String section, bool populated) {
        expect(
          find.byKey(Key('personal-bill-ocr-apply-$section')),
          populated ? findsOneWidget : findsNothing,
        );
      }

      requireApplyOption(
        'merchant',
        actualPreview.merchant?.trim().isNotEmpty == true,
      );
      requireApplyOption(
        'date',
        actualPreview.receiptDate?.trim().isNotEmpty == true,
      );
      requireApplyOption(
        'currency',
        actualPreview.currency?.trim().isNotEmpty == true,
      );
      requireApplyOption('items', actualPreview.items.isNotEmpty);
      bool selectedForApply(String section) {
        final option = find.byKey(Key('personal-bill-ocr-apply-$section'));
        return option.evaluate().isNotEmpty &&
            tester.widget<CheckboxListTile>(option).value == true;
      }

      final applyMerchant = selectedForApply('merchant');
      final applyDate = selectedForApply('date');
      final applyCurrency = selectedForApply('currency');
      final applyItems = selectedForApply('items');
      expect(applyMerchant || applyDate || applyCurrency || applyItems, isTrue);
      expect(tester.widget<AppButton>(applyControl).onPressed, isNotNull);
      failure.set(
        'ui_apply_probe',
        fixtureId: 'existing_12_freshmart_grocery_en_US',
      );
      final merchantField = find.byKey(
        const Key('personal-bill-merchant-name'),
      );
      final dateField = find.byKey(const Key('personal-bill-date-picker'));
      final currencyField = find.descendant(
        of: find.byKey(const Key('personal-bill-currency')),
        matching: find.byType(CurrencySelector),
      );
      if (applyMerchant) {
        final draft = tester.widget<TextFormField>(merchantField).controller!;
        draft.text = actualPreview.merchant?.trim() == '__ocr_apply_probe__'
            ? '__ocr_apply_probe_alt__'
            : '__ocr_apply_probe__';
      }
      if (applyItems) {
        final firstItem = actualPreview.items.first;
        final quantityText = firstItem.quantity?.trim() ?? '';
        final wholeMatch = RegExp(r'^(\d+)(?:\.0+)?$').firstMatch(quantityText);
        final wholeQuantity = wholeMatch == null
            ? null
            : int.tryParse(wholeMatch.group(1)!);
        final fractionalQuantity =
            quantityText.isNotEmpty &&
            (wholeQuantity == null || wholeQuantity <= 0);
        final appliedQuantity = (fractionalQuantity ? 1 : (wholeQuantity ?? 1))
            .toString();
        final appliedUnitAmount = fractionalQuantity
            ? ''
            : (firstItem.unitPrice ?? '');
        final draft = tester
            .widget<TextFormField>(
              find.byKey(const ValueKey('personal-bill-item-name-0')),
            )
            .controller!;
        draft.text =
            actualPreview.items.first.description.trim() ==
                '__ocr_apply_probe__'
            ? '__ocr_apply_probe_alt__'
            : '__ocr_apply_probe__';
        final quantity = tester
            .widget<TextFormField>(
              find.byKey(const ValueKey('personal-bill-item-quantity-0')),
            )
            .controller!;
        quantity.text = appliedQuantity == '7' ? '8' : '7';
        final unitAmount = tester
            .widget<TextFormField>(
              find.byKey(const ValueKey('personal-bill-item-unit-amount-0')),
            )
            .controller!;
        unitAmount.text = appliedUnitAmount == '9876.54'
            ? '9876.55'
            : '9876.54';
        final itemCurrencyField = find.descendant(
          of: find.byKey(const ValueKey('personal-bill-item-currency-0')),
          matching: find.byType(CurrencySelector),
        );
        final appliedItemCurrency =
            (firstItem.currency?.trim().isNotEmpty == true
                    ? firstItem.currency
                    : actualPreview.currency)
                ?.trim()
                .toUpperCase();
        tester
            .widget<CurrencySelector>(itemCurrencyField)
            .onChanged(appliedItemCurrency == 'USD' ? 'EUR' : 'USD');
      }
      if (applyDate) {
        final draft = tester.widget<DateField>(dateField).controller;
        draft.text = actualPreview.receiptDate?.trim() == '2001-01-01'
            ? '2002-01-01'
            : '2001-01-01';
      }
      if (applyCurrency) {
        final currency = actualPreview.currency?.trim().toUpperCase();
        tester
            .widget<CurrencySelector>(currencyField)
            .onChanged(currency == 'USD' ? 'EUR' : 'USD');
      }
      await tester.pumpAndSettle();
      if (applyMerchant) {
        expect(
          tester.widget<TextFormField>(merchantField).controller?.text,
          isNot(actualPreview.merchant?.trim()),
        );
      }
      if (applyDate) {
        expect(
          tester.widget<DateField>(dateField).controller.text,
          isNot(actualPreview.receiptDate?.trim()),
        );
      }
      if (applyCurrency) {
        expect(
          tester.widget<CurrencySelector>(currencyField).value,
          isNot(actualPreview.currency?.trim().toUpperCase()),
        );
      }
      if (applyItems) {
        final firstItem = actualPreview.items.first;
        final quantityText = firstItem.quantity?.trim() ?? '';
        final wholeMatch = RegExp(r'^(\d+)(?:\.0+)?$').firstMatch(quantityText);
        final wholeQuantity = wholeMatch == null
            ? null
            : int.tryParse(wholeMatch.group(1)!);
        final fractionalQuantity =
            quantityText.isNotEmpty &&
            (wholeQuantity == null || wholeQuantity <= 0);
        final appliedQuantity = (fractionalQuantity ? 1 : (wholeQuantity ?? 1))
            .toString();
        final appliedUnitAmount = fractionalQuantity
            ? ''
            : (firstItem.unitPrice ?? '');
        expect(
          tester
              .widget<TextFormField>(
                find.byKey(const ValueKey('personal-bill-item-name-0')),
              )
              .controller
              ?.text,
          isNot(actualPreview.items.first.description.trim()),
        );
        expect(
          tester
              .widget<TextFormField>(
                find.byKey(const ValueKey('personal-bill-item-quantity-0')),
              )
              .controller
              ?.text,
          isNot(appliedQuantity),
        );
        expect(
          tester
              .widget<TextFormField>(
                find.byKey(const ValueKey('personal-bill-item-unit-amount-0')),
              )
              .controller
              ?.text,
          isNot(appliedUnitAmount),
        );
        final itemCurrencyField = find.descendant(
          of: find.byKey(const ValueKey('personal-bill-item-currency-0')),
          matching: find.byType(CurrencySelector),
        );
        final appliedItemCurrency =
            (actualPreview.items.first.currency?.trim().isNotEmpty == true
                    ? actualPreview.items.first.currency
                    : actualPreview.currency)
                ?.trim()
                .toUpperCase();
        expect(
          tester.widget<CurrencySelector>(itemCurrencyField).value,
          isNot(appliedItemCurrency),
        );
      }
      failure.set(
        'ui_apply_selection_retained',
        fixtureId: 'existing_12_freshmart_grocery_en_US',
      );
      expect(selectedForApply('merchant'), applyMerchant);
      expect(selectedForApply('date'), applyDate);
      expect(selectedForApply('currency'), applyCurrency);
      expect(selectedForApply('items'), applyItems);
      expect(tester.widget<AppButton>(applyControl).onPressed, isNotNull);
      failure.set(
        'ui_apply_tap',
        fixtureId: 'existing_12_freshmart_grocery_en_US',
      );
      await tester.ensureVisible(applyControl);
      await tester.tap(applyControl);
      await tester.pumpAndSettle();
      if (applyMerchant) {
        failure.set(
          'ui_apply_merchant',
          fixtureId: 'existing_12_freshmart_grocery_en_US',
        );
        final appliedMerchant = tester
            .widget<TextFormField>(merchantField)
            .controller
            ?.text;
        expect(appliedMerchant, actualPreview.merchant?.trim());
      }
      if (applyDate) {
        failure.set(
          'ui_apply_date',
          fixtureId: 'existing_12_freshmart_grocery_en_US',
        );
        final appliedDate = tester.widget<DateField>(dateField).controller.text;
        expect(appliedDate, actualPreview.receiptDate?.trim());
      }
      if (applyCurrency) {
        failure.set(
          'ui_apply_currency',
          fixtureId: 'existing_12_freshmart_grocery_en_US',
        );
        final appliedCurrency = tester
            .widget<CurrencySelector>(currencyField)
            .value;
        expect(appliedCurrency, actualPreview.currency?.trim().toUpperCase());
      }
      if (applyItems) {
        failure.set(
          'ui_apply_items',
          fixtureId: 'existing_12_freshmart_grocery_en_US',
        );
        expect(actualPreview.items, isNotEmpty);
        for (var index = 0; index < actualPreview.items.length; index++) {
          final candidate = actualPreview.items[index];
          expect(
            tester
                .widget<TextFormField>(
                  find.byKey(ValueKey('personal-bill-item-name-$index')),
                )
                .controller
                ?.text,
            candidate.description.trim(),
          );
          expect(
            tester
                .widget<TextFormField>(
                  find.byKey(ValueKey('personal-bill-item-amount-$index')),
                )
                .controller
                ?.text,
            candidate.lineTotal ?? '',
          );
          final quantityText = candidate.quantity?.trim() ?? '';
          final wholeMatch = RegExp(
            r'^(\d+)(?:\.0+)?$',
          ).firstMatch(quantityText);
          final wholeQuantity = wholeMatch == null
              ? null
              : int.tryParse(wholeMatch.group(1)!);
          final fractionalQuantity =
              quantityText.isNotEmpty &&
              (wholeQuantity == null || wholeQuantity <= 0);
          expect(
            tester
                .widget<TextFormField>(
                  find.byKey(ValueKey('personal-bill-item-quantity-$index')),
                )
                .controller
                ?.text,
            (fractionalQuantity ? 1 : (wholeQuantity ?? 1)).toString(),
          );
          expect(
            tester
                .widget<TextFormField>(
                  find.byKey(ValueKey('personal-bill-item-unit-amount-$index')),
                )
                .controller
                ?.text,
            fractionalQuantity ? '' : (candidate.unitPrice ?? ''),
          );
          expect(
            tester
                .widget<CurrencySelector>(
                  find.descendant(
                    of: find.byKey(
                      ValueKey('personal-bill-item-currency-$index'),
                    ),
                    matching: find.byType(CurrencySelector),
                  ),
                )
                .value,
            (entry['expected']! as Map<String, Object?>)['currency'],
          );
        }
        expect(
          find.byKey(
            ValueKey('personal-bill-item-name-${actualPreview.items.length}'),
          ),
          findsNothing,
        );
      }
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

class _ProcessRssSampler {
  _ProcessRssSampler._(
    this._isolate,
    this._controlPort,
    this._eventPort,
    this._result,
  );

  final Isolate _isolate;
  final SendPort _controlPort;
  final ReceivePort _eventPort;
  final Future<Object?> _result;
  Future<int>? _stopFuture;

  static Future<_ProcessRssSampler> start() async {
    final eventPort = ReceivePort();
    final ready = Completer<Object?>();
    final result = Completer<Object?>();
    eventPort.listen((event) {
      if (event is SendPort && !ready.isCompleted) {
        ready.complete(event);
      } else if (event is int && !result.isCompleted) {
        result.complete(event);
      } else {
        if (!ready.isCompleted) ready.complete(null);
        if (!result.isCompleted) result.complete(null);
      }
    });
    Isolate? isolate;
    try {
      isolate = await Isolate.spawn(
        _sampleProcessRss,
        eventPort.sendPort,
        onError: eventPort.sendPort,
        onExit: eventPort.sendPort,
      );
      final controlPort = await ready.future.timeout(
        const Duration(seconds: 5),
      );
      if (controlPort is! SendPort) throw StateError('rss_sampler_unavailable');
      return _ProcessRssSampler._(
        isolate,
        controlPort,
        eventPort,
        result.future,
      );
    } catch (_) {
      isolate?.kill(priority: Isolate.immediate);
      eventPort.close();
      rethrow;
    }
  }

  Future<int> stop() => _stopFuture ??= _stop();

  Future<int> _stop() async {
    try {
      _controlPort.send(null);
      final peakRssBytes = await _result.timeout(const Duration(seconds: 5));
      if (peakRssBytes is! int || peakRssBytes <= 0) {
        throw StateError('rss_sampler_unavailable');
      }
      return peakRssBytes;
    } finally {
      _isolate.kill(priority: Isolate.immediate);
      _eventPort.close();
    }
  }
}

Future<void> _sampleProcessRss(SendPort events) async {
  final controlPort = ReceivePort();
  var peakRssBytes = ProcessInfo.currentRss;
  events.send(controlPort.sendPort);
  final timer = Timer.periodic(const Duration(milliseconds: 10), (_) {
    final currentRssBytes = ProcessInfo.currentRss;
    if (currentRssBytes > peakRssBytes) peakRssBytes = currentRssBytes;
  });
  await controlPort.first;
  timer.cancel();
  final finalRssBytes = ProcessInfo.currentRss;
  if (finalRssBytes > peakRssBytes) peakRssBytes = finalRssBytes;
  events.send(peakRssBytes);
  controlPort.close();
}

Future<bool> _proveLoopbackRoundTrip() async {
  const timeout = Duration(seconds: 3);
  ServerSocket? server;
  Socket? client;
  Socket? peer;
  Future<ServerSocket>? bindFuture;
  var exchangeComplete = false;
  var cleanupComplete = true;
  try {
    bindFuture = ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
    server = await bindFuture.timeout(timeout);
    client = await Socket.connect(
      InternetAddress.loopbackIPv4,
      server.port,
      timeout: timeout,
    );
    peer = await server.first.timeout(timeout);
    client.add(const <int>[0x53]);
    await client.flush().timeout(timeout);
    final request = await peer.first.timeout(timeout);
    peer.add(const <int>[0x4f]);
    await peer.flush().timeout(timeout);
    final response = await client.first.timeout(timeout);
    exchangeComplete =
        request.length == 1 &&
        request.single == 0x53 &&
        response.length == 1 &&
        response.single == 0x4f;
  } on Object {
    exchangeComplete = false;
  } finally {
    try {
      client?.destroy();
    } on Object {
      cleanupComplete = false;
    }
    try {
      peer?.destroy();
    } on Object {
      cleanupComplete = false;
    }
    if (server == null) {
      final lateBind = bindFuture;
      if (lateBind != null) {
        unawaited(
          lateBind.then<void>((lateServer) async {
            try {
              await lateServer.close().timeout(timeout);
            } on Object {
              // The canary has already failed. Never expose late cleanup
              // diagnostics through retained acceptance output.
            }
          }, onError: (Object _, StackTrace _) {}),
        );
      }
    } else {
      try {
        await server.close().timeout(timeout);
      } on Object {
        cleanupComplete = false;
      }
    }
  }
  return exchangeComplete && cleanupComplete;
}

class _BoundedFailureStage {
  _BoundedFailureStage(this.stage);

  String stage;
  String? fixtureId;
  Map<String, String>? probeOutcomes;

  void set(String value, {String? fixtureId}) {
    stage = value;
    this.fixtureId = fixtureId;
  }

  Future<void> run(Future<void> Function() body) async {
    try {
      await body();
    } catch (_) {
      // Retain only a bounded stage, fixture identifier, and allowlisted
      // isolation outcomes. Exception text can contain receipt data or paths.
      debugPrint(
        'SETTLEORA_OCR_DIAGNOSTIC=${jsonEncode({'schemaVersion': 1, 'platform': Platform.operatingSystem, 'stage': stage, 'fixtureId': fixtureId, if (stage == 'network_isolation' && probeOutcomes != null) 'probes': probeOutcomes})}',
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
  required int imageWidth,
  required int imageHeight,
}) {
  final mismatches = <_BoundedMismatch>[];
  final preview = result.preview;
  if (result.status != ReceiptOcrStatus.extracted || preview == null) {
    return [
      _BoundedMismatch(
        fixtureId,
        result.failureCategory?.boundedEvidenceField ?? 'provider_status',
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
    if (actualItem.quantity != expectedItem.quantity) {
      mismatches.add(_BoundedMismatch(fixtureId, 'items[$index].quantity'));
    }
    if (actualItem.unitPrice != expectedItem.unitPrice) {
      mismatches.add(_BoundedMismatch(fixtureId, 'items[$index].unitPrice'));
    }
    if (actualItem.currency != expected['currency']) {
      mismatches.add(_BoundedMismatch(fixtureId, 'items[$index].currency'));
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
  final expectedHints = expectedReviewCondition == null
      ? const <String>[]
      : expectedReviewCondition ==
            'printed total differs from visible charge-line arithmetic'
      ? const <String>[
          'OCR item total differs from detected grand total. Review the receipt before applying.',
        ]
      : null;
  final actualHints = preview.reviewHints;
  if (expectedHints == null ||
      actualHints.length != expectedHints.length ||
      !actualHints.asMap().entries.every(
        (entry) => entry.value == expectedHints[entry.key],
      )) {
    mismatches.add(_BoundedMismatch(fixtureId, 'review_condition'));
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
      if (!isValidNativeOcrBlockGeometry(
        block,
        imageWidth: imageWidth,
        imageHeight: imageHeight,
      )) {
        mismatches.add(_BoundedMismatch(fixtureId, 'block_geometry'));
        break;
      }
    }
    final orders = preview.blocks.map((block) => block.order).toSet();
    if (orders.length != preview.blocks.length ||
        !orders.containsAll(
          List<int>.generate(preview.blocks.length, (index) => index),
        )) {
      mismatches.add(_BoundedMismatch(fixtureId, 'block_order'));
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

Map<String, Object> _boundedRecognitionCoverage(
  String fixtureId,
  ReceiptOcrResult result,
  Map<String, Object?> expected,
) {
  // Only bounded booleans and counts leave this process. Receipt text, block
  // geometry, expected values, and local paths remain in memory.
  final blocks = result.preview?.blocks ?? const <ReceiptOcrBlockEvidence>[];
  final rowText = <int, List<String>>{};
  final rowBlocks = <int, List<ReceiptOcrBlockEvidence>>{};
  for (final block in blocks) {
    (rowText[block.row] ??= <String>[]).add(block.text);
    (rowBlocks[block.row] ??= <ReceiptOcrBlockEvidence>[]).add(block);
  }
  final rows = rowText.values.map((parts) => parts.join(' ')).toList();
  final allText = rows.join(' ');
  final rowWordTokens = rows.map(_recognitionWordTokens).toList();
  final allWordTokens = _recognitionWordTokens(allText);
  final lineDecisions =
      result.preview?.itemLineDecisions ?? const <ReceiptOcrItemLineDecision>[];
  final itemLineDecisionCounts = {
    for (final decision in ReceiptOcrItemLineDecision.values) decision.name: 0,
  };
  for (final decision in lineDecisions) {
    itemLineDecisionCounts[decision.name] =
        itemLineDecisionCounts[decision.name]! + 1;
  }
  bool containsExpectedDescription(String value) =>
      _containsWordSequence(allWordTokens, _recognitionWordTokens(value));
  bool containsExpectedAmount(Object? value) =>
      value is String && _containsAmountToken(allText, value);

  final expectedItems = (expected['items'] as List<Object?>)
      .map((item) => _ExpectedItem.fromManifest(item, fixtureId))
      .toList(growable: false);
  final expectedDescriptionDecisionCounts = {
    for (final decision in ReceiptOcrItemLineDecision.values) decision.name: 0,
    'notInParserRows': 0,
    'ambiguousParserRows': 0,
  };
  final expectedUnretainedRowShapeCounts = {
    for (final shape in _boundedUnretainedRowShapes) shape: 0,
  };
  final expectedUnretainedPatternReasonCounts = {
    for (final reason in ReceiptOcrUnretainedPatternReason.values)
      reason.name: 0,
  };
  final expectedDescriptionFrequency = <String, int>{};
  for (final item in expectedItems) {
    final description = _foldRecognitionEvidence(item.description);
    expectedDescriptionFrequency.update(
      description,
      (count) => count + 1,
      ifAbsent: () => 1,
    );
  }
  for (final item in expectedItems) {
    final description = _foldRecognitionEvidence(item.description);
    final descriptionWords = _recognitionWordTokens(item.description);
    final matches = <int>[
      if (descriptionWords.isNotEmpty)
        for (var index = 0; index < rowWordTokens.length; index++)
          if (_containsWordSequence(rowWordTokens[index], descriptionWords))
            index,
    ];
    final decision = matches.isEmpty
        ? containsExpectedDescription(item.description)
              ? 'ambiguousParserRows'
              : 'notInParserRows'
        : matches.length != 1 || expectedDescriptionFrequency[description]! > 1
        ? 'ambiguousParserRows'
        : matches.single < lineDecisions.length
        ? lineDecisions[matches.single].name
        : 'notInParserRows';
    expectedDescriptionDecisionCounts[decision] =
        expectedDescriptionDecisionCounts[decision]! + 1;
    if (decision == ReceiptOcrItemLineDecision.unretainedPricedRow.name) {
      final shape = _boundedUnretainedRowShape(rows[matches.single]);
      expectedUnretainedRowShapeCounts[shape] =
          expectedUnretainedRowShapeCounts[shape]! + 1;
      final reason = diagnoseReceiptOcrUnretainedRow(rows[matches.single]);
      expectedUnretainedPatternReasonCounts[reason.name] =
          expectedUnretainedPatternReasonCounts[reason.name]! + 1;
    }
  }
  final selectedRowWithoutExpectedPairDecisionCounts = {
    for (final decision in ReceiptOcrItemLineDecision.values) decision.name: 0,
  };
  const selectedDecisions = {
    ReceiptOcrItemLineDecision.layoutChargeSelected,
    ReceiptOcrItemLineDecision.layoutFallbackSelected,
    ReceiptOcrItemLineDecision.quantityItemSelected,
    ReceiptOcrItemLineDecision.leadingQuantityItemSelected,
    ReceiptOcrItemLineDecision.pricedItemSelected,
  };
  for (var index = 0; index < lineDecisions.length; index++) {
    final decision = lineDecisions[index];
    if (!selectedDecisions.contains(decision) || index >= rows.length) {
      continue;
    }
    final hasExpectedPairInRow = expectedItems.any(
      (item) =>
          _containsWordSequence(
            rowWordTokens[index],
            _recognitionWordTokens(item.description),
          ) &&
          _containsAmountToken(rows[index], item.lineTotal),
    );
    if (!hasExpectedPairInRow) {
      selectedRowWithoutExpectedPairDecisionCounts[decision.name] =
          selectedRowWithoutExpectedPairDecisionCounts[decision.name]! + 1;
    }
  }
  final actualItems =
      result.preview?.items ?? const <ReceiptOcrItemCandidate>[];
  final matchedDescriptions = <int>{};
  final matchedPairs = <int>{};
  final usedDescriptions = <int>{};
  final usedPairs = <int>{};
  for (var index = 0; index < expectedItems.length; index++) {
    final item = expectedItems[index];
    final descriptionIndex = actualItems
        .asMap()
        .entries
        .where((entry) => !usedDescriptions.contains(entry.key))
        .where(
          (entry) =>
              _normalizedText(entry.value.description) ==
              _normalizedText(item.description),
        )
        .firstOrNull
        ?.key;
    if (descriptionIndex != null) {
      matchedDescriptions.add(index);
      usedDescriptions.add(descriptionIndex);
    }
    final pairIndex = actualItems
        .asMap()
        .entries
        .where((entry) => !usedPairs.contains(entry.key))
        .where(
          (entry) =>
              _normalizedText(entry.value.description) ==
                  _normalizedText(item.description) &&
              entry.value.lineTotal == item.lineTotal,
        )
        .firstOrNull
        ?.key;
    if (pairIndex != null) {
      matchedPairs.add(index);
      usedPairs.add(pairIndex);
    }
  }
  final itemOrigins =
      result.preview?.itemSelectionDecisions ??
      const <ReceiptOcrItemLineDecision>[];
  if (itemOrigins.length != actualItems.length) {
    throw StateError('Bounded item origin alignment failed');
  }
  final unmatchedDraftItemOriginCounts = {
    for (final decision in ReceiptOcrItemLineDecision.values) decision.name: 0,
  };
  for (var index = 0; index < itemOrigins.length; index++) {
    if (!usedPairs.contains(index)) {
      final name = itemOrigins[index].name;
      unmatchedDraftItemOriginCounts[name] =
          unmatchedDraftItemOriginCounts[name]! + 1;
    }
  }
  final merchantWords = expected['merchant'] is String
      ? _recognitionWordTokens(expected['merchant'] as String)
      : const <String>[];
  bool descriptionAndAmountWithinRows(_ExpectedItem item, int distance) {
    final descriptionWords = _recognitionWordTokens(item.description);
    if (descriptionWords.isEmpty || item.lineTotal.isEmpty) return false;
    for (var index = 0; index < rows.length; index++) {
      if (!_containsWordSequence(rowWordTokens[index], descriptionWords)) {
        continue;
      }
      final first = index - distance < 0 ? 0 : index - distance;
      final last = index + distance >= rows.length
          ? rows.length - 1
          : index + distance;
      for (var amountIndex = first; amountIndex <= last; amountIndex++) {
        if (_containsAmountToken(rows[amountIndex], item.lineTotal)) {
          return true;
        }
      }
    }
    return false;
  }

  bool descriptionAndAmountInCellShape(
    _ExpectedItem item, {
    required bool sameBlock,
  }) {
    final descriptionWords = _recognitionWordTokens(item.description);
    if (descriptionWords.isEmpty || item.lineTotal.isEmpty) return false;
    for (final row in rowBlocks.values) {
      if (sameBlock) {
        if (row.any(
          (block) =>
              _containsWordSequence(
                _recognitionWordTokens(block.text),
                descriptionWords,
              ) &&
              _containsAmountToken(block.text, item.lineTotal),
        )) {
          return true;
        }
      } else {
        for (var index = 0; index < row.length; index++) {
          if (!_containsAmountToken(row[index].text, item.lineTotal)) {
            continue;
          }
          final otherText = [
            for (var other = 0; other < row.length; other++)
              if (other != index) row[other].text,
          ].join(' ');
          if (_containsWordSequence(
            _recognitionWordTokens(otherText),
            descriptionWords,
          )) {
            return true;
          }
        }
      }
    }
    return false;
  }

  return {
    'fixtureId': fixtureId,
    'blockCount': blocks.length,
    'rowCount': rows.length,
    'parserLineCount': result.preview?.rawTextLineCount ?? 0,
    'merchantExactTextSeen':
        merchantWords.isNotEmpty &&
        _containsWordSequence(allWordTokens, merchantWords),
    'merchantExactTextInOneRow':
        merchantWords.isNotEmpty &&
        rowWordTokens.any((row) => _containsWordSequence(row, merchantWords)),
    'totalExactTokenSeen': containsExpectedAmount(expected['total']),
    'expectedItemCount': expectedItems.length,
    'actualItemCount': result.preview?.items.length ?? 0,
    'expectedItemDescriptionsInDraft': matchedDescriptions.length,
    'expectedItemPairsInDraft': matchedPairs.length,
    'expectedDateTokenSeen':
        expected['date'] is String &&
        _containsIsoDateToken(allText, expected['date'] as String),
    'expectedTaxTokenSeen': containsExpectedAmount(expected['tax']),
    'expectedSubtotalTokenSeen': containsExpectedAmount(expected['subtotal']),
    'reviewHintCategory': _boundedReviewHintCategory(result.preview),
    'itemLineDecisionCounts': itemLineDecisionCounts,
    'expectedDescriptionDecisionCounts': expectedDescriptionDecisionCounts,
    'expectedUnretainedRowShapeCounts': expectedUnretainedRowShapeCounts,
    'expectedUnretainedPatternReasonCounts':
        expectedUnretainedPatternReasonCounts,
    'selectedRowWithoutExpectedPairDecisionCounts':
        selectedRowWithoutExpectedPairDecisionCounts,
    'unmatchedDraftItemOriginCounts': unmatchedDraftItemOriginCounts,
    'reviewDecision':
        result.preview?.reviewHintDecision.name ??
        ReceiptOcrReviewDecision.none.name,
    'incompleteAdjustmentReasons':
        result.preview?.incompleteAdjustmentReasons
            .map((reason) => reason.name)
            .toList(growable: false) ??
        const <String>[],
    'itemDescriptionsExactTextSeen': expectedItems
        .where((item) => containsExpectedDescription(item.description))
        .length,
    'itemDescriptionsSameRowAsAmount': expectedItems
        .where((item) => descriptionAndAmountWithinRows(item, 0))
        .length,
    'itemDescriptionsSameBlockAsAmount': expectedItems
        .where((item) => descriptionAndAmountInCellShape(item, sameBlock: true))
        .length,
    'itemDescriptionsWithDistinctAmountBlock': expectedItems
        .where(
          (item) => descriptionAndAmountInCellShape(item, sameBlock: false),
        )
        .length,
    'itemDescriptionsWithinAdjacentAmountRow': expectedItems
        .where((item) => descriptionAndAmountWithinRows(item, 1))
        .length,
    'chargeTableHeaderSameRow': rows.any((row) {
      final lower = row.toLowerCase();
      return RegExp(r'\bdescription\b').hasMatch(lower) &&
          RegExp(r'\b(?:amount|total|charges?)\b').hasMatch(lower) &&
          RegExp(r'\b(?:rate|usage|therms|kwh|units?)\b').hasMatch(lower);
    }),
  };
}

String _boundedReviewHintCategory(ReceiptOcrPreview? preview) {
  final hints = preview?.reviewHints ?? const <String>[];
  if (hints.isEmpty) return 'none';
  if (hints.length != 1) return 'other';
  return switch (hints.single) {
    'OCR item total differs from detected subtotal. Review the receipt before applying.' =>
      'subtotal_mismatch',
    'Detected tax/service/tip/shipping/discount may explain why item totals differ from the grand total.' =>
      'adjustment_explanation',
    'OCR item total differs from detected grand total. Review the receipt before applying.' =>
      'grand_total_mismatch',
    _ => 'other',
  };
}

String _foldRecognitionEvidence(String value) =>
    value.toLowerCase().replaceAll(RegExp(r'[^\p{L}\p{N}]', unicode: true), '');

List<String> _recognitionWordTokens(String value) => RegExp(
  r'[\p{L}\p{N}]+',
  unicode: true,
).allMatches(value.toLowerCase()).map((match) => match.group(0)!).toList();

bool _containsWordSequence(List<String> row, List<String> expected) {
  if (expected.isEmpty || row.length < expected.length) return false;
  for (var start = 0; start <= row.length - expected.length; start++) {
    var matches = true;
    for (var offset = 0; offset < expected.length; offset++) {
      if (row[start + offset] != expected[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

const _boundedUnretainedRowShapes = <String>{
  'noParserAmountToken',
  'trailingText',
  'trailingSymbol',
  'joinedAmount',
  'multipleAmounts',
  'other',
};

String _boundedUnretainedRowShape(String row) {
  // Mirrors only the parser's bounded amount-token grammar. The output is a
  // fixed enum, never receipt text, a coordinate, or a monetary value.
  row = normalizeReceiptOcrLineForDiagnostics(row);
  final amounts = RegExp(
    r"-?(?:\d{1,3}(?:[ \u00a0]\d{3})+(?:[.,]\d{1,3})?|\d+(?:[.,'’]\d+)*)",
  ).allMatches(row).toList(growable: false);
  if (amounts.isEmpty) return 'noParserAmountToken';
  final last = amounts.last;
  final suffix = row.substring(last.end).trim();
  if (suffix.isNotEmpty) {
    return RegExp(r'\p{L}', unicode: true).hasMatch(suffix)
        ? 'trailingText'
        : 'trailingSymbol';
  }
  final prefix = row.substring(0, last.start);
  if (prefix.isNotEmpty && !RegExp(r'\s$').hasMatch(prefix)) {
    return 'joinedAmount';
  }
  if (amounts.length > 1) return 'multipleAmounts';
  return 'other';
}

bool _containsAmountToken(String text, String expected) {
  final expectedAmount = _canonicalAmountToken(expected);
  if (expectedAmount == null) return false;
  return RegExp(
    r'(?:[-+−]\s*\p{Sc}?\s*|\p{Sc}\s*)?[\p{N}]+(?:[.,\u066b\u066c\u0027’][\p{N}]+)*',
    unicode: true,
  ).allMatches(text).any((match) {
    if (match.start > 0 &&
        RegExp(
          r'[-+−\p{L}\p{N}.,\u0027’\p{Sc}]',
          unicode: true,
        ).hasMatch(text.substring(match.start - 1, match.start))) {
      return false;
    }
    if (match.end < text.length &&
        RegExp(
          r'[\p{L}\p{N}.,\u0027’]',
          unicode: true,
        ).hasMatch(text.substring(match.end, match.end + 1))) {
      return false;
    }
    return _canonicalAmountToken(match.group(0)!) == expectedAmount;
  });
}

String? _canonicalAmountToken(String value) {
  var token = value.trim();
  if (token.isEmpty || token.length > 64) return null;
  final negative = token.startsWith('-') || token.startsWith('−');
  if (negative || token.startsWith('+')) token = token.substring(1).trimLeft();
  token = token.replaceFirst(RegExp(r'^\p{Sc}', unicode: true), '').trimLeft();
  if (RegExp(r'^\d{1,3}(?:,\d{3})+\.\d+$').hasMatch(token)) {
    token = token.replaceAll(',', '');
  } else if (RegExp(r"^\d{1,3}(?:['’]\d{3})+\.\d+$").hasMatch(token)) {
    token = token.replaceAll(RegExp(r"['’]"), '');
  } else if (RegExp(r'^\d{1,3}(?:\.\d{3})+,\d{1,2}$').hasMatch(token)) {
    token = token.replaceAll('.', '').replaceAll(',', '.');
  } else if (RegExp(r'^\d+,\d{1,2}$').hasMatch(token)) {
    token = token.replaceAll(',', '.');
  } else if (!RegExp(r'^\d+(?:\.\d+)?$').hasMatch(token)) {
    return null;
  }
  final parts = token.split('.');
  final integer = BigInt.parse(parts.first).toString();
  final fraction = parts.length == 2
      ? parts.last.replaceFirst(RegExp(r'0+$'), '')
      : '';
  return '${negative ? '-' : ''}$integer${fraction.isEmpty ? '' : '.$fraction'}';
}

bool _containsIsoDateToken(String text, String expected) {
  final expectedDate = RegExp(
    r'^(\d{4})-(\d{1,2})-(\d{1,2})$',
  ).firstMatch(expected);
  if (expectedDate == null) return false;
  final dates = RegExp(r'(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})');
  for (final match in dates.allMatches(text)) {
    if (match.start > 0 &&
        RegExp(r'\d').hasMatch(text.substring(match.start - 1, match.start))) {
      continue;
    }
    if (match.end < text.length &&
        RegExp(r'\d').hasMatch(text.substring(match.end, match.end + 1))) {
      continue;
    }
    if (match.group(1) == expectedDate.group(1) &&
        int.parse(match.group(2)!) == int.parse(expectedDate.group(2)!) &&
        int.parse(match.group(3)!) == int.parse(expectedDate.group(3)!)) {
      return true;
    }
  }
  const monthNames = <String, int>{
    'jan': 1,
    'feb': 2,
    'mar': 3,
    'apr': 4,
    'may': 5,
    'jun': 6,
    'jul': 7,
    'aug': 8,
    'sep': 9,
    'oct': 10,
    'nov': 11,
    'dec': 12,
  };
  final namedDates = RegExp(
    r'(?<![A-Za-z])(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:,)?\s+(\d{4})(?!\d)',
    caseSensitive: false,
  );
  for (final match in namedDates.allMatches(text)) {
    final month = monthNames[match.group(0)!.substring(0, 3).toLowerCase()];
    if (month == int.parse(expectedDate.group(2)!) &&
        int.parse(match.group(1)!) == int.parse(expectedDate.group(3)!) &&
        match.group(2) == expectedDate.group(1)) {
      return true;
    }
  }
  return false;
}

bool isValidNativeOcrBlockGeometry(
  ReceiptOcrBlockEvidence block, {
  required int imageWidth,
  required int imageHeight,
}) {
  final confidence = block.confidence;
  if (confidence == null ||
      !confidence.isFinite ||
      confidence < 0 ||
      confidence > 1 ||
      block.order < 0 ||
      block.row < 0 ||
      (block.textDirection != 'ltr' && block.textDirection != 'rtl') ||
      block.points.length != 4 ||
      imageWidth <= 0 ||
      imageHeight <= 0) {
    return false;
  }
  final distinctPoints = block.points
      .map((point) => '${point.x}:${point.y}')
      .toSet();
  if (distinctPoints.length != 4 ||
      block.points.any(
        (point) =>
            !point.x.isFinite ||
            !point.y.isFinite ||
            point.x < 0 ||
            point.y < 0 ||
            point.x > imageWidth ||
            point.y > imageHeight,
      )) {
    return false;
  }
  var doubledArea = 0.0;
  final turnDirections = <double>[];
  for (var index = 0; index < block.points.length; index += 1) {
    final current = block.points[index];
    final next = block.points[(index + 1) % block.points.length];
    doubledArea += current.x * next.y - next.x * current.y;
    final afterNext = block.points[(index + 2) % block.points.length];
    turnDirections.add(
      (next.x - current.x) * (afterNext.y - next.y) -
          (next.y - current.y) * (afterNext.x - next.x),
    );
  }
  const epsilon = 0.000001;
  if (doubledArea.abs() <= epsilon ||
      turnDirections.any((direction) => direction.abs() <= epsilon)) {
    return false;
  }
  final turnsClockwise = turnDirections.first < 0;
  return turnDirections.every((direction) => (direction < 0) == turnsClockwise);
}

void _collectField(
  List<_BoundedMismatch> mismatches,
  String fixtureId,
  String field,
  String? actual,
  Map<String, Object?> expected,
) {
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

  Future<Uint8List> loadModelCatalog() async {
    final bytes = await _channel.invokeMethod<Uint8List>('loadModelCatalog');
    if (bytes == null || bytes.isEmpty) {
      throw StateError('Packaged OCR model catalog unavailable');
    }
    return bytes;
  }
}
