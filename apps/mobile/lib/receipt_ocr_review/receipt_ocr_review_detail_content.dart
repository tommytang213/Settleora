part of 'receipt_ocr_review_screen.dart';

class _ReceiptOcrReviewDetailBody extends StatelessWidget {
  const _ReceiptOcrReviewDetailBody({
    required this.isLoadingReview,
    required this.isEditing,
    required this.isSaving,
    required this.isDeleting,
    required this.isDeleteWorkActive,
    required this.isLoadingPreview,
    required this.isApplying,
    required this.actionsBlocked,
    required this.review,
    required this.reviewFailure,
    required this.preview,
    required this.previewFailure,
    required this.applyResult,
    required this.applyFailure,
    required this.saveFailure,
    required this.deleteFailure,
    required this.onRetry,
    required this.onSave,
    required this.onCancelEditing,
    required this.onDelete,
    required this.onPreview,
    required this.onApply,
  });

  final bool isLoadingReview;
  final bool isEditing;
  final bool isSaving;
  final bool isDeleting;
  final bool isDeleteWorkActive;
  final bool isLoadingPreview;
  final bool isApplying;
  final bool actionsBlocked;
  final ReceiptOcrReviewDetail? review;
  final ReceiptOcrReviewFailure? reviewFailure;
  final ReceiptOcrReviewApplyPreview? preview;
  final ReceiptOcrReviewFailure? previewFailure;
  final ReceiptOcrReviewApplyResult? applyResult;
  final ReceiptOcrReviewFailure? applyFailure;
  final ReceiptOcrReviewFailure? saveFailure;
  final ReceiptOcrReviewFailure? deleteFailure;
  final VoidCallback onRetry;
  final Future<void> Function(ReceiptOcrReviewSaveRequest request) onSave;
  final VoidCallback onCancelEditing;
  final VoidCallback onDelete;
  final VoidCallback onPreview;
  final VoidCallback onApply;

  @override
  Widget build(BuildContext context) {
    if (isLoadingReview) {
      return const _LoadingPanel(label: 'Loading receipt review');
    }

    final failure = reviewFailure;
    if (failure != null) {
      return _FailurePanel(failure: failure, onRetry: onRetry);
    }

    final review = this.review;
    if (review == null) {
      return _FailurePanel(
        failure: const ReceiptOcrReviewFailure(
          kind: ReceiptOcrReviewFailureKind.unavailable,
          message: 'The receipt review is no longer available.',
        ),
        onRetry: onRetry,
      );
    }

    if (isEditing) {
      return _ReceiptOcrReviewEditForm(
        key: ValueKey('${review.id}-${review.updatedAtUtc.toIso8601String()}'),
        review: review,
        isSaving: isSaving,
        isDeleting: isDeleting,
        isDeleteWorkActive: isDeleteWorkActive,
        saveFailure: saveFailure,
        deleteFailure: deleteFailure,
        onSave: onSave,
        onCancel: onCancelEditing,
        onDelete: onDelete,
      );
    }

    return _ReceiptOcrReviewReadOnlyContent(
      review: review,
      isLoadingPreview: isLoadingPreview,
      isApplying: isApplying,
      actionsBlocked: actionsBlocked,
      preview: preview,
      previewFailure: previewFailure,
      applyResult: applyResult,
      applyFailure: applyFailure,
      onPreview: onPreview,
      onApply: onApply,
    );
  }
}

class _ReceiptOcrReviewReadOnlyContent extends StatelessWidget {
  const _ReceiptOcrReviewReadOnlyContent({
    required this.review,
    required this.isLoadingPreview,
    required this.isApplying,
    required this.actionsBlocked,
    required this.preview,
    required this.previewFailure,
    required this.applyResult,
    required this.applyFailure,
    required this.onPreview,
    required this.onApply,
  });

  final ReceiptOcrReviewDetail review;
  final bool isLoadingPreview;
  final bool isApplying;
  final bool actionsBlocked;
  final ReceiptOcrReviewApplyPreview? preview;
  final ReceiptOcrReviewFailure? previewFailure;
  final ReceiptOcrReviewApplyResult? applyResult;
  final ReceiptOcrReviewFailure? applyFailure;
  final VoidCallback onPreview;
  final VoidCallback onApply;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label:
          '$_receiptOcrReviewDetailLabel. '
          '$_provisionalReceiptOcrReviewSemanticLabel',
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          _ReceiptOcrReviewHeader(review: review),
          const SizedBox(height: 20),
          if (_hasAnyReviewCandidate(review)) ...[
            _ReceiptOcrReviewTotals(review: review),
            const SizedBox(height: 20),
            _ReceiptOcrReviewLines(lines: review.lines),
          ] else
            const _StatePanel(
              icon: Icons.receipt_long_outlined,
              title: 'No OCR result',
              message:
                  'No reviewed OCR suggestions are saved for this receipt yet.',
              compact: true,
            ),
          const SizedBox(height: 20),
          _ApplyPreviewSection(
            isLoadingPreview: isLoadingPreview,
            isApplying: isApplying,
            actionsBlocked: actionsBlocked,
            preview: preview,
            previewFailure: previewFailure,
            applyResult: applyResult,
            applyFailure: applyFailure,
            onPreview: onPreview,
            onApply: onApply,
          ),
        ],
      ),
    );
  }
}

