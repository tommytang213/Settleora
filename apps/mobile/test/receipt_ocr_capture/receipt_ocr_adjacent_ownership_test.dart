import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrBlockEvidence _cell(
  String text,
  int row,
  double left,
  double top,
  double right,
  double bottom, {
  double confidence = .99,
  bool malformed = false,
}) => ReceiptOcrBlockEvidence(
  text: text,
  row: row,
  order: row,
  confidence: confidence,
  points: [
    ReceiptOcrPoint(x: left, y: top),
    ReceiptOcrPoint(x: right, y: top),
    ReceiptOcrPoint(x: right, y: bottom),
    if (!malformed) ReceiptOcrPoint(x: left, y: bottom),
  ],
);

ReceiptOcrPreview _receipt({
  bool cash = false,
  bool distant = false,
  String paymentLabel = 'Cash',
  bool paymentBeforeItem = false,
  double paymentLeft = 10,
  double paymentRight = 80,
  double paymentConfidence = .99,
  bool malformedPayment = false,
  bool malformedAmount = false,
  bool layout = true,
  double scale = 1,
}) {
  ReceiptOcrBlockEvidence payment(int row) => _cell(
    paymentLabel,
    row,
    paymentLeft,
    distant ? 260 : 130,
    paymentRight,
    distant ? 280 : 150,
    confidence: paymentConfidence,
    malformed: malformedPayment,
  );
  final source = [
    _cell('Example Market', 0, 10, 0, 270, 20),
    _cell('Coffee USD 2.00', 1, 10, 50, 270, 70),
    if (cash && paymentBeforeItem) payment(2),
    _cell('Green Tea', cash && paymentBeforeItem ? 3 : 2, 10, 100, 80, 120),
    _cell(
      'USD 4.00',
      cash && paymentBeforeItem ? 4 : 3,
      200,
      130,
      270,
      150,
      malformed: malformedAmount,
    ),
    if (cash && !paymentBeforeItem)
      // OCR row IDs differ despite the Cash label sharing the price's
      // physical baseline. Reading-order adjacency cannot establish ownership.
      payment(4),
    _cell('Total USD 6.00', 5, 10, 200, 270, 220),
  ];
  final blocks = [
    for (final block in source)
      ReceiptOcrBlockEvidence(
        text: block.text,
        row: block.row,
        order: block.order,
        confidence: block.confidence,
        points: [
          for (final point in block.points)
            ReceiptOcrPoint(x: point.x * scale, y: point.y * scale),
        ],
      ),
  ];
  return const ReceiptOcrParser().parse(
    blocks.map((b) => b.text).join('\n'),
    blocks: layout ? blocks : const [],
  );
}

void main() {
  test('uncontested adjacent monetary cell stays usable', () {
    final preview = _receipt();
    expect(preview.items.map((item) => item.description), [
      'Coffee',
      'Green Tea',
    ]);
    expect(preview.items.map((item) => item.lineTotal), ['2.00', '4.00']);
    expect(preview.reviewHints, isEmpty);
  });

  test('competing physical payment label prevents item price attribution', () {
    final preview = _receipt(cash: true);
    expect(preview.items.map((item) => item.description), ['Coffee']);
    expect(preview.items.single.lineTotal, '2.00');
    expect(preview.total, '6.00');
    expect(
      preview.blocks.map((b) => b.text),
      containsAll(['Green Tea', 'Cash', 'USD 4.00']),
    );
  });

  test('competing physical owner preserves unresolved item warning', () {
    final preview = _receipt(cash: true);
    expect(
      preview.warnings,
      contains(
        'Some OCR lines need manual review because no traceable line amount was found.',
      ),
    );
    expect(preview.reviewHints, isNotEmpty);
    expect(preview.adjustmentsComplete, isFalse);
    expect(
      preview.itemLineDecisions[2],
      ReceiptOcrItemLineDecision.unpricedDescription,
    );
    expect(
      preview.incompleteAdjustmentReasons.map((v) => v.name),
      contains('unresolvedItemLikeLine'),
    );
  });

  test('distant payment metadata does not veto a unique local owner', () {
    final preview = _receipt(cash: true, distant: true);
    expect(preview.items.map((item) => item.description), [
      'Coffee',
      'Green Tea',
    ]);
    expect(preview.items.map((item) => item.lineTotal), ['2.00', '4.00']);
  });

  test('recognized payment owner cannot supply an unrelated item price', () {
    final preview = _receipt(cash: true, paymentLabel: 'Cash Tender');
    expect(preview.items.map((item) => item.description), ['Coffee']);
    expect(preview.items.single.lineTotal, '2.00');
    expect(preview.total, '6.00');
  });

  test('recognized payment owner cannot clear the unpriced item warning', () {
    final preview = _receipt(cash: true, paymentLabel: 'Cash Tender');
    expect(
      preview.warnings,
      contains(
        'Some OCR lines need manual review because no traceable line amount was found.',
      ),
    );
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.reviewHints, isNotEmpty);
  });

  for (final label in ['Card', 'Tax', 'Other Item', 'Cashback Tote']) {
    test('physical competition is independent of vocabulary: $label', () {
      final preview = _receipt(cash: true, paymentLabel: label);
      expect(
        preview.items.map((item) => item.description),
        isNot(contains('Green Tea')),
      );
      expect(preview.items.first.lineTotal, '2.00');
      expect(preview.total, '6.00');
      expect(preview.adjustmentsComplete, isFalse);
      expect(preview.blocks.map((block) => block.text), contains(label));
    });
  }

  for (final scale in [.5, 1.0, 2.0]) {
    test('earlier OCR row still competes physically at scale $scale', () {
      final preview = _receipt(
        cash: true,
        paymentLabel: 'Cash Tender',
        paymentBeforeItem: true,
        scale: scale,
      );
      expect(preview.items.map((item) => item.description), ['Coffee']);
      expect(preview.warnings, isNotEmpty);
      expect(preview.adjustmentsComplete, isFalse);
      expect(preview.items.single.lineTotal, '2.00');
      expect(preview.total, '6.00');
    });
  }

  test('low-confidence competing evidence cannot establish a unique owner', () {
    final preview = _receipt(cash: true, paymentConfidence: .1);
    expect(preview.items.map((item) => item.description), ['Coffee']);
    expect(preview.adjustmentsComplete, isFalse);
  });

  test('overlapping competing monetary cell stays unresolved', () {
    final preview = _receipt(
      cash: true,
      paymentLabel: 'USD 7.00',
      paymentLeft: 220,
      paymentRight: 290,
    );
    expect(preview.items.map((item) => item.description), ['Coffee']);
    expect(preview.adjustmentsComplete, isFalse);
  });

  for (final kind in ['competitor', 'amount', 'text only']) {
    test('incomplete geometry preserves unpriced uncertainty: $kind', () {
      final preview = _receipt(
        cash: true,
        paymentLabel: 'Cash Tender',
        malformedPayment: kind == 'competitor',
        malformedAmount: kind == 'amount',
        layout: kind != 'text only',
      );
      expect(preview.items.map((item) => item.description), ['Coffee']);
      expect(preview.warnings, isNotEmpty);
      expect(preview.adjustmentsComplete, isFalse);
    });
  }

  test('a distant side column does not veto the local adjacent pair', () {
    final preview = _receipt(cash: true, paymentLeft: 600, paymentRight: 670);
    expect(preview.items.map((item) => item.description), [
      'Coffee',
      'Green Tea',
    ]);
    expect(preview.items.map((item) => item.lineTotal), ['2.00', '4.00']);
  });
}
