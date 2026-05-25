import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_repository.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_screen.dart';

void main() {
  group('ReceiptOcrReviewDetailScreen', () {
    testWidgets('renders read-only review candidates and action labels', (
      tester,
    ) async {
      final route = sampleRoute();
      final repository = FakeReceiptOcrReviewRepository(
        reviewResponse: sampleReview(
          route,
          status: ReceiptOcrReviewStatusValues.provisional,
        ),
      );

      await pumpDetail(tester, repository: repository, route: route);
      await tester.pumpAndSettle();

      expect(find.text('Corner Market'), findsOneWidget);
      expect(find.text('Provisional'), findsOneWidget);
      expect(find.text('Personal bill'), findsOneWidget);
      expect(find.text('On device OCR'), findsOneWidget);
      expect(find.text('Header candidates'), findsOneWidget);
      expect(find.text('Line candidates'), findsOneWidget);
      expect(find.text('Milk'), findsOneWidget);
      expect(find.text('Apply preview'), findsOneWidget);
      expect(find.text('Preview apply'), findsOneWidget);
      expect(find.text('Apply to draft'), findsOneWidget);
    });

    testWidgets('ignores stale review loads when the route changes', (
      tester,
    ) async {
      final repository = FakeReceiptOcrReviewRepository();
      final personalRoute = sampleRoute(fileId: _oldFileId);
      final groupRoute = sampleRoute(groupId: _groupId, fileId: _newFileId);

      await pumpDetail(tester, repository: repository, route: personalRoute);
      await tester.pump();

      await pumpDetail(tester, repository: repository, route: groupRoute);
      await tester.pump();

      expect(repository.getCalls, 2);

      repository.completeGet(
        personalRoute,
        sampleReview(personalRoute, merchantText: 'Old Receipt'),
      );
      await tester.pump();

      expect(find.text('Old Receipt'), findsNothing);
      expect(find.text('Loading receipt review'), findsOneWidget);

      repository.completeGet(
        groupRoute,
        sampleReview(groupRoute, merchantText: 'Current Receipt'),
      );
      await tester.pumpAndSettle();

      expect(find.text('Current Receipt'), findsOneWidget);
      expect(find.text('Old Receipt'), findsNothing);
      expect(repository.getRoutes.last.groupId, _groupId);
      expect(repository.getRoutes.last.fileId, _newFileId);
    });

    testWidgets(
      'shows an empty OCR result state for reviews without candidates',
      (tester) async {
        final route = sampleRoute();
        final repository = FakeReceiptOcrReviewRepository(
          reviewResponse: sampleReview(
            route,
            merchantText: null,
            includeReceiptDate: false,
            currency: null,
            subtotalAmount: null,
            taxAmount: null,
            grandTotalAmount: null,
            lines: const [],
          ),
        );

        await pumpDetail(tester, repository: repository, route: route);
        await tester.pumpAndSettle();

        expect(find.text('No OCR result'), findsOneWidget);
        expect(
          find.text(
            'No reviewed OCR candidates are saved for this receipt yet.',
          ),
          findsOneWidget,
        );
        expect(find.text('Apply preview'), findsOneWidget);
      },
    );

    testWidgets('sanitizes suspicious review failures before display', (
      tester,
    ) async {
      final repository = FakeReceiptOcrReviewRepository(
        reviewFailure: const ReceiptOcrReviewFailure(
          kind: ReceiptOcrReviewFailureKind.server,
          message:
              'StackTrace bearer token C:\\Users\\secret\\receipt.png /var/storage/object-key [1, 2, 3] OCR payload dump',
        ),
      );

      await pumpDetail(tester, repository: repository, route: sampleRoute());
      await tester.pumpAndSettle();

      expect(find.text('Review unavailable'), findsOneWidget);
      expect(
        find.text(
          'Receipt reviews are unavailable right now. Try again later.',
        ),
        findsOneWidget,
      );
      expect(visibleText(tester), isNot(contains('StackTrace')));
      expect(visibleText(tester), isNot(contains('bearer')));
      expect(visibleText(tester), isNot(contains('token')));
      expect(visibleText(tester), isNot(contains('C:\\Users\\secret')));
      expect(visibleText(tester), isNot(contains('/var/storage')));
      expect(visibleText(tester), isNot(contains('object-key')));
      expect(visibleText(tester), isNot(contains('[1, 2, 3]')));
      expect(visibleText(tester), isNot(contains('OCR payload')));
    });

    testWidgets('blocks duplicate preview and apply actions while busy', (
      tester,
    ) async {
      final route = sampleRoute(groupId: _groupId);
      final previewCompleter = Completer<ReceiptOcrReviewApplyPreview>();
      final applyCompleter = Completer<ReceiptOcrReviewApplyResult>();
      final repository = FakeReceiptOcrReviewRepository(
        reviewResponse: sampleReview(route),
        previewCompleter: previewCompleter,
        applyCompleter: applyCompleter,
      );

      await pumpDetail(tester, repository: repository, route: route);
      await tester.pumpAndSettle();

      await tester.tap(find.widgetWithText(OutlinedButton, 'Preview apply'));
      await tester.pump();

      expect(repository.previewCalls, 1);
      expect(repository.lastPreviewRoute?.groupId, _groupId);
      expect(repository.lastPreviewRoute?.billId, _billId);
      expect(repository.lastPreviewRoute?.fileId, _fileId);
      expectOutlinedButtonEnabled(
        tester,
        find.widgetWithText(OutlinedButton, 'Preview apply'),
        isFalse,
      );
      expectIconButtonEnabled(
        tester,
        find.widgetWithIcon(IconButton, Icons.edit_outlined),
        isFalse,
      );
      expectIconButtonEnabled(
        tester,
        find.widgetWithIcon(IconButton, Icons.refresh),
        isFalse,
      );

      await tester.tap(
        find.widgetWithText(OutlinedButton, 'Preview apply'),
        warnIfMissed: false,
      );
      await tester.pump();

      expect(repository.previewCalls, 1);

      previewCompleter.complete(samplePreview(route));
      await tester.pumpAndSettle();

      await tester.tap(find.widgetWithText(FilledButton, 'Apply to draft'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Apply'));
      await tester.pump();

      expect(repository.applyCalls, 1);
      expectOutlinedButtonEnabled(
        tester,
        find.widgetWithText(OutlinedButton, 'Preview apply'),
        isFalse,
      );
      expectFilledButtonEnabled(
        tester,
        find.widgetWithText(FilledButton, 'Apply to draft'),
        isFalse,
      );

      await tester.tap(
        find.widgetWithText(FilledButton, 'Apply to draft'),
        warnIfMissed: false,
      );
      await tester.pump();

      expect(repository.applyCalls, 1);

      applyCompleter.complete(sampleApplyResult(route));
      await tester.pumpAndSettle();

      expect(find.text('Applied to draft'), findsOneWidget);
      expect(repository.lastApplyRoute?.groupId, _groupId);
      expect(repository.lastApplyRoute?.billId, _billId);
      expect(repository.lastApplyRoute?.fileId, _fileId);
      expect(repository.lastApplyExpectedReviewUpdatedAtUtc, _updatedAtUtc);
    });

    testWidgets('saves edits through the group route and blocks conflicts', (
      tester,
    ) async {
      await useLargeSurface(tester);
      final route = sampleRoute(groupId: _groupId);
      final saveCompleter = Completer<ReceiptOcrReviewDetail>();
      final repository = FakeReceiptOcrReviewRepository(
        reviewResponse: sampleReview(route),
        saveCompleter: saveCompleter,
      );

      await pumpDetail(tester, repository: repository, route: route);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithIcon(IconButton, Icons.edit_outlined));
      await tester.pumpAndSettle();

      expect(find.text('Preview apply'), findsNothing);
      await tester.enterText(
        editableTextForKey(const Key('receipt-review-edit-merchant')),
        'Updated Merchant',
      );
      await tester.enterText(
        editableTextForKey(const Key('receipt-review-edit-currency')),
        'usd',
      );
      await tester.ensureVisible(
        find.byKey(const Key('receipt-review-edit-save')),
      );
      await tester.tap(find.byKey(const Key('receipt-review-edit-save')));
      await tester.pump();

      expect(repository.saveCalls, 1);
      expect(repository.lastSaveRoute?.groupId, _groupId);
      expect(repository.lastSaveRoute?.billId, _billId);
      expect(repository.lastSaveRoute?.fileId, _fileId);
      expect(repository.lastSaveRequest?.merchantText, 'Updated Merchant');
      expect(repository.lastSaveRequest?.currency, 'USD');
      expect(
        repository.lastSaveRequest?.status,
        ReceiptOcrReviewStatusValues.reviewed,
      );
      expect(
        repository.lastSaveRequest?.source,
        ReceiptOcrReviewSourceValues.onDevice,
      );
      expect(repository.lastSaveRequest?.lines.single.text, 'Milk');
      expectFilledButtonEnabled(
        tester,
        find.byKey(const Key('receipt-review-edit-save')),
        isFalse,
      );
      expectOutlinedButtonEnabled(
        tester,
        find.byKey(const Key('receipt-review-edit-cancel')),
        isFalse,
      );
      expectOutlinedButtonEnabled(
        tester,
        find.byKey(const Key('receipt-review-edit-delete')),
        isFalse,
      );
      expectIconButtonEnabled(
        tester,
        find.widgetWithIcon(IconButton, Icons.refresh),
        isFalse,
      );

      await tester.tap(
        find.byKey(const Key('receipt-review-edit-save')),
        warnIfMissed: false,
      );
      await tester.tap(
        find.byKey(const Key('receipt-review-edit-delete')),
        warnIfMissed: false,
      );
      await tester.pump();

      expect(repository.saveCalls, 1);
      expect(repository.deleteCalls, 0);

      saveCompleter.complete(
        sampleReview(route, merchantText: 'Updated Merchant'),
      );
      await tester.pumpAndSettle();

      expect(find.text('Updated Merchant'), findsOneWidget);
      expect(find.text('Preview apply'), findsOneWidget);
    });

    testWidgets('blocks invalid edited candidate values before save', (
      tester,
    ) async {
      await useLargeSurface(tester);
      final route = sampleRoute();
      final repository = FakeReceiptOcrReviewRepository(
        reviewResponse: sampleReview(route),
      );

      await pumpDetail(tester, repository: repository, route: route);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithIcon(IconButton, Icons.edit_outlined));
      await tester.pumpAndSettle();

      await tester.enterText(
        editableTextForKey(const Key('receipt-review-edit-currency')),
        '',
      );
      await tester.enterText(
        editableTextForKey(const Key('receipt-review-edit-subtotal')),
        '12.3.4',
      );
      await tester.enterText(
        editableTextForKey(const Key('receipt-review-edit-grand-total')),
        '-10.80',
      );
      await tester.enterText(
        editableTextForKey(
          const ValueKey('receipt-review-edit-line-quantity-0'),
        ),
        '0',
      );
      await tester.enterText(
        editableTextForKey(const ValueKey('receipt-review-edit-line-unit-0')),
        'abc',
      );
      await tester.enterText(
        editableTextForKey(const ValueKey('receipt-review-edit-line-total-0')),
        '-10.00',
      );

      await tester.ensureVisible(
        find.byKey(const Key('receipt-review-edit-save')),
      );
      await tester.tap(find.byKey(const Key('receipt-review-edit-save')));
      await tester.pumpAndSettle();

      expect(repository.saveCalls, 0);
      expect(find.text('Required when amounts are present'), findsOneWidget);
      expect(find.text('Use a non-negative decimal amount'), findsNWidgets(4));
      expect(find.text('Use a positive decimal quantity'), findsOneWidget);
      expectVisibleTextOmitsUnsafeDetails(tester);
    });

    testWidgets('sanitizes save failures without exposing unsafe details', (
      tester,
    ) async {
      await useLargeSurface(tester);
      final route = sampleRoute();
      final repository = FakeReceiptOcrReviewRepository(
        reviewResponse: sampleReview(route),
        saveFailure: suspiciousFailure(ReceiptOcrReviewFailureKind.validation),
      );

      await pumpDetail(tester, repository: repository, route: route);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithIcon(IconButton, Icons.edit_outlined));
      await tester.pumpAndSettle();
      await tester.ensureVisible(
        find.byKey(const Key('receipt-review-edit-save')),
      );
      await tester.tap(find.byKey(const Key('receipt-review-edit-save')));
      await tester.pumpAndSettle();

      expect(repository.saveCalls, 1);
      expect(find.text('Unsupported request'), findsOneWidget);
      expect(
        find.text(
          'The receipt review request is no longer valid. Refresh and try again.',
        ),
        findsOneWidget,
      );
      expectVisibleTextOmitsUnsafeDetails(tester);
    });

    testWidgets('deletes through the group route and bounds failures', (
      tester,
    ) async {
      await useLargeSurface(tester);
      final route = sampleRoute(groupId: _groupId);
      final deleteCompleter = Completer<void>();
      final repository = FakeReceiptOcrReviewRepository(
        reviewResponse: sampleReview(route),
        deleteCompleter: deleteCompleter,
      );

      await pumpDetail(tester, repository: repository, route: route);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithIcon(IconButton, Icons.edit_outlined));
      await tester.pumpAndSettle();
      await tester.ensureVisible(
        find.byKey(const Key('receipt-review-edit-delete')),
      );
      await tester.tap(find.byKey(const Key('receipt-review-edit-delete')));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Remove'));
      await tester.pump();

      expect(repository.deleteCalls, 1);
      expect(repository.lastDeleteRoute?.groupId, _groupId);
      expect(repository.lastDeleteRoute?.billId, _billId);
      expect(repository.lastDeleteRoute?.fileId, _fileId);
      expectOutlinedButtonEnabled(
        tester,
        find.byKey(const Key('receipt-review-edit-delete')),
        isFalse,
      );
      expectFilledButtonEnabled(
        tester,
        find.byKey(const Key('receipt-review-edit-save')),
        isFalse,
      );
      expectOutlinedButtonEnabled(
        tester,
        find.byKey(const Key('receipt-review-edit-cancel')),
        isFalse,
      );
      expectIconButtonEnabled(
        tester,
        find.widgetWithIcon(IconButton, Icons.refresh),
        isFalse,
      );

      await tester.tap(
        find.byKey(const Key('receipt-review-edit-save')),
        warnIfMissed: false,
      );
      await tester.tap(
        find.byKey(const Key('receipt-review-edit-delete')),
        warnIfMissed: false,
      );
      await tester.pump();

      expect(repository.saveCalls, 0);
      expect(repository.deleteCalls, 1);

      deleteCompleter.completeError(
        suspiciousFailure(ReceiptOcrReviewFailureKind.server),
      );
      await tester.pumpAndSettle();

      expect(find.text('Review unavailable'), findsOneWidget);
      expect(
        find.text(
          'Receipt reviews are unavailable right now. Try again later.',
        ),
        findsOneWidget,
      );
      expectVisibleTextOmitsUnsafeDetails(tester);
    });
  });
}

