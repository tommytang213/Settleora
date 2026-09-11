import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_repository.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_screen.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../helpers/settleora_visual_test_fonts.dart';

const _captureKey = Key('receipt-review-state-panel-capture');
final _output = settleoraVisualOutputDirectory(
  '20260908-1103-receipt-review-state-panels',
);
const _billId = '22222222-2222-2222-2222-222222222222';
const _fileId = '44444444-4444-4444-4444-444444444444';
const _reviewId = '77777777-7777-7777-7777-777777777777';
final _createdAtUtc = DateTime.utc(2026, 9, 8, 3);
final _updatedAtUtc = DateTime.utc(2026, 9, 8, 4);

Future<void> _mount(
  WidgetTester tester, {
  required Widget home,
  required double width,
  required double scale,
}) async {
  await setSettleoraMobileViewport(tester, width: width);
  await tester.pumpWidget(
    RepaintBoundary(
      key: _captureKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.midnight(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: home,
      ),
    ),
  );
}

Future<void> _capture(WidgetTester tester, String name) async {
  await tester.pump();
  expect(tester.takeException(), isNull, reason: name);
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.byKey(_captureKey),
    );
    final image = await boundary.toImage(pixelRatio: 1);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(_output).create(recursive: true);
    await File('$_output/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

Future<void> _captureQueueStates(
  WidgetTester tester, {
  required double width,
  required double scale,
  required String tag,
}) async {
  await _mount(
    tester,
    home: const ReceiptOcrReviewQueueScreen(),
    width: width,
    scale: scale,
  );
  expect(find.byType(SettleoraStatePanel), findsOneWidget);
  expect(find.text('Sign in required'), findsOneWidget);
  await _capture(tester, '$tag-queue-disconnected');

  final loadingRepository = _VisualReceiptOcrReviewRepository(
    listCompleter: Completer<List<ReceiptOcrReviewSummary>>(),
  );
  await _mount(
    tester,
    home: ReceiptOcrReviewQueueScreen(repository: loadingRepository),
    width: width,
    scale: scale,
  );
  await tester.pump();
  expect(find.byType(SettleoraLoadingPanel), findsOneWidget);
  expect(find.text('Loading receipt reviews'), findsOneWidget);
  await _capture(tester, '$tag-queue-loading');

  await _mount(
    tester,
    home: ReceiptOcrReviewQueueScreen(
      repository: _VisualReceiptOcrReviewRepository(listResponse: const []),
    ),
    width: width,
    scale: scale,
  );
  await tester.pumpAndSettle();
  expect(find.byType(SettleoraStatePanel), findsOneWidget);
  expect(find.text('No receipt reviews'), findsOneWidget);
  await _capture(tester, '$tag-queue-empty');

  await _mount(
    tester,
    home: ReceiptOcrReviewQueueScreen(
      repository: _VisualReceiptOcrReviewRepository(listResponse: [_summary()]),
    ),
    width: width,
    scale: scale,
  );
  await tester.pumpAndSettle();
  await tester.enterText(
    find.descendant(
      of: find.byKey(const Key('receipt-review-search')),
      matching: find.byType(EditableText),
    ),
    'no matching receipt',
  );
  await tester.pump();
  expect(find.byType(SettleoraStatePanel), findsOneWidget);
  expect(find.text('No matching receipt reviews'), findsOneWidget);
  await tester.ensureVisible(find.text('No matching receipt reviews'));
  await tester.pumpAndSettle();
  await _capture(tester, '$tag-queue-no-match');

  final failureRepository = _VisualReceiptOcrReviewRepository(
    listFailure: const ReceiptOcrReviewFailure(
      kind: ReceiptOcrReviewFailureKind.network,
      message: 'Network unavailable.',
    ),
  );
  await _mount(
    tester,
    home: ReceiptOcrReviewQueueScreen(repository: failureRepository),
    width: width,
    scale: scale,
  );
  await tester.pumpAndSettle();
  expect(find.byType(SettleoraStatePanel), findsOneWidget);
  expect(find.text('Server unavailable'), findsOneWidget);
  expect(find.text('Retry'), findsOneWidget);
  await _capture(tester, '$tag-queue-failure');
}

Future<void> _captureDetailStates(
  WidgetTester tester, {
  required double width,
  required double scale,
  required String tag,
}) async {
  final route = _route();
  await _mount(
    tester,
    home: ReceiptOcrReviewDetailScreen.forRoute(
      repository: _VisualReceiptOcrReviewRepository(
        reviewCompleter: Completer<ReceiptOcrReviewDetail>(),
      ),
      route: route,
    ),
    width: width,
    scale: scale,
  );
  await tester.pump();
  expect(find.byType(SettleoraLoadingPanel), findsOneWidget);
  expect(find.text('Loading receipt review'), findsOneWidget);
  await _capture(tester, '$tag-detail-loading');

  await _mount(
    tester,
    home: ReceiptOcrReviewDetailScreen.forRoute(
      repository: _VisualReceiptOcrReviewRepository(
        reviewFailure: const ReceiptOcrReviewFailure(
          kind: ReceiptOcrReviewFailureKind.server,
          message: 'Review unavailable.',
        ),
      ),
      route: route,
    ),
    width: width,
    scale: scale,
  );
  await tester.pumpAndSettle();
  expect(find.byType(SettleoraStatePanel), findsOneWidget);
  expect(find.text('Review unavailable'), findsOneWidget);
  expect(find.text('Retry'), findsOneWidget);
  await _capture(tester, '$tag-detail-failure');

  await _mount(
    tester,
    home: ReceiptOcrReviewDetailScreen.forRoute(
      repository: _VisualReceiptOcrReviewRepository(
        reviewResponse: _review(withTotals: false),
      ),
      route: route,
    ),
    width: width,
    scale: scale,
  );
  await tester.pumpAndSettle();
  expect(find.byType(SettleoraStatePanel), findsOneWidget);
  expect(find.text('No OCR result'), findsOneWidget);
  await tester.ensureVisible(find.text('No OCR result'));
  await tester.pumpAndSettle();
  await _capture(tester, '$tag-detail-no-ocr-result');

  await _mount(
    tester,
    home: ReceiptOcrReviewDetailScreen.forRoute(
      repository: _VisualReceiptOcrReviewRepository(
        reviewResponse: _review(withTotals: true),
      ),
      route: route,
    ),
    width: width,
    scale: scale,
  );
  await tester.pumpAndSettle();
  expect(find.text('No receipt lines'), findsOneWidget);
  expect(
    find.text('Apply is blocked until this receipt has reviewed lines.'),
    findsOneWidget,
  );
  await tester.ensureVisible(find.text('No receipt lines'));
  await tester.pumpAndSettle();
  await _capture(tester, '$tag-detail-no-lines');

  await tester.tap(find.widgetWithIcon(IconButton, Icons.edit_outlined));
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.text('No receipt lines'));
  await tester.pumpAndSettle();
  expect(
    find.text('Save can proceed, but apply may be blocked by the server.'),
    findsOneWidget,
  );
  await _capture(tester, '$tag-editor-no-lines');
}

