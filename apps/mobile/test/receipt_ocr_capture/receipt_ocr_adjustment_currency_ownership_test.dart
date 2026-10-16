import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrPreview _receipt({
  String? sideCurrency,
  bool mirrored = false,
  double scale = 1,
  String label = 'Tax',
  String amount = 'USD 1.00',
  String? rate,
  bool nearby = false,
  double sideConfidence = .99,
  bool sideGeometry = true,
  bool layout = true,
}) {
  final blocks = <ReceiptOcrBlockEvidence>[];
  void cell(
    String text,
    int row,
    double left,
    double right, {
    double confidence = .99,
    bool geometry = true,
  }) {
    if (mirrored) {
      final oldLeft = left;
      left = 500 - right;
      right = 500 - oldLeft;
    }
    left *= scale;
    right *= scale;
    blocks.add(
      ReceiptOcrBlockEvidence(
        text: text,
        row: row,
        order: blocks.length,
        confidence: confidence,
        points: geometry
            ? [
                ReceiptOcrPoint(x: left, y: row * 20 * scale),
                ReceiptOcrPoint(x: right, y: row * 20 * scale),
                ReceiptOcrPoint(x: right, y: (row * 20 + 12) * scale),
                ReceiptOcrPoint(x: left, y: (row * 20 + 12) * scale),
              ]
            : const [],
      ),
    );
  }

  cell('Example Market', 0, 20, 350);
  cell('Date 2026-10-15', 1, 20, 350);
  cell('Description', 2, 20, 150);
  cell('Usage', 2, 170, 210);
  cell('Rate', 2, 230, 270);
  cell('Amount', 2, 310, 350);
  cell('Widget', 3, 20, 150);
  cell('1', 3, 170, 210);
  cell('USD 10.00', 3, 230, 270);
  cell('USD 10.00', 3, 310, 350);
  cell(label, 4, 20, 150);
  if (rate != null) cell(rate, 4, 230, 270);
  cell(amount, 4, 310, 350);
  if (sideCurrency != null) {
    cell(
      sideCurrency,
      4,
      nearby ? 355 : 425,
      nearby ? 380 : 450,
      confidence: sideConfidence,
      geometry: sideGeometry,
    );
  }
  cell('Total USD ${rate == 'included' ? '10.00' : '11.00'}', 5, 20, 350);

  final rows = <int, List<String>>{};
  for (final block in blocks) {
    (rows[block.row] ??= []).add(block.text);
  }
  return const ReceiptOcrParser().parse(
    rows.values.map((row) => row.join(' ')).join('\n'),
    blocks: layout ? blocks : const [],
  );
}

void _expectUnresolved(ReceiptOcrPreview preview) {
  expect(preview.currency, 'USD');
  expect(preview.adjustmentsComplete, isFalse);
  expect(preview.reviewHints, isNotEmpty);
  expect(
    preview.incompleteAdjustmentReasons,
    contains(ReceiptOcrIncompleteAdjustmentReason.ambiguousChargeTable),
  );
}

void main() {
  for (final mirrored in [false, true]) {
    test('uncontested adjustment stays usable; mirrored=$mirrored', () {
      final preview = _receipt(mirrored: mirrored);
      expect(preview.currency, 'USD');
      expect(preview.tax, '1.00');
      expect(preview.adjustmentsComplete, isTrue);
      expect(preview.reviewHints, isEmpty);
    });

    for (final marker in ['USD', r'$', 'pen', 'Statement']) {
      test(
        'consistent denomination or ordinary text $marker; mirrored=$mirrored',
        () {
          final preview = _receipt(sideCurrency: marker, mirrored: mirrored);
          expect(preview.tax, '1.00');
          expect(preview.adjustmentsComplete, isTrue);
          expect(preview.reviewHints, isEmpty);
          expect(preview.blocks.map((block) => block.text), contains(marker));
        },
      );
    }

    for (final marker in ['EUR', 'JPY', 'KWD', '₿', 'USD/EUR']) {
      test(
        'conflicting or unresolved side currency $marker; mirrored=$mirrored',
        () {
          final preview = _receipt(sideCurrency: marker, mirrored: mirrored);
          _expectUnresolved(preview);
          expect(preview.blocks.map((block) => block.text), contains(marker));
          expect(preview.items.single.description, 'Widget');
          expect(preview.items.single.lineTotal, '10.00');
        },
      );
    }

    test(
      'nearby matching denomination owns a bare tax amount; mirrored=$mirrored',
      () {
        final preview = _receipt(
          sideCurrency: 'USD',
          mirrored: mirrored,
          amount: '1.00',
          nearby: true,
        );
        expect(preview.tax, '1.00');
        expect(preview.adjustmentsComplete, isTrue);
        expect(preview.reviewHints, isEmpty);
      },
    );

    test(
      'distant foreign currency cannot own a bare tax amount; mirrored=$mirrored',
      () {
        _expectUnresolved(
          _receipt(sideCurrency: 'EUR', mirrored: mirrored, amount: '1.00'),
        );
      },
    );
  }

  for (final scale in [.5, 2.0]) {
    test('currency side-cell conflict survives geometry scale $scale', () {
      _expectUnresolved(_receipt(sideCurrency: 'EUR', scale: scale));
    });
  }

  for (final label in ['Service Charge', 'Discount', 'Subtotal']) {
    test('shared projection guard preserves $label currency conflict', () {
      _expectUnresolved(_receipt(sideCurrency: 'EUR', label: label));
    });
  }

  test('included-tax projection preserves outside currency conflict', () {
    _expectUnresolved(_receipt(sideCurrency: 'EUR', rate: 'included'));
  });

  test('included-tax control remains explicitly included', () {
    final preview = _receipt(rate: 'included');
    expect(preview.tax, '1.00');
    expect(preview.taxIncludedInTotal, isTrue);
    expect(preview.adjustmentsComplete, isTrue);
    expect(preview.reviewHints, isEmpty);
  });

  test('low-confidence side currency remains evidence', () {
    _expectUnresolved(_receipt(sideCurrency: 'EUR', sideConfidence: .1));
  });

  test('missing side geometry cannot erase the denomination', () {
    final preview = _receipt(sideCurrency: 'EUR', sideGeometry: false);
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.reviewHints, isNotEmpty);
    expect(preview.blocks.map((block) => block.text), contains('EUR'));
  });

  test('text-only evidence retains a conflicting currency', () {
    final preview = _receipt(sideCurrency: 'EUR', layout: false);
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.reviewHints, isNotEmpty);
  });
}
