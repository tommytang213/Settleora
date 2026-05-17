import 'dart:async';
import 'dart:io';

import 'package:settleora_api_client/settleora_api.dart' as api;

import '../api/settleora_api_client.dart';
import 'secure_storage.dart';

class SettleoraSignInSubmission {
  const SettleoraSignInSubmission({
    required this.identifier,
    required this.password,
  });

  final String identifier;
  final String password;
}

class SettleoraCurrentUser {
  const SettleoraCurrentUser({
    required this.displayName,
    required this.defaultCurrency,
    required this.roles,
    required this.sessionExpiresAtUtc,
  });

  final String displayName;
  final String? defaultCurrency;
  final List<String> roles;
  final DateTime sessionExpiresAtUtc;

  @override
  String toString() {
    return 'SettleoraCurrentUser(displayName: $displayName, roles: ${roles.length})';
  }
}

class SettleoraSessionSummary {
  const SettleoraSessionSummary({
    required this.id,
    required this.isCurrent,
    required this.status,
    required this.issuedAtUtc,
    required this.expiresAtUtc,
    required this.lastSeenAtUtc,
    required this.deviceLabel,
  });

  final String id;
  final bool isCurrent;
  final String status;
  final DateTime issuedAtUtc;
  final DateTime expiresAtUtc;
  final DateTime? lastSeenAtUtc;
  final String? deviceLabel;

  String get displayLabel {
    final trimmed = deviceLabel?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      return isCurrent ? 'This device' : 'Signed-in device';
    }

    return trimmed;
  }

  @override
  String toString() {
    return 'SettleoraSessionSummary(isCurrent: $isCurrent, status: $status)';
  }
}

enum SettleoraAuthFailureKind {
  validation,
  invalidCredentials,
  tooManyAttempts,
  sessionExpired,
  denied,
  unavailable,
  conflict,
  network,
  server,
  storage,
}

class SettleoraAuthFailure implements Exception {
  const SettleoraAuthFailure({
    required this.kind,
    required this.message,
    this.statusCode,
  });

  final SettleoraAuthFailureKind kind;
  final String message;
  final int? statusCode;

  String get title {
    return switch (kind) {
      SettleoraAuthFailureKind.validation => 'Check sign-in details',
      SettleoraAuthFailureKind.invalidCredentials => 'Sign-in failed',
      SettleoraAuthFailureKind.tooManyAttempts => 'Try again later',
      SettleoraAuthFailureKind.sessionExpired => 'Sign in again',
      SettleoraAuthFailureKind.denied => 'Access unavailable',
      SettleoraAuthFailureKind.unavailable => 'Session unavailable',
      SettleoraAuthFailureKind.conflict => 'Session changed',
      SettleoraAuthFailureKind.network => 'Server unavailable',
      SettleoraAuthFailureKind.server => 'Server unavailable',
      SettleoraAuthFailureKind.storage => 'Secure storage unavailable',
    };
  }

  @override
  String toString() {
    return 'SettleoraAuthFailure($kind, statusCode: $statusCode)';
  }
}

abstract interface class SettleoraAuthRepository {
  Future<SettleoraServerSessionMaterial> signIn(
    SettleoraSignInSubmission submission,
  );

  Future<SettleoraCurrentUser> currentUser({required String accessToken});

  Future<SettleoraServerSessionMaterial> refreshSession({
    required String refreshCredential,
    String? deviceLabel,
  });

  Future<void> signOutCurrentSession({required String accessToken});

  Future<void> signOutAllCurrentAccountSessions({required String accessToken});

  Future<List<SettleoraSessionSummary>> listSessions({
    required String accessToken,
  });

  Future<void> revokeSession({
    required String sessionId,
    required String accessToken,
  });
}

abstract interface class SettleoraAuthGeneratedClient {
  Future<api.LocalSignInResponse> signInLocal(api.LocalSignInRequest request);

  Future<api.CurrentUserResponse> getCurrentUser({required String accessToken});

  Future<api.RefreshSessionResponse> refreshSession(
    api.RefreshSessionRequest request,
  );

  Future<void> signOutCurrentSession({required String accessToken});

  Future<void> signOutAllCurrentAccountSessions({
    required String accessToken,
  });

  Future<api.SessionListResponse> listCurrentAccountSessions({
    required String accessToken,
  });

  Future<void> revokeCurrentAccountSession(
    String sessionId, {
    required String accessToken,
  });
}