Future<void> pumpDetail(
  WidgetTester tester, {
  required FakeReceiptOcrReviewRepository repository,
  required ReceiptOcrReviewRoute route,
}) {
  return tester.pumpWidget(
    MaterialApp(
      home: ReceiptOcrReviewDetailScreen.forRoute(
        repository: repository,
        route: route,
      ),
    ),
  );
}

void expectOutlinedButtonEnabled(
  WidgetTester tester,
  Finder finder,
  Matcher matcher,
) {
  final button = tester.widget<OutlinedButton>(finder);
  expect(button.onPressed != null, matcher);
}

void expectFilledButtonEnabled(
  WidgetTester tester,
  Finder finder,
  Matcher matcher,
) {
  final button = tester.widget<FilledButton>(finder);
  expect(button.onPressed != null, matcher);
}

void expectIconButtonEnabled(
  WidgetTester tester,
  Finder finder,
  Matcher matcher,
) {
  final button = tester.widget<IconButton>(finder);
  expect(button.onPressed != null, matcher);
}

String visibleText(WidgetTester tester) {
  return tester
      .widgetList<Text>(find.byType(Text))
      .map((widget) => widget.data)
      .whereType<String>()
      .join('\n');
}

Finder editableTextForKey(Key key) {
  return find.descendant(
    of: find.byKey(key),
    matching: find.byType(EditableText),
  );
}