void main() {
  setUpAll(loadSettleoraVisualTestFonts);

  for (final viewport in const [
    (width: 390.0, scale: 1.0, tag: '390-1x'),
    (width: 320.0, scale: 2.0, tag: '320-2x'),
  ]) {
    testWidgets('captures production queue panels at ${viewport.tag}', (
      tester,
    ) async {
      await _captureQueueStates(
        tester,
        width: viewport.width,
        scale: viewport.scale,
        tag: viewport.tag,
      );
    });

    testWidgets('captures production detail panels at ${viewport.tag}', (
      tester,
    ) async {
      await _captureDetailStates(
        tester,
        width: viewport.width,
        scale: viewport.scale,
        tag: viewport.tag,
      );
    });
  }

  testWidgets('shared failure actions keep one safe semantic retry intent', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final repository = _VisualReceiptOcrReviewRepository(
      listFailure: const ReceiptOcrReviewFailure(
        kind: ReceiptOcrReviewFailureKind.network,
        message: 'Bearer token /var/storage/private-receipt.png',
      ),
    );
    await _mount(
      tester,
      home: ReceiptOcrReviewQueueScreen(repository: repository),
      width: 320,
      scale: 2,
    );
    await tester.pumpAndSettle();

    expect(find.byType(SettleoraStatePanel), findsOneWidget);
    expect(
      find.bySemanticsLabel('Retry loading receipt reviews'),
      findsOneWidget,
    );
    expect(find.textContaining('Bearer'), findsNothing);
    expect(find.textContaining('/var/storage'), findsNothing);
    await tester.tap(find.bySemanticsLabel('Retry loading receipt reviews'));
    await tester.pumpAndSettle();
    expect(repository.listCalls, 2);
    semantics.dispose();
  });
}

