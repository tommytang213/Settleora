import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/bills/bill_revision_repository.dart';
import 'package:mobile/bills/bill_revision_review_screen.dart';
import 'package:mobile/bills/bill_repository.dart';

void main() {
  testWidgets(
    'review screen renders server review context and accessible markers',
    (tester) async {
      await useLargeSurface(tester);
      final semantics = tester.ensureSemantics();
      final repository = FakeBillRevisionRepository(revision: sampleRevision());

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillRevisionReviewScreen(
            repository: repository,
            billId: _billId,
            revisionId: _revisionId,
            billLabel: 'Corner Market',
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Financial impact'), findsOneWidget);
      expect(find.text('10.00 USD'), findsWidgets);
      expect(find.text('12.00 USD'), findsWidgets);
      expect(find.text('Review baseline'), findsOneWidget);
      expect(find.text('Changed-only review'), findsOneWidget);
      expect(find.text('Changed'), findsWidgets);
      expect(
        tester.getSemantics(find.text('Changed').first).label,
        contains('Changed'),
      );
      expect(find.text('Limitations'), findsOneWidget);
      expect(
        find.text('Last View Without Approval Or Rejection Not Persisted'),
        findsOneWidget,
      );
      expect(find.text('Payer confirmation required'), findsWidgets);
      expect(
        find.byKey(const Key('bill-revision-payer-confirmation-unavailable')),
        findsOneWidget,
      );
      semantics.dispose();
    },
  );

  testWidgets('no-baseline users default to full bill review', (tester) async {
    await useLargeSurface(tester);
    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillRevisionReviewScreen(
          repository: FakeBillRevisionRepository(
            revision: sampleRevision(
              baselineType:
                  SettleoraBillRevisionReviewBaselineTypeValues.noPriorBaseline,
              defaultViewMode:
                  SettleoraBillRevisionReviewViewModeValues.changedOnly,
            ),
          ),
          billId: _billId,
          revisionId: _revisionId,
          billLabel: 'Corner Market',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Full bill review'), findsOneWidget);
    expect(find.text('Changed-only review'), findsNothing);
    expect(
      find.textContaining('Changed-only review may be unavailable'),
      findsOneWidget,
    );
  });

  testWidgets('safe-baseline users can switch back to full bill', (
    tester,
  ) async {
    await useLargeSurface(tester);
    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillRevisionReviewScreen(
          repository: FakeBillRevisionRepository(revision: sampleRevision()),
          billId: _billId,
          revisionId: _revisionId,
          billLabel: 'Corner Market',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Changed-only review'), findsOneWidget);

    await tester.tap(find.text('Full bill'));
    await tester.pumpAndSettle();

    expect(find.text('Full bill review'), findsOneWidget);
    expect(find.text('Bill total'), findsWidgets);
  });

  testWidgets('approve action uses server-provided approval basis', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeBillRevisionRepository(
      revision: sampleRevision(),
      approveResponse: sampleRevision(
        approvalStatus: SettleoraBillRevisionApprovalStatusValues.approved,
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillRevisionReviewScreen(
          repository: repository,
          billId: _billId,
          revisionId: _revisionId,
          billLabel: 'Corner Market',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.drag(find.byType(ListView), const Offset(0, -700));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-revision-approve')));
    await tester.pumpAndSettle();

    expect(repository.approveCalls, 1);
    expect(
      repository.lastApprovedRevision?.viewerApprovalBasis?.acceptedAmount,
      '12.00',
    );
    expect(
      repository.lastApprovedRevision?.viewerApprovalBasis?.currency,
      'USD',
    );
    expect(
      repository.lastApprovedRevision?.viewerApprovalBasis?.calculationHash,
      _hash,
    );
    expect(find.text('Revision approval recorded.'), findsOneWidget);
  });

  testWidgets('reject action shows consequence text and terminal state', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeBillRevisionRepository(
      revision: sampleRevision(),
      rejectResponse: sampleRevision(
        status: SettleoraBillRevisionStatusValues.rejected,
        approvalStatus: SettleoraBillRevisionApprovalStatusValues.rejected,
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillRevisionReviewScreen(
          repository: repository,
          billId: _billId,
          revisionId: _revisionId,
          billLabel: 'Corner Market',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.drag(find.byType(ListView), const Offset(0, -700));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-revision-reject')));
    await tester.pumpAndSettle();

    expect(find.text('Reject this revision?'), findsOneWidget);
    expect(
      find.textContaining('The active bill is not changed'),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const Key('bill-revision-reject-confirm')));
    await tester.pumpAndSettle();

    expect(repository.rejectCalls, 1);
    expect(find.textContaining('Revision rejected'), findsOneWidget);
    expect(find.textContaining('terminal state'), findsOneWidget);
    expect(find.byKey(const Key('bill-revision-approve')), findsNothing);
  });

  testWidgets('missing approval basis disables unsafe approve button', (
    tester,
  ) async {
    await useLargeSurface(tester);
    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillRevisionReviewScreen(
          repository: FakeBillRevisionRepository(
            revision: sampleRevision(includeViewerApprovalBasis: false),
          ),
          billId: _billId,
          revisionId: _revisionId,
          billLabel: 'Corner Market',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.drag(find.byType(ListView), const Offset(0, -700));
    await tester.pumpAndSettle();

    final approveButton = tester.widget<FilledButton>(
      find.byKey(const Key('bill-revision-approve')),
    );
    expect(approveButton.enabled, isFalse);
  });

  testWidgets('bill detail shows pending revision banner and opens review', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final revisionRepository = FakeBillRevisionRepository(
      revision: sampleRevision(),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillDetailScreen(
          repository: FakeBillRepository(detail: sampleBillDetail()),
          revisionRepository: revisionRepository,
          billId: _billId,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.byKey(const Key('bill-detail-pending-revision-banner')),
      findsOneWidget,
    );
    expect(find.text('Pending revision review'), findsOneWidget);

    await tester.tap(find.byKey(const Key('bill-detail-open-revision-review')));
    await tester.pumpAndSettle();

    expect(revisionRepository.getCalls, 1);
    expect(find.text('Revision review'), findsOneWidget);
    expect(find.text('Financial impact'), findsOneWidget);
  });
}

Future<void> useLargeSurface(WidgetTester tester) async {
  await tester.binding.setSurfaceSize(const Size(900, 1600));
  addTearDown(() => tester.binding.setSurfaceSize(null));
}

class FakeBillRevisionRepository implements SettleoraBillRevisionRepository {
  FakeBillRevisionRepository({
    required this.revision,
    SettleoraBillRevision? approveResponse,
    SettleoraBillRevision? rejectResponse,
  }) : approveResponse = approveResponse ?? revision,
       rejectResponse = rejectResponse ?? revision;

  SettleoraBillRevision revision;
  final SettleoraBillRevision approveResponse;
  final SettleoraBillRevision rejectResponse;
  int listCalls = 0;
  int getCalls = 0;
  int approveCalls = 0;
  int rejectCalls = 0;
  SettleoraBillRevision? lastApprovedRevision;

  @override
  Future<List<SettleoraBillRevision>> listBillRevisions(String billId) async {
    listCalls += 1;
    return [revision];
  }

  @override
  Future<SettleoraBillRevision> getBillRevision(
    String billId,
    String revisionId,
  ) async {
    getCalls += 1;
    return revision;
  }

  @override
  Future<SettleoraBillRevision> approveBillRevision(
    SettleoraBillRevision revision,
  ) async {
    approveCalls += 1;
    lastApprovedRevision = revision;
    this.revision = approveResponse;
    return approveResponse;
  }

  @override
  Future<SettleoraBillRevision> rejectBillRevision(
    String billId,
    String revisionId,
  ) async {
    rejectCalls += 1;
    revision = rejectResponse;
    return rejectResponse;
  }
}

class FakeBillRepository implements SettleoraBillRepository {
  FakeBillRepository({required this.detail});

  final SettleoraBillDetail detail;

  @override
  Future<SettleoraBillDetail> getPersonalBill(String billId) async => detail;

  @override
  Future<SettleoraBillDetail> getGroupBill(String groupId, String billId) {
    throw UnimplementedError();
  }

  @override
  Future<List<SettleoraBillSummary>> listGroupBills(
    String groupId, {
    int limit = 50,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<List<SettleoraBillSummary>> listPersonalBills({int limit = 50}) {
    throw UnimplementedError();
  }
}

SettleoraBillRevision sampleRevision({
  String status = SettleoraBillRevisionStatusValues.submittedForReview,
  String approvalStatus =
      SettleoraBillRevisionApprovalStatusValues.pendingReview,
  String baselineType =
      SettleoraBillRevisionReviewBaselineTypeValues.activeAcceptedBill,
  String defaultViewMode =
      SettleoraBillRevisionReviewViewModeValues.changedOnly,
  bool includeViewerApprovalBasis = true,
}) {
  final approval = SettleoraBillRevisionApproval(
    participantUserProfileId: _profileId,
    acceptedAmount: '12.00',
    currency: 'USD',
    status: approvalStatus,
    approvedAtUtc: null,
    rejectedAtUtc: null,
    invalidatedAtUtc: null,
  );

  return SettleoraBillRevision(
    id: _revisionId,
    billId: _billId,
    groupId: null,
    status: status,
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
        requiresPayerConfirmation: true,
        payerConfirmationStatus:
            SettleoraBillRevisionPayerConfirmationStatusValues
                .pendingConfirmation,
      ),
    ],
    approvals: [approval],
    reviewContext: sampleReviewContext(
      baselineType: baselineType,
      defaultViewMode: defaultViewMode,
    ),
    viewerApprovalBasis: includeViewerApprovalBasis
        ? const SettleoraBillRevisionApprovalBasis(
            acceptedAmount: '12.00',
            currency: 'USD',
            calculationHash: _hash,
          )
        : null,
  );
}

SettleoraBillRevisionReviewContext sampleReviewContext({
  required String baselineType,
  required String defaultViewMode,
}) {
  return SettleoraBillRevisionReviewContext(
    viewerUserProfileId: _profileId,
    baseline: SettleoraBillRevisionReviewBaseline(
      baselineType: baselineType,
      baselineBillRevisionId: '11111111-1111-1111-1111-111111111111',
      baselineRevisionStatus: SettleoraBillRevisionStatusValues.acceptedApplied,
      baselineReviewedAtUtc: null,
      derivationReason:
          baselineType ==
              SettleoraBillRevisionReviewBaselineTypeValues.noPriorBaseline
          ? 'Settleora cannot safely derive a previous review baseline.'
          : 'Server selected the active accepted bill baseline.',
    ),
    defaultViewMode: defaultViewMode,
    fullViewRecommendedReason:
        baselineType ==
            SettleoraBillRevisionReviewBaselineTypeValues.noPriorBaseline
        ? SettleoraBillRevisionReviewRecommendationReasonValues
              .noPriorBaselineFullBillRecommended
        : SettleoraBillRevisionReviewRecommendationReasonValues
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
      isPayer: true,
      payerImpact: SettleoraBillRevisionPayerFinancialImpact(
        previousContribution: SettleoraBillRevisionMoneyValue(
          amount: '10.00',
          currency: 'USD',
        ),
        proposedContribution: SettleoraBillRevisionMoneyValue(
          amount: '12.00',
          currency: 'USD',
        ),
        deltaContribution: SettleoraBillRevisionMoneyValue(
          amount: '2.00',
          currency: 'USD',
        ),
        requiresPayerConfirmation: true,
        payerConfirmationStatus:
            SettleoraBillRevisionPayerConfirmationStatusValues
                .pendingConfirmation,
      ),
    ),
    changeSummary: const [
      SettleoraBillRevisionChangeCategorySummary(
        category: SettleoraBillRevisionReviewChangeCategoryValues.billTotal,
        supportStatus: SettleoraBillRevisionReviewSupportStatusValues.supported,
        changeCount: 1,
        viewerImpact:
            SettleoraBillRevisionReviewSummaryViewerImpactValues.viewerAffected,
      ),
    ],
    changes: const [
      SettleoraBillRevisionChange(
        changeId: 'change-1',
        changeType: 'bill_total_changed',
        changeScope: SettleoraBillRevisionReviewChangeScopeValues.billTotal,
        fieldPath: 'total',
        relatedUserProfileId: null,
        before: SettleoraBillRevisionDisplayValue(
          displayValue: '10.00 USD',
          amount: '10.00',
          currency: 'USD',
        ),
        after: SettleoraBillRevisionDisplayValue(
          displayValue: '12.00 USD',
          amount: '12.00',
          currency: 'USD',
        ),
        viewerImpact: 'direct_viewer_money_impact',
        accessibleLabel: 'Changed',
        reason: 'Bill total changed.',
      ),
    ],
    limitations: const [
      'last_view_without_approval_or_rejection_not_persisted',
    ],
  );
}

SettleoraBillDetail sampleBillDetail() {
  return SettleoraBillDetail(
    id: _billId,
    merchantName: 'Corner Market',
    billDate: '2026-05-17',
    status: 'confirmed',
    reconciliationStatus: 'unreconciled',
    reconciliationNote: null,
    totalAmount: '10.00',
    totalCurrency: 'USD',
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
    items: const [],
    participants: const [],
    payers: const [],
    adjustments: const [],
  );
}

const _billId = '22222222-2222-2222-2222-222222222222';
const _revisionId = '33333333-3333-3333-3333-333333333333';
const _profileId = '44444444-4444-4444-4444-444444444444';
const _hash =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
final _createdAtUtc = DateTime.utc(2026, 5, 18, 10);
final _updatedAtUtc = DateTime.utc(2026, 5, 18, 11);
