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

    testWidgets('labels refresh and retry controls accessibly', (tester) async {
      final semantics = tester.ensureSemantics();
      await useLargeSurface(tester);

      await pumpAttachmentSection(
        tester,
        repository: FakeBillAttachmentRepository(
          listFailures: const [
            SettleoraBillAttachmentFailure(
              kind: SettleoraBillAttachmentFailureKind.network,
              message:
                  'StackTrace token C:\\Users\\secret\\receipt.png /var/storage/object-key [1, 2, 3]',
            ),
          ],
        ),
      );

      expect(find.byTooltip('Refresh bill attachments'), findsOneWidget);
      expect(find.byTooltip('Retry loading bill attachments'), findsOneWidget);
      expect(find.bySemanticsLabel('Refresh bill attachments'), findsOneWidget);
      expect(
        find.bySemanticsLabel('Retry loading bill attachments'),
        findsOneWidget,
      );
      expectSemanticsOmitsUnsafeAttachmentDetails();
      semantics.dispose();
    });

    testWidgets('labels upload button and purpose choices accessibly', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
      await useLargeSurface(tester);

      await pumpAttachmentSection(
        tester,
        repository: FakeBillAttachmentRepository(),
        fileInput: FakeBillAttachmentFileInput(),
      );

      expect(find.byTooltip('Upload bill attachment'), findsOneWidget);
      expect(find.bySemanticsLabel('Upload bill attachment'), findsOneWidget);

      await tester.tap(find.byKey(const Key('attachments-upload')));
      await tester.pumpAndSettle();

      expect(find.byTooltip('Upload as receipt'), findsOneWidget);
      expect(find.byTooltip('Upload as supporting attachment'), findsOneWidget);
      expect(find.byTooltip('Cancel attachment upload'), findsOneWidget);
      expect(find.bySemanticsLabel('Upload as receipt'), findsOneWidget);
      expect(
        find.bySemanticsLabel('Upload as supporting attachment'),
        findsOneWidget,
      );
      expect(find.bySemanticsLabel('Cancel attachment upload'), findsOneWidget);
      expectSemanticsOmitsUnsafeAttachmentDetails();
      semantics.dispose();
    });

    testWidgets('bounds personal attachment row summary semantics', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
      await useLargeSurface(tester);

      await pumpAttachmentSection(
        tester,
        repository: FakeBillAttachmentRepository(
          attachments: [
            sampleAttachment(
              purpose: SettleoraBillAttachmentPurposeValues.receipt,
              contentType: 'IMAGE/PNG',
              sizeBytes: 321,
            ),
          ],
        ),
        route: const SettleoraBillAttachmentRoute.personal(_billId),
      );

      expect(
        find.bySemanticsLabel(
          RegExp(
            r'Bill attachment.*Purpose: Receipt.*Content type: image/png.*Size: 321 bytes',
          ),
        ),
        findsOneWidget,
      );
      expectSemanticsOmitsUnsafeAttachmentDetails();
      semantics.dispose();
    });

    testWidgets('bounds group attachment row summary semantics', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
      await useLargeSurface(tester);

      await pumpAttachmentSection(
        tester,
        repository: FakeBillAttachmentRepository(
          attachments: [
            sampleAttachment(
              fileId: _supportingFileId,
              purpose:
                  SettleoraBillAttachmentPurposeValues.supportingAttachment,
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
        ),
        route: const SettleoraBillAttachmentRoute.group(
          groupId: _groupId,
          billId: _billId,
        ),
      );

      expect(
        find.bySemanticsLabel(
          RegExp(
            r'Bill attachment.*Purpose: Supporting attachment.*Content type: application/pdf.*Size: 2.0 KiB',
          ),
        ),
        findsOneWidget,
      );
      expect(
        find.bySemanticsLabel(
          RegExp(
            r'Bill attachment.*Purpose: Attachment.*Content type: Unknown type.*Size: Unknown size',
          ),
        ),
        findsOneWidget,
      );
      expectSemanticsOmitsUnsafeAttachmentDetails();
      semantics.dispose();
    });

    testWidgets('shows receipt OCR review only for receipt metadata', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
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
      expect(find.byTooltip('Review receipt OCR'), findsOneWidget);
      expect(find.bySemanticsLabel('Review receipt OCR'), findsOneWidget);
      expect(visibleText(tester), isNot(contains('C:\\Users\\secret')));
      expectSemanticsOmitsUnsafeAttachmentDetails();
      semantics.dispose();
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
      final semantics = tester.ensureSemantics();
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
      expect(find.byTooltip('Open bill attachment'), findsOneWidget);
      expect(find.bySemanticsLabel('Open bill attachment'), findsOneWidget);
      expect(find.byTooltip('Remove bill attachment'), findsOneWidget);
      expect(find.bySemanticsLabel('Remove bill attachment'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('attachments-download-0')));
      await tester.pumpAndSettle();

      expect(repository.downloadCalls, 1);
      expect(repository.lastRoute?.billId, _billId);
      expect(repository.lastRoute?.groupId, isNull);
      expect(repository.lastDownloadedFileId, _fileId);
      expect(find.text('Downloaded 3 bytes.'), findsOneWidget);
      expect(visibleText(tester), isNot(contains('[1, 2, 3]')));
      expectSemanticsOmitsUnsafeAttachmentDetails();
      semantics.dispose();
    });

    testWidgets('removes through the group route and stable file ID', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
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

      expect(find.byTooltip('Cancel attachment removal'), findsOneWidget);
      expect(find.byTooltip('Confirm remove bill attachment'), findsOneWidget);
      expect(
        find.bySemanticsLabel('Cancel attachment removal'),
        findsOneWidget,
      );
      expect(
        find.bySemanticsLabel('Confirm remove bill attachment'),
        findsOneWidget,
      );
      expectSemanticsOmitsUnsafeAttachmentDetails();

      await tester.tap(find.byKey(const Key('attachments-remove-confirm')));
      await tester.pumpAndSettle();

      expect(repository.removeCalls, 1);
      expect(repository.lastRoute?.groupId, _groupId);
      expect(repository.lastRoute?.billId, _billId);
      expect(repository.lastRemovedFileId, _fileId);
      expect(find.text('Attachment removed.'), findsOneWidget);
      semantics.dispose();
    });

    testWidgets('blocks duplicate and conflicting actions while downloading', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
      await useLargeSurface(tester);
      final downloadCompleter = Completer<void>();
      final repository = FakeBillAttachmentRepository(
        attachments: [
          sampleAttachment(contentType: 'C:\\Users\\secret\\receipt.png token'),
        ],
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
      expect(
        find.bySemanticsLabel(
          RegExp(
            'Open bill attachment.*Disabled while attachment work is in progress',
          ),
        ),
        findsOneWidget,
      );
      expect(
        find.bySemanticsLabel(
          RegExp(
            'Remove bill attachment.*Disabled while attachment work is in progress',
          ),
        ),
        findsOneWidget,
      );
      expect(
        find.bySemanticsLabel(
          RegExp(
            'Review receipt OCR.*Disabled while attachment work is in progress',
          ),
        ),
        findsOneWidget,
      );
      expect(
        find.bySemanticsLabel(
          RegExp(
            'Upload bill attachment.*Disabled while attachment work is in progress',
          ),
        ),
        findsOneWidget,
      );
      expect(
        find.bySemanticsLabel(
          RegExp(
            'Refresh bill attachments.*Disabled while attachment work is in progress',
          ),
        ),
        findsOneWidget,
      );
      expectSemanticsOmitsUnsafeAttachmentDetails();
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
      semantics.dispose();
    });

    testWidgets('blocks row actions and upload while refreshing list', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
      await useLargeSurface(tester);
      final refreshCompleter = Completer<void>();
      final repository = FakeBillAttachmentRepository(
        attachments: [sampleAttachment()],
      );

      await pumpAttachmentSection(
        tester,
        repository: repository,
        fileInput: FakeBillAttachmentFileInput(),
        receiptOcrReviewRepository: FakeReceiptOcrReviewRepository(),
      );

      repository.listCompleter = refreshCompleter;
      await tester.tap(find.byKey(const Key('attachments-refresh')));
      await tester.pump();

      expect(repository.listCalls, 2);
      expect(find.byKey(const Key('attachments-refreshing')), findsOneWidget);
      expect(
        find.bySemanticsLabel(RegExp('Refreshing attachments')),
        findsOneWidget,
      );
      expect(
        find.bySemanticsLabel(
          RegExp(
            'Upload bill attachment.*Disabled while attachment work is in progress',
          ),
        ),
        findsOneWidget,
      );
      expect(
        find.bySemanticsLabel(
          RegExp(
            'Open bill attachment.*Disabled while attachment work is in progress',
          ),
        ),
        findsOneWidget,
      );
      expect(
        find.bySemanticsLabel(
          RegExp(
            'Remove bill attachment.*Disabled while attachment work is in progress',
          ),
        ),
        findsOneWidget,
      );
      expectOutlinedButtonEnabled(
        tester,
        const Key('attachments-upload'),
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

      await tester.tap(find.byKey(const Key('attachments-upload')));
      await tester.tap(find.byKey(const ValueKey('attachments-download-0')));
      await tester.tap(find.byKey(const ValueKey('attachments-remove-0')));
      await tester.pump();

      expect(repository.attachCalls, 0);
      expect(repository.downloadCalls, 0);
      expect(repository.removeCalls, 0);

      refreshCompleter.complete();
      await tester.pumpAndSettle();

      expectOutlinedButtonEnabled(
        tester,
        const Key('attachments-upload'),
        isTrue,
      );
      semantics.dispose();
    });

    testWidgets('blocks conflicting actions while choosing upload purpose', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
      await useLargeSurface(tester);
      final repository = FakeBillAttachmentRepository(
        attachments: [sampleAttachment()],
      );

      await pumpAttachmentSection(
        tester,
        repository: repository,
        fileInput: FakeBillAttachmentFileInput(),
        receiptOcrReviewRepository: FakeReceiptOcrReviewRepository(),
      );

      await tester.tap(find.byKey(const Key('attachments-upload')));
      await tester.pumpAndSettle();

      expect(find.byTooltip('Upload as receipt'), findsOneWidget);
      expect(
        find.bySemanticsLabel(
          RegExp(
            'Upload bill attachment.*Disabled while attachment work is in progress',
          ),
        ),
        findsOneWidget,
      );
      expect(
        find.bySemanticsLabel(
          RegExp(
            'Refresh bill attachments.*Disabled while attachment work is in progress',
          ),
        ),
        findsOneWidget,
      );
      expect(
        find.bySemanticsLabel(
          RegExp(
            'Open bill attachment.*Disabled while attachment work is in progress',
          ),
        ),
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

      expect(repository.downloadCalls, 0);
      expect(repository.removeCalls, 0);

      await tester.tap(
        find.byKey(const Key('attachment-upload-purpose-cancel')),
      );
      await tester.pumpAndSettle();

      expect(repository.attachCalls, 0);
      expectOutlinedButtonEnabled(
        tester,
        const Key('attachments-upload'),
        isTrue,
      );
      semantics.dispose();
    });

    testWidgets('remove confirmation and remove work block conflicts', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
      await useLargeSurface(tester);
      final removeCompleter = Completer<void>();
      final repository = FakeBillAttachmentRepository(
        attachments: [sampleAttachment()],
        removeCompleter: removeCompleter,
      );

      await pumpAttachmentSection(
        tester,
        repository: repository,
        fileInput: FakeBillAttachmentFileInput(),
        receiptOcrReviewRepository: FakeReceiptOcrReviewRepository(),
      );

      await tester.tap(find.byKey(const ValueKey('attachments-remove-0')));
      await tester.pumpAndSettle();

      expect(find.byTooltip('Cancel attachment removal'), findsOneWidget);
      expect(find.byTooltip('Confirm remove bill attachment'), findsOneWidget);

      expect(repository.downloadCalls, 0);
      expect(repository.attachCalls, 0);
      expect(repository.removeCalls, 0);

      await tester.tap(find.byKey(const Key('attachments-remove-confirm')));
      await tester.pump();

      expect(repository.removeCalls, 1);
      expect(
        find.byKey(const Key('attachments-remove-progress')),
        findsOneWidget,
      );
      expect(
        find.bySemanticsLabel(RegExp('Removing attachment')),
        findsOneWidget,
      );
      expect(
        find.bySemanticsLabel(
          RegExp(
            'Open bill attachment.*Disabled while attachment work is in progress',
          ),
        ),
        findsOneWidget,
      );
      expect(
        find.bySemanticsLabel(
          RegExp(
            'Upload bill attachment.*Disabled while attachment work is in progress',
          ),
        ),
        findsOneWidget,
      );
      expectOutlinedButtonEnabled(
        tester,
        const Key('attachments-upload'),
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

      await tester.tap(find.byKey(const ValueKey('attachments-download-0')));
      await tester.tap(find.byKey(const ValueKey('attachments-remove-0')));
      await tester.tap(find.byKey(const Key('attachments-upload')));
      await tester.pump();

      expect(repository.downloadCalls, 0);
      expect(repository.removeCalls, 1);
      expect(repository.attachCalls, 0);

      removeCompleter.complete();
      await tester.pumpAndSettle();

      expect(find.text('Attachment removed.'), findsOneWidget);
      semantics.dispose();
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
      final semantics = tester.ensureSemantics();
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
      expectSemanticsOmitsUnsafeAttachmentDetails();
      semantics.dispose();
    });

    testWidgets('sanitizes upload download and remove failure details', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
      await useLargeSurface(tester);
      final fileInput = FakeBillAttachmentFileInput(
        pickedFile: samplePickedAttachmentFile(
          filename: 'C:\\Users\\secret\\receipt.png',
          contentType: 'image/png',
          bytes: const [1, 2, 3],
        ),
      );
      final repository = FakeBillAttachmentRepository(
        attachments: [sampleAttachment()],
        attachFailure: const SettleoraBillAttachmentFailure(
          kind: SettleoraBillAttachmentFailureKind.validation,
          message:
              'StackTrace token C:\\Users\\secret\\receipt.png /var/storage/object-key [1, 2, 3] OCR payload dump',
        ),
        downloadFailure: const SettleoraBillAttachmentFailure(
          kind: SettleoraBillAttachmentFailureKind.network,
          message:
              'StackTrace token C:\\Users\\secret\\receipt.png /tmp/object-key [1, 2, 3]',
        ),
        removeFailure: const SettleoraBillAttachmentFailure(
          kind: SettleoraBillAttachmentFailureKind.server,
          message:
              'StackTrace token s3://settleora/object-key raw bytes [1, 2, 3]',
        ),
      );

      await pumpAttachmentSection(
        tester,
        repository: repository,
        fileInput: fileInput,
      );

      await tester.tap(find.byKey(const Key('attachments-upload')));
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const Key('attachment-upload-purpose-receipt')),
      );
      await tester.pumpAndSettle();

      expect(find.text('Unsupported request'), findsOneWidget);
      expect(
        find.text(
          'The attachment request is no longer valid. Refresh and try again.',
        ),
        findsOneWidget,
      );
      expect(repository.attachCalls, 1);
      expectSemanticsOmitsUnsafeAttachmentDetails();
      expectVisibleTextOmitsUnsafeAttachmentDetails(tester);

      await tester.tap(find.byKey(const ValueKey('attachments-download-0')));
      await tester.pumpAndSettle();

      expect(find.text('Server unavailable'), findsOneWidget);
      expect(
        find.text(
          'The server is unavailable. Try again when the connection is back.',
        ),
        findsOneWidget,
      );
      expect(repository.downloadCalls, 1);
      expectSemanticsOmitsUnsafeAttachmentDetails();
      expectVisibleTextOmitsUnsafeAttachmentDetails(tester);

      await tester.tap(find.byKey(const ValueKey('attachments-remove-0')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('attachments-remove-confirm')));
      await tester.pumpAndSettle();

      expect(find.text('Attachments unavailable'), findsOneWidget);
      expect(
        find.text('Attachments are unavailable right now. Try again later.'),
        findsOneWidget,
      );
      expect(repository.removeCalls, 1);
      expectSemanticsOmitsUnsafeAttachmentDetails();
      expectVisibleTextOmitsUnsafeAttachmentDetails(tester);
      semantics.dispose();
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

