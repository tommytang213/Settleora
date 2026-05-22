import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/bills/bill_revision_repository.dart';
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
    expect(
      find.byKey(const Key('group-bill-detail-propose-change')),
      findsNothing,
    );

    await tester.tap(find.byKey(const Key('group-bill-detail-refresh')));
    await tester.pumpAndSettle();

    expect(repository.getGroupCalls, 2);
  });

  testWidgets('group bill detail creates revision from server capability', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final detail = sampleBillDetail(canCreateRevision: true);
    final repository = FakeBillRepository(
      groupBills: [sampleBillSummary()],
      details: [detail, detail, detail],
    );
    final revisionRepository = FakeBillRevisionRepository(
      createResponse: sampleRevision(id: _createdRevisionId),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupBillListScreen(
          repository: repository,
          revisionRepository: revisionRepository,
          groupId: _groupId,
          groupName: 'Trip Crew',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('group-bill-detail-propose-change')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-revision-proposal-save')));
    await tester.pumpAndSettle();

    expect(repository.getGroupCalls, 3);
    expect(revisionRepository.createCalls, 1);
    expect(revisionRepository.lastCreatedBillId, _billId);
    expect(revisionRepository.lastProposal?.totalAmount, '10.80');
    expect(find.text('Revision review'), findsOneWidget);
  });

  testWidgets(
    'group bill detail stops stale create capability before opening',
    (tester) async {
      await useLargeSurface(tester);
      final repository = FakeBillRepository(
        groupBills: [sampleBillSummary()],
        details: [
          sampleBillDetail(canCreateRevision: true),
          sampleBillDetail(canCreateRevision: false),
        ],
      );
      final revisionRepository = FakeBillRevisionRepository();

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraGroupBillListScreen(
            repository: repository,
            revisionRepository: revisionRepository,
            groupId: _groupId,
            groupName: 'Trip Crew',
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Corner Market'));
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const Key('group-bill-detail-propose-change')),
      );
      await tester.pumpAndSettle();

      expect(repository.getGroupCalls, 2);
      expect(revisionRepository.createCalls, 0);
      expect(
        find.byKey(const Key('group-bill-detail-propose-change')),
        findsNothing,
      );
      expect(find.textContaining('Refresh needed'), findsOneWidget);
    },
  );

  testWidgets('group bill create save refreshes capability before mutation', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeBillRepository(
      groupBills: [sampleBillSummary()],
      details: [
        sampleBillDetail(canCreateRevision: true),
        sampleBillDetail(canCreateRevision: true),
        sampleBillDetail(canCreateRevision: false),
      ],
    );
    final revisionRepository = FakeBillRevisionRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupBillListScreen(
          repository: repository,
          revisionRepository: revisionRepository,
          groupId: _groupId,
          groupName: 'Trip Crew',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('group-bill-detail-propose-change')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-revision-proposal-save')));
    await tester.pumpAndSettle();

    expect(repository.getGroupCalls, 3);
    expect(revisionRepository.createCalls, 0);
    expect(find.text('Refresh needed'), findsOneWidget);
    expect(
      find.text(
        'This bill can no longer accept a revision proposal. Review the refreshed bill before trying again.',
      ),
      findsOneWidget,
    );
  });
}

Future<void> useLargeSurface(WidgetTester tester) async {
  await tester.binding.setSurfaceSize(const Size(900, 1600));
  addTearDown(() => tester.binding.setSurfaceSize(null));
}

class FakeBillRepository implements SettleoraBillRepository {
  FakeBillRepository({
    this.groupBills = const [],
    SettleoraBillDetail? detail,
    List<SettleoraBillDetail>? details,
    List<SettleoraBillFailure>? listFailures,
  }) : details = details ?? [detail ?? sampleBillDetail()],
       listFailures = listFailures ?? [];

  final List<SettleoraBillSummary> groupBills;
  final List<SettleoraBillDetail> details;
  final List<SettleoraBillFailure> listFailures;
  int listGroupCalls = 0;
  int getGroupCalls = 0;

  SettleoraBillDetail _detailForCall(int callIndex) {
    final index = callIndex < details.length ? callIndex : details.length - 1;
    return details[index];
  }

