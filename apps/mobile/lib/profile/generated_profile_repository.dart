import 'dart:async';
import 'dart:io';

import 'package:settleora_api_client/settleora_api.dart' as api;

import '../api/settleora_api_client.dart';
import 'profile_repository.dart';

abstract interface class SettleoraProfileGeneratedClient {
  Future<api.SelfUserProfileResponse> getSelfUserProfile({
    required String accessToken,
  });

  Future<api.SelfUserProfileResponse> updateSelfUserProfile(
    api.UpdateSelfUserProfileRequest request, {
    required String accessToken,
  });

  Future<api.SelfPaymentDetailsResponse> getSelfPaymentDetails({
    required String accessToken,
  });

  Future<api.SelfPaymentDetailsResponse> updateSelfPaymentDetails(
    api.UpdateSelfPaymentDetailsRequest request, {
    required String accessToken,
  });
}

class SettleoraGeneratedProfileClient
    implements SettleoraProfileGeneratedClient {
  const SettleoraGeneratedProfileClient(this._client);

  final api.SettleoraApiClient _client;

  @override
  Future<api.SelfUserProfileResponse> getSelfUserProfile({
    required String accessToken,
  }) {
    return _client.getSelfUserProfile(accessToken: accessToken);
  }

  @override
  Future<api.SelfUserProfileResponse> updateSelfUserProfile(
    api.UpdateSelfUserProfileRequest request, {
    required String accessToken,
  }) {
    return _client.updateSelfUserProfile(request, accessToken: accessToken);
  }

  @override
  Future<api.SelfPaymentDetailsResponse> getSelfPaymentDetails({
    required String accessToken,
  }) {
    return _client.getSelfPaymentDetails(accessToken: accessToken);
  }

  @override
  Future<api.SelfPaymentDetailsResponse> updateSelfPaymentDetails(
    api.UpdateSelfPaymentDetailsRequest request, {
    required String accessToken,
  }) {
    return _client.updateSelfPaymentDetails(request, accessToken: accessToken);
  }
}

class GeneratedSettleoraProfileRepository
    implements SettleoraProfileRepository {
  GeneratedSettleoraProfileRepository({
    required SettleoraProfileGeneratedClient client,
    required SettleoraAccessTokenProvider accessTokenProvider,
  }) : _client = client,
       _accessTokenProvider = accessTokenProvider;

  factory GeneratedSettleoraProfileRepository.fromConfiguration({
    required SettleoraApiConfiguration configuration,
    required SettleoraAccessTokenProvider accessTokenProvider,
    SettleoraGeneratedApiClientFactory clientFactory =
        const SettleoraGeneratedApiClientFactory(),
  }) {
    return GeneratedSettleoraProfileRepository(
      client: SettleoraGeneratedProfileClient(
        clientFactory.create(configuration),
      ),
      accessTokenProvider: accessTokenProvider,
    );
  }

  final SettleoraProfileGeneratedClient _client;
  final SettleoraAccessTokenProvider _accessTokenProvider;

  @override
  Future<SettleoraSelfProfile> getSelfProfile() {
    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.getSelfUserProfile(
          accessToken: accessToken,
        );
        return _mapProfile(response);
      } on SettleoraProfileFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraSelfProfile> updateSelfProfile(
    SettleoraSelfProfileUpdate update,
  ) {
    final displayName = _requiredTrimmed(
      update.displayName,
      maxLength: 160,
      blankMessage: 'Enter a display name.',
      tooLongMessage: 'Display name must be 160 characters or fewer.',
    );
    final defaultCurrency = _normalizeCurrency(update.defaultCurrency);

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.updateSelfUserProfile(
          api.UpdateSelfUserProfileRequest(
            displayName: displayName,
            defaultCurrency: defaultCurrency,
          ),
          accessToken: accessToken,
        );
        return _mapProfile(response);
      } on SettleoraProfileFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraSelfPaymentDetails> getSelfPaymentDetails() {
    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.getSelfPaymentDetails(
          accessToken: accessToken,
        );
        return _mapPaymentDetails(response);
      } on SettleoraProfileFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraSelfPaymentDetails> updateSelfPaymentDetails(
    SettleoraSelfPaymentDetailsUpdate update,
  ) {
    final preferredMethodLabel = _optionalTrimmed(
      update.preferredMethodLabel,
      maxLength: 120,
      tooLongMessage: 'Payment method must be 120 characters or fewer.',
    );
    final paymentHandle = _optionalTrimmed(
      update.paymentHandle,
      maxLength: 320,
      tooLongMessage: 'Payment handle must be 320 characters or fewer.',
    );
    final paymentNote = _optionalTrimmed(
      update.paymentNote,
      maxLength: 1000,
      tooLongMessage: 'Payment note must be 1000 characters or fewer.',
    );
    final visibility = update.visibility.trim();
    if (!SettleoraPaymentDetailsVisibilityValues.values.contains(visibility)) {
      throw const SettleoraProfileFailure(
        kind: SettleoraProfileFailureKind.validation,
        message: 'Choose a supported payment visibility.',
      );
    }

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.updateSelfPaymentDetails(
          api.UpdateSelfPaymentDetailsRequest(
            preferredMethodLabel: preferredMethodLabel,
            paymentHandle: paymentHandle,
            paymentNote: paymentNote,
            visibility: visibility,
          ),
          accessToken: accessToken,
        );
        return _mapPaymentDetails(response);
      } on SettleoraProfileFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  Future<T> _withAccessToken<T>(
    Future<T> Function(String accessToken) operation,
  ) async {
    final accessToken = await _readAccessToken();
    if (accessToken == null) {
      throw const SettleoraProfileFailure(
        kind: SettleoraProfileFailureKind.sessionRequired,
        message: 'Sign in before loading account details.',
      );
    }

    return operation(accessToken);
  }

  Future<String?> _readAccessToken() async {
    try {
      final accessToken = await _accessTokenProvider.accessToken();
      final trimmed = accessToken?.trim();
      if (trimmed == null || trimmed.isEmpty) {
        return null;
      }

      return trimmed;
    } catch (_) {
      return null;
    }
  }
}

