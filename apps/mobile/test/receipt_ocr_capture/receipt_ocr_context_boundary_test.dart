import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

// Generic mutations of source-visible address/date and courtesy roles. Raw
// device captures remain private; no fixture or merchant names are rules.
ReceiptOcrPreview parseRows(List<String> rows, {bool layout = true}) {
  final blocks = <ReceiptOcrBlockEvidence>[];
  if (layout) {
    for (var i = 0; i < rows.length; i++) {
      final footer = i == rows.length - 1;
      final left = footer ? 390.0 : 60.0;
      final right = footer ? 650.0 : 960.0;
      blocks.add(
        ReceiptOcrBlockEvidence(
          text: rows[i],
          order: i,
          row: i,
          points: [
            ReceiptOcrPoint(x: left, y: i * 45.0),
            ReceiptOcrPoint(x: right, y: i * 45.0),
            ReceiptOcrPoint(x: right, y: i * 45.0 + 20),
            ReceiptOcrPoint(x: left, y: i * 45.0 + 20),
          ],
        ),
      );
    }
  }
  return const ReceiptOcrParser().parse(rows.join('\n'), blocks: blocks);
}

void main() {
  final headers = <({String address, String date, String footer})>[
    (
      address: 'Av. Central 42, Villa Nueva',
      date: 'Fecha: 17/09/2026',
      footer: 'Gracias por su compra',
    ),
    (address: '大阪府中央区2-3', date: '日付2026-09-17', footer: 'ありがとうございました'),
    (address: '深圳市南山区人民大道23号', date: '日期2026-09-17', footer: '谢谢惠顾'),
    (
      address: 'बाजार प्लेस, नया नगर',
      date: 'दिनांक: 17/09/2026',
      footer: 'धन्यवाद',
    ),
    (
      address: 'ถนนกลาง เมืองเหนือ',
      date: 'วันที่ 17/09/2026',
      footer: 'ขอบคุณ',
    ),
  ];
  for (final layout in [false, true]) {
    for (var i = 0; i < headers.length; i++) {
      final h = headers[i];
      test('complete localized receipt context $i layout=$layout', () {
        final rows = [
          'Corner Market',
          h.address,
          h.date,
          'Tea USD 2.00',
          'Cake USD 3.00',
          'Subtotal USD 5.00',
          'Tax USD 0.50',
          'Total USD 5.50',
          h.footer,
        ];
        final p = parseRows(rows, layout: layout);
        expect(p.merchant, 'Corner Market');
        expect(p.receiptDate, '2026-09-17');
        expect(p.currency, 'USD');
        expect([p.subtotal, p.tax, p.total], ['5.00', '0.50', '5.50']);
        expect(p.items.map((x) => [x.description, x.lineTotal]), [
          ['Tea', '2.00'],
          ['Cake', '3.00'],
        ]);
        expect(p.adjustmentsComplete, isTrue);
        expect(p.reviewHints, isEmpty);
        expect(p.warnings, isEmpty);
        if (layout) expect(p.blocks.map((x) => x.text), rows);
      });
      for (final mutation in [
        'no date',
        'invalid date',
        'body',
        'priced',
        'fee',
        'modifier',
        'missing item',
      ]) {
        test('localized context $i keeps $mutation layout=$layout', () {
          var address = h.address;
          if (mutation == 'priced') address += ' USD 3.00';
          if (mutation == 'fee') address = 'Service Fee $address';
          if (mutation == 'modifier') address = '+ $address';
          final rows = [
            'Corner Market',
            if (mutation == 'body') 'Tea USD 2.00',
            address,
            if (mutation != 'no date')
              mutation == 'invalid date' ? 'Date: 2026/02/30' : h.date,
            if (mutation != 'body') 'Tea USD 2.00',
            if (mutation == 'missing item') 'Unpriced pastry',
            'Subtotal USD 2.00',
            'Total USD 2.00',
            h.footer,
          ];
          final p = parseRows(rows, layout: layout);
          if (mutation == 'no date' && (i == 3 || i == 4)) {
            // Existing wrapping may retain these unpriced words in the next
            // item. They must not disappear as a newly accepted address.
            expect(p.items.first.description, contains(address));
          } else {
            expect(p.reviewHints, isNotEmpty, reason: rows.join('\n'));
          }
          if (mutation == 'priced') {
            expect(p.items.where((x) => x.lineTotal == '3.00'), hasLength(1));
          }
          if (layout) expect(p.blocks.map((x) => x.text), rows);
        });
      }
    }
    for (final footer in [
      'Thanks',
      'Thankyou/Gracias/多謝',
      'ありがとうございました',
      '谢谢惠顾',
      'Gracias por su compra',
    ]) {
      test('known final courtesy $footer layout=$layout', () {
        final p = parseRows([
          'Corner Market',
          'Tea USD 2.00',
          'Subtotal USD 2.00',
          'Total USD 2.00',
          footer,
        ], layout: layout);
        expect(p.reviewHints, isEmpty);
        expect(p.items.single.description, 'Tea');
      });
      for (final mutation in [
        'before total',
        'additional item',
        'unknown segment',
        'priced',
        'adjacent amount',
      ]) {
        test('courtesy $footer keeps $mutation layout=$layout', () {
          final rows = [
            'Corner Market',
            'Tea USD 2.00',
            if (mutation == 'before total') footer,
            'Subtotal USD 2.00',
            'Total USD 2.00',
            if (mutation == 'additional item') 'Gift USD 3.00',
            if (mutation != 'before total')
              '$footer${mutation == 'unknown segment'
                  ? '/Gift'
                  : mutation == 'priced'
                  ? ' USD 3.00'
                  : ''}',
            if (mutation == 'adjacent amount') 'USD 3.00',
          ];
          final p = parseRows(rows, layout: layout);
          expect(p.reviewHints, isNotEmpty);
        });
      }
    }
  }
  test('missing currency stays unresolved after courtesy classification', () {
    final p = parseRows([
      'Corner Market',
      'Date 2026-09-17',
      'Item 45 kr',
      'Total 45 kr',
      'Thanks',
    ]);
    expect(p.currency, isNull);
    expect(p.items.single.currency, isNull);
    expect(p.items.single.currencyUnresolved, isTrue);
    expect(p.warnings, isNotEmpty);
    expect(p.incompleteAdjustmentReasons, isEmpty);
  });
}
