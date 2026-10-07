import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';
import '../../integration_test/support/receipt_ocr_fixture_contract.dart';

const incompleteWarning =
    'Some OCR lines need manual review because no traceable line amount was found.';
const stayWarning =
    'Stay dates were detected without a transaction date. Review the receipt date.';

ReceiptOcrPreview sourceDraft(
  Map<String, Object?> e, {
  List<ReceiptOcrItemCandidate>? items,
  List<String>? warnings,
  List<ReceiptOcrBlockEvidence>? blocks,
  bool complete = false,
  List<ReceiptOcrIncompleteAdjustmentReason>? reasons,
  String? discount,
  String? date,
  String? tax,
}) {
  final roles = (e['expected_review_roles']! as List)
      .cast<Map<String, Object?>>();
  return ReceiptOcrPreview(
    merchant: e['merchant'] as String?,
    receiptDate: date ?? e['date'] as String?,
    currency: e['currency'] as String?,
    subtotal: e['subtotal'] as String?,
    tax: tax ?? e['tax'] as String?,
    discount: discount ?? e['discount'] as String?,
    total: e['total'] as String?,
    adjustmentsComplete: complete,
    incompleteAdjustmentReasons:
        reasons ??
        const [
          ReceiptOcrIncompleteAdjustmentReason.unclassifiedAdjustmentLabel,
          ReceiptOcrIncompleteAdjustmentReason.labeledAmountEvidence,
        ],
    warnings:
        warnings ?? [incompleteWarning, if (e['date'] == null) stayWarning],
    items:
        items ??
        (e['items']! as List).map((row) {
          final item = ReceiptOcrFixtureItem.fromManifest(row, 'fixture');
          return ReceiptOcrItemCandidate(
            description: item.description,
            lineTotal: item.lineTotal,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            currency: item.currency ?? e['currency'] as String?,
          );
        }).toList(),
    blocks:
        blocks ??
        [
          for (var index = 0; index < roles.length; index++)
            ReceiptOcrBlockEvidence(
              text:
                  '${roles[index]['label']} ${roles[index]['source_context'] ?? ''} USD ${roles[index]['amount']}',
              row: index,
              order: index,
            ),
        ],
  );
}