SettleoraSelfProfile _mapProfile(api.SelfUserProfileResponse response) {
  return SettleoraSelfProfile(
    id: response.id,
    displayName: response.displayName,
    defaultCurrency: response.defaultCurrency,
    createdAtUtc: response.createdAtUtc.toUtc(),
    updatedAtUtc: response.updatedAtUtc.toUtc(),
  );
}

SettleoraSelfPaymentDetails _mapPaymentDetails(
  api.SelfPaymentDetailsResponse response,
) {
  final qrFile = response.qrFile;

  return SettleoraSelfPaymentDetails(
    isConfigured: response.isConfigured,
    id: response.id,
    preferredMethodLabel: response.preferredMethodLabel,
    paymentHandle: response.paymentHandle,
    paymentNote: response.paymentNote,
    visibility: response.visibility,
    qrFile: qrFile == null
        ? null
        : SettleoraSelfPaymentQrFile(
            contentType: qrFile.contentType,
            sizeBytes: qrFile.sizeBytes,
            updatedAtUtc: qrFile.updatedAtUtc.toUtc(),
          ),
    createdAtUtc: response.createdAtUtc?.toUtc(),
    updatedAtUtc: response.updatedAtUtc?.toUtc(),
  );
}

SettleoraProfileFailure _mapFailure(Object error) {
  if (error is api.SettleoraApiException) {
    return switch (error.statusCode) {
      400 || 422 => SettleoraProfileFailure(
        kind: SettleoraProfileFailureKind.validation,
        message:
            'The account details are no longer valid. Refresh and try again.',
        statusCode: error.statusCode,
      ),
      401 => const SettleoraProfileFailure(
        kind: SettleoraProfileFailureKind.sessionExpired,
        message:
            'Your session has expired. Sign in again before loading account details.',
        statusCode: 401,
      ),
      403 => const SettleoraProfileFailure(
        kind: SettleoraProfileFailureKind.denied,
        message: 'Account details are not available to this session.',
        statusCode: 403,
      ),
      404 || 410 => SettleoraProfileFailure(
        kind: SettleoraProfileFailureKind.unavailable,
        message: 'Account details are no longer available.',
        statusCode: error.statusCode,
      ),
      409 => const SettleoraProfileFailure(
        kind: SettleoraProfileFailureKind.conflict,
        message: 'Refresh account details and try again.',
        statusCode: 409,
      ),
      >= 500 => SettleoraProfileFailure(
        kind: SettleoraProfileFailureKind.server,
        message: 'Account details are unavailable right now. Try again later.',
        statusCode: error.statusCode,
      ),
      _ => SettleoraProfileFailure(
        kind: SettleoraProfileFailureKind.server,
        message: 'Account details are unavailable right now. Try again later.',
        statusCode: error.statusCode,
      ),
    };
  }

  if (error is SocketException ||
      error is HttpException ||
      error is HandshakeException ||
      error is TimeoutException ||
      error is IOException) {
    return const SettleoraProfileFailure(
      kind: SettleoraProfileFailureKind.network,
      message:
          'The server is unavailable. Try again when the connection is back.',
    );
  }

  return const SettleoraProfileFailure(
    kind: SettleoraProfileFailureKind.server,
    message: 'Account details are unavailable right now. Try again later.',
  );
}

String _requiredTrimmed(
  String value, {
  required int maxLength,
  required String blankMessage,
  required String tooLongMessage,
}) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    throw SettleoraProfileFailure(
      kind: SettleoraProfileFailureKind.validation,
      message: blankMessage,
    );
  }

  if (trimmed.length > maxLength) {
    throw SettleoraProfileFailure(
      kind: SettleoraProfileFailureKind.validation,
      message: tooLongMessage,
    );
  }

  return trimmed;
}

String? _optionalTrimmed(
  String? value, {
  required int maxLength,
  required String tooLongMessage,
}) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }

  if (trimmed.length > maxLength) {
    throw SettleoraProfileFailure(
      kind: SettleoraProfileFailureKind.validation,
      message: tooLongMessage,
    );
  }

  return trimmed;
}

String? _normalizeCurrency(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }

  final upper = trimmed.toUpperCase();
  final isCurrencyLike = RegExp(r'^[A-Z]{3}$').hasMatch(upper);
  if (!isCurrencyLike) {
    throw const SettleoraProfileFailure(
      kind: SettleoraProfileFailureKind.validation,
      message: 'Use a 3-letter currency code such as USD.',
    );
  }

  return upper;
}
