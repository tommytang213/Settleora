import 'dart:async';
import 'dart:io';

import 'package:settleora_api_client/settleora_api.dart' as api;

import '../api/settleora_api_client.dart';
import 'bill_attachment_repository.dart';

abstract interface class SettleoraBillAttachmentGeneratedClient {
  Future<api.BillAttachmentListResponse> listPersonalBillAttachments(
    String billId, {
    required String accessToken,
  });

  Future<api.BillAttachmentResponse> attachPersonalBillAttachment(
    String billId,
    String purpose,
    api.SettleoraMultipartFile file, {
    required String accessToken,
  });

  Future<void> removePersonalBillAttachment(
    String billId,
    String fileId, {
    required String accessToken,
  });

  Future<List<int>> getPersonalBillAttachmentContent(
    String billId,
    String fileId, {
    required String accessToken,
  });

  Future<api.BillAttachmentListResponse> listGroupBillAttachments(
    String groupId,
    String billId, {
    required String accessToken,
  });

  Future<api.BillAttachmentResponse> attachGroupBillAttachment(
    String groupId,
    String billId,
    String purpose,
    api.SettleoraMultipartFile file, {
    required String accessToken,
  });

  Future<void> removeGroupBillAttachment(
    String groupId,
    String billId,
    String fileId, {
    required String accessToken,
  });

  Future<List<int>> getGroupBillAttachmentContent(
    String groupId,
    String billId,
    String fileId, {
    required String accessToken,
  });
}