class _ReceiptOcrReviewEditForm extends StatefulWidget {
  const _ReceiptOcrReviewEditForm({
    super.key,
    required this.review,
    required this.isSaving,
    required this.isDeleting,
    required this.isDeleteWorkActive,
    required this.saveFailure,
    required this.deleteFailure,
    required this.onSave,
    required this.onCancel,
    required this.onDelete,
  });

  final ReceiptOcrReviewDetail review;
  final bool isSaving;
  final bool isDeleting;
  final bool isDeleteWorkActive;
  final ReceiptOcrReviewFailure? saveFailure;
  final ReceiptOcrReviewFailure? deleteFailure;
  final Future<void> Function(ReceiptOcrReviewSaveRequest request) onSave;
  final VoidCallback onCancel;
  final VoidCallback onDelete;

  @override
  State<_ReceiptOcrReviewEditForm> createState() =>
      _ReceiptOcrReviewEditFormState();
}

class _ReceiptOcrReviewEditFormState extends State<_ReceiptOcrReviewEditForm> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _merchantController;
  late final TextEditingController _receiptDateController;
  late final TextEditingController _currencyController;
  late final TextEditingController _subtotalController;
  late final TextEditingController _taxController;
  late final TextEditingController _serviceChargeController;
  late final TextEditingController _discountController;
  late final TextEditingController _grandTotalController;
  late final List<_ReceiptOcrReviewLineEditors> _lineEditors;

  @override
  void initState() {
    super.initState();
    final review = widget.review;
    _merchantController = TextEditingController(text: review.merchantText);
    _receiptDateController = TextEditingController(
      text: review.receiptIssuedAtUtc == null
          ? ''
          : _formatDate(review.receiptIssuedAtUtc!),
    );
    _currencyController = TextEditingController(text: review.currency);
    _subtotalController = TextEditingController(text: review.subtotalAmount);
    _taxController = TextEditingController(text: review.taxAmount);
    _serviceChargeController = TextEditingController(
      text: review.serviceChargeAmount,
    );
    _discountController = TextEditingController(text: review.discountAmount);
    _grandTotalController = TextEditingController(
      text: review.grandTotalAmount,
    );
    _lineEditors = [
      for (final line in [
        ...review.lines,
      ]..sort((left, right) => left.sortOrder.compareTo(right.sortOrder)))
        _ReceiptOcrReviewLineEditors.fromLine(line),
    ];
  }

  @override
  void dispose() {
    _merchantController.dispose();
    _receiptDateController.dispose();
    _currencyController.dispose();
    _subtotalController.dispose();
    _taxController.dispose();
    _serviceChargeController.dispose();
    _discountController.dispose();
    _grandTotalController.dispose();
    for (final editors in _lineEditors) {
      editors.dispose();
    }
    super.dispose();
  }

  void _addLine() {
    setState(() {
      _lineEditors.add(_ReceiptOcrReviewLineEditors.empty());
    });
  }

  void _removeLine(int index) {
    setState(() {
      final editors = _lineEditors.removeAt(index);
      editors.dispose();
    });
  }

  void _submit() {
    final form = _formKey.currentState;
    if (form == null || !form.validate()) {
      return;
    }

    widget.onSave(_buildRequest());
  }

  ReceiptOcrReviewSaveRequest _buildRequest() {
    return ReceiptOcrReviewSaveRequest(
      status: widget.review.status,
      source: widget.review.source,
      merchantText: _nullableText(_merchantController.text),
      receiptIssuedAtUtc: _parseDate(_receiptDateController.text),
      currency: _nullableText(_currencyController.text)?.toUpperCase(),
      subtotalAmount: _nullableText(_subtotalController.text),
      taxAmount: _nullableText(_taxController.text),
      serviceChargeAmount: _nullableText(_serviceChargeController.text),
      discountAmount: _nullableText(_discountController.text),
      grandTotalAmount: _nullableText(_grandTotalController.text),
      lines: _lineEditors
          .map((editors) => editors.toRequest())
          .toList(growable: false),
    );
  }

  String? _currencyValidator(String? value) {
    final normalized = value?.trim();
    if (normalized == null || normalized.isEmpty) {
      return _hasAnyAmountCandidate()
          ? 'Required when amounts are present'
          : null;
    }

    return RegExp(r'^[A-Za-z]{3}$').hasMatch(normalized)
        ? null
        : 'Use a 3-letter code';
  }

  String? _moneyValidator(String? value) {
    return _optionalDecimalStringValidator(
      value,
      pattern: _receiptOcrMoneyPattern,
      message: 'Use a non-negative decimal amount',
    );
  }

  bool _hasAnyAmountCandidate() {
    final headerControllers = [
      _subtotalController,
      _taxController,
      _serviceChargeController,
      _discountController,
      _grandTotalController,
    ];

    return headerControllers.any(
          (controller) => controller.text.trim().isNotEmpty,
        ) ||
        _lineEditors.any((editors) => editors.hasAnyAmountCandidate);
  }

  @override
  Widget build(BuildContext context) {
    final isBusy = widget.isSaving || widget.isDeleteWorkActive;

    return Form(
      key: _formKey,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Review fields',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 10),
            _EditTextField(
              key: const Key('receipt-review-edit-merchant'),
              controller: _merchantController,
              label: 'Merchant suggestion',
              enabled: !isBusy,
            ),
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: DateField(
                key: const Key('receipt-review-edit-date'),
                controller: _receiptDateController,
                label: 'Receipt date',
                enabled: !isBusy,
                firstDate: DateTime(2000),
                lastDate: DateTime(2100),
                helperText: 'Choose the receipt date suggestion.',
                validator: _dateValidator,
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: CurrencySelector(
                key: const Key('receipt-review-edit-currency'),
                value: _currencyController.text,
                label: 'Currency',
                helperText: 'Review the currency before applying amounts.',
                semanticLabel: 'Receipt currency selector',
                allowClear: true,
                enabled: !isBusy,
                validator: _currencyValidator,
                onChanged: (currency) {
                  setState(() {
                    _currencyController.text = currency ?? '';
                  });
                },
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Receipt totals',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 10),
            _ReceiptOcrMoneyInput(
              amountKey: const Key('receipt-review-edit-subtotal'),
              amountController: _subtotalController,
              currencyController: _currencyController,
              amountLabel: 'Subtotal',
              semanticLabel: 'Subtotal amount suggestion',
              enabled: !isBusy,
              amountValidator: _moneyValidator,
            ),
            _ReceiptOcrMoneyInput(
              amountKey: const Key('receipt-review-edit-tax'),
              amountController: _taxController,
              currencyController: _currencyController,
              amountLabel: 'Tax',
              semanticLabel: 'Tax amount suggestion',
              enabled: !isBusy,
              amountValidator: _moneyValidator,
            ),
            _ReceiptOcrMoneyInput(
              amountKey: const Key('receipt-review-edit-service-charge'),
              amountController: _serviceChargeController,
              currencyController: _currencyController,
              amountLabel: 'Service charge',
              semanticLabel: 'Service charge amount suggestion',
              enabled: !isBusy,
              amountValidator: _moneyValidator,
            ),
            _ReceiptOcrMoneyInput(
              amountKey: const Key('receipt-review-edit-discount'),
              amountController: _discountController,
              currencyController: _currencyController,
              amountLabel: 'Discount',
              semanticLabel: 'Discount amount suggestion',
              enabled: !isBusy,
              amountValidator: _moneyValidator,
            ),
            _ReceiptOcrMoneyInput(
              amountKey: const Key('receipt-review-edit-grand-total'),
              amountController: _grandTotalController,
              currencyController: _currencyController,
              amountLabel: 'Grand total',
              semanticLabel: 'Grand total amount suggestion',
              enabled: !isBusy,
              amountValidator: _moneyValidator,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Review receipt lines',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                IconButton(
                  key: const Key('receipt-review-edit-line-add'),
                  onPressed: isBusy ? null : _addLine,
                  tooltip: 'Add line',
                  icon: const Icon(Icons.add),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (_lineEditors.isEmpty)
              const _StatePanel(
                icon: Icons.format_list_bulleted,
                title: 'No receipt lines',
                message:
                    'Save can proceed, but apply may be blocked by the server.',
                compact: true,
              )
            else
              for (var index = 0; index < _lineEditors.length; index++)
                _LineEditCard(
                  key: ValueKey('receipt-review-edit-line-card-$index'),
                  index: index,
                  editors: _lineEditors[index],
                  currencyController: _currencyController,
                  enabled: !isBusy,
                  onRemove: () => _removeLine(index),
                ),
            if (widget.saveFailure != null) ...[
              const SizedBox(height: 12),
              _InlineFailure(failure: widget.saveFailure!),
            ],
            if (widget.deleteFailure != null) ...[
              const SizedBox(height: 12),
              _InlineFailure(failure: widget.deleteFailure!),
            ],
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    key: const Key('receipt-review-edit-cancel'),
                    onPressed: isBusy ? null : widget.onCancel,
                    icon: const Icon(Icons.close),
                    label: _SemanticButtonLabel(
                      label: isBusy
                          ? _busyActionSemanticLabel(
                              _cancelReceiptOcrReviewEditLabel,
                            )
                          : _cancelReceiptOcrReviewEditLabel,
                      enabled: !isBusy,
                      child: const Text('Cancel'),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton.icon(
                    key: const Key('receipt-review-edit-save'),
                    onPressed: isBusy ? null : _submit,
                    icon: widget.isSaving
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.save_outlined),
                    label: _SemanticButtonLabel(
                      label: widget.isSaving
                          ? _savingReceiptOcrReviewLabel
                          : isBusy
                          ? _busyActionSemanticLabel(_saveReceiptOcrReviewLabel)
                          : _saveReceiptOcrReviewLabel,
                      enabled: !isBusy,
                      child: const Text('Save'),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              key: const Key('receipt-review-edit-delete'),
              onPressed: isBusy ? null : widget.onDelete,
              icon: widget.isDeleting
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.delete_outline),
              label: _SemanticButtonLabel(
                label: widget.isDeleting
                    ? _deletingReceiptOcrReviewLabel
                    : isBusy
                    ? _busyActionSemanticLabel(_deleteReceiptOcrReviewLabel)
                    : _deleteReceiptOcrReviewLabel,
                enabled: !isBusy,
                child: const Text('Remove review'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LineEditCard extends StatelessWidget {
  const _LineEditCard({
    super.key,
    required this.index,
    required this.editors,
    required this.currencyController,
    required this.enabled,
    required this.onRemove,
  });

  final int index;
  final _ReceiptOcrReviewLineEditors editors;
  final TextEditingController currencyController;
  final bool enabled;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border.all(
            color: Theme.of(context).colorScheme.outlineVariant,
          ),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Line ${index + 1}',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                  ),
                  IconButton(
                    key: ValueKey('receipt-review-edit-line-remove-$index'),
                    onPressed: enabled ? onRemove : null,
                    tooltip: 'Remove line',
                    icon: const Icon(Icons.remove_circle_outline),
                  ),
                ],
              ),
              _EditTextField(
                key: ValueKey('receipt-review-edit-line-text-$index'),
                controller: editors.textController,
                label: 'Description',
                enabled: enabled,
                validator: _lineTextValidator,
              ),
              _EditTextField(
                key: ValueKey('receipt-review-edit-line-quantity-$index'),
                controller: editors.quantityController,
                label: 'Quantity',
                semanticLabel: 'Line quantity suggestion',
                enabled: enabled,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                validator: _quantityValidator,
              ),
              _ReceiptOcrMoneyInput(
                amountKey: ValueKey('receipt-review-edit-line-unit-$index'),
                amountController: editors.unitPriceAmountController,
                currencyController: currencyController,
                amountLabel: 'Unit price',
                semanticLabel: 'Line unit price amount suggestion',
                enabled: enabled,
                amountValidator: _lineMoneyValidator,
              ),
              _ReceiptOcrMoneyInput(
                amountKey: ValueKey('receipt-review-edit-line-total-$index'),
                amountController: editors.lineTotalAmountController,
                currencyController: currencyController,
                amountLabel: 'Line total',
                semanticLabel: 'Line total amount suggestion',
                enabled: enabled,
                amountValidator: _lineMoneyValidator,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ReceiptOcrMoneyInput extends StatelessWidget {
  const _ReceiptOcrMoneyInput({
    required this.amountKey,
    required this.amountController,
    required this.currencyController,
    required this.amountLabel,
    required this.semanticLabel,
    required this.enabled,
    required this.amountValidator,
  });

  final Key amountKey;
  final TextEditingController amountController;
  final TextEditingController currencyController;
  final String amountLabel;
  final String semanticLabel;
  final bool enabled;
  final FormFieldValidator<String> amountValidator;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Semantics(
        label: enabled
            ? semanticLabel
            : _busyActionSemanticLabel(semanticLabel),
        enabled: enabled,
        child: MoneyInput(
          amountKey: amountKey,
          amountController: amountController,
          currencyValue: currencyController.text,
          amountLabel: amountLabel,
          currencyLabel: 'Receipt currency',
          currencyControl: MoneyInputCurrencyControl.staticCode,
          enabled: enabled,
          amountValidator: amountValidator,
          onCurrencyChanged: (_) {},
        ),
      ),
    );
  }
}

class _EditTextField extends StatelessWidget {
  const _EditTextField({
    super.key,
    required this.controller,
    required this.label,
    required this.enabled,
    this.semanticLabel,
    this.keyboardType,
    this.validator,
  });

  final TextEditingController controller;
  final String label;
  final bool enabled;
  final String? semanticLabel;
  final TextInputType? keyboardType;
  final String? Function(String?)? validator;

  @override
  Widget build(BuildContext context) {
    final textField = TextFormField(
      controller: controller,
      enabled: enabled,
      keyboardType: keyboardType,
      validator: validator,
      decoration: InputDecoration(
        border: const OutlineInputBorder(),
        labelText: label,
      ),
    );

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: semanticLabel == null
          ? textField
          : Semantics(
              label: enabled
                  ? semanticLabel
                  : _busyActionSemanticLabel(semanticLabel!),
              enabled: enabled,
              child: textField,
            ),
    );
  }
}

class _ReceiptOcrReviewLineEditors {
  _ReceiptOcrReviewLineEditors({
    required String text,
    required String? quantity,
    required String? unitPriceAmount,
    required String? lineTotalAmount,
  }) : textController = TextEditingController(text: text),
       quantityController = TextEditingController(text: quantity),
       unitPriceAmountController = TextEditingController(text: unitPriceAmount),
       lineTotalAmountController = TextEditingController(text: lineTotalAmount);

  factory _ReceiptOcrReviewLineEditors.fromLine(ReceiptOcrReviewLine line) {
    return _ReceiptOcrReviewLineEditors(
      text: line.text,
      quantity: line.quantity,
      unitPriceAmount: line.unitPriceAmount,
      lineTotalAmount: line.lineTotalAmount,
    );
  }

  factory _ReceiptOcrReviewLineEditors.empty() {
    return _ReceiptOcrReviewLineEditors(
      text: '',
      quantity: null,
      unitPriceAmount: null,
      lineTotalAmount: null,
    );
  }

  final TextEditingController textController;
  final TextEditingController quantityController;
  final TextEditingController unitPriceAmountController;
  final TextEditingController lineTotalAmountController;

  bool get hasAnyAmountCandidate {
    return unitPriceAmountController.text.trim().isNotEmpty ||
        lineTotalAmountController.text.trim().isNotEmpty;
  }

  ReceiptOcrReviewLineSaveRequest toRequest() {
    return ReceiptOcrReviewLineSaveRequest(
      text: textController.text.trim(),
      quantity: _nullableText(quantityController.text),
      unitPriceAmount: _nullableText(unitPriceAmountController.text),
      lineTotalAmount: _nullableText(lineTotalAmountController.text),
    );
  }

  void dispose() {
    textController.dispose();
    quantityController.dispose();
    unitPriceAmountController.dispose();
    lineTotalAmountController.dispose();
  }
}

String _lineSummary(ReceiptOcrReviewLine line) {
  final parts = [
    if (line.quantity != null) 'Qty ${line.quantity}',
    if (line.unitPriceAmount != null) 'Unit ${line.unitPriceAmount}',
    if (line.lineTotalAmount != null) 'Total ${line.lineTotalAmount}',
  ];

  return parts.isEmpty
      ? 'Needs manual review: no traceable line amount'
      : parts.join('  ');
}

bool _hasAnyReviewCandidate(ReceiptOcrReviewDetail review) {
  return review.merchantText != null ||
      review.receiptIssuedAtUtc != null ||
      review.currency != null ||
      review.subtotalAmount != null ||
      review.taxAmount != null ||
      review.serviceChargeAmount != null ||
      review.discountAmount != null ||
      review.grandTotalAmount != null ||
      review.lines.isNotEmpty;
}

class _ReceiptOcrReviewHeader extends StatelessWidget {
  const _ReceiptOcrReviewHeader({required this.review});

  final ReceiptOcrReviewDetail review;

  @override
  Widget build(BuildContext context) {
    final merchant = review.merchantText ?? 'Receipt review';
    final scope = review.groupId == null ? 'Personal bill' : 'Group bill';

    return Semantics(
      container: true,
      label: _headerOcrCandidatesSemanticLabel,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  merchant,
                  style: Theme.of(context).textTheme.headlineSmall,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 12),
              _StatusChip(label: receiptOcrReviewStatusLabel(review.status)),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              _SoftChip(label: scope),
              _SoftChip(label: receiptOcrReviewSourceLabel(review.source)),
              if (review.currency != null) _SoftChip(label: review.currency!),
            ],
          ),
          if (review.receiptIssuedAtUtc != null) ...[
            const SizedBox(height: 12),
            _KeyValueText(
              label: 'Receipt date',
              value: _formatDate(review.receiptIssuedAtUtc!),
            ),
          ],
        ],
      ),
    );
  }
}

