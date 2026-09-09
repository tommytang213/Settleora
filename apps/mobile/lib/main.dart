import 'package:flutter/material.dart';

import 'app/app_bootstrap.dart';
import 'app/home_shortcut_preferences.dart';
import 'app/secure_storage.dart';
import 'app/server_connection_probe.dart';
import 'app/version_notes.dart';
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
    SettleoraVersionSeenPreference? versionSeenPreference,
    SettleoraHomeShortcutPreference? homeShortcutPreference,
    this.versionNotesProcessGuard,
    this.versionNotes = currentBundledVersionNotes,
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
    this.serverConnectionProbe,
    this.showDashboardPreview = const bool.fromEnvironment(
      'SETTLEORA_DASHBOARD_PREVIEW',
    ),
  }) : secureStorage = secureStorage ?? SettleoraSecureStorage(),
       versionSeenPreference =
           versionSeenPreference ?? LocalSettleoraVersionSeenPreference(),
       homeShortcutPreference =
           homeShortcutPreference ?? LocalSettleoraHomeShortcutPreference();

  final SettleoraSecureStorageBoundary secureStorage;
  final SettleoraVersionSeenPreference versionSeenPreference;
  final SettleoraHomeShortcutPreference homeShortcutPreference;
  final SettleoraVersionNotesProcessGuard? versionNotesProcessGuard;
  final SettleoraBundledVersionNotes? versionNotes;
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
  final SettleoraServerConnectionProbe? serverConnectionProbe;
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
              versionSeenPreference: versionSeenPreference,
              homeShortcutPreference: homeShortcutPreference,
              versionNotesProcessGuard: versionNotesProcessGuard,
              versionNotes: versionNotes,
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
              serverConnectionProbe:
                  serverConnectionProbe ??
                  const GeneratedSettleoraServerConnectionProbe(),
            ),
    );
  }
}
