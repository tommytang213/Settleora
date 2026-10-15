import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrPreview _receipt({
  double headingLeft = 100,
  bool splitDescription = true,
  bool amountOnLeft = false,
  double scale = 1,
  String? neighborHeading,
  String neighborText = 'ZX9',
  String? outsideText,
  double descriptionDy = 0,
  bool descriptionGeometry = true,
}) {
  final blocks = <ReceiptOcrBlockEvidence>[];
  void cell(
    String text,
    int row,
    double left,
    double right, {
    double dy = 0,
    bool geometry = true,
  }) {
    blocks.add(
      ReceiptOcrBlockEvidence(
        text: text,
        row: row,
        order: blocks.length,
        confidence: .99,
        points: geometry
            ? [
                ReceiptOcrPoint(
                  x: (left + 200) * scale,
                  y: (row * 20 + dy) * scale,
                ),
                ReceiptOcrPoint(
                  x: (right + 200) * scale,
                  y: (row * 20 + dy) * scale,
                ),
                ReceiptOcrPoint(
                  x: (right + 200) * scale,
                  y: (row * 20 + 12 + dy) * scale,
                ),
                ReceiptOcrPoint(
                  x: (left + 200) * scale,
                  y: (row * 20 + 12 + dy) * scale,
                ),
              ]
            : const [],
      ),
    );
  }

  cell('Example Market', 0, 20, 480);
  cell('Date 2026-10-15', 1, 20, 480);
  cell(
    'Description',
    2,
    amountOnLeft ? 300 : headingLeft,
    amountOnLeft ? 500 - headingLeft : 200,
  );
  cell('Usage', 2, amountOnLeft ? 220 : 230, amountOnLeft ? 240 : 250);
  cell('Rate', 2, amountOnLeft ? 110 : 300, amountOnLeft ? 170 : 360);
  cell('Amount', 2, amountOnLeft ? 20 : 400, amountOnLeft ? 70 : 450);
  if (neighborHeading != null) {
    cell(
      neighborHeading,
      2,
      amountOnLeft ? 590 : -140,
      amountOnLeft ? 640 : -90,
    );
    cell(neighborText, 3, amountOnLeft ? 590 : -140, amountOnLeft ? 640 : -90);
  }
  if (splitDescription) {
    cell(
      'Dark',
      3,
      amountOnLeft ? 310 : 20,
      amountOnLeft ? 360 : 70,
      dy: amountOnLeft ? 0 : descriptionDy,
      geometry: amountOnLeft || descriptionGeometry,
    );
    cell(
      'Chocolate',
      3,
      amountOnLeft ? 380 : 90,
      amountOnLeft ? 480 : 190,
      dy: amountOnLeft ? descriptionDy : 0,
      geometry: !amountOnLeft || descriptionGeometry,
    );
  } else {
    cell(
      'Dark Chocolate',
      3,
      amountOnLeft ? 310 : 20,
      amountOnLeft ? 480 : 190,
    );
  }
  if (outsideText != null) {
    cell(outsideText, 3, amountOnLeft ? 500 : -80, amountOnLeft ? 550 : -30);
  }
  cell('2', 3, amountOnLeft ? 220 : 230, amountOnLeft ? 240 : 250);
  cell('USD 5.00', 3, amountOnLeft ? 110 : 300, amountOnLeft ? 170 : 360);
  cell('USD 10.00', 3, amountOnLeft ? 20 : 400, amountOnLeft ? 70 : 450);
  cell('Subtotal USD 10.00', 4, 20, 480);
  cell('Total USD 10.00', 5, 20, 480);
  final rows = <int, List<String>>{};
  for (final block in blocks) {
    (rows[block.row] ??= []).add(block.text);
  }
  return const ReceiptOcrParser().parse(
    rows.values.map((row) => row.join(' ')).join('\n'),
    blocks: blocks,
  );
}

void _expectComplete(ReceiptOcrPreview preview) {
  expect(preview.currency, 'USD');
  expect(preview.items.single.lineTotal, '10.00');
  expect(
    preview.items.single.description,
    'Dark Chocolate',
    reason:
        'adjustmentsComplete=${preview.adjustmentsComplete}; '
        'reviewHints=${preview.reviewHints}',
  );
  expect(preview.adjustmentsComplete, isTrue);
  expect(preview.reviewHints, isEmpty);
  expect(preview.blocks.any((b) => b.text.contains('Dark')), isTrue);
}

void main() {
  for (final amountOnLeft in [false, true]) {
    for (final scenario in [
      (name: 'wide heading control', left: 20.0, split: true),
      (name: 'single OCR block control', left: 100.0, split: false),
      (name: 'word outside heading', left: 100.0, split: true),
    ]) {
      for (final scale in [.75, 1.0, 2.0]) {
        test(
          'charge description ${scenario.name}, amountLeft=$amountOnLeft, scale=$scale',
          () {
            _expectComplete(
              _receipt(
                headingLeft: scenario.left,
                splitDescription: scenario.split,
                amountOnLeft: amountOnLeft,
                scale: scale,
              ),
            );
          },
        );
      }
    }
    for (final heading in ['Code', 'Category']) {
      test(
        'description respects neighboring $heading column, amountLeft=$amountOnLeft',
        () {
          _expectComplete(
            _receipt(
              amountOnLeft: amountOnLeft,
              neighborHeading: heading,
              neighborText: heading == 'Code' ? 'ZX9' : 'Retail',
            ),
          );
        },
      );
    }
    for (final outside in ['9.99', '120', 'USD', 'EUR', 'CHF 1.00']) {
      test(
        'expanded description cannot hide $outside, amountLeft=$amountOnLeft',
        () {
          final preview = _receipt(
            amountOnLeft: amountOnLeft,
            outsideText: outside,
          );
          expect(preview.adjustmentsComplete, isFalse);
          expect(preview.blocks.any((b) => b.text == outside), isTrue);
        },
      );
    }
    test(
      'misaligned description stays unresolved, amountLeft=$amountOnLeft',
      () {
        final preview = _receipt(amountOnLeft: amountOnLeft, descriptionDy: 60);
        expect(preview.adjustmentsComplete, isFalse);
        expect(preview.items, isEmpty);
      },
    );
    test(
      'unlocated description stays unresolved, amountLeft=$amountOnLeft',
      () {
        final preview = _receipt(
          amountOnLeft: amountOnLeft,
          descriptionGeometry: false,
        );
        expect(preview.adjustmentsComplete, isFalse);
        expect(preview.items, isEmpty);
      },
    );
  }
}
