import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/password_reset_repository.dart';
import 'package:settleora_api_client/settleora_api.dart' as api;

void main() {
  group('GeneratedSettleoraPasswordResetRepository', () {
    test(
      'rejects blank reset identifiers before calling the generated client',
      () async {
        final client = FakePasswordResetGeneratedClient();
        final repository = GeneratedSettleoraPasswordResetRepository(
          client: client,
        );

        final failure = await capturePasswordResetFailure(() {
          return repository.requestReset(
            const SettleoraPasswordResetRequest(resetIdentifier: '   '),
          );
        });

        expect(failure.kind, SettleoraPasswordResetFailureKind.validation);
        expect(failure.message, 'Enter your email or username.');
        expect(client.requestCalls, 0);
      },
    );

    test('calls generated request method using only resetIdentifier', () async {
      final client = FakePasswordResetGeneratedClient();
      final repository = GeneratedSettleoraPasswordResetRepository(
        client: client,
      );

      await repository.requestReset(
        const SettleoraPasswordResetRequest(
          resetIdentifier: '  owner@example.test  ',
        ),
      );

      expect(client.requestCalls, 1);
      expect(client.lastRequest?.resetIdentifier, 'owner@example.test');
      expect(
        client.lastRequest?.toJson().keys,
        unorderedEquals(['resetIdentifier']),
      );
      expect(client.lastRequest?.toJson().keys, isNot(contains('accountId')));
      expect(client.lastRequest?.toJson().keys, isNot(contains('profileId')));
      expect(client.lastRequest?.toJson().keys, isNot(contains('provider')));
      expect(
        client.lastRequest?.toJson().keys,
        isNot(contains('resetMaterial')),
      );
      expect(client.lastRequest?.toJson().keys, isNot(contains('token')));
    });

    test('maps network and server failures to one safe message', () async {
      final serverRepository = GeneratedSettleoraPasswordResetRepository(
        client: FakePasswordResetGeneratedClient(
          failure: api.SettleoraApiException(500, 'Server error', {
            'detail':
                'smtp provider token throttle reset material generated-client /api/v1/auth/password-reset/request',
          }),
        ),
      );

      final serverFailure = await capturePasswordResetFailure(() {
        return serverRepository.requestReset(
          const SettleoraPasswordResetRequest(
            resetIdentifier: 'owner@example.test',
          ),
        );
      });

      expect(
        serverFailure.message,
        'We could not process this request right now. Try again later.',
      );
      expect(serverFailure.toString(), isNot(contains('smtp')));
      expect(serverFailure.toString(), isNot(contains('token')));

      final networkRepository = GeneratedSettleoraPasswordResetRepository(
        client: FakePasswordResetGeneratedClient(
          failure: const SocketException('raw socket detail'),
        ),
      );

      final networkFailure = await capturePasswordResetFailure(() {
        return networkRepository.requestReset(
          const SettleoraPasswordResetRequest(
            resetIdentifier: 'owner@example.test',
          ),
        );
      });

      expect(
        networkFailure.message,
        'We could not process this request right now. Try again later.',
      );
      expect(networkFailure.toString(), isNot(contains('raw socket detail')));
    });
  });
}

Future<SettleoraPasswordResetFailure> capturePasswordResetFailure(
  Future<Object?> Function() operation,
) async {
  try {
    await operation();
  } on SettleoraPasswordResetFailure catch (failure) {
    return failure;
  }

  fail('Expected SettleoraPasswordResetFailure.');
}

class FakePasswordResetGeneratedClient
    implements SettleoraPasswordResetGeneratedClient {
  FakePasswordResetGeneratedClient({this.failure});

  final Object? failure;
  int requestCalls = 0;
  api.LocalPasswordResetRequest? lastRequest;

  @override
  Future<void> requestLocalPasswordReset(
    api.LocalPasswordResetRequest request,
  ) async {
    requestCalls += 1;
    lastRequest = request;
    final failure = this.failure;
    if (failure != null) {
      throw failure;
    }
  }
}
