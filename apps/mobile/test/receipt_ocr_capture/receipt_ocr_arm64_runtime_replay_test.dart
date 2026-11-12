import 'dart:convert';
import 'dart:io';
// Offline test only: crypto is pinned in the unchanged app lockfile.
// ignore: depend_on_referenced_packages
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/paddle_receipt_ocr_provider.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_provider.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_image_artifact_processor.dart';
import 'package:mobile/receipt_ocr_capture/receipt_image_normalization_policy.dart';
import '../../integration_test/support/receipt_ocr_fixture_contract.dart';

const imageSha =
    '261b6f1831617873bad6da93cefe54c050e70d10ec283dfdc6af9286602e10ec';
const fixtureId = 'existing_13_ridge_restaurant_en_US';
const replayPackageConfigSha256 = String.fromEnvironment(
  'SETTLEORA_ARM64_REPLAY_PACKAGE_CONFIG_SHA256',
);
void requireReplay(bool value) {
  if (!value) throw StateError('arm64_replay_rejected');
}

class CapturedChannel implements PaddleReceiptOcrChannel {
  CapturedChannel(this.payload);
  final Map<Object?, Object?> payload;
  int replayInvocations = 0;
  @override
  Future<Map<Object?, Object?>?> recognize(Uint8List bytes) async {
    requireReplay(
      bytes.length == 263039 && sha256.convert(bytes).toString() == imageSha,
    );
    replayInvocations++;
    requireReplay(replayInvocations == 1);
    return payload;
  }
}

Future<ReceiptOcrResult> replayChannel(
  List<int> bytes,
  Map<Object?, Object?> payload,
) async {
  final channel = CapturedChannel(payload);
  final result =
      await PaddleReceiptOcrProvider(
        parser: const ReceiptOcrParser(collectDiagnostics: true),
        channel: channel,
      ).extractReceipt(
        ReceiptOcrRequest(
          bytes: bytes,
          contentType: 'image/jpeg',
          fallbackCurrency: 'USD',
        ),
      );
  requireReplay(channel.replayInvocations == 1);
  return result;
}

Map<String, dynamic> loadPrivateJson(
  String path,
  int maximum, {
  String? expectedSha256,
}) {
  try {
    final file = File(path);
    requireReplay(
      file.isAbsolute &&
          FileSystemEntity.typeSync(path, followLinks: false) ==
              FileSystemEntityType.file,
    );
    final info = file.statSync();
    requireReplay(
      info.size > 0 && info.size <= maximum && (info.mode & 0x1ff) == 0x180,
    );
    final data = file.readAsBytesSync();
    requireReplay(
      data.length == info.size &&
          (expectedSha256 == null ||
              sha256.convert(data).toString() == expectedSha256),
    );
    return jsonDecode(utf8.decode(data)) as Map<String, dynamic>;
  } catch (_) {
    throw StateError('arm64_replay_rejected');
  }
}

class VerifiedReplaySource {
  VerifiedReplaySource(this.repo, this.privateRoot, this.identity, this.runId);
  final String repo;
  final String privateRoot;
  final Map<String, String> identity;
  final String runId;

  List<String> arguments(String mode, {String? output}) => [
    '-I',
    '-B',
    '$repo/tools/ocr-models/ios-paddle-arm64-runtime-bundle.py',
    mode,
    '--private-root',
    privateRoot,
    '--source-head',
    identity['head']!,
    '--source-tree',
    identity['tree']!,
    '--source-fingerprint',
    identity['fingerprint']!,
    '--run-id',
    runId,
    '--run-attempt',
    '1',
    if (output != null) ...['--replay-output', output],
  ];

  Future<void> write(String output, List<int> bytes) async {
    final process = await Process.start(
      'python3',
      arguments('write-replay', output: output),
    );
    final stdoutDone = process.stdout.drain<void>();
    final stderrDone = process.stderr.drain<void>();
    process.stdin.add(bytes);
    await process.stdin.close();
    final code = await process.exitCode;
    await Future.wait([stdoutDone, stderrDone]);
    requireReplay(code == 0);
  }
}

