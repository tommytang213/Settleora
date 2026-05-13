import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/settleora_api_client.dart';
import 'package:mobile/receipt_ocr_review/generated_receipt_ocr_review_repository.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_repository.dart';
import 'package:settleora_api_client/settleora_api.dart' as api;

void main() {
  group('GeneratedReceiptOcrReviewRepository', () {
    test('requires a session before calling the generated client', () async {
      final client = FakeReceiptOcrReviewGeneratedClient();
      final repository = GeneratedReceiptOcrReviewRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider(null),
      );

      final failure = await captureFailure(repository.listReviews);

      expect(failure.kind, ReceiptOcrReviewFailureKind.unauthenticated);
      expect(failure.statusCode, isNull);
      expect(client.listCalls, 0);
    });

    test('maps generated responses into receipt OCR review models', () async {
      final client = FakeReceiptOcrReviewGeneratedClient(
        listResponse: api.ReceiptOcrReviewListResponse(
          reviews: [sampleApiSummary()],
        ),
        reviewResponse: sampleApiReview(),
        previewResponse: sampleApiPreview(),
        applyResponse: sampleApiApplyResult(),
      );
      final repository = GeneratedReceiptOcrReviewRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider(_accessSession),
      );

      final summaries = await repository.listReviews(
        status: ReceiptOcrReviewStatusValues.reviewed,
        source: ReceiptOcrReviewSourceValues.onDevice,
        limit: 25,
      );
      final summary = summaries.single;
      expect(summary.reviewId, _reviewId);
      expect(summary.groupId, _groupId);
      expect(summary.merchantText, 'Corner Market');
      expect(summary.createdAtUtc, _createdAtUtc);
      expect(client.lastStatus, ReceiptOcrReviewStatusValues.reviewed);
      expect(client.lastSource, ReceiptOcrReviewSourceValues.onDevice);
      expect(client.lastLimit, 25);

      final route = ReceiptOcrReviewRoute.fromSummary(summary);
      final detail = await repository.getReview(route);
      expect(detail.lines.single.text, 'Milk');
      expect(detail.updatedAtUtc, _updatedAtUtc);

      final preview = await repository.previewApply(route);
      expect(preview.canApply, isTrue);
      expect(preview.summary.expectedHeaderTotalAmount, '10.80');

      final result = await repository.applyReview(
        route,
        expectedReviewUpdatedAtUtc: preview.updatedAtUtc,
      );

      expect(
        result.applyMode,
        api.ReceiptOcrReviewApplyModeValues.replaceDraftOcrItems,
      );
      expect(result.appliedItemCount, 1);
      expect(client.lastApplyRoute, route);
      expect(
        client.lastApplyRequest?.applyMode,
        api.ReceiptOcrReviewApplyModeValues.replaceDraftOcrItems,
      );
      expect(
        client.lastApplyRequest?.expectedReviewUpdatedAtUtc,
        preview.updatedAtUtc,
      );
      expect(
        client.lastApplyRequest?.toJson().keys,
        unorderedEquals(['applyMode', 'expectedReviewUpdatedAtUtc']),
      );
    });

    test('maps generated-client failures to safe UI failures', () async {
      final cases = <FailureCase>[
        FailureCase(
          api.SettleoraApiException(401, 'Unauthorized', _hiddenBody),
          ReceiptOcrReviewFailureKind.unauthenticated,
          401,
        ),
        FailureCase(
          api.SettleoraApiException(403, 'Forbidden', _hiddenBody),
          ReceiptOcrReviewFailureKind.denied,
          403,
        ),
        FailureCase(
          api.SettleoraApiException(404, 'Not Found', _hiddenBody),
          ReceiptOcrReviewFailureKind.unavailable,
          404,
        ),
        FailureCase(
          api.SettleoraApiException(409, 'Conflict', _hiddenBody),
          ReceiptOcrReviewFailureKind.conflict,
          409,
        ),
        FailureCase(
          api.SettleoraApiException(422, 'Unprocessable Content', _hiddenBody),
          ReceiptOcrReviewFailureKind.validation,
          422,
        ),
        FailureCase(
          const SocketException('internal socket detail'),
          ReceiptOcrReviewFailureKind.network,
          null,
        ),
        FailureCase(
          api.SettleoraApiException(500, 'Server Error', _hiddenBody),
          ReceiptOcrReviewFailureKind.server,
          500,
        ),
      ];

      for (final failureCase in cases) {
        final repository = GeneratedReceiptOcrReviewRepository(
          client: FakeReceiptOcrReviewGeneratedClient(
            failure: failureCase.error,
          ),
          accessTokenProvider: FakeAccessTokenProvider(_accessSession),
        );

        final failure = await captureFailure(repository.listReviews);

        expect(failure.kind, failureCase.kind);
        expect(failure.statusCode, failureCase.statusCode);
        expect(failure.message, isNot(contains('internal-detail')));
        expect(failure.message, isNot(contains('internal socket detail')));
      }
    });
  });
}

