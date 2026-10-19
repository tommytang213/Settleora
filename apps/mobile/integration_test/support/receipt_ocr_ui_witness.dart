// Test-only structural replay of one already-extracted result. This does not
// measure native inference, source correctness, usefulness or saved-review Apply.
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_attachment_file_input.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/bills/bill_repository.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_provider.dart';
import 'package:mobile/ui/settleora_form_fields.dart';

// [version, state, checked, failed, replayProviderCalls, repositoryCalls]
// States: 0 unattempted, 1 no extracted preview, 2 unequal request context,
// 3 completed, 4 incomplete operation. Bits: request association, initial field
// binding, merchant edit/rebuild, first item edit/rebuild (when present), reset,
// unchanged manual draft, unchanged source UI fields, zero repository calls,
// exactly one replay call. These are operations, not product-domain pass bits.
const receiptOcrUiWitnessUnattempted = [1, 0, 0, 0, 0, 0];

Future<List<int>> receiptOcrUiWitness(
  WidgetTester tester, {
  required Uint8List sourceBytes,
  required ReceiptOcrRequest sourceRequest,
  required ReceiptOcrResult result,
}) async {
  final preview = result.preview;
  if (result.status != ReceiptOcrStatus.extracted || preview == null) {
    return [1, 1, 0, 0, 0, 0];
  }
  final replay = _ReplayProvider(sourceRequest, result);
  final repository = _RejectRepository();
  final input = _ImageInput(sourceBytes);
  final identity = UniqueKey();
  final originalSource = _sourceUiFields(preview);
  var checked = 0;
  var failed = 0;
  var state = 4;
  void check(int bit, bool matches) {
    checked |= bit;
    if (!matches) {
      failed |= bit;
      throw const _WitnessMismatch();
    }
  }

  Widget screen({bool rebuild = false}) => MaterialApp(
    theme: ThemeData(brightness: rebuild ? Brightness.dark : Brightness.light),
    home: SettleoraPersonalBillCreateScreen(
      key: identity,
      repository: repository,
      attachmentFileInput: input,
      receiptOcrProvider: replay,
      defaultCurrency: sourceRequest.fallbackCurrency,
      scanReceiptOnStart: true,
    ),
  );

  try {
    await tester.pumpWidget(screen());
    await tester.pumpAndSettle();
    // A UI default differing from the corpus request is not equivalent, even
    // when the preview contains an explicit currency. Do not return that result.
    if (replay.calls == 1 && !replay.contextMatched) {
      checked = failed = 1;
      state = 2;
    } else {
      check(1, replay.calls == 1 && replay.contextMatched);
      check(2, _reviewFields(tester) == _expectedReviewFields(preview));
      await _edit(
        tester,
        'personal-bill-merchant-name',
        'Acceptance manual draft',
      );
      await _edit(
        tester,
        'personal-bill-item-name-0',
        'Acceptance manual line',
      );
      final draftIsolation = ReceiptOcrUiDraftIsolation(tester);
      final originalReview = _reviewFields(tester);
      final merchantEdit = preview.merchant == 'Acceptance temporary merchant'
          ? 'Acceptance alternate merchant'
          : 'Acceptance temporary merchant';
      await _edit(tester, 'personal-bill-ocr-edit-merchant', merchantEdit);
      check(32, draftIsolation.observe(tester));
      await tester.pumpWidget(screen(rebuild: true));
      await tester.pumpAndSettle();
      check(32, draftIsolation.observe(tester));
      check(
        4,
        _text(tester, 'personal-bill-ocr-edit-merchant') == merchantEdit,
      );
      if (preview.items.isNotEmpty) {
        final itemEdit =
            preview.items.first.description ==
                'Acceptance temporary description'
            ? 'Acceptance alternate description'
            : 'Acceptance temporary description';
        await _edit(tester, 'personal-bill-ocr-item-description-0', itemEdit);
        check(32, draftIsolation.observe(tester));
        await tester.pumpWidget(screen());
        await tester.pumpAndSettle();
        check(32, draftIsolation.observe(tester));
        check(
          8,
          _text(tester, 'personal-bill-ocr-item-description-0') == itemEdit,
        );
      }
      final reset = find.byKey(const Key('personal-bill-ocr-reset-edits'));
      await tester.ensureVisible(reset);
      await tester.tap(reset);
      await tester.pumpAndSettle();
      check(16, _reviewFields(tester) == originalReview);
      check(32, draftIsolation.observe(tester));
      check(64, _sourceUiFields(preview) == originalSource);
      check(128, repository.calls == 0);
      check(256, replay.calls == 1);
      state = 3;
    }
  } on _WitnessMismatch {
    // Retain only fixed operation bits; never exception or receipt contents.
  } catch (_) {
    // Failed operations stay explicit. Do not consume Flutter framework errors
    // or infer a cause from exception text; the normal test runner stays active.
  } finally {
    // No takeException, log redirection or runtime stderr suppression. Dispose
    // each fixture before the next one; no corpus-sized preview/widget cache.
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
  }
  return [1, state, checked, failed, replay.calls, repository.calls];
}

