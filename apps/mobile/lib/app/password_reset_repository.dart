import 'dart:io';

import 'package:settleora_api_client/settleora_api.dart' as api;

import '../api/settleora_api_client.dart';

class SettleoraPasswordResetRequest {
  const SettleoraPasswordResetRequest({required this.resetIdentifier});

  final String resetIdentifier;
}

enum SettleoraPasswordResetFailureKind { validation, unavailable }

class SettleoraPasswordResetFailure implements Exception {
  const SettleoraPasswordResetFailure({
    required this.kind,
    required this.message,
  });

  final SettleoraPasswordResetFailureKind kind;
  final String message;

  String get title {
    return switch (kind) {
      SettleoraPasswordResetFailureKind.validation => 'Check reset details',
      SettleoraPasswordResetFailureKind.unavailable => 'Request unavailable',
    };
  }

  @override
  String toString() {
    return 'SettleoraPasswordResetFailure($kind)';
  }
}

abstract interface class SettleoraPasswordResetRepository {
  Future<void> requestReset(SettleoraPasswordResetRequest request);
}

abstract interface class SettleoraPasswordResetGeneratedClient {
  Future<void> requestLocalPasswordReset(api.LocalPasswordResetRequest request);
}

class SettleoraGeneratedPasswordResetClient
    implements SettleoraPasswordResetGeneratedClient {
  const SettleoraGeneratedPasswordResetClient(this._client);

  final api.SettleoraApiClient _client;

  @override
  Future<void> requestLocalPasswordReset(
    api.LocalPasswordResetRequest request,
  ) {
    return _client.requestLocalPasswordReset(request);
  }
}

class GeneratedSettleoraPasswordResetRepository
    implements SettleoraPasswordResetRepository {
  const GeneratedSettleoraPasswordResetRepository({required this.client});

  factory GeneratedSettleoraPasswordResetRepository.fromConfiguration({
    required SettleoraApiConfiguration configuration,
    SettleoraGeneratedApiClientFactory clientFactory =
        const SettleoraGeneratedApiClientFactory(),
  }) {
    return GeneratedSettleoraPasswordResetRepository(
      client: SettleoraGeneratedPasswordResetClient(
        clientFactory.create(configuration),
      ),
    );
  }

  final SettleoraPasswordResetGeneratedClient client;

  @override
  Future<void> requestReset(SettleoraPasswordResetRequest request) async {
    final resetIdentifier = request.resetIdentifier.trim();
    if (resetIdentifier.isEmpty) {
      throw const SettleoraPasswordResetFailure(
        kind: SettleoraPasswordResetFailureKind.validation,
        message: 'Enter your email or username.',
      );
    }

    try {
      await client.requestLocalPasswordReset(
        api.LocalPasswordResetRequest(resetIdentifier: resetIdentifier),
      );
    } on SettleoraPasswordResetFailure {
      rethrow;
    } catch (error) {
      throw _mapPasswordResetFailure(error);
    }
  }
}

SettleoraPasswordResetFailure _mapPasswordResetFailure(Object error) {
  if (error is api.SettleoraApiException || _isNetworkFailure(error)) {
    return const SettleoraPasswordResetFailure(
      kind: SettleoraPasswordResetFailureKind.unavailable,
      message: 'We could not process this request right now. Try again later.',
    );
  }

  return const SettleoraPasswordResetFailure(
    kind: SettleoraPasswordResetFailureKind.unavailable,
    message: 'We could not process this request right now. Try again later.',
  );
}

bool _isNetworkFailure(Object error) {
  return error is SocketException || error is HttpException;
}
