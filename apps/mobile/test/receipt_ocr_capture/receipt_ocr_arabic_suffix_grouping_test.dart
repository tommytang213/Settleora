import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrPreview _receipt(
  String money, {
  String description = 'قهوة',
  String? unresolved,
}) => const ReceiptOcrParser().parse(
  [
    'متجر دبي',
    '$description $money',
    ?unresolved,
    'المجموع الفرعي $money',
    'الإجمالي $money',
  ].join('\n'),
);

ReceiptOcrPreview _ownedReceipt(
  String money, {
  String description = 'قهوة',
  String? unresolved,
  bool geometry = true,
  bool displacedAmount = false,
}) {
  final rows = [
    ['متجر دبي'],
    [description, money],
    if (unresolved != null) [unresolved],
    ['المجموع الفرعي $money'],
    ['الإجمالي $money'],
  ];
  final blocks = <ReceiptOcrBlockEvidence>[];
  for (var row = 0; row < rows.length; row++) {
    for (var column = 0; column < rows[row].length; column++) {
      final left = column == 0 ? 40.0 : 340.0;
      final top =
          row * 60.0 +
          (displacedAmount && row == 1 && column == 1 ? 35.0 : 0.0);
      blocks.add(
        ReceiptOcrBlockEvidence(
          text: rows[row][column],
          row: row,
          order: blocks.length,
          points: geometry
              ? [
                  ReceiptOcrPoint(x: left, y: top),
                  ReceiptOcrPoint(x: left + 220, y: top),
                  ReceiptOcrPoint(x: left + 220, y: top + 20),
                  ReceiptOcrPoint(x: left, y: top + 20),
                ]
              : const [],
        ),
      );
    }
  }
  return const ReceiptOcrParser().parse(
    rows.map((row) => row.join(' ')).join('\n'),
    blocks: blocks,
  );
}

void _expectAmount(
  ReceiptOcrPreview preview,
  String amount, {
  String description = 'قهوة',
}) {
  expect(preview.currency, 'AED');
  expect(preview.currencyProvenance, ReceiptOcrCurrencyProvenance.explicit);
  expect(preview.items, hasLength(1));
  expect(preview.items.single.description, description);
  expect(preview.items.single.lineTotal, amount);
  expect(preview.items.single.currency, 'AED');
  expect(preview.items.single.currencyUnresolved, isFalse);
  expect(preview.items.single.quantity, isNull);
  expect(preview.items.single.unitPrice, isNull);
  expect(preview.subtotal, amount);
  expect(preview.total, amount);
}

void _expectSameReviewState(
  ReceiptOcrPreview actual,
  ReceiptOcrPreview prefix,
) {
  expect(actual.adjustmentsComplete, prefix.adjustmentsComplete);
  expect(
    actual.incompleteAdjustmentReasons,
    prefix.incompleteAdjustmentReasons,
  );
  expect(actual.warnings, prefix.warnings);
  expect(actual.reviewHints, prefix.reviewHints);
  expect(actual.reviewHintDecision, prefix.reviewHintDecision);
}

