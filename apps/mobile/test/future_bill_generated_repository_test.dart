import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/settleora_api_client.dart';
import 'package:mobile/future_bills/future_bill_repository.dart';
import 'package:mobile/future_bills/generated_future_bill_repository.dart';
import 'package:settleora_api_client/settleora_api.dart' as api;

void main() {
  group('GeneratedSettleoraFutureBillRepository', () {
    test('requires a session before calling the generated client', () async {
      final client = FakeFutureBillGeneratedClient();
      final repository = GeneratedSettleoraFutureBillRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider(null),
      );

      final failure = await captureFutureBillFailure(() {
        return repository.listFutureBills();
      });

      expect(failure.kind, SettleoraFutureBillFailureKind.sessionRequired);
      expect(client.listCalls, 0);
    });

    test('maps list and detail responses into mobile models', () async {
      final client = FakeFutureBillGeneratedClient(
        futureBills: [
          sampleApiFutureBill(),
          sampleApiFutureBill(
            id: _cancelledFutureBillId,
            merchantName: null,
            status: api.FutureBillStatusValues.cancelled,
            archivedAtUtc: DateTime.utc(2026, 6, 19),
          ),
        ],
      );
      final repository = GeneratedSettleoraFutureBillRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider(' redacted '),
      );

      final futureBills = await repository.listFutureBills(
        status: ' draft ',
        fromDate: ' 2026-06-19 ',
        toDate: '2026-07-01',
        includeArchived: true,
        maxItems: 10,
      );
      final detail = await repository.getFutureBill(' $_futureBillId ');

      expect(futureBills, hasLength(2));
      expect(futureBills.first.displayName, 'Insurance');
      expect(futureBills.first.totalAmount, '120.00');
      expect(futureBills.first.totalCurrency, 'USD');
      expect(futureBills.first.canCancel, isTrue);
      expect(futureBills.first.settlementEffective, isFalse);
      expect(futureBills.last.displayName, 'Future bill');
      expect(futureBills.last.canCancel, isFalse);
      expect(detail.items.single.name, 'Insurance');
      expect(detail.items.single.note, 'Annual premium');
      expect(client.lastStatus, api.FutureBillStatusValues.draft);
      expect(client.lastFromDate, '2026-06-19');
      expect(client.lastToDate, '2026-07-01');
      expect(client.lastIncludeArchived, isTrue);
      expect(client.accessTokens, ['redacted', 'redacted']);
    });

    test('creates, updates, and cancels through generated client', () async {
      final client = FakeFutureBillGeneratedClient();
      final repository = GeneratedSettleoraFutureBillRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      await repository.createFutureBill(
        const SettleoraFutureBillCreateDraft(
          merchantName: ' Insurance ',
          amount: ' 120.00 ',
          currency: ' usd ',
          dueDate: ' 2026-06-19 ',
          note: ' Annual premium ',
        ),
      );
      await repository.updateFutureBill(
        futureBillId: ' $_futureBillId ',
        draft: const SettleoraFutureBillUpdateDraft(
          merchantName: ' Insurance v2 ',
          dueDate: ' 2026-06-20 ',
        ),
      );
      await repository.cancelFutureBill(' $_futureBillId ');

      expect(client.createCalls, 1);
      expect(client.updateCalls, 1);
      expect(client.cancelCalls, 1);
      expect(client.lastCreateRequest?.merchantName, 'Insurance');
      expect(client.lastCreateRequest?.dueDate, '2026-06-19');
      expect(client.lastCreateRequest?.billPayload.currency, 'USD');
      expect(
        client.lastCreateRequest?.billPayload.items.single.name,
        'Insurance',
      );
      expect(
        client.lastCreateRequest?.billPayload.items.single.amount,
        '120.00',
      );
      expect(
        client.lastCreateRequest?.billPayload.items.single.note,
        'Annual premium',
      );
      expect(client.lastUpdateRequest?.merchantName, 'Insurance v2');
      expect(client.lastUpdateRequest?.dueDate, '2026-06-20');
      expect(client.lastFutureBillId, _futureBillId);
    });

    test('maps generated API errors to bounded failure kinds', () async {
      final client = FakeFutureBillGeneratedClient(
        listError: const api.SettleoraApiException(409, 'Conflict', null),
      );
      final repository = GeneratedSettleoraFutureBillRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      final failure = await captureFutureBillFailure(() {
        return repository.listFutureBills();
      });

      expect(failure.kind, SettleoraFutureBillFailureKind.conflict);
      expect(failure.statusCode, 409);
    });
  });
}