class SettleoraGeneratedBillAttachmentClient
    implements SettleoraBillAttachmentGeneratedClient {
  const SettleoraGeneratedBillAttachmentClient(this._client);

  final api.SettleoraApiClient _client;

  @override
  Future<api.BillAttachmentListResponse> listPersonalBillAttachments(
    String billId, {
    required String accessToken,
  }) {
    return _client.listPersonalBillAttachments(
      billId,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.BillAttachmentResponse> attachPersonalBillAttachment(
    String billId,
    String purpose,
    api.SettleoraMultipartFile file, {
    required String accessToken,
  }) {
    return _client.attachPersonalBillAttachment(
      billId,
      purpose,
      file,
      accessToken: accessToken,
    );
  }

  @override
  Future<void> removePersonalBillAttachment(
    String billId,
    String fileId, {
    required String accessToken,
  }) {
    return _client.removePersonalBillAttachment(
      billId,
      fileId,
      accessToken: accessToken,
    );
  }

  @override
  Future<List<int>> getPersonalBillAttachmentContent(
    String billId,
    String fileId, {
    required String accessToken,
  }) {
    return _client.getPersonalBillAttachmentContent(
      billId,
      fileId,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.BillAttachmentListResponse> listGroupBillAttachments(
    String groupId,
    String billId, {
    required String accessToken,
  }) {
    return _client.listGroupBillAttachments(
      groupId,
      billId,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.BillAttachmentResponse> attachGroupBillAttachment(
    String groupId,
    String billId,
    String purpose,
    api.SettleoraMultipartFile file, {
    required String accessToken,
  }) {
    return _client.attachGroupBillAttachment(
      groupId,
      billId,
      purpose,
      file,
      accessToken: accessToken,
    );
  }

  @override
  Future<void> removeGroupBillAttachment(
    String groupId,
    String billId,
    String fileId, {
    required String accessToken,
  }) {
    return _client.removeGroupBillAttachment(
      groupId,
      billId,
      fileId,
      accessToken: accessToken,
    );
  }

  @override
  Future<List<int>> getGroupBillAttachmentContent(
    String groupId,
    String billId,
    String fileId, {
    required String accessToken,
  }) {
    return _client.getGroupBillAttachmentContent(
      groupId,
      billId,
      fileId,
      accessToken: accessToken,
    );
  }
}

class GeneratedSettleoraBillAttachmentRepository
    implements SettleoraBillAttachmentRepository {
  GeneratedSettleoraBillAttachmentRepository({
    required SettleoraBillAttachmentGeneratedClient client,
    required SettleoraAccessTokenProvider accessTokenProvider,
  }) : _client = client,
       _accessTokenProvider = accessTokenProvider;

  factory GeneratedSettleoraBillAttachmentRepository.fromConfiguration({
    required SettleoraApiConfiguration configuration,
    required SettleoraAccessTokenProvider accessTokenProvider,
    SettleoraGeneratedApiClientFactory clientFactory =
        const SettleoraGeneratedApiClientFactory(),
  }) {
    return GeneratedSettleoraBillAttachmentRepository(
      client: SettleoraGeneratedBillAttachmentClient(
        clientFactory.create(configuration),
      ),
      accessTokenProvider: accessTokenProvider,
    );
  }

  final SettleoraBillAttachmentGeneratedClient _client;
  final SettleoraAccessTokenProvider _accessTokenProvider;

  @override
  Future<List<SettleoraBillAttachment>> listAttachments(
    SettleoraBillAttachmentRoute route,
  ) {
    final normalizedRoute = _normalizeRoute(route);

    return _withAccessToken((accessToken) async {
      final response = await _listAttachments(
        normalizedRoute,
        accessToken: accessToken,
      );

      return response.attachments.map(_mapAttachment).toList(growable: false);
    });
  }

  @override
  Future<SettleoraBillAttachment> attachAttachment(
    SettleoraBillAttachmentRoute route,
    SettleoraBillAttachmentUpload upload,
  ) {
    final normalizedRoute = _normalizeRoute(route);
    final purpose = _requiredPurpose(upload.purpose);
    final file = _mapUpload(upload);

    return _withAccessToken((accessToken) async {
      final response = await _attachAttachment(
        normalizedRoute,
        purpose,
        file,
        accessToken: accessToken,
      );

      return _mapAttachment(response);
    });
  }

  @override
  Future<void> removeAttachment(
    SettleoraBillAttachmentRoute route,
    String fileId,
  ) {
    final normalizedRoute = _normalizeRoute(route);
    final normalizedFileId = _requiredId(
      fileId,
      blankMessage: 'Choose an attachment before removing it.',
    );

    return _withAccessToken((accessToken) {
      return _removeAttachment(
        normalizedRoute,
        normalizedFileId,
        accessToken: accessToken,
      );
    });
  }

  @override
  Future<SettleoraBillAttachmentContent> downloadAttachmentContent(
    SettleoraBillAttachmentRoute route,
    String fileId,
  ) {
    final normalizedRoute = _normalizeRoute(route);
    final normalizedFileId = _requiredId(
      fileId,
      blankMessage: 'Choose an attachment before downloading it.',
    );

    return _withAccessToken((accessToken) async {
      final bytes = await _downloadAttachmentContent(
        normalizedRoute,
        normalizedFileId,
        accessToken: accessToken,
      );

      return SettleoraBillAttachmentContent(bytes: bytes);
    });
  }

  Future<api.BillAttachmentListResponse> _listAttachments(
    SettleoraBillAttachmentRoute route, {
    required String accessToken,
  }) {
    final groupId = route.groupId;
    if (groupId != null) {
      return _client.listGroupBillAttachments(
        groupId,
        route.billId,
        accessToken: accessToken,
      );
    }

    return _client.listPersonalBillAttachments(
      route.billId,
      accessToken: accessToken,
    );
  }

  Future<api.BillAttachmentResponse> _attachAttachment(
    SettleoraBillAttachmentRoute route,
    String purpose,
    api.SettleoraMultipartFile file, {
    required String accessToken,
  }) {
    final groupId = route.groupId;
    if (groupId != null) {
      return _client.attachGroupBillAttachment(
        groupId,
        route.billId,
        purpose,
        file,
        accessToken: accessToken,
      );
    }

    return _client.attachPersonalBillAttachment(
      route.billId,
      purpose,
      file,
      accessToken: accessToken,
    );
  }

  Future<void> _removeAttachment(
    SettleoraBillAttachmentRoute route,
    String fileId, {
    required String accessToken,
  }) {
    final groupId = route.groupId;
    if (groupId != null) {
      return _client.removeGroupBillAttachment(
        groupId,
        route.billId,
        fileId,
        accessToken: accessToken,
      );
    }

    return _client.removePersonalBillAttachment(
      route.billId,
      fileId,
      accessToken: accessToken,
    );
  }

  Future<List<int>> _downloadAttachmentContent(
    SettleoraBillAttachmentRoute route,
    String fileId, {
    required String accessToken,
  }) {
    final groupId = route.groupId;
    if (groupId != null) {
      return _client.getGroupBillAttachmentContent(
        groupId,
        route.billId,
        fileId,
        accessToken: accessToken,
      );
    }

    return _client.getPersonalBillAttachmentContent(
      route.billId,
      fileId,
      accessToken: accessToken,
    );
  }

  Future<T> _withAccessToken<T>(
    Future<T> Function(String accessToken) operation,
  ) async {
    final accessToken = await _readAccessToken();
    if (accessToken == null) {
      throw const SettleoraBillAttachmentFailure(
        kind: SettleoraBillAttachmentFailureKind.sessionRequired,
        message: 'Sign in before loading bill attachments.',
      );
    }

    try {
      return await operation(accessToken);
    } on SettleoraBillAttachmentFailure {
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

SettleoraBillAttachmentRoute _normalizeRoute(
  SettleoraBillAttachmentRoute route,
) {
  final billId = _requiredId(
    route.billId,
    blankMessage: 'Choose a bill before loading attachments.',
  );
  final groupId = route.groupId;
  if (groupId == null) {
    return SettleoraBillAttachmentRoute.personal(billId);
  }

  return SettleoraBillAttachmentRoute.group(
    groupId: _requiredId(
      groupId,
      blankMessage: 'Choose a group before loading attachments.',
    ),
    billId: billId,
  );
}

api.SettleoraMultipartFile _mapUpload(SettleoraBillAttachmentUpload upload) {
  final filename = _requiredText(
    upload.filename,
    blankMessage: 'Choose a file before uploading an attachment.',
  );
  final contentType = _requiredText(
    upload.contentType,
    blankMessage: 'Choose a file type before uploading an attachment.',
  );
  if (upload.bytes.isEmpty) {
    throw const SettleoraBillAttachmentFailure(
      kind: SettleoraBillAttachmentFailureKind.validation,
      message: 'Choose a non-empty file before uploading an attachment.',
    );
  }

  return api.SettleoraMultipartFile(
    bytes: List.unmodifiable(upload.bytes),
    filename: filename,
    contentType: contentType,
  );
}

SettleoraBillAttachment _mapAttachment(api.BillAttachmentResponse response) {
  return SettleoraBillAttachment(
    fileId: response.fileId,
    billId: response.billId,
    purpose: response.purpose,
    contentType: response.contentType,
    sizeBytes: response.sizeBytes,
    uploadedAtUtc: response.uploadedAtUtc.toUtc(),
    updatedAtUtc: response.updatedAtUtc.toUtc(),
  );
}

SettleoraBillAttachmentFailure _mapFailure(Object error) {
  if (error is api.SettleoraApiException) {
    return switch (error.statusCode) {
      400 || 422 => SettleoraBillAttachmentFailure(
        kind: SettleoraBillAttachmentFailureKind.validation,
        message:
            'The attachment request is no longer valid. Refresh and try again.',
        statusCode: error.statusCode,
      ),
      401 => const SettleoraBillAttachmentFailure(
        kind: SettleoraBillAttachmentFailureKind.sessionExpired,
        message:
            'Your session has expired. Sign in again before loading attachments.',
        statusCode: 401,
      ),
      403 => const SettleoraBillAttachmentFailure(
        kind: SettleoraBillAttachmentFailureKind.denied,
        message: 'Attachments are not available to this account.',
        statusCode: 403,
      ),
      404 || 410 => SettleoraBillAttachmentFailure(
        kind: SettleoraBillAttachmentFailureKind.unavailable,
        message: 'The attachment is no longer available.',
        statusCode: error.statusCode,
      ),
      409 => const SettleoraBillAttachmentFailure(
        kind: SettleoraBillAttachmentFailureKind.conflict,
        message: 'Refresh the bill attachments and try again.',
        statusCode: 409,
      ),
      >= 500 => SettleoraBillAttachmentFailure(
        kind: SettleoraBillAttachmentFailureKind.server,
        message: 'Attachments are unavailable right now. Try again later.',
        statusCode: error.statusCode,
      ),
      _ => SettleoraBillAttachmentFailure(
        kind: SettleoraBillAttachmentFailureKind.server,
        message: 'Attachments are unavailable right now. Try again later.',
        statusCode: error.statusCode,
      ),
    };
  }

  if (error is SocketException ||
      error is HttpException ||
      error is HandshakeException ||
      error is TimeoutException ||
      error is IOException) {
    return const SettleoraBillAttachmentFailure(
      kind: SettleoraBillAttachmentFailureKind.network,
      message:
          'The server is unavailable. Try again when the connection is back.',
    );
  }

  return const SettleoraBillAttachmentFailure(
    kind: SettleoraBillAttachmentFailureKind.server,
    message: 'Attachments are unavailable right now. Try again later.',
  );
}

String _requiredId(String value, {required String blankMessage}) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    throw SettleoraBillAttachmentFailure(
      kind: SettleoraBillAttachmentFailureKind.validation,
      message: blankMessage,
    );
  }

  return trimmed;
}

String _requiredText(String value, {required String blankMessage}) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    throw SettleoraBillAttachmentFailure(
      kind: SettleoraBillAttachmentFailureKind.validation,
      message: blankMessage,
    );
  }

  return trimmed;
}

String _requiredPurpose(SettleoraBillAttachmentPurpose purpose) {
  final trimmed = purpose.trim();
  if (!SettleoraBillAttachmentPurposeValues.values.contains(trimmed)) {
    throw const SettleoraBillAttachmentFailure(
      kind: SettleoraBillAttachmentFailureKind.validation,
      message: 'Choose a supported attachment purpose.',
    );
  }

  return trimmed;
}
