import 'dart:async';
import 'dart:io';

import 'package:settleora_api_client/settleora_api.dart' as api;

import '../api/settleora_api_client.dart';
import 'recurring_bill_repository.dart';

abstract interface class SettleoraRecurringBillGeneratedClient {
  Future<api.RecurringBillTemplateResponse> createRecurringBillTemplate(
    api.CreateRecurringBillTemplateRequest body, {
    required String accessToken,
  });

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

  Future<api.RecurringBillTemplateResponse> updateRecurringBillTemplate(
    String templateId,
    api.UpdateRecurringBillTemplateRequest body, {
    required String accessToken,
  });

  Future<api.RecurringBillTemplateResponse> pauseRecurringBillTemplate(
    String templateId, {
    required String accessToken,
  });

  Future<api.RecurringBillTemplateResponse> resumeRecurringBillTemplate(
    String templateId, {
    required String accessToken,
  });

  Future<api.RecurringBillTemplateResponse> archiveRecurringBillTemplate(
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
  Future<api.RecurringBillTemplateResponse> createRecurringBillTemplate(
    api.CreateRecurringBillTemplateRequest body, {
    required String accessToken,
  }) {
    return _client.createRecurringBillTemplate(body, accessToken: accessToken);
  }

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
  Future<api.RecurringBillTemplateResponse> updateRecurringBillTemplate(
    String templateId,
    api.UpdateRecurringBillTemplateRequest body, {
    required String accessToken,
  }) {
    return _client.updateRecurringBillTemplate(
      templateId,
      body,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.RecurringBillTemplateResponse> pauseRecurringBillTemplate(
    String templateId, {
    required String accessToken,
  }) {
    return _client.pauseRecurringBillTemplate(
      templateId,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.RecurringBillTemplateResponse> resumeRecurringBillTemplate(
    String templateId, {
    required String accessToken,
  }) {
    return _client.resumeRecurringBillTemplate(
      templateId,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.RecurringBillTemplateResponse> archiveRecurringBillTemplate(
    String templateId, {
    required String accessToken,
  }) {
    return _client.archiveRecurringBillTemplate(
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
  Future<SettleoraRecurringBillTemplateDetail> createTemplate(
    SettleoraRecurringBillCreateDraft draft,
  ) {
    final request = _createRequest(draft);

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.createRecurringBillTemplate(
          request,
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
  Future<SettleoraRecurringBillTemplateDetail> updateTemplate({
    required String templateId,
    required SettleoraRecurringBillUpdateDraft draft,
  }) {
    final trimmedTemplateId = _requiredId(
      templateId,
      message: 'Choose a recurring bill before saving changes.',
    );
    final request = _updateRequest(draft);

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.updateRecurringBillTemplate(
          trimmedTemplateId,
          request,
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
  Future<SettleoraRecurringBillTemplateDetail> pauseTemplate(
    String templateId,
  ) {
    return _lifecycleTemplate(
      templateId,
      emptyIdMessage: 'Choose a recurring bill before pausing it.',
      operation: (id, accessToken) =>
          _client.pauseRecurringBillTemplate(id, accessToken: accessToken),
    );
  }

  @override
  Future<SettleoraRecurringBillTemplateDetail> resumeTemplate(
    String templateId,
  ) {
    return _lifecycleTemplate(
      templateId,
      emptyIdMessage: 'Choose a recurring bill before resuming it.',
      operation: (id, accessToken) =>
          _client.resumeRecurringBillTemplate(id, accessToken: accessToken),
    );
  }

  @override
  Future<SettleoraRecurringBillTemplateDetail> archiveTemplate(
    String templateId,
  ) {
    return _lifecycleTemplate(
      templateId,
      emptyIdMessage: 'Choose a recurring bill before archiving it.',
      operation: (id, accessToken) =>
          _client.archiveRecurringBillTemplate(id, accessToken: accessToken),
    );
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

  Future<SettleoraRecurringBillTemplateDetail> _lifecycleTemplate(
    String templateId, {
    required String emptyIdMessage,
    required Future<api.RecurringBillTemplateResponse> Function(
      String templateId,
      String accessToken,
    )
    operation,
  }) {
    final trimmedTemplateId = _requiredId(templateId, message: emptyIdMessage);

    return _withAccessToken((accessToken) async {
      try {
        final response = await operation(trimmedTemplateId, accessToken);
        return _mapTemplateDetail(response);
      } on SettleoraRecurringBillFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
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

api.CreateRecurringBillTemplateRequest _createRequest(
  SettleoraRecurringBillCreateDraft draft,
) {
  final items = draft.items.map(_payloadItemRequest).toList(growable: false);
  if (items.isEmpty) {
    throw const SettleoraRecurringBillFailure(
      kind: SettleoraRecurringBillFailureKind.validation,
      message: 'Add at least one recurring bill item.',
    );
  }

  return api.CreateRecurringBillTemplateRequest(
    groupId: _optionalId(draft.groupId),
    merchantName: _optionalBoundedText(
      draft.merchantName,
      maxLength: 200,
      fieldName: 'merchant name',
    ),
    description: _optionalBoundedText(
      draft.description,
      maxLength: 1000,
      fieldName: 'description',
    ),
    schedule: _scheduleRequest(draft.schedule),
    billPayload: api.RecurringBillTemplatePayload(
      currency: _requiredCurrency(draft.currency),
      items: items,
    ),
  );
}

api.UpdateRecurringBillTemplateRequest _updateRequest(
  SettleoraRecurringBillUpdateDraft draft,
) {
  return api.UpdateRecurringBillTemplateRequest(
    merchantName: _optionalBoundedText(
      draft.merchantName,
      maxLength: 200,
      fieldName: 'merchant name',
    ),
    description: _optionalBoundedText(
      draft.description,
      maxLength: 1000,
      fieldName: 'description',
    ),
    schedule: _scheduleRequest(draft.schedule),
  );
}

api.RecurringBillScheduleRequest _scheduleRequest(
  SettleoraRecurringBillScheduleDraft draft,
) {
  final type = _requiredScheduleType(draft.type);
  final intervalCount = draft.intervalCount;
  final intervalDays = draft.intervalDays;
  if (type == SettleoraRecurringBillScheduleTypeValues.customIntervalDays) {
    if (intervalDays == null || intervalDays < 1 || intervalDays > 3660) {
      throw const SettleoraRecurringBillFailure(
        kind: SettleoraRecurringBillFailureKind.validation,
        message: 'Choose a custom interval from 1 to 3660 days.',
      );
    }
  } else if (intervalCount == null ||
      intervalCount < 1 ||
      intervalCount > 120) {
    throw const SettleoraRecurringBillFailure(
      kind: SettleoraRecurringBillFailureKind.validation,
      message: 'Choose a schedule interval from 1 to 120.',
    );
  }

  final dueOffsetDays = draft.dueOffsetDays;
  if (dueOffsetDays != null && (dueOffsetDays < -365 || dueOffsetDays > 365)) {
    throw const SettleoraRecurringBillFailure(
      kind: SettleoraRecurringBillFailureKind.validation,
      message: 'Choose a due offset from -365 to 365 days.',
    );
  }

  return api.RecurringBillScheduleRequest(
    type: type,
    intervalCount:
        type == SettleoraRecurringBillScheduleTypeValues.customIntervalDays
        ? null
        : intervalCount,
    intervalDays:
        type == SettleoraRecurringBillScheduleTypeValues.customIntervalDays
        ? intervalDays
        : null,
    startDate: _requiredIsoDate(
      draft.startDate,
      message: 'Choose a valid schedule start date.',
    ),
    endDate: _optionalIsoDate(draft.endDate),
    dueOffsetDays: dueOffsetDays,
  );
}

api.RecurringBillTemplatePayloadItem _payloadItemRequest(
  SettleoraRecurringBillTemplatePayloadItemDraft draft,
) {
  return api.RecurringBillTemplatePayloadItem(
    name: _requiredBoundedText(
      draft.name,
      maxLength: 240,
      fieldName: 'item name',
    ),
    note: _optionalBoundedText(
      draft.note,
      maxLength: 1000,
      fieldName: 'item note',
    ),
    amount: _requiredDecimal(draft.amount),
  );
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

SettleoraRecurringBillScheduleType _requiredScheduleType(String value) {
  final trimmed = value.trim();
  const values = {
    SettleoraRecurringBillScheduleTypeValues.weekly,
    SettleoraRecurringBillScheduleTypeValues.monthly,
    SettleoraRecurringBillScheduleTypeValues.yearly,
    SettleoraRecurringBillScheduleTypeValues.customIntervalDays,
  };
  if (!values.contains(trimmed)) {
    throw const SettleoraRecurringBillFailure(
      kind: SettleoraRecurringBillFailureKind.validation,
      message: 'Choose a supported recurring bill schedule.',
    );
  }

  return trimmed;
}

String _requiredCurrency(String value) {
  final trimmed = value.trim().toUpperCase();
  if (!RegExp(r'^[A-Z]{3}$').hasMatch(trimmed)) {
    throw const SettleoraRecurringBillFailure(
      kind: SettleoraRecurringBillFailureKind.validation,
      message: 'Choose a three-letter currency code.',
    );
  }

  return trimmed;
}

String _requiredDecimal(String value) {
  final trimmed = value.trim();
  if (!RegExp(r'^\d+(\.\d{1,4})?$').hasMatch(trimmed)) {
    throw const SettleoraRecurringBillFailure(
      kind: SettleoraRecurringBillFailureKind.validation,
      message: 'Enter an amount using digits and an optional decimal.',
    );
  }

  return trimmed;
}

String _requiredBoundedText(
  String value, {
  required int maxLength,
  required String fieldName,
}) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    throw SettleoraRecurringBillFailure(
      kind: SettleoraRecurringBillFailureKind.validation,
      message: 'Enter a recurring bill $fieldName.',
    );
  }
  if (trimmed.length > maxLength) {
    throw SettleoraRecurringBillFailure(
      kind: SettleoraRecurringBillFailureKind.validation,
      message: 'Shorten the recurring bill $fieldName.',
    );
  }

  return trimmed;
}

String? _optionalBoundedText(
  String? value, {
  required int maxLength,
  required String fieldName,
}) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }
  if (trimmed.length > maxLength) {
    throw SettleoraRecurringBillFailure(
      kind: SettleoraRecurringBillFailureKind.validation,
      message: 'Shorten the recurring bill $fieldName.',
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
