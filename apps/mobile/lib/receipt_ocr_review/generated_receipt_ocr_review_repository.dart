import 'dart:async';
import 'dart:io';

import 'package:settleora_api_client/settleora_api.dart' as api;

import '../api/settleora_api_client.dart';
import 'receipt_ocr_review_repository.dart';

abstract interface class ReceiptOcrReviewGeneratedClient {
  Future<api.ReceiptOcrReviewListResponse> listReviews({
    ReceiptOcrReviewStatus? status,
    ReceiptOcrReviewSource? source,
    int? limit,
    required String accessToken,
  });

  Future<api.ReceiptOcrReviewResponse> getReview(
    ReceiptOcrReviewRoute route, {
    required String accessToken,
  });

  Future<api.ReceiptOcrReviewApplyPreviewResponse> previewApply(
    ReceiptOcrReviewRoute route, {
    required String accessToken,
  });

  Future<api.ReceiptOcrReviewApplyResponse> applyReview(
    ReceiptOcrReviewRoute route,
    api.ReceiptOcrReviewApplyRequest request, {
    required String accessToken,
  });
}

class SettleoraReceiptOcrReviewGeneratedClient
    implements ReceiptOcrReviewGeneratedClient {
  const SettleoraReceiptOcrReviewGeneratedClient(this._client);

  final api.SettleoraApiClient _client;

  @override
  Future<api.ReceiptOcrReviewListResponse> listReviews({
    ReceiptOcrReviewStatus? status,
    ReceiptOcrReviewSource? source,
    int? limit,
    required String accessToken,
  }) {
    return _client.listReceiptOcrReviews(
      status: status,
      source: source,
      limit: limit,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.ReceiptOcrReviewResponse> getReview(
    ReceiptOcrReviewRoute route, {
    required String accessToken,
  }) {
    final groupId = route.groupId;
    if (groupId != null) {
      return _client.getGroupBillAttachmentOcrReview(
        groupId,
        route.billId,
        route.fileId,
        accessToken: accessToken,
      );
    }

    return _client.getPersonalBillAttachmentOcrReview(
      route.billId,
      route.fileId,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.ReceiptOcrReviewApplyPreviewResponse> previewApply(
    ReceiptOcrReviewRoute route, {
    required String accessToken,
  }) {
    final groupId = route.groupId;
    if (groupId != null) {
      return _client.getGroupBillAttachmentOcrReviewApplyPreview(
        groupId,
        route.billId,
        route.fileId,
        accessToken: accessToken,
      );
    }

    return _client.getPersonalBillAttachmentOcrReviewApplyPreview(
      route.billId,
      route.fileId,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.ReceiptOcrReviewApplyResponse> applyReview(
    ReceiptOcrReviewRoute route,
    api.ReceiptOcrReviewApplyRequest request, {
    required String accessToken,
  }) {
    final groupId = route.groupId;
    if (groupId != null) {
      return _client.applyGroupBillAttachmentOcrReview(
        groupId,
        route.billId,
        route.fileId,
        request,
        accessToken: accessToken,
      );
    }

    return _client.applyPersonalBillAttachmentOcrReview(
      route.billId,
      route.fileId,
      request,
      accessToken: accessToken,
    );
  }
}

class GeneratedReceiptOcrReviewRepository
    implements ReceiptOcrReviewRepository {
  GeneratedReceiptOcrReviewRepository({
    required ReceiptOcrReviewGeneratedClient client,
    required SettleoraAccessTokenProvider accessTokenProvider,
  }) : _client = client,
       _accessTokenProvider = accessTokenProvider;

  factory GeneratedReceiptOcrReviewRepository.fromConfiguration({
    required SettleoraApiConfiguration configuration,
    required SettleoraAccessTokenProvider accessTokenProvider,
    SettleoraGeneratedApiClientFactory clientFactory =
        const SettleoraGeneratedApiClientFactory(),
  }) {
    final client = SettleoraReceiptOcrReviewGeneratedClient(
      clientFactory.create(configuration),
    );

    return GeneratedReceiptOcrReviewRepository(
      client: client,
      accessTokenProvider: accessTokenProvider,
    );
  }

  final ReceiptOcrReviewGeneratedClient _client;
  final SettleoraAccessTokenProvider _accessTokenProvider;

  @override
  Future<List<ReceiptOcrReviewSummary>> listReviews({
    ReceiptOcrReviewStatus? status,
    ReceiptOcrReviewSource? source,
    int? limit,
  }) async {
    return _withAccessToken((accessToken) async {
      final response = await _client.listReviews(
        status: status,
        source: source,
        limit: limit,
        accessToken: accessToken,
      );

      return response.reviews.map(_mapSummary).toList(growable: false);
    });
  }

  @override
  Future<ReceiptOcrReviewDetail> getReview(ReceiptOcrReviewRoute route) async {
    return _withAccessToken((accessToken) async {
      final response = await _client.getReview(route, accessToken: accessToken);

      return _mapDetail(response);
    });
  }

  @override
  Future<ReceiptOcrReviewApplyPreview> previewApply(
    ReceiptOcrReviewRoute route,
  ) async {
    return _withAccessToken((accessToken) async {
      final response = await _client.previewApply(
        route,
        accessToken: accessToken,
      );

      return _mapPreview(response);
    });
  }

  @override
  Future<ReceiptOcrReviewApplyResult> applyReview(
    ReceiptOcrReviewRoute route, {
    required DateTime expectedReviewUpdatedAtUtc,
  }) async {
    return _withAccessToken((accessToken) async {
      final request = api.ReceiptOcrReviewApplyRequest(
        applyMode: api.ReceiptOcrReviewApplyModeValues.replaceDraftOcrItems,
        expectedReviewUpdatedAtUtc: expectedReviewUpdatedAtUtc.toUtc(),
      );
      final response = await _client.applyReview(
        route,
        request,
        accessToken: accessToken,
      );

      return _mapApplyResult(response);
    });
  }

  Future<T> _withAccessToken<T>(
    Future<T> Function(String accessToken) operation,
  ) async {
    final accessToken = await _readAccessToken();
    if (accessToken == null) {
      throw _sessionRequiredFailure();
    }

    try {
      return await operation(accessToken);
    } on ReceiptOcrReviewFailure {
      rethrow;
    } catch (error) {
      throw _mapFailure(error);
    }
  }

  Future<String?> _readAccessToken() async {
    try {
      final accessToken = await _accessTokenProvider.accessToken();
      final trimmed = accessToken?.trim();
      if (trimmed == null || trimmed.isEmpty) {
        return null;
      }

      return trimmed;
    } catch (_) {
      return null;
    }
  }
}

ReceiptOcrReviewSummary _mapSummary(
  api.ReceiptOcrReviewSummaryResponse response,
) {
  return ReceiptOcrReviewSummary(
    reviewId: response.reviewId,
    billId: response.billId,
    groupId: response.groupId,
    fileId: response.fileId,
    status: response.status,
    source: response.source,
    merchantText: response.merchantText,
    currency: response.currency,
    lineCount: response.lineCount,
    createdAtUtc: response.createdAtUtc.toUtc(),
    updatedAtUtc: response.updatedAtUtc.toUtc(),
  );
}

ReceiptOcrReviewDetail _mapDetail(api.ReceiptOcrReviewResponse response) {
  return ReceiptOcrReviewDetail(
    id: response.id,
    billId: response.billId,
    fileId: response.fileId,
    groupId: response.groupId,
    status: response.status,
    source: response.source,
    merchantText: response.merchantText,
    receiptIssuedAtUtc: response.receiptIssuedAtUtc?.toUtc(),
    currency: response.currency,
    subtotalAmount: response.subtotalAmount,
    taxAmount: response.taxAmount,
    serviceChargeAmount: response.serviceChargeAmount,
    discountAmount: response.discountAmount,
    grandTotalAmount: response.grandTotalAmount,
    lines: response.lines.map(_mapLine).toList(growable: false),
    createdAtUtc: response.createdAtUtc.toUtc(),
    updatedAtUtc: response.updatedAtUtc.toUtc(),
  );
}

ReceiptOcrReviewLine _mapLine(api.ReceiptOcrReviewLineResponse response) {
  return ReceiptOcrReviewLine(
    id: response.id,
    sortOrder: response.sortOrder,
    text: response.text,
    quantity: response.quantity,
    unitPriceAmount: response.unitPriceAmount,
    lineTotalAmount: response.lineTotalAmount,
    createdAtUtc: response.createdAtUtc.toUtc(),
    updatedAtUtc: response.updatedAtUtc.toUtc(),
  );
}

ReceiptOcrReviewApplyPreview _mapPreview(
  api.ReceiptOcrReviewApplyPreviewResponse response,
) {
  return ReceiptOcrReviewApplyPreview(
    reviewId: response.reviewId,
    billId: response.billId,
    groupId: response.groupId,
    fileId: response.fileId,
    status: response.status,
    source: response.source,
    proposedMerchantText: response.proposedMerchantText,
    proposedReceiptIssuedAtUtc: response.proposedReceiptIssuedAtUtc?.toUtc(),
    proposedCurrency: response.proposedCurrency,
    proposedSubtotalAmount: response.proposedSubtotalAmount,
    proposedTaxAmount: response.proposedTaxAmount,
    proposedServiceChargeAmount: response.proposedServiceChargeAmount,
    proposedDiscountAmount: response.proposedDiscountAmount,
    proposedGrandTotalAmount: response.proposedGrandTotalAmount,
    proposedLines: response.proposedLines
        .map(_mapPreviewLine)
        .toList(growable: false),
    summary: _mapPreviewSummary(response.summary),
    canApply: response.canApply,
    blockedReasons: response.blockedReasons,
    warnings: response.warnings,
    createdAtUtc: response.createdAtUtc.toUtc(),
    updatedAtUtc: response.updatedAtUtc.toUtc(),
  );
}

ReceiptOcrReviewPreviewLine _mapPreviewLine(
  api.ReceiptOcrReviewApplyPreviewLineCandidateResponse response,
) {
  return ReceiptOcrReviewPreviewLine(
    reviewLineId: response.reviewLineId,
    sortOrder: response.sortOrder,
    text: response.text,
    quantity: response.quantity,
    unitPriceAmount: response.unitPriceAmount,
    lineTotalAmount: response.lineTotalAmount,
    proposedLineTotalAmount: response.proposedLineTotalAmount,
  );
}

ReceiptOcrReviewPreviewSummary _mapPreviewSummary(
  api.ReceiptOcrReviewApplyPreviewSummaryResponse response,
) {
  return ReceiptOcrReviewPreviewSummary(
    lineCount: response.lineCount,
    linesWithProposedTotalCount: response.linesWithProposedTotalCount,
    linesMissingProposedTotalCount: response.linesMissingProposedTotalCount,
    proposedLineTotalSumAmount: response.proposedLineTotalSumAmount,
    expectedHeaderTotalAmount: response.expectedHeaderTotalAmount,
  );
}

ReceiptOcrReviewApplyResult _mapApplyResult(
  api.ReceiptOcrReviewApplyResponse response,
) {
  return ReceiptOcrReviewApplyResult(
    reviewId: response.reviewId,
    billId: response.billId,
    groupId: response.groupId,
    fileId: response.fileId,
    applyMode: response.applyMode,
    appliedItemCount: response.appliedItemCount,
    currency: response.currency,
    subtotalAmount: response.subtotalAmount,
    grandTotalAmount: response.grandTotalAmount,
    summary: _mapPreviewSummary(response.summary),
    blockedReasons: response.blockedReasons,
    warnings: response.warnings,
    appliedAtUtc: response.appliedAtUtc.toUtc(),
  );
}

ReceiptOcrReviewFailure _mapFailure(Object error) {
  if (error is api.SettleoraApiException) {
    return _failureForStatus(error.statusCode);
  }

  if (error is SocketException ||
      error is HttpException ||
      error is HandshakeException ||
      error is TimeoutException ||
      error is IOException) {
    return const ReceiptOcrReviewFailure(
      kind: ReceiptOcrReviewFailureKind.network,
      message:
          'The server is unavailable. Try again when the connection is back.',
    );
  }

  return const ReceiptOcrReviewFailure(
    kind: ReceiptOcrReviewFailureKind.server,
    message: 'Receipt reviews are unavailable right now. Try again later.',
  );
}

ReceiptOcrReviewFailure _failureForStatus(int statusCode) {
  return switch (statusCode) {
    401 => const ReceiptOcrReviewFailure(
      kind: ReceiptOcrReviewFailureKind.unauthenticated,
      message: 'Sign in again before loading receipt reviews.',
      statusCode: 401,
    ),
    403 => const ReceiptOcrReviewFailure(
      kind: ReceiptOcrReviewFailureKind.denied,
      message: 'This receipt review is not available to this account.',
      statusCode: 403,
    ),
    404 || 410 => ReceiptOcrReviewFailure(
      kind: ReceiptOcrReviewFailureKind.unavailable,
      message: 'The receipt review is no longer available.',
      statusCode: statusCode,
    ),
    409 => const ReceiptOcrReviewFailure(
      kind: ReceiptOcrReviewFailureKind.conflict,
      message: 'Refresh the receipt review and try again.',
      statusCode: 409,
    ),
    400 || 422 => ReceiptOcrReviewFailure(
      kind: ReceiptOcrReviewFailureKind.validation,
      message:
          'The receipt review request is no longer valid. Refresh and try again.',
      statusCode: statusCode,
    ),
    >= 500 => ReceiptOcrReviewFailure(
      kind: ReceiptOcrReviewFailureKind.server,
      message: 'Receipt reviews are unavailable right now. Try again later.',
      statusCode: statusCode,
    ),
    _ => ReceiptOcrReviewFailure(
      kind: ReceiptOcrReviewFailureKind.server,
      message: 'Receipt reviews are unavailable right now. Try again later.',
      statusCode: statusCode,
    ),
  };
}

ReceiptOcrReviewFailure _sessionRequiredFailure() {
  return const ReceiptOcrReviewFailure(
    kind: ReceiptOcrReviewFailureKind.unauthenticated,
    message: 'Sign in before loading receipt reviews.',
  );
}
