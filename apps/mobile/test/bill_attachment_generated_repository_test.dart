import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/settleora_api_client.dart';
import 'package:mobile/bills/bill_attachment_repository.dart';
import 'package:mobile/bills/generated_bill_attachment_repository.dart';
import 'package:settleora_api_client/settleora_api.dart' as api;

void main() {
  group('GeneratedSettleoraBillAttachmentRepository', () {
    test('requires a session before calling the generated client', () async {
      final client = FakeBillAttachmentGeneratedClient();
      final repository = GeneratedSettleoraBillAttachmentRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider(null),
      );

      final failure = await captureAttachmentFailure(() {
        return repository.listAttachments(
          const SettleoraBillAttachmentRoute.personal(_billId),
        );
      });

      expect(failure.kind, SettleoraBillAttachmentFailureKind.sessionRequired);
      expect(client.listPersonalCalls, 0);
    });

    test(
      'maps personal list responses through trimmed route and token',
      () async {
        final tokenProvider = FakeAccessTokenProvider('  redacted-token  ');
        final client = FakeBillAttachmentGeneratedClient(
          listResponse: api.BillAttachmentListResponse(
            attachments: [
              sampleApiAttachment(),
              sampleApiAttachment(
                fileId: _supportingFileId,
                purpose:
                    SettleoraBillAttachmentPurposeValues.supportingAttachment,
                contentType: 'application/pdf',
              ),
            ],
          ),
        );
        final repository = GeneratedSettleoraBillAttachmentRepository(
          client: client,
          accessTokenProvider: tokenProvider,
        );

        final attachments = await repository.listAttachments(
          const SettleoraBillAttachmentRoute.personal('  $_billId  '),
        );

        expect(attachments, hasLength(2));
        expect(attachments.first.fileId, _fileId);
        expect(attachments.first.billId, _billId);
        expect(
          attachments.first.purpose,
          SettleoraBillAttachmentPurposeValues.receipt,
        );
        expect(attachments.first.contentType, 'image/png');
        expect(attachments.first.sizeBytes, 321);
        expect(attachments.first.uploadedAtUtc, _uploadedAtUtc);
        expect(attachments.last.fileId, _supportingFileId);
        expect(client.listPersonalCalls, 1);
        expect(client.lastBillId, _billId);
        expect(client.accessTokens, ['redacted-token']);
        expect(tokenProvider.calls, 1);
      },
    );

    test(
      'maps multipart upload without exposing filename in response',
      () async {
        final tokenProvider = FakeAccessTokenProvider('  redacted-token  ');
        final client = FakeBillAttachmentGeneratedClient();
        final repository = GeneratedSettleoraBillAttachmentRepository(
          client: client,
          accessTokenProvider: tokenProvider,
        );

        final attachment = await repository.attachAttachment(
          const SettleoraBillAttachmentRoute.personal('  $_billId  '),
          const SettleoraBillAttachmentUpload(
            bytes: [1, 2, 3],
            filename: '  receipt.png  ',
            contentType: '  image/png  ',
            purpose: ' receipt ',
          ),
        );

        expect(attachment.fileId, _fileId);
        expect(client.attachPersonalCalls, 1);
        expect(client.lastBillId, _billId);
        expect(
          client.lastPurpose,
          SettleoraBillAttachmentPurposeValues.receipt,
        );
        expect(client.lastFile?.bytes, [1, 2, 3]);
        expect(client.lastFile?.filename, 'receipt.png');
        expect(client.lastFile?.contentType, 'image/png');
        expect(client.accessTokens, ['redacted-token']);
        expect(tokenProvider.calls, 1);
      },
    );

    test('maps group list upload remove and download methods', () async {
      final tokenProvider = FakeAccessTokenProvider('  redacted-token  ');
      final client = FakeBillAttachmentGeneratedClient(
        groupListResponse: api.BillAttachmentListResponse(
          attachments: [sampleApiAttachment()],
        ),
        downloadedBytes: const [9, 8, 7, 0],
      );
      final repository = GeneratedSettleoraBillAttachmentRepository(
        client: client,
        accessTokenProvider: tokenProvider,
      );
      const route = SettleoraBillAttachmentRoute.group(
        groupId: '  $_groupId  ',
        billId: '  $_billId  ',
      );

      final listed = await repository.listAttachments(route);
      await repository.attachAttachment(
        route,
        const SettleoraBillAttachmentUpload(
          bytes: [1, 2],
          filename: 'proof.webp',
          contentType: 'image/webp',
          purpose: SettleoraBillAttachmentPurposeValues.supportingAttachment,
        ),
      );
      await repository.removeAttachment(route, '  $_fileId  ');
      final content = await repository.downloadAttachmentContent(
        route,
        '  $_fileId  ',
      );

      expect(listed.single.fileId, _fileId);
      expect(content.bytes, [9, 8, 7, 0]);
      expect(client.listGroupCalls, 1);
      expect(client.attachGroupCalls, 1);
      expect(client.removeGroupCalls, 1);
      expect(client.downloadGroupCalls, 1);
      expect(client.lastGroupId, _groupId);
      expect(client.lastBillId, _billId);
      expect(client.lastFileId, _fileId);
      expect(client.accessTokens, [
        'redacted-token',
        'redacted-token',
        'redacted-token',
        'redacted-token',
      ]);
      expect(tokenProvider.calls, 4);
    });

    test(
      'validates local inputs before token lookup or generated calls',
      () async {
        final tokenProvider = FakeAccessTokenProvider('redacted-token');
        final client = FakeBillAttachmentGeneratedClient();
        final repository = GeneratedSettleoraBillAttachmentRepository(
          client: client,
          accessTokenProvider: tokenProvider,
        );

        final cases = <Future<Object?> Function()>[
          () => repository.listAttachments(
            const SettleoraBillAttachmentRoute.personal(' '),
          ),
          () => repository.listAttachments(
            const SettleoraBillAttachmentRoute.group(
              groupId: ' ',
              billId: _billId,
            ),
          ),
          () => repository.removeAttachment(
            const SettleoraBillAttachmentRoute.personal(_billId),
            ' ',
          ),
          () => repository.downloadAttachmentContent(
            const SettleoraBillAttachmentRoute.personal(_billId),
            ' ',
          ),
          () => repository.attachAttachment(
            const SettleoraBillAttachmentRoute.personal(_billId),
            const SettleoraBillAttachmentUpload(
              bytes: [1],
              filename: ' ',
              contentType: 'image/png',
              purpose: SettleoraBillAttachmentPurposeValues.receipt,
            ),
          ),
          () => repository.attachAttachment(
            const SettleoraBillAttachmentRoute.personal(_billId),
            const SettleoraBillAttachmentUpload(
              bytes: [1],
              filename: 'receipt.png',
              contentType: ' ',
              purpose: SettleoraBillAttachmentPurposeValues.receipt,
            ),
          ),
          () => repository.attachAttachment(
            const SettleoraBillAttachmentRoute.personal(_billId),
            const SettleoraBillAttachmentUpload(
              bytes: [],
              filename: 'receipt.png',
              contentType: 'image/png',
              purpose: SettleoraBillAttachmentPurposeValues.receipt,
            ),
          ),
          () => repository.attachAttachment(
            const SettleoraBillAttachmentRoute.personal(_billId),
            const SettleoraBillAttachmentUpload(
              bytes: [1],
              filename: 'receipt.png',
              contentType: 'image/png',
              purpose: 'raw_local_path',
            ),
          ),
        ];

        for (final operation in cases) {
          final failure = await captureAttachmentFailure(operation);
          expect(failure.kind, SettleoraBillAttachmentFailureKind.validation);
        }
        expect(tokenProvider.calls, 0);
        expect(client.totalCalls, 0);
      },
    );

    test('maps generated exceptions to bounded safe failures', () async {
      final repository = GeneratedSettleoraBillAttachmentRepository(
        client: FakeBillAttachmentGeneratedClient(
          failure: api.SettleoraApiException(
            422,
            'Unprocessable Content',
            _hiddenBody,
          ),
        ),
        accessTokenProvider: FakeAccessTokenProvider('redacted-token'),
      );

      final failure = await captureAttachmentFailure(() {
        return repository.listAttachments(
          const SettleoraBillAttachmentRoute.personal(_billId),
        );
      });

      expect(failure.kind, SettleoraBillAttachmentFailureKind.validation);
      expect(failure.statusCode, 422);
      expect(failure.message, isNot(contains('internal-detail')));
      expect(failure.message, isNot(contains('redacted-token')));
      expect(
        failure.message,
        isNot(contains('C:\\Users\\secret\\receipt.png')),
      );
      expect(failure.toString(), isNot(contains('internal-detail')));
    });

    test('maps network errors to safe retry text', () async {
      final repository = GeneratedSettleoraBillAttachmentRepository(
        client: FakeBillAttachmentGeneratedClient(
          failure: const SocketException('raw socket payload'),
        ),
        accessTokenProvider: FakeAccessTokenProvider('redacted-token'),
      );

      final failure = await captureAttachmentFailure(() {
        return repository.downloadAttachmentContent(
          const SettleoraBillAttachmentRoute.personal(_billId),
          _fileId,
        );
      });

      expect(failure.kind, SettleoraBillAttachmentFailureKind.network);
      expect(failure.message, isNot(contains('raw socket payload')));
    });
  });
}

