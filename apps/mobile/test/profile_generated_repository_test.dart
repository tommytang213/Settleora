import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/settleora_api_client.dart';
import 'package:mobile/profile/generated_profile_repository.dart';
import 'package:mobile/profile/profile_repository.dart';
import 'package:settleora_api_client/settleora_api.dart' as api;

void main() {
  group('GeneratedSettleoraProfileRepository', () {
    test('requires a session before calling the generated client', () async {
      final client = FakeProfileGeneratedClient();
      final repository = GeneratedSettleoraProfileRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider(null),
      );

      final failure = await captureProfileFailure(() {
        return repository.getSelfProfile();
      });

      expect(failure.kind, SettleoraProfileFailureKind.sessionRequired);
      expect(client.profileReadCalls, 0);
    });

    test('maps generated self profile and payment details safely', () async {
      final tokenProvider = FakeAccessTokenProvider('  redacted-token  ');
      final client = FakeProfileGeneratedClient();
      final repository = GeneratedSettleoraProfileRepository(
        client: client,
        accessTokenProvider: tokenProvider,
      );

      final profile = await repository.getSelfProfile();
      final paymentDetails = await repository.getSelfPaymentDetails();
      final updatedProfile = await repository.updateSelfProfile(
        const SettleoraSelfProfileUpdate(
          displayName: '  Morgan  ',
          defaultCurrency: ' usd ',
        ),
      );
      final updatedPaymentDetails = await repository.updateSelfPaymentDetails(
        const SettleoraSelfPaymentDetailsUpdate(
          preferredMethodLabel: '  FPS  ',
          paymentHandle: '   ',
          paymentNote: '  Thanks for settling.  ',
          visibility: SettleoraPaymentDetailsVisibilityValues.private,
        ),
      );

      expect(profile.displayName, 'Taylor');
      expect(paymentDetails.preferredMethodLabel, 'Bank transfer');
      expect(paymentDetails.qrFile?.contentType, 'image/png');
      expect(paymentDetails.qrFile?.sizeBytes, 2048);
      expect(updatedProfile.displayName, 'Taylor');
      expect(updatedPaymentDetails.isConfigured, isTrue);
      expect(client.accessTokens, [
        'redacted-token',
        'redacted-token',
        'redacted-token',
        'redacted-token',
      ]);
      expect(tokenProvider.calls, 4);
      expect(client.lastProfileUpdate?.toJson(), {
        'displayName': 'Morgan',
        'defaultCurrency': 'USD',
      });
      expect(client.lastPaymentUpdate?.toJson(), {
        'preferredMethodLabel': 'FPS',
        'paymentHandle': null,
        'paymentNote': 'Thanks for settling.',
        'visibility': SettleoraPaymentDetailsVisibilityValues.private,
      });
      expect(
        client.lastPaymentUpdate?.toJson().keys,
        isNot(
          containsAll([
            'userProfileId',
            'authAccountId',
            'storagePath',
            'providerObjectKey',
            'qrFileId',
          ]),
        ),
      );
    });

    test('validates profile updates before generated calls', () async {
      final client = FakeProfileGeneratedClient();
      final repository = GeneratedSettleoraProfileRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider('redacted-token'),
      );

      final blankFailure = await captureProfileFailure(() {
        return repository.updateSelfProfile(
          const SettleoraSelfProfileUpdate(
            displayName: '   ',
            defaultCurrency: 'USD',
          ),
        );
      });
      final currencyFailure = await captureProfileFailure(() {
        return repository.updateSelfProfile(
          const SettleoraSelfProfileUpdate(
            displayName: 'Taylor',
            defaultCurrency: 'USDD',
          ),
        );
      });

      expect(blankFailure.kind, SettleoraProfileFailureKind.validation);
      expect(blankFailure.message, 'Enter a display name.');
      expect(currencyFailure.kind, SettleoraProfileFailureKind.validation);
      expect(client.profileUpdateCalls, 0);
    });

    test('maps generated failures to bounded safe failures', () async {
      final repository = GeneratedSettleoraProfileRepository(
        client: FakeProfileGeneratedClient(
          failure: api.SettleoraApiException(401, 'Unauthorized', {
            'detail': 'hidden payment handle',
          }),
        ),
        accessTokenProvider: FakeAccessTokenProvider('redacted-token'),
      );

      final failure = await captureProfileFailure(() {
        return repository.getSelfPaymentDetails();
      });

      expect(failure.kind, SettleoraProfileFailureKind.sessionExpired);
      expect(failure.statusCode, 401);
      expect(failure.message, isNot(contains('hidden payment handle')));
      expect(failure.toString(), isNot(contains('hidden payment handle')));
    });

    test('maps network errors to safe retry text', () async {
      final repository = GeneratedSettleoraProfileRepository(
        client: FakeProfileGeneratedClient(
          failure: const SocketException('raw socket detail'),
        ),
        accessTokenProvider: FakeAccessTokenProvider('redacted-token'),
      );

      final failure = await captureProfileFailure(() {
        return repository.getSelfProfile();
      });

      expect(failure.kind, SettleoraProfileFailureKind.network);
      expect(failure.message, isNot(contains('raw socket detail')));
    });
  });
}