void expectSemanticsOmitsUnsafeAttachmentDetails() {
  expect(find.bySemanticsLabel(RegExp('StackTrace')), findsNothing);
  expect(find.bySemanticsLabel(RegExp('bearer')), findsNothing);
  expect(find.bySemanticsLabel(RegExp('token')), findsNothing);
  expect(
    find.bySemanticsLabel(RegExp(RegExp.escape('C:\\Users\\secret'))),
    findsNothing,
  );
  expect(find.bySemanticsLabel(RegExp('/var/storage')), findsNothing);
  expect(find.bySemanticsLabel(RegExp('object-key')), findsNothing);
  expect(
    find.bySemanticsLabel(RegExp(RegExp.escape('[1, 2, 3]'))),
    findsNothing,
  );
  expect(find.bySemanticsLabel(RegExp('OCR payload')), findsNothing);
  expect(find.bySemanticsLabel(RegExp(RegExp.escape(_billId))), findsNothing);
  expect(find.bySemanticsLabel(RegExp(RegExp.escape(_groupId))), findsNothing);
  expect(find.bySemanticsLabel(RegExp(RegExp.escape(_fileId))), findsNothing);
  expect(
    find.bySemanticsLabel(RegExp(RegExp.escape(_supportingFileId))),
    findsNothing,
  );
  expect(
    find.bySemanticsLabel(RegExp(RegExp.escape(_futureFileId))),
    findsNothing,
  );
}

