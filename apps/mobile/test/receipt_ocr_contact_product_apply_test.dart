import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_provider.dart';
import 'bill_list_screen_test.dart' as bills;
import 'receipt_ocr_capture/receipt_ocr_contact_product_ownership_test.dart'
    as receipts;

void main() {
  final cases = <({String product, String? contact})>[
    for (final product in receipts.contactProducts)
      (product: product, contact: null),
    for (final contact in receipts.contactExtensionFields)
      (product: 'Notebook', contact: contact),
  ];
  for (final scenario in cases) {
    final product = scenario.product;
    for (final layout in ['flat', 'split']) {
      testWidgets(
        'contact product reaches actual draft Apply: $product $layout ${scenario.contact ?? ''}',
        (tester) async {
          await bills.useLargeSurface(tester);
          final repository = bills.FakeBillRepository();
          final preview = receipts.contactProductPreview(
            product,
            layout: layout,
            contact: scenario.contact,
          );
          final provider = bills.FakeReceiptOcrProvider(
            ReceiptOcrResult.extracted(preview),
          );
          await tester.pumpWidget(
            MaterialApp(
              home: SettleoraPersonalBillCreateScreen(
                repository: repository,
                attachmentRepository: bills.FakeBillAttachmentRepository(),
                attachmentFileInput: bills.FakeBillAttachmentFileInput(
                  pickedFile: bills.samplePickedAttachmentFile(
                    filename: 'synthetic-receipt.png',
                    contentType: 'image/png',
                    bytes: bills.samplePngBytes(width: 64, height: 64),
                  ),
                ),
                receiptOcrProvider: provider,
              ),
            ),
          );
          await tester.pumpAndSettle();
          await tester.tap(find.byKey(const Key('personal-bill-scan-receipt')));
          await tester.pumpAndSettle();
          final choice = find.byKey(const Key('personal-bill-ocr-apply-items'));
          await tester.ensureVisible(choice);
          final tile = tester.widget<CheckboxListTile>(choice);
          expect(tile.onChanged, isNotNull);
          if (!tile.value!) {
            await tester.tap(choice);
            await tester.pumpAndSettle();
          }
          final apply = find.byKey(const Key('personal-bill-ocr-apply'));
          await tester.ensureVisible(apply);
          await tester.tap(apply);
          await tester.pumpAndSettle();
          expect(find.text('Suggestions applied'), findsOneWidget);
          String field(String key) => tester
              .widget<TextFormField>(find.byKey(Key(key)))
              .controller!
              .text;
          expect(field('personal-bill-item-name-0'), product);
          expect(field('personal-bill-item-name-1'), 'Tea');
          expect(field('personal-bill-item-amount-0'), '5.00');
          expect(field('personal-bill-item-amount-1'), '5.00');
          expect(repository.lastCreateDraft, isNull);
          expect(provider.calls, 1);
        },
      );
    }
  }
}