Future<void> verifyPackageRoots(String repo) async {
  // Pinned Flutter test compiler uses this project package config.
  // The actual capture invocation additionally binds its bytes with --dart-define.
  final config = File('$repo/apps/mobile/.dart_tool/package_config.json');
  requireReplay(config.resolveSymbolicLinksSync() == config.absolute.path);
  requireReplay(config.lengthSync() > 0 && config.lengthSync() <= 1024 * 1024);
  final raw = config.readAsBytesSync();
  requireReplay(
    raw.length <= 1024 * 1024 &&
        (replayPackageConfigSha256.isEmpty ||
            sha256.convert(raw).toString() == replayPackageConfigSha256),
  );
  final value = jsonDecode(config.readAsStringSync()) as Map<String, dynamic>;
  final mobile = (value['packages'] as List)
      .cast<Map<String, dynamic>>()
      .singleWhere((row) => row['name'] == 'mobile');
  final library = config.uri
      .resolve(mobile['rootUri'] as String)
      .resolve(mobile['packageUri'] as String);
  requireReplay(
    library.scheme == 'file' &&
        Directory.fromUri(library).resolveSymbolicLinksSync() ==
            Directory('$repo/apps/mobile/lib').resolveSymbolicLinksSync(),
  );
}

Future<VerifiedReplaySource> verifyReplaySource(
  Map<String, dynamic> capture,
  Map<String, dynamic> proof,
  String privateRoot,
) async {
  final repo = Directory.current.parent.parent.resolveSymbolicLinksSync();
  requireReplay(RegExp(r'^[0-9a-f]{64}$').hasMatch(replayPackageConfigSha256));
  await verifyPackageRoots(repo);
  final identity = <String, String>{
    'head':
        (Platform.environment['SETTLEORA_ARM64_REPLAY_HEAD'] ??
                capture['sourceHead'])
            as String,
    'tree':
        (Platform.environment['SETTLEORA_ARM64_REPLAY_TREE'] ??
                proof['sourceTree'])
            as String,
    'fingerprint':
        (Platform.environment['SETTLEORA_ARM64_REPLAY_FINGERPRINT'] ??
                proof['sourceFingerprint'])
            as String,
  };
  requireReplay(
    RegExp(r'^[0-9a-f]{40}$').hasMatch(identity['head']!) &&
        RegExp(r'^[0-9a-f]{40}$').hasMatch(identity['tree']!) &&
        RegExp(r'^[0-9a-f]{64}$').hasMatch(identity['fingerprint']!),
  );
  final binding = VerifiedReplaySource(
    repo,
    privateRoot,
    Map.unmodifiable(identity),
    capture['runId'] as String,
  );
  final result = await Process.run(
    'python3',
    binding.arguments('verify-replay-source'),
  );
  requireReplay(
    result.exitCode == 0 &&
        result.stdout is String &&
        (result.stdout as String).length <= 4096,
  );
  final verified = jsonDecode(result.stdout as String) as Map<String, dynamic>;
  requireReplay(
    verified['verified'] == true &&
        verified['purpose'] == 'arm64_replay_source_verification' &&
        verified['operation'] == 'verify-replay-source' &&
        verified['packageConfigSha256'] == replayPackageConfigSha256 &&
        verified['sourceRoot'] == repo &&
        verified['sourceHead'] == identity['head'] &&
        verified['sourceTree'] == identity['tree'] &&
        verified['sourceFingerprint'] == identity['fingerprint'] &&
        verified['runId'] == capture['runId'] &&
        verified['runAttempt'] == '1',
  );
  return binding;
}