Future<ReceiptOcrReviewFailure> captureFailure(
  Future<Object?> Function() operation,
) async {
  try {
    await operation();
  } on ReceiptOcrReviewFailure catch (failure) {
    return failure;
  }

  fail('Expected ReceiptOcrReviewFailure.');
}

class FailureCase {
  const FailureCase(this.error, this.kind, this.statusCode);

  final Object error;
  final ReceiptOcrReviewFailureKind kind;
  final int? statusCode;
}

class FakeAccessTokenProvider implements SettleoraAccessTokenProvider {
  const FakeAccessTokenProvider(this._accessToken);

  final String? _accessToken;

  @override
  Future<String?> accessToken() async => _accessToken;
}

class FakeReceiptOcrReviewGeneratedClient
    implements ReceiptOcrReviewGeneratedClient {
  FakeReceiptOcrReviewGeneratedClient({
    this.failure,
    api.ReceiptOcrReviewListResponse? listResponse,
    api.ReceiptOcrReviewResponse? reviewResponse,
    api.ReceiptOcrReviewApplyPreviewResponse? previewResponse,
    api.ReceiptOcrReviewApplyResponse? applyResponse,
  }) : listResponse =
           listResponse ?? const api.ReceiptOcrReviewListResponse(reviews: []),
       reviewResponse = reviewResponse ?? sampleApiReview(),
       previewResponse = previewResponse ?? sampleApiPreview(),
       applyResponse = applyResponse ?? sampleApiApplyResult();

  final Object? failure;
  final api.ReceiptOcrReviewListResponse listResponse;
  final api.ReceiptOcrReviewResponse reviewResponse;
  final api.ReceiptOcrReviewApplyPreviewResponse previewResponse;
  final api.ReceiptOcrReviewApplyResponse applyResponse;
  int listCalls = 0;
  ReceiptOcrReviewStatus? lastStatus;
  ReceiptOcrReviewSource? lastSource;
  int? lastLimit;
  ReceiptOcrReviewRoute? lastApplyRoute;
  api.ReceiptOcrReviewApplyRequest? lastApplyRequest;

  @override
  Future<api.ReceiptOcrReviewListResponse> listReviews({
    ReceiptOcrReviewStatus? status,
    ReceiptOcrReviewSource? source,
    int? limit,
    required String accessToken,
  }) async {
    listCalls += 1;
    lastStatus = status;
    lastSource = source;
    lastLimit = limit;
    _throwIfNeeded();
    return listResponse;
  }

  @override
  Future<api.ReceiptOcrReviewResponse> getReview(
    ReceiptOcrReviewRoute route, {
    required String accessToken,
  }) async {
    _throwIfNeeded();
    return reviewResponse;
  }

  @override
  Future<api.ReceiptOcrReviewApplyPreviewResponse> previewApply(
    ReceiptOcrReviewRoute route, {
    required String accessToken,
  }) async {
    _throwIfNeeded();
    return previewResponse;
  }

  @override
  Future<api.ReceiptOcrReviewApplyResponse> applyReview(
    ReceiptOcrReviewRoute route,
    api.ReceiptOcrReviewApplyRequest request, {
    required String accessToken,
  }) async {
    lastApplyRoute = route;
    lastApplyRequest = request;
    _throwIfNeeded();
    return applyResponse;
  }

  void _throwIfNeeded() {
    final error = failure;
    if (error != null) {
      throw error;
    }
  }
}

