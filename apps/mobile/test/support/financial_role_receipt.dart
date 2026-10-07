import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

/// Synthetic evidence; amounts and labels are independent of parser output.
({String text, List<ReceiptOcrBlockEvidence> blocks}) financialRoleReceipt(
  String label, {
  String mode = 'split',
  String item = "Resident's Water Plan",
  String amount = 'USD 2.00',
  String heading = 'Current Charges Detail',
  List<String> columns = const ['Description', 'Amount'],
}) {
  final rows = <List<String>>[
    ['Regional Utility'],
    [heading],
    columns,
    [item, 'USD 20.00'],
    [label, amount],
    ['Total Amount Due USD 22.00'],
  ];
  final blocks = <ReceiptOcrBlockEvidence>[];
  void cell(String text, int row, double left, double right) {
    blocks.add(
      ReceiptOcrBlockEvidence(
        text: text,
        row: row,
        order: blocks.length,
        confidence: 0.97,
        modelPackId: 'synthetic-latin',
        modelVersion: 'test-v1',
        textDirection: 'ltr',
        points: [
          ReceiptOcrPoint(x: left, y: row * 30.0),
          ReceiptOcrPoint(x: right, y: row * 30.0),
          ReceiptOcrPoint(x: right, y: row * 30.0 + 20),
          ReceiptOcrPoint(x: left, y: row * 30.0 + 20),
        ],
      ),
    );
  }

  if (mode != 'none') {
    for (var row = 0; row < rows.length; row++) {
      final cells = rows[row];
      if (mode == 'merged' || cells.length == 1) {
        cell(cells.join(' '), row, 20, 500);
      } else {
        for (var i = 0; i < cells.length; i++) {
          cell(cells[i], row, i == 0 ? 20 : 400, i == 0 ? 300 : 500);
        }
      }
    }
  }
  return (text: rows.map((r) => r.join(' ')).join('\n'), blocks: blocks);
}
