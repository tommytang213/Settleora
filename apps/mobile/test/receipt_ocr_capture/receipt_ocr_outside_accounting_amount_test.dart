import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrPreview _receipt({
  String? outside,
  bool amountOnLeft = false,
  double scale = 1,
  String description = 'Coffee',
  bool table = true,
  bool outsideDescriptionSide = false,
  bool financialRow = false,
  String? outsideHeading,
}) {
  final blocks = <ReceiptOcrBlockEvidence>[];
  void cell(String text, int row, double left, double right) {
    if (amountOnLeft) {
      final oldLeft = left;
      left = 800 - right;
      right = 800 - oldLeft;
    }
    blocks.add(
      ReceiptOcrBlockEvidence(
        text: text,
        row: row,
        order: blocks.length,
        confidence: .99,
        points: [
          ReceiptOcrPoint(x: left * scale, y: row * 30 * scale),
          ReceiptOcrPoint(x: right * scale, y: row * 30 * scale),
          ReceiptOcrPoint(x: right * scale, y: (row * 30 + 15) * scale),
          ReceiptOcrPoint(x: left * scale, y: (row * 30 + 15) * scale),
        ],
      ),
    );
  }

  cell('Example Market', 0, 20, 730);
  cell('Receipt Date: 2026-10-15', 1, 20, 730);
  final headerRow = financialRow ? 3 : 2;
  final row = headerRow + 1;
  if (financialRow) cell('Coffee USD 10.00', 2, 20, 510);
  if (table) {
    cell('Description', headerRow, 20, 200);
    cell('Usage', headerRow, 230, 270);
    cell('Rate', headerRow, 310, 380);
    cell('Amount', headerRow, 430, 510);
    if (outsideHeading != null) cell(outsideHeading, headerRow, 650, 730);
  }
  cell(financialRow ? 'VAT' : description, row, 20, 200);
  if (table) {
    cell(financialRow ? '—' : '2', row, 230, 270);
    cell(financialRow ? '10%' : 'USD 5.00', row, 310, 380);
  }
  cell(financialRow ? 'USD 1.00' : 'USD 10.00', row, 430, 510);
  if (outside != null) {
    cell(
      outside,
      row,
      outsideDescriptionSide ? -130 : 650,
      outsideDescriptionSide ? -50 : 730,
    );
  }
  cell('Subtotal USD 10.00', row + 1, 20, 730);
  cell(financialRow ? 'Total USD 11.00' : 'Total USD 10.00', row + 2, 20, 730);
  final rows = <int, List<String>>{};
  for (final block in blocks) {
    (rows[block.row] ??= []).add(block.text);
  }
  final preview = const ReceiptOcrParser().parse(
    rows.values.map((row) => row.join(' ')).join('\n'),
    blocks: blocks,
  );
  expect(preview.blocks, blocks);
  return preview;
}

void _expectUnresolved(ReceiptOcrPreview preview, String outside) {
  expect(preview.total, '10.00');
  expect(preview.blocks.map((block) => block.text), contains(outside));
  expect(preview.adjustmentsComplete, isFalse);
  expect(preview.reviewHints, isNotEmpty);
  // Neither credit nor debit is silently converted to a positive purchase or
  // used to reconstruct an adjustment from the independently printed total.
  expect(preview.items.where((item) => item.lineTotal == '5.00'), isEmpty);
  expect(preview.tax, isNull);
  expect(preview.service, isNull);
  expect(preview.discount, isNull);
}