class _ReceiptOcrReviewTotals extends StatelessWidget {
  const _ReceiptOcrReviewTotals({required this.review});

  final ReceiptOcrReviewDetail review;

  @override
  Widget build(BuildContext context) {
    final rows = [
      ('Subtotal', review.subtotalAmount),
      ('Tax', review.taxAmount),
      ('Service charge', review.serviceChargeAmount),
      ('Discount', review.discountAmount),
      ('Grand total', review.grandTotalAmount),
    ].where((row) => row.$2 != null).toList(growable: false);

    if (rows.isEmpty) {
      return const _StatePanel(
        icon: Icons.payments_outlined,
        title: 'No header totals',
        message: 'Review the receipt lines or use manual entry.',
        compact: true,
      );
    }

    return Semantics(
      container: true,
      label: _totalOcrCandidatesSemanticLabel,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Receipt totals',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          for (final row in rows)
            _KeyValueMoneyText(
              label: row.$1,
              amount: row.$2,
              currency: review.currency,
            ),
        ],
      ),
    );
  }
}

class _ReceiptOcrReviewLines extends StatefulWidget {
  const _ReceiptOcrReviewLines({required this.lines});

  final List<ReceiptOcrReviewLine> lines;

  @override
  State<_ReceiptOcrReviewLines> createState() => _ReceiptOcrReviewLinesState();
}

