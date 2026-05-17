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

    test('refresh rotates session material through the generated client', () async {
      final client = FakeAuthGeneratedClient();
      final repository = GeneratedSettleoraAuthRepository(client: client);

      final session = await repository.refreshSession(
        refreshCredential: '  $_refreshCredential  ',
      );

      expect(client.refreshCalls, 1);
      expect(client.lastRefreshRequest?.refreshCredential, _refreshCredential);
      expect(session.accessToken, _accessToken);
      expect(session.refreshCredential, _refreshCredential);
      expect(session.toString(), isNot(contains(_accessToken)));
      expect(session.toString(), isNot(contains(_refreshCredential)));
    });

    test('lists and revokes sessions through generated methods', () async {
      final client = FakeAuthGeneratedClient();
      final repository = GeneratedSettleoraAuthRepository(client: client);

      final sessions = await repository.listSessions(
        accessToken: '  $_accessToken  ',
      );

      expect(client.listSessionCalls, 1);
      expect(client.lastAccessToken, _accessToken);
      expect(sessions, hasLength(2));
      expect(sessions.first.isCurrent, isTrue);
      expect(sessions.first.displayLabel, 'This device');
      expect(sessions.last.displayLabel, 'Tablet');
      expect(sessions.last.toString(), isNot(contains(_otherSessionId)));

      await repository.revokeSession(
        sessionId: '  $_otherSessionId  ',
        accessToken: _accessToken,
      );

      expect(client.revokeSessionCalls, 1);
      expect(client.lastRevokedSessionId, _otherSessionId);

      await repository.signOutCurrentSession(accessToken: _accessToken);
      await repository.signOutAllCurrentAccountSessions(
        accessToken: _accessToken,
      );

      expect(client.signOutCurrentCalls, 1);
      expect(client.signOutAllCalls, 1);
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

    test('maps refresh and session failures without raw material', () async {
      final refreshDenied = GeneratedSettleoraAuthRepository(
        client: FakeAuthGeneratedClient(
          refreshFailure: api.SettleoraApiException(401, 'Unauthorized', {
            'detail': 'raw refresh detail $_refreshCredential',
          }),
        ),
      );

      final refreshFailure = await captureAuthFailure(() {
        return refreshDenied.refreshSession(
          refreshCredential: _refreshCredential,
        );
      });

      expect(refreshFailure.kind, SettleoraAuthFailureKind.sessionExpired);
      expect(refreshFailure.message, isNot(contains(_refreshCredential)));
      expect(refreshFailure.toString(), isNot(contains(_refreshCredential)));

      final revokeConflict = GeneratedSettleoraAuthRepository(
        client: FakeAuthGeneratedClient(
          sessionOperationFailure: api.SettleoraApiException(409, 'Conflict', {
            'detail': 'internal session detail $_otherSessionId',
          }),
        ),
      );

      final revokeFailure = await captureAuthFailure(() {
        return revokeConflict.revokeSession(
          sessionId: _otherSessionId,
          accessToken: _accessToken,
        );
      });

      expect(revokeFailure.kind, SettleoraAuthFailureKind.conflict);
      expect(revokeFailure.message, isNot(contains(_otherSessionId)));
      expect(revokeFailure.toString(), isNot(contains(_otherSessionId)));
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
    this.refreshFailure,
    this.sessionOperationFailure,
    api.LocalSignInResponse? signInResponse,
    api.CurrentUserResponse? currentUserResponse,
    api.RefreshSessionResponse? refreshResponse,
    api.SessionListResponse? sessionListResponse,
  }) : signInResponse = signInResponse ?? sampleSignInResponse(),
       currentUserResponse = currentUserResponse ?? sampleCurrentUserResponse(),
       refreshResponse = refreshResponse ?? sampleRefreshResponse(),
       sessionListResponse = sessionListResponse ?? sampleSessionListResponse();

  final Object? signInFailure;
  final Object? currentUserFailure;
  final Object? refreshFailure;
  final Object? sessionOperationFailure;
  final api.LocalSignInResponse signInResponse;
  final api.CurrentUserResponse currentUserResponse;
  final api.RefreshSessionResponse refreshResponse;
  final api.SessionListResponse sessionListResponse;
  int signInCalls = 0;
  int currentUserCalls = 0;
  int refreshCalls = 0;
  int signOutCurrentCalls = 0;
  int signOutAllCalls = 0;
  int listSessionCalls = 0;
  int revokeSessionCalls = 0;
  api.LocalSignInRequest? lastSignInRequest;
  api.RefreshSessionRequest? lastRefreshRequest;
  String? lastAccessToken;
  String? lastRevokedSessionId;

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

  @override
  Future<api.RefreshSessionResponse> refreshSession(
    api.RefreshSessionRequest request,
  ) async {
    refreshCalls += 1;
    lastRefreshRequest = request;
    final failure = refreshFailure;
    if (failure != null) {
      throw failure;
    }

    return refreshResponse;
  }

  @override
  Future<void> signOutCurrentSession({required String accessToken}) async {
    signOutCurrentCalls += 1;
    lastAccessToken = accessToken;
    _throwSessionOperationFailure();
  }

  @override
  Future<void> signOutAllCurrentAccountSessions({
    required String accessToken,
  }) async {
    signOutAllCalls += 1;
    lastAccessToken = accessToken;
    _throwSessionOperationFailure();
  }

  @override
  Future<api.SessionListResponse> listCurrentAccountSessions({
    required String accessToken,
  }) async {
    listSessionCalls += 1;
    lastAccessToken = accessToken;
    _throwSessionOperationFailure();
    return sessionListResponse;
  }

  @override
  Future<void> revokeCurrentAccountSession(
    String sessionId, {
    required String accessToken,
  }) async {
    revokeSessionCalls += 1;
    lastRevokedSessionId = sessionId;
    lastAccessToken = accessToken;
    _throwSessionOperationFailure();
  }

  void _throwSessionOperationFailure() {
    final failure = sessionOperationFailure;
    if (failure != null) {
      throw failure;
    }
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

api.RefreshSessionResponse sampleRefreshResponse() {
  return api.RefreshSessionResponse(
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

api.SessionListResponse sampleSessionListResponse() {
  return api.SessionListResponse(
    sessions: [
      api.SessionSummary(
        id: 'current-session-id-not-displayed',
        isCurrent: true,
        status: 'active',
        issuedAtUtc: DateTime.utc(2026, 5, 14, 12),
        expiresAtUtc: _accessExpiresAt,
        lastSeenAtUtc: DateTime.utc(2026, 5, 14, 12, 30),
        deviceLabel: null,
      ),
      api.SessionSummary(
        id: _otherSessionId,
        isCurrent: false,
        status: 'active',
        issuedAtUtc: DateTime.utc(2026, 5, 13, 12),
        expiresAtUtc: _accessExpiresAt,
        lastSeenAtUtc: DateTime.utc(2026, 5, 14, 10),
        deviceLabel: 'Tablet',
      ),
    ],
  );
}

const _accessToken = 'redacted-access-material';
const _refreshCredential = 'redacted-refresh-material';
const _otherSessionId = 'other-session-id-not-displayed';
final _accessExpiresAt = DateTime.utc(2026, 5, 15, 12);
final _refreshIdleExpiresAt = DateTime.utc(2026, 5, 16, 12);
final _refreshAbsoluteExpiresAt = DateTime.utc(2026, 6, 14, 12);