void main() {
  // Synthetic ownership cases, not retained native OCR or geometry. An exact
  // summary label or a separate monetary cell owns the complete numeric run.
  for (final separator in [' ', '\u00a0']) {
    for (final marker in ['د.إ', 'دإ']) {
      test(
        'owned Arabic suffix keeps grouped amount ${separator.codeUnits} $marker',
        () {
          final printed = '١$separator٢٣٤٫٥٠';
          final suffix = _ownedReceipt('$printed $marker');
          final prefix = _ownedReceipt('$marker $printed');
          _expectAmount(prefix, '1234.50');
          _expectAmount(suffix, '1234.50');
          _expectSameReviewState(suffix, prefix);
        },
      );
    }
  }

  test('owned Arabic suffix keeps every group and comma decimal', () {
    const printed = '١ ٢٣٤ ٥٦٧,٥٠';
    final suffix = _ownedReceipt('$printed د.إ');
    final prefix = _ownedReceipt('د.إ $printed');
    _expectAmount(prefix, '1234567.50');
    _expectAmount(suffix, '1234567.50');
    _expectSameReviewState(suffix, prefix);
  });

  test('bounded description cell retains its own number', () {
    final suffix = _ownedReceipt('١ ٢٣٤٫٥٠ د.إ', description: 'Blend 7');
    final prefix = _ownedReceipt('د.إ ١ ٢٣٤٫٥٠', description: 'Blend 7');
    _expectAmount(prefix, '1234.50', description: 'Blend 7');
    _expectAmount(suffix, '1234.50', description: 'Blend 7');
    _expectSameReviewState(suffix, prefix);
  });

  test('Arabic suffix keeps the minus sign on a grouped subtotal', () {
    final preview = const ReceiptOcrParser().parse(
      'متجر دبي\nالمجموع الفرعي -١ ٢٣٤٫٥٠ د.إ',
    );
    expect(preview.subtotal, '-1234.50');
  });

  test('existing ungrouped and alternate AED placements stay equivalent', () {
    for (final money in ['١٢,٥٠ د.إ', '١٢,٥٠ دإ', 'د.إ ١٢,٥٠', '12,50 AED']) {
      final preview = _receipt(money);
      _expectAmount(preview, '12.50');
      _expectSameReviewState(preview, _receipt('AED 12.50'));
    }
    for (final money in ['د.إ ١ ٢٣٤٫٥٠', 'AED 1 234.50', '1 234.50 AED']) {
      final preview = _receipt(money);
      _expectAmount(preview, '1234.50');
      _expectSameReviewState(preview, _receipt('AED 1234.50'));
    }
  });

  for (final description in [
    'قهوة x2',
    'قهوة No5',
    'قهوة iPhone15',
    'قهوة 商品2',
    'قهوة Cafe\u03012',
    'قهوة ²2',
  ]) {
    test('existing AED placements retain literal $description', () {
      for (final money in ['د.إ ١٢٫٥٠', 'دإ ١٢٫٥٠', '12.50 AED']) {
        _expectAmount(
          _receipt(money, description: description),
          '12.50',
          description: description,
        );
      }
    });

    for (final marker in ['د.إ', 'دإ']) {
      test('Arabic suffix $marker retains literal $description', () {
        final prefix = _receipt('$marker ١٢٫٥٠', description: description);
        final latin = _receipt('12.50 AED', description: description);
        final suffix = _receipt('١٢٫٥٠ $marker', description: description);

        _expectAmount(prefix, '12.50', description: description);
        _expectAmount(latin, '12.50', description: description);
        _expectAmount(suffix, '12.50', description: description);
        _expectSameReviewState(suffix, prefix);
        _expectSameReviewState(suffix, latin);
      });
    }
  }

  for (final marker in ['د.إ', 'دإ']) {
    for (final joined in [
      'é1',
      '商品1',
      'é\u03011',
      '²1',
      '𐐀1',
      '𝟙1',
      '𐐀\u03011',
    ]) {
      test(
        'Arabic suffix $marker does not skip inside selected $joined grouping',
        () {
          final preview = const ReceiptOcrParser().parse(
            'Market\nSubtotal $joined 234.50 $marker',
          );
          expect(preview.subtotal, isNull);
          expect(preview.adjustmentsComplete, isFalse);
        },
      );
    }

    for (final description in [
      'قهوة x-2',
      'قهوة x+2',
      'قهوة No.5',
      'قهوة v1.2',
    ]) {
      test(
        'Arabic suffix $marker keeps punctuation ambiguity in $description',
        () {
          final preview = const ReceiptOcrParser().parse(
            'متجر دبي\n$description ١٢٫٥٠ $marker',
          );
          expect(preview.items, isEmpty);
          expect(preview.adjustmentsComplete, isFalse);
        },
      );
    }

    for (final row in ['قهوة 2 123', 'قهوة x2 2 123', 'قهوة x2 12 34 567.50']) {
      test(
        'Arabic suffix $marker preserves standalone-group rejection for $row',
        () {
          final preview = const ReceiptOcrParser().parse(
            'متجر دبي\n$row $marker',
          );
          expect(preview.items, isEmpty);
          expect(preview.adjustmentsComplete, isFalse);
        },
      );
    }

    test('Arabic suffix $marker cannot select an extra bare numeric tail', () {
      final preview = const ReceiptOcrParser().parse(
        'متجر دبي\nالمجموع الفرعي 1 234.50 9 $marker',
      );
      expect(preview.subtotal, isNull);
      expect(preview.adjustmentsComplete, isFalse);
    });
  }

  test('Arabic suffix does not repair malformed printed grouping', () {
    for (final printed in ['١٢,٣٤٫٥٦', '١,٢٣,٤٥٫٦٧', "١٢'٣٤٫٥٦"]) {
      final preview = const ReceiptOcrParser().parse(
        'متجر دبي\nالمجموع الفرعي $printed د.إ',
      );
      expect(preview.subtotal, isNull, reason: printed);
      expect(preview.adjustmentsComplete, isFalse, reason: printed);
    }
  });

  test('grouped suffix preserves unrelated unresolved review evidence', () {
    for (final unresolved in ['Unpriced pastry', 'Discount']) {
      final suffix = _ownedReceipt('١ ٢٣٤٫٥٠ د.إ', unresolved: unresolved);
      final prefix = _ownedReceipt('د.إ ١ ٢٣٤٫٥٠', unresolved: unresolved);
      _expectAmount(suffix, '1234.50');
      expect(suffix.adjustmentsComplete, isFalse, reason: unresolved);
      expect(
        suffix.incompleteAdjustmentReasons,
        isNotEmpty,
        reason: unresolved,
      );
      _expectSameReviewState(suffix, prefix);
    }
  });

  test(
    'review integer suffix leaves an unowned quantity boundary unresolved',
    () {
      final preview = const ReceiptOcrParser().parse(
        'متجر دبي\nقهوة 2 123 د.إ',
      );
      expect(preview.items, isEmpty);
      expect(preview.adjustmentsComplete, isFalse);
    },
  );

  test('review malformed space groups cannot yield a subtotal tail', () {
    final preview = const ReceiptOcrParser().parse(
      'متجر دبي\nالمجموع الفرعي ١٢ ٣٤ ٥٦٧٫٥٠ د.إ',
    );
    expect(preview.subtotal, isNull);
    expect(preview.adjustmentsComplete, isFalse);
  });

  test('a bounded whole-number monetary cell owns its complete grouping', () {
    _expectAmount(_ownedReceipt('٢ ١٢٣ د.إ'), '2123');
  });

  test('a decimal does not prove ownership of an item numeric group', () {
    for (final printed in ['١ ٢٣٤٫٥٠', '٢ ١٢٣٫٥٠', '٧ ١ ٢٣٤٫٥٠']) {
      final preview = _receipt('$printed د.إ');
      expect(preview.items, isEmpty, reason: printed);
      expect(preview.adjustmentsComplete, isFalse, reason: printed);
    }
  });

  test(
    'missing or displaced geometry cannot establish grouped item ownership',
    () {
      for (final preview in [
        _ownedReceipt('١ ٢٣٤٫٥٠ د.إ', geometry: false),
        _ownedReceipt('١ ٢٣٤٫٥٠ د.إ', displacedAmount: true),
      ]) {
        expect(preview.items, isEmpty);
        expect(preview.adjustmentsComplete, isFalse);
      }
    },
  );

  test('unknown or extended labels cannot own a grouped suffix amount', () {
    for (final label in ['Mystery summary', 'المجموع الفرعي إضافي']) {
      final preview = const ReceiptOcrParser().parse(
        'متجر دبي\n$label ١ ٢٣٤٫٥٠ د.إ',
      );
      expect(preview.items, isEmpty, reason: label);
      expect(preview.subtotal, isNull, reason: label);
      expect(preview.total, isNull, reason: label);
      expect(preview.adjustmentsComplete, isFalse, reason: label);
    }
  });

  test(
    'a conflicting prefix currency is not cleared by grouped suffix ownership',
    () {
      final preview = _ownedReceipt('USD ١ ٢٣٤٫٥٠ د.إ');
      expect(
        preview.items.where(
          (item) => !item.currencyUnresolved && item.currency != null,
        ),
        isEmpty,
      );
      expect(preview.adjustmentsComplete, isFalse);
      expect(
        preview.incompleteAdjustmentReasons,
        contains(ReceiptOcrIncompleteAdjustmentReason.labeledAmountEvidence),
      );
      expect(
        preview.warnings,
        contains(
          'Some item price evidence remains unresolved. Review the original receipt before applying.',
        ),
      );
    },
  );

  for (final ending in [':', ' AED', ': AED', ' / AED']) {
    test(
      'R3 malformed grouped summary cannot escape through suffix $ending',
      () {
        final preview = const ReceiptOcrParser().parse(
          'متجر دبي\nالمجموع الفرعي ١٢ ٣٤ ٥٦٧٫٥٠ د.إ$ending',
        );
        expect(preview.subtotal, isNull);
        expect(preview.adjustmentsComplete, isFalse);
      },
    );
  }

  test(
    'R3 permitted suffix punctuation preserves an owned complete grouping',
    () {
      for (final ending in [':', ' AED', ': AED', ' / AED']) {
        final preview = const ReceiptOcrParser().parse(
          'متجر دبي\nالمجموع الفرعي ١ ٢٣٤٫٥٠ د.إ$ending',
        );
        expect(preview.subtotal, '1234.50', reason: ending);
        expect(preview.subtotalCurrency, 'AED', reason: ending);
      }
    },
  );

  for (final rate in ['5%', '5.5%']) {
    test(
      'R3 existing complete tax rate $rate owns its grouped suffix amount',
      () {
        final preview = const ReceiptOcrParser().parse(
          'Market\nCoffee AED 1234.50\nTax $rate 1 234.50 د.إ',
        );
        expect(preview.tax, '1234.50');
        expect(preview.taxCurrency, 'AED');
        expect(preview.taxHasExplicitCurrencyEvidence, isTrue);
      },
    );
  }

  test('R3 unknown rate qualifiers and malformed groups stay unresolved', () {
    for (final field in [
      'Tax 5 1 234.50 د.إ',
      'Tax 5000% 1 234.50 د.إ',
      'Tax 5% extra 1 234.50 د.إ',
      'Tax 5% 7% 1 234.50 د.إ',
      'Tax 5% 12 34 567.50 د.إ:',
    ]) {
      final preview = const ReceiptOcrParser().parse('Market\n$field');
      expect(preview.tax, isNull, reason: field);
      expect(preview.adjustmentsComplete, isFalse, reason: field);
    }
  });

  test(
    'R3 a malformed separate row does not erase an independently owned subtotal',
    () {
      final preview = const ReceiptOcrParser().parse(
        'Market\nGift note 12 34 567.50 د.إ:\nSubtotal AED 20.00',
      );
      expect(preview.subtotal, '20.00');
      expect(preview.subtotalCurrency, 'AED');
      expect(preview.adjustmentsComplete, isFalse);
    },
  );

  // This matrix follows the existing scalar selector's admitted delimiters.
  // Punctuation recognition here must never grant a new monetary role.
  const admittedSeparators = [
    '',
    ' ',
    '\t',
    ':',
    '=',
    '|',
    ';',
    '&',
    '(',
    ')',
    '[',
    ']',
    '#',
    '!',
    '?',
    '<',
    '>',
    '{',
    '}',
    '"',
    '`',
    '~',
    '^',
    '*',
    '\\',
    '؛',
    '…',
    '—',
    ' , ',
    ' . ',
    " ' ",
    ' ’ ',
    ' / ',
    ' and ',
    ' plus ',
    ' or ',
    ' vs ',
    ' vs. ',
    ' versus ',
    ' to ',
  ];
  for (final separator in admittedSeparators) {
    test('R4 malformed run before marker delimiter ${separator.codeUnits}', () {
      for (final marker in ['د.إ', 'دإ']) {
        final preview = const ReceiptOcrParser().parse(
          'Market\nالمجموع الفرعي ١٢ ٣٤ ٥٦٧٫٥٠$separator$marker',
        );
        expect(preview.subtotal, isNull, reason: marker);
        expect(preview.adjustmentsComplete, isFalse, reason: marker);
      }
    });
    test(
      'R4 existing valid grouping before delimiter ${separator.codeUnits}',
      () {
        for (final marker in ['د.إ', 'دإ']) {
          final preview = const ReceiptOcrParser().parse(
            'Market\nالمجموع الفرعي ١ ٢٣٤٫٥٠$separator$marker',
          );
          expect(preview.subtotal, '1234.50', reason: marker);
        }
      },
    );
  }

  test('R4 malformed grouping stays rejected after every marker delimiter', () {
    for (final marker in ['د.إ', 'دإ']) {
      for (final separator in admittedSeparators) {
        final preview = const ReceiptOcrParser().parse(
          'Market\nالمجموع الفرعي ١٢ ٣٤ ٥٦٧٫٥٠ $marker$separator',
        );
        expect(preview.subtotal, isNull, reason: '$marker $separator');
        expect(
          preview.adjustmentsComplete,
          isFalse,
          reason: '$marker $separator',
        );
      }
    }
  });

  for (final entry in {
    '+١ ٢٣٤٫٥٠ د.إ': '1234.50',
    '-١ ٢٣٤٫٥٠ د.إ': '-1234.50',
    'AED +١ ٢٣٤٫٥٠ د.إ': '1234.50',
    '+د.إ١ ٢٣٤٫٥٠ د.إ': '1234.50',
    '-د.إ١ ٢٣٤٫٥٠ د.إ': '-1234.50',
  }.entries) {
    test('R4 existing owned single sign ${entry.key}', () {
      final preview = const ReceiptOcrParser().parse(
        'Market\nالمجموع الفرعي ${entry.key}',
      );
      expect(preview.subtotal, entry.value);
    });
  }

  test('R4 immediate forbidden punctuation is not newly admitted', () {
    for (final separator in [',', '.', "'", '’', '/']) {
      final preview = const ReceiptOcrParser().parse(
        'Market\nالمجموع الفرعي 1 234.50$separatorد.إ',
      );
      expect(preview.subtotal, isNull, reason: separator);
    }
  });

  test('R4 double conflicting and residual signs remain unresolved', () {
    for (final money in [
      '++1 234.50 د.إ',
      '--1 234.50 د.إ',
      '+-1 234.50 د.إ',
      '-+1 234.50 د.إ',
      '1 234.50 د.إ+',
      '1 234.50 د.إ -',
      '1 234.50 + د.إ',
      '1 234.50 - د.إ',
      '-د.إ-1 234.50 د.إ',
      '+د.إ-1 234.50 د.إ',
      '-د.إ+1 234.50 د.إ',
      '+د.إ+1 234.50 د.إ',
      '-AED / د.إ 1 234.50',
      'AED 1 234.50 د.إ AED-',
      '+ -1 234.50 د.إ',
      '- +1 234.50 د.إ',
      '+ +1 234.50 د.إ',
      '- -1 234.50 د.إ',
    ]) {
      final preview = const ReceiptOcrParser().parse(
        'Market\nالمجموع الفرعي $money',
      );
      expect(preview.subtotal, isNull, reason: money);
      expect(preview.adjustmentsComplete, isFalse, reason: money);
    }
  });

  test('R4 known tax label does not erase detached conflicting signs', () {
    for (final money in [
      '+ -1 234.50 د.إ',
      '- +1 234.50 د.إ',
      '+ +1 234.50 د.إ',
      '- -1 234.50 د.إ',
    ]) {
      final preview = const ReceiptOcrParser().parse('Market\nTax $money');
      expect(preview.tax, isNull, reason: money);
      expect(preview.adjustmentsComplete, isFalse, reason: money);
    }
  });

  test(
    'R4 an additional bare numeric group cannot become the selected tail',
    () {
      final preview = const ReceiptOcrParser().parse(
        'Market\nالمجموع الفرعي 1 234.50 9 د.إ',
      );
      expect(preview.subtotal, isNull);
      expect(preview.adjustmentsComplete, isFalse);
    },
  );

  test('R4 later marked amount is not erased by an earlier numeric run', () {
    final preview = const ReceiptOcrParser().parse(
      'Market\nالمجموع الفرعي 12 34 567.50 د.إ / AED 20.00',
    );
    expect(preview.subtotal, '20.00');
    expect(preview.subtotalCurrency, 'AED');
  });

  test('R4 earlier marked amount cannot rescue a malformed selected run', () {
    final preview = const ReceiptOcrParser().parse(
      'Market\nالمجموع الفرعي AED 20.00 / 12 34 567.50 د.إ',
    );
    expect(preview.subtotal, isNull);
    expect(preview.adjustmentsComplete, isFalse);
  });

  test('R4 percentage after the selected number is not a subtotal amount', () {
    for (final marker in ['د.إ', 'دإ']) {
      for (final printed in ['١ ٢٣٤٫٥٠', '١٢ ٣٤ ٥٦٧٫٥٠']) {
        final preview = const ReceiptOcrParser().parse(
          'Market\nالمجموع الفرعي $printed%$marker',
        );
        expect(preview.subtotal, isNull, reason: '$printed $marker');
        expect(preview.adjustmentsComplete, isFalse);
        expect(
          preview.incompleteAdjustmentReasons,
          contains(
            ReceiptOcrIncompleteAdjustmentReason.subtotalAmountMissingOrRate,
          ),
        );
      }
    }
  });

  for (final label in ['Subtotal', 'Total']) {
    for (final rate in ['5%', '5.5%']) {
      test(
        'R4 existing $label qualifier $rate keeps its separate monetary amount',
        () {
          final established = const ReceiptOcrParser().parse(
            'Market\n$label $rate AED 1234.50',
          );
          final grouped = const ReceiptOcrParser().parse(
            'Market\n$label $rate 1 234.50 د.إ',
          );
          if (label == 'Subtotal') {
            expect(established.subtotal, '1234.50');
            expect(grouped.subtotal, established.subtotal);
          } else {
            expect(established.total, '1234.50');
            expect(grouped.total, established.total);
          }
        },
      );
    }
  }

  test(
    'R4 subtotal and total qualifiers use the existing bounded percentage grammar',
    () {
      for (final label in ['Subtotal', 'Total']) {
        for (final qualifier in ['5', '5000%', '5% extra', '5% 7%']) {
          final preview = const ReceiptOcrParser().parse(
            'Market\n$label $qualifier 1 234.50 د.إ',
          );
          expect(
            label == 'Subtotal' ? preview.subtotal : preview.total,
            isNull,
            reason: '$label $qualifier',
          );
        }
      }
    },
  );

  for (final label in [
    'Fee',
    'Fees',
    'Charge',
    'Charges',
    'Donation',
    'Refund',
    'Deposit',
    'Levy',
    'Duty',
    'Rounding',
    'Fee 5%',
    'Promo code',
  ]) {
    test('R5 potential-only label $label does not own an item grouping', () {
      final preview = const ReceiptOcrParser().parse(
        'Market\n$label 1 234.50 د.إ',
      );
      expect(preview.items, isEmpty);
      expect(preview.tax, isNull);
      expect(preview.service, isNull);
      expect(preview.discount, isNull);
      expect(preview.subtotal, isNull);
      expect(preview.total, isNull);
      expect(preview.adjustmentsComplete, isFalse);
    });
  }

  for (final label in [
    'Tax',
    'Service charge',
    'Discount',
    'Subtotal',
    'Total',
  ]) {
    test(
      'R5 trailing $label does not erase an unrelated leading description',
      () {
        final preview = const ReceiptOcrParser().parse(
          'Market\nGadget 1 234.50 د.إ $label',
        );
        expect(preview.items, isEmpty);
        expect(preview.tax, isNull);
        expect(preview.service, isNull);
        expect(preview.discount, isNull);
        expect(preview.subtotal, isNull);
        expect(preview.total, isNull);
        expect(preview.adjustmentsComplete, isFalse);
      },
    );
  }

  test('R5 an actual role word does not authorize unrelated leading words', () {
    for (final label in [
      'Tax',
      'Service charge',
      'Discount',
      'Subtotal',
      'Total',
    ]) {
      final preview = const ReceiptOcrParser().parse(
        'Market\nGadget $label 1 234.50 د.إ',
      );
      expect(preview.items, isEmpty, reason: label);
      expect(preview.tax, isNull, reason: label);
      expect(preview.service, isNull, reason: label);
      expect(preview.discount, isNull, reason: label);
      expect(preview.subtotal, isNull, reason: label);
      expect(preview.total, isNull, reason: label);
      expect(preview.adjustmentsComplete, isFalse, reason: label);
    }
  });

  for (final role in [
    (label: 'Tax 5%', field: 'tax', amount: '1234.50'),
    (label: 'Service charge 5%', field: 'service', amount: '1234.50'),
    (label: 'Tip', field: 'tip', amount: '1234.50'),
    (label: 'Shipping', field: 'shipping', amount: '1234.50'),
    (label: 'Discount', field: 'discount', amount: '1234.50'),
    (label: 'Subtotal 5%', field: 'subtotal', amount: '1234.50'),
    (label: 'Total 5%', field: 'total', amount: '1234.50'),
    (label: 'Promo code', field: 'discount', amount: '-1234.50'),
    (label: 'Store coupon', field: 'discount', amount: '-1234.50'),
    (label: 'Promotion', field: 'discount', amount: '-1234.50'),
  ]) {
    test(
      'R5 existing admitted ${role.label} keeps its complete grouped amount',
      () {
        String? selected(ReceiptOcrPreview preview) => switch (role.field) {
          'tax' => preview.tax,
          'service' => preview.service,
          'tip' => preview.tip,
          'shipping' => preview.shipping,
          'discount' => preview.discount,
          'subtotal' => preview.subtotal,
          'total' => preview.total,
          _ => throw StateError('Unknown test field'),
        };
        final printed = role.amount.startsWith('-') ? '-1 234.50' : '1 234.50';
        final established = const ReceiptOcrParser().parse(
          'Market\n${role.label} AED ${role.amount}',
        );
        final grouped = const ReceiptOcrParser().parse(
          'Market\n${role.label} $printed د.إ',
        );
        expect(selected(established), role.amount);
        expect(selected(grouped), selected(established));
      },
    );
  }

  test(
    'R5 positive promotion qualifiers do not acquire a negative discount role',
    () {
      for (final label in ['Promotion', 'Store coupon']) {
        final preview = const ReceiptOcrParser().parse(
          'Market\n$label 1 234.50 د.إ',
        );
        expect(preview.discount, isNull, reason: label);
        expect(preview.items, isEmpty, reason: label);
      }
    },
  );

  for (final prefix in ['قهوة Tax', '茶 Subtotal']) {
    test(
      'R5 Unicode product prefix $prefix cannot disappear into role ownership',
      () {
        final preview = const ReceiptOcrParser().parse(
          'Market\n$prefix 1 234.50 د.إ',
        );
        expect(preview.items, isEmpty);
        expect(preview.tax, isNull);
        expect(preview.subtotal, isNull);
        expect(preview.adjustmentsComplete, isFalse);
      },
    );
  }

  test(
    'R5 an existing complete Arabic tax label retains its grouped amount',
    () {
      final preview = const ReceiptOcrParser().parse(
        'Market\nالضريبة 1 234.50 د.إ',
      );
      expect(preview.tax, '1234.50');
      expect(preview.taxCurrency, 'AED');
    },
  );

  for (final symbol in [r'$', '€']) {
    for (final marker in ['د.إ', 'دإ']) {
      test(
        'Arabic suffix connector keeps unrelated word after repeated $symbol $marker',
        () {
          final control = const ReceiptOcrParser().parse(
            'Item 1 234.50 X $marker',
          );
          // The original parser was characterized only through six symbols.
          // The larger fixed case exercises the bounded connector traversal;
          // it is not a wall-clock assertion or an input-length acceptance cap.
          for (final count in [0, 2, 4, 6, 32]) {
            final preview = const ReceiptOcrParser().parse(
              'Item 1 234.50 ${symbol * count} X $marker',
            );
            expect(preview.currency, 'AED', reason: 'symbol count $count');
            expect(
              preview.currencyProvenance,
              ReceiptOcrCurrencyProvenance.explicit,
            );
            expect(preview.receiptDate, isNull);
            expect(preview.items, isEmpty);
            expect(preview.subtotal, isNull);
            expect(preview.tax, isNull);
            expect(preview.service, isNull);
            expect(preview.discount, isNull);
            expect(preview.total, isNull);
            expect(preview.adjustmentsComplete, isFalse);
            expect(preview.incompleteAdjustmentReasons, [
              ReceiptOcrIncompleteAdjustmentReason.unretainedPricedItem,
            ]);
            expect(preview.itemLineDecisions, [
              ReceiptOcrItemLineDecision.unretainedPricedRow,
            ]);
            expect(preview.itemSelectionDecisions, isEmpty);
            _expectSameReviewState(preview, control);
          }
        },
      );
    }
  }
}
