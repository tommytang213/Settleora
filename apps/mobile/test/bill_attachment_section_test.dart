import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_attachment_file_input.dart';
import 'package:mobile/bills/bill_attachment_repository.dart';
import 'package:mobile/bills/bill_attachment_section.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_repository.dart';

void main() {
  group('BillAttachmentSection', () {
    testWidgets('renders bounded attachment metadata labels', (tester) async {
      await useLargeSurface(tester);
      final repository = FakeBillAttachmentRepository(
        attachments: [
          sampleAttachment(
            purpose: SettleoraBillAttachmentPurposeValues.receipt,
            contentType: 'image/png',
            sizeBytes: 512,
          ),
          sampleAttachment(
            fileId: _supportingFileId,
            purpose: SettleoraBillAttachmentPurposeValues.supportingAttachment,
            contentType: 'application/pdf',
            sizeBytes: 2048,
          ),
          sampleAttachment(
            fileId: _futureFileId,
            purpose: 'future_raw_path_purpose',
            contentType: 'C:\\Users\\secret\\receipt.png token',
            sizeBytes: -99,
          ),
        ],
      );

      await pumpAttachmentSection(tester, repository: repository);

      expect(find.text('Receipt'), findsOneWidget);
      expect(find.text('Supporting attachment'), findsOneWidget);
      expect(find.text('Attachment'), findsOneWidget);
      expect(find.text('image/png'), findsOneWidget);
      expect(find.text('application/pdf'), findsOneWidget);
      expect(find.text('Unknown type'), findsOneWidget);
      expect(find.text('Unknown size'), findsOneWidget);
      expect(visibleText(tester), isNot(contains('C:\\Users\\secret')));
      expect(visibleText(tester), isNot(contains('token')));
    });

    testWidgets('shows receipt OCR review only for receipt metadata', (
      tester,
    ) async {
      await useLargeSurface(tester);
      final repository = FakeBillAttachmentRepository(
        attachments: [
          sampleAttachment(
            contentType: 'C:\\Users\\secret\\receipt.png',
            purpose: SettleoraBillAttachmentPurposeValues.receipt,
          ),
          sampleAttachment(
            fileId: _supportingFileId,
            purpose: SettleoraBillAttachmentPurposeValues.supportingAttachment,
          ),
          sampleAttachment(fileId: _futureFileId, purpose: 'future_receipt'),
        ],
      );

      await pumpAttachmentSection(
        tester,
        repository: repository,
        receiptOcrReviewRepository: FakeReceiptOcrReviewRepository(),
      );

      expect(find.byKey(const ValueKey('attachments-ocr-0')), findsOneWidget);
      expect(find.byKey(const ValueKey('attachments-ocr-1')), findsNothing);
      expect(find.byKey(const ValueKey('attachments-ocr-2')), findsNothing);
      expect(visibleText(tester), isNot(contains('C:\\Users\\secret')));
    });

    testWidgets('hides receipt OCR review when review repository is absent', (
      tester,
    ) async {
      await useLargeSurface(tester);

      await pumpAttachmentSection(
        tester,
        repository: FakeBillAttachmentRepository(
          attachments: [
            sampleAttachment(
              purpose: SettleoraBillAttachmentPurposeValues.receipt,
            ),
          ],
        ),
      );

      expect(find.text('Receipt'), findsOneWidget);
      expect(find.text('Review OCR'), findsNothing);
    });

    testWidgets('opens personal receipt OCR detail from attachment metadata', (
      tester,
    ) async {
      await useLargeSurface(tester);
      final receiptRepository = FakeReceiptOcrReviewRepository();

      await pumpAttachmentSection(
        tester,
        repository: FakeBillAttachmentRepository(
          attachments: [
            sampleAttachment(
              purpose: SettleoraBillAttachmentPurposeValues.receipt,
              contentType: 'C:\\Users\\secret\\receipt.png token',
            ),
          ],
        ),
        route: const SettleoraBillAttachmentRoute.personal(_billId),
        receiptOcrReviewRepository: receiptRepository,
      );

      await tester.tap(find.byKey(const ValueKey('attachments-ocr-0')));
      await tester.pumpAndSettle();

      expect(receiptRepository.getCalls, 1);
      expect(receiptRepository.lastRoute?.billId, _billId);
      expect(receiptRepository.lastRoute?.fileId, _fileId);
      expect(receiptRepository.lastRoute?.groupId, isNull);
      expect(visibleText(tester), isNot(contains('C:\\Users\\secret')));
      expect(visibleText(tester), isNot(contains('token')));
    });

    testWidgets('opens group receipt OCR detail from attachment metadata', (
      tester,
    ) async {
      await useLargeSurface(tester);
      final receiptRepository = FakeReceiptOcrReviewRepository();

      await pumpAttachmentSection(
        tester,
        repository: FakeBillAttachmentRepository(
          attachments: [
            sampleAttachment(
              purpose: SettleoraBillAttachmentPurposeValues.receipt,
            ),
          ],
        ),
        route: const SettleoraBillAttachmentRoute.group(
          groupId: _groupId,
          billId: _billId,
        ),
        receiptOcrReviewRepository: receiptRepository,
      );

      await tester.tap(find.byKey(const ValueKey('attachments-ocr-0')));
      await tester.pumpAndSettle();

      expect(receiptRepository.getCalls, 1);
      expect(receiptRepository.lastRoute?.billId, _billId);
      expect(receiptRepository.lastRoute?.fileId, _fileId);
      expect(receiptRepository.lastRoute?.groupId, _groupId);
    });

    testWidgets('downloads through the personal route and stable file ID', (
      tester,
    ) async {
      await useLargeSurface(tester);
      final repository = FakeBillAttachmentRepository(
        attachments: [sampleAttachment()],
        downloadedBytes: const [1, 2, 3],
      );

      await pumpAttachmentSection(
        tester,
        repository: repository,
        route: const SettleoraBillAttachmentRoute.personal(_billId),
      );
      await tester.tap(find.byKey(const ValueKey('attachments-download-0')));
      await tester.pumpAndSettle();

      expect(repository.downloadCalls, 1);
      expect(repository.lastRoute?.billId, _billId);
      expect(repository.lastRoute?.groupId, isNull);
      expect(repository.lastDownloadedFileId, _fileId);
      expect(find.text('Downloaded 3 bytes.'), findsOneWidget);
      expect(visibleText(tester), isNot(contains('[1, 2, 3]')));
    });

    testWidgets('removes through the group route and stable file ID', (
      tester,
    ) async {
      await useLargeSurface(tester);
      final repository = FakeBillAttachmentRepository(
        attachments: [sampleAttachment()],
      );

      await pumpAttachmentSection(
        tester,
        repository: repository,
        route: const SettleoraBillAttachmentRoute.group(
          groupId: _groupId,
          billId: _billId,
        ),
      );
      await tester.tap(find.byKey(const ValueKey('attachments-remove-0')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('attachments-remove-confirm')));
      await tester.pumpAndSettle();

      expect(repository.removeCalls, 1);
      expect(repository.lastRoute?.groupId, _groupId);
      expect(repository.lastRoute?.billId, _billId);
      expect(repository.lastRemovedFileId, _fileId);
      expect(find.text('Attachment removed.'), findsOneWidget);
    });

    testWidgets('blocks duplicate and conflicting actions while downloading', (
      tester,
    ) async {
      await useLargeSurface(tester);
      final downloadCompleter = Completer<void>();
      final repository = FakeBillAttachmentRepository(
        attachments: [sampleAttachment()],
        downloadCompleter: downloadCompleter,
      );

      await pumpAttachmentSection(
        tester,
        repository: repository,
        fileInput: FakeBillAttachmentFileInput(),
        receiptOcrReviewRepository: FakeReceiptOcrReviewRepository(),
      );
      await tester.tap(find.byKey(const ValueKey('attachments-download-0')));
      await tester.pump();

      expect(repository.downloadCalls, 1);
      expect(
        find.byKey(const ValueKey('attachments-download-progress-0')),
        findsOneWidget,
      );
      expectOutlinedButtonEnabled(
        tester,
        const Key('attachments-upload'),
        isFalse,
      );
      expectIconButtonEnabled(
        tester,
        const Key('attachments-refresh'),
        isFalse,
      );
      expectOutlinedButtonEnabled(
        tester,
        const ValueKey('attachments-download-0'),
        isFalse,
      );
      expectOutlinedButtonEnabled(
        tester,
        const ValueKey('attachments-remove-0'),
        isFalse,
      );
      expectOutlinedButtonEnabled(
        tester,
        const ValueKey('attachments-ocr-0'),
        isFalse,
      );

      await tester.tap(find.byKey(const ValueKey('attachments-download-0')));
      await tester.tap(find.byKey(const ValueKey('attachments-remove-0')));
      await tester.tap(find.byKey(const ValueKey('attachments-ocr-0')));
      await tester.tap(find.byKey(const Key('attachments-refresh')));
      await tester.tap(find.byKey(const Key('attachments-upload')));
      await tester.pump();

      expect(repository.downloadCalls, 1);
      expect(repository.removeCalls, 0);
      expect(repository.listCalls, 1);
      expect(repository.attachCalls, 0);

      downloadCompleter.complete();
      await tester.pumpAndSettle();

      expect(find.text('Downloaded 3 bytes.'), findsOneWidget);
      expectOutlinedButtonEnabled(
        tester,
        const Key('attachments-upload'),
        isTrue,
      );
    });

    testWidgets(
      'post-upload review action opens refreshed receipt attachment route',
      (tester) async {
        await useLargeSurface(tester);
        final receiptRepository = FakeReceiptOcrReviewRepository();
        final fileInput = FakeBillAttachmentFileInput(
          pickedFile: samplePickedAttachmentFile(
            filename: 'C:\\Users\\secret\\local-receipt.png',
            contentType: 'image/png',
            bytes: const [4, 5, 6],
          ),
        );
        final repository = FakeBillAttachmentRepository();

        await pumpAttachmentSection(
          tester,
          repository: repository,
          fileInput: fileInput,
          receiptOcrReviewRepository: receiptRepository,
        );

        await tester.tap(find.byKey(const Key('attachments-upload')));
        await tester.pumpAndSettle();
        await tester.tap(
          find.byKey(const Key('attachment-upload-purpose-receipt')),
        );
        await tester.pumpAndSettle();

        expect(fileInput.pickCalls, 1);
        expect(repository.attachCalls, 1);
        expect(repository.listCalls, 2);
        expect(repository.lastUpload?.filename, 'local-receipt.png');
        expect(find.text('Receipt uploaded.'), findsOneWidget);
        expect(
          find.widgetWithText(SnackBarAction, 'Review receipt'),
          findsOneWidget,
        );
        expect(visibleText(tester), isNot(contains('C:\\Users\\secret')));

        await tester.tap(find.widgetWithText(SnackBarAction, 'Review receipt'));
        await tester.pumpAndSettle();

        expect(receiptRepository.getCalls, 1);
        expect(receiptRepository.lastRoute?.billId, _billId);
        expect(receiptRepository.lastRoute?.fileId, _uploadedFileId);
        expect(receiptRepository.lastRoute?.groupId, isNull);
      },
    );

    testWidgets('renders suspicious failures as bounded generic UI text', (
      tester,
    ) async {
      await useLargeSurface(tester);

      await pumpAttachmentSection(
        tester,
        repository: FakeBillAttachmentRepository(
          listFailures: const [
            SettleoraBillAttachmentFailure(
              kind: SettleoraBillAttachmentFailureKind.server,
              message:
                  'StackTrace token C:\\Users\\secret\\receipt.png /var/storage/object-key [1, 2, 3]',
            ),
          ],
        ),
      );

      expect(find.text('Attachments unavailable'), findsOneWidget);
      expect(
        find.text('Attachments are unavailable right now. Try again later.'),
        findsOneWidget,
      );
      expect(visibleText(tester), isNot(contains('StackTrace')));
      expect(visibleText(tester), isNot(contains('token')));
      expect(visibleText(tester), isNot(contains('C:\\Users\\secret')));
      expect(visibleText(tester), isNot(contains('/var/storage')));
      expect(visibleText(tester), isNot(contains('object-key')));
      expect(visibleText(tester), isNot(contains('[1, 2, 3]')));
    });
  });
}

