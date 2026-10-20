import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

import '../support/brand_copy_receipt.dart';

void main() {
  void unchangedFields(ReceiptOcrPreview p) {
    expect(p.merchant, 'Oak Lantern Market');
    expect(p.currency, 'USD');
    expect([p.subtotal, p.tax, p.total], ['10.00', '1.00', '11.00']);
    expect(p.items.map((i) => [i.description, i.lineTotal]), [
      ['Tea', '3.50'],
      ['Bread', '6.50'],
    ]);
  }

  for (final scale in [0.5, 1.0, 2.0]) {
    test('address-backed centered header caption at scale $scale', () {
      final blocks = brandCopyBlocks(
        caption: 'Better food. Brighter days.',
        scale: scale,
      );
      final p = parseBrandCopy(blocks);
      unchangedFields(p);
      expect(p.reviewHints, isEmpty);
      expect(p.warnings, isEmpty);
      expect(p.blocks, blocks);
      expect(p.rawTextLineCount, blocks.length);
    });
  }

  for (final condition in [
    'no layout',
    'no address',
    'no postal',
    'small logo',
    'low confidence',
    'left aligned',
    'body',
    'priced',
    'modifier',
    'adjustment',
    'unpriced product',
    'quantity',
    'additional unpriced item',
  ]) {
    test('header caption retains $condition ambiguity', () {
      var caption = 'Better food. Brighter days.';
      if (condition == 'priced') caption += ' USD 3.00';
      if (condition == 'modifier') caption = '+ $caption';
      if (condition == 'adjustment') caption = 'Discount. Brighter days.';
      if (condition == 'unpriced product') {
        caption = 'Chocolate Cookie. Family Size.';
      }
      if (condition == 'quantity') caption = 'Better food 2. Brighter days.';
      final blocks = brandCopyBlocks(
        caption: condition == 'body' ? null : caption,
        address: condition != 'no address',
        postal: condition != 'no postal',
        logoHeight: condition == 'small logo' ? 40 : 90,
        confidence: condition == 'low confidence' ? 0.3 : 0.98,
        captionLeft: condition == 'left aligned' ? 40 : 300,
        beforeItems: [
          if (condition == 'additional unpriced item') '+ Extra cheese',
        ],
        afterItems: [if (condition == 'body') caption],
      );
      final p = parseBrandCopy(blocks, layout: condition != 'no layout');
      expect(p.reviewHints, isNotEmpty);
      if (condition == 'priced') {
        expect(p.items.where((i) => i.lineTotal == '3.00'), hasLength(1));
      }
      if (condition != 'no layout') expect(p.blocks, blocks);
    });
  }

  final courtesyGroups = [
    ['Thank you for shopping local!'],
    ['Thank you for visiting!'],
    ['Thank you for brewing', 'a brighter day!'],
    ['Thank you for making', 'a better day!'],
    ['Feel better, sooner.'],
    ['You look great here.'],
    ['Travel safely.'],
    ['Grazie!', 'See you soon!'],
  ];
  for (var i = 0; i < courtesyGroups.length; i++) {
    for (final scale in [0.6, 1.5]) {
      test('bounded centered post-payment courtesy $i scale $scale', () {
        final blocks = brandCopyBlocks(footer: courtesyGroups[i], scale: scale);
        final p = parseBrandCopy(blocks);
        unchangedFields(p);
        expect(p.reviewHints, isEmpty);
        expect(p.warnings, isEmpty);
        expect(p.blocks, blocks);
        expect(p.rawTextLineCount, blocks.length);
      });
    }
  }

  test('numeric trailer cannot be assumed to be a barcode', () {
    final blocks = brandCopyBlocks(
      footer: ['Thank you for shopping local!'],
      barcode: true,
    );
    final p = parseBrandCopy(blocks);
    unchangedFields(p);
    expect(p.reviewHints, isNotEmpty);
    expect(p.blocks, blocks);
  });

  for (final phrase in ['Fresh food. Better days.', 'Good food! Good days!']) {
    test('supported caption variations retain the same fields: $phrase', () {
      final p = parseBrandCopy(brandCopyBlocks(caption: phrase));
      unchangedFields(p);
      expect(p.reviewHints, isEmpty);
    });
  }

  for (final header in [true, false]) {
    for (final defect in [
      'missing confidence',
      'nonfinite confidence',
      'missing point',
      'nonfinite point',
      'degenerate',
      'crossed corners',
      'far below',
    ]) {
      test('${header ? 'header' : 'footer'} rejects $defect geometry', () {
        final blocks = brandCopyBlocks(
          caption: header ? 'Better food. Brighter days.' : null,
          footer: header ? [] : ['Thank you for visiting!'],
        );
        final i = header ? 1 : blocks.length - 1;
        final b = blocks[i];
        final points = b.points.toList();
        if (defect == 'missing point') points.removeLast();
        if (defect == 'nonfinite point') {
          points[0] = ReceiptOcrPoint(x: double.nan, y: points[0].y);
        }
        if (defect == 'degenerate') points.fillRange(0, 4, points[0]);
        if (defect == 'crossed corners') {
          final p = points[1];
          points[1] = points[2];
          points[2] = p;
        }
        blocks[i] = ReceiptOcrBlockEvidence(
          text: b.text,
          row: b.row,
          order: b.order,
          confidence: defect == 'missing confidence'
              ? null
              : defect == 'nonfinite confidence'
              ? double.nan
              : b.confidence,
          points: defect == 'far below'
              ? points
                    .map((p) => ReceiptOcrPoint(x: p.x, y: p.y + 1000))
                    .toList()
              : points,
        );
        final p = parseBrandCopy(blocks);
        expect(p.reviewHints, isNotEmpty);
        expect(p.blocks, blocks);
      });
    }
  }

  for (final condition in [
    'left aligned',
    'no layout',
    'no payment',
    'low confidence',
    'unknown suffix',
    'priced',
    'modifier',
    'adjustment',
    'extra item',
    'extra priced item',
    'unknown continuation',
    'money continuation',
    'named product',
  ]) {
    test('footer classification preserves $condition evidence', () {
      var footer = ['Thank you for visiting!'];
      if (condition == 'unknown suffix') {
        footer = ['Thank you for visiting! Gift'];
      }
      if (condition == 'priced') footer = ['Thank you for visiting USD 3.00'];
      if (condition == 'modifier') footer = ['+ Thank you for visiting!'];
      if (condition == 'adjustment') footer = ['Thank you for donating!'];
      if (condition == 'unknown continuation') {
        footer = ['Thank you for brewing', 'Gift basket'];
      }
      if (condition == 'money continuation') {
        footer = ['Thank you for brewing', 'Gift USD 3.00'];
      }
      if (condition == 'named product') footer = ['Thank You Gift'];
      final blocks = brandCopyBlocks(
        footer: footer,
        footerLeft: condition == 'left aligned' ? 20 : 200,
        payment: condition != 'no payment',
        confidence: condition == 'low confidence' ? 0.3 : 0.98,
        afterTotal: [
          if (condition == 'extra item') 'Unpriced dessert',
          if (condition == 'extra priced item') 'Gift USD 3.00',
        ],
      );
      final p = parseBrandCopy(blocks, layout: condition != 'no layout');
      expect(p.reviewHints, isNotEmpty);
      if (condition != 'no layout') expect(p.blocks, blocks);
      if (condition == 'priced' || condition == 'extra priced item') {
        expect(p.items.where((i) => i.lineTotal == '3.00'), hasLength(1));
      }
    });
  }
}
