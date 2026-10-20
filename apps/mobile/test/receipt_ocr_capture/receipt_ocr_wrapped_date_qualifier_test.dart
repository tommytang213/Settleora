import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrPreview _receipt(List<String> fields, {bool geometry = false}) {
  final lines = [
    'Example Market',
    ...fields,
    'Coffee USD 5.00',
    'Total USD 5.00',
  ];
  final blocks = [
    for (final (i, line) in lines.indexed)
      ReceiptOcrBlockEvidence(
        text: line,
        row: i,
        order: i,
        confidence: .99,
        points: [
          ReceiptOcrPoint(x: 20, y: i * 30),
          ReceiptOcrPoint(x: 500, y: i * 30),
          ReceiptOcrPoint(x: 500, y: i * 30 + 20),
          ReceiptOcrPoint(x: 20, y: i * 30 + 20),
        ],
      ),
  ];
  final result = const ReceiptOcrParser().parse(
    lines.join('\n'),
    blocks: geometry ? blocks : const [],
  );
  if (geometry) expect(result.blocks, blocks);
  expect(result.total, '5.00');
  expect(result.items.map((item) => item.description), contains('Coffee'));
  return result;
}

void _date(ReceiptOcrPreview result, String expected) {
  expect(result.receiptDate, expected);
  expect(
    result.warnings,
    isNot(contains(contains('Conflicting receipt dates'))),
  );
}

void main() {
  for (final qualifier in [
    'Previous',
    'Prior',
    'Refund',
    'Due',
    'Payment',
    'Stay',
  ]) {
    for (final geometry in [false, true]) {
      test('wrapped receipt qualifier is secondary: $qualifier,$geometry', () {
        _date(
          _receipt([
            'Invoice Date: 2026-10-15',
            qualifier,
            'Receipt Date: 2026-09-01',
          ], geometry: geometry),
          '2026-10-15',
        );
      });
    }
  }
  test('wrapped qualified receipt before the invoice stays secondary', () {
    _date(
      _receipt([
        'Previous',
        'Receipt Date: 2026-09-01',
        'Invoice Date: 2026-10-15',
      ]),
      '2026-10-15',
    );
  });
  for (final qualifier in [
    'Previous',
    'Prior',
    'Refund',
    'Due',
    'Payment',
    'Stay',
  ]) {
    for (final role in ['Receipt', 'Invoice']) {
      for (final geometry in [false, true]) {
        test('three-line $qualifier $role date stays secondary: $geometry', () {
          _date(
            _receipt([
              'Invoice Date: 2026-10-15',
              qualifier,
              '$role Date:',
              '2026-09-01',
            ], geometry: geometry),
            '2026-10-15',
          );
        });
      }
    }
  }
  for (final role in ['Receipt', 'Invoice']) {
    test('distinct current wrapped $role dates remain ambiguous', () {
      final result = _receipt([
        'Previous',
        '$role Date:',
        '2026-08-01',
        '$role Date:',
        '2026-09-01',
        '$role Date:',
        '2026-10-15',
      ]);
      expect(result.receiptDate, isNull);
      expect(result.warnings, contains(contains('Conflicting receipt dates')));
    });
  }
  for (final geometry in [false, true]) {
    test('three-line historical receipt before invoice: $geometry', () {
      _date(
        _receipt([
          'Previous',
          'Receipt Date:',
          '2026-09-01',
          'Invoice Date: 2026-10-15',
        ], geometry: geometry),
        '2026-10-15',
      );
    });
  }
  test('unqualified wrapped receipt retains direct precedence', () {
    _date(
      _receipt(['Invoice Date: 2026-10-15', 'Receipt Date:', '2026-09-01']),
      '2026-09-01',
    );
  });
  test('three-line qualifier cannot cross an unrelated row', () {
    _date(
      _receipt([
        'Invoice Date: 2026-10-15',
        'Previous',
        'A note',
        'Receipt Date:',
        '2026-09-01',
      ]),
      '2026-09-01',
    );
  });
  test('inline qualifier retains its existing secondary role', () {
    _date(
      _receipt([
        'Invoice Date: 2026-10-15',
        'Previous Receipt Date: 2026-09-01',
      ]),
      '2026-10-15',
    );
  });
  test('an unqualified receipt date keeps its direct precedence', () {
    _date(
      _receipt(['Invoice Date: 2026-10-15', 'Receipt Date: 2026-09-01']),
      '2026-09-01',
    );
  });
  test('a wrapped invoice qualifier keeps its existing secondary role', () {
    _date(
      _receipt([
        'Invoice Date: 2026-10-15',
        'Previous',
        'Invoice Date: 2026-09-01',
      ]),
      '2026-10-15',
    );
  });
  test('distinct current receipt dates remain unresolved', () {
    final result = _receipt([
      'Receipt Date: 2026-10-15',
      'Receipt Date: 2026-09-01',
    ]);
    expect(result.receiptDate, isNull);
    expect(result.warnings, contains(contains('Conflicting receipt dates')));
  });
  test('a qualifier does not cross an unrelated intervening row', () {
    _date(
      _receipt([
        'Invoice Date: 2026-10-15',
        'Previous',
        'A note',
        'Receipt Date: 2026-09-01',
      ]),
      '2026-09-01',
    );
  });
}