Future<void> useLargeSurface(WidgetTester tester) async {
  await tester.binding.setSurfaceSize(const Size(900, 1600));
  addTearDown(() => tester.binding.setSurfaceSize(null));
}

ReceiptOcrReviewFailure suspiciousFailure(ReceiptOcrReviewFailureKind kind) {
  return ReceiptOcrReviewFailure(
    kind: kind,
    message:
        'StackTrace bearer token C:\\Users\\secret\\receipt.png /var/storage/object-key [1, 2, 3] OCR payload dump',
  );
}

void expectVisibleTextOmitsUnsafeDetails(WidgetTester tester) {
  expect(visibleText(tester), isNot(contains('StackTrace')));
  expect(visibleText(tester), isNot(contains('bearer')));
  expect(visibleText(tester), isNot(contains('token')));
  expect(visibleText(tester), isNot(contains('C:\\Users\\secret')));
  expect(visibleText(tester), isNot(contains('/var/storage')));
  expect(visibleText(tester), isNot(contains('object-key')));
  expect(visibleText(tester), isNot(contains('[1, 2, 3]')));
  expect(visibleText(tester), isNot(contains('OCR payload')));
}

class FakeReceiptOcrReviewRepository implements ReceiptOcrReviewRepository {
  FakeReceiptOcrReviewRepository({
    this.reviewResponse,
    this.reviewFailure,
    this.saveCompleter,
    this.saveFailure,
    this.deleteCompleter,
    this.deleteFailure,
    this.previewCompleter,
    this.applyCompleter,
  });

