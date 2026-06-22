import 'package:flutter/material.dart';

const settleoraSupportedCurrencies = <SettleoraCurrencyMetadata>[
  SettleoraCurrencyMetadata('HKD', 'Hong Kong Dollar', minorUnitDigits: 2),
  SettleoraCurrencyMetadata('USD', 'US Dollar', minorUnitDigits: 2),
  SettleoraCurrencyMetadata('EUR', 'Euro', minorUnitDigits: 2),
  SettleoraCurrencyMetadata('GBP', 'British Pound', minorUnitDigits: 2),
  SettleoraCurrencyMetadata('JPY', 'Japanese Yen', minorUnitDigits: 0),
  SettleoraCurrencyMetadata('KWD', 'Kuwaiti Dinar', minorUnitDigits: 3),
  SettleoraCurrencyMetadata('BHD', 'Bahraini Dinar', minorUnitDigits: 3),
];

const settleoraPaymentMethodOptions = <String>[
  'Cash',
  'Bank transfer',
  'FPS',
  'PayMe',
  'Octopus',
  'Credit card',
  'Debit card',
  'Wise',
  'Revolut',
  'PayPal',
  'Venmo',
  'Alipay',
  'WeChat Pay',
];

class SettleoraCurrencyMetadata {
  const SettleoraCurrencyMetadata(
    this.code,
    this.name, {
    required this.minorUnitDigits,
  });

  final String code;
  final String name;
  final int minorUnitDigits;

  String get label => '$code - $name';
}

String? settleoraNormalizeCurrencyCode(String? value) {
  final normalized = value?.trim().toUpperCase();
  return normalized == null || normalized.isEmpty ? null : normalized;
}

bool settleoraIsSupportedCurrency(String? value) {
  final normalized = settleoraNormalizeCurrencyCode(value);
  return normalized != null &&
      settleoraSupportedCurrencies.any(
        (currency) => currency.code == normalized,
      );
}

class CurrencySelector extends StatelessWidget {
  const CurrencySelector({
    super.key,
    required this.value,
    required this.onChanged,
    this.label = 'Currency',
    this.helperText,
    this.errorText,
    this.enabled = true,
    this.isLoading = false,
    this.allowClear = false,
    this.semanticLabel,
    this.validator,
  });

  final String? value;
  final ValueChanged<String?> onChanged;
  final String label;
  final String? helperText;
  final String? errorText;
  final bool enabled;
  final bool isLoading;
  final bool allowClear;
  final String? semanticLabel;
  final FormFieldValidator<String?>? validator;

  @override
  Widget build(BuildContext context) {
    final normalizedValue = settleoraNormalizeCurrencyCode(value);
    final supportedValue = settleoraIsSupportedCurrency(normalizedValue);
    final dropdownValue = supportedValue ? normalizedValue : normalizedValue;
    final items = <DropdownMenuItem<String?>>[
      if (allowClear)
        const DropdownMenuItem<String?>(
          value: null,
          child: Text('No currency preference'),
        ),
      for (final currency in settleoraSupportedCurrencies)
        DropdownMenuItem<String?>(
          value: currency.code,
          child: Text(currency.label, overflow: TextOverflow.ellipsis),
        ),
      if (normalizedValue != null && !supportedValue)
        DropdownMenuItem<String?>(
          value: normalizedValue,
          child: Text(
            '$normalizedValue - Not currently selectable',
            overflow: TextOverflow.ellipsis,
          ),
        ),
    ];

    return Semantics(
      textField: true,
      label: semanticLabel ?? label,
      child: DropdownButtonFormField<String?>(
        key: ValueKey<String?>(
          'currency-selector-dropdown-${dropdownValue ?? 'blank'}',
        ),
        initialValue: dropdownValue,
        isExpanded: true,
        decoration: InputDecoration(
          labelText: label,
          helperText: isLoading ? 'Loading currencies...' : helperText,
          errorText: errorText,
          border: const OutlineInputBorder(),
          suffixIcon: isLoading
              ? const Padding(
                  padding: EdgeInsets.all(14),
                  child: SizedBox.square(
                    dimension: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                )
              : null,
        ),
        items: items,
        onChanged: enabled && !isLoading
            ? (selected) => onChanged(settleoraNormalizeCurrencyCode(selected))
            : null,
        validator: validator,
      ),
    );
  }
}

class PaymentMethodSelector extends StatefulWidget {
  const PaymentMethodSelector({
    super.key,
    required this.value,
    required this.onChanged,
    this.label = 'Payment method',
    this.helperText,
    this.errorText,
    this.enabled = true,
    this.isLoading = false,
    this.allowClear = true,
    this.maxLength,
    this.semanticLabel,
  });

