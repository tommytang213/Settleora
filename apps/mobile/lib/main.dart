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
    this.now,
  }) : secureStorage = secureStorage ?? SettleoraSecureStorage();

  final SettleoraSecureStorageBoundary secureStorage;
  final ReceiptOcrReviewRepositoryFactory? receiptOcrReviewRepositoryFactory;
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
      home: receiptOcrReviewRepositoryFactory == null
          ? SettleoraAppBootstrap(secureStorage: secureStorage, now: now)
          : SettleoraAppBootstrap(
              secureStorage: secureStorage,
              receiptOcrReviewRepositoryFactory:
                  receiptOcrReviewRepositoryFactory!,
              now: now,
            ),
    );
  }
}