  final ReceiptOcrReviewDetail? reviewResponse;
  final ReceiptOcrReviewFailure? reviewFailure;
  final Completer<ReceiptOcrReviewDetail>? saveCompleter;
  final ReceiptOcrReviewFailure? saveFailure;
  final Completer<void>? deleteCompleter;
  final ReceiptOcrReviewFailure? deleteFailure;
  final Completer<ReceiptOcrReviewApplyPreview>? previewCompleter;
  final Completer<ReceiptOcrReviewApplyResult>? applyCompleter;
  final Map<String, Completer<ReceiptOcrReviewDetail>> _getCompleters = {};
  final List<ReceiptOcrReviewRoute> getRoutes = [];
  int getCalls = 0;
  int saveCalls = 0;
  int deleteCalls = 0;
  int previewCalls = 0;
  int applyCalls = 0;
  ReceiptOcrReviewRoute? lastSaveRoute;
  ReceiptOcrReviewSaveRequest? lastSaveRequest;
  ReceiptOcrReviewRoute? lastDeleteRoute;
  ReceiptOcrReviewRoute? lastPreviewRoute;
  ReceiptOcrReviewRoute? lastApplyRoute;
  DateTime? lastApplyExpectedReviewUpdatedAtUtc;

  @override
  Future<List<ReceiptOcrReviewSummary>> listReviews({
    ReceiptOcrReviewStatus? status,
    ReceiptOcrReviewSource? source,
    int? limit,
  }) async {
    return const [];
  }

