import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrPreview _parse(List<String> lines, {bool layout = false}) {
  final blocks = <ReceiptOcrBlockEvidence>[];
  if (layout) {
    for (var row = 0; row < lines.length; row++) {
      // Split date labels from their value to exercise reconstructed rows.
      final parts = lines[row].split(': ');
      if (parts.length > 1) parts[0] = '${parts[0]}:';
      final extraPrice = RegExp(
        r'^(.*?)(\s+(?:USD\s+)?3\.00)$',
      ).firstMatch(parts.last);
      if (extraPrice != null) {
        parts.removeLast();
        parts.addAll([extraPrice.group(1)!, extraPrice.group(2)!.trim()]);
      }
      for (var column = 0; column < parts.length; column++) {
        final left = row == lines.length - 1 ? 190.0 : 40.0 + column * 300;
        final top = 50.0 + row * 45;
        blocks.add(
          ReceiptOcrBlockEvidence(
            text: parts[column],
            order: blocks.length,
            row: row,
            points: [
              ReceiptOcrPoint(x: left, y: top),
              ReceiptOcrPoint(x: left + 250, y: top),
              ReceiptOcrPoint(x: left + 250, y: top + 20),
              ReceiptOcrPoint(x: left, y: top + 20),
            ],
          ),
        );
      }
    }
  }
  return const ReceiptOcrParser().parse(lines.join('\n'), blocks: blocks);
}

