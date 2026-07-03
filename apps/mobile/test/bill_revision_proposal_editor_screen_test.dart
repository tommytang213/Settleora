import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_revision_proposal_editor_screen.dart';
import 'package:mobile/bills/bill_revision_repository.dart';
import 'package:mobile/ui/settleora_form_fields.dart';

void main() {
  testWidgets('editor shows local preview and validates before repository call', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeBillRevisionRepository(
      revision: sampleRevision(canRevise: true),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillRevisionProposalEditorScreen.revise(
          repository: repository,
          revision: sampleRevision(canRevise: true),
          billLabel: 'Corner Market',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Save sends for review'), findsOneWidget);
    expect(
      find.text(
        'Save sends a replacement for review. It does not change the bill yet, and previous approvals do not carry over.',
      ),
      findsOneWidget,
    );
    expect(
      find.text(
        'Check the proposal before saving. The review screen will show what people need to approve.',
      ),
      findsOneWidget,
    );
    expect(find.text('Local preview'), findsOneWidget);
    expect(find.text('Unsupported in this editor'), findsOneWidget);
    expect(find.text('Item-level edits'), findsOneWidget);
    expect(find.text('Receipt or OCR review'), findsOneWidget);
    expect(find.byType(MoneyInput), findsNWidgets(3));
    expect(find.byType(MoneyAmountCurrencyField), findsNothing);

    await tester.enterText(find.byKey(const Key('proposal-total-amount')), '');
    await tester.tap(find.byKey(const Key('bill-revision-proposal-save')));
    await tester.pumpAndSettle();

    expect(
      find.text('Enter a proposal total amount before saving.'),
      findsOneWidget,
    );
    expect(repository.getCalls, 0);
    expect(repository.reviseCalls, 0);
  });

  testWidgets('revise save refreshes capability and sends supported fields', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final fresh = sampleRevision(canRevise: true);
    final repository = FakeBillRevisionRepository(
      revision: sampleRevision(canRevise: true),
      getResponses: [fresh],
      reviseResponse: sampleRevision(id: _replacementRevisionId),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillRevisionProposalEditorScreen.revise(
          repository: repository,
          revision: sampleRevision(canRevise: true),
          billLabel: 'Corner Market',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('proposal-total-amount')),
      '14.50',
    );
    await tester.enterText(
      find.byKey(const Key('proposal-participant-0-amount')),
      '14.50',
    );
    await tester.enterText(
      find.byKey(const Key('proposal-payer-0-amount')),
      '14.50',
    );
    await tester.tap(find.byKey(const Key('bill-revision-proposal-save')));
    await tester.pumpAndSettle();

    expect(repository.getCalls, 1);
    expect(repository.reviseCalls, 1);
    expect(repository.lastRevisedBillId, _billId);
    expect(repository.lastRevisedRevisionId, _revisionId);
    expect(repository.lastProposal?.totalAmount, '14.50');
    expect(repository.lastProposal?.totalCurrency, 'USD');
    expect(
      repository.lastProposal?.participants.single.resolvedShareAmount,
      '14.50',
    );
    expect(repository.lastProposal?.payers.single.amount, '14.50');
  });

  testWidgets('revise save stops when refreshed server capability denies', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeBillRevisionRepository(
      revision: sampleRevision(canRevise: true),
      getResponses: [sampleRevision(canRevise: false)],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillRevisionProposalEditorScreen.revise(
          repository: repository,
          revision: sampleRevision(canRevise: true),
          billLabel: 'Corner Market',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('bill-revision-proposal-save')));
    await tester.pumpAndSettle();

    expect(repository.getCalls, 1);
    expect(repository.reviseCalls, 0);
    expect(find.text('Refresh needed'), findsOneWidget);
    expect(
      find.text(
        'This proposal can no longer be revised. Review the refreshed revision before trying again.',
      ),
      findsOneWidget,
    );
  });

  testWidgets(
    'create mode stays internal and calls create seam when provided',
    (tester) async {
      await useLargeSurface(tester);
      final repository = FakeBillRevisionRepository(
        revision: sampleRevision(canRevise: true),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillRevisionProposalEditorScreen.create(
            repository: repository,
            billId: _billId,
            billLabel: 'Corner Market',
            initialProposal: sampleProposalSnapshot(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('bill-revision-proposal-save')));
      await tester.pumpAndSettle();

      expect(repository.createCalls, 1);
      expect(repository.reviseCalls, 0);
      expect(repository.lastCreatedBillId, _billId);
      expect(repository.lastProposal?.totalAmount, '12.00');
    },
  );

  testWidgets('create mode can use guarded create callback', (tester) async {
    await useLargeSurface(tester);
    final repository = FakeBillRevisionRepository(
      revision: sampleRevision(canRevise: true),
    );
    var guardCalls = 0;

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillRevisionProposalEditorScreen.create(
          repository: repository,
          billId: _billId,
          billLabel: 'Corner Market',
          initialProposal: sampleProposalSnapshot(),
          onCreate: (proposal) async {
            guardCalls += 1;
            expect(proposal.totalAmount, '12.00');
            return sampleRevision(id: _replacementRevisionId);
          },
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('bill-revision-proposal-save')));
    await tester.pumpAndSettle();

    expect(guardCalls, 1);
    expect(repository.createCalls, 0);
  });
}

