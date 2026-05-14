import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/auth_session_repository.dart';
import 'package:settleora_api_client/settleora_api.dart' as api;

void main() {
  group('GeneratedSettleoraAuthRepository', () {
    test(
      'rejects blank sign-in input before calling the generated client',
      () async {
        final client = FakeAuthGeneratedClient();
        final repository = GeneratedSettleoraAuthRepository(client: client);

        final failure = await captureAuthFailure(() {
          return repository.signIn(
            const SettleoraSignInSubmission(
              identifier: '   ',
              password: 'redacted-password',
            ),
          );
        });

        expect(failure.kind, SettleoraAuthFailureKind.validation);
        expect(client.signInCalls, 0);
      },
    );

    test('maps sign-in success into secure session material', () async {
      final client = FakeAuthGeneratedClient();
      final repository = GeneratedSettleoraAuthRepository(client: client);

      final session = await repository.signIn(
        const SettleoraSignInSubmission(
          identifier: '  owner@example.test  ',
          password: 'redacted-password',
        ),
      );

      expect(client.signInCalls, 1);
      expect(client.lastSignInRequest?.identifier, 'owner@example.test');
      expect(client.lastSignInRequest?.password, 'redacted-password');
      expect(
        client.lastSignInRequest?.toJson().keys,
        unorderedEquals(['identifier', 'password']),
      );
      expect(
        client.lastSignInRequest?.toJson().keys,
        isNot(
          containsAll([
            'actorId',
            'groupId',
            'storagePath',
            'receiptId',
            'splitAllocations',
            'settlementId',
          ]),
        ),
      );
      expect(session.accessToken, _accessToken);
      expect(session.accessSessionExpiresAtUtc, _accessExpiresAt);
      expect(session.refreshCredential, _refreshCredential);
      expect(session.refreshIdleExpiresAtUtc, _refreshIdleExpiresAt);
      expect(session.refreshAbsoluteExpiresAtUtc, _refreshAbsoluteExpiresAt);
      expect(session.toString(), isNot(contains(_accessToken)));
      expect(session.toString(), isNot(contains(_refreshCredential)));
    });

    test('bootstraps current user with a trimmed access token', () async {
      final client = FakeAuthGeneratedClient();
      final repository = GeneratedSettleoraAuthRepository(client: client);

      final currentUser = await repository.currentUser(
        accessToken: '  $_accessToken  ',
      );

      expect(client.currentUserCalls, 1);
      expect(client.lastAccessToken, _accessToken);
      expect(currentUser.displayName, 'Taylor');
      expect(currentUser.defaultCurrency, 'USD');
      expect(currentUser.sessionExpiresAtUtc, _accessExpiresAt);
      expect(currentUser.toString(), isNot(contains(_accessToken)));
    });

    test('maps denied sign-in and network failures to safe failures', () async {
      final denied = GeneratedSettleoraAuthRepository(
        client: FakeAuthGeneratedClient(
          signInFailure: api.SettleoraApiException(401, 'Unauthorized', {
            'detail': 'internal auth detail $_accessToken',
          }),
        ),
      );

      final deniedFailure = await captureAuthFailure(() {
        return denied.signIn(
          const SettleoraSignInSubmission(
            identifier: 'owner@example.test',
            password: 'redacted-password',
          ),
        );
      });

      expect(deniedFailure.kind, SettleoraAuthFailureKind.invalidCredentials);
      expect(deniedFailure.message, isNot(contains('internal auth detail')));
      expect(deniedFailure.message, isNot(contains(_accessToken)));
      expect(deniedFailure.toString(), isNot(contains(_accessToken)));

      final network = GeneratedSettleoraAuthRepository(
        client: FakeAuthGeneratedClient(
          signInFailure: const SocketException('internal socket detail'),
        ),
      );

      final networkFailure = await captureAuthFailure(() {
        return network.signIn(
          const SettleoraSignInSubmission(
            identifier: 'owner@example.test',
            password: 'redacted-password',
          ),
        );
      });

      expect(networkFailure.kind, SettleoraAuthFailureKind.network);
      expect(networkFailure.message, isNot(contains('internal socket detail')));
    });

    test('maps invalid current-user sessions to sign-in again', () async {
      final repository = GeneratedSettleoraAuthRepository(
        client: FakeAuthGeneratedClient(
          currentUserFailure: api.SettleoraApiException(401, 'Unauthorized', {
            'detail': 'raw problem body',
          }),
        ),
      );

      final failure = await captureAuthFailure(() {
        return repository.currentUser(accessToken: _accessToken);
      });

      expect(failure.kind, SettleoraAuthFailureKind.sessionExpired);
      expect(failure.statusCode, 401);
      expect(failure.message, isNot(contains('raw problem body')));
    });
  });
}

