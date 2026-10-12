import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_review/receipt_ocr_review_repository.dart';

void main() {
  for (final previousMode in [
    ReceiptOcrTaxReconciliationModeValues.sourceIncludedUnresolved,
    ReceiptOcrTaxReconciliationModeValues.unresolved,
  ]) {
    test(
      'review round two zero tax reopens with source provenance $previousMode',
      () {
        final now = DateTime.utc(2026, 10, 6);
        final previous = ReceiptOcrReviewDetail(
          id: 'review',
          billId: 'bill',
          fileId: 'file',
          groupId: null,
          status: ReceiptOcrReviewStatusValues.reviewed,
          source: ReceiptOcrReviewSourceValues.onDevice,
          merchantText: 'Books',
          receiptIssuedAtUtc: null,
          currency: 'GBP',
          subtotalAmount: '24',
          taxAmount: '0',
          taxReconciliationMode: previousMode,
          serviceChargeAmount: null,
          discountAmount: null,
          grandTotalAmount: '24',
          lines: [
            ReceiptOcrReviewLine(
              id: 'line',
              sortOrder: 0,
              text: 'Book',
              quantity: '1',
              unitPriceAmount: '24',
              lineTotalAmount: '24',
              createdAtUtc: now,
              updatedAtUtc: now,
            ),
          ],
          createdAtUtc: now,
          updatedAtUtc: now,
        );
        final candidate = ReceiptOcrReviewSaveRequest(
          status: previous.status,
          source: previous.source,
          merchantText: previous.merchantText,
          receiptIssuedAtUtc: null,
          currency: 'GBP',
          subtotalAmount: '24.00',
          taxAmount: '0.00',
          serviceChargeAmount: null,
          discountAmount: null,
          grandTotalAmount: '24.00',
          lines: const [
            ReceiptOcrReviewLineSaveRequest(
              text: 'Book',
              quantity: '1',
              unitPriceAmount: '24.00',
              lineTotalAmount: '24.00',
            ),
          ],
        );
        expect(
          receiptOcrTaxModeForSavedEdit(previous, candidate),
          previousMode ==
                  ReceiptOcrTaxReconciliationModeValues.sourceIncludedUnresolved
              ? ReceiptOcrTaxReconciliationModeValues.alreadyInBase
              : ReceiptOcrTaxReconciliationModeValues.unresolved,
        );
      },
    );
  }

  for (final change in [
    'add',
    'amount',
    'currency',
    'role',
    'remove',
    'same',
  ]) {
    test(
      'header evidence $change invalidates saved tax resolution when changed',
      () {
        final now = DateTime.utc(2026, 10, 6);
        final previous = ReceiptOcrReviewDetail(
          id: 'review',
          billId: 'bill',
          fileId: 'file',
          groupId: null,
          status: ReceiptOcrReviewStatusValues.reviewed,
          source: ReceiptOcrReviewSourceValues.onDevice,
          merchantText: 'Books',
          receiptIssuedAtUtc: null,
          currency: 'GBP',
          subtotalAmount: '24',
          taxAmount: '4',
          taxReconciliationMode:
              ReceiptOcrTaxReconciliationModeValues.alreadyInBase,
          serviceChargeAmount: null,
          discountAmount: null,
          grandTotalAmount: '24',
          lines: const [],
          createdAtUtc: now,
          updatedAtUtc: now,
          headerEvidence: change == 'add'
              ? const []
              : const [
                  ReceiptOcrReviewHeaderEvidence(
                    role: 'service_charge',
                    amount: '1.00',
                    currency: 'EUR',
                  ),
                ],
        );
        final candidate = ReceiptOcrReviewSaveRequest(
          status: previous.status,
          source: previous.source,
          merchantText: previous.merchantText,
          receiptIssuedAtUtc: null,
          currency: 'GBP',
          subtotalAmount: '24',
          taxAmount: '4',
          serviceChargeAmount: null,
          discountAmount: null,
          grandTotalAmount: '24',
          lines: const [],
          headerEvidence: change == 'remove'
              ? const []
              : [
                  ReceiptOcrReviewHeaderEvidenceSaveRequest(
                    role: change == 'role' ? 'discount' : 'service_charge',
                    amount: change == 'amount' ? '2' : '1',
                    currency: change == 'currency' ? 'USD' : 'EUR',
                  ),
                ],
        );
        expect(
          receiptOcrTaxModeForSavedEdit(previous, candidate),
          change == 'same'
              ? ReceiptOcrTaxReconciliationModeValues.alreadyInBase
              : ReceiptOcrTaxReconciliationModeValues.unresolved,
        );
        if (candidate.headerEvidence.isNotEmpty) {
          expect(
            receiptOcrTaxModeFromSupportedEvidence(candidate),
            ReceiptOcrTaxReconciliationModeValues.unresolved,
          );
        }
      },
    );
  }

  test('included tax reconciles bounded same-currency tip or shipping', () {
    ReceiptOcrReviewSaveRequest candidate({
      required String subtotal,
      required String total,
      required String kind,
      String adjustmentCurrency = 'GBP',
      bool duplicate = false,
    }) {
      final adjustment = ReceiptOcrReviewAdjustmentSaveRequest(
        kind: kind,
        originalLabel: kind,
        amount: '2',
        currency: adjustmentCurrency,
        direction: ReceiptOcrReviewAdjustmentDirectionValues.charge,
      );
      return ReceiptOcrReviewSaveRequest(
        status: ReceiptOcrReviewStatusValues.provisional,
        source: ReceiptOcrReviewSourceValues.onDevice,
        merchantText: null,
        receiptIssuedAtUtc: null,
        currency: 'GBP',
        subtotalAmount: subtotal,
        taxAmount: '4',
        serviceChargeAmount: null,
        discountAmount: null,
        grandTotalAmount: total,
        lines: const [],
        adjustmentEvidence: [adjustment, if (duplicate) adjustment],
      );
    }

    expect(
      receiptOcrTaxModeFromSupportedEvidence(
        candidate(
          subtotal: '24',
          total: '26',
          kind: ReceiptOcrReviewAdjustmentKindValues.tip,
        ),
      ),
      ReceiptOcrTaxReconciliationModeValues.alreadyInBase,
    );
    expect(
      receiptOcrTaxModeFromSupportedEvidence(
        candidate(
          subtotal: '20',
          total: '26',
          kind: ReceiptOcrReviewAdjustmentKindValues.shipping,
        ),
      ),
      ReceiptOcrTaxReconciliationModeValues.addToBase,
    );
    expect(
      receiptOcrTaxModeFromSupportedEvidence(
        candidate(
          subtotal: '24',
          total: '26',
          kind: ReceiptOcrReviewAdjustmentKindValues.tip,
          adjustmentCurrency: 'EUR',
        ),
      ),
      ReceiptOcrTaxReconciliationModeValues.unresolved,
    );
    expect(
      receiptOcrTaxModeFromSupportedEvidence(
        candidate(
          subtotal: '24',
          total: '26',
          kind: ReceiptOcrReviewAdjustmentKindValues.tip,
          duplicate: true,
        ),
      ),
      ReceiptOcrTaxReconciliationModeValues.unresolved,
    );
  });

  test('saved additive tax cannot become included from edited arithmetic', () {
    final now = DateTime.utc(2026, 10, 2);
    final review = ReceiptOcrReviewDetail(
      id: 'review',
      billId: 'bill',
      fileId: 'file',
      groupId: null,
      status: ReceiptOcrReviewStatusValues.reviewed,
      source: ReceiptOcrReviewSourceValues.onDevice,
      merchantText: 'Cafe',
      receiptIssuedAtUtc: null,
      currency: 'USD',
      subtotalAmount: '20',
      taxAmount: '4',
      taxReconciliationMode: ReceiptOcrTaxReconciliationModeValues.addToBase,
      serviceChargeAmount: null,
      discountAmount: null,
      grandTotalAmount: '24',
      lines: const [],
      createdAtUtc: now,
      updatedAtUtc: now,
    );
    ReceiptOcrReviewSaveRequest edit(String subtotal, String total) =>
        ReceiptOcrReviewSaveRequest(
          status: review.status,
          source: review.source,
          merchantText: review.merchantText,
          receiptIssuedAtUtc: null,
          currency: 'USD',
          subtotalAmount: subtotal,
          taxAmount: '4',
          serviceChargeAmount: null,
          discountAmount: null,
          grandTotalAmount: total,
          lines: const [],
        );
    expect(
      receiptOcrTaxModeForSavedEdit(review, edit('20', '20')),
      ReceiptOcrTaxReconciliationModeValues.unresolved,
    );
    expect(
      receiptOcrTaxModeForSavedEdit(review, edit('20', '25')),
      ReceiptOcrTaxReconciliationModeValues.unresolved,
    );
    expect(
      receiptOcrTaxModeForSavedEdit(review, edit('21', '25')),
      ReceiptOcrTaxReconciliationModeValues.addToBase,
    );
  });

  group('saved additive zero-tax correction', () {
    ReceiptOcrReviewDetail previous({
      String mode = ReceiptOcrTaxReconciliationModeValues.addToBase,
    }) {
      final now = DateTime.utc(2026, 10, 12);
      return ReceiptOcrReviewDetail(
        id: 'review',
        billId: 'bill',
        fileId: 'file',
        groupId: null,
        status: ReceiptOcrReviewStatusValues.reviewed,
        source: ReceiptOcrReviewSourceValues.onDevice,
        merchantText: 'Books',
        receiptIssuedAtUtc: null,
        currency: 'USD',
        subtotalAmount: '20',
        taxAmount: '4',
        taxReconciliationMode: mode,
        serviceChargeAmount: null,
        discountAmount: null,
        grandTotalAmount: '24',
        lines: const [],
        createdAtUtc: now,
        updatedAtUtc: now,
      );
    }

    ReceiptOcrReviewSaveRequest corrected({
      String? currency = 'USD',
      String tax = '0',
      String total = '20',
      bool useLines = false,
      bool foreignHeader = false,
      bool foreignAdjustment = false,
      bool supportedCharges = false,
    }) => ReceiptOcrReviewSaveRequest(
      status: ReceiptOcrReviewStatusValues.reviewed,
      source: ReceiptOcrReviewSourceValues.onDevice,
      merchantText: 'Books',
      receiptIssuedAtUtc: null,
      currency: currency,
      subtotalAmount: useLines ? null : '20',
      taxAmount: tax,
      serviceChargeAmount: supportedCharges ? '2' : null,
      discountAmount: supportedCharges ? '1' : null,
      grandTotalAmount: total,
      lines: const [
        ReceiptOcrReviewLineSaveRequest(
          text: 'Book',
          quantity: '1',
          unitPriceAmount: '20',
          lineTotalAmount: '20',
        ),
      ],
      headerEvidence: foreignHeader
          ? const [
              ReceiptOcrReviewHeaderEvidenceSaveRequest(
                role: 'tax',
                amount: '0',
                currency: 'EUR',
              ),
            ]
          : const [],
      adjustmentEvidence: foreignAdjustment || supportedCharges
          ? [
              ReceiptOcrReviewAdjustmentSaveRequest(
                kind: ReceiptOcrReviewAdjustmentKindValues.shipping,
                originalLabel: 'Shipping',
                amount: '3',
                currency: foreignAdjustment ? 'EUR' : 'USD',
                direction: ReceiptOcrReviewAdjustmentDirectionValues.charge,
              ),
            ]
          : const [],
    );
    for (final tax in ['0', '0.0000']) {
      for (final useLines in [false, true]) {
        test('preserves additive source for $tax, lines=$useLines', () {
          expect(
            receiptOcrTaxModeForSavedEdit(
              previous(),
              corrected(tax: tax, useLines: useLines),
            ),
            ReceiptOcrTaxReconciliationModeValues.addToBase,
          );
        });
      }
    }
    test('reconciles supported service, discount and shipping', () {
      expect(
        receiptOcrTaxModeForSavedEdit(
          previous(),
          corrected(total: '24', supportedCharges: true),
        ),
        ReceiptOcrTaxReconciliationModeValues.addToBase,
      );
    });
    for (final guard in [
      'currency',
      'missing currency',
      'foreign header',
      'foreign adjustment',
      'total mismatch',
      'positive included tax',
      'plain unresolved',
    ]) {
      test('preserves $guard guard', () {
        expect(
          receiptOcrTaxModeForSavedEdit(
            previous(
              mode: guard == 'plain unresolved'
                  ? ReceiptOcrTaxReconciliationModeValues.unresolved
                  : ReceiptOcrTaxReconciliationModeValues.addToBase,
            ),
            corrected(
              currency: guard == 'currency'
                  ? 'EUR'
                  : guard == 'missing currency'
                  ? null
                  : 'USD',
              foreignHeader: guard == 'foreign header',
              foreignAdjustment: guard == 'foreign adjustment',
              total: guard == 'total mismatch' ? '21' : '20',
              tax: guard == 'positive included tax' ? '4' : '0',
            ),
          ),
          ReceiptOcrTaxReconciliationModeValues.unresolved,
        );
      });
    }
  });

  test('saved included tax survives merchant edit and numeric formatting', () {
    final now = DateTime.utc(2026, 10, 2);
    final review = ReceiptOcrReviewDetail(
      id: 'review',
      billId: 'bill',
      fileId: 'file',
      groupId: null,
      status: ReceiptOcrReviewStatusValues.reviewed,
      source: ReceiptOcrReviewSourceValues.onDevice,
      merchantText: 'London Books',
      receiptIssuedAtUtc: null,
      currency: 'GBP',
      subtotalAmount: '24.00',
      taxAmount: '4.00',
      taxReconciliationMode:
          ReceiptOcrTaxReconciliationModeValues.alreadyInBase,
      serviceChargeAmount: null,
      discountAmount: null,
      grandTotalAmount: '24.00',
      lines: [
        ReceiptOcrReviewLine(
          id: 'line',
          sortOrder: 0,
          text: 'Book',
          quantity: '1',
          unitPriceAmount: '24.00',
          lineTotalAmount: '24.00',
          createdAtUtc: now,
          updatedAtUtc: now,
        ),
      ],
      createdAtUtc: now,
      updatedAtUtc: now,
    );
    ReceiptOcrReviewSaveRequest edit({
      String tax = '4',
      String subtotal = '24',
      String lineTotal = '24',
    }) => ReceiptOcrReviewSaveRequest(
      status: review.status,
      source: review.source,
      merchantText: 'Corrected London Books',
      receiptIssuedAtUtc: null,
      currency: 'GBP',
      subtotalAmount: subtotal,
      taxAmount: tax,
      serviceChargeAmount: null,
      discountAmount: null,
      grandTotalAmount: '24',
      lines: [
        ReceiptOcrReviewLineSaveRequest(
          text: 'Book',
          quantity: '1.0',
          unitPriceAmount: lineTotal,
          lineTotalAmount: lineTotal,
        ),
      ],
    );
    expect(
      receiptOcrTaxModeForSavedEdit(review, edit()),
      ReceiptOcrTaxReconciliationModeValues.alreadyInBase,
    );
    expect(
      receiptOcrTaxModeForSavedEdit(review, edit(tax: '5')),
      ReceiptOcrTaxReconciliationModeValues.alreadyInBase,
    );
    expect(
      receiptOcrTaxModeForSavedEdit(
        review,
        edit(subtotal: '20', lineTotal: '20'),
      ),
      ReceiptOcrTaxReconciliationModeValues.addToBase,
    );
    expect(
      receiptOcrTaxModeForSavedEdit(review, edit(tax: '25')),
      ReceiptOcrTaxReconciliationModeValues.sourceIncludedUnresolved,
    );
  });

  test(
    'source included conflict survives save and resolves only after correction',
    () {
      final now = DateTime.utc(2026, 10, 2);
      ReceiptOcrReviewDetail review(String mode) => ReceiptOcrReviewDetail(
        id: 'review',
        billId: 'bill',
        fileId: 'file',
        groupId: null,
        status: ReceiptOcrReviewStatusValues.reviewed,
        source: ReceiptOcrReviewSourceValues.onDevice,
        merchantText: 'Books',
        receiptIssuedAtUtc: null,
        currency: 'GBP',
        subtotalAmount: '20',
        taxAmount: '4',
        taxReconciliationMode: mode,
        serviceChargeAmount: null,
        discountAmount: null,
        grandTotalAmount: '25',
        lines: const [],
        createdAtUtc: now,
        updatedAtUtc: now,
      );
      ReceiptOcrReviewSaveRequest corrected({String currency = 'GBP'}) =>
          ReceiptOcrReviewSaveRequest(
            status: ReceiptOcrReviewStatusValues.reviewed,
            source: ReceiptOcrReviewSourceValues.onDevice,
            merchantText: 'Books',
            receiptIssuedAtUtc: null,
            currency: currency,
            subtotalAmount: '20',
            taxAmount: '4',
            serviceChargeAmount: null,
            discountAmount: null,
            grandTotalAmount: '24',
            lines: const [],
          );
      expect(
        receiptOcrTaxModeForSavedEdit(
          review(
            ReceiptOcrTaxReconciliationModeValues.sourceIncludedUnresolved,
          ),
          corrected(),
        ),
        ReceiptOcrTaxReconciliationModeValues.addToBase,
      );
      expect(
        receiptOcrTaxModeForSavedEdit(
          review(ReceiptOcrTaxReconciliationModeValues.unresolved),
          corrected(),
        ),
        ReceiptOcrTaxReconciliationModeValues.unresolved,
      );
      expect(
        receiptOcrTaxModeForSavedEdit(
          review(
            ReceiptOcrTaxReconciliationModeValues.sourceIncludedUnresolved,
          ),
          corrected(currency: 'EUR'),
        ),
        ReceiptOcrTaxReconciliationModeValues.unresolved,
      );
    },
  );

  test('correcting a missed item retains printed included-tax provenance', () {
    final now = DateTime.utc(2026, 10, 2);
    final review = ReceiptOcrReviewDetail(
      id: 'review',
      billId: 'bill',
      fileId: 'file',
      groupId: null,
      status: ReceiptOcrReviewStatusValues.reviewed,
      source: ReceiptOcrReviewSourceValues.onDevice,
      merchantText: 'Books',
      receiptIssuedAtUtc: null,
      currency: 'GBP',
      subtotalAmount: '24',
      taxAmount: '4',
      taxReconciliationMode:
          ReceiptOcrTaxReconciliationModeValues.sourceIncludedUnresolved,
      serviceChargeAmount: null,
      discountAmount: null,
      grandTotalAmount: '24',
      lines: [
        ReceiptOcrReviewLine(
          id: 'line',
          sortOrder: 0,
          text: 'Book',
          quantity: '1',
          unitPriceAmount: '19',
          lineTotalAmount: '19',
          createdAtUtc: now,
          updatedAtUtc: now,
        ),
      ],
      createdAtUtc: now,
      updatedAtUtc: now,
    );
    final correction = ReceiptOcrReviewSaveRequest(
      status: review.status,
      source: review.source,
      merchantText: review.merchantText,
      receiptIssuedAtUtc: null,
      currency: 'GBP',
      subtotalAmount: '24',
      taxAmount: '4',
      serviceChargeAmount: null,
      discountAmount: null,
      grandTotalAmount: '24',
      lines: const [
        ReceiptOcrReviewLineSaveRequest(
          text: 'Book',
          quantity: '1',
          unitPriceAmount: '24',
          lineTotalAmount: '24',
        ),
      ],
    );
    expect(
      receiptOcrTaxModeForSavedEdit(review, correction),
      ReceiptOcrTaxReconciliationModeValues.alreadyInBase,
    );
  });
}
