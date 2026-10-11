import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';
import '../support/modifier_receipt.dart';

void main() {
  void fieldsPreserved(ReceiptOcrPreview p, String currency) {
    expect(p.currency, currency);
    expect([p.subtotal, p.tax, p.total], ['13.00', '1.30', '14.30']);
    expect(p.items.map((i) => [i.description, i.lineTotal, i.currency]), [
      ['Lunch Bowl', '9.00', currency],
      ['Avocado', '1.50', currency],
      ['Lemonade', '2.50', currency],
    ]);
    expect(
      p.itemLineDecisions.where(
        (d) => d == ReceiptOcrItemLineDecision.unpricedDescription,
      ),
      hasLength(2),
    );
  }

  for (final currency in ['USD', 'EUR']) {
    for (final scale in [0.5, 1.0, 2.0]) {
      test('reconciled mixed option group $currency scale $scale', () {
        final blocks = modifierReceiptBlocks(
          modifierReceiptRows(currency: currency),
          scale: scale,
          shiftX: 57,
          shiftY: 83,
        );
        final p = parseModifierReceipt(blocks);
        fieldsPreserved(p, currency);
        expect(p.reviewHints, isEmpty);
        expect(p.warnings, isEmpty);
        expect(p.adjustmentsComplete, isTrue);
        expect(p.blocks, blocks);
        expect(p.items, hasLength(3));
      });
    }
  }
  test('same receipt without layout remains reviewable', () {
    final p = parseModifierReceipt(
      modifierReceiptBlocks(modifierReceiptRows()),
      layout: false,
    );
    fieldsPreserved(p, 'USD');
    expect(p.reviewHints, isNotEmpty);
  });
  test('split currency and price cells share the printed money column', () {
    final rows = modifierReceiptRows();
    for (final row in rows) {
      if (row.length == 2) {
        final price = row.removeLast().split(' ');
        row.addAll(price);
      }
    }
    final p = parseModifierReceipt(modifierReceiptBlocks(rows));
    fieldsPreserved(p, 'USD');
    expect(p.reviewHints, isEmpty);
  });
  test('receipt without tax has a closed subtotal and total', () {
    final rows = modifierReceiptRows()..removeAt(8);
    rows[8] = ['Total', 'USD 13.00'];
    final p = parseModifierReceipt(modifierReceiptBlocks(rows));
    expect(p.tax, isNull);
    expect(p.total, '13.00');
    expect(p.items, hasLength(3));
    expect(p.reviewHints, isEmpty);
  });
  test('two separate parent groups retain all priced selections', () {
    final rows = modifierReceiptRows();
    rows.insertAll(7, [
      ['+ No ice'],
      ['+ Lemon slice', 'USD 0.50'],
    ]);
    rows[9] = ['Subtotal', 'USD 13.50'];
    rows[10] = ['Tax', 'USD 1.35'];
    rows[11] = ['Total', 'USD 14.85'];
    final p = parseModifierReceipt(modifierReceiptBlocks(rows));
    expect(p.items.map((i) => i.lineTotal), ['9.00', '1.50', '2.50', '0.50']);
    expect(p.reviewHints, isEmpty);
  });

  for (final withTax in [false, true]) {
    for (final modifier in [
      '+ Extra (EUR)',
      '+ CZK extra',
      '+ Extra(czk)',
      '+ Extra-eUr',
      '+ Extra.USD',
      '+ Extra (BIF)',
      '+ Extra (₦)',
      '+ Extra (EUR)(CZK)',
    ]) {
      test('unpriced currency stays unresolved tax=$withTax $modifier', () {
        final blocks = modifierReceiptBlocks(
          modifierReceiptRows(withTax: withTax, unpricedModifier: modifier),
        );
        final p = parseModifierReceipt(blocks);
        expect(p.adjustmentsComplete, isFalse);
        expect(
          p.incompleteAdjustmentReasons,
          contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
        );
        expect(p.reviewHints, isNotEmpty);
        expect(p.blocks, blocks);
        expect(p.items.map((i) => i.lineTotal), ['9.00', '1.50', '2.50']);
        expect(p.subtotal, '13.00');
        expect(p.tax, withTax ? '1.30' : isNull);
        expect(p.total, withTax ? '14.30' : '13.00');
      });
    }
    test(
      'currency substrings inside option words remain descriptive tax=$withTax',
      () {
        final p = parseModifierReceipt(
          modifierReceiptBlocks(
            modifierReceiptRows(
              withTax: withTax,
              unpricedModifier: '+ European style',
            ),
          ),
        );
        expect(p.adjustmentsComplete, isTrue);
        expect(p.reviewHints, isEmpty);
      },
    );
  }

  final financialDefects = <String, void Function(List<List<String>>)>{
    'subtotal mismatch': (r) => r[7] = ['Subtotal', 'USD 12.00'],
    'total mismatch': (r) => r[9] = ['Total', 'USD 15.00'],
    'foreign priced modifier': (r) => r[5] = ['+ Avocado', 'EUR 1.50'],
    'foreign subtotal': (r) => r[7] = ['Subtotal', 'EUR 13.00'],
    'foreign tax': (r) => r[8] = ['Tax', 'EUR 1.30'],
    'unknown denomination': (r) => r[5] = ['+ Avocado', 'XYZ 1.50'],
    'missing item denomination': (r) => r[5] = ['+ Avocado', '1.50'],
    'duplicate primary total': (r) => r.insert(9, ['Total', 'USD 14.30']),
    'foreign total before': (r) => r.insert(9, ['Total', 'EUR 14.30']),
    'foreign total after': (r) => r.insert(10, ['Total', 'EUR 14.30']),
    'duplicate subtotal': (r) => r.insert(7, ['Subtotal', 'EUR 13.00']),
    'duplicate tax': (r) => r.insert(8, ['Tax', 'USD 1.30']),
    'extra unknown charge': (r) => r.insert(7, ['Handling Fee', 'USD 1.00']),
    'unpriced fee modifier': (r) => r[3] = ['+ Service fee'],
    'unpriced total modifier': (r) => r[3] = ['+ Total'],
    'unpriced denomination': (r) => r[3] = ['+ USD extra'],
    'numeric option': (r) => r[3] = ['+ Extra 2 portions'],
    'missing subtotal': (r) => r.removeAt(7),
    'missing primary total': (r) => r.removeAt(9),
    'orphan modifier': (r) => r.insert(2, ['+ Extra side']),
    'footer modifier': (r) => r.add(['+ Extra side']),
    'unpriced ordinary product': (r) => r.insert(7, ['Chocolate tart']),
    'no priced sibling': (r) {
      r.removeAt(5);
      r[6] = ['Subtotal', 'USD 11.50'];
      r[7] = ['Tax', 'USD 1.15'];
      r[8] = ['Total', 'USD 12.65'];
    },
    'missing selected parent': (r) {
      r.removeAt(2);
      r[6] = ['Subtotal', 'USD 4.00'];
      r[7] = ['Tax', 'USD 0.40'];
      r[8] = ['Total', 'USD 4.40'];
    },
  };
  for (final defect in financialDefects.entries) {
    test('retains ${defect.key} review', () {
      final rows = modifierReceiptRows();
      defect.value(rows);
      final blocks = modifierReceiptBlocks(rows);
      final p = parseModifierReceipt(blocks);
      expect(p.adjustmentsComplete, isFalse);
      expect(
        p.incompleteAdjustmentReasons,
        contains(ReceiptOcrIncompleteAdjustmentReason.unresolvedItemLikeLine),
      );
      if (defect.key == 'missing primary total') {
        expect(p.total, isNull);
      } else {
        expect(p.reviewHints, isNotEmpty);
      }
      expect(p.blocks, blocks);
    });
  }
  for (final defect in [
    'low confidence',
    'invalid confidence',
    'missing quad',
    'crossed quad',
    'nonfinite point',
    'large gap',
    'overlapping row',
    'price column text',
    'misaligned price',
    'single block priced row',
    'detached price',
  ]) {
    test('retains $defect ambiguity', () {
      var blocks = modifierReceiptBlocks(modifierReceiptRows());
      final at = blocks.indexWhere((b) => b.row == 3);
      final b = blocks[at];
      switch (defect) {
        case 'low confidence':
          blocks[at] = changedModifierBlock(b, confidence: 0.4);
        case 'invalid confidence':
          blocks[at] = changedModifierBlock(b, confidence: 1.1);
        case 'missing quad':
          blocks[at] = changedModifierBlock(b, points: []);
        case 'crossed quad':
          blocks[at] = changedModifierBlock(
            b,
            points: [b.points[0], b.points[2], b.points[1], b.points[3]],
          );
        case 'nonfinite point':
          blocks[at] = changedModifierBlock(
            b,
            points: [
              const ReceiptOcrPoint(x: double.nan, y: 0),
              ...b.points.skip(1),
            ],
          );
        case 'large gap':
          blocks = blocks
              .map(
                (b) => b.row >= 3
                    ? changedModifierBlock(
                        b,
                        points: b.points
                            .map((p) => ReceiptOcrPoint(x: p.x, y: p.y + 150))
                            .toList(),
                      )
                    : b,
              )
              .toList();
        case 'overlapping row':
          blocks[at] = changedModifierBlock(
            b,
            points: b.points
                .map((p) => ReceiptOcrPoint(x: p.x, y: p.y - 40))
                .toList(),
          );
        case 'price column text':
          blocks[at] = changedModifierBlock(
            b,
            points: b.points
                .map((p) => ReceiptOcrPoint(x: p.x + 810, y: p.y))
                .toList(),
          );
        case 'misaligned price':
          final at = blocks.indexWhere(
            (b) => b.row == 5 && b.text.startsWith('USD'),
          );
          final b = blocks[at];
          blocks[at] = changedModifierBlock(
            b,
            points: b.points
                .map((p) => ReceiptOcrPoint(x: p.x + 100, y: p.y))
                .toList(),
          );
        case 'single block priced row':
          final desc = blocks.firstWhere((b) => b.row == 2);
          final price = blocks.lastWhere((b) => b.row == 2);
          blocks.removeWhere((b) => b == price);
          blocks[blocks.indexOf(desc)] = changedModifierBlock(
            desc,
            text: '${desc.text} ${price.text}',
            points: [
              desc.points[0],
              price.points[1],
              price.points[2],
              desc.points[3],
            ],
          );
        case 'detached price':
          blocks.add(
            ReceiptOcrBlockEvidence(
              text: 'USD 2.00',
              row: 99,
              order: 99,
              confidence: 0.98,
              points: b.points
                  .map((p) => ReceiptOcrPoint(x: p.x + 810, y: p.y))
                  .toList(),
            ),
          );
      }
      final p = parseModifierReceipt(blocks);
      expect(p.reviewHints, isNotEmpty);
      expect(p.blocks, blocks);
    });
  }
}
