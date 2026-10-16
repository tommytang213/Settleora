import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

// Reduced public synthetic layouts: generic merchant/meter identity, original
// column geometry, no customer/account/address fields from the native capture.
const australianJson =
    r'''[{"text": "Neighbourhood Bakery", "row": 0, "confidence": 0.9999383687973022, "points": [[220.0, 61.0], [760.0, 61.0], [760.0, 113.0], [220.0, 113.0]]}, {"text": "Sydney NSW 2000", "row": 1, "confidence": 0.9997727274894714, "points": [[352.0, 126.0], [627.0, 125.0], [627.0, 166.0], [352.0, 167.0]]}, {"text": "ABN 12 345678901", "row": 2, "confidence": 0.9654711484909058, "points": [[338.0, 174.0], [638.0, 173.0], [638.0, 208.0], [338.0, 210.0]]}, {"text": "Coffee AUD 5.50", "row": 3, "confidence": 0.99, "points": [[60, 245], [900, 245], [900, 276], [60, 276]]}, {"text": "Subtotal AUD 5.50", "row": 4, "confidence": 0.99, "points": [[60, 300], [900, 300], [900, 330], [60, 330]]}, {"text": "Total AUD 5.50", "row": 5, "confidence": 0.99, "points": [[60, 350], [900, 350], [900, 380], [60, 380]]}]''';
const meterJson =
    r'''[{"text": "Regional Water Services USD", "row": 0, "confidence": 0.99, "points": [[300, -50], [750, -50], [750, -30], [300, -30]]}, {"text": "Details of Current Charges", "row": 1, "confidence": 0.99, "points": [[597, 0], [900, 0], [900, 20], [597, 20]]}, {"text": "Meter Number", "row": 2, "confidence": 0.9912183284759521, "points": [[54.0, 32.0], [169.0, 32.0], [169.0, 52.0], [54.0, 52.0]]}, {"text": "Previous Read", "row": 2, "confidence": 0.9999305605888367, "points": [[185.0, 32.0], [294.0, 32.0], [294.0, 52.0], [185.0, 52.0]]}, {"text": "Current Read", "row": 2, "confidence": 0.9995319843292236, "points": [[316.0, 32.0], [418.0, 32.0], [418.0, 52.0], [316.0, 52.0]]}, {"text": "Consumption", "row": 2, "confidence": 0.9999771118164062, "points": [[443.0, 32.0], [549.0, 32.0], [549.0, 52.0], [443.0, 52.0]]}, {"text": "Description", "row": 2, "confidence": 0.9999618530273438, "points": [[597.0, 30.0], [697.0, 30.0], [697.0, 52.0], [597.0, 52.0]]}, {"text": "Amount", "row": 2, "confidence": 0.9999518394470215, "points": [[974.0, 30.0], [1046.0, 30.0], [1046.0, 52.0], [974.0, 52.0]]}, {"text": "Jul 16, 2024", "row": 3, "confidence": 0.9918932914733887, "points": [[192.0, 54.0], [287.0, 54.0], [287.0, 74.0], [192.0, 74.0]]}, {"text": "Aug 14, 2024", "row": 3, "confidence": 0.997199296951294, "points": [[316.0, 53.0], [419.0, 53.0], [419.0, 76.0], [316.0, 76.0]]}, {"text": "(cubic meters)", "row": 3, "confidence": 0.9592376351356506, "points": [[442.0, 53.0], [550.0, 53.0], [550.0, 76.0], [442.0, 76.0]]}, {"text": "Water Charge (25 m\u00b3 @ $1.80)", "row": 3, "confidence": 0.9881603121757507, "points": [[596.0, 66.0], [857.0, 66.0], [857.0, 89.0], [596.0, 89.0]]}, {"text": "$45.00", "row": 3, "confidence": 0.9999779462814331, "points": [[983.0, 63.0], [1051.0, 63.0], [1051.0, 90.0], [983.0, 90.0]]}, {"text": "XYZ789456", "row": 4, "confidence": 0.9999865293502808, "points": [[54.0, 97.0], [164.0, 97.0], [164.0, 119.0], [54.0, 119.0]]}, {"text": "1,253", "row": 4, "confidence": 0.9999603033065796, "points": [[213.0, 95.0], [271.0, 95.0], [271.0, 122.0], [213.0, 122.0]]}, {"text": "1,278", "row": 4, "confidence": 0.9999600052833557, "points": [[339.0, 95.0], [396.0, 95.0], [396.0, 122.0], [339.0, 122.0]]}, {"text": "25", "row": 4, "confidence": 0.999997079372406, "points": [[479.0, 94.0], [511.0, 94.0], [511.0, 121.0], [479.0, 121.0]]}, {"text": "Sewer Charge (25 m\u00b3 @ $2.10)", "row": 4, "confidence": 0.9730690121650696, "points": [[597.0, 97.0], [857.0, 98.0], [857.0, 123.0], [597.0, 122.0]]}, {"text": "$52.50", "row": 4, "confidence": 0.9999494552612305, "points": [[984.0, 97.0], [1049.0, 97.0], [1049.0, 123.0], [984.0, 123.0]]}, {"text": "Subtotal USD 97.50", "row": 5, "confidence": 0.99, "points": [[600, 160], [1050, 160], [1050, 180], [600, 180]]}, {"text": "Total USD 97.50", "row": 6, "confidence": 0.99, "points": [[600, 200], [1050, 200], [1050, 220], [600, 220]]}]''';

