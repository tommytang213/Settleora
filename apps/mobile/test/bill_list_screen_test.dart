import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:mobile/api/settleora_api_client.dart';
import 'package:mobile/app/auth_session_repository.dart';
import 'package:mobile/app/secure_storage.dart';
import 'package:mobile/app/server_mode_shell.dart';
import 'package:mobile/bills/bill_attachment_file_input.dart';
import 'package:mobile/bills/bill_attachment_repository.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/bills/bill_revision_repository.dart';
import 'package:mobile/bills/bill_repository.dart';
import 'package:mobile/bills/bill_sync_controller.dart';
import 'package:mobile/groups/group_repository.dart';
import 'package:mobile/notifications/notification_repository.dart';
import 'package:mobile/profile/profile_repository.dart';
import 'package:mobile/receipt_ocr_capture/receipt_image_intake.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_provider.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_repository.dart';
import 'package:mobile/recurring_bills/recurring_bill_repository.dart';
import 'package:mobile/reports/report_repository.dart';
import 'package:mobile/settlements/settlement_repository.dart';
import 'package:mobile/sync/sync_queue.dart';
import 'package:mobile/sync/sync_queue_processor.dart';
import 'package:mobile/sync/sync_repository.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_form_fields.dart';

void main() {
  testWidgets('bill list queues archive and flushes through sync', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final store = MemorySyncQueueStore();
    final syncRepository = FakeSyncRepository([sampleOperationResult()]);
    final controller = SettleoraBillSyncController(
      queueStore: store,
      queueProcessor: SettleoraSyncQueueProcessor(
        queueStore: store,
        repository: syncRepository,
        now: () => _attemptedAtUtc,
      ),
      now: () => _createdAtUtc,
      idGenerator: () => 'queue-1',
    );
    final billRepository = FakeBillRepository(bills: [sampleBillSummary()]);

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: billRepository,
          syncController: controller,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Corner Market'), findsWidgets);
    expect(billRepository.listCalls, 1);

    await tester.tap(find.byKey(const ValueKey('bill-archive-0')));
    await tester.pumpAndSettle();

    expect(syncRepository.submitCalls, 1);
    expect(store.state.items.single.operationType, 'bill_archive');
    expect(store.state.items.single.payload, isEmpty);
    expect(store.state.items.single.state, 'synced');
    expect(find.textContaining('1 synced'), findsWidgets);
    expect(billRepository.listCalls, 2);
  });

  testWidgets('personal bill list shows create entry', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: FakeBillRepository(),
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('bill-list-create')), findsOneWidget);
    expect(find.text('Create bill'), findsWidgets);
    expect(find.byKey(const Key('bottom-nav-bills')), findsNothing);
    expect(find.byKey(const Key('group-bill-list-create')), findsNothing);
    expect(find.text('Create group bill'), findsNothing);
  });

  testWidgets('personal bill list scan receipt starts receipt upload handoff', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final attachmentRepository = FakeBillAttachmentRepository();
    final fileInput = FakeBillAttachmentFileInput(
      pickedFile: samplePickedAttachmentFile(
        filename: 'receipt.png',
        contentType: 'image/png',
        bytes: const [1, 2, 3],
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: FakeBillRepository(),
          syncController: sampleBillSyncController(),
          attachmentRepository: attachmentRepository,
          attachmentFileInput: fileInput,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('bill-list-scan-receipt')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('personal-bill-scan-receipt')), findsOneWidget);
    expect(find.text('Add another receipt'), findsOneWidget);
    expect(
      find.text(
        'Receipt selected. It uploads after save; OCR review remains provisional.',
      ),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('personal-bill-attachment-purpose-0')),
      findsOneWidget,
    );
    expect(
      tester
          .widget<Text>(
            find.byKey(const ValueKey('personal-bill-attachment-purpose-0')),
          )
          .data,
      'Receipt',
    );
    expect(fileInput.pickCalls, 1);
    expect(
      fileInput.lastAllowedContentTypes,
      billAttachmentUploadContentTypesForPurpose(
        SettleoraBillAttachmentPurposeValues.receipt,
      ),
    );
  });

  testWidgets('personal bill scan receipt reviews and applies OCR suggestions', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeBillRepository(
      createdDetail: sampleBillDetail(
        id: _createdBillId,
        merchantName: 'Corner Market',
        billDate: '2026-06-12',
        totalAmount: '43.00',
        totalCurrency: 'HKD',
      ),
    );
    final fileInput = FakeBillAttachmentFileInput(
      pickedFile: samplePickedAttachmentFile(
        filename: 'receipt.png',
        contentType: 'image/png',
        bytes: samplePngBytes(width: 640, height: 480),
      ),
    );
    final attachmentRepository = FakeBillAttachmentRepository();
    final receiptRepository = FakeReceiptOcrReviewRepository();
    final receiptOcrProvider = FakeReceiptOcrProvider(
      const ReceiptOcrResult.extracted(
        ReceiptOcrPreview(
          merchant: 'Corner Market',
          receiptDate: '2026-06-12',
          currency: 'HKD',
          subtotal: '45.00',
          discount: '-2.00',
          tax: '0.00',
          service: '0.00',
          total: '43.00',
          rawTextLineCount: 8,
          warnings: ['Review line totals before saving.'],
          items: [
            ReceiptOcrItemCandidate(
              description: 'Milk',
              quantity: '2',
              unitPrice: '12.50',
              lineTotal: '25.00',
              currency: 'HKD',
            ),
            ReceiptOcrItemCandidate(
              description: 'Bread',
              quantity: '1',
              lineTotal: '18.00',
              currency: 'HKD',
            ),
          ],
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          syncController: sampleBillSyncController(),
          attachmentRepository: attachmentRepository,
          attachmentFileInput: fileInput,
          receiptOcrReviewRepository: receiptRepository,
          receiptOcrProvider: receiptOcrProvider,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('bill-list-scan-receipt')));
    await tester.pumpAndSettle();

    expect(receiptOcrProvider.calls, 1);
    expect(receiptOcrProvider.lastRequest?.contentType, 'image/jpeg');
    expect(receiptOcrProvider.lastRequest?.bytes, isNotEmpty);
    expect(
      receiptOcrProvider.lastRequest?.bytes,
      isNot(fileInput.pickedFile?.bytes),
    );
    expect(
      find.byKey(const Key('personal-bill-ocr-preview-panel')),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('receipt-intake-safety-panel')),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('receipt-intake-source-label')),
      findsOneWidget,
    );
    expect(find.text('File import'), findsOneWidget);
    expect(find.byKey(const Key('receipt-intake-file-label')), findsOneWidget);
    expect(find.text('File: receipt.png'), findsOneWidget);
    expect(
      find.byKey(const Key('receipt-intake-handling-label')),
      findsOneWidget,
    );
    expect(find.text('Handling: Accepted; image/png .png.'), findsOneWidget);
    expect(
      find.byKey(const Key('receipt-intake-policy-label')),
      findsOneWidget,
    );
    expect(
      find.text(
        'Policy: normalized JPEG expected, raw source retention off by default, thumbnail expected.',
      ),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('receipt-intake-current-build-label')),
      findsOneWidget,
    );
    expect(
      find.text(
        'Current build: normalized JPEG bytes and thumbnail bytes were prepared in memory; server storage enforcement remains future work.',
      ),
      findsOneWidget,
    );
    expect(find.byKey(const Key('receipt-intake-cache-label')), findsOneWidget);
    expect(
      find.text(
        'Secure/encrypted local receipt artifact cache is deferred; artifacts are in memory only in this build.',
      ),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('receipt-intake-privacy-label')),
      findsOneWidget,
    );
    expect(
      find.text(
        'Receipt contents may include sensitive merchant, payment, location, or contact details.',
      ),
      findsOneWidget,
    );
    expect(
      find.text(
        'Server-mode OCR data stays provisional until the API validates and accepts it.',
      ),
      findsOneWidget,
    );
    expect(
      find.text('Native camera capture is unavailable in this build.'),
      findsOneWidget,
    );
    expect(find.text('Review'), findsOneWidget);
    expect(find.text('Merchant suggested'), findsWidgets);
    expect(find.text('2 suggested lines'), findsWidgets);
    expect(find.text('Review line totals before saving.'), findsOneWidget);
    expect(find.text('Review receipt suggestions'), findsOneWidget);
    expect(visibleText(tester).toLowerCase(), isNot(contains('candidate')));
    expect(
      find.text(
        'Edit OCR suggestions here. Nothing changes in the bill draft until you apply selected sections.',
      ),
      findsOneWidget,
    );
    expect(
      tester
          .widget<TextFormField>(
            find.byKey(const Key('personal-bill-ocr-edit-merchant')),
          )
          .controller
          ?.text,
      'Corner Market',
    );
    expect(find.text('Receipt totals for review only'), findsOneWidget);
    expect(
      find.text('Subtotal suggested: HKD 45.00 (review only)'),
      findsOneWidget,
    );
    expect(
      find.text('Discount suggested: HKD -2.00 (review only)'),
      findsOneWidget,
    );
    expect(find.text('Tax suggested: HKD 0.00 (review only)'), findsOneWidget);
    expect(
      find.text('Service charge suggested: HKD 0.00 (review only)'),
      findsOneWidget,
    );
    expect(
      find.text('Grand total suggested: HKD 43.00 (review only)'),
      findsOneWidget,
    );
    expect(
      find.text(
        'OCR item total differs from detected subtotal. Review the receipt before applying.',
      ),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('personal-bill-ocr-apply-subtotal')),
      findsNothing,
    );
    expect(find.byKey(const Key('personal-bill-ocr-apply-tax')), findsNothing);
    expect(
      find.byKey(const Key('personal-bill-ocr-apply-service')),
      findsNothing,
    );
    expect(
      find.byKey(const Key('personal-bill-ocr-apply-discount')),
      findsNothing,
    );
    expect(
      find.byKey(const Key('personal-bill-ocr-apply-total')),
      findsNothing,
    );

    await tester.enterText(
      find.byKey(const Key('personal-bill-ocr-edit-merchant')),
      'Corrected Market',
    );
    await tester.enterText(
      find.byKey(const Key('personal-bill-ocr-edit-date')),
      '2026-06-13',
    );
    await _selectCurrency(
      tester,
      find.byKey(const Key('personal-bill-ocr-edit-currency')),
      'USD',
    );
    await tester.enterText(
      find.byKey(const ValueKey('personal-bill-ocr-item-description-0')),
      'Corrected milk',
    );
    await tester.enterText(
      find.byKey(const ValueKey('personal-bill-ocr-item-quantity-0')),
      '3',
    );
    await tester.enterText(
      find.byKey(const ValueKey('personal-bill-ocr-item-unit-price-0')),
      '10.00',
    );
    await tester.enterText(
      find.byKey(const ValueKey('personal-bill-ocr-item-line-total-0')),
      '30.00',
    );
    await _selectCurrency(
      tester,
      find.byKey(const ValueKey('personal-bill-ocr-item-currency-0')),
      'USD',
    );

    await _tapReceiptOcrApply(tester, 'personal-bill');

    expect(find.text('Suggestions applied'), findsOneWidget);
    expect(
      tester
          .widget<TextFormField>(
            find.byKey(const Key('personal-bill-merchant-name')),
          )
          .controller
          ?.text,
      'Corrected Market',
    );
    expect(
      tester
          .widget<TextFormField>(
            find.byKey(const ValueKey('personal-bill-item-name-0')),
          )
          .controller
          ?.text,
      'Corrected milk',
    );
    expect(
      tester
          .widget<TextFormField>(
            find.byKey(const ValueKey('personal-bill-item-quantity-0')),
          )
          .controller
          ?.text,
      '3',
    );
    expect(
      tester
          .widget<TextFormField>(
            find.byKey(const ValueKey('personal-bill-item-amount-1')),
          )
          .controller
          ?.text,
      '18.00',
    );

    await _tapSaveBill(tester);

    expect(repository.createCalls, 1);
    expect(attachmentRepository.lastUpload?.filename, 'receipt-normalized.jpg');
    expect(attachmentRepository.lastUpload?.contentType, 'image/jpeg');
    expect(attachmentRepository.lastUpload?.bytes, isNotEmpty);
    expect(repository.lastCreateDraft?.merchantName, 'Corrected Market');
    expect(repository.lastCreateDraft?.billDate, '2026-06-13');
    expect(repository.lastCreateDraft?.currency, 'USD');
    expect(repository.lastCreateDraft?.items.map((item) => item.name), [
      'Corrected milk',
      'Bread',
    ]);
    expect(repository.lastCreateDraft?.items.map((item) => item.amount), [
      '30.00',
      '18.00',
    ]);
    expect(repository.lastCreateDraft?.adjustments, isEmpty);
    expect(receiptRepository.saveCalls, 1);
    expect(receiptRepository.lastSaveRoute?.billId, _createdBillId);
    expect(receiptRepository.lastSaveRoute?.fileId, _uploadedFileId);
    expect(receiptRepository.lastSaveRoute?.groupId, isNull);
    expect(receiptRepository.lastSaveRequest?.status, 'provisional');
    expect(receiptRepository.lastSaveRequest?.source, 'on_device');
    expect(receiptRepository.lastSaveRequest?.merchantText, 'Corrected Market');
    expect(
      receiptRepository.lastSaveRequest?.receiptIssuedAtUtc,
      DateTime.utc(2026, 6, 13),
    );
    expect(receiptRepository.lastSaveRequest?.currency, 'USD');
    expect(receiptRepository.lastSaveRequest?.subtotalAmount, '45.00');
    expect(receiptRepository.lastSaveRequest?.discountAmount, '-2.00');
    expect(receiptRepository.lastSaveRequest?.taxAmount, '0.00');
    expect(receiptRepository.lastSaveRequest?.serviceChargeAmount, '0.00');
    expect(receiptRepository.lastSaveRequest?.grandTotalAmount, '43.00');
    expect(receiptRepository.lastSaveRequest?.lines.map((line) => line.text), [
      'Corrected milk',
      'Bread',
    ]);
    expect(
      receiptRepository.lastSaveRequest?.lines.map(
        (line) => line.lineTotalAmount,
      ),
      ['30.00', '18.00'],
    );
    expect(find.text('Bill'), findsOneWidget);
    expect(
      find.byKey(const Key('bill-detail-ocr-review-handoff')),
      findsOneWidget,
    );
    expect(find.text('Receipt OCR review saved'), findsOneWidget);
    expect(
      find.text(
        'The bill was saved, the receipt was attached, and a provisional OCR review was saved. Review it before applying any bill changes.',
      ),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('bill-detail-ocr-review-open')),
      findsOneWidget,
    );
    expect(find.byKey(const Key('bill-detail-ocr-review-retry')), findsNothing);

    await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
    await tester.pumpAndSettle();

    expect(receiptRepository.getCalls, 1);
    expect(receiptRepository.lastRoute?.billId, _createdBillId);
    expect(receiptRepository.lastRoute?.fileId, _uploadedFileId);
    expect(receiptRepository.lastRoute?.groupId, isNull);
    expect(find.text('Saved OCR review'), findsOneWidget);
    expect(find.text('Reviewing saved OCR for Receipt 1.'), findsOneWidget);
    expect(
      find.byKey(const Key('saved-ocr-review-context-label')),
      findsOneWidget,
    );
    expect(find.text('Provisional review'), findsOneWidget);
    expect(find.text('Receipt totals'), findsOneWidget);
    expect(find.text('Review receipt lines'), findsOneWidget);
    expect(find.text('2 lines'), findsOneWidget);
    expect(find.text('Grand total'), findsOneWidget);
    expect(find.text('10.80 USD'), findsWidgets);
    expect(find.text('Milk'), findsWidgets);
    expect(find.textContaining('raw OCR full text'), findsNothing);
    expect(find.textContaining('signed URL'), findsNothing);
    expect(find.textContaining('storage'), findsNothing);
  });

  testWidgets(
    'personal OCR uses selected currency fallback and keeps currency editable',
    (tester) async {
      await useLargeSurface(tester);
      final repository = FakeBillRepository(
        createdDetail: sampleBillDetail(
          id: _createdBillId,
          merchantName: 'Fallback Cafe',
          billDate: '2026-06-12',
          totalAmount: '12.00',
          totalCurrency: 'USD',
        ),
      );
      final receiptOcrProvider = FakeReceiptOcrProvider(
        const ReceiptOcrResult.failed('unused'),
        resultBuilder: (request) => ReceiptOcrResult.extracted(
          ReceiptOcrPreview(
            merchant: 'Fallback Cafe',
            receiptDate: '2026-06-12',
            currency: request.fallbackCurrency,
            total: '12.00',
            items: [
              ReceiptOcrItemCandidate(
                description: 'Coffee',
                quantity: '1',
                lineTotal: '12.00',
                currency: request.fallbackCurrency,
              ),
            ],
          ),
        ),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraPersonalBillCreateScreen(
            repository: repository,
            attachmentRepository: FakeBillAttachmentRepository(),
            attachmentFileInput: FakeBillAttachmentFileInput(
              pickedFile: samplePickedAttachmentFile(
                filename: 'receipt.png',
                contentType: 'image/png',
                bytes: const [1, 2, 3],
              ),
            ),
            receiptOcrProvider: receiptOcrProvider,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await _selectCurrency(
        tester,
        find.byKey(const Key('personal-bill-currency')),
        'HKD',
      );
      await tester.ensureVisible(
        find.byKey(const Key('personal-bill-scan-receipt')),
      );
      await tester.tap(find.byKey(const Key('personal-bill-scan-receipt')));
      await tester.pumpAndSettle();

      expect(receiptOcrProvider.lastRequest?.fallbackCurrency, 'HKD');
      expect(
        tester
            .widget<CurrencySelector>(
              find.byKey(const Key('personal-bill-ocr-edit-currency')),
            )
            .value,
        'HKD',
      );

      await _selectCurrency(
        tester,
        find.byKey(const Key('personal-bill-ocr-edit-currency')),
        'USD',
      );
      await _selectCurrency(
        tester,
        find.byKey(const ValueKey('personal-bill-ocr-item-currency-0')),
        'USD',
      );
      await _setReceiptOcrSection(tester, 'personal-bill', 'items', true);
      await _tapReceiptOcrApply(tester, 'personal-bill');
      await tester.ensureVisible(find.byKey(const Key('personal-bill-save')));
      await _tapSaveBill(tester);

      expect(repository.createCalls, 1);
      expect(repository.lastCreateDraft?.currency, 'USD');
      expect(repository.lastCreateDraft?.items.single.currency, 'USD');
    },
  );

  testWidgets('personal OCR add remove and reset candidate rows', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final receiptOcrProvider = FakeReceiptOcrProvider(
      const ReceiptOcrResult.extracted(
        ReceiptOcrPreview(
          merchant: 'Original Shop',
          receiptDate: '2026-06-12',
          currency: 'HKD',
          total: '12.00',
          items: [
            ReceiptOcrItemCandidate(
              description: 'Original item',
              quantity: '1',
              lineTotal: '12.00',
              currency: 'HKD',
            ),
          ],
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraPersonalBillCreateScreen(
          repository: FakeBillRepository(),
          attachmentRepository: FakeBillAttachmentRepository(),
          attachmentFileInput: FakeBillAttachmentFileInput(
            pickedFile: samplePickedAttachmentFile(
              filename: 'receipt.png',
              contentType: 'image/png',
              bytes: const [1],
            ),
          ),
          receiptOcrProvider: receiptOcrProvider,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('personal-bill-scan-receipt')));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('personal-bill-ocr-edit-merchant')),
      'Edited Shop',
    );
    await tester.tap(find.byKey(const Key('personal-bill-ocr-add-item')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('personal-bill-ocr-item-description-1')),
      'Added item',
    );
    await tester.enterText(
      find.byKey(const ValueKey('personal-bill-ocr-item-line-total-1')),
      '3.00',
    );

    expect(find.text('2 suggested receipt lines'), findsOneWidget);

    final secondRemove = find.byKey(
      const ValueKey('personal-bill-ocr-remove-item-1'),
    );
    await tester.ensureVisible(secondRemove);
    await tester.tap(secondRemove);
    await tester.pumpAndSettle();
    final firstRemove = find.byKey(
      const ValueKey('personal-bill-ocr-remove-item-0'),
    );
    await tester.ensureVisible(firstRemove);
    await tester.tap(firstRemove);
    await tester.pumpAndSettle();

    expect(
      find.byKey(const Key('personal-bill-ocr-empty-items')),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('personal-bill-ocr-apply-items')),
      findsNothing,
    );

    await tester.tap(find.byKey(const Key('personal-bill-ocr-reset-edits')));
    await tester.pumpAndSettle();

    expect(
      tester
          .widget<TextFormField>(
            find.byKey(const Key('personal-bill-ocr-edit-merchant')),
          )
          .controller
          ?.text,
      'Original Shop',
    );
    expect(find.text('1 suggested receipt line'), findsOneWidget);
    expect(
      tester
          .widget<TextFormField>(
            find.byKey(const ValueKey('personal-bill-ocr-item-description-0')),
          )
          .controller
          ?.text,
      'Original item',
    );
  });

  testWidgets(
    'personal OCR preview clears when source receipt draft is removed',
    (tester) async {
      await useLargeSurface(tester);
      final repository = FakeBillRepository(
        createdDetail: sampleBillDetail(id: _createdBillId),
      );
      final receiptRepository = FakeReceiptOcrReviewRepository();

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraPersonalBillCreateScreen(
            repository: repository,
            attachmentRepository: FakeBillAttachmentRepository(),
            attachmentFileInput: FakeBillAttachmentFileInput(
              pickedFile: samplePickedAttachmentFile(
                filename: 'receipt.png',
                contentType: 'image/png',
                bytes: const [1, 2, 3],
              ),
            ),
            receiptOcrProvider: FakeReceiptOcrProvider(
              const ReceiptOcrResult.extracted(
                ReceiptOcrPreview(
                  merchant: 'Removed Market',
                  currency: 'HKD',
                  items: [
                    ReceiptOcrItemCandidate(
                      description: 'Removed milk',
                      lineTotal: '25.00',
                      currency: 'HKD',
                    ),
                  ],
                ),
              ),
            ),
            receiptOcrReviewRepository: receiptRepository,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('personal-bill-scan-receipt')));
      await tester.pumpAndSettle();
      expect(
        find.byKey(const Key('personal-bill-ocr-preview-panel')),
        findsOneWidget,
      );

      final removeReceipt = find.byKey(
        const ValueKey('personal-bill-attachment-remove-0'),
      );
      await tester.ensureVisible(removeReceipt);
      await tester.tap(removeReceipt);
      await tester.pumpAndSettle();
      expect(
        find.byKey(const Key('personal-bill-ocr-preview-panel')),
        findsNothing,
      );

      await tester.enterText(
        find.byKey(const Key('personal-bill-merchant-name')),
        'Manual Market',
      );
      await tester.enterText(
        find.byKey(const ValueKey('personal-bill-item-name-0')),
        'Manual item',
      );
      await tester.enterText(
        find.byKey(const ValueKey('personal-bill-item-amount-0')),
        '12.00',
      );
      await _tapSaveBill(tester);

      expect(repository.createCalls, 1);
      expect(repository.lastCreateDraft?.merchantName, 'Manual Market');
      expect(repository.lastCreateDraft?.items.single.name, 'Manual item');
      expect(receiptRepository.saveCalls, 0);
      expect(find.textContaining('Removed milk'), findsNothing);
    },
  );

  testWidgets(
    'personal OCR review save is bound to the receipt that produced preview',
    (tester) async {
      await useLargeSurface(tester);
      final repository = FakeBillRepository(
        createdDetail: sampleBillDetail(id: _createdBillId),
      );
      final attachmentRepository = FakeBillAttachmentRepository();
      final receiptRepository = FakeReceiptOcrReviewRepository();

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraPersonalBillCreateScreen(
            repository: repository,
            attachmentRepository: attachmentRepository,
            attachmentFileInput: FakeBillAttachmentFileInput(
              pickedFiles: [
                samplePickedAttachmentFile(
                  filename: 'first-receipt.png',
                  contentType: 'image/png',
                  bytes: const [1],
                ),
                samplePickedAttachmentFile(
                  filename: 'second-receipt.png',
                  contentType: 'image/png',
                  bytes: const [2],
                ),
              ],
            ),
            receiptOcrProvider: FakeReceiptOcrProvider(
              const ReceiptOcrResult.extracted(
                ReceiptOcrPreview(
                  merchant: 'Latest Market',
                  receiptDate: '2026-06-12',
                  currency: 'HKD',
                  total: '25.00',
                  items: [
                    ReceiptOcrItemCandidate(
                      description: 'Latest milk',
                      quantity: '1',
                      lineTotal: '25.00',
                      currency: 'HKD',
                    ),
                  ],
                ),
              ),
            ),
            receiptOcrReviewRepository: receiptRepository,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('personal-bill-scan-receipt')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('personal-bill-scan-receipt')));
      await tester.pumpAndSettle();
      await _tapReceiptOcrApply(tester, 'personal-bill');
      await _tapSaveBill(tester);

      expect(repository.createCalls, 1);
      expect(attachmentRepository.attachCalls, 2);
      expect(receiptRepository.saveCalls, 1);
      expect(receiptRepository.lastSaveRoute?.fileId, '$_uploadedFileId-2');
      expect(receiptRepository.lastSaveRequest?.merchantText, 'Latest Market');
      expect(
        receiptRepository.lastSaveRequest?.lines.single.text,
        'Latest milk',
      );
    },
  );

  testWidgets('personal OCR review save failure does not block bill create', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeBillRepository(
      createdDetail: sampleBillDetail(id: _createdBillId),
    );
    final attachmentRepository = FakeBillAttachmentRepository();
    final receiptRepository = FakeReceiptOcrReviewRepository(
      saveFailure: const ReceiptOcrReviewFailure(
        kind: ReceiptOcrReviewFailureKind.server,
        message: 'Receipt OCR review is unavailable right now.',
      ),
    );
    final receiptOcrProvider = FakeReceiptOcrProvider(
      const ReceiptOcrResult.extracted(
        ReceiptOcrPreview(
          merchant: 'Corner Market',
          receiptDate: '2026-06-12',
          currency: 'HKD',
          total: '25.00',
          items: [
            ReceiptOcrItemCandidate(
              description: 'Milk',
              quantity: '1',
              lineTotal: '25.00',
              currency: 'HKD',
            ),
          ],
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          syncController: sampleBillSyncController(),
          attachmentRepository: attachmentRepository,
          attachmentFileInput: FakeBillAttachmentFileInput(
            pickedFile: samplePickedAttachmentFile(
              filename: 'receipt.png',
              contentType: 'image/png',
              bytes: const [1, 2, 3],
            ),
          ),
          receiptOcrProvider: receiptOcrProvider,
          receiptOcrReviewRepository: receiptRepository,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('bill-list-scan-receipt')));
    await tester.pumpAndSettle();
    await _tapReceiptOcrApply(tester, 'personal-bill');
    await _tapSaveBill(tester);

    expect(repository.createCalls, 1);
    expect(attachmentRepository.attachCalls, 1);
    expect(receiptRepository.saveCalls, 1);
    final firstSaveRoute = receiptRepository.lastSaveRoute;
    final firstSaveRequest = receiptRepository.lastSaveRequest;
    expect(firstSaveRoute?.billId, _createdBillId);
    expect(firstSaveRoute?.fileId, _uploadedFileId);
    expect(firstSaveRoute?.groupId, isNull);
    expect(
      find.text(
        'Bill saved and receipt attached, but the provisional OCR review could not be saved. Retry from the bill detail.',
      ),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('bill-detail-ocr-review-handoff')),
      findsOneWidget,
    );
    expect(find.text('OCR review still needs saving'), findsOneWidget);
    expect(
      find.text(
        'The bill was saved and the receipt was attached, but the provisional OCR review was not saved. Retry saves the same reviewed OCR receipt lines to this receipt only.',
      ),
      findsOneWidget,
    );
    expect(find.byKey(const Key('personal-bill-save')), findsNothing);

    receiptRepository.saveFailure = null;
    await tester.tap(find.byKey(const Key('bill-detail-ocr-review-retry')));
    await tester.pumpAndSettle();

    expect(repository.createCalls, 1);
    expect(attachmentRepository.attachCalls, 1);
    expect(receiptRepository.saveCalls, 2);
    expect(receiptRepository.lastSaveRoute, same(firstSaveRoute));
    expect(receiptRepository.lastSaveRequest, same(firstSaveRequest));
    expect(find.text('Receipt OCR review saved'), findsOneWidget);
    expect(
      find.text(
        'Provisional OCR review saved. Review it before applying any bill changes.',
      ),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('bill-detail-ocr-review-open')),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
    await tester.pumpAndSettle();

    expect(receiptRepository.getCalls, 1);
    expect(receiptRepository.lastRoute, same(firstSaveRoute));
    expect(find.text('Saved OCR review'), findsOneWidget);
    expect(find.text('Reviewing saved OCR for Receipt 1.'), findsOneWidget);
  });

  testWidgets('saved OCR review action is disabled without route context', (
    tester,
  ) async {
    await useLargeSurface(tester);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ReceiptOcrReviewHandoffBanner(
            handoff: const ReceiptOcrReviewHandoff.saved(),
            retryButtonKey: const Key('missing-context-retry'),
            reviewButtonKey: const Key('missing-context-open'),
            canOpenReview: false,
            isRetrying: false,
            onRetry: () {},
            onOpenReview: () {},
          ),
        ),
      ),
    );

    expect(find.text('Receipt OCR review saved'), findsOneWidget);
    expect(find.byKey(const Key('missing-context-retry')), findsNothing);
    final openButton = tester.widget<OutlinedButton>(
      find.byKey(const Key('missing-context-open')),
    );
    expect(openButton.onPressed, isNull);
    expect(
      find.text(
        'Open review is unavailable until this receipt review context is loaded.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('personal saved OCR review edit saves corrected payload', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final route = ReceiptOcrReviewRoute(
      billId: _createdBillId,
      fileId: _uploadedFileId,
    );
    final receiptRepository = FakeReceiptOcrReviewRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillDetailScreen(
          repository: FakeBillRepository(
            detail: sampleBillDetail(id: _createdBillId),
          ),
          billId: _createdBillId,
          initialBill: sampleBillDetail(id: _createdBillId),
          receiptOcrReviewRepository: receiptRepository,
          initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
            reviewRoute: route,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
    await tester.pumpAndSettle();

    expect(
      find.text('Provisional receipt OCR data saved for this attachment.'),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('saved-ocr-review-context-label')),
      findsOneWidget,
    );
    expect(find.byKey(const Key('saved-ocr-review-edit')), findsOneWidget);
    expect(find.text('Receipt totals for review only'), findsNothing);
    expect(find.text('Grand total'), findsOneWidget);
    expect(find.textContaining('raw OCR full text'), findsNothing);
    expect(find.textContaining('signed URL'), findsNothing);
    expect(find.textContaining('storage'), findsNothing);

    await tester.tap(find.byKey(const Key('saved-ocr-review-edit')));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const Key('saved-ocr-review-edit-content')),
      findsOneWidget,
    );
    expect(find.text('Review-only totals'), findsOneWidget);
    expect(find.text('Grand total'), findsOneWidget);
    await _scrollSavedOcrReviewEditActionsIntoView(tester);
    expect(find.text('Save review'), findsOneWidget);
    expect(find.textContaining('Apply'), findsNothing);

    await tester.enterText(
      find.byKey(const Key('saved-ocr-review-ocr-edit-merchant')),
      'Edited Market',
    );
    await tester.enterText(
      find.byKey(const Key('saved-ocr-review-ocr-edit-date')),
      '2026-06-14',
    );
    await _selectCurrency(
      tester,
      find.byKey(const Key('saved-ocr-review-ocr-edit-currency')),
      'HKD',
    );
    await tester.enterText(
      find.byKey(const ValueKey('saved-ocr-review-ocr-item-description-0')),
      'Edited milk',
    );
    await tester.enterText(
      find.byKey(const ValueKey('saved-ocr-review-ocr-item-quantity-0')),
      '2',
    );
    await tester.enterText(
      find.byKey(const ValueKey('saved-ocr-review-ocr-item-unit-price-0')),
      '11.00',
    );
    await tester.enterText(
      find.byKey(const ValueKey('saved-ocr-review-ocr-item-line-total-0')),
      '22.00',
    );
    await _selectCurrency(
      tester,
      find.byKey(const ValueKey('saved-ocr-review-ocr-item-currency-0')),
      'HKD',
    );
    await tester.tap(find.byKey(const Key('saved-ocr-review-ocr-add-item')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('saved-ocr-review-ocr-item-description-1')),
      'Tea',
    );
    await tester.enterText(
      find.byKey(const ValueKey('saved-ocr-review-ocr-item-line-total-1')),
      '8.00',
    );

    await _scrollSavedOcrReviewEditActionsIntoView(tester);
    await tester.tap(find.byKey(const Key('saved-ocr-review-edit-save')));
    await tester.pumpAndSettle();

    expect(receiptRepository.saveCalls, 1);
    expect(receiptRepository.lastSaveRoute?.billId, _createdBillId);
    expect(receiptRepository.lastSaveRoute?.fileId, _uploadedFileId);
    expect(receiptRepository.lastSaveRoute?.groupId, isNull);
    expect(receiptRepository.lastSaveRequest?.status, 'provisional');
    expect(receiptRepository.lastSaveRequest?.source, 'on_device');
    expect(receiptRepository.lastSaveRequest?.merchantText, 'Edited Market');
    expect(
      receiptRepository.lastSaveRequest?.receiptIssuedAtUtc,
      DateTime.utc(2026, 6, 14),
    );
    expect(receiptRepository.lastSaveRequest?.currency, 'HKD');
    expect(receiptRepository.lastSaveRequest?.grandTotalAmount, '10.80');
    expect(receiptRepository.lastSaveRequest?.lines.map((line) => line.text), [
      'Edited milk',
      'Tea',
    ]);
    expect(
      receiptRepository.lastSaveRequest?.lines.map(
        (line) => line.lineTotalAmount,
      ),
      ['22.00', '8.00'],
    );
    expect(find.text('Edited Market'), findsOneWidget);
    expect(find.text('Edited milk'), findsOneWidget);
    expect(
      find.text(
        'Saved provisional OCR review updated. Authoritative bill money was not changed.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('saved OCR review actions expose clear accessible labels', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await useLargeSurface(tester);
    final route = ReceiptOcrReviewRoute(
      billId: _createdBillId,
      fileId: _uploadedFileId,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillDetailScreen(
          repository: FakeBillRepository(),
          billId: _createdBillId,
          initialBill: sampleBillDetail(id: _createdBillId),
          receiptOcrReviewRepository: FakeReceiptOcrReviewRepository(
            applyPreview: sampleReceiptOcrApplyPreview(route),
          ),
          initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
            reviewRoute: route,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
    await tester.pumpAndSettle();

    expect(find.byTooltip('Edit saved OCR review'), findsOneWidget);
    expect(find.byTooltip('Refresh saved OCR review'), findsOneWidget);
    expect(
      find.byTooltip(
        'Remove saved OCR review only; keeps receipt attachment and bill items',
      ),
      findsOneWidget,
    );
    expect(find.bySemanticsLabel('Edit saved OCR review'), findsOneWidget);
    expect(find.bySemanticsLabel('Refresh saved OCR review'), findsOneWidget);
    expect(
      find.bySemanticsLabel(
        'Remove saved OCR review only; receipt attachment and bill items stay available',
      ),
      findsOneWidget,
    );

    await tester.ensureVisible(
      find.byKey(const Key('saved-ocr-review-preview-apply')),
    );
    expect(
      find.byTooltip('Preview draft apply from saved OCR review'),
      findsOneWidget,
    );
    expect(find.text('Preview draft apply'), findsOneWidget);

    await tester.tap(find.byKey(const Key('saved-ocr-review-preview-apply')));
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.byKey(const Key('saved-ocr-review-apply')));
    expect(
      find.byTooltip('Apply saved OCR review to draft bill'),
      findsOneWidget,
    );
    expect(find.text('Apply to draft bill'), findsOneWidget);
    expect(find.textContaining('/var/'), findsNothing);
    expect(find.textContaining('object key'), findsNothing);
    expect(find.textContaining('signed URL'), findsNothing);
    expect(find.textContaining('raw OCR full text'), findsNothing);
    semantics.dispose();
  });

  testWidgets(
    'personal saved OCR review edit cancel leaves repository unchanged',
    (tester) async {
      await useLargeSurface(tester);
      final route = ReceiptOcrReviewRoute(
        billId: _createdBillId,
        fileId: _uploadedFileId,
      );
      final receiptRepository = FakeReceiptOcrReviewRepository();

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillDetailScreen(
            repository: FakeBillRepository(),
            billId: _createdBillId,
            initialBill: sampleBillDetail(id: _createdBillId),
            receiptOcrReviewRepository: receiptRepository,
            initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
              reviewRoute: route,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('saved-ocr-review-edit')));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('saved-ocr-review-ocr-edit-merchant')),
        'Unsaved Market',
      );
      await _scrollSavedOcrReviewEditActionsIntoView(tester);
      await tester.tap(find.byKey(const Key('saved-ocr-review-edit-cancel')));
      await tester.pumpAndSettle();

      expect(receiptRepository.saveCalls, 0);
      expect(find.text('Corner Market'), findsWidgets);
      expect(find.text('Unsaved Market'), findsNothing);
    },
  );

  testWidgets('personal saved OCR review save failure keeps local edits', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final route = ReceiptOcrReviewRoute(
      billId: _createdBillId,
      fileId: _uploadedFileId,
    );
    final receiptRepository = FakeReceiptOcrReviewRepository(
      saveFailure: const ReceiptOcrReviewFailure(
        kind: ReceiptOcrReviewFailureKind.server,
        message: 'Provider object key should stay hidden.',
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillDetailScreen(
          repository: FakeBillRepository(),
          billId: _createdBillId,
          initialBill: sampleBillDetail(id: _createdBillId),
          receiptOcrReviewRepository: receiptRepository,
          initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
            reviewRoute: route,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('saved-ocr-review-edit')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('saved-ocr-review-ocr-edit-merchant')),
      'Retry Market',
    );

    await _scrollSavedOcrReviewEditActionsIntoView(tester);
    await tester.tap(find.byKey(const Key('saved-ocr-review-edit-save')));
    await tester.pumpAndSettle();

    expect(receiptRepository.saveCalls, 1);
    expect(
      find.byKey(const Key('saved-ocr-review-edit-content')),
      findsOneWidget,
    );
    expect(
      tester
          .widget<TextFormField>(
            find.byKey(const Key('saved-ocr-review-ocr-edit-merchant')),
          )
          .controller
          ?.text,
      'Retry Market',
    );
    expect(
      find.text('Review unavailable. Keep editing and try saving again.'),
      findsOneWidget,
    );
    expect(find.textContaining('Provider object key'), findsNothing);
  });

  testWidgets('personal saved OCR review can load apply preview', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final route = ReceiptOcrReviewRoute(
      billId: _createdBillId,
      fileId: _uploadedFileId,
    );
    final receiptRepository = FakeReceiptOcrReviewRepository(
      applyPreview: sampleReceiptOcrApplyPreview(route),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillDetailScreen(
          repository: FakeBillRepository(
            detail: sampleBillDetail(id: _createdBillId),
          ),
          billId: _createdBillId,
          initialBill: sampleBillDetail(id: _createdBillId),
          receiptOcrReviewRepository: receiptRepository,
          initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
            reviewRoute: route,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
    await tester.pumpAndSettle();

    await tester.ensureVisible(
      find.byKey(const Key('saved-ocr-review-preview-apply')),
    );
    await tester.tap(find.byKey(const Key('saved-ocr-review-preview-apply')));
    await tester.pumpAndSettle();

    expect(receiptRepository.previewApplyCalls, 1);
    expect(receiptRepository.lastPreviewApplyRoute?.billId, _createdBillId);
    expect(receiptRepository.lastPreviewApplyRoute?.fileId, _uploadedFileId);
    expect(receiptRepository.lastPreviewApplyRoute?.groupId, isNull);
    expect(find.text('Apply allowed'), findsOneWidget);
    expect(find.text('Yes'), findsOneWidget);
    expect(find.text('Header summary'), findsOneWidget);
    expect(find.text('Line summary'), findsOneWidget);
    expect(find.text('Preview Milk'), findsOneWidget);
    expect(
      find.text(
        'Preview validates saved OCR review data before draft apply. It does not change this bill.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('personal saved OCR review refresh updates visible candidates', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final route = ReceiptOcrReviewRoute(
      billId: _createdBillId,
      fileId: _uploadedFileId,
    );
    final receiptRepository = FakeReceiptOcrReviewRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillDetailScreen(
          repository: FakeBillRepository(),
          billId: _createdBillId,
          initialBill: sampleBillDetail(id: _createdBillId),
          receiptOcrReviewRepository: receiptRepository,
          initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
            reviewRoute: route,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
    await tester.pumpAndSettle();

    expect(find.text('Corner Market'), findsWidgets);
    expect(find.text('Refreshed Market'), findsNothing);

    receiptRepository.reviewDetail = sampleReceiptOcrReviewDetail(
      route,
      merchantText: 'Refreshed Market',
      lineText: 'Refreshed tea',
      currency: 'HKD',
      updatedAtUtc: DateTime.utc(2026, 6, 14, 8, 45),
    );

    await tester.tap(find.byKey(const Key('saved-ocr-review-refresh')));
    await tester.pumpAndSettle();

    expect(receiptRepository.getCalls, 2);
    expect(receiptRepository.lastRoute?.billId, _createdBillId);
    expect(receiptRepository.lastRoute?.fileId, _uploadedFileId);
    expect(receiptRepository.lastRoute?.groupId, isNull);
    expect(find.text('Refreshed Market'), findsOneWidget);
    expect(find.text('Refreshed tea'), findsOneWidget);
    expect(find.text('HKD'), findsWidgets);
    expect(
      find.text('Saved OCR review refreshed. The bill was not changed.'),
      findsOneWidget,
    );
    expect(find.textContaining('raw OCR full text'), findsNothing);
    expect(find.textContaining('signed URL'), findsNothing);
    expect(find.textContaining('object key'), findsNothing);
  });

  testWidgets('personal saved OCR review refresh failure keeps recovery path', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final route = ReceiptOcrReviewRoute(
      billId: _createdBillId,
      fileId: _uploadedFileId,
    );
    final receiptRepository = FakeReceiptOcrReviewRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillDetailScreen(
          repository: FakeBillRepository(),
          billId: _createdBillId,
          initialBill: sampleBillDetail(id: _createdBillId),
          receiptOcrReviewRepository: receiptRepository,
          initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
            reviewRoute: route,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
    await tester.pumpAndSettle();

    receiptRepository.getFailure = const ReceiptOcrReviewFailure(
      kind: ReceiptOcrReviewFailureKind.server,
      message: 'Provider object key should not render.',
    );

    await tester.tap(find.byKey(const Key('saved-ocr-review-refresh')));
    await tester.pumpAndSettle();

    expect(receiptRepository.getCalls, 2);
    expect(find.byKey(const Key('saved-ocr-review-content')), findsOneWidget);
    expect(
      find.text('Provisional receipt OCR data saved for this attachment.'),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('saved-ocr-review-context-label')),
      findsOneWidget,
    );
    expect(find.text('Corner Market'), findsWidgets);
    expect(
      find.text(
        'The current saved OCR review stays open. Check your connection and refresh again before previewing or applying changes.',
      ),
      findsOneWidget,
    );
    expect(
      find.text(
        'Saved OCR review could not be refreshed. The current review stays open so you can retry.',
      ),
      findsOneWidget,
    );
    expect(find.byKey(const Key('saved-ocr-review-refresh')), findsOneWidget);
    expect(find.textContaining('Provider object key'), findsNothing);
  });

  testWidgets('saved OCR review keeps receipt context across recovery states', (
    tester,
  ) async {
    await useLargeSurface(tester);
    await tester.binding.setSurfaceSize(const Size(900, 2400));
    final attachmentRepository = FakeBillAttachmentRepository(
      attachments: [sampleAttachment(fileId: _uploadedFileId)],
    );
    final receiptRepository = FakeReceiptOcrReviewRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillDetailScreen(
          repository: FakeBillRepository(),
          billId: _billId,
          initialBill: sampleBillDetail(id: _billId),
          attachmentRepository: attachmentRepository,
          receiptOcrReviewRepository: receiptRepository,
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const Key('bill-detail-saved-ocr-discovery-open')),
      180,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.ensureVisible(
      find.byKey(const Key('bill-detail-saved-ocr-discovery-open')),
    );
    await tester.tap(
      find.byKey(const Key('bill-detail-saved-ocr-discovery-open')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Reviewing saved OCR for Receipt 1.'), findsOneWidget);
    expect(find.text('Receipt, PNG receipt image, 321 bytes'), findsOneWidget);

    receiptRepository.reviewDetail = sampleReceiptOcrReviewDetail(
      ReceiptOcrReviewRoute(billId: _billId, fileId: _uploadedFileId),
      merchantText: 'Refreshed Market',
      lineText: 'Refreshed milk',
    );
    await tester.tap(find.byKey(const Key('saved-ocr-review-refresh')));
    await tester.pumpAndSettle();
    expect(find.text('Reviewing saved OCR for Receipt 1.'), findsOneWidget);
    expect(find.text('Refreshed Market'), findsWidgets);

    receiptRepository.getFailure = const ReceiptOcrReviewFailure(
      kind: ReceiptOcrReviewFailureKind.server,
      message: 'Signed URL and session token should stay hidden.',
    );
    await tester.tap(find.byKey(const Key('saved-ocr-review-refresh')));
    await tester.pumpAndSettle();
    expect(find.text('Reviewing saved OCR for Receipt 1.'), findsOneWidget);
    expect(find.text('Receipt, PNG receipt image, 321 bytes'), findsOneWidget);
    expect(
      find.text(
        'The current saved OCR review stays open. Check your connection and refresh again before previewing or applying changes.',
      ),
      findsOneWidget,
    );
    expect(find.textContaining('Signed URL'), findsNothing);

    receiptRepository.saveFailure = const ReceiptOcrReviewFailure(
      kind: ReceiptOcrReviewFailureKind.server,
      message: 'Provider object key should stay hidden.',
    );
    await tester.tap(find.byKey(const Key('saved-ocr-review-edit')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('saved-ocr-review-ocr-edit-merchant')),
      'Retry Context Market',
    );
    await _scrollSavedOcrReviewEditActionsIntoView(tester);
    await tester.tap(find.byKey(const Key('saved-ocr-review-edit-save')));
    await tester.pumpAndSettle();
    expect(find.text('Reviewing saved OCR for Receipt 1.'), findsOneWidget);
    expect(
      tester
          .widget<TextFormField>(
            find.byKey(const Key('saved-ocr-review-ocr-edit-merchant')),
          )
          .controller
          ?.text,
      'Retry Context Market',
    );
    expect(find.textContaining('Provider object key'), findsNothing);

    await tester.tap(find.byKey(const Key('saved-ocr-review-edit-cancel')));
    await tester.pumpAndSettle();
    receiptRepository.previewApplyFailure = const ReceiptOcrReviewFailure(
      kind: ReceiptOcrReviewFailureKind.server,
      message: 'Raw OCR full text should stay hidden.',
    );
    await tester.ensureVisible(
      find.byKey(const Key('saved-ocr-review-preview-apply')),
    );
    await tester.tap(find.byKey(const Key('saved-ocr-review-preview-apply')));
    await tester.pumpAndSettle();
    expect(find.text('Reviewing saved OCR for Receipt 1.'), findsOneWidget);
    expect(
      find.text(
        'The saved OCR review is still available. Preview again, edit saved OCR, or close and keep editing the bill manually.',
      ),
      findsOneWidget,
    );
    expect(find.textContaining('Raw OCR full text'), findsNothing);

    receiptRepository.deleteFailure = const ReceiptOcrReviewFailure(
      kind: ReceiptOcrReviewFailureKind.server,
      message: 'Audit metadata should stay hidden.',
    );
    await tester.ensureVisible(
      find.byKey(const Key('saved-ocr-review-remove')),
    );
    await tester.tap(find.byKey(const Key('saved-ocr-review-remove')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('saved-ocr-review-remove-confirm')));
    await tester.pumpAndSettle();
    expect(find.text('Reviewing saved OCR for Receipt 1.'), findsOneWidget);
    expect(
      find.text(
        'The saved OCR review is still available. Check your connection and try removing it again, or keep manual bill editing.',
      ),
      findsOneWidget,
    );
    expect(find.textContaining('Audit metadata'), findsNothing);

    receiptRepository.previewApplyFailure = null;
    receiptRepository.applyFailure = const ReceiptOcrReviewFailure(
      kind: ReceiptOcrReviewFailureKind.server,
      message: 'Payment details should stay hidden.',
    );
    await tester.ensureVisible(
      find.byKey(const Key('saved-ocr-review-preview-apply')),
    );
    await tester.tap(find.byKey(const Key('saved-ocr-review-preview-apply')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('saved-ocr-review-apply')));
    await tester.tap(find.byKey(const Key('saved-ocr-review-apply')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('saved-ocr-review-apply-confirm')));
    await tester.pumpAndSettle();
    expect(find.text('Reviewing saved OCR for Receipt 1.'), findsOneWidget);
    expect(
      find.text(
        'The saved OCR review is still available. Preview again, edit saved OCR, or close and keep editing the bill manually.',
      ),
      findsOneWidget,
    );
    expect(find.textContaining('Payment details'), findsNothing);
    expect(visibleText(tester), isNot(contains(_uploadedFileId)));
  });

  testWidgets('saved OCR review refresh unavailable shows bounded empty state', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final route = ReceiptOcrReviewRoute(
      billId: _createdBillId,
      fileId: _uploadedFileId,
    );
    final receiptRepository = FakeReceiptOcrReviewRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillDetailScreen(
          repository: FakeBillRepository(),
          billId: _createdBillId,
          initialBill: sampleBillDetail(id: _createdBillId),
          receiptOcrReviewRepository: receiptRepository,
          initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
            reviewRoute: route,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
    await tester.pumpAndSettle();

    receiptRepository.getFailure = const ReceiptOcrReviewFailure(
      kind: ReceiptOcrReviewFailureKind.unavailable,
      message: 'Raw OCR payload path should not render.',
    );

    await tester.tap(find.byKey(const Key('saved-ocr-review-refresh')));
    await tester.pumpAndSettle();

    expect(receiptRepository.getCalls, 2);
    expect(find.byKey(const Key('saved-ocr-review-content')), findsNothing);
    expect(find.text('No saved OCR review available'), findsOneWidget);
    expect(
      find.text(
        'No saved provisional OCR review is available for this attachment. The bill and receipt remain available.',
      ),
      findsOneWidget,
    );
    expect(find.byKey(const Key('saved-ocr-review-retry')), findsOneWidget);
    expect(find.textContaining('Raw OCR payload'), findsNothing);
    expect(find.textContaining('path'), findsNothing);
  });

  testWidgets('closing saved OCR review during apply ignores stale callback', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final route = ReceiptOcrReviewRoute(
      billId: _createdBillId,
      fileId: _uploadedFileId,
    );
    final applyCompleter = Completer<ReceiptOcrReviewApplyResult>();
    final receiptRepository = FakeReceiptOcrReviewRepository(
      applyPreview: sampleReceiptOcrApplyPreview(route),
      applyReviewCompleter: applyCompleter,
    );
    final billRepository = FakeBillRepository(
      detail: sampleBillDetail(id: _createdBillId),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillDetailScreen(
          repository: billRepository,
          billId: _createdBillId,
          initialBill: sampleBillDetail(id: _createdBillId),
          receiptOcrReviewRepository: receiptRepository,
          initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
            reviewRoute: route,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
    await tester.pumpAndSettle();

    await tester.ensureVisible(
      find.byKey(const Key('saved-ocr-review-preview-apply')),
    );
    await tester.tap(find.byKey(const Key('saved-ocr-review-preview-apply')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('saved-ocr-review-apply')));
    await tester.tap(find.byKey(const Key('saved-ocr-review-apply')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('saved-ocr-review-apply-confirm')));
    await tester.pump();

    expect(receiptRepository.applyReviewCalls, 1);
    expect(find.text('Applying to draft bill'), findsOneWidget);

    await tester.tap(find.byKey(const Key('saved-ocr-review-close')));
    await tester.pumpAndSettle();

    applyCompleter.complete(sampleReceiptOcrApplyResult(route));
    await tester.pumpAndSettle();

    expect(billRepository.getCalls, 0);
    expect(find.text('Saved OCR review'), findsNothing);
    expect(
      find.byKey(const Key('bill-detail-ocr-review-handoff')),
      findsOneWidget,
    );
    expect(
      find.textContaining(
        'Draft bill updated from provisional OCR review data',
      ),
      findsNothing,
    );
    expect(visibleText(tester), isNot(contains(_uploadedFileId)));
    expect(visibleText(tester), isNot(contains('raw OCR full text')));
  });

  testWidgets('closing saved OCR review during remove ignores stale callback', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final route = ReceiptOcrReviewRoute(
      billId: _createdBillId,
      fileId: _uploadedFileId,
    );
    final deleteCompleter = Completer<void>();
    final receiptRepository = FakeReceiptOcrReviewRepository(
      deleteReviewCompleter: deleteCompleter,
    );
    final billRepository = FakeBillRepository(
      detail: sampleBillDetail(id: _createdBillId),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillDetailScreen(
          repository: billRepository,
          billId: _createdBillId,
          initialBill: sampleBillDetail(id: _createdBillId),
          receiptOcrReviewRepository: receiptRepository,
          initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
            reviewRoute: route,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
    await tester.pumpAndSettle();

    await tester.ensureVisible(
      find.byKey(const Key('saved-ocr-review-remove')),
    );
    await tester.tap(find.byKey(const Key('saved-ocr-review-remove')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('saved-ocr-review-remove-confirm')));
    await tester.pump();

    expect(receiptRepository.deleteCalls, 1);
    expect(
      find.text(
        'Saved review actions are disabled while the provisional OCR review is being removed.',
      ),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const Key('saved-ocr-review-close')));
    await tester.pumpAndSettle();

    deleteCompleter.complete();
    await tester.pumpAndSettle();

    expect(billRepository.getCalls, 0);
    expect(find.text('Saved OCR review'), findsNothing);
    expect(
      find.byKey(const Key('bill-detail-ocr-review-handoff')),
      findsOneWidget,
    );
    expect(
      find.text(
        'Saved OCR review removed. The receipt attachment and bill remain available.',
      ),
      findsNothing,
    );
    expect(visibleText(tester), isNot(contains(_uploadedFileId)));
    expect(visibleText(tester), isNot(contains('storage object')));
  });

  testWidgets('group saved OCR review refresh preserves group route', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final route = ReceiptOcrReviewRoute(
      billId: _billId,
      fileId: _uploadedFileId,
      groupId: _groupId,
    );
    final receiptRepository = FakeReceiptOcrReviewRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupBillDetailScreen(
          repository: FakeBillRepository(),
          groupId: _groupId,
          groupName: 'Dinner crew',
          billId: _billId,
          initialBill: sampleBillDetail(id: _billId),
          receiptOcrReviewRepository: receiptRepository,
          initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
            reviewRoute: route,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const Key('group-bill-detail-ocr-review-open')),
    );
    await tester.pumpAndSettle();

    receiptRepository.reviewDetail = sampleReceiptOcrReviewDetail(
      route,
      merchantText: 'Group refreshed market',
      lineText: 'Group refreshed rice',
    );

    await tester.tap(find.byKey(const Key('saved-ocr-review-refresh')));
    await tester.pumpAndSettle();

    expect(receiptRepository.getCalls, 2);
    expect(receiptRepository.lastRoute?.billId, _billId);
    expect(receiptRepository.lastRoute?.fileId, _uploadedFileId);
    expect(receiptRepository.lastRoute?.groupId, _groupId);
    expect(find.text('Group refreshed market'), findsOneWidget);
    expect(find.text('Group refreshed rice'), findsOneWidget);
  });

  testWidgets(
    'personal saved OCR review remove asks confirmation and uses personal route',
    (tester) async {
      await useLargeSurface(tester);
      final route = ReceiptOcrReviewRoute(
        billId: _createdBillId,
        fileId: _uploadedFileId,
      );
      final receiptRepository = FakeReceiptOcrReviewRepository();
      final billRepository = FakeBillRepository(
        detail: sampleBillDetail(id: _createdBillId),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillDetailScreen(
            repository: billRepository,
            billId: _createdBillId,
            initialBill: sampleBillDetail(id: _createdBillId),
            receiptOcrReviewRepository: receiptRepository,
            initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
              reviewRoute: route,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('saved-ocr-review-remove')), findsOneWidget);
      await tester.ensureVisible(
        find.byKey(const Key('saved-ocr-review-remove')),
      );
      await tester.tap(find.byKey(const Key('saved-ocr-review-remove')));
      await tester.pumpAndSettle();

      expect(find.text('Remove saved OCR review?'), findsOneWidget);
      expect(
        find.text(
          'This removes only the saved provisional OCR review. It does not delete the receipt attachment, bill items, settlements, payments, balances, or manual bill editing.',
        ),
        findsOneWidget,
      );
      expect(receiptRepository.deleteCalls, 0);

      await tester.tap(
        find.byKey(const Key('saved-ocr-review-remove-confirm')),
      );
      await tester.pumpAndSettle();

      expect(receiptRepository.deleteCalls, 1);
      expect(receiptRepository.lastDeleteRoute?.billId, _createdBillId);
      expect(receiptRepository.lastDeleteRoute?.fileId, _uploadedFileId);
      expect(receiptRepository.lastDeleteRoute?.groupId, isNull);
      expect(billRepository.getCalls, 1);
      expect(find.byKey(const Key('saved-ocr-review-content')), findsNothing);
      expect(
        find.byKey(const Key('bill-detail-ocr-review-handoff')),
        findsNothing,
      );
      expect(
        find.text(
          'Saved OCR review removed. The receipt attachment and bill remain available.',
        ),
        findsWidgets,
      );
      expect(find.text('Milk'), findsOneWidget);
      expect(find.textContaining('receipt attachment deleted'), findsNothing);
    },
  );

  testWidgets(
    'personal successful OCR review remove uses bounded non-sensitive copy',
    (tester) async {
      await useLargeSurface(tester);
      final route = ReceiptOcrReviewRoute(
        billId: _createdBillId,
        fileId: _uploadedFileId,
      );
      final receiptRepository = FakeReceiptOcrReviewRepository();

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillDetailScreen(
            repository: FakeBillRepository(
              detail: sampleBillDetail(id: _createdBillId),
            ),
            billId: _createdBillId,
            initialBill: sampleBillDetail(id: _createdBillId),
            receiptOcrReviewRepository: receiptRepository,
            initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
              reviewRoute: route,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
      await tester.pumpAndSettle();
      await tester.ensureVisible(
        find.byKey(const Key('saved-ocr-review-remove')),
      );
      await tester.tap(find.byKey(const Key('saved-ocr-review-remove')));
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const Key('saved-ocr-review-remove-confirm')),
      );
      await tester.pumpAndSettle();

      expect(
        find.text(
          'Saved OCR review removed. The receipt attachment and bill remain available.',
        ),
        findsWidgets,
      );
      expect(find.textContaining('/var/'), findsNothing);
      expect(find.textContaining('object key'), findsNothing);
      expect(find.textContaining('signed URL'), findsNothing);
      expect(find.textContaining('raw OCR full text'), findsNothing);
      expect(find.textContaining('card number'), findsNothing);
      expect(find.textContaining('bank account'), findsNothing);
      expect(find.textContaining('session token'), findsNothing);
      expect(find.textContaining('audit metadata'), findsNothing);
      expect(find.textContaining('unrelated user'), findsNothing);
    },
  );

  testWidgets('personal OCR review remove failure keeps review recoverable', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final route = ReceiptOcrReviewRoute(
      billId: _createdBillId,
      fileId: _uploadedFileId,
    );
    final receiptRepository = FakeReceiptOcrReviewRepository(
      deleteFailure: const ReceiptOcrReviewFailure(
        kind: ReceiptOcrReviewFailureKind.server,
        message: 'Provider object key leaked.',
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillDetailScreen(
          repository: FakeBillRepository(),
          billId: _createdBillId,
          initialBill: sampleBillDetail(id: _createdBillId),
          receiptOcrReviewRepository: receiptRepository,
          initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
            reviewRoute: route,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const Key('saved-ocr-review-remove')),
    );
    await tester.tap(find.byKey(const Key('saved-ocr-review-remove')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('saved-ocr-review-remove-confirm')));
    await tester.pumpAndSettle();

    expect(receiptRepository.deleteCalls, 1);
    expect(find.byKey(const Key('saved-ocr-review-content')), findsOneWidget);
    expect(find.text('Corner Market'), findsWidgets);
    expect(
      find.text(
        'The saved OCR review is still available. Check your connection and try removing it again, or keep manual bill editing.',
      ),
      findsOneWidget,
    );
    expect(find.textContaining('Provider object key'), findsNothing);
  });

  testWidgets('saved OCR review remove is disabled without usable route', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final receiptRepository = FakeReceiptOcrReviewRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillDetailScreen(
          repository: FakeBillRepository(),
          billId: _createdBillId,
          initialBill: sampleBillDetail(id: _createdBillId),
          receiptOcrReviewRepository: receiptRepository,
          initialReceiptOcrReviewHandoff: const ReceiptOcrReviewHandoff.saved(
            reviewRoute: ReceiptOcrReviewRoute(
              billId: _createdBillId,
              fileId: 'storage/object/key/receipt.png',
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
    await tester.pumpAndSettle();

    final removeButton = tester.widget<IconButton>(
      find.byKey(const Key('saved-ocr-review-remove')),
    );
    final refreshButton = tester.widget<IconButton>(
      find.byKey(const Key('saved-ocr-review-refresh')),
    );
    expect(removeButton.onPressed, isNull);
    expect(refreshButton.onPressed, isNull);
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('saved-ocr-review-edit')))
          .onPressed,
      isNull,
    );
    expect(
      tester
          .widget<OutlinedButton>(
            find.byKey(const Key('saved-ocr-review-preview-apply')),
          )
          .onPressed,
      isNull,
    );
    expect(receiptRepository.deleteCalls, 0);
    expect(receiptRepository.previewApplyCalls, 0);
    expect(receiptRepository.getCalls, 1);
    expect(
      find.text(
        'Saved review actions are unavailable until the bill attachment route context is loaded.',
      ),
      findsOneWidget,
    );
    expect(
      find.byTooltip(
        'Remove saved OCR review only; keeps receipt attachment and bill items',
      ),
      findsOneWidget,
    );
    expect(visibleText(tester), isNot(contains('storage/object/key')));
    expect(visibleText(tester), isNot(contains('signed URL')));
    expect(visibleText(tester), isNot(contains('raw OCR full text')));
  });

  testWidgets(
    'saved OCR review preview busy state disables duplicate lifecycle actions',
    (tester) async {
      await useLargeSurface(tester);
      final route = ReceiptOcrReviewRoute(
        billId: _createdBillId,
        fileId: _uploadedFileId,
      );
      final previewCompleter = Completer<ReceiptOcrReviewApplyPreview>();
      final receiptRepository = FakeReceiptOcrReviewRepository(
        previewApplyCompleter: previewCompleter,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillDetailScreen(
            repository: FakeBillRepository(),
            billId: _createdBillId,
            initialBill: sampleBillDetail(id: _createdBillId),
            receiptOcrReviewRepository: receiptRepository,
            initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
              reviewRoute: route,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
      await tester.pumpAndSettle();

      await tester.ensureVisible(
        find.byKey(const Key('saved-ocr-review-preview-apply')),
      );
      await tester.tap(find.byKey(const Key('saved-ocr-review-preview-apply')));
      await tester.pump();

      expect(receiptRepository.previewApplyCalls, 1);
      expect(find.text('Loading apply preview'), findsOneWidget);
      expect(
        find.text(
          'Saved review actions are disabled while the draft apply preview is loading.',
        ),
        findsOneWidget,
      );
      expect(
        tester
            .widget<FilledButton>(
              find.byKey(const Key('saved-ocr-review-edit')),
            )
            .onPressed,
        isNull,
      );
      expect(
        tester
            .widget<IconButton>(
              find.byKey(const Key('saved-ocr-review-refresh')),
            )
            .onPressed,
        isNull,
      );
      expect(
        tester
            .widget<IconButton>(
              find.byKey(const Key('saved-ocr-review-remove')),
            )
            .onPressed,
        isNull,
      );
      expect(
        tester
            .widget<OutlinedButton>(
              find.byKey(const Key('saved-ocr-review-preview-apply')),
            )
            .onPressed,
        isNull,
      );

      await tester.tap(find.byKey(const Key('saved-ocr-review-preview-apply')));
      await tester.pump();
      expect(receiptRepository.previewApplyCalls, 1);

      previewCompleter.complete(sampleReceiptOcrApplyPreview(route));
      await tester.pumpAndSettle();

      expect(receiptRepository.previewApplyCalls, 1);
      expect(find.text('Apply allowed'), findsOneWidget);
    },
  );

  testWidgets('saved OCR review refresh ignores duplicate taps while busy', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final route = ReceiptOcrReviewRoute(
      billId: _createdBillId,
      fileId: _uploadedFileId,
    );
    final refreshCompleter = Completer<ReceiptOcrReviewDetail>();
    final receiptRepository = FakeReceiptOcrReviewRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillDetailScreen(
          repository: FakeBillRepository(),
          billId: _createdBillId,
          initialBill: sampleBillDetail(id: _createdBillId),
          receiptOcrReviewRepository: receiptRepository,
          initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
            reviewRoute: route,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
    await tester.pumpAndSettle();

    receiptRepository.getReviewCompleter = refreshCompleter;
    await tester.tap(find.byKey(const Key('saved-ocr-review-refresh')));
    await tester.pump();

    expect(receiptRepository.getCalls, 2);
    expect(
      find.text(
        'Saved review actions are disabled while the provisional OCR review is refreshing.',
      ),
      findsOneWidget,
    );
    expect(
      tester
          .widget<IconButton>(find.byKey(const Key('saved-ocr-review-refresh')))
          .onPressed,
      isNull,
    );

    await tester.tap(find.byKey(const Key('saved-ocr-review-refresh')));
    await tester.pump();
    expect(receiptRepository.getCalls, 2);

    refreshCompleter.complete(sampleReceiptOcrReviewDetail(route));
    await tester.pumpAndSettle();

    expect(receiptRepository.getCalls, 2);
    expect(
      find.text('Saved OCR review refreshed. The bill was not changed.'),
      findsOneWidget,
    );
  });

  testWidgets('saved OCR review remove ignores duplicate taps while busy', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final route = ReceiptOcrReviewRoute(
      billId: _createdBillId,
      fileId: _uploadedFileId,
    );
    final removeCompleter = Completer<void>();
    final receiptRepository = FakeReceiptOcrReviewRepository(
      deleteReviewCompleter: removeCompleter,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillDetailScreen(
          repository: FakeBillRepository(),
          billId: _createdBillId,
          initialBill: sampleBillDetail(id: _createdBillId),
          receiptOcrReviewRepository: receiptRepository,
          initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
            reviewRoute: route,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const Key('saved-ocr-review-remove')),
    );
    await tester.tap(find.byKey(const Key('saved-ocr-review-remove')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('saved-ocr-review-remove-confirm')));
    await tester.pump();

    expect(receiptRepository.deleteCalls, 1);
    expect(
      find.text(
        'Saved review actions are disabled while the provisional OCR review is being removed.',
      ),
      findsOneWidget,
    );
    expect(
      tester
          .widget<IconButton>(find.byKey(const Key('saved-ocr-review-remove')))
          .onPressed,
      isNull,
    );

    await tester.tap(find.byKey(const Key('saved-ocr-review-remove')));
    await tester.pump();
    expect(receiptRepository.deleteCalls, 1);

    removeCompleter.complete();
    await tester.pumpAndSettle();

    expect(receiptRepository.deleteCalls, 1);
    expect(
      find.text(
        'Saved OCR review removed. The receipt attachment and bill remain available.',
      ),
      findsWidgets,
    );
  });

  testWidgets('saved OCR review apply ignores duplicate taps while busy', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final route = ReceiptOcrReviewRoute(
      billId: _createdBillId,
      fileId: _uploadedFileId,
    );
    final applyCompleter = Completer<ReceiptOcrReviewApplyResult>();
    final receiptRepository = FakeReceiptOcrReviewRepository(
      applyPreview: sampleReceiptOcrApplyPreview(route),
      applyReviewCompleter: applyCompleter,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillDetailScreen(
          repository: FakeBillRepository(),
          billId: _createdBillId,
          initialBill: sampleBillDetail(id: _createdBillId),
          receiptOcrReviewRepository: receiptRepository,
          initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
            reviewRoute: route,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const Key('saved-ocr-review-preview-apply')),
    );
    await tester.tap(find.byKey(const Key('saved-ocr-review-preview-apply')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('saved-ocr-review-apply')));
    await tester.tap(find.byKey(const Key('saved-ocr-review-apply')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('saved-ocr-review-apply-confirm')));
    await tester.pump();

    expect(receiptRepository.applyReviewCalls, 1);
    expect(
      find.text(
        'Saved review actions are disabled while the server applies receipt lines to the draft bill.',
      ),
      findsOneWidget,
    );
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('saved-ocr-review-apply')))
          .onPressed,
      isNull,
    );

    await tester.tap(find.byKey(const Key('saved-ocr-review-apply')));
    await tester.pump();
    expect(receiptRepository.applyReviewCalls, 1);

    applyCompleter.complete(sampleReceiptOcrApplyResult(route));
    await tester.pumpAndSettle();

    expect(receiptRepository.applyReviewCalls, 1);
    expect(
      find.text('Draft bill updated from provisional OCR review data.'),
      findsOneWidget,
    );
  });

  testWidgets(
    'personal blocked saved OCR review preview shows reasons and no apply',
    (tester) async {
      await useLargeSurface(tester);
      final route = ReceiptOcrReviewRoute(
        billId: _createdBillId,
        fileId: _uploadedFileId,
      );
      final receiptRepository = FakeReceiptOcrReviewRepository(
        applyPreview: sampleReceiptOcrApplyPreview(
          route,
          canApply: false,
          blockedReasons: const [
            ReceiptOcrReviewApplyPreviewIssueCodeValues.lineSumMismatch,
          ],
          warnings: const [
            ReceiptOcrReviewApplyPreviewIssueCodeValues.headerTotalMismatch,
          ],
        ),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillDetailScreen(
            repository: FakeBillRepository(),
            billId: _createdBillId,
            initialBill: sampleBillDetail(id: _createdBillId),
            receiptOcrReviewRepository: receiptRepository,
            initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
              reviewRoute: route,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
      await tester.pumpAndSettle();
      await tester.ensureVisible(
        find.byKey(const Key('saved-ocr-review-preview-apply')),
      );
      await tester.tap(find.byKey(const Key('saved-ocr-review-preview-apply')));
      await tester.pumpAndSettle();

      expect(find.text('Apply allowed'), findsOneWidget);
      expect(find.text('No'), findsOneWidget);
      expect(find.text('Line Sum Mismatch'), findsOneWidget);
      expect(find.text('Header Total Mismatch'), findsOneWidget);
      expect(find.byKey(const Key('saved-ocr-review-apply')), findsNothing);
      expect(receiptRepository.applyReviewCalls, 0);
    },
  );

  testWidgets('personal allowed saved OCR review requires confirmation', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final route = ReceiptOcrReviewRoute(
      billId: _createdBillId,
      fileId: _uploadedFileId,
    );
    final receiptRepository = FakeReceiptOcrReviewRepository(
      applyPreview: sampleReceiptOcrApplyPreview(route),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillDetailScreen(
          repository: FakeBillRepository(),
          billId: _createdBillId,
          initialBill: sampleBillDetail(id: _createdBillId),
          receiptOcrReviewRepository: receiptRepository,
          initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
            reviewRoute: route,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const Key('saved-ocr-review-preview-apply')),
    );
    await tester.tap(find.byKey(const Key('saved-ocr-review-preview-apply')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('saved-ocr-review-apply')));
    await tester.tap(find.byKey(const Key('saved-ocr-review-apply')));
    await tester.pumpAndSettle();

    expect(find.text('Apply OCR to draft bill?'), findsOneWidget);
    expect(receiptRepository.applyReviewCalls, 0);

    await tester.tap(find.byKey(const Key('saved-ocr-review-apply-cancel')));
    await tester.pumpAndSettle();

    expect(receiptRepository.applyReviewCalls, 0);
  });

  testWidgets(
    'personal saved OCR review apply success is bounded and refreshes detail',
    (tester) async {
      await useLargeSurface(tester);
      final route = ReceiptOcrReviewRoute(
        billId: _createdBillId,
        fileId: _uploadedFileId,
      );
      final billRepository = FakeBillRepository(
        details: [
          sampleBillDetail(
            id: _createdBillId,
            items: const [
              SettleoraBillItem(
                id: 'item-applied',
                name: 'Preview Milk',
                note: null,
                amount: '10.00',
                currency: 'USD',
                sortOrder: 0,
              ),
            ],
          ),
        ],
      );
      final receiptRepository = FakeReceiptOcrReviewRepository(
        applyPreview: sampleReceiptOcrApplyPreview(route),
        applyResult: sampleReceiptOcrApplyResult(route),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillDetailScreen(
            repository: billRepository,
            billId: _createdBillId,
            initialBill: sampleBillDetail(id: _createdBillId),
            receiptOcrReviewRepository: receiptRepository,
            initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
              reviewRoute: route,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
      await tester.pumpAndSettle();
      await tester.ensureVisible(
        find.byKey(const Key('saved-ocr-review-preview-apply')),
      );
      await tester.tap(find.byKey(const Key('saved-ocr-review-preview-apply')));
      await tester.pumpAndSettle();
      await tester.ensureVisible(
        find.byKey(const Key('saved-ocr-review-apply')),
      );
      await tester.tap(find.byKey(const Key('saved-ocr-review-apply')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('saved-ocr-review-apply-confirm')));
      await tester.pumpAndSettle();

      expect(receiptRepository.applyReviewCalls, 1);
      expect(receiptRepository.lastApplyReviewRoute?.billId, _createdBillId);
      expect(
        receiptRepository.lastExpectedReviewUpdatedAtUtc,
        sampleReceiptOcrApplyPreview(route).updatedAtUtc,
      );
      expect(billRepository.getCalls, 1);
      expect(
        find.text('Draft bill updated from provisional OCR review data.'),
        findsOneWidget,
      );
      expect(
        find.text(
          '1 item applied from this saved OCR review using replace draft OCR items. The bill is still a draft; close this sheet to review the draft bill items.',
        ),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('saved-ocr-review-review-draft-items')),
        findsOneWidget,
      );
      await tester.tap(
        find.byKey(const Key('saved-ocr-review-review-draft-items')),
      );
      await tester.pumpAndSettle();

      expect(find.text('Preview Milk'), findsOneWidget);
      expect(find.textContaining('raw OCR full text'), findsNothing);
      expect(find.textContaining('object key'), findsNothing);
      expect(find.textContaining('signed URL'), findsNothing);
      expect(find.textContaining('card number'), findsNothing);
      expect(find.textContaining('bank account'), findsNothing);
    },
  );

  testWidgets(
    'personal saved OCR apply refresh failure does not repeat apply mutation',
    (tester) async {
      await useLargeSurface(tester);
      final route = ReceiptOcrReviewRoute(
        billId: _createdBillId,
        fileId: _uploadedFileId,
      );
      final billRepository = FakeBillRepository(
        detailFailuresByCall: const {
          1: SettleoraBillFailure(
            kind: SettleoraBillFailureKind.network,
            message: 'The server is unavailable. Try again when online.',
          ),
        },
      );
      final receiptRepository = FakeReceiptOcrReviewRepository(
        applyPreview: sampleReceiptOcrApplyPreview(route),
        applyResult: sampleReceiptOcrApplyResult(route),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillDetailScreen(
            repository: billRepository,
            billId: _createdBillId,
            initialBill: sampleBillDetail(id: _createdBillId),
            receiptOcrReviewRepository: receiptRepository,
            initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
              reviewRoute: route,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
      await tester.pumpAndSettle();
      await tester.ensureVisible(
        find.byKey(const Key('saved-ocr-review-preview-apply')),
      );
      await tester.tap(find.byKey(const Key('saved-ocr-review-preview-apply')));
      await tester.pumpAndSettle();
      await tester.ensureVisible(
        find.byKey(const Key('saved-ocr-review-apply')),
      );
      await tester.tap(find.byKey(const Key('saved-ocr-review-apply')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('saved-ocr-review-apply-confirm')));
      await tester.pumpAndSettle();

      expect(receiptRepository.applyReviewCalls, 1);
      expect(billRepository.getCalls, 1);
      expect(
        find.text('Draft bill updated from provisional OCR review data.'),
        findsOneWidget,
      );
      expect(find.text('Bill refresh needed'), findsOneWidget);
      expect(
        find.text(
          'The draft apply completed, but the bill refresh did not finish. Refresh bill state or close and reopen the bill; do not apply this saved OCR review again just to reload.',
        ),
        findsOneWidget,
      );
      expect(
        find.text(
          'Draft OCR apply completed, but bill refresh failed. Refresh bill state; do not apply again just to reload.',
        ),
        findsOneWidget,
      );

      await tester.tap(
        find.byKey(const Key('saved-ocr-review-apply')),
        warnIfMissed: false,
      );
      await tester.pumpAndSettle();

      expect(receiptRepository.applyReviewCalls, 1);
      expect(billRepository.getCalls, 1);
    },
  );

  testWidgets('personal saved OCR review apply failure keeps review visible', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final route = ReceiptOcrReviewRoute(
      billId: _createdBillId,
      fileId: _uploadedFileId,
    );
    final receiptRepository = FakeReceiptOcrReviewRepository(
      applyPreview: sampleReceiptOcrApplyPreview(route),
      applyFailure: const ReceiptOcrReviewFailure(
        kind: ReceiptOcrReviewFailureKind.server,
        message: 'Hidden storage path failed.',
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillDetailScreen(
          repository: FakeBillRepository(),
          billId: _createdBillId,
          initialBill: sampleBillDetail(id: _createdBillId),
          receiptOcrReviewRepository: receiptRepository,
          initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
            reviewRoute: route,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const Key('saved-ocr-review-preview-apply')),
    );
    await tester.tap(find.byKey(const Key('saved-ocr-review-preview-apply')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('saved-ocr-review-apply')));
    await tester.tap(find.byKey(const Key('saved-ocr-review-apply')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('saved-ocr-review-apply-confirm')));
    await tester.pumpAndSettle();

    expect(receiptRepository.applyReviewCalls, 1);
    expect(find.byKey(const Key('saved-ocr-review-content')), findsOneWidget);
    expect(
      find.text(
        'The saved OCR review is still available. Preview again, edit saved OCR, or close and keep editing the bill manually.',
      ),
      findsOneWidget,
    );
    expect(find.textContaining('Hidden storage path'), findsNothing);
  });

  testWidgets('personal stale saved OCR apply failure gives retry guidance', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final route = ReceiptOcrReviewRoute(
      billId: _createdBillId,
      fileId: _uploadedFileId,
    );
    final receiptRepository = FakeReceiptOcrReviewRepository(
      applyPreview: sampleReceiptOcrApplyPreview(route),
      applyFailure: const ReceiptOcrReviewFailure(
        kind: ReceiptOcrReviewFailureKind.conflict,
        message: 'Review timestamp conflict.',
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillDetailScreen(
          repository: FakeBillRepository(),
          billId: _createdBillId,
          initialBill: sampleBillDetail(id: _createdBillId),
          receiptOcrReviewRepository: receiptRepository,
          initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
            reviewRoute: route,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const Key('saved-ocr-review-preview-apply')),
    );
    await tester.tap(find.byKey(const Key('saved-ocr-review-preview-apply')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('saved-ocr-review-apply')));
    await tester.tap(find.byKey(const Key('saved-ocr-review-apply')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('saved-ocr-review-apply-confirm')));
    await tester.pumpAndSettle();

    expect(receiptRepository.applyReviewCalls, 1);
    expect(find.text('Refresh required'), findsWidgets);
    expect(
      find.text(
        'The saved review may have changed. Preview again before retrying apply, or edit the saved OCR review.',
      ),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('saved-ocr-review-preview-apply')),
      findsOneWidget,
    );
    expect(find.byKey(const Key('saved-ocr-review-edit')), findsOneWidget);
  });

  testWidgets('personal apply blocked response keeps recovery affordance', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final route = ReceiptOcrReviewRoute(
      billId: _createdBillId,
      fileId: _uploadedFileId,
    );
    final receiptRepository = FakeReceiptOcrReviewRepository(
      applyPreview: sampleReceiptOcrApplyPreview(route),
      applyResult: ReceiptOcrReviewApplyResult(
        reviewId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        billId: route.billId,
        groupId: route.groupId,
        fileId: route.fileId,
        applyMode: 'replace_draft_ocr_items',
        appliedItemCount: 0,
        currency: 'USD',
        subtotalAmount: null,
        grandTotalAmount: null,
        summary: sampleReceiptOcrApplyPreview(route).summary,
        blockedReasons: const [
          ReceiptOcrReviewApplyPreviewIssueCodeValues.unsupportedLineState,
        ],
        warnings: const [
          ReceiptOcrReviewApplyPreviewIssueCodeValues.headerTotalMismatch,
        ],
        appliedAtUtc: _updatedAtUtc,
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillDetailScreen(
          repository: FakeBillRepository(),
          billId: _createdBillId,
          initialBill: sampleBillDetail(id: _createdBillId),
          receiptOcrReviewRepository: receiptRepository,
          initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
            reviewRoute: route,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const Key('saved-ocr-review-preview-apply')),
    );
    await tester.tap(find.byKey(const Key('saved-ocr-review-preview-apply')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('saved-ocr-review-apply')));
    await tester.tap(find.byKey(const Key('saved-ocr-review-apply')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('saved-ocr-review-apply-confirm')));
    await tester.pumpAndSettle();

    expect(receiptRepository.applyReviewCalls, 1);
    expect(find.text('Apply needs review'), findsOneWidget);
    expect(find.text('Unsupported Line State'), findsOneWidget);
    expect(find.text('Header Total Mismatch'), findsWidgets);
    expect(
      find.byKey(const Key('saved-ocr-review-preview-apply')),
      findsOneWidget,
    );
    expect(find.byKey(const Key('saved-ocr-review-edit')), findsOneWidget);
    expect(
      find.byKey(const Key('saved-ocr-review-review-draft-items')),
      findsNothing,
    );
  });

  testWidgets('group saved OCR review preview and apply preserve group route', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final route = ReceiptOcrReviewRoute(
      billId: _billId,
      fileId: _uploadedFileId,
      groupId: _groupId,
    );
    final receiptRepository = FakeReceiptOcrReviewRepository(
      applyPreview: sampleReceiptOcrApplyPreview(route),
      applyResult: sampleReceiptOcrApplyResult(route),
    );
    final billRepository = FakeBillRepository(
      details: [
        sampleBillDetail(id: _billId),
        sampleBillDetail(
          id: _billId,
          items: const [
            SettleoraBillItem(
              id: 'group-applied-item',
              name: 'Preview Milk',
              note: null,
              amount: '10.00',
              currency: 'USD',
              sortOrder: 0,
            ),
          ],
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupBillDetailScreen(
          repository: billRepository,
          groupId: _groupId,
          groupName: 'Dinner crew',
          billId: _billId,
          initialBill: sampleBillDetail(id: _billId),
          receiptOcrReviewRepository: receiptRepository,
          initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
            reviewRoute: route,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const Key('group-bill-detail-ocr-review-open')),
    );
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const Key('saved-ocr-review-preview-apply')),
    );
    await tester.tap(find.byKey(const Key('saved-ocr-review-preview-apply')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('saved-ocr-review-apply')));
    await tester.tap(find.byKey(const Key('saved-ocr-review-apply')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('saved-ocr-review-apply-confirm')));
    await tester.pumpAndSettle();

    expect(receiptRepository.previewApplyCalls, 1);
    expect(receiptRepository.lastPreviewApplyRoute?.groupId, _groupId);
    expect(receiptRepository.applyReviewCalls, 1);
    expect(receiptRepository.lastApplyReviewRoute?.groupId, _groupId);
    expect(receiptRepository.lastExpectedReviewUpdatedAtUtc, _updatedAtUtc);
    expect(billRepository.getGroupCalls, 1);
    expect(
      find.text('Draft bill updated from provisional OCR review data.'),
      findsOneWidget,
    );
  });

  testWidgets(
    'group saved OCR review remove uses group route and preserves bill state',
    (tester) async {
      await useLargeSurface(tester);
      final route = ReceiptOcrReviewRoute(
        billId: _billId,
        fileId: _uploadedFileId,
        groupId: _groupId,
      );
      final receiptRepository = FakeReceiptOcrReviewRepository();
      final initialBill = sampleBillDetail(
        id: _billId,
        items: const [
          SettleoraBillItem(
            id: 'group-manual-item',
            name: 'Manual noodles',
            note: null,
            amount: '12.00',
            currency: 'USD',
            sortOrder: 0,
          ),
        ],
        participants: const [
          SettleoraBillParticipant(
            userProfileId: _userProfileId,
            status: 'pending_acceptance',
            resolvedShareAmount: '12.80',
            resolvedShareCurrency: 'USD',
          ),
        ],
        payers: const [
          SettleoraBillPayer(
            userProfileId: _userProfileId,
            amount: '12.80',
            currency: 'USD',
          ),
        ],
      );
      final billRepository = FakeBillRepository(detail: initialBill);

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraGroupBillDetailScreen(
            repository: billRepository,
            groupId: _groupId,
            groupName: 'Dinner crew',
            billId: _billId,
            currentUserProfileId: _userProfileId,
            initialBill: initialBill,
            receiptOcrReviewRepository: receiptRepository,
            initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
              reviewRoute: route,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const Key('group-bill-detail-ocr-review-open')),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(
        find.byKey(const Key('saved-ocr-review-remove')),
      );
      await tester.tap(find.byKey(const Key('saved-ocr-review-remove')));
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const Key('saved-ocr-review-remove-confirm')),
      );
      await tester.pumpAndSettle();

      expect(receiptRepository.deleteCalls, 1);
      expect(receiptRepository.lastDeleteRoute?.billId, _billId);
      expect(receiptRepository.lastDeleteRoute?.fileId, _uploadedFileId);
      expect(receiptRepository.lastDeleteRoute?.groupId, _groupId);
      expect(billRepository.getGroupCalls, 1);
      expect(
        find.byKey(const Key('group-bill-detail-ocr-review-handoff')),
        findsNothing,
      );
      expect(
        find.text(
          'Saved OCR review removed. The receipt attachment and bill remain available.',
        ),
        findsWidgets,
      );
      expect(find.text('Dinner crew'), findsOneWidget);
      expect(find.text('Manual noodles'), findsWidgets);
      expect(find.text('12.80 USD'), findsWidgets);
      expect(find.textContaining('receipt attachment deleted'), findsNothing);
    },
  );

  testWidgets('group saved OCR review edit preserves group route', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final route = ReceiptOcrReviewRoute(
      billId: _billId,
      fileId: _uploadedFileId,
      groupId: _groupId,
    );
    final receiptRepository = FakeReceiptOcrReviewRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupBillDetailScreen(
          repository: FakeBillRepository(),
          groupId: _groupId,
          groupName: 'Dinner crew',
          billId: _billId,
          initialBill: sampleBillDetail(id: _billId),
          receiptOcrReviewRepository: receiptRepository,
          initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
            reviewRoute: route,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(
      find.byKey(const Key('group-bill-detail-ocr-review-open')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('saved-ocr-review-edit')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('saved-ocr-review-ocr-edit-merchant')),
      'Group Market',
    );
    await _scrollSavedOcrReviewEditActionsIntoView(tester);
    await tester.tap(find.byKey(const Key('saved-ocr-review-edit-save')));
    await tester.pumpAndSettle();

    expect(receiptRepository.saveCalls, 1);
    expect(receiptRepository.lastSaveRoute?.billId, _billId);
    expect(receiptRepository.lastSaveRoute?.fileId, _uploadedFileId);
    expect(receiptRepository.lastSaveRoute?.groupId, _groupId);
    expect(receiptRepository.lastSaveRequest?.merchantText, 'Group Market');
    expect(find.text('Group Market'), findsOneWidget);
  });

  testWidgets('personal OCR review save skips empty OCR candidates', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeBillRepository(
      createdDetail: sampleBillDetail(id: _createdBillId),
    );
    final receiptRepository = FakeReceiptOcrReviewRepository();
    final receiptOcrProvider = FakeReceiptOcrProvider(
      const ReceiptOcrResult.extracted(
        ReceiptOcrPreview(total: '12.00', rawTextLineCount: 2),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraPersonalBillCreateScreen(
          repository: repository,
          attachmentRepository: FakeBillAttachmentRepository(),
          attachmentFileInput: FakeBillAttachmentFileInput(
            pickedFile: samplePickedAttachmentFile(
              filename: 'receipt.png',
              contentType: 'image/png',
              bytes: const [1, 2, 3],
            ),
          ),
          receiptOcrProvider: receiptOcrProvider,
          receiptOcrReviewRepository: receiptRepository,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('personal-bill-scan-receipt')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('personal-bill-merchant-name')),
      'Manual Market',
    );
    await tester.enterText(
      find.byKey(const ValueKey('personal-bill-item-name-0')),
      'Manual item',
    );
    await tester.enterText(
      find.byKey(const ValueKey('personal-bill-item-amount-0')),
      '12.00',
    );
    await _tapSaveBill(tester);

    expect(repository.createCalls, 1);
    expect(receiptRepository.saveCalls, 0);
    expect(
      find.text('Bill saved with receipt OCR review ready for later review.'),
      findsNothing,
    );
  });

  testWidgets('personal OCR duplicate save confirmation can save anyway', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeBillRepository(
      bills: [
        sampleBillSummary(
          id: 'existing-bill-id',
          merchantName: 'Corner Market',
          billDate: '2026-06-12',
          totalAmount: '43.0',
          totalCurrency: 'HKD',
        ),
      ],
      createdDetail: sampleBillDetail(
        id: _createdBillId,
        merchantName: 'Corner Market',
        billDate: '2026-06-12',
        totalAmount: '43.00',
        totalCurrency: 'HKD',
      ),
    );
    final receiptOcrProvider = FakeReceiptOcrProvider(
      const ReceiptOcrResult.extracted(
        ReceiptOcrPreview(
          merchant: 'Corner Market Ltd.',
          receiptDate: '2026-06-12',
          currency: 'HKD',
          total: '43.00',
          items: [
            ReceiptOcrItemCandidate(
              description: 'Milk',
              quantity: '1',
              lineTotal: '43.00',
              currency: 'HKD',
            ),
          ],
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          syncController: sampleBillSyncController(),
          attachmentRepository: FakeBillAttachmentRepository(),
          attachmentFileInput: FakeBillAttachmentFileInput(
            pickedFile: samplePickedAttachmentFile(
              filename: 'receipt.png',
              contentType: 'image/png',
              bytes: const [1, 2, 3],
            ),
          ),
          receiptOcrProvider: receiptOcrProvider,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('bill-list-scan-receipt')));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const Key('receipt-ocr-duplicate-warning')),
      findsOneWidget,
    );
    expect(find.text('Possible duplicate receipt'), findsOneWidget);
    expect(
      find.text(
        'This looks similar to an existing bill. Review before saving.',
      ),
      findsOneWidget,
    );
    expect(
      find.text('Matched merchant, date, total, and currency.'),
      findsOneWidget,
    );

    await _tapReceiptOcrApply(tester, 'personal-bill');
    await _tapSaveBill(tester);

    expect(
      find.byKey(const Key('receipt-ocr-duplicate-save-dialog')),
      findsOneWidget,
    );
    expect(find.text('Possible duplicate receipt'), findsWidgets);
    expect(
      find.byKey(const Key('receipt-ocr-duplicate-save-match-title')),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('receipt-ocr-duplicate-save-match-meta')),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('receipt-ocr-duplicate-save-reason')),
      findsOneWidget,
    );
    expect(repository.createCalls, 0);

    await tester.tap(
      find.byKey(const Key('receipt-ocr-duplicate-save-anyway')),
    );
    await tester.pumpAndSettle();

    expect(repository.createCalls, 1);
    expect(repository.lastCreateDraft?.merchantName, 'Corner Market Ltd.');
    expect(repository.lastCreateDraft?.currency, 'HKD');
    expect(repository.lastCreateDraft?.items.single.amount, '43.00');
  });

  testWidgets(
    'personal OCR duplicate warning uses corrected merchant date currency',
    (tester) async {
      await useLargeSurface(tester);
      final repository = FakeBillRepository(
        bills: [
          sampleBillSummary(
            id: 'existing-bill-id',
            merchantName: 'Corrected Market Ltd.',
            billDate: '2026-06-13',
            totalAmount: '43.0',
            totalCurrency: 'USD',
          ),
        ],
      );
      final receiptOcrProvider = FakeReceiptOcrProvider(
        const ReceiptOcrResult.extracted(
          ReceiptOcrPreview(
            merchant: 'Unmatched Store',
            receiptDate: '2026-06-12',
            currency: 'HKD',
            total: '43.00',
            items: [
              ReceiptOcrItemCandidate(
                description: 'Milk',
                quantity: '1',
                lineTotal: '43.00',
                currency: 'USD',
              ),
            ],
          ),
        ),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraPersonalBillCreateScreen(
            repository: repository,
            attachmentRepository: FakeBillAttachmentRepository(),
            attachmentFileInput: FakeBillAttachmentFileInput(
              pickedFile: samplePickedAttachmentFile(
                filename: 'receipt.png',
                contentType: 'image/png',
                bytes: const [1],
              ),
            ),
            receiptOcrProvider: receiptOcrProvider,
            duplicateWarningCandidates: repository.bills
                .map(BillDuplicateWarningCandidate.fromSummary)
                .toList(growable: false),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('personal-bill-scan-receipt')));
      await tester.pumpAndSettle();
      expect(
        find.byKey(const Key('receipt-ocr-duplicate-warning')),
        findsNothing,
      );

      await tester.enterText(
        find.byKey(const Key('personal-bill-ocr-edit-merchant')),
        'Corrected Market Ltd.',
      );
      await tester.enterText(
        find.byKey(const Key('personal-bill-ocr-edit-date')),
        '2026-06-13',
      );
      await _selectCurrency(
        tester,
        find.byKey(const Key('personal-bill-ocr-edit-currency')),
        'USD',
      );
      await tester.pumpAndSettle();

      expect(
        find.byKey(const Key('receipt-ocr-duplicate-warning')),
        findsOneWidget,
      );

      await _tapReceiptOcrApply(tester, 'personal-bill');
      await _tapSaveBill(tester);

      expect(
        find.byKey(const Key('receipt-ocr-duplicate-save-dialog')),
        findsOneWidget,
      );
      await tester.tap(
        find.byKey(const Key('receipt-ocr-duplicate-save-anyway')),
      );
      await tester.pumpAndSettle();

      expect(repository.createCalls, 1);
      expect(repository.lastCreateDraft?.merchantName, 'Corrected Market Ltd.');
      expect(repository.lastCreateDraft?.billDate, '2026-06-13');
      expect(repository.lastCreateDraft?.currency, 'USD');
    },
  );

  testWidgets('personal OCR duplicate save confirmation cancel keeps draft', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeBillRepository(
      bills: [
        sampleBillSummary(
          id: 'existing-bill-id',
          merchantName: 'Corner Market',
          billDate: '2026-06-12',
          totalAmount: '43.0',
          totalCurrency: 'HKD',
        ),
      ],
    );
    final receiptOcrProvider = FakeReceiptOcrProvider(
      const ReceiptOcrResult.extracted(
        ReceiptOcrPreview(
          merchant: 'Corner Market Ltd.',
          receiptDate: '2026-06-12',
          currency: 'HKD',
          total: '43.00',
          items: [
            ReceiptOcrItemCandidate(
              description: 'Milk',
              quantity: '1',
              lineTotal: '43.00',
              currency: 'HKD',
            ),
          ],
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          syncController: sampleBillSyncController(),
          attachmentRepository: FakeBillAttachmentRepository(),
          attachmentFileInput: FakeBillAttachmentFileInput(
            pickedFile: samplePickedAttachmentFile(
              filename: 'receipt.png',
              contentType: 'image/png',
              bytes: const [1, 2, 3],
            ),
          ),
          receiptOcrProvider: receiptOcrProvider,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('bill-list-scan-receipt')));
    await tester.pumpAndSettle();
    await _tapReceiptOcrApply(tester, 'personal-bill');
    await tester.enterText(
      find.byKey(const Key('personal-bill-merchant-name')),
      'Corner Market edited draft',
    );
    await _tapSaveBill(tester);

    expect(
      find.byKey(const Key('receipt-ocr-duplicate-save-dialog')),
      findsOneWidget,
    );
    expect(repository.createCalls, 0);

    await tester.tap(
      find.byKey(const Key('receipt-ocr-duplicate-save-cancel')),
    );
    await tester.pumpAndSettle();

    expect(repository.createCalls, 0);
    expect(
      find.byKey(const Key('personal-bill-ocr-preview-panel')),
      findsOneWidget,
    );
    expect(
      tester
          .widget<TextFormField>(
            find.byKey(const Key('personal-bill-merchant-name')),
          )
          .controller
          ?.text,
      'Corner Market edited draft',
    );
    expect(find.byKey(const Key('personal-bill-save')), findsOneWidget);
  });

  testWidgets(
    'personal OCR duplicate warning reviews existing bill without changing draft',
    (tester) async {
      await useLargeSurface(tester);
      final repository = FakeBillRepository(
        bills: [
          sampleBillSummary(
            id: 'existing-bill-id',
            merchantName: 'Corner Market',
            billDate: '2026-06-12',
            totalAmount: '43.0',
            totalCurrency: 'HKD',
          ),
        ],
        details: [
          sampleBillDetail(
            id: 'existing-bill-id',
            merchantName: 'Corner Market',
            billDate: '2026-06-12',
            totalAmount: '43.0',
            totalCurrency: 'HKD',
          ),
        ],
      );
      final receiptOcrProvider = FakeReceiptOcrProvider(
        const ReceiptOcrResult.extracted(
          ReceiptOcrPreview(
            merchant: 'Corner Market Ltd.',
            receiptDate: '2026-06-12',
            currency: 'HKD',
            total: '43.00',
            items: [
              ReceiptOcrItemCandidate(
                description: 'Milk',
                quantity: '1',
                lineTotal: '43.00',
                currency: 'HKD',
              ),
            ],
          ),
        ),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: repository,
            syncController: sampleBillSyncController(),
            attachmentRepository: FakeBillAttachmentRepository(),
            attachmentFileInput: FakeBillAttachmentFileInput(
              pickedFile: samplePickedAttachmentFile(
                filename: 'receipt.png',
                contentType: 'image/png',
                bytes: const [1, 2, 3],
              ),
            ),
            receiptOcrProvider: receiptOcrProvider,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('bill-list-scan-receipt')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('personal-bill-merchant-name')),
        'Manual draft merchant',
      );

      expect(
        find.byKey(const Key('receipt-ocr-duplicate-warning')),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('receipt-ocr-duplicate-warning-match-title')),
        findsOneWidget,
      );
      expect(find.text('Corner Market'), findsOneWidget);
      expect(find.text('2026-06-12 · HKD 43.0'), findsOneWidget);
      expect(
        find.byKey(const Key('receipt-ocr-duplicate-review-bill')),
        findsOneWidget,
      );
      expect(find.byKey(const Key('personal-bill-ocr-apply')), findsOneWidget);

      await tester.tap(
        find.byKey(const Key('receipt-ocr-duplicate-review-bill')),
      );
      await tester.pumpAndSettle();

      expect(repository.getCalls, 1);
      expect(repository.createCalls, 0);
      expect(find.text('Bill'), findsOneWidget);
      expect(find.text('Corner Market'), findsWidgets);

      await tester.pageBack();
      await tester.pumpAndSettle();

      expect(
        find.byKey(const Key('personal-bill-ocr-preview-panel')),
        findsOneWidget,
      );
      expect(find.byKey(const Key('personal-bill-ocr-apply')), findsOneWidget);
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const Key('personal-bill-merchant-name')),
            )
            .controller
            ?.text,
        'Manual draft merchant',
      );
      expect(repository.createCalls, 0);
    },
  );

  testWidgets(
    'personal OCR duplicate save confirmation reviews existing bill',
    (tester) async {
      await useLargeSurface(tester);
      final repository = FakeBillRepository(
        bills: [
          sampleBillSummary(
            id: 'existing-bill-id',
            merchantName: 'Corner Market',
            billDate: '2026-06-12',
            totalAmount: '43.0',
            totalCurrency: 'HKD',
          ),
        ],
        details: [
          sampleBillDetail(
            id: 'existing-bill-id',
            merchantName: 'Corner Market',
            billDate: '2026-06-12',
            totalAmount: '43.0',
            totalCurrency: 'HKD',
          ),
        ],
      );
      final receiptOcrProvider = FakeReceiptOcrProvider(
        const ReceiptOcrResult.extracted(
          ReceiptOcrPreview(
            merchant: 'Corner Market Ltd.',
            receiptDate: '2026-06-12',
            currency: 'HKD',
            total: '43.00',
            items: [
              ReceiptOcrItemCandidate(
                description: 'Milk',
                quantity: '1',
                lineTotal: '43.00',
                currency: 'HKD',
              ),
            ],
          ),
        ),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: repository,
            syncController: sampleBillSyncController(),
            attachmentRepository: FakeBillAttachmentRepository(),
            attachmentFileInput: FakeBillAttachmentFileInput(
              pickedFile: samplePickedAttachmentFile(
                filename: 'receipt.png',
                contentType: 'image/png',
                bytes: const [1, 2, 3],
              ),
            ),
            receiptOcrProvider: receiptOcrProvider,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('bill-list-scan-receipt')));
      await tester.pumpAndSettle();
      await _tapReceiptOcrApply(tester, 'personal-bill');
      await tester.enterText(
        find.byKey(const Key('personal-bill-merchant-name')),
        'Corner Market dialog draft',
      );
      await _tapSaveBill(tester);

      expect(
        find.byKey(const Key('receipt-ocr-duplicate-save-dialog')),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('receipt-ocr-duplicate-save-review-bill')),
        findsOneWidget,
      );

      await tester.tap(
        find.byKey(const Key('receipt-ocr-duplicate-save-review-bill')),
      );
      await tester.pumpAndSettle();

      expect(repository.getCalls, 1);
      expect(repository.createCalls, 0);
      expect(find.text('Corner Market'), findsWidgets);

      await tester.pageBack();
      await tester.pumpAndSettle();

      expect(
        find.byKey(const Key('personal-bill-ocr-preview-panel')),
        findsOneWidget,
      );
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const Key('personal-bill-merchant-name')),
            )
            .controller
            ?.text,
        'Corner Market dialog draft',
      );
      expect(repository.createCalls, 0);
    },
  );

  testWidgets(
    'personal OCR duplicate warning omits review action for unavailable match',
    (tester) async {
      await useLargeSurface(tester);
      final repository = FakeBillRepository(
        bills: [
          sampleBillSummary(
            id: 'archived-bill-id',
            merchantName: 'Corner Market',
            billDate: '2026-06-12',
            totalAmount: '43.0',
            totalCurrency: 'HKD',
            archiveState: SettleoraBillArchiveStateValues.archived,
          ),
        ],
      );
      final receiptOcrProvider = FakeReceiptOcrProvider(
        const ReceiptOcrResult.extracted(
          ReceiptOcrPreview(
            merchant: 'Corner Market Ltd.',
            receiptDate: '2026-06-12',
            currency: 'HKD',
            total: '43.00',
            items: [
              ReceiptOcrItemCandidate(
                description: 'Milk',
                quantity: '1',
                lineTotal: '43.00',
                currency: 'HKD',
              ),
            ],
          ),
        ),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: repository,
            syncController: sampleBillSyncController(),
            attachmentRepository: FakeBillAttachmentRepository(),
            attachmentFileInput: FakeBillAttachmentFileInput(
              pickedFile: samplePickedAttachmentFile(
                filename: 'receipt.png',
                contentType: 'image/png',
                bytes: const [1, 2, 3],
              ),
            ),
            receiptOcrProvider: receiptOcrProvider,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('bill-list-scan-receipt')));
      await tester.pumpAndSettle();

      expect(
        find.byKey(const Key('receipt-ocr-duplicate-warning')),
        findsOneWidget,
      );
      expect(find.text('Corner Market'), findsOneWidget);
      expect(find.text('2026-06-12 · HKD 43.0'), findsOneWidget);
      expect(
        find.byKey(const Key('receipt-ocr-duplicate-review-bill')),
        findsNothing,
      );
      expect(find.byKey(const Key('personal-bill-ocr-apply')), findsOneWidget);
      expect(repository.getCalls, 0);
      expect(repository.createCalls, 0);

      await _tapReceiptOcrApply(tester, 'personal-bill');
      await _tapSaveBill(tester);

      expect(
        find.byKey(const Key('receipt-ocr-duplicate-save-dialog')),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('receipt-ocr-duplicate-save-review-bill')),
        findsNothing,
      );
      expect(
        find.byKey(const Key('receipt-ocr-duplicate-save-cancel')),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('receipt-ocr-duplicate-save-anyway')),
        findsOneWidget,
      );
      expect(repository.createCalls, 0);
    },
  );

  testWidgets(
    'personal OCR applies merchant date currency while keeping manual items',
    (tester) async {
      await useLargeSurface(tester);
      final receiptOcrProvider = FakeReceiptOcrProvider(
        const ReceiptOcrResult.extracted(
          ReceiptOcrPreview(
            merchant: 'Receipt Cafe',
            receiptDate: '2026-06-13',
            currency: 'HKD',
            total: '43.00',
            items: [
              ReceiptOcrItemCandidate(
                description: 'OCR noodles',
                quantity: '1',
                lineTotal: '43.00',
                currency: 'HKD',
              ),
            ],
          ),
        ),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraPersonalBillCreateScreen(
            repository: FakeBillRepository(),
            attachmentRepository: FakeBillAttachmentRepository(),
            attachmentFileInput: FakeBillAttachmentFileInput(
              pickedFile: samplePickedAttachmentFile(
                filename: 'receipt.png',
                contentType: 'image/png',
                bytes: const [1, 2, 3],
              ),
            ),
            receiptOcrProvider: receiptOcrProvider,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const ValueKey('personal-bill-item-name-0')),
        'Manual salad',
      );
      await tester.enterText(
        find.byKey(const ValueKey('personal-bill-item-amount-0')),
        '12.00',
      );
      await tester.tap(find.byKey(const Key('personal-bill-scan-receipt')));
      await tester.pumpAndSettle();

      expect(find.text('This will replace existing item rows.'), findsNothing);
      expect(
        tester
            .widget<CheckboxListTile>(
              find.byKey(const Key('personal-bill-ocr-apply-items')),
            )
            .value,
        isFalse,
      );

      await _tapReceiptOcrApply(tester, 'personal-bill');

      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const Key('personal-bill-merchant-name')),
            )
            .controller
            ?.text,
        'Receipt Cafe',
      );
      expect(find.text('2026-06-13', skipOffstage: false), findsWidgets);
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const ValueKey('personal-bill-item-name-0')),
            )
            .controller
            ?.text,
        'Manual salad',
      );
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const ValueKey('personal-bill-item-amount-0')),
            )
            .controller
            ?.text,
        '12.00',
      );
    },
  );

  testWidgets(
    'personal OCR keeps manually typed basics when sections are not selected',
    (tester) async {
      await useLargeSurface(tester);
      final receiptOcrProvider = FakeReceiptOcrProvider(
        const ReceiptOcrResult.extracted(
          ReceiptOcrPreview(
            merchant: 'Receipt Store',
            receiptDate: '2026-06-13',
            currency: 'HKD',
            items: [
              ReceiptOcrItemCandidate(
                description: 'Receipt item',
                lineTotal: '9.00',
                currency: 'HKD',
              ),
            ],
          ),
        ),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraPersonalBillCreateScreen(
            repository: FakeBillRepository(),
            attachmentRepository: FakeBillAttachmentRepository(),
            attachmentFileInput: FakeBillAttachmentFileInput(
              pickedFile: samplePickedAttachmentFile(
                filename: 'receipt.png',
                contentType: 'image/png',
                bytes: const [1],
              ),
            ),
            receiptOcrProvider: receiptOcrProvider,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('personal-bill-merchant-name')),
        'Manual Store',
      );
      await tester.tap(find.byKey(const Key('personal-bill-scan-receipt')));
      await tester.pumpAndSettle();

      expect(
        find.text('This will replace your current merchant.'),
        findsNothing,
      );
      expect(
        tester
            .widget<CheckboxListTile>(
              find.byKey(const Key('personal-bill-ocr-apply-merchant')),
            )
            .value,
        isFalse,
      );
      await _setReceiptOcrSection(tester, 'personal-bill', 'date', false);
      await _setReceiptOcrSection(tester, 'personal-bill', 'currency', false);
      await _setReceiptOcrSection(tester, 'personal-bill', 'items', false);

      expect(
        find.byKey(const Key('personal-bill-ocr-no-selection')),
        findsOneWidget,
      );
      await _tapReceiptOcrApply(tester, 'personal-bill');

      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const Key('personal-bill-merchant-name')),
            )
            .controller
            ?.text,
        'Manual Store',
      );
      expect(find.text('USD - US Dollar', skipOffstage: false), findsWidgets);
      expect(find.text('Suggestions applied'), findsNothing);
    },
  );

  testWidgets(
    'personal OCR item replacement warning is visible when selected',
    (tester) async {
      await useLargeSurface(tester);
      final receiptOcrProvider = FakeReceiptOcrProvider(
        const ReceiptOcrResult.extracted(
          ReceiptOcrPreview(
            merchant: 'Receipt Cafe',
            items: [
              ReceiptOcrItemCandidate(
                description: 'OCR noodles',
                lineTotal: '43.00',
              ),
            ],
          ),
        ),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraPersonalBillCreateScreen(
            repository: FakeBillRepository(),
            attachmentRepository: FakeBillAttachmentRepository(),
            attachmentFileInput: FakeBillAttachmentFileInput(
              pickedFile: samplePickedAttachmentFile(
                filename: 'receipt.png',
                contentType: 'image/png',
                bytes: const [1],
              ),
            ),
            receiptOcrProvider: receiptOcrProvider,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const ValueKey('personal-bill-item-name-0')),
        'Manual salad',
      );
      await tester.tap(find.byKey(const Key('personal-bill-scan-receipt')));
      await tester.pumpAndSettle();

      expect(find.text('This will replace existing item rows.'), findsNothing);
      await _setReceiptOcrSection(tester, 'personal-bill', 'items', true);

      expect(
        find.text('This will replace existing item rows.'),
        findsOneWidget,
      );
    },
  );

  testWidgets('personal bill receipt image cancel leaves draft unchanged', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final receiptImageIntake = FakeReceiptImageIntake();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraPersonalBillCreateScreen(
          repository: FakeBillRepository(),
          attachmentRepository: FakeBillAttachmentRepository(),
          attachmentFileInput: FakeBillAttachmentFileInput(),
          receiptImageIntake: receiptImageIntake,
          receiptOcrProvider: FakeReceiptOcrProvider(
            const ReceiptOcrResult.failed('Should not run.'),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('personal-bill-merchant-name')),
      'Manual Cafe',
    );
    await tester.tap(find.byKey(const Key('personal-bill-scan-receipt')));
    await tester.pump(const Duration(milliseconds: 500));
    expect(
      find.byKey(const Key('personal-bill-receipt-image-source-cancel')),
      findsOneWidget,
    );
    expect(find.byKey(const Key('receipt-capture-guidance')), findsOneWidget);
    expect(find.text('Take receipt photo'), findsOneWidget);
    expect(find.text('Choose from photos'), findsOneWidget);
    expect(find.text('Use manual entry'), findsOneWidget);
    expect(find.text('Fit the whole receipt in frame.'), findsOneWidget);
    expect(find.text('Use good lighting.'), findsOneWidget);
    expect(find.text('Keep the receipt flat.'), findsOneWidget);
    expect(find.text('Tap the camera shutter when ready.'), findsOneWidget);
    expect(
      find.text(
        'Auto edge detection and auto-capture are not available in this build.',
      ),
      findsOneWidget,
    );
    expect(find.textContaining('provider'), findsNothing);
    expect(find.textContaining('endpoint'), findsNothing);
    Navigator.of(
      tester.element(find.byType(SettleoraPersonalBillCreateScreen)),
    ).pop();
    await tester.pump(const Duration(milliseconds: 500));

    expect(receiptImageIntake.pickCalls, 0);
    expect(
      tester
          .widget<TextFormField>(
            find.byKey(const Key('personal-bill-merchant-name')),
          )
          .controller
          ?.text,
      'Manual Cafe',
    );
    expect(find.text('0 attachments selected'), findsOneWidget);
    expect(
      find.text(
        'Receipt image selection was cancelled. Manual entry is still available.',
      ),
      findsNothing,
    );
    expect(
      find.byKey(const Key('personal-bill-attachment-error')),
      findsNothing,
    );
    expect(find.byKey(const Key('personal-bill-ocr-apply')), findsNothing);
  });

  testWidgets('personal bill receipt image permission error keeps manual entry', (
    tester,
  ) async {
    await useLargeSurface(tester);

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraPersonalBillCreateScreen(
          repository: FakeBillRepository(),
          attachmentRepository: FakeBillAttachmentRepository(),
          attachmentFileInput: FakeBillAttachmentFileInput(),
          receiptImageIntake: FakeReceiptImageIntake(
            failure: const SettleoraBillAttachmentFileInputFailure(
              'Receipt image access was denied. Manual entry is still available.',
            ),
          ),
          receiptOcrProvider: FakeReceiptOcrProvider(
            const ReceiptOcrResult.failed('Should not run.'),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('personal-bill-merchant-name')),
      'Manual Cafe',
    );
    await tester.tap(find.byKey(const Key('personal-bill-scan-receipt')));
    await tester.pump(const Duration(milliseconds: 500));
    expect(
      find.byKey(const Key('personal-bill-receipt-image-source-gallery')),
      findsOneWidget,
    );
    expect(find.text('Take receipt photo'), findsOneWidget);
    expect(find.text('Choose from photos'), findsOneWidget);
    expect(find.text('Use manual entry'), findsOneWidget);
    Navigator.of(
      tester.element(find.byType(SettleoraPersonalBillCreateScreen)),
    ).pop(ReceiptImageSource.gallery);
    await tester.pump(const Duration(milliseconds: 500));

    expect(
      find.text(
        'Receipt image access was denied. Manual entry is still available.',
      ),
      findsOneWidget,
    );
    expect(
      tester
          .widget<TextFormField>(
            find.byKey(const Key('personal-bill-merchant-name')),
          )
          .controller
          ?.text,
      'Manual Cafe',
    );
    expect(find.text('0 attachments selected'), findsOneWidget);
  });

  testWidgets('personal bill OCR failure keeps manual entry and supports retry', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final receiptOcrProvider = FakeReceiptOcrProvider(
      const ReceiptOcrResult.failed(
        'No readable receipt text was found. You can still enter the bill manually.',
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraPersonalBillCreateScreen(
          repository: FakeBillRepository(),
          attachmentRepository: FakeBillAttachmentRepository(),
          attachmentFileInput: FakeBillAttachmentFileInput(
            pickedFile: samplePickedAttachmentFile(
              filename: 'receipt.png',
              contentType: 'image/png',
              bytes: const [3, 2, 1],
            ),
          ),
          receiptOcrProvider: receiptOcrProvider,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('personal-bill-scan-receipt')));
    await tester.pumpAndSettle();

    expect(receiptOcrProvider.calls, 1);
    expect(find.text('Manual entry'), findsOneWidget);
    expect(
      find.text(
        'No readable receipt text was found. You can still enter the bill manually.',
      ),
      findsOneWidget,
    );
    expect(find.byKey(const Key('personal-bill-ocr-retry')), findsOneWidget);
    expect(find.byKey(const Key('personal-bill-ocr-apply')), findsNothing);

    await tester.enterText(
      find.byKey(const ValueKey('personal-bill-item-name-0')),
      'Manual coffee',
    );
    expect(
      tester
          .widget<TextFormField>(
            find.byKey(const ValueKey('personal-bill-item-name-0')),
          )
          .controller
          ?.text,
      'Manual coffee',
    );

    await tester.tap(find.byKey(const Key('personal-bill-ocr-retry')));
    await tester.pumpAndSettle();

    expect(receiptOcrProvider.calls, 2);
    expect(
      tester
          .widget<TextFormField>(
            find.byKey(const ValueKey('personal-bill-item-name-0')),
          )
          .controller
          ?.text,
      'Manual coffee',
    );
  });

  testWidgets('personal bill receipt image intake passes local path to OCR', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final receiptOcrProvider = FakeReceiptOcrProvider(
      const ReceiptOcrResult.extracted(
        ReceiptOcrPreview(
          merchant: 'Path Market',
          currency: 'USD',
          items: [
            ReceiptOcrItemCandidate(
              description: 'Coffee',
              quantity: '1',
              lineTotal: '4.50',
              currency: 'USD',
            ),
          ],
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraPersonalBillCreateScreen(
          repository: FakeBillRepository(),
          attachmentRepository: FakeBillAttachmentRepository(),
          attachmentFileInput: FakeBillAttachmentFileInput(),
          receiptImageIntake: FakeReceiptImageIntake(
            pickedFile: samplePickedAttachmentFile(
              filename: 'receipt.jpg',
              contentType: 'image/jpeg',
              bytes: const [8, 6, 7],
              localPath: '/tmp/settleora-receipt.jpg',
            ),
          ),
          receiptOcrProvider: receiptOcrProvider,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('personal-bill-scan-receipt')));
    await tester.pump(const Duration(milliseconds: 500));
    expect(
      find.byKey(const Key('personal-bill-receipt-image-source-camera')),
      findsOneWidget,
    );
    expect(find.text('Take receipt photo'), findsOneWidget);
    expect(find.text('Choose from photos'), findsOneWidget);
    Navigator.of(
      tester.element(find.byType(SettleoraPersonalBillCreateScreen)),
    ).pop(ReceiptImageSource.camera);
    await tester.pump(const Duration(milliseconds: 500));

    expect(receiptOcrProvider.calls, 1);
    expect(receiptOcrProvider.lastRequest?.bytes, const [8, 6, 7]);
    expect(receiptOcrProvider.lastRequest?.contentType, 'image/jpeg');
    expect(
      receiptOcrProvider.lastRequest?.imagePath,
      '/tmp/settleora-receipt.jpg',
    );
    expect(find.text('Review'), findsOneWidget);
    expect(
      tester
          .widget<TextFormField>(
            find.byKey(const Key('personal-bill-ocr-edit-merchant')),
          )
          .controller
          ?.text,
      'Path Market',
    );
  });

  testWidgets('personal bill create explains receipt unavailable seam safely', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: FakeBillRepository(),
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('bill-list-create')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('personal-bill-scan-receipt')), findsOneWidget);
    expect(
      tester
          .widget<AppButton>(
            find.byKey(const Key('personal-bill-scan-receipt')),
          )
          .onPressed,
      isNull,
    );
    expect(
      find.byKey(const Key('personal-bill-scan-receipt-unavailable-copy')),
      findsOneWidget,
    );
  });

  testWidgets('personal bill empty state omits standalone global nav', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: FakeBillRepository(),
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('No bills'), findsOneWidget);
    expect(find.byKey(const Key('bill-list-empty-create')), findsOneWidget);
    expect(find.byKey(const Key('bottom-nav-bills')), findsNothing);
    expect(find.byKey(const Key('bottom-nav-settle')), findsNothing);
  });

  testWidgets('personal bill needs review filter shows review bills', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeBillRepository(
      bills: [
        sampleBillSummary(
          id: 'review-bill-id',
          merchantName: 'Receipt Review',
          status: 'needs_review',
        ),
        sampleBillSummary(
          id: 'active-bill-id',
          merchantName: 'Settled Lunch',
          status: 'confirmed',
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Needs review (1)'), findsOneWidget);

    await tester.tap(
      find.byKey(const ValueKey('bill-list-filter-needsReview')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Receipt Review'), findsOneWidget);
    expect(find.text('Settled Lunch'), findsNothing);
  });

  testWidgets('personal bill search filters clear to the loaded bill list', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeBillRepository(
      bills: [
        sampleBillSummary(
          id: 'draft-bill-id',
          merchantName: 'Corner Market',
          status: 'draft',
          totalCurrency: 'USD',
        ),
        sampleBillSummary(
          id: 'archived-bill-id',
          merchantName: 'Train Tickets',
          status: 'confirmed',
          totalAmount: '42.00',
          totalCurrency: 'EUR',
          archiveState: SettleoraBillArchiveStateValues.archived,
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('bill-list-search')), findsOneWidget);
    expect(find.text('All (2)'), findsOneWidget);
    expect(find.text('Active (1)'), findsOneWidget);
    expect(find.text('Archived (1)'), findsOneWidget);
    expect(find.text('Corner Market'), findsOneWidget);
    expect(find.text('Train Tickets'), findsOneWidget);
    expect(find.text('1 item - 1 participant - 1 payer'), findsWidgets);
    expect(
      find.text('Open to review details or add attachments.'),
      findsOneWidget,
    );
    expect(
      find.text('Restore to open details or update this bill.'),
      findsOneWidget,
    );

    await tester.enterText(find.byKey(const Key('bill-list-search')), 'eur');
    await tester.pumpAndSettle();

    expect(find.text('Train Tickets'), findsOneWidget);
    expect(find.text('Corner Market'), findsNothing);

    await tester.tap(find.byKey(const ValueKey('bill-list-filter-active')));
    await tester.pumpAndSettle();

    expect(find.text('No matching bills'), findsOneWidget);
    expect(
      find.text(
        'No already-loaded personal bills match this local search or filter. Clear filters to review every loaded server row.',
      ),
      findsOneWidget,
    );
    expect(find.text('Train Tickets'), findsNothing);

    await tester.tap(find.byKey(const Key('bill-list-clear-filters')));
    await tester.pumpAndSettle();

    expect(find.text('Corner Market'), findsOneWidget);
    expect(find.text('Train Tickets'), findsOneWidget);
  });

  testWidgets('tapping create opens the personal bill create screen', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: FakeBillRepository(),
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('bill-list-create')));
    await tester.pumpAndSettle();

    expect(find.text('Create bill'), findsWidgets);
    expect(find.byKey(const Key('personal-bill-date')), findsOneWidget);
    expect(find.byKey(const Key('personal-bill-item-name-0')), findsOneWidget);
  });

  testWidgets('personal bill create exits without prompt when unchanged', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: FakeBillRepository(),
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('bill-list-create')));
    await tester.pumpAndSettle();
    await tester.pageBack();
    await tester.pumpAndSettle();

    expect(
      find.byKey(const Key('personal-bill-exit-guard-dialog')),
      findsNothing,
    );
    expect(find.byKey(const Key('bill-list-create')), findsOneWidget);
  });

  testWidgets('personal bill create prompts before discarding edited draft', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: FakeBillRepository(),
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('bill-list-create')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('personal-bill-merchant-name')),
      'Brunch Spot',
    );
    await tester.pageBack();
    await tester.pumpAndSettle();

    expect(
      find.byKey(const Key('personal-bill-exit-guard-dialog')),
      findsOneWidget,
    );
    expect(find.text('Discard draft?'), findsOneWidget);

    await tester.tap(find.byKey(const Key('personal-bill-exit-keep-editing')));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const Key('personal-bill-merchant-name')),
      findsOneWidget,
    );
    expect(find.text('Brunch Spot'), findsOneWidget);

    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('personal-bill-exit-discard')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('bill-list-create')), findsOneWidget);
    expect(find.text('Brunch Spot'), findsNothing);
  });

  testWidgets('personal bill create prompts after draft attachment selection', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final fileInput = FakeBillAttachmentFileInput(
      pickedFile: samplePickedAttachmentFile(
        filename: 'receipt.png',
        contentType: 'image/png',
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: FakeBillRepository(),
          syncController: sampleBillSyncController(),
          attachmentRepository: FakeBillAttachmentRepository(),
          attachmentFileInput: fileInput,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('bill-list-create')));
    await tester.pumpAndSettle();
    await _addDraftAttachment(
      tester,
      const Key('personal-bill-attachment-purpose-receipt'),
    );
    await tester.pageBack();
    await tester.pumpAndSettle();

    expect(
      find.byKey(const Key('personal-bill-exit-guard-dialog')),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const Key('personal-bill-exit-discard')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('bill-list-create')), findsOneWidget);
  });

  testWidgets('personal bill create review checklist tracks local form state', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final fileInput = FakeBillAttachmentFileInput(
      pickedFile: samplePickedAttachmentFile(
        filename: 'receipt.png',
        contentType: 'image/png',
        bytes: const [4, 5, 6],
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: FakeBillRepository(),
          syncController: sampleBillSyncController(),
          attachmentRepository: FakeBillAttachmentRepository(),
          attachmentFileInput: fileInput,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('bill-list-create')));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const Key('personal-bill-create-review-checklist')),
      findsOneWidget,
    );
    expect(find.text('Review before save'), findsOneWidget);
    expect(
      find.text(
        'Local form checklist only. The server still validates the saved bill.',
      ),
      findsOneWidget,
    );
    expect(find.text('1 item row'), findsWidgets);
    expect(find.text('0 attachments'), findsOneWidget);
    expect(find.text('Missing local details: merchant.'), findsOneWidget);
    expect(
      find.text('Missing local item fields: 1 item name, 1 item amount.'),
      findsOneWidget,
    );
    expect(find.text('No attachments selected.'), findsOneWidget);

    await tester.tap(find.byKey(const Key('personal-bill-add-item')));
    await tester.pumpAndSettle();

    expect(find.text('2 item rows'), findsWidgets);
    expect(
      find.text('Missing local item fields: 2 item names, 2 item amounts.'),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const ValueKey('personal-bill-item-remove-1')));
    await tester.pumpAndSettle();

    expect(find.text('1 item row'), findsWidgets);
    expect(
      find.text('Missing local item fields: 1 item name, 1 item amount.'),
      findsOneWidget,
    );

    await tester.enterText(
      find.byKey(const Key('personal-bill-merchant-name')),
      'Brunch Spot',
    );
    await tester.tap(find.byKey(const Key('personal-bill-date-today')));
    await tester.pumpAndSettle();

    expect(
      find.text('Merchant, date, and currency are filled locally.'),
      findsOneWidget,
    );

    await tester.enterText(
      find.byKey(const Key('personal-bill-item-name-0')),
      'Coffee',
    );
    await tester.enterText(
      find.byKey(const Key('personal-bill-item-amount-0')),
      '7.50',
    );
    await tester.pumpAndSettle();

    expect(
      find.text('All item names, amounts, and currencies are filled locally.'),
      findsOneWidget,
    );

    await _addDraftAttachment(
      tester,
      const Key('personal-bill-attachment-purpose-receipt'),
    );

    expect(find.text('1 attachment'), findsOneWidget);
    expect(
      find.text(
        'Attachments are selected for upload after bill creation. Receipt OCR stays provisional until reviewed.',
      ),
      findsOneWidget,
    );

    await tester.tap(
      find.byKey(const ValueKey('personal-bill-attachment-remove-0')),
    );
    await tester.pumpAndSettle();

    expect(find.text('0 attachments'), findsOneWidget);
    expect(find.text('No attachments selected.'), findsOneWidget);
  });

  testWidgets('create validation blocks blank fields and zero item rows', (
    tester,
  ) async {
    final repository = FakeBillRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('bill-list-create')));
    await tester.pumpAndSettle();
    await _tapSaveBill(tester);

    expect(
      tester
          .widget<DateField>(find.byKey(const Key('personal-bill-date-picker')))
          .controller
          .text,
      _formatTestBillDate(DateTime.now()),
    );
    expect(find.text('Enter a bill date.'), findsNothing);
    expect(find.text('Enter an item name.'), findsOneWidget);
    expect(find.text('Enter a unit amount or line total.'), findsOneWidget);
    expect(repository.createCalls, 0);

    await tester.ensureVisible(
      find.byKey(const Key('personal-bill-item-remove-0')),
    );
    await tester.tap(find.byKey(const Key('personal-bill-item-remove-0')));
    await tester.pumpAndSettle();
    await _tapSaveBill(tester);

    expect(find.text('Add at least one item before saving.'), findsOneWidget);
    final itemListError = tester.widget<Semantics>(
      find.byKey(const Key('personal-bill-item-list-error')),
    );
    expect(itemListError.properties.liveRegion, isTrue);
    expect(
      itemListError.properties.label,
      'Add at least one item before saving.',
    );
    expect(repository.createCalls, 0);
  });

  testWidgets(
    'personal bill create shows aligned date currency amount fields',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: FakeBillRepository(),
            syncController: sampleBillSyncController(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('bill-list-create')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('personal-bill-date')), findsOneWidget);
      expect(find.byType(DateField), findsOneWidget);
      expect(
        tester
            .widget<DateField>(
              find.byKey(const Key('personal-bill-date-picker')),
            )
            .controller
            .text,
        _formatTestBillDate(DateTime.now()),
      );
      expect(find.byKey(const Key('personal-bill-date-today')), findsOneWidget);
      expect(
        find.byKey(const Key('personal-bill-date-picker')),
        findsOneWidget,
      );
      expect(find.byKey(const Key('personal-bill-currency')), findsOneWidget);
      expect(
        find.byKey(const Key('personal-bill-item-currency-0')),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byKey(const Key('personal-bill-item-currency-0')),
          matching: find.byType(TextFormField),
        ),
        findsNothing,
      );
      expect(find.text('USD - US Dollar'), findsWidgets);
      expect(find.text('Quantity'), findsOneWidget);
      expect(find.text('Unit amount'), findsOneWidget);
      expect(find.text('Line total'), findsOneWidget);
      final unitAmountMoneyInput = tester.widget<MoneyInput>(
        find.byWidgetPredicate(
          (widget) =>
              widget is MoneyInput &&
              widget.amountKey ==
                  const ValueKey('personal-bill-item-unit-amount-0'),
        ),
      );
      expect(
        unitAmountMoneyInput.currencyControl,
        MoneyInputCurrencyControl.staticCode,
      );
      expect(unitAmountMoneyInput.currencyValue, 'USD');
      expect(unitAmountMoneyInput.currencyLabel, 'Item currency');
      final lineTotalMoneyInput = tester.widget<MoneyInput>(
        find.byWidgetPredicate(
          (widget) =>
              widget is MoneyInput &&
              widget.amountKey == const ValueKey('personal-bill-item-amount-0'),
        ),
      );
      expect(
        lineTotalMoneyInput.currencyControl,
        MoneyInputCurrencyControl.staticCode,
      );
      expect(lineTotalMoneyInput.currencyValue, 'USD');
      expect(lineTotalMoneyInput.currencyLabel, 'Item currency');
      expect(
        find.byKey(const Key('personal-bill-total-preview')),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'personal bill create defaults to current user currency when provided',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: FakeBillRepository(),
            syncController: sampleBillSyncController(),
            defaultCurrency: 'hkd',
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('bill-list-create')));
      await tester.pumpAndSettle();

      expect(find.text('HKD - Hong Kong Dollar'), findsWidgets);

      await tester.enterText(
        find.byKey(const Key('personal-bill-item-name-0')),
        'Coffee',
      );
      await tester.enterText(
        find.byKey(const Key('personal-bill-item-unit-amount-0')),
        '100',
      );
      await tester.pumpAndSettle();

      expect(find.text('1 item row - 100.00 HKD'), findsOneWidget);
      expect(
        find.text(
          'Local preview only. Server validation remains authoritative for money, rounding, shares, and persistence.',
        ),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'personal bill item currency dropdown defaults and follows bill currency until changed',
    (tester) async {
      final repository = FakeBillRepository();

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: repository,
            syncController: sampleBillSyncController(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('bill-list-create')));
      await tester.pumpAndSettle();
      await _chooseDropdownValue(
        tester,
        const Key('personal-bill-currency'),
        'EUR',
      );
      await tester.tap(find.byKey(const Key('personal-bill-add-item')));
      await tester.pumpAndSettle();
      await _chooseDropdownValue(
        tester,
        const Key('personal-bill-item-currency-0'),
        'GBP',
      );
      await _chooseDropdownValue(
        tester,
        const Key('personal-bill-currency'),
        'HKD',
      );

      await tester.ensureVisible(
        find.byKey(const Key('personal-bill-date-today')),
      );
      await tester.tap(find.byKey(const Key('personal-bill-date-today')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('personal-bill-item-name-0')),
        'Coffee',
      );
      await tester.enterText(
        find.byKey(const Key('personal-bill-item-amount-0')),
        '7.50',
      );
      await tester.enterText(
        find.byKey(const Key('personal-bill-item-name-1')),
        'Tea',
      );
      await tester.enterText(
        find.byKey(const Key('personal-bill-item-amount-1')),
        '8.00',
      );
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Mixed item currencies prevent a same-currency local total preview.',
        ),
        findsOneWidget,
      );
      await _tapSaveBill(tester);

      final draft = repository.lastCreateDraft;
      expect(draft?.currency, 'HKD');
      expect(draft?.items[0].currency, 'GBP');
      expect(draft?.items[1].currency, 'HKD');
    },
  );

  testWidgets('personal bill item accepts line total only with quantity 1', (
    tester,
  ) async {
    final repository = FakeBillRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('bill-list-create')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('personal-bill-date-today')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('personal-bill-item-name-0')),
      'Coffee',
    );
    await tester.enterText(
      find.byKey(const Key('personal-bill-item-amount-0')),
      '7.50',
    );
    await tester.pumpAndSettle();

    final quantity = tester.widget<TextFormField>(
      find.byKey(const Key('personal-bill-item-quantity-0')),
    );
    final unitAmount = tester.widget<TextFormField>(
      find.byKey(const Key('personal-bill-item-unit-amount-0')),
    );
    expect(quantity.controller?.text, '1');
    expect(unitAmount.controller?.text, '7.50');

    await _tapSaveBill(tester);

    expect(repository.createCalls, 1);
    expect(repository.lastCreateDraft?.items.single.amount, '7.50');
  });

  testWidgets('personal bill item derives line total from quantity and unit', (
    tester,
  ) async {
    final repository = FakeBillRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('bill-list-create')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('personal-bill-date-today')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('personal-bill-item-name-0')),
      'Tea',
    );
    await tester.enterText(
      find.byKey(const Key('personal-bill-item-quantity-0')),
      '2',
    );
    await tester.enterText(
      find.byKey(const Key('personal-bill-item-unit-amount-0')),
      '50',
    );
    await tester.pumpAndSettle();

    final lineTotal = tester.widget<TextFormField>(
      find.byKey(const Key('personal-bill-item-amount-0')),
    );
    expect(lineTotal.controller?.text, '100.00');

    await _tapSaveBill(tester);

    expect(repository.createCalls, 1);
    expect(repository.lastCreateDraft?.items.single.amount, '100.00');
  });

  testWidgets('personal bill item treats unit 100 as currency units', (
    tester,
  ) async {
    final repository = FakeBillRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('bill-list-create')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('personal-bill-date-today')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('personal-bill-item-name-0')),
      'Groceries',
    );
    await tester.enterText(
      find.byKey(const Key('personal-bill-item-quantity-0')),
      '1',
    );
    await tester.enterText(
      find.byKey(const Key('personal-bill-item-unit-amount-0')),
      '100',
    );
    await tester.pumpAndSettle();

    final lineTotal = tester.widget<TextFormField>(
      find.byKey(const Key('personal-bill-item-amount-0')),
    );
    expect(lineTotal.controller?.text, '100.00');

    await _tapSaveBill(tester);

    expect(repository.createCalls, 1);
    expect(repository.lastCreateDraft?.items.single.amount, '100.00');
  });

  testWidgets('personal bill item derives unit from quantity and line total', (
    tester,
  ) async {
    final repository = FakeBillRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('bill-list-create')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('personal-bill-date-today')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('personal-bill-item-name-0')),
      'Bao',
    );
    await tester.enterText(
      find.byKey(const Key('personal-bill-item-quantity-0')),
      '2',
    );
    await tester.enterText(
      find.byKey(const Key('personal-bill-item-amount-0')),
      '100',
    );
    await tester.pumpAndSettle();

    final unitAmount = tester.widget<TextFormField>(
      find.byKey(const Key('personal-bill-item-unit-amount-0')),
    );
    expect(unitAmount.controller?.text, '50.00');

    await _tapSaveBill(tester);

    expect(repository.createCalls, 1);
    expect(repository.lastCreateDraft?.items.single.amount, '100');
  });

  testWidgets('personal bill item derives by visible currency scale', (
    tester,
  ) async {
    final repository = FakeBillRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('bill-list-create')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('personal-bill-item-quantity-0')),
      '2',
    );

    Future<void> expectDerivedLineTotal(
      String currency,
      String unitAmount,
      String expectedLineTotal,
    ) async {
      await _chooseDropdownValue(
        tester,
        const Key('personal-bill-item-currency-0'),
        currency,
      );
      await tester.enterText(
        find.byKey(const Key('personal-bill-item-unit-amount-0')),
        unitAmount,
      );
      await tester.pumpAndSettle();

      final lineTotal = tester.widget<TextFormField>(
        find.byKey(const Key('personal-bill-item-amount-0')),
      );
      expect(lineTotal.controller?.text, expectedLineTotal);
    }

    await expectDerivedLineTotal('USD', '100', '200.00');
    await expectDerivedLineTotal('HKD', '100', '200.00');
    await expectDerivedLineTotal('EUR', '100', '200.00');
    await expectDerivedLineTotal('GBP', '100', '200.00');
    await expectDerivedLineTotal('JPY', '100', '200');
    await expectDerivedLineTotal('KWD', '1.234', '2.468');
    await expectDerivedLineTotal('BHD', '1.234', '2.468');
  });

  testWidgets('personal bill item rejects contradictory amount pairs', (
    tester,
  ) async {
    final repository = FakeBillRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('bill-list-create')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('personal-bill-date-today')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('personal-bill-item-name-0')),
      'Noodles',
    );
    await tester.enterText(
      find.byKey(const Key('personal-bill-item-quantity-0')),
      '2',
    );
    await tester.enterText(
      find.byKey(const Key('personal-bill-item-unit-amount-0')),
      '3.00',
    );
    await tester.enterText(
      find.byKey(const Key('personal-bill-item-amount-0')),
      '7.50',
    );
    await _tapSaveBill(tester);

    expect(
      find.text('Unit amount and line total must match quantity.'),
      findsOneWidget,
    );
    expect(repository.createCalls, 0);
  });

  testWidgets(
    'create validation rejects invalid money before create or upload',
    (tester) async {
      await useLargeSurface(tester);
      final repository = FakeBillRepository();
      final attachmentRepository = FakeBillAttachmentRepository();
      final fileInput = FakeBillAttachmentFileInput(
        pickedFile: samplePickedAttachmentFile(
          filename: 'receipt.png',
          contentType: 'image/png',
          bytes: const [4, 5, 6],
        ),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: repository,
            syncController: sampleBillSyncController(),
            attachmentRepository: attachmentRepository,
            attachmentFileInput: fileInput,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('bill-list-create')));
      await tester.pumpAndSettle();
      await _fillMinimalCreateForm(tester);
      await _addDraftAttachment(
        tester,
        const Key('personal-bill-attachment-purpose-receipt'),
      );

      await tester.enterText(
        find.byKey(const Key('personal-bill-item-amount-0')),
        'twelve',
      );
      await _tapSaveBill(tester);

      expect(find.text('Enter a valid positive amount.'), findsOneWidget);
      expect(repository.createCalls, 0);
      expect(attachmentRepository.attachCalls, 0);
      expect(find.text('1 attachment selected'), findsOneWidget);
      expect(find.text('receipt.png'), findsOneWidget);
      expect(find.text('Receipt'), findsOneWidget);
      expect(
        find.byKey(const ValueKey('personal-bill-attachment-purpose-menu-0')),
        findsOneWidget,
      );

      await tester.enterText(
        find.byKey(const Key('personal-bill-item-amount-0')),
        '0.00',
      );
      await _tapSaveBill(tester);

      expect(find.text('Enter an amount greater than zero.'), findsOneWidget);
      expect(repository.createCalls, 0);
      expect(attachmentRepository.attachCalls, 0);
      expect(find.text('receipt.png'), findsOneWidget);

      await tester.enterText(
        find.byKey(const Key('personal-bill-item-amount-0')),
        '-1',
      );
      await _tapSaveBill(tester);

      expect(find.text('Enter a valid positive amount.'), findsOneWidget);
      expect(repository.createCalls, 0);
      expect(attachmentRepository.attachCalls, 0);
      expect(find.text('receipt.png'), findsOneWidget);

      await tester.enterText(
        find.byKey(const Key('personal-bill-item-amount-0')),
        '7.50',
      );
      await tester.enterText(
        find.byKey(const Key('personal-bill-item-amount-0')),
        '7.50',
      );
      await _tapSaveBill(tester);

      expect(repository.createCalls, 1);
      expect(attachmentRepository.attachCalls, 1);
    },
  );

  testWidgets('create save sends expected personal bill draft strings', (
    tester,
  ) async {
    final repository = FakeBillRepository(
      createdDetail: sampleBillDetail(
        id: _createdBillId,
        merchantName: 'Brunch Spot',
        billDate: '2026-05-23',
        totalAmount: '12.30',
        totalCurrency: 'USD',
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('bill-list-create')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('personal-bill-merchant-name')),
      '  Brunch Spot  ',
    );
    await tester.tap(find.byKey(const Key('personal-bill-date-today')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('personal-bill-item-name-0')),
      '  Eggs  ',
    );
    await tester.enterText(
      find.byKey(const Key('personal-bill-item-amount-0')),
      ' 12.30 ',
    );
    await tester.enterText(
      find.byKey(const Key('personal-bill-item-note-0')),
      '  table 4  ',
    );

    await _tapSaveBill(tester);

    final draft = repository.lastCreateDraft;
    expect(repository.createCalls, 1);
    expect(draft?.merchantName, '  Brunch Spot  ');
    expect(draft?.billDate, _formatTestBillDate(DateTime.now()));
    expect(draft?.currency, 'USD');
    expect(draft?.items.single.name, '  Eggs  ');
    expect(draft?.items.single.amount, ' 12.30 ');
    expect(draft?.items.single.currency, 'USD');
    expect(draft?.items.single.note, '  table 4  ');
  });

  testWidgets(
    'create draft attachment removal updates list and keeps form state',
    (tester) async {
      final semantics = tester.ensureSemantics();
      final repository = FakeBillRepository(
        createdDetail: sampleBillDetail(
          id: _createdBillId,
          merchantName: 'Brunch Spot',
          billDate: '2026-05-23',
          totalAmount: '12.30',
          totalCurrency: 'USD',
        ),
      );
      final fileInput = FakeBillAttachmentFileInput(
        pickedFile: samplePickedAttachmentFile(
          filename: 'C:\\Users\\secret\\local-receipt.png',
          contentType: 'image/png',
          bytes: const [4, 5, 6],
        ),
      );

      await tester.binding.setSurfaceSize(const Size(900, 2200));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: repository,
            syncController: sampleBillSyncController(),
            attachmentRepository: FakeBillAttachmentRepository(),
            attachmentFileInput: fileInput,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('bill-list-create')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('personal-bill-merchant-name')),
        'Brunch Spot',
      );
      await _fillMinimalCreateForm(tester);

      expect(find.text('No attachments selected'), findsOneWidget);
      expect(find.text('0 attachments selected'), findsOneWidget);

      await tester.tap(find.byKey(const Key('personal-bill-attachment-add')));
      await tester.pump(const Duration(milliseconds: 300));
      final receiptPurposeTile = tester.widget<ListTile>(
        find.byKey(const Key('personal-bill-attachment-purpose-receipt')),
      );
      receiptPurposeTile.onTap?.call();
      await tester.pumpAndSettle();

      expect(fileInput.pickCalls, 1);
      expect(
        fileInput.lastAllowedContentTypes,
        SettleoraBillAttachmentContentTypeValues.receiptValues,
      );
      expect(find.text('1 attachment selected'), findsOneWidget);
      expect(find.text('local-receipt.png'), findsOneWidget);
      expect(find.text('Receipt'), findsOneWidget);
      expect(
        find.text(
          'Receipt evidence uploads after save; OCR review stays provisional.',
        ),
        findsOneWidget,
      );
      expect(find.text('No attachments selected'), findsNothing);
      expect(find.byTooltip('Remove selected bill attachment'), findsOneWidget);
      expect(
        find.bySemanticsLabel(
          RegExp(
            'Selected bill attachment 1.*Filename: local-receipt.png.*'
            'Content type: image/png.*Size: 3 bytes.*'
            'Selected purpose: Receipt',
          ),
        ),
        findsOneWidget,
      );
      expect(
        find.byTooltip('Change selected draft attachment 1 purpose'),
        findsOneWidget,
      );

      await tester.tap(
        find.byKey(const ValueKey('personal-bill-attachment-remove-0')),
      );
      await tester.pumpAndSettle();

      expect(find.text('0 attachments selected'), findsOneWidget);
      expect(find.text('No attachments selected'), findsOneWidget);
      expect(find.text('local-receipt.png'), findsNothing);
      expect(find.text('Receipt'), findsNothing);

      await _tapSaveBill(tester);

      final draft = repository.lastCreateDraft;
      expect(repository.createCalls, 1);
      expect(draft?.merchantName, 'Brunch Spot');
      expect(draft?.billDate, _formatTestBillDate(DateTime.now()));
      expect(draft?.items.single.name, 'Coffee');
      semantics.dispose();
    },
  );

  testWidgets(
    'create uploads selected draft attachments after personal bill create succeeds',
    (tester) async {
      await useLargeSurface(tester);
      final repository = FakeBillRepository(
        createdDetail: sampleBillDetail(
          id: _createdBillId,
          merchantName: 'Brunch Spot',
          billDate: '2026-05-23',
          totalAmount: '12.30',
          totalCurrency: 'USD',
        ),
      );
      final attachmentRepository = FakeBillAttachmentRepository();
      final fileInput = FakeBillAttachmentFileInput(
        pickedFiles: [
          samplePickedAttachmentFile(
            filename: 'C:\\Users\\secret\\receipt.png',
            contentType: 'image/png',
            bytes: const [4, 5, 6],
          ),
          samplePickedAttachmentFile(
            filename: 'support.pdf',
            contentType: 'application/pdf',
            bytes: const [7, 8, 9],
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: repository,
            syncController: sampleBillSyncController(),
            attachmentRepository: attachmentRepository,
            attachmentFileInput: fileInput,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('bill-list-create')));
      await tester.pumpAndSettle();
      await _fillMinimalCreateForm(tester);
      await _addDraftAttachment(
        tester,
        const Key('personal-bill-attachment-purpose-receipt'),
      );
      await _addDraftAttachment(
        tester,
        const Key('personal-bill-attachment-purpose-supporting'),
      );

      expect(find.text('2 attachments selected'), findsOneWidget);

      await _tapSaveBill(tester);

      expect(repository.createCalls, 1);
      expect(attachmentRepository.attachCalls, 2);
      expect(attachmentRepository.uploadRoutes.map((route) => route.billId), [
        _createdBillId,
        _createdBillId,
      ]);
      expect(attachmentRepository.uploads[0].purpose, 'receipt');
      expect(attachmentRepository.uploads[0].filename, 'receipt.png');
      expect(attachmentRepository.uploads[0].contentType, 'image/png');
      expect(attachmentRepository.uploads[0].bytes, const [4, 5, 6]);
      expect(
        attachmentRepository.uploads[1].purpose,
        SettleoraBillAttachmentPurposeValues.supportingAttachment,
      );
      expect(attachmentRepository.uploads[1].filename, 'support.pdf');
      expect(attachmentRepository.uploads[1].contentType, 'application/pdf');
      expect(attachmentRepository.uploads[1].bytes, const [7, 8, 9]);
      expect(find.text('Bill'), findsOneWidget);
      expect(find.text('Receipt'), findsOneWidget);
      expect(find.text('Supporting attachment'), findsOneWidget);
      expect(find.text('2 attachments selected'), findsNothing);
      expect(
        find.byKey(const Key('personal-bill-attachments-section')),
        findsNothing,
      );
    },
  );

  testWidgets(
    'create opens fresh draft attachments after cancel and successful upload',
    (tester) async {
      await useLargeSurface(tester);
      final repository = FakeBillRepository(
        createdDetail: sampleBillDetail(
          id: _createdBillId,
          merchantName: 'Brunch Spot',
          billDate: '2026-05-23',
          totalAmount: '12.30',
          totalCurrency: 'USD',
        ),
      );
      final attachmentRepository = FakeBillAttachmentRepository();
      final fileInput = FakeBillAttachmentFileInput(
        pickedFiles: [
          samplePickedAttachmentFile(
            filename: 'cancelled-receipt.png',
            contentType: 'image/png',
          ),
          samplePickedAttachmentFile(
            filename: 'uploaded-receipt.png',
            contentType: 'image/png',
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: repository,
            syncController: sampleBillSyncController(),
            attachmentRepository: attachmentRepository,
            attachmentFileInput: fileInput,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('bill-list-create')));
      await tester.pumpAndSettle();
      expect(find.text('0 attachments selected'), findsOneWidget);
      await _addDraftAttachment(
        tester,
        const Key('personal-bill-attachment-purpose-receipt'),
      );
      expect(find.text('1 attachment selected'), findsOneWidget);
      expect(find.text('cancelled-receipt.png'), findsOneWidget);

      await _discardPersonalBillCreateDraft(tester);
      await tester.tap(find.byKey(const Key('bill-list-create')));
      await tester.pumpAndSettle();

      expect(find.text('0 attachments selected'), findsOneWidget);
      expect(find.text('No attachments selected'), findsOneWidget);
      expect(find.text('cancelled-receipt.png'), findsNothing);

      await _fillMinimalCreateForm(tester);
      await _addDraftAttachment(
        tester,
        const Key('personal-bill-attachment-purpose-receipt'),
      );
      expect(find.text('uploaded-receipt.png'), findsOneWidget);
      await _tapSaveBill(tester);

      expect(repository.createCalls, 1);
      expect(attachmentRepository.attachCalls, 1);
      expect(
        attachmentRepository.uploads.single.filename,
        'uploaded-receipt.png',
      );
      expect(find.text('Bill'), findsOneWidget);

      await tester.pageBack();
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('bill-list-create')));
      await tester.pumpAndSettle();

      expect(find.text('0 attachments selected'), findsOneWidget);
      expect(find.text('No attachments selected'), findsOneWidget);
      expect(find.text('uploaded-receipt.png'), findsNothing);
      expect(find.text('cancelled-receipt.png'), findsNothing);
    },
  );

  testWidgets(
    'create rejects invalid draft attachment and preserves personal form state',
    (tester) async {
      await useLargeSurface(tester);
      final repository = FakeBillRepository(
        createdDetail: sampleBillDetail(
          id: _createdBillId,
          merchantName: 'Brunch Spot',
        ),
      );
      final attachmentRepository = FakeBillAttachmentRepository();
      final fileInput = FakeBillAttachmentFileInput(
        pickedFile: SettleoraPickedBillAttachmentFile(
          filename: 'empty-receipt.png',
          contentType: 'image/png',
          bytes: const [],
        ),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: repository,
            syncController: sampleBillSyncController(),
            attachmentRepository: attachmentRepository,
            attachmentFileInput: fileInput,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('bill-list-create')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('personal-bill-merchant-name')),
        'Brunch Spot',
      );
      await _fillMinimalCreateForm(tester);
      await _addDraftAttachment(
        tester,
        const Key('personal-bill-attachment-purpose-receipt'),
      );

      expect(fileInput.pickCalls, 1);
      expect(find.text('0 attachments selected'), findsOneWidget);
      expect(find.text('No attachments selected'), findsOneWidget);
      expect(
        find.text('Choose a non-empty file before uploading an attachment.'),
        findsOneWidget,
      );
      expect(find.text('empty-receipt.png'), findsNothing);
      expect(
        find.byKey(const ValueKey('personal-bill-attachment-purpose-menu-0')),
        findsNothing,
      );
      expect(attachmentRepository.attachCalls, 0);
      expect(attachmentRepository.removeCalls, 0);

      await _tapSaveBill(tester);

      final draft = repository.lastCreateDraft;
      expect(repository.createCalls, 1);
      expect(draft?.merchantName, 'Brunch Spot');
      expect(draft?.billDate, _formatTestBillDate(DateTime.now()));
      expect(draft?.items.single.name, 'Coffee');
      expect(attachmentRepository.attachCalls, 0);
      expect(attachmentRepository.removeCalls, 0);
    },
  );

  testWidgets(
    'create keeps duplicate filenames as separate personal draft attachments',
    (tester) async {
      await useLargeSurface(tester);
      final repository = FakeBillRepository(
        createdDetail: sampleBillDetail(id: _createdBillId),
      );
      final attachmentRepository = FakeBillAttachmentRepository();
      final fileInput = FakeBillAttachmentFileInput(
        pickedFiles: [
          samplePickedAttachmentFile(
            filename: 'receipt.png',
            contentType: 'image/png',
            bytes: const [1, 2, 3],
          ),
          samplePickedAttachmentFile(
            filename: 'receipt.png',
            contentType: 'image/png',
            bytes: const [4, 5, 6],
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: repository,
            syncController: sampleBillSyncController(),
            attachmentRepository: attachmentRepository,
            attachmentFileInput: fileInput,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('bill-list-create')));
      await tester.pumpAndSettle();
      await _fillMinimalCreateForm(tester);
      await _addDraftAttachment(
        tester,
        const Key('personal-bill-attachment-purpose-receipt'),
      );
      await _addDraftAttachment(
        tester,
        const Key('personal-bill-attachment-purpose-receipt'),
      );

      expect(find.text('2 attachments selected'), findsOneWidget);
      expect(find.text('receipt.png'), findsNWidgets(2));

      await _tapSaveBill(tester);

      expect(repository.createCalls, 1);
      expect(attachmentRepository.attachCalls, 2);
      expect(attachmentRepository.uploads.map((upload) => upload.filename), [
        'receipt.png',
        'receipt.png',
      ]);
      expect(attachmentRepository.uploads[0].bytes, const [1, 2, 3]);
      expect(attachmentRepository.uploads[1].bytes, const [4, 5, 6]);
    },
  );

  testWidgets(
    'create changes one duplicate personal draft attachment purpose locally',
    (tester) async {
      await useLargeSurface(tester);
      final repository = FakeBillRepository(
        createdDetail: sampleBillDetail(id: _createdBillId),
      );
      final attachmentRepository = FakeBillAttachmentRepository();
      final fileInput = FakeBillAttachmentFileInput(
        pickedFiles: [
          samplePickedAttachmentFile(
            filename: 'receipt.png',
            contentType: 'image/png',
            bytes: const [1, 2, 3],
          ),
          samplePickedAttachmentFile(
            filename: 'receipt.png',
            contentType: 'image/png',
            bytes: const [4, 5, 6],
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: repository,
            syncController: sampleBillSyncController(),
            attachmentRepository: attachmentRepository,
            attachmentFileInput: fileInput,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('bill-list-create')));
      await tester.pumpAndSettle();
      await _fillMinimalCreateForm(tester);
      await _addDraftAttachment(
        tester,
        const Key('personal-bill-attachment-purpose-receipt'),
      );
      await _addDraftAttachment(
        tester,
        const Key('personal-bill-attachment-purpose-receipt'),
      );

      await tester.tap(
        find.byKey(const ValueKey('personal-bill-attachment-purpose-menu-0')),
      );
      await tester.pumpAndSettle();

      expect(
        find.byKey(
          const ValueKey('personal-bill-attachment-purpose-choice-0-receipt'),
        ),
        findsOneWidget,
      );
      expect(
        find.byKey(
          const ValueKey(
            'personal-bill-attachment-purpose-choice-0-supporting',
          ),
        ),
        findsOneWidget,
      );

      await tester.tap(
        find.byKey(
          const ValueKey(
            'personal-bill-attachment-purpose-choice-0-supporting',
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        tester
            .widget<Text>(
              find.byKey(const ValueKey('personal-bill-attachment-purpose-0')),
            )
            .data,
        'Supporting attachment',
      );
      expect(
        tester
            .widget<Text>(
              find.byKey(const ValueKey('personal-bill-attachment-purpose-1')),
            )
            .data,
        'Receipt',
      );

      await tester.tap(
        find.byKey(const ValueKey('personal-bill-attachment-remove-0')),
      );
      await tester.pumpAndSettle();

      expect(find.text('1 attachment selected'), findsOneWidget);
      expect(find.text('receipt.png'), findsOneWidget);
      expect(find.text('Receipt'), findsOneWidget);
      expect(find.text('Supporting attachment'), findsNothing);
      expect(find.text('image/png - 3 bytes'), findsOneWidget);

      await _tapSaveBill(tester);

      expect(repository.createCalls, 1);
      expect(attachmentRepository.attachCalls, 1);
      expect(attachmentRepository.uploads.single.filename, 'receipt.png');
      expect(attachmentRepository.uploads.single.contentType, 'image/png');
      expect(attachmentRepository.uploads.single.bytes, const [4, 5, 6]);
      expect(
        attachmentRepository.uploads.single.purpose,
        SettleoraBillAttachmentPurposeValues.receipt,
      );
    },
  );

  testWidgets(
    'create without selected draft attachments does not call attachment upload',
    (tester) async {
      final repository = FakeBillRepository(
        createdDetail: sampleBillDetail(id: _createdBillId),
      );
      final attachmentRepository = FakeBillAttachmentRepository();

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: repository,
            syncController: sampleBillSyncController(),
            attachmentRepository: attachmentRepository,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('bill-list-create')));
      await tester.pumpAndSettle();
      await _fillMinimalCreateForm(tester);
      await _tapSaveBill(tester);

      expect(repository.createCalls, 1);
      expect(attachmentRepository.attachCalls, 0);
      expect(find.text('Bill'), findsOneWidget);
    },
  );

  testWidgets(
    'create failure preserves draft attachments and skips attachment upload',
    (tester) async {
      await useLargeSurface(tester);
      final repository = FakeBillRepository(
        createFailure: const SettleoraBillFailure(
          kind: SettleoraBillFailureKind.server,
          message: 'Bills are unavailable right now. Try again later.',
        ),
      );
      final attachmentRepository = FakeBillAttachmentRepository();
      final fileInput = FakeBillAttachmentFileInput(
        pickedFile: samplePickedAttachmentFile(
          filename: 'receipt.png',
          contentType: 'image/png',
        ),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: repository,
            syncController: sampleBillSyncController(),
            attachmentRepository: attachmentRepository,
            attachmentFileInput: fileInput,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('bill-list-create')));
      await tester.pumpAndSettle();
      await _fillMinimalCreateForm(tester);
      await _addDraftAttachment(
        tester,
        const Key('personal-bill-attachment-purpose-receipt'),
      );
      await _tapSaveBill(tester);

      expect(repository.createCalls, 1);
      expect(attachmentRepository.attachCalls, 0);
      expect(
        find.byKey(const Key('personal-bill-create-failure')),
        findsOneWidget,
      );
      expect(find.text('1 attachment selected'), findsOneWidget);
      expect(find.text('receipt.png'), findsOneWidget);
    },
  );

  testWidgets(
    'attachment upload failure after create is retryable without duplicate bill create',
    (tester) async {
      await useLargeSurface(tester);
      final semantics = tester.ensureSemantics();
      final repository = FakeBillRepository(
        createdDetail: sampleBillDetail(id: _createdBillId),
      );
      final attachmentRepository = FakeBillAttachmentRepository(
        attachFailuresByCall: const {
          2: SettleoraBillAttachmentFailure(
            kind: SettleoraBillAttachmentFailureKind.server,
            message: 'Attachments are unavailable right now. Try again later.',
          ),
        },
      );
      final fileInput = FakeBillAttachmentFileInput(
        pickedFiles: [
          samplePickedAttachmentFile(
            filename: 'receipt.png',
            contentType: 'image/png',
          ),
          samplePickedAttachmentFile(filename: 'support.pdf'),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: repository,
            syncController: sampleBillSyncController(),
            attachmentRepository: attachmentRepository,
            attachmentFileInput: fileInput,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('bill-list-create')));
      await tester.pumpAndSettle();
      await _fillMinimalCreateForm(tester);
      await _addDraftAttachment(
        tester,
        const Key('personal-bill-attachment-purpose-receipt'),
      );
      await _addDraftAttachment(
        tester,
        const Key('personal-bill-attachment-purpose-supporting'),
      );
      await _tapSaveBill(tester);

      expect(repository.createCalls, 1);
      expect(attachmentRepository.attachCalls, 2);
      expect(
        find.byKey(const Key('personal-bill-create-attachment-upload-failure')),
        findsOneWidget,
      );
      final failureBanner = tester.widget<Semantics>(
        find.byKey(const Key('personal-bill-create-attachment-upload-failure')),
      );
      expect(failureBanner.properties.liveRegion, isTrue);
      expect(
        failureBanner.properties.label,
        contains('Bill created, but some attachments were not uploaded.'),
      );
      expect(failureBanner.properties.label, isNot(contains('create failed')));
      expect(
        find.textContaining(
          'Bill created, but some attachments were not uploaded.',
        ),
        findsOneWidget,
      );
      expect(find.text('1 attachment selected'), findsOneWidget);
      expect(find.text('1 attachment'), findsOneWidget);
      expect(find.text('support.pdf'), findsOneWidget);
      expect(find.text('receipt.png'), findsNothing);
      expect(
        find.text(
          'Attachment retry is active for the remaining selected uploads.',
        ),
        findsOneWidget,
      );
      expect(find.text('Retry remaining attachment uploads'), findsOneWidget);
      expect(
        find.byTooltip('Retry remaining attachment uploads'),
        findsOneWidget,
      );

      await _tapSaveBill(tester);

      expect(repository.createCalls, 1);
      expect(attachmentRepository.attachCalls, 3);
      expect(attachmentRepository.uploads.last.filename, 'support.pdf');
      expect(find.text('Bill'), findsOneWidget);
      expect(find.text('Supporting attachment'), findsOneWidget);
      expect(find.text('1 attachment selected'), findsNothing);
      semantics.dispose();
    },
  );

  testWidgets(
    'attachment retry preserves only remaining personal upload rows',
    (tester) async {
      await useLargeSurface(tester);
      final repository = FakeBillRepository(
        createdDetail: sampleBillDetail(id: _createdBillId),
      );
      final attachmentRepository = FakeBillAttachmentRepository(
        attachFailuresByCall: const {
          2: SettleoraBillAttachmentFailure(
            kind: SettleoraBillAttachmentFailureKind.server,
            message: 'Second attachment failed.',
          ),
          4: SettleoraBillAttachmentFailure(
            kind: SettleoraBillAttachmentFailureKind.server,
            message: 'Third attachment failed.',
          ),
        },
      );
      final fileInput = FakeBillAttachmentFileInput(
        pickedFiles: [
          samplePickedAttachmentFile(
            filename: 'receipt.png',
            contentType: 'image/png',
            bytes: const [4, 5, 6],
          ),
          samplePickedAttachmentFile(
            filename: 'invoice.pdf',
            bytes: const [7, 8, 9, 10],
          ),
          samplePickedAttachmentFile(
            filename: 'counter-receipt.webp',
            contentType: 'image/webp',
            bytes: const [11, 12],
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: repository,
            syncController: sampleBillSyncController(),
            attachmentRepository: attachmentRepository,
            attachmentFileInput: fileInput,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('bill-list-create')));
      await tester.pumpAndSettle();
      await _fillMinimalCreateForm(tester);
      await _addDraftAttachment(
        tester,
        const Key('personal-bill-attachment-purpose-receipt'),
      );
      await _addDraftAttachment(
        tester,
        const Key('personal-bill-attachment-purpose-supporting'),
      );
      await _addDraftAttachment(
        tester,
        const Key('personal-bill-attachment-purpose-receipt'),
      );
      await _tapSaveBill(tester);

      expect(repository.createCalls, 1);
      expect(attachmentRepository.attachCalls, 2);
      expect(find.text('2 attachments selected'), findsOneWidget);
      expect(find.text('receipt.png'), findsNothing);
      expect(find.text('invoice.pdf'), findsOneWidget);
      expect(find.text('counter-receipt.webp'), findsOneWidget);

      await _tapSaveBill(tester);

      expect(repository.createCalls, 1);
      expect(attachmentRepository.attachCalls, 4);
      expect(attachmentRepository.uploads[2].filename, 'invoice.pdf');
      expect(find.text('1 attachment selected'), findsOneWidget);
      expect(find.text('invoice.pdf'), findsNothing);
      expect(find.text('counter-receipt.webp'), findsOneWidget);
      expect(find.text('Receipt'), findsOneWidget);
      expect(find.text('image/webp - 2 bytes'), findsOneWidget);
      expect(
        find.byKey(const Key('personal-bill-create-attachment-upload-failure')),
        findsOneWidget,
      );

      await _tapSaveBill(tester);

      expect(repository.createCalls, 1);
      expect(attachmentRepository.attachCalls, 5);
      expect(
        attachmentRepository.uploads.last.filename,
        'counter-receipt.webp',
      );
      expect(attachmentRepository.uploads.last.contentType, 'image/webp');
      expect(attachmentRepository.uploads.last.bytes, const [11, 12]);
      expect(
        attachmentRepository.uploads.last.purpose,
        SettleoraBillAttachmentPurposeValues.receipt,
      );
      expect(
        find.byKey(const Key('personal-bill-create-attachment-upload-failure')),
        findsNothing,
      );
      expect(find.text('Bill'), findsOneWidget);

      Navigator.of(tester.element(find.text('Bill'))).pop();
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('bill-list-create')));
      await tester.pumpAndSettle();

      expect(find.text('0 attachments selected'), findsOneWidget);
      expect(find.text('No attachments selected'), findsOneWidget);
      expect(
        find.byKey(const Key('personal-bill-create-attachment-upload-failure')),
        findsNothing,
      );
      expect(find.text('counter-receipt.webp'), findsNothing);
    },
  );

  testWidgets(
    'create submit and draft attachment controls are disabled while upload is running',
    (tester) async {
      await useLargeSurface(tester);
      final attachCompleter = Completer<void>();
      final repository = FakeBillRepository(
        createdDetail: sampleBillDetail(id: _createdBillId),
      );
      final attachmentRepository = FakeBillAttachmentRepository(
        attachCompleter: attachCompleter,
      );
      final fileInput = FakeBillAttachmentFileInput(
        pickedFile: samplePickedAttachmentFile(),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: repository,
            syncController: sampleBillSyncController(),
            attachmentRepository: attachmentRepository,
            attachmentFileInput: fileInput,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('bill-list-create')));
      await tester.pumpAndSettle();
      await _fillMinimalCreateForm(tester);
      await _addDraftAttachment(
        tester,
        const Key('personal-bill-attachment-purpose-supporting'),
      );

      await tester.tap(find.byKey(const Key('personal-bill-save')));
      await tester.pump();
      await tester.tap(
        find.byKey(const Key('personal-bill-save')),
        warnIfMissed: false,
      );
      await tester.tap(
        find.byKey(const ValueKey('personal-bill-attachment-remove-0')),
        warnIfMissed: false,
      );
      await tester.pump();

      expect(repository.createCalls, 1);
      expect(attachmentRepository.attachCalls, 1);
      final saveButton = tester.widget<FilledButton>(
        find.byKey(const Key('personal-bill-save')),
      );
      expect(saveButton.onPressed, isNull);
      final removeButton = tester.widget<IconButton>(
        find.byKey(const ValueKey('personal-bill-attachment-remove-0')),
      );
      expect(removeButton.onPressed, isNull);
      final purposeMenu = tester
          .widget<PopupMenuButton<SettleoraBillAttachmentPurpose>>(
            find.byKey(
              const ValueKey('personal-bill-attachment-purpose-menu-0'),
            ),
          );
      expect(purposeMenu.enabled, isFalse);
      expect(find.text('1 attachment selected'), findsOneWidget);

      attachCompleter.complete();
      await tester.pumpAndSettle();

      expect(repository.createCalls, 1);
      expect(attachmentRepository.attachCalls, 1);
      expect(find.text('Bill'), findsOneWidget);
    },
  );

  testWidgets(
    'successful create opens returned bill detail and refreshes back',
    (tester) async {
      final repository = FakeBillRepository(
        createdDetail: sampleBillDetail(
          id: _createdBillId,
          merchantName: 'Server Returned Market',
          billDate: '2026-05-23',
          totalAmount: '42.42',
          totalCurrency: 'EUR',
        ),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: repository,
            syncController: sampleBillSyncController(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('bill-list-create')));
      await tester.pumpAndSettle();
      await _fillMinimalCreateForm(tester);
      await _tapSaveBill(tester);

      expect(find.text('Bill'), findsOneWidget);
      expect(find.text('Server Returned Market'), findsOneWidget);
      expect(find.text('42.42 EUR'), findsOneWidget);
      expect(repository.getCalls, 0);

      await tester.pageBack();
      await tester.pumpAndSettle();

      expect(repository.listCalls, 2);
    },
  );

  testWidgets('create failure shows bounded safe copy and stays on form', (
    tester,
  ) async {
    final store = MemorySyncQueueStore();
    final syncRepository = FakeSyncRepository([]);
    final controller = SettleoraBillSyncController(
      queueStore: store,
      queueProcessor: SettleoraSyncQueueProcessor(
        queueStore: store,
        repository: syncRepository,
      ),
    );
    final repository = FakeBillRepository(
      bills: [sampleBillSummary(merchantName: 'Existing Market')],
      createFailure: const SettleoraBillFailure(
        kind: SettleoraBillFailureKind.server,
        message: 'Bills are unavailable right now. Try again later.',
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          syncController: controller,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('bill-list-create')));
    await tester.pumpAndSettle();
    await _fillMinimalCreateForm(tester);
    await _tapSaveBill(tester);

    expect(repository.createCalls, 1);
    expect(
      find.byKey(const Key('personal-bill-create-failure')),
      findsOneWidget,
    );
    expect(find.textContaining('Bills unavailable'), findsOneWidget);
    expect(
      find.textContaining('Bills are unavailable right now. Try again later.'),
      findsOneWidget,
    );
    expect(find.text('Create bill'), findsWidgets);
    expect(store.state.items, isEmpty);
    expect(syncRepository.submitCalls, 0);

    await _discardPersonalBillCreateDraft(tester);

    expect(find.text('Existing Market'), findsOneWidget);
    expect(repository.listCalls, 1);
  });

  testWidgets('group bill list and detail omit standalone global nav', (
    tester,
  ) async {
    final repository = FakeBillRepository(groupBills: [sampleBillSummary()]);

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupBillListScreen(
          repository: repository,
          groupRepository: FakeGroupRepository(),
          groupId: _groupId,
          groupName: 'Trip',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('bill-list-create')), findsNothing);
    expect(find.text('Create bill'), findsNothing);
    expect(find.byKey(const Key('group-bill-list-create')), findsOneWidget);
    expect(find.byKey(const Key('bottom-nav-groups')), findsNothing);

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('bill-list-create')), findsNothing);
    expect(find.text('Create bill'), findsNothing);
    expect(find.byKey(const Key('group-bill-list-create')), findsNothing);
    expect(find.byKey(const Key('bottom-nav-groups')), findsNothing);
  });

  testWidgets('group bill create exits without prompt when unchanged', (
    tester,
  ) async {
    await _pumpGroupBillCreate(
      tester,
      repository: FakeBillRepository(),
      groupRepository: FakeGroupRepository(
        members: [sampleGroupMember(displayName: 'Alex')],
      ),
    );

    await tester.tap(find.byKey(const Key('group-bill-list-create')));
    await tester.pumpAndSettle();
    await tester.pageBack();
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('group-bill-exit-guard-dialog')), findsNothing);
    expect(find.byKey(const Key('group-bill-list-create')), findsOneWidget);
  });

  testWidgets(
    'group bill create prompts before discarding row and member edits',
    (tester) async {
      await useLargeSurface(tester);
      await _pumpGroupBillCreate(
        tester,
        repository: FakeBillRepository(),
        groupRepository: FakeGroupRepository(
          members: [
            sampleGroupMember(
              userProfileId: 'member-alex-id',
              displayName: 'Alex',
            ),
            sampleGroupMember(
              userProfileId: 'member-taylor-id',
              displayName: 'Taylor',
            ),
          ],
        ),
      );

      await tester.tap(find.byKey(const Key('group-bill-list-create')));
      await tester.pumpAndSettle();
      await _goToGroupBillCreateStep(tester, 'receiptItems');
      await tester.enterText(
        find.byKey(const ValueKey('group-bill-item-name-0')),
        'Eggs',
      );
      await _assignFirstGroupBillItem(tester, memberId: 'member-taylor-id');
      await _goToGroupBillCreateStep(tester, 'payers');
      await tester.ensureVisible(find.byKey(const Key('group-bill-add-payer')));
      await tester.tap(find.byKey(const Key('group-bill-add-payer')));
      await tester.pumpAndSettle();

      await tester.pageBack();
      await tester.pumpAndSettle();

      expect(
        find.byKey(const Key('group-bill-exit-guard-dialog')),
        findsOneWidget,
      );

      await tester.tap(find.byKey(const Key('group-bill-exit-keep-editing')));
      await tester.pumpAndSettle();

      await _goToGroupBillCreateStep(tester, 'receiptItems');
      expect(
        find.byKey(const ValueKey('group-bill-item-name-0')),
        findsOneWidget,
      );
      expect(find.text('Eggs'), findsWidgets);
      await _goToGroupBillCreateStep(tester, 'split');
      expect(find.text('Taylor'), findsWidgets);
      await _goToGroupBillCreateStep(tester, 'payers');
      expect(
        find.byKey(const ValueKey('group-bill-payer-member-0')),
        findsOneWidget,
      );

      await tester.pageBack();
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('group-bill-exit-discard')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('group-bill-list-create')), findsOneWidget);
      expect(find.text('Eggs'), findsNothing);
    },
  );

  testWidgets('group bill payer member picker searches and selects safely', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeBillRepository();
    final memberRepository = FakeGroupRepository(
      members: [
        sampleGroupMember(userProfileId: 'member-alex-id', displayName: 'Alex'),
        sampleGroupMember(
          userProfileId: 'member-taylor-id',
          displayName: 'Taylor',
        ),
        sampleGroupMember(
          userProfileId: 'member-river-id',
          displayName: 'River',
        ),
      ],
    );

    await _pumpGroupBillCreate(
      tester,
      repository: repository,
      groupRepository: memberRepository,
    );

    await tester.tap(find.byKey(const Key('group-bill-list-create')));
    await tester.pumpAndSettle();
    await _goToGroupBillCreateStep(tester, 'payers');
    await tester.ensureVisible(find.byKey(const Key('group-bill-add-payer')));
    await tester.tap(find.byKey(const Key('group-bill-add-payer')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const ValueKey('group-bill-payer-member-0')),
    );
    await tester.tap(find.byKey(const ValueKey('group-bill-payer-member-0')));
    await tester.pumpAndSettle();

    expect(find.text('Choose payer member'), findsOneWidget);
    expect(find.text('Showing 3 of 3 members'), findsWidgets);
    expect(visibleText(tester), isNot(contains('member-taylor-id')));

    await tester.enterText(
      find.byKey(const ValueKey('group-bill-payer-member-search-0')),
      'tay',
    );
    await tester.pumpAndSettle();

    expect(find.text('Showing 1 of 3 members'), findsOneWidget);
    expect(find.text('Taylor'), findsOneWidget);
    expect(find.text('Alex'), findsNothing);

    await tester.tap(find.text('Taylor'));
    await tester.pumpAndSettle();

    expect(find.text('Taylor'), findsWidgets);
    expect(find.text('Choose member'), findsNothing);

    await _fillMinimalGroupBillCreateForm(
      tester,
      splitMemberId: 'member-taylor-id',
    );
    await _goToGroupBillCreateStep(tester, 'payers');
    await tester.enterText(
      find.byKey(const ValueKey('group-bill-payer-amount-0')),
      '12.30',
    );
    await tester.ensureVisible(
      find.byKey(const ValueKey('group-bill-payer-member-0')),
    );
    await tester.tap(find.byKey(const ValueKey('group-bill-payer-member-0')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Alex'));
    await tester.pumpAndSettle();
    await _tapSaveGroupBill(tester);

    final draft = repository.lastGroupCreateDraft;
    expect(repository.groupCreateCalls, 1);
    expect(repository.submitGroupCalls, 1);
    expect(draft?.items.single.splits.single.userProfileId, 'member-taylor-id');
    expect(draft?.payers.single.userProfileId, 'member-alex-id');
  });

  testWidgets('group bill payer member picker clears filtered search', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final memberRepository = FakeGroupRepository(
      members: [
        sampleGroupMember(userProfileId: 'member-alex-id', displayName: 'Alex'),
        sampleGroupMember(
          userProfileId: 'member-taylor-id',
          displayName: 'Taylor',
        ),
        sampleGroupMember(
          userProfileId: 'member-river-id',
          displayName: 'River',
        ),
      ],
    );

    await _pumpGroupBillCreate(
      tester,
      repository: FakeBillRepository(),
      groupRepository: memberRepository,
    );

    await tester.tap(find.byKey(const Key('group-bill-list-create')));
    await tester.pumpAndSettle();
    await _goToGroupBillCreateStep(tester, 'payers');
    await tester.ensureVisible(find.byKey(const Key('group-bill-add-payer')));
    await tester.tap(find.byKey(const Key('group-bill-add-payer')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const ValueKey('group-bill-payer-member-0')),
    );
    await tester.tap(find.byKey(const ValueKey('group-bill-payer-member-0')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('group-bill-payer-member-search-0')),
      'zzz',
    );
    await tester.pumpAndSettle();

    expect(find.text('Showing 0 of 3 members'), findsOneWidget);
    expect(find.text('No matching members'), findsOneWidget);
    expect(
      find.text('No loaded active members match this search.'),
      findsOneWidget,
    );

    await tester.tap(
      find.byKey(const ValueKey('group-bill-payer-member-clear-search-0')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Showing 3 of 3 members'), findsWidgets);
    expect(find.text('No matching members'), findsNothing);
    expect(find.text('Alex'), findsOneWidget);
    expect(find.text('Taylor'), findsOneWidget);
    expect(find.text('River'), findsOneWidget);
  });

  testWidgets('group bill create review checklist tracks local form state', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final fileInput = FakeBillAttachmentFileInput(
      pickedFile: samplePickedAttachmentFile(
        filename: 'receipt.png',
        contentType: 'image/png',
        bytes: const [4, 5, 6],
      ),
    );
    final memberRepository = FakeGroupRepository(
      members: [
        sampleGroupMember(userProfileId: 'member-alex-id', displayName: 'Alex'),
        sampleGroupMember(
          userProfileId: 'member-taylor-id',
          displayName: 'Taylor',
        ),
      ],
    );

    await _pumpGroupBillCreate(
      tester,
      repository: FakeBillRepository(),
      groupRepository: memberRepository,
      attachmentRepository: FakeBillAttachmentRepository(),
      attachmentFileInput: fileInput,
    );

    await tester.tap(find.byKey(const Key('group-bill-list-create')));
    await tester.pumpAndSettle();
    await _goToGroupBillCreateStep(tester, 'review');

    expect(
      find.byKey(const Key('group-bill-create-review-checklist')),
      findsOneWidget,
    );
    expect(find.text('Review before submit'), findsOneWidget);
    expect(
      find.text(
        'Local form checklist only. The server still validates final bill accounting.',
      ),
      findsOneWidget,
    );
    expect(find.text('1 item row'), findsOneWidget);
    expect(find.text('1 split row'), findsOneWidget);
    expect(find.text('0 payer rows'), findsOneWidget);
    expect(find.text('0 attachments'), findsOneWidget);
    expect(find.text('2 active members'), findsOneWidget);
    expect(find.text('Selected members: none yet'), findsOneWidget);
    expect(find.text('1 split row without a selected member.'), findsOneWidget);
    expect(find.text('No payer rows yet.'), findsOneWidget);
    expect(
      find.text('No attachments selected; attachments are optional.'),
      findsOneWidget,
    );
    expect(visibleText(tester), isNot(contains('member-alex-id')));
    expect(visibleText(tester), isNot(contains('member-taylor-id')));

    await _goToGroupBillCreateStep(tester, 'receiptItems');
    await tester.tap(find.byKey(const Key('group-bill-add-item')));
    await tester.pumpAndSettle();
    await _goToGroupBillCreateStep(tester, 'review');

    expect(find.text('2 item rows'), findsOneWidget);
    expect(find.text('2 split rows'), findsOneWidget);
    expect(
      find.text('2 split rows without a selected member.'),
      findsOneWidget,
    );

    await _goToGroupBillCreateStep(tester, 'receiptItems');
    await tester.ensureVisible(
      find.byKey(const ValueKey('group-bill-item-remove-1')),
    );
    await tester.tap(find.byKey(const ValueKey('group-bill-item-remove-1')));
    await tester.pumpAndSettle();
    await _goToGroupBillCreateStep(tester, 'review');

    expect(find.text('1 item row'), findsOneWidget);
    expect(find.text('1 split row'), findsOneWidget);

    await _goToGroupBillCreateStep(tester, 'payers');
    await tester.tap(find.byKey(const Key('group-bill-add-payer')));
    await tester.pumpAndSettle();
    await _goToGroupBillCreateStep(tester, 'review');

    expect(find.text('1 payer row'), findsOneWidget);
    expect(find.text('1 payer row without a selected member.'), findsOneWidget);

    await _assignFirstGroupBillItem(tester, memberId: 'member-taylor-id');
    await _goToGroupBillCreateStep(tester, 'review');

    expect(find.text('Selected members: Taylor'), findsOneWidget);
    expect(find.text('All split rows have selected members.'), findsOneWidget);
    expect(find.text('1 split row without a selected member.'), findsNothing);
    expect(visibleText(tester), isNot(contains('member-taylor-id')));

    await _goToGroupBillCreateStep(tester, 'payers');
    await tester.ensureVisible(
      find.byKey(const ValueKey('group-bill-payer-member-0')),
    );
    await tester.tap(find.byKey(const ValueKey('group-bill-payer-member-0')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Alex'));
    await tester.pumpAndSettle();
    await _goToGroupBillCreateStep(tester, 'review');

    expect(find.text('Selected members: Alex, Taylor'), findsOneWidget);
    expect(find.text('All payer rows have selected members.'), findsOneWidget);
    expect(find.text('1 payer row without a selected member.'), findsNothing);
    expect(visibleText(tester), isNot(contains('member-alex-id')));

    await _addGroupDraftAttachment(
      tester,
      const Key('group-bill-attachment-purpose-receipt'),
    );
    await _goToGroupBillCreateStep(tester, 'review');

    expect(find.text('1 attachment'), findsOneWidget);
    expect(
      find.text(
        'Attachments are selected for upload after draft creation. Receipt OCR stays provisional until reviewed.',
      ),
      findsOneWidget,
    );

    await _goToGroupBillCreateStep(tester, 'receiptItems');
    await tester.ensureVisible(
      find.byKey(const ValueKey('group-bill-attachment-remove-0')),
    );
    await tester.tap(
      find.byKey(const ValueKey('group-bill-attachment-remove-0')),
    );
    await tester.pumpAndSettle();
    await _goToGroupBillCreateStep(tester, 'review');

    expect(find.text('0 attachments'), findsOneWidget);
    expect(
      find.text('No attachments selected; attachments are optional.'),
      findsOneWidget,
    );
  });

  testWidgets('group bill create exposes guided sections and groups nav', (
    tester,
  ) async {
    await useLargeSurface(tester);
    await _pumpGroupBillCreate(
      tester,
      repository: FakeBillRepository(),
      groupRepository: FakeGroupRepository(
        members: [sampleGroupMember(displayName: 'Alex')],
      ),
    );

    await tester.tap(find.byKey(const Key('group-bill-list-create')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('group-bill-create-stepper')), findsOneWidget);
    expect(find.text('Create group bill start'), findsOneWidget);
    expect(find.text('Manual entry'), findsOneWidget);
    expect(find.text('Scan receipt'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('group-bill-create-section-basics')),
      findsNothing,
    );
    expect(find.byKey(const Key('group-bill-next-step')), findsOneWidget);

    await _goToGroupBillCreateStep(tester, 'basics');
    expect(
      find.byKey(const ValueKey('group-bill-create-section-basics')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('group-bill-create-section-split')),
      findsNothing,
    );

    await _goToGroupBillCreateStep(tester, 'review');
    expect(find.text('Server validation still applies'), findsOneWidget);
    expect(find.byKey(const Key('group-bill-save')), findsOneWidget);
    expect(find.byKey(const Key('bottom-nav-groups')), findsNothing);
  });

  testWidgets('group bill receipt mode back returns to start', (tester) async {
    await useLargeSurface(tester);
    await _pumpGroupBillCreate(
      tester,
      repository: FakeBillRepository(),
      groupRepository: FakeGroupRepository(
        members: [sampleGroupMember(displayName: 'Alex')],
      ),
    );

    await tester.tap(find.byKey(const Key('group-bill-list-create')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('group-bill-create-mode-receipt')));
    await tester.pumpAndSettle();

    expect(find.text('Ready for receipt import'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('group-bill-create-section-basics')),
      findsNothing,
    );

    await tester.tap(find.byKey(const Key('group-bill-back-step')));
    await tester.pumpAndSettle();

    expect(find.text('Create group bill start'), findsOneWidget);
    expect(find.text('Ready for receipt import'), findsNothing);
    expect(
      find.byKey(const ValueKey('group-bill-create-section-basics')),
      findsNothing,
    );
  });

  testWidgets('group bill receipt scan shows unsupported manual path', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final receiptOcrProvider = FakeReceiptOcrProvider(
      const ReceiptOcrResult.unsupported(
        'Receipt reading is not available on this device yet. You can still enter the bill manually.',
      ),
    );
    await _pumpGroupBillCreate(
      tester,
      repository: FakeBillRepository(),
      groupRepository: FakeGroupRepository(
        members: [sampleGroupMember(displayName: 'Alex')],
      ),
      attachmentRepository: FakeBillAttachmentRepository(),
      attachmentFileInput: FakeBillAttachmentFileInput(
        pickedFile: samplePickedAttachmentFile(
          filename: 'group-receipt.png',
          contentType: 'image/png',
          bytes: const [9, 8, 7],
        ),
      ),
      receiptOcrProvider: receiptOcrProvider,
    );

    await tester.tap(find.byKey(const Key('group-bill-list-create')));
    await tester.pumpAndSettle();
    await _goToGroupBillCreateStep(tester, 'receiptItems');
    await tester.tap(find.byKey(const Key('group-bill-scan-receipt')));
    await tester.pumpAndSettle();

    expect(receiptOcrProvider.calls, 1);
    expect(receiptOcrProvider.lastRequest?.bytes, const [9, 8, 7]);
    expect(receiptOcrProvider.lastRequest?.fallbackCurrency, 'USD');
    expect(
      find.byKey(const Key('group-bill-ocr-preview-panel')),
      findsOneWidget,
    );
    expect(find.text('Manual entry'), findsOneWidget);
    expect(
      find.textContaining('You can still enter the bill manually'),
      findsOneWidget,
    );
    expect(find.byKey(const Key('group-bill-ocr-apply')), findsNothing);
    expect(find.byKey(const Key('group-bill-ocr-retry')), findsOneWidget);

    await tester.enterText(
      find.byKey(const ValueKey('group-bill-item-name-0')),
      'Manual noodles',
    );
    expect(
      tester
          .widget<TextFormField>(
            find.byKey(const ValueKey('group-bill-item-name-0')),
          )
          .controller
          ?.text,
      'Manual noodles',
    );

    await tester.tap(find.byKey(const Key('group-bill-ocr-retry')));
    await tester.pumpAndSettle();

    expect(receiptOcrProvider.calls, 2);
    expect(
      tester
          .widget<TextFormField>(
            find.byKey(const ValueKey('group-bill-item-name-0')),
          )
          .controller
          ?.text,
      'Manual noodles',
    );
  });

  testWidgets(
    'group OCR duplicate warning reviews existing bill without changing draft',
    (tester) async {
      await useLargeSurface(tester);
      final repository = FakeBillRepository(
        groupBills: [
          sampleBillSummary(
            id: 'existing-group-bill-id',
            merchantName: 'Dim Sum House',
            billDate: '2026-06-11',
            totalAmount: '76.0',
            totalCurrency: 'HKD',
          ),
        ],
        details: [
          sampleBillDetail(
            id: 'existing-group-bill-id',
            merchantName: 'Dim Sum House',
            billDate: '2026-06-11',
            totalAmount: '76.0',
            totalCurrency: 'HKD',
          ),
        ],
      );
      final receiptOcrProvider = FakeReceiptOcrProvider(
        const ReceiptOcrResult.extracted(
          ReceiptOcrPreview(
            merchant: 'Dim Sum House Ltd.',
            receiptDate: '2026-06-11',
            currency: 'HKD',
            total: '76.00',
            items: [
              ReceiptOcrItemCandidate(
                description: 'Dumplings',
                quantity: '2',
                lineTotal: '76.00',
                currency: 'HKD',
              ),
            ],
          ),
        ),
      );

      await _pumpGroupBillCreate(
        tester,
        repository: repository,
        groupRepository: FakeGroupRepository(
          members: [sampleGroupMember(displayName: 'Alex')],
        ),
        attachmentRepository: FakeBillAttachmentRepository(),
        attachmentFileInput: FakeBillAttachmentFileInput(
          pickedFile: samplePickedAttachmentFile(
            filename: 'group-receipt.png',
            contentType: 'image/png',
            bytes: const [9, 8, 7],
          ),
        ),
        receiptOcrProvider: receiptOcrProvider,
      );

      await tester.tap(find.byKey(const Key('group-bill-list-create')));
      await tester.pumpAndSettle();
      await _goToGroupBillCreateStep(tester, 'basics');
      await tester.enterText(
        find.byKey(const Key('group-bill-merchant-name')),
        'Manual group draft',
      );
      await _goToGroupBillCreateStep(tester, 'receiptItems');
      await tester.tap(find.byKey(const Key('group-bill-scan-receipt')));
      await tester.pumpAndSettle();

      expect(
        find.byKey(const Key('receipt-ocr-duplicate-warning')),
        findsOneWidget,
      );
      expect(find.text('Dim Sum House'), findsOneWidget);
      expect(find.text('2026-06-11 · HKD 76.0'), findsOneWidget);
      expect(
        find.byKey(const Key('receipt-ocr-duplicate-review-bill')),
        findsOneWidget,
      );
      expect(find.byKey(const Key('group-bill-ocr-apply')), findsOneWidget);

      await tester.tap(
        find.byKey(const Key('receipt-ocr-duplicate-review-bill')),
      );
      await tester.pumpAndSettle();

      expect(repository.getGroupCalls, 1);
      expect(repository.groupCreateCalls, 0);
      expect(
        find.byKey(const Key('group-bill-detail-refresh')),
        findsOneWidget,
      );

      await tester.pageBack();
      await tester.pumpAndSettle();

      expect(
        find.byKey(const Key('group-bill-ocr-preview-panel')),
        findsOneWidget,
      );
      expect(find.byKey(const Key('group-bill-ocr-apply')), findsOneWidget);
      await _goToGroupBillCreateStep(tester, 'basics');
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const Key('group-bill-merchant-name')),
            )
            .controller
            ?.text,
        'Manual group draft',
      );
      expect(repository.groupCreateCalls, 0);
    },
  );

  testWidgets('group OCR duplicate save confirmation can save anyway', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeBillRepository(
      groupBills: [
        sampleBillSummary(
          id: 'existing-group-bill-id',
          merchantName: 'Dim Sum House',
          billDate: '2026-06-11',
          totalAmount: '76.0',
          totalCurrency: 'HKD',
        ),
      ],
      createdDetail: sampleBillDetail(
        id: _createdBillId,
        merchantName: 'Dim Sum House',
        billDate: '2026-06-11',
        totalAmount: '76.00',
        totalCurrency: 'HKD',
      ),
    );
    final receiptOcrProvider = FakeReceiptOcrProvider(
      const ReceiptOcrResult.extracted(
        ReceiptOcrPreview(
          merchant: 'Dim Sum House Ltd.',
          receiptDate: '2026-06-11',
          currency: 'HKD',
          total: '76.00',
          items: [
            ReceiptOcrItemCandidate(
              description: 'Dumplings',
              quantity: '2',
              lineTotal: '76.00',
              currency: 'HKD',
            ),
          ],
        ),
      ),
    );

    await _pumpGroupBillCreate(
      tester,
      repository: repository,
      groupRepository: FakeGroupRepository(
        members: [sampleGroupMember(displayName: 'Alex')],
      ),
      attachmentRepository: FakeBillAttachmentRepository(),
      attachmentFileInput: FakeBillAttachmentFileInput(
        pickedFile: samplePickedAttachmentFile(
          filename: 'group-receipt.png',
          contentType: 'image/png',
          bytes: const [9, 8, 7],
        ),
      ),
      receiptOcrProvider: receiptOcrProvider,
    );

    await tester.tap(find.byKey(const Key('group-bill-list-create')));
    await tester.pumpAndSettle();
    await _goToGroupBillCreateStep(tester, 'receiptItems');
    await tester.tap(find.byKey(const Key('group-bill-scan-receipt')));
    await tester.pumpAndSettle();
    await _tapReceiptOcrApply(tester, 'group-bill');
    await _assignFirstGroupBillItem(tester);
    await _tapSaveGroupBill(tester);

    expect(
      find.byKey(const Key('receipt-ocr-duplicate-save-dialog')),
      findsOneWidget,
    );
    expect(find.text('Possible duplicate receipt'), findsWidgets);
    expect(
      find.byKey(const Key('receipt-ocr-duplicate-save-match-title')),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('receipt-ocr-duplicate-save-review-bill')),
      findsOneWidget,
    );
    expect(repository.groupCreateCalls, 0);
    expect(repository.submitGroupCalls, 0);

    await tester.tap(
      find.byKey(const Key('receipt-ocr-duplicate-save-anyway')),
    );
    await tester.pumpAndSettle();

    expect(repository.groupCreateCalls, 1);
    expect(repository.submitGroupCalls, 1);
    expect(repository.lastGroupCreateDraft?.merchantName, 'Dim Sum House Ltd.');
    expect(repository.lastGroupCreateDraft?.items.single.amount, '76.00');
  });

  testWidgets(
    'group OCR duplicate confirmation preserves corrected draft across actions',
    (tester) async {
      await useLargeSurface(tester);
      final repository = FakeBillRepository(
        groupBills: [
          sampleBillSummary(
            id: 'existing-group-bill-id',
            merchantName: 'Corrected Noodle House',
            billDate: '2026-06-13',
            totalAmount: '88.0',
            totalCurrency: 'USD',
          ),
        ],
        details: [
          sampleBillDetail(
            id: 'existing-group-bill-id',
            merchantName: 'Corrected Noodle House',
            billDate: '2026-06-13',
            totalAmount: '88.0',
            totalCurrency: 'USD',
          ),
        ],
        createdDetail: sampleBillDetail(id: _createdBillId),
      );
      final receiptOcrProvider = FakeReceiptOcrProvider(
        const ReceiptOcrResult.extracted(
          ReceiptOcrPreview(
            merchant: 'Unmatched Group Store',
            receiptDate: '2026-06-12',
            currency: 'HKD',
            total: '88.00',
            items: [
              ReceiptOcrItemCandidate(
                description: 'Noodles',
                quantity: '1',
                lineTotal: '88.00',
                currency: 'USD',
              ),
            ],
          ),
        ),
      );

      await _pumpGroupBillCreate(
        tester,
        repository: repository,
        groupRepository: FakeGroupRepository(
          members: [sampleGroupMember(displayName: 'Alex')],
        ),
        attachmentRepository: FakeBillAttachmentRepository(),
        attachmentFileInput: FakeBillAttachmentFileInput(
          pickedFile: samplePickedAttachmentFile(
            filename: 'group-receipt.png',
            contentType: 'image/png',
            bytes: const [9],
          ),
        ),
        receiptOcrProvider: receiptOcrProvider,
      );

      await tester.tap(find.byKey(const Key('group-bill-list-create')));
      await tester.pumpAndSettle();
      await _goToGroupBillCreateStep(tester, 'receiptItems');
      await tester.tap(find.byKey(const Key('group-bill-scan-receipt')));
      await tester.pumpAndSettle();
      expect(
        find.byKey(const Key('receipt-ocr-duplicate-warning')),
        findsNothing,
      );

      await tester.enterText(
        find.byKey(const Key('group-bill-ocr-edit-merchant')),
        'Corrected Noodle House Ltd.',
      );
      await tester.enterText(
        find.byKey(const Key('group-bill-ocr-edit-date')),
        '2026-06-13',
      );
      await _selectCurrency(
        tester,
        find.byKey(const Key('group-bill-ocr-edit-currency')),
        'USD',
      );
      await tester.pumpAndSettle();
      expect(
        find.byKey(const Key('receipt-ocr-duplicate-warning')),
        findsOneWidget,
      );

      await _tapReceiptOcrApply(tester, 'group-bill');
      await _assignFirstGroupBillItem(tester);
      await _tapSaveGroupBill(tester);

      expect(
        find.byKey(const Key('receipt-ocr-duplicate-save-dialog')),
        findsOneWidget,
      );
      await tester.tap(
        find.byKey(const Key('receipt-ocr-duplicate-save-cancel')),
      );
      await tester.pumpAndSettle();
      expect(repository.groupCreateCalls, 0);
      await _goToGroupBillCreateStep(tester, 'basics');
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const Key('group-bill-merchant-name')),
            )
            .controller
            ?.text,
        'Corrected Noodle House Ltd.',
      );

      await _tapSaveGroupBill(tester);
      await tester.tap(
        find.byKey(const Key('receipt-ocr-duplicate-save-review-bill')),
      );
      await tester.pumpAndSettle();
      expect(repository.getGroupCalls, 1);
      expect(
        find.byKey(const Key('group-bill-detail-refresh')),
        findsOneWidget,
      );

      await tester.pageBack();
      await tester.pumpAndSettle();
      await _goToGroupBillCreateStep(tester, 'basics');
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const Key('group-bill-merchant-name')),
            )
            .controller
            ?.text,
        'Corrected Noodle House Ltd.',
      );

      await _tapSaveGroupBill(tester);
      await tester.tap(
        find.byKey(const Key('receipt-ocr-duplicate-save-anyway')),
      );
      await tester.pumpAndSettle();

      expect(repository.groupCreateCalls, 1);
      expect(
        repository.lastGroupCreateDraft?.merchantName,
        'Corrected Noodle House Ltd.',
      );
      expect(repository.lastGroupCreateDraft?.billDate, '2026-06-13');
      expect(repository.lastGroupCreateDraft?.currency, 'USD');
    },
  );

  testWidgets('group bill receipt image cancel leaves draft unchanged', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final receiptImageIntake = FakeReceiptImageIntake();
    await _pumpGroupBillCreate(
      tester,
      repository: FakeBillRepository(),
      groupRepository: FakeGroupRepository(
        members: [sampleGroupMember(displayName: 'Alex')],
      ),
      attachmentRepository: FakeBillAttachmentRepository(),
      attachmentFileInput: FakeBillAttachmentFileInput(),
      receiptImageIntake: receiptImageIntake,
      receiptOcrProvider: FakeReceiptOcrProvider(
        const ReceiptOcrResult.failed('Should not run.'),
      ),
    );

    await tester.tap(find.byKey(const Key('group-bill-list-create')));
    await tester.pumpAndSettle();
    await _goToGroupBillCreateStep(tester, 'receiptItems');
    await tester.enterText(
      find.byKey(const ValueKey('group-bill-item-name-0')),
      'Manual bun',
    );
    await tester.tap(find.byKey(const Key('group-bill-scan-receipt')));
    await tester.pump(const Duration(milliseconds: 500));

    expect(
      find.byKey(const Key('group-bill-receipt-image-source-cancel')),
      findsOneWidget,
    );
    expect(find.byKey(const Key('receipt-capture-guidance')), findsOneWidget);
    expect(find.text('Take receipt photo'), findsOneWidget);
    expect(find.text('Choose from photos'), findsOneWidget);
    expect(find.text('Use manual entry'), findsOneWidget);
    expect(find.text('Fit the whole receipt in frame.'), findsOneWidget);
    expect(
      find.text('Choose from photos if camera capture is inconvenient.'),
      findsOneWidget,
    );
    Navigator.of(
      tester.element(find.byType(SettleoraGroupBillCreateScreen)),
    ).pop();
    await tester.pump(const Duration(milliseconds: 500));

    expect(receiptImageIntake.pickCalls, 0);
    expect(find.text('0 attachments selected'), findsOneWidget);
    expect(find.byKey(const Key('group-bill-attachment-error')), findsNothing);
    expect(find.byKey(const Key('group-bill-ocr-apply')), findsNothing);
    expect(
      tester
          .widget<TextFormField>(
            find.byKey(const ValueKey('group-bill-item-name-0')),
          )
          .controller
          ?.text,
      'Manual bun',
    );
  });

  testWidgets('group bill receipt image failure is safe and keeps manual entry', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final receiptImageIntake = FakeReceiptImageIntake(
      failure: const SettleoraBillAttachmentFileInputFailure(
        'Could not read /tmp/private-receipt.jpg',
      ),
    );
    await _pumpGroupBillCreate(
      tester,
      repository: FakeBillRepository(),
      groupRepository: FakeGroupRepository(
        members: [sampleGroupMember(displayName: 'Alex')],
      ),
      attachmentRepository: FakeBillAttachmentRepository(),
      attachmentFileInput: FakeBillAttachmentFileInput(),
      receiptImageIntake: receiptImageIntake,
      receiptOcrProvider: FakeReceiptOcrProvider(
        const ReceiptOcrResult.failed('Should not run.'),
      ),
    );

    await tester.tap(find.byKey(const Key('group-bill-list-create')));
    await tester.pumpAndSettle();
    await _goToGroupBillCreateStep(tester, 'receiptItems');
    await tester.enterText(
      find.byKey(const ValueKey('group-bill-item-name-0')),
      'Manual tea',
    );
    await tester.tap(find.byKey(const Key('group-bill-scan-receipt')));
    await tester.pump(const Duration(milliseconds: 500));
    Navigator.of(
      tester.element(find.byType(SettleoraGroupBillCreateScreen)),
    ).pop(ReceiptImageSource.gallery);
    await tester.pump(const Duration(milliseconds: 500));

    expect(receiptImageIntake.pickCalls, 1);
    expect(receiptImageIntake.lastSource, ReceiptImageSource.gallery);
    expect(
      find.text(
        'The receipt image could not be selected. Manual entry is still available.',
      ),
      findsOneWidget,
    );
    expect(find.textContaining('/tmp/private-receipt.jpg'), findsNothing);
    expect(find.text('0 attachments selected'), findsOneWidget);
    expect(
      tester
          .widget<TextFormField>(
            find.byKey(const ValueKey('group-bill-item-name-0')),
          )
          .controller
          ?.text,
      'Manual tea',
    );
  });

  testWidgets(
    'group bill OCR review cancel leaves draft unchanged and apply preserves assignments',
    (tester) async {
      await useLargeSurface(tester);
      final repository = FakeBillRepository();
      final attachmentRepository = FakeBillAttachmentRepository();
      final receiptRepository = FakeReceiptOcrReviewRepository();
      final receiptOcrProvider = FakeReceiptOcrProvider(
        const ReceiptOcrResult.extracted(
          ReceiptOcrPreview(
            merchant: 'Dim Sum House',
            receiptDate: '2026-06-11',
            currency: 'HKD',
            subtotal: '68.00',
            service: '6.00',
            tax: '2.00',
            total: '76.00',
            rawTextLineCount: 6,
            items: [
              ReceiptOcrItemCandidate(
                description: 'Dumplings',
                quantity: '2',
                unitPrice: '18.00',
                lineTotal: '36.00',
                currency: 'HKD',
              ),
              ReceiptOcrItemCandidate(
                description: 'Tea',
                quantity: '1',
                lineTotal: '32.00',
                currency: 'HKD',
              ),
            ],
          ),
        ),
      );
      await _pumpGroupBillCreate(
        tester,
        repository: repository,
        groupRepository: FakeGroupRepository(
          members: [
            sampleGroupMember(displayName: 'Alex'),
            sampleGroupMember(
              userProfileId: 'member-taylor-id',
              displayName: 'Taylor',
            ),
          ],
        ),
        attachmentRepository: attachmentRepository,
        attachmentFileInput: FakeBillAttachmentFileInput(
          pickedFile: samplePickedAttachmentFile(
            filename: 'shared-receipt.png',
            contentType: 'image/png',
            bytes: const [4, 5, 6],
          ),
        ),
        receiptOcrReviewRepository: receiptRepository,
        receiptOcrProvider: receiptOcrProvider,
      );

      await tester.tap(find.byKey(const Key('group-bill-list-create')));
      await tester.pumpAndSettle();
      await _goToGroupBillCreateStep(tester, 'basics');
      await tester.enterText(
        find.byKey(const Key('group-bill-merchant-name')),
        'Manual Cafe',
      );
      await _goToGroupBillCreateStep(tester, 'receiptItems');
      await tester.enterText(
        find.byKey(const ValueKey('group-bill-item-name-0')),
        'Manual bun',
      );
      await tester.enterText(
        find.byKey(const ValueKey('group-bill-item-amount-0')),
        '12.00',
      );
      await _assignFirstGroupBillItem(tester, memberId: 'member-taylor-id');
      await _goToGroupBillCreateStep(tester, 'payers');
      await tester.tap(find.byKey(const Key('group-bill-add-payer')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('group-bill-payer-member-0')));
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const ValueKey('group-bill-member-picker-member-taylor-id')),
      );
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('group-bill-payer-amount-0')),
        '12.00',
      );

      await _goToGroupBillCreateStep(tester, 'receiptItems');
      await tester.tap(find.byKey(const Key('group-bill-scan-receipt')));
      await tester.pumpAndSettle();

      expect(find.text('Review receipt suggestions'), findsOneWidget);
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const Key('group-bill-ocr-edit-merchant')),
            )
            .controller
            ?.text,
        'Dim Sum House',
      );
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const Key('group-bill-ocr-edit-date')),
            )
            .controller
            ?.text,
        '2026-06-11',
      );
      expect(
        tester
            .widget<CurrencySelector>(
              find.byKey(const Key('group-bill-ocr-edit-currency')),
            )
            .value,
        'HKD',
      );
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const ValueKey('group-bill-ocr-item-description-0')),
            )
            .controller
            ?.text,
        'Dumplings',
      );
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const ValueKey('group-bill-ocr-item-line-total-1')),
            )
            .controller
            ?.text,
        '32.00',
      );
      expect(find.text('Receipt totals for review only'), findsOneWidget);
      expect(
        find.text('Subtotal suggested: HKD 68.00 (review only)'),
        findsOneWidget,
      );
      expect(
        find.text('Tax suggested: HKD 2.00 (review only)'),
        findsOneWidget,
      );
      expect(
        find.text('Service charge suggested: HKD 6.00 (review only)'),
        findsOneWidget,
      );
      expect(
        find.text('Grand total suggested: HKD 76.00 (review only)'),
        findsOneWidget,
      );
      expect(
        find.text(
          'Detected tax/service/discount may explain why item totals differ from the grand total.',
        ),
        findsOneWidget,
      );
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(
                const Key('group-bill-merchant-name'),
                skipOffstage: false,
              ),
            )
            .controller
            ?.text,
        'Manual Cafe',
      );
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const ValueKey('group-bill-item-name-0')),
            )
            .controller
            ?.text,
        'Manual bun',
      );
      expect(
        tester
            .widget<CheckboxListTile>(
              find.byKey(const Key('group-bill-ocr-apply-merchant')),
            )
            .value,
        isFalse,
      );
      expect(
        tester
            .widget<CheckboxListTile>(
              find.byKey(const Key('group-bill-ocr-apply-items')),
            )
            .value,
        isFalse,
      );

      await tester.enterText(
        find.byKey(const Key('group-bill-ocr-edit-merchant')),
        'Corrected Dim Sum',
      );
      await tester.tap(find.byKey(const Key('group-bill-ocr-add-item')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('group-bill-ocr-item-description-2')),
        'Soup',
      );
      await tester.enterText(
        find.byKey(const ValueKey('group-bill-ocr-item-quantity-2')),
        '1',
      );
      await tester.enterText(
        find.byKey(const ValueKey('group-bill-ocr-item-line-total-2')),
        '8.00',
      );
      await _selectCurrency(
        tester,
        find.byKey(const ValueKey('group-bill-ocr-item-currency-2')),
        'HKD',
      );

      await _setReceiptOcrSection(tester, 'group-bill', 'merchant', true);
      await _setReceiptOcrSection(tester, 'group-bill', 'items', true);

      expect(
        find.text(
          'This will update existing item rows. Split assignments and payers stay unchanged.',
        ),
        findsOneWidget,
      );
      expect(
        find.text(
          'New OCR item rows will stay unassigned until you choose split members.',
        ),
        findsOneWidget,
      );

      await _tapReceiptOcrApply(tester, 'group-bill');

      expect(find.text('Suggestions applied'), findsOneWidget);
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(
                const Key('group-bill-merchant-name'),
                skipOffstage: false,
              ),
            )
            .controller
            ?.text,
        'Corrected Dim Sum',
      );
      expect(find.text('2026-06-11', skipOffstage: false), findsWidgets);
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const ValueKey('group-bill-item-name-0')),
            )
            .controller
            ?.text,
        'Dumplings',
      );
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const ValueKey('group-bill-item-quantity-0')),
            )
            .controller
            ?.text,
        '2',
      );
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const ValueKey('group-bill-item-name-1')),
            )
            .controller
            ?.text,
        'Tea',
      );
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const ValueKey('group-bill-item-name-2')),
            )
            .controller
            ?.text,
        'Soup',
      );
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const ValueKey('group-bill-item-amount-0')),
            )
            .controller
            ?.text,
        '36.00',
      );
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const ValueKey('group-bill-item-amount-1')),
            )
            .controller
            ?.text,
        '32.00',
      );
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const ValueKey('group-bill-item-amount-2')),
            )
            .controller
            ?.text,
        '8.00',
      );

      await _goToGroupBillCreateStep(tester, 'split');
      expect(find.textContaining('Taylor'), findsWidgets);
      expect(
        find.text('All item split rows have a selected member.'),
        findsNothing,
      );
      expect(
        find.byKey(const Key('group-bill-assignable-item-2')),
        findsOneWidget,
      );

      await _goToGroupBillCreateStep(tester, 'payers');
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const ValueKey('group-bill-payer-amount-0')),
            )
            .controller
            ?.text,
        '12.00',
      );
    },
  );

  testWidgets(
    'group OCR applies basics while preserving item splits and payers',
    (tester) async {
      await useLargeSurface(tester);
      final repository = FakeBillRepository();
      final attachmentRepository = FakeBillAttachmentRepository();
      final receiptRepository = FakeReceiptOcrReviewRepository();
      final receiptOcrProvider = FakeReceiptOcrProvider(
        const ReceiptOcrResult.extracted(
          ReceiptOcrPreview(
            merchant: 'Receipt Bistro',
            receiptDate: '2026-06-13',
            currency: 'HKD',
            total: '88.00',
            items: [
              ReceiptOcrItemCandidate(
                description: 'OCR rice',
                quantity: '1',
                lineTotal: '88.00',
                currency: 'HKD',
              ),
            ],
          ),
        ),
      );

      await _pumpGroupBillCreate(
        tester,
        repository: repository,
        groupRepository: FakeGroupRepository(
          members: [
            sampleGroupMember(displayName: 'Alex'),
            sampleGroupMember(
              userProfileId: 'member-taylor-id',
              displayName: 'Taylor',
            ),
          ],
        ),
        attachmentRepository: attachmentRepository,
        attachmentFileInput: FakeBillAttachmentFileInput(
          pickedFile: samplePickedAttachmentFile(
            filename: 'shared-receipt.png',
            contentType: 'image/png',
            bytes: const [4, 5, 6],
          ),
        ),
        receiptOcrProvider: receiptOcrProvider,
        receiptOcrReviewRepository: receiptRepository,
      );

      await tester.tap(find.byKey(const Key('group-bill-list-create')));
      await tester.pumpAndSettle();
      await _goToGroupBillCreateStep(tester, 'receiptItems');
      await tester.enterText(
        find.byKey(const ValueKey('group-bill-item-name-0')),
        'Manual bun',
      );
      await tester.enterText(
        find.byKey(const ValueKey('group-bill-item-amount-0')),
        '12.00',
      );
      await _assignFirstGroupBillItem(tester, memberId: 'member-taylor-id');
      await _goToGroupBillCreateStep(tester, 'payers');
      await tester.tap(find.byKey(const Key('group-bill-add-payer')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('group-bill-payer-member-0')));
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const ValueKey('group-bill-member-picker-member-taylor-id')),
      );
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('group-bill-payer-amount-0')),
        '12.00',
      );

      await _goToGroupBillCreateStep(tester, 'receiptItems');
      await tester.tap(find.byKey(const Key('group-bill-scan-receipt')));
      await tester.pumpAndSettle();

      expect(
        tester
            .widget<CheckboxListTile>(
              find.byKey(const Key('group-bill-ocr-apply-items')),
            )
            .value,
        isFalse,
      );
      await _setReceiptOcrSection(tester, 'group-bill', 'currency', false);

      await _tapReceiptOcrApply(tester, 'group-bill');

      expect(
        tester
            .widget<TextFormField>(
              find.byKey(
                const Key('group-bill-merchant-name'),
                skipOffstage: false,
              ),
            )
            .controller
            ?.text,
        'Receipt Bistro',
      );
      expect(find.text('2026-06-13', skipOffstage: false), findsWidgets);
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const ValueKey('group-bill-item-name-0')),
            )
            .controller
            ?.text,
        'Manual bun',
      );
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const ValueKey('group-bill-item-amount-0')),
            )
            .controller
            ?.text,
        '12.00',
      );

      await _goToGroupBillCreateStep(tester, 'split');
      expect(find.textContaining('Taylor'), findsWidgets);
      expect(
        find.text('All item split rows have a selected member.'),
        findsWidgets,
      );
      await _goToGroupBillCreateStep(tester, 'payers');
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const ValueKey('group-bill-payer-amount-0')),
            )
            .controller
            ?.text,
        '12.00',
      );
      await _tapSaveGroupBill(tester);

      expect(repository.groupCreateCalls, 1);
      expect(repository.submitGroupCalls, 1);
      expect(attachmentRepository.attachCalls, 1);
      expect(receiptRepository.saveCalls, 1);
      expect(receiptRepository.lastSaveRoute?.billId, _billId);
      expect(receiptRepository.lastSaveRoute?.fileId, _uploadedFileId);
      expect(receiptRepository.lastSaveRoute?.groupId, _groupId);
      expect(receiptRepository.lastSaveRequest?.merchantText, 'Receipt Bistro');
      expect(
        receiptRepository.lastSaveRequest?.receiptIssuedAtUtc,
        DateTime.utc(2026, 6, 13),
      );
      expect(receiptRepository.lastSaveRequest?.currency, 'HKD');
      expect(receiptRepository.lastSaveRequest?.grandTotalAmount, '88.00');
      expect(receiptRepository.lastSaveRequest?.lines.single.text, 'OCR rice');
      expect(
        receiptRepository.lastSaveRequest?.lines.single.lineTotalAmount,
        '88.00',
      );
      expect(find.text('Group bill'), findsOneWidget);
      expect(
        find.byKey(const Key('group-bill-detail-ocr-review-handoff')),
        findsOneWidget,
      );
      expect(find.text('Receipt OCR review saved'), findsOneWidget);
      expect(
        find.text(
          'The bill was saved, the receipt was attached, and a provisional OCR review was saved. Review it before applying any bill changes.',
        ),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('group-bill-detail-ocr-review-retry')),
        findsNothing,
      );
      expect(
        find.byKey(const Key('group-bill-detail-ocr-review-open')),
        findsOneWidget,
      );

      await tester.tap(
        find.byKey(const Key('group-bill-detail-ocr-review-open')),
      );
      await tester.pumpAndSettle();

      expect(receiptRepository.getCalls, 1);
      expect(receiptRepository.lastRoute?.billId, _billId);
      expect(receiptRepository.lastRoute?.fileId, _uploadedFileId);
      expect(receiptRepository.lastRoute?.groupId, _groupId);
      expect(find.text('Saved OCR review'), findsOneWidget);
      expect(find.text('Group bill'), findsWidgets);
      expect(find.text('Review receipt lines'), findsOneWidget);
    },
  );

  testWidgets('group OCR review save failure retries from detail', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeBillRepository();
    final attachmentRepository = FakeBillAttachmentRepository();
    final receiptRepository = FakeReceiptOcrReviewRepository(
      saveFailure: const ReceiptOcrReviewFailure(
        kind: ReceiptOcrReviewFailureKind.server,
        message: 'Receipt OCR review is unavailable right now.',
      ),
    );
    final receiptOcrProvider = FakeReceiptOcrProvider(
      const ReceiptOcrResult.extracted(
        ReceiptOcrPreview(
          merchant: 'Receipt Bistro',
          receiptDate: '2026-06-13',
          currency: 'HKD',
          total: '88.00',
          items: [
            ReceiptOcrItemCandidate(
              description: 'OCR rice',
              quantity: '1',
              lineTotal: '88.00',
              currency: 'HKD',
            ),
          ],
        ),
      ),
    );

    await _pumpGroupBillCreate(
      tester,
      repository: repository,
      groupRepository: FakeGroupRepository(
        members: [
          sampleGroupMember(displayName: 'Alex'),
          sampleGroupMember(
            userProfileId: 'member-taylor-id',
            displayName: 'Taylor',
          ),
        ],
      ),
      attachmentRepository: attachmentRepository,
      attachmentFileInput: FakeBillAttachmentFileInput(
        pickedFile: samplePickedAttachmentFile(
          filename: 'shared-receipt.png',
          contentType: 'image/png',
          bytes: const [4, 5, 6],
        ),
      ),
      receiptOcrProvider: receiptOcrProvider,
      receiptOcrReviewRepository: receiptRepository,
    );

    await tester.tap(find.byKey(const Key('group-bill-list-create')));
    await tester.pumpAndSettle();
    await _goToGroupBillCreateStep(tester, 'receiptItems');
    await tester.enterText(
      find.byKey(const ValueKey('group-bill-item-name-0')),
      'Manual bun',
    );
    await tester.enterText(
      find.byKey(const ValueKey('group-bill-item-amount-0')),
      '12.00',
    );
    await _assignFirstGroupBillItem(tester, memberId: 'member-taylor-id');
    await _goToGroupBillCreateStep(tester, 'payers');
    await tester.tap(find.byKey(const Key('group-bill-add-payer')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('group-bill-payer-member-0')));
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const ValueKey('group-bill-member-picker-member-taylor-id')),
    );
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('group-bill-payer-amount-0')),
      '12.00',
    );

    await _goToGroupBillCreateStep(tester, 'receiptItems');
    await tester.tap(find.byKey(const Key('group-bill-scan-receipt')));
    await tester.pumpAndSettle();
    await _tapReceiptOcrApply(tester, 'group-bill');
    await _tapSaveGroupBill(tester);

    expect(repository.groupCreateCalls, 1);
    expect(repository.submitGroupCalls, 1);
    expect(attachmentRepository.attachCalls, 1);
    expect(receiptRepository.saveCalls, 1);
    final firstSaveRoute = receiptRepository.lastSaveRoute;
    final firstSaveRequest = receiptRepository.lastSaveRequest;
    expect(firstSaveRoute?.billId, _billId);
    expect(firstSaveRoute?.fileId, _uploadedFileId);
    expect(firstSaveRoute?.groupId, _groupId);
    expect(
      find.text(
        'Group bill saved and receipt attached, but the provisional OCR review could not be saved. Retry from the group bill detail.',
      ),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('group-bill-detail-ocr-review-handoff')),
      findsOneWidget,
    );
    expect(find.text('OCR review still needs saving'), findsOneWidget);

    receiptRepository.saveFailure = null;
    await tester.tap(
      find.byKey(const Key('group-bill-detail-ocr-review-retry')),
    );
    await tester.pumpAndSettle();

    expect(repository.groupCreateCalls, 1);
    expect(repository.submitGroupCalls, 1);
    expect(attachmentRepository.attachCalls, 1);
    expect(receiptRepository.saveCalls, 2);
    expect(receiptRepository.lastSaveRoute, same(firstSaveRoute));
    expect(receiptRepository.lastSaveRequest, same(firstSaveRequest));
    expect(find.text('Receipt OCR review saved'), findsOneWidget);
    expect(
      find.text(
        'Provisional OCR review saved. Review it before applying any bill changes.',
      ),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('group-bill-detail-ocr-review-open')),
      findsOneWidget,
    );

    await tester.tap(
      find.byKey(const Key('group-bill-detail-ocr-review-open')),
    );
    await tester.pumpAndSettle();

    expect(receiptRepository.getCalls, 1);
    expect(receiptRepository.lastRoute, same(firstSaveRoute));
    expect(find.text('Saved OCR review'), findsOneWidget);
  });

  testWidgets('group bill detail accepted share uses dedicated panel', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeBillRepository(
      groupBills: [sampleBillSummary(status: 'confirmed')],
      detail: sampleBillDetail(
        status: 'confirmed',
        participants: const [
          SettleoraBillParticipant(
            userProfileId: _userProfileId,
            status: SettleoraBillParticipantStatusValues.accepted,
            resolvedShareAmount: '10.80',
            resolvedShareCurrency: 'USD',
          ),
        ],
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupBillListScreen(
          repository: repository,
          groupRepository: FakeGroupRepository(),
          groupId: _groupId,
          groupName: 'Trip',
          currentUserProfileId: _userProfileId,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const Key('group-bill-current-share-panel')),
      findsOneWidget,
    );
    expect(find.text('Accepted share'), findsOneWidget);
    expect(find.text('10.80 USD'), findsWidgets);
    expect(
      find.text(
        'Acknowledgement is complete. Settlement remains a separate action.',
      ),
      findsOneWidget,
    );
    expect(find.byKey(const Key('group-bill-accept-share')), findsNothing);
    expect(find.byKey(const Key('bottom-nav-groups')), findsNothing);
  });

  testWidgets(
    'group bill member picker empty state keeps validation blocking',
    (tester) async {
      await useLargeSurface(tester);
      final repository = FakeBillRepository();

      await _pumpGroupBillCreate(
        tester,
        repository: repository,
        groupRepository: FakeGroupRepository(members: const []),
      );

      await tester.tap(find.byKey(const Key('group-bill-list-create')));
      await tester.pumpAndSettle();
      await _goToGroupBillCreateStep(tester, 'payers');
      await tester.ensureVisible(find.byKey(const Key('group-bill-add-payer')));
      await tester.tap(find.byKey(const Key('group-bill-add-payer')));
      await tester.pumpAndSettle();
      await tester.ensureVisible(
        find.byKey(const ValueKey('group-bill-payer-member-0')),
      );
      await tester.tap(find.byKey(const ValueKey('group-bill-payer-member-0')));
      await tester.pumpAndSettle();

      expect(find.text('Showing 0 of 0 members'), findsOneWidget);
      expect(find.text('No active members'), findsOneWidget);
      expect(
        find.text('No active group members are loaded for this bill.'),
        findsOneWidget,
      );

      await tester.tap(find.byTooltip('Close'));
      await tester.pumpAndSettle();
      await _fillMinimalGroupBillCreateForm(tester, assignItem: false);
      await _tapSaveGroupBill(tester);

      expect(repository.groupCreateCalls, 0);
    },
  );

  testWidgets('bill list preserves queued work when session is missing', (
    tester,
  ) async {
    final store = MemorySyncQueueStore(
      initialState: SettleoraSyncQueueState(items: [sampleArchiveQueueItem()]),
    );
    final syncRepository = FakeSyncRepository([
      const SettleoraSyncFailure(
        kind: SettleoraSyncFailureKind.sessionRequired,
        message: 'Sign in before syncing pending changes.',
      ),
    ]);
    final controller = SettleoraBillSyncController(
      queueStore: store,
      queueProcessor: SettleoraSyncQueueProcessor(
        queueStore: store,
        repository: syncRepository,
        now: () => _attemptedAtUtc,
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: FakeBillRepository(bills: [sampleBillSummary()]),
          syncController: controller,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('Sign in before syncing pending changes.'),
      findsOneWidget,
    );
    expect(store.state.items.single.state, 'queued');
    expect(store.state.items.single.attemptCount, 0);
  });

  testWidgets('bill list shows safe sync queue details and filters', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final queuedItem = sampleArchiveQueueItem();
    final conflictItem =
        SettleoraSyncQueueItem.billRestore(
          resourceId: 'hidden-bill-id-2',
          now: _createdAtUtc.add(const Duration(minutes: 1)),
          idGenerator: () => 'queue-conflict',
        ).copyWith(
          state: SettleoraSyncQueueItemStateValues.conflict,
          updatedAtUtc: _attemptedAtUtc.add(const Duration(minutes: 2)),
          lastAttemptAtUtc: _attemptedAtUtc.add(const Duration(minutes: 2)),
          attemptCount: 2,
          safeErrorCode: 'version_conflict',
          safeMessage: 'This change needs review.',
        );
    final syncedItem =
        SettleoraSyncQueueItem.billArchive(
          resourceId: 'hidden-bill-id-3',
          now: _createdAtUtc.add(const Duration(minutes: 2)),
          idGenerator: () => 'queue-synced',
        ).copyWith(
          state: SettleoraSyncQueueItemStateValues.synced,
          updatedAtUtc: _attemptedAtUtc.add(const Duration(minutes: 3)),
          lastAttemptAtUtc: _attemptedAtUtc.add(const Duration(minutes: 3)),
          attemptCount: 1,
        );
    final store = MemorySyncQueueStore(
      initialState: SettleoraSyncQueueState(
        items: [queuedItem, conflictItem, syncedItem],
      ),
    );
    final syncRepository = FakeSyncRepository([
      const SettleoraSyncFailure(
        kind: SettleoraSyncFailureKind.retryable,
        message: 'Server unavailable. Try again later.',
        safeErrorCode: 'server_unavailable',
      ),
    ]);
    final controller = SettleoraBillSyncController(
      queueStore: store,
      queueProcessor: SettleoraSyncQueueProcessor(
        queueStore: store,
        repository: syncRepository,
        now: () => _attemptedAtUtc,
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: FakeBillRepository(bills: [sampleBillSummary()]),
          syncController: controller,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('bill-sync-status-panel')), findsOneWidget);
    expect(
      find.text('0 pending, 1 retry later, 1 needs review, 1 synced'),
      findsOneWidget,
    );
    expect(find.byKey(const Key('bill-sync-queue-details')), findsOneWidget);
    expect(find.text('All (3)'), findsOneWidget);
    expect(find.text('Pending (0)'), findsOneWidget);
    expect(find.text('Failed (1)'), findsOneWidget);
    expect(find.text('Needs review (1)'), findsOneWidget);
    expect(find.text('Synced (1)'), findsOneWidget);
    expect(find.text('Bill action'), findsNWidgets(3));
    expect(find.text('Archive'), findsNWidgets(2));
    expect(find.text('Restore'), findsOneWidget);
    expect(find.text('Retry later'), findsOneWidget);
    expect(find.text('Error code: server_unavailable'), findsOneWidget);
    expect(find.text('Server unavailable. Try again later.'), findsWidgets);
    expect(find.text('Error code: version_conflict'), findsOneWidget);
    expect(find.text('This change needs review.'), findsOneWidget);
    expect(find.text('Last attempt 2026-05-17 11:00 UTC'), findsOneWidget);
    expect(find.text(_billId), findsNothing);
    expect(find.text('hidden-bill-id-2'), findsNothing);
    expect(find.text('queue-1'), findsNothing);

    await tester.tap(find.byKey(const ValueKey('bill-sync-filter-failed')));
    await tester.pumpAndSettle();

    expect(find.text('Bill action'), findsOneWidget);
    expect(find.text('Retry later'), findsOneWidget);
    expect(find.text('Error code: version_conflict'), findsNothing);

    await tester.tap(find.byKey(const ValueKey('bill-sync-filter-pending')));
    await tester.pumpAndSettle();

    expect(
      find.text(
        'No loaded pending queue items. This queue view covers current mobile bill operations only, not full offline cache hydration or server acceptance.',
      ),
      findsOneWidget,
    );
    expect(find.text('Bill action'), findsNothing);
  });

  testWidgets('bill detail opens from active bill summaries', (tester) async {
    final controller = SettleoraBillSyncController(
      queueStore: MemorySyncQueueStore(),
      queueProcessor: SettleoraSyncQueueProcessor(
        queueStore: MemorySyncQueueStore(),
        repository: FakeSyncRepository([]),
      ),
    );
    final repository = FakeBillRepository(
      bills: [sampleBillSummary()],
      detail: sampleBillDetail(),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          syncController: controller,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();

    expect(repository.getCalls, 1);
    expect(find.text('Items'), findsWidgets);
    expect(find.text('Milk'), findsOneWidget);
    expect(find.text('Participants'), findsOneWidget);
    expect(find.byKey(const Key('bill-detail-propose-change')), findsNothing);
  });

  testWidgets('bill detail search filters loaded rows and shows count', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeBillRepository(
      bills: [sampleBillSummary()],
      detail: sampleBillDetail(
        items: const [
          SettleoraBillItem(
            id: 'item-1',
            name: 'Milk',
            note: null,
            amount: '10.00',
            currency: 'USD',
            sortOrder: 0,
          ),
          SettleoraBillItem(
            id: 'item-2',
            name: 'Coffee beans',
            note: 'Morning receipt line',
            amount: '16.50',
            currency: 'USD',
            sortOrder: 1,
          ),
        ],
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('bill-detail-search')), findsOneWidget);
    expect(find.text('5 of 5 loaded detail rows visible.'), findsOneWidget);
    expect(find.text('Milk'), findsOneWidget);
    expect(find.text('Coffee beans'), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('bill-detail-search')),
      'coffee',
    );
    await tester.pumpAndSettle();

    expect(find.text('1 of 5 loaded detail rows visible.'), findsOneWidget);
    expect(find.text('Coffee beans'), findsOneWidget);
    expect(find.text('Milk'), findsNothing);
    expect(find.text('Participants'), findsOneWidget);
    expect(find.text('No participants'), findsOneWidget);
  });

  testWidgets('bill detail combines search with filter chips', (tester) async {
    await useLargeSurface(tester);
    final repository = FakeBillRepository(
      bills: [sampleBillSummary()],
      detail: sampleBillDetail(
        participants: const [
          SettleoraBillParticipant(
            userProfileId: _userProfileId,
            status: SettleoraBillParticipantStatusValues.pendingAcceptance,
            resolvedShareAmount: '10.80',
            resolvedShareCurrency: 'USD',
          ),
          SettleoraBillParticipant(
            userProfileId: 'accepted-user-id',
            status: SettleoraBillParticipantStatusValues.accepted,
            resolvedShareAmount: '5.25',
            resolvedShareCurrency: 'USD',
          ),
        ],
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const ValueKey('bill-detail-filter-participants')),
    );
    await tester.enterText(find.byKey(const Key('bill-detail-search')), '5.25');
    await tester.pumpAndSettle();

    expect(find.text('1 of 5 loaded detail rows visible.'), findsOneWidget);
    expect(find.text('Participant 2'), findsOneWidget);
    expect(find.text('Participant 1'), findsNothing);
    expect(find.text('Milk'), findsNothing);
    expect(find.text('Payer 1'), findsNothing);
  });

  testWidgets('bill detail clear resets search and chip filters', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeBillRepository(
      bills: [sampleBillSummary()],
      detail: sampleBillDetail(
        adjustments: const [
          SettleoraBillAdjustment(
            id: 'adjustment-1',
            type: 'tax',
            direction: 'charge',
            amount: '0.80',
            currency: 'USD',
            reasonNote: null,
            sortOrder: 0,
          ),
          SettleoraBillAdjustment(
            id: 'adjustment-2',
            type: 'service_charge',
            direction: 'charge',
            amount: '1.20',
            currency: 'USD',
            reasonNote: 'Weekend service',
            sortOrder: 1,
          ),
        ],
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const ValueKey('bill-detail-filter-adjustments')),
    );
    await tester.enterText(
      find.byKey(const Key('bill-detail-search')),
      'weekend',
    );
    await tester.pumpAndSettle();

    expect(find.text('1 of 5 loaded detail rows visible.'), findsOneWidget);
    expect(find.text('Service Charge'), findsOneWidget);
    expect(find.text('Milk'), findsNothing);

    await tester.tap(find.byKey(const Key('bill-detail-clear-filters')));
    await tester.pumpAndSettle();

    expect(find.text('5 of 5 loaded detail rows visible.'), findsOneWidget);
    expect(find.text('Milk'), findsOneWidget);
    expect(find.text('Participants'), findsWidgets);
    expect(find.text('Payers'), findsWidgets);
    expect(find.text('Service Charge'), findsOneWidget);
  });

  testWidgets('bill detail distinguishes filtered empty from true empty', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeBillRepository(
      bills: [sampleBillSummary()],
      detail: sampleBillDetail(items: const []),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(
      find.ancestor(
        of: find.text('Corner Market'),
        matching: find.byType(ListTile),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('No items'), findsOneWidget);
    expect(find.text('No matching detail rows'), findsNothing);

    await tester.enterText(find.byKey(const Key('bill-detail-search')), 'zzzz');
    await tester.pumpAndSettle();

    expect(find.text('No matching detail rows'), findsOneWidget);
    expect(
      find.text(
        'No already-loaded bill detail rows match these local filters. Clear filters to review every loaded server row before responding.',
      ),
      findsOneWidget,
    );
    expect(find.text('No items'), findsNothing);
  });

  testWidgets('bill list and detail show bounded reconciliation readouts', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeBillRepository(
      bills: [
        sampleBillSummary(
          merchantName: 'Known Status Bill',
          reconciliationStatus: 'reconciled',
        ),
        sampleBillSummary(
          id: 'future-status-bill-id',
          merchantName: 'Future Status Bill',
          reconciliationStatus:
              'provider_pending_manual_review_with_extra_long_generated_code_value',
        ),
      ],
      detail: sampleBillDetail(
        merchantName: 'Future Status Bill',
        reconciliationStatus:
            'provider_pending_manual_review_with_extra_long_generated_code_value',
        reconciliationNote:
            'Reviewed against the server record metadata for this loaded bill.',
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('2 of 2 loaded server rows visible.'), findsOneWidget);
    expect(
      find.text(
        'Personal bill report filters use already-loaded server rows on this device. Mobile displays server bill and reconciliation metadata only.',
      ),
      findsOneWidget,
    );
    expect(find.text('Reconciled'), findsOneWidget);
    expect(
      find.text('Other status: Provider Pending Manual Review With Ext...'),
      findsOneWidget,
    );

    await tester.tap(find.text('Future Status Bill'));
    await tester.pumpAndSettle();

    expect(
      find.text('Other status: Provider Pending Manual Review With Ext...'),
      findsOneWidget,
    );
    expect(
      find.text(
        'Reconciliation is server-provided record metadata, not bank statement matching.',
      ),
      findsOneWidget,
    );
    expect(
      find.text(
        'Reviewed against the server record metadata for this loaded bill.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('bill reconciliation readout hides unsafe raw details', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeBillRepository(
      bills: [
        sampleBillSummary(
          reconciliationStatus:
              '/api/v1/reconciliation?token=secret generated client stacktrace',
        ),
      ],
      detail: sampleBillDetail(
        reconciliationStatus:
            '/api/v1/reconciliation?token=secret generated client stacktrace',
        reconciliationNote:
            'Bearer token abc at /workspace/repos/Settleora/packages/client-dart/lib/generated/api.dart StackTrace storage provider object',
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Other status'), findsOneWidget);

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();

    final visible = visibleText(tester).toLowerCase();
    expect(find.text('Other status'), findsOneWidget);
    expect(
      find.text(
        'Server provided a reconciliation note, but mobile hid unsafe internal details.',
      ),
      findsOneWidget,
    );
    for (final unsafeText in [
      '/api/v1',
      'token',
      '/workspace/',
      'stacktrace',
      'generated client',
      'storage provider',
      'api.dart',
    ]) {
      expect(visible, isNot(contains(unsafeText)));
    }
    for (final actionText in [
      'Import statement',
      'Upload statement',
      'Download statement',
      'Link match',
      'Unlink match',
      'Update reconciliation',
      'Export CSV',
      'Backup',
      'Restore backup',
    ]) {
      expect(find.text(actionText), findsNothing);
    }
  });

  testWidgets('personal bill detail loads and renders attachment metadata', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final attachmentRepository = FakeBillAttachmentRepository(
      attachments: [sampleAttachment()],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: FakeBillRepository(
            bills: [sampleBillSummary()],
            detail: sampleBillDetail(),
          ),
          attachmentRepository: attachmentRepository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();

    expect(attachmentRepository.listCalls, 1);
    expect(attachmentRepository.lastRoute?.billId, _billId);
    expect(attachmentRepository.lastRoute?.groupId, isNull);
    expect(find.text('Attachments'), findsOneWidget);
    expect(find.text('Receipt'), findsOneWidget);
    expect(find.text('image/png'), findsOneWidget);
    expect(find.text('321 bytes'), findsOneWidget);
    expect(find.text('Uploaded'), findsOneWidget);
    expect(find.text('Updated'), findsOneWidget);
  });

  testWidgets(
    'personal bill attachment metadata labels purposes and bounds unsafe values',
    (tester) async {
      await useLargeSurface(tester);
      final attachmentRepository = FakeBillAttachmentRepository(
        attachments: [
          sampleAttachment(
            fileId: _fileId,
            purpose: SettleoraBillAttachmentPurposeValues.receipt,
            contentType: 'image/png',
          ),
          sampleAttachment(
            fileId: 'supporting-file-id',
            purpose: SettleoraBillAttachmentPurposeValues.supportingAttachment,
            contentType: 'application/pdf',
          ),
          sampleAttachment(
            fileId: 'future-file-id',
            purpose: 'C:\\Users\\secret\\provider_path',
            contentType: 'C:\\Users\\secret\\receipt.png',
            sizeBytes: -1,
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: FakeBillRepository(
              bills: [sampleBillSummary()],
              detail: sampleBillDetail(),
            ),
            attachmentRepository: attachmentRepository,
            receiptOcrReviewRepository: FakeReceiptOcrReviewRepository(),
            syncController: sampleBillSyncController(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Corner Market'));
      await tester.pumpAndSettle();

      expect(find.text('Receipt'), findsOneWidget);
      expect(find.text('Supporting attachment'), findsOneWidget);
      expect(find.text('Attachment'), findsOneWidget);
      expect(find.text('image/png'), findsOneWidget);
      expect(find.text('application/pdf'), findsOneWidget);
      expect(find.text('Unknown type'), findsOneWidget);
      expect(find.text('Unknown size'), findsOneWidget);
      expect(
        find.byKey(const ValueKey('bill-attachments-ocr-0')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('bill-attachments-ocr-1')),
        findsNothing,
      );
      expect(
        find.byKey(const ValueKey('bill-attachments-ocr-2')),
        findsNothing,
      );
      expect(visibleText(tester), isNot(contains('C:\\Users\\secret')));
      expect(visibleText(tester), isNot(contains('provider_path')));
    },
  );

  testWidgets('personal bill attachment section shows empty state after load', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final attachmentRepository = FakeBillAttachmentRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: FakeBillRepository(
            bills: [sampleBillSummary()],
            detail: sampleBillDetail(),
          ),
          attachmentRepository: attachmentRepository,
          attachmentFileInput: FakeBillAttachmentFileInput(),
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();

    expect(attachmentRepository.listCalls, 1);
    expect(find.text('No attachments'), findsOneWidget);
    expect(
      find.text(
        'Upload receipts for OCR review or supporting files for bill evidence.',
      ),
      findsOneWidget,
    );
    expect(find.byKey(const Key('bill-attachments-upload')), findsOneWidget);
  });

  testWidgets('personal bill attachment section shows loading affordance', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final listCompleter = Completer<List<SettleoraBillAttachment>>();
    final attachmentRepository = FakeBillAttachmentRepository(
      listCompletersByCall: {1: listCompleter},
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: FakeBillRepository(
            bills: [sampleBillSummary()],
            detail: sampleBillDetail(),
          ),
          attachmentRepository: attachmentRepository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pump();
    await tester.pump();

    expect(attachmentRepository.listCalls, 1);
    expect(find.byKey(const Key('bill-attachments-loading')), findsOneWidget);

    listCompleter.complete(const []);
    await tester.pumpAndSettle();

    expect(find.text('No attachments'), findsOneWidget);
  });

  testWidgets('personal bill attachment load failure is retryable', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final attachmentRepository = FakeBillAttachmentRepository(
      attachments: [sampleAttachment()],
      listFailures: [
        const SettleoraBillAttachmentFailure(
          kind: SettleoraBillAttachmentFailureKind.server,
          message: 'Attachments are unavailable right now. Try again later.',
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: FakeBillRepository(
            bills: [sampleBillSummary()],
            detail: sampleBillDetail(),
          ),
          attachmentRepository: attachmentRepository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();

    expect(find.text('Attachments unavailable'), findsOneWidget);
    expect(
      find.text('Attachments are unavailable right now. Try again later.'),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const Key('bill-attachments-retry')));
    await tester.pumpAndSettle();

    expect(attachmentRepository.listCalls, 2);
    expect(find.text('Receipt'), findsOneWidget);
  });

  testWidgets(
    'personal bill refresh failure preserves metadata and blocks duplicate refresh',
    (tester) async {
      await useLargeSurface(tester);
      final refreshCompleter = Completer<List<SettleoraBillAttachment>>();
      final attachmentRepository = FakeBillAttachmentRepository(
        attachments: [sampleAttachment()],
        listCompletersByCall: {2: refreshCompleter},
        listFailuresByCall: const {
          2: SettleoraBillAttachmentFailure(
            kind: SettleoraBillAttachmentFailureKind.server,
            message:
                'SocketException token C:\\Users\\secret\\receipt.png /var/storage/object-key [1, 2, 3] StackTrace',
          ),
        },
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: FakeBillRepository(
              bills: [sampleBillSummary()],
              detail: sampleBillDetail(),
            ),
            attachmentRepository: attachmentRepository,
            syncController: sampleBillSyncController(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Corner Market'));
      await tester.pumpAndSettle();
      expect(find.text('Receipt'), findsOneWidget);

      await tester.tap(find.byKey(const Key('bill-attachments-refresh')));
      await tester.pump();

      expect(attachmentRepository.listCalls, 2);
      expect(
        find.byKey(const Key('bill-attachments-refreshing')),
        findsOneWidget,
      );
      expect(find.text('Receipt'), findsOneWidget);

      await tester.tap(
        find.byKey(const Key('bill-attachments-refresh')),
        warnIfMissed: false,
      );
      await tester.pump();

      expect(attachmentRepository.listCalls, 2);

      refreshCompleter.complete([sampleAttachment()]);
      await tester.pumpAndSettle();

      expect(find.text('Attachments unavailable'), findsOneWidget);
      expect(
        find.text('Attachments are unavailable right now. Try again later.'),
        findsOneWidget,
      );
      expect(find.text('Receipt'), findsOneWidget);
      expect(visibleText(tester), isNot(contains('C:\\Users\\secret')));
      expect(visibleText(tester), isNot(contains('/var/storage')));
      expect(visibleText(tester), isNot(contains('object-key')));
      expect(visibleText(tester), isNot(contains('[1, 2, 3]')));
      expect(visibleText(tester), isNot(contains('StackTrace')));
      expect(visibleText(tester), isNot(contains('SocketException')));
      expect(visibleText(tester), isNot(contains('token')));
    },
  );

  testWidgets('personal bill attachment remove confirms and refreshes', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final attachmentRepository = FakeBillAttachmentRepository(
      attachments: [sampleAttachment()],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: FakeBillRepository(
            bills: [sampleBillSummary()],
            detail: sampleBillDetail(),
          ),
          attachmentRepository: attachmentRepository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const ValueKey('bill-attachments-remove-0')),
    );
    await tester.tap(find.byKey(const ValueKey('bill-attachments-remove-0')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-attachments-remove-confirm')));
    await tester.pumpAndSettle();

    expect(attachmentRepository.removeCalls, 1);
    expect(attachmentRepository.lastRemovedFileId, _fileId);
    expect(attachmentRepository.listCalls, 2);
    expect(find.text('Attachment removed.'), findsOneWidget);
    expect(find.text('No attachments'), findsOneWidget);
  });

  testWidgets(
    'personal bill attachment remove cancel and dismiss do not call remove',
    (tester) async {
      await useLargeSurface(tester);
      final attachmentRepository = FakeBillAttachmentRepository(
        attachments: [sampleAttachment()],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: FakeBillRepository(
              bills: [sampleBillSummary()],
              detail: sampleBillDetail(),
            ),
            attachmentRepository: attachmentRepository,
            syncController: sampleBillSyncController(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Corner Market'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(
        find.byKey(const ValueKey('bill-attachments-remove-0')),
      );
      await tester.tap(find.byKey(const ValueKey('bill-attachments-remove-0')));
      await tester.pumpAndSettle();

      expect(find.text('Remove attachment?'), findsOneWidget);
      expect(
        find.text('This will remove the attachment from the bill.'),
        findsOneWidget,
      );

      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();

      expect(attachmentRepository.removeCalls, 0);
      expect(find.text('Receipt'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('bill-attachments-remove-0')));
      await tester.pumpAndSettle();
      await tester.tapAt(const Offset(20, 20));
      await tester.pumpAndSettle();

      expect(attachmentRepository.removeCalls, 0);
      expect(find.text('Receipt'), findsOneWidget);
    },
  );

  testWidgets(
    'personal bill attachment remove blocks duplicate actions while active',
    (tester) async {
      await useLargeSurface(tester);
      final removeCompleter = Completer<void>();
      final attachmentRepository = FakeBillAttachmentRepository(
        attachments: [sampleAttachment()],
        removeCompleter: removeCompleter,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: FakeBillRepository(
              bills: [sampleBillSummary()],
              detail: sampleBillDetail(),
            ),
            attachmentRepository: attachmentRepository,
            attachmentFileInput: FakeBillAttachmentFileInput(),
            receiptOcrReviewRepository: FakeReceiptOcrReviewRepository(),
            syncController: sampleBillSyncController(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Corner Market'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(
        find.byKey(const ValueKey('bill-attachments-remove-0')),
      );
      await tester.tap(find.byKey(const ValueKey('bill-attachments-remove-0')));
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const Key('bill-attachments-remove-confirm')),
      );
      await tester.pump();

      expect(attachmentRepository.removeCalls, 1);
      expect(
        find.byKey(const Key('bill-attachments-remove-progress')),
        findsOneWidget,
      );
      _expectAttachmentUploadEnabled(
        tester,
        const Key('bill-attachments-upload'),
        isFalse,
      );
      _expectIconButtonEnabled(
        tester,
        const Key('bill-attachments-refresh'),
        isFalse,
      );
      _expectOutlinedButtonEnabled(
        tester,
        const ValueKey('bill-attachments-download-0'),
        isFalse,
      );
      _expectOutlinedButtonEnabled(
        tester,
        const ValueKey('bill-attachments-remove-0'),
        isFalse,
      );
      _expectOutlinedButtonEnabled(
        tester,
        const ValueKey('bill-attachments-ocr-0'),
        isFalse,
      );

      await tester.tap(
        find.byKey(const ValueKey('bill-attachments-remove-0')),
        warnIfMissed: false,
      );
      await tester.tap(
        find.byKey(const ValueKey('bill-attachments-download-0')),
        warnIfMissed: false,
      );
      await tester.tap(
        find.byKey(const ValueKey('bill-attachments-ocr-0')),
        warnIfMissed: false,
      );
      await tester.pump();

      expect(attachmentRepository.removeCalls, 1);
      expect(attachmentRepository.downloadCalls, 0);

      removeCompleter.complete();
      await tester.pumpAndSettle();

      expect(attachmentRepository.removeCalls, 1);
      expect(attachmentRepository.listCalls, 3);
      expect(
        find.byKey(const Key('bill-attachments-remove-progress')),
        findsNothing,
      );
      expect(find.text('No attachments'), findsOneWidget);
    },
  );

  testWidgets('personal bill attachment remove failure preserves safe metadata', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final attachmentRepository = FakeBillAttachmentRepository(
      attachments: [sampleAttachment()],
      removeFailure: const SettleoraBillAttachmentFailure(
        kind: SettleoraBillAttachmentFailureKind.server,
        message:
            'SocketException token C:\\Users\\secret\\receipt.png /var/storage/object-key [1, 2, 3] StackTrace',
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: FakeBillRepository(
            bills: [sampleBillSummary()],
            detail: sampleBillDetail(),
          ),
          attachmentRepository: attachmentRepository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const ValueKey('bill-attachments-remove-0')),
    );
    await tester.tap(find.byKey(const ValueKey('bill-attachments-remove-0')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-attachments-remove-confirm')));
    await tester.pumpAndSettle();

    expect(attachmentRepository.removeCalls, 1);
    expect(find.text('Attachments unavailable'), findsOneWidget);
    expect(
      find.text('Attachments are unavailable right now. Try again later.'),
      findsOneWidget,
    );
    expect(find.text('Receipt'), findsOneWidget);
    expect(visibleText(tester), isNot(contains('C:\\Users\\secret')));
    expect(visibleText(tester), isNot(contains('/var/storage')));
    expect(visibleText(tester), isNot(contains('object-key')));
    expect(visibleText(tester), isNot(contains('[1, 2, 3]')));
    expect(visibleText(tester), isNot(contains('StackTrace')));
    expect(visibleText(tester), isNot(contains('SocketException')));
    expect(visibleText(tester), isNot(contains('token')));
  });

  testWidgets(
    'personal bill remove success hides removed row when refresh fails',
    (tester) async {
      await useLargeSurface(tester);
      final attachmentRepository = FakeBillAttachmentRepository(
        attachments: [
          sampleAttachment(),
          sampleAttachment(
            fileId: 'supporting-file-id',
            purpose: SettleoraBillAttachmentPurposeValues.supportingAttachment,
            contentType: 'application/pdf',
          ),
        ],
        listFailuresByCall: const {
          3: SettleoraBillAttachmentFailure(
            kind: SettleoraBillAttachmentFailureKind.server,
            message:
                'SocketException token C:\\Users\\secret\\receipt.png /var/storage/object-key [1, 2, 3] StackTrace',
          ),
        },
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: FakeBillRepository(
              bills: [sampleBillSummary()],
              detail: sampleBillDetail(),
            ),
            attachmentRepository: attachmentRepository,
            receiptOcrReviewRepository: FakeReceiptOcrReviewRepository(),
            syncController: sampleBillSyncController(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Corner Market'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(
        find.byKey(const ValueKey('bill-attachments-remove-0')),
      );
      await tester.tap(find.byKey(const ValueKey('bill-attachments-remove-0')));
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const Key('bill-attachments-remove-confirm')),
      );
      await tester.pumpAndSettle();

      expect(attachmentRepository.removeCalls, 1);
      expect(attachmentRepository.listCalls, 3);
      expect(find.text('Attachment removed.'), findsOneWidget);
      expect(find.text('Receipt'), findsNothing);
      expect(
        find.byKey(const ValueKey('bill-attachments-ocr-0')),
        findsNothing,
      );
      expect(find.text('Supporting attachment'), findsOneWidget);
      expect(find.text('Attachments unavailable'), findsOneWidget);
      expect(
        find.text('Attachments are unavailable right now. Try again later.'),
        findsOneWidget,
      );
      expect(visibleText(tester), isNot(contains('C:\\Users\\secret')));
      expect(visibleText(tester), isNot(contains('/var/storage')));
      expect(visibleText(tester), isNot(contains('object-key')));
      expect(visibleText(tester), isNot(contains('[1, 2, 3]')));
      expect(visibleText(tester), isNot(contains('StackTrace')));
      expect(visibleText(tester), isNot(contains('SocketException')));
      expect(visibleText(tester), isNot(contains('token')));
    },
  );

  testWidgets('personal bill attachment download reports bounded bytes only', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final attachmentRepository = FakeBillAttachmentRepository(
      attachments: [sampleAttachment()],
      downloadedBytes: const [1, 2, 3, 4],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: FakeBillRepository(
            bills: [sampleBillSummary()],
            detail: sampleBillDetail(),
          ),
          attachmentRepository: attachmentRepository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const ValueKey('bill-attachments-download-0')),
    );
    await tester.tap(find.byKey(const ValueKey('bill-attachments-download-0')));
    await tester.pumpAndSettle();

    expect(attachmentRepository.downloadCalls, 1);
    expect(attachmentRepository.lastDownloadedFileId, _fileId);
    expect(find.text('Downloaded 4 bytes.'), findsOneWidget);
    expect(visibleText(tester), isNot(contains('C:\\Users\\secret')));
    expect(visibleText(tester), isNot(contains('[1, 2, 3, 4]')));
  });

  testWidgets(
    'personal bill attachment download blocks duplicate and conflicting actions',
    (tester) async {
      await useLargeSurface(tester);
      final downloadCompleter = Completer<void>();
      final attachmentRepository = FakeBillAttachmentRepository(
        attachments: [
          sampleAttachment(),
          sampleAttachment(
            fileId: 'supporting-file-id',
            purpose: SettleoraBillAttachmentPurposeValues.supportingAttachment,
            contentType: 'application/pdf',
          ),
        ],
        downloadCompleter: downloadCompleter,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: FakeBillRepository(
              bills: [sampleBillSummary()],
              detail: sampleBillDetail(),
            ),
            attachmentRepository: attachmentRepository,
            attachmentFileInput: FakeBillAttachmentFileInput(),
            receiptOcrReviewRepository: FakeReceiptOcrReviewRepository(),
            syncController: sampleBillSyncController(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Corner Market'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(
        find.byKey(const ValueKey('bill-attachments-download-0')),
      );
      await tester.tap(
        find.byKey(const ValueKey('bill-attachments-download-0')),
      );
      await tester.pump();

      expect(attachmentRepository.downloadCalls, 1);
      expect(
        find.byKey(const ValueKey('bill-attachments-download-progress-0')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('bill-attachments-download-progress-1')),
        findsNothing,
      );
      _expectAttachmentUploadEnabled(
        tester,
        const Key('bill-attachments-upload'),
        isFalse,
      );
      _expectIconButtonEnabled(
        tester,
        const Key('bill-attachments-refresh'),
        isFalse,
      );
      _expectOutlinedButtonEnabled(
        tester,
        const ValueKey('bill-attachments-download-0'),
        isFalse,
      );
      _expectOutlinedButtonEnabled(
        tester,
        const ValueKey('bill-attachments-remove-0'),
        isFalse,
      );
      _expectOutlinedButtonEnabled(
        tester,
        const ValueKey('bill-attachments-ocr-0'),
        isFalse,
      );

      await tester.tap(
        find.byKey(const ValueKey('bill-attachments-download-0')),
        warnIfMissed: false,
      );
      await tester.tap(
        find.byKey(const ValueKey('bill-attachments-remove-0')),
        warnIfMissed: false,
      );
      await tester.tap(
        find.byKey(const ValueKey('bill-attachments-ocr-0')),
        warnIfMissed: false,
      );
      await tester.pump();

      expect(attachmentRepository.downloadCalls, 1);
      expect(attachmentRepository.removeCalls, 0);

      downloadCompleter.complete();
      await tester.pumpAndSettle();

      expect(attachmentRepository.downloadCalls, 1);
      expect(find.text('Downloaded 3 bytes.'), findsOneWidget);
      expect(
        find.byKey(const ValueKey('bill-attachments-download-progress-0')),
        findsNothing,
      );
      _expectAttachmentUploadEnabled(
        tester,
        const Key('bill-attachments-upload'),
        isTrue,
      );
    },
  );

  testWidgets(
    'personal bill attachment download failure is sanitized and preserves metadata',
    (tester) async {
      await useLargeSurface(tester);
      final attachmentRepository = FakeBillAttachmentRepository(
        attachments: [sampleAttachment()],
        downloadFailure: const SettleoraBillAttachmentFailure(
          kind: SettleoraBillAttachmentFailureKind.server,
          message:
              'SocketException token C:\\Users\\secret\\receipt.png /var/storage/object-key [1, 2, 3] StackTrace',
        ),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: FakeBillRepository(
              bills: [sampleBillSummary()],
              detail: sampleBillDetail(),
            ),
            attachmentRepository: attachmentRepository,
            syncController: sampleBillSyncController(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Corner Market'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(
        find.byKey(const ValueKey('bill-attachments-download-0')),
      );
      await tester.tap(
        find.byKey(const ValueKey('bill-attachments-download-0')),
      );
      await tester.pumpAndSettle();

      expect(attachmentRepository.downloadCalls, 1);
      expect(find.text('Attachments unavailable'), findsOneWidget);
      expect(
        find.text('Attachments are unavailable right now. Try again later.'),
        findsOneWidget,
      );
      expect(find.text('Receipt'), findsOneWidget);
      expect(find.text('image/png'), findsOneWidget);
      expect(visibleText(tester), isNot(contains('C:\\Users\\secret')));
      expect(visibleText(tester), isNot(contains('/var/storage')));
      expect(visibleText(tester), isNot(contains('object-key')));
      expect(visibleText(tester), isNot(contains('[1, 2, 3]')));
      expect(visibleText(tester), isNot(contains('StackTrace')));
      expect(visibleText(tester), isNot(contains('SocketException')));
      expect(visibleText(tester), isNot(contains('token')));
    },
  );

  testWidgets(
    'personal bill attachment upload button is available with picker',
    (tester) async {
      await useLargeSurface(tester);

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: FakeBillRepository(
              bills: [sampleBillSummary()],
              detail: sampleBillDetail(),
            ),
            attachmentRepository: FakeBillAttachmentRepository(),
            attachmentFileInput: FakeBillAttachmentFileInput(),
            syncController: sampleBillSyncController(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Corner Market'));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('bill-attachments-upload')), findsOneWidget);
      expect(find.text('Upload attachment'), findsOneWidget);
    },
  );

  testWidgets('personal bill upload purpose cancel does not pick or attach', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final attachmentRepository = FakeBillAttachmentRepository();
    final fileInput = FakeBillAttachmentFileInput();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: FakeBillRepository(
            bills: [sampleBillSummary()],
            detail: sampleBillDetail(),
          ),
          attachmentRepository: attachmentRepository,
          attachmentFileInput: fileInput,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-attachments-upload')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('attachment-upload-purpose-cancel')));
    await tester.pumpAndSettle();

    expect(fileInput.pickCalls, 0);
    expect(attachmentRepository.attachCalls, 0);
    expect(attachmentRepository.listCalls, 1);
    expect(find.text('No attachments'), findsOneWidget);
    _expectAttachmentUploadEnabled(
      tester,
      const Key('bill-attachments-upload'),
      isTrue,
    );
  });

  testWidgets('personal bill file picker cancel does not attach', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final attachmentRepository = FakeBillAttachmentRepository();
    final fileInput = FakeBillAttachmentFileInput();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: FakeBillRepository(
            bills: [sampleBillSummary()],
            detail: sampleBillDetail(),
          ),
          attachmentRepository: attachmentRepository,
          attachmentFileInput: fileInput,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-attachments-upload')));
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const Key('attachment-upload-purpose-supporting')),
    );
    await tester.pumpAndSettle();

    expect(fileInput.pickCalls, 1);
    expect(attachmentRepository.attachCalls, 0);
    expect(attachmentRepository.listCalls, 1);
    expect(find.text('No attachments'), findsOneWidget);
    _expectAttachmentUploadEnabled(
      tester,
      const Key('bill-attachments-upload'),
      isTrue,
    );
  });

  testWidgets(
    'personal bill upload ignores repeated taps while picker is busy and clears after success',
    (tester) async {
      await useLargeSurface(tester);
      final pickCompleter = Completer<SettleoraPickedBillAttachmentFile?>();
      final attachmentRepository = FakeBillAttachmentRepository();
      final fileInput = FakeBillAttachmentFileInput(
        pickCompleter: pickCompleter,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: FakeBillRepository(
              bills: [sampleBillSummary()],
              detail: sampleBillDetail(),
            ),
            attachmentRepository: attachmentRepository,
            attachmentFileInput: fileInput,
            syncController: sampleBillSyncController(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Corner Market'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('bill-attachments-upload')));
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const Key('attachment-upload-purpose-supporting')),
      );
      await tester.pump(const Duration(milliseconds: 300));

      expect(fileInput.pickCalls, 1);
      expect(attachmentRepository.attachCalls, 0);
      expect(
        find.byKey(const Key('bill-attachments-upload-progress')),
        findsOneWidget,
      );
      _expectAttachmentUploadEnabled(
        tester,
        const Key('bill-attachments-upload'),
        isFalse,
      );

      await tester.tap(
        find.byKey(const Key('bill-attachments-upload')),
        warnIfMissed: false,
      );
      await tester.pump();

      expect(fileInput.pickCalls, 1);
      expect(attachmentRepository.attachCalls, 0);

      pickCompleter.complete(samplePickedAttachmentFile());
      await tester.pumpAndSettle();

      expect(fileInput.pickCalls, 1);
      expect(attachmentRepository.attachCalls, 1);
      expect(attachmentRepository.listCalls, 2);
      expect(find.text('Attachment uploaded.'), findsOneWidget);
      expect(
        find.byKey(const Key('bill-attachments-upload-progress')),
        findsNothing,
      );
      _expectAttachmentUploadEnabled(
        tester,
        const Key('bill-attachments-upload'),
        isTrue,
      );
    },
  );

  testWidgets('personal bill attachment upload can choose receipt', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final attachmentRepository = FakeBillAttachmentRepository();
    final receiptRepository = FakeReceiptOcrReviewRepository();
    final fileInput = FakeBillAttachmentFileInput(
      pickedFile: samplePickedAttachmentFile(
        filename: 'C:\\Users\\secret\\receipt.png',
        contentType: 'image/png',
        bytes: const [4, 5, 6],
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: FakeBillRepository(
            bills: [sampleBillSummary()],
            detail: sampleBillDetail(),
          ),
          attachmentRepository: attachmentRepository,
          attachmentFileInput: fileInput,
          receiptOcrReviewRepository: receiptRepository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-attachments-upload')));
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const Key('attachment-upload-purpose-receipt')),
    );
    await tester.pumpAndSettle();

    expect(fileInput.pickCalls, 1);
    expect(
      fileInput.lastAllowedContentTypes,
      SettleoraBillAttachmentContentTypeValues.receiptValues,
    );
    expect(attachmentRepository.attachCalls, 1);
    expect(attachmentRepository.lastRoute?.billId, _billId);
    expect(attachmentRepository.lastRoute?.groupId, isNull);
    expect(
      attachmentRepository.lastUpload?.purpose,
      SettleoraBillAttachmentPurposeValues.receipt,
    );
    expect(attachmentRepository.lastUpload?.filename, 'receipt.png');
    expect(attachmentRepository.lastUpload?.contentType, 'image/png');
    expect(attachmentRepository.lastUpload?.bytes, const [4, 5, 6]);
    expect(attachmentRepository.listCalls, 3);
    expect(
      find.text('Receipt uploaded. Review OCR before applying it to a draft.'),
      findsOneWidget,
    );
    expect(
      find.widgetWithText(SnackBarAction, 'Review receipt'),
      findsOneWidget,
    );
    expect(find.text('Receipt'), findsOneWidget);
    expect(visibleText(tester), isNot(contains('C:\\Users\\secret')));

    await tester.tap(find.widgetWithText(SnackBarAction, 'Review receipt'));
    await tester.pumpAndSettle();

    expect(receiptRepository.getCalls, 1);
    expect(receiptRepository.lastRoute?.billId, _billId);
    expect(receiptRepository.lastRoute?.fileId, _uploadedFileId);
    expect(receiptRepository.lastRoute?.groupId, isNull);
  });

  testWidgets(
    'personal bill detail direct saved OCR discovery opens one receipt review',
    (tester) async {
      await useLargeSurface(tester);
      final attachmentRepository = FakeBillAttachmentRepository(
        attachments: [sampleAttachment(fileId: _uploadedFileId)],
      );
      final receiptRepository = FakeReceiptOcrReviewRepository();

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillDetailScreen(
            repository: FakeBillRepository(),
            billId: _billId,
            initialBill: sampleBillDetail(id: _billId),
            attachmentRepository: attachmentRepository,
            receiptOcrReviewRepository: receiptRepository,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(
        find.byKey(const Key('bill-detail-saved-ocr-discovery')),
        240,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.ensureVisible(
        find.byKey(const Key('bill-detail-saved-ocr-discovery')),
      );
      expect(
        find.byKey(const Key('bill-detail-saved-ocr-discovery')),
        findsOneWidget,
      );
      expect(find.text('Saved provisional OCR reviews'), findsOneWidget);
      expect(
        find.text(
          'One receipt attachment can open its saved provisional OCR review directly.',
        ),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('bill-detail-saved-ocr-discovery-open')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('bill-attachments-ocr-0')),
        findsOneWidget,
      );
      expect(visibleText(tester), isNot(contains(_uploadedFileId)));
      expect(visibleText(tester), isNot(contains('/var/')));
      expect(visibleText(tester), isNot(contains('object key')));
      expect(visibleText(tester), isNot(contains('signed URL')));
      expect(visibleText(tester), isNot(contains('raw OCR full text')));

      await tester.scrollUntilVisible(
        find.byKey(const Key('bill-detail-saved-ocr-discovery-open')),
        180,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const Key('bill-detail-saved-ocr-discovery-open')),
      );
      await tester.pumpAndSettle();

      expect(receiptRepository.getCalls, 1);
      expect(receiptRepository.lastRoute?.billId, _billId);
      expect(receiptRepository.lastRoute?.fileId, _uploadedFileId);
      expect(receiptRepository.lastRoute?.groupId, isNull);
      expect(find.text('Saved OCR review'), findsOneWidget);
      expect(find.text('Reviewing saved OCR for Receipt 1.'), findsOneWidget);
      expect(
        find.text('Receipt, PNG receipt image, 321 bytes'),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'personal bill detail direct saved OCR discovery ignores duplicate opens',
    (tester) async {
      await useLargeSurface(tester);
      final getReviewCompleter = Completer<ReceiptOcrReviewDetail>();
      final attachmentRepository = FakeBillAttachmentRepository(
        attachments: [sampleAttachment(fileId: _uploadedFileId)],
      );
      final receiptRepository = FakeReceiptOcrReviewRepository(
        getReviewCompleter: getReviewCompleter,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillDetailScreen(
            repository: FakeBillRepository(),
            billId: _billId,
            initialBill: sampleBillDetail(id: _billId),
            attachmentRepository: attachmentRepository,
            receiptOcrReviewRepository: receiptRepository,
          ),
        ),
      );
      await tester.pumpAndSettle();

      final action = find.byKey(
        const Key('bill-detail-saved-ocr-discovery-open'),
      );
      await tester.scrollUntilVisible(
        action,
        180,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.tap(action);
      await tester.tap(action, warnIfMissed: false);
      await tester.pump();

      expect(receiptRepository.getCalls, 1);
      expect(find.text('Loading saved OCR review'), findsOneWidget);

      getReviewCompleter.complete(
        sampleReceiptOcrReviewDetail(
          ReceiptOcrReviewRoute(billId: _billId, fileId: _uploadedFileId),
        ),
      );
      await tester.pumpAndSettle();

      expect(receiptRepository.getCalls, 1);
      expect(find.text('Reviewing saved OCR for Receipt 1.'), findsOneWidget);
      expect(visibleText(tester), isNot(contains(_uploadedFileId)));
    },
  );

  testWidgets('mixed receipt attachments with one safe candidate open directly', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final attachmentRepository = FakeBillAttachmentRepository(
      attachments: [
        sampleAttachment(
          fileId: 'storage/object/key/receipt.png',
          contentType: 'C:\\Users\\secret\\receipt.png',
          sizeBytes: 0,
        ),
        sampleAttachment(
          fileId: _uploadedFileId,
          contentType: 'image/webp',
          sizeBytes: 1536,
        ),
        sampleAttachment(
          fileId: 'https://signed.example/receipt?token=session-secret',
          contentType: 'raw OCR full text with card number',
          sizeBytes: 2048,
        ),
      ],
    );
    final receiptRepository = FakeReceiptOcrReviewRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillDetailScreen(
          repository: FakeBillRepository(),
          billId: _billId,
          initialBill: sampleBillDetail(id: _billId),
          attachmentRepository: attachmentRepository,
          receiptOcrReviewRepository: receiptRepository,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('bill-detail-saved-ocr-discovery-open')),
      180,
      scrollable: find.byType(Scrollable).first,
    );
    expect(
      find.text(
        'One receipt attachment can open its saved provisional OCR review directly.',
      ),
      findsOneWidget,
    );
    expect(find.text('Choose receipt to review'), findsNothing);
    expect(
      find.byKey(const Key('bill-detail-saved-ocr-discovery-open')),
      findsOneWidget,
    );
    expect(visibleText(tester), isNot(contains('storage/object/key')));
    expect(visibleText(tester), isNot(contains('signed.example')));
    expect(visibleText(tester), isNot(contains('session-secret')));
    expect(visibleText(tester), isNot(contains('card number')));
    expect(visibleText(tester), isNot(contains('raw OCR full text')));

    await tester.tap(
      find.byKey(const Key('bill-detail-saved-ocr-discovery-open')),
    );
    await tester.pumpAndSettle();

    expect(receiptRepository.getCalls, 1);
    expect(receiptRepository.lastRoute?.fileId, _uploadedFileId);
    expect(find.text('Reviewing saved OCR for Receipt 1.'), findsOneWidget);
    expect(find.text('Receipt, WEBP receipt image, 1.5 KB'), findsOneWidget);
    expect(visibleText(tester), isNot(contains(_uploadedFileId)));
    expect(visibleText(tester), isNot(contains('storage/object/key')));
    expect(visibleText(tester), isNot(contains('signed.example')));
    expect(visibleText(tester), isNot(contains('raw OCR full text')));
  });

  testWidgets(
    'direct saved OCR discovery keeps route identifiers out of labels and semantics',
    (tester) async {
      final semantics = tester.ensureSemantics();
      await useLargeSurface(tester);
      await tester.binding.setSurfaceSize(const Size(900, 2400));
      final attachmentRepository = FakeBillAttachmentRepository(
        attachments: [
          sampleAttachment(
            fileId: 'storage/object/key/receipt.png',
            contentType: 'signed URL with session token',
            sizeBytes: 0,
          ),
          sampleAttachment(
            fileId: _uploadedFileId,
            contentType: 'image/png',
            sizeBytes: 321,
          ),
        ],
      );
      final receiptRepository = FakeReceiptOcrReviewRepository();

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillDetailScreen(
            repository: FakeBillRepository(),
            billId: _billId,
            initialBill: sampleBillDetail(id: _billId),
            attachmentRepository: attachmentRepository,
            receiptOcrReviewRepository: receiptRepository,
          ),
        ),
      );
      await tester.pumpAndSettle();

      final action = find.byKey(
        const Key('bill-detail-saved-ocr-discovery-open'),
      );
      await tester.scrollUntilVisible(
        action,
        360,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.ensureVisible(action);

      expect(find.text('Review saved OCR'), findsOneWidget);
      expect(find.bySemanticsLabel('Review saved OCR'), findsOneWidget);
      expect(find.text('Choose receipt to review'), findsNothing);
      expect(
        find.byKey(const Key('saved-ocr-review-receipt-cancel')),
        findsNothing,
      );

      for (final unsafeText in [
        _billId,
        _uploadedFileId,
        'storage/object/key',
        'signed URL',
        'session token',
        'raw OCR full text',
        'payment details',
      ]) {
        expect(visibleText(tester), isNot(contains(unsafeText)));
        expect(find.byTooltip(unsafeText), findsNothing);
        expect(
          find.bySemanticsLabel(RegExp(RegExp.escape(unsafeText))),
          findsNothing,
        );
      }

      await tester.tap(action);
      await tester.pumpAndSettle();

      expect(receiptRepository.getCalls, 1);
      expect(receiptRepository.lastRoute?.billId, _billId);
      expect(receiptRepository.lastRoute?.fileId, _uploadedFileId);
      expect(receiptRepository.lastRoute?.groupId, isNull);
      expect(find.text('Saved OCR review'), findsOneWidget);
      expect(find.text('Reviewing saved OCR for Receipt 1.'), findsOneWidget);
      expect(
        find.text('Receipt, PNG receipt image, 321 bytes'),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('saved-ocr-review-receipt-cancel')),
        findsNothing,
      );
      for (final unsafeText in [
        _billId,
        _uploadedFileId,
        'storage/object/key',
        'signed URL',
        'session token',
        'raw OCR full text',
        'payment details',
      ]) {
        expect(visibleText(tester), isNot(contains(unsafeText)));
        expect(find.byTooltip(unsafeText), findsNothing);
        expect(
          find.bySemanticsLabel(RegExp(RegExp.escape(unsafeText))),
          findsNothing,
        );
      }
      semantics.dispose();
    },
  );

  testWidgets('saved OCR handoff direct open is single-flight guarded', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final getCompleter = Completer<ReceiptOcrReviewDetail>();
    final receiptRepository = FakeReceiptOcrReviewRepository(
      getReviewCompleter: getCompleter,
    );
    final route = ReceiptOcrReviewRoute(billId: _billId, fileId: _fileId);

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillDetailScreen(
          repository: FakeBillRepository(),
          billId: _billId,
          initialBill: sampleBillDetail(id: _billId),
          receiptOcrReviewRepository: receiptRepository,
          initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
            reviewRoute: route,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final openButton = find.byKey(const Key('bill-detail-ocr-review-open'));
    await tester.tap(openButton);
    await tester.tap(openButton, warnIfMissed: false);
    await tester.pump();

    expect(receiptRepository.getCalls, 1);
    expect(receiptRepository.lastRoute?.billId, _billId);
    expect(receiptRepository.lastRoute?.fileId, _fileId);
    expect(receiptRepository.lastRoute?.groupId, isNull);

    getCompleter.complete(sampleReceiptOcrReviewDetail(route));
    await tester.pumpAndSettle();

    expect(find.text('Saved OCR review'), findsOneWidget);
    expect(receiptRepository.getCalls, 1);
  });

  testWidgets('multiple reviewable attachments show chooser without guessing', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final attachmentRepository = FakeBillAttachmentRepository(
      attachments: [
        sampleAttachment(
          fileId: _uploadedFileId,
          contentType: 'image/png',
          sizeBytes: 321,
        ),
        sampleAttachment(
          fileId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          contentType: 'image/jpeg',
          sizeBytes: 2048,
        ),
      ],
    );
    final receiptRepository = FakeReceiptOcrReviewRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillDetailScreen(
          repository: FakeBillRepository(),
          billId: _billId,
          initialBill: sampleBillDetail(id: _billId),
          attachmentRepository: attachmentRepository,
          receiptOcrReviewRepository: receiptRepository,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('bill-detail-saved-ocr-discovery')),
      180,
      scrollable: find.byType(Scrollable).first,
    );
    expect(
      find.text(
        'Multiple receipt attachments can have saved provisional OCR reviews. Choose the matching receipt attachment before applying draft changes.',
      ),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('bill-detail-saved-ocr-discovery-open')),
      findsOneWidget,
    );
    expect(find.text('Choose receipt to review'), findsOneWidget);
    expect(receiptRepository.getCalls, 0);
    expect(visibleText(tester), isNot(contains(_uploadedFileId)));
    expect(visibleText(tester), isNot(contains('bbbbbbbb-bbbb')));
    expect(visibleText(tester), isNot(contains('signed URL')));
    expect(visibleText(tester), isNot(contains('raw OCR full text')));

    final action = find.byKey(
      const Key('bill-detail-saved-ocr-discovery-open'),
    );
    await tester.scrollUntilVisible(
      action,
      180,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    await tester.tap(action);
    await tester.pumpAndSettle();

    expect(find.text('Choose receipt to review'), findsNWidgets(2));
    expect(find.text('Receipt 1'), findsOneWidget);
    expect(find.text('Receipt 2'), findsOneWidget);
    expect(find.text('Receipt, PNG receipt image, 321 bytes'), findsOneWidget);
    expect(find.text('Receipt, JPEG receipt image, 2.0 KB'), findsOneWidget);
    expect(
      find.byKey(const Key('saved-ocr-review-receipt-cancel')),
      findsOneWidget,
    );
    expect(receiptRepository.getCalls, 0);
    expect(visibleText(tester), isNot(contains(_uploadedFileId)));
    expect(visibleText(tester), isNot(contains('bbbbbbbb-bbbb')));
    expect(visibleText(tester), isNot(contains('/var/storage')));
    expect(visibleText(tester), isNot(contains('object-key')));
    expect(visibleText(tester), isNot(contains('signed URL')));
    expect(visibleText(tester), isNot(contains('raw OCR full text')));

    await tester.tap(find.text('Receipt 2'));
    await tester.pumpAndSettle();

    expect(receiptRepository.getCalls, 1);
    expect(receiptRepository.lastRoute?.billId, _billId);
    expect(
      receiptRepository.lastRoute?.fileId,
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    );
    expect(receiptRepository.lastRoute?.groupId, isNull);
    expect(find.text('Saved OCR review'), findsOneWidget);
    expect(find.text('Reviewing saved OCR for Receipt 2.'), findsOneWidget);
    expect(find.text('Receipt, JPEG receipt image, 2.0 KB'), findsOneWidget);
    expect(visibleText(tester), isNot(contains(_uploadedFileId)));
    expect(visibleText(tester), isNot(contains('bbbbbbbb-bbbb')));
  });

  testWidgets(
    'mixed receipt chooser lists only safe candidates with bounded labels',
    (tester) async {
      await useLargeSurface(tester);
      await tester.binding.setSurfaceSize(const Size(900, 2400));
      final attachmentRepository = FakeBillAttachmentRepository(
        attachments: [
          sampleAttachment(
            fileId: _uploadedFileId,
            contentType: 'image/png',
            sizeBytes: 321,
          ),
          sampleAttachment(
            fileId: '/var/storage/object-key/receipt.png',
            contentType: 'image/jpeg',
            sizeBytes: 2048,
          ),
          sampleAttachment(
            fileId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            contentType: 'image/jpeg',
            sizeBytes: 2048,
          ),
          sampleAttachment(
            fileId: 'https://signed.example/receipt?token=session-secret',
            contentType: 'payment details raw OCR full text',
            sizeBytes: 4096,
          ),
        ],
      );
      final receiptRepository = FakeReceiptOcrReviewRepository();

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillDetailScreen(
            repository: FakeBillRepository(),
            billId: _billId,
            initialBill: sampleBillDetail(id: _billId),
            attachmentRepository: attachmentRepository,
            receiptOcrReviewRepository: receiptRepository,
          ),
        ),
      );
      await tester.pumpAndSettle();

      final action = find.byKey(
        const Key('bill-detail-saved-ocr-discovery-open'),
      );
      await tester.scrollUntilVisible(
        action,
        180,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.ensureVisible(action);
      await tester.drag(find.byType(Scrollable).first, const Offset(0, -120));
      await tester.pumpAndSettle();
      await tester.tap(action);
      await tester.pumpAndSettle();

      expect(find.text('Receipt 1'), findsOneWidget);
      expect(find.text('Receipt 2'), findsOneWidget);
      expect(find.text('Receipt 3'), findsNothing);
      expect(
        find.text('Receipt, PNG receipt image, 321 bytes'),
        findsOneWidget,
      );
      expect(find.text('Receipt, JPEG receipt image, 2.0 KB'), findsOneWidget);
      expect(visibleText(tester), isNot(contains(_uploadedFileId)));
      expect(visibleText(tester), isNot(contains('bbbbbbbb-bbbb')));
      expect(visibleText(tester), isNot(contains('/var/storage')));
      expect(visibleText(tester), isNot(contains('object-key')));
      expect(visibleText(tester), isNot(contains('signed.example')));
      expect(visibleText(tester), isNot(contains('session-secret')));
      expect(visibleText(tester), isNot(contains('payment details')));
      expect(visibleText(tester), isNot(contains('raw OCR full text')));

      await tester.tap(find.text('Receipt 2'));
      await tester.pumpAndSettle();

      expect(receiptRepository.getCalls, 1);
      expect(
        receiptRepository.lastRoute?.fileId,
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      );
      expect(find.text('Reviewing saved OCR for Receipt 2.'), findsOneWidget);
      expect(find.text('Receipt, JPEG receipt image, 2.0 KB'), findsOneWidget);
      expect(visibleText(tester), isNot(contains('bbbbbbbb-bbbb')));
      expect(visibleText(tester), isNot(contains('/var/storage')));
      expect(visibleText(tester), isNot(contains('signed.example')));
      expect(visibleText(tester), isNot(contains('raw OCR full text')));
    },
  );

  testWidgets('multiple receipt chooser can be cancelled without opening', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final attachmentRepository = FakeBillAttachmentRepository(
      attachments: [
        sampleAttachment(fileId: _uploadedFileId),
        sampleAttachment(fileId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
      ],
    );
    final receiptRepository = FakeReceiptOcrReviewRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillDetailScreen(
          repository: FakeBillRepository(),
          billId: _billId,
          initialBill: sampleBillDetail(id: _billId),
          attachmentRepository: attachmentRepository,
          receiptOcrReviewRepository: receiptRepository,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('bill-detail-saved-ocr-discovery-open')),
      180,
      scrollable: find.byType(Scrollable).first,
    );
    final action = find.byKey(
      const Key('bill-detail-saved-ocr-discovery-open'),
    );
    await tester.scrollUntilVisible(
      action,
      180,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    await tester.tap(action);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('saved-ocr-review-receipt-cancel')));
    await tester.pumpAndSettle();

    expect(receiptRepository.getCalls, 0);
    expect(find.text('Receipt 1'), findsNothing);
    expect(find.text('Receipt 2'), findsNothing);
  });

  testWidgets('multiple receipt chooser opens one bounded chooser', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final attachmentRepository = FakeBillAttachmentRepository(
      attachments: [
        sampleAttachment(fileId: _uploadedFileId),
        sampleAttachment(fileId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillDetailScreen(
          repository: FakeBillRepository(),
          billId: _billId,
          initialBill: sampleBillDetail(id: _billId),
          attachmentRepository: attachmentRepository,
          receiptOcrReviewRepository: FakeReceiptOcrReviewRepository(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final action = find.byKey(
      const Key('bill-detail-saved-ocr-discovery-open'),
    );
    await tester.scrollUntilVisible(
      action,
      180,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    await tester.tap(action);
    await tester.tap(action, warnIfMissed: false);
    await tester.pumpAndSettle();

    expect(find.text('Receipt 1'), findsOneWidget);
    expect(find.text('Receipt 2'), findsOneWidget);
    expect(
      find.byKey(const Key('saved-ocr-review-receipt-cancel')),
      findsOneWidget,
    );
  });

  testWidgets(
    'personal bill detail keeps saved OCR discovery bounded when route context is unusable',
    (tester) async {
      await useLargeSurface(tester);
      final attachmentRepository = FakeBillAttachmentRepository(
        attachments: [
          sampleAttachment(fileId: 'storage/object/key/receipt.png'),
        ],
      );
      final receiptRepository = FakeReceiptOcrReviewRepository();

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillDetailScreen(
            repository: FakeBillRepository(),
            billId: _billId,
            initialBill: sampleBillDetail(id: _billId),
            attachmentRepository: attachmentRepository,
            receiptOcrReviewRepository: receiptRepository,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(
        find.byKey(const Key('bill-detail-saved-ocr-discovery')),
        180,
        scrollable: find.byType(Scrollable).first,
      );
      expect(
        find.text(
          'Saved provisional OCR reviews can be opened from a receipt attachment when one is available.',
        ),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('bill-detail-saved-ocr-discovery-open')),
        findsNothing,
      );
      expect(
        find.byKey(const ValueKey('bill-attachments-ocr-0')),
        findsOneWidget,
      );
      expect(find.text('Review saved OCR'), findsNothing);
      expect(receiptRepository.getCalls, 0);
      expect(visibleText(tester), isNot(contains('storage/object/key')));
      expect(visibleText(tester), isNot(contains('signed URL')));
      expect(visibleText(tester), isNot(contains('raw OCR full text')));
      expect(visibleText(tester), isNot(contains('payment details')));
      expect(visibleText(tester), isNot(contains('session')));
    },
  );

  testWidgets(
    'group bill detail direct saved OCR discovery preserves group route context',
    (tester) async {
      await useLargeSurface(tester);
      await tester.binding.setSurfaceSize(const Size(900, 2400));
      final attachmentRepository = FakeBillAttachmentRepository(
        attachments: [sampleAttachment(fileId: _uploadedFileId)],
      );
      final receiptRepository = FakeReceiptOcrReviewRepository();

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraGroupBillDetailScreen(
            repository: FakeBillRepository(),
            groupId: _groupId,
            groupName: 'Trip',
            billId: _billId,
            initialBill: sampleBillDetail(id: _billId),
            attachmentRepository: attachmentRepository,
            receiptOcrReviewRepository: receiptRepository,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(
        find.byKey(const Key('group-bill-detail-saved-ocr-discovery-open')),
        180,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      expect(
        find.byKey(const Key('group-bill-detail-saved-ocr-discovery-open')),
        findsOneWidget,
      );
      await tester.tap(
        find.byKey(const Key('group-bill-detail-saved-ocr-discovery-open')),
      );
      await tester.pumpAndSettle();

      expect(receiptRepository.getCalls, 1);
      expect(receiptRepository.lastRoute?.billId, _billId);
      expect(receiptRepository.lastRoute?.fileId, _uploadedFileId);
      expect(receiptRepository.lastRoute?.groupId, _groupId);
      expect(find.text('Saved OCR review'), findsOneWidget);
      expect(find.text('Reviewing saved OCR for Receipt 1.'), findsOneWidget);
      expect(
        find.text('Receipt, PNG receipt image, 321 bytes'),
        findsOneWidget,
      );
      expect(visibleText(tester), isNot(contains(_uploadedFileId)));
      expect(visibleText(tester), isNot(contains('signed URL')));
      expect(visibleText(tester), isNot(contains('raw OCR full text')));
    },
  );

  testWidgets(
    'group bill multiple receipt chooser preserves selected group route context',
    (tester) async {
      await useLargeSurface(tester);
      await tester.binding.setSurfaceSize(const Size(900, 2400));
      final attachmentRepository = FakeBillAttachmentRepository(
        attachments: [
          sampleAttachment(fileId: _uploadedFileId),
          sampleAttachment(fileId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
        ],
      );
      final receiptRepository = FakeReceiptOcrReviewRepository();

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraGroupBillDetailScreen(
            repository: FakeBillRepository(),
            groupId: _groupId,
            groupName: 'Trip',
            billId: _billId,
            initialBill: sampleBillDetail(id: _billId),
            attachmentRepository: attachmentRepository,
            receiptOcrReviewRepository: receiptRepository,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(
        find.byKey(const Key('group-bill-detail-saved-ocr-discovery-open')),
        180,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(
        find.byKey(const Key('group-bill-detail-saved-ocr-discovery-open')),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Receipt 1'));
      await tester.pumpAndSettle();

      expect(receiptRepository.getCalls, 1);
      expect(receiptRepository.lastRoute?.billId, _billId);
      expect(receiptRepository.lastRoute?.fileId, _uploadedFileId);
      expect(receiptRepository.lastRoute?.groupId, _groupId);
      expect(find.text('Saved OCR review'), findsOneWidget);
      expect(find.text('Reviewing saved OCR for Receipt 1.'), findsOneWidget);
      expect(visibleText(tester), isNot(contains(_groupId)));
      expect(visibleText(tester), isNot(contains(_uploadedFileId)));
      expect(visibleText(tester), isNot(contains('bbbbbbbb-bbbb')));
      expect(visibleText(tester), isNot(contains('signed URL')));
      expect(visibleText(tester), isNot(contains('raw OCR full text')));
    },
  );

  testWidgets('personal bill attachment upload can choose supporting', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final attachmentRepository = FakeBillAttachmentRepository();
    final receiptRepository = FakeReceiptOcrReviewRepository();
    final fileInput = FakeBillAttachmentFileInput(
      pickedFile: samplePickedAttachmentFile(
        filename: 'C:\\Users\\secret\\support.pdf',
        bytes: const [1, 2, 3],
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: FakeBillRepository(
            bills: [sampleBillSummary()],
            detail: sampleBillDetail(),
          ),
          attachmentRepository: attachmentRepository,
          attachmentFileInput: fileInput,
          receiptOcrReviewRepository: receiptRepository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-attachments-upload')));
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const Key('attachment-upload-purpose-supporting')),
    );
    await tester.pumpAndSettle();

    expect(fileInput.pickCalls, 1);
    expect(
      fileInput.lastAllowedContentTypes,
      SettleoraBillAttachmentContentTypeValues.supportingAttachmentValues,
    );
    expect(attachmentRepository.attachCalls, 1);
    expect(attachmentRepository.lastRoute?.billId, _billId);
    expect(attachmentRepository.lastRoute?.groupId, isNull);
    expect(
      attachmentRepository.lastUpload?.purpose,
      SettleoraBillAttachmentPurposeValues.supportingAttachment,
    );
    expect(attachmentRepository.lastUpload?.filename, 'support.pdf');
    expect(attachmentRepository.lastUpload?.contentType, 'application/pdf');
    expect(attachmentRepository.lastUpload?.bytes, const [1, 2, 3]);
    expect(attachmentRepository.listCalls, 3);
    expect(find.text('Attachment uploaded.'), findsOneWidget);
    expect(find.widgetWithText(SnackBarAction, 'Review receipt'), findsNothing);
    expect(find.text('Review receipt'), findsNothing);
    expect(receiptRepository.getCalls, 0);
    expect(find.text('Supporting attachment'), findsOneWidget);
    expect(find.text('application/pdf'), findsOneWidget);
    expect(find.text('3 bytes'), findsOneWidget);
    expect(visibleText(tester), isNot(contains('C:\\Users\\secret')));
  });

  testWidgets(
    'receipt upload review action stays hidden when refreshed metadata does not confirm receipt',
    (tester) async {
      await useLargeSurface(tester);
      final attachmentRepository = FakeBillAttachmentRepository(
        persistUploads: false,
      );
      final receiptRepository = FakeReceiptOcrReviewRepository();
      final fileInput = FakeBillAttachmentFileInput(
        pickedFile: samplePickedAttachmentFile(
          filename: 'C:\\Users\\secret\\receipt.png',
          contentType: 'image/png',
        ),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: FakeBillRepository(
              bills: [sampleBillSummary()],
              detail: sampleBillDetail(),
            ),
            attachmentRepository: attachmentRepository,
            attachmentFileInput: fileInput,
            receiptOcrReviewRepository: receiptRepository,
            syncController: sampleBillSyncController(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Corner Market'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('bill-attachments-upload')));
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const Key('attachment-upload-purpose-receipt')),
      );
      await tester.pumpAndSettle();

      expect(attachmentRepository.attachCalls, 1);
      expect(attachmentRepository.listCalls, 3);
      expect(
        find.text(
          'Receipt uploaded. Review OCR before applying it to a draft.',
        ),
        findsOneWidget,
      );
      expect(
        find.widgetWithText(SnackBarAction, 'Review receipt'),
        findsNothing,
      );
      expect(receiptRepository.getCalls, 0);
      expect(find.text('No attachments'), findsOneWidget);
    },
  );

  testWidgets('personal bill attachment upload failure stays bounded', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final attachmentRepository = FakeBillAttachmentRepository(
      attachFailure: const SettleoraBillAttachmentFailure(
        kind: SettleoraBillAttachmentFailureKind.validation,
        message:
            'The attachment request is no longer valid. Refresh and try again.',
      ),
    );
    final fileInput = FakeBillAttachmentFileInput(
      pickedFile: samplePickedAttachmentFile(),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: FakeBillRepository(
            bills: [sampleBillSummary()],
            detail: sampleBillDetail(),
          ),
          attachmentRepository: attachmentRepository,
          attachmentFileInput: fileInput,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-attachments-upload')));
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const Key('attachment-upload-purpose-supporting')),
    );
    await tester.pumpAndSettle();

    expect(attachmentRepository.attachCalls, 1);
    expect(attachmentRepository.listCalls, 1);
    expect(find.text('Unsupported request'), findsOneWidget);
    expect(
      find.text(
        'The attachment request is no longer valid. Refresh and try again.',
      ),
      findsOneWidget,
    );
    expect(find.text('Supporting attachment'), findsNothing);
    expect(visibleText(tester), isNot(contains('[1, 2, 3]')));
    expect(visibleText(tester), isNot(contains('C:\\Users\\secret')));
    expect(
      find.byKey(const Key('bill-attachments-upload-progress')),
      findsNothing,
    );
    _expectAttachmentUploadEnabled(
      tester,
      const Key('bill-attachments-upload'),
      isTrue,
    );
  });

  testWidgets(
    'personal bill file input failure clears upload state and hides raw details',
    (tester) async {
      await useLargeSurface(tester);
      final attachmentRepository = FakeBillAttachmentRepository();
      final fileInput = FakeBillAttachmentFileInput(
        failure: const SettleoraBillAttachmentFileInputFailure(
          'Failed to read C:\\Users\\secret\\receipt.png\nStackTrace: hidden',
        ),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: FakeBillRepository(
              bills: [sampleBillSummary()],
              detail: sampleBillDetail(),
            ),
            attachmentRepository: attachmentRepository,
            attachmentFileInput: fileInput,
            syncController: sampleBillSyncController(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Corner Market'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('bill-attachments-upload')));
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const Key('attachment-upload-purpose-supporting')),
      );
      await tester.pumpAndSettle();

      expect(fileInput.pickCalls, 1);
      expect(attachmentRepository.attachCalls, 0);
      expect(find.text('Unsupported request'), findsOneWidget);
      expect(
        find.text(
          'Choose a supported, readable bill attachment file and try again.',
        ),
        findsOneWidget,
      );
      expect(visibleText(tester), isNot(contains('C:\\Users\\secret')));
      expect(visibleText(tester), isNot(contains('StackTrace')));
      expect(
        find.byKey(const Key('bill-attachments-upload-progress')),
        findsNothing,
      );
      _expectAttachmentUploadEnabled(
        tester,
        const Key('bill-attachments-upload'),
        isTrue,
      );
    },
  );

  testWidgets('personal bill upload refresh failure clears busy state', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final attachmentRepository = FakeBillAttachmentRepository(
      listFailuresByCall: const {
        3: SettleoraBillAttachmentFailure(
          kind: SettleoraBillAttachmentFailureKind.server,
          message: 'Attachments are unavailable right now. Try again later.',
        ),
      },
    );
    final fileInput = FakeBillAttachmentFileInput(
      pickedFile: samplePickedAttachmentFile(
        filename: 'C:\\Users\\secret\\receipt.png',
        contentType: 'image/png',
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: FakeBillRepository(
            bills: [sampleBillSummary()],
            detail: sampleBillDetail(),
          ),
          attachmentRepository: attachmentRepository,
          attachmentFileInput: fileInput,
          receiptOcrReviewRepository: FakeReceiptOcrReviewRepository(),
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-attachments-upload')));
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const Key('attachment-upload-purpose-receipt')),
    );
    await tester.pumpAndSettle();

    expect(attachmentRepository.attachCalls, 1);
    expect(attachmentRepository.listCalls, 3);
    expect(find.text('Attachments unavailable'), findsOneWidget);
    expect(
      find.text('Attachments are unavailable right now. Try again later.'),
      findsOneWidget,
    );
    expect(
      find.text('Receipt uploaded. Review OCR before applying it to a draft.'),
      findsOneWidget,
    );
    expect(find.widgetWithText(SnackBarAction, 'Review receipt'), findsNothing);
    expect(visibleText(tester), isNot(contains('C:\\Users\\secret')));
    expect(
      find.byKey(const Key('bill-attachments-upload-progress')),
      findsNothing,
    );
    _expectAttachmentUploadEnabled(
      tester,
      const Key('bill-attachments-upload'),
      isTrue,
    );
  });

  testWidgets('receipt attachment OCR review uses typed attachment route', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final attachmentRepository = FakeBillAttachmentRepository(
      attachments: [
        sampleAttachment(
          fileId: _fileId,
          purpose: SettleoraBillAttachmentPurposeValues.receipt,
          contentType: 'image/png',
        ),
      ],
    );
    final receiptRepository = FakeReceiptOcrReviewRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: FakeBillRepository(
            bills: [sampleBillSummary()],
            detail: sampleBillDetail(),
          ),
          attachmentRepository: attachmentRepository,
          receiptOcrReviewRepository: receiptRepository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const ValueKey('bill-attachments-ocr-0')),
    );
    await tester.tap(find.byKey(const ValueKey('bill-attachments-ocr-0')));
    await tester.pumpAndSettle();

    expect(receiptRepository.getCalls, 1);
    expect(receiptRepository.lastRoute?.billId, _billId);
    expect(receiptRepository.lastRoute?.fileId, _fileId);
    expect(receiptRepository.lastRoute?.groupId, isNull);
    expect(visibleText(tester), isNot(contains('C:\\Users\\secret')));
  });

  testWidgets('bill detail creates revision after fresh capability checks', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final detail = sampleBillDetail(canCreateRevision: true);
    final repository = FakeBillRepository(
      bills: [sampleBillSummary()],
      details: [detail, detail, detail],
    );
    final revisionRepository = FakeBillRevisionRepository(
      listResponses: const [],
      createResponse: sampleRevision(id: _createdRevisionId),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          revisionRepository: revisionRepository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-detail-propose-change')));
    await tester.pumpAndSettle();

    expect(find.text('Create proposal'), findsOneWidget);
    expect(
      tester
          .widget<TextFormField>(find.byKey(const Key('proposal-total-amount')))
          .controller
          ?.text,
      '10.80',
    );

    await tester.tap(find.byKey(const Key('bill-revision-proposal-save')));
    await tester.pumpAndSettle();

    expect(repository.getCalls, 3);
    expect(revisionRepository.createCalls, 1);
    expect(revisionRepository.lastCreatedBillId, _billId);
    expect(revisionRepository.lastProposal?.totalAmount, '10.80');
    expect(
      revisionRepository.lastProposal?.participants.single.userProfileId,
      _userProfileId,
    );
    expect(revisionRepository.getCalls, 1);
    expect(find.text('Revision review'), findsOneWidget);
  });

  testWidgets(
    'bill detail stops create entry when refreshed capability denies',
    (tester) async {
      await useLargeSurface(tester);
      final repository = FakeBillRepository(
        bills: [sampleBillSummary()],
        details: [
          sampleBillDetail(canCreateRevision: true),
          sampleBillDetail(canCreateRevision: false),
        ],
      );
      final revisionRepository = FakeBillRevisionRepository(
        listResponses: const [],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraBillListScreen(
            repository: repository,
            revisionRepository: revisionRepository,
            syncController: sampleBillSyncController(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Corner Market'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('bill-detail-propose-change')));
      await tester.pumpAndSettle();

      expect(repository.getCalls, 2);
      expect(revisionRepository.createCalls, 0);
      expect(find.byKey(const Key('bill-detail-propose-change')), findsNothing);
      expect(
        find.byKey(const Key('bill-detail-propose-change-failure')),
        findsOneWidget,
      );
      expect(find.textContaining('Refresh needed'), findsOneWidget);
    },
  );

  testWidgets('bill detail create save refreshes capability before mutation', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeBillRepository(
      bills: [sampleBillSummary()],
      details: [
        sampleBillDetail(canCreateRevision: true),
        sampleBillDetail(canCreateRevision: true),
        sampleBillDetail(canCreateRevision: false),
      ],
    );
    final revisionRepository = FakeBillRevisionRepository(
      listResponses: const [],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          revisionRepository: revisionRepository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-detail-propose-change')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-revision-proposal-save')));
    await tester.pumpAndSettle();

    expect(repository.getCalls, 3);
    expect(revisionRepository.createCalls, 0);
    expect(find.text('Refresh needed'), findsOneWidget);
    expect(
      find.text(
        'This bill can no longer accept a revision proposal. Review the refreshed bill before trying again.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('bill detail create failure stays bounded in editor', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final detail = sampleBillDetail(canCreateRevision: true);
    final repository = FakeBillRepository(
      bills: [sampleBillSummary()],
      details: [detail, detail, detail],
    );
    final revisionRepository = FakeBillRevisionRepository(
      listResponses: const [],
      createFailure: const SettleoraBillRevisionFailure(
        kind: SettleoraBillRevisionFailureKind.validation,
        message:
            'This proposal includes unsupported fields or amounts. Review the highlighted fields.',
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraBillListScreen(
          repository: repository,
          revisionRepository: revisionRepository,
          syncController: sampleBillSyncController(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-detail-propose-change')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-revision-proposal-save')));
    await tester.pumpAndSettle();

    expect(revisionRepository.createCalls, 1);
    expect(find.text('Unsupported request'), findsOneWidget);
    expect(
      find.text(
        'This proposal includes unsupported fields or amounts. Review the highlighted fields.',
      ),
      findsOneWidget,
    );
    expect(find.text('Revision review'), findsNothing);
  });

  testWidgets('authenticated server shell opens bills', (tester) async {
    await useLargeSurface(tester);
    final store = MemorySyncQueueStore();
    final controller = SettleoraBillSyncController(
      queueStore: store,
      queueProcessor: SettleoraSyncQueueProcessor(
        queueStore: store,
        repository: FakeSyncRepository([]),
      ),
    );
    final billRepository = FakeBillRepository(bills: [sampleBillSummary()]);
    final attachmentRepository = FakeBillAttachmentRepository(
      attachments: [sampleAttachment()],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraAuthenticatedServerShell(
          currentUser: sampleCurrentUser(),
          receiptOcrReviewRepository: FakeReceiptOcrReviewRepository(),
          billRepository: billRepository,
          billAttachmentRepository: attachmentRepository,
          settlementRepository: FakeSettlementRepository(),
          recurringBillRepository: FakeRecurringBillRepository(),
          groupRepository: FakeGroupRepository(),
          notificationRepository: FakeNotificationRepository(),
          reportRepository: FakeMonthlyReportRepository(),
          profileRepository: FakeProfileRepository(),
          billSyncController: controller,
          authRepository: FakeAuthRepository(),
          accessTokenProvider: FakeAccessTokenProvider('redacted'),
          onSessionEnded: (_) async {},
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.byKey(const Key('server-shell-bills')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('server-shell-bills')));
    await tester.pumpAndSettle();

    expect(find.text('Bills'), findsWidgets);
    expect(find.text('Corner Market'), findsOneWidget);
    expect(billRepository.listCalls, 2);

    await tester.tap(
      find.ancestor(
        of: find.text('Corner Market'),
        matching: find.byType(ListTile),
      ),
    );
    await tester.pumpAndSettle();

    expect(attachmentRepository.listCalls, 2);
    expect(attachmentRepository.lastRoute?.billId, _billId);
  });

  testWidgets('authenticated server shell opens settlements', (tester) async {
    final store = MemorySyncQueueStore();
    final controller = SettleoraBillSyncController(
      queueStore: store,
      queueProcessor: SettleoraSyncQueueProcessor(
        queueStore: store,
        repository: FakeSyncRepository([]),
      ),
    );
    final settlementRepository = FakeSettlementRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraAuthenticatedServerShell(
          currentUser: sampleCurrentUser(),
          receiptOcrReviewRepository: FakeReceiptOcrReviewRepository(),
          billRepository: FakeBillRepository(bills: [sampleBillSummary()]),
          billAttachmentRepository: FakeBillAttachmentRepository(),
          settlementRepository: settlementRepository,
          recurringBillRepository: FakeRecurringBillRepository(),
          groupRepository: FakeGroupRepository(),
          notificationRepository: FakeNotificationRepository(),
          reportRepository: FakeMonthlyReportRepository(),
          profileRepository: FakeProfileRepository(),
          billSyncController: controller,
          authRepository: FakeAuthRepository(),
          accessTokenProvider: FakeAccessTokenProvider('redacted'),
          onSessionEnded: (_) async {},
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.ensureVisible(
      find.byKey(const Key('server-shell-settlements')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('server-shell-settlements')));
    await tester.pumpAndSettle();

    expect(find.text('Settlements'), findsOneWidget);
    expect(find.text('No balances'), findsOneWidget);
    expect(settlementRepository.listBalancesCalls, 2);
    expect(settlementRepository.listRequestsCalls, 2);
  });
}

Future<void> useLargeSurface(WidgetTester tester) async {
  await tester.binding.setSurfaceSize(const Size(900, 1600));
  addTearDown(() => tester.binding.setSurfaceSize(null));
}

void _expectAttachmentUploadEnabled(
  WidgetTester tester,
  Key key,
  Matcher matcher,
) {
  _expectOutlinedButtonEnabled(tester, key, matcher);
}

void _expectOutlinedButtonEnabled(
  WidgetTester tester,
  Key key,
  Matcher matcher,
) {
  final button = tester.widget<OutlinedButton>(find.byKey(key));
  expect(button.onPressed != null, matcher);
}

void _expectIconButtonEnabled(WidgetTester tester, Key key, Matcher matcher) {
  final button = tester.widget<IconButton>(find.byKey(key));
  expect(button.onPressed != null, matcher);
}

Future<void> _fillMinimalCreateForm(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('personal-bill-date-today')));
  await tester.pumpAndSettle();
  await tester.enterText(
    find.byKey(const Key('personal-bill-item-name-0')),
    'Coffee',
  );
  await tester.enterText(
    find.byKey(const Key('personal-bill-item-amount-0')),
    '7.50',
  );
}

String _formatTestBillDate(DateTime value) {
  final year = value.year.toString().padLeft(4, '0');
  final month = value.month.toString().padLeft(2, '0');
  final day = value.day.toString().padLeft(2, '0');
  return '$year-$month-$day';
}

Future<void> _tapSaveBill(WidgetTester tester) async {
  final saveButton = find.byKey(const Key('personal-bill-save'));
  await tester.tap(saveButton);
  await tester.pumpAndSettle();
}

Future<void> _chooseDropdownValue(
  WidgetTester tester,
  Key dropdownKey,
  String label,
) async {
  final finder = find.byKey(dropdownKey);
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await tester.pumpAndSettle();
  await tester.tap(find.text(_currencyDropdownLabel(label)).hitTestable().last);
  await tester.pumpAndSettle();
}

String _currencyDropdownLabel(String code) {
  return switch (code) {
    'HKD' => 'HKD - Hong Kong Dollar',
    'USD' => 'USD - US Dollar',
    'EUR' => 'EUR - Euro',
    'GBP' => 'GBP - British Pound',
    'JPY' => 'JPY - Japanese Yen',
    'KWD' => 'KWD - Kuwaiti Dinar',
    'BHD' => 'BHD - Bahraini Dinar',
    _ => code,
  };
}

Future<void> _discardPersonalBillCreateDraft(WidgetTester tester) async {
  await tester.pageBack();
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('personal-bill-exit-discard')));
  await tester.pumpAndSettle();
}

Future<void> _pumpGroupBillCreate(
  WidgetTester tester, {
  required FakeBillRepository repository,
  required FakeGroupRepository groupRepository,
  FakeBillAttachmentRepository? attachmentRepository,
  FakeBillAttachmentFileInput? attachmentFileInput,
  ReceiptImageIntake? receiptImageIntake,
  ReceiptOcrProvider? receiptOcrProvider,
  ReceiptOcrReviewRepository? receiptOcrReviewRepository,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: SettleoraGroupBillListScreen(
        repository: repository,
        groupRepository: groupRepository,
        groupId: _groupId,
        groupName: 'Trip',
        attachmentRepository: attachmentRepository,
        attachmentFileInput: attachmentFileInput,
        receiptImageIntake: receiptImageIntake,
        receiptOcrProvider: receiptOcrProvider,
        receiptOcrReviewRepository: receiptOcrReviewRepository,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _fillMinimalGroupBillCreateForm(
  WidgetTester tester, {
  String splitMemberId = _userProfileId,
  bool assignItem = true,
}) async {
  await _goToGroupBillCreateStep(tester, 'basics');
  await tester.tap(find.byKey(const Key('group-bill-date-today')));
  await tester.pumpAndSettle();
  await _goToGroupBillCreateStep(tester, 'receiptItems');
  await tester.enterText(
    find.byKey(const ValueKey('group-bill-item-name-0')),
    'Eggs',
  );
  await tester.enterText(
    find.byKey(const ValueKey('group-bill-item-amount-0')),
    '12.30',
  );
  if (assignItem) {
    await _assignFirstGroupBillItem(tester, memberId: splitMemberId);
  }
}

Future<void> _assignFirstGroupBillItem(
  WidgetTester tester, {
  String memberId = _userProfileId,
  String? exactAmount,
}) async {
  await _goToGroupBillCreateStep(tester, 'split');
  await tester.ensureVisible(
    find.byKey(const Key('group-bill-assignable-item-0')),
  );
  await tester.tap(find.byKey(const Key('group-bill-assignable-item-0')));
  await tester.pumpAndSettle();

  final memberFinder = find.byKey(
    ValueKey('group-bill-assign-item-member-$memberId'),
  );
  await tester.ensureVisible(memberFinder);
  final memberTile = tester.widget<CheckboxListTile>(memberFinder);
  if (memberTile.value != true) {
    await tester.tap(memberFinder);
    await tester.pumpAndSettle();
  }

  if (exactAmount != null) {
    await tester.tap(
      find.byKey(const Key('group-bill-assignment-method-exactAmount')),
    );
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(ValueKey('group-bill-assign-exact-$memberId')),
      exactAmount,
    );
    await tester.pumpAndSettle();
  }

  await tester.tap(find.byKey(const Key('group-bill-assign-item-apply')));
  await tester.pumpAndSettle();
}

Future<void> _tapSaveGroupBill(WidgetTester tester) async {
  await _goToGroupBillCreateStep(tester, 'review');
  await tester.tap(find.byKey(const Key('group-bill-save')));
  await tester.pumpAndSettle();
}

Future<void> _tapReceiptOcrApply(WidgetTester tester, String keyPrefix) async {
  final finder = find.byKey(Key('$keyPrefix-ocr-apply'));
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

Future<void> _scrollSavedOcrReviewEditActionsIntoView(
  WidgetTester tester,
) async {
  final editContent = find.byKey(const Key('saved-ocr-review-edit-content'));
  await tester.drag(editContent, const Offset(0, -700));
  await tester.pumpAndSettle();
  await tester.drag(editContent, const Offset(0, -700));
  await tester.pumpAndSettle();
}

Future<void> _setReceiptOcrSection(
  WidgetTester tester,
  String keyPrefix,
  String section,
  bool selected,
) async {
  final finder = find.byKey(Key('$keyPrefix-ocr-apply-$section'));
  await tester.ensureVisible(finder);
  final tile = tester.widget<CheckboxListTile>(finder);
  if (tile.value != selected) {
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }
}

Future<void> _goToGroupBillCreateStep(
  WidgetTester tester,
  String stepName,
) async {
  final stepFinder = find.byKey(ValueKey('group-bill-create-step-$stepName'));
  await tester.ensureVisible(stepFinder);
  await tester.tap(stepFinder);
  await tester.pumpAndSettle();
}

Future<void> _addDraftAttachment(WidgetTester tester, Key purposeKey) async {
  await tester.tap(find.byKey(const Key('personal-bill-attachment-add')));
  await tester.pump(const Duration(milliseconds: 300));
  final purposeTile = tester.widget<ListTile>(find.byKey(purposeKey));
  purposeTile.onTap?.call();
  await tester.pumpAndSettle();
}

Future<void> _addGroupDraftAttachment(
  WidgetTester tester,
  Key purposeKey,
) async {
  await _goToGroupBillCreateStep(tester, 'receiptItems');
  final addButton = find.byKey(const Key('group-bill-attachment-add'));
  await tester.ensureVisible(addButton);
  await tester.pumpAndSettle();
  await tester.tap(addButton);
  await tester.pump(const Duration(milliseconds: 300));
  final purposeTile = tester.widget<ListTile>(find.byKey(purposeKey));
  purposeTile.onTap?.call();
  await tester.pumpAndSettle();
}

SettleoraBillSyncController sampleBillSyncController() {
  final store = MemorySyncQueueStore();
  return SettleoraBillSyncController(
    queueStore: store,
    queueProcessor: SettleoraSyncQueueProcessor(
      queueStore: store,
      repository: FakeSyncRepository([]),
    ),
  );
}

class FakeBillRepository implements SettleoraBillRepository {
  FakeBillRepository({
    this.bills = const [],
    this.groupBills = const [],
    SettleoraBillDetail? detail,
    List<SettleoraBillDetail>? details,
    SettleoraBillDetail? createdDetail,
    this.failure,
    this.createFailure,
    this.detailFailuresByCall = const {},
    this.groupDetailFailuresByCall = const {},
  }) : details = details ?? [detail ?? sampleBillDetail()],
       createdDetail = createdDetail ?? sampleBillDetail();

  final List<SettleoraBillSummary> bills;
  final List<SettleoraBillSummary> groupBills;
  final List<SettleoraBillDetail> details;
  final SettleoraBillDetail createdDetail;
  final SettleoraBillFailure? failure;
  final SettleoraBillFailure? createFailure;
  final Map<int, SettleoraBillFailure> detailFailuresByCall;
  final Map<int, SettleoraBillFailure> groupDetailFailuresByCall;
  int listCalls = 0;
  int createCalls = 0;
  int groupCreateCalls = 0;
  int submitGroupCalls = 0;
  int getCalls = 0;
  int listGroupCalls = 0;
  int getGroupCalls = 0;
  SettleoraPersonalBillCreateDraft? lastCreateDraft;
  SettleoraGroupBillCreateDraft? lastGroupCreateDraft;

  SettleoraBillDetail _detailForCall(int callIndex) {
    final index = callIndex < details.length ? callIndex : details.length - 1;
    return details[index];
  }

  @override
  Future<SettleoraBillDetail> createPersonalBill(
    SettleoraPersonalBillCreateDraft draft,
  ) async {
    createCalls += 1;
    lastCreateDraft = draft;
    final failure = createFailure;
    if (failure != null) {
      throw failure;
    }

    return createdDetail;
  }

  @override
  Future<SettleoraBillDetail> createGroupBill(
    String groupId,
    SettleoraGroupBillCreateDraft draft,
  ) async {
    groupCreateCalls += 1;
    lastGroupCreateDraft = draft;
    final failure = createFailure;
    if (failure != null) {
      throw failure;
    }

    return createdDetail;
  }

  @override
  Future<void> submitGroupBill(String groupId, String billId) async {
    submitGroupCalls += 1;
  }

  @override
  Future<void> acceptGroupBillParticipant(
    String groupId,
    String billId,
    String userProfileId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<void> rejectGroupBillParticipant(
    String groupId,
    String billId,
    String userProfileId,
    SettleoraBillParticipantRejectionReasonCode reasonCode,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<List<SettleoraBillSummary>> listGroupBills(
    String groupId, {
    int limit = 50,
  }) async {
    listGroupCalls += 1;
    final failure = this.failure;
    if (failure != null) {
      throw failure;
    }

    return groupBills;
  }

  @override
  Future<SettleoraBillDetail> getGroupBill(
    String groupId,
    String billId,
  ) async {
    getGroupCalls += 1;
    final failure = groupDetailFailuresByCall[getGroupCalls];
    if (failure != null) {
      throw failure;
    }
    return _detailForCall(getGroupCalls - 1);
  }

  @override
  Future<List<SettleoraBillSummary>> listPersonalBills({int limit = 50}) async {
    listCalls += 1;
    final failure = this.failure;
    if (failure != null) {
      throw failure;
    }

    return bills;
  }

  @override
  Future<SettleoraBillDetail> getPersonalBill(String billId) async {
    getCalls += 1;
    final failure = detailFailuresByCall[getCalls];
    if (failure != null) {
      throw failure;
    }
    return _detailForCall(getCalls - 1);
  }
}

class FakeBillAttachmentRepository
    implements SettleoraBillAttachmentRepository {
  FakeBillAttachmentRepository({
    this.attachments = const [],
    this.listFailures = const [],
    this.listFailuresByCall = const {},
    this.listCompletersByCall = const {},
    this.downloadedBytes = const [7, 8, 9],
    this.downloadFailure,
    this.downloadCompleter,
    this.attachFailure,
    this.attachFailuresByCall = const {},
    this.attachCompleter,
    this.removeFailure,
    this.removeCompleter,
    this.persistUploads = true,
  });

  List<SettleoraBillAttachment> attachments;
  final List<SettleoraBillAttachmentFailure> listFailures;
  final Map<int, SettleoraBillAttachmentFailure> listFailuresByCall;
  final Map<int, Completer<List<SettleoraBillAttachment>>> listCompletersByCall;
  final List<int> downloadedBytes;
  final SettleoraBillAttachmentFailure? downloadFailure;
  final Completer<void>? downloadCompleter;
  final SettleoraBillAttachmentFailure? attachFailure;
  final Map<int, SettleoraBillAttachmentFailure> attachFailuresByCall;
  final Completer<void>? attachCompleter;
  final SettleoraBillAttachmentFailure? removeFailure;
  final Completer<void>? removeCompleter;
  final bool persistUploads;
  int listCalls = 0;
  int attachCalls = 0;
  int removeCalls = 0;
  int downloadCalls = 0;
  SettleoraBillAttachmentRoute? lastRoute;
  SettleoraBillAttachmentUpload? lastUpload;
  final List<SettleoraBillAttachmentRoute> uploadRoutes = [];
  final List<SettleoraBillAttachmentUpload> uploads = [];
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
    uploadRoutes.add(route);
    uploads.add(upload);
    final failure = attachFailure;
    if (failure != null) {
      throw failure;
    }
    final callFailure = attachFailuresByCall[attachCalls];
    if (callFailure != null) {
      throw callFailure;
    }
    await attachCompleter?.future;

    final attachment = SettleoraBillAttachment(
      fileId: attachCalls == 1
          ? _uploadedFileId
          : '$_uploadedFileId-$attachCalls',
      billId: route.billId,
      purpose: upload.purpose,
      contentType: upload.contentType,
      sizeBytes: upload.bytes.length,
      uploadedAtUtc: _updatedAtUtc,
      updatedAtUtc: _updatedAtUtc,
    );
    if (persistUploads) {
      attachments = [
        attachment,
        ...attachments.where((item) => item.fileId != attachment.fileId),
      ];
    }
    return attachment;
  }

  @override
  Future<List<SettleoraBillAttachment>> listAttachments(
    SettleoraBillAttachmentRoute route,
  ) async {
    listCalls += 1;
    lastRoute = route;
    final listCompleter = listCompletersByCall[listCalls];
    final completedAttachments = listCompleter == null
        ? null
        : await listCompleter.future;
    final callFailure = listFailuresByCall[listCalls];
    if (callFailure != null) {
      throw callFailure;
    }
    if (listFailures.length >= listCalls) {
      throw listFailures[listCalls - 1];
    }

    return completedAttachments ?? attachments;
  }

  @override
  Future<void> removeAttachment(
    SettleoraBillAttachmentRoute route,
    String fileId,
  ) async {
    removeCalls += 1;
    lastRoute = route;
    lastRemovedFileId = fileId;
    final failure = removeFailure;
    if (failure != null) {
      throw failure;
    }
    await removeCompleter?.future;
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
    final failure = downloadFailure;
    if (failure != null) {
      throw failure;
    }
    await downloadCompleter?.future;
    return SettleoraBillAttachmentContent(bytes: downloadedBytes);
  }
}

class FakeBillAttachmentFileInput implements SettleoraBillAttachmentFileInput {
  FakeBillAttachmentFileInput({
    this.pickedFile,
    this.pickedFiles = const [],
    this.failure,
    this.pickCompleter,
  });

  final SettleoraPickedBillAttachmentFile? pickedFile;
  final List<SettleoraPickedBillAttachmentFile> pickedFiles;
  final SettleoraBillAttachmentFileInputFailure? failure;
  final Completer<SettleoraPickedBillAttachmentFile?>? pickCompleter;
  int pickCalls = 0;
  Set<String>? lastAllowedContentTypes;

  @override
  Future<SettleoraPickedBillAttachmentFile?> pickAttachmentFile({
    required Set<String> allowedContentTypes,
  }) async {
    pickCalls += 1;
    lastAllowedContentTypes = allowedContentTypes;
    final failure = this.failure;
    if (failure != null) {
      throw failure;
    }

    final pickCompleter = this.pickCompleter;
    if (pickCompleter != null) {
      return pickCompleter.future;
    }

    if (pickCalls <= pickedFiles.length) {
      return pickedFiles[pickCalls - 1];
    }

    return pickedFile;
  }
}

class FakeReceiptImageIntake implements ReceiptImageIntake {
  FakeReceiptImageIntake({this.pickedFile, this.failure});

  final SettleoraPickedBillAttachmentFile? pickedFile;
  final SettleoraBillAttachmentFileInputFailure? failure;
  int pickCalls = 0;
  ReceiptImageSource? lastSource;

  @override
  Future<SettleoraPickedBillAttachmentFile?> pickReceiptImage({
    required ReceiptImageSource source,
  }) async {
    pickCalls += 1;
    lastSource = source;
    final failure = this.failure;
    if (failure != null) {
      throw failure;
    }

    return pickedFile;
  }
}

class FakeReceiptOcrProvider implements ReceiptOcrProvider {
  FakeReceiptOcrProvider(this.result, {this.resultBuilder});

  final ReceiptOcrResult result;
  final ReceiptOcrResult Function(ReceiptOcrRequest request)? resultBuilder;
  int calls = 0;
  ReceiptOcrRequest? lastRequest;

  @override
  Future<ReceiptOcrResult> extractReceipt(ReceiptOcrRequest request) async {
    calls += 1;
    lastRequest = request;
    return resultBuilder?.call(request) ?? result;
  }
}

class FakeBillRevisionRepository implements SettleoraBillRevisionRepository {
  FakeBillRevisionRepository({
    this.listResponses = const [],
    SettleoraBillRevision? detailResponse,
    SettleoraBillRevision? createResponse,
    this.createFailure,
  }) : detailResponse = detailResponse ?? createResponse ?? sampleRevision(),
       createResponse = createResponse ?? detailResponse ?? sampleRevision();

  final List<SettleoraBillRevision> listResponses;
  SettleoraBillRevision detailResponse;
  SettleoraBillRevision createResponse;
  final SettleoraBillRevisionFailure? createFailure;
  int listCalls = 0;
  int getCalls = 0;
  int createCalls = 0;
  String? lastCreatedBillId;
  SettleoraBillRevisionProposalSnapshot? lastProposal;

  @override
  Future<List<SettleoraBillRevision>> listBillRevisions(String billId) async {
    listCalls += 1;
    return listResponses;
  }

  @override
  Future<SettleoraBillRevision> createBillRevision(
    String billId,
    SettleoraBillRevisionProposalSnapshot proposal,
  ) async {
    createCalls += 1;
    lastCreatedBillId = billId;
    lastProposal = proposal;
    final failure = createFailure;
    if (failure != null) {
      throw failure;
    }
    detailResponse = createResponse;
    return createResponse;
  }

  @override
  Future<SettleoraBillRevision> getBillRevision(
    String billId,
    String revisionId,
  ) async {
    getCalls += 1;
    return detailResponse;
  }

  @override
  Future<SettleoraBillRevision> reviseBillRevision(
    String billId,
    String revisionId,
    SettleoraBillRevisionProposalSnapshot proposal,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> submitBillRevision(
    String billId,
    String revisionId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> withdrawBillRevision(
    String billId,
    String revisionId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> approveBillRevision(
    SettleoraBillRevision revision,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> rejectBillRevision(
    String billId,
    String revisionId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> confirmBillRevisionPayer(
    SettleoraBillRevision revision,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> applyBillRevision(
    String billId,
    String revisionId,
  ) {
    throw UnimplementedError();
  }
}

class MemorySyncQueueStore extends SettleoraSyncQueueStore {
  MemorySyncQueueStore({
    SettleoraSyncQueueState? initialState,
    this.maxItemCount = 100,
  }) : state = initialState ?? SettleoraSyncQueueState.empty();

  SettleoraSyncQueueState state;

  @override
  final int maxItemCount;

  @override
  Future<SettleoraSyncQueueState> read() async => state;

  @override
  Future<void> write(SettleoraSyncQueueState state) async {
    this.state = state;
  }
}

class FakeSyncRepository implements SettleoraSyncRepository {
  FakeSyncRepository(this._outcomes);

  final List<Object> _outcomes;
  int submitCalls = 0;

  @override
  Future<SettleoraSyncOperationResult> submitOperation(
    SettleoraSyncQueueItem item,
  ) async {
    submitCalls += 1;
    final outcome = _outcomes.removeAt(0);
    if (outcome is SettleoraSyncOperationResult) {
      return outcome;
    }

    throw outcome;
  }

  @override
  Future<SettleoraSyncChangeFeed> listChanges({
    int? sinceVersion,
    int? limit,
    SettleoraSyncResourceType? resourceType,
  }) {
    throw UnimplementedError();
  }
}

class FakeReceiptOcrReviewRepository implements ReceiptOcrReviewRepository {
  FakeReceiptOcrReviewRepository({
    this.getFailure,
    this.saveFailure,
    this.deleteFailure,
    this.previewApplyFailure,
    this.applyFailure,
    this.reviewDetail,
    this.applyPreview,
    this.applyResult,
    this.getReviewCompleter,
    this.saveReviewCompleter,
    this.deleteReviewCompleter,
    this.previewApplyCompleter,
    this.applyReviewCompleter,
  });

  Object? getFailure;
  Object? saveFailure;
  Object? deleteFailure;
  Object? previewApplyFailure;
  Object? applyFailure;
  ReceiptOcrReviewDetail? reviewDetail;
  ReceiptOcrReviewApplyPreview? applyPreview;
  ReceiptOcrReviewApplyResult? applyResult;
  Completer<ReceiptOcrReviewDetail>? getReviewCompleter;
  Completer<ReceiptOcrReviewDetail>? saveReviewCompleter;
  Completer<void>? deleteReviewCompleter;
  Completer<ReceiptOcrReviewApplyPreview>? previewApplyCompleter;
  Completer<ReceiptOcrReviewApplyResult>? applyReviewCompleter;
  int getCalls = 0;
  int saveCalls = 0;
  int deleteCalls = 0;
  int previewApplyCalls = 0;
  int applyReviewCalls = 0;
  ReceiptOcrReviewRoute? lastRoute;
  ReceiptOcrReviewRoute? lastSaveRoute;
  ReceiptOcrReviewRoute? lastDeleteRoute;
  ReceiptOcrReviewRoute? lastPreviewApplyRoute;
  ReceiptOcrReviewRoute? lastApplyReviewRoute;
  DateTime? lastExpectedReviewUpdatedAtUtc;
  ReceiptOcrReviewSaveRequest? lastSaveRequest;
  final List<ReceiptOcrReviewSaveRequest> saveRequests = [];

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
    final completer = getReviewCompleter;
    if (completer != null) {
      return completer.future;
    }
    final failure = getFailure;
    if (failure != null) {
      throw failure;
    }

    return reviewDetail ?? sampleReceiptOcrReviewDetail(route);
  }

  @override
  Future<ReceiptOcrReviewDetail> saveReview(
    ReceiptOcrReviewRoute route,
    ReceiptOcrReviewSaveRequest request,
  ) async {
    saveCalls += 1;
    lastSaveRoute = route;
    lastSaveRequest = request;
    saveRequests.add(request);
    final completer = saveReviewCompleter;
    if (completer != null) {
      return completer.future;
    }
    final failure = saveFailure;
    if (failure != null) {
      throw failure;
    }

    final updated = sampleReceiptOcrReviewDetailFromRequest(route, request);
    reviewDetail = updated;
    return updated;
  }

  @override
  Future<void> deleteReview(ReceiptOcrReviewRoute route) async {
    deleteCalls += 1;
    lastDeleteRoute = route;
    final completer = deleteReviewCompleter;
    if (completer != null) {
      return completer.future;
    }
    final failure = deleteFailure;
    if (failure != null) {
      throw failure;
    }
    reviewDetail = null;
  }

  @override
  Future<ReceiptOcrReviewApplyPreview> previewApply(
    ReceiptOcrReviewRoute route,
  ) async {
    previewApplyCalls += 1;
    lastPreviewApplyRoute = route;
    final completer = previewApplyCompleter;
    if (completer != null) {
      return completer.future;
    }
    final failure = previewApplyFailure;
    if (failure != null) {
      throw failure;
    }

    return applyPreview ?? sampleReceiptOcrApplyPreview(route);
  }

  @override
  Future<ReceiptOcrReviewApplyResult> applyReview(
    ReceiptOcrReviewRoute route, {
    required DateTime expectedReviewUpdatedAtUtc,
  }) async {
    applyReviewCalls += 1;
    lastApplyReviewRoute = route;
    lastExpectedReviewUpdatedAtUtc = expectedReviewUpdatedAtUtc;
    final completer = applyReviewCompleter;
    if (completer != null) {
      return completer.future;
    }
    final failure = applyFailure;
    if (failure != null) {
      throw failure;
    }

    return applyResult ?? sampleReceiptOcrApplyResult(route);
  }
}

class FakeRecurringBillRepository implements SettleoraRecurringBillRepository {
  @override
  Future<List<SettleoraRecurringBillTemplateSummary>> listTemplates({
    SettleoraRecurringBillTemplateStatus? status,
    String? groupId,
    String? fromDate,
    String? toDate,
    int maxItems = 100,
  }) async {
    return const [];
  }

  @override
  Future<List<SettleoraRecurringBillForecastOccurrence>> listForecast({
    String? fromDate,
    String? toDate,
    int limit = 30,
    String? groupId,
  }) async {
    return const [];
  }

  @override
  Future<SettleoraRecurringBillTemplateDetail> getTemplate(String templateId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraRecurringBillTemplateDetail> createTemplate(
    SettleoraRecurringBillCreateDraft draft,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraRecurringBillTemplateDetail> updateTemplate({
    required String templateId,
    required SettleoraRecurringBillUpdateDraft draft,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraRecurringBillTemplateDetail> pauseTemplate(
    String templateId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraRecurringBillTemplateDetail> resumeTemplate(
    String templateId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraRecurringBillTemplateDetail> archiveTemplate(
    String templateId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraRecurringBillDraftResult> generateDraft({
    required String templateId,
    required String occurrenceDate,
  }) {
    throw UnimplementedError();
  }
}

class FakeNotificationRepository implements SettleoraNotificationRepository {
  @override
  Future<List<SettleoraNotificationRow>> listNotifications({
    SettleoraNotificationStatus? status,
    int limit = 50,
    DateTime? before,
  }) async {
    return const [];
  }

  @override
  Future<SettleoraNotificationSummary> getNotificationSummary() async {
    return const SettleoraNotificationSummary(
      unreadCount: 0,
      attentionCount: 0,
      urgentCount: 0,
    );
  }

  @override
  Future<SettleoraNotificationRow> markNotificationRead(String notificationId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraNotificationSummary> markAllNotificationsRead() {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraNotificationRow> archiveNotification(String notificationId) {
    throw UnimplementedError();
  }
}

class FakeProfileRepository implements SettleoraProfileRepository {
  @override
  Future<SettleoraSelfProfile> getSelfProfile() {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSelfProfile> updateSelfProfile(
    SettleoraSelfProfileUpdate update,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSelfPaymentDetails> getSelfPaymentDetails() {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSelfPaymentDetails> updateSelfPaymentDetails(
    SettleoraSelfPaymentDetailsUpdate update,
  ) {
    throw UnimplementedError();
  }
}

class FakeGroupRepository implements SettleoraGroupRepository {
  FakeGroupRepository({this.members = const []});

  final List<SettleoraGroupMember> members;
  int listMemberCalls = 0;

  @override
  Future<List<SettleoraGroup>> listGroups() async {
    return const [];
  }

  @override
  Future<SettleoraGroup> createGroup(SettleoraGroupSaveRequest request) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraGroup> getGroup(String groupId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraGroup> updateGroup(
    String groupId,
    SettleoraGroupSaveRequest request,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<List<SettleoraGroupMember>> listGroupMembers(String groupId) async {
    listMemberCalls += 1;
    return members;
  }

  @override
  Future<SettleoraGroupMember> addGroupMember(
    String groupId,
    SettleoraGroupMemberAddRequest request,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraGroupMember> updateGroupMember(
    String groupId,
    String userProfileId,
    SettleoraGroupMemberRoleUpdate update,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<void> removeGroupMember(String groupId, String userProfileId) {
    throw UnimplementedError();
  }
}

class FakeMonthlyReportRepository implements SettleoraMonthlyReportRepository {
  @override
  Future<SettleoraMonthlyReport> getMonthlyReport({
    required String month,
    String? groupId,
  }) async {
    return SettleoraMonthlyReport(
      month: month,
      groupId: groupId,
      generatedAtUtc: DateTime.utc(2026, 5, 18, 9),
      billCount: 0,
      totalByCurrency: const [],
      actorShareByCurrency: const [],
      actorPaidByCurrency: const [],
      reconciliationCounts: const [],
      settlementRequestCounts: const [],
      settlementPaymentCounts: const [],
    );
  }
}

class FakeAuthRepository implements SettleoraAuthRepository {
  @override
  Future<SettleoraServerSessionMaterial> signIn(
    SettleoraSignInSubmission submission,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraCurrentUser> currentUser({
    required String accessToken,
  }) async {
    return sampleCurrentUser();
  }

  @override
  Future<SettleoraServerSessionMaterial> refreshSession({
    required String refreshCredential,
    String? deviceLabel,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<void> signOutCurrentSession({required String accessToken}) async {}

  @override
  Future<void> signOutAllCurrentAccountSessions({
    required String accessToken,
  }) async {}

  @override
  Future<List<SettleoraSessionSummary>> listSessions({
    required String accessToken,
  }) async {
    return const [];
  }

  @override
  Future<void> revokeSession({
    required String sessionId,
    required String accessToken,
  }) async {}
}

class FakeAccessTokenProvider implements SettleoraAccessTokenProvider {
  const FakeAccessTokenProvider(this._accessToken);

  final String? _accessToken;

  @override
  Future<String?> accessToken() async => _accessToken;
}

SettleoraBillSummary sampleBillSummary({
  String id = _billId,
  String? merchantName = 'Corner Market',
  String billDate = '2026-05-17',
  String status = 'draft',
  String reconciliationStatus = 'unreconciled',
  String totalAmount = '10.80',
  String totalCurrency = 'USD',
  String archiveState = SettleoraBillArchiveStateValues.active,
}) {
  return SettleoraBillSummary(
    id: id,
    merchantName: merchantName,
    billDate: billDate,
    status: status,
    reconciliationStatus: reconciliationStatus,
    totalAmount: totalAmount,
    totalCurrency: totalCurrency,
    archiveState: archiveState,
    itemCount: 1,
    participantCount: 1,
    payerCount: 1,
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _createdAtUtc,
  );
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
  String filename = 'support.pdf',
  String contentType = 'application/pdf',
  List<int> bytes = const [1, 2, 3],
  String? localPath,
}) {
  return pickedBillAttachmentFileFromBytes(
    filename: filename,
    contentType: contentType,
    bytes: bytes,
    localPath: localPath,
    allowedContentTypes:
        SettleoraBillAttachmentContentTypeValues.supportingAttachmentValues,
  );
}

List<int> samplePngBytes({required int width, required int height}) {
  final image = img.Image(width: width, height: height);
  for (final pixel in image) {
    pixel
      ..r = pixel.x % 255
      ..g = pixel.y % 255
      ..b = 96;
  }
  return img.encodePng(image);
}

ReceiptOcrReviewDetail sampleReceiptOcrReviewDetail(
  ReceiptOcrReviewRoute route, {
  String merchantText = 'Corner Market',
  String lineText = 'Milk',
  String currency = 'USD',
  DateTime? updatedAtUtc,
}) {
  return ReceiptOcrReviewDetail(
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    billId: route.billId,
    fileId: route.fileId,
    groupId: route.groupId,
    status: ReceiptOcrReviewStatusValues.provisional,
    source: ReceiptOcrReviewSourceValues.onDevice,
    merchantText: merchantText,
    receiptIssuedAtUtc: _createdAtUtc,
    currency: currency,
    subtotalAmount: '10.00',
    taxAmount: '0.80',
    serviceChargeAmount: null,
    discountAmount: null,
    grandTotalAmount: '10.80',
    lines: [
      ReceiptOcrReviewLine(
        id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        sortOrder: 0,
        text: lineText,
        quantity: '1',
        unitPriceAmount: '10.00',
        lineTotalAmount: '10.00',
        createdAtUtc: _createdAtUtc,
        updatedAtUtc: _createdAtUtc,
      ),
    ],
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: updatedAtUtc ?? _updatedAtUtc,
  );
}

ReceiptOcrReviewDetail sampleReceiptOcrReviewDetailFromRequest(
  ReceiptOcrReviewRoute route,
  ReceiptOcrReviewSaveRequest request,
) {
  return ReceiptOcrReviewDetail(
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    billId: route.billId,
    fileId: route.fileId,
    groupId: route.groupId,
    status: request.status,
    source: request.source,
    merchantText: request.merchantText,
    receiptIssuedAtUtc: request.receiptIssuedAtUtc,
    currency: request.currency,
    subtotalAmount: request.subtotalAmount,
    taxAmount: request.taxAmount,
    serviceChargeAmount: request.serviceChargeAmount,
    discountAmount: request.discountAmount,
    grandTotalAmount: request.grandTotalAmount,
    lines: [
      for (var index = 0; index < request.lines.length; index += 1)
        ReceiptOcrReviewLine(
          id: 'saved-line-$index',
          sortOrder: index,
          text: request.lines[index].text,
          quantity: request.lines[index].quantity,
          unitPriceAmount: request.lines[index].unitPriceAmount,
          lineTotalAmount: request.lines[index].lineTotalAmount,
          createdAtUtc: _createdAtUtc,
          updatedAtUtc: _updatedAtUtc,
        ),
    ],
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

ReceiptOcrReviewApplyPreview sampleReceiptOcrApplyPreview(
  ReceiptOcrReviewRoute route, {
  bool canApply = true,
  List<ReceiptOcrReviewApplyPreviewIssueCode> blockedReasons = const [],
  List<ReceiptOcrReviewApplyPreviewIssueCode> warnings = const [],
}) {
  return ReceiptOcrReviewApplyPreview(
    reviewId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    billId: route.billId,
    groupId: route.groupId,
    fileId: route.fileId,
    status: ReceiptOcrReviewStatusValues.provisional,
    source: ReceiptOcrReviewSourceValues.onDevice,
    proposedMerchantText: 'Preview Market',
    proposedReceiptIssuedAtUtc: _createdAtUtc,
    proposedCurrency: 'USD',
    proposedSubtotalAmount: '10.00',
    proposedTaxAmount: '0.80',
    proposedServiceChargeAmount: null,
    proposedDiscountAmount: null,
    proposedGrandTotalAmount: '10.80',
    proposedLines: const [
      ReceiptOcrReviewPreviewLine(
        reviewLineId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        sortOrder: 0,
        text: 'Preview Milk',
        quantity: '1',
        unitPriceAmount: '10.00',
        lineTotalAmount: '10.00',
        proposedLineTotalAmount: '10.00',
      ),
    ],
    summary: const ReceiptOcrReviewPreviewSummary(
      lineCount: 1,
      linesWithProposedTotalCount: 1,
      linesMissingProposedTotalCount: 0,
      proposedLineTotalSumAmount: '10.00',
      expectedHeaderTotalAmount: '10.80',
    ),
    canApply: canApply,
    blockedReasons: blockedReasons,
    warnings: warnings,
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

ReceiptOcrReviewApplyResult sampleReceiptOcrApplyResult(
  ReceiptOcrReviewRoute route,
) {
  return ReceiptOcrReviewApplyResult(
    reviewId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    billId: route.billId,
    groupId: route.groupId,
    fileId: route.fileId,
    applyMode: 'replace_draft_ocr_items',
    appliedItemCount: 1,
    currency: 'USD',
    subtotalAmount: '10.00',
    grandTotalAmount: '10.80',
    summary: const ReceiptOcrReviewPreviewSummary(
      lineCount: 1,
      linesWithProposedTotalCount: 1,
      linesMissingProposedTotalCount: 0,
      proposedLineTotalSumAmount: '10.00',
      expectedHeaderTotalAmount: '10.80',
    ),
    blockedReasons: const [],
    warnings: const [],
    appliedAtUtc: _updatedAtUtc,
  );
}

SettleoraBillDetail sampleBillDetail({
  String id = _billId,
  String? merchantName = 'Corner Market',
  String billDate = '2026-05-17',
  String status = 'draft',
  String reconciliationStatus = 'unreconciled',
  String? reconciliationNote,
  String totalAmount = '10.80',
  String totalCurrency = 'USD',
  bool canCreateRevision = false,
  List<SettleoraBillItem> items = const [
    SettleoraBillItem(
      id: 'item-1',
      name: 'Milk',
      note: null,
      amount: '10.00',
      currency: 'USD',
      sortOrder: 0,
    ),
  ],
  List<SettleoraBillParticipant> participants = const [
    SettleoraBillParticipant(
      userProfileId: _userProfileId,
      status: 'pending_acceptance',
      resolvedShareAmount: '10.80',
      resolvedShareCurrency: 'USD',
    ),
  ],
  List<SettleoraBillPayer> payers = const [
    SettleoraBillPayer(
      userProfileId: _userProfileId,
      amount: '10.80',
      currency: 'USD',
    ),
  ],
  List<SettleoraBillAdjustment> adjustments = const [
    SettleoraBillAdjustment(
      id: 'adjustment-1',
      type: 'tax',
      direction: 'charge',
      amount: '0.80',
      currency: 'USD',
      reasonNote: null,
      sortOrder: 0,
    ),
  ],
}) {
  return SettleoraBillDetail(
    id: id,
    merchantName: merchantName,
    billDate: billDate,
    status: status,
    reconciliationStatus: reconciliationStatus,
    reconciliationNote: reconciliationNote,
    revisionCreationActions: SettleoraBillRevisionCreationActions(
      canCreateRevision: canCreateRevision,
    ),
    totalAmount: totalAmount,
    totalCurrency: totalCurrency,
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _createdAtUtc,
    items: items,
    participants: participants,
    payers: payers,
    adjustments: adjustments,
  );
}

SettleoraSyncQueueItem sampleArchiveQueueItem() {
  return SettleoraSyncQueueItem.billArchive(
    resourceId: _billId,
    now: _createdAtUtc,
    idGenerator: () => 'queue-1',
  );
}

SettleoraSyncOperationResult sampleOperationResult() {
  return const SettleoraSyncOperationResult(
    operationId: 'server-operation-1',
    status: SettleoraSyncOperationResultStatusValues.accepted,
    resourceType: SettleoraSyncResourceTypeValues.expenseBill,
    resourceId: _billId,
    resultingVersion: 12,
    safeErrorCode: null,
    safeMessage: null,
  );
}

SettleoraCurrentUser sampleCurrentUser() {
  return SettleoraCurrentUser(
    userProfileId: _userProfileId,
    displayName: 'Taylor',
    defaultCurrency: 'USD',
    roles: const ['user'],
    sessionExpiresAtUtc: DateTime.utc(2026, 5, 18),
  );
}

SettleoraBillRevision sampleRevision({String id = _revisionId}) {
  return SettleoraBillRevision(
    id: id,
    billId: _billId,
    groupId: null,
    status: SettleoraBillRevisionStatusValues.draftRevision,
    totalAmount: '10.80',
    totalCurrency: 'USD',
    calculationHash: _hash,
    submittedAtUtc: null,
    updatedAtUtc: _attemptedAtUtc,
    participants: const [
      SettleoraBillRevisionParticipant(
        userProfileId: _userProfileId,
        resolvedShareAmount: '10.80',
        resolvedShareCurrency: 'USD',
        affectedByRevision: true,
      ),
    ],
    payers: const [
      SettleoraBillRevisionPayer(
        userProfileId: _userProfileId,
        amount: '10.80',
        currency: 'USD',
        requiresPayerConfirmation: false,
        payerConfirmationStatus:
            SettleoraBillRevisionPayerConfirmationStatusValues.confirmed,
      ),
    ],
    approvals: const [],
    viewerActions: const SettleoraBillRevisionViewerActions(
      canSubmit: true,
      canWithdraw: false,
      canRevise: false,
      canApprove: false,
      canReject: false,
      canConfirmPayer: false,
      canApply: false,
    ),
    reviewContext: sampleReviewContext(),
    viewerApprovalBasis: null,
  );
}

SettleoraBillRevisionReviewContext sampleReviewContext() {
  return SettleoraBillRevisionReviewContext(
    viewerUserProfileId: _userProfileId,
    baseline: SettleoraBillRevisionReviewBaseline(
      baselineType:
          SettleoraBillRevisionReviewBaselineTypeValues.activeAcceptedBill,
      baselineBillRevisionId: '11111111-1111-1111-1111-111111111111',
      baselineRevisionStatus: SettleoraBillRevisionStatusValues.acceptedApplied,
      baselineReviewedAtUtc: null,
      derivationReason: 'Server selected the active accepted bill baseline.',
    ),
    defaultViewMode: SettleoraBillRevisionReviewViewModeValues.fullBill,
    fullViewRecommendedReason:
        SettleoraBillRevisionReviewRecommendationReasonValues
            .baselineAvailableFullViewOptional,
    viewerFinancialImpact: const SettleoraBillRevisionViewerFinancialImpact(
      previousShare: SettleoraBillRevisionMoneyValue(
        amount: '10.80',
        currency: 'USD',
      ),
      proposedShare: SettleoraBillRevisionMoneyValue(
        amount: '10.80',
        currency: 'USD',
      ),
      deltaShare: SettleoraBillRevisionMoneyValue(
        amount: '0.00',
        currency: 'USD',
      ),
      affectedByRevision: true,
      isPayer: false,
      payerImpact: null,
    ),
    changeSummary: const [],
    changes: const [],
    limitations: const [],
  );
}

class FakeSettlementRepository implements SettleoraSettlementRepository {
  int listBalancesCalls = 0;
  int listRequestsCalls = 0;

  @override
  Future<SettleoraSettlementRequest> cancelSettlementRequest(
    String settlementId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementPayment> cancelSettlementPayment(String paymentId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementPayment> confirmSettlementPayment(
    String paymentId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementPayment> confirmSettlementPaymentResidual({
    required String paymentId,
    required String residualId,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementRequest> disputeSettlementRequest(
    String settlementId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementPayment> disputeSettlementPayment(
    String paymentId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementCounterpartyPaymentDetails>
  getCounterpartyPaymentDetails({
    required String settlementId,
    required String userProfileId,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementRequest> getSettlementRequest(String settlementId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementBalanceSnapshot> listBalances() {
    listBalancesCalls += 1;
    return Future.value(
      SettleoraSettlementBalanceSnapshot(
        generatedAtUtc: DateTime.utc(2026, 5, 18),
        balances: const [],
      ),
    );
  }

  @override
  Future<List<SettleoraSettlementPayment>> listSettlementPayments(
    String settlementId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraSettlementPayment> markSettlementPaymentPaid({
    required String settlementId,
    required String amount,
    required String currency,
    required String paymentDate,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<List<SettleoraSettlementRequest>> listSettlementRequests() {
    listRequestsCalls += 1;
    return Future.value(const []);
  }
}

String visibleText(WidgetTester tester) {
  return tester
      .widgetList<Text>(find.byType(Text))
      .map((widget) => widget.data)
      .whereType<String>()
      .join('\n');
}

Future<void> _selectCurrency(
  WidgetTester tester,
  Finder selector,
  String code,
) async {
  await tester.ensureVisible(selector);
  await tester.tap(selector);
  await tester.pumpAndSettle();
  final option = find.textContaining('$code -').last;
  await tester.ensureVisible(option);
  await tester.tap(option);
  await tester.pumpAndSettle();
}

SettleoraGroupMember sampleGroupMember({
  String userProfileId = _userProfileId,
  String displayName = 'Taylor',
  SettleoraGroupRole role = SettleoraGroupRoleValues.member,
  SettleoraGroupMembershipStatus status =
      SettleoraGroupMembershipStatusValues.active,
}) {
  return SettleoraGroupMember(
    userProfileId: userProfileId,
    displayName: displayName,
    role: role,
    status: status,
    joinedAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

const _billId = '22222222-2222-2222-2222-222222222222';
const _revisionId = '33333333-3333-3333-3333-333333333333';
const _createdRevisionId = '44444444-4444-4444-4444-444444444444';
const _createdBillId = '66666666-6666-6666-6666-666666666666';
const _groupId = '99999999-9999-9999-9999-999999999999';
const _fileId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const _uploadedFileId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const _userProfileId = '55555555-5555-5555-5555-555555555555';
const _hash =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
final _createdAtUtc = DateTime.utc(2026, 5, 17, 10);
final _attemptedAtUtc = DateTime.utc(2026, 5, 17, 11);
final _uploadedAtUtc = DateTime.utc(2026, 5, 23, 9);
final _updatedAtUtc = DateTime.utc(2026, 5, 23, 10);
