import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/bills/bill_repository.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_repository.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../bill_list_screen_test.dart' as bills;
import '../helpers/settleora_visual_test_fonts.dart';

const _visualOutputDir =
    '/workspace/logs/settleora-visual-qa/20260703-1830-mobile-bills-list-detail-create-visual-parity-dev-only';

const _billId = '11111111-1111-1111-1111-111111111111';
const _fileId = '22222222-2222-2222-2222-222222222222';
const _userProfileId = '33333333-3333-3333-3333-333333333333';

void main() {
  testWidgets(
    'captures mobile bills list detail create visual parity evidence',
    (tester) async {
      await tester.runAsync(() async {
        await loadSettleoraVisualTestFonts();
        await Directory(_visualOutputDir).create(recursive: true);
      });
      await setSettleoraMobileViewport(tester);

      final detail = _visualBillDetail();
      final summary = SettleoraBillSummary(
        id: detail.id,
        merchantName: detail.displayName,
        billDate: detail.billDate,
        status: detail.status,
        reconciliationStatus: detail.reconciliationStatus,
        totalAmount: detail.totalAmount,
        totalCurrency: detail.totalCurrency,
        archiveState: SettleoraBillArchiveStateValues.active,
        itemCount: detail.items.length,
        participantCount: detail.participants.length,
        payerCount: detail.payers.length,
        participants: detail.participants,
        createdAtUtc: DateTime.utc(2026, 7, 3),
        updatedAtUtc: DateTime.utc(2026, 7, 3, 1),
      );

      const listKey = Key('bills-list-dashboard-capture');
      await tester.pumpWidget(
        RepaintBoundary(
          key: listKey,
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: SettleoraTheme.midnight(),
            home: SettleoraBillListScreen(
              repository: bills.FakeBillRepository(
                bills: [summary],
                detail: detail,
              ),
              syncController: bills.sampleBillSyncController(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Bills dashboard'), findsOneWidget);
      await _captureBoundary(
        tester,
        listKey,
        'bills-list-or-dashboard-390x844.png',
      );

      const detailKey = Key('bill-detail-first-viewport-capture');
      await tester.pumpWidget(
        RepaintBoundary(
          key: detailKey,
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: SettleoraTheme.midnight(),
            home: SettleoraBillDetailScreen(
              repository: bills.FakeBillRepository(detail: detail),
              billId: detail.id,
              initialBill: detail,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.text('Review the draft before sharing or updating it.'),
        findsOneWidget,
      );
      await _captureBoundary(tester, detailKey, 'bill-detail-390x844.png');

      const createKey = Key('bill-create-first-viewport-capture');
      await tester.pumpWidget(
        RepaintBoundary(
          key: createKey,
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: SettleoraTheme.midnight(),
            home: SettleoraPersonalBillCreateScreen(
              repository: bills.FakeBillRepository(),
              defaultCurrency: 'HKD',
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('personal-bill-merchant-name')),
        'Harbour Market',
      );
      await tester.pumpAndSettle();
      expect(find.text('Create personal bill'), findsOneWidget);
      await _captureBoundary(
        tester,
        createKey,
        'bill-create-or-edit-390x844.png',
      );

      final route = ReceiptOcrReviewRoute(billId: _billId, fileId: _fileId);
      const savedOcrKey = Key('bill-saved-ocr-readout-capture');
      await tester.pumpWidget(
        RepaintBoundary(
          key: savedOcrKey,
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: SettleoraTheme.midnight(),
            home: SettleoraBillDetailScreen(
              repository: bills.FakeBillRepository(detail: detail),
              billId: detail.id,
              initialBill: detail,
              attachmentRepository: bills.FakeBillAttachmentRepository(
                attachments: [bills.sampleAttachment(fileId: _fileId)],
              ),
              receiptOcrReviewRepository: bills.FakeReceiptOcrReviewRepository(
                reviewDetail: bills.sampleReceiptOcrReviewDetail(
                  route,
                  merchantText: 'Harbour Market',
                  lineText: 'Oat milk',
                  currency: 'HKD',
                ),
                applyPreview: bills.sampleReceiptOcrApplyPreview(route),
              ),
              initialReceiptOcrReviewHandoff: ReceiptOcrReviewHandoff.saved(
                reviewRoute: route,
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
      await tester.pumpAndSettle();
      expect(find.text('Receipt review'), findsOneWidget);
      await _captureBoundary(
        tester,
        savedOcrKey,
        'bill-saved-ocr-readout-390x844.png',
      );
    },
  );
}

SettleoraBillDetail _visualBillDetail() {
  return bills.sampleBillDetail(
    id: _billId,
    merchantName: 'Harbour Market',
    billDate: '2026-07-03',
    status: 'draft',
    totalAmount: '148.50',
    totalCurrency: 'HKD',
    items: const [
      SettleoraBillItem(
        id: 'item-noodles',
        name: 'Noodle bowl',
        note: 'Lunch table item',
        amount: '68.00',
        currency: 'HKD',
        sortOrder: 0,
      ),
      SettleoraBillItem(
        id: 'item-tea',
        name: 'Tea set',
        note: null,
        amount: '80.50',
        currency: 'HKD',
        sortOrder: 1,
      ),
    ],
    participants: const [
      SettleoraBillParticipant(
        userProfileId: _userProfileId,
        status: SettleoraBillParticipantStatusValues.pendingAcceptance,
        resolvedShareAmount: '74.25',
        resolvedShareCurrency: 'HKD',
      ),
      SettleoraBillParticipant(
        userProfileId: '44444444-4444-4444-4444-444444444444',
        status: SettleoraBillParticipantStatusValues.accepted,
        resolvedShareAmount: '74.25',
        resolvedShareCurrency: 'HKD',
      ),
    ],
    payers: const [
      SettleoraBillPayer(
        userProfileId: _userProfileId,
        amount: '148.50',
        currency: 'HKD',
      ),
    ],
  );
}

Future<void> _captureBoundary(
  WidgetTester tester,
  Key key,
  String fileName,
) async {
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.byKey(key),
    );
    final image = await boundary.toImage(pixelRatio: 1);
    final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
    await File(
      '$_visualOutputDir/$fileName',
    ).writeAsBytes(byteData!.buffer.asUint8List());
  });
}
