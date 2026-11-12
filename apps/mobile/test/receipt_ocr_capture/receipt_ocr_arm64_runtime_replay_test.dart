import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/paddle_receipt_ocr_provider.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_provider.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_image_artifact_processor.dart';
import 'package:mobile/receipt_ocr_capture/receipt_image_normalization_policy.dart';
import '../../integration_test/support/receipt_ocr_fixture_contract.dart';

const imageSha = '261b6f1831617873bad6da93cefe54c050e70d10ec283dfdc6af9286602e10ec';
const fixtureId = 'existing_13_ridge_restaurant_en_US';
void requireReplay(bool value) { if (!value) throw StateError('arm64_replay_rejected'); }

class CapturedChannel implements PaddleReceiptOcrChannel {
  CapturedChannel(this.payload);
  final Map<Object?, Object?> payload;
  int replayInvocations = 0;
  @override
  Future<Map<Object?, Object?>?> recognize(Uint8List bytes) async {
    requireReplay(bytes.length == 263039 && sha256.convert(bytes).toString() == imageSha);
    replayInvocations++;
    requireReplay(replayInvocations == 1);
    return payload;
  }
}

Future<ReceiptOcrResult> replayChannel(List<int> bytes, Map<Object?, Object?> payload) async {
  final channel = CapturedChannel(payload);
  final result = await PaddleReceiptOcrProvider(
    parser: const ReceiptOcrParser(collectDiagnostics: true), channel: channel,
  ).extractReceipt(ReceiptOcrRequest(bytes: bytes, contentType: 'image/jpeg', fallbackCurrency: 'USD'));
  requireReplay(channel.replayInvocations == 1);
  return result;
}

Map<String, dynamic> loadPrivateJson(String path, int maximum, {String? expectedSha256}) {
  try {
    final file = File(path);
    requireReplay(file.isAbsolute && FileSystemEntity.typeSync(path, followLinks: false) == FileSystemEntityType.file);
    final info = file.statSync();
    requireReplay(info.size > 0 && info.size <= maximum && (info.mode & 0x1ff) == 0x180);
    final data = file.readAsBytesSync();
    requireReplay(data.length == info.size && (expectedSha256 == null || sha256.convert(data).toString() == expectedSha256));
    return jsonDecode(utf8.decode(data)) as Map<String, dynamic>;
  } catch (_) { throw StateError('arm64_replay_rejected'); }
}

