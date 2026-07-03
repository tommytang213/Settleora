import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_revision_proposal_editor_screen.dart';
import 'package:mobile/bills/bill_revision_repository.dart';
import 'package:mobile/bills/bill_revision_review_screen.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_repository.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_screen.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../helpers/settleora_visual_test_fonts.dart';

const _visualOutputDir =
    '/workspace/logs/settleora-visual-qa/20260703-1320-mobile-bills-ocr-revision-ux-density-followup-dev-only';

const _billId = '22222222-2222-2222-2222-222222222222';
const _revisionId = '33333333-3333-3333-3333-333333333333';
const _profileId = '44444444-4444-4444-4444-444444444444';
const _fileId = '55555555-5555-5555-5555-555555555555';
const _hash =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

final _createdAtUtc = DateTime.utc(2026, 7, 3, 2);
final _updatedAtUtc = DateTime.utc(2026, 7, 3, 3);

void main() {
  testWidgets('captures bills OCR revision visual parity evidence', (
    tester,
  ) async {
    await tester.runAsync(() async {
      await loadSettleoraVisualTestFonts();
      await Directory(_visualOutputDir).create(recursive: true);
    });
    await setSettleoraMobileViewport(tester);

    const ocrQueueKey = Key('ocr-review-queue-capture');
    await tester.pumpWidget(
      RepaintBoundary(
        key: ocrQueueKey,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: SettleoraTheme.midnight(),
          home: ReceiptOcrReviewQueueScreen(repository: _VisualOcrRepository()),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Corner Market'), findsOneWidget);
    await _captureBoundary(tester, ocrQueueKey, 'ocr-review-queue-390x844.png');

    const ocrDetailKey = Key('ocr-review-detail-capture');
    await tester.pumpWidget(
      RepaintBoundary(
        key: ocrDetailKey,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: SettleoraTheme.midnight(),
          home: ReceiptOcrReviewDetailScreen(
            repository: _VisualOcrRepository(),
            summary: _ocrSummary(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Receipt totals'), findsOneWidget);
    await _captureBoundary(
      tester,
      ocrDetailKey,
      'ocr-review-detail-390x844.png',
    );

    const revisionReviewKey = Key('bill-revision-review-capture');
    await tester.pumpWidget(
      RepaintBoundary(
        key: revisionReviewKey,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: SettleoraTheme.midnight(),
          home: SettleoraBillRevisionReviewScreen(
            repository: _VisualBillRevisionRepository(),
            billId: _billId,
            revisionId: _revisionId,
            billLabel: 'Corner Market',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Financial impact'), findsOneWidget);
    await _captureBoundary(
      tester,
      revisionReviewKey,
      'bill-revision-review-390x844.png',
    );

    const revisionProposalKey = Key('bill-revision-proposal-capture');
    await tester.pumpWidget(
      RepaintBoundary(
        key: revisionProposalKey,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: SettleoraTheme.midnight(),
          home: SettleoraBillRevisionProposalEditorScreen.create(
            repository: _VisualBillRevisionRepository(),
            billId: _billId,
            billLabel: 'Corner Market',
            initialProposal: _sampleProposalSnapshot(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Proposal total'), findsOneWidget);
    await _captureBoundary(
      tester,
      revisionProposalKey,
      'bill-revision-proposal-390x844.png',
    );
  });
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

class _VisualOcrRepository implements ReceiptOcrReviewRepository {
  @override
  Future<List<ReceiptOcrReviewSummary>> listReviews({
    ReceiptOcrReviewStatus? status,
    ReceiptOcrReviewSource? source,
    int? limit,
  }) async {
    return [
      _ocrSummary(),
      _ocrSummary(
        reviewId: 'review-group',
        fileId: '66666666-6666-6666-6666-666666666666',
        groupId: '77777777-7777-7777-7777-777777777777',
        merchantText: 'Team Dinner',
        lineCount: 8,
      ),
    ];
  }

  @override
  Future<ReceiptOcrReviewDetail> getReview(ReceiptOcrReviewRoute route) async {
    return _ocrDetail(groupId: route.groupId);
  }

  @override
  Future<ReceiptOcrReviewDetail> saveReview(
    ReceiptOcrReviewRoute route,
    ReceiptOcrReviewSaveRequest request,
  ) async {
    return _ocrDetail(groupId: route.groupId);
  }

  @override
  Future<void> deleteReview(ReceiptOcrReviewRoute route) async {}

  @override
  Future<ReceiptOcrReviewApplyPreview> previewApply(
    ReceiptOcrReviewRoute route,
  ) async {
    return _ocrPreview(groupId: route.groupId);
  }

  @override
  Future<ReceiptOcrReviewApplyResult> applyReview(
    ReceiptOcrReviewRoute route, {
    required DateTime expectedReviewUpdatedAtUtc,
  }) async {
    return ReceiptOcrReviewApplyResult(
      reviewId: 'review-1',
      billId: _billId,
      groupId: route.groupId,
      fileId: _fileId,
      applyMode: 'replace_draft_ocr_items',
      appliedItemCount: 3,
      currency: 'HKD',
      subtotalAmount: '132.00',
      grandTotalAmount: '148.50',
      summary: _ocrPreviewSummary(),
      blockedReasons: const [],
      warnings: const [],
      appliedAtUtc: _updatedAtUtc,
    );
  }
}

ReceiptOcrReviewSummary _ocrSummary({
  String reviewId = 'review-1',
  String fileId = _fileId,
  String? groupId,
  String merchantText = 'Corner Market',
  int lineCount = 3,
}) {
  return ReceiptOcrReviewSummary(
    reviewId: reviewId,
    billId: _billId,
    groupId: groupId,
    fileId: fileId,
    status: ReceiptOcrReviewStatusValues.provisional,
    source: ReceiptOcrReviewSourceValues.onDevice,
    merchantText: merchantText,
    currency: 'HKD',
    lineCount: lineCount,
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

ReceiptOcrReviewDetail _ocrDetail({String? groupId}) {
  return ReceiptOcrReviewDetail(
    id: 'review-1',
    billId: _billId,
    groupId: groupId,
    fileId: _fileId,
    status: ReceiptOcrReviewStatusValues.provisional,
    source: ReceiptOcrReviewSourceValues.onDevice,
    merchantText: 'Corner Market',
    receiptIssuedAtUtc: DateTime.utc(2026, 7, 3),
    currency: 'HKD',
    subtotalAmount: '132.00',
    taxAmount: '8.50',
    serviceChargeAmount: '8.00',
    discountAmount: '0.00',
    grandTotalAmount: '148.50',
    lines: [
      ReceiptOcrReviewLine(
        id: 'line-1',
        sortOrder: 1,
        text: 'Noodle bowl',
        quantity: '1',
        unitPriceAmount: '68.00',
        lineTotalAmount: '68.00',
        createdAtUtc: _createdAtUtc,
        updatedAtUtc: _updatedAtUtc,
      ),
      ReceiptOcrReviewLine(
        id: 'line-2',
        sortOrder: 2,
        text: 'Tea set',
        quantity: '2',
        unitPriceAmount: '32.00',
        lineTotalAmount: '64.00',
        createdAtUtc: _createdAtUtc,
        updatedAtUtc: _updatedAtUtc,
      ),
    ],
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

ReceiptOcrReviewApplyPreview _ocrPreview({String? groupId}) {
  return ReceiptOcrReviewApplyPreview(
    reviewId: 'review-1',
    billId: _billId,
    groupId: groupId,
    fileId: _fileId,
    status: ReceiptOcrReviewStatusValues.provisional,
    source: ReceiptOcrReviewSourceValues.onDevice,
    proposedMerchantText: 'Corner Market',
    proposedReceiptIssuedAtUtc: DateTime.utc(2026, 7, 3),
    proposedCurrency: 'HKD',
    proposedSubtotalAmount: '132.00',
    proposedTaxAmount: '8.50',
    proposedServiceChargeAmount: '8.00',
    proposedDiscountAmount: '0.00',
    proposedGrandTotalAmount: '148.50',
    proposedLines: const [
      ReceiptOcrReviewPreviewLine(
        reviewLineId: 'line-1',
        sortOrder: 1,
        text: 'Noodle bowl',
        quantity: '1',
        unitPriceAmount: '68.00',
        lineTotalAmount: '68.00',
        proposedLineTotalAmount: '68.00',
      ),
    ],
    summary: _ocrPreviewSummary(),
    canApply: true,
    blockedReasons: const [],
    warnings: const [
      ReceiptOcrReviewApplyPreviewIssueCodeValues.lineSumMismatch,
    ],
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

ReceiptOcrReviewPreviewSummary _ocrPreviewSummary() {
  return const ReceiptOcrReviewPreviewSummary(
    lineCount: 2,
    linesWithProposedTotalCount: 2,
    linesMissingProposedTotalCount: 0,
    proposedLineTotalSumAmount: '132.00',
    expectedHeaderTotalAmount: '148.50',
  );
}

SettleoraBillRevisionProposalSnapshot _sampleProposalSnapshot() {
  return const SettleoraBillRevisionProposalSnapshot(
    totalAmount: '148.50',
    totalCurrency: 'HKD',
    participants: [
      SettleoraBillRevisionProposalParticipantRow(
        userProfileId: _profileId,
        resolvedShareAmount: '74.25',
        resolvedShareCurrency: 'HKD',
      ),
      SettleoraBillRevisionProposalParticipantRow(
        userProfileId: '88888888-8888-8888-8888-888888888888',
        resolvedShareAmount: '74.25',
        resolvedShareCurrency: 'HKD',
      ),
    ],
    payers: [
      SettleoraBillRevisionProposalPayerRow(
        userProfileId: _profileId,
        amount: '148.50',
        currency: 'HKD',
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
  return SettleoraBillRevision(
    id: _revisionId,
    billId: _billId,
    groupId: null,
    status: SettleoraBillRevisionStatusValues.submittedForReview,
    totalAmount: '148.50',
    totalCurrency: 'HKD',
    calculationHash: _hash,
    submittedAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
    participants: const [
      SettleoraBillRevisionParticipant(
        userProfileId: _profileId,
        resolvedShareAmount: '74.25',
        resolvedShareCurrency: 'HKD',
        affectedByRevision: true,
      ),
    ],
    payers: const [
      SettleoraBillRevisionPayer(
        userProfileId: _profileId,
        amount: '148.50',
        currency: 'HKD',
        requiresPayerConfirmation: true,
        payerConfirmationStatus:
            SettleoraBillRevisionPayerConfirmationStatusValues
                .pendingConfirmation,
      ),
    ],
    approvals: const [
      SettleoraBillRevisionApproval(
        participantUserProfileId: _profileId,
        acceptedAmount: '148.50',
        currency: 'HKD',
        status: SettleoraBillRevisionApprovalStatusValues.pendingReview,
        approvedAtUtc: null,
        rejectedAtUtc: null,
        invalidatedAtUtc: null,
      ),
    ],
    viewerActions: const SettleoraBillRevisionViewerActions(
      canSubmit: false,
      canWithdraw: false,
      canRevise: true,
      canApprove: true,
      canReject: true,
      canConfirmPayer: true,
      canApply: false,
    ),
    reviewContext: _sampleReviewContext(),
    viewerApprovalBasis: const SettleoraBillRevisionApprovalBasis(
      acceptedAmount: '148.50',
      currency: 'HKD',
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
        amount: '68.00',
        currency: 'HKD',
      ),
      proposedShare: SettleoraBillRevisionMoneyValue(
        amount: '74.25',
        currency: 'HKD',
      ),
      deltaShare: SettleoraBillRevisionMoneyValue(
        amount: '6.25',
        currency: 'HKD',
      ),
      affectedByRevision: true,
      isPayer: true,
      payerImpact: SettleoraBillRevisionPayerFinancialImpact(
        previousContribution: SettleoraBillRevisionMoneyValue(
          amount: '136.00',
          currency: 'HKD',
        ),
        proposedContribution: SettleoraBillRevisionMoneyValue(
          amount: '148.50',
          currency: 'HKD',
        ),
        deltaContribution: SettleoraBillRevisionMoneyValue(
          amount: '12.50',
          currency: 'HKD',
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
          displayValue: '136.00 HKD',
          amount: '136.00',
          currency: 'HKD',
        ),
        after: SettleoraBillRevisionDisplayValue(
          displayValue: '148.50 HKD',
          amount: '148.50',
          currency: 'HKD',
        ),
        viewerImpact: 'direct_viewer_money_impact',
        accessibleLabel: 'Changed',
        reason: 'Receipt OCR review changed the proposed total.',
      ),
    ],
    limitations: ['item_level_diff_not_in_current_snapshot'],
  );
}
