import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_repository.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_form_fields.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../bill_list_screen_test.dart' as bills;
import '../helpers/settleora_visual_test_fonts.dart';

const _visualOutputDir =
    '/workspace/logs/settleora-visual-qa/20260622-2002-mobile-saved-ocr-in-bill-editor-money-date-fields';

void main() {
  testWidgets('captures saved OCR in-bill editor money date visual evidence', (
    tester,
  ) async {
    await tester.runAsync(() async {
      await loadSettleoraVisualTestFonts();
      await Directory(_visualOutputDir).create(recursive: true);
    });
    await setSettleoraMobileViewport(tester);

    const showcaseKey = Key('saved-ocr-editor-showcase-capture');
    await tester.pumpWidget(
      MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.light(),
        home: const RepaintBoundary(
          key: showcaseKey,
          child: _SavedOcrEditorMoneyDateShowcase(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await _captureBoundary(
      tester,
      showcaseKey,
      'saved-ocr-editor-money-date-showcase-390x844.png',
    );

    const editorKey = Key('saved-ocr-in-bill-editor-capture');
    const route = ReceiptOcrReviewRoute(
      billId: '11111111-1111-1111-1111-111111111111',
      fileId: '22222222-2222-2222-2222-222222222222',
    );
    await tester.pumpWidget(
      RepaintBoundary(
        key: editorKey,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: SettleoraTheme.light(),
          home: SettleoraBillDetailScreen(
            repository: bills.FakeBillRepository(
              detail: bills.sampleBillDetail(id: route.billId),
            ),
            billId: route.billId,
            initialBill: bills.sampleBillDetail(id: route.billId),
            receiptOcrReviewRepository: bills.FakeReceiptOcrReviewRepository(
              reviewDetail: bills.sampleReceiptOcrReviewDetail(
                route,
                merchantText: 'Harbour Market',
                lineText: 'Oat milk',
                currency: 'HKD',
              ),
            ),
            initialReceiptOcrReviewHandoff: const ReceiptOcrReviewHandoff.saved(
              reviewRoute: route,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const Key('bill-detail-ocr-review-open')),
    );
    await tester.tap(find.byKey(const Key('bill-detail-ocr-review-open')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byTooltip('Edit saved OCR review'));
    await tester.tap(find.byTooltip('Edit saved OCR review'));
    await tester.pumpAndSettle();
    await _captureBoundary(
      tester,
      editorKey,
      'saved-ocr-in-bill-editor-date-field-390x844.png',
    );
    await tester.drag(
      find.byKey(const Key('saved-ocr-review-edit-content')),
      const Offset(0, -420),
    );
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('saved-ocr-review-ocr-item-line-total-0')),
      findsOneWidget,
    );
    await tester.pumpAndSettle();
    await _captureBoundary(
      tester,
      editorKey,
      'saved-ocr-in-bill-editor-money-date-fields-390x844.png',
    );
  });
}

class _SavedOcrEditorMoneyDateShowcase extends StatefulWidget {
  const _SavedOcrEditorMoneyDateShowcase();

  @override
  State<_SavedOcrEditorMoneyDateShowcase> createState() =>
      _SavedOcrEditorMoneyDateShowcaseState();
}

class _SavedOcrEditorMoneyDateShowcaseState
    extends State<_SavedOcrEditorMoneyDateShowcase> {
  final _dateController = TextEditingController(text: '2026-06-22');
  final _unitPriceController = TextEditingController(text: '18.50');
  final _lineTotalController = TextEditingController();
  String _currency = 'HKD';

  @override
  void dispose() {
    _dateController.dispose();
    _unitPriceController.dispose();
    _lineTotalController.dispose();
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
                'Saved OCR editor',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: SettleoraSpacing.sm),
              const InfoCard(
                title: 'In-bill receipt review',
                message:
                    'Date uses the shared picker field. Line amounts keep the active ISO currency visible even when blank.',
              ),
              const SizedBox(height: SettleoraSpacing.md),
              DateField(
                controller: _dateController,
                label: 'Receipt date suggestion',
                helperText: 'Choose the receipt date suggestion.',
              ),
              const SizedBox(height: SettleoraSpacing.md),
              CurrencySelector(
                value: _currency,
                label: 'Line currency',
                helperText: 'Review the line currency before applying.',
                onChanged: (value) {
                  if (value != null) {
                    setState(() => _currency = value);
                  }
                },
              ),
              const SizedBox(height: SettleoraSpacing.md),
              MoneyInput(
                amountController: _unitPriceController,
                currencyValue: _currency,
                onCurrencyChanged: (_) {},
                amountLabel: 'Unit price',
                currencyLabel: 'Line currency',
                currencyControl: MoneyInputCurrencyControl.staticCode,
                helperText: 'Uses the line currency shown above.',
              ),
              const SizedBox(height: SettleoraSpacing.md),
              MoneyInput(
                amountController: _lineTotalController,
                currencyValue: _currency,
                onCurrencyChanged: (_) {},
                amountLabel: 'Line total',
                currencyLabel: 'Line currency',
                currencyControl: MoneyInputCurrencyControl.staticCode,
                helperText: 'Uses the line currency shown above.',
              ),
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