void main() {
  final manifest =
      jsonDecode(
            File('test/fixtures/receipt_ocr/manifest.json').readAsStringSync(),
          )
          as Map<String, dynamic>;
  final entries = (manifest['fixtures']! as List).cast<Map<String, dynamic>>();
  const ids = [
    'existing_02_fiberwave_internet_en_US',
    'existing_06_metrogrid_electric_en_US',
    'layout_11_hotel_folio',
    'distortion_07_shadow_hotel',
  ];
  for (final id in ids) {
    final e = (entries.singleWhere((row) => row['id'] == id)['expected'] as Map)
        .cast<String, Object?>();
    test('adjudicated source fields and unsupported-role condition: $id', () {
      final p = sourceDraft(e);
      expect(receiptOcrFixtureFieldMismatches(p, e, id), isEmpty);
      expect(receiptOcrFixtureReviewMatches(p, e), isTrue);
    });
    for (final mutation in [
      'arbitrary warning',
      'unrelated warning',
      'missing evidence',
      'wrong amount',
      'wrong sign',
      'foreign amount',
      'duplicate evidence',
      'extra amount',
      'missing reason',
      'unrelated reason',
      'false confidence',
      'unknown condition',
      'extra role key',
      'invalid role context',
    ]) {
      test('review contract rejects $mutation: $id', () {
        final p = sourceDraft(e);
        var expected = e;
        var blocks = p.blocks;
        if (mutation == 'missing evidence') blocks = [];
        if (mutation == 'duplicate evidence') {
          blocks = [
            ...blocks,
            ReceiptOcrBlockEvidence(
              text: blocks.first.text,
              row: 99,
              order: 99,
            ),
          ];
        }
        if ([
          'wrong amount',
          'wrong sign',
          'foreign amount',
          'extra amount',
        ].contains(mutation)) {
          final old = blocks.first;
          final amount =
              ((e['expected_review_roles']! as List).first as Map)['amount']
                  as String;
          final text = switch (mutation) {
            'wrong amount' => old.text.replaceFirst(amount, '999.99'),
            'wrong sign' => old.text.replaceFirst(
              amount,
              amount.startsWith('-') ? amount.substring(1) : '-$amount',
            ),
            'foreign amount' => old.text.replaceFirst('USD', 'EUR'),
            _ => '${old.text} USD 2.00',
          };
          blocks = [
            ReceiptOcrBlockEvidence(text: text, row: old.row, order: old.order),
            ...blocks.skip(1),
          ];
        }
        if (mutation == 'unknown condition') {
          expected = {...e, 'expected_review_condition': 'accept all warnings'};
        }
        if (mutation == 'extra role key' ||
            mutation == 'invalid role context') {
          final roles = (e['expected_review_roles']! as List)
              .map((r) => Map<String, Object?>.from(r as Map))
              .toList();
          roles.first[mutation == 'extra role key'
              ? 'ignore_warnings'
              : 'source_context'] = mutation == 'extra role key'
              ? true
              : 1;
          expected = {...e, 'expected_review_roles': roles};
        }
        final changed = sourceDraft(
          e,
          blocks: blocks,
          complete: mutation == 'false confidence',
          warnings: mutation == 'arbitrary warning'
              ? [...p.warnings, 'Anything goes']
              : mutation == 'unrelated warning'
              ? [...p.warnings, 'Currency is unresolved']
              : p.warnings,
          reasons: mutation == 'missing reason'
              ? []
              : mutation == 'unrelated reason'
              ? [
                  ...p.incompleteAdjustmentReasons,
                  ReceiptOcrIncompleteAdjustmentReason.detachedAmountSign,
                ]
              : p.incompleteAdjustmentReasons,
        );
        expect(receiptOcrFixtureReviewMatches(changed, expected), isFalse);
      });
    }
    test(
      'review condition never exempts extra meter items or wrong item money: $id',
      () {
        final p = sourceDraft(e);
        final extra = sourceDraft(
          e,
          items: [
            const ReceiptOcrItemCandidate(
              description: 'Previous Reading Current Reading Usage',
              lineTotal: '600434',
              currency: 'USD',
            ),
            ...p.items,
          ],
        );
        expect(
          receiptOcrFixtureFieldMismatches(extra, e, id),
          contains('items.length'),
        );
        expect(
          receiptOcrFixtureFieldMismatches(extra, e, id),
          contains('items[0].lineTotal'),
        );
        final wrong = sourceDraft(
          e,
          items: [
            ReceiptOcrItemCandidate(
              description: p.items.first.description,
              lineTotal: '999.99',
              currency: 'USD',
            ),
            ...p.items.skip(1),
          ],
        );
        expect(
          receiptOcrFixtureFieldMismatches(wrong, e, id),
          contains('items[0].lineTotal'),
        );
      },
    );
    if (id.contains('hotel')) {
      test(
        'hotel rejects inferred checkout date, payment-as-discount, and lost tax: $id',
        () {
          final guessedDate = sourceDraft(e, date: '2026-09-17');
          expect(
            receiptOcrFixtureFieldMismatches(guessedDate, e, id),
            contains('date'),
          );
          expect(receiptOcrFixtureReviewMatches(guessedDate, e), isFalse);
          final creditAsDiscount = sourceDraft(e, discount: '-100.00');
          expect(
            receiptOcrFixtureFieldMismatches(creditAsDiscount, e, id),
            contains('discount'),
          );
          expect(receiptOcrFixtureReviewMatches(creditAsDiscount, e), isFalse);
          expect(
            receiptOcrFixtureFieldMismatches(
              sourceDraft(e, tax: '0.00'),
              e,
              id,
            ),
            contains('tax'),
          );
          expect(
            receiptOcrFixtureReviewMatches(
              sourceDraft(e, warnings: [incompleteWarning]),
              e,
            ),
            isFalse,
          );
        },
      );
    }
  }
  test(
    'source fee columns preserve billing period and reject nearby or monetary residue',
    () {
      final e =
          (entries.singleWhere(
                    (row) =>
                        row['id'] == 'existing_02_fiberwave_internet_en_US',
                  )['expected']
                  as Map)
              .cast<String, Object?>();
      ReceiptOcrBlockEvidence block(
        String text,
        int row,
        int order,
        double left,
        double right,
      ) => ReceiptOcrBlockEvidence(
        text: text,
        row: row,
        order: order,
        points: [
          ReceiptOcrPoint(x: left, y: row * 40.0),
          ReceiptOcrPoint(x: right, y: row * 40.0),
          ReceiptOcrPoint(x: right, y: row * 40.0 + 20),
          ReceiptOcrPoint(x: left, y: row * 40.0 + 20),
        ],
      );
      // These are source-printed columns, not a parser-output-derived oracle.
      final blocks = [
        block('Regulatory Recovery Fee', 0, 0, 50, 230),
        block('Feb 5 - Mar 4, 2025', 0, 1, 417, 567),
        block(r'$1.99', 0, 2, 667, 717),
        block('County Communications Fee (1.75%)', 1, 3, 50, 323),
        block('Feb 5 - Mar 4, 2025', 1, 4, 418, 567),
        block(r'$0.89', 1, 5, 667, 717),
      ];
      expect(
        receiptOcrFixtureReviewMatches(
          sourceDraft(
            e,
            blocks: [...blocks, block('Help Center', 1, 6, 828, 926)],
          ),
          e,
        ),
        isTrue,
      );
      for (final residue in [
        block('Help Center', 1, 6, 720, 800),
        block(r'$2.00', 1, 6, 828, 926),
        block('Fee 2', 1, 6, 828, 926),
      ]) {
        expect(
          receiptOcrFixtureReviewMatches(
            sourceDraft(e, blocks: [...blocks, residue]),
            e,
          ),
          isFalse,
        );
      }
      final wrongPeriod = [...blocks];
      wrongPeriod[1] = block('Feb 5 - Mar 9, 2025', 0, 1, 417, 567);
      expect(
        receiptOcrFixtureReviewMatches(sourceDraft(e, blocks: wrongPeriod), e),
        isFalse,
      );
    },
  );
  test('legacy absent review condition still requires no hints', () {
    const p = ReceiptOcrPreview(
      currency: 'USD',
      total: '12.00',
      items: [
        ReceiptOcrItemCandidate(
          description: 'Item',
          lineTotal: '10.00',
          currency: 'USD',
        ),
      ],
    );
    expect(receiptOcrFixtureReviewMatches(p, {}), isFalse);
    expect(
      receiptOcrFixtureReviewMatches(p, {
        'expected_review_condition':
            'printed total differs from visible charge-line arithmetic',
      }),
      isTrue,
    );
    expect(
      receiptOcrFixtureReviewMatches(p, {'expected_review_roles': []}),
      isFalse,
    );
  });
}
