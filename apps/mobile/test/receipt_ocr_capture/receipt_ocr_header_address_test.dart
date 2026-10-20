import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrPreview _parse({
  String street = '82 Highway 9',
  String postal = 'Riverton, C4 54321',
  String phone = '(555) 222-0199',
  bool geometry = true,
  bool fuel = true,
  bool extraPurchase = false,
  bool splitPostal = false,
  bool misplacedPostal = false,
  bool distantPostal = false,
  bool crossedPostal = false,
  bool invalidPostal = false,
  bool unknownNeighbor = false,
  bool neighboringCurrency = false,
  bool distantCurrency = false,
  bool displacedHeader = false,
  List<String>? purchases,
  double? postalConfidence = 0.99,
}) {
  final lines = [
    'WAYPOINT SHOP',
    if (displacedHeader) 'Notebook USD 2.00',
    street,
    postal,
    phone,
    if (purchases != null)
      ...purchases
    else if (fuel) ...[
      'DATE 2026-08-12',
      'FUEL Premium',
      'GALLONS 8.250',
      'PRICE/GAL USD 4.000',
    ] else
      'Bread USD 33.00',
    if (extraPurchase) 'Water USD 2.00',
    'TOTAL USD ${extraPurchase ? '35.00' : '33.00'}',
    if (unknownNeighbor) 'Mystery',
    if (neighboringCurrency || distantCurrency) 'USD',
  ];
  final postalIndex = lines.indexOf(postal);
  final blocks = <ReceiptOcrBlockEvidence>[];
  for (var row = 0; row < lines.length; row++) {
    final isPostal = row == postalIndex;
    final isCurrency = lines[row] == 'USD';
    final x = isCurrency
        ? distantCurrency
              ? 500.0
              : 282.0
        : isPostal && misplacedPostal
        ? 400.0
        : 100.0;
    final y = isPostal && distantPostal
        ? 500.0
        : (row == lines.length - 1 && unknownNeighbor) || isCurrency
        ? postalIndex * 20.0
        : row * 20.0;
    final points = [
      ReceiptOcrPoint(x: invalidPostal && isPostal ? double.nan : x, y: y),
      ReceiptOcrPoint(x: x + 180, y: y),
      ReceiptOcrPoint(x: x + 180, y: y + 12),
      ReceiptOcrPoint(x: x, y: y + 12),
    ];
    blocks.add(
      ReceiptOcrBlockEvidence(
        text: isPostal && splitPostal ? postal.split(' ').first : lines[row],
        order: blocks.length,
        row: row,
        confidence: isPostal ? postalConfidence : 0.99,
        points: crossedPostal && isPostal
            ? [points[0], points[2], points[1], points[3]]
            : points,
      ),
    );
    if (isPostal && splitPostal) {
      blocks.add(
        ReceiptOcrBlockEvidence(
          text: postal.split(' ').skip(1).join(' '),
          order: blocks.length,
          row: row,
          confidence: 0.99,
          points: points,
        ),
      );
    }
  }
  final preview = const ReceiptOcrParser().parse(
    lines.join('\n'),
    blocks: geometry ? blocks : const [],
  );
  expect(preview.blocks, geometry ? blocks : isEmpty);
  return preview;
}

