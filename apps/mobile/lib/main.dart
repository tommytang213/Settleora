import 'package:flutter/material.dart';

import 'receipt_ocr_review/receipt_ocr_review_screen.dart';

void main() {
  runApp(const SettleoraMobileApp());
}

class SettleoraMobileApp extends StatelessWidget {
  const SettleoraMobileApp({super.key});

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
      home: const ReceiptOcrReviewQueueScreen(),
    );
  }
}
