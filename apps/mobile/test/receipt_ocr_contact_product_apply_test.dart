import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_provider.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';
import 'bill_list_screen_test.dart' as bills;
import 'receipt_ocr_capture/receipt_ocr_contact_product_ownership_test.dart'
    as receipts;

Future<void> applyPreviewAndExpect(
  WidgetTester tester,
  ReceiptOcrPreview preview,
  List<(String, String)> expected, {
  bool itemsAllowed = true,
}) async {
  await bills.useLargeSurface(tester);
  final repository = bills.FakeBillRepository();
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
  Map<String, String> itemFields() => {
    for (final field in tester.widgetList<TextFormField>(
      find.byType(TextFormField),
    ))
      if (field.key case ValueKey<String>(value: final key)
          when key.startsWith('personal-bill-item-name-') ||
              key.startsWith('personal-bill-item-amount-'))
        key: field.controller!.text,
  };
  final initialItems = itemFields();
  await tester.tap(find.byKey(const Key('personal-bill-scan-receipt')));
  await tester.pumpAndSettle();
  final choice = find.byKey(const Key('personal-bill-ocr-apply-items'));
  await tester.ensureVisible(choice);
  final tile = tester.widget<CheckboxListTile>(choice);
  expect(tile.onChanged, itemsAllowed ? isNotNull : isNull);
  if (!itemsAllowed) expect(tile.value, isFalse);
  if (itemsAllowed && !tile.value!) {
    await tester.tap(choice);
    await tester.pumpAndSettle();
  }
  final apply = find.byKey(const Key('personal-bill-ocr-apply'));
  await tester.ensureVisible(apply);
  await tester.tap(apply);
  await tester.pumpAndSettle();
  expect(
    find.text('Suggestions applied'),
    itemsAllowed ? findsOneWidget : findsNothing,
  );
  String field(String key) =>
      tester.widget<TextFormField>(find.byKey(Key(key))).controller!.text;
  for (var index = 0; index < expected.length; index++) {
    expect(field('personal-bill-item-name-$index'), expected[index].$1);
    expect(field('personal-bill-item-amount-$index'), expected[index].$2);
  }
  if (!itemsAllowed) expect(itemFields(), initialItems);
  expect(repository.lastCreateDraft, isNull);
  expect(provider.calls, 1);
}

void main() {
  final cases = <({String product, String? contact})>[
    for (final product in receipts.contactProducts)
      (product: product, contact: null),
    for (final contact in [
      ...receipts.contactExtensionFields,
      ...receipts.dottedContactFields,
      ...receipts.qualifiedContactFields,
    ])
      (product: 'Notebook', contact: contact),
  ];
  for (final scenario in cases) {
    final product = scenario.product;
    for (final layout in ['flat', 'split']) {
      testWidgets(
        'contact product reaches actual draft Apply: $product $layout ${scenario.contact ?? ''}',
        (tester) async {
          final preview = receipts.contactProductPreview(
            product,
            layout: layout,
            contact: scenario.contact,
          );
          await applyPreviewAndExpect(tester, preview, [
            (product, '5.00'),
            ('Tea', '5.00'),
          ]);
        },
      );
    }
  }
  for (final name in [
    ('NORTH', 'MARKET'),
    ('RIVER', 'SUPPLIES'),
    ('SUNRISE', 'PROVISIONS'),
  ]) {
    for (final scale in [.5, 1.0, 2.0]) {
      testWidgets(
        'repeated issuer price reaches actual draft Apply $name $scale',
        (tester) async {
          final preview = receipts.repeatedNameAmountPreview(
            name: name,
            scale: scale,
          );
          await applyPreviewAndExpect(tester, preview, [
            ('Coffee', '3.00'),
            ('Tea', '2.00'),
            ('${name.$1} ${name.$2}', '3.00'),
          ]);
        },
      );
    }
  }
  for (final contact in receipts.unsupportedContactFields) {
    for (final layout in ['flat', 'split']) {
      testWidgets(
        'unsupported phone field cannot Apply items $contact $layout',
        (tester) async {
          final preview = receipts.contactProductPreview(
            'Notebook',
            layout: layout,
            contact: contact,
          );
          await applyPreviewAndExpect(tester, preview, [], itemsAllowed: false);
        },
      );
    }
  }
}