Future<SettleoraAuthFailure> captureAuthFailure(
  Future<Object?> Function() operation,
) async {
  try {
    await operation();
  } on SettleoraAuthFailure catch (failure) {
    return failure;
  }

  fail('Expected SettleoraAuthFailure.');
}

class FakeAuthGeneratedClient implements SettleoraAuthGeneratedClient {
  FakeAuthGeneratedClient({
    this.signInFailure,
    this.currentUserFailure,
    api.LocalSignInResponse? signInResponse,
    api.CurrentUserResponse? currentUserResponse,
  }) : signInResponse = signInResponse ?? sampleSignInResponse(),
       currentUserResponse = currentUserResponse ?? sampleCurrentUserResponse();

  final Object? signInFailure;
  final Object? currentUserFailure;
  final api.LocalSignInResponse signInResponse;
  final api.CurrentUserResponse currentUserResponse;
  int signInCalls = 0;
  int currentUserCalls = 0;
  api.LocalSignInRequest? lastSignInRequest;
  String? lastAccessToken;

  @override
  Future<api.LocalSignInResponse> signInLocal(
    api.LocalSignInRequest request,
  ) async {
    signInCalls += 1;
    lastSignInRequest = request;
    final failure = signInFailure;
    if (failure != null) {
      throw failure;
    }

    return signInResponse;
  }

  @override
  Future<api.CurrentUserResponse> getCurrentUser({
    required String accessToken,
  }) async {
    currentUserCalls += 1;
    lastAccessToken = accessToken;
    final failure = currentUserFailure;
    if (failure != null) {
      throw failure;
    }

    return currentUserResponse;
  }
}

api.LocalSignInResponse sampleSignInResponse() {
  return api.LocalSignInResponse(
    session: api.RefreshSessionAccessSession(
      id: 'session-id-not-stored',
      token: _accessToken,
      expiresAtUtc: _accessExpiresAt,
    ),
    refreshCredential: api.RefreshSessionCredential(
      token: _refreshCredential,
      idleExpiresAtUtc: _refreshIdleExpiresAt,
      absoluteExpiresAtUtc: _refreshAbsoluteExpiresAt,
    ),
  );
}

api.CurrentUserResponse sampleCurrentUserResponse() {
  return api.CurrentUserResponse(
    authAccountId: 'auth-account-id-not-displayed',
    userProfile: const api.CurrentUserProfile(
      id: 'user-profile-id-not-displayed',
      displayName: 'Taylor',
      defaultCurrency: 'USD',
    ),
    session: api.CurrentUserSession(
      id: 'session-id-not-displayed',
      expiresAtUtc: _accessExpiresAt,
    ),
    roles: const ['user'],
  );
}

const _accessToken = 'raw-access-token';
const _refreshCredential = 'raw-refresh-token';
final _accessExpiresAt = DateTime.utc(2026, 5, 15, 12);
final _refreshIdleExpiresAt = DateTime.utc(2026, 5, 16, 12);
final _refreshAbsoluteExpiresAt = DateTime.utc(2026, 6, 14, 12);
