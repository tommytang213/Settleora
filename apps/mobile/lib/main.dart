import 'package:flutter/material.dart';

import 'app/app_bootstrap.dart';
import 'app/secure_storage.dart';
import 'dashboard/dashboard_preview_screen.dart';
import 'receipt_ocr_capture/receipt_image_intake.dart';
import 'receipt_ocr_capture/receipt_ocr_provider.dart';
import 'ui/settleora_theme.dart';

void main() {
  runApp(SettleoraMobileApp());
}

class SettleoraMobileApp extends StatelessWidget {
  SettleoraMobileApp({
    super.key,
    SettleoraSecureStorageBoundary? secureStorage,
    this.receiptOcrReviewRepositoryFactory,
    this.authRepositoryFactory,
    this.passwordResetRepositoryFactory,
    this.billRepositoryFactory,
    this.billAttachmentRepositoryFactory,
    this.billRevisionRepositoryFactory,
    this.settlementRepositoryFactory,
    this.recurringBillRepositoryFactory,
    this.groupRepositoryFactory,
    this.notificationRepositoryFactory,
    this.reportRepositoryFactory,
    this.profileRepositoryFactory,
    this.billSyncControllerFactory,
    this.receiptImageIntake,
    this.receiptOcrProvider,
    this.now,
    this.showDashboardPreview = const bool.fromEnvironment(
      'SETTLEORA_DASHBOARD_PREVIEW',
    ),
  }) : secureStorage = secureStorage ?? SettleoraSecureStorage();

  final SettleoraSecureStorageBoundary secureStorage;
  final ReceiptOcrReviewRepositoryFactory? receiptOcrReviewRepositoryFactory;
  final SettleoraAuthRepositoryFactory? authRepositoryFactory;
  final SettleoraPasswordResetRepositoryFactory? passwordResetRepositoryFactory;
  final SettleoraBillRepositoryFactory? billRepositoryFactory;
  final SettleoraBillAttachmentRepositoryFactory?
  billAttachmentRepositoryFactory;
  final SettleoraBillRevisionRepositoryFactory? billRevisionRepositoryFactory;
  final SettleoraSettlementRepositoryFactory? settlementRepositoryFactory;
  final SettleoraRecurringBillRepositoryFactory? recurringBillRepositoryFactory;
  final SettleoraGroupRepositoryFactory? groupRepositoryFactory;
  final SettleoraNotificationRepositoryFactory? notificationRepositoryFactory;
  final SettleoraMonthlyReportRepositoryFactory? reportRepositoryFactory;
  final SettleoraProfileRepositoryFactory? profileRepositoryFactory;
  final SettleoraBillSyncControllerFactory? billSyncControllerFactory;
  final ReceiptImageIntake? receiptImageIntake;
  final ReceiptOcrProvider? receiptOcrProvider;
  final DateTime Function()? now;
  final bool showDashboardPreview;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Settleora',
      theme: SettleoraTheme.midnight(),
      home: showDashboardPreview
          ? const DashboardPreviewScreen()
          : SettleoraAppBootstrap(
              secureStorage: secureStorage,
              receiptOcrReviewRepositoryFactory:
                  receiptOcrReviewRepositoryFactory,
              authRepositoryFactory: authRepositoryFactory,
              passwordResetRepositoryFactory: passwordResetRepositoryFactory,
              billRepositoryFactory: billRepositoryFactory,
              billAttachmentRepositoryFactory: billAttachmentRepositoryFactory,
              billRevisionRepositoryFactory: billRevisionRepositoryFactory,
              settlementRepositoryFactory: settlementRepositoryFactory,
              recurringBillRepositoryFactory: recurringBillRepositoryFactory,
              groupRepositoryFactory: groupRepositoryFactory,
              notificationRepositoryFactory: notificationRepositoryFactory,
              reportRepositoryFactory: reportRepositoryFactory,
              profileRepositoryFactory: profileRepositoryFactory,
              billSyncControllerFactory: billSyncControllerFactory,
              receiptImageIntake: receiptImageIntake,
              receiptOcrProvider: receiptOcrProvider,
              now: now,
            ),
    );
  }
}