void main() {
  late Uint8List normalized;
  late Map<String, dynamic> fixture;
  setUpAll(() {
    final manifest = jsonDecode(File('test/fixtures/receipt_ocr/manifest.json').readAsStringSync()) as Map<String, dynamic>;
    fixture = (manifest['fixtures'] as List).cast<Map<String,dynamic>>()
        .singleWhere((entry) => entry['id'] == fixtureId);
    final original = File('test/fixtures/receipt_ocr/' + (fixture['file'] as String)).readAsBytesSync();
    final prepared = const ReceiptImageArtifactProcessor().process(ReceiptImageArtifactRequest(
      sourceType: ReceiptImageSourceKind.importedImage, sourceContentType: 'image/jpeg',
      sourceBytes: original, sourceExtension: 'jpeg', sourceLabel: fixtureId,
    ));
    requireReplay(prepared.accepted && prepared.normalizedJpegBytes != null);
    normalized = prepared.normalizedJpegBytes!;
    requireReplay(normalized.length == 263039 && sha256.convert(normalized).toString() == imageSha);
  });
  setUp(() => debugDefaultTargetPlatformOverride = TargetPlatform.iOS);
  tearDown(() => debugDefaultTargetPlatformOverride = null);

  test('synthetic replay preserves the captured order through unchanged provider/parser', () async {
    final result = await replayChannel(normalized, {
      'blocks': [
        {'text':'TOTAL USD 5.00','order':2,'row':2},
        {'text':'Synthetic Market','order':0,'row':0},
        {'text':'Tea USD 5.00','order':1,'row':1},
      ],
    });
    expect(result.status,ReceiptOcrStatus.extracted);
    expect(result.preview!.total,'5.00');
    expect(result.preview!.items.single.description,'Tea');
  });
  test('synthetic replay rejects a substituted image before decoding channel data', () async {
    await expectLater(CapturedChannel({'blocks':[]}).recognize(Uint8List.fromList([1])),
      throwsA(isA<StateError>()));
  });
  test('synthetic empty capture remains a failed provider result', () async {
    final result=await replayChannel(normalized,{'blocks':[]});
    expect(result.status,ReceiptOcrStatus.failed);
  });

  final capturePath=Platform.environment['SETTLEORA_ARM64_CAPTURE_FILE'];
  test('actual retained native-channel replay records correctness without new OCR calls', () async {
    try {
      final proofPath=Platform.environment['SETTLEORA_ARM64_EXPIRY_PROOF'];
      final outputPath=Platform.environment['SETTLEORA_ARM64_REPLAY_OUTPUT'];
      final expectedHead=Platform.environment['SETTLEORA_ARM64_EXPECTED_HEAD'];
      requireReplay(proofPath!=null && outputPath!=null && expectedHead!=null &&
        RegExp(r'^[0-9a-f]{40}$').hasMatch(expectedHead!));
      final proof=loadPrivateJson(proofPath!,16*1024);
      final captureDigest=proof['captureSha256'];
      requireReplay(captureDigest is String && RegExp(r'^[0-9a-f]{64}$').hasMatch(captureDigest));
      final capture=loadPrivateJson(capturePath!,128*1024,expectedSha256:captureDigest as String);
      requireReplay(capture['purpose']=='arm64_ridge_runtime_v1' &&
        capture['fixtureId']==fixtureId && capture['inputSha256']==imageSha &&
        capture['inputBytes']==normalized.length && capture['sourceHead']==expectedHead &&
        capture['runAttempt']=='1' && proof['expiryVerified']==true &&
        proof['capturePhase']==capture['phase'] && proof['runId']==capture['runId'] &&
        proof['runAttempt']==capture['runAttempt'] &&
        proof['sourceHead']==capture['sourceHead'] && proof['sourceTree']==capture['sourceTree'] &&
        proof['sourceFingerprint']==capture['sourceFingerprint'] &&
        proof['serverExpiresAt'] is int &&
        DateTime.now().millisecondsSinceEpoch < (proof['serverExpiresAt'] as int) &&
        (proof['name'] as String).startsWith('settleora-arm64-ridge-private-' +
          (capture['runId'] as String) + '-'));
      final payload=(capture['channel'] as Map).cast<Object?,Object?>();
      final result=await replayChannel(normalized,payload);
      final preview=result.preview;
      final mismatches=preview==null ? <String>['noPreview'] :
        receiptOcrFixtureFieldMismatches(preview,
          (fixture['expected'] as Map).cast<String,Object?>(),fixtureId);
      final reviewMatched=preview!=null && receiptOcrFixtureReviewMatches(preview,
        (fixture['expected'] as Map).cast<String,Object?>());
      requireReplay(mismatches.every((value)=>RegExp(r'^[A-Za-z0-9_.\[\]-]{1,80}$').hasMatch(value)));
      final privateResult={
        'schemaVersion':1,'purpose':'arm64_native_channel_replay','nativeCalls':0,
        'sourceHead':expectedHead,'inputSha256':imageSha,'phase':capture['phase'],
        'status':result.status.name,'fieldMismatches':mismatches,'reviewMatched':reviewMatched,
        'preview':preview==null ? null : {
          'merchant':preview.merchant,'date':preview.receiptDate,'currency':preview.currency,
          'subtotal':preview.subtotal,'tax':preview.tax,'service':preview.service,
          'discount':preview.discount,'total':preview.total,'warnings':preview.warnings,
          'items':[for(final item in preview.items) {
            'description':item.description,'quantity':item.quantity,'unitPrice':item.unitPrice,
            'lineTotal':item.lineTotal,'currency':item.currency,
          }],
          'parserDiagnostics':preview.parserDiagnostics?.toBoundedEvidence(),
        },
      };
      final bytes=utf8.encode(jsonEncode(privateResult));requireReplay(bytes.length<=128*1024);
      final output=File(outputPath!);
      requireReplay(output.isAbsolute && !output.existsSync());
      output.createSync(exclusive:true);output.writeAsBytesSync(bytes,flush:true);
      final chmod=Process.runSync('chmod',['600',output.path]);
      requireReplay(chmod.exitCode==0);
      // Counts and fixed field labels only. Receipt values stay in the private output.
      stdout.writeln('SETTLEORA_ARM64_REPLAY='+jsonEncode({
        'sourceHead':expectedHead,'phase':capture['phase'],'status':result.status.name,
        'nativeCalls':0,'fieldMismatchCount':mismatches.length,'fieldMismatches':mismatches,
        'reviewMatched':reviewMatched,'itemCount':preview?.items.length??0,
      }));
    } catch (_) { fail('arm64_replay_rejected'); }
  },skip:capturePath==null ? 'Awaiting an authorized actual ARM64 runtime capture.' : false);
}