  final String? value;
  final ValueChanged<String?> onChanged;
  final String label;
  final String? helperText;
  final String? errorText;
  final bool enabled;
  final bool isLoading;
  final bool allowClear;
  final int? maxLength;
  final String? semanticLabel;

  @override
  State<PaymentMethodSelector> createState() => _PaymentMethodSelectorState();
}

class _PaymentMethodSelectorState extends State<PaymentMethodSelector> {
  late final TextEditingController _customController;

  @override
  void initState() {
    super.initState();
    _customController = TextEditingController(text: _customValue(widget.value));
  }

  @override
  void didUpdateWidget(covariant PaymentMethodSelector oldWidget) {
    super.didUpdateWidget(oldWidget);
    final nextCustom = _customValue(widget.value);
    if (_customController.text != nextCustom) {
      _customController.text = nextCustom;
    }
  }

  @override
  void dispose() {
    _customController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final normalizedValue = _normalizeMethod(widget.value);
    final commonValue = settleoraPaymentMethodOptions.contains(normalizedValue)
        ? normalizedValue
        : null;
    final selectorValue = normalizedValue == null
        ? null
        : commonValue ?? _otherValue;

    return Semantics(
      textField: true,
      label: widget.semanticLabel ?? widget.label,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          DropdownButtonFormField<String?>(
            initialValue: selectorValue,
            isExpanded: true,
            decoration: InputDecoration(
              labelText: widget.label,
              helperText: widget.isLoading
                  ? 'Loading payment methods...'
                  : widget.helperText,
              errorText: widget.errorText,
              border: const OutlineInputBorder(),
            ),
            items: [
              if (widget.allowClear)
                const DropdownMenuItem<String?>(
                  value: null,
                  child: Text('Not set'),
                ),
              for (final method in settleoraPaymentMethodOptions)
                DropdownMenuItem<String?>(value: method, child: Text(method)),
              const DropdownMenuItem<String?>(
                value: _otherValue,
                child: Text('Other'),
              ),
            ],
            onChanged: widget.enabled && !widget.isLoading
                ? (selected) {
                    if (selected == _otherValue) {
                      widget.onChanged(
                        _normalizeMethod(_customController.text),
                      );
                      return;
                    }
                    widget.onChanged(_normalizeMethod(selected));
                  }
                : null,
          ),
          if (selectorValue == _otherValue) ...[
            const SizedBox(height: 10),
            TextField(
              key: ValueKey('${widget.key ?? 'payment-method'}-custom'),
              controller: _customController,
              enabled: widget.enabled && !widget.isLoading,
              maxLength: widget.maxLength,
              decoration: const InputDecoration(
                labelText: 'Custom payment method',
                helperText: 'Use a short label people will recognize.',
                border: OutlineInputBorder(),
              ),
              onChanged: (value) => widget.onChanged(_normalizeMethod(value)),
            ),
          ],
        ],
      ),
    );
  }
}

class MoneyAmountCurrencyField extends StatelessWidget {
  const MoneyAmountCurrencyField({
    super.key,
    required this.amountController,
    required this.currencyValue,
    required this.onCurrencyChanged,
    required this.amountLabel,
    required this.currencyLabel,
    this.amountKey,
    this.currencyKey,
    this.enabled = true,
    this.amountValidator,
    this.currencyValidator,
    this.helperText,
  });

  final TextEditingController amountController;
  final String? currencyValue;
  final ValueChanged<String?> onCurrencyChanged;
  final String amountLabel;
  final String currencyLabel;
  final Key? amountKey;
  final Key? currencyKey;
  final bool enabled;
  final FormFieldValidator<String>? amountValidator;
  final FormFieldValidator<String?>? currencyValidator;
  final String? helperText;

