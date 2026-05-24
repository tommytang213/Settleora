import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
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
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_repository.dart';
import 'package:mobile/recurring_bills/recurring_bill_repository.dart';
import 'package:mobile/reports/report_repository.dart';
import 'package:mobile/settlements/settlement_repository.dart';
import 'package:mobile/sync/sync_queue.dart';
import 'package:mobile/sync/sync_queue_processor.dart';
import 'package:mobile/sync/sync_repository.dart';

void main() {
  testWidgets('bill list queues archive and flushes through sync', (
    tester,
  ) async {
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

    expect(find.text('Corner Market'), findsOneWidget);
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
    expect(find.text('Create bill'), findsOneWidget);
    expect(find.byKey(const Key('group-bill-list-create')), findsNothing);
    expect(find.text('Create group bill'), findsNothing);
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
    await tester.enterText(find.byKey(const Key('personal-bill-currency')), '');
    await tester.enterText(
      find.byKey(const Key('personal-bill-item-currency-0')),
      '',
    );
    await _tapSaveBill(tester);

    expect(find.text('Enter a bill date.'), findsOneWidget);
    expect(find.text('Enter a currency.'), findsOneWidget);
    expect(find.text('Enter an item name.'), findsOneWidget);
    expect(find.text('Enter an item amount.'), findsOneWidget);
    expect(find.text('Enter an item currency.'), findsOneWidget);
    expect(repository.createCalls, 0);

    await tester.tap(find.byKey(const Key('personal-bill-item-remove-0')));
    await tester.pumpAndSettle();
    await _tapSaveBill(tester);

    expect(find.text('Add at least one item before saving.'), findsOneWidget);
    expect(repository.createCalls, 0);
  });

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
    await tester.enterText(
      find.byKey(const Key('personal-bill-date')),
      '  2026-05-23  ',
    );
    await tester.enterText(
      find.byKey(const Key('personal-bill-currency')),
      ' usd ',
    );
    await tester.enterText(
      find.byKey(const Key('personal-bill-item-name-0')),
      '  Eggs  ',
    );
    await tester.enterText(
      find.byKey(const Key('personal-bill-item-amount-0')),
      ' 12.30 ',
    );
    await tester.enterText(
      find.byKey(const Key('personal-bill-item-currency-0')),
      ' usd ',
    );
    await tester.enterText(
      find.byKey(const Key('personal-bill-item-note-0')),
      '  table 4  ',
    );

    await _tapSaveBill(tester);

    final draft = repository.lastCreateDraft;
    expect(repository.createCalls, 1);
    expect(draft?.merchantName, '  Brunch Spot  ');
    expect(draft?.billDate, '  2026-05-23  ');
    expect(draft?.currency, ' usd ');
    expect(draft?.items.single.name, '  Eggs  ');
    expect(draft?.items.single.amount, ' 12.30 ');
    expect(draft?.items.single.currency, ' usd ');
    expect(draft?.items.single.note, '  table 4  ');
  });

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

    await tester.pageBack();
    await tester.pumpAndSettle();

    expect(find.text('Existing Market'), findsOneWidget);
    expect(repository.listCalls, 1);
  });

  testWidgets('group bill list and detail do not show personal create entry', (
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

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('bill-list-create')), findsNothing);
    expect(find.text('Create bill'), findsNothing);
    expect(find.byKey(const Key('group-bill-list-create')), findsNothing);
  });

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
    expect(find.text('Items'), findsOneWidget);
    expect(find.text('Milk'), findsOneWidget);
    expect(find.text('Participants'), findsOneWidget);
    expect(find.byKey(const Key('bill-detail-propose-change')), findsNothing);
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
    expect(find.text('No attachments'), findsOneWidget);
  });

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
  });

  testWidgets('personal bill attachment upload can choose receipt', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final attachmentRepository = FakeBillAttachmentRepository();
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
    expect(attachmentRepository.listCalls, 2);
    expect(find.text('Receipt uploaded.'), findsOneWidget);
    expect(find.text('Receipt'), findsOneWidget);
    expect(visibleText(tester), isNot(contains('C:\\Users\\secret')));
  });

  testWidgets('personal bill attachment upload can choose supporting', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final attachmentRepository = FakeBillAttachmentRepository();
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
    expect(attachmentRepository.listCalls, 2);
    expect(find.text('Attachment uploaded.'), findsOneWidget);
    expect(find.text('Supporting attachment'), findsOneWidget);
    expect(find.text('application/pdf'), findsOneWidget);
    expect(find.text('3 bytes'), findsOneWidget);
    expect(visibleText(tester), isNot(contains('C:\\Users\\secret')));
  });

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
          .widget<TextField>(find.byKey(const Key('proposal-total-amount')))
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

    await tester.tap(find.byKey(const Key('server-shell-bills')));
    await tester.pumpAndSettle();

    expect(find.text('Bills'), findsWidgets);
    expect(find.text('Corner Market'), findsOneWidget);
    expect(billRepository.listCalls, 1);

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();

    expect(attachmentRepository.listCalls, 1);
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

    await tester.tap(find.byKey(const Key('server-shell-settlements')));
    await tester.pumpAndSettle();

    expect(find.text('Settlements'), findsOneWidget);
    expect(find.text('No balances'), findsOneWidget);
    expect(settlementRepository.listBalancesCalls, 1);
    expect(settlementRepository.listRequestsCalls, 1);
  });
}

