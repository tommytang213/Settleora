import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

typedef Quad = List<(double, double)>;
typedef Fragment = ({String text, Quad points, String? direction});

Quad quad(
  double left,
  double right, {
  double slope = 0.1,
  double height = 18,
  double intercept = 98,
  double offset = 0,
  double? centerY,
}) {
  final b = centerY == null
      ? intercept + offset
      : centerY - height / 2 - slope * (left + right) / 2;
  return [
    (left, b + slope * left),
    (right, b + slope * right),
    (right, b + slope * right + height),
    (left, b + slope * left + height),
  ];
}

Quad transformed(Quad p, double scale) => [
  for (final v in p) (1000 + scale * v.$1, 700 + scale * v.$2),
];
// Reflect coordinates and restore TL,TR,BR,BL order.
Quad mirror(Quad p) => [
  for (final i in [1, 0, 3, 2]) (500 - p[i].$1, p[i].$2),
];
Fragment fragment(String text, Quad points, {String? direction}) =>
    (text: text, points: points, direction: direction);

// Test-fixture precondition only; it does not duplicate the new proof.
bool oldAxisBandAccepts(List<Quad> cells) {
  final bands = <(double, double)>[];
  for (final p in cells) {
    if (p.length != 4 || p.any((v) => !v.$1.isFinite || !v.$2.isFinite))
      return false;
    final xs = p.map((v) => v.$1).toList()..sort();
    final ys = p.map((v) => v.$2).toList()..sort();
    if (xs.last <= xs.first || ys.last <= ys.first) return false;
    bands.add((ys.first, ys.last));
  }
  for (var i = 0; i < bands.length; i++) {
    for (var j = i + 1; j < bands.length; j++) {
      final a = bands[i], b = bands[j];
      final top = a.$1 > b.$1 ? a.$1 : b.$1;
      final bottom = a.$2 < b.$2 ? a.$2 : b.$2;
      final ha = a.$2 - a.$1, hb = b.$2 - b.$1;
      if (bottom - top < (ha < hb ? ha : hb) / 2) return false;
    }
  }
  return true;
}

ReceiptOcrPreview parseCells(
  List<Fragment> descriptions,
  Quad amount, {
  List<Fragment> extras = const [],
  double? contextScale,
}) {
  var order = 0;
  Quad context(Quad q) =>
      contextScale == null ? q : transformed(q, contextScale);
  ReceiptOcrBlockEvidence block(Fragment f, int row) => ReceiptOcrBlockEvidence(
    text: f.text,
    order: order++,
    row: row,
    textDirection: f.direction,
    points: [for (final v in f.points) ReceiptOcrPoint(x: v.$1, y: v.$2)],
  );
  final blocks = [
    block(
      fragment('Market', context(quad(20, 350, slope: 0, intercept: 10))),
      0,
    ),
    for (final f in descriptions) block(f, 1),
    block(fragment('2.00', amount), 1),
    for (final f in extras) block(f, 1),
    block(
      fragment(
        'Subtotal USD 2.00',
        context(quad(20, 350, slope: 0, intercept: 260)),
      ),
      2,
    ),
    block(
      fragment(
        'Total USD 2.00',
        context(quad(20, 350, slope: 0, intercept: 300)),
      ),
      3,
    ),
  ];
  final rows = <int, List<String>>{};
  for (final b in blocks) {
    (rows[b.row] ??= []).add(b.text);
  }
  return const ReceiptOcrParser().parse(
    rows.values.map((r) => r.join(' ')).join('\n'),
    fallbackCurrency: 'USD',
    blocks: blocks,
  );
}

void expectQuantity(ReceiptOcrPreview p) {
  expect(p.items.length, 1);
  expect(p.items.single.description, 'Grapes');
  expect(p.items.single.quantity, '0.500');
  expect(p.items.single.unitPrice, '4.00');
  expect(p.items.single.lineTotal, '2.00');
  expect(p.items.single.currency, 'USD');
  expect(p.subtotal, '2.00');
  expect(p.total, '2.00');
  expect(
    p.incompleteAdjustmentReasons,
    isNot(contains(ReceiptOcrIncompleteAdjustmentReason.unretainedPricedItem)),
  );
}