class _VisualReceiptOcrReviewRepository implements ReceiptOcrReviewRepository {
  _VisualReceiptOcrReviewRepository({
    this.listResponse,
    this.listCompleter,
    this.listFailure,
    this.reviewResponse,
    this.reviewCompleter,
    this.reviewFailure,
  });

  final List<ReceiptOcrReviewSummary>? listResponse;
  final Completer<List<ReceiptOcrReviewSummary>>? listCompleter;
  final ReceiptOcrReviewFailure? listFailure;
  final ReceiptOcrReviewDetail? reviewResponse;
  final Completer<ReceiptOcrReviewDetail>? reviewCompleter;
  final ReceiptOcrReviewFailure? reviewFailure;
  int listCalls = 0;

  @override
  Future<List<ReceiptOcrReviewSummary>> listReviews({
    ReceiptOcrReviewStatus? status,
    ReceiptOcrReviewSource? source,
    int? limit,
  }) {
    listCalls += 1;
    if (listFailure case final failure?) {
      return Future.error(failure);
    }
    return listCompleter?.future ?? Future.value(listResponse ?? const []);
  }

  @override
  Future<ReceiptOcrReviewDetail> getReview(ReceiptOcrReviewRoute route) {
    if (reviewFailure case final failure?) {
      return Future.error(failure);
    }
    return reviewCompleter?.future ?? Future.value(reviewResponse!);
  }

  @override
  Future<ReceiptOcrReviewDetail> saveReview(
    ReceiptOcrReviewRoute route,
    ReceiptOcrReviewSaveRequest request,
  ) => Future.value(reviewResponse ?? _review(withTotals: true));

  @override
  Future<void> deleteReview(ReceiptOcrReviewRoute route) => Future.value();

  @override
  Future<ReceiptOcrReviewApplyPreview> previewApply(
    ReceiptOcrReviewRoute route,
  ) => throw UnimplementedError();

  @override
  Future<ReceiptOcrReviewApplyResult> applyReview(
    ReceiptOcrReviewRoute route, {
    required DateTime expectedReviewUpdatedAtUtc,
  }) => throw UnimplementedError();
}

ReceiptOcrReviewRoute _route() => const ReceiptOcrReviewRoute(
  billId: _billId,
  fileId: _fileId,
  groupId: null,
);

ReceiptOcrReviewSummary _summary() => ReceiptOcrReviewSummary(
  reviewId: _reviewId,
  billId: _billId,
  groupId: null,
  fileId: _fileId,
  status: ReceiptOcrReviewStatusValues.reviewed,
  source: ReceiptOcrReviewSourceValues.onDevice,
  merchantText: 'Corner Market',
  currency: 'HKD',
  lineCount: 1,
  createdAtUtc: _createdAtUtc,
  updatedAtUtc: _updatedAtUtc,
);

ReceiptOcrReviewDetail _review({required bool withTotals}) =>
    ReceiptOcrReviewDetail(
      id: _reviewId,
      billId: _billId,
      groupId: null,
      fileId: _fileId,
      status: ReceiptOcrReviewStatusValues.reviewed,
      source: ReceiptOcrReviewSourceValues.onDevice,
      merchantText: withTotals ? 'Corner Market' : null,
      receiptIssuedAtUtc: withTotals ? _createdAtUtc : null,
      currency: withTotals ? 'HKD' : null,
      subtotalAmount: withTotals ? '108.00' : null,
      taxAmount: null,
      serviceChargeAmount: null,
      discountAmount: null,
      grandTotalAmount: withTotals ? '108.00' : null,
      lines: const [],
      createdAtUtc: _createdAtUtc,
      updatedAtUtc: _updatedAtUtc,
    );
