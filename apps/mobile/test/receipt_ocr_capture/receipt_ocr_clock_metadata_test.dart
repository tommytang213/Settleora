import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

// Synthetic clock fields; no native capture text or geometry is copied here.
ReceiptOcrPreview _parse(
  String field, {
  bool geometry = false,
  String currency = 'USD',
  String amount = '5.00',
  String extra = '',
  bool wrappedClock = false,
  bool missingClockGeometry = false,
}) {
  final rows = [
    ['Example Shop'],
    ['Tea', '$currency $amount'],
    // Separate provider cells still describe one complete printed field.
    [
      field.substring(0, field.indexOf(':') + 1),
      if (!wrappedClock &&
          field.substring(field.indexOf(':') + 1).trim().isNotEmpty)
        field.substring(field.indexOf(':') + 1).trim(),
    ],
    if (wrappedClock) [field.substring(field.indexOf(':') + 1).trim()],
    if (extra.isNotEmpty) [extra],
    ['Coffee', '$currency $amount'],
    ['Total $currency ${currency == 'JPY' ? '10' : '10.00'}'],
  ];
  final blocks = <ReceiptOcrBlockEvidence>[];
  if (geometry) {
    for (var row = 0; row < rows.length; row++) {
      for (var col = 0; col < rows[row].length; col++) {
        final left = col == 0 ? 20.0 : 240.0;
        blocks.add(
          ReceiptOcrBlockEvidence(
            text: rows[row][col],
            row: row,
            order: blocks.length,
            confidence: .98,
            points: missingClockGeometry && row == 2
                ? const []
                : [
                    ReceiptOcrPoint(x: left, y: row * 40),
                    ReceiptOcrPoint(x: left + 180, y: row * 40),
                    ReceiptOcrPoint(x: left + 180, y: row * 40 + 20),
                    ReceiptOcrPoint(x: left, y: row * 40 + 20),
                  ],
          ),
        );
      }
    }
  }
  final preview = const ReceiptOcrParser().parse(
    rows.map((row) => row.join(' ')).join('\n'),
    blocks: blocks,
  );
  expect(preview.blocks, blocks);
  return preview;
}

void main() {
  for (final geometry in [false, true]) {
    for (final field in [
      'Time In: 8:15 AM',
      'Time Out: 12:45 pm',
      'Time In: 12:00 AM',
      'Time Out: 12:00 PM',
      'Time In: 00:15',
      'Time Out: 23:59:45',
    ]) {
      for (final currency in ['USD', 'EUR', 'JPY']) {
        test(
          'complete clock is metadata $field $currency geometry=$geometry',
          () {
            final amount = currency == 'JPY' ? '5' : '5.00';
            final preview = _parse(
              field,
              geometry: geometry,
              currency: currency,
              amount: amount,
            );
            expect(
              preview.itemLineDecisions[2],
              ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
            );
            expect(preview.items.map((item) => item.description), [
              'Tea',
              'Coffee',
            ]);
            expect(preview.items.map((item) => item.lineTotal), [
              amount,
              amount,
            ]);
            expect(preview.adjustmentsComplete, isTrue);
            expect(preview.warnings, isEmpty);
            expect(preview.reviewHints, isEmpty);
          },
        );
      }
    }

    for (final field in [
      'Time In: 24:15',
      'Time Out: 8:60 AM',
      'Time In: 00:15 AM',
      'Time Out: 13:15 PM',
      'Time In: 8:15:60 AM',
      'Time Out: 8:15 XM',
      'Time In: 8:',
      'Time Out:',
      'Time In: 8:15 AM USD 2.00',
      'Time Out: EUR 8.15',
      'Time In: 8:15 AM 2.00',
      'Time Out: 8:15 AM Timer USD 2.00',
    ]) {
      test(
        'clock cannot own extra or invalid evidence $field geometry=$geometry',
        () {
          final preview = _parse(field, geometry: geometry);
          expect(
            preview.itemLineDecisions[2],
            isNot(ReceiptOcrItemLineDecision.metadataOrHeaderSkipped),
          );
          expect(
            preview.items.any((item) => item.description == 'Tea'),
            isTrue,
          );
          expect(
            preview.items.any((item) => item.description == 'Coffee'),
            isTrue,
          );
        },
      );
    }

    test('clock does not resolve an unpriced neighbor geometry=$geometry', () {
      final preview = _parse(
        'Time In: 8:15 AM',
        geometry: geometry,
        extra: 'Unpriced biscuit',
      );
      expect(preview.adjustmentsComplete, isFalse);
      expect(
        preview.incompleteAdjustmentReasons,
        contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
      );
    });

    test(
      'clock does not consume a separate priced product geometry=$geometry',
      () {
        final preview = _parse(
          'Time In: 8:15 AM',
          geometry: geometry,
          extra: 'Biscuit USD 2.00',
        );
        expect(preview.items.map((item) => item.description), [
          'Tea',
          'Biscuit',
          'Coffee',
        ]);
        expect(preview.items[1].lineTotal, '2.00');
        expect(preview.reviewHints, isNotEmpty);
      },
    );

    test('clock does not join provider rows geometry=$geometry', () {
      final preview = _parse(
        'Time In: 8:15 AM',
        geometry: geometry,
        wrappedClock: true,
      );
      expect(
        preview.itemLineDecisions[2],
        isNot(ReceiptOcrItemLineDecision.metadataOrHeaderSkipped),
      );
      expect(preview.adjustmentsComplete, isFalse);
    });
  }

  for (final missingGeometry in [false, true]) {
    test(
      'clock-shaped product retains its extra price missing=$missingGeometry',
      () {
        final preview = _parse(
          'Time In: 8:15 AM USD 2.00',
          geometry: true,
          missingClockGeometry: missingGeometry,
        );
        expect(
          preview.items.any(
            (item) =>
                item.description == 'Time In: 8:15 AM' &&
                item.lineTotal == '2.00',
          ),
          isTrue,
        );
        expect(preview.reviewHints, isNotEmpty);
      },
    );
  }

  test('a clock-named product keeps its printed amount', () {
    final preview = const ReceiptOcrParser().parse(
      'Example Shop\nTime In Timer USD 5.00\nTotal USD 5.00',
    );
    expect(preview.items.single.description, 'Time In Timer');
    expect(preview.items.single.lineTotal, '5.00');
  });

  test('clock does not reinterpret a leading product number', () {
    final preview = const ReceiptOcrParser().parse(
      'Example Shop\nTime In: 8:15 AM\n2 Tea USD 5.00\n'
      'Subtotal USD 5.00\nTotal USD 5.00',
    );
    expect(preview.items.single.description, '2 Tea');
    expect(preview.items.single.quantity, isNull);
  });

  test('clock leaves duplicate promotion roles ambiguous', () {
    final preview = const ReceiptOcrParser().parse(
      'Example Shop\nTime In: 8:15 AM\nTea USD 5.00\n'
      'Promotion USD -5.00\nSubtotal USD 5.00\n'
      'Discount USD -5.00\nTotal USD 0.00',
    );
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.reviewHints, isNotEmpty);
  });
}