  @override
  Future<ReceiptOcrReviewDetail> getReview(ReceiptOcrReviewRoute route) {
    getCalls += 1;
    getRoutes.add(route);
    final failure = reviewFailure;
    if (failure != null) {
      throw failure;
    }

    final response = reviewResponse;
    if (response != null) {
      return Future.value(response);
    }

    return _getCompleters
        .putIfAbsent(_routeKey(route), Completer<ReceiptOcrReviewDetail>.new)
        .future;
  }

  void completeGet(ReceiptOcrReviewRoute route, ReceiptOcrReviewDetail review) {
    _getCompleters[_routeKey(route)]?.complete(review);
  }

  @override
  Future<ReceiptOcrReviewDetail> saveReview(
    ReceiptOcrReviewRoute route,
    ReceiptOcrReviewSaveRequest request,
  ) {
    saveCalls += 1;
    lastSaveRoute = route;
    lastSaveRequest = request;
    final failure = saveFailure;
    if (failure != null) {
      throw failure;
    }

    return saveCompleter?.future ??
        Future.value(sampleReview(route, merchantText: request.merchantText));
  }

  @override
  Future<void> deleteReview(ReceiptOcrReviewRoute route) {
    deleteCalls += 1;
    lastDeleteRoute = route;
    final failure = deleteFailure;
    if (failure != null) {
      throw failure;
    }

    return deleteCompleter?.future ?? Future.value();
  }

  @override
  Future<ReceiptOcrReviewApplyPreview> previewApply(
    ReceiptOcrReviewRoute route,
  ) {
    previewCalls += 1;
    lastPreviewRoute = route;
    return previewCompleter?.future ?? Future.value(samplePreview(route));
  }

  @override
  Future<ReceiptOcrReviewApplyResult> applyReview(
    ReceiptOcrReviewRoute route, {
    required DateTime expectedReviewUpdatedAtUtc,
  }) {
    applyCalls += 1;
    lastApplyRoute = route;
    lastApplyExpectedReviewUpdatedAtUtc = expectedReviewUpdatedAtUtc;
    return applyCompleter?.future ?? Future.value(sampleApplyResult(route));
  }
}

ReceiptOcrReviewRoute sampleRoute({
  String billId = _billId,
  String fileId = _fileId,
  String? groupId,
}) {
  return ReceiptOcrReviewRoute(
    billId: billId,
    fileId: fileId,
    groupId: groupId,
  );
}

