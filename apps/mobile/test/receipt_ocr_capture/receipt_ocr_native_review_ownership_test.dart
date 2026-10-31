import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

import '../support/paired_courtesy_receipt.dart';
import '../support/summary_role_receipt.dart';

void main() {
  for (final layout in [false, true]) {
    for (final header in [
      'Gift',
      '123 Widget',
      '?? TOTAL',
      'USD 1O.00 TOTAL',
      '?? Subtotal',
      '?? 小計',
    ]) {
      test('parking requires complete header evidence $layout/$header', () {
        final preview = _parkingPreview(
          withLayout: layout,
          beforeSession: [header],
        );
        expect(preview.total, isNull);
        expect(preview.warnings, isNotEmpty);
      });
    }
    for (final summary in [
      'TOTAL DUE',
      'Total USD 1O.00',
      'Subtotal',
      'Sub-total USD 1O.00',
      '合計',
      '小計 USD 1O.00',
      'Grand Total:',
      'Amount Due USD 1O.00',
    ]) {
      test(
        'parking cannot replace an unreadable printed summary $layout/$summary',
        () {
          final preview = _parkingPreview(
            withLayout: layout,
            beforeSession: [summary],
          );
          expect(preview.total, isNull);
          expect(preview.warnings, isNotEmpty);
          if (summary == 'Total USD 1O.00' ||
              summary == 'Amount Due USD 1O.00') {
            expect(
              preview.warnings,
              contains('No clear total amount was detected.'),
            );
          }
        },
      );
    }
    for (final merchant in [
      'Sumatra Parking',
      'Asuma Parking',
      'Gesamtheit Parking',
      'Toplamada Parking',
      'Tổnghợp Parking',
      'Suma\u0301tra Parking',
    ]) {
      test('parking localized prefix is not a summary $layout/$merchant', () {
        expect(
          _parkingPreview(
            withLayout: layout,
            changes: {'merchant': merchant},
          ).total,
          '18.00',
        );
      });
    }
    for (final summary in [
      'Suma',
      'Suma: USD 1O.00',
      'Gesamt',
      'Razem',
      'Toplam',
      'Tổng',
      'Sous-total',
      'Zwischensumme',
      'Ara toplam',
      'Tạm tính',
      '小計',
      '合計',
      '總計',
    ]) {
      test(
        'parking retains independent localized summary $layout/$summary',
        () {
          final preview = _parkingPreview(
            withLayout: layout,
            beforeSession: [summary],
          );
          expect(preview.total, isNull);
          expect(preview.warnings, isNotEmpty);
        },
      );
    }
    for (final merchant in [
      'TotalÉnergies Parking',
      'Total\u0301Energies Parking',
      'ÀTotalÉnergies Parking',
      'ＳTotalＥnergies Parking',
      'SubtotalÉquipement Parking',
      'Total_Commerce Parking',
    ]) {
      test(
        'parking English Unicode boundary is not a summary $layout/$merchant',
        () {
          expect(
            _parkingPreview(
              withLayout: layout,
              changes: {'merchant': merchant},
            ).total,
            '18.00',
          );
        },
      );
    }
    for (final summary in [
      'TOTALÉ',
      'TOTAL金額',
      'SUBTOTALÉ',
      'TotalÉ USD 1O.00',
      'TotalÉ USD 20.00',
    ]) {
      test(
        'adjacent English summary retains independent authority $layout/$summary',
        () {
          final preview = _parkingPreview(
            withLayout: layout,
            beforeSession: [summary],
          );
          // A recognized printed total stays authoritative; never replace20 with fee18.
          expect(preview.total, summary == 'TotalÉ USD 20.00' ? '20.00' : null);
          expect(preview.warnings, isNotEmpty);
        },
      );
    }
    test('parking merchant prefix is not a printed total $layout', () {
      expect(
        _parkingPreview(
          withLayout: layout,
          changes: {'merchant': 'TotalEnergies Parking'},
        ).total,
        '18.00',
      );
    });
    for (final identity in [
      'APPROVED AUTH: 1234',
      'APPROVED AUTHORIZATION CODE: A123',
      'APPROVED AUTH # 5678',
    ]) {
      test('parking requires masked payment $layout/$identity', () {
        expect(
          _parkingPreview(
            withLayout: layout,
            changes: {'payment': identity},
          ).total,
          isNull,
        );
      });
    }
    for (final identity in [
      'PAID WITH: Visa ****1234',
      'Mastercard ••••5678',
      'Card *1234',
    ]) {
      test('parking accepts bounded masked identity $layout/$identity', () {
        expect(
          _parkingPreview(
            withLayout: layout,
            changes: {'payment': identity},
          ).total,
          '18.00',
        );
      });
    }
  }
  for (var row = 1; row <= 8; row++) {
    test('parking rejects incidental whole field edge $row', () {
      expect(_parkingColumns(issue: 'whole-edge-$row').total, isNull);
    });
  }

  for (var row = 1; row <= 8; row++) {
    test('parking whole field displaced outside session $row', () {
      expect(_parkingColumns(issue: 'whole-displaced-$row').total, isNull);
    });
  }

  for (final issue in [
    'isolated',
    'extra',
    'misaligned',
    'crossed',
    'currency',
    'partial',
    'weak',
    'missing-points',
    'metadata-money',
    'wrong-column',
    'split-footer',
    'few-anchors',
    'edge-column',
  ]) {
    test('parking field association rejects $issue', () {
      expect(_parkingColumns(issue: issue).total, isNull);
    });
  }
  for (final scale in [0.5, 1.0, 3.0]) {
    for (final slope in [0.0, 0.02]) {
      test('parking corroborated columns remain valid $scale/$slope', () {
        final preview = _parkingColumns(scale: scale, slope: slope);
        expect(preview.total, '18.00');
        expect(preview.items.single.lineTotal, '18.00');
        expect(
          _parkingColumns(scale: scale, slope: slope, issue: 'whole-fee').total,
          '18.00',
        );
        expect(
          _parkingColumns(
            scale: scale,
            slope: slope,
            issue: 'split-identities',
          ).total,
          '18.00',
        );
      });
    }
  }

  for (final layout in [false, true]) {
    for (final fee in ['USD 18.00', r'$18.00']) {
      test(
        'closed parking session owns its sole printed fee total $layout/$fee',
        () {
          final preview = _parkingPreview(
            withLayout: layout,
            changes: {'fee': 'FEE: $fee'},
          );
          expect(preview.currency, 'USD');
          expect(preview.receiptDate, '2025-04-12');
          expect(preview.items.single.description, 'FEE:');
          expect(preview.items.single.lineTotal, '18.00');
          expect(preview.total, '18.00');
          expect(preview.adjustmentsComplete, isTrue);
          expect(preview.reviewHints, isEmpty);
          expect(
            preview.warnings,
            fee.startsWith('USD')
                ? isEmpty
                : [
                    'The receipt only shows a currency symbol. Using the current bill currency; review it before applying.',
                  ],
          );
        },
      );
    }
    for (final change in <Map<String, String>>[
      {'merchant': 'Corner Market'},
      {'date': 'DATE: 2025-02-30'},
      {'date': 'DATE: unknown'},
      {'date': 'DATE: 2025-04-12 USD 2.00'},
      {'in': 'TIME IN: 09:14 AM Gift'},
      {'in': 'TIME IN: 25:14'},
      {'in': 'TIME IN: 09:14 AM USD 2.00'},
      {'out': 'TIME OUT: 08:14 AM'},
      {'out': 'TIME OUT: 01:37 AM'},
      {'out': 'TIME OUT: 01:37 PM EUR 2.00'},
      {'duration': 'DURATION: 4:22:00'},
      {'duration': 'DURATION: 4:23:60'},
      {'duration': 'DURATION: 4:23:00 USD 2.00'},
      {'fee': 'FEE: USD 18.00 EUR'},
      {'fee': 'FEE: USD 18.00 USD 2.00'},
      {'fee': 'FEE: USD -18.00'},
      {'fee': 'FEE: USD 0.00'},
      {'fee': 'Fee Bouquet USD 18.00'},
      {'fee': 'Fee SKU123 USD 18.00'},
      {'payment': 'PAID WITH: Visa 9191'},
      {'payment': 'PAID WITH: Visa ••••• 9191 USD 2.00'},
      {'payment': 'PAID WITH: Cash Bouquet USD 18.00'},
      {'auth': 'AUTH: 774210 USD 2.00'},
      {'auth': 'AUTH: 774210 Gift'},
      {'footer': 'THANK YOU USD 2.00'},
    ]) {
      test(
        'uncertain parking session cannot promote fee to total $layout/$change',
        () {
          final preview = _parkingPreview(withLayout: layout, changes: change);
          expect(preview.total, isNull);
        },
      );
    }
    for (final missing in [
      'date',
      'in',
      'out',
      'duration',
      'fee',
      'payment',
      'auth',
    ]) {
      test(
        'incomplete parking role does not infer a total $layout/$missing',
        () {
          expect(
            _parkingPreview(withLayout: layout, missing: missing).total,
            isNull,
          );
        },
      );
    }
    for (final extra in [
      'Gift USD 2.00',
      'USD 2.00',
      'DATE: 2025-04-13',
      'Tax USD 2.00',
    ]) {
      test('additional parking evidence remains unowned $layout/$extra', () {
        expect(_parkingPreview(withLayout: layout, extra: extra).total, isNull);
      });
    }
    for (final extra in [
      'Gift USD 2.00',
      'USD 2.00',
      'DATE: 2025-04-13',
      'Tax USD 2.00',
      'TIME IN: 08:14 AM',
      'DURATION: 0:30:00',
      'PAID WITH: Visa ****1234',
      'AUTH: 123456',
    ]) {
      test(
        'competing header evidence rejects parking inference $layout/$extra',
        () {
          expect(
            _parkingPreview(withLayout: layout, beforeSession: [extra]).total,
            isNull,
          );
        },
      );
    }
    test(
      'unpriced header product stays reviewable in a closed parking session $layout',
      () {
        final preview = _parkingPreview(
          withLayout: layout,
          beforeSession: ['Gift'],
        );
        expect(preview.total, isNull);
        expect(preview.warnings, isNotEmpty);
        expect(preview.adjustmentsComplete, isFalse);
      },
    );
    for (final clocks in [
      {'in': 'TIME IN: 09:14', 'out': 'TIME OUT: 13:37'},
      {
        'in': 'TIME IN: 12:00 AM',
        'out': 'TIME OUT: 12:00 PM',
        'duration': 'DURATION: 12:00:00',
      },
      {
        'in': 'TIME IN: 12:00 PM',
        'out': 'TIME OUT: 12:05 PM',
        'duration': 'DURATION: 0:05:00',
      },
      {
        'in': 'TIME IN: 09:14:00',
        'out': 'TIME OUT: 13:37:25',
        'duration': 'DURATION: 4:23:25',
      },
    ]) {
      test(
        'closed parking clock interpretation agrees with duration $layout/$clocks',
        () {
          expect(
            _parkingPreview(withLayout: layout, changes: clocks).total,
            '18.00',
          );
        },
      );
    }
    test('closed parking amount is not tied to a corpus value $layout', () {
      final preview = _parkingPreview(
        withLayout: layout,
        changes: {'fee': 'FEE: USD 7.50'},
      );
      expect(preview.total, '7.50');
      expect(preview.items.single.lineTotal, '7.50');
    });
    test('independently printed total remains selected $layout', () {
      final preview = _parkingPreview(
        withLayout: layout,
        extra: 'Total USD 20.00',
      );
      expect(preview.total, '20.00');
      expect(preview.reviewHints, isNotEmpty);
    });
  }
  for (final issue in ['weak', 'overlap', 'inconsistent']) {
    test('parking ownership rejects uncertain supplied geometry $issue', () {
      expect(_parkingPreview(geometryIssue: issue).total, isNull);
    });
  }
  test(
    'a competing cell cannot acquire parking panel ownership from its row ID',
    () {
      expect(
        _parkingPreview(
          beforeSession: ['Gift'],
          geometryIssue: 'competing',
        ).total,
        isNull,
      );
    },
  );
  for (final scale in [0.5, 1.0, 3.0]) {
    test('positive skewed summary ownership remains complete at $scale', () {
      final blocks = skewedSummaryBlocks(scale: scale);
      final preview = parseSummaryBlocks(blocks);
      expect(preview.items.map((item) => item.lineTotal), ['3.50', '6.50']);
      expect(preview.subtotal, '10.00');
      expect(preview.total, '10.00');
      expect(preview.adjustmentsComplete, isTrue);
      expect(preview.reviewHints, isEmpty);
      expect(preview.unresolvedItemLikeCount, 0);
      expect(preview.blocks, same(blocks));
    });

    test('positive paired footer ownership remains complete at $scale', () {
      final blocks = courtesyReceipt(scale: scale, first: 'Thank you!');
      final preview = parseCourtesy(blocks);
      expect(preview.items.single.lineTotal, '4.00');
      expect(preview.total, '4.00');
      expect(preview.adjustmentsComplete, isTrue);
      expect(preview.reviewHints, isEmpty);
      expect(preview.unresolvedItemLikeCount, 0);
    });

    for (final left in [false, true]) {
      for (final position in ['beside', 'gap', 'above']) {
        test('neighbor money is not footer-owned $scale/$left/$position', () {
          final blocks = courtesyWithDetachedCell(
            left: left,
            scale: scale,
            text: 'USD 1.00',
            position: position,
          );
          final preview = parseCourtesy(blocks);
          expect(preview.adjustmentsComplete, isFalse);
          expect(preview.reviewHints, isNotEmpty);
          expect(preview.total, '4.00');
        });
      }
    }
  }

  for (final footer in ['Thank you', 'Thank you!']) {
    for (final payment in [
      'VISA ****4321',
      'VISA ****4321 USD 10.00',
      'Cash USD 10.00',
    ]) {
      for (final clock in [
        '18:43',
        'Date: 2026-09-17 18:43',
        'Time Out: 18:43',
        'Date: 2026-09-17 Due Date: 2026-09-18',
      ]) {
        test(
          'owned payment/clock precedes centered footer: $footer/$clock/$payment',
          () {
            final preview = _paymentPreview(
              footer: footer,
              clock: clock,
              payment: payment,
            );
            expect(preview.items.single.lineTotal, '10.00');
            expect(preview.subtotal, '10.00');
            expect(preview.total, '10.00');
            expect(preview.adjustmentsComplete, isTrue);
            expect(preview.reviewHints, isEmpty);
            expect(preview.unresolvedItemLikeCount, 0);
          },
        );
      }
    }
  }

  for (final payment in [
    'VISA ****4321',
    'VISA ****4321 USD 10.00',
    'Cash USD 10.00',
  ]) {
    test('bounded payment without clock remains complete: $payment', () {
      final preview = _paymentPreview(payment: payment, clock: null);
      expect(preview.adjustmentsComplete, isTrue);
      expect(preview.reviewHints, isEmpty);
    });
  }

  for (final extra in ['Gift', '+ Extra foam', 'Thank you USD 2.00']) {
    test('courtesy does not hide a product or modifier: $extra', () {
      final preview = _paymentPreview(extra: extra);
      expect(preview.total, '10.00');
      expect(preview.reviewHints, isNotEmpty);
    });
  }

  for (final clock in [
    'Time Out: 18:43 USD 2.00',
    'Time Out: 18:43 Gift',
    'Time Out: 25:99',
    'Date: 2026-09-17 18:43 USD 2.00',
    'Date: 2026-02-30 18:43',
    'Date: 2026-09-17 Gift',
    'Date: 2026-09-17 Due Date: 2026-09-18 USD 2.00',
    'Date: 2026-09-17 Due Date: 2026-09-18 Gift',
    'Date: 2026-09-17 Due Date: 2026-02-30',
  ]) {
    test('clock prefix cannot hide unowned evidence: $clock', () {
      final preview = _paymentPreview(clock: clock);
      expect(preview.reviewHints, isNotEmpty);
    });
  }

  test('labeled clock does not invent payment context', () {
    final preview = _paymentPreview(payment: null, clock: 'Time Out: 18:43');
    expect(preview.reviewHints, isNotEmpty);
  });

  test('foreign item currency retains the existing review policy', () {
    final preview = _paymentPreview(item: 'Tea EUR 10.00');
    expect(preview.items.single.currency, 'EUR');
    expect(preview.currency, 'USD');
    expect(preview.reviewHints, isNotEmpty);
  });

  test('duplicate adjustment evidence remains incomplete', () {
    final preview = const ReceiptOcrParser().parse(
      'Synthetic Market\nTea USD 10.00\nSubtotal USD 10.00\n'
      'Tax USD 1.00\nTax USD 1.00\nTotal USD 11.00',
    );
    expect(preview.adjustmentsComplete, isFalse);
    expect(
      preview.incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.repeatedAdjustmentRole),
    );
    expect(preview.reviewHints, isNotEmpty);
  });

  test('conflicting summary currency cannot acquire positive ownership', () {
    final blocks = skewedSummaryBlocks(subtotal: 'USD 10.00 EUR');
    final preview = parseSummaryBlocks(blocks);
    expect(preview.reviewHints, isNotEmpty);
  });

  for (final clock in [
    'Time Out: 18:43',
    'Date: 2026-09-17 18:43',
    'Date: 2026-09-17 Due Date: 2026-09-18',
  ]) {
    for (final suspect in [
      'Cash Bouquet USD 2.00',
      'Card Holder USD 2.00',
      'VISA Gift USD 2.00',
      'Cash paid bouquet',
      'Cash USD 10.00 Gift',
      'Cash USD 10.00 USD 2.00',
      'Cash USD 10.00 EUR',
      'Cash tendered Bouquet USD 2.00',
      'Card charged Holder USD 2.00',
      'Cash tendered USD 10.00 USD 2.00',
      'Card charged USD 10.00 EUR',
      'APPROVED AUTH # 293847 extra USD 2.00',
      'Payment card Bouquet USD 2.00',
      'Tender cash Gift USD 2.00',
      'Payment card amount currency charged USD 10.00',
      'Payment card USD 10.00 USD 2.00',
      'Payment card USD 10.00 EUR',
      'Approval: 123456 extra USD 2.00',
      'Auth: 123456 USD 2.00',
      'Authorization code 123456 Gift',
      'ApprovalBoard123456',
      'Approval: 1234567890123',
    ]) {
      final arrangements = <List<String>>[
        [suspect, clock],
        [suspect, 'Cash USD 10.00', clock],
        ['Cash USD 10.00', suspect, clock],
        ['Cash USD 10.00', clock, suspect],
        ['Cash USD 10.00', clock, suspect, 'VISA ****4321'],
      ];
      for (var order = 0; order < arrangements.length; order++) {
        test(
          'labeled metadata retains unbounded payment evidence $clock/$suspect/$order',
          () {
            final preview = _paymentPreview(postTotalRows: arrangements[order]);
            expect(preview.total, '10.00');
            expect(preview.reviewHints, isNotEmpty);
            expect(preview.adjustmentsComplete, isFalse);
          },
        );
      }
    }
    for (final payment in [
      'Cash USD 10.00',
      'Card USD 10.00',
      'Paid by Cash USD 10.00',
      'Payment Summary: USD 10.00',
      '現金 USD 10.00',
      'VISA ****4321',
      'Cash tendered USD 10.00',
      'Cash Tender USD 10.00',
      'Cash: paid USD 10.00',
      'Cash payment total USD 10.00',
      'Card charged USD 10.00',
      'APPROVED AUTH # 293847',
      'APPROVED AUTH#293847',
      'APPROVED AUTH:293847',
      'Approved Authorization # A29384',
      'Approved auth code 1234',
    ]) {
      test(
        'whole bounded payment retains labeled metadata $payment/$clock',
        () {
          final preview = _paymentPreview(postTotalRows: [payment, clock]);
          expect(preview.items.single.lineTotal, '10.00');
          expect(preview.total, '10.00');
          expect(preview.reviewHints, isEmpty);
          expect(preview.adjustmentsComplete, isTrue);
        },
      );
    }
    test('multiple bounded tenders retain labeled metadata $clock', () {
      final preview = _paymentPreview(
        postTotalRows: ['Cash USD 3.00', 'VISA ****4321 USD 7.00', clock],
      );
      expect(preview.reviewHints, isEmpty);
      expect(preview.adjustmentsComplete, isTrue);
    });
    test(
      'existing credit adjustment warning survives bounded context $clock',
      () {
        final preview = _paymentPreview(
          postTotalRows: ['Credit card USD 10.00', clock],
        );
        expect(preview.total, '10.00');
        expect(preview.reviewHints, isNotEmpty);
      },
    );
    for (final prefix in ['Payment', 'Tender']) {
      for (final qualifier in [
        'amount',
        'currency',
        'conversion',
        'reference',
        'rate',
        'charged',
        'cash',
        'card',
        'credit card',
        'debit card',
        'visa',
        'mastercard',
        'master card',
        'amex',
        'american express',
        'card charged',
        'currency amount',
        'card charged amount',
      ]) {
        test(
          'qualified metadata preserves legacy payment policy $prefix/$qualifier/$clock',
          () {
            final payment = '$prefix $qualifier USD 10.00';
            final baseline = _paymentPreview(postTotalRows: [payment]);
            final labeled = _paymentPreview(postTotalRows: [payment, clock]);
            expect(labeled.total, baseline.total);
            expect(
              labeled.items.map((item) => [item.description, item.lineTotal]),
              baseline.items.map((item) => [item.description, item.lineTotal]),
            );
            expect(labeled.reviewHints, baseline.reviewHints);
            expect(labeled.adjustmentsComplete, baseline.adjustmentsComplete);
          },
        );
      }
    }
    for (final label in ['Approval', 'Auth', 'Authorization']) {
      for (final separator in [' ', ': ', '#']) {
        final identifier = '$label${separator}123456';
        final sequences = <List<String>>[
          ['Cash USD 10.00', identifier, clock],
          [identifier, 'Cash USD 10.00', clock],
          ['Cash USD 10.00', clock, identifier],
        ];
        for (var order = 0; order < sequences.length; order++) {
          test('bounded approval is auxiliary $identifier/$clock/$order', () {
            final preview = _paymentPreview(postTotalRows: sequences[order]);
            expect(preview.reviewHints, isEmpty);
            expect(preview.adjustmentsComplete, isTrue);
            expect(preview.total, '10.00');
          });
        }
        test(
          'approval alone does not establish payment $identifier/$clock',
          () {
            final preview = _paymentPreview(postTotalRows: [identifier, clock]);
            expect(preview.reviewHints, isNotEmpty);
            expect(preview.adjustmentsComplete, isFalse);
          },
        );
      }
    }
    for (final code in ['1', 'A12345678901', 'AB-1234']) {
      test('bounded auxiliary identifier boundary $code/$clock', () {
        final preview = _paymentPreview(
          postTotalRows: ['Cash USD 10.00', 'Approval: $code', clock],
        );
        expect(preview.reviewHints, isEmpty);
        expect(preview.adjustmentsComplete, isTrue);
      });
    }
  }
}

