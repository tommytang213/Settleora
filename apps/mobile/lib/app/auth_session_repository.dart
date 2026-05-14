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

enum SettleoraAuthFailureKind {
  validation,
  invalidCredentials,
  tooManyAttempts,
  sessionExpired,
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
      SettleoraAuthFailureKind.network => 'Server unavailable',
      SettleoraAuthFailureKind.server => 'Sign-in unavailable',
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
}

abstract interface class SettleoraAuthGeneratedClient {
  Future<api.LocalSignInResponse> signInLocal(api.LocalSignInRequest request);

  Future<api.CurrentUserResponse> getCurrentUser({required String accessToken});
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

bool _isNetworkFailure(Object error) {
  return error is SocketException ||
      error is HttpException ||
      error is HandshakeException ||
      error is TimeoutException ||
      error is IOException;
}