class _ReceiptOcrReviewLinesState extends State<_ReceiptOcrReviewLines> {
  final TextEditingController _searchController = TextEditingController();
  _ReceiptOcrReviewLineDiscoveryFilter _selectedFilter =
      _ReceiptOcrReviewLineDiscoveryFilter.all;
  String _searchQuery = '';

  @override
  void didUpdateWidget(_ReceiptOcrReviewLines oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_sameLineSet(oldWidget.lines, widget.lines)) {
      _searchController.clear();
      _searchQuery = '';
      _selectedFilter = _ReceiptOcrReviewLineDiscoveryFilter.all;
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  bool get _isDiscoveryActive =>
      _searchQuery.trim().isNotEmpty ||
      _selectedFilter != _ReceiptOcrReviewLineDiscoveryFilter.all;

  void _setSearchQuery(String value) {
    setState(() {
      _searchQuery = value;
    });
  }

  void _setSelectedFilter(_ReceiptOcrReviewLineDiscoveryFilter filter) {
    setState(() {
      _selectedFilter = filter;
    });
  }

  void _clearDiscovery() {
    _searchController.clear();
    setState(() {
      _searchQuery = '';
      _selectedFilter = _ReceiptOcrReviewLineDiscoveryFilter.all;
    });
  }

  @override
  Widget build(BuildContext context) {
    final lines = widget.lines;
    if (lines.isEmpty) {
      return const _StatePanel(
        icon: Icons.format_list_bulleted,
        title: 'No receipt lines',
        message: 'Apply is blocked until the server receives reviewed lines.',
        compact: true,
      );
    }

    final sorted = [...lines]
      ..sort((left, right) => left.sortOrder.compareTo(right.sortOrder));
    final discovery = _ReceiptOcrReviewLineDiscoveryState(
      lines: sorted,
      selectedFilter: _selectedFilter,
      searchQuery: _searchQuery,
    );

    return Semantics(
      container: true,
      label: _lineOcrCandidatesSemanticLabel,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Review receipt lines',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          if (sorted.length <= 1)
            for (final line in sorted) _ReceiptOcrReviewLineTile(line: line)
          else ...[
            _ReceiptOcrReviewLineDiscoveryControls(
              discovery: discovery,
              searchController: _searchController,
              onSearchChanged: _setSearchQuery,
              onFilterSelected: _setSelectedFilter,
              onClearDiscovery: _isDiscoveryActive ? _clearDiscovery : null,
            ),
            const SizedBox(height: 10),
            if (discovery.visibleLines.isEmpty)
              const _StatePanel(
                icon: Icons.search_off_outlined,
                title: 'No matching receipt lines',
                message:
                    'Adjust the search or filters to show loaded OCR receipt lines.',
                compact: true,
              )
            else
              for (final line in discovery.visibleLines)
                _ReceiptOcrReviewLineTile(line: line),
          ],
        ],
      ),
    );
  }
}

