import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import '../../integration_test/support/receipt_ocr_model_catalog_evidence.dart';

Map<String, Object?> catalog() =>
    jsonDecode(
          File('assets/receipt_ocr_models/catalog.json').readAsStringSync(),
        )
        as Map<String, Object?>;

List<Map<String, Object?>> packs(Map<String, Object?> value) =>
    (value['packs']! as List).cast<Map<String, Object?>>();

void main() {
  test(
    'actual catalog retains primary routes and admits recovery evidence',
    () {
      final value = catalog();
      final allPacks = packs(value);
      final recovery = allPacks.singleWhere(
        (pack) => pack['role'] == 'recognition_recovery',
      );
      final evidence = ReceiptOcrNativeModelCatalogEvidence.fromJson(value);
      final recoveryId = recovery['modelPackId']! as String;
      expect(evidence.isRecognizer(recoveryId), isTrue);
      expect(evidence.versionFor(recoveryId), recovery['modelVersion']);
      expect(evidence.recognizerRoutes.values, isNot(contains(recoveryId)));
      expect(evidence.isRecognizer(evidence.detectionPackId), isFalse);
      expect(evidence.isRecognizer(null), isFalse);
      expect(evidence.isRecognizer('unlisted-pack'), isFalse);
      expect(evidence.versionFor('unlisted-pack'), isNull);
      for (final pack in allPacks.where((p) => p['role'] == 'recognition')) {
        for (final script in pack['routeScripts']! as List) {
          expect(
            evidence.recognizerForScript(script as String),
            pack['modelPackId'],
          );
        }
      }
      expect(
        evidence.recognizerForScript('Chinese'),
        evidence.recognizerForScript('HanSimplified'),
      );
      expect(
        () => evidence.recognizerForScript('unknown-script'),
        throwsStateError,
      );
    },
  );

  test('recovery does not excuse conflicting ordinary recognizer routes', () {
    final value = catalog();
    packs(value).singleWhere(
      (p) => p['role'] == 'recognition_recovery',
    )['role'] = 'recognition';
    expect(
      () => ReceiptOcrNativeModelCatalogEvidence.fromJson(value),
      throwsStateError,
    );
  });

  for (final mutation in ['unknown policy', 'foreign route', 'extra route']) {
    test('recovery identity rejects $mutation', () {
      final value = catalog();
      final recovery = packs(
        value,
      ).singleWhere((p) => p['role'] == 'recognition_recovery');
      switch (mutation) {
        case 'unknown policy':
          recovery['recoveryPolicy'] = 'unreviewed';
        case 'foreign route':
          recovery['routeScripts'] = ['Korean'];
        case 'extra route':
          recovery['routeScripts'] = ['Latin', 'Korean'];
      }
      expect(
        () => ReceiptOcrNativeModelCatalogEvidence.fromJson(value),
        throwsStateError,
      );
    });
  }

  for (final mutation in [
    'unknown role',
    'missing role',
    'duplicate identity',
    'recognition Any',
    'missing detector',
    'invalid detector route',
    'duplicate detector',
  ]) {
    test('catalog still rejects $mutation', () {
      final value = catalog();
      final allPacks = packs(value);
      final recognition = allPacks.firstWhere(
        (p) => p['role'] == 'recognition',
      );
      final detection = allPacks.singleWhere((p) => p['role'] == 'detection');
      switch (mutation) {
        case 'unknown role':
          recognition['role'] = 'unreviewed';
        case 'missing role':
          recognition.remove('role');
        case 'duplicate identity':
          (value['packs']! as List).add(Map<String, Object?>.from(recognition));
        case 'recognition Any':
          recognition['routeScripts'] = ['Any'];
        case 'missing detector':
          (value['packs']! as List).remove(detection);
        case 'invalid detector route':
          detection['routeScripts'] = ['Latin'];
        case 'duplicate detector':
          (value['packs']! as List).add({
            ...detection,
            'modelPackId': 'second-detector',
          });
      }
      expect(
        () => ReceiptOcrNativeModelCatalogEvidence.fromJson(value),
        throwsStateError,
      );
    });
  }
}
