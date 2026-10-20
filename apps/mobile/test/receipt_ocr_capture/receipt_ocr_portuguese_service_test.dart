import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

ReceiptOcrPreview _receipt(
  String row, {
  String total = '16,50',
  String currency = 'BRL',
}) => const ReceiptOcrParser().parse('''
Café Bairro
Prato $currency 10,00
Suco $currency 5,00
Subtotal $currency 15,00
$row
Total $currency $total
''');

void main() {
  for (final label in [
    'Serviço',
    'SERVIÇO',
    'Servico',
    'Taxa de serviço',
    'Taxa de servico',
    'Serviço (10%)',
    'Serviço 10%',
    'Taxa de serviço (10,0%)',
  ]) {
    test('complete Portuguese service role: $label', () {
      final preview = _receipt('$label BRL 1,50');
      expect(preview.service, '1.50');
      expect(preview.serviceCurrency, 'BRL');
      expect(preview.serviceHasExplicitCurrencyEvidence, isTrue);
      expect(preview.items.map((item) => item.description), ['Prato', 'Suco']);
      expect(preview.items.map((item) => item.lineTotal), ['10.00', '5.00']);
      expect(preview.subtotal, '15.00');
      expect(preview.total, '16.50');
      expect(preview.adjustmentsComplete, isTrue);
      expect(preview.warnings, isEmpty);
      expect(preview.reviewHints, isEmpty);
    });
  }

  for (final cell in ['R\$1,50', '1,50 BRL', 'BRL1,50', 'BRL 1,50 BRL']) {
    test('Portuguese service owns its complete monetary cell: $cell', () {
      final preview = _receipt('Serviço: $cell');
      expect(preview.service, '1.50');
      expect(preview.serviceCurrency, 'BRL');
      expect(preview.serviceHasExplicitCurrencyEvidence, isTrue);
      expect(preview.items, hasLength(2));
      expect(preview.reviewHints, isEmpty);
    });
  }

  test('undenominated service retains the receipt currency context', () {
    final preview = _receipt('Serviço 1,50');
    expect(preview.service, '1.50');
    expect(preview.serviceHasExplicitCurrencyEvidence, isFalse);
    expect(preview.items, hasLength(2));
    expect(preview.reviewHints, isEmpty);
  });

  for (final name in [
    'Serviço de instalação',
    'Taxa de Serviço Premium',
    'Manual Serviço',
    'Autoserviço',
  ]) {
    test('Portuguese service words do not erase product name: $name', () {
      final preview = _receipt('$name BRL 1,50');
      expect(preview.service, isNull);
      expect(preview.items.map((item) => item.description), contains(name));
      expect(preview.items.last.lineTotal, '1.50');
    });
  }

  for (final row in [
    'Serviço BRL 1,50 especial',
    'Serviço BRL 1,00 BRL 0,50',
    'Serviço (10%)',
    'Serviço 10%',
    'Serviço (10% BRL 1,50',
    'Serviço BRL 1,50 10%',
  ]) {
    test('incomplete or extra Portuguese evidence stays unresolved: $row', () {
      final preview = _receipt(row);
      expect(preview.service, isNull);
      expect(preview.adjustmentsComplete, isFalse);
      expect(preview.reviewHints, isNotEmpty);
    });
  }

  test('foreign service currency stays explicit and requires review', () {
    final preview = _receipt('Serviço EUR 1,50');
    expect(preview.currency, 'BRL');
    expect(preview.service, '1.50');
    expect(preview.serviceCurrency, 'EUR');
    expect(preview.serviceHasExplicitCurrencyEvidence, isTrue);
    expect(preview.reviewHints, isNotEmpty);
  });

  test('conflicting service markers cannot acquire receipt denomination', () {
    final preview = _receipt('Serviço EUR 1,50 BRL');
    expect(preview.currency, 'BRL');
    expect(preview.serviceCurrency, isNull);
    expect(preview.serviceHasExplicitCurrencyEvidence, isTrue);
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.reviewHints, isNotEmpty);
  });

  test('misleading service subtotal arithmetic does not remove a warning', () {
    final preview = _receipt('Serviço BRL 1,50', total: '20,00');
    expect(preview.service, '1.50');
    expect(preview.total, '20.00');
    expect(preview.reviewHints, isNotEmpty);
  });

  test('matching service money reaches the unchanged provisional save', () {
    final request = receiptOcrReviewSaveRequestFromPreview(
      _receipt('Serviço USD1,50', currency: 'USD'),
      originalCurrency: 'USD',
    )!;
    expect(request.serviceChargeAmount, '1.50');
    expect(request.currency, 'USD');
    expect(request.lines, hasLength(2));
  });

  test('foreign service money is retained as evidence without relabeling', () {
    final request = receiptOcrReviewSaveRequestFromPreview(
      _receipt('Serviço EUR1,50', currency: 'USD'),
      originalCurrency: 'USD',
    )!;
    expect(request.serviceChargeAmount, isNull);
    final evidence = request.headerEvidence.singleWhere(
      (row) => row.role == 'service_charge',
    );
    expect(evidence.amount, '1.50');
    expect(evidence.currency, 'EUR');
  });

  test('conflicting service currencies cannot be saved as USD', () {
    final preview = _receipt('Serviço EUR1,50 USD', currency: 'USD');
    expect(preview.service, '1.50');
    expect(preview.serviceCurrency, isNull);
    expect(preview.serviceHasExplicitCurrencyEvidence, isTrue);
    expect(preview.adjustmentsComplete, isFalse);
    expect(preview.reviewHints, isNotEmpty);
    final request = receiptOcrReviewSaveRequestFromPreview(
      preview,
      originalCurrency: 'USD',
    )!;
    expect(request.serviceChargeAmount, isNull);
    expect(request.taxReconciliationMode, 'unresolved');
    expect(
      request.headerEvidence.where((row) => row.role == 'service_charge'),
      isEmpty,
    );
  });

  test('changing review denomination cannot adopt explicit service money', () {
    final request = receiptOcrReviewSaveRequestFromPreview(
      _receipt('Serviço USD1,50', currency: 'USD'),
      originalCurrency: 'EUR',
    )!;
    expect(request.serviceChargeAmount, isNull);
    final evidence = request.headerEvidence.singleWhere(
      (row) => row.role == 'service_charge',
    );
    expect(evidence.amount, '1.50');
    expect(evidence.currency, 'USD');
  });

  test('an unresolved printed service marker cannot acquire bill currency', () {
    final preview = _receipt('Serviço ¥1,50', currency: 'USD');
    expect(preview.serviceHasExplicitCurrencyEvidence, isTrue);
    expect(preview.serviceCurrency, '¥');
    expect(preview.reviewHints, isNotEmpty);
    final request = receiptOcrReviewSaveRequestFromPreview(
      preview,
      originalCurrency: 'USD',
    )!;
    expect(request.serviceChargeAmount, isNull);
  });

  test('new label support does not expand the existing save currency set', () {
    final preview = _receipt('Serviço BRL1,50');
    expect(preview.currency, 'BRL');
    expect(preview.service, '1.50');
    final request = receiptOcrReviewSaveRequestFromPreview(
      preview,
      originalCurrency: 'BRL',
    )!;
    expect(request.currency, isNull);
    expect(request.serviceChargeAmount, isNull);
  });
}
