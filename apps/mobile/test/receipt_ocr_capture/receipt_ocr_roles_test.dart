import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrBlockEvidence cell(
  String text,
  int row,
  double x,
  double y,
  double width,
  double height,
) => ReceiptOcrBlockEvidence(
  text: text,
  row: row,
  order: row * 10 + x.round(),
  points: [
    ReceiptOcrPoint(x: x, y: y),
    ReceiptOcrPoint(x: x + width, y: y),
    ReceiptOcrPoint(x: x + width, y: y + height),
    ReceiptOcrPoint(x: x, y: y + height),
  ],
);

ReceiptOcrPreview parseBlocks(List<ReceiptOcrBlockEvidence> blocks) {
  final rows = <int, List<String>>{};
  for (final block in blocks) {
    (rows[block.row] ??= []).add(block.text);
  }
  return const ReceiptOcrParser().parse(
    rows.values.map((row) => row.join(' ')).join('\n'),
    fallbackCurrency: 'USD',
    blocks: blocks,
  );
}

void main() {
  group('critical review receipt role regressions', () {
    for (final qualifier in ['Previous:', 'Prior —', 'Last (', 'Refund /']) {
      test('historical punctuation $qualifier cannot own the receipt date', () {
        final p = const ReceiptOcrParser().parse(
          'Example Utility\nBill Date: 2026-09-17\n'
          '$qualifier Receipt Date: 2026-09-10\n'
          'Plan USD 18.00\nTotal USD 18.00',
        );
        expect(p.receiptDate, '2026-09-17');
      });
    }
    for (final stay in [
      'Stay: 2026-09-15 to 2026-09-17',
      'Stay:\n2026-09-15 to 2026-09-17',
      'Check-in: 2026-09-15\nCheck-out: 2026-09-17',
    ]) {
      test('stay-only dates are unavailable for Apply: $stay', () {
        final p = const ReceiptOcrParser().parse(
          'Example Hotel\n$stay\nRoom USD 180.00\nTotal USD 180.00',
        );
        expect(p.receiptDate, isNull);
        expect(p.warnings, contains(contains('Stay dates')));
        expect(p.items.single.lineTotal, '180.00');
      });
      test('an explicit transaction date remains available beside $stay', () {
        final p = const ReceiptOcrParser().parse(
          'Example Hotel\n$stay Receipt Date: 2026-09-18\n'
          'Room USD 180.00\nTotal USD 180.00',
        );
        expect(p.receiptDate, '2026-09-18');
        expect(p.warnings, isNot(contains(contains('Stay dates'))));
      });
    }
    for (final heading in ['Buyer:', 'Buyer', 'Buyer：']) {
      test('issuer prominence does not cross $heading', () {
        final blocks = [
          cell('Supplier Tools Ltd', 0, 20, 10, 300, 20),
          cell(heading, 1, 20, 50, 100, 20),
          cell('Recipient Market', 2, 20, 90, 350, 48),
          cell('123 Sample Road', 3, 20, 155, 220, 20),
          cell('Widget USD 10.00', 4, 20, 195, 300, 20),
          cell('Total USD 10.00', 5, 20, 235, 300, 20),
        ];
        final p = parseBlocks(blocks);
        expect(p.merchant, 'Supplier Tools Ltd');
        expect(p.blocks, orderedEquals(blocks));
        expect(p.items.single.lineTotal, '10.00');
      });
    }
  });
  group('standalone support hours ownership', () {
    List<ReceiptOcrBlockEvidence> panel({
      String hours = 'Sat - Sun, 9 AM - 5 PM PT',
      String heading = 'Need Help?',
      String phone = '1-800-555-0100',
      double hoursX = 820,
      bool overlap = false,
      bool sameRowMoney = false,
      bool missingGeometry = false,
      double scale = 1,
    }) {
      final blocks = [
        cell('Example Utility', 0, 20, 10, 300, 20),
        cell('Current Charges Detail', 1, 20, 60, 300, 20),
        cell(heading, 1, 780, 60, 180, 20),
        cell('Description', 2, 20, 100, 150, 20),
        cell('Service Period', 2, 350, 100, 150, 20),
        cell('Amount', 2, 650, 100, 70, 20),
        cell(phone, 2, 820, 100, 140, 20),
        cell('Internet Plan', 3, 20, 140, 220, 20),
        cell('Sep 1 - Sep 30, 2026', 3, 350, 140, 220, 20),
        cell('USD 10.00', 3, 650, 140, 70, 20),
        if (missingGeometry)
          ReceiptOcrBlockEvidence(text: hours, order: 40, row: 4)
        else
          cell(hours, 4, hoursX, 165, 220, 20),
        if (sameRowMoney) cell('USD -3.00', 4, 550, 165, 100, 20),
        cell('Regional Surcharge', 5, 20, 200, 260, 20),
        cell('USD 2.00', 5, 650, 200, 70, 20),
        if (overlap) cell('USD -3.00', 5, 840, 175, 100, 20),
        cell('Total Current Charges USD 12.00', 6, 20, 240, 700, 20),
      ];
      return blocks
          .map(
            (b) => ReceiptOcrBlockEvidence(
              text: b.text,
              row: b.row,
              order: b.order,
              points: b.points
                  .map((p) => ReceiptOcrPoint(x: p.x * scale, y: p.y * scale))
                  .toList(),
            ),
          )
          .toList();
    }

    for (final scale in [0.5, 1.0, 2.0]) {
      test(
        'complete bounded hours at scale $scale preserve unsupported fee review',
        () {
          final blocks = panel(scale: scale);
          final p = parseBlocks(blocks);
          expect(
            p.incompleteAdjustmentReasons,
            isNot(
              contains(ReceiptOcrIncompleteAdjustmentReason.detachedAmountSign),
            ),
          );
          expect(
            p.itemLineDecisions[4],
            ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
          );
          expect(p.items.single.lineTotal, '10.00');
          expect(p.total, '12.00');
          expect(p.adjustmentsComplete, isFalse);
          expect(p.reviewHints, isNotEmpty);
          expect(p.blocks, orderedEquals(blocks));
        },
      );
    }
    final exclusions = <String, List<ReceiptOcrBlockEvidence>>{
      'no help heading': panel(heading: 'Special Offers'),
      'no phone': panel(phone: 'Monthly plan'),
      'hours in charge column': panel(hoursX: 30),
      'overlapping money from another row': panel(overlap: true),
      'same row money': panel(sameRowMoney: true),
      'missing geometry': panel(missingGeometry: true),
      'fee appended to hours': panel(
        hours: 'Sat - Sun, 9 AM - 5 PM PT USD 3.00',
      ),
      'credit appended to hours': panel(hours: 'Sat - Sun, 9 AM - 5 PM PT (-)'),
      'unreadable end time': panel(hours: 'Sat - Sun, 9 AM - ? PM PT'),
      'unrecognized currency-like suffix': panel(
        hours: 'Sat - Sun, 9 AM - 5 PM HK',
      ),
    };
    for (final entry in exclusions.entries) {
      test('${entry.key} retains unresolved evidence', () {
        final p = parseBlocks(entry.value);
        expect(
          p.incompleteAdjustmentReasons,
          contains(
            anyOf(
              ReceiptOcrIncompleteAdjustmentReason.detachedAmountSign,
              ReceiptOcrIncompleteAdjustmentReason.ambiguousChargeTable,
            ),
          ),
        );
        expect(
          p.itemLineDecisions[4],
          isNot(ReceiptOcrItemLineDecision.metadataOrHeaderSkipped),
        );
        expect(p.adjustmentsComplete, isFalse);
        expect(p.blocks, orderedEquals(entry.value));
      });
    }
  });
  group('bounded issuer blocks', () {
    List<ReceiptOcrBlockEvidence> header(
      String brand,
      String? kind, {
      bool side = true,
      bool neighborCharge = false,
    }) => [
      if (side) cell('PEOPLE', 0, 850, 30, 90, 20),
      cell(brand, 1, 100, 40, 330, 48),
      if (side) cell('PLANS', 1, 850, 55, 70, 20),
      if (neighborCharge) cell('Delivery USD 2.00', 1, 580, 55, 200, 20),
      if (kind != null) cell(kind, 2, 120, 88, 290, 42),
      if (side) cell('POSSIBILITIES', 2, 850, 80, 140, 20),
      cell('123 Sample Road', 3, 100, 155, 180, 20),
      cell('Bill Date: 2026-09-17', 4, 40, 190, 260, 20),
      cell('Widget USD 10.00', 5, 40, 225, 300, 20),
      cell('Tax USD 1.00', 6, 40, 260, 300, 20),
      cell('Total USD 11.00', 7, 40, 295, 300, 20),
    ];
    for (final identity in [
      'Example Mobile',
      'Example Electric',
      'Example Fuel',
    ]) {
      test(
        'isolates prominent $identity from earlier sidebar and contact words',
        () {
          final blocks = header(identity, null);
          final p = parseBlocks(blocks);
          expect(p.merchant, identity);
          expect(p.blocks, orderedEquals(blocks));
          expect(p.total, '11.00');
          expect(p.tax, '1.00');
        },
      );
    }
    for (final kind in [
      'Gas Utility',
      'PARKING',
      'PHARMACY',
      'BOUTIQUE',
      'COFFEE ROASTERS',
      'KITCHEN + BAR',
    ]) {
      test('joins mixed-case aligned issuer and $kind descriptor', () {
        final p = parseBlocks(header('Example & Co.', kind));
        expect(p.merchant, 'Example & Co. $kind');
        expect(p.items.map((i) => i.lineTotal), ['10.00']);
      });
    }
    test('an adjacent monetary block is not consumed as issuer evidence', () {
      final p = parseBlocks(
        header('Example Electric', null, neighborCharge: true),
      );
      expect(
        p.itemLineDecisions[1],
        isNot(ReceiptOcrItemLineDecision.metadataOrHeaderSkipped),
      );
      expect(p.adjustmentsComplete, isFalse);
      expect(p.blocks.any((b) => b.text == 'Delivery USD 2.00'), isTrue);
    });
    test(
      'unpriced product and size lines keep review after an issuer header',
      () {
        for (final product in ['Latte, XL', 'Chocolate Cookie. Family Size']) {
          final blocks = header('Example Cafe', null, side: false);
          blocks.insert(blocks.length - 1, cell(product, 65, 40, 282, 280, 20));
          final p = parseBlocks(blocks);
          expect(p.merchant, 'Example Cafe');
          expect(p.reviewHints, isNotEmpty, reason: product);
        }
      },
    );
    for (final shape in [
      'no geometry',
      'buyer section',
      'misaligned descriptor',
      'distant descriptor',
      'body sized',
      'intervening item',
    ]) {
      test('$shape cannot establish a joined issuer', () {
        var blocks = header('Example Brand', 'Gas Utility');
        if (shape == 'buyer section') {
          blocks.insert(1, cell('Bill To', 99, 100, 10, 300, 20));
        }
        if (shape == 'intervening item') {
          blocks.insert(3, cell('Unpriced extra', 98, 100, 85, 300, 20));
        }
        if (shape == 'misaligned descriptor' || shape == 'distant descriptor') {
          final i = blocks.indexWhere((b) => b.text == 'Gas Utility');
          blocks[i] = cell(
            'Gas Utility',
            2,
            shape == 'misaligned descriptor' ? 520 : 120,
            shape == 'distant descriptor' ? 480 : 88,
            290,
            42,
          );
        }
        if (shape == 'no geometry' || shape == 'body sized') {
          blocks = blocks
              .map(
                (b) => ReceiptOcrBlockEvidence(
                  text: b.text,
                  row: b.row,
                  order: b.order,
                  points: shape == 'no geometry'
                      ? []
                      : [
                          b.points[0],
                          b.points[1],
                          ReceiptOcrPoint(
                            x: b.points[2].x,
                            y: b.points[0].y + 20,
                          ),
                          ReceiptOcrPoint(
                            x: b.points[3].x,
                            y: b.points[0].y + 20,
                          ),
                        ],
                ),
              )
              .toList();
        }
        final p = parseBlocks(blocks);
        expect(p.merchant, isNot('Example Brand Gas Utility'));
        expect(p.blocks, orderedEquals(blocks));
        if (shape == 'intervening item') expect(p.reviewHints, isNotEmpty);
      });
    }
  });
  group('explicit receipt date ownership', () {
    for (final dateLines in [
      'Order Date: 2026-09-16\nPickup Date: 2026-09-18\nReceipt Date: 2026-09-17',
      'Receipt Date: 2026-09-17\nOrder Date: 2026-09-16\nPickup Date: 2026-09-18',
      'Order Date: 2026-09-16\nReceipt Date:\n2026-09-17',
      'Order Date: 2026-09-16 Receipt Date: 2026-09-17',
    ]) {
      test('receipt role wins independently of position: $dateLines', () {
        final p = const ReceiptOcrParser().parse(
          'Example Cafe\n$dateLines\nMeal USD 18.00\nTotal USD 18.00',
        );
        expect(p.receiptDate, '2026-09-17');
        expect(p.total, '18.00');
        expect(p.items.single.lineTotal, '18.00');
      });
    }
    test(
      'previous receipt and due labels cannot override current bill date',
      () {
        final p = const ReceiptOcrParser().parse(
          'Example Utility\n'
          'Previous Receipt Date: 2026-09-25\nBill Date: 2026-09-17\n'
          'Due Date: 2026-10-10\nService USD 18.00\nTotal USD 18.00',
        );
        expect(p.receiptDate, '2026-09-17');
      },
    );
    for (final qualifier in [
      'Due',
      'Previous',
      'Refund',
      'Order',
      'Pickup',
      'Service',
    ]) {
      test('$qualifier receipt date is not the current document role', () {
        final p = const ReceiptOcrParser().parse(
          'Example Utility\n'
          '$qualifier Receipt Date: 2026-09-25\nBill Date: 2026-09-17\n'
          'Plan USD 18.00\nTotal USD 18.00',
        );
        expect(p.receiptDate, '2026-09-17');
      });
    }
    test('conflicting explicit receipt dates remain reviewable', () {
      final p = const ReceiptOcrParser().parse(
        'Example Cafe\n'
        'Receipt Date: 2026-09-17\nReceipt Date: 2026-09-18\n'
        'Meal USD 18.00\nTotal USD 18.00',
      );
      expect(p.receiptDate, isNull);
      expect(p.warnings, contains(contains('receipt dates')));
    });
    test('repeated same receipt date is corroboration', () {
      final p = const ReceiptOcrParser().parse(
        'Example Cafe\n'
        'Receipt Date: 2026-09-17\nReceipt Date: 2026-09-17\n'
        'Meal USD 18.00\nTotal USD 18.00',
      );
      expect(p.receiptDate, '2026-09-17');
      expect(p.warnings, isNot(contains(contains('receipt dates'))));
    });
    test('a stay endpoint is not promoted to a transaction date', () {
      final p = const ReceiptOcrParser().parse(
        'Example Hotel\n'
        'Stay: 2026-09-15 to 2026-09-17\nRoom USD 180.00\n'
        'Tourism Fee USD 10.00\nAmount Due USD 190.00',
      );
      expect(p.receiptDate, isNull);
      expect(p.warnings, contains(contains('Stay dates')));
      expect(p.reviewHints, isNotEmpty);
    });
  });
}