class _ReceiptOcrReviewLineDiscoveryControls extends StatelessWidget {
  const _ReceiptOcrReviewLineDiscoveryControls({
    required this.discovery,
    required this.searchController,
    required this.onSearchChanged,
    required this.onFilterSelected,
    required this.onClearDiscovery,
  });

  final _ReceiptOcrReviewLineDiscoveryState discovery;
  final TextEditingController searchController;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<_ReceiptOcrReviewLineDiscoveryFilter> onFilterSelected;
  final VoidCallback? onClearDiscovery;

  @override
  Widget build(BuildContext context) {
    final loadedCount = discovery.lines.length;
    final visibleCount = discovery.visibleLines.length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          key: const Key('receipt-review-line-search'),
          controller: searchController,
          decoration: const InputDecoration(
            labelText: 'Search receipt lines',
            prefixIcon: Icon(Icons.search),
            border: OutlineInputBorder(),
          ),
          textInputAction: TextInputAction.search,
          onChanged: onSearchChanged,
        ),
        const SizedBox(height: 8),
        Text(
          'Showing $visibleCount of $loadedCount loaded receipt lines',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            for (final filter in _ReceiptOcrReviewLineDiscoveryFilter.values)
              FilterChip(
                key: ValueKey('receipt-review-line-filter-${filter.key}'),
                selected: discovery.selectedFilter == filter,
                label: Text('${filter.label} (${discovery.countFor(filter)})'),
                onSelected: (_) => onFilterSelected(filter),
              ),
            if (onClearDiscovery != null)
              TextButton.icon(
                key: const Key('receipt-review-line-clear-discovery'),
                onPressed: onClearDiscovery,
                icon: const Icon(Icons.clear),
                label: const Text('Clear'),
              ),
          ],
        ),
      ],
    );
  }
}