  @override
  Widget build(BuildContext context) {
    return MoneyInput(
      amountController: amountController,
      currencyValue: currencyValue,
      onCurrencyChanged: onCurrencyChanged,
      amountLabel: amountLabel,
      currencyLabel: currencyLabel,
      amountKey: amountKey,
      currencyKey: currencyKey,
      enabled: enabled,
      amountValidator: amountValidator,
      currencyValidator: currencyValidator,
      helperText: helperText,
    );
  }
}

enum MoneyInputCurrencyControl { selector, staticCode }

class MoneyInput extends StatelessWidget {
  const MoneyInput({
    super.key,
    required this.amountController,
    required this.currencyValue,
    required this.onCurrencyChanged,
    this.amountLabel = 'Amount',
    this.currencyLabel = 'Currency',
    this.amountKey,
    this.currencyKey,
    this.enabled = true,
    this.isLoading = false,
    this.allowSignedAmount = false,
    this.currencyControl = MoneyInputCurrencyControl.selector,
    this.onAmountChanged,
    this.amountValidator,
    this.currencyValidator,
    this.helperText,
    this.errorText,
  });

  final TextEditingController amountController;
  final String? currencyValue;
  final ValueChanged<String?> onCurrencyChanged;
  final String amountLabel;
  final String currencyLabel;
  final Key? amountKey;
  final Key? currencyKey;
  final bool enabled;
  final bool isLoading;
  final bool allowSignedAmount;
  final MoneyInputCurrencyControl currencyControl;
  final ValueChanged<String>? onAmountChanged;
  final FormFieldValidator<String>? amountValidator;
  final FormFieldValidator<String?>? currencyValidator;
  final String? helperText;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    final normalizedCurrency = settleoraNormalizeCurrencyCode(currencyValue);
    final currencyDisplay = normalizedCurrency ?? 'No currency';
    final effectiveHelperText =
        helperText ??
        switch (currencyControl) {
          MoneyInputCurrencyControl.selector =>
            'Enter the amount for ${normalizedCurrency ?? 'the selected currency'}.',
          MoneyInputCurrencyControl.staticCode =>
            normalizedCurrency == null
                ? 'No currency selected in $currencyLabel.'
                : 'Uses $normalizedCurrency from $currencyLabel.',
        };
    return Semantics(
      label: switch (currencyControl) {
        MoneyInputCurrencyControl.selector => '$amountLabel and $currencyLabel',
        MoneyInputCurrencyControl.staticCode =>
          '$amountLabel amount in $currencyDisplay',
      },
      textField: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextFormField(
            key: amountKey,
            controller: amountController,
            enabled: enabled && !isLoading,
            keyboardType: TextInputType.numberWithOptions(
              decimal: true,
              signed: allowSignedAmount,
            ),
            onChanged: onAmountChanged,
            decoration: InputDecoration(
              labelText: amountLabel,
              helperText: effectiveHelperText,
              errorText: errorText,
              border: const OutlineInputBorder(),
              suffixIcon: Padding(
                padding: const EdgeInsetsDirectional.only(end: 12),
                child: Center(
                  widthFactor: 1,
                  child: Text(
                    currencyDisplay,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ),
              ),
              suffixIconConstraints: const BoxConstraints(minWidth: 48),
            ),
            validator: amountValidator,
          ),
          if (currencyControl == MoneyInputCurrencyControl.selector) ...[
            const SizedBox(height: 10),
            CurrencySelector(
              key: currencyKey,
              value: currencyValue,
              onChanged: onCurrencyChanged,
              label: currencyLabel,
              enabled: enabled,
              isLoading: isLoading,
              validator: currencyValidator,
              helperText:
                  'Currency stays explicit; the server validates final money rules.',
            ),
          ],
        ],
      ),
    );
  }
}

class DateField extends StatefulWidget {
  const DateField({
    super.key,
    required this.controller,
    required this.label,
    this.enabled = true,
    this.isLoading = false,
    this.firstDate,
    this.lastDate,
    this.initialDate,
    this.helperText,
    this.validator,
    this.onChanged,
  });

