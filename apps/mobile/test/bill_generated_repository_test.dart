import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/settleora_api_client.dart';
import 'package:mobile/bills/bill_repository.dart';
import 'package:mobile/bills/generated_bill_repository.dart';
import 'package:settleora_api_client/settleora_api.dart' as api;

void main() {
  group('GeneratedSettleoraBillRepository', () {
    test('requires a session before calling the generated client', () async {
      final client = FakeBillGeneratedClient();
      final repository = GeneratedSettleoraBillRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider(null),
      );

      final failure = await captureBillFailure(() {
        return repository.listPersonalBills();
      });

      expect(failure.kind, SettleoraBillFailureKind.sessionRequired);
      expect(client.listCalls, 0);
    });

    test('maps active and archived personal bill lists safely', () async {
      final accessTokenProvider = FakeAccessTokenProvider('  redacted  ');
      final client = FakeBillGeneratedClient(
        activeBills: [sampleApiBill(merchantName: 'Corner Market')],
        archivedBills: [sampleApiBill(id: _archivedBillId, merchantName: null)],
      );
      final repository = GeneratedSettleoraBillRepository(
        client: client,
        accessTokenProvider: accessTokenProvider,
      );

      final bills = await repository.listPersonalBills(limit: 25);

      expect(bills, hasLength(2));
      expect(bills.first.displayName, 'Corner Market');
      expect(bills.first.archiveState, SettleoraBillArchiveStateValues.active);
      expect(bills.first.itemCount, 1);
      expect(bills.last.displayName, 'Personal bill');
      expect(bills.last.archiveState, SettleoraBillArchiveStateValues.archived);
      expect(client.listCalls, 2);
      expect(client.archiveStates, [
        api.ExpenseBillArchiveStateValues.active,
        api.ExpenseBillArchiveStateValues.archived,
      ]);
      expect(client.limits, [25, 25]);
      expect(client.accessTokens, ['redacted', 'redacted']);
      expect(accessTokenProvider.calls, 2);
    });

    test('maps generated detail responses into bill detail models', () async {
      final client = FakeBillGeneratedClient(detailBill: sampleApiBill());
      final repository = GeneratedSettleoraBillRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      final detail = await repository.getPersonalBill(_billId);

      expect(detail.id, _billId);
      expect(detail.displayName, 'Corner Market');
      expect(detail.totalAmount, '10.80');
      expect(detail.items.single.name, 'Milk');
      expect(detail.participants.single.resolvedShareAmount, '10.80');
      expect(detail.payers.single.amount, '10.80');
      expect(detail.adjustments.single.type, 'tax');
      expect(client.getCalls, 1);
      expect(client.lastBillId, _billId);
    });

    test(
      'requires a session before calling group bill generated methods',
      () async {
        final client = FakeBillGeneratedClient();
        final repository = GeneratedSettleoraBillRepository(
          client: client,
          accessTokenProvider: FakeAccessTokenProvider(' '),
        );

        final failure = await captureBillFailure(() {
          return repository.listGroupBills(_groupId);
        });

        expect(failure.kind, SettleoraBillFailureKind.sessionRequired);
        expect(client.listGroupCalls, 0);
      },
    );

    test('maps active and archived group bill reads safely', () async {
      final accessTokenProvider = FakeAccessTokenProvider('  redacted  ');
      final client = FakeBillGeneratedClient(
        activeGroupBills: [sampleApiGroupBill(merchantName: 'Noodle House')],
        archivedGroupBills: [
          sampleApiGroupBill(id: _archivedBillId, merchantName: null),
        ],
        groupDetailBill: sampleApiGroupBill(),
      );
      final repository = GeneratedSettleoraBillRepository(
        client: client,
        accessTokenProvider: accessTokenProvider,
      );

      final bills = await repository.listGroupBills('  $_groupId  ', limit: 25);
      final detail = await repository.getGroupBill(
        '  $_groupId  ',
        '  $_billId  ',
      );

      expect(bills, hasLength(2));
      expect(bills.first.displayName, 'Noodle House');
      expect(bills.first.archiveState, SettleoraBillArchiveStateValues.active);
      expect(bills.last.displayName, 'Group bill');
      expect(bills.last.archiveState, SettleoraBillArchiveStateValues.archived);
      expect(detail.displayName, 'Corner Market');
      expect(detail.items.single.name, 'Milk');
      expect(detail.participants.single.resolvedShareAmount, '10.80');
      expect(client.listGroupCalls, 2);
      expect(client.getGroupCalls, 1);
      expect(client.archiveStates, [
        api.ExpenseBillArchiveStateValues.active,
        api.ExpenseBillArchiveStateValues.archived,
      ]);
      expect(client.limits, [25, 25]);
      expect(client.accessTokens, ['redacted', 'redacted', 'redacted']);
      expect(client.lastGroupId, _groupId);
      expect(client.lastBillId, _billId);
      expect(accessTokenProvider.calls, 3);
    });

    test('maps generated failures to bounded safe failures', () async {
      final repository = GeneratedSettleoraBillRepository(
        client: FakeBillGeneratedClient(
          failure: api.SettleoraApiException(
            422,
            'Unprocessable Content',
            _hiddenBody,
          ),
        ),
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      final failure = await captureBillFailure(() {
        return repository.listPersonalBills();
      });

      expect(failure.kind, SettleoraBillFailureKind.validation);
      expect(failure.statusCode, 422);
      expect(failure.message, isNot(contains('internal-detail')));
      expect(failure.toString(), isNot(contains('internal-detail')));
    });

    test('maps network errors to safe retry text', () async {
      final repository = GeneratedSettleoraBillRepository(
        client: FakeBillGeneratedClient(
          failure: const SocketException('internal socket detail'),
        ),
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      final failure = await captureBillFailure(() {
        return repository.listPersonalBills();
      });

      expect(failure.kind, SettleoraBillFailureKind.network);
      expect(failure.message, isNot(contains('internal socket detail')));
    });
  });
}

Future<SettleoraBillFailure> captureBillFailure(
  Future<Object?> Function() operation,
) async {
  try {
    await operation();
  } on SettleoraBillFailure catch (failure) {
    return failure;
  }

  fail('Expected SettleoraBillFailure.');
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

class FakeBillGeneratedClient implements SettleoraBillGeneratedClient {
  FakeBillGeneratedClient({
    this.failure,
    List<api.PersonalBillResponse>? activeBills,
    List<api.PersonalBillResponse>? archivedBills,
    List<api.GroupBillResponse>? activeGroupBills,
    List<api.GroupBillResponse>? archivedGroupBills,
    api.PersonalBillResponse? detailBill,
    api.GroupBillResponse? groupDetailBill,
  }) : activeBills = activeBills ?? const [],
       archivedBills = archivedBills ?? const [],
       activeGroupBills = activeGroupBills ?? const [],
       archivedGroupBills = archivedGroupBills ?? const [],
       detailBill = detailBill ?? sampleApiBill(),
       groupDetailBill = groupDetailBill ?? sampleApiGroupBill();

  final Object? failure;
  final List<api.PersonalBillResponse> activeBills;
  final List<api.PersonalBillResponse> archivedBills;
  final List<api.GroupBillResponse> activeGroupBills;
  final List<api.GroupBillResponse> archivedGroupBills;
  final api.PersonalBillResponse detailBill;
  final api.GroupBillResponse groupDetailBill;
  final archiveStates = <api.ExpenseBillArchiveState?>[];
  final accessTokens = <String>[];
  final limits = <int?>[];
  int listCalls = 0;
  int getCalls = 0;
  int listGroupCalls = 0;
  int getGroupCalls = 0;
  String? lastBillId;
  String? lastGroupId;

  @override
  Future<api.PersonalBillListResponse> listPersonalBills({
    api.ExpenseBillArchiveState? archiveState,
    int? limit,
    required String accessToken,
  }) async {
    listCalls += 1;
    archiveStates.add(archiveState);
    accessTokens.add(accessToken);
    limits.add(limit);
    _throwIfNeeded();
    return api.PersonalBillListResponse(
      bills: archiveState == api.ExpenseBillArchiveStateValues.archived
          ? archivedBills
          : activeBills,
    );
  }

  @override
  Future<api.PersonalBillResponse> getPersonalBill(
    String billId, {
    required String accessToken,
  }) async {
    getCalls += 1;
    lastBillId = billId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return detailBill;
  }

  @override
  Future<api.GroupBillListResponse> listGroupBills(
    String groupId, {
    api.ExpenseBillArchiveState? archiveState,
    int? limit,
    required String accessToken,
  }) async {
    listGroupCalls += 1;
    lastGroupId = groupId;
    archiveStates.add(archiveState);
    accessTokens.add(accessToken);
    limits.add(limit);
    _throwIfNeeded();
    return api.GroupBillListResponse(
      bills: archiveState == api.ExpenseBillArchiveStateValues.archived
          ? archivedGroupBills
          : activeGroupBills,
    );
  }

  @override
  Future<api.GroupBillResponse> getGroupBill(
    String groupId,
    String billId, {
    required String accessToken,
  }) async {
    getGroupCalls += 1;
    lastGroupId = groupId;
    lastBillId = billId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return groupDetailBill;
  }

  void _throwIfNeeded() {
    final error = failure;
    if (error != null) {
      throw error;
    }
  }
}

api.PersonalBillResponse sampleApiBill({
  String id = _billId,
  String? merchantName = 'Corner Market',
}) {
  return api.PersonalBillResponse(
    id: id,
    merchantName: merchantName,
    billDate: '2026-05-17',
    status: api.ExpenseBillStatusValues.draft,
    reconciliation: api.ExpenseBillReconciliationResponse(
      status: api.ExpenseBillReconciliationStatusValues.unreconciled,
      updatedAtUtc: null,
      updatedByUserProfileId: null,
      reconciledAtUtc: null,
      note: null,
    ),
    totalAmount: '10.80',
    totalCurrency: 'USD',
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
    items: [
      api.PersonalBillItemResponse(
        id: _itemId,
        name: 'Milk',
        note: null,
        amount: '10.00',
        currency: 'USD',
        sortOrder: 0,
        splits: const [],
      ),
    ],
    participants: const [
      api.PersonalBillParticipantResponse(
        userProfileId: _userProfileId,
        status: api.ExpenseBillParticipantStatusValues.pendingAcceptance,
        resolvedShareAmount: '10.80',
        resolvedShareCurrency: 'USD',
        rejectionReasonCode: null,
      ),
    ],
    payers: const [
      api.PersonalBillPayerResponse(
        userProfileId: _userProfileId,
        amount: '10.80',
        currency: 'USD',
        paymentMethodLabelSnapshot: null,
      ),
    ],
    adjustments: const [
      api.PersonalBillAdjustmentResponse(
        id: _adjustmentId,
        type: api.ExpenseBillAdjustmentTypeValues.tax,
        direction: api.ExpenseBillAdjustmentDirectionValues.charge,
        allocationMethod:
            api.PersonalBillAdjustmentAllocationMethodValues.equal,
        amount: '0.80',
        currency: 'USD',
        reasonNote: null,
        sortOrder: 0,
      ),
    ],
    calculatedAdjustmentAllocations: const [],
  );
}

api.GroupBillResponse sampleApiGroupBill({
  String id = _billId,
  String groupId = _groupId,
  String? merchantName = 'Corner Market',
}) {
  return api.GroupBillResponse(
    id: id,
    groupId: groupId,
    merchantName: merchantName,
    billDate: '2026-05-17',
    status: api.ExpenseBillStatusValues.draft,
    reconciliation: api.ExpenseBillReconciliationResponse(
      status: api.ExpenseBillReconciliationStatusValues.unreconciled,
      updatedAtUtc: null,
      updatedByUserProfileId: null,
      reconciledAtUtc: null,
      note: null,
    ),
    totalAmount: '10.80',
    totalCurrency: 'USD',
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
    items: [
      api.GroupBillItemResponse(
        id: _itemId,
        name: 'Milk',
        note: null,
        amount: '10.00',
        currency: 'USD',
        sortOrder: 0,
        splits: const [],
      ),
    ],
    participants: const [
      api.GroupBillParticipantResponse(
        userProfileId: _userProfileId,
        status: api.ExpenseBillParticipantStatusValues.pendingAcceptance,
        resolvedShareAmount: '10.80',
        resolvedShareCurrency: 'USD',
        rejectionReasonCode: null,
      ),
    ],
    payers: const [
      api.GroupBillPayerResponse(
        userProfileId: _userProfileId,
        amount: '10.80',
        currency: 'USD',
        paymentMethodLabelSnapshot: null,
      ),
    ],
    adjustments: const [
      api.GroupBillAdjustmentResponse(
        id: _adjustmentId,
        type: api.ExpenseBillAdjustmentTypeValues.tax,
        direction: api.ExpenseBillAdjustmentDirectionValues.charge,
        allocationMethod: api.GroupBillAdjustmentAllocationMethodValues.equal,
        amount: '0.80',
        currency: 'USD',
        reasonNote: null,
        sortOrder: 0,
      ),
    ],
    calculatedAdjustmentAllocations: const [],
  );
}

const _billId = '22222222-2222-2222-2222-222222222222';
const _archivedBillId = '33333333-3333-3333-3333-333333333333';
const _groupId = '99999999-9999-9999-9999-999999999999';
const _itemId = '44444444-4444-4444-4444-444444444444';
const _userProfileId = '55555555-5555-5555-5555-555555555555';
const _adjustmentId = '66666666-6666-6666-6666-666666666666';
const _hiddenBody = {'detail': 'internal-detail'};
final _createdAtUtc = DateTime.utc(2026, 5, 17, 10);
final _updatedAtUtc = DateTime.utc(2026, 5, 17, 11);
