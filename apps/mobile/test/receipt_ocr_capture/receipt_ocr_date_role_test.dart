import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrPreview _receipt(String fields, {bool geometry = false}) {
  final text = 'Boundary Cafe\n$fields\nTea USD 5.00\nTotal USD 5.00';
  return const ReceiptOcrParser().parse(
    text,
    blocks: geometry
        ? [
            for (final (i, line) in text.split('\n').indexed)
              ReceiptOcrBlockEvidence(
                text: line,
                row: i,
                order: i,
                points: [
                  ReceiptOcrPoint(x: 20, y: i * 24),
                  ReceiptOcrPoint(x: 440, y: i * 24),
                  ReceiptOcrPoint(x: 440, y: i * 24 + 16),
                  ReceiptOcrPoint(x: 20, y: i * 24 + 16),
                ],
              ),
          ]
        : const [],
  );
}

void _expectOrdinaryItem(ReceiptOcrPreview p) {
  expect(p.merchant, 'Boundary Cafe');
  expect(p.currency, 'USD');
  expect(p.total, '5.00');
  expect(p.items.map((i) => (i.description, i.lineTotal)), [('Tea', '5.00')]);
  expect(p.items.single.quantity, isNull);
  expect(p.items.single.unitPrice, isNull);
}

void main() {
  for (final geometry in [false, true]) {
    for (final field in [
      '日期: 2026年09月17日',
      '日付: 2026年9月17日',
      'Date: 2026年09月17日',
      '日期: 2026 年 09 月 17 日',
      '日期: 2026年09月17',
      '날짜: 2026. 09. 17',
      '날짜: 2026. 09. 17.',
      '날짜: 2026.09.17.',
      '日期: 2026 / 09 / 17',
      '日期: 2026 - 09 - 17',
      '日期: ２０２６／０９／１７',
      '日期: ２０２６年０９月１７日',
    ]) {
      test(
        'complete labeled date stays metadata: $field geometry=$geometry',
        () {
          final p = _receipt(field, geometry: geometry);
          _expectOrdinaryItem(p);
          expect(p.receiptDate, '2026-09-17');
          expect(p.adjustmentsComplete, isTrue);
          expect(p.incompleteAdjustmentReasons, isEmpty);
          expect(p.warnings, isEmpty);
          expect(p.reviewHints, isEmpty);
          expect(
            p.itemLineDecisions[1],
            ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
          );
          if (geometry) expect(p.blocks[1].text, field);
        },
      );
    }
  }

  for (final field in [
    '日期: 2026年02月31日',
    '日期: 2025年02月29日',
    '日期: 2026年13月17日',
    '日期: 2026年00月17日',
    '日期: 2026年09月00日',
    '날짜: 2026. 02. 31.',
    '日期: 2026年09月',
    '日期: 2026□09□17□',
    '日期: 2026·0917',
    '日期: 2026·9017',
    '日付: 2026·90170',
    'Datum2026/09/17',
  ]) {
    test('unproven date does not gain metadata ownership: $field', () {
      final p = _receipt(field);
      expect(p.receiptDate, isNull);
      expect(
        p.itemLineDecisions[1],
        isNot(ReceiptOcrItemLineDecision.metadataOrHeaderSkipped),
      );
    });
  }

  test('compact digits do not supply a reconstructed date', () {
    expect(_receipt('日期: 20260917').receiptDate, isNull);
  });

  for (final field in [
    '日期: 2026/09-17',
    '날짜: 2026. 09 / 17.',
    'Datum: 2026-09.17',
  ]) {
    test('mixed calendar separators remain reviewable: $field', () {
      final p = _receipt(field);
      expect(
        p.itemLineDecisions[1],
        isNot(ReceiptOcrItemLineDecision.metadataOrHeaderSkipped),
      );
      expect(p.reviewHints, isNotEmpty);
    });
  }

  for (final field in ['日期: 2026 - 02 - 31', '日期: 2026 - 09 - 17 USD - 4.00']) {
    test('date-like evidence cannot erase a real detached sign: $field', () {
      final p = _receipt(field);
      expect(
        p.incompleteAdjustmentReasons,
        contains(ReceiptOcrIncompleteAdjustmentReason.detachedAmountSign),
      );
      expect(p.reviewHints, isNotEmpty);
    });
  }

  test('leap date remains supported without using calendar rollover', () {
    final p = _receipt('日期: 2024年02月29日');
    _expectOrdinaryItem(p);
    expect(p.receiptDate, '2024-02-29');
    expect(p.reviewHints, isEmpty);
  });

  for (final fields in [
    '日期: 2026年09月17日\n日付: 2026年09月18日',
    '날짜: 2026. 09. 17.\n날짜: 2026. 09. 18.',
    'Receipt date: 2026-09-17\n日期: 2026年09月18日',
    '日期: 2026年09月17日\nReceipt date: 2026-09-18',
    '日期: 2026/09/17\n日期: 2026年09月18日',
  ]) {
    test('different complete document dates stay unresolved: $fields', () {
      final p = _receipt(fields);
      _expectOrdinaryItem(p);
      expect(p.receiptDate, isNull);
      expect(p.warnings, contains(contains('Conflicting receipt dates')));
    });
  }

  test('equivalent repeated date formats do not create a conflict', () {
    final p = _receipt(
      '日期: 2026年9月17日\n날짜: 2026. 09. 17.\nReceipt date: 2026-09-17',
    );
    _expectOrdinaryItem(p);
    expect(p.receiptDate, '2026-09-17');
    expect(p.warnings, isEmpty);
    expect(p.reviewHints, isEmpty);
  });

  for (final generic in [
    '日期: 2026年09月17日',
    '날짜: 2026. 09. 17.',
    'Date: 2026/09/17',
  ]) {
    for (final role in ['Bill', 'Invoice', 'Statement']) {
      for (final genericFirst in [true, false]) {
        test(
          'generic date does not outrank $role date: $generic first=$genericFirst',
          () {
            final specific = '$role date: 2026-09-19';
            final p = _receipt(
              genericFirst ? '$generic\n$specific' : '$specific\n$generic',
            );
            _expectOrdinaryItem(p);
            expect(p.receiptDate, '2026-09-19');
            expect(p.warnings, isEmpty);
            expect(p.reviewHints, isEmpty);
          },
        );
      }
    }
  }

  test('due, prior and stay dates do not conflict with the document date', () {
    final p = _receipt(
      'Due date: 2026-09-30\nPrior receipt date: 2026-08-17\nStay 2026-09-15 to 2026-09-16\n日期: 2026年09月17日',
    );
    expect(p.receiptDate, '2026-09-17');
    expect(p.warnings, isNot(contains(contains('Conflicting receipt dates'))));
  });

  test('multiple date values on one row do not become a whole date field', () {
    final p = _receipt('日期: 2026年09月17日 2026年09月18日');
    expect(
      p.itemLineDecisions[1],
      isNot(ReceiptOcrItemLineDecision.metadataOrHeaderSkipped),
    );
    expect(p.reviewHints, isNotEmpty);
  });

  for (final description in [
    '日期: 2026年09月17日',
    '날짜: 2026. 09. 17.',
    'Calendar 2026年09月17日',
    '日期 Tea 2026年09月17日',
    '2 Pack 2026年09月17日',
  ]) {
    test('a separate price prevents date metadata ownership: $description', () {
      final p = const ReceiptOcrParser().parse(
        'Boundary Cafe\n$description USD 4.00\nTotal USD 4.00',
      );
      expect(p.items.map((i) => (i.description, i.lineTotal)), [
        (description, '4.00'),
      ]);
      expect(p.items.single.quantity, isNull);
      expect(
        p.itemLineDecisions[1],
        isNot(ReceiptOcrItemLineDecision.metadataOrHeaderSkipped),
      );
    });
  }

  test('multiple dated product lines cannot create document date authority', () {
    final p = const ReceiptOcrParser().parse(
      'Boundary Cafe\n日期 Tea 2026年09月17日 USD 4.00\nCalendar 2026年09月18日 USD 6.00\nReceipt date: 2026-09-19\nTotal USD 10.00',
    );
    expect(p.receiptDate, '2026-09-19');
    expect(p.items.map((i) => i.lineTotal), ['4.00', '6.00']);
    expect(p.warnings, isNot(contains(contains('Conflicting receipt dates'))));
  });

  test('real financial rows remain owned alongside a complete date', () {
    final p = const ReceiptOcrParser().parse(
      'Boundary Cafe\n날짜: 2026. 09. 17.\nTea USD 5.00\nSubtotal USD 5.00\nTax USD 0.50\nService USD 0.25\nTotal USD 5.75',
    );
    expect(p.receiptDate, '2026-09-17');
    expect(p.items.single.description, 'Tea');
    expect(p.tax, '0.50');
    expect(p.service, '0.25');
    expect(p.total, '5.75');
    expect(p.adjustmentsComplete, isTrue);
    expect(p.reviewHints, isEmpty);
  });

  test('genuine arithmetic review survives complete date recognition', () {
    final p = const ReceiptOcrParser().parse(
      'Boundary Cafe\n日期: 2026年09月17日\nTea USD 5.00\nSubtotal USD 5.00\nTax USD 0.50\nTotal USD 9.00',
    );
    expect(p.receiptDate, '2026-09-17');
    expect(p.tax, '0.50');
    expect(p.total, '9.00');
    expect(p.reviewHints, isNotEmpty);
  });

  for (final suffix in ['', ' USD 4.00', ' 123', ' USD', ' + 4']) {
    test(
      'whole-date ownership preserves the existing address boundary: $suffix',
      () {
        final p = _receipt('上海市浦东新区世纪大道88号\n日期: 2026年09月17日$suffix');
        if (suffix.isEmpty) {
          _expectOrdinaryItem(p);
          expect(p.reviewHints, isEmpty);
          expect(
            p.itemLineDecisions[1],
            ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
          );
        } else {
          expect(
            p.itemLineDecisions[1],
            isNot(ReceiptOcrItemLineDecision.metadataOrHeaderSkipped),
          );
          expect(p.reviewHints, isNotEmpty);
        }
      },
    );
  }
}