void main() {
  for (final outside in [null, 'Reference ABC500CR']) {
    test('ordinary table remains complete: $outside', () {
      final preview = _receipt(outside: outside);
      expect(preview.items.single.description, 'Coffee');
      expect(preview.items.single.lineTotal, '10.00');
      expect(preview.adjustmentsComplete, isTrue);
      expect(preview.reviewHints, isEmpty);
    });
  }
  for (final outside in ['5.00', '5.00CR', 'CR5.00', '5.00DR', 'DR5.00']) {
    test('outside competing amount stays unresolved: $outside', () {
      final preview = _receipt(outside: outside);
      expect(preview.total, '10.00');
      expect(preview.blocks.map((block) => block.text), contains(outside));
      expect(preview.adjustmentsComplete, isFalse);
      expect(preview.reviewHints, isNotEmpty);
    });
  }
  const accountingAmounts = [
    '5.00CR',
    'CR5.00',
    '5.00DR',
    'DR5.00',
    '-5.00CR',
    'CR-5.00',
    '-5.00DR',
    'DR-5.00',
    '+5.00CR',
    'CR+5.00',
    '+5.00DR',
    'DR+5.00',
    '5.00-CR',
    '5.00-DR',
    '5.00CR-',
    '5.00DR-',
    '(5.00CR)',
    '(DR5.00)',
    '5.00credit',
    'debit5.00',
    'CREDIT-5.00',
    'DEBIT+5.00',
    '5.00 CR',
    'DR 5.00',
  ];
  for (final amountOnLeft in [false, true]) {
    for (final outside in accountingAmounts) {
      test(
        'accounting direction is unresolved: $outside,left=$amountOnLeft',
        () {
          _expectUnresolved(
            _receipt(outside: outside, amountOnLeft: amountOnLeft),
            outside,
          );
        },
      );
    }
    for (final outside in [
      'Reference ABC500CR',
      'Ref CR500',
      'ID DR500',
      'Code CREDIT500',
      '5%',
      '30 days',
      'ABC500CR',
      'DR500X',
      'CREDITCARD500',
    ]) {
      test(
        'qualified non-money evidence remains complete: $outside,left=$amountOnLeft',
        () {
          final preview = _receipt(
            outside: outside,
            amountOnLeft: amountOnLeft,
          );
          expect(preview.items.single.description, 'Coffee');
          expect(preview.items.single.lineTotal, '10.00');
          expect(preview.adjustmentsComplete, isTrue);
          expect(preview.reviewHints, isEmpty);
        },
      );
    }
    for (final description in [
      'DR500',
      'CR500',
      'CREDIT500',
      'AB5.00CR',
      'DR500 Coffee',
      'CR500 Coffee',
      'CREDIT500 Coffee',
      'ABC500CR Coffee',
    ]) {
      test(
        'owned product identifier remains an item: $description,left=$amountOnLeft',
        () {
          final preview = _receipt(
            description: description,
            amountOnLeft: amountOnLeft,
          );
          expect(preview.items.single.description, description);
          expect(preview.items.single.lineTotal, '10.00');
          expect(preview.adjustmentsComplete, isTrue);
          expect(preview.reviewHints, isEmpty);
        },
      );
    }
    for (final scale in [.5, 2.0]) {
      for (final outsideDescriptionSide in [false, true]) {
        for (final outside in ['5.00CR', 'DR-5.00']) {
          test(
            'outside accounting remains evidence across geometry: $outside,left=$amountOnLeft,scale=$scale,descriptionSide=$outsideDescriptionSide',
            () {
              _expectUnresolved(
                _receipt(
                  outside: outside,
                  amountOnLeft: amountOnLeft,
                  scale: scale,
                  outsideDescriptionSide: outsideDescriptionSide,
                ),
                outside,
              );
            },
          );
        }
      }
    }
    for (final outside in ['5.00CR', 'CR-5.00', '5.00DR', 'DR+5.00']) {
      test(
        'fallback cannot erase an outside accounting amount: $outside,left=$amountOnLeft',
        () {
          _expectUnresolved(
            _receipt(
              outside: outside,
              amountOnLeft: amountOnLeft,
              table: false,
            ),
            outside,
          );
        },
      );
    }
    test('ordinary fallback stays editable: left=$amountOnLeft', () {
      final preview = _receipt(amountOnLeft: amountOnLeft, table: false);
      expect(preview.items.single.description, 'Coffee');
      expect(preview.items.single.lineTotal, '10.00');
      expect(preview.adjustmentsComplete, isTrue);
    });
    for (final outsideHeading in [null, 'Notes']) {
      for (final outside in [
        null,
        'Reference DR500',
        '5.00CR',
        'CR-5.00',
        '5.00DR',
        'DR+5.00',
      ]) {
        test(
          'financial row preserves outside accounting evidence: $outside,left=$amountOnLeft,heading=$outsideHeading',
          () {
            final preview = _receipt(
              financialRow: true,
              outside: outside,
              amountOnLeft: amountOnLeft,
              outsideHeading: outsideHeading,
            );
            expect(preview.total, '11.00');
            if (outside != null) {
              expect(
                preview.blocks.map((block) => block.text),
                contains(outside),
              );
            }
            if (outside == null || outside == 'Reference DR500') {
              expect(preview.tax, '1.00');
              expect(preview.adjustmentsComplete, isTrue);
              expect(preview.reviewHints, isEmpty);
            } else {
              expect(preview.tax, isIn([null, '1.00']));
              expect(preview.adjustmentsComplete, isFalse);
              expect(preview.reviewHints, isNotEmpty);
              expect(preview.discount, isNull);
              expect(
                preview.items.where((item) => item.lineTotal == '5.00'),
                isEmpty,
              );
            }
          },
        );
      }
    }
  }
}
