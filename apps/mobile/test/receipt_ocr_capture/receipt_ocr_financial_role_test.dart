import 'package:flutter/foundation.dart';
import 'package:mobile/receipt_ocr_capture/paddle_receipt_ocr_provider.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_provider.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';
import '../support/financial_role_receipt.dart';

void main() {
  for (final splitAxis in [false, true]) {
    for (final variant in [
      'valid',
      'money',
      'split money',
      'unsupported money',
      'bare decimal',
      'unknown word',
      'missing unit',
      'unordered months',
      'unordered ticks',
      'extra neighbor',
      'missing tick geometry parser',
      'missing tick geometry provider',
      'missing unrelated geometry parser',
      'missing unrelated geometry provider',
    ]) {
      test(
        'financial projection owns only a complete usage graph: $variant split=$splitAxis',
        () async {
          final blocks = <ReceiptOcrBlockEvidence>[];
          void cell(
            String text,
            int row,
            double left,
            double right, {
            double dy = 0,
          }) {
            blocks.add(
              ReceiptOcrBlockEvidence(
                text: text,
                row: row,
                order: blocks.length,
                confidence: 0.97,
                points:
                    (variant.startsWith('missing tick') && text == '800') ||
                        (variant.startsWith('missing unrelated') &&
                            text == 'USAGE SUMMARY')
                    ? const []
                    : [
                        ReceiptOcrPoint(x: left, y: row * 30.0 + dy),
                        ReceiptOcrPoint(x: right, y: row * 30.0 + dy),
                        ReceiptOcrPoint(x: right, y: row * 30.0 + dy + 20),
                        ReceiptOcrPoint(x: left, y: row * 30.0 + dy + 20),
                      ],
              ),
            );
          }

          cell('CURRENT CHARGES DETAIL', 0, 20, 400);
          cell('USAGE SUMMARY', 0, 740, 980);
          cell('Service', 1, 20, 150);
          cell('Usage', 1, 275, 335);
          cell('Rate', 1, 420, 475);
          cell('Amount', 1, 600, 665);
          cell(
            variant == 'missing unit' ? 'Electricity' : 'Electricity (kWh)',
            1,
            755,
            900,
          );
          if (splitAxis) cell('Water (1,000 gal)', 1, 920, 1047);
          cell('Electricity', 2, 20, 150);
          cell('62 kWh', 2, 275, 335);
          cell('USD 0.1580/kWh', 2, 420, 525);
          cell('USD 9.80', 2, 600, 665);
          cell('800', 2, 710, 750);
          cell('Water', 3, 20, 150);
          cell('900 gallons', 3, 275, 350);
          cell('USD 0.0055/gallon', 3, 420, 540);
          cell('USD 4.95', 3, 600, 665);
          cell(variant == 'unordered ticks' ? '900' : '600', 3, 710, 750);
          cell('Subtotal', 4, 20, 150);
          cell('USD 14.75', 4, 600, 665);
          cell(
            switch (variant) {
              'money' => 'USD 200',
              'unsupported money' => 'ZAR 200',
              'bare decimal' => '200.00',
              'unknown word' => 'Plan 200',
              _ => '200',
            },
            4,
            710,
            splitAxis ? 750 : 780,
          );
          if (variant == 'split money') cell('ZAR', 4, 785, 815);
          if (variant == 'extra neighbor') cell('Plan', 4, 690, 707);
          cell('City Utilities Tax (5%)', 5, 20, 260);
          cell('USD 0.74', 5, 600, 665);
          cell('0', 5, splitAxis ? 732 : 710, 750, dy: splitAxis ? -8 : 0);
          if (splitAxis) {
            final months = variant == 'unordered months'
                ? ['Oct', 'Dec', 'Nov', 'Jan', 'Feb']
                : ['Oct', 'Nov', 'Dec', 'Jan', 'Feb'];
            for (var i = 0; i < months.length; i++) {
              cell(months[i], 5, 780 + i * 60, 810 + i * 60);
              cell(
                i < 3 ? '2024' : '2025',
                6,
                778 + i * 60,
                813 + i * 60,
                dy: -12,
              );
            }
          } else {
            cell(
              variant == 'unordered months' ? 'Oct Dec Nov' : 'Oct Nov Dec',
              5,
              780,
              970,
            );
          }
          cell('Total Current Charges', 7, 20, 250);
          cell('USD 15.49', 7, 600, 665);
          final rows = <int, List<String>>{};
          for (final block in blocks) {
            (rows[block.row] ??= []).add(block.text);
          }
          ReceiptOcrPreview preview;
          if (variant.endsWith('provider')) {
            debugDefaultTargetPlatformOverride = TargetPlatform.android;
            addTearDown(() => debugDefaultTargetPlatformOverride = null);
            final result =
                await PaddleReceiptOcrProvider(
                  channel: _FinancialGraphChannel(blocks),
                ).extractReceipt(
                  ReceiptOcrRequest(
                    bytes: const [1],
                    contentType: 'image/jpeg',
                    fallbackCurrency: 'USD',
                  ),
                );
            expect(result.status, ReceiptOcrStatus.extracted);
            expect(result.failureCategory, isNull);
            preview = result.preview!;
            final missingText = variant.startsWith('missing tick')
                ? '800'
                : 'USAGE SUMMARY';
            expect(
              preview.blocks.singleWhere((b) => b.text == missingText).points,
              isEmpty,
            );
          } else {
            preview = const ReceiptOcrParser().parse(
              rows.values.map((parts) => parts.join(' ')).join('\n'),
              blocks: blocks,
              fallbackCurrency: 'USD',
            );
          }
          if (variant == 'valid') {
            expect(preview.subtotal, '14.75');
            expect(preview.tax, '0.74');
          } else {
            expect(preview.subtotal, isNull);
            expect(preview.adjustmentsComplete, isFalse);
          }
          if (variant.endsWith('provider')) {
            expect(
              preview.blocks.map((b) => b.text),
              blocks.map((b) => b.text),
            );
          } else {
            expect(preview.blocks, blocks);
          }
        },
      );
    }
  }

  for (final mirrored in [false, true]) {
    for (final period in [
      'Feb 5 - Mar 4, 2025',
      '2025-02-05 - 2025-03-04',
      '05.02.2025 - 04.03.2025',
    ]) {
      for (final evidence in ['reference', 'outside money', 'calendar money']) {
        test(
          'calendar ownership keeps extra evidence: $period $evidence mirrored=$mirrored',
          () {
            final source = financialRoleReceipt(
              'Discounts',
              labelBlocks: ['Discounts'],
              total: 'USD 18.00',
              amountOnLeft: mirrored,
              servicePeriod: evidence == 'calendar money'
                  ? '$period USD 7.00'
                  : period,
              rowNote: evidence == 'outside money' ? '7.00' : 'Ref 7',
            );
            final preview = const ReceiptOcrParser().parse(
              source.text,
              blocks: source.blocks,
            );
            if (evidence == 'reference') {
              expect(preview.discount, '2.00');
              if (period.startsWith('2025-')) {
                // Existing ISO-period item recovery is independently ambiguous;
                // calendar ownership adds no financial-role ambiguity.
                expect(
                  preview.incompleteAdjustmentReasons.map(
                    (reason) => reason.name,
                  ),
                  everyElement('ambiguousChargeTable'),
                );
              } else {
                expect(preview.adjustmentsComplete, isTrue);
                expect(preview.reviewHints, isEmpty);
              }
            } else {
              expect(preview.adjustmentsComplete, isFalse);
              expect(preview.reviewHints, isNotEmpty);
            }
            expect(preview.blocks, source.blocks);
          },
        );
      }
    }
  }

  for (final period in [false, true]) {
    for (final role in ['Discount', 'Coupons', 'Rebates']) {
      for (final label in [
        '$role (Ref USD-7)',
        '$role (Ref ＵＳＤ-７)',
        'First Purchase $role (10%)',
        'First Purchase $role (１０％)',
        'First Year $role (12 months)',
        'First Year $role (１２ months)',
      ]) {
        test(
          'qualified financial label stays complete: $label period=$period',
          () {
            final source = financialRoleReceipt(
              label,
              labelBlocks: [label],
              total: 'USD 18.00',
              servicePeriod: period ? 'Feb 5 - Mar 4, 2025' : null,
            );
            final preview = const ReceiptOcrParser().parse(
              source.text,
              blocks: source.blocks,
            );
            expect(preview.items.single.description, "Resident's Water Plan");
            expect(preview.discount, '2.00');
            expect(preview.adjustmentsComplete, isTrue);
            expect(preview.reviewHints, isEmpty);
            expect(preview.blocks, source.blocks);
          },
        );
      }
    }
    for (final mirrored in [false, true]) {
      for (final fragmented in [false, true]) {
        for (final note in [
          'Ref USD-7',
          'Ref ＵＳＤ-７',
          'Ref ZAR-7',
          'USD 7.00',
          'ＵＳＤ ７．００',
          'ZAR 7.00',
          '７．００ ＺＡＲ',
          '７．００-ＺＡＲ',
          '7.00',
          '７．００',
          '7',
        ]) {
          test(
            'secondary evidence respects known qualifier: $note period=$period fragmented=$fragmented mirrored=$mirrored',
            () {
              final source = financialRoleReceipt(
                'Discounts',
                labelBlocks: ['Discounts'],
                total: 'USD 18.00',
                servicePeriod: period ? 'Feb 5 - Mar 4, 2025' : null,
                rowNote: note,
                rowNoteBlocks: fragmented ? note.split(' ') : null,
                amountOnLeft: mirrored,
              );
              final preview = const ReceiptOcrParser().parse(
                source.text,
                blocks: source.blocks,
              );
              if (note.startsWith('Ref')) {
                expect(preview.discount, '2.00');
                expect(preview.adjustmentsComplete, isTrue);
                expect(preview.reviewHints, isEmpty);
              } else {
                expect(preview.adjustmentsComplete, isFalse);
                expect(preview.reviewHints, isNotEmpty);
              }
              expect(preview.blocks, source.blocks);
            },
          );
        }
      }
    }
  }

  for (final role in ['Taxes', 'Service Charge', 'Service Fees', 'Discounts']) {
    for (final left in [266.0, 270.0, 279.0, 280.0]) {
      test('period-boundary keeps owned $role at $left', () {
        final source = financialRoleReceipt(
          role == 'Discounts' ? role : '$role 10%',
          labelBlocks: role == 'Discounts' ? [role] : [role, '10%'],
          total: role == 'Discounts' ? 'USD 18.00' : 'USD 22.00',
          servicePeriod: 'Feb 5 - Mar 4, 2025',
          servicePeriodBounds: (left: left, right: 430),
        );
        final preview = const ReceiptOcrParser().parse(
          source.text,
          blocks: source.blocks,
        );
        expect(preview.items.single.description, "Resident's Water Plan");
        expect(
          role == 'Taxes'
              ? preview.tax
              : role == 'Discounts'
              ? preview.discount
              : preview.service,
          '2.00',
        );
        expect(preview.adjustmentsComplete, isTrue);
        expect(preview.reviewHints, isEmpty);
        expect(preview.blocks, source.blocks);
      });
    }
  }

  for (final period in [false, true]) {
    for (final role in ['Discounts', 'Coupons', 'Rebates']) {
      for (final number in [
        '７.００',
        '٧.٠٠',
        '۷.۰۰',
        '७.००',
        '๗.๐๐',
        'USD7.00',
        'ＵＳＤ７．００',
        'ＺＡＲ７．００',
        'USD٧.٠٠',
        '７．００ＺＡＲ',
        '７．００ＵＳＤ',
        'ＵＳＤ７．００ max',
        'ＺＡＲ７．００ max',
        '７．００ＺＡＲ max',
        'USD7.00 per month',
        '7.00USD yearly',
        'USD7.00maximum',
        '7.00-USD',
        '７．００-ＵＳＤ',
        '７．００−ＵＳＤ',
        '７．００–ＵＳＤ',
        '７．００＋ＵＳＤ',
        '７．００-ＺＡＲ',
        'ＵＳＤ–７．００',
        'ＺＡＲ−７．００',
      ]) {
        test(
          'unicode-or-split numeric qualifier: $role $number period=$period',
          () {
            final source = financialRoleReceipt(
              '$role ($number)',
              labelBlocks: [role, '($number)'],
              total: 'USD 18.00',
              servicePeriod: period ? 'Feb 5 - Mar 4, 2025' : null,
            );
            final preview = const ReceiptOcrParser().parse(
              source.text,
              blocks: source.blocks,
            );
            expect(preview.items.single.description, "Resident's Water Plan");
            expect(preview.adjustmentsComplete, isFalse);
            expect(preview.reviewHints, isNotEmpty);
            expect(preview.blocks, source.blocks);
          },
        );
      }
    }
    for (final role in ['Taxes', 'Service Charge', 'Service Fees']) {
      for (final rate in [
        ['10', '%'],
        ['(', '10', '%', ')'],
        ['10.5', '%'],
        ['(', '10.5', '%', ')'],
        ['１０', '％'],
      ]) {
        test('unicode-or-split marked rate: $role $rate period=$period', () {
          final source = financialRoleReceipt(
            '$role ${rate.join(' ')}',
            labelBlocks: [role, ...rate],
            servicePeriod: period ? 'Feb 5 - Mar 4, 2025' : null,
          );
          final preview = const ReceiptOcrParser().parse(
            source.text,
            blocks: source.blocks,
          );
          expect(preview.items.single.description, "Resident's Water Plan");
          expect(role == 'Taxes' ? preview.tax : preview.service, '2.00');
          expect(preview.discount, isNull);
          expect(preview.adjustmentsComplete, isTrue);
          expect(preview.reviewHints, isEmpty);
          expect(preview.blocks, source.blocks);
        });
      }
    }
  }

  for (final period in [false, true]) {
    for (final role in ['Discounts', 'Coupons', 'Rebates']) {
      for (final fragments in [
        [role, '(7.00)'],
        ['7.00', role],
        [role, '(7)'],
      ]) {
        test(
          'role-number evidence remains unresolved: $fragments period=$period',
          () {
            final source = financialRoleReceipt(
              fragments.join(' '),
              labelBlocks: fragments,
              total: 'USD 18.00',
              servicePeriod: period ? 'Feb 5 - Mar 4, 2025' : null,
            );
            final preview = const ReceiptOcrParser().parse(
              source.text,
              blocks: source.blocks,
            );
            expect(preview.items.single.description, "Resident's Water Plan");
            expect(preview.adjustmentsComplete, isFalse);
            expect(preview.reviewHints, isNotEmpty);
            expect(preview.blocks, source.blocks);
          },
        );
      }
      for (final qualifier in [
        '(10%)',
        '(PROMO7)',
        '(Ref 7)',
        '(12 months)',
        '(Ref USD7)',
        '(Ref ZAR7)',
        '(Ref ＵＳＤ７)',
      ]) {
        test(
          'role-number known qualifier stays complete: $role $qualifier period=$period',
          () {
            final source = financialRoleReceipt(
              '$role $qualifier',
              labelBlocks: [role, qualifier],
              total: 'USD 18.00',
              servicePeriod: period ? 'Feb 5 - Mar 4, 2025' : null,
            );
            final preview = const ReceiptOcrParser().parse(
              source.text,
              blocks: source.blocks,
            );
            expect(preview.items.single.description, "Resident's Water Plan");
            expect(preview.discount, '2.00');
            expect(preview.adjustmentsComplete, isTrue);
            expect(preview.reviewHints, isEmpty);
            expect(preview.blocks, source.blocks);
          },
        );
      }
    }
    for (final role in ['Service Charge', 'Service Fees']) {
      for (final rate in ['10%', '(10%)', '10.5%', '(10.5%)']) {
        test(
          'role-number service rate stays complete: $role $rate period=$period',
          () {
            final source = financialRoleReceipt(
              '$role $rate',
              labelBlocks: [role, rate],
              servicePeriod: period ? 'Feb 5 - Mar 4, 2025' : null,
            );
            final preview = const ReceiptOcrParser().parse(
              source.text,
              blocks: source.blocks,
            );
            expect(preview.items.single.description, "Resident's Water Plan");
            expect(preview.service, '2.00');
            expect(preview.discount, isNull);
            expect(preview.adjustmentsComplete, isTrue);
            expect(preview.reviewHints, isEmpty);
            expect(preview.blocks, source.blocks);
          },
        );
      }
    }
  }
  for (final amountOnLeft in [false, true]) {
    for (final fragments in [
      ['Taxes', 'Advisory Plan'],
      ['Discounts', 'Book'],
    ]) {
      test(
        'complete column retains gap product: $fragments left=$amountOnLeft',
        () {
          final source = financialRoleReceipt(
            fragments.join(' '),
            labelBlocks: fragments,
            labelBounds: [(left: 20, right: 160), (left: 330, right: 380)],
            amountOnLeft: amountOnLeft,
          );
          final preview = const ReceiptOcrParser().parse(
            source.text,
            blocks: source.blocks,
          );
          expect(
            preview.items.map((item) => (item.description, item.lineTotal)),
            [("Resident's Water Plan", '20.00'), (fragments.join(' '), '2.00')],
          );
          expect(preview.tax, isNull);
          expect(preview.discount, isNull);
          expect(preview.adjustmentsComplete, isTrue);
          expect(preview.reviewHints, isEmpty);
          expect(preview.blocks, source.blocks);
        },
      );
    }
  }
  for (final period in [false, true]) {
    for (final fragments in [
      ['Taxes', '7'],
      ['Taxes', '7.00'],
      ['Tax.', '7'],
    ]) {
      test(
        'complete column preserves unresolved number: $fragments period=$period',
        () {
          final source = financialRoleReceipt(
            fragments.join(' '),
            labelBlocks: fragments,
            servicePeriod: period ? 'Feb 5 - Mar 4, 2025' : null,
          );
          final preview = const ReceiptOcrParser().parse(
            source.text,
            blocks: source.blocks,
          );
          expect(preview.items.single.description, "Resident's Water Plan");
          expect(preview.tax, isNull);
          expect(preview.adjustmentsComplete, isFalse);
          expect(preview.reviewHints, isNotEmpty);
          expect(preview.blocks, source.blocks);
        },
      );
    }
    for (final rate in ['7%', '(7%)']) {
      test(
        'complete column retains known split percentage: $rate period=$period',
        () {
          final source = financialRoleReceipt(
            'Taxes $rate',
            labelBlocks: ['Taxes', rate],
            servicePeriod: period ? 'Feb 5 - Mar 4, 2025' : null,
          );
          final preview = const ReceiptOcrParser().parse(
            source.text,
            blocks: source.blocks,
          );
          expect(preview.items.single.description, "Resident's Water Plan");
          expect(preview.tax, '2.00');
          expect(preview.adjustmentsComplete, isTrue);
          expect(preview.reviewHints, isEmpty);
          expect(preview.blocks, source.blocks);
        },
      );
    }
  }
  for (final period in [false, true]) {
    for (final fragments
        in period
            ? [
                ['Taxes', 'Advisory Plan'],
                ['Tax', 'Advisory Plan'],
                ['Discounts', 'Plan'],
                ['Coupons', 'Plan'],
              ]
            : [
                ['Taxes', 'Advisory Plan'],
                ['Taxes', 'Return Kit'],
                ['Discounts', 'Book'],
                ['Coupons', 'Guide'],
                ['Rebates', 'Software'],
                ['Tax', 'Advisory Plan'],
              ]) {
      for (final fragmented in [false, true]) {
        test(
          'fragmented named product keeps whole description: $fragments period=$period fragmented=$fragmented',
          () {
            final source = financialRoleReceipt(
              fragments.join(' '),
              labelBlocks: fragmented ? fragments : null,
              servicePeriod: period ? 'Feb 5 - Mar 4, 2025' : null,
            );
            final preview = const ReceiptOcrParser().parse(
              source.text,
              blocks: source.blocks,
            );
            expect(
              preview.items.map((item) => (item.description, item.lineTotal)),
              [
                ("Resident's Water Plan", '20.00'),
                (fragments.join(' '), '2.00'),
              ],
            );
            expect(preview.tax, isNull);
            expect(preview.discount, isNull);
            expect(preview.service, isNull);
            expect(preview.adjustmentsComplete, isTrue);
            expect(preview.reviewHints, isEmpty);
            expect(preview.blocks, source.blocks);
          },
        );
      }
    }
  }
  for (final fragments in [
    ['Taxes', 'Miscellaneous'],
    ['Discounts', 'Miscellaneous'],
  ]) {
    test(
      'fragmented unknown financial suffix stays unresolved: $fragments',
      () {
        final source = financialRoleReceipt(
          fragments.join(' '),
          labelBlocks: fragments,
        );
        final preview = const ReceiptOcrParser().parse(
          source.text,
          blocks: source.blocks,
        );
        expect(preview.items.single.description, "Resident's Water Plan");
        expect(preview.tax, isNull);
        expect(preview.discount, isNull);
        expect(preview.adjustmentsComplete, isFalse);
        expect(preview.reviewHints, isNotEmpty);
      },
    );
  }
  for (final fragments in [
    ['State', 'Taxes'],
    ['Service', 'Charges'],
  ]) {
    test('fragmented complete header retains whole role: $fragments', () {
      final source = financialRoleReceipt(
        fragments.join(' '),
        labelBlocks: fragments,
      );
      final preview = const ReceiptOcrParser().parse(
        source.text,
        blocks: source.blocks,
      );
      expect(preview.items.single.description, "Resident's Water Plan");
      expect(preview.tax, fragments.first == 'State' ? '2.00' : null);
      expect(preview.service, fragments.first == 'Service' ? '2.00' : null);
      expect(preview.adjustmentsComplete, isTrue);
      expect(preview.reviewHints, isEmpty);
    });
  }
  for (final item in [
    'Taxes Plan',
    'Discounts Plan',
    'Coupons Plan',
    'Water Services',
  ]) {
    test('bounded period columns retain one named plural role: $item', () {
      final source = financialRoleReceipt(
        'Tax.',
        item: item,
        servicePeriod: 'Feb 5 - Mar 4, 2025',
      );
      final preview = const ReceiptOcrParser().parse(
        source.text,
        blocks: source.blocks,
      );
      expect(preview.items.single.description, item);
      expect(preview.tax, '2.00');
      expect(preview.adjustmentsComplete, isTrue);
      expect(preview.reviewHints, isEmpty);
    });
  }
  for (final mode in ['none', 'merged', 'split']) {
    for (final label in [
      'Tax',
      'Tax:',
      'Tax.',
      'Taxes',
      'Taxes:',
      'Taxes.',
      'Service Charge',
      'Service Charge.',
      'Service Charges',
      'Service Fees.',
      'Tips',
      'Tips.',
      'Shipping Fee',
      'Shipping Charges',
      'Shipping and Handling Fees',
      'Delivery Fee',
      'Delivery Charges',
    ]) {
      test(
        '$mode maps complete $label to header money, retaining item punctuation',
        () {
          final source = financialRoleReceipt(label, mode: mode);
          final preview = const ReceiptOcrParser().parse(
            source.text,
            blocks: source.blocks,
          );
          expect(preview.items.map((i) => (i.description, i.lineTotal)), [
            ("Resident's Water Plan", '20.00'),
          ]);
          expect(preview.tax, label.startsWith('Tax') ? '2.00' : null);
          expect(preview.service, label.startsWith('Service') ? '2.00' : null);
          expect(preview.tip, label.startsWith('Tip') ? '2.00' : null);
          expect(
            preview.shipping,
            label.startsWith('Shipping') || label.startsWith('Delivery')
                ? '2.00'
                : null,
          );
          expect(preview.adjustmentsComplete, isTrue);
          expect(preview.reviewHints, isEmpty);
          expect(preview.blocks, source.blocks);
        },
      );
    }
    for (final label in [
      'Service Fee and Tax',
      'Tax and Service Charge',
      'Tax / Service Fee',
      'Service Charge (Tax)',
      'Tax 5% and Service Fee',
      'Service Charge (5% Tax)',
      'Service Charge Plan',
      'Monthly Service Fee',
      'Taxes and Fees',
      'Discounts and Tips',
      'Shipping Fee and Tax',
      'Environmental Levy',
      'Regulatory Fee',
      'Charges',
      'Fees',
      'Surcharges',
      'Refunds',
      'Credits',
      'Deposits',
      'Levies',
      'Duties',
      'Donations',
    ]) {
      test('$mode keeps compound $label unresolved', () {
        final source = financialRoleReceipt(label, mode: mode);
        final preview = const ReceiptOcrParser().parse(
          source.text,
          blocks: source.blocks,
        );
        expect(preview.items.map((i) => i.description), [
          "Resident's Water Plan",
        ]);
        expect(preview.tax, isNull);
        expect(preview.service, isNull);
        expect(preview.adjustmentsComplete, isFalse);
        expect(preview.reviewHints, isNotEmpty);
        expect(preview.blocks, source.blocks);
      });
    }
    test('$mode retains period in an ordinary product name', () {
      final source = financialRoleReceipt(
        'Tax.',
        mode: mode,
        item: 'Resident Water Co.',
      );
      final preview = const ReceiptOcrParser().parse(
        source.text,
        blocks: source.blocks,
      );
      expect(preview.items.single.description, 'Resident Water Co.');
      expect(preview.tax, '2.00');
    });
  }
  for (final mode in ['none', 'merged', 'split']) {
    test('$mode keeps suggested plural tips out of header money', () {
      final source = financialRoleReceipt(
        'Suggested Tips',
        mode: mode,
        total: 'USD 20.00',
      );
      final preview = const ReceiptOcrParser().parse(
        source.text,
        blocks: source.blocks,
      );
      expect(preview.items.single.description, "Resident's Water Plan");
      expect(preview.tip, isNull);
      expect(preview.adjustmentsComplete, isTrue);
      expect(preview.reviewHints, isEmpty);
    });
    for (final label in [
      'Discounts',
      'Discounts.',
      'Coupons',
      'Coupons.',
      'Rebates',
      'Rebates.',
    ]) {
      test('$mode retains plural $label as a discount', () {
        final source = financialRoleReceipt(
          label,
          mode: mode,
          total: 'USD 18.00',
        );
        final preview = const ReceiptOcrParser().parse(
          source.text,
          blocks: source.blocks,
        );
        expect(preview.items.single.description, "Resident's Water Plan");
        expect(preview.discount, '2.00');
        expect(preview.adjustmentsComplete, isTrue);
        expect(preview.reviewHints, isEmpty);
        expect(preview.blocks, source.blocks);
      });
    }
  }
  for (final labels in [
    ['Tax.', 'and Service Fee'],
    ['Service Charge.', 'and Tax'],
    ['Tax.', 'and', 'Service', 'Fee'],
    ['Taxes.', 'and Fees'],
  ]) {
    test('fragmented financial labels retain all roles: $labels', () {
      final source = financialRoleReceipt(
        labels.join(' '),
        labelBlocks: labels,
      );
      final preview = const ReceiptOcrParser().parse(
        source.text,
        blocks: source.blocks,
      );
      expect(preview.items.map((i) => (i.description, i.lineTotal)), [
        ("Resident's Water Plan", '20.00'),
      ]);
      expect(preview.tax, isNull);
      expect(preview.service, isNull);
      expect(preview.adjustmentsComplete, isFalse);
      expect(preview.reviewHints, isNotEmpty);
      expect(preview.rawTextLineCount, source.text.split('\n').length);
      expect(preview.blocks, source.blocks);
    });
  }
  for (final item in [
    'Tax Advisory Plan',
    'Tax Return Kit',
    'Taxes Advisory Plan',
    'Taxes Return Kit',
    'Tips Guide',
    'Discounts Book',
    'Energy Charges',
    'Water Services',
    'Payment Processing Subscription',
    'Water Service',
    'Energy Charge',
  ]) {
    for (final mode in ['none', 'merged', 'split']) {
      test('$mode retains named product $item', () {
        final source = financialRoleReceipt('Tax.', mode: mode, item: item);
        final preview = const ReceiptOcrParser().parse(
          source.text,
          blocks: source.blocks,
        );
        expect(preview.items.single.description, item);
        expect(preview.tax, '2.00');
        expect(preview.reviewHints, isEmpty);
      });
    }
  }
  for (final mode in ['none', 'merged', 'split']) {
    for (final label in ['Tax.', 'Taxes.']) {
      for (final amount in ['USD 1.00 USD 2.00', '2.00%', '- USD 2.00']) {
        test(
          '$mode does not promote competing/rate/signed $label amount $amount',
          () {
            final source = financialRoleReceipt(
              label,
              mode: mode,
              amount: amount,
            );
            final preview = const ReceiptOcrParser().parse(
              source.text,
              blocks: source.blocks,
            );
            expect(preview.items.map((i) => i.description), [
              "Resident's Water Plan",
            ]);
            expect(preview.adjustmentsComplete, isFalse);
            expect(preview.reviewHints, isNotEmpty);
          },
        );
      }
    }
  }
  for (final row in [
    'Water Plan 03/04/2025',
    'Water Plan 0.10',
    'Water Plan USD 0.10',
    'Water Plan 5%',
    'Water Plan -',
  ]) {
    test('text column ambiguity stays unresolved: $row', () {
      final source = financialRoleReceipt('Tax.', mode: 'none', item: row);
      final preview = const ReceiptOcrParser().parse(source.text);
      expect(preview.items, isEmpty);
      expect(preview.adjustmentsComplete, isFalse);
      expect(preview.reviewHints, isNotEmpty);
    });
  }
  for (final columns in [
    ['Description', 'Rate', 'Amount'],
    ['Description', 'Date', 'Amount'],
    ['Description', 'Quantity', 'Amount'],
  ]) {
    test('missing final amount in ${columns.join(' ')} needs geometry', () {
      final source = financialRoleReceipt(
        'Tax.',
        mode: 'none',
        columns: columns,
      );
      final preview = const ReceiptOcrParser().parse(source.text);
      expect(preview.items, isEmpty);
      expect(preview.adjustmentsComplete, isFalse);
    });
  }
}

class _FinancialGraphChannel implements PaddleReceiptOcrChannel {
  _FinancialGraphChannel(this.blocks);
  final List<ReceiptOcrBlockEvidence> blocks;
  @override
  Future<Map<Object?, Object?>?> recognize(Uint8List imageBytes) async => {
    'blocks': blocks
        .map(
          (b) => <Object?, Object?>{
            'text': b.text,
            'row': b.row,
            'order': b.order,
            'confidence': b.confidence,
            'points': b.points.map((p) => {'x': p.x, 'y': p.y}).toList(),
          },
        )
        .toList(),
  };
}
