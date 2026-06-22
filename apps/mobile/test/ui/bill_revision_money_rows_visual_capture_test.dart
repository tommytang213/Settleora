import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_revision_proposal_editor_screen.dart';
import 'package:mobile/bills/bill_revision_repository.dart';
import 'package:mobile/bills/bill_revision_review_screen.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../helpers/settleora_visual_test_fonts.dart';

const _visualOutputDir =
    '/workspace/logs/settleora-visual-qa/20260622-1730-mobile-bill-revision-money-rows';

const _billId = '22222222-2222-2222-2222-222222222222';
const _revisionId = '33333333-3333-3333-3333-333333333333';
const _profileId = '44444444-4444-4444-4444-444444444444';
const _hash =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
final _createdAtUtc = DateTime.utc(2026, 5, 18, 10);
final _updatedAtUtc = DateTime.utc(2026, 5, 18, 11);

void main() {
  testWidgets('captures bill revision money row visual QA evidence', (
    tester,
  ) async {
    await tester.runAsync(() async {
      await loadSettleoraVisualTestFonts();
      await Directory(_visualOutputDir).create(recursive: true);
    });
    await setSettleoraMobileViewport(tester);

    const editorKey = Key('bill-revision-editor-money-rows-capture');
    await _pumpEditor(tester, editorKey);
    await _captureBoundary(
      tester,
      editorKey,
      'bill-revision-editor-money-rows-390x844.png',
    );

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 100));

    const reviewKey = Key('bill-revision-review-money-rows-capture');
    await _pumpReview(tester, reviewKey);
    await _captureBoundary(
      tester,
      reviewKey,
      'bill-revision-review-money-rows-390x844.png',
    );
  });
}

Future<void> _pumpEditor(WidgetTester tester, Key boundaryKey) async {
  await tester.pumpWidget(
    RepaintBoundary(
      key: boundaryKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.light(),
        home: SettleoraBillRevisionProposalEditorScreen.create(
          repository: _VisualBillRevisionRepository(),
          billId: _billId,
          billLabel: 'Corner Market',
          initialProposal: _sampleProposalSnapshot(),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 500));
}

Future<void> _pumpReview(WidgetTester tester, Key boundaryKey) async {
  await tester.pumpWidget(
    RepaintBoundary(
      key: boundaryKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.light(),
        home: SettleoraBillRevisionReviewScreen(
          repository: _VisualBillRevisionRepository(),
          billId: _billId,
          revisionId: _revisionId,
          billLabel: 'Corner Market',
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 250));
}

Future<void> _captureBoundary(
  WidgetTester tester,
  Key key,
  String fileName,
) async {
  await tester.pump(const Duration(milliseconds: 100));
  final previousAutoUpdate = autoUpdateGoldenFiles;
  autoUpdateGoldenFiles = true;
  try {
    await expectLater(
      find.byKey(key),
      matchesGoldenFile(Uri.file('$_visualOutputDir/$fileName')),
    );
  } finally {
    autoUpdateGoldenFiles = previousAutoUpdate;
  }
}

SettleoraBillRevisionProposalSnapshot _sampleProposalSnapshot() {
  return const SettleoraBillRevisionProposalSnapshot(
    totalAmount: '12.00',
    totalCurrency: 'USD',
    participants: [
      SettleoraBillRevisionProposalParticipantRow(
        userProfileId: '44444444-4444-4444-4444-444444444444',
        resolvedShareAmount: '12.00',
        resolvedShareCurrency: 'USD',
      ),
    ],
    payers: [
      SettleoraBillRevisionProposalPayerRow(
        userProfileId: '44444444-4444-4444-4444-444444444444',
        amount: '12.00',
        currency: 'USD',
      ),
    ],
  );
}

class _VisualBillRevisionRepository implements SettleoraBillRevisionRepository {
  @override
  Future<List<SettleoraBillRevision>> listBillRevisions(String billId) async {
    return [_sampleRevision()];
  }

  @override
  Future<SettleoraBillRevision> createBillRevision(
    String billId,
    SettleoraBillRevisionProposalSnapshot proposal,
  ) async {
    return _sampleRevision();
  }

  @override
  Future<SettleoraBillRevision> getBillRevision(
    String billId,
    String revisionId,
  ) async {
    return _sampleRevision();
  }

  @override
  Future<SettleoraBillRevision> reviseBillRevision(
    String billId,
    String revisionId,
    SettleoraBillRevisionProposalSnapshot proposal,
  ) async {
    return _sampleRevision();
  }

  @override
  Future<SettleoraBillRevision> submitBillRevision(
    String billId,
    String revisionId,
  ) async {
    return _sampleRevision();
  }

  @override
  Future<SettleoraBillRevision> withdrawBillRevision(
    String billId,
    String revisionId,
  ) async {
    return _sampleRevision();
  }

  @override
  Future<SettleoraBillRevision> approveBillRevision(
    SettleoraBillRevision revision,
  ) async {
    return _sampleRevision();
  }

  @override
  Future<SettleoraBillRevision> rejectBillRevision(
    String billId,
    String revisionId,
  ) async {
    return _sampleRevision();
  }

  @override
  Future<SettleoraBillRevision> confirmBillRevisionPayer(
    SettleoraBillRevision revision,
  ) async {
    return _sampleRevision();
  }

  @override
  Future<SettleoraBillRevision> applyBillRevision(
    String billId,
    String revisionId,
  ) async {
    return _sampleRevision();
  }
}

SettleoraBillRevision _sampleRevision() {
  const approval = SettleoraBillRevisionApproval(
    participantUserProfileId: _profileId,
    acceptedAmount: '12.00',
    currency: 'USD',
    status: SettleoraBillRevisionApprovalStatusValues.pendingReview,
    approvedAtUtc: null,
    rejectedAtUtc: null,
    invalidatedAtUtc: null,
  );

  return SettleoraBillRevision(
    id: _revisionId,
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
        requiresPayerConfirmation: true,
        payerConfirmationStatus:
            SettleoraBillRevisionPayerConfirmationStatusValues
                .pendingConfirmation,
      ),
    ],
    approvals: const [approval],
    viewerActions: const SettleoraBillRevisionViewerActions(
      canSubmit: false,
      canWithdraw: false,
      canRevise: false,
      canApprove: true,
      canReject: true,
      canConfirmPayer: true,
      canApply: false,
    ),
    reviewContext: _sampleReviewContext(),
    viewerApprovalBasis: const SettleoraBillRevisionApprovalBasis(
      acceptedAmount: '12.00',
      currency: 'USD',
      calculationHash: _hash,
    ),
  );
}

SettleoraBillRevisionReviewContext _sampleReviewContext() {
  return const SettleoraBillRevisionReviewContext(
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
    viewerFinancialImpact: SettleoraBillRevisionViewerFinancialImpact(
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
    changeSummary: [
      SettleoraBillRevisionChangeCategorySummary(
        category: SettleoraBillRevisionReviewChangeCategoryValues.billTotal,
        supportStatus: SettleoraBillRevisionReviewSupportStatusValues.supported,
        changeCount: 1,
        viewerImpact:
            SettleoraBillRevisionReviewSummaryViewerImpactValues.viewerAffected,
      ),
    ],
    changes: [
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
    limitations: ['last_view_without_approval_or_rejection_not_persisted'],
  );
}
