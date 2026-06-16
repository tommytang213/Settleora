import '../api/settleora_api_client.dart';
import 'auth_session_repository.dart';
import 'secure_storage.dart';

class SecureSessionAccessTokenProvider implements SettleoraAccessTokenProvider {
  SecureSessionAccessTokenProvider({
    required SettleoraSecureStorageBoundary secureStorage,
    required SettleoraAuthRepository authRepository,
    DateTime Function()? now,
    Duration refreshSkew = const Duration(minutes: 2),
  }) : _secureStorage = secureStorage,
       _authRepository = authRepository,
       _now = now,
       _refreshSkew = refreshSkew;

  final SettleoraSecureStorageBoundary _secureStorage;
  final SettleoraAuthRepository _authRepository;
  final DateTime Function()? _now;
  final Duration _refreshSkew;
  Future<String?>? _refreshInFlight;

  @override
  Future<String?> accessToken() async {
    final session = await _secureStorage.readServerSession();
    if (session == null) {
      return null;
    }

    final now = _now?.call().toUtc();
    final token = session.accessToken.trim();
    final hasUsableAccess = session.hasUsableAccessToken(now: now);
    final shouldRefresh = session.shouldRefreshAccessToken(
      now: now,
      refreshSkew: _refreshSkew,
    );

    if (hasUsableAccess && !shouldRefresh) {
      return token.isEmpty ? null : token;
    }

    if (!session.hasUsableRefreshCredential(now: now)) {
      if (!hasUsableAccess) {
        await _secureStorage.clearServerSession();
        return null;
      }

      return token.isEmpty ? null : token;
    }

    final inFlight = _refreshInFlight;
    if (inFlight != null) {
      return inFlight;
    }

    final refreshFuture = _refreshSession(session, fallbackToken: token);
    _refreshInFlight = refreshFuture;

    try {
      return await refreshFuture;
    } finally {
      if (identical(_refreshInFlight, refreshFuture)) {
        _refreshInFlight = null;
      }
    }
  }

  Future<String?> _refreshSession(
    SettleoraServerSessionMaterial session, {
    required String fallbackToken,
  }) async {
    final refreshCredential = session.refreshCredential?.trim();
    if (refreshCredential == null || refreshCredential.isEmpty) {
      return fallbackToken.isEmpty ? null : fallbackToken;
    }

    try {
      final rotated = await _authRepository.refreshSession(
        refreshCredential: refreshCredential,
      );
      await _secureStorage.writeServerSession(rotated);

      final token = rotated.accessToken.trim();
      if (token.isEmpty) {
        await _secureStorage.clearServerSession();
        return null;
      }

      return token;
    } on SettleoraAuthFailure catch (failure) {
      if (_refreshRequiresFreshSignIn(failure)) {
        await _secureStorage.clearServerSession();
        return null;
      }

      final hasUsableFallback = session.hasUsableAccessToken(
        now: _now?.call().toUtc(),
      );
      if (hasUsableFallback && fallbackToken.isNotEmpty) {
        return fallbackToken;
      }

      rethrow;
    } catch (_) {
      final hasUsableFallback = session.hasUsableAccessToken(
        now: _now?.call().toUtc(),
      );
      if (hasUsableFallback && fallbackToken.isNotEmpty) {
        return fallbackToken;
      }

      rethrow;
    }
  }
}

bool _refreshRequiresFreshSignIn(SettleoraAuthFailure failure) {
  return switch (failure.kind) {
    SettleoraAuthFailureKind.sessionExpired ||
    SettleoraAuthFailureKind.invalidCredentials ||
    SettleoraAuthFailureKind.denied ||
    SettleoraAuthFailureKind.unavailable ||
    SettleoraAuthFailureKind.conflict => true,
    SettleoraAuthFailureKind.validation ||
    SettleoraAuthFailureKind.tooManyAttempts ||
    SettleoraAuthFailureKind.network ||
    SettleoraAuthFailureKind.server ||
    SettleoraAuthFailureKind.storage => false,
  };
}