Future<SettleoraFutureBillFailure> captureFutureBillFailure(
  Future<void> Function() action,
) async {
  try {
    await action();
  } catch (error) {
    return SettleoraFutureBillFailure.from(error);
  }

  fail('Expected SettleoraFutureBillFailure');
}

class FakeAccessTokenProvider implements SettleoraAccessTokenProvider {
  FakeAccessTokenProvider(this._accessToken);

  final String? _accessToken;

  @override
  Future<String?> accessToken() async => _accessToken;
}

class FakeFutureBillGeneratedClient
    implements SettleoraFutureBillGeneratedClient {
  FakeFutureBillGeneratedClient({
    List<api.FutureBillResponse>? futureBills,
    this.listError,
  }) : futureBills = futureBills ?? [sampleApiFutureBill()];

  final List<api.FutureBillResponse> futureBills;
  final Object? listError;
  final accessTokens = <String>[];
  int listCalls = 0;
  int getCalls = 0;
  int createCalls = 0;
  int updateCalls = 0;
  int cancelCalls = 0;
  String? lastStatus;
  String? lastFromDate;
  String? lastToDate;
  bool? lastIncludeArchived;
  String? lastFutureBillId;
  api.CreateFutureBillRequest? lastCreateRequest;
  api.UpdateFutureBillRequest? lastUpdateRequest;

  @override
  Future<api.FutureBillListResponse> listFutureBills({
    api.FutureBillStatus? status,
    String? groupId,
    String? fromDate,
    String? toDate,
    bool? includeArchived,
    required String accessToken,
  }) async {
    listCalls += 1;
    accessTokens.add(accessToken);
    lastStatus = status;
    lastFromDate = fromDate;
    lastToDate = toDate;
    lastIncludeArchived = includeArchived;
    final error = listError;
    if (error != null) {
      throw error;
    }

    return api.FutureBillListResponse(futureBills: futureBills);
  }

  @override
  Future<api.FutureBillResponse> getFutureBill(
    String futureBillId, {
    required String accessToken,
  }) async {
    getCalls += 1;
    accessTokens.add(accessToken);
    lastFutureBillId = futureBillId;
    return futureBills.first;
  }

  @override
  Future<api.FutureBillResponse> createFutureBill(
    api.CreateFutureBillRequest body, {
    required String accessToken,
  }) async {
    createCalls += 1;
    accessTokens.add(accessToken);
    lastCreateRequest = body;
    return futureBills.first;
  }

  @override
  Future<api.FutureBillResponse> updateFutureBill(
    String futureBillId,
    api.UpdateFutureBillRequest body, {
    required String accessToken,
  }) async {
    updateCalls += 1;
    accessTokens.add(accessToken);
    lastFutureBillId = futureBillId;
    lastUpdateRequest = body;
    return futureBills.first;
  }

  @override
  Future<api.FutureBillResponse> cancelFutureBill(
    String futureBillId, {
    required String accessToken,
  }) async {
    cancelCalls += 1;
    accessTokens.add(accessToken);
    lastFutureBillId = futureBillId;
    return sampleApiFutureBill(status: api.FutureBillStatusValues.cancelled);
  }
}

api.FutureBillResponse sampleApiFutureBill({
  String id = _futureBillId,
  String? merchantName = 'Insurance',
  String status = api.FutureBillStatusValues.draft,
  DateTime? archivedAtUtc,
}) {
  return api.FutureBillResponse(
    id: id,
    ownerUserProfileId: _ownerProfileId,
    groupId: null,
    merchantName: merchantName,
    dueDate: '2026-06-19',
    status: status,
    settlementEffective: false,
    totalAmount: '120.00',
    totalCurrency: 'USD',
    billPayload: api.RecurringBillTemplatePayload(
      currency: 'USD',
      items: [
        api.RecurringBillTemplatePayloadItem(
          name: 'Insurance',
          note: 'Annual premium',
          amount: '120.00',
          currency: 'USD',
        ),
      ],
    ),
    createdAtUtc: DateTime.utc(2026, 6, 18),
    updatedAtUtc: DateTime.utc(2026, 6, 18, 1),
    archivedAtUtc: archivedAtUtc,
  );
}

const _futureBillId = '11111111-1111-1111-1111-111111111111';
const _cancelledFutureBillId = '22222222-2222-2222-2222-222222222222';
const _ownerProfileId = '33333333-3333-3333-3333-333333333333';
