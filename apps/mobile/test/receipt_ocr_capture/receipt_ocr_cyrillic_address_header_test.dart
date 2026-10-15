import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

List<String> _rows({
  String address = 'Лесной проспект 42, Великий Город',
  String date = 'Дата: 24.10.2026',
  bool phone = false,
}) => [
  'Cedar Pier Kitchen',
  address,
  if (phone) 'Tel +852 2468 1357',
  date,
  'Soup HKD 8.00',
  'Rice HKD 12.00',
  'Subtotal HKD 20.00',
  'Tax HKD 2.00',
  'Total HKD 22.00',
  'Thank you',
];

ReceiptOcrPreview _parse(
  List<String> rows,
  bool layout, {
  bool ambiguousFooter = false,
}) {
  final blocks = <ReceiptOcrBlockEvidence>[
    if (layout)
      for (var i = 0; i < rows.length; i++)
        ReceiptOcrBlockEvidence(
          text: rows[i],
          confidence: 0.95,
          order: i,
          row: i,
          points: [
            ReceiptOcrPoint(
              x: i == rows.length - 1 && !ambiguousFooter ? 190 : 30,
              y: 30.0 + i * 40,
            ),
            ReceiptOcrPoint(
              x: i == rows.length - 1 && !ambiguousFooter ? 370 : 530,
              y: 30.0 + i * 40,
            ),
            ReceiptOcrPoint(
              x: i == rows.length - 1 && !ambiguousFooter ? 370 : 530,
              y: 50.0 + i * 40,
            ),
            ReceiptOcrPoint(
              x: i == rows.length - 1 && !ambiguousFooter ? 190 : 30,
              y: 50.0 + i * 40,
            ),
          ],
        ),
  ];
  final result = const ReceiptOcrParser().parse(
    rows.join('\n'),
    blocks: blocks,
  );
  expect(result.blocks, blocks);
  expect(result.rawTextLineCount, rows.length);
  return result;
}

void main() {
  test('address ownership preserves an unproven item-aligned footer', () {
    final p = _parse(_rows(), true, ambiguousFooter: true);
    expect(
      p.itemLineDecisions[1],
      ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
    );
    expect(
      p.incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
    );
    expect(p.reviewHints, isNotEmpty);
  });

  for (final layout in [false, true]) {
    for (final address in [
      'Лесной проспект 42, Великий Город',
      'Озёрная улица 7а, Новый-Город',
      'Северный бульвар 18, Старый Город',
      'Зелёный переулок 9, Южный Город',
      'Речной проезд 3, Верхний Город',
      'Береговое шоссе 81, Малый Город',
    ]) {
      for (final phone in [false, true]) {
        test('complete Cyrillic street header $address $phone $layout', () {
          final rows = _rows(address: address, phone: phone);
          final p = _parse(rows, layout);
          expect(p.merchant, 'Cedar Pier Kitchen');
          expect(p.receiptDate, '2026-10-24');
          expect(p.currency, 'HKD');
          expect(p.items.map((i) => [i.description, i.lineTotal]), [
            ['Soup', '8.00'],
            ['Rice', '12.00'],
          ]);
          expect([p.subtotal, p.tax, p.total], ['20.00', '2.00', '22.00']);
          expect(
            p.itemLineDecisions[1],
            ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
          );
          expect(
            p.adjustmentsComplete,
            isTrue,
            reason: p.incompleteAdjustmentReasons.map((x) => x.name).join(','),
          );
          expect(p.incompleteAdjustmentReasons, isEmpty);
          expect(p.warnings, isEmpty);
          expect(p.reviewHints, isEmpty);
          final saved = receiptOcrReviewSaveRequestFromPreview(
            p,
            originalCurrency: p.currency,
          );
          expect(saved, isNotNull);
          expect(saved!.grandTotalAmount, '22.00');
          expect(saved.taxAmount, '2.00');
          expect(saved.lines.map((x) => x.lineTotalAmount), ['8.00', '12.00']);
        });
      }
    }
    for (final address in [
      'Лесной проспект HKD 42, Великий Город',
      'Лесной проспект 42 RUB, Великий Город',
      'Лесной проспект 42, Великий Город USD 3.00',
      'Лесной проспект 42.50, Великий Город',
      'Лесной проспект -42, Великий Город',
      'Лесной проспект 0, Великий Город',
      'Лесной проспект 42 50, Великий Город',
      'Лесной проспект 42',
      'Лесной 42, Великий Город',
      'Лесной проспект 42,',
      'Лесной проспект 42, Великий Город 2x',
      'Лесной проспект 42, Великий Город tax',
      '+ Лесной проспект 42, Великий Город',
      'Лесной проспект 42, Великий Город 3',
      'Лесной проспект 42, Великий Город ₫',
    ]) {
      test(
        'Cyrillic address cannot own money or incomplete form $address $layout',
        () {
          final p = _parse(_rows(address: address), layout);
          // Existing tax classification can own the row as adjustment evidence;
          // it must retain the conflicting adjustment's review requirement.
          if (!address.endsWith(' tax')) {
            expect(
              p.itemLineDecisions[1],
              isNot(ReceiptOcrItemLineDecision.metadataOrHeaderSkipped),
            );
          } else {
            expect(p.incompleteAdjustmentReasons, isNotEmpty);
          }
          expect(p.reviewHints, isNotEmpty);
          expect(p.total, '22.00');
        },
      );
    }
    for (final date in [
      'Дата: 2026.99.04',
      'Дата: 2026.10',
      'Дата: 2026/10-04',
      'Дата: 2026-10-04 HKD 3.00',
      '2026-10-04',
      'Tea 2026-10-04',
    ]) {
      test(
        'Cyrillic address requires a complete labeled date $date $layout',
        () {
          final p = _parse(_rows(date: date), layout);
          expect(
            p.itemLineDecisions[1],
            isNot(ReceiptOcrItemLineDecision.metadataOrHeaderSkipped),
          );
          expect(p.reviewHints, isNotEmpty);
        },
      );
    }
    for (final index in [2, 3, 6]) {
      test('body Cyrillic address stays reviewable $index $layout', () {
        final rows = _rows();
        final address = rows.removeAt(1);
        rows.insert(index, address);
        final p = _parse(rows, layout);
        expect(
          p.itemLineDecisions[index],
          isNot(ReceiptOcrItemLineDecision.metadataOrHeaderSkipped),
        );
        expect(p.reviewHints, isNotEmpty);
      });
    }
    test(
      'Cyrillic address does not hide a separate missing adjustment $layout',
      () {
        final rows = _rows()..remove('Tax HKD 2.00');
        final p = _parse(rows, layout);
        expect(p.tax, isNull);
        expect(p.reviewHints, isNotEmpty);
        expect(p.items.length, 2);
        expect(p.total, '22.00');
      },
    );
  }
}