void expectVisibleTextOmitsUnsafeAttachmentDetails(WidgetTester tester) {
  final text = visibleText(tester);
  expect(text, isNot(contains('StackTrace')));
  expect(text, isNot(contains('bearer')));
  expect(text, isNot(contains('token')));
  expect(text, isNot(contains('C:\\Users\\secret')));
  expect(text, isNot(contains('/var/storage')));
  expect(text, isNot(contains('/tmp')));
  expect(text, isNot(contains('s3://')));
  expect(text, isNot(contains('object-key')));
  expect(text, isNot(contains('[1, 2, 3]')));
  expect(text, isNot(contains('raw bytes')));
  expect(text, isNot(contains('OCR payload')));
  expect(text, isNot(contains(_billId)));
  expect(text, isNot(contains(_groupId)));
  expect(text, isNot(contains(_fileId)));
}

class FakeBillAttachmentRepository
    implements SettleoraBillAttachmentRepository {
  FakeBillAttachmentRepository({
    this.attachments = const [],
    this.listFailures = const [],
    this.downloadedBytes = const [1, 2, 3],
    this.attachFailure,
    this.downloadFailure,
    this.removeFailure,
    this.removeCompleter,
    this.downloadCompleter,
  });

  List<SettleoraBillAttachment> attachments;
  final List<SettleoraBillAttachmentFailure> listFailures;
  final List<int> downloadedBytes;
  final SettleoraBillAttachmentFailure? attachFailure;
  final SettleoraBillAttachmentFailure? downloadFailure;
  final SettleoraBillAttachmentFailure? removeFailure;
  final Completer<void>? removeCompleter;
  final Completer<void>? downloadCompleter;
  Completer<void>? listCompleter;
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
    final failure = attachFailure;
    if (failure != null) {
      throw failure;
    }

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
    final pendingList = listCompleter;
    if (pendingList != null) {
      await pendingList.future;
    }

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
    await removeCompleter?.future;
    final failure = removeFailure;
    if (failure != null) {
      throw failure;
    }

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
    final failure = downloadFailure;
    if (failure != null) {
      throw failure;
    }

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