class SettleoraGeneratedAuthClient implements SettleoraAuthGeneratedClient {
  const SettleoraGeneratedAuthClient(this._client);

  final api.SettleoraApiClient _client;

  @override
  Future<api.LocalSignInResponse> signInLocal(api.LocalSignInRequest request) {
    return _client.signInLocal(request);
  }

  @override
  Future<api.CurrentUserResponse> getCurrentUser({
    required String accessToken,
  }) {
    return _client.getCurrentUser(accessToken: accessToken);
  }

  @override
  Future<api.RefreshSessionResponse> refreshSession(
    api.RefreshSessionRequest request,
  ) {
    return _client.refreshSession(request);
  }

  @override
  Future<void> signOutCurrentSession({required String accessToken}) {
    return _client.signOutCurrentSession(accessToken: accessToken);
  }

  @override
  Future<void> signOutAllCurrentAccountSessions({
    required String accessToken,
  }) {
    return _client.signOutAllCurrentAccountSessions(accessToken: accessToken);
  }

  @override
  Future<api.SessionListResponse> listCurrentAccountSessions({
    required String accessToken,
  }) {
    return _client.listCurrentAccountSessions(accessToken: accessToken);
  }

  @override
  Future<void> revokeCurrentAccountSession(
    String sessionId, {
    required String accessToken,
  }) {
    return _client.revokeCurrentAccountSession(
      sessionId,
      accessToken: accessToken,
    );
  }
}

class GeneratedSettleoraAuthRepository implements SettleoraAuthRepository {
  const GeneratedSettleoraAuthRepository({required this.client});

  factory GeneratedSettleoraAuthRepository.fromConfiguration({
    required SettleoraApiConfiguration configuration,
    SettleoraGeneratedApiClientFactory clientFactory =
        const SettleoraGeneratedApiClientFactory(),
  }) {
    return GeneratedSettleoraAuthRepository(
      client: SettleoraGeneratedAuthClient(clientFactory.create(configuration)),
    );
  }

  final SettleoraAuthGeneratedClient client;

  @override
  Future<SettleoraServerSessionMaterial> signIn(
    SettleoraSignInSubmission submission,
  ) async {
    final identifier = submission.identifier.trim();
    if (identifier.isEmpty || submission.password.trim().isEmpty) {
      throw const SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.validation,
        message: 'Enter your account identifier and password.',
      );
    }

    try {
      final response = await client.signInLocal(
        api.LocalSignInRequest(
          identifier: identifier,
          password: submission.password,
        ),
      );

      return SettleoraServerSessionMaterial(
        accessToken: response.session.token,
        accessSessionExpiresAtUtc: response.session.expiresAtUtc.toUtc(),
        refreshCredential: response.refreshCredential.token,
        refreshIdleExpiresAtUtc: response.refreshCredential.idleExpiresAtUtc
            .toUtc(),
        refreshAbsoluteExpiresAtUtc: response
            .refreshCredential
            .absoluteExpiresAtUtc
            .toUtc(),
      );
    } on SettleoraAuthFailure {
      rethrow;
    } catch (error) {
      throw _mapSignInFailure(error);
    }
  }

  @override
  Future<SettleoraCurrentUser> currentUser({
    required String accessToken,
  }) async {
    final trimmed = accessToken.trim();
    if (trimmed.isEmpty) {
      throw const SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.sessionExpired,
        message: 'Your session has expired. Sign in again.',
        statusCode: 401,
      );
    }

    try {
      final response = await client.getCurrentUser(accessToken: trimmed);

      return SettleoraCurrentUser(
        displayName: response.userProfile.displayName,
        defaultCurrency: response.userProfile.defaultCurrency,
        roles: response.roles,
        sessionExpiresAtUtc: response.session.expiresAtUtc.toUtc(),
      );
    } on SettleoraAuthFailure {
      rethrow;
    } catch (error) {
      throw _mapCurrentUserFailure(error);
    }
  }

  @override
  Future<SettleoraServerSessionMaterial> refreshSession({
    required String refreshCredential,
    String? deviceLabel,
  }) async {
    final trimmed = refreshCredential.trim();
    if (trimmed.isEmpty) {
      throw const SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.sessionExpired,
        message: 'Your session has expired. Sign in again.',
        statusCode: 401,
      );
    }

    try {
      final response = await client.refreshSession(
        api.RefreshSessionRequest(
          refreshCredential: trimmed,
          deviceLabel: _optionalTrimmed(deviceLabel),
        ),
      );

      return _mapSessionMaterial(
        session: response.session,
        refreshCredential: response.refreshCredential,
      );
    } on SettleoraAuthFailure {
      rethrow;
    } catch (error) {
      throw _mapRefreshFailure(error);
    }
  }

  @override
  Future<void> signOutCurrentSession({required String accessToken}) async {
    final trimmed = _requireAccessToken(accessToken);

    try {
      await client.signOutCurrentSession(accessToken: trimmed);
    } on SettleoraAuthFailure {
      rethrow;
    } catch (error) {
      throw _mapSessionOperationFailure(error);
    }
  }

  @override
  Future<void> signOutAllCurrentAccountSessions({
    required String accessToken,
  }) async {
    final trimmed = _requireAccessToken(accessToken);

    try {
      await client.signOutAllCurrentAccountSessions(accessToken: trimmed);
    } on SettleoraAuthFailure {
      rethrow;
    } catch (error) {
      throw _mapSessionOperationFailure(error);
    }
  }

  @override
  Future<List<SettleoraSessionSummary>> listSessions({
    required String accessToken,
  }) async {
    final trimmed = _requireAccessToken(accessToken);

    try {
      final response = await client.listCurrentAccountSessions(
        accessToken: trimmed,
      );

      return response.sessions.map(_mapSessionSummary).toList(growable: false);
    } on SettleoraAuthFailure {
      rethrow;
    } catch (error) {
      throw _mapSessionOperationFailure(error);
    }
  }

  @override
  Future<void> revokeSession({
    required String sessionId,
    required String accessToken,
  }) async {
    final trimmedAccessToken = _requireAccessToken(accessToken);
    final trimmedSessionId = sessionId.trim();
    if (trimmedSessionId.isEmpty) {
      throw const SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.validation,
        message: 'Choose a session to revoke.',
      );
    }

    try {
      await client.revokeCurrentAccountSession(
        trimmedSessionId,
        accessToken: trimmedAccessToken,
      );
    } on SettleoraAuthFailure {
      rethrow;
    } catch (error) {
      throw _mapSessionOperationFailure(error);
    }
  }
}

