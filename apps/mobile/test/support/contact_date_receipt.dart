import 'package:mobile/receipt_ocr_capture/receipt_ocr_parser.dart';
import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

List<String> contactDateReceiptRows({
  String address = '九龍灣觀塘道中27號',
  String phone = 'Tel +852 2468 1357',
  String date = 'Fecha/Date: 2026-10-04',
  bool service = true,
}) => [
  'Cedar Pier Kitchen',
  address,
  phone,
  date,
  'Soup HKD 8.00',
  'Rice HKD 12.00',
  'Subtotal HKD 20.00',
  if (service) 'Service Charge HKD 2.00',
  'Total HKD ${service ? '22.00' : '20.00'}',
  'Thank you',
];

ReceiptOcrPreview parseContactDateReceipt(List<String> rows) =>
    const ReceiptOcrParser().parse(rows.join('\n'), fallbackCurrency: 'HKD');
