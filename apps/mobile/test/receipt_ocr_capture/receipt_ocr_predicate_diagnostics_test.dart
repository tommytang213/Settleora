import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';
import '../../integration_test/support/receipt_ocr_fixture_contract.dart';

Object semantic(ReceiptOcrPreview p) => [
  p.merchant,
  p.receiptDate,
  p.currency,
  p.currencyProvenance,
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
  p.adjustmentsComplete,
  p.incompleteAdjustmentReasons,
  p.itemLineDecisions,
  p.itemSelectionDecisions,
  p.unresolvedItemLikeCount,
  p.unresolvedItemLikeRoleCounts,
  p.nordicFooterOwnershipFailureCounts,
  p.unresolvedOtherBranchDecisionCounts,
  p.total,
  p.rawTextLineCount,
  p.confidence,
  p.category,
  p.warnings,
  p.reviewHints,
  p.reviewHintDecision,
  p.hasApplyableFields,
  p.items
      .map(
        (i) => [
          i.description,
          i.quantity,
          i.unitPrice,
          i.lineTotal,
          i.currency,
          i.currencyUnresolved,
          i.confidence,
          i.category,
        ],
      )
      .toList(),
  p.blocks,
  p.runEvidence,
];
ReceiptOcrBlockEvidence block(
  String text,
  int row,
  double left,
  double right, {
  int? order,
  bool geometry = true,
}) => ReceiptOcrBlockEvidence(
  text: text,
  row: row,
  order: order ?? row * 3,
  confidence: .99,
  points: geometry
      ? [
          ReceiptOcrPoint(x: left, y: row * 30),
          ReceiptOcrPoint(x: right, y: row * 30),
          ReceiptOcrPoint(x: right, y: row * 30 + 20),
          ReceiptOcrPoint(x: left, y: row * 30 + 20),
        ]
      : const [],
);
void main() {
  for (final heading in [false, true]) {
    for (final shape in ['separate', 'merged', 'partial', 'crossed']) {
      test('diagnostic semantic equality $heading $shape', () {
        final lines = [
          'Market',
          if (heading) 'Qty Item Price',
          '1 Day Pass 14.00',
          '1 Year Calendar 11.00',
          '2 Pack Batteries 18.00',
          '1 More Thing 8.00',
          'Subtotal 51.00',
          'Total 51.00',
        ];
        final blocks = <ReceiptOcrBlockEvidence>[block('Market', 0, 150, 500)];
        if (heading) {
          blocks.addAll([
            block('Qty', 1, 20, 30),
            block('Item', 1, 65, 280, order: 4),
            block('Price', 1, 390, 470, order: 5),
          ]);
        }
        final rows = [
          ('1', 'Day Pass', '14.00'),
          ('1', 'Year Calendar', '11.00'),
          ('2', 'Pack Batteries', '18.00'),
          ('1', 'More Thing', '8.00'),
        ];
        for (final (index, row) in rows.indexed) {
          final r = index + (heading ? 2 : 1);
          if (shape == 'merged') {
            blocks.addAll([
              block('${row.$1} ${row.$2}', r, 20, 280),
              block(row.$3, r, 390, 470, order: r * 3 + 1),
            ]);
          } else {
            blocks.addAll([
              block(
                row.$1,
                r,
                20,
                shape == 'crossed' ? 90 : 30,
                geometry: shape != 'partial',
              ),
              block(row.$2, r, 65, 280, order: r * 3 + 1),
              block(row.$3, r, 390, 470, order: r * 3 + 2),
            ]);
          }
        }
        blocks.addAll([
          block('Subtotal 51.00', lines.length - 2, 65, 470),
          block('Total 51.00', lines.length - 1, 65, 470),
        ]);
        final a = const ReceiptOcrParser().parse(
          lines.join('\n'),
          blocks: blocks,
        );
        final b = const ReceiptOcrParser(
          collectDiagnostics: true,
        ).parse(lines.join('\n'), blocks: blocks);
        expect(semantic(b), semantic(a));
        expect(a.parserDiagnostics, isNull);
        final q = b.parserDiagnostics!.quantity;
        if (shape == 'separate') {
          expect(q[ReceiptOcrQuantityPredicate.separateDigitCell.index], 4);
          expect(
            q[(heading
                    ? ReceiptOcrQuantityPredicate.accepted
                    : ReceiptOcrQuantityPredicate.failHeading)
                .index],
            4,
          );
          expect(
            b.items.map((i) => i.quantity),
            heading ? ['1', '1', '2', '1'] : [null, null, null, null],
          );
        }
      });
    }
  }
  for (final date in [
    '２０２５年０４月１２日',
    '2025年04月12日',
    'Receipt Date: 2025-04-12',
    'Stay: 2025-04-12 to 2025-04-13',
    'Receipt Date: 2025-04-12\nReceipt Date: 2025-04-13',
    '2025-02-31',
  ]) {
    test('date stages preserve selection $date', () {
      final text = 'Market\n$date\nTea USD 5.00\nTotal USD 5.00';
      final a = const ReceiptOcrParser().parse(text);
      final b = const ReceiptOcrParser(collectDiagnostics: true).parse(text);
      expect(semantic(b), semantic(a));
      expect(b.parserDiagnostics!.dates, hasLength(3));
      if (date.startsWith('２０')) {
        expect(
          b.parserDiagnostics!.dates[0][ReceiptOcrDatePredicate
              .eastAsian
              .index],
          0,
        );
        expect(
          b.parserDiagnostics!.dates[1][ReceiptOcrDatePredicate
              .eastAsian
              .index],
          1,
        );
      }
      if (date.startsWith('Stay')) {
        expect(
          b.parserDiagnostics!.dates[2][ReceiptOcrDatePredicate
              .stayExcluded
              .index],
          2,
        );
      }
      if (date.contains('\n')) {
        expect(
          b.parserDiagnostics!.dates[2][ReceiptOcrDatePredicate.conflict.index],
          1,
        );
      }
    });
  }
  test('typed counters saturate and freeze without source leakage', () {
    final c = ReceiptOcrPredicateCounter();
    for (var i = 0; i < 1000; i++) {
      c.quantity(ReceiptOcrQuantityPredicate.candidate);
      c.date(
        ReceiptOcrDateStage.original,
        ReceiptOcrDatePredicate.validCandidate,
      );
    }
    final frozen = c.freeze();
    expect(frozen.quantity.first, 256);
    expect(
      frozen.dates.first[ReceiptOcrDatePredicate.validCandidate.index],
      256,
    );
    expect(() => frozen.quantity[0] = 1, throwsUnsupportedError);
    expect(() => frozen.dates.first[0] = 1, throwsUnsupportedError);
    final p = const ReceiptOcrParser(
      collectDiagnostics: true,
    ).parse('PRIVATE_SENTINEL_9fd5 2025-04-12\nTea USD 5.00\nTotal USD 5.00');
    final encoded = jsonEncode(p.parserDiagnostics!.toBoundedEvidence());
    expect(encoded, isNot(contains('PRIVATE_SENTINEL')));
    expect(encoded, isNot(contains('2025')));
    expect(encoded, isNot(contains('5.00')));
    expect(encoded.length, lessThan(1024));
  });
  test('review diagnostic does not change exact contract result', () {
    const p = ReceiptOcrPreview(
      total: '5.00',
      currency: 'USD',
      items: [
        ReceiptOcrItemCandidate(
          description: 'Tea',
          lineTotal: '5.00',
          currency: 'USD',
        ),
      ],
    );
    expect(
      receiptOcrFixtureReviewFailure(p, {}),
      ReceiptOcrReviewRoleFailure.matched,
    );
    expect(receiptOcrFixtureReviewMatches(p, {}), isTrue);
    for (final condition in ['unknown review condition', 'PRIVATE_SENTINEL']) {
      final expected = <String, Object?>{
        'expected_review_condition': condition,
      };
      final before = semantic(p);
      expect(receiptOcrFixtureReviewMatches(p, expected), isFalse);
      expect(
        receiptOcrFixtureReviewFailure(p, expected),
        ReceiptOcrReviewRoleFailure.invalidContract,
      );
      expect(semantic(p), before);
    }
    expect(
      receiptOcrFixtureReviewFailure(p, {'expected_review_roles': []}),
      ReceiptOcrReviewRoleFailure.invalidContract,
    );
    expect(
      receiptOcrFixtureReviewMatches(p, {'expected_review_roles': []}),
      isFalse,
    );
  });
  test('review-role failure enums observe strict source predicates', () {
    final expected = <String, Object?>{
      'currency': 'USD',
      'expected_review_condition':
          'printed unsupported fees need manual review',
      'expected_review_roles': [
        {
          'kind': 'fee',
          'label': 'Levy',
          'amount': '1.00',
          'source_context': 'local',
        },
        {'kind': 'fee', 'label': 'Surcharge', 'amount': '2.00'},
      ],
    };
    ReceiptOcrPreview draft(
      List<ReceiptOcrBlockEvidence> blocks, {
      List<ReceiptOcrIncompleteAdjustmentReason> reasons = const [
        ReceiptOcrIncompleteAdjustmentReason.unclassifiedAdjustmentLabel,
      ],
      List<String> warnings = const [],
    }) => ReceiptOcrPreview(
      currency: 'USD',
      total: '8.00',
      blocks: blocks,
      adjustmentsComplete: false,
      incompleteAdjustmentReasons: reasons,
      warnings: warnings,
      items: const [
        ReceiptOcrItemCandidate(
          description: 'Tea',
          lineTotal: '5.00',
          currency: 'USD',
        ),
      ],
    );
    final good = [
      block('Levy local USD 1.00', 0, 0, 200),
      block('Surcharge USD 2.00', 1, 0, 200),
    ];
    void check(ReceiptOcrPreview p, ReceiptOcrReviewRoleFailure failure) {
      final before = semantic(p);
      expect(receiptOcrFixtureReviewFailure(p, expected), failure);
      expect(
        receiptOcrFixtureReviewMatches(p, expected),
        failure == ReceiptOcrReviewRoleFailure.matched,
      );
      expect(semantic(p), before);
    }

    check(draft(good), ReceiptOcrReviewRoleFailure.matched);
    check(draft([good.last]), ReceiptOcrReviewRoleFailure.roleRowAbsent);
    check(
      draft([...good, block('Levy local USD 1.00', 2, 0, 200)]),
      ReceiptOcrReviewRoleFailure.ambiguousRoleRow,
    );
    check(
      draft([block('Levy other USD 1.00', 0, 0, 200), good.last]),
      ReceiptOcrReviewRoleFailure.contextMismatch,
    );
    check(
      draft([block('Levy local USD 3.00', 0, 0, 200), good.last]),
      ReceiptOcrReviewRoleFailure.amountBoundaryMismatch,
    );
    check(
      draft([
        block('Levy local USD 1.00', 0, 0, 200),
        block('99', 0, 300, 320, order: 1),
        good.last,
      ]),
      ReceiptOcrReviewRoleFailure.extraneousColumn,
    );
    check(
      draft(
        good,
        reasons: [ReceiptOcrIncompleteAdjustmentReason.conflictingSubtotal],
      ),
      ReceiptOcrReviewRoleFailure.forbiddenIncompleteReason,
    );
    check(
      draft(good, warnings: ['PRIVATE_SENTINEL']),
      ReceiptOcrReviewRoleFailure.warningMismatch,
    );
    expect(
      receiptOcrFixtureReviewFailure(
        ReceiptOcrPreview(
          currency: 'USD',
          total: '8.00',
          blocks: good,
          adjustmentsComplete: false,
          incompleteAdjustmentReasons: [
            ReceiptOcrIncompleteAdjustmentReason.unclassifiedAdjustmentLabel,
          ],
          items: [
            ReceiptOcrItemCandidate(
              description: 'Tea',
              lineTotal: '8.00',
              currency: 'EUR',
            ),
          ],
        ),
        expected,
      ),
      ReceiptOcrReviewRoleFailure.decisionHintMismatch,
    );
  });
  test('date predicate role belongs to the current field', () {
    const text =
        'Market\nReceipt Date: 2025-04-12\n2025-04-12\nTea USD 5.00\nTotal USD 5.00';
    final a = const ReceiptOcrParser().parse(text);
    final b = const ReceiptOcrParser(collectDiagnostics: true).parse(text);
    expect(semantic(b), semantic(a));
    for (final stage in b.parserDiagnostics!.dates) {
      expect(stage[ReceiptOcrDatePredicate.primaryRole.index], 1);
    }
  });

  test(
    'empty input retains enabled observations without changing semantics',
    () {
      for (final text in ['', '  \n\t']) {
        final disabled = const ReceiptOcrParser().parse(text);
        final enabled = const ReceiptOcrParser(
          collectDiagnostics: true,
        ).parse(text);
        expect(semantic(enabled), semantic(disabled));
        expect(disabled.parserDiagnostics, isNull);
        expect(enabled.parserDiagnostics, isNotNull);
        expect(
          enabled.parserDiagnostics!.toBoundedEvidence()['status'],
          'observed',
        );
        expect(
          enabled.parserDiagnostics!.quantity.every((v) => v == 0),
          isTrue,
        );
        expect(enabled.parserDiagnostics!.dates, [
          for (final stage in ReceiptOcrDateStage.values)
            [
              for (final predicate in ReceiptOcrDatePredicate.values)
                stage != ReceiptOcrDateStage.projected &&
                        predicate == ReceiptOcrDatePredicate.noSelection
                    ? 1
                    : 0,
            ],
        ]);
      }
    },
  );

  test('invalid optional observations retain no partial counts', () {
    final counter = ReceiptOcrPredicateCounter();
    counter.quantity(ReceiptOcrQuantityPredicate.candidate);
    counter.invalidate();
    final observed = counter.freeze();
    expect(observed.toBoundedEvidence(), {
      'schemaVersion': 1,
      'status': 'invalid',
    });
    expect(observed.quantity, isEmpty);
    expect(observed.dates, isEmpty);
  });
  for (final text in [
    '',
    'PRIVATE_SENTINEL\u0000\ufffd\u202e',
    'Date: ２０２５年０４月１２日\nTea USD 5.00\nTotal USD 5.00',
  ]) {
    test(
      'optional observation preserves unusual input semantics ${text.length}',
      () {
        final a = const ReceiptOcrParser().parse(text);
        final b = const ReceiptOcrParser(collectDiagnostics: true).parse(text);
        expect(semantic(b), semantic(a));
        expect(
          b.parserDiagnostics?.toBoundedEvidence().toString(),
          isNot(contains('PRIVATE_SENTINEL')),
        );
      },
    );
  }
  test(
    'branch marker tuple preserves all fixed counter positions and absence',
    () {
      const branches = ReceiptOcrUnresolvedOtherBranch.values;
      const decisions = ReceiptOcrItemLineDecision.values;
      expect(branches.map((e) => e.name), [
        'explicitModifier',
        'ordinaryCourtesy',
        'otherDescription',
      ]);
      expect(decisions.map((e) => e.name), [
        'unclassified',
        'fuelItemSelected',
        'layoutChargeSelected',
        'ambiguousChargeSkipped',
        'metadataOrHeaderSkipped',
        'standaloneAmountSkipped',
        'layoutFallbackSelected',
        'adjacentAmountSelected',
        'unpricedDescription',
        'unretainedPricedRow',
        'invalidPricedRow',
        'quantityItemSelected',
        'leadingQuantityItemSelected',
        'pricedItemSelected',
      ]);
      final counts = {
        for (final b in branches)
          b: {for (final d in decisions) d: b.index * 14 + d.index},
      };
      final p = ReceiptOcrPreview(unresolvedOtherBranchDecisionCounts: counts);
      final before = semantic(p);
      final tuple = receiptOcrUnresolvedBranchMarkerCounts(p);
      expect(tuple.length, 3);
      expect(tuple.every((row) => row.length == 14), isTrue);
      for (final b in branches) {
        for (final d in decisions) {
          expect(tuple[b.index][d.index], counts[b]![d]);
        }
      }
      expect(semantic(p), before);
      expect(() => tuple[0][0] = 99, throwsUnsupportedError);
      expect(() => tuple.add([]), throwsUnsupportedError);
      expect(
        receiptOcrUnresolvedBranchMarkerCounts(null),
        List.generate(3, (_) => List.filled(14, 0)),
      );
      expect(
        receiptOcrUnresolvedBranchMarkerCounts(const ReceiptOcrPreview()),
        receiptOcrUnresolvedBranchMarkerCounts(null),
      );
      final invalid = ReceiptOcrPreview(
        unresolvedOtherBranchDecisionCounts: {
          ReceiptOcrUnresolvedOtherBranch.explicitModifier: {
            ReceiptOcrItemLineDecision.unclassified: -1,
          },
        },
      );
      expect(
        receiptOcrUnresolvedBranchMarkerCounts(invalid).first.first,
        -1,
        reason: 'invalid counts must not become valid zero counts',
      );
      expect(jsonEncode(tuple), isNot(contains('explicitModifier')));
    },
  );
}
