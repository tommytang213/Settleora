import 'package:mobile/receipt_ocr_capture/receipt_ocr_preview.dart';

/// Synthetic evidence; amounts and labels are independent of parser output.
({String text, List<ReceiptOcrBlockEvidence> blocks}) financialRoleReceipt(
  String label, {
  String mode = 'split',
  String item = "Resident's Water Plan",
  String amount = 'USD 2.00',
  String total = 'USD 22.00',
  String heading = 'Current Charges Detail',
  List<String> columns = const ['Description', 'Amount'],
  List<String>? labelBlocks,
  List<({double left, double right})>? labelBounds,
  bool amountOnLeft = false,
  String? servicePeriod,
}) {
  final rows = <List<String>>[
    ['Regional Utility'],
    [heading],
    servicePeriod == null
        ? columns
        : ['Description', 'Service Period', 'Amount'],
    [item, ?servicePeriod, 'USD 20.00'],
    [label, ?servicePeriod, amount],
    ['Total Amount Due $total'],
  ];
  final blocks = <ReceiptOcrBlockEvidence>[];
  void cell(String text, int row, double left, double right) {
    final start = amountOnLeft ? 600 - right : left;
    final end = amountOnLeft ? 600 - left : right;
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
          ReceiptOcrPoint(x: start, y: row * 30.0),
          ReceiptOcrPoint(x: end, y: row * 30.0),
          ReceiptOcrPoint(x: end, y: row * 30.0 + 20),
          ReceiptOcrPoint(x: start, y: row * 30.0 + 20),
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
        if (row == 4 && labelBlocks != null) {
          for (var i = 0; i < labelBlocks.length; i++) {
            final width = servicePeriod == null ? 280 : 230;
            final bounds = labelBounds?[i];
            final left = bounds?.left ?? 20 + i * width / labelBlocks.length;
            final right =
                bounds?.right ?? 20 + (i + 1) * width / labelBlocks.length;
            cell(labelBlocks[i], row, left, right);
          }
          if (servicePeriod != null) cell(servicePeriod, row, 280, 430);
          cell(
            amount,
            row,
            servicePeriod == null ? 400 : 470,
            servicePeriod == null ? 500 : 570,
          );
          continue;
        }
        for (var i = 0; i < cells.length; i++) {
          if (servicePeriod != null && cells.length == 3) {
            cell(
              cells[i],
              row,
              [20.0, 280.0, 470.0][i],
              [250.0, 430.0, 570.0][i],
            );
          } else {
            cell(cells[i], row, i == 0 ? 20 : 400, i == 0 ? 300 : 500);
          }
        }
      }
    }
  }
  return (text: rows.map((r) => r.join(' ')).join('\n'), blocks: blocks);
}