Future<void> pumpAttachmentSection(
  WidgetTester tester, {
  required FakeBillAttachmentRepository repository,
  SettleoraBillAttachmentRoute route =
      const SettleoraBillAttachmentRoute.personal(_billId),
  SettleoraBillAttachmentFileInput? fileInput,
  ReceiptOcrReviewRepository? receiptOcrReviewRepository,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: BillAttachmentSection(
              keyPrefix: 'attachments',
              reloadRevision: 0,
              route: route,
              repository: repository,
              fileInput: fileInput,
              receiptOcrReviewRepository: receiptOcrReviewRepository,
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> useLargeSurface(WidgetTester tester) async {
  await tester.binding.setSurfaceSize(const Size(900, 1400));
  addTearDown(() => tester.binding.setSurfaceSize(null));
}

void expectOutlinedButtonEnabled(
  WidgetTester tester,
  Key key,
  Matcher matcher,
) {
  final button = tester.widget<OutlinedButton>(find.byKey(key));
  expect(button.onPressed != null, matcher);
}

void expectIconButtonEnabled(WidgetTester tester, Key key, Matcher matcher) {
  final button = tester.widget<IconButton>(find.byKey(key));
  expect(button.onPressed != null, matcher);
}

String visibleText(WidgetTester tester) {
  return tester
      .widgetList<Text>(find.byType(Text))
      .map((widget) => widget.data)
      .whereType<String>()
      .join('\n');
}

class FakeBillAttachmentRepository
    implements SettleoraBillAttachmentRepository {
  FakeBillAttachmentRepository({
    this.attachments = const [],
    this.listFailures = const [],
    this.downloadedBytes = const [1, 2, 3],
    this.downloadCompleter,
  });

  List<SettleoraBillAttachment> attachments;
  final List<SettleoraBillAttachmentFailure> listFailures;
  final List<int> downloadedBytes;
  final Completer<void>? downloadCompleter;
  int listCalls = 0;
  int attachCalls = 0;
  int removeCalls = 0;
  int downloadCalls = 0;
  SettleoraBillAttachmentRoute? lastRoute;
  SettleoraBillAttachmentUpload? lastUpload;
  String? lastRemovedFileId;
  String? lastDownloadedFileId;

  @override
  Future<SettleoraBillAttachment> attachAttachment(
    SettleoraBillAttachmentRoute route,
    SettleoraBillAttachmentUpload upload,
  ) async {
    attachCalls += 1;
    lastRoute = route;
    lastUpload = upload;
    final attachment = SettleoraBillAttachment(
      fileId: _uploadedFileId,
      billId: route.billId,
      purpose: upload.purpose,
      contentType: upload.contentType,
      sizeBytes: upload.bytes.length,
      uploadedAtUtc: _updatedAtUtc,
      updatedAtUtc: _updatedAtUtc,
    );
    attachments = [
      attachment,
      ...attachments.where((item) => item.fileId != attachment.fileId),
    ];
    return attachment;
  }

  @override
  Future<List<SettleoraBillAttachment>> listAttachments(
    SettleoraBillAttachmentRoute route,
  ) async {
    listCalls += 1;
    lastRoute = route;
    if (listFailures.length >= listCalls) {
      throw listFailures[listCalls - 1];
    }

    return attachments;
  }

  @override
  Future<void> removeAttachment(
    SettleoraBillAttachmentRoute route,
    String fileId,
  ) async {
    removeCalls += 1;
    lastRoute = route;
    lastRemovedFileId = fileId;
    attachments = [
      for (final attachment in attachments)
        if (attachment.fileId != fileId) attachment,
    ];
  }

  @override
  Future<SettleoraBillAttachmentContent> downloadAttachmentContent(
    SettleoraBillAttachmentRoute route,
    String fileId,
  ) async {
    downloadCalls += 1;
    lastRoute = route;
    lastDownloadedFileId = fileId;
    await downloadCompleter?.future;
    return SettleoraBillAttachmentContent(bytes: downloadedBytes);
  }
}

class FakeBillAttachmentFileInput implements SettleoraBillAttachmentFileInput {
  FakeBillAttachmentFileInput({this.pickedFile});

  final SettleoraPickedBillAttachmentFile? pickedFile;
  int pickCalls = 0;
  Set<String>? lastAllowedContentTypes;

  @override
  Future<SettleoraPickedBillAttachmentFile?> pickAttachmentFile({
    required Set<String> allowedContentTypes,
  }) async {
    pickCalls += 1;
    lastAllowedContentTypes = allowedContentTypes;
    return pickedFile;
  }
}

class FakeReceiptOcrReviewRepository implements ReceiptOcrReviewRepository {
  int getCalls = 0;
  ReceiptOcrReviewRoute? lastRoute;

  @override
  Future<List<ReceiptOcrReviewSummary>> listReviews({
    ReceiptOcrReviewStatus? status,
    ReceiptOcrReviewSource? source,
    int? limit,
  }) async {
    return const [];
  }

  @override
  Future<ReceiptOcrReviewDetail> getReview(ReceiptOcrReviewRoute route) async {
    getCalls += 1;
    lastRoute = route;
    return sampleReceiptOcrReviewDetail(route);
  }

  @override
  Future<ReceiptOcrReviewDetail> saveReview(
    ReceiptOcrReviewRoute route,
    ReceiptOcrReviewSaveRequest request,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<void> deleteReview(ReceiptOcrReviewRoute route) {
    throw UnimplementedError();
  }

  @override
  Future<ReceiptOcrReviewApplyPreview> previewApply(
    ReceiptOcrReviewRoute route,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<ReceiptOcrReviewApplyResult> applyReview(
    ReceiptOcrReviewRoute route, {
    required DateTime expectedReviewUpdatedAtUtc,
  }) {
    throw UnimplementedError();
  }
}

SettleoraBillAttachment sampleAttachment({
  String fileId = _fileId,
  String purpose = SettleoraBillAttachmentPurposeValues.receipt,
  String contentType = 'image/png',
  int sizeBytes = 321,
}) {
  return SettleoraBillAttachment(
    fileId: fileId,
    billId: _billId,
    purpose: purpose,
    contentType: contentType,
    sizeBytes: sizeBytes,
    uploadedAtUtc: _uploadedAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

SettleoraPickedBillAttachmentFile samplePickedAttachmentFile({
  String filename = 'receipt.png',
  String contentType = 'image/png',
  List<int> bytes = const [1, 2, 3],
}) {
  return pickedBillAttachmentFileFromBytes(
    filename: filename,
    contentType: contentType,
    bytes: bytes,
    allowedContentTypes: SettleoraBillAttachmentContentTypeValues.receiptValues,
  );
}

ReceiptOcrReviewDetail sampleReceiptOcrReviewDetail(
  ReceiptOcrReviewRoute route,
) {
  return ReceiptOcrReviewDetail(
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    billId: route.billId,
    fileId: route.fileId,
    groupId: route.groupId,
    status: ReceiptOcrReviewStatusValues.provisional,
    source: ReceiptOcrReviewSourceValues.onDevice,
    merchantText: 'Corner Market',
    receiptIssuedAtUtc: _uploadedAtUtc,
    currency: 'USD',
    subtotalAmount: '10.00',
    taxAmount: '0.80',
    serviceChargeAmount: null,
    discountAmount: null,
    grandTotalAmount: '10.80',
    lines: [
      ReceiptOcrReviewLine(
        id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        sortOrder: 0,
        text: 'Milk',
        quantity: '1',
        unitPriceAmount: '10.00',
        lineTotalAmount: '10.00',
        createdAtUtc: _uploadedAtUtc,
        updatedAtUtc: _updatedAtUtc,
      ),
    ],
    createdAtUtc: _uploadedAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

const _billId = '22222222-2222-2222-2222-222222222222';
const _groupId = '99999999-9999-9999-9999-999999999999';
const _fileId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const _supportingFileId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const _futureFileId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const _uploadedFileId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
final _uploadedAtUtc = DateTime.utc(2026, 5, 23, 9);
final _updatedAtUtc = DateTime.utc(2026, 5, 23, 10);