  final TextEditingController controller;
  final String label;
  final bool enabled;
  final bool isLoading;
  final DateTime? firstDate;
  final DateTime? lastDate;
  final DateTime? initialDate;
  final String? helperText;
  final FormFieldValidator<String>? validator;
  final ValueChanged<String>? onChanged;

  @override
  State<DateField> createState() => _DateFieldState();
}

class _DateFieldState extends State<DateField> {
  late final TextEditingController _displayController;

  @override
  void initState() {
    super.initState();
    _displayController = TextEditingController();
    widget.controller.addListener(_syncDisplayText);
    _syncDisplayText();
  }

  @override
  void didUpdateWidget(covariant DateField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_syncDisplayText);
      widget.controller.addListener(_syncDisplayText);
      _syncDisplayText();
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_syncDisplayText);
    _displayController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      textField: true,
      label: widget.label,
      child: TextFormField(
        controller: _displayController,
        enabled: widget.enabled && !widget.isLoading,
        readOnly: true,
        decoration: InputDecoration(
          labelText: widget.label,
          helperText:
              widget.helperText ??
              'Choose a date. The saved value stays unchanged.',
          border: const OutlineInputBorder(),
          suffixIcon: widget.isLoading
              ? const Padding(
                  padding: EdgeInsets.all(14),
                  child: SizedBox.square(
                    dimension: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                )
              : const Icon(Icons.calendar_today_outlined),
        ),
        validator: (_) => widget.validator?.call(widget.controller.text),
        onTap: widget.enabled && !widget.isLoading ? _pickDate : null,
      ),
    );
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final firstDate = widget.firstDate ?? DateTime(now.year - 10);
    final lastDate = widget.lastDate ?? DateTime(now.year + 10, 12, 31);
    final parsed = _parseIsoDate(widget.controller.text);
    final initialDate = _clampDate(
      widget.initialDate ?? parsed ?? now,
      firstDate,
      lastDate,
    );
    final selected = await showDatePicker(
      context: context,
      initialDate: initialDate,
      firstDate: firstDate,
      lastDate: lastDate,
    );
    if (selected == null) {
      return;
    }
    final isoDate = _formatIsoDate(selected);
    widget.controller.text = isoDate;
    widget.onChanged?.call(isoDate);
  }

  void _syncDisplayText() {
    final parsed = _parseIsoDate(widget.controller.text);
    final nextText = parsed == null
        ? widget.controller.text
        : _formatProductDate(parsed);
    if (_displayController.text != nextText) {
      _displayController.text = nextText;
    }
  }
}

const _otherValue = '__other__';

String? _normalizeMethod(String? value) {
  final trimmed = value?.trim();
  return trimmed == null || trimmed.isEmpty ? null : trimmed;
}

String _customValue(String? value) {
  final normalized = _normalizeMethod(value);
  if (normalized == null ||
      settleoraPaymentMethodOptions.contains(normalized)) {
    return '';
  }
  return normalized;
}

DateTime? _parseIsoDate(String value) {
  final trimmed = value.trim();
  final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(trimmed);
  if (match == null) {
    return null;
  }
  final year = int.tryParse(match.group(1)!);
  final month = int.tryParse(match.group(2)!);
  final day = int.tryParse(match.group(3)!);
  if (year == null || month == null || day == null) {
    return null;
  }
  final parsed = DateTime(year, month, day);
  if (parsed.year != year || parsed.month != month || parsed.day != day) {
    return null;
  }
  return parsed;
}

DateTime _clampDate(DateTime value, DateTime firstDate, DateTime lastDate) {
  if (value.isBefore(firstDate)) {
    return firstDate;
  }
  if (value.isAfter(lastDate)) {
    return lastDate;
  }
  return value;
}

String _formatIsoDate(DateTime value) {
  final month = value.month.toString().padLeft(2, '0');
  final day = value.day.toString().padLeft(2, '0');
  return '${value.year}-$month-$day';
}

String _formatProductDate(DateTime value) {
  const months = <String>[
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return '${months[value.month - 1]} ${value.day}, ${value.year}';
}
