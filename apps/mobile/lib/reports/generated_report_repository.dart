import 'dart:async';
import 'dart:io';

import 'package:settleora_api_client/settleora_api.dart' as api;

import '../api/settleora_api_client.dart';
import 'report_repository.dart';

abstract interface class SettleoraMonthlyReportGeneratedClient {
  Future<api.MonthlyReportResponse> getMonthlyReport({
    required String month,
    String? groupId,
    required String accessToken,
  });
}

class SettleoraGeneratedMonthlyReportClient
    implements SettleoraMonthlyReportGeneratedClient {
  const SettleoraGeneratedMonthlyReportClient(this._client);

  final api.SettleoraApiClient _client;

  @override
  Future<api.MonthlyReportResponse> getMonthlyReport({
    required String month,
    String? groupId,
    required String accessToken,
  }) {
    return _client.getMonthlyReport(
      month: month,
      groupId: groupId,
      accessToken: accessToken,
    );
  }
}

class GeneratedSettleoraMonthlyReportRepository
    implements SettleoraMonthlyReportRepository {
  GeneratedSettleoraMonthlyReportRepository({
    required SettleoraMonthlyReportGeneratedClient client,
    required SettleoraAccessTokenProvider accessTokenProvider,
  }) : _client = client,
       _accessTokenProvider = accessTokenProvider;

  factory GeneratedSettleoraMonthlyReportRepository.fromConfiguration({
    required SettleoraApiConfiguration configuration,
    required SettleoraAccessTokenProvider accessTokenProvider,
    SettleoraGeneratedApiClientFactory clientFactory =
        const SettleoraGeneratedApiClientFactory(),
  }) {
    return GeneratedSettleoraMonthlyReportRepository(
      client: SettleoraGeneratedMonthlyReportClient(
        clientFactory.create(configuration),
      ),
      accessTokenProvider: accessTokenProvider,
    );
  }

  final SettleoraMonthlyReportGeneratedClient _client;
  final SettleoraAccessTokenProvider _accessTokenProvider;

  @override
  Future<SettleoraMonthlyReport> getMonthlyReport({
    required String month,
    String? groupId,
  }) {
    final normalizedMonth = normalizeSettleoraReportMonth(month);
    final normalizedGroupId = _optionalId(groupId);

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.getMonthlyReport(
          month: normalizedMonth,
          groupId: normalizedGroupId,
          accessToken: accessToken,
        );
        return _mapReport(response);
      } on SettleoraMonthlyReportFailure {
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
      throw const SettleoraMonthlyReportFailure(
        kind: SettleoraMonthlyReportFailureKind.sessionRequired,
        message: 'Sign in before loading monthly reports.',
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

SettleoraMonthlyReport _mapReport(api.MonthlyReportResponse response) {
  return SettleoraMonthlyReport(
    month: response.month,
    groupId: response.groupId,
    generatedAtUtc: response.generatedAtUtc.toUtc(),
    billCount: response.billCount,
    totalByCurrency: response.totalByCurrency
        .map(_mapCurrencyTotal)
        .toList(growable: false),
    actorShareByCurrency: response.actorShareByCurrency
        .map(_mapCurrencyTotal)
        .toList(growable: false),
    actorPaidByCurrency: response.actorPaidByCurrency
        .map(_mapCurrencyTotal)
        .toList(growable: false),
    reconciliationCounts: response.reconciliationCounts
        .map(_mapStatusCount)
        .toList(growable: false),
    settlementRequestCounts: response.settlementRequestCounts
        .map(_mapStatusCount)
        .toList(growable: false),
    settlementPaymentCounts: response.settlementPaymentCounts
        .map(_mapStatusCount)
        .toList(growable: false),
  );
}

SettleoraMonthlyReportCurrencyTotal _mapCurrencyTotal(
  api.MonthlyReportCurrencyTotal response,
) {
  return SettleoraMonthlyReportCurrencyTotal(
    currency: response.currency,
    amount: response.amount,
  );
}

SettleoraMonthlyReportStatusCount _mapStatusCount(
  api.MonthlyReportStatusCount response,
) {
  return SettleoraMonthlyReportStatusCount(
    status: response.status,
    count: response.count,
  );
}

SettleoraMonthlyReportFailure _mapFailure(Object error) {
  if (error is api.SettleoraApiException) {
    return switch (error.statusCode) {
      400 || 422 => SettleoraMonthlyReportFailure(
        kind: SettleoraMonthlyReportFailureKind.validation,
        message:
            'The monthly report request is no longer valid. Refresh and try again.',
        statusCode: error.statusCode,
      ),
      401 => const SettleoraMonthlyReportFailure(
        kind: SettleoraMonthlyReportFailureKind.sessionExpired,
        message:
            'Your session has expired. Sign in again before loading monthly reports.',
        statusCode: 401,
      ),
      403 => const SettleoraMonthlyReportFailure(
        kind: SettleoraMonthlyReportFailureKind.denied,
        message: 'Monthly reports are not available to this account.',
        statusCode: 403,
      ),
      404 || 410 => SettleoraMonthlyReportFailure(
        kind: SettleoraMonthlyReportFailureKind.unavailable,
        message: 'The monthly report is no longer available.',
        statusCode: error.statusCode,
      ),
      >= 500 => SettleoraMonthlyReportFailure(
        kind: SettleoraMonthlyReportFailureKind.server,
        message: 'Monthly reports are unavailable right now. Try again later.',
        statusCode: error.statusCode,
      ),
      _ => SettleoraMonthlyReportFailure(
        kind: SettleoraMonthlyReportFailureKind.server,
        message: 'Monthly reports are unavailable right now. Try again later.',
        statusCode: error.statusCode,
      ),
    };
  }

  if (error is SocketException ||
      error is HttpException ||
      error is HandshakeException ||
      error is TimeoutException ||
      error is IOException) {
    return const SettleoraMonthlyReportFailure(
      kind: SettleoraMonthlyReportFailureKind.network,
      message:
          'The server is unavailable. Try again when the connection is back.',
    );
  }

  return const SettleoraMonthlyReportFailure(
    kind: SettleoraMonthlyReportFailureKind.server,
    message: 'Monthly reports are unavailable right now. Try again later.',
  );
}

String? _optionalId(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }

  return trimmed;
}