class _WitnessMismatch implements Exception {
  const _WitnessMismatch();
}

// Shared only by acceptance tests. Once an observed manual-draft mutation has
// occurred, a later Reset/restoration cannot erase that violation. Snapshots
// remain in memory and are never returned as evidence.
class ReceiptOcrUiDraftIsolation {
  ReceiptOcrUiDraftIsolation(WidgetTester tester)
    : _baseline = _draftFields(tester);
  final String _baseline;
  bool _unchanged = true;

  bool observe(WidgetTester tester) {
    final matches = _draftFields(tester) == _baseline;
    _unchanged = _unchanged && matches;
    return _unchanged;
  }
}

Future<void> _edit(WidgetTester tester, String key, String value) async {
  final control = find.byKey(Key(key));
  await tester.ensureVisible(control);
  await tester.enterText(control, value);
  await tester.pumpAndSettle();
}

String _text(WidgetTester tester, String key) =>
    tester.widget<TextFormField>(find.byKey(Key(key))).controller!.text;

String? _currency(WidgetTester tester, Finder parent) => tester
    .widget<CurrencySelector>(
      find.descendant(of: parent, matching: find.byType(CurrencySelector)),
    )
    .value;

String _reviewFields(WidgetTester tester) => jsonEncode([
  _text(tester, 'personal-bill-ocr-edit-merchant'),
  tester
      .widget<DateField>(find.byKey(const Key('personal-bill-ocr-edit-date')))
      .controller
      .text,
  tester
      .widget<CurrencySelector>(
        find.byKey(const Key('personal-bill-ocr-edit-currency')),
      )
      .value,
  for (
    var i = 0;
    find
        .byKey(Key('personal-bill-ocr-item-description-$i'))
        .evaluate()
        .isNotEmpty;
    i++
  )
    [
      _text(tester, 'personal-bill-ocr-item-description-$i'),
      _text(tester, 'personal-bill-ocr-item-quantity-$i'),
      _text(tester, 'personal-bill-ocr-item-unit-price-$i'),
      _text(tester, 'personal-bill-ocr-item-line-total-$i'),
      tester
          .widget<CurrencySelector>(
            find.byKey(Key('personal-bill-ocr-item-currency-$i')),
          )
          .value,
    ],
]);

String _expectedReviewFields(ReceiptOcrPreview p) => jsonEncode([
  p.merchant ?? '',
  p.receiptDate ?? '',
  p.currency ?? '',
  for (final i in p.items)
    [
      i.description,
      i.quantity ?? '',
      i.unitPrice ?? '',
      i.lineTotal ?? '',
      i.currency ?? '',
    ],
]);

String _draftFields(WidgetTester tester) => jsonEncode([
  _text(tester, 'personal-bill-merchant-name'),
  tester
      .widget<DateField>(find.byKey(const Key('personal-bill-date-picker')))
      .controller
      .text,
  _currency(tester, find.byKey(const Key('personal-bill-currency'))),
  for (
    var i = 0;
    find.byKey(Key('personal-bill-item-name-$i')).evaluate().isNotEmpty;
    i++
  )
    [
      _text(tester, 'personal-bill-item-name-$i'),
      _text(tester, 'personal-bill-item-quantity-$i'),
      _text(tester, 'personal-bill-item-unit-amount-$i'),
      _text(tester, 'personal-bill-item-amount-$i'),
      _currency(tester, find.byKey(Key('personal-bill-item-currency-$i'))),
    ],
]);

