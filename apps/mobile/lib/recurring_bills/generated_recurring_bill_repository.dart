import 'dart:async';
import 'dart:io';

import 'package:settleora_api_client/settleora_api.dart' as api;

import '../api/settleora_api_client.dart';
import 'recurring_bill_repository.dart';

abstract interface class SettleoraRecurringBillGeneratedClient {
  Future<api.RecurringBillTemplateListResponse> listRecurringBillTemplates({
    api.RecurringBillTemplateStatus? status,
    String? groupId,
    String? fromDate,
    String? toDate,
    required String accessToken,
  });

  Future<api.RecurringBillForecastListResponse> listRecurringBillForecast({
    String? fromDate,
    String? toDate,
    int? limit,
    String? groupId,
    required String accessToken,
  });

  Future<api.RecurringBillTemplateResponse> getRecurringBillTemplate(
    String templateId, {
    required String accessToken,
  });

  Future<api.RecurringBillGenerateDraftResponse> generateRecurringBillDraft(
    String templateId,
    String occurrenceDate, {
    required String accessToken,
  });
}

class SettleoraGeneratedRecurringBillClient
    implements SettleoraRecurringBillGeneratedClient {
  const SettleoraGeneratedRecurringBillClient(this._client);

  final api.SettleoraApiClient _client;

  @override
  Future<api.RecurringBillTemplateListResponse> listRecurringBillTemplates({
    api.RecurringBillTemplateStatus? status,
    String? groupId,
    String? fromDate,
    String? toDate,
    required String accessToken,
  }) {
    return _client.listRecurringBillTemplates(
      status: status,
      groupId: groupId,
      fromDate: fromDate,
      toDate: toDate,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.RecurringBillForecastListResponse> listRecurringBillForecast({
    String? fromDate,
    String? toDate,
    int? limit,
    String? groupId,
    required String accessToken,
  }) {
    return _client.listRecurringBillForecast(
      fromDate: fromDate,
      toDate: toDate,
      limit: limit,
      groupId: groupId,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.RecurringBillTemplateResponse> getRecurringBillTemplate(
    String templateId, {
    required String accessToken,
  }) {
    return _client.getRecurringBillTemplate(
      templateId,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.RecurringBillGenerateDraftResponse> generateRecurringBillDraft(
    String templateId,
    String occurrenceDate, {
    required String accessToken,
  }) {
    return _client.generateRecurringBillDraft(
      templateId,
      occurrenceDate,
      accessToken: accessToken,
    );
  }
}

class GeneratedSettleoraRecurringBillRepository
    implements SettleoraRecurringBillRepository {
  GeneratedSettleoraRecurringBillRepository({
    required SettleoraRecurringBillGeneratedClient client,
    required SettleoraAccessTokenProvider accessTokenProvider,
  }) : _client = client,
       _accessTokenProvider = accessTokenProvider;

  factory GeneratedSettleoraRecurringBillRepository.fromConfiguration({
    required SettleoraApiConfiguration configuration,
    required SettleoraAccessTokenProvider accessTokenProvider,
    SettleoraGeneratedApiClientFactory clientFactory =
        const SettleoraGeneratedApiClientFactory(),
  }) {
    return GeneratedSettleoraRecurringBillRepository(
      client: SettleoraGeneratedRecurringBillClient(
        clientFactory.create(configuration),
      ),
      accessTokenProvider: accessTokenProvider,
    );
  }

  final SettleoraRecurringBillGeneratedClient _client;
  final SettleoraAccessTokenProvider _accessTokenProvider;

  @override
  Future<List<SettleoraRecurringBillTemplateSummary>> listTemplates({
    SettleoraRecurringBillTemplateStatus? status,
    String? groupId,
    String? fromDate,
    String? toDate,
    int maxItems = 100,
  }) {
    final boundedMaxItems = _boundedLimit(maxItems);
    final normalizedStatus = _optionalTemplateStatus(status);
    final normalizedGroupId = _optionalId(groupId);
    final normalizedFromDate = _optionalIsoDate(fromDate);
    final normalizedToDate = _optionalIsoDate(toDate);

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.listRecurringBillTemplates(
          status: normalizedStatus,
          groupId: normalizedGroupId,
          fromDate: normalizedFromDate,
          toDate: normalizedToDate,
          accessToken: accessToken,
        );
        return response.templates
            .take(boundedMaxItems)
            .map(_mapTemplateSummary)
            .toList(growable: false);
      } on SettleoraRecurringBillFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<List<SettleoraRecurringBillForecastOccurrence>> listForecast({
    String? fromDate,
    String? toDate,
    int limit = 30,
    String? groupId,
  }) {
    final boundedLimit = _boundedLimit(limit);
    final normalizedFromDate = _optionalIsoDate(fromDate);
    final normalizedToDate = _optionalIsoDate(toDate);
    final normalizedGroupId = _optionalId(groupId);

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.listRecurringBillForecast(
          fromDate: normalizedFromDate,
          toDate: normalizedToDate,
          limit: boundedLimit,
          groupId: normalizedGroupId,
          accessToken: accessToken,
        );
        return response.occurrences
            .map(_mapForecastOccurrence)
            .toList(growable: false);
      } on SettleoraRecurringBillFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraRecurringBillTemplateDetail> getTemplate(String templateId) {
    final trimmedTemplateId = _requiredId(
      templateId,
      message: 'Choose a recurring bill before opening details.',
    );

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.getRecurringBillTemplate(
          trimmedTemplateId,
          accessToken: accessToken,
        );
        return _mapTemplateDetail(response);
      } on SettleoraRecurringBillFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraRecurringBillDraftResult> generateDraft({
    required String templateId,
    required String occurrenceDate,
  }) {
    final trimmedTemplateId = _requiredId(
      templateId,
      message: 'Choose a recurring bill before generating a draft.',
    );
    final normalizedOccurrenceDate = _requiredIsoDate(
      occurrenceDate,
      message: 'Choose a forecast occurrence date before generating a draft.',
    );

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.generateRecurringBillDraft(
          trimmedTemplateId,
          normalizedOccurrenceDate,
          accessToken: accessToken,
        );
        return _mapDraftResult(response);
      } on SettleoraRecurringBillFailure {
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
      throw const SettleoraRecurringBillFailure(
        kind: SettleoraRecurringBillFailureKind.sessionRequired,
        message: 'Sign in before loading recurring bills.',
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

SettleoraRecurringBillTemplateSummary _mapTemplateSummary(
  api.RecurringBillTemplateResponse response,
) {
  return SettleoraRecurringBillTemplateSummary(
    id: response.id,
    merchantName: response.merchantName,
    description: response.description,
    status: response.status,
    schedule: _mapSchedule(response.schedule),
    forecastAmount: response.forecastAmount,
    forecastCurrency: response.forecastCurrency,
    nextOccurrenceDate: response.nextOccurrenceDate,
    createdAtUtc: response.createdAtUtc.toUtc(),
    updatedAtUtc: response.updatedAtUtc.toUtc(),
    archivedAtUtc: response.archivedAtUtc?.toUtc(),
    isGroupScoped: response.groupId != null,
  );
}

SettleoraRecurringBillTemplateDetail _mapTemplateDetail(
  api.RecurringBillTemplateResponse response,
) {
  return SettleoraRecurringBillTemplateDetail(
    id: response.id,
    merchantName: response.merchantName,
    description: response.description,
    status: response.status,
    schedule: _mapSchedule(response.schedule),
    forecastAmount: response.forecastAmount,
    forecastCurrency: response.forecastCurrency,
    nextOccurrenceDate: response.nextOccurrenceDate,
    createdAtUtc: response.createdAtUtc.toUtc(),
    updatedAtUtc: response.updatedAtUtc.toUtc(),
    archivedAtUtc: response.archivedAtUtc?.toUtc(),
    isGroupScoped: response.groupId != null,
    payloadVersion: response.payloadVersion,
  );
}

SettleoraRecurringBillSchedule _mapSchedule(
  api.RecurringBillScheduleResponse response,
) {
  return SettleoraRecurringBillSchedule(
    type: response.type,
    intervalCount: response.intervalCount,
    intervalDays: response.intervalDays,
    startDate: response.startDate,
    endDate: response.endDate,
    dueOffsetDays: response.dueOffsetDays,
  );
}

SettleoraRecurringBillForecastOccurrence _mapForecastOccurrence(
  api.RecurringBillForecastOccurrenceResponse response,
) {
  return SettleoraRecurringBillForecastOccurrence(
    templateId: response.templateId,
    occurrenceId: response.occurrenceId,
    occurrenceDate: response.occurrenceDate,
    dueDate: response.dueDate,
    status: response.status,
    draftGenerated: response.draftGenerated,
    generatedBillId: response.generatedBillId,
    forecastAmount: response.forecastAmount,
    forecastCurrency: response.forecastCurrency,
    merchantName: response.merchantName,
    isGroupScoped: response.groupId != null,
  );
}

SettleoraRecurringBillDraftResult _mapDraftResult(
  api.RecurringBillGenerateDraftResponse response,
) {
  return SettleoraRecurringBillDraftResult(
    templateId: response.templateId,
    occurrenceId: response.occurrenceId,
    occurrenceDate: response.occurrenceDate,
    dueDate: response.dueDate,
    occurrenceStatus: response.occurrenceStatus,
    generatedBillId: response.generatedBillId,
    billStatus: response.billStatus,
    totalAmount: response.totalAmount,
    totalCurrency: response.totalCurrency,
  );
}

SettleoraRecurringBillFailure _mapFailure(Object error) {
  if (error is api.SettleoraApiException) {
    return switch (error.statusCode) {
      400 || 422 => SettleoraRecurringBillFailure(
        kind: SettleoraRecurringBillFailureKind.validation,
        message:
            'The recurring bill request is no longer valid. Refresh and try again.',
        statusCode: error.statusCode,
      ),
      401 => const SettleoraRecurringBillFailure(
        kind: SettleoraRecurringBillFailureKind.sessionExpired,
        message:
            'Your session has expired. Sign in again before loading recurring bills.',
        statusCode: 401,
      ),
      403 => const SettleoraRecurringBillFailure(
        kind: SettleoraRecurringBillFailureKind.denied,
        message: 'Recurring bills are not available to this account.',
        statusCode: 403,
      ),
      404 || 410 => SettleoraRecurringBillFailure(
        kind: SettleoraRecurringBillFailureKind.unavailable,
        message: 'The recurring bill is no longer available.',
        statusCode: error.statusCode,
      ),
      409 => const SettleoraRecurringBillFailure(
        kind: SettleoraRecurringBillFailureKind.conflict,
        message: 'Refresh recurring bills and try again.',
        statusCode: 409,
      ),
      >= 500 => SettleoraRecurringBillFailure(
        kind: SettleoraRecurringBillFailureKind.server,
        message: 'Recurring bills are unavailable right now. Try again later.',
        statusCode: error.statusCode,
      ),
      _ => SettleoraRecurringBillFailure(
        kind: SettleoraRecurringBillFailureKind.server,
        message: 'Recurring bills are unavailable right now. Try again later.',
        statusCode: error.statusCode,
      ),
    };
  }

  if (error is SocketException ||
      error is HttpException ||
      error is HandshakeException ||
      error is TimeoutException ||
      error is IOException) {
    return const SettleoraRecurringBillFailure(
      kind: SettleoraRecurringBillFailureKind.network,
      message:
          'The server is unavailable. Try again when the connection is back.',
    );
  }

  return const SettleoraRecurringBillFailure(
    kind: SettleoraRecurringBillFailureKind.server,
    message: 'Recurring bills are unavailable right now. Try again later.',
  );
}

int _boundedLimit(int limit) {
  if (limit < 1 || limit > 100) {
    throw const SettleoraRecurringBillFailure(
      kind: SettleoraRecurringBillFailureKind.validation,
      message: 'Choose a recurring bill list limit from 1 to 100.',
    );
  }

  return limit;
}

String _requiredId(String value, {required String message}) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    throw SettleoraRecurringBillFailure(
      kind: SettleoraRecurringBillFailureKind.validation,
      message: message,
    );
  }

  return trimmed;
}

String? _optionalId(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }

  return trimmed;
}

SettleoraRecurringBillTemplateStatus? _optionalTemplateStatus(
  SettleoraRecurringBillTemplateStatus? value,
) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }

  const values = {
    SettleoraRecurringBillTemplateStatusValues.active,
    SettleoraRecurringBillTemplateStatusValues.paused,
    SettleoraRecurringBillTemplateStatusValues.archived,
  };
  if (!values.contains(trimmed)) {
    throw const SettleoraRecurringBillFailure(
      kind: SettleoraRecurringBillFailureKind.validation,
      message: 'Choose a supported recurring bill status.',
    );
  }

  return trimmed;
}

String? _optionalIsoDate(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }

  return _requiredIsoDate(trimmed, message: 'Choose a valid ISO date.');
}

String _requiredIsoDate(String value, {required String message}) {
  final trimmed = value.trim();
  final parts = trimmed.split('-');
  if (parts.length != 3 ||
      parts[0].length != 4 ||
      parts[1].length != 2 ||
      parts[2].length != 2) {
    throw SettleoraRecurringBillFailure(
      kind: SettleoraRecurringBillFailureKind.validation,
      message: message,
    );
  }

  final year = int.tryParse(parts[0]);
  final month = int.tryParse(parts[1]);
  final day = int.tryParse(parts[2]);
  if (year == null || month == null || day == null) {
    throw SettleoraRecurringBillFailure(
      kind: SettleoraRecurringBillFailureKind.validation,
      message: message,
    );
  }

  final parsed = DateTime.utc(year, month, day);
  if (parsed.year != year || parsed.month != month || parsed.day != day) {
    throw SettleoraRecurringBillFailure(
      kind: SettleoraRecurringBillFailureKind.validation,
      message: message,
    );
  }

  return trimmed;
}