SettleoraServerSessionMaterial _mapSessionMaterial({
  required api.RefreshSessionAccessSession session,
  required api.RefreshSessionCredential refreshCredential,
}) {
  return SettleoraServerSessionMaterial(
    accessToken: session.token,
    accessSessionExpiresAtUtc: session.expiresAtUtc.toUtc(),
    refreshCredential: refreshCredential.token,
    refreshIdleExpiresAtUtc: refreshCredential.idleExpiresAtUtc.toUtc(),
    refreshAbsoluteExpiresAtUtc: refreshCredential.absoluteExpiresAtUtc
        .toUtc(),
  );
}

SettleoraSessionSummary _mapSessionSummary(api.SessionSummary response) {
  return SettleoraSessionSummary(
    id: response.id,
    isCurrent: response.isCurrent,
    status: response.status,
    issuedAtUtc: response.issuedAtUtc.toUtc(),
    expiresAtUtc: response.expiresAtUtc.toUtc(),
    lastSeenAtUtc: response.lastSeenAtUtc?.toUtc(),
    deviceLabel: response.deviceLabel,
  );
}

String? _optionalTrimmed(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }

  return trimmed;
}

String _requireAccessToken(String accessToken) {
  final trimmed = accessToken.trim();
  if (trimmed.isEmpty) {
    throw const SettleoraAuthFailure(
      kind: SettleoraAuthFailureKind.sessionExpired,
      message: 'Your session has expired. Sign in again.',
      statusCode: 401,
    );
  }

  return trimmed;
}

SettleoraAuthFailure _mapSignInFailure(Object error) {
  if (error is api.SettleoraApiException) {
    return switch (error.statusCode) {
      400 || 422 => SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.validation,
        message: 'Check the sign-in details and try again.',
        statusCode: error.statusCode,
      ),
      401 || 403 => SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.invalidCredentials,
        message: 'Unable to sign in with the submitted information.',
        statusCode: error.statusCode,
      ),
      429 => const SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.tooManyAttempts,
        message: 'Too many sign-in attempts. Wait and try again.',
        statusCode: 429,
      ),
      >= 500 => SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.server,
        message: 'Sign-in is unavailable right now. Try again later.',
        statusCode: error.statusCode,
      ),
      _ => SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.server,
        message: 'Sign-in is unavailable right now. Try again later.',
        statusCode: error.statusCode,
      ),
    };
  }

  if (_isNetworkFailure(error)) {
    return const SettleoraAuthFailure(
      kind: SettleoraAuthFailureKind.network,
      message: 'The server is unavailable. Check the connection and try again.',
    );
  }

  return const SettleoraAuthFailure(
    kind: SettleoraAuthFailureKind.server,
    message: 'Sign-in is unavailable right now. Try again later.',
  );
}