Future<SettleoraProfileFailure> captureProfileFailure(
  Future<Object?> Function() operation,
) async {
  try {
    await operation();
  } on SettleoraProfileFailure catch (failure) {
    return failure;
  }

  fail('Expected SettleoraProfileFailure.');
}

class FakeAccessTokenProvider implements SettleoraAccessTokenProvider {
  FakeAccessTokenProvider(this._accessToken);

  final String? _accessToken;
  int calls = 0;

  @override
  Future<String?> accessToken() async {
    calls += 1;
    return _accessToken;
  }
}

class FakeProfileGeneratedClient implements SettleoraProfileGeneratedClient {
  FakeProfileGeneratedClient({this.failure});

  final Object? failure;
  final accessTokens = <String>[];
  int profileReadCalls = 0;
  int profileUpdateCalls = 0;
  int paymentReadCalls = 0;
  int paymentUpdateCalls = 0;
  api.UpdateSelfUserProfileRequest? lastProfileUpdate;
  api.UpdateSelfPaymentDetailsRequest? lastPaymentUpdate;

  @override
  Future<api.SelfUserProfileResponse> getSelfUserProfile({
    required String accessToken,
  }) async {
    profileReadCalls += 1;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return sampleApiProfile();
  }

  @override
  Future<api.SelfUserProfileResponse> updateSelfUserProfile(
    api.UpdateSelfUserProfileRequest request, {
    required String accessToken,
  }) async {
    profileUpdateCalls += 1;
    lastProfileUpdate = request;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return sampleApiProfile();
  }

  @override
  Future<api.SelfPaymentDetailsResponse> getSelfPaymentDetails({
    required String accessToken,
  }) async {
    paymentReadCalls += 1;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return sampleApiPaymentDetails();
  }

  @override
  Future<api.SelfPaymentDetailsResponse> updateSelfPaymentDetails(
    api.UpdateSelfPaymentDetailsRequest request, {
    required String accessToken,
  }) async {
    paymentUpdateCalls += 1;
    lastPaymentUpdate = request;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return sampleApiPaymentDetails();
  }

  void _throwIfNeeded() {
    final error = failure;
    if (error != null) {
      throw error;
    }
  }
}

api.SelfUserProfileResponse sampleApiProfile() {
  return api.SelfUserProfileResponse(
    id: _profileId,
    displayName: 'Taylor',
    defaultCurrency: 'USD',
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

api.SelfPaymentDetailsResponse sampleApiPaymentDetails() {
  return api.SelfPaymentDetailsResponse(
    isConfigured: true,
    id: _paymentProfileId,
    preferredMethodLabel: 'Bank transfer',
    paymentHandle: 'pay.example/taylor',
    paymentNote: null,
    visibility: api.PaymentDetailsVisibilityValues.settlementCounterpartiesOnly,
    qrFile: api.SelfPaymentDetailsQrFileResponse(
      id: _qrFileId,
      contentType: 'image/png',
      sizeBytes: 2048,
      updatedAtUtc: _updatedAtUtc,
    ),
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

const _profileId = '11111111-1111-1111-1111-111111111111';
const _paymentProfileId = '22222222-2222-2222-2222-222222222222';
const _qrFileId = '33333333-3333-3333-3333-333333333333';
final _createdAtUtc = DateTime.utc(2026, 5, 18, 9);
final _updatedAtUtc = DateTime.utc(2026, 5, 18, 10);
