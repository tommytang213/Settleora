import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/main.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_repository.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_screen.dart';

void main() {
  testWidgets('default app keeps receipt reviews behind session state', (
    tester,
  ) async {
    await tester.pumpWidget(const SettleoraMobileApp());

    expect(find.text('Receipt Reviews'), findsOneWidget);
    expect(find.text('Sign in required'), findsOneWidget);
  });

  testWidgets('queue renders empty state from repository', (tester) async {
    final repository = FakeReceiptOcrReviewRepository(listResponse: const []);

    await tester.pumpWidget(
      MaterialApp(home: ReceiptOcrReviewQueueScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    expect(find.text('No receipt reviews'), findsOneWidget);
    expect(repository.listCalls, 1);
  });

  testWidgets('queue maps denied responses to a safe state', (tester) async {
    final repository = FakeReceiptOcrReviewRepository(
      listFailure: const ReceiptOcrReviewFailure(
        kind: ReceiptOcrReviewFailureKind.denied,
        message: 'This receipt review is not available to this account.',
        statusCode: 403,
      ),
    );

    await tester.pumpWidget(
      MaterialApp(home: ReceiptOcrReviewQueueScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    expect(find.text('Access unavailable'), findsOneWidget);
    expect(
      find.text('This receipt review is not available to this account.'),
      findsOneWidget,
    );
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('detail shows review candidates and blocked preview reasons', (
    tester,
  ) async {
    final repository = FakeReceiptOcrReviewRepository(
      listResponse: [sampleSummary()],
      reviewResponse: sampleReview(),
      previewResponse: samplePreview(canApply: false),
    );

    await tester.pumpWidget(
      MaterialApp(home: ReceiptOcrReviewQueueScreen(repository: repository)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();

    expect(find.text('Line candidates'), findsOneWidget);
    expect(find.text('Milk'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('Preview apply'), 500);
    await tester.tap(find.text('Preview apply'));
    await tester.pumpAndSettle();

    expect(find.text('Blocked by server preview'), findsOneWidget);
    expect(find.text('Currency mismatch'), findsOneWidget);

    final applyButton = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Apply to draft'),
    );
    expect(applyButton.onPressed, isNull);
  });

  testWidgets('apply requires explicit confirmation', (tester) async {
    final repository = FakeReceiptOcrReviewRepository(
      reviewResponse: sampleReview(),
      previewResponse: samplePreview(),
      applyResponse: sampleApplyResult(),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: ReceiptOcrReviewDetailScreen(
          repository: repository,
          summary: sampleSummary(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(find.text('Preview apply'), 500);
    await tester.tap(find.text('Preview apply'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Apply to draft'));
    await tester.pumpAndSettle();

    expect(find.text('Apply reviewed lines?'), findsOneWidget);
    expect(repository.applyCalls, 0);

    await tester.tap(find.widgetWithText(FilledButton, 'Apply'));
    await tester.pumpAndSettle();

    expect(repository.applyCalls, 1);
    expect(find.text('Applied to draft'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
  });
}

class FakeReceiptOcrReviewRepository implements ReceiptOcrReviewRepository {
  FakeReceiptOcrReviewRepository({
    this.listResponse,
    this.listFailure,
    this.reviewResponse,
    this.reviewFailure,
    this.previewResponse,
    this.previewFailure,
    this.applyResponse,
    this.applyFailure,
  });

  List<ReceiptOcrReviewSummary>? listResponse;
  ReceiptOcrReviewFailure? listFailure;
  ReceiptOcrReviewDetail? reviewResponse;
  ReceiptOcrReviewFailure? reviewFailure;
  ReceiptOcrReviewApplyPreview? previewResponse;
  ReceiptOcrReviewFailure? previewFailure;
  ReceiptOcrReviewApplyResult? applyResponse;
  ReceiptOcrReviewFailure? applyFailure;
  int listCalls = 0;
  int applyCalls = 0;

  @override
  Future<List<ReceiptOcrReviewSummary>> listReviews({
    ReceiptOcrReviewStatus? status,
    ReceiptOcrReviewSource? source,
    int? limit,
  }) async {
    listCalls += 1;
    final failure = listFailure;
    if (failure != null) {
      throw failure;
    }

    return listResponse ?? const [];
  }

  @override
  Future<ReceiptOcrReviewDetail> getReview(ReceiptOcrReviewRoute route) async {
    final failure = reviewFailure;
    if (failure != null) {
      throw failure;
    }

    return reviewResponse ?? sampleReview();
  }

  @override
  Future<ReceiptOcrReviewApplyPreview> previewApply(
    ReceiptOcrReviewRoute route,
  ) async {
    final failure = previewFailure;
    if (failure != null) {
      throw failure;
    }

    return previewResponse ?? samplePreview();
  }

  @override
  Future<ReceiptOcrReviewApplyResult> applyReview(
    ReceiptOcrReviewRoute route, {
    required DateTime expectedReviewUpdatedAtUtc,
  }) async {
    applyCalls += 1;
    final failure = applyFailure;
    if (failure != null) {
      throw failure;
    }

    return applyResponse ?? sampleApplyResult();
  }
}

ReceiptOcrReviewSummary sampleSummary() {
  return ReceiptOcrReviewSummary(
    reviewId: '11111111-1111-1111-1111-111111111111',
    billId: '22222222-2222-2222-2222-222222222222',
    groupId: null,
    fileId: '33333333-3333-3333-3333-333333333333',
    status: ReceiptOcrReviewStatusValues.reviewed,
    source: ReceiptOcrReviewSourceValues.onDevice,
    merchantText: 'Corner Market',
    currency: 'USD',
    lineCount: 2,
    createdAtUtc: sampleTime,
    updatedAtUtc: sampleTime,
  );
}

ReceiptOcrReviewDetail sampleReview() {
  return ReceiptOcrReviewDetail(
    id: '11111111-1111-1111-1111-111111111111',
    billId: '22222222-2222-2222-2222-222222222222',
    fileId: '33333333-3333-3333-3333-333333333333',
    groupId: null,
    status: ReceiptOcrReviewStatusValues.reviewed,
    source: ReceiptOcrReviewSourceValues.onDevice,
    merchantText: 'Corner Market',
    receiptIssuedAtUtc: sampleTime,
    currency: 'USD',
    subtotalAmount: '10.00',
    taxAmount: '0.80',
    serviceChargeAmount: null,
    discountAmount: null,
    grandTotalAmount: '10.80',
    lines: [
      ReceiptOcrReviewLine(
        id: '44444444-4444-4444-4444-444444444444',
        sortOrder: 0,
        text: 'Milk',
        quantity: '1',
        unitPriceAmount: '4.00',
        lineTotalAmount: '4.00',
        createdAtUtc: sampleTime,
        updatedAtUtc: sampleTime,
      ),
      ReceiptOcrReviewLine(
        id: '55555555-5555-5555-5555-555555555555',
        sortOrder: 1,
        text: 'Bread',
        quantity: '1',
        unitPriceAmount: '6.00',
        lineTotalAmount: '6.00',
        createdAtUtc: sampleTime,
        updatedAtUtc: sampleTime,
      ),
    ],
    createdAtUtc: sampleTime,
    updatedAtUtc: sampleTime,
  );
}

ReceiptOcrReviewApplyPreview samplePreview({bool canApply = true}) {
  return ReceiptOcrReviewApplyPreview(
    reviewId: '11111111-1111-1111-1111-111111111111',
    billId: '22222222-2222-2222-2222-222222222222',
    groupId: null,
    fileId: '33333333-3333-3333-3333-333333333333',
    status: ReceiptOcrReviewStatusValues.reviewed,
    source: ReceiptOcrReviewSourceValues.onDevice,
    proposedMerchantText: 'Corner Market',
    proposedReceiptIssuedAtUtc: sampleTime,
    proposedCurrency: 'USD',
    proposedSubtotalAmount: '10.00',
    proposedTaxAmount: '0.80',
    proposedServiceChargeAmount: null,
    proposedDiscountAmount: null,
    proposedGrandTotalAmount: '10.80',
    proposedLines: [
      ReceiptOcrReviewPreviewLine(
        reviewLineId: '44444444-4444-4444-4444-444444444444',
        sortOrder: 0,
        text: 'Milk',
        quantity: '1',
        unitPriceAmount: '4.00',
        lineTotalAmount: '4.00',
        proposedLineTotalAmount: '4.00',
      ),
    ],
    summary: const ReceiptOcrReviewPreviewSummary(
      lineCount: 2,
      linesWithProposedTotalCount: 2,
      linesMissingProposedTotalCount: 0,
      proposedLineTotalSumAmount: '10.00',
      expectedHeaderTotalAmount: '10.80',
    ),
    canApply: canApply,
    blockedReasons: canApply
        ? const []
        : const [ReceiptOcrReviewApplyPreviewIssueCodeValues.currencyMismatch],
    warnings: const [],
    createdAtUtc: sampleTime,
    updatedAtUtc: sampleTime,
  );
}

ReceiptOcrReviewApplyResult sampleApplyResult() {
  return ReceiptOcrReviewApplyResult(
    reviewId: '11111111-1111-1111-1111-111111111111',
    billId: '22222222-2222-2222-2222-222222222222',
    groupId: null,
    fileId: '33333333-3333-3333-3333-333333333333',
    applyMode: 'replace_draft_ocr_items',
    appliedItemCount: 2,
    currency: 'USD',
    subtotalAmount: '10.00',
    grandTotalAmount: '10.80',
    summary: const ReceiptOcrReviewPreviewSummary(
      lineCount: 2,
      linesWithProposedTotalCount: 2,
      linesMissingProposedTotalCount: 0,
      proposedLineTotalSumAmount: '10.00',
      expectedHeaderTotalAmount: '10.80',
    ),
    blockedReasons: const [],
    warnings: const [],
    appliedAtUtc: sampleTime,
  );
}

final sampleTime = DateTime.utc(2026, 5, 13, 12);