api.ReceiptOcrReviewSummaryResponse sampleApiSummary() {
  return api.ReceiptOcrReviewSummaryResponse(
    reviewId: _reviewId,
    billId: _billId,
    groupId: _groupId,
    fileId: _fileId,
    status: api.ReceiptOcrReviewStatusValues.reviewed,
    source: api.ReceiptOcrReviewSourceValues.onDevice,
    merchantText: 'Corner Market',
    currency: 'USD',
    lineCount: 1,
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

api.ReceiptOcrReviewResponse sampleApiReview() {
  return api.ReceiptOcrReviewResponse(
    id: _reviewId,
    billId: _billId,
    fileId: _fileId,
    groupId: _groupId,
    status: api.ReceiptOcrReviewStatusValues.reviewed,
    source: api.ReceiptOcrReviewSourceValues.onDevice,
    merchantText: 'Corner Market',
    receiptIssuedAtUtc: _createdAtUtc,
    currency: 'USD',
    subtotalAmount: '10.00',
    taxAmount: '0.80',
    serviceChargeAmount: null,
    discountAmount: null,
    grandTotalAmount: '10.80',
    lines: [
      api.ReceiptOcrReviewLineResponse(
        id: _lineId,
        sortOrder: 0,
        text: 'Milk',
        quantity: '1',
        unitPriceAmount: '10.00',
        lineTotalAmount: '10.00',
        createdAtUtc: _createdAtUtc,
        updatedAtUtc: _updatedAtUtc,
      ),
    ],
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

api.ReceiptOcrReviewApplyPreviewResponse sampleApiPreview() {
  return api.ReceiptOcrReviewApplyPreviewResponse(
    reviewId: _reviewId,
    billId: _billId,
    groupId: _groupId,
    fileId: _fileId,
    status: api.ReceiptOcrReviewStatusValues.reviewed,
    source: api.ReceiptOcrReviewSourceValues.onDevice,
    proposedMerchantText: 'Corner Market',
    proposedReceiptIssuedAtUtc: _createdAtUtc,
    proposedCurrency: 'USD',
    proposedSubtotalAmount: '10.00',
    proposedTaxAmount: '0.80',
    proposedServiceChargeAmount: null,
    proposedDiscountAmount: null,
    proposedGrandTotalAmount: '10.80',
    proposedLines: [
      api.ReceiptOcrReviewApplyPreviewLineCandidateResponse(
        reviewLineId: _lineId,
        sortOrder: 0,
        text: 'Milk',
        quantity: '1',
        unitPriceAmount: '10.00',
        lineTotalAmount: '10.00',
        proposedLineTotalAmount: '10.00',
      ),
    ],
    summary: sampleApiPreviewSummary(),
    canApply: true,
    blockedReasons: const [],
    warnings: const [],
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

api.ReceiptOcrReviewApplyResponse sampleApiApplyResult() {
  return api.ReceiptOcrReviewApplyResponse(
    reviewId: _reviewId,
    billId: _billId,
    groupId: _groupId,
    fileId: _fileId,
    applyMode: api.ReceiptOcrReviewApplyModeValues.replaceDraftOcrItems,
    appliedItemCount: 1,
    currency: 'USD',
    subtotalAmount: '10.00',
    grandTotalAmount: '10.80',
    summary: sampleApiPreviewSummary(),
    blockedReasons: const [],
    warnings: const [],
    appliedAtUtc: _updatedAtUtc,
  );
}

api.ReceiptOcrReviewApplyPreviewSummaryResponse sampleApiPreviewSummary() {
  return const api.ReceiptOcrReviewApplyPreviewSummaryResponse(
    lineCount: 1,
    linesWithProposedTotalCount: 1,
    linesMissingProposedTotalCount: 0,
    proposedLineTotalSumAmount: '10.00',
    expectedHeaderTotalAmount: '10.80',
  );
}

const _accessSession = 'redacted';
const _reviewId = '11111111-1111-1111-1111-111111111111';
const _billId = '22222222-2222-2222-2222-222222222222';
const _groupId = '33333333-3333-3333-3333-333333333333';
const _fileId = '44444444-4444-4444-4444-444444444444';
const _lineId = '55555555-5555-5555-5555-555555555555';
const _hiddenBody = {'detail': 'internal-detail'};
final _createdAtUtc = DateTime.utc(2026, 5, 13, 12);
final _updatedAtUtc = DateTime.utc(2026, 5, 13, 12, 30);