void main() {
  // Visible-source transcriptions, not retained native OCR output. The native
  // failure envelope reports only counts and field names, not raw text/boxes.
  for (final layout in [false, true]) {
    test(
      'localized header preserves complete German draft (layout $layout)',
      () {
        final p = _parse([
          'Berlin Markt',
          'Friedrichstraße 25, Berlin',
          'Datum: 17.09.2026',
          'Currywurst 8,90 EUR',
          'Wasser 2,50 EUR',
          'Zwischensumme 11,40 EUR',
          'MwSt. 2,17 EUR',
          'Gesamt 13,57 EUR',
          'Vielen Dank',
        ], layout: layout);
        expect(p.merchant, 'Berlin Markt');
        expect(p.receiptDate, '2026-09-17');
        expect(p.currency, 'EUR');
        expect(p.currencyProvenance, ReceiptOcrCurrencyProvenance.explicit);
        expect(
          [p.subtotal, p.tax, p.service, p.discount, p.total],
          ['11.40', '2.17', null, null, '13.57'],
        );
        expect(
          p.items
              .map(
                (x) => [
                  x.description,
                  x.lineTotal,
                  x.currency,
                  x.quantity,
                  x.unitPrice,
                  x.currencyUnresolved,
                ],
              )
              .toList(),
          [
            ['Currywurst', '8.90', 'EUR', null, null, false],
            ['Wasser', '2.50', 'EUR', null, null, false],
          ],
        );
        expect(p.adjustmentsComplete, isTrue);
        expect(p.incompleteAdjustmentReasons, isEmpty);
        expect(p.warnings, isEmpty);
        expect(p.reviewHints, isEmpty);
        expect(p.reviewHintDecision, ReceiptOcrReviewDecision.none);
      },
    );
    test(
      'localized header preserves complete Taiwan draft (layout $layout)',
      () {
        final p = _parse([
          '台北好味食堂',
          '台北市中山區民生東路100號',
          '日期: 2026/09/17',
          '牛肉麵 TWD 120',
          '紅茶 TWD 30',
          '小計 TWD 150',
          '服務費 TWD 15',
          '稅額 TWD 8',
          '總計 TWD 173',
          '謝謝光臨',
        ], layout: layout);
        expect(p.merchant, '台北好味食堂');
        expect(p.receiptDate, '2026-09-17');
        expect(p.currency, 'TWD');
        expect(p.currencyProvenance, ReceiptOcrCurrencyProvenance.explicit);
        expect(
          [p.subtotal, p.tax, p.service, p.discount, p.total],
          ['150', '8', '15', null, '173'],
        );
        expect(
          p.items
              .map(
                (x) => [
                  x.description,
                  x.lineTotal,
                  x.currency,
                  x.quantity,
                  x.unitPrice,
                  x.currencyUnresolved,
                ],
              )
              .toList(),
          [
            ['牛肉麵', '120', 'TWD', null, null, false],
            ['紅茶', '30', 'TWD', null, null, false],
          ],
        );
        expect(p.adjustmentsComplete, isTrue);
        expect(p.incompleteAdjustmentReasons, isEmpty);
        expect(p.warnings, isEmpty);
        expect(p.reviewHints, isEmpty);
        expect(p.reviewHintDecision, ReceiptOcrReviewDecision.none);
      },
    );
  }

  test('complete localized calendar fields are metadata across labels', () {
    for (final label in [
      'Datum',
      'Fecha',
      'Data',
      '日期',
      '日付',
      '날짜',
      'Дата',
      'วันที่',
      'तारीख',
    ]) {
      final p = _parse([
        'Corner Market',
        '$label: 2026/09/17',
        'Tea USD 2.00',
        'Subtotal USD 2.00',
        'Total USD 2.00',
      ]);
      expect(p.receiptDate, '2026-09-17', reason: label);
      expect(p.items.single.description, 'Tea', reason: label);
      expect(p.incompleteAdjustmentReasons, isEmpty, reason: label);
      expect(p.reviewHints, isEmpty, reason: label);
    }
  });

  test('invalid, incomplete, or mixed date fields remain reviewable', () {
    for (final layout in [false, true]) {
      for (final field in [
        'Datum: 2026/02/30',
        'Datum: 2026/09',
        'Datum: 2026/09-17',
        'Datum: 2026□09□17□',
        'Datum: 2026/09/17 USD 3.00',
        'Datum: 2026/09/17 3.00',
        'Datum tea 2026/09/17',
        '日期: 2026/09/17 押金 3.00',
      ]) {
        final p = _parse([
          'Corner Market',
          field,
          'Tea USD 2.00',
          'Subtotal USD 2.00',
          'Total USD 2.00',
        ], layout: layout);
        expect(
          p.itemLineDecisions[1],
          isNot(ReceiptOcrItemLineDecision.metadataOrHeaderSkipped),
          reason: '$field layout=$layout',
        );
        expect(p.reviewHints, isNotEmpty, reason: '$field layout=$layout');
        if (field.contains('3.00')) {
          final retained = p.items.where((item) => item.lineTotal == '3.00');
          expect(retained, hasLength(1), reason: '$field layout=$layout');
          expect(retained.single.currency, 'USD');
          expect(
            retained.single.description,
            field.replaceFirst(RegExp(r'\s+(?:USD\s+)?3\.00$'), ''),
          );
          expect(
            p.reviewHintDecision,
            ReceiptOcrReviewDecision.subtotalMismatch,
          );
        }
      }
    }
  });

  test('localized address needs adjacent merchant and complete date', () {
    for (final layout in [false, true]) {
      for (final address in ['Lindenstraße 42, Bremen', '新竹市東區林森路23號']) {
        final p = _parse([
          'Corner Market',
          address,
          'Datum: 2026/09/17',
          'Tea USD 2.00',
          'Subtotal USD 2.00',
          'Total USD 2.00',
        ], layout: layout);
        expect(p.incompleteAdjustmentReasons, isEmpty, reason: address);
        for (final rows in [
          ['Corner Market', 'Tea USD 2.00', address, 'Datum: 2026/09/17'],
          ['Corner Market', address, 'Tea USD 2.00'],
          ['Corner Market', address, 'Datum: 2026/02/30', 'Tea USD 2.00'],
          [
            'Corner Market',
            '$address USD 3.00',
            'Datum: 2026/09/17',
            'Tea USD 2.00',
          ],
        ]) {
          final q = _parse([
            ...rows,
            'Subtotal USD 2.00',
            'Total USD 2.00',
          ], layout: layout);
          final addressIndex = rows.indexWhere(
            (row) => row.startsWith(address),
          );
          expect(
            q.itemLineDecisions[addressIndex],
            isNot(ReceiptOcrItemLineDecision.metadataOrHeaderSkipped),
            reason: '${rows.join(' | ')} layout=$layout',
          );
          expect(q.reviewHints, isNotEmpty, reason: rows.join(' | '));
          if (rows[addressIndex].endsWith('3.00')) {
            final retained = q.items.where((item) => item.lineTotal == '3.00');
            expect(retained, hasLength(1));
            expect(retained.single.description, address);
            expect(retained.single.currency, 'USD');
            expect(
              q.reviewHintDecision,
              ReceiptOcrReviewDecision.subtotalMismatch,
            );
          }
        }
      }
    }
  });

  test('valid header never clears an unrelated missing item or adjustment', () {
    for (final unresolved in ['Unpriced pastry', '+ Extra milk', 'Discount']) {
      final p = _parse([
        'Corner Market',
        'Lindenstraße 42, Bremen',
        'Datum: 2026/09/17',
        'Tea USD 2.00',
        unresolved,
        'Subtotal USD 2.00',
        'Total USD 2.00',
      ]);
      expect(p.reviewHints, isNotEmpty, reason: unresolved);
      expect(p.incompleteAdjustmentReasons, isNotEmpty, reason: unresolved);
      expect(p.items.single.description, 'Tea');
      expect(p.total, '2.00');
    }
  });
}
