import 'dart:async';
import 'dart:io';

import 'package:settleora_api_client/settleora_api.dart' as api;

import '../api/settleora_api_client.dart';
import 'future_bill_repository.dart';

abstract interface class SettleoraFutureBillGeneratedClient {
  Future<api.FutureBillListResponse> listFutureBills({
    api.FutureBillStatus? status,
    String? groupId,
    String? fromDate,
    String? toDate,
    bool? includeArchived,
    required String accessToken,
  });

  Future<api.FutureBillResponse> getFutureBill(
    String futureBillId, {
    required String accessToken,
  });

  Future<api.FutureBillResponse> createFutureBill(
    api.CreateFutureBillRequest body, {
    required String accessToken,
  });

  Future<api.FutureBillResponse> updateFutureBill(
    String futureBillId,
    api.UpdateFutureBillRequest body, {
    required String accessToken,
  });

  Future<api.FutureBillResponse> cancelFutureBill(
    String futureBillId, {
    required String accessToken,
  });
}

class SettleoraGeneratedFutureBillClient
    implements SettleoraFutureBillGeneratedClient {
  const SettleoraGeneratedFutureBillClient(this._client);

  final api.SettleoraApiClient _client;

  @override
  Future<api.FutureBillListResponse> listFutureBills({
    api.FutureBillStatus? status,
    String? groupId,
    String? fromDate,
    String? toDate,
    bool? includeArchived,
    required String accessToken,
  }) {
    return _client.listFutureBills(
      status: status,
      groupId: groupId,
      fromDate: fromDate,
      toDate: toDate,
      includeArchived: includeArchived,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.FutureBillResponse> getFutureBill(
    String futureBillId, {
    required String accessToken,
  }) {
    return _client.getFutureBill(futureBillId, accessToken: accessToken);
  }

  @override
  Future<api.FutureBillResponse> createFutureBill(
    api.CreateFutureBillRequest body, {
    required String accessToken,
  }) {
    return _client.createFutureBill(body, accessToken: accessToken);
  }

  @override
  Future<api.FutureBillResponse> updateFutureBill(
    String futureBillId,
    api.UpdateFutureBillRequest body, {
    required String accessToken,
  }) {
    return _client.updateFutureBill(
      futureBillId,
      body,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.FutureBillResponse> cancelFutureBill(
    String futureBillId, {
    required String accessToken,
  }) {
    return _client.cancelFutureBill(futureBillId, accessToken: accessToken);
  }
}

class GeneratedSettleoraFutureBillRepository
    implements SettleoraFutureBillRepository {
  GeneratedSettleoraFutureBillRepository({
    required SettleoraFutureBillGeneratedClient client,
    required SettleoraAccessTokenProvider accessTokenProvider,
  }) : _client = client,
       _accessTokenProvider = accessTokenProvider;

  factory GeneratedSettleoraFutureBillRepository.fromConfiguration({
    required SettleoraApiConfiguration configuration,
    required SettleoraAccessTokenProvider accessTokenProvider,
    SettleoraGeneratedApiClientFactory clientFactory =
        const SettleoraGeneratedApiClientFactory(),
  }) {
    return GeneratedSettleoraFutureBillRepository(
      client: SettleoraGeneratedFutureBillClient(
        clientFactory.create(configuration),
      ),
      accessTokenProvider: accessTokenProvider,
    );
  }

  final SettleoraFutureBillGeneratedClient _client;
  final SettleoraAccessTokenProvider _accessTokenProvider;

  @override
  Future<List<SettleoraFutureBillSummary>> listFutureBills({
    SettleoraFutureBillStatus? status,
    String? groupId,
    String? fromDate,
    String? toDate,
    bool includeArchived = false,
    int maxItems = 100,
  }) {
    final boundedMaxItems = _boundedLimit(maxItems);
    final normalizedStatus = _optionalStatus(status);
    final normalizedGroupId = _optionalId(groupId);
    final normalizedFromDate = _optionalIsoDate(fromDate);
    final normalizedToDate = _optionalIsoDate(toDate);

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.listFutureBills(
          status: normalizedStatus,
          groupId: normalizedGroupId,
          fromDate: normalizedFromDate,
          toDate: normalizedToDate,
          includeArchived: includeArchived,
          accessToken: accessToken,
        );
        return response.futureBills
            .take(boundedMaxItems)
            .map(_mapSummary)
            .toList(growable: false);
      } on SettleoraFutureBillFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraFutureBillDetail> getFutureBill(String futureBillId) {
    final trimmedId = _requiredId(
      futureBillId,
      message: 'Choose a future bill before opening details.',
    );

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.getFutureBill(
          trimmedId,
          accessToken: accessToken,
        );
        return _mapDetail(response);
      } on SettleoraFutureBillFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraFutureBillDetail> createFutureBill(
    SettleoraFutureBillCreateDraft draft,
  ) {
    final request = _createRequest(draft);

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.createFutureBill(
          request,
          accessToken: accessToken,
        );
        return _mapDetail(response);
      } on SettleoraFutureBillFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraFutureBillDetail> updateFutureBill({
    required String futureBillId,
    required SettleoraFutureBillUpdateDraft draft,
  }) {
    final trimmedId = _requiredId(
      futureBillId,
      message: 'Choose a future bill before saving changes.',
    );
    final request = api.UpdateFutureBillRequest(
      merchantName: _optionalBoundedText(
        draft.merchantName,
        maxLength: 200,
        fieldName: 'name',
      ),
      dueDate: draft.dueDate == null ? null : _requiredIsoDate(draft.dueDate!),
    );

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.updateFutureBill(
          trimmedId,
          request,
          accessToken: accessToken,
        );
        return _mapDetail(response);
      } on SettleoraFutureBillFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraFutureBillDetail> cancelFutureBill(String futureBillId) {
    final trimmedId = _requiredId(
      futureBillId,
      message: 'Choose a future bill before cancelling it.',
    );

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.cancelFutureBill(
          trimmedId,
          accessToken: accessToken,
        );
        return _mapDetail(response);
      } on SettleoraFutureBillFailure {
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
      throw const SettleoraFutureBillFailure(
        kind: SettleoraFutureBillFailureKind.sessionRequired,
        message: 'Sign in before loading future bills.',
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

api.CreateFutureBillRequest _createRequest(
  SettleoraFutureBillCreateDraft draft,
) {
  final currency = _requiredCurrency(draft.currency);
  final amount = _requiredDecimal(draft.amount);
  final name = _optionalBoundedText(
    draft.merchantName,
    maxLength: 200,
    fieldName: 'name',
  );
  final itemName = name == null || name.isEmpty ? 'Future bill' : name;
  final groupId = _optionalId(draft.groupId);
  final participantIds = _participantIds(draft.participantUserProfileIds);
  if (groupId == null && participantIds.isNotEmpty) {
    throw const SettleoraFutureBillFailure(
      kind: SettleoraFutureBillFailureKind.validation,
      message: 'Choose a group before adding future bill participants.',
    );
  }
  if (groupId != null && participantIds.isEmpty) {
    throw const SettleoraFutureBillFailure(
      kind: SettleoraFutureBillFailureKind.validation,
      message: 'Choose at least one group member for the equal split.',
    );
  }

  return api.CreateFutureBillRequest(
    groupId: groupId,
    merchantName: name,
    dueDate: _requiredIsoDate(draft.dueDate),
    billPayload: api.RecurringBillTemplatePayload(
      currency: currency,
      items: [
        api.RecurringBillTemplatePayloadItem(
          name: itemName,
          note: _optionalBoundedText(
            draft.note,
            maxLength: 1000,
            fieldName: 'note',
          ),
          amount: amount,
          currency: currency,
          splits: participantIds.isEmpty
              ? null
              : [
                  for (final participantId in participantIds)
                    api.RecurringBillTemplatePayloadItemSplit(
                      userProfileId: participantId,
                      splitMethod: 'equal',
                    ),
                ],
        ),
      ],
    ),
  );
}

SettleoraFutureBillSummary _mapSummary(api.FutureBillResponse response) {
  return SettleoraFutureBillSummary(
    id: response.id,
    merchantName: response.merchantName,
    dueDate: response.dueDate,
    status: response.status,
    settlementEffective: response.settlementEffective,
    totalAmount: response.totalAmount,
    totalCurrency: response.totalCurrency,
    createdAtUtc: response.createdAtUtc.toUtc(),
    updatedAtUtc: response.updatedAtUtc.toUtc(),
    archivedAtUtc: response.archivedAtUtc?.toUtc(),
    isGroupScoped: response.groupId != null,
  );
}

SettleoraFutureBillDetail _mapDetail(api.FutureBillResponse response) {
  return SettleoraFutureBillDetail(
    id: response.id,
    merchantName: response.merchantName,
    dueDate: response.dueDate,
    status: response.status,
    settlementEffective: response.settlementEffective,
    totalAmount: response.totalAmount,
    totalCurrency: response.totalCurrency,
    createdAtUtc: response.createdAtUtc.toUtc(),
    updatedAtUtc: response.updatedAtUtc.toUtc(),
    archivedAtUtc: response.archivedAtUtc?.toUtc(),
    isGroupScoped: response.groupId != null,
    items: response.billPayload.items
        .map(
          (item) => SettleoraFutureBillItem(
            name: item.name,
            amount: item.amount,
            currency: item.currency ?? response.billPayload.currency,
            note: item.note,
            splitCount: item.splits?.length ?? 0,
          ),
        )
        .toList(growable: false),
  );
}

SettleoraFutureBillFailure _mapFailure(Object error) {
  if (error is SettleoraFutureBillFailure) {
    return error;
  }
  if (error is TimeoutException || error is SocketException) {
    return const SettleoraFutureBillFailure(
      kind: SettleoraFutureBillFailureKind.network,
      message:
          'The server is unavailable. Try again when the connection is back.',
    );
  }
  if (error is api.SettleoraApiException) {
    return switch (error.statusCode) {
      400 => SettleoraFutureBillFailure(
        kind: SettleoraFutureBillFailureKind.validation,
        message:
            'The future bill request is no longer valid. Refresh and try again.',
        statusCode: error.statusCode,
      ),
      401 => SettleoraFutureBillFailure(
        kind: SettleoraFutureBillFailureKind.sessionExpired,
        message: 'Your session has expired. Sign in again.',
        statusCode: error.statusCode,
      ),
      403 => SettleoraFutureBillFailure(
        kind: SettleoraFutureBillFailureKind.denied,
        message: 'You do not have access to that future bill.',
        statusCode: error.statusCode,
      ),
      404 => SettleoraFutureBillFailure(
        kind: SettleoraFutureBillFailureKind.unavailable,
        message: 'The future bill is no longer available.',
        statusCode: error.statusCode,
      ),
      409 => SettleoraFutureBillFailure(
        kind: SettleoraFutureBillFailureKind.conflict,
        message: 'Refresh future bills and try again.',
        statusCode: error.statusCode,
      ),
      _ => SettleoraFutureBillFailure(
        kind: SettleoraFutureBillFailureKind.server,
        message: 'Future bills are unavailable right now.',
        statusCode: error.statusCode,
      ),
    };
  }

  return const SettleoraFutureBillFailure(
    kind: SettleoraFutureBillFailureKind.network,
    message:
        'The server is unavailable. Try again when the connection is back.',
  );
}

int _boundedLimit(int maxItems) {
  if (maxItems < 1 || maxItems > 100) {
    throw const SettleoraFutureBillFailure(
      kind: SettleoraFutureBillFailureKind.validation,
      message: 'Choose a future bill list limit from 1 to 100.',
    );
  }

  return maxItems;
}

String? _optionalStatus(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }
  if (trimmed == SettleoraFutureBillStatusValues.draft ||
      trimmed == SettleoraFutureBillStatusValues.cancelled) {
    return trimmed;
  }

  throw const SettleoraFutureBillFailure(
    kind: SettleoraFutureBillFailureKind.validation,
    message: 'Choose a supported future bill status.',
  );
}

String _requiredId(String? value, {required String message}) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    throw SettleoraFutureBillFailure(
      kind: SettleoraFutureBillFailureKind.validation,
      message: message,
    );
  }

  return trimmed;
}

String? _optionalId(String? value) {
  final trimmed = value?.trim();
  return trimmed == null || trimmed.isEmpty ? null : trimmed;
}

List<String> _participantIds(List<String> values) {
  final seen = <String>{};
  final ids = <String>[];
  for (final value in values) {
    final id = _optionalId(value);
    if (id == null || seen.contains(id)) {
      continue;
    }
    seen.add(id);
    ids.add(id);
  }

  return ids;
}

String _requiredIsoDate(String value) {
  final trimmed = value.trim();
  final parsed = DateTime.tryParse(trimmed);
  if (parsed == null || trimmed.length != 10) {
    throw const SettleoraFutureBillFailure(
      kind: SettleoraFutureBillFailureKind.validation,
      message: 'Choose a valid due date.',
    );
  }

  return trimmed;
}

String? _optionalIsoDate(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }

  return _requiredIsoDate(trimmed);
}

String _requiredCurrency(String value) {
  final trimmed = value.trim().toUpperCase();
  if (!RegExp(r'^[A-Z]{3}$').hasMatch(trimmed)) {
    throw const SettleoraFutureBillFailure(
      kind: SettleoraFutureBillFailureKind.validation,
      message: 'Choose a three-letter currency code.',
    );
  }

  return trimmed;
}

String _requiredDecimal(String value) {
  final trimmed = value.trim();
  if (!RegExp(r'^\d+(\.\d{1,4})?$').hasMatch(trimmed)) {
    throw const SettleoraFutureBillFailure(
      kind: SettleoraFutureBillFailureKind.validation,
      message: 'Enter a valid future bill amount.',
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
    throw SettleoraFutureBillFailure(
      kind: SettleoraFutureBillFailureKind.validation,
      message: 'Shorten the future bill $fieldName.',
    );
  }

  return trimmed;
}