// In-memory snapshot of source fields used by the review UI. It is never
// printed, retained, hashed or exported. It is not a source-completeness oracle.
String _sourceUiFields(ReceiptOcrPreview p) => jsonEncode([
  _expectedReviewFields(p),
  [for (final item in p.items) item.currencyUnresolved],
  p.currencyProvenance.index,
  p.subtotal,
  p.subtotalCurrency,
  p.subtotalHasExplicitCurrencyEvidence,
  p.tax,
  p.taxCurrency,
  p.taxHasExplicitCurrencyEvidence,
  p.taxIncludedInTotal,
  p.service,
  p.serviceCurrency,
  p.serviceHasExplicitCurrencyEvidence,
  p.tip,
  p.tipLabel,
  p.tipCurrency,
  p.tipHasExplicitCurrencyEvidence,
  p.shipping,
  p.shippingLabel,
  p.shippingCurrency,
  p.shippingHasExplicitCurrencyEvidence,
  p.discount,
  p.discountCurrency,
  p.discountHasExplicitCurrencyEvidence,
  p.discountBeforeSubtotal,
  p.total,
  p.adjustmentsComplete,
  [for (final reason in p.incompleteAdjustmentReasons) reason.index],
  p.warnings,
  p.reviewHints,
]);

class _ReplayProvider implements ReceiptOcrProvider {
  _ReplayProvider(this.expected, this.result);
  final ReceiptOcrRequest expected;
  final ReceiptOcrResult result;
  int calls = 0;
  bool contextMatched = false;

  @override
  Future<ReceiptOcrResult> extractReceipt(ReceiptOcrRequest request) async {
    calls++;
    contextMatched =
        calls == 1 &&
        listEquals(request.bytes, expected.bytes) &&
        request.contentType == expected.contentType &&
        request.imagePath == expected.imagePath &&
        request.fallbackCurrency == expected.fallbackCurrency;
    return contextMatched
        ? result
        : const ReceiptOcrResult.failed('Acceptance replay context differs');
  }
}

class _ImageInput implements SettleoraBillAttachmentFileInput {
  _ImageInput(this.bytes);
  final Uint8List bytes;
  @override
  Future<SettleoraPickedBillAttachmentFile?> pickAttachmentFile({
    required Set<String> allowedContentTypes,
  }) async => pickedBillAttachmentFileFromBytes(
    filename: 'acceptance-replay.jpeg',
    contentType: 'image/jpeg',
    bytes: bytes,
    allowedContentTypes: allowedContentTypes,
  );
}

class _RejectRepository implements SettleoraBillRepository {
  int calls = 0;
  Never _reject() {
    calls++;
    throw const _WitnessMismatch();
  }

  @override
  Future<SettleoraBillDetail> createPersonalBill(
    SettleoraPersonalBillCreateDraft draft,
  ) async => _reject();
  @override
  Future<SettleoraBillDetail> createGroupBill(
    String groupId,
    SettleoraGroupBillCreateDraft draft,
  ) async => _reject();
  @override
  Future<SettleoraBillDetail> getGroupBill(
    String groupId,
    String billId,
  ) async => _reject();
  @override
  Future<SettleoraBillDetail> getPersonalBill(String billId) async => _reject();
  @override
  Future<List<SettleoraBillSummary>> listPersonalBills({
    int limit = 50,
  }) async => _reject();
  @override
  Future<List<SettleoraBillSummary>> listGroupBills(
    String groupId, {
    int limit = 50,
  }) async => _reject();
  @override
  Future<void> acceptGroupBillParticipant(
    String groupId,
    String billId,
    String userProfileId,
  ) async => _reject();
  @override
  Future<void> rejectGroupBillParticipant(
    String groupId,
    String billId,
    String userProfileId,
    SettleoraBillParticipantRejectionReasonCode reasonCode,
  ) async => _reject();
  @override
  Future<void> submitGroupBill(String groupId, String billId) async =>
      _reject();
}