SettleoraAuthFailure _mapCurrentUserFailure(Object error) {
  if (error is api.SettleoraApiException) {
    return switch (error.statusCode) {
      401 => const SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.sessionExpired,
        message: 'Your session has expired. Sign in again.',
        statusCode: 401,
      ),
      403 => const SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.sessionExpired,
        message: 'Your session can no longer be used. Sign in again.',
        statusCode: 403,
      ),
      404 => const SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.unavailable,
        message: 'Current user verification is unavailable. Try again later.',
        statusCode: 404,
      ),
      409 => const SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.conflict,
        message: 'Current user verification changed. Try again.',
        statusCode: 409,
      ),
      >= 500 => SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.server,
        message: 'Current user verification is unavailable. Try again later.',
        statusCode: error.statusCode,
      ),
      _ => SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.server,
        message: 'Current user verification is unavailable. Try again later.',
        statusCode: error.statusCode,
      ),
    };
  }

  if (_isNetworkFailure(error)) {
    return const SettleoraAuthFailure(
      kind: SettleoraAuthFailureKind.network,
      message: 'The server is unavailable. Check the connection and try again.',
    );
  }

  return const SettleoraAuthFailure(
    kind: SettleoraAuthFailureKind.server,
    message: 'Current user verification is unavailable. Try again later.',
  );
}

SettleoraAuthFailure _mapRefreshFailure(Object error) {
  if (error is api.SettleoraApiException) {
    return switch (error.statusCode) {
      400 || 401 || 403 || 422 => SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.sessionExpired,
        message: 'Your session has expired. Sign in again.',
        statusCode: error.statusCode,
      ),
      404 => const SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.unavailable,
        message: 'Session refresh is unavailable. Sign in again.',
        statusCode: 404,
      ),
      409 => const SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.conflict,
        message: 'Session refresh changed. Sign in again.',
        statusCode: 409,
      ),
      >= 500 => SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.server,
        message: 'Session refresh is unavailable right now. Try again later.',
        statusCode: error.statusCode,
      ),
      _ => SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.server,
        message: 'Session refresh is unavailable right now. Try again later.',
        statusCode: error.statusCode,
      ),
    };
  }

  if (_isNetworkFailure(error)) {
    return const SettleoraAuthFailure(
      kind: SettleoraAuthFailureKind.network,
      message: 'The server is unavailable. Check the connection and try again.',
    );
  }

  return const SettleoraAuthFailure(
    kind: SettleoraAuthFailureKind.server,
    message: 'Session refresh is unavailable right now. Try again later.',
  );
}

SettleoraAuthFailure _mapSessionOperationFailure(Object error) {
  if (error is api.SettleoraApiException) {
    return switch (error.statusCode) {
      400 || 422 => SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.validation,
        message: 'The session request is no longer valid. Try again.',
        statusCode: error.statusCode,
      ),
      401 => const SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.sessionExpired,
        message: 'Your session has expired. Sign in again.',
        statusCode: 401,
      ),
      403 => const SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.denied,
        message: 'This session action is not available to this account.',
        statusCode: 403,
      ),
      404 => const SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.unavailable,
        message: 'That session is no longer available.',
        statusCode: 404,
      ),
      409 => const SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.conflict,
        message: 'Session state changed. Refresh and try again.',
        statusCode: 409,
      ),
      >= 500 => SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.server,
        message: 'Session management is unavailable right now.',
        statusCode: error.statusCode,
      ),
      _ => SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.server,
        message: 'Session management is unavailable right now.',
        statusCode: error.statusCode,
      ),
    };
  }

  if (_isNetworkFailure(error)) {
    return const SettleoraAuthFailure(
      kind: SettleoraAuthFailureKind.network,
      message: 'The server is unavailable. Check the connection and try again.',
    );
  }

  return const SettleoraAuthFailure(
    kind: SettleoraAuthFailureKind.server,
    message: 'Session management is unavailable right now.',
  );
}

bool _isNetworkFailure(Object error) {
  return error is SocketException ||
      error is HttpException ||
      error is HandshakeException ||
      error is TimeoutException ||
      error is IOException;
}