void main() {
  test('complete header address does not displace measured fuel', () {
    final preview = _parse();
    expect(preview.merchant, 'WAYPOINT SHOP');
    expect(preview.items, hasLength(1));
    final item = preview.items.single;
    expect(item.description, 'Premium');
    expect(item.quantity, '8.250');
    expect(item.unitPrice, '4.000');
    expect(item.lineTotal, '33.00');
    expect(item.currency, 'USD');
    expect(preview.blocks[2].text, 'Riverton, C4 54321');
    expect(
      preview.itemLineDecisions[2],
      ReceiptOcrItemLineDecision.metadataOrHeaderSkipped,
    );
  });

  test('header role is independent of merchant and fuel purchase type', () {
    for (final street in ['82 Highway 9', '82 Harlow Road']) {
      final preview = _parse(street: street, fuel: false);
      expect(preview.items.map((item) => item.description), ['Bread']);
      expect(preview.items.single.lineTotal, '33.00');
    }
  });

  test('header ownership preserves another purchase and fuel ambiguity', () {
    final preview = _parse(extraPurchase: true);
    expect(preview.items.map((item) => item.description), ['Water']);
    expect(preview.items.single.lineTotal, '2.00');
    expect(
      preview.incompleteAdjustmentReasons,
      contains(ReceiptOcrIncompleteAdjustmentReason.unretainedPricedItem),
    );
  });

  test('closed header preserves numeric products and printed quantities', () {
    final preview = _parse(
      purchases: [
        '7 Up Soda USD 2.50',
        '2 Pack Batteries USD 3.00',
        'Apples 2 x 3.00 USD 6.00',
        'Riverton C4 USD 21.50',
      ],
    );
    expect(preview.items.map((item) => item.description), [
      '7 Up Soda',
      '2 Pack Batteries',
      'Apples',
      'Riverton C4',
    ]);
    expect(preview.items.map((item) => item.quantity), [null, null, '2', null]);
    expect(preview.items.map((item) => item.unitPrice), [
      null,
      null,
      '3.00',
      null,
    ]);
    expect(preview.items.map((item) => item.lineTotal), [
      '2.50',
      '3.00',
      '6.00',
      '21.50',
    ]);
  });

  test('a separated denomination does not own header postal digits', () {
    final preview = _parse(distantCurrency: true);
    expect(preview.items.single.description, 'Premium');
    expect(preview.items.single.lineTotal, '33.00');
  });

  final controls = <String, ReceiptOcrPreview Function()>{
    'text only': () => _parse(geometry: false),
    'no street': () => _parse(street: 'Travel Collection'),
    'street product suffix': () => _parse(street: '82 Highway 9 Poster'),
    'numeric product street': () => _parse(street: '7 Up Soda USD 2.50'),
    'priced highway street': () => _parse(street: '82 Highway 9 USD 3.00'),
    'quantity street': () => _parse(street: 'Batteries 2 x 3.00 USD 6.00'),
    'quantity postal': () => _parse(postal: 'Riverton C4 2 x 3.00 USD 6.00'),
    'ambiguous region': () => _parse(postal: 'Riverton, C4X 54321'),
    'ambiguous product': () => _parse(postal: 'Riverton C4 54321'),
    'no phone': () => _parse(phone: 'Collection Series'),
    'phone extra money': () => _parse(phone: '(555) 222-0199 USD 3.00'),
    'postal decimal amount': () => _parse(postal: 'Riverton, C4 543.21'),
    'postal currency': () => _parse(postal: 'Riverton, C4 USD 54321'),
    'postal trailing currency': () => _parse(postal: 'Riverton, C4 54321 USD'),
    'postal split cells': () => _parse(splitPostal: true),
    'postal misalignment': () => _parse(misplacedPostal: true),
    'postal distance': () => _parse(distantPostal: true),
    'postal crossed geometry': () => _parse(crossedPostal: true),
    'postal invalid geometry': () => _parse(invalidPostal: true),
    'postal low confidence': () => _parse(postalConfidence: 0.5),
    'postal no confidence': () => _parse(postalConfidence: null),
    'postal excessive confidence': () => _parse(postalConfidence: 1.1),
    'postal nonfinite confidence': () => _parse(postalConfidence: double.nan),
    'competing block': () => _parse(unknownNeighbor: true),
    'neighboring denomination': () => _parse(neighboringCurrency: true),
    'outside merchant header': () => _parse(displacedHeader: true),
  };
  for (final entry in controls.entries) {
    test('incomplete address stays reviewable: ${entry.key}', () {
      final preview = entry.value();
      expect(
        preview.items.any((item) => item.description == 'Premium'),
        isFalse,
      );
      expect(
        preview.itemLineDecisions[entry.key == 'outside merchant header'
            ? 3
            : 2],
        isNot(ReceiptOcrItemLineDecision.metadataOrHeaderSkipped),
      );
    });
  }
}