ReceiptOcrPreview _parkingPreview({
  bool withLayout = true,
  Map<String, String> changes = const {},
  String? missing,
  String? extra,
  List<String> beforeSession = const [],
  String? geometryIssue,
}) {
  final fields = {
    'merchant': 'Harbor Parking',
    'date': 'DATE: 2025-04-12',
    'in': 'TIME IN: 09:14 AM',
    'out': 'TIME OUT: 01:37 PM',
    'duration': 'DURATION: 4:23:00',
    'fee': 'FEE: USD 18.00',
    'payment': 'PAID WITH: Visa ••••• 9191',
    'auth': 'AUTH: 774210',
    'footer': 'THANK YOU!',
    ...changes,
  };
  final rows = [
    for (final entry in fields.entries)
      if (entry.key != missing) ...[
        entry.value,
        if (entry.key == 'merchant') ...beforeSession,
      ],
    ?extra,
  ];
  final blocks = <ReceiptOcrBlockEvidence>[
    if (withLayout)
      for (var i = 0; i < rows.length; i++)
        summaryBlock(rows[i], i, 20, 20.0 + i * 55, 480, 30, slope: 0),
  ];
  if (geometryIssue != null && blocks.length > 5) {
    final target = geometryIssue == 'competing' ? 1 : 5;
    final original = blocks[target];
    blocks[target] = ReceiptOcrBlockEvidence(
      text: geometryIssue == 'inconsistent' ? 'Other USD 2.00' : original.text,
      row: original.row,
      order: original.order,
      confidence: geometryIssue == 'weak' ? 0.3 : original.confidence,
      points: geometryIssue == 'overlap'
          ? blocks[4].points
          : geometryIssue == 'competing'
          ? blocks[6].points
          : original.points,
    );
  }
  return const ReceiptOcrParser().parse(
    rows.join('\n'),
    blocks: blocks,
    fallbackCurrency: 'USD',
  );
}

