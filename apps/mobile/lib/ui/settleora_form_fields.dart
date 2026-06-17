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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextFormField(
          key: amountKey,
          controller: amountController,
          enabled: enabled,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(
            labelText: amountLabel,
            helperText: helperText,
            border: const OutlineInputBorder(),
          ),
          validator: amountValidator,
        ),
        const SizedBox(height: 10),
        CurrencySelector(
          key: currencyKey,
          value: currencyValue,
          onChanged: onCurrencyChanged,
          label: currencyLabel,
          enabled: enabled,
          validator: currencyValidator,
        ),
      ],
    );
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