  @override
  Future<SettleoraBillDetail> createPersonalBill(
    SettleoraPersonalBillCreateDraft draft,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillDetail> getGroupBill(
    String groupId,
    String billId,
  ) async {
    getGroupCalls += 1;
    return _detailForCall(getGroupCalls - 1);
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

class FakeBillRevisionRepository implements SettleoraBillRevisionRepository {
  FakeBillRevisionRepository({
    this.revisions = const [],
    SettleoraBillRevision? detailResponse,
    SettleoraBillRevision? createResponse,
  }) : detailResponse = detailResponse ?? createResponse ?? sampleRevision(),
       createResponse = createResponse ?? detailResponse ?? sampleRevision();

  final List<SettleoraBillRevision> revisions;
  SettleoraBillRevision detailResponse;
  SettleoraBillRevision createResponse;
  int listCalls = 0;
  int getCalls = 0;
  int createCalls = 0;
  String? lastCreatedBillId;
  SettleoraBillRevisionProposalSnapshot? lastProposal;

  @override
  Future<List<SettleoraBillRevision>> listBillRevisions(String billId) async {
    listCalls += 1;
    return revisions;
  }

  @override
  Future<SettleoraBillRevision> createBillRevision(
    String billId,
    SettleoraBillRevisionProposalSnapshot proposal,
  ) async {
    createCalls += 1;
    lastCreatedBillId = billId;
    lastProposal = proposal;
    detailResponse = createResponse;
    return createResponse;
  }

  @override
  Future<SettleoraBillRevision> getBillRevision(
    String billId,
    String revisionId,
  ) async {
    getCalls += 1;
    return detailResponse;
  }

  @override
  Future<SettleoraBillRevision> reviseBillRevision(
    String billId,
    String revisionId,
    SettleoraBillRevisionProposalSnapshot proposal,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> submitBillRevision(
    String billId,
    String revisionId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> withdrawBillRevision(
    String billId,
    String revisionId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> approveBillRevision(
    SettleoraBillRevision revision,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> rejectBillRevision(
    String billId,
    String revisionId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> confirmBillRevisionPayer(
    SettleoraBillRevision revision,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> applyBillRevision(
    String billId,
    String revisionId,
  ) {
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

SettleoraBillDetail sampleBillDetail({bool canCreateRevision = false}) {
  return SettleoraBillDetail(
    id: _billId,
    merchantName: 'Corner Market',
    billDate: '2026-05-17',
    status: 'draft',
    reconciliationStatus: 'unreconciled',
    reconciliationNote: null,
    revisionCreationActions: SettleoraBillRevisionCreationActions(
      canCreateRevision: canCreateRevision,
    ),
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
        userProfileId: _profileId,
        status: 'pending_acceptance',
        resolvedShareAmount: '10.80',
        resolvedShareCurrency: 'USD',
      ),
    ],
    payers: const [
      SettleoraBillPayer(
        userProfileId: _profileId,
        amount: '10.80',
        currency: 'USD',
      ),
    ],
    adjustments: const [],
    displayNameFallback: 'Group bill',
  );
}

SettleoraBillRevision sampleRevision({String id = _revisionId}) {
  return SettleoraBillRevision(
    id: id,
    billId: _billId,
    groupId: _groupId,
    status: SettleoraBillRevisionStatusValues.draftRevision,
    totalAmount: '10.80',
    totalCurrency: 'USD',
    calculationHash: _hash,
    submittedAtUtc: null,
    updatedAtUtc: _updatedAtUtc,
    participants: const [
      SettleoraBillRevisionParticipant(
        userProfileId: _profileId,
        resolvedShareAmount: '10.80',
        resolvedShareCurrency: 'USD',
        affectedByRevision: true,
      ),
    ],
    payers: const [
      SettleoraBillRevisionPayer(
        userProfileId: _profileId,
        amount: '10.80',
        currency: 'USD',
        requiresPayerConfirmation: false,
        payerConfirmationStatus:
            SettleoraBillRevisionPayerConfirmationStatusValues.confirmed,
      ),
    ],
    approvals: const [],
    viewerActions: const SettleoraBillRevisionViewerActions(
      canSubmit: true,
      canWithdraw: false,
      canRevise: false,
      canApprove: false,
      canReject: false,
      canConfirmPayer: false,
      canApply: false,
    ),
    reviewContext: sampleReviewContext(),
    viewerApprovalBasis: null,
  );
}

SettleoraBillRevisionReviewContext sampleReviewContext() {
  return SettleoraBillRevisionReviewContext(
    viewerUserProfileId: _profileId,
    baseline: SettleoraBillRevisionReviewBaseline(
      baselineType:
          SettleoraBillRevisionReviewBaselineTypeValues.activeAcceptedBill,
      baselineBillRevisionId: '11111111-1111-1111-1111-111111111111',
      baselineRevisionStatus: SettleoraBillRevisionStatusValues.acceptedApplied,
      baselineReviewedAtUtc: null,
      derivationReason: 'Server selected the active accepted bill baseline.',
    ),
    defaultViewMode: SettleoraBillRevisionReviewViewModeValues.fullBill,
    fullViewRecommendedReason:
        SettleoraBillRevisionReviewRecommendationReasonValues
            .baselineAvailableFullViewOptional,
    viewerFinancialImpact: const SettleoraBillRevisionViewerFinancialImpact(
      previousShare: SettleoraBillRevisionMoneyValue(
        amount: '10.80',
        currency: 'USD',
      ),
      proposedShare: SettleoraBillRevisionMoneyValue(
        amount: '10.80',
        currency: 'USD',
      ),
      deltaShare: SettleoraBillRevisionMoneyValue(
        amount: '0.00',
        currency: 'USD',
      ),
      affectedByRevision: true,
      isPayer: false,
      payerImpact: null,
    ),
    changeSummary: const [],
    changes: const [],
    limitations: const [],
  );
}

const _groupId = '11111111-1111-1111-1111-111111111111';
const _billId = '22222222-2222-2222-2222-222222222222';
const _revisionId = '33333333-3333-3333-3333-333333333333';
const _createdRevisionId = '44444444-4444-4444-4444-444444444444';
const _profileId = '55555555-5555-5555-5555-555555555555';
const _hash =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
final _createdAtUtc = DateTime.utc(2026, 5, 17, 10);
final _updatedAtUtc = DateTime.utc(2026, 5, 17, 11);