Future<void> useLargeSurface(WidgetTester tester) async {
  await tester.binding.setSurfaceSize(const Size(900, 1600));
  addTearDown(() => tester.binding.setSurfaceSize(null));
}

Future<void> _fillMinimalCreateForm(WidgetTester tester) async {
  await tester.enterText(
    find.byKey(const Key('personal-bill-date')),
    '2026-05-23',
  );
  await tester.enterText(
    find.byKey(const Key('personal-bill-currency')),
    'USD',
  );
  await tester.enterText(
    find.byKey(const Key('personal-bill-item-name-0')),
    'Coffee',
  );
  await tester.enterText(
    find.byKey(const Key('personal-bill-item-amount-0')),
    '7.50',
  );
  await tester.enterText(
    find.byKey(const Key('personal-bill-item-currency-0')),
    'USD',
  );
}

Future<void> _tapSaveBill(WidgetTester tester) async {
  final saveButton = find.byKey(const Key('personal-bill-save'));
  await tester.tap(saveButton);
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
  }) : details = details ?? [detail ?? sampleBillDetail()],
       createdDetail = createdDetail ?? sampleBillDetail();

  final List<SettleoraBillSummary> bills;
  final List<SettleoraBillSummary> groupBills;
  final List<SettleoraBillDetail> details;
  final SettleoraBillDetail createdDetail;
  final SettleoraBillFailure? failure;
  final SettleoraBillFailure? createFailure;
  int listCalls = 0;
  int createCalls = 0;
  int getCalls = 0;
  int listGroupCalls = 0;
  int getGroupCalls = 0;
  SettleoraPersonalBillCreateDraft? lastCreateDraft;

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
    return _detailForCall(getCalls - 1);
  }
}

class FakeBillAttachmentRepository
    implements SettleoraBillAttachmentRepository {
  FakeBillAttachmentRepository({
    this.attachments = const [],
    this.listFailures = const [],
    this.downloadedBytes = const [7, 8, 9],
    this.attachFailure,
  });

  List<SettleoraBillAttachment> attachments;
  final List<SettleoraBillAttachmentFailure> listFailures;
  final List<int> downloadedBytes;
  final SettleoraBillAttachmentFailure? attachFailure;
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
    return SettleoraBillAttachmentContent(bytes: downloadedBytes);
  }
}

class FakeBillAttachmentFileInput implements SettleoraBillAttachmentFileInput {
  FakeBillAttachmentFileInput({this.pickedFile, this.failure});

  final SettleoraPickedBillAttachmentFile? pickedFile;
  final SettleoraBillAttachmentFileInputFailure? failure;
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

    return pickedFile;
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
  Future<List<SettleoraGroupMember>> listGroupMembers(String groupId) {
    throw UnimplementedError();
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
  String totalAmount = '10.80',
  String totalCurrency = 'USD',
  String archiveState = SettleoraBillArchiveStateValues.active,
}) {
  return SettleoraBillSummary(
    id: id,
    merchantName: merchantName,
    billDate: billDate,
    status: 'draft',
    reconciliationStatus: 'unreconciled',
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
}) {
  return SettleoraBillAttachment(
    fileId: fileId,
    billId: _billId,
    purpose: purpose,
    contentType: contentType,
    sizeBytes: 321,
    uploadedAtUtc: _uploadedAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

SettleoraPickedBillAttachmentFile samplePickedAttachmentFile({
  String filename = 'support.pdf',
  String contentType = 'application/pdf',
  List<int> bytes = const [1, 2, 3],
}) {
  return pickedBillAttachmentFileFromBytes(
    filename: filename,
    contentType: contentType,
    bytes: bytes,
    allowedContentTypes:
        SettleoraBillAttachmentContentTypeValues.supportingAttachmentValues,
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
    receiptIssuedAtUtc: _createdAtUtc,
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
        createdAtUtc: _createdAtUtc,
        updatedAtUtc: _createdAtUtc,
      ),
    ],
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

SettleoraBillDetail sampleBillDetail({
  String id = _billId,
  String? merchantName = 'Corner Market',
  String billDate = '2026-05-17',
  String totalAmount = '10.80',
  String totalCurrency = 'USD',
  bool canCreateRevision = false,
}) {
  return SettleoraBillDetail(
    id: id,
    merchantName: merchantName,
    billDate: billDate,
    status: 'draft',
    reconciliationStatus: 'unreconciled',
    reconciliationNote: null,
    revisionCreationActions: SettleoraBillRevisionCreationActions(
      canCreateRevision: canCreateRevision,
    ),
    totalAmount: totalAmount,
    totalCurrency: totalCurrency,
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _createdAtUtc,
    items: const [
      SettleoraBillItem(
        id: 'item-1',
        name: 'Milk',
        note: null,
        amount: '10.00',
        currency: 'USD',
        sortOrder: 0,
      ),
    ],
    participants: const [
      SettleoraBillParticipant(
        userProfileId: _userProfileId,
        status: 'pending_acceptance',
        resolvedShareAmount: '10.80',
        resolvedShareCurrency: 'USD',
      ),
    ],
    payers: const [
      SettleoraBillPayer(
        userProfileId: _userProfileId,
        amount: '10.80',
        currency: 'USD',
      ),
    ],
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
    ],
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
