import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/app_configuration.dart';

void main() {
  group('validateServerBaseUri', () {
    test('normalizes HTTPS base URLs to a stable shape', () {
      final result = validateServerBaseUri('  HTTPS://Example.COM/api  ');

      expect(result.errorMessage, isNull);
      expect(result.normalizedUri.toString(), 'https://example.com/api/');
      expect(result.isLocalDevelopmentHttp, isFalse);
    });

    test('allows clearly labelled local development HTTP', () {
      final result = validateServerBaseUri('http://localhost:8080');

      expect(result.errorMessage, isNull);
      expect(result.normalizedUri.toString(), 'http://localhost:8080/');
      expect(result.isLocalDevelopmentHttp, isTrue);
      expect(result.warningMessage, contains('local development'));
    });

    test('allows Android emulator loopback HTTP', () {
      final result = validateServerBaseUri('http://10.0.2.2:8080/api');

      expect(result.errorMessage, isNull);
      expect(result.normalizedUri.toString(), 'http://10.0.2.2:8080/api/');
      expect(result.isLocalDevelopmentHttp, isTrue);
    });

    test('rejects relative URLs', () {
      final result = validateServerBaseUri('/api/v1');

      expect(result.normalizedUri, isNull);
      expect(result.errorMessage, contains('absolute URL'));
    });

    test('rejects credentials, query strings, and fragments', () {
      final cases = [
        'https://user@example.test',
        'https://example.test?x=1',
        'https://example.test#setup',
      ];

      for (final value in cases) {
        final result = validateServerBaseUri(value);
        expect(result.normalizedUri, isNull, reason: value);
      }
    });

    test('rejects non-local HTTP', () {
      final result = validateServerBaseUri('http://example.test');

      expect(result.normalizedUri, isNull);
      expect(result.errorMessage, contains('HTTP is allowed only'));
    });
  });

  test('round-trips server app configuration through storage JSON', () {
    final configuration = SettleoraAppConfiguration.server(
      serverBaseUri: Uri.parse('https://settleora.example/api/'),
    );

    final restored = SettleoraAppConfiguration.fromJson(configuration.toJson());

    expect(restored.mode, SettleoraAppMode.server);
    expect(restored.serverBaseUri.toString(), 'https://settleora.example/api/');
  });
}
