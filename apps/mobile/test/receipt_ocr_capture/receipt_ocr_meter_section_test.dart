import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrBlockEvidence _cell(
  String text,
  int row,
  double left,
  double top,
  double right,
  double bottom,
) => ReceiptOcrBlockEvidence(
  text: text,
  row: row,
  order: row * 10,
  points: [
    ReceiptOcrPoint(x: left, y: top),
    ReceiptOcrPoint(x: right, y: top),
    ReceiptOcrPoint(x: right, y: bottom),
    ReceiptOcrPoint(x: left, y: bottom),
  ],
);

List<ReceiptOcrBlockEvidence> _meterBlocks({
  String graphValue = '510',
  String chartHeading = 'Your Usage (kWh)',
  String meterLabel = 'Meter Number',
  String chargeHeading = 'Charges for This Period',
}) => [
  _cell('Regional Electric', 0, 70, 100, 300, 120),
  _cell('Your Electricity Usage', 1, 70, 390, 292, 417),
  _cell(chartHeading, 1, 740, 392, 878, 414),
  _cell('Previous Reading', 2, 236, 438, 365, 458),
  _cell('Current Reading', 2, 415, 438, 536, 458),
  _cell('Usage', 2, 612, 439, 661, 458),
  _cell('700', 2, 743, 425, 774, 444),
  _cell(graphValue, 2, 991, 435, 1020, 453),
  _cell(meterLabel, 3, 82, 449, 190, 468),
  _cell('450', 3, 743, 457, 773, 476),
  _cell('490', 3, 891, 442, 920, 460),
  _cell('420', 3, 941, 445, 970, 465),
  _cell('Apr 01, 2025', 4, 257, 461, 343, 479),
  _cell('Apr 30, 2025', 4, 432, 461, 517, 479),
  _cell('(kWh)', 4, 611, 458, 660, 480),
  _cell('360', 4, 790, 458, 819, 477),
  _cell('340', 4, 841, 462, 869, 481),
  _cell('RX1234567', 5, 73, 501, 166, 519),
  _cell('21,000', 5, 270, 500, 326, 522),
  _cell('21,510', 5, 446, 500, 503, 522),
  _cell('510', 5, 619, 500, 654, 521),
  _cell('250', 5, 743, 488, 773, 509),
  _cell('0', 6, 758, 521, 773, 540),
  _cell('Dec Jan Feb Mar Apr', 6, 789, 535, 1021, 553),
  _cell(chargeHeading, 7, 70, 590, 302, 613),
  _cell('Description', 8, 69, 632, 156, 652),
  _cell('Usage / Units', 8, 331, 632, 426, 652),
  _cell('Rate', 8, 496, 632, 533, 652),
  _cell('Amount', 8, 616, 632, 674, 652),
  _cell('Energy Charge', 9, 70, 670, 230, 690),
  _cell('510 kWh', 9, 331, 670, 426, 690),
  _cell(r'$0.1000', 9, 496, 670, 558, 690),
  _cell(r'$51.00', 9, 616, 670, 674, 690),
  _cell('Subtotal USD 51.00', 10, 70, 710, 674, 730),
  _cell('Total Amount Due USD 51.00', 11, 70, 750, 674, 770),
];

ReceiptOcrPreview _parse(
  List<ReceiptOcrBlockEvidence> blocks, {
  bool includeGeometry = true,
}) {
  // Native evidence assigns a unique sequence ordinal to every block.
  for (var i = 0; i < blocks.length; i++) {
    final b = blocks[i];
    blocks[i] = ReceiptOcrBlockEvidence(
      text: b.text,
      row: b.row,
      order: i,
      points: b.points,
    );
  }
  final rows = <int, List<String>>{};
  for (final block in blocks) {
    (rows[block.row] ??= []).add(block.text);
  }
  return const ReceiptOcrParser().parse(
    rows.values.map((row) => row.join(' ')).join('\n'),
    blocks: includeGeometry ? blocks : const [],
  );
}