void main() {
  late Uint8List normalized;
  late Map<String, dynamic> fixture;
  setUpAll(() {
    final manifest =
        jsonDecode(
              File(
                'test/fixtures/receipt_ocr/manifest.json',
              ).readAsStringSync(),
            )
            as Map<String, dynamic>;
    fixture = (manifest['fixtures'] as List)
        .cast<Map<String, dynamic>>()
        .singleWhere((entry) => entry['id'] == fixtureId);
    final original = File(
      'test/fixtures/receipt_ocr/${fixture['file']}',
    ).readAsBytesSync();
    final prepared = const ReceiptImageArtifactProcessor().process(
      ReceiptImageArtifactRequest(
        sourceType: ReceiptImageSourceKind.importedImage,
        sourceContentType: 'image/jpeg',
        sourceBytes: original,
        sourceExtension: 'jpeg',
        sourceLabel: fixtureId,
      ),
    );
    requireReplay(prepared.accepted && prepared.normalizedJpegBytes != null);
    normalized = prepared.normalizedJpegBytes!;
    requireReplay(
      normalized.length == 263039 &&
          sha256.convert(normalized).toString() == imageSha,
    );
  });
  setUp(() => debugDefaultTargetPlatformOverride = TargetPlatform.iOS);
  tearDown(() => debugDefaultTargetPlatformOverride = null);

  test(
    'synthetic replay preserves the captured order through unchanged provider/parser',
    () async {
      final result = await replayChannel(normalized, {
        'blocks': [
          {'text': 'TOTAL USD 5.00', 'order': 2, 'row': 2},
          {'text': 'Synthetic Market', 'order': 0, 'row': 0},
          {'text': 'Tea USD 5.00', 'order': 1, 'row': 1},
        ],
      });
      expect(result.status, ReceiptOcrStatus.extracted);
      expect(result.preview!.total, '5.00');
      expect(result.preview!.items.single.description, 'Tea');
    },
  );
  test(
    'synthetic replay rejects a substituted image before decoding channel data',
    () async {
      await expectLater(
        CapturedChannel({'blocks': []}).recognize(Uint8List.fromList([1])),
        throwsA(isA<StateError>()),
      );
    },
  );
  test('replay packages resolve to the executing verified checkout', () async {
    await verifyPackageRoots(
      Directory.current.parent.parent.resolveSymbolicLinksSync(),
    );
  });
  test('synthetic empty capture remains a failed provider result', () async {
    final result = await replayChannel(normalized, {'blocks': []});
    expect(result.status, ReceiptOcrStatus.failed);
  });

  final capturePath = Platform.environment['SETTLEORA_ARM64_CAPTURE_FILE'];
  test(
    'actual retained native-channel replay records correctness without new OCR calls',
    () async {
      try {
        final proofPath = Platform.environment['SETTLEORA_ARM64_EXPIRY_PROOF'];
        final outputPath =
            Platform.environment['SETTLEORA_ARM64_REPLAY_OUTPUT'];
        final expectedHead =
            Platform.environment['SETTLEORA_ARM64_EXPECTED_HEAD'];
        requireReplay(
          proofPath != null &&
              outputPath != null &&
              expectedHead != null &&
              RegExp(r'^[0-9a-f]{40}$').hasMatch(expectedHead),
        );
        final proof = loadPrivateJson(proofPath!, 16 * 1024);
        final captureDigest = proof['captureSha256'];
        requireReplay(
          captureDigest is String &&
              RegExp(r'^[0-9a-f]{64}$').hasMatch(captureDigest),
        );
        final capture = loadPrivateJson(
          capturePath!,
          128 * 1024,
          expectedSha256: captureDigest as String,
        );
        requireReplay(
          capture['purpose'] == 'arm64_ridge_runtime_v1' &&
              capture['fixtureId'] == fixtureId &&
              capture['inputSha256'] == imageSha &&
              capture['inputBytes'] == normalized.length &&
              capture['sourceHead'] == expectedHead &&
              capture['runAttempt'] == '1' &&
              proof['expiryVerified'] == true &&
              proof['capturePhase'] == capture['phase'] &&
              proof['runId'] == capture['runId'] &&
              proof['runAttempt'] == capture['runAttempt'] &&
              proof['sourceHead'] == capture['sourceHead'] &&
              proof['sourceTree'] == capture['sourceTree'] &&
              proof['sourceFingerprint'] == capture['sourceFingerprint'] &&
              proof['serverExpiresAt'] is int &&
              DateTime.now().millisecondsSinceEpoch <
                  (proof['serverExpiresAt'] as int) &&
              (proof['name'] as String).startsWith(
                'settleora-arm64-ridge-private-${capture['runId']}-',
              ),
        );
        final privateRoot = File(proofPath).parent.absolute.path;
        requireReplay(
          File(capturePath).parent.absolute.path == privateRoot &&
              File(outputPath!).parent.absolute.path == privateRoot,
        );
        final source = await verifyReplaySource(capture, proof, privateRoot);
        final payload = (capture['channel'] as Map).cast<Object?, Object?>();
        final result = await replayChannel(normalized, payload);
        final preview = result.preview;
        final mismatches = preview == null
            ? <String>['noPreview']
            : receiptOcrFixtureFieldMismatches(
                preview,
                (fixture['expected'] as Map).cast<String, Object?>(),
                fixtureId,
              );
        final reviewMatched =
            preview != null &&
            receiptOcrFixtureReviewMatches(
              preview,
              (fixture['expected'] as Map).cast<String, Object?>(),
            );
        requireReplay(
          mismatches.every(
            (value) => RegExp(r'^[A-Za-z0-9_.\[\]-]{1,80}$').hasMatch(value),
          ),
        );
        final privateResult = {
          'schemaVersion': 1,
          'purpose': 'arm64_native_channel_replay',
          'nativeCalls': 0,
          'sourceHead': expectedHead,
          'captureSha256': captureDigest,
          'captureRunId': capture['runId'],
          'captureRunAttempt': capture['runAttempt'],
          'replaySource': source.identity,
          'replayPackageConfigSha256': replayPackageConfigSha256,
          'inputSha256': imageSha,
          'phase': capture['phase'],
          'status': result.status.name,
          'fieldMismatches': mismatches,
          'reviewMatched': reviewMatched,
          'preview': preview == null
              ? null
              : {
                  'merchant': preview.merchant,
                  'date': preview.receiptDate,
                  'currency': preview.currency,
                  'subtotal': preview.subtotal,
                  'tax': preview.tax,
                  'service': preview.service,
                  'discount': preview.discount,
                  'total': preview.total,
                  'warnings': preview.warnings,
                  'items': [
                    for (final item in preview.items)
                      {
                        'description': item.description,
                        'quantity': item.quantity,
                        'unitPrice': item.unitPrice,
                        'lineTotal': item.lineTotal,
                        'currency': item.currency,
                      },
                  ],
                  'parserDiagnostics': preview.parserDiagnostics
                      ?.toBoundedEvidence(),
                },
        };
        final bytes = utf8.encode(jsonEncode(privateResult));
        requireReplay(bytes.length <= 128 * 1024);
        await source.write(outputPath!, bytes);
        // Counts and fixed field labels only. Receipt values stay in the private output.
        stdout.write('SETTLEORA_ARM64_REPLAY=');
        stdout.writeln(
          jsonEncode({
            'sourceHead': expectedHead,
            'replaySource': source.identity,
            'phase': capture['phase'],
            'status': result.status.name,
            'nativeCalls': 0,
            'fieldMismatchCount': mismatches.length,
            'fieldMismatches': mismatches,
            'reviewMatched': reviewMatched,
            'itemCount': preview?.items.length ?? 0,
          }),
        );
      } catch (_) {
        fail('arm64_replay_rejected');
      }
    },
    skip: capturePath == null
        ? 'Awaiting an authorized actual ARM64 runtime capture.'
        : false,
  );
}