class _ReceiptOcrReviewLineTile extends StatelessWidget {
  const _ReceiptOcrReviewLineTile({required this.line});

  final ReceiptOcrReviewLine line;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: _lineOcrCandidateSemanticLabel,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: DecoratedBox(
          decoration: BoxDecoration(
            border: Border.all(
              color: Theme.of(context).colorScheme.outlineVariant,
            ),
            borderRadius: BorderRadius.circular(8),
          ),
          child: ListTile(
            title: Text(
              line.text,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            subtitle: Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(_lineSummary(line)),
            ),
          ),
        ),
      ),
    );
  }
}

enum _ReceiptOcrReviewLineDiscoveryFilter {
  all(label: 'All', key: 'all'),
  hasAmount(label: 'Has amount', key: 'has-amount'),
  missingAmount(label: 'Missing amount', key: 'missing-amount'),
  hasQuantity(label: 'Has quantity', key: 'has-quantity'),
  missingQuantity(label: 'Missing quantity', key: 'missing-quantity');

  const _ReceiptOcrReviewLineDiscoveryFilter({
    required this.label,
    required this.key,
  });

  final String label;
  final String key;
}

class _ReceiptOcrReviewLineDiscoveryState {
  _ReceiptOcrReviewLineDiscoveryState({
    required this.lines,
    required this.selectedFilter,
    required String searchQuery,
  }) : searchQuery = searchQuery.trim().toLowerCase();

  final List<ReceiptOcrReviewLine> lines;
  final _ReceiptOcrReviewLineDiscoveryFilter selectedFilter;
  final String searchQuery;

  late final List<ReceiptOcrReviewLine> visibleLines = [
    for (final line in lines)
      if (_matchesLineFilter(line, selectedFilter) && _matchesSearch(line))
        line,
  ];

  int countFor(_ReceiptOcrReviewLineDiscoveryFilter filter) {
    return lines.where((line) => _matchesLineFilter(line, filter)).length;
  }

