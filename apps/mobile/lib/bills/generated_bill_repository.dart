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

  Future<api.PersonalBillResponse> createPersonalBill(
    api.CreatePersonalBillRequest body, {
    required String accessToken,
  });

  Future<api.GroupBillResponse> createGroupBill(
    String groupId,
    api.CreateGroupBillRequest body, {
    required String accessToken,
  });

  Future<void> submitGroupBill(
    String groupId,
    String billId, {
    required String accessToken,
  });

  Future<void> acceptGroupBillParticipant(
    String groupId,
    String billId,
    String userProfileId, {
    required String accessToken,
  });

  Future<void> rejectGroupBillParticipant(
    String groupId,
    String billId,
    String userProfileId,
    api.RejectBillParticipantRequest body, {
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
  Future<api.PersonalBillResponse> createPersonalBill(
    api.CreatePersonalBillRequest body, {
    required String accessToken,
  }) {
    return _client.createPersonalBill(body, accessToken: accessToken);
  }

  @override
  Future<api.GroupBillResponse> createGroupBill(
    String groupId,
    api.CreateGroupBillRequest body, {
    required String accessToken,
  }) {
    return _client.createGroupBill(groupId, body, accessToken: accessToken);
  }

  @override
  Future<void> submitGroupBill(
    String groupId,
    String billId, {
    required String accessToken,
  }) {
    return _client.submitGroupBill(groupId, billId, accessToken: accessToken);
  }

  @override
  Future<void> acceptGroupBillParticipant(
    String groupId,
    String billId,
    String userProfileId, {
    required String accessToken,
  }) {
    return _client.acceptGroupBillParticipant(
      groupId,
      billId,
      userProfileId,
      accessToken: accessToken,
    );
  }

  @override
  Future<void> rejectGroupBillParticipant(
    String groupId,
    String billId,
    String userProfileId,
    api.RejectBillParticipantRequest body, {
    required String accessToken,
  }) {
    return _client.rejectGroupBillParticipant(
      groupId,
      billId,
      userProfileId,
      body,
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
  Future<SettleoraBillDetail> createPersonalBill(
    SettleoraPersonalBillCreateDraft draft,
  ) {
    final body = _mapCreateDraft(draft);

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.createPersonalBill(
          body,
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
  Future<SettleoraBillDetail> createGroupBill(
    String groupId,
    SettleoraGroupBillCreateDraft draft,
  ) {
    final trimmedGroupId = _requiredId(
      groupId,
      blankMessage: 'Choose a group before creating a bill.',
    );
    final body = _mapGroupCreateDraft(draft);

    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.createGroupBill(
          trimmedGroupId,
          body,
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

  @override
  Future<void> submitGroupBill(String groupId, String billId) {
    final trimmedGroupId = _requiredId(
      groupId,
      blankMessage: 'Choose a group before submitting a bill.',
    );
    final trimmedBillId = _requiredId(
      billId,
      blankMessage: 'Choose a bill before submitting it.',
    );

    return _withAccessToken((accessToken) async {
      try {
        await _client.submitGroupBill(
          trimmedGroupId,
          trimmedBillId,
          accessToken: accessToken,
        );
      } on SettleoraBillFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<void> acceptGroupBillParticipant(
    String groupId,
    String billId,
    String userProfileId,
  ) {
    final trimmedGroupId = _requiredId(
      groupId,
      blankMessage: 'Choose a group before accepting a bill.',
    );
    final trimmedBillId = _requiredId(
      billId,
      blankMessage: 'Choose a bill before accepting it.',
    );
    final trimmedUserProfileId = _requiredId(
      userProfileId,
      blankMessage: 'Choose a participant before accepting this bill.',
    );

    return _withAccessToken((accessToken) async {
      try {
        await _client.acceptGroupBillParticipant(
          trimmedGroupId,
          trimmedBillId,
          trimmedUserProfileId,
          accessToken: accessToken,
        );
      } on SettleoraBillFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<void> rejectGroupBillParticipant(
    String groupId,
    String billId,
    String userProfileId,
    SettleoraBillParticipantRejectionReasonCode reasonCode,
  ) {
    final trimmedGroupId = _requiredId(
      groupId,
      blankMessage: 'Choose a group before rejecting a bill.',
    );
    final trimmedBillId = _requiredId(
      billId,
      blankMessage: 'Choose a bill before rejecting it.',
    );
    final trimmedUserProfileId = _requiredId(
      userProfileId,
      blankMessage: 'Choose a participant before rejecting this bill.',
    );
    final trimmedReasonCode = _requiredText(
      reasonCode,
      blankMessage: 'Choose a reason before rejecting this bill.',
    );
    if (!SettleoraBillParticipantRejectionReasonCodeValues.values.contains(
      trimmedReasonCode,
    )) {
      throw const SettleoraBillFailure(
        kind: SettleoraBillFailureKind.validation,
        message: 'Choose a supported reason before rejecting this bill.',
      );
    }

    final body = api.RejectBillParticipantRequest(
      reasonCode: trimmedReasonCode,
    );

    return _withAccessToken((accessToken) async {
      try {
        await _client.rejectGroupBillParticipant(
          trimmedGroupId,
          trimmedBillId,
          trimmedUserProfileId,
          body,
          accessToken: accessToken,
        );
      } on SettleoraBillFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
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

api.CreatePersonalBillRequest _mapCreateDraft(
  SettleoraPersonalBillCreateDraft draft,
) {
  final billDate = _requiredText(
    draft.billDate,
    blankMessage: 'Enter a bill date before creating a bill.',
  );
  final currency = _requiredCurrency(
    draft.currency,
    blankMessage: 'Choose a currency before creating a bill.',
  );
  if (draft.items.isEmpty) {
    throw const SettleoraBillFailure(
      kind: SettleoraBillFailureKind.validation,
      message: 'Add at least one item before creating a bill.',
    );
  }

  return api.CreatePersonalBillRequest(
    merchantName: _optionalText(draft.merchantName),
    billDate: billDate,
    currency: currency,
    items: draft.items.map(_mapCreateItemDraft).toList(growable: false),
    adjustments: draft.adjustments.isEmpty
        ? null
        : draft.adjustments
              .map(_mapCreateAdjustmentDraft)
              .toList(growable: false),
    payerPaymentMethodLabelSnapshot: _optionalText(
      draft.payerPaymentMethodLabelSnapshot,
    ),
  );
}

api.CreatePersonalBillItemRequest _mapCreateItemDraft(
  SettleoraPersonalBillCreateItemDraft draft,
) {
  return api.CreatePersonalBillItemRequest(
    name: _requiredText(
      draft.name,
      blankMessage: 'Add a name for every bill item.',
    ),
    note: _optionalText(draft.note),
    amount: _requiredText(
      draft.amount,
      blankMessage: 'Add an amount for every bill item.',
    ),
    currency: _requiredCurrency(
      draft.currency,
      blankMessage: 'Choose a currency for every bill item.',
    ),
  );
}

api.CreatePersonalBillAdjustmentRequest _mapCreateAdjustmentDraft(
  SettleoraPersonalBillCreateAdjustmentDraft draft,
) {
  return api.CreatePersonalBillAdjustmentRequest(
    type: _requiredText(
      draft.type,
      blankMessage: 'Choose a type for every adjustment.',
    ),
    direction: _requiredText(
      draft.direction,
      blankMessage: 'Choose a direction for every adjustment.',
    ),
    allocationMethod: _requiredText(
      draft.allocationMethod,
      blankMessage: 'Choose an allocation method for every adjustment.',
    ),
    amount: _requiredText(
      draft.amount,
      blankMessage: 'Add an amount for every adjustment.',
    ),
    currency: _requiredCurrency(
      draft.currency,
      blankMessage: 'Choose a currency for every adjustment.',
    ),
    reasonNote: _optionalText(draft.reasonNote),
  );
}

api.CreateGroupBillRequest _mapGroupCreateDraft(
  SettleoraGroupBillCreateDraft draft,
) {
  final billDate = _requiredText(
    draft.billDate,
    blankMessage: 'Enter a bill date before creating a group bill.',
  );
  final currency = _requiredCurrency(
    draft.currency,
    blankMessage: 'Choose a currency before creating a group bill.',
  );
  if (draft.items.isEmpty) {
    throw const SettleoraBillFailure(
      kind: SettleoraBillFailureKind.validation,
      message: 'Add at least one item before creating a group bill.',
    );
  }

  return api.CreateGroupBillRequest(
    merchantName: _optionalText(draft.merchantName),
    billDate: billDate,
    currency: currency,
    items: draft.items.map(_mapGroupCreateItemDraft).toList(growable: false),
    adjustments: draft.adjustments.isEmpty
        ? null
        : draft.adjustments
              .map(_mapGroupCreateAdjustmentDraft)
              .toList(growable: false),
    payers: draft.payers.isEmpty
        ? null
        : draft.payers.map(_mapGroupCreatePayerDraft).toList(growable: false),
  );
}

api.CreateGroupBillItemRequest _mapGroupCreateItemDraft(
  SettleoraGroupBillCreateItemDraft draft,
) {
  if (draft.splits.isEmpty) {
    throw const SettleoraBillFailure(
      kind: SettleoraBillFailureKind.validation,
      message: 'Add at least one split for every group bill item.',
    );
  }

  return api.CreateGroupBillItemRequest(
    name: _requiredText(
      draft.name,
      blankMessage: 'Add a name for every group bill item.',
    ),
    note: _optionalText(draft.note),
    amount: _requiredText(
      draft.amount,
      blankMessage: 'Add an amount for every group bill item.',
    ),
    currency: _requiredCurrency(
      draft.currency,
      blankMessage: 'Choose a currency for every group bill item.',
    ),
    splits: draft.splits
        .map(_mapGroupCreateItemSplitDraft)
        .toList(growable: false),
  );
}

api.CreateGroupBillItemSplitRequest _mapGroupCreateItemSplitDraft(
  SettleoraGroupBillCreateItemSplitDraft draft,
) {
  final basisValue = _optionalText(draft.basisValue);
  final allocationOrder = _optionalAllocationOrder(draft.allocationOrder);

  if (basisValue == null) {
    return api.CreateGroupBillItemSplitRequest(
      userProfileId: _requiredId(
        draft.userProfileId,
        blankMessage: 'Choose a user profile for every group bill split.',
      ),
      splitMethod: _requiredText(
        draft.splitMethod,
        blankMessage: 'Choose a split method for every group bill split.',
      ),
      allocationOrder: allocationOrder,
    );
  }

  return api.CreateGroupBillItemSplitRequest(
    userProfileId: _requiredId(
      draft.userProfileId,
      blankMessage: 'Choose a user profile for every group bill split.',
    ),
    splitMethod: _requiredText(
      draft.splitMethod,
      blankMessage: 'Choose a split method for every group bill split.',
    ),
    basisValue: basisValue,
    allocationOrder: allocationOrder,
  );
}

api.CreateGroupBillAdjustmentRequest _mapGroupCreateAdjustmentDraft(
  SettleoraGroupBillCreateAdjustmentDraft draft,
) {
  return api.CreateGroupBillAdjustmentRequest(
    type: _requiredText(
      draft.type,
      blankMessage: 'Choose a type for every group bill adjustment.',
    ),
    direction: _requiredText(
      draft.direction,
      blankMessage: 'Choose a direction for every group bill adjustment.',
    ),
    allocationMethod: _requiredText(
      draft.allocationMethod,
      blankMessage:
          'Choose an allocation method for every group bill adjustment.',
    ),
    amount: _requiredText(
      draft.amount,
      blankMessage: 'Add an amount for every group bill adjustment.',
    ),
    currency: _requiredCurrency(
      draft.currency,
      blankMessage: 'Choose a currency for every group bill adjustment.',
    ),
    reasonNote: _optionalText(draft.reasonNote),
  );
}

api.CreateGroupBillPayerRequest _mapGroupCreatePayerDraft(
  SettleoraGroupBillCreatePayerDraft draft,
) {
  return api.CreateGroupBillPayerRequest(
    userProfileId: _requiredId(
      draft.userProfileId,
      blankMessage: 'Choose a user profile for every group bill payer.',
    ),
    amount: _requiredText(
      draft.amount,
      blankMessage: 'Add an amount for every group bill payer.',
    ),
    currency: _requiredCurrency(
      draft.currency,
      blankMessage: 'Choose a currency for every group bill payer.',
    ),
    paymentMethodLabelSnapshot: _optionalText(draft.paymentMethodLabelSnapshot),
  );
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
    participants: response.participants
        .map(_mapGroupParticipant)
        .toList(growable: false),
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
    revisionCreationActions: _mapRevisionCreationActions(
      response.revisionCreationActions,
    ),
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
    revisionCreationActions: _mapRevisionCreationActions(
      response.revisionCreationActions,
    ),
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

SettleoraBillRevisionCreationActions _mapRevisionCreationActions(
  api.BillRevisionCreationActionsResponse response,
) {
  return SettleoraBillRevisionCreationActions(
    canCreateRevision: response.canCreateRevision,
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
    rejectionReasonCode: response.rejectionReasonCode,
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
    rejectionReasonCode: response.rejectionReasonCode,
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

String _requiredText(String value, {required String blankMessage}) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    throw SettleoraBillFailure(
      kind: SettleoraBillFailureKind.validation,
      message: blankMessage,
    );
  }

  return trimmed;
}

String _requiredCurrency(String value, {required String blankMessage}) {
  return _requiredText(value, blankMessage: blankMessage).toUpperCase();
}

int? _optionalAllocationOrder(int? value) {
  if (value == null) {
    return null;
  }

  if (value < 0) {
    throw const SettleoraBillFailure(
      kind: SettleoraBillFailureKind.validation,
      message: 'Allocation order must be zero or greater.',
    );
  }

  return value;
}

String? _optionalText(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }

  return trimmed;
}