void main() {
  test('round2 simple bill amounts survive text-only and merged headings', () {
    for (final heading in [
      'Details of Current Charges',
      'Detail of Current Charge',
    ]) {
      for (final geometry in [false, true]) {
        final blocks = [
          _cell('Regional Utility', 0, 20, 0, 350, 12),
          _cell(heading, 1, 20, 20, 350, 32),
          _cell('Description Amount', 2, 20, 40, 700, 52),
          _cell('Water Plan USD 20.00', 3, 20, 60, 700, 72),
          _cell('Total Amount Due USD 20.00', 4, 20, 80, 700, 92),
        ];
        final preview = _parse(blocks, includeGeometry: geometry);
        expect(preview.items.map((i) => i.description), ['Water Plan']);
        expect(preview.items.single.lineTotal, '20.00');
        expect(
          preview.itemLineDecisions[3],
          ReceiptOcrItemLineDecision.pricedItemSelected,
        );
      }
    }
  });

  test('round2 adjacent currency and signs prevent meter graph ownership', () {
    for (final marker in ['EUR', r'$', '-', '−', '+']) {
      final blocks = _meterBlocks();
      blocks.insert(8, _cell(marker, 3, 712, 425, 738, 444));
      final preview = _parse(blocks);
      expect(
        preview.itemLineDecisions[2],
        ReceiptOcrItemLineDecision.pricedItemSelected,
        reason: marker,
      );
      expect(
        preview.itemLineDecisions[4],
        ReceiptOcrItemLineDecision.pricedItemSelected,
        reason: marker,
      );
      expect(
        preview.items.any((i) => i.description.contains('Previous Reading')),
        isTrue,
        reason: marker,
      );
      expect(preview.reviewHints, isNotEmpty);
      expect(preview.blocks, blocks);
    }
  });

  test('round2 meter label on the reading header remains nonfinancial', () {
    final blocks = _meterBlocks();
    blocks[8] = _cell('Meter Number', 2, 82, 438, 190, 458);
    final preview = _parse(blocks);
    expect(preview.items.map((i) => i.description), ['Energy Charge']);
    expect(
      preview.itemLineDecisions[2],
      ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
    );
    expect(
      preview.itemLineDecisions[4],
      ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
    );
    expect(
      preview.blocks.map((b) => b.order),
      List.generate(blocks.length, (i) => i),
    );
    expect(preview.blocks, blocks);
  });

  test('round2 overlapping or distant calendar cannot prove a graph', () {
    final overlapping = _meterBlocks();
    overlapping.removeWhere((b) => b.text == 'Dec Jan Feb Mar Apr');
    final axisIndex = overlapping.indexWhere((b) => b.row == 7);
    overlapping.insertAll(axisIndex, [
      _cell('Dec Jan Feb', 6, 789, 535, 950, 553),
      _cell('Mar Apr', 6, 920, 535, 1021, 553),
    ]);
    final distant = _meterBlocks();
    final index = distant.indexWhere((b) => b.text == 'Dec Jan Feb Mar Apr');
    distant[index] = _cell('Dec Jan Feb Mar Apr', 6, 789, 1535, 1021, 1553);
    for (final blocks in [overlapping, distant]) {
      final preview = _parse(blocks);
      expect(
        preview.itemLineDecisions[2],
        ReceiptOcrItemLineDecision.pricedItemSelected,
      );
      expect(
        preview.itemLineDecisions[4],
        ReceiptOcrItemLineDecision.pricedItemSelected,
      );
      expect(preview.blocks, blocks);
    }
  });

  test(
    'round2 missing reading values do not turn proven labels into prices',
    () {
      final blocks = _meterBlocks();
      blocks.removeWhere((b) => b.row == 5 && b.text != '250');
      final preview = _parse(blocks);
      expect(preview.items.map((i) => i.description), ['Energy Charge']);
      expect(
        preview.itemLineDecisions[2],
        ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
      );
      expect(
        preview.itemLineDecisions[4],
        ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
      );
      expect(preview.blocks, blocks);
    },
  );

  test(
    'round2 simple heading fallback cannot promote rate or period numbers',
    () {
      for (final heading in [
        'Current Charges Detail',
        'Details of Current Charges',
        'Detail of Current Charge',
      ]) {
        for (final row in [
          'Water Charge 25 m3 @ USD 1.80',
          'Water Plan (Apr 1 - Apr 30) USD 20.00',
          'State Gas Tax (2.5%) 10 therms USD 0.10',
          'Energy Charge USD 0.20 USD 10.00',
        ]) {
          final preview = const ReceiptOcrParser().parse(
            'Regional Utility\n$heading\nDescription Amount\n$row\n'
            'Total Amount Due USD 20.00',
          );
          expect(preview.items, isEmpty, reason: '$heading / $row');
          expect(
            preview.itemLineDecisions[3],
            ReceiptOcrItemLineDecision.ambiguousChargeSkipped,
          );
          expect(preview.reviewHints, isNotEmpty);
        }
        final preview = const ReceiptOcrParser().parse(
          'Regional Utility\n$heading\nDescription Rate Amount\n'
          'Water Plan USD 0.20\nTotal Amount Due USD 20.00',
        );
        expect(preview.items, isEmpty);
        expect(
          preview.itemLineDecisions[3],
          ReceiptOcrItemLineDecision.ambiguousChargeSkipped,
        );
      }
    },
  );

  test('bounded meter table and usage graph are not priced items', () {
    final blocks = _meterBlocks();
    final preview = _parse(blocks);
    expect(preview.items.map((item) => item.description), ['Energy Charge']);
    expect(preview.items.single.lineTotal, '51.00');
    expect(preview.total, '51.00');
    expect(preview.blocks, blocks);
    expect(preview.rawTextLineCount, 12);
  });

  test(
    'meter ownership needs layout, chart, meter and charge-section anchors',
    () {
      for (final blocks in [
        _meterBlocks(chartHeading: 'Usage Estimates'),
        _meterBlocks(meterLabel: 'Serial Number'),
        _meterBlocks(chargeHeading: 'Products'),
      ]) {
        final preview = _parse(blocks);
        expect(preview.items.length, greaterThan(1));
        expect(preview.reviewHints, isNotEmpty);
        expect(preview.blocks, blocks);
      }
      final withoutLayout = _parse(_meterBlocks(), includeGeometry: false);
      expect(withoutLayout.items.length, greaterThan(1));
      expect(withoutLayout.reviewHints, isNotEmpty);
    },
  );

  test(
    'money signs decimals and product words cannot become graph integers',
    () {
      for (final value in [
        r'$510',
        'USD 510',
        '510.00',
        '-510',
        '+510',
        '−510',
        '510 CR',
        'Sensor 510',
      ]) {
        final blocks = _meterBlocks(graphValue: value);
        final preview = _parse(blocks);
        expect(preview.items.length, greaterThan(1), reason: value);
        expect(preview.reviewHints, isNotEmpty, reason: value);
        expect(preview.blocks, blocks);
      }
    },
  );

  test(
    'unknown neighboring words cannot be consumed with a meter date row',
    () {
      for (final extra in [
        'Replacement Sensor',
        'Replacement Sensor USD 9.00',
      ]) {
        final blocks = _meterBlocks();
        final index = blocks.indexWhere((b) => b.row == 5);
        blocks.insert(index, _cell(extra, 4, 1040, 461, 1300, 480));
        final preview = _parse(blocks);
        expect(preview.items.length, greaterThan(1));
        expect(preview.reviewHints, isNotEmpty);
        expect(preview.blocks, blocks);
      }
    },
  );

  test('invalid or competing geometry keeps the meter rows unresolved', () {
    final source = _meterBlocks();
    final targets = [
      _cell('510', 2, 400, 435, 450, 453), // In a reading column.
      _cell('510', 2, 991, 435, 991, 453), // Degenerate box.
      _cell('510', 2, double.nan, 435, 1020, 453),
    ];
    for (final target in targets) {
      final blocks = [...source];
      blocks[7] = target;
      final preview = _parse(blocks);
      expect(preview.items.length, greaterThan(1));
      expect(preview.reviewHints, isNotEmpty);
    }
    final competing = [...source];
    competing.insert(8, _cell('Sensor', 3, 990, 435, 1021, 453));
    final preview = _parse(competing);
    expect(preview.items.length, greaterThan(1));
    expect(preview.reviewHints, isNotEmpty);
    expect(preview.blocks, competing);
  });

  test(
    'usage caption needs a bounded ordered calendar and clean graph region',
    () {
      for (final text in ['Dec Feb Jan Mar Apr', 'Dec Jan', 'Usage Forecast']) {
        final blocks = _meterBlocks();
        final index = blocks.indexWhere((b) => b.text == 'Dec Jan Feb Mar Apr');
        blocks[index] = _cell(text, 6, 789, 535, 1021, 553);
        final preview = _parse(blocks);
        expect(preview.items.length, greaterThan(1), reason: text);
        expect(preview.reviewHints, isNotEmpty, reason: text);
      }
      final blocks = _meterBlocks();
      blocks.insert(8, _cell('Solar credit USD 10.00', 3, 790, 483, 1000, 503));
      final preview = _parse(blocks);
      expect(preview.items.length, greaterThan(1));
      expect(preview.reviewHints, isNotEmpty);
      expect(preview.blocks, blocks);
    },
  );

  test('priced products outside the meter rows retain their ordinary path', () {
    final blocks = _meterBlocks();
    blocks.add(_cell('Replacement Sensor USD 9.00', 12, 70, 790, 674, 810));
    final preview = _parse(blocks);
    expect(preview.items.map((item) => item.description), [
      'Energy Charge',
      'Replacement Sensor',
    ]);
    expect(preview.items.last.lineTotal, '9.00');
    expect(preview.reviewHints, isNotEmpty);
  });

  test('current-charge heading variants preserve ambiguous fee evidence', () {
    for (final heading in [
      'Current Charges Detail',
      'Details of Current Charges',
      'Detail of Current Charge',
    ]) {
      final blocks = [
        _cell('Regional Utility', 0, 20, 0, 350, 12),
        _cell(heading, 1, 20, 20, 350, 32),
        _cell('Description', 2, 20, 40, 300, 52),
        _cell('Amount', 2, 600, 40, 700, 52),
        _cell('Water Plan', 3, 20, 60, 300, 72),
        _cell('USD 20.00', 3, 600, 60, 700, 72),
        _cell('Taxes and Regulatory Fees', 4, 20, 80, 300, 92),
        _cell('USD 2.00', 4, 600, 80, 700, 92),
        _cell('Total Current Charges USD 22.00', 5, 20, 100, 700, 112),
      ];
      final preview = _parse(blocks);
      expect(preview.items.map((item) => item.description), [
        'Water Plan',
      ], reason: heading);
      expect(preview.tax, isNull);
      expect(preview.reviewHints, isNotEmpty);
      expect(preview.blocks, blocks);
    }
  });
}