  bool _matchesSearch(ReceiptOcrReviewLine line) {
    if (searchQuery.isEmpty) {
      return true;
    }

    return _safeSearchText(line).contains(searchQuery);
  }

  String _safeSearchText(ReceiptOcrReviewLine line) {
    return [
      line.text,
      ?line.quantity,
      ?line.unitPriceAmount,
      ?line.lineTotalAmount,
      _lineSummary(line),
    ].join(' ').toLowerCase();
  }
}

bool _matchesLineFilter(
  ReceiptOcrReviewLine line,
  _ReceiptOcrReviewLineDiscoveryFilter filter,
) {
  return switch (filter) {
    _ReceiptOcrReviewLineDiscoveryFilter.all => true,
    _ReceiptOcrReviewLineDiscoveryFilter.hasAmount => _lineHasAmount(line),
    _ReceiptOcrReviewLineDiscoveryFilter.missingAmount => !_lineHasAmount(line),
    _ReceiptOcrReviewLineDiscoveryFilter.hasQuantity => _hasNonEmptyCandidate(
      line.quantity,
    ),
    _ReceiptOcrReviewLineDiscoveryFilter.missingQuantity =>
      !_hasNonEmptyCandidate(line.quantity),
  };
}

bool _lineHasAmount(ReceiptOcrReviewLine line) {
  return _hasNonEmptyCandidate(line.unitPriceAmount) ||
      _hasNonEmptyCandidate(line.lineTotalAmount);
}

bool _hasNonEmptyCandidate(String? value) {
  return value != null && value.trim().isNotEmpty;
}

bool _sameLineSet(
  List<ReceiptOcrReviewLine> left,
  List<ReceiptOcrReviewLine> right,
) {
  if (left.length != right.length) {
    return false;
  }

  for (var index = 0; index < left.length; index++) {
    final leftLine = left[index];
    final rightLine = right[index];
    if (leftLine.id != rightLine.id ||
        leftLine.sortOrder != rightLine.sortOrder ||
        leftLine.text != rightLine.text ||
        leftLine.quantity != rightLine.quantity ||
        leftLine.unitPriceAmount != rightLine.unitPriceAmount ||
        leftLine.lineTotalAmount != rightLine.lineTotalAmount) {
      return false;
    }
  }

  return true;
}

class _ApplyPreviewSection extends StatelessWidget {
  const _ApplyPreviewSection({
    required this.isLoadingPreview,
    required this.isApplying,
    required this.actionsBlocked,
    required this.preview,
    required this.previewFailure,
    required this.applyResult,
    required this.applyFailure,
    required this.onPreview,
    required this.onApply,
  });

  final bool isLoadingPreview;
  final bool isApplying;
  final bool actionsBlocked;
  final ReceiptOcrReviewApplyPreview? preview;
  final ReceiptOcrReviewFailure? previewFailure;
  final ReceiptOcrReviewApplyResult? applyResult;
  final ReceiptOcrReviewFailure? applyFailure;
  final VoidCallback onPreview;
  final VoidCallback onApply;

  @override
  Widget build(BuildContext context) {
    final preview = this.preview;
    final applyEnabled =
        preview != null &&
        preview.canApply &&
        applyResult == null &&
        !actionsBlocked;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Apply preview', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: actionsBlocked ? null : onPreview,
                icon: isLoadingPreview
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.fact_check_outlined),
                label: _SemanticButtonLabel(
                  label: isLoadingPreview
                      ? _loadingReceiptOcrReviewApplyPreviewLabel
                      : actionsBlocked
                      ? _busyActionSemanticLabel(
                          _previewReceiptOcrReviewApplyLabel,
                        )
                      : _previewReceiptOcrReviewApplyLabel,
                  enabled: !actionsBlocked,
                  child: const Text('Preview apply'),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: FilledButton.icon(
                onPressed: applyEnabled ? onApply : null,
                icon: isApplying
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.check_circle_outline),
                label: _SemanticButtonLabel(
                  label: isApplying
                      ? _applyingReceiptOcrReviewLabel
                      : applyEnabled
                      ? _applyReceiptOcrReviewLabel
                      : _busyActionSemanticLabel(_applyReceiptOcrReviewLabel),
                  enabled: applyEnabled,
                  child: const Text('Apply to draft'),
                ),
              ),
            ),
          ],
        ),
        if (previewFailure != null) ...[
          const SizedBox(height: 12),
          _InlineFailure(failure: previewFailure!),
        ],
        if (preview != null) ...[
          const SizedBox(height: 12),
          _PreviewSummary(preview: preview),
        ],
        if (applyFailure != null) ...[
          const SizedBox(height: 12),
          _InlineFailure(failure: applyFailure!),
        ],
        if (applyResult != null) ...[
          const SizedBox(height: 12),
          _ApplyResult(result: applyResult!),
        ],
      ],
    );
  }
}

class _PreviewSummary extends StatelessWidget {
  const _PreviewSummary({required this.preview});

  final ReceiptOcrReviewApplyPreview preview;