ReceiptOcrPreview _paymentPreview({
  String footer = 'Thank you',
  String? clock = 'Date: 2026-09-17 18:43',
  String? payment = 'VISA ****4321',
  String item = 'Tea USD 10.00',
  String? extra,
  List<String>? postTotalRows,
}) {
  final rows = <String>[
    'Synthetic Market',
    'Date: 2026-09-17',
    item,
    'Subtotal USD 10.00',
    'Total USD 10.00',
    ...?postTotalRows,
    if (postTotalRows == null) ...[?payment, ?clock, ?extra],
    footer,
  ];
  final blocks = <ReceiptOcrBlockEvidence>[
    for (var i = 0; i < rows.length; i++)
      summaryBlock(
        rows[i],
        i,
        i == rows.length - 1 ? 170 : 20,
        20.0 + i * 55,
        i == rows.length - 1 ? 180 : 480,
        30,
        slope: 0,
      ),
  ];
  return const ReceiptOcrParser().parse(rows.join('\n'), blocks: blocks);
}

ReceiptOcrPreview _parkingColumns({
  String? issue,
  double scale = 1,
  double slope = 0,
}) {
  final fields = [
    ['Harbor Parking'],
    ['DATE:', '2025-04-12'],
    ['TIME IN:', '09:14 AM'],
    ['TIME OUT:', '01:37 PM'],
    ['DURATION:', '4:23:00'],
    ['FEE:', 'USD 18.00'],
    ['PAID WITH: Visa ••••• 9191'],
    ['AUTH: 774210'],
    ['THANK YOU!'],
  ];
  if (issue != null &&
      (issue.startsWith('whole-displaced-') ||
          issue.startsWith('whole-edge-'))) {
    for (var i = 1; i < fields.length; i++) {
      fields[i] = [fields[i].join(' ')];
    }
  }
  if (issue == 'whole-fee') fields[5] = [fields[5].join(' ')];
  if (issue == 'isolated') {
    for (var i = 1; i < 5; i++) {
      fields[i] = [fields[i].join(' ')];
    }
  }
  if (issue == 'partial') fields[5] = ['FEE: USD', '18.00'];
  if (issue == 'currency') fields[5] = ['FEE:', 'EUR 18.00 USD'];
  if (issue == 'metadata-money') fields[2].add('USD 2.00');
  if (issue == 'split-footer') fields[8] = ['THANK', 'YOU!'];
  if (issue == 'split-identities') {
    fields[6] = ['PAID WITH:', 'Visa ••••• 9191'];
    fields[7] = ['AUTH:', '774210'];
  }
  if (issue == 'few-anchors') {
    for (var i = 2; i < 5; i++) {
      fields[i] = [fields[i].join(' ')];
    }
  }
  if (issue == 'extra') fields[5].add('USD 2.00');
  final blocks = <ReceiptOcrBlockEvidence>[];
  for (var i = 0; i < fields.length; i++) {
    for (var j = 0; j < fields[i].length; j++) {
      var x = j == 0 ? 20.0 : 300.0;
      var y = 20.0 + i * 55;
      if (issue == 'whole-displaced-$i') x = 900;
      if (issue == 'whole-edge-$i') x = 499;
      if (i == 5 && j == 1 && issue == 'isolated') x = 900;
      if (i == 5 && j == 1 && issue == 'crossed') x = 10;
      if (i == 5 && j == 1 && issue == 'wrong-column') x = 900;
      if (i == 5 && j == 1 && issue == 'edge-column') x = 459;
      if (i == 5 && j == 1 && issue == 'misaligned') y += 25;
      final b = summaryBlock(
        fields[i][j],
        i,
        x,
        y,
        fields[i].length == 1 ? 480 : 160,
        30,
        scale: scale,
        slope: slope,
      );
      blocks.add(
        (issue == 'weak' || issue == 'missing-points') && i == 5 && j == 1
            ? ReceiptOcrBlockEvidence(
                text: b.text,
                row: b.row,
                order: b.order,
                confidence: 0.3,
                points: issue == 'missing-points'
                    ? b.points.take(3).toList()
                    : b.points,
              )
            : b,
      );
    }
  }
  return const ReceiptOcrParser().parse(
    fields.map((row) => row.join(' ')).join('\n'),
    blocks: blocks,
    fallbackCurrency: 'USD',
  );
}