Future<void> useLargeSurface(WidgetTester tester) async {
  await tester.binding.setSurfaceSize(const Size(900, 1600));
  addTearDown(() => tester.binding.setSurfaceSize(null));
}

class FakeBillRevisionRepository implements SettleoraBillRevisionRepository {
  FakeBillRevisionRepository({
    required this.revision,
    List<SettleoraBillRevision>? getResponses,
    SettleoraBillRevision? reviseResponse,
  }) : getResponses = getResponses ?? [revision],
       reviseResponse = reviseResponse ?? revision;

  SettleoraBillRevision revision;
  final List<SettleoraBillRevision> getResponses;
  final SettleoraBillRevision reviseResponse;
  int getCalls = 0;
  int createCalls = 0;
  int reviseCalls = 0;
  String? lastCreatedBillId;
  String? lastRevisedBillId;
  String? lastRevisedRevisionId;
  SettleoraBillRevisionProposalSnapshot? lastProposal;

  @override
  Future<List<SettleoraBillRevision>> listBillRevisions(String billId) async {
    return [revision];
  }

  @override
  Future<SettleoraBillRevision> createBillRevision(
    String billId,
    SettleoraBillRevisionProposalSnapshot proposal,
  ) async {
    createCalls += 1;
    lastCreatedBillId = billId;
    lastProposal = proposal;
    return revision;
  }

  @override
  Future<SettleoraBillRevision> getBillRevision(
    String billId,
    String revisionId,
  ) async {
    final index = getCalls < getResponses.length
        ? getCalls
        : getResponses.length - 1;
    getCalls += 1;
    revision = getResponses[index];
    return revision;
  }

  @override
  Future<SettleoraBillRevision> reviseBillRevision(
    String billId,
    String revisionId,
    SettleoraBillRevisionProposalSnapshot proposal,
  ) async {
    reviseCalls += 1;
    lastRevisedBillId = billId;
    lastRevisedRevisionId = revisionId;
    lastProposal = proposal;
    revision = reviseResponse;
    return reviseResponse;
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

SettleoraBillRevision sampleRevision({
  String id = _revisionId,
  bool canRevise = false,
}) {
  return SettleoraBillRevision(
    id: id,
    billId: _billId,
    groupId: null,
    status: SettleoraBillRevisionStatusValues.submittedForReview,
    totalAmount: '12.00',
    totalCurrency: 'USD',
    calculationHash: _hash,
    submittedAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
    participants: const [
      SettleoraBillRevisionParticipant(
        userProfileId: _profileId,
        resolvedShareAmount: '12.00',
        resolvedShareCurrency: 'USD',
        affectedByRevision: true,
      ),
    ],
    payers: const [
      SettleoraBillRevisionPayer(
        userProfileId: _profileId,
        amount: '12.00',
        currency: 'USD',
        requiresPayerConfirmation: false,
        payerConfirmationStatus:
            SettleoraBillRevisionPayerConfirmationStatusValues.confirmed,
      ),
    ],
    approvals: const [],
    viewerActions: SettleoraBillRevisionViewerActions(
      canSubmit: false,
      canWithdraw: false,
      canRevise: canRevise,
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
    defaultViewMode: SettleoraBillRevisionReviewViewModeValues.changedOnly,
    fullViewRecommendedReason:
        SettleoraBillRevisionReviewRecommendationReasonValues
            .baselineAvailableFullViewOptional,
    viewerFinancialImpact: const SettleoraBillRevisionViewerFinancialImpact(
      previousShare: SettleoraBillRevisionMoneyValue(
        amount: '10.00',
        currency: 'USD',
      ),
      proposedShare: SettleoraBillRevisionMoneyValue(
        amount: '12.00',
        currency: 'USD',
      ),
      deltaShare: SettleoraBillRevisionMoneyValue(
        amount: '2.00',
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

SettleoraBillRevisionProposalSnapshot sampleProposalSnapshot() {
  return const SettleoraBillRevisionProposalSnapshot(
    totalAmount: '12.00',
    totalCurrency: 'USD',
    participants: [
      SettleoraBillRevisionProposalParticipantRow(
        userProfileId: _profileId,
        resolvedShareAmount: '12.00',
        resolvedShareCurrency: 'USD',
      ),
    ],
    payers: [
      SettleoraBillRevisionProposalPayerRow(
        userProfileId: _profileId,
        amount: '12.00',
        currency: 'USD',
      ),
    ],
  );
}

const _billId = '22222222-2222-2222-2222-222222222222';
const _revisionId = '33333333-3333-3333-3333-333333333333';
const _replacementRevisionId = '55555555-5555-5555-5555-555555555555';
const _profileId = '44444444-4444-4444-4444-444444444444';
const _hash =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
final _createdAtUtc = DateTime.utc(2026, 5, 18, 10);
final _updatedAtUtc = DateTime.utc(2026, 5, 18, 11);
