import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';
import '../support/header_reference_receipt.dart';

void main() {
  for (final besideLocation in [false, true]) {
    for (final row in [5, 6, 7]) {
      for (final amount in ['USD 2.00', 'EUR 2.00']) {
        test(
          'detached header money remains reviewable location=$besideLocation row=$row amount=$amount',
          () {
            final blocks = headerReferenceDetachedMoneyBlocks(
              besideLocation: besideLocation,
              logicalRow: row,
              amount: amount,
            );
            final p = parseHeaderReference(blocks);
            expect(p.blocks, blocks);
            expect(p.items.map((i) => i.lineTotal), ['7.00', '5.00']);
            expect(p.total, '12.00');
            expect(p.adjustmentsComplete, isFalse);
            expect(p.reviewHints, isNotEmpty);
          },
        );
      }
    }
  }
  for (final currency in ['USD', 'HKD']) {
    for (final scale in [0.5, 1.0, 2.0]) {
      test('corroborated header and reference roles $currency $scale', () {
        final blocks = headerReferenceBlocks(
          headerReferenceRows(currency: currency),
          scale: scale,
          shift: 41,
        );
        final p = parseHeaderReference(blocks);
        expect(p.merchant, 'Maple Duty Trading');
        expect(p.receiptDate, '2026-10-03');
        expect(p.currency, currency);
        expect(p.total, '12.00');
        expect(p.items.map((i) => [i.description, i.lineTotal, i.currency]), [
          ['Tea Blend', '7.00', currency],
          ['Cookies', '5.00', currency],
        ]);
        expect(p.blocks, blocks);
        expect(p.adjustmentsComplete, isTrue);
        expect(p.reviewHints, isEmpty);
        expect(p.warnings, isEmpty);
      });
    }
  }
  for (final reference in [
    'Reference EUR 11.00',
    'Reference EUR EUR11.00',
    'Reference amount EUR 11.00',
    'Conversion total EUR 11.00',
    'Reference EUR 11.00EUR',
  ]) {
    test('bounded reference permits courtesy $reference', () {
      final p = parseHeaderReference(
        headerReferenceBlocks(
          headerReferenceRows(
            merchant: 'Maple Market',
            venue: '',
            reference: reference,
          ),
        ),
      );
      expect(p.total, '12.00');
      expect(p.currency, 'USD');
      expect(p.items, hasLength(2));
      expect(p.reviewHints, isEmpty);
      expect(p.warnings, isEmpty);
    });
  }
  for (final reference in [
    'Reference HKD EUR11.00',
    'Reference EUR 11.00USD',
    'Reference BIF 11.00',
    'Reference XYZ 11.00',
    'Reference 11.00',
    'Reference EUR 11.00 fee',
    'Reference EUR 11.00 or 12.00',
    'Reference EUR -11.00',
    'Reference EUR 11%',
    'Reference Balance EUR11.00',
    'DCC selected EUR11.00',
  ]) {
    test('ambiguous reference still gates courtesy $reference', () {
      final blocks = headerReferenceBlocks(
        headerReferenceRows(
          merchant: 'Maple Market',
          venue: '',
          reference: reference,
        ),
      );
      final p = parseHeaderReference(blocks);
      expect(p.blocks, blocks);
      expect(p.reviewHints, isNotEmpty);
    });
  }
  for (final defect in [
    'no layout',
    'ordinary title size',
    'priced title',
    'bare financial title',
    'missing date',
    'location after date',
    'location currency',
    'location charge',
  ]) {
    test('unowned header remains reviewable $defect', () {
      final rows = headerReferenceRows(reference: '');
      switch (defect) {
        case 'priced title':
          rows[0] = ['Maple Duty Trading USD 1.00'];
        case 'bare financial title':
          rows[0] = ['Service Charge'];
        case 'missing date':
          rows.removeAt(2);
        case 'location after date':
          final venue = rows.removeAt(1);
          rows.insert(2, venue);
        case 'location currency':
          rows[1] = ['EUR Riverside International Airport'];
        case 'location charge':
          rows[1] = ['Riverside Airport fee'];
      }
      final blocks = headerReferenceBlocks(
        rows,
        prominent: defect != 'ordinary title size',
      );
      final p = parseHeaderReference(blocks, layout: defect != 'no layout');
      expect(p.reviewHints, isNotEmpty);
      if (defect != 'no layout') expect(p.blocks, blocks);
    });
  }
  for (final merchant in [
    'Riverside Tax Cafe',
    'Maple Service Market',
    'Hilltop Discount Store',
    'Sundale Shipping Boutique',
  ]) {
    test('corroborated merchant financial vocabulary $merchant', () {
      final p = parseHeaderReference(
        headerReferenceBlocks(headerReferenceRows(merchant: merchant)),
      );
      expect(p.merchant, merchant);
      expect(p.total, '12.00');
      expect(p.reviewHints, isEmpty);
    });
  }
  for (final defect in [
    'low confidence',
    'missing confidence',
    'nonfinite confidence',
    'excess confidence',
    'missing quad',
    'crossed quad',
    'nonfinite point',
    'overlapping title',
    'large title gap',
    'left title',
    'location misaligned',
    'detached price',
    'price overlaps description',
  ]) {
    test(
      'uncorroborated header geometry retains financial-label review $defect',
      () {
        final blocks = headerReferenceBlocks(headerReferenceRows());
        final at = blocks.indexWhere(
          (b) => switch (defect) {
            'detached price' || 'price overlaps description' =>
              b.row == 3 && b.text.startsWith('USD'),
            'location misaligned' => b.row == 1,
            _ => b.row == 0,
          },
        );
        final b = blocks[at];
        var points = b.points;
        final confidence = switch (defect) {
          'low confidence' => 0.7,
          'missing confidence' => null,
          'nonfinite confidence' => double.nan,
          'excess confidence' => 1.1,
          _ => b.confidence,
        };
        switch (defect) {
          case 'missing quad':
            points = const [];
          case 'crossed quad':
            points = [b.points[0], b.points[2], b.points[1], b.points[3]];
          case 'nonfinite point':
            points = [
              const ReceiptOcrPoint(x: double.infinity, y: 40),
              ...b.points.skip(1),
            ];
          case 'overlapping title':
            points = [
              for (final q in points) ReceiptOcrPoint(x: q.x, y: q.y + 70),
            ];
          case 'large title gap':
            points = [
              for (final q in points) ReceiptOcrPoint(x: q.x, y: q.y - 100),
            ];
          case 'left title':
            points = [
              for (final q in points) ReceiptOcrPoint(x: q.x - 200, y: q.y),
            ];
          case 'location misaligned':
            points = [
              for (final q in points) ReceiptOcrPoint(x: q.x + 90, y: q.y),
            ];
          case 'detached price':
            points = [
              for (final q in points) ReceiptOcrPoint(x: q.x, y: q.y + 80),
            ];
          case 'price overlaps description':
            points = [
              for (final q in points) ReceiptOcrPoint(x: q.x - 620, y: q.y),
            ];
        }
        blocks[at] = ReceiptOcrBlockEvidence(
          text: b.text,
          row: b.row,
          order: b.order,
          confidence: confidence,
          points: points,
        );
        final p = parseHeaderReference(blocks);
        expect(p.blocks, blocks);
        expect(p.adjustmentsComplete, isFalse);
        expect(
          p.incompleteAdjustmentReasons,
          contains(
            ReceiptOcrIncompleteAdjustmentReason.unclassifiedAdjustmentLabel,
          ),
        );
        expect(p.reviewHints, isNotEmpty);
      },
    );
  }
  for (final defect in [
    'competing primary total',
    'foreign selected item',
    'unknown charge',
    'unpriced item',
    'unpriced modifier',
    'invalid date',
    'unsupported location currency',
    'priced location',
  ]) {
    test('genuine body or header ambiguity remains $defect', () {
      final rows = headerReferenceRows();
      switch (defect) {
        case 'competing primary total':
          rows.insert(5, ['Total', 'EUR 99.00']);
        case 'foreign selected item':
          rows[3] = ['Tea Blend', 'EUR 7.00'];
        case 'unknown charge':
          rows.insert(5, ['Handling Fee', 'USD 2.00']);
        case 'unpriced item':
          rows.insert(5, ['Fruit basket']);
        case 'unpriced modifier':
          rows.insert(4, ['+ Side dish']);
        case 'invalid date':
          rows[2] = ['Date: 2026-99-03'];
        case 'unsupported location currency':
          rows[1] = ['CZK Riverside International Airport'];
        case 'priced location':
          rows[1] = ['Riverside International Airport USD 3.00'];
      }
      final blocks = headerReferenceBlocks(rows);
      final p = parseHeaderReference(blocks);
      expect(p.blocks, blocks);
      expect(p.reviewHints, isNotEmpty);
    });
  }
}
