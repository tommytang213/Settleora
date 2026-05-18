import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/bills/bill_repository.dart';

void main() {
  testWidgets('group bill list renders loading, empty, and refresh states', (
    tester,
  ) async {
    final repository = FakeBillRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupBillListScreen(
          repository: repository,
          groupId: _groupId,
          groupName: 'Trip Crew',
        ),
      ),
    );

    expect(find.text('Loading group bills'), findsOneWidget);
    await tester.pumpAndSettle();

    expect(find.text('Trip Crew'), findsOneWidget);
    expect(find.text('No group bills'), findsOneWidget);
    expect(repository.listGroupCalls, 1);

    await tester.tap(find.byKey(const Key('group-bill-list-refresh')));
    await tester.pumpAndSettle();

    expect(repository.listGroupCalls, 2);
  });

  testWidgets('group bill list shows safe error and retries', (tester) async {
    final repository = FakeBillRepository(
      listFailures: [
        const SettleoraBillFailure(
          kind: SettleoraBillFailureKind.denied,
          message: 'Bills are not available to this account.',
          statusCode: 403,
        ),
      ],
      groupBills: [sampleBillSummary()],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupBillListScreen(
          repository: repository,
          groupId: _groupId,
          groupName: 'Trip Crew',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Bills unavailable'), findsOneWidget);
    expect(
      find.text('Bills are not available to this account.'),
      findsOneWidget,
    );

    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();

    expect(find.text('Corner Market'), findsOneWidget);
    expect(repository.listGroupCalls, 2);
  });

  testWidgets('group bill list opens detail and refreshes detail', (
    tester,
  ) async {
    final repository = FakeBillRepository(
      groupBills: [sampleBillSummary()],
      detail: sampleBillDetail(),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupBillListScreen(
          repository: repository,
          groupId: _groupId,
          groupName: 'Trip Crew',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();

    expect(repository.getGroupCalls, 1);
    expect(find.text('Group bill'), findsWidgets);
    expect(find.text('Items'), findsOneWidget);
    expect(find.text('Milk'), findsOneWidget);

    await tester.tap(find.byKey(const Key('group-bill-detail-refresh')));
    await tester.pumpAndSettle();

    expect(repository.getGroupCalls, 2);
  });
}

class FakeBillRepository implements SettleoraBillRepository {
  FakeBillRepository({
    this.groupBills = const [],
    SettleoraBillDetail? detail,
    List<SettleoraBillFailure>? listFailures,
  }) : detail = detail ?? sampleBillDetail(),
       listFailures = listFailures ?? [];

  final List<SettleoraBillSummary> groupBills;
  final SettleoraBillDetail detail;
  final List<SettleoraBillFailure> listFailures;
  int listGroupCalls = 0;
  int getGroupCalls = 0;

  @override
  Future<SettleoraBillDetail> getGroupBill(
    String groupId,
    String billId,
  ) async {
    getGroupCalls += 1;
    return detail;
  }

  @override
  Future<SettleoraBillDetail> getPersonalBill(String billId) {
    throw UnimplementedError();
  }

  @override
  Future<List<SettleoraBillSummary>> listGroupBills(
    String groupId, {
    int limit = 50,
  }) async {
    listGroupCalls += 1;
    if (listFailures.isNotEmpty) {
      throw listFailures.removeAt(0);
    }

    return groupBills;
  }

  @override
  Future<List<SettleoraBillSummary>> listPersonalBills({int limit = 50}) {
    throw UnimplementedError();
  }
}

SettleoraBillSummary sampleBillSummary() {
  return SettleoraBillSummary(
    id: _billId,
    merchantName: 'Corner Market',
    billDate: '2026-05-17',
    status: 'draft',
    reconciliationStatus: 'unreconciled',
    totalAmount: '10.80',
    totalCurrency: 'USD',
    archiveState: SettleoraBillArchiveStateValues.active,
    itemCount: 1,
    participantCount: 1,
    payerCount: 1,
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
    displayNameFallback: 'Group bill',
  );
}

SettleoraBillDetail sampleBillDetail() {
  return SettleoraBillDetail(
    id: _billId,
    merchantName: 'Corner Market',
    billDate: '2026-05-17',
    status: 'draft',
    reconciliationStatus: 'unreconciled',
    reconciliationNote: null,
    totalAmount: '10.80',
    totalCurrency: 'USD',
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
    items: const [
      SettleoraBillItem(
        id: 'item-1',
        name: 'Milk',
        note: null,
        amount: '10.00',
        currency: 'USD',
        sortOrder: 0,
      ),
    ],
    participants: const [
      SettleoraBillParticipant(
        userProfileId: 'profile-1',
        status: 'pending_acceptance',
        resolvedShareAmount: '10.80',
        resolvedShareCurrency: 'USD',
      ),
    ],
    payers: const [
      SettleoraBillPayer(
        userProfileId: 'profile-1',
        amount: '10.80',
        currency: 'USD',
      ),
    ],
    adjustments: const [],
    displayNameFallback: 'Group bill',
  );
}

const _groupId = '11111111-1111-1111-1111-111111111111';
const _billId = '22222222-2222-2222-2222-222222222222';
final _createdAtUtc = DateTime.utc(2026, 5, 17, 10);
final _updatedAtUtc = DateTime.utc(2026, 5, 17, 11);
