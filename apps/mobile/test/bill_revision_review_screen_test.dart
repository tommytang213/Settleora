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
        find.byKey(const Key('bill-revision-confirm-payer')),
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

  testWidgets('payer confirmation action refreshes and uses repository seam', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeBillRevisionRepository(
      revision: sampleRevision(),
      confirmPayerResponse: sampleRevision(
        payerConfirmationStatus:
            SettleoraBillRevisionPayerConfirmationStatusValues.confirmed,
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
    await tester.tap(find.byKey(const Key('bill-revision-confirm-payer')));
    await tester.pumpAndSettle();

    expect(repository.confirmPayerCalls, 1);
    expect(repository.lastConfirmedRevision?.calculationHash, _hash);
    expect(repository.getCalls, 3);
    expect(find.text('Payer confirmation recorded.'), findsOneWidget);
  });

  testWidgets('lifecycle actions render only from server viewer actions', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeBillRevisionRepository(
      revision: sampleRevision(
        canSubmit: true,
        canWithdraw: true,
        canRevise: true,
        canApply: true,
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

    await tester.drag(find.byType(ListView), const Offset(0, -900));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('bill-revision-submit')), findsOneWidget);
    expect(find.byKey(const Key('bill-revision-withdraw')), findsOneWidget);
    expect(find.byKey(const Key('bill-revision-revise')), findsOneWidget);
    expect(find.byKey(const Key('bill-revision-apply')), findsOneWidget);
  });

  testWidgets('lifecycle actions stay hidden when server viewer actions deny', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeBillRevisionRepository(
      revision: sampleRevision(
        canSubmit: false,
        canWithdraw: false,
        canRevise: false,
        canApply: false,
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

    await tester.drag(find.byType(ListView), const Offset(0, -900));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('bill-revision-submit')), findsNothing);
    expect(find.byKey(const Key('bill-revision-withdraw')), findsNothing);
    expect(find.byKey(const Key('bill-revision-revise')), findsNothing);
    expect(find.byKey(const Key('bill-revision-apply')), findsNothing);
  });

  testWidgets('revise action refreshes before editor and displays response', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final initial = sampleRevision(canRevise: true);
    final refreshed = sampleRevision(canRevise: true);
    final replacement = sampleRevision(
      id: _replacementRevisionId,
      totalAmount: '14.50',
    );
    final repository = FakeBillRevisionRepository(
      revision: initial,
      getResponses: [initial, refreshed, refreshed],
      reviseResponse: replacement,
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

    await tester.drag(find.byType(ListView), const Offset(0, -900));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-revision-revise')));
    await tester.pumpAndSettle();

    expect(repository.getCalls, 2);
    expect(find.text('Revise proposal'), findsWidgets);

    await tester.enterText(
      find.byKey(const Key('proposal-total-amount')),
      '14.50',
    );
    await tester.tap(find.byKey(const Key('bill-revision-proposal-save')));
    await tester.pumpAndSettle();

    expect(repository.getCalls, 3);
    expect(repository.reviseCalls, 1);
    expect(repository.lastRevisedBillId, _billId);
    expect(repository.lastRevisedRevisionId, _revisionId);
    expect(repository.lastProposal?.totalAmount, '14.50');
    expect(
      find.text('Replacement proposal submitted for review.'),
      findsOneWidget,
    );

    await tester.drag(find.byType(ListView), const Offset(0, 900));
    await tester.pumpAndSettle();

    expect(find.text('14.50 USD'), findsWidgets);
    expect(find.text(_replacementRevisionId.substring(0, 8)), findsOneWidget);
  });

  testWidgets('revise action stops when refreshed capability denies', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final initial = sampleRevision(canRevise: true);
    final refreshed = sampleRevision(canRevise: false);
    final repository = FakeBillRevisionRepository(
      revision: initial,
      getResponses: [initial, refreshed],
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

    await tester.drag(find.byType(ListView), const Offset(0, -900));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-revision-revise')));
    await tester.pumpAndSettle();

    expect(repository.getCalls, 2);
    expect(repository.reviseCalls, 0);
    expect(find.text('Refresh needed'), findsOneWidget);
    expect(
      find.text(
        'This proposal can no longer be revised. Review the refreshed status.',
      ),
      findsOneWidget,
    );
    expect(find.text('Proposal editor'), findsNothing);
  });

  testWidgets('submit refreshes before acting and uses refreshed capability', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final initial = sampleRevision(canSubmit: true);
    final refreshed = sampleRevision(
      status: SettleoraBillRevisionStatusValues.draftRevision,
      canSubmit: true,
    );
    final repository = FakeBillRevisionRepository(
      revision: initial,
      getResponses: [initial, refreshed],
      submitResponse: sampleRevision(),
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

    await tester.drag(find.byType(ListView), const Offset(0, -900));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-revision-submit')));
    await tester.pumpAndSettle();

    expect(repository.getCalls, 2);
    expect(repository.submitCalls, 1);
    expect(repository.lastSubmittedBillId, _billId);
    expect(repository.lastSubmittedRevisionId, _revisionId);
    expect(find.text('Revision submitted for review.'), findsOneWidget);
  });

  testWidgets('submit stops when refreshed server capability denies', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final initial = sampleRevision(canSubmit: true);
    final refreshed = sampleRevision(canSubmit: false);
    final repository = FakeBillRevisionRepository(
      revision: initial,
      getResponses: [initial, refreshed],
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

    await tester.drag(find.byType(ListView), const Offset(0, -900));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-revision-submit')));
    await tester.pumpAndSettle();

    expect(repository.getCalls, 2);
    expect(repository.submitCalls, 0);
    expect(find.text('Refresh needed'), findsOneWidget);
    expect(
      find.text(
        'This revision is no longer open for submission. Review the refreshed status.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('failed lifecycle mutation displays existing failure path', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final initial = sampleRevision(canApply: true);
    final refreshed = sampleRevision(canApply: true);
    final repository = FakeBillRevisionRepository(
      revision: initial,
      getResponses: [initial, refreshed],
      applyFailure: const SettleoraBillRevisionFailure(
        kind: SettleoraBillRevisionFailureKind.conflict,
        message:
            'The revision changed before this action completed. Refresh before trying again.',
        statusCode: 409,
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

    await tester.drag(find.byType(ListView), const Offset(0, -900));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-revision-apply')));
    await tester.pumpAndSettle();

    expect(repository.applyCalls, 1);
    expect(find.text('Refresh needed'), findsOneWidget);
    expect(
      find.text(
        'The revision changed before this action completed. Refresh before trying again.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('confirmed payer state keeps fallback action disabled', (
    tester,
  ) async {
    await useLargeSurface(tester);
    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillRevisionReviewScreen(
          repository: FakeBillRevisionRepository(
            revision: sampleRevision(
              payerConfirmationStatus:
                  SettleoraBillRevisionPayerConfirmationStatusValues.confirmed,
            ),
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

    expect(find.byKey(const Key('bill-revision-confirm-payer')), findsNothing);
    expect(
      find.byKey(const Key('bill-revision-payer-confirmation-unavailable')),
      findsOneWidget,
    );
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

  testWidgets('server action capabilities disable review actions', (
    tester,
  ) async {
    await useLargeSurface(tester);
    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillRevisionReviewScreen(
          repository: FakeBillRevisionRepository(
            revision: sampleRevision(
              canApprove: false,
              canReject: false,
              canConfirmPayer: false,
            ),
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
    final rejectButton = tester.widget<OutlinedButton>(
      find.byKey(const Key('bill-revision-reject')),
    );
    expect(approveButton.enabled, isFalse);
    expect(rejectButton.enabled, isFalse);
    expect(find.byKey(const Key('bill-revision-confirm-payer')), findsNothing);
    expect(
      find.byKey(const Key('bill-revision-payer-confirmation-unavailable')),
      findsOneWidget,
    );
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
    List<SettleoraBillRevision>? getResponses,
    SettleoraBillRevision? submitResponse,
    SettleoraBillRevision? withdrawResponse,
    SettleoraBillRevision? approveResponse,
    SettleoraBillRevision? rejectResponse,
    SettleoraBillRevision? confirmPayerResponse,
    SettleoraBillRevision? reviseResponse,
    SettleoraBillRevision? applyResponse,
    this.submitFailure,
    this.withdrawFailure,
    this.reviseFailure,
    this.applyFailure,
  }) : approveResponse = approveResponse ?? revision,
       getResponses = getResponses ?? [revision],
       submitResponse = submitResponse ?? revision,
       withdrawResponse = withdrawResponse ?? revision,
       rejectResponse = rejectResponse ?? revision,
       confirmPayerResponse = confirmPayerResponse ?? revision,
       reviseResponse = reviseResponse ?? revision,
       applyResponse = applyResponse ?? revision;

  SettleoraBillRevision revision;
  final List<SettleoraBillRevision> getResponses;
  final SettleoraBillRevision submitResponse;
  final SettleoraBillRevision withdrawResponse;
  final SettleoraBillRevision approveResponse;
  final SettleoraBillRevision rejectResponse;
  final SettleoraBillRevision confirmPayerResponse;
  final SettleoraBillRevision reviseResponse;
  final SettleoraBillRevision applyResponse;
  final SettleoraBillRevisionFailure? submitFailure;
  final SettleoraBillRevisionFailure? withdrawFailure;
  final SettleoraBillRevisionFailure? reviseFailure;
  final SettleoraBillRevisionFailure? applyFailure;
  int listCalls = 0;
  int createCalls = 0;
  int getCalls = 0;
  int reviseCalls = 0;
  int submitCalls = 0;
  int withdrawCalls = 0;
  int approveCalls = 0;
  int rejectCalls = 0;
  int confirmPayerCalls = 0;
  int applyCalls = 0;
  String? lastSubmittedBillId;
  String? lastSubmittedRevisionId;
  String? lastWithdrawnBillId;
  String? lastWithdrawnRevisionId;
  String? lastRevisedBillId;
  String? lastRevisedRevisionId;
  String? lastAppliedBillId;
  String? lastAppliedRevisionId;
  SettleoraBillRevisionProposalSnapshot? lastProposal;
  SettleoraBillRevision? lastApprovedRevision;
  SettleoraBillRevision? lastConfirmedRevision;

  @override
  Future<List<SettleoraBillRevision>> listBillRevisions(String billId) async {
    listCalls += 1;
    return [revision];
  }

  @override
  Future<SettleoraBillRevision> createBillRevision(
    String billId,
    SettleoraBillRevisionProposalSnapshot proposal,
  ) async {
    createCalls += 1;
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
    final failure = reviseFailure;
    if (failure != null) {
      throw failure;
    }
    revision = reviseResponse;
    return reviseResponse;
  }

  @override
  Future<SettleoraBillRevision> submitBillRevision(
    String billId,
    String revisionId,
  ) async {
    submitCalls += 1;
    lastSubmittedBillId = billId;
    lastSubmittedRevisionId = revisionId;
    final failure = submitFailure;
    if (failure != null) {
      throw failure;
    }
    revision = submitResponse;
    return submitResponse;
  }

  @override
  Future<SettleoraBillRevision> withdrawBillRevision(
    String billId,
    String revisionId,
  ) async {
    withdrawCalls += 1;
    lastWithdrawnBillId = billId;
    lastWithdrawnRevisionId = revisionId;
    final failure = withdrawFailure;
    if (failure != null) {
      throw failure;
    }
    revision = withdrawResponse;
    return withdrawResponse;
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

  @override
  Future<SettleoraBillRevision> confirmBillRevisionPayer(
    SettleoraBillRevision revision,
  ) async {
    confirmPayerCalls += 1;
    lastConfirmedRevision = revision;
    this.revision = confirmPayerResponse;
    return confirmPayerResponse;
  }

  @override
  Future<SettleoraBillRevision> applyBillRevision(
    String billId,
    String revisionId,
  ) async {
    applyCalls += 1;
    lastAppliedBillId = billId;
    lastAppliedRevisionId = revisionId;
    final failure = applyFailure;
    if (failure != null) {
      throw failure;
    }
    revision = applyResponse;
    return applyResponse;
  }
}

class FakeBillRepository implements SettleoraBillRepository {
  FakeBillRepository({required this.detail});

  final SettleoraBillDetail detail;

  @override
  Future<SettleoraBillDetail> createPersonalBill(
    SettleoraPersonalBillCreateDraft draft,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillDetail> createGroupBill(
    String groupId,
    SettleoraGroupBillCreateDraft draft,
  ) {
    throw UnimplementedError();
  }

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
  String id = _revisionId,
  String status = SettleoraBillRevisionStatusValues.submittedForReview,
  String totalAmount = '12.00',
  String approvalStatus =
      SettleoraBillRevisionApprovalStatusValues.pendingReview,
  String baselineType =
      SettleoraBillRevisionReviewBaselineTypeValues.activeAcceptedBill,
  String defaultViewMode =
      SettleoraBillRevisionReviewViewModeValues.changedOnly,
  bool includeViewerApprovalBasis = true,
  String payerConfirmationStatus =
      SettleoraBillRevisionPayerConfirmationStatusValues.pendingConfirmation,
  bool canSubmit = false,
  bool canWithdraw = false,
  bool canRevise = false,
  bool canApprove = true,
  bool canReject = true,
  bool canConfirmPayer = true,
  bool canApply = false,
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
    id: id,
    billId: _billId,
    groupId: null,
    status: status,
    totalAmount: totalAmount,
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
    payers: [
      SettleoraBillRevisionPayer(
        userProfileId: _profileId,
        amount: '12.00',
        currency: 'USD',
        requiresPayerConfirmation: true,
        payerConfirmationStatus: payerConfirmationStatus,
      ),
    ],
    approvals: [approval],
    viewerActions: SettleoraBillRevisionViewerActions(
      canSubmit: canSubmit,
      canWithdraw:
          canWithdraw &&
          status == SettleoraBillRevisionStatusValues.submittedForReview,
      canRevise:
          canRevise &&
          status == SettleoraBillRevisionStatusValues.submittedForReview,
      canApprove:
          canApprove &&
          status == SettleoraBillRevisionStatusValues.submittedForReview,
      canReject:
          canReject &&
          status == SettleoraBillRevisionStatusValues.submittedForReview,
      canConfirmPayer:
          canConfirmPayer &&
          status == SettleoraBillRevisionStatusValues.submittedForReview &&
          payerConfirmationStatus ==
              SettleoraBillRevisionPayerConfirmationStatusValues
                  .pendingConfirmation,
      canApply: canApply,
    ),
    reviewContext: sampleReviewContext(
      baselineType: baselineType,
      defaultViewMode: defaultViewMode,
      payerConfirmationStatus: payerConfirmationStatus,
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
  String payerConfirmationStatus =
      SettleoraBillRevisionPayerConfirmationStatusValues.pendingConfirmation,
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
    viewerFinancialImpact: SettleoraBillRevisionViewerFinancialImpact(
      previousShare: const SettleoraBillRevisionMoneyValue(
        amount: '10.00',
        currency: 'USD',
      ),
      proposedShare: const SettleoraBillRevisionMoneyValue(
        amount: '12.00',
        currency: 'USD',
      ),
      deltaShare: const SettleoraBillRevisionMoneyValue(
        amount: '2.00',
        currency: 'USD',
      ),
      affectedByRevision: true,
      isPayer: true,
      payerImpact: SettleoraBillRevisionPayerFinancialImpact(
        previousContribution: const SettleoraBillRevisionMoneyValue(
          amount: '10.00',
          currency: 'USD',
        ),
        proposedContribution: const SettleoraBillRevisionMoneyValue(
          amount: '12.00',
          currency: 'USD',
        ),
        deltaContribution: const SettleoraBillRevisionMoneyValue(
          amount: '2.00',
          currency: 'USD',
        ),
        requiresPayerConfirmation: true,
        payerConfirmationStatus: payerConfirmationStatus,
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
    revisionCreationActions: const SettleoraBillRevisionCreationActions(
      canCreateRevision: false,
    ),
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
const _replacementRevisionId = '55555555-5555-5555-5555-555555555555';
const _profileId = '44444444-4444-4444-4444-444444444444';
const _hash =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
final _createdAtUtc = DateTime.utc(2026, 5, 18, 10);
final _updatedAtUtc = DateTime.utc(2026, 5, 18, 11);
