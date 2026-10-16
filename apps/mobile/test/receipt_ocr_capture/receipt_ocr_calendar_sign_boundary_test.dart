import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrPreview _receipt(String field, bool geometry) {
  final lines = ['Example Cafe', field, 'Tea USD 5.00', 'Total USD 5.00'];
  final blocks = [
    for (final (i, line) in lines.indexed)
      ReceiptOcrBlockEvidence(
        text: line,
        row: i,
        order: i,
        points: [
          ReceiptOcrPoint(x: 20, y: i * 30),
          ReceiptOcrPoint(x: 500, y: i * 30),
          ReceiptOcrPoint(x: 500, y: i * 30 + 20),
          ReceiptOcrPoint(x: 20, y: i * 30 + 20),
        ],
      ),
  ];
  final p = const ReceiptOcrParser().parse(
    lines.join('\n'),
    blocks: geometry ? blocks : const [],
  );
  if (geometry) expect(p.blocks, blocks);
  return p;
}

void main() {
  for (final geometry in [false, true]) {
    for (final description in ['日期: 2026年09月17日', '날짜: 2026. 09. 17.']) {
      test(
        'generic dated product retains separate price: $description,$geometry',
        () {
          final p = _receipt('$description USD 4.00', geometry);
          expect(p.items.map((i) => (i.description, i.lineTotal)), [
            (description, '4.00'),
            ('Tea', '5.00'),
          ]);
          expect(
            p.itemLineDecisions[1],
            isNot(ReceiptOcrItemLineDecision.unretainedPricedRow),
          );
        },
      );
    }
    for (final label in [
      'Date',
      'Receipt Date',
      'Invoice Date',
      'Bill Date',
      'Statement Date',
      'Transaction Date',
      'Purchase Date',
      'Order Date',
      'Issued On',
    ]) {
      test('complete spaced calendar field: $label geometry=$geometry', () {
        final p = _receipt('$label: 2026 - 09 - 17', geometry);
        expect(p.receiptDate, '2026-09-17');
        expect(p.currency, 'USD');
        expect(p.items.map((i) => (i.description, i.lineTotal)), [
          ('Tea', '5.00'),
        ]);
        expect(p.total, '5.00');
        expect(p.adjustmentsComplete, isTrue);
        expect(p.incompleteAdjustmentReasons, isEmpty);
        expect(p.warnings, isEmpty);
        expect(p.reviewHints, isEmpty);
      });
    }

    for (final field in [
      'Invoice Date: 2026 - 02 - 31',
      'Invoice Date: 2026 / 09 - 17',
      'Invoice Date: 2026 - 09 - 17 USD - 4.00',
      'Invoice Date: 2026 - 09 - 17 -',
      'Invoice Date Planner 2026 - 09 - 17',
      'Invoice Date: 2026 - 09 - 17 extra',
      'Invoice Date: 2026 - 09 - 17 8.00',
    ]) {
      test(
        'unproven calendar cannot erase sign: $field geometry=$geometry',
        () {
          final p = _receipt(field, geometry);
          expect(p.adjustmentsComplete, isFalse);
          if (!field.endsWith(' 8.00')) {
            expect(
              p.incompleteAdjustmentReasons,
              contains(ReceiptOcrIncompleteAdjustmentReason.detachedAmountSign),
            );
          }
          expect(p.reviewHints, isNotEmpty);
        },
      );
    }

    for (final clock in ['14:30', '09:15:32', '9:15 pm']) {
      test('complete date and clock remain metadata: $clock,$geometry', () {
        final p = _receipt('Invoice Date: 2026 - 09 - 17 $clock', geometry);
        expect(p.receiptDate, '2026-09-17');
        expect(p.adjustmentsComplete, isTrue);
        expect(p.reviewHints, isEmpty);
      });
    }
    for (final qualifier in ['Previous', 'Prior', 'Refund']) {
      test(
        'complete historical field has no monetary sign: $qualifier,$geometry',
        () {
          final p = _receipt(
            '$qualifier Invoice Date: 2026 - 09 - 17',
            geometry,
          );
          expect(p.adjustmentsComplete, isTrue);
          expect(
            p.incompleteAdjustmentReasons,
            isNot(
              contains(ReceiptOcrIncompleteAdjustmentReason.detachedAmountSign),
            ),
          );
        },
      );
    }
    for (final money in ['8.00', 'USD 8.00', '8.00 USD', '-8.00', '8']) {
      test(
        'unowned amount after calendar remains reviewable: $money,$geometry',
        () {
          final p = _receipt('Invoice Date: 2026 - 09 - 17 $money', geometry);
          expect(p.adjustmentsComplete, isFalse);
          expect(
            p.incompleteAdjustmentReasons,
            contains(ReceiptOcrIncompleteAdjustmentReason.unretainedPricedItem),
          );
          expect(p.reviewHints, isNotEmpty);
          expect(p.items.map((i) => i.description), ['Tea']);
        },
      );
    }
    for (final prefix in [
      'Bill Date: 2026/10/01',
      'Invoice Date: 2026 - 09 - 17',
      'Refund Invoice Date: 2026-09-17',
    ]) {
      test(
        'bounded neighboring date fields retain ownership: $prefix,$geometry',
        () {
          final p = _receipt('$prefix Due Date: 2026/10/20', geometry);
          expect(p.adjustmentsComplete, isTrue);
          expect(p.reviewHints, isEmpty);
        },
      );
    }
  }
}
