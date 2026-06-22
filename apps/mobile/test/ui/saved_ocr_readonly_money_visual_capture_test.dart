import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_repository.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../bill_list_screen_test.dart' as bills;
import '../helpers/settleora_visual_test_fonts.dart';

const _visualOutputDir =
    '/workspace/logs/settleora-visual-qa/20260622-2328-mobile-saved-ocr-apply-preview-visual-polish';

void main() {
  testWidgets('captures saved OCR read-only money visual evidence', (
    tester,
  ) async {
    await tester.runAsync(() async {
      await loadSettleoraVisualTestFonts();
      await Directory(_visualOutputDir).create(recursive: true);
    });
    await setSettleoraMobileViewport(tester);

    const showcaseKey = Key('saved-ocr-readonly-money-showcase-capture');
    await tester.pumpWidget(
      RepaintBoundary(
        key: showcaseKey,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: SettleoraTheme.light(),
          home: const _SavedOcrReadonlyMoneyShowcase(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await _captureBoundary(
      tester,
      showcaseKey,
      'saved-ocr-readonly-money-showcase-390x844.png',
    );

    const route = ReceiptOcrReviewRoute(
      billId: '11111111-1111-1111-1111-111111111111',
      fileId: '22222222-2222-2222-2222-222222222222',
    );
    const billKey = Key('saved-ocr-readonly-money-bill-capture');
    await tester.pumpWidget(
      RepaintBoundary(
        key: billKey,
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
              applyPreview: bills.sampleReceiptOcrApplyPreview(route),
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
    await tester.ensureVisible(find.text('Grand total'));
    expect(
      find.byWidgetPredicate(
        (widget) =>
            widget is MoneyText &&
            widget.amount == '10.80' &&
            widget.currencyCode == 'HKD',
      ),
      findsWidgets,
    );
    await _captureBoundary(
      tester,
      billKey,
      'saved-ocr-readonly-money-bill-detail-390x844.png',
    );

    await tester.ensureVisible(
      find.byKey(const Key('saved-ocr-review-preview-apply')),
    );
    await tester.tap(find.byKey(const Key('saved-ocr-review-preview-apply')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Header total'));
    expect(
      find.byWidgetPredicate(
        (widget) =>
            widget is MoneyText &&
            widget.amount == '10.80' &&
            widget.currencyCode == 'USD',
      ),
      findsWidgets,
    );
    await _captureBoundary(
      tester,
      billKey,
      'saved-ocr-apply-preview-overview-390x844.png',
    );

    const firstPreviewLineKey = ValueKey(
      'saved-ocr-review-preview-line-dddddddd-dddd-dddd-dddd-dddddddddddd',
    );
    await tester.ensureVisible(find.text('Line summary'));
    await tester.pumpAndSettle();
    expect(find.byKey(firstPreviewLineKey), findsOneWidget);
    final lineTop = tester.getTopLeft(find.byKey(firstPreviewLineKey)).dy;
    final lineBottom = tester.getBottomLeft(find.byKey(firstPreviewLineKey)).dy;
    expect(lineTop, greaterThanOrEqualTo(0));
    expect(lineBottom, lessThanOrEqualTo(844));
    await _captureBoundary(
      tester,
      billKey,
      'saved-ocr-apply-preview-lines-390x844.png',
    );
  });
}

class _SavedOcrReadonlyMoneyShowcase extends StatelessWidget {
  const _SavedOcrReadonlyMoneyShowcase();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Saved OCR totals')),
      body: const SafeArea(
        child: Padding(
          padding: EdgeInsets.all(SettleoraSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Receipt totals'),
                    SizedBox(height: SettleoraSpacing.sm),
                    Text('Subtotal'),
                    MoneyText(amount: '38.4500', currencyCode: 'HKD'),
                    SizedBox(height: SettleoraSpacing.sm),
                    Text('Tax'),
                    MoneyText(amount: '0.80', currencyCode: 'HKD'),
                    SizedBox(height: SettleoraSpacing.sm),
                    Text('Grand total'),
                    MoneyText(amount: '39.2500', currencyCode: 'HKD'),
                  ],
                ),
              ),
              SizedBox(height: SettleoraSpacing.md),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Line summary'),
                    SizedBox(height: SettleoraSpacing.sm),
                    Text('Oat milk'),
                    MoneyText(amount: '18.50', currencyCode: 'HKD'),
                    SizedBox(height: SettleoraSpacing.sm),
                    Text('Bread'),
                    MoneyText(amount: '20.75', currencyCode: 'HKD'),
                  ],
                ),
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
