import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_screen.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_form_fields.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../bill_list_screen_test.dart' as bills;
import '../helpers/settleora_visual_test_fonts.dart';
import '../receipt_ocr_review_screen_test.dart' as ocr;

const _visualOutputDir =
    '/workspace/logs/settleora-visual-qa/20260622-1542-mobile-ocr-money-section-density';

void main() {
  testWidgets('captures bills OCR money date visual QA evidence', (
    tester,
  ) async {
    await tester.runAsync(() async {
      await loadSettleoraVisualTestFonts();
      await Directory(_visualOutputDir).create(recursive: true);
    });
    await setSettleoraMobileViewport(tester);

    const showcaseKey = Key('bills-ocr-money-date-showcase-capture');
    await tester.pumpWidget(
      MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.light(),
        home: const RepaintBoundary(
          key: showcaseKey,
          child: _BillsOcrMoneyDateShowcase(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await _captureBoundary(
      tester,
      showcaseKey,
      'bills-ocr-money-date-showcase-390x844.png',
    );

    const billCreateKey = Key('bills-create-money-date-capture');
    await tester.pumpWidget(
      RepaintBoundary(
        key: billCreateKey,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: SettleoraTheme.light(),
          home: SettleoraBillListScreen(
            repository: bills.FakeBillRepository(),
            syncController: bills.sampleBillSyncController(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-list-create')));
    await tester.pumpAndSettle();
    await _captureBoundary(
      tester,
      billCreateKey,
      'bills-create-date-currency-form-390x844.png',
    );

    const ocrEditKey = Key('receipt-ocr-review-money-date-capture');
    final route = ocr.sampleRoute();
    await tester.pumpWidget(
      RepaintBoundary(
        key: ocrEditKey,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: SettleoraTheme.light(),
          home: ReceiptOcrReviewDetailScreen.forRoute(
            repository: ocr.FakeReceiptOcrReviewRepository(
              reviewResponse: ocr.sampleReview(route),
            ),
            route: route,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Edit receipt review'));
    await tester.pumpAndSettle();
    await _captureBoundary(
      tester,
      ocrEditKey,
      'receipt-ocr-review-edit-money-date-390x844.png',
    );
  });
}

class _BillsOcrMoneyDateShowcase extends StatefulWidget {
  const _BillsOcrMoneyDateShowcase();

  @override
  State<_BillsOcrMoneyDateShowcase> createState() =>
      _BillsOcrMoneyDateShowcaseState();
}

class _BillsOcrMoneyDateShowcaseState
    extends State<_BillsOcrMoneyDateShowcase> {
  final _amountController = TextEditingController(text: '43.00');
  final _subtotalController = TextEditingController(text: '38.40');
  final _dateController = TextEditingController(text: '2026-06-22');
  String _currency = 'HKD';

  @override
  void dispose() {
    _amountController.dispose();
    _subtotalController.dispose();
    _dateController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(SettleoraSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Bills and receipt review',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: SettleoraSpacing.sm),
              const InfoCard(
                title: 'Shared form controls',
                message:
                    'Bills and OCR review keep dates picker-backed and money explicit with section currency support.',
              ),
              const SizedBox(height: SettleoraSpacing.md),
              const AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Bill amount readouts'),
                    SizedBox(height: SettleoraSpacing.xs),
                    MoneyText(amount: '43.00', currencyCode: 'HKD'),
                    SizedBox(height: SettleoraSpacing.xs),
                    MoneyText(amount: '1200', currencyCode: 'JPY'),
                  ],
                ),
              ),
              const SizedBox(height: SettleoraSpacing.md),
              MoneyInput(
                amountController: _amountController,
                currencyValue: _currency,
                onCurrencyChanged: (value) =>
                    setState(() => _currency = value ?? _currency),
                amountLabel: 'Grand total',
                currencyLabel: 'Receipt currency',
              ),
              const SizedBox(height: SettleoraSpacing.md),
              MoneyInput(
                amountController: _subtotalController,
                currencyValue: _currency,
                onCurrencyChanged: (_) {},
                amountLabel: 'Subtotal',
                currencyLabel: 'Receipt currency',
                currencyControl: MoneyInputCurrencyControl.staticCode,
              ),
              const SizedBox(height: SettleoraSpacing.md),
              DateField(controller: _dateController, label: 'Receipt date'),
              const SizedBox(height: SettleoraSpacing.md),
              AppButton(
                label: 'Save review',
                icon: Icons.save_outlined,
                onPressed: () {},
              ),
            ],
          ),
        ),
      ),
    );
  }
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