List<Map<String, dynamic>> fixture(String source) =>
    (jsonDecode(source) as List)
        .map((v) => Map<String, dynamic>.from(v as Map))
        .toList();
ReceiptOcrPreview parse(List<Map<String, dynamic>> data, {bool layout = true}) {
  final rows = <int, List<String>>{};
  final blocks = <ReceiptOcrBlockEvidence>[];
  for (final b in data) {
    (rows[b['row'] as int] ??= []).add(b['text'] as String);
    blocks.add(
      ReceiptOcrBlockEvidence(
        text: b['text'],
        order: blocks.length,
        row: b['row'],
        confidence: (b['confidence'] as num).toDouble(),
        points: (b['points'] as List)
            .map(
              (p) => ReceiptOcrPoint(
                x: (p[0] as num).toDouble(),
                y: (p[1] as num).toDouble(),
              ),
            )
            .toList(),
      ),
    );
  }
  return const ReceiptOcrParser().parse(
    rows.values.map((v) => v.join(' ')).join('\n'),
    blocks: layout ? blocks : const [],
  );
}

void shift(Map<String, dynamic> b, double dx) {
  b['points'] = (b['points'] as List).map((p) => [p[0] + dx, p[1]]).toList();
}

void main() {
  for (final city in ['Sydney NSW 2000', 'Melbourne VIC 3000']) {
    test('Australian header ownership: $city', () {
      final f = fixture(australianJson);
      f[1]['text'] = city;
      final p = parse(f);
      expect(p.items.single.lineTotal, '5.50');
      expect(p.adjustmentsComplete, isTrue);
      expect(p.reviewHints, isEmpty);
      expect(p.blocks.any((b) => b.text == city), isTrue);
    });
  }
  for (final kind in [
    'missing ABN',
    'malformed ABN',
    'misaligned ABN',
    'low confidence',
    'split currency',
    'text only',
  ]) {
    test('postal ambiguity survives $kind', () {
      final f = fixture(australianJson);
      switch (kind) {
        case 'missing ABN':
          f[2]['text'] = 'Welcome';
        case 'malformed ABN':
          f[2]['text'] = 'ABN 12 34567890';
        case 'misaligned ABN':
          shift(f[2], 150);
        case 'low confidence':
          f[1]['confidence'] = .5;
        case 'split currency':
          final extra = Map<String, dynamic>.from(f[1]);
          extra['text'] = 'AUD';
          extra['row'] = 6;
          extra['points'] = [
            [630, 126],
            [680, 126],
            [680, 166],
            [630, 166],
          ];
          f.add(extra);
      }
      expect(
        parse(f, layout: kind != 'text only').adjustmentsComplete,
        isFalse,
      );
    });
  }
  for (final right in [false, true]) {
    test('complete meter panel beside charge table, right=$right', () {
      final f = fixture(meterJson);
      if (right) {
        for (final b in f.where((b) => b['row'] >= 2 && b['row'] <= 4)) {
          shift(b, (b['points'][0][0] as num) < 580 ? 600 : -550);
        }
      }
      final p = parse(f);
      expect(p.items.map((i) => i.lineTotal), ['45.00', '52.50']);
      expect(p.items.map((i) => i.description), [
        'Water Charge (25 m³ @ \$1.80)',
        'Sewer Charge (25 m³ @ \$2.10)',
      ]);
      expect(p.blocks.any((b) => b.text == '1,253'), isTrue);
    });
  }
  for (final kind in [
    'decimal price',
    'explicit price',
    'split currency',
    'missing unit',
    'unknown heading',
    'low confidence',
    'misaligned cell',
    'separate row currency',
  ]) {
    test('meter panel cannot hide $kind', () {
      final f = fixture(meterJson);
      final reading = f.firstWhere((b) => b['text'] == '1,253');
      switch (kind) {
        case 'decimal price':
          reading['text'] = '12.53';
        case 'explicit price':
          reading['text'] = 'USD 1253';
        case 'split currency':
          final extra = Map<String, dynamic>.from(reading);
          extra['text'] = 'USD';
          shift(extra, -25);
          f.insert(f.indexOf(reading), extra);
        case 'missing unit':
          f.removeWhere((b) => b['text'] == '(cubic meters)');
        case 'unknown heading':
          f.firstWhere((b) => b['text'] == 'Previous Read')['text'] =
              'Special Price';
        case 'low confidence':
          reading['confidence'] = .5;
        case 'misaligned cell':
          shift(reading, 45);
        case 'separate row currency':
          final extra = Map<String, dynamic>.from(reading);
          extra['text'] = 'USD';
          extra['row'] = 7;
          shift(extra, -25);
          f.add(extra);
      }
      final p = parse(f);
      expect(p.items, isEmpty);
      expect(p.adjustmentsComplete, isFalse);
    });
  }
}