  @override
  Widget build(BuildContext context) {
    final blockedReasons = preview.blockedReasons;
    final warnings = preview.warnings;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  preview.canApply
                      ? Icons.verified_outlined
                      : Icons.block_outlined,
                  size: 20,
                ),
                const SizedBox(width: 8),
                Text(
                  preview.canApply
                      ? 'Ready for confirmation'
                      : 'Blocked by server preview',
                  style: Theme.of(context).textTheme.titleSmall,
                ),
              ],
            ),
            const SizedBox(height: 10),
            _KeyValueText(
              label: 'Proposed lines',
              value:
                  '${preview.summary.linesWithProposedTotalCount} of ${preview.summary.lineCount}',
            ),
            _KeyValueMoneyText(
              label: 'Line total sum',
              amount: preview.summary.proposedLineTotalSumAmount,
              currency: preview.proposedCurrency,
            ),
            _KeyValueMoneyText(
              label: 'Header total',
              amount: preview.proposedGrandTotalAmount,
              currency: preview.proposedCurrency,
            ),
            if (blockedReasons.isNotEmpty) ...[
              const SizedBox(height: 10),
              _IssueWrap(title: 'Blocking reasons', issues: blockedReasons),
            ],
            if (warnings.isNotEmpty) ...[
              const SizedBox(height: 10),
              _IssueWrap(title: 'Warnings', issues: warnings),
            ],
          ],
        ),
      ),
    );
  }
}

class _ApplyResult extends StatelessWidget {
  const _ApplyResult({required this.result});

  final ReceiptOcrReviewApplyResult result;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.primary),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.check_circle_outline,
                  color: Theme.of(context).colorScheme.primary,
                  size: 20,
                ),
                const SizedBox(width: 8),
                Text(
                  'Applied to draft',
                  style: Theme.of(context).textTheme.titleSmall,
                ),
              ],
            ),
            const SizedBox(height: 8),
            _KeyValueText(
              label: 'Applied items',
              value: result.appliedItemCount.toString(),
            ),
            _KeyValueMoneyText(
              label: 'Grand total',
              amount: result.grandTotalAmount,
              currency: result.currency,
            ),
          ],
        ),
      ),
    );
  }
}

class _KeyValueMoneyText extends StatelessWidget {
  const _KeyValueMoneyText({
    required this.label,
    required this.amount,
    required this.currency,
  });

  final String label;
  final String? amount;
  final String? currency;

  @override
  Widget build(BuildContext context) {
    final normalizedAmount = amount?.trim();
    if (normalizedAmount == null || normalizedAmount.isEmpty) {
      return _KeyValueText(label: label, value: 'Not provided');
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 132,
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: MoneyText(
              amount: normalizedAmount,
              currencyCode: currency ?? '',
              style: Theme.of(context).textTheme.bodyMedium,
              textAlign: TextAlign.end,
            ),
          ),
        ],
      ),
    );
  }
}

class _IssueWrap extends StatelessWidget {
  const _IssueWrap({required this.title, required this.issues});

  final String title;
  final List<ReceiptOcrReviewApplyPreviewIssueCode> issues;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          runSpacing: 6,
          children: [
            for (final issue in issues)
              Semantics(
                container: true,
                label: _ocrReviewIssueSemanticLabel,
                child: _SoftChip(
                  label: receiptOcrReviewIssueLabel(issue),
                  icon: Icons.info_outline,
                ),
              ),
          ],
        ),
      ],
    );
  }
}

String _formatDate(DateTime value) {
  final utc = value.toUtc();
  final year = utc.year.toString().padLeft(4, '0');
  final month = utc.month.toString().padLeft(2, '0');
  final day = utc.day.toString().padLeft(2, '0');
  return '$year-$month-$day';
}

String? _nullableText(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }

  return trimmed;
}

DateTime? _parseDate(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    return null;
  }

  final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(trimmed);
  if (match == null) {
    return null;
  }

  final parsed = DateTime.tryParse('${trimmed}T00:00:00Z')?.toUtc();
  if (parsed == null ||
      parsed.year.toString().padLeft(4, '0') != match.group(1) ||
      parsed.month.toString().padLeft(2, '0') != match.group(2) ||
      parsed.day.toString().padLeft(2, '0') != match.group(3)) {
    return null;
  }

  return parsed;
}

String? _dateValidator(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }

  return _parseDate(trimmed) == null ? 'Use YYYY-MM-DD' : null;
}

String? _lineMoneyValidator(String? value) {
  return _optionalDecimalStringValidator(
    value,
    pattern: _receiptOcrMoneyPattern,
    message: 'Use a non-negative decimal amount',
  );
}

String? _quantityValidator(String? value) {
  return _optionalDecimalStringValidator(
    value,
    pattern: _receiptOcrQuantityPattern,
    message: 'Use a positive decimal quantity',
  );
}

String? _optionalDecimalStringValidator(
  String? value, {
  required RegExp pattern,
  required String message,
}) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }

  if (trimmed.length > _receiptOcrDecimalMaxLength ||
      !pattern.hasMatch(trimmed)) {
    return message;
  }

  return null;
}

String? _lineTextValidator(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return 'Required';
  }

  return null;
}

const _receiptOcrDecimalMaxLength = 22;
final _receiptOcrMoneyPattern = RegExp(r'^(0|[1-9][0-9]*)(\.[0-9]{1,4})?$');
final _receiptOcrQuantityPattern = RegExp(
  r'^(?=.*[1-9])(?:0|[0-9]+)(?:\.[0-9]{1,4})?$',
);
