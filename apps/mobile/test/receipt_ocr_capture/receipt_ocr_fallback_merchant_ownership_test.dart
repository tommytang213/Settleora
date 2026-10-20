import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrPreview _layoutReceipt({String? outside, bool rtl = false}) {
  final blocks = <ReceiptOcrBlockEvidence>[];
  void cell(String text, int row, double left, double right) {
    blocks.add(
      ReceiptOcrBlockEvidence(
        text: text,
        row: row,
        order: blocks.length,
        confidence: .99,
        textDirection: rtl ? 'rtl' : null,
        points: [
          ReceiptOcrPoint(x: left, y: row * 30),
          ReceiptOcrPoint(x: right, y: row * 30),
          ReceiptOcrPoint(x: right, y: row * 30 + 15),
          ReceiptOcrPoint(x: left, y: row * 30 + 15),
        ],
      ),
    );
  }

  cell('Example Market', 0, 20, 500);
  cell(rtl ? 'ماء' : 'Water', 1, rtl ? 320 : 20, rtl ? 500 : 100);
  cell('USD 2.00', 1, 200, 280);
  if (outside != null) cell(outside, 1, rtl ? 20 : 320, rtl ? 100 : 500);
  cell('Total USD 2.00', 2, 20, 500);
  final rows = <int, List<String>>{};
  for (final block in blocks) {
    (rows[block.row] ??= []).add(block.text);
  }
  return const ReceiptOcrParser().parse(
    rows.values.map((row) => row.join(' ')).join('\n'),
    blocks: blocks,
  );
}

void main() {
  test('a single layout price remains usable', () {
    final preview = _layoutReceipt();
    expect(preview.items.single.description, 'Water');
    expect(preview.items.single.lineTotal, '2.00');
    expect(preview.adjustmentsComplete, isTrue);
  });

  test('layout fallback cannot discard an alternative price', () {
    final preview = _layoutReceipt(outside: 'or USD 3.00 each');
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.blocks.any((b) => b.text == 'or USD 3.00 each'), isTrue);
  });

  for (final rtl in [false, true]) {
    for (final evidence in ['or USD 3.00 each', 'or JPY 300 each', '3.00']) {
      test('outside evidence $evidence remains unresolved, rtl=$rtl', () {
        final preview = _layoutReceipt(outside: evidence, rtl: rtl);
        expect(preview.adjustmentsComplete, isFalse);
        expect(preview.blocks.any((b) => b.text == evidence), isTrue);
      });
    }
    for (final marker in ['USD', r'$']) {
      test('matching outside marker $marker remains usable, rtl=$rtl', () {
        final preview = _layoutReceipt(outside: marker, rtl: rtl);
        expect(preview.items.single.lineTotal, '2.00');
        expect(preview.adjustmentsComplete, isTrue);
      });
    }
  }

  test('a simple uppercase issuer remains usable', () {
    final preview = const ReceiptOcrParser().parse(
      'ACME\nCoffee USD 2.00\nTotal USD 2.00',
    );
    expect(preview.merchant, 'ACME');
    expect(preview.adjustmentsComplete, isTrue);
  });

  test('an uppercase unpriced item cannot become merchant identity', () {
    final preview = const ReceiptOcrParser().parse(
      'ACME\nBOTTLED WATER\nCoffee USD 2.00\nTotal USD 2.00',
    );
    expect(preview.merchant, 'ACME');
    expect(
      preview.adjustmentsComplete,
      isFalse,
      reason:
          'items=${preview.items.map((item) => item.description).toList()}; '
          'warnings=${preview.warnings}; hints=${preview.reviewHints}',
    );
  });

  for (final item in ['BOTTLED WATER', 'GLASS', 'Bottled Water']) {
    test('unretained unpriced row $item keeps its warning', () {
      final preview = const ReceiptOcrParser().parse(
        'ACME\n$item\nCoffee USD 2.00\nTotal USD 2.00',
      );
      expect(preview.merchant, 'ACME');
      expect(preview.items.single.description, 'Coffee');
      expect(preview.adjustmentsComplete, isFalse);
    });
  }

  test('independently repeated uppercase identity supports a split issuer', () {
    final preview = const ReceiptOcrParser().parse(
      'ACME\nPROVISIONS\nACME PROVISIONS\n'
      'Coffee USD 2.00\nTotal USD 2.00',
    );
    expect(preview.merchant, 'ACME PROVISIONS');
    expect(preview.items.single.description, 'Coffee');
    expect(preview.adjustmentsComplete, isTrue);
  });

  test('buyer identity cannot corroborate an ambiguous issuer extension', () {
    final preview = const ReceiptOcrParser().parse(
      'ACME\nBOTTLED WATER\nBill To\nACME BOTTLED WATER\n'
      'Coffee USD 2.00\nTotal USD 2.00',
    );
    expect(preview.merchant, 'ACME');
    expect(preview.adjustmentsComplete, isFalse);
  });

  for (final kind in ['KITCHEN + BAR', 'BOUTIQUE', 'COFFEE ROASTERS']) {
    test('a complete business type corroborates a split issuer: $kind', () {
      final preview = const ReceiptOcrParser().parse(
        'NORTH POINT\n$kind\nCoffee USD 2.00\nTotal USD 2.00',
      );
      expect(preview.merchant, 'NORTH POINT $kind');
      expect(preview.items.single.description, 'Coffee');
      expect(preview.adjustmentsComplete, isTrue);
    });
  }

  for (final duration in ['3h 30m', '210m', '3 hours 30 minutes']) {
    test(
      'an independently corroborated activity duration stays usable: $duration',
      () {
        final preview = const ReceiptOcrParser().parse(
          'Example Garage\nEntry: 2026-10-15 10:12\nExit: 2026-10-15 13:42\n'
          'Duration $duration\nParking Fee USD 18.00\nTotal USD 18.00',
        );
        expect(preview.items.single.description, 'Parking Fee');
        expect(preview.adjustmentsComplete, isTrue);
      },
    );
  }

  for (final duration in ['3h 31m', '2h 90m', '3h 30m plus USD 2.00', '']) {
    test('unproven duration evidence remains reviewable: $duration', () {
      final preview = const ReceiptOcrParser().parse(
        'Example Garage\nEntry: 2026-10-15 10:12\nExit: 2026-10-15 13:42\n'
        'Duration $duration\nParking Fee USD 18.00\nTotal USD 18.00',
      );
      expect(preview.adjustmentsComplete, isFalse);
    });
  }

  test(
    'unpriced fuel description retained by fuel extraction is accounted for',
    () {
      final preview = const ReceiptOcrParser().parse(
        'Example Fuel\nFUEL Regular Unleaded\nGALLONS 2.000\n'
        'PRICE/GAL USD 3.000\nTotal USD 6.00',
      );
      expect(preview.items.single.description, 'Regular Unleaded');
      expect(preview.adjustmentsComplete, isTrue);
    },
  );
}
