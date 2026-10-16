import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrPreview _receipt(
  String currency,
  String first,
  String second,
  bool geometry,
) {
  final lines = [
    'Example Market',
    'Date: 2026-10-16',
    'Tea $currency $first',
    'Subtotal $currency $first',
    'Subtotal $currency $second',
    'Total $currency $first',
  ];
  final blocks = [
    for (final (i, line) in lines.indexed)
      ReceiptOcrBlockEvidence(
        text: line,
        row: i,
        order: i,
        points: [
          ReceiptOcrPoint(x: 20, y: i * 30),
          ReceiptOcrPoint(x: 700, y: i * 30),
          ReceiptOcrPoint(x: 700, y: i * 30 + 20),
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
    for (final (currency, first, second) in [
      ('USD', '9007199254740992.00', '9007199254740993.00'),
      ('USD', '9007199254740992.00', '9007199254740992.01'),
      ('JPY', '9007199254740992', '9007199254740993'),
      ('KWD', '9007199254740992.000', '9007199254740992.001'),
      ('', '9007199254740992.000', '9007199254740992.001'),
      ('USD', '90071992547409.91', '90071992547409.92'),
      ('KWD', '0.004', '0.005'),
      ('KWD', '5.000', '5.001'),
      ('USD', '1000.001', '1000.002'),
      ('', '0.001', '0.002'),
    ]) {
      for (final reversed in [false, true]) {
        test(
          'distinct exact subtotal $currency,$geometry,$reversed,$second',
          () {
            final values = reversed ? [second, first] : [first, second];
            final p = _receipt(currency, values[0], values[1], geometry);
            expect(p.subtotal, values.first);
            expect(p.adjustmentsComplete, isFalse);
            expect(
              p.incompleteAdjustmentReasons,
              contains(
                ReceiptOcrIncompleteAdjustmentReason.conflictingSubtotal,
              ),
            );
            expect(p.reviewHints, isNotEmpty);
          },
        );
      }
    }
    for (final (currency, first, second) in [
      ('USD', '9007199254740992.00', '9007199254740992.00'),
      ('USD', '5.0', '05.00'),
      ('JPY', '5', '005'),
      ('KWD', '5.00', '05.000'),
      ('', '9007199254740992.001', '09007199254740992.001'),
      ('KWD', '9007199254740992.0', '09007199254740992.000'),
      ('KWD', '0.000', '00.0'),
    ]) {
      test('equivalent exact subtotal $currency,$geometry,$second', () {
        final p = _receipt(currency, first, second, geometry);
        expect(p.subtotal, first);
        expect(
          p.incompleteAdjustmentReasons,
          isNot(
            contains(ReceiptOcrIncompleteAdjustmentReason.conflictingSubtotal),
          ),
        );
      });
    }
  }

  test('equal amounts in different currencies still conflict', () {
    final p = const ReceiptOcrParser().parse(
      'Example Market\nDate: 2026-10-16\nTea USD 5.00\n'
      'Subtotal USD 5.00\nSubtotal EUR 5.00\nTotal USD 5.00',
    );
    expect(p.subtotal, '5.00');
    expect(p.adjustmentsComplete, isFalse);
    expect(
      p.incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.conflictingSubtotal),
    );
  });
}