void expectUnretained(ReceiptOcrPreview p) {
  expect(p.items, isEmpty);
  expect(p.adjustmentsComplete, isFalse);
  expect(p.reviewHints, isNotEmpty);
  expect(
    p.incompleteAdjustmentReasons,
    contains(ReceiptOcrIncompleteAdjustmentReason.unretainedPricedItem),
  );
}

ReceiptOcrPreview ownershipReceipt({
  required double slope,
  String amount = '2.00',
  String? marker,
  bool nearby = false,
  bool tail = false,
}) {
  var order = 0;
  ReceiptOcrBlockEvidence add(String text, int row, Quad points) =>
      ReceiptOcrBlockEvidence(
        text: text,
        order: order++,
        row: row,
        points: [for (final p in points) ReceiptOcrPoint(x: p.$1, y: p.$2)],
      );
  final blocks = [
    add('Market', 0, quad(20, 350, slope: 0, intercept: 10)),
    add('Grapes 0.500 kg x 4.00', 1, quad(20, 200, slope: slope)),
    add(amount, 1, quad(300, 350, slope: slope)),
    if (marker != null)
      add(
        marker,
        1,
        quad(nearby ? 355 : 500, nearby ? 385 : 540, slope: slope),
      ),
    if (tail) add('each', 1, quad(560, 600, slope: slope)),
    add('Subtotal USD 2.00', 2, quad(20, 350, slope: 0, intercept: 260)),
    add('Total USD 2.00', 3, quad(20, 350, slope: 0, intercept: 300)),
  ];
  final rows = <int, List<String>>{};
  for (final b in blocks) {
    (rows[b.row] ??= []).add(b.text);
  }
  return const ReceiptOcrParser().parse(
    rows.values.map((r) => r.join(' ')).join('\n'),
    fallbackCurrency: 'USD',
    blocks: blocks,
  );
}

void expectSavedMoneyWithheld(ReceiptOcrPreview p) {
  final lines = receiptOcrReviewLinesFromPreview(p);
  expect(lines.length, 1, reason: 'The editable description must remain.');
  expect(lines.single.unitPriceAmount, isNull);
  expect(lines.single.lineTotalAmount, isNull);
}