ReceiptOcrReviewDetail sampleReview(
  ReceiptOcrReviewRoute route, {
  ReceiptOcrReviewStatus status = ReceiptOcrReviewStatusValues.reviewed,
  String? merchantText = 'Corner Market',
  DateTime? receiptIssuedAtUtc,
  bool includeReceiptDate = true,
  String? currency = 'USD',
  String? subtotalAmount = '10.00',
  String? taxAmount = '0.80',
  String? grandTotalAmount = '10.80',
  List<ReceiptOcrReviewLine>? lines,
}) {
  return ReceiptOcrReviewDetail(
    id: _reviewId,
    billId: route.billId,
    fileId: route.fileId,
    groupId: route.groupId,
    status: status,
    source: ReceiptOcrReviewSourceValues.onDevice,
    merchantText: merchantText,
    receiptIssuedAtUtc: includeReceiptDate
        ? receiptIssuedAtUtc ?? _createdAtUtc
        : null,
    currency: currency,
    subtotalAmount: subtotalAmount,
    taxAmount: taxAmount,
    serviceChargeAmount: null,
    discountAmount: null,
    grandTotalAmount: grandTotalAmount,
    lines: lines ?? sampleLines(),
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

List<ReceiptOcrReviewLine> sampleLines() {
  return [
    ReceiptOcrReviewLine(
      id: _lineId,
      sortOrder: 0,
      text: 'Milk',
      quantity: '1',
      unitPriceAmount: '10.00',
      lineTotalAmount: '10.00',
      createdAtUtc: _createdAtUtc,
      updatedAtUtc: _updatedAtUtc,
    ),
  ];
}

ReceiptOcrReviewApplyPreview samplePreview(ReceiptOcrReviewRoute route) {
  return ReceiptOcrReviewApplyPreview(
    reviewId: _reviewId,
    billId: route.billId,
    groupId: route.groupId,
    fileId: route.fileId,
    status: ReceiptOcrReviewStatusValues.reviewed,
    source: ReceiptOcrReviewSourceValues.onDevice,
    proposedMerchantText: 'Corner Market',
    proposedReceiptIssuedAtUtc: _createdAtUtc,
    proposedCurrency: 'USD',
    proposedSubtotalAmount: '10.00',
    proposedTaxAmount: '0.80',
    proposedServiceChargeAmount: null,
    proposedDiscountAmount: null,
    proposedGrandTotalAmount: '10.80',
    proposedLines: const [],
    summary: samplePreviewSummary(),
    canApply: true,
    blockedReasons: const [],
    warnings: const [],
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

ReceiptOcrReviewApplyResult sampleApplyResult(ReceiptOcrReviewRoute route) {
  return ReceiptOcrReviewApplyResult(
    reviewId: _reviewId,
    billId: route.billId,
    groupId: route.groupId,
    fileId: route.fileId,
    applyMode: 'replace_draft_ocr_items',
    appliedItemCount: 1,
    currency: 'USD',
    subtotalAmount: '10.00',
    grandTotalAmount: '10.80',
    summary: samplePreviewSummary(),
    blockedReasons: const [],
    warnings: const [],
    appliedAtUtc: _updatedAtUtc,
  );
}

ReceiptOcrReviewPreviewSummary samplePreviewSummary() {
  return const ReceiptOcrReviewPreviewSummary(
    lineCount: 1,
    linesWithProposedTotalCount: 1,
    linesMissingProposedTotalCount: 0,
    proposedLineTotalSumAmount: '10.00',
    expectedHeaderTotalAmount: '10.80',
  );
}

String _routeKey(ReceiptOcrReviewRoute route) {
  return '${route.groupId ?? ''}|${route.billId}|${route.fileId}';
}

const _billId = '22222222-2222-2222-2222-222222222222';
const _groupId = '33333333-3333-3333-3333-333333333333';
const _fileId = '44444444-4444-4444-4444-444444444444';
const _oldFileId = '55555555-5555-5555-5555-555555555555';
const _newFileId = '66666666-6666-6666-6666-666666666666';
const _reviewId = '77777777-7777-7777-7777-777777777777';
const _lineId = '88888888-8888-8888-8888-888888888888';
final _createdAtUtc = DateTime.utc(2026, 5, 25, 4);
final _updatedAtUtc = DateTime.utc(2026, 5, 25, 5);
