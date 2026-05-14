import '../api/settleora_api_client.dart';
import 'secure_storage.dart';

class SecureSessionAccessTokenProvider implements SettleoraAccessTokenProvider {
  const SecureSessionAccessTokenProvider({
    required SettleoraSecureStorageBoundary secureStorage,
    DateTime Function()? now,
  }) : _secureStorage = secureStorage,
       _now = now;

  final SettleoraSecureStorageBoundary _secureStorage;
  final DateTime Function()? _now;

  @override
  Future<String?> accessToken() async {
    final session = await _secureStorage.readServerSession();
    if (session == null ||
        !session.hasUsableAccessToken(now: _now?.call().toUtc())) {
      return null;
    }

    final token = session.accessToken.trim();
    return token.isEmpty ? null : token;
  }
}
