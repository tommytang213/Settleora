import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';

void main() {
  for (final label in ['消費稅', '稅']) {
    for (final (cell, amount, currency) in [
      ('USD1.50', '1.50', 'USD'),
      ('1.50USD', '1.50', 'USD'),
      ('USD1.50USD', '1.50', 'USD'),
      ('(10%) USD1.50', '1.50', 'USD'),
      ('(10%) 1.50USD', '1.50', 'USD'),
      ('(10%) USD1', '1', 'USD'),
      ('(10%) 1USD', '1', 'USD'),
      ('USD-1.50', '-1.50', 'USD'),
      ('-1.50USD', '-1.50', 'USD'),
      ('usd1.50', '1.50', 'USD'),
      ('1.50usd', '1.50', 'USD'),
      ('USD1,234.50', '1234.50', 'USD'),
      ('1.234,50EUR', '1234.50', 'EUR'),
    ]) {
      test(
        'traditional tax consumes its whole monetary cell: $label $cell',
        () {
          final preview = const ReceiptOcrParser().parse(
            'Cafe\nDate: 2026/08/15\nTea USD 15.00\n'
            'Subtotal USD 15.00\n$label $cell\nTotal USD 16.50',
          );
          expect(preview.tax, amount);
          expect(preview.taxCurrency, currency);
          expect(preview.taxHasExplicitCurrencyEvidence, isTrue);
          expect(preview.items.single.lineTotal, '15.00');
        },
      );
    }
  }

  test('opposed attached denominations retain unresolved currency', () {
    final preview = const ReceiptOcrParser().parse(
      'Cafe\nDate: 2026/08/15\nTea USD 15.00\n'
      'Subtotal USD 15.00\n消費稅 USD1.50EUR\nTotal USD 16.50',
    );
    expect(preview.tax, '1.50');
    expect(preview.taxCurrency, isNull);
    expect(preview.taxHasExplicitCurrencyEvidence, isTrue);
    expect(preview.reviewHints, isNotEmpty);
  });

  for (final label in ['消費稅', '稅']) {
    for (final row in [
      '$label JPY 50',
      '$label 50 JPY',
      '$label：50',
      '$label (10%) JPY 50',
      '$label（10％）ＪＰＹ ５０',
    ]) {
      test('a complete traditional tax label owns its amount: $row', () {
        final preview = const ReceiptOcrParser().parse(
          '喫茶店\nDate: 2026/08/15\nお茶 JPY 500\n'
          '小計 JPY 500\n$row\n合計 JPY 550',
        );
        expect(preview.tax, '50');
        expect(preview.items.single.description, 'お茶');
        expect(preview.items.single.lineTotal, '500');
        expect(preview.subtotal, '500');
        expect(preview.total, '550');
        expect(preview.adjustmentsComplete, isTrue);
        expect(preview.reviewHints, isEmpty);
      });
    }
  }

  for (final description in [
    '消費稅参考書',
    '稅の手引き',
    '免稅品',
    '消費稅 Book',
    '消費稅 10% Book',
  ]) {
    test('tax glyphs inside a product do not create tax: $description', () {
      final preview = const ReceiptOcrParser().parse(
        '書店\nDate: 2026/08/15\n$description JPY 500\n合計 JPY 500',
      );
      expect(preview.tax, isNull);
      expect(preview.items.single.description, description);
      expect(preview.items.single.lineTotal, '500');
    });
  }

  test('an unknown suffix remains visible instead of becoming tax', () {
    final preview = const ReceiptOcrParser().parse(
      '喫茶店\nDate: 2026/08/15\nお茶 JPY 500\n'
      '小計 JPY 500\n消費稅 JPY 50 pending\n合計 JPY 550',
    );
    expect(preview.tax, isNull);
    expect(preview.reviewHints, isNotEmpty);
    expect(preview.adjustmentsComplete, isFalse);
  });

  for (final row in [
    '消費稅 JPY 50 JPY 60',
    '消費稅 10%',
    '消費稅 50.12.3',
    '消費稅 ZZZ 50',
    '消費稅 JPY - 50',
    '消費稅',
    '消費稅 USD1.50guide',
    '消費稅 USD1.50 2.00',
    '消費稅 USD1.50.2',
  ]) {
    test('incomplete or ambiguous traditional tax stays reviewable: $row', () {
      final preview = const ReceiptOcrParser().parse(
        '喫茶店\nDate: 2026/08/15\nお茶 JPY 500\n'
        '小計 JPY 500\n$row\n合計 JPY 550',
      );
      expect(preview.tax, isNull);
      expect(preview.items.first.description, 'お茶');
      expect(preview.items.first.lineTotal, '500');
      expect(preview.reviewHints, isNotEmpty);
      expect(preview.adjustmentsComplete, isFalse);
    });
  }

  test(
    'a foreign-currency tax retains its printed denomination for review',
    () {
      final preview = const ReceiptOcrParser().parse(
        '喫茶店\nDate: 2026/08/15\nお茶 JPY 500\n'
        '小計 JPY 500\n消費稅 USD 1.00\n合計 JPY 550',
      );
      expect(preview.tax, '1.00');
      expect(preview.taxCurrency, 'USD');
      expect(preview.taxHasExplicitCurrencyEvidence, isTrue);
      expect(preview.reviewHints, isNotEmpty);
      final existingGlyph = const ReceiptOcrParser().parse(
        '喫茶店\nDate: 2026/08/15\nお茶 JPY 500\n'
        '小計 JPY 500\n消費税 USD 1.00\n合計 JPY 550',
      );
      // Adjustment completeness and currency conflict are separate gates.
      expect(preview.currency, existingGlyph.currency);
      expect(preview.currencyProvenance, existingGlyph.currencyProvenance);
      expect(preview.adjustmentsComplete, existingGlyph.adjustmentsComplete);
      expect(preview.reviewHintDecision, existingGlyph.reviewHintDecision);
      expect(preview.reviewHints, existingGlyph.reviewHints);
    },
  );

  test('conflicting traditional tax rows keep the existing ambiguity gate', () {
    final preview = const ReceiptOcrParser().parse(
      '喫茶店\nDate: 2026/08/15\nお茶 JPY 500\n小計 JPY 500\n'
      '消費稅 JPY 50\n消費稅 JPY 60\n合計 JPY 550',
    );
    expect(preview.items.single.description, 'お茶');
    expect(preview.reviewHints, isNotEmpty);
    expect(preview.adjustmentsComplete, isFalse);
  });
}
