import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrPreview _receipt({
  String? marker,
  String? secondMarker,
  bool secondNearby = true,
  bool nearby = false,
  bool rtl = false,
  bool descriptionSide = false,
  String amount = 'USD 5.00',
  String tail = 'each',
  double markerConfidence = .99,
  double scale = 1,
}) {
  final blocks = <ReceiptOcrBlockEvidence>[];
  void cell(
    String text,
    int row,
    double left,
    double right, {
    bool description = false,
    double confidence = .99,
  }) {
    if (rtl) {
      final oldLeft = left;
      left = 600 - right;
      right = 600 - oldLeft;
    }
    blocks.add(
      ReceiptOcrBlockEvidence(
        text: text,
        row: row,
        order: blocks.length,
        confidence: confidence,
        textDirection: description && rtl ? 'rtl' : null,
        points: [
          ReceiptOcrPoint(x: left * scale, y: row * 30 * scale),
          ReceiptOcrPoint(x: right * scale, y: row * 30 * scale),
          ReceiptOcrPoint(x: right * scale, y: (row * 30 + 15) * scale),
          ReceiptOcrPoint(x: left * scale, y: (row * 30 + 15) * scale),
        ],
      ),
    );
  }

  cell('Example Market', 0, 20, 600);
  cell('Receipt Date: 2026-09-17', 1, 20, 600);
  cell(rtl ? 'شاي' : 'Tea', 2, 20, 100, description: true);
  cell(amount, 2, 200, 280);
  if (marker != null) {
    final left = descriptionSide
        ? (nearby ? 150.0 : -60.0)
        : (nearby ? 290.0 : 500.0);
    cell(marker, 2, left, left + 30, confidence: markerConfidence);
  }
  if (secondMarker != null) {
    cell(secondMarker, 2, secondNearby ? 150 : -60, secondNearby ? 180 : -30);
  }
  if (tail.isNotEmpty) cell(tail, 2, 550, 590);
  cell('Total USD 5.00', 3, 20, 600);
  final rows = <int, List<String>>{};
  for (final block in blocks) {
    (rows[block.row] ??= []).add(block.text);
  }
  return const ReceiptOcrParser().parse(
    rows.values.map((row) => row.join(' ')).join('\n'),
    blocks: blocks,
  );
}

void _expectUnresolved(
  ReceiptOcrPreview preview,
  String marker, {
  bool owned = false,
}) {
  expect(preview.merchant, 'Example Market');
  expect(preview.receiptDate, '2026-09-17');
  expect(preview.blocks.map((block) => block.text), contains(marker));
  if (owned) {
    // A nearby denomination belongs to the amount and may retain an editable
    // item whose currency is explicitly unresolved. Distant evidence must
    // not acquire that ownership through the fallback.
    expect(preview.items.single.currency, isNull);
    expect(preview.items.single.currencyUnresolved, isTrue);
  }
  expect(preview.adjustmentsComplete, isFalse);
  expect(preview.reviewHints, isNotEmpty);
}

void main() {
  for (final rtl in [false, true]) {
    for (final nearby in [false, true]) {
      for (final descriptionSide in [false, true]) {
        final geometry =
            'rtl=$rtl,nearby=$nearby,descriptionSide=$descriptionSide';
        for (final marker in ['EUR', 'JPY', 'KWD', '₿', 'USD/EUR']) {
          test(
            'conflicting denomination remains reviewable: $marker,$geometry',
            () {
              _expectUnresolved(
                _receipt(
                  marker: marker,
                  rtl: rtl,
                  nearby: nearby,
                  descriptionSide: descriptionSide,
                ),
                marker,
                owned: nearby,
              );
            },
          );
        }
        for (final marker in [null, 'USD', r'$']) {
          test(
            'matching or absent denomination remains usable: $marker,$geometry',
            () {
              final preview = _receipt(
                marker: marker,
                rtl: rtl,
                nearby: nearby,
                descriptionSide: descriptionSide,
              );
              expect(preview.merchant, 'Example Market');
              expect(preview.items.single.description, rtl ? 'شاي' : 'Tea');
              expect(preview.items.single.lineTotal, '5.00');
              expect(preview.items.single.currency, 'USD');
              expect(preview.items.single.currencyUnresolved, isFalse);
              expect(preview.adjustmentsComplete, isTrue);
              expect(preview.reviewHints, isEmpty);
            },
          );
        }
      }
      test(
        'nearby matching marker can own a bare amount: rtl=$rtl,nearby=$nearby',
        () {
          final preview = _receipt(
            amount: '5.00',
            marker: 'USD',
            nearby: nearby,
            rtl: rtl,
          );
          // A distant marker must not establish ownership, even when the receipt
          // independently supplies the same currency for the decimal amount.
          expect(preview.items.single.lineTotal, '5.00');
          expect(preview.items.single.currency, 'USD');
          expect(preview.adjustmentsComplete, isTrue);
        },
      );
    }
    for (final alternative in ['or USD 3.00 each', 'or JPY 300 each', '3.00']) {
      test('alternative price cannot disappear: $alternative,rtl=$rtl', () {
        _expectUnresolved(_receipt(marker: alternative, rtl: rtl), alternative);
      });
    }
    for (final marker in ['pen', 'Statement']) {
      test('ordinary outside text stays harmless: $marker,rtl=$rtl', () {
        final preview = _receipt(marker: marker, rtl: rtl);
        expect(preview.items.single.description, rtl ? 'شاي' : 'Tea');
        expect(preview.adjustmentsComplete, isTrue);
      });
    }
  }
  for (final rtl in [false, true]) {
    for (final nearby in [false, true]) {
      test('mixed markers cannot erase ambiguity: rtl=$rtl,nearby=$nearby', () {
        _expectUnresolved(
          _receipt(
            marker: 'EUR',
            secondMarker: 'USD',
            nearby: nearby,
            rtl: rtl,
          ),
          'EUR',
        );
      });
      test(
        'repeated matching markers remain benign: rtl=$rtl,nearby=$nearby',
        () {
          final preview = _receipt(
            marker: 'USD',
            secondMarker: r'$',
            nearby: nearby,
            rtl: rtl,
          );
          expect(preview.items.single.description, rtl ? 'شاي' : 'Tea');
          expect(preview.items.single.currency, 'USD');
          expect(preview.adjustmentsComplete, isTrue);
          expect(preview.reviewHints, isEmpty);
        },
      );
    }
    test(
      'a distant foreign marker cannot own an inherited amount: rtl=$rtl',
      () {
        _expectUnresolved(
          _receipt(amount: '5.00', marker: 'EUR', rtl: rtl),
          'EUR',
        );
      },
    );
  }
  for (final scale in [.5, 2.0]) {
    test('distant denomination conflict survives scale $scale', () {
      _expectUnresolved(_receipt(marker: 'EUR', scale: scale), 'EUR');
    });
  }
  test('low-confidence conflicting evidence remains reviewable', () {
    _expectUnresolved(_receipt(marker: 'EUR', markerConfidence: .1), 'EUR');
  });
}
