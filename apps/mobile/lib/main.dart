import 'package:flutter/material.dart';

import 'app/app_bootstrap.dart';
import 'app/secure_storage.dart';

void main() {
  runApp(SettleoraMobileApp());
}

class SettleoraMobileApp extends StatelessWidget {
  SettleoraMobileApp({
    super.key,
    SettleoraSecureStorageBoundary? secureStorage,
    this.receiptOcrReviewRepositoryFactory,
    this.authRepositoryFactory,
    this.billRepositoryFactory,
    this.settlementRepositoryFactory,
    this.billSyncControllerFactory,
    this.now,
  }) : secureStorage = secureStorage ?? SettleoraSecureStorage();

  final SettleoraSecureStorageBoundary secureStorage;
  final ReceiptOcrReviewRepositoryFactory? receiptOcrReviewRepositoryFactory;
  final SettleoraAuthRepositoryFactory? authRepositoryFactory;
  final SettleoraBillRepositoryFactory? billRepositoryFactory;
  final SettleoraSettlementRepositoryFactory? settlementRepositoryFactory;
  final SettleoraBillSyncControllerFactory? billSyncControllerFactory;
  final DateTime Function()? now;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Settleora',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0F766E),
          brightness: Brightness.light,
        ),
        useMaterial3: true,
      ),
      home: SettleoraAppBootstrap(
        secureStorage: secureStorage,
        receiptOcrReviewRepositoryFactory: receiptOcrReviewRepositoryFactory,
        authRepositoryFactory: authRepositoryFactory,
        billRepositoryFactory: billRepositoryFactory,
        settlementRepositoryFactory: settlementRepositoryFactory,
        billSyncControllerFactory: billSyncControllerFactory,
        now: now,
      ),
    );
  }
}
