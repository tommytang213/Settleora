import 'dart:async';
import 'dart:io';

import 'package:settleora_api_client/settleora_api.dart' as api;

import '../api/settleora_api_client.dart';
import 'bill_repository.dart';

abstract interface class SettleoraBillGeneratedClient {
  Future<api.PersonalBillListResponse> listPersonalBills({
    api.ExpenseBillArchiveState? archiveState,
    int? limit,
    required String accessToken,
  });

  Future<api.PersonalBillResponse> getPersonalBill(
    String billId, {
    required String accessToken,
  });

  Future<api.GroupBillListResponse> listGroupBills(
    String groupId, {
    api.ExpenseBillArchiveState? archiveState,
    int? limit,
    required String accessToken,
  });

  Future<api.GroupBillResponse> getGroupBill(
    String groupId,
    String billId, {
    required String accessToken,
  });
}

class SettleoraPersonalBillGeneratedClient
    implements SettleoraBillGeneratedClient {
  const SettleoraPersonalBillGeneratedClient(this._client);

  final api.SettleoraApiClient _client;

  @override
  Future<api.PersonalBillListResponse> listPersonalBills({
    api.ExpenseBillArchiveState? archiveState,
    int? limit,
    required String accessToken,
  }) {
    return _client.listPersonalBills(
      archiveState: archiveState,
      limit: limit,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.PersonalBillResponse> getPersonalBill(
    String billId, {
    required String accessToken,
  }) {
    return _client.getPersonalBill(billId, accessToken: accessToken);
  }

  @override
  Future<api.GroupBillListResponse> listGroupBills(
    String groupId, {
    api.ExpenseBillArchiveState? archiveState,
    int? limit,
    required String accessToken,
  }) {
    return _client.listGroupBills(
      groupId,
      archiveState: archiveState,
      limit: limit,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.GroupBillResponse> getGroupBill(
    String groupId,
    String billId, {
    required String accessToken,
  }) {
    return _client.getGroupBill(groupId, billId, accessToken: accessToken);
  }
}

class GeneratedSettleoraBillRepository implements SettleoraBillRepository {
  GeneratedSettleoraBillRepository({
    required SettleoraBillGeneratedClient client,
    required SettleoraAccessTokenProvider accessTokenProvider,
  }) : _client = client,
       _accessTokenProvider = accessTokenProvider;

  factory GeneratedSettleoraBillRepository.fromConfiguration({
    required SettleoraApiConfiguration configuration,
    required SettleoraAccessTokenProvider accessTokenProvider,
    SettleoraGeneratedApiClientFactory clientFactory =
        const SettleoraGeneratedApiClientFactory(),
  }) {
    return GeneratedSettleoraBillRepository(
      client: SettleoraPersonalBillGeneratedClient(
        clientFactory.create(configuration),
      ),
      accessTokenProvider: accessTokenProvider,
    );
  }

  final SettleoraBillGeneratedClient _client;
  final SettleoraAccessTokenProvider _accessTokenProvider;

  @override
  Future<List<SettleoraBillSummary>> listPersonalBills({int limit = 50}) async {
    final boundedLimit = _boundedLimit(limit);
    final activeBills = await _listPersonalBillsForArchiveState(
      api.ExpenseBillArchiveStateValues.active,
      limit: boundedLimit,
    );
    final archivedBills = await _listPersonalBillsForArchiveState(
      api.ExpenseBillArchiveStateValues.archived,
      limit: boundedLimit,
    );

    return [...activeBills, ...archivedBills];
  }

  @override
  Future<SettleoraBillDetail> getPersonalBill(String billId) {
    final trimmedBillId = _requiredId(
      billId,
      blankMessage: 'Choose a bill before opening details.',
    );

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.getPersonalBill(
          trimmedBillId,
          accessToken: accessToken,
        );
        return _mapPersonalDetail(response);
      } on SettleoraBillFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<List<SettleoraBillSummary>> listGroupBills(
    String groupId, {
    int limit = 50,
  }) async {
    final trimmedGroupId = _requiredId(
      groupId,
      blankMessage: 'Choose a group before loading bills.',
    );
    final boundedLimit = _boundedLimit(limit);
    final activeBills = await _listGroupBillsForArchiveState(
      trimmedGroupId,
      api.ExpenseBillArchiveStateValues.active,
      limit: boundedLimit,
    );
    final archivedBills = await _listGroupBillsForArchiveState(
      trimmedGroupId,
      api.ExpenseBillArchiveStateValues.archived,
      limit: boundedLimit,
    );

    return [...activeBills, ...archivedBills];
  }

  @override
  Future<SettleoraBillDetail> getGroupBill(String groupId, String billId) {
    final trimmedGroupId = _requiredId(
      groupId,
      blankMessage: 'Choose a group before opening bills.',
    );
    final trimmedBillId = _requiredId(
      billId,
      blankMessage: 'Choose a bill before opening details.',
    );

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.getGroupBill(
          trimmedGroupId,
          trimmedBillId,
          accessToken: accessToken,
        );
        return _mapGroupDetail(response);
      } on SettleoraBillFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  Future<List<SettleoraBillSummary>> _listPersonalBillsForArchiveState(
    api.ExpenseBillArchiveState archiveState, {
    required int limit,
  }) {
    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.listPersonalBills(
          archiveState: archiveState,
          limit: limit,
          accessToken: accessToken,
        );
        return response.bills
            .map(
              (bill) => _mapPersonalSummary(
                bill,
                archiveState: _mapArchiveState(archiveState),
              ),
            )
            .toList(growable: false);
      } on SettleoraBillFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  Future<List<SettleoraBillSummary>> _listGroupBillsForArchiveState(
    String groupId,
    api.ExpenseBillArchiveState archiveState, {
    required int limit,
  }) {
    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.listGroupBills(
          groupId,
          archiveState: archiveState,
          limit: limit,
          accessToken: accessToken,
        );
        return response.bills
            .map(
              (bill) => _mapGroupSummary(
                bill,
                archiveState: _mapArchiveState(archiveState),
              ),
            )
            .toList(growable: false);
      } on SettleoraBillFailure {
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
      throw const SettleoraBillFailure(
        kind: SettleoraBillFailureKind.sessionRequired,
        message: 'Sign in before loading bills.',
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

SettleoraBillSummary _mapPersonalSummary(
  api.PersonalBillResponse response, {
  required SettleoraBillArchiveState archiveState,
}) {
  return SettleoraBillSummary(
    id: response.id,
    merchantName: response.merchantName,
    billDate: response.billDate,
    status: response.status,
    reconciliationStatus: response.reconciliation.status,
    totalAmount: response.totalAmount,
    totalCurrency: response.totalCurrency,
    archiveState: archiveState,
    itemCount: response.items.length,
    participantCount: response.participants.length,
    payerCount: response.payers.length,
    createdAtUtc: response.createdAtUtc.toUtc(),
    updatedAtUtc: response.updatedAtUtc.toUtc(),
  );
}

SettleoraBillSummary _mapGroupSummary(
  api.GroupBillResponse response, {
  required SettleoraBillArchiveState archiveState,
}) {
  return SettleoraBillSummary(
    id: response.id,
    merchantName: response.merchantName,
    billDate: response.billDate,
    status: response.status,
    reconciliationStatus: response.reconciliation.status,
    totalAmount: response.totalAmount,
    totalCurrency: response.totalCurrency,
    archiveState: archiveState,
    itemCount: response.items.length,
    participantCount: response.participants.length,
    payerCount: response.payers.length,
    createdAtUtc: response.createdAtUtc.toUtc(),
    updatedAtUtc: response.updatedAtUtc.toUtc(),
    displayNameFallback: 'Group bill',
  );
}

SettleoraBillDetail _mapPersonalDetail(api.PersonalBillResponse response) {
  return SettleoraBillDetail(
    id: response.id,
    merchantName: response.merchantName,
    billDate: response.billDate,
    status: response.status,
    reconciliationStatus: response.reconciliation.status,
    reconciliationNote: response.reconciliation.note,
    totalAmount: response.totalAmount,
    totalCurrency: response.totalCurrency,
    createdAtUtc: response.createdAtUtc.toUtc(),
    updatedAtUtc: response.updatedAtUtc.toUtc(),
    items: response.items.map(_mapPersonalItem).toList(growable: false),
    participants: response.participants
        .map(_mapPersonalParticipant)
        .toList(growable: false),
    payers: response.payers.map(_mapPersonalPayer).toList(growable: false),
    adjustments: response.adjustments
        .map(_mapPersonalAdjustment)
        .toList(growable: false),
  );
}

SettleoraBillDetail _mapGroupDetail(api.GroupBillResponse response) {
  return SettleoraBillDetail(
    id: response.id,
    merchantName: response.merchantName,
    billDate: response.billDate,
    status: response.status,
    reconciliationStatus: response.reconciliation.status,
    reconciliationNote: response.reconciliation.note,
    totalAmount: response.totalAmount,
    totalCurrency: response.totalCurrency,
    createdAtUtc: response.createdAtUtc.toUtc(),
    updatedAtUtc: response.updatedAtUtc.toUtc(),
    items: response.items.map(_mapGroupItem).toList(growable: false),
    participants: response.participants
        .map(_mapGroupParticipant)
        .toList(growable: false),
    payers: response.payers.map(_mapGroupPayer).toList(growable: false),
    adjustments: response.adjustments
        .map(_mapGroupAdjustment)
        .toList(growable: false),
    displayNameFallback: 'Group bill',
  );
}

SettleoraBillItem _mapPersonalItem(api.PersonalBillItemResponse response) {
  return SettleoraBillItem(
    id: response.id,
    name: response.name,
    note: response.note,
    amount: response.amount,
    currency: response.currency,
    sortOrder: response.sortOrder,
  );
}

SettleoraBillItem _mapGroupItem(api.GroupBillItemResponse response) {
  return SettleoraBillItem(
    id: response.id,
    name: response.name,
    note: response.note,
    amount: response.amount,
    currency: response.currency,
    sortOrder: response.sortOrder,
  );
}

SettleoraBillParticipant _mapPersonalParticipant(
  api.PersonalBillParticipantResponse response,
) {
  return SettleoraBillParticipant(
    userProfileId: response.userProfileId,
    status: response.status,
    resolvedShareAmount: response.resolvedShareAmount,
    resolvedShareCurrency: response.resolvedShareCurrency,
  );
}

SettleoraBillParticipant _mapGroupParticipant(
  api.GroupBillParticipantResponse response,
) {
  return SettleoraBillParticipant(
    userProfileId: response.userProfileId,
    status: response.status,
    resolvedShareAmount: response.resolvedShareAmount,
    resolvedShareCurrency: response.resolvedShareCurrency,
  );
}

SettleoraBillPayer _mapPersonalPayer(api.PersonalBillPayerResponse response) {
  return SettleoraBillPayer(
    userProfileId: response.userProfileId,
    amount: response.amount,
    currency: response.currency,
  );
}

SettleoraBillPayer _mapGroupPayer(api.GroupBillPayerResponse response) {
  return SettleoraBillPayer(
    userProfileId: response.userProfileId,
    amount: response.amount,
    currency: response.currency,
  );
}

SettleoraBillAdjustment _mapPersonalAdjustment(
  api.PersonalBillAdjustmentResponse response,
) {
  return SettleoraBillAdjustment(
    id: response.id,
    type: response.type,
    direction: response.direction,
    amount: response.amount,
    currency: response.currency,
    reasonNote: response.reasonNote,
    sortOrder: response.sortOrder,
  );
}

SettleoraBillAdjustment _mapGroupAdjustment(
  api.GroupBillAdjustmentResponse response,
) {
  return SettleoraBillAdjustment(
    id: response.id,
    type: response.type,
    direction: response.direction,
    amount: response.amount,
    currency: response.currency,
    reasonNote: response.reasonNote,
    sortOrder: response.sortOrder,
  );
}

SettleoraBillArchiveState _mapArchiveState(
  api.ExpenseBillArchiveState archiveState,
) {
  return switch (archiveState) {
    api.ExpenseBillArchiveStateValues.archived =>
      SettleoraBillArchiveStateValues.archived,
    _ => SettleoraBillArchiveStateValues.active,
  };
}

SettleoraBillFailure _mapFailure(Object error) {
  if (error is api.SettleoraApiException) {
    return switch (error.statusCode) {
      400 || 422 => SettleoraBillFailure(
        kind: SettleoraBillFailureKind.validation,
        message: 'The bill request is no longer valid. Refresh and try again.',
        statusCode: error.statusCode,
      ),
      401 => const SettleoraBillFailure(
        kind: SettleoraBillFailureKind.sessionExpired,
        message:
            'Your session has expired. Sign in again before loading bills.',
        statusCode: 401,
      ),
      403 => const SettleoraBillFailure(
        kind: SettleoraBillFailureKind.denied,
        message: 'Bills are not available to this account.',
        statusCode: 403,
      ),
      404 || 410 => SettleoraBillFailure(
        kind: SettleoraBillFailureKind.unavailable,
        message: 'The bill is no longer available.',
        statusCode: error.statusCode,
      ),
      409 => const SettleoraBillFailure(
        kind: SettleoraBillFailureKind.conflict,
        message: 'Refresh the bill and try again.',
        statusCode: 409,
      ),
      >= 500 => SettleoraBillFailure(
        kind: SettleoraBillFailureKind.server,
        message: 'Bills are unavailable right now. Try again later.',
        statusCode: error.statusCode,
      ),
      _ => SettleoraBillFailure(
        kind: SettleoraBillFailureKind.server,
        message: 'Bills are unavailable right now. Try again later.',
        statusCode: error.statusCode,
      ),
    };
  }

  if (error is SocketException ||
      error is HttpException ||
      error is HandshakeException ||
      error is TimeoutException ||
      error is IOException) {
    return const SettleoraBillFailure(
      kind: SettleoraBillFailureKind.network,
      message:
          'The server is unavailable. Try again when the connection is back.',
    );
  }

  return const SettleoraBillFailure(
    kind: SettleoraBillFailureKind.server,
    message: 'Bills are unavailable right now. Try again later.',
  );
}

int _boundedLimit(int limit) {
  if (limit < 1 || limit > 100) {
    throw const SettleoraBillFailure(
      kind: SettleoraBillFailureKind.validation,
      message: 'Choose a bill list limit from 1 to 100.',
    );
  }

  return limit;
}

String _requiredId(String value, {required String blankMessage}) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    throw SettleoraBillFailure(
      kind: SettleoraBillFailureKind.validation,
      message: blankMessage,
    );
  }

  return trimmed;
}
