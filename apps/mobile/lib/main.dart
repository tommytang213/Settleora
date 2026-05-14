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
    this.now,
  }) : secureStorage = secureStorage ?? SettleoraSecureStorage();

  final SettleoraSecureStorageBoundary secureStorage;
  final ReceiptOcrReviewRepositoryFactory? receiptOcrReviewRepositoryFactory;
  final SettleoraAuthRepositoryFactory? authRepositoryFactory;
  final DateTime Function()? now;

  @override
  Widget build(BuildContext context) {
    final receiptFactory = receiptOcrReviewRepositoryFactory;
    final authFactory = authRepositoryFactory;

    Widget home;
    if (receiptFactory != null && authFactory != null) {
      home = SettleoraAppBootstrap(
        secureStorage: secureStorage,
        receiptOcrReviewRepositoryFactory: receiptFactory,
        authRepositoryFactory: authFactory,
        now: now,
      );
    } else if (receiptFactory != null) {
      home = SettleoraAppBootstrap(
        secureStorage: secureStorage,
        receiptOcrReviewRepositoryFactory: receiptFactory,
        now: now,
      );
    } else if (authFactory != null) {
      home = SettleoraAppBootstrap(
        secureStorage: secureStorage,
        authRepositoryFactory: authFactory,
        now: now,
      );
    } else {
      home = SettleoraAppBootstrap(secureStorage: secureStorage, now: now);
    }

    return MaterialApp(
      title: 'Settleora',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0F766E),
          brightness: Brightness.light,
        ),
        useMaterial3: true,
      ),
      home: home,
    );
  }
}
