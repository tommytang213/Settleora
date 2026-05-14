import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/app_configuration.dart';
import 'package:mobile/app/secure_session_access_token_provider.dart';
import 'package:mobile/app/secure_storage.dart';

void main() {
  group('SettleoraSecureStorage', () {
    test(
      'stores app mode and server base URL in the secure boundary',
      () async {
        final keyValueStore = InMemorySecureKeyValueStore();
        final storage = SettleoraSecureStorage(keyValueStore: keyValueStore);

        await storage.writeAppConfiguration(
          SettleoraAppConfiguration.server(
            serverBaseUri: Uri.parse('https://settleora.example/api/'),
          ),
        );

        final restored = await storage.readAppConfiguration();

        expect(restored?.mode, SettleoraAppMode.server);
        expect(
          restored?.serverBaseUri.toString(),
          'https://settleora.example/api/',
        );
        expect(
          keyValueStore.values.keys,
          contains('settleora.app_configuration.v1'),
        );
      },
    );

    test('treats malformed stored configuration as not configured', () async {
      final keyValueStore = InMemorySecureKeyValueStore();
      final storage = SettleoraSecureStorage(keyValueStore: keyValueStore);
      await keyValueStore.write('settleora.app_configuration.v1', 'not json');

      expect(await storage.readAppConfiguration(), isNull);
    });

    test(
      'stores future session material without exposing it through toString',
      () async {
        final keyValueStore = InMemorySecureKeyValueStore();
        final storage = SettleoraSecureStorage(keyValueStore: keyValueStore);
        final session = SettleoraServerSessionMaterial(
          accessToken: 'redacted-access',
          accessSessionExpiresAtUtc: DateTime.utc(2026, 5, 15),
          refreshCredential: 'redacted-refresh',
          refreshIdleExpiresAtUtc: DateTime.utc(2026, 5, 16),
          refreshAbsoluteExpiresAtUtc: DateTime.utc(2026, 6, 14),
        );

        await storage.writeServerSession(session);
        final restored = await storage.readServerSession();

        expect(restored?.accessToken, 'redacted-access');
        expect(restored?.refreshCredential, 'redacted-refresh');
        expect(restored.toString(), isNot(contains('redacted-access')));
        expect(restored.toString(), isNot(contains('redacted-refresh')));
      },
    );
  });

  group('SecureSessionAccessTokenProvider', () {
    test('fails closed when session material is missing', () async {
      final storage = SettleoraSecureStorage(
        keyValueStore: InMemorySecureKeyValueStore(),
      );
      final provider = SecureSessionAccessTokenProvider(
        secureStorage: storage,
        now: () => DateTime.utc(2026, 5, 14),
      );

      expect(await provider.accessToken(), isNull);
    });

    test('fails closed for blank and expired access sessions', () async {
      final keyValueStore = InMemorySecureKeyValueStore();
      final storage = SettleoraSecureStorage(keyValueStore: keyValueStore);
      final provider = SecureSessionAccessTokenProvider(
        secureStorage: storage,
        now: () => DateTime.utc(2026, 5, 14),
      );

      await storage.writeServerSession(
        const SettleoraServerSessionMaterial(accessToken: '   '),
      );
      expect(await provider.accessToken(), isNull);

      await storage.writeServerSession(
        SettleoraServerSessionMaterial(
          accessToken: 'redacted-expired',
          accessSessionExpiresAtUtc: DateTime.utc(2026, 5, 13),
        ),
      );
      expect(await provider.accessToken(), isNull);
    });

    test('reads a trimmed access token per operation', () async {
      final keyValueStore = InMemorySecureKeyValueStore();
      final storage = SettleoraSecureStorage(keyValueStore: keyValueStore);
      final provider = SecureSessionAccessTokenProvider(
        secureStorage: storage,
        now: () => DateTime.utc(2026, 5, 14),
      );

      await storage.writeServerSession(
        SettleoraServerSessionMaterial(
          accessToken: '  redacted-usable  ',
          accessSessionExpiresAtUtc: DateTime.utc(2026, 5, 15),
        ),
      );

      expect(await provider.accessToken(), 'redacted-usable');

      await storage.clearServerSession();

      expect(await provider.accessToken(), isNull);
    });
  });
}

class InMemorySecureKeyValueStore implements SecureKeyValueStore {
  final values = <String, String>{};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async {
    values[key] = value;
  }

  @override
  Future<void> delete(String key) async {
    values.remove(key);
  }
}