void main() {
  const name = 'Grapes 0.500 kg x 4.00';
  const text =
      'Market\nGrapes 0.500 kg x 4.00 2.00\n'
      'Subtotal USD 2.00\nTotal USD 2.00';
  test('text quantity grammar remains independent of geometry', () {
    expectQuantity(
      const ReceiptOcrParser().parse(text, fallbackCurrency: 'USD'),
    );
  });
  test('old aligned axis-band admission remains intact', () {
    final d = quad(20, 200, slope: 0), a = quad(300, 350, slope: 0);
    expect(oldAxisBandAccepts([a, d]), isTrue);
    expectQuantity(parseCells([fragment(name, d)], a));
  });
  for (final slope in [-0.1, 0.1]) {
    for (final scale in [0.5, 1.0, 4.0]) {
      test('coherent slope $slope at scale $scale with translated origin', () {
        final d = transformed(quad(20, 200, slope: slope), scale);
        final a = transformed(quad(300, 350, slope: slope), scale);
        expect(
          oldAxisBandAccepts([a, d]),
          isFalse,
          reason: 'Positive must require projected-row fallback.',
        );
        expectQuantity(parseCells([fragment(name, d)], a, contextScale: scale));
      });
    }
  }
  test('mirrored cells with explicit RTL direction retain quantity', () {
    final d = mirror(quad(20, 200)), a = mirror(quad(300, 350));
    expect(oldAxisBandAccepts([a, d]), isFalse);
    expectQuantity(parseCells([fragment(name, d, direction: 'rtl')], a));
  });
  test('mirroring does not own a displaced amount', () {
    final d = mirror(quad(20, 200)), a = mirror(quad(300, 350, offset: 50));
    expect(oldAxisBandAccepts([a, d]), isFalse);
    expectUnretained(parseCells([fragment(name, d, direction: 'rtl')], a));
  });

  final rejected = <String, (Quad, Quad)>{
    'parallel different row': (quad(20, 200), quad(300, 350, offset: 50)),
    'residual over actual-height allowance': (
      quad(20, 200),
      quad(300, 350, offset: 6.6),
    ),
    'axis-box height cannot replace true height': (
      quad(20, 200, slope: 0.15),
      quad(300, 350, slope: 0.15, offset: 8),
    ),
    'minimum actual height governs allowance': (
      quad(20, 200),
      quad(300, 350, height: 6, centerY: 142.5),
    ),
    'coherent excessive slope': (
      quad(20, 200, slope: 0.21),
      quad(300, 350, slope: 0.21),
    ),
    // Both residuals=3.225 (<6.3), but slopes differ by .03.
    'incompatible slopes with close center projections': (
      quad(20, 200),
      quad(300, 350, slope: 0.13, centerY: 142.725),
    ),
    // Top=.12,bottom=.08,mean=.1. Center remains on the common line.
    'top and bottom disagree despite coherent mean': (
      quad(20, 200),
      [(300, 127.5), (350, 133.5), (350, 150.5), (300, 146.5)],
    ),
    // dx=415: one projection residual=0, the other=8.3.
    'amount projection must also be checked': (
      quad(20, 200),
      quad(500, 550, slope: 0.12, centerY: 159.5),
    ),
    'description projection must also be checked': (
      quad(20, 200, slope: 0.12, centerY: 118),
      quad(500, 550, centerY: 159.5),
    ),
    'reversed vertex order': (quad(20, 200), quad(300, 350).reversed.toList()),
    'bow-tie order': (
      quad(20, 200),
      [(300, 128), (350, 151), (350, 133), (300, 146)],
    ),
    'concavity': (
      quad(20, 200),
      [(300, 128), (350, 133), (320, 134), (300, 146)],
    ),
    'collinear consecutive corners': (
      quad(20, 200),
      [(300, 128), (325, 130.5), (350, 133), (300, 146)],
    ),
    'missing corner': (quad(20, 200), quad(300, 350).take(3).toList()),
    'non-finite corner': (
      quad(20, 200),
      [(300, double.nan), (350, 133), (350, 151), (300, 146)],
    ),
  };
  for (final entry in rejected.entries) {
    test('does not admit ' + entry.key, () {
      final (d, a) = entry.value;
      expect(
        oldAxisBandAccepts([a, d]),
        isFalse,
        reason: 'Legacy OR branch must not mask this negative.',
      );
      expectUnretained(parseCells([fragment(name, d)], a));
    });
  }
  test('all pairs rather than only adjacent owned cells', () {
    final d1 = quad(20, 100, offset: 4), d2 = quad(120, 200, offset: 8);
    final a = quad(300, 350);
    // Owned order amount,d1,d2: adjacent residuals4; endpoint residual8.
    expect(oldAxisBandAccepts([a, d1, d2]), isFalse);
    expectUnretained(
      parseCells([fragment('Grapes', d1), fragment('0.500 kg x 4.00', d2)], a),
    );
  });
  test('owned geometry does not hide a competing monetary suffix', () {
    final d = quad(20, 200), a = quad(300, 350);
    expect(oldAxisBandAccepts([a, d]), isFalse);
    expectUnretained(
      parseCells(
        [fragment(name, d)],
        a,
        extras: [fragment('or USD 3.00 each', quad(400, 580))],
      ),
    );
  });
  test('owned geometry does not swallow a trailing detached minus', () {
    final d = quad(20, 200), a = quad(300, 350);
    expect(oldAxisBandAccepts([a, d]), isFalse);
    final p = parseCells(
      [fragment(name, d)],
      a,
      extras: [fragment('-', quad(355, 365))],
    );
    expect(p.items, isEmpty);
    expect(p.adjustmentsComplete, isFalse);
    expect(p.reviewHints, isNotEmpty);
  });
  test('distant currency cannot silently resolve or complete the row', () {
    final d = quad(20, 200), a = quad(300, 350);
    expect(oldAxisBandAccepts([a, d]), isFalse);
    final p = parseCells(
      [fragment(name, d)],
      a,
      extras: [fragment('EUR', quad(500, 540))],
    );
    expect(p.adjustmentsComplete, isFalse);
    expect(p.reviewHints, isNotEmpty);
    expect(p.items.where((i) => i.currency == 'EUR'), isEmpty);
    for (final item in p.items) {
      expect(item.lineTotal, '2.00');
    }
  });

  // Additional ownership controls. The original 29 controls above are intact.
  for (final slope in [0.0, 0.1]) {
    for (final amount in ['2.00', 'USD 2.00']) {
      for (final tail in [false, true]) {
        test('distant EUR preserves bounded $amount; slope=$slope; each=$tail', () {
          final p = ownershipReceipt(
            slope: slope,
            amount: amount,
            marker: 'EUR',
            tail: tail,
          );
          expect(p.currency, 'USD');
          expect(p.blocks.map((b) => b.text), contains('EUR'));
          expect(p.items.length, 1, reason: 'Do not drop the editable item.');
          final item = p.items.single;
          expect(
            item.currency,
            'USD',
            reason:
                'The distant marker cannot override the owned/inherited denomination.',
          );
          expect(item.currencyUnresolved, isFalse);
          expect(item.lineTotal, '2.00');
          expect(p.adjustmentsComplete, isFalse);
          expect(p.reviewHints, isNotEmpty);
          expect(
            p.incompleteAdjustmentReasons,
            contains(ReceiptOcrIncompleteAdjustmentReason.unretainedPricedItem),
          );
          if (!tail) {
            expect(item.description, 'Grapes');
            expect(item.quantity, '0.500');
            expect(item.unitPrice, '4.00');
          }
          // This public function checks saved draft money, not Apply permission.
          final lines = receiptOcrReviewLinesFromPreview(p);
          expect(lines.length, 1);
          expect(lines.single.lineTotalAmount, isNotNull);
        });
      }
    }

    test('nearby owned USD/EUR conflict remains unresolved; slope=$slope', () {
      final p = ownershipReceipt(
        slope: slope,
        amount: 'USD 2.00',
        marker: 'EUR',
        nearby: true,
      );
      expect(p.currency, 'USD');
      expect(p.items.length, 1);
      expect(p.items.single.lineTotal, '2.00');
      expect(p.items.single.currency, isNull);
      expect(p.items.single.currencyUnresolved, isTrue);
      expectSavedMoneyWithheld(p);
    });

    for (final distantMarker in <String?>[null, 'USD']) {
      test('owned EUR is preserved; slope=$slope; distant=$distantMarker', () {
        final p = ownershipReceipt(
          slope: slope,
          amount: 'EUR 2.00',
          marker: distantMarker,
        );
        expect(p.currency, 'USD');
        expect(p.items.length, 1);
        expect(p.items.single.lineTotal, '2.00');
        expect(
          p.items.single.currency,
          'EUR',
          reason:
              'The precedence repair must not relabel an owned foreign amount as USD.',
        );
        expect(p.items.single.currencyUnresolved, isFalse);
        expectSavedMoneyWithheld(p);
        if (distantMarker != null) {
          expect(p.adjustmentsComplete, isFalse);
          expect(p.reviewHints, isNotEmpty);
          expect(p.blocks.map((b) => b.text), contains(distantMarker));
        }
      });
    }
  }
}