Future<SettleoraBillAttachmentFailure> captureAttachmentFailure(
  Future<Object?> Function() operation,
) async {
  try {
    await operation();
  } on SettleoraBillAttachmentFailure catch (failure) {
    return failure;
  }

  fail('Expected SettleoraBillAttachmentFailure.');
}

class FakeAccessTokenProvider implements SettleoraAccessTokenProvider {
  FakeAccessTokenProvider(this._accessToken);

  final String? _accessToken;
  int calls = 0;

  @override
  Future<String?> accessToken() async {
    calls += 1;
    return _accessToken;
  }
}

class FakeBillAttachmentGeneratedClient
    implements SettleoraBillAttachmentGeneratedClient {
  FakeBillAttachmentGeneratedClient({
    this.failure,
    api.BillAttachmentListResponse? listResponse,
    api.BillAttachmentListResponse? groupListResponse,
    api.BillAttachmentResponse? attachmentResponse,
    List<int>? downloadedBytes,
  }) : listResponse =
           listResponse ??
           api.BillAttachmentListResponse(attachments: [sampleApiAttachment()]),
       groupListResponse =
           groupListResponse ??
           api.BillAttachmentListResponse(attachments: [sampleApiAttachment()]),
       attachmentResponse = attachmentResponse ?? sampleApiAttachment(),
       downloadedBytes = downloadedBytes ?? const [4, 5, 6];

  final Object? failure;
  final api.BillAttachmentListResponse listResponse;
  final api.BillAttachmentListResponse groupListResponse;
  final api.BillAttachmentResponse attachmentResponse;
  final List<int> downloadedBytes;
  final accessTokens = <String>[];
  int listPersonalCalls = 0;
  int attachPersonalCalls = 0;
  int removePersonalCalls = 0;
  int downloadPersonalCalls = 0;
  int listGroupCalls = 0;
  int attachGroupCalls = 0;
  int removeGroupCalls = 0;
  int downloadGroupCalls = 0;
  String? lastBillId;
  String? lastGroupId;
  String? lastFileId;
  String? lastPurpose;
  api.SettleoraMultipartFile? lastFile;

  int get totalCalls =>
      listPersonalCalls +
      attachPersonalCalls +
      removePersonalCalls +
      downloadPersonalCalls +
      listGroupCalls +
      attachGroupCalls +
      removeGroupCalls +
      downloadGroupCalls;

  @override
  Future<api.BillAttachmentListResponse> listPersonalBillAttachments(
    String billId, {
    required String accessToken,
  }) async {
    listPersonalCalls += 1;
    lastBillId = billId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return listResponse;
  }

  @override
  Future<api.BillAttachmentResponse> attachPersonalBillAttachment(
    String billId,
    String purpose,
    api.SettleoraMultipartFile file, {
    required String accessToken,
  }) async {
    attachPersonalCalls += 1;
    lastBillId = billId;
    lastPurpose = purpose;
    lastFile = file;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return attachmentResponse;
  }

  @override
  Future<void> removePersonalBillAttachment(
    String billId,
    String fileId, {
    required String accessToken,
  }) async {
    removePersonalCalls += 1;
    lastBillId = billId;
    lastFileId = fileId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
  }

  @override
  Future<List<int>> getPersonalBillAttachmentContent(
    String billId,
    String fileId, {
    required String accessToken,
  }) async {
    downloadPersonalCalls += 1;
    lastBillId = billId;
    lastFileId = fileId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return downloadedBytes;
  }

  @override
  Future<api.BillAttachmentListResponse> listGroupBillAttachments(
    String groupId,
    String billId, {
    required String accessToken,
  }) async {
    listGroupCalls += 1;
    lastGroupId = groupId;
    lastBillId = billId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return groupListResponse;
  }

  @override
  Future<api.BillAttachmentResponse> attachGroupBillAttachment(
    String groupId,
    String billId,
    String purpose,
    api.SettleoraMultipartFile file, {
    required String accessToken,
  }) async {
    attachGroupCalls += 1;
    lastGroupId = groupId;
    lastBillId = billId;
    lastPurpose = purpose;
    lastFile = file;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return attachmentResponse;
  }

  @override
  Future<void> removeGroupBillAttachment(
    String groupId,
    String billId,
    String fileId, {
    required String accessToken,
  }) async {
    removeGroupCalls += 1;
    lastGroupId = groupId;
    lastBillId = billId;
    lastFileId = fileId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
  }

  @override
  Future<List<int>> getGroupBillAttachmentContent(
    String groupId,
    String billId,
    String fileId, {
    required String accessToken,
  }) async {
    downloadGroupCalls += 1;
    lastGroupId = groupId;
    lastBillId = billId;
    lastFileId = fileId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return downloadedBytes;
  }

  void _throwIfNeeded() {
    final error = failure;
    if (error != null) {
      throw error;
    }
  }
}

api.BillAttachmentResponse sampleApiAttachment({
  String fileId = _fileId,
  String billId = _billId,
  String purpose = SettleoraBillAttachmentPurposeValues.receipt,
  String contentType = 'image/png',
}) {
  return api.BillAttachmentResponse(
    fileId: fileId,
    billId: billId,
    purpose: purpose,
    contentType: contentType,
    sizeBytes: 321,
    uploadedAtUtc: _uploadedAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

const _billId = '22222222-2222-2222-2222-222222222222';
const _groupId = '99999999-9999-9999-9999-999999999999';
const _fileId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const _supportingFileId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const _hiddenBody = {
  'detail': 'internal-detail redacted-token C:\\Users\\secret\\receipt.png',
  'bytes': [1, 2, 3],
};
final _uploadedAtUtc = DateTime.utc(2026, 5, 23, 9);
final _updatedAtUtc = DateTime.utc(2026, 5, 23, 10);
