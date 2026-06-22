import 'dart:async';

import 'package:flutter/material.dart';

import '../ui/settleora_components.dart';
import '../ui/settleora_form_fields.dart';
import '../ui/settleora_theme.dart';
import 'manual_finance_repository.dart';

class SettleoraManualFinanceScreen extends StatefulWidget {
  const SettleoraManualFinanceScreen({
    super.key,
    required this.repository,
    this.defaultCurrency,
  });

  final SettleoraManualFinanceRepository repository;
  final String? defaultCurrency;

  @override
  State<SettleoraManualFinanceScreen> createState() =>
      _SettleoraManualFinanceScreenState();
}

class _SettleoraManualFinanceScreenState
    extends State<SettleoraManualFinanceScreen> {
  bool _isLoading = true;
  bool _showArchived = false;
  int _summaryWindowDays = 60;
  SettleoraManualFinanceFailure? _failure;
  SettleoraManualFinanceSummary? _summary;
  List<SettleoraManualFinancialAccount> _accounts = const [];
  List<SettleoraManualIncomeSource> _incomeSources = const [];

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _failure = null;
    });

    try {
      final window = _summaryWindow();
      final results = await Future.wait<Object>([
        widget.repository.getSummary(
          windowStartDate: window.$1,
          windowEndDate: window.$2,
        ),
        widget.repository.listAccounts(includeArchived: _showArchived),
        widget.repository.listIncomeSources(includeArchived: _showArchived),
      ]);
      if (!mounted) {
        return;
      }

      setState(() {
        _summary = results[0] as SettleoraManualFinanceSummary;
        _accounts = results[1] as List<SettleoraManualFinancialAccount>;
        _incomeSources = results[2] as List<SettleoraManualIncomeSource>;
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _failure = SettleoraManualFinanceFailure.from(error);
        _isLoading = false;
      });
    }
  }

  (String?, String?) _summaryWindow() {
    if (_summaryWindowDays == 60) {
      return (null, null);
    }

    final start = DateTime.now().toUtc();
    final end = start.add(Duration(days: _summaryWindowDays));
    return (_isoDate(start), _isoDate(end));
  }

  Future<void> _setSummaryWindowDays(int days) async {
    if (_summaryWindowDays == days) {
      return;
    }

    setState(() {
      _summaryWindowDays = days;
    });
    await _load();
  }

  Future<void> _setShowArchived(bool value) async {
    if (_showArchived == value) {
      return;
    }

    setState(() {
      _showArchived = value;
    });
    await _load();
  }

  Future<void> _openAccountForm({
    SettleoraManualFinancialAccount? account,
  }) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => _ManualAccountSheet(
        repository: widget.repository,
        account: account,
        defaultCurrency: widget.defaultCurrency,
      ),
    );

    if (saved == true && mounted) {
      await _load();
    }
  }

  Future<void> _openIncomeForm({SettleoraManualIncomeSource? income}) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => _ManualIncomeSheet(
        repository: widget.repository,
        income: income,
        accounts: _accounts.where((account) => !account.isArchived).toList(),
        defaultCurrency: widget.defaultCurrency,
      ),
    );

    if (saved == true && mounted) {
      await _load();
    }
  }

  Future<void> _archiveAccount(SettleoraManualFinancialAccount account) async {
    final confirmed = await _confirmArchive(
      title: 'Archive manual account?',
      message:
          'This hides the manually entered balance from the active list. It does not sync with a bank or change settlement math.',
    );
    if (!confirmed) {
      return;
    }

    await _runAction(() => widget.repository.archiveAccount(account.id));
  }

  Future<void> _archiveIncome(SettleoraManualIncomeSource income) async {
    final confirmed = await _confirmArchive(
      title: 'Archive income source?',
      message:
          'This hides the expected manual cash-in record from the active list. It does not connect to payroll or a bank feed.',
    );
    if (!confirmed) {
      return;
    }

    await _runAction(() => widget.repository.archiveIncomeSource(income.id));
  }

  Future<bool> _confirmArchive({
    required String title,
    required String message,
  }) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            key: const Key('manual-finance-archive-cancel'),
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            key: const Key('manual-finance-archive-confirm'),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Archive'),
          ),
        ],
      ),
    );

    return result ?? false;
  }

  Future<void> _runAction(Future<Object> Function() action) async {
    try {
      await action();
      if (!mounted) {
        return;
      }
      await _load();
    } catch (error) {
      if (!mounted) {
        return;
      }
      final failure = SettleoraManualFinanceFailure.from(error);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(failure.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Accounts & income'),
        actions: [
          IconButton(
            key: const Key('manual-finance-refresh'),
            tooltip: 'Refresh',
            onPressed: _isLoading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
            children: [
              _ManualFinanceNotice(colors: colors),
              const SizedBox(height: 12),
              SwitchListTile(
                key: const Key('manual-finance-show-archived'),
                value: _showArchived,
                onChanged: _isLoading ? null : _setShowArchived,
                title: const Text('Show archived'),
                subtitle: const Text('Archived records stay read-only here.'),
              ),
              if (_isLoading) ...[
                const SizedBox(height: 32),
                const Center(child: CircularProgressIndicator()),
                const SizedBox(height: 12),
                const Center(child: Text('Loading available estimate')),
              ] else if (_failure != null) ...[
                const SizedBox(height: 12),
                _ManualFinanceFailureCard(failure: _failure!, onRetry: _load),
              ] else ...[
                const SizedBox(height: 12),
                _AvailableEstimateSection(
                  summary: _summary!,
                  selectedWindowDays: _summaryWindowDays,
                  onWindowChanged: _setSummaryWindowDays,
                ),
                const SizedBox(height: 16),
                _ManualAccountsSection(
                  accounts: _accounts,
                  onCreate: () => _openAccountForm(),
                  onEdit: (account) => _openAccountForm(account: account),
                  onArchive: _archiveAccount,
                ),
                const SizedBox(height: 16),
                _ManualIncomeSection(
                  incomeSources: _incomeSources,
                  accounts: _accounts,
                  onCreate: () => _openIncomeForm(),
                  onEdit: (income) => _openIncomeForm(income: income),
                  onArchive: _archiveIncome,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _AvailableEstimateSection extends StatelessWidget {
  const _AvailableEstimateSection({
    required this.summary,
    required this.selectedWindowDays,
    required this.onWindowChanged,
  });

  final SettleoraManualFinanceSummary summary;
  final int selectedWindowDays;
  final ValueChanged<int> onWindowChanged;

  @override
  Widget build(BuildContext context) {
    final warningLabels = summary.warnings
        .map(settleoraManualFinanceWarningLabel)
        .toSet()
        .toList(growable: false);

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Available estimate',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Manual estimate only - ${summary.windowStartDate} to ${summary.windowEndDate}',
                      style: TextStyle(
                        color: context.settleoraColors.textMuted,
                      ),
                    ),
                  ],
                ),
              ),
              SegmentedButton<int>(
                key: const Key('manual-finance-summary-window'),
                segments: const [
                  ButtonSegment(value: 30, label: Text('30d')),
                  ButtonSegment(value: 60, label: Text('60d')),
                  ButtonSegment(value: 90, label: Text('90d')),
                ],
                selected: {selectedWindowDays},
                onSelectionChanged: (values) => onWindowChanged(values.single),
                showSelectedIcon: false,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            'No bank sync. This is not a payroll sync, bank balance, or available-to-spend guarantee.',
            style: TextStyle(color: context.settleoraColors.textMuted),
          ),
          const SizedBox(height: 12),
          if (summary.currencies.isEmpty)
            const Text(
              'Add manual accounts, one-time expected income, and upcoming future bills to make this estimate useful.',
            )
          else
            for (var index = 0; index < summary.currencies.length; index += 1)
              Padding(
                padding: EdgeInsets.only(
                  bottom: index == summary.currencies.length - 1 ? 0 : 10,
                ),
                child: _AvailableEstimateCurrencyCard(
                  row: summary.currencies[index],
                ),
              ),
          if (warningLabels.isNotEmpty) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final label in warningLabels)
                  SettleoraReadinessChip(label: label),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _AvailableEstimateCurrencyCard extends StatelessWidget {
  const _AvailableEstimateCurrencyCard({required this.row});

  final SettleoraManualFinanceSummaryCurrencyRow row;

  @override
  Widget build(BuildContext context) {
    final rowWarnings = row.warnings
        .map(settleoraManualFinanceWarningLabel)
        .toSet()
        .toList(growable: false);

    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: context.settleoraColors.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(row.currency, style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            _SummaryAmountLine(
              label: 'Manual account balance',
              amount: row.activeManualAccountBalanceTotal,
              currency: row.currency,
            ),
            _SummaryAmountLine(
              label: 'Expected one-time income',
              amount: row.expectedManualIncomeTotal,
              currency: row.currency,
            ),
            _SummaryAmountLine(
              label: 'Projected recurring manual income',
              amount: row.recurringExpectedManualIncomeTotal,
              currency: row.currency,
            ),
            _SummaryAmountLine(
              label: 'Upcoming one-time future bills',
              amount: row.upcomingOneTimeFutureBillObligationTotal,
              currency: row.currency,
            ),
            _SummaryAmountLine(
              label: 'Group one-time future bill shares',
              amount: row.groupOneTimeFutureBillObligationTotal,
              currency: row.currency,
            ),
            _SummaryAmountLine(
              label: 'Projected recurring bill obligations',
              amount: row.recurringObligationEstimateTotal,
              currency: row.currency,
            ),
            _SummaryAmountLine(
              label: 'Group recurring bill shares',
              amount: row.groupRecurringObligationEstimateTotal,
              currency: row.currency,
            ),
            _SummaryAmountLine(
              label: 'Estimated available (server manual estimate)',
              amount: row.estimatedAvailableAmount,
              currency: row.currency,
              emphasized: true,
            ),
            if (rowWarnings.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                rowWarnings.join(' - '),
                style: TextStyle(color: context.settleoraColors.textMuted),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _SummaryAmountLine extends StatelessWidget {
  const _SummaryAmountLine({
    required this.label,
    required this.amount,
    required this.currency,
    this.emphasized = false,
  });

  final String label;
  final String amount;
  final String currency;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    final style = emphasized
        ? Theme.of(context).textTheme.titleMedium
        : Theme.of(context).textTheme.bodyMedium;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Expanded(child: Text(label)),
          Text('$amount $currency', style: style),
        ],
      ),
    );
  }
}

class _ManualFinanceNotice extends StatelessWidget {
  const _ManualFinanceNotice({required this.colors});

  final SettleoraColors colors;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      color: colors.infoSoft,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.edit_note_outlined, color: colors.onInfoSoft),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'These are manually entered balances and expected cash-in records. They are not bank sync, payroll sync, statement reconciliation, or available-spend math.',
              style: TextStyle(color: colors.onInfoSoft),
            ),
          ),
        ],
      ),
    );
  }
}

class _ManualFinanceFailureCard extends StatelessWidget {
  const _ManualFinanceFailureCard({
    required this.failure,
    required this.onRetry,
  });

  final SettleoraManualFinanceFailure failure;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(failure.title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 6),
          Text(failure.message),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            key: const Key('manual-finance-retry'),
            onPressed: onRetry,
            icon: const Icon(Icons.refresh),
            label: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}

class _ManualAccountsSection extends StatelessWidget {
  const _ManualAccountsSection({
    required this.accounts,
    required this.onCreate,
    required this.onEdit,
    required this.onArchive,
  });

  final List<SettleoraManualFinancialAccount> accounts;
  final VoidCallback onCreate;
  final ValueChanged<SettleoraManualFinancialAccount> onEdit;
  final ValueChanged<SettleoraManualFinancialAccount> onArchive;

  @override
  Widget build(BuildContext context) {
    final totals = _totalsByCurrency(
      accounts.where((item) => !item.isArchived),
    );

    return _ManualFinanceSection(
      title: 'Manual accounts',
      subtitle: 'Balances you type in yourself.',
      actionKey: const Key('manual-finance-add-account'),
      actionLabel: 'Add account',
      onCreate: onCreate,
      children: [
        if (totals.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text('Manual balance totals: ${_totalsLabel(totals)}'),
          ),
        if (accounts.isEmpty)
          const Text('No manual accounts yet.')
        else
          for (var index = 0; index < accounts.length; index += 1) ...[
            _ManualAccountTile(
              account: accounts[index],
              index: index,
              onEdit: onEdit,
              onArchive: onArchive,
            ),
            if (index < accounts.length - 1) const SizedBox(height: 8),
          ],
      ],
    );
  }
}

class _ManualIncomeSection extends StatelessWidget {
  const _ManualIncomeSection({
    required this.incomeSources,
    required this.accounts,
    required this.onCreate,
    required this.onEdit,
    required this.onArchive,
  });

  final List<SettleoraManualIncomeSource> incomeSources;
  final List<SettleoraManualFinancialAccount> accounts;
  final VoidCallback onCreate;
  final ValueChanged<SettleoraManualIncomeSource> onEdit;
  final ValueChanged<SettleoraManualIncomeSource> onArchive;

  @override
  Widget build(BuildContext context) {
    return _ManualFinanceSection(
      title: 'Expected income',
      subtitle: 'Manual expected cash-in records.',
      actionKey: const Key('manual-finance-add-income'),
      actionLabel: 'Add income',
      onCreate: onCreate,
      children: [
        if (incomeSources.isEmpty)
          const Text('No expected income sources yet.')
        else
          for (var index = 0; index < incomeSources.length; index += 1) ...[
            _ManualIncomeTile(
              income: incomeSources[index],
              linkedAccountName: _linkedAccountName(
                incomeSources[index].manualFinancialAccountId,
                accounts,
              ),
              index: index,
              onEdit: onEdit,
              onArchive: onArchive,
            ),
            if (index < incomeSources.length - 1) const SizedBox(height: 8),
          ],
      ],
    );
  }
}

class _ManualFinanceSection extends StatelessWidget {
  const _ManualFinanceSection({
    required this.title,
    required this.subtitle,
    required this.actionKey,
    required this.actionLabel,
    required this.onCreate,
    required this.children,
  });

  final String title;
  final String subtitle;
  final Key actionKey;
  final String actionLabel;
  final VoidCallback onCreate;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: TextStyle(
                        color: context.settleoraColors.textMuted,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton.filledTonal(
                key: actionKey,
                tooltip: actionLabel,
                onPressed: onCreate,
                icon: const Icon(Icons.add),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    );
  }
}

class _ManualAccountTile extends StatelessWidget {
  const _ManualAccountTile({
    required this.account,
    required this.index,
    required this.onEdit,
    required this.onArchive,
  });

  final SettleoraManualFinancialAccount account;
  final int index;
  final ValueChanged<SettleoraManualFinancialAccount> onEdit;
  final ValueChanged<SettleoraManualFinancialAccount> onArchive;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: context.settleoraColors.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListTile(
        title: Text(account.displayName),
        subtitle: Text(
          '${settleoraManualAccountTypeLabel(account.accountType)} - ${account.status} - As of ${account.balanceAsOfDate}',
        ),
        trailing: Wrap(
          spacing: 4,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text('${account.currentBalanceAmount} ${account.currency}'),
            IconButton(
              key: Key('manual-finance-edit-account-$index'),
              tooltip: 'Edit account',
              onPressed: account.isArchived ? null : () => onEdit(account),
              icon: const Icon(Icons.edit_outlined),
            ),
            IconButton(
              key: Key('manual-finance-archive-account-$index'),
              tooltip: 'Archive account',
              onPressed: account.isArchived ? null : () => onArchive(account),
              icon: const Icon(Icons.archive_outlined),
            ),
          ],
        ),
      ),
    );
  }
}

class _ManualIncomeTile extends StatelessWidget {
  const _ManualIncomeTile({
    required this.income,
    required this.linkedAccountName,
    required this.index,
    required this.onEdit,
    required this.onArchive,
  });

  final SettleoraManualIncomeSource income;
  final String? linkedAccountName;
  final int index;
  final ValueChanged<SettleoraManualIncomeSource> onEdit;
  final ValueChanged<SettleoraManualIncomeSource> onArchive;

  @override
  Widget build(BuildContext context) {
    final linked = linkedAccountName == null ? '' : ' - $linkedAccountName';
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: context.settleoraColors.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListTile(
        title: Text(income.displayName),
        subtitle: Text(
          '${settleoraManualIncomeCadenceLabel(income.cadence)} - Next ${income.nextExpectedDate}$linked',
        ),
        trailing: Wrap(
          spacing: 4,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text('${income.amount} ${income.currency}'),
            IconButton(
              key: Key('manual-finance-edit-income-$index'),
              tooltip: 'Edit income',
              onPressed: income.isArchived ? null : () => onEdit(income),
              icon: const Icon(Icons.edit_outlined),
            ),
            IconButton(
              key: Key('manual-finance-archive-income-$index'),
              tooltip: 'Archive income',
              onPressed: income.isArchived ? null : () => onArchive(income),
              icon: const Icon(Icons.archive_outlined),
            ),
          ],
        ),
      ),
    );
  }
}

class _ManualAccountSheet extends StatefulWidget {
  const _ManualAccountSheet({
    required this.repository,
    required this.account,
    required this.defaultCurrency,
  });

  final SettleoraManualFinanceRepository repository;
  final SettleoraManualFinancialAccount? account;
  final String? defaultCurrency;

  @override
  State<_ManualAccountSheet> createState() => _ManualAccountSheetState();
}

class _ManualAccountSheetState extends State<_ManualAccountSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameController;
  late final TextEditingController _amountController;
  late final TextEditingController _dateController;
  late final TextEditingController _noteController;
  late String _type;
  late String _currency;
  bool _isSaving = false;
  String? _failure;

  @override
  void initState() {
    super.initState();
    final account = widget.account;
    _nameController = TextEditingController(text: account?.displayName ?? '');
    _amountController = TextEditingController(
      text: account?.currentBalanceAmount ?? '',
    );
    _dateController = TextEditingController(
      text: account?.balanceAsOfDate ?? _todayIsoDate(),
    );
    _noteController = TextEditingController(text: account?.note ?? '');
    _type =
        account?.accountType ?? SettleoraManualFinancialAccountTypeValues.cash;
    _currency = account?.currency ?? widget.defaultCurrency ?? 'HKD';
  }

  @override
  void dispose() {
    _nameController.dispose();
    _amountController.dispose();
    _dateController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() {
      _isSaving = true;
      _failure = null;
    });

    final draft = SettleoraManualFinancialAccountDraft(
      displayName: _nameController.text,
      accountType: _type,
      currentBalanceAmount: _amountController.text,
      currency: _currency,
      balanceAsOfDate: _dateController.text,
      note: _noteController.text,
    );

    try {
      final account = widget.account;
      if (account == null) {
        await widget.repository.createAccount(draft);
      } else {
        await widget.repository.updateAccount(
          accountId: account.id,
          draft: draft,
        );
      }
      if (mounted) {
        Navigator.of(context).pop(true);
      }
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _failure = SettleoraManualFinanceFailure.from(error).message;
        _isSaving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return _FormSheetScaffold(
      title: widget.account == null
          ? 'Add manual account'
          : 'Edit manual account',
      failure: _failure,
      isSaving: _isSaving,
      saveKey: const Key('manual-finance-save-account'),
      onSave: _save,
      child: Form(
        key: _formKey,
        child: Column(
          children: [
            TextFormField(
              key: const Key('manual-account-name'),
              controller: _nameController,
              decoration: const InputDecoration(
                labelText: 'Name',
                border: OutlineInputBorder(),
              ),
              validator: _required,
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              key: const Key('manual-account-type'),
              initialValue: _type,
              decoration: const InputDecoration(
                labelText: 'Type',
                border: OutlineInputBorder(),
              ),
              items: [
                for (final type
                    in SettleoraManualFinancialAccountTypeValues.values)
                  DropdownMenuItem(
                    value: type,
                    child: Text(settleoraManualAccountTypeLabel(type)),
                  ),
              ],
              onChanged: _isSaving
                  ? null
                  : (value) => setState(() => _type = value ?? _type),
            ),
            const SizedBox(height: 10),
            MoneyInput(
              amountKey: const Key('manual-account-balance'),
              currencyKey: const Key('manual-account-currency'),
              amountController: _amountController,
              currencyValue: _currency,
              onCurrencyChanged: (value) =>
                  setState(() => _currency = value ?? _currency),
              amountLabel: 'Current manual balance',
              currencyLabel: 'Balance currency',
              allowSignedAmount: true,
              enabled: !_isSaving,
              amountValidator: _required,
            ),
            const SizedBox(height: 10),
            DateField(
              key: const Key('manual-account-as-of'),
              controller: _dateController,
              label: 'As-of date',
              enabled: !_isSaving,
              validator: _required,
            ),
            const SizedBox(height: 10),
            TextFormField(
              key: const Key('manual-account-note'),
              controller: _noteController,
              decoration: const InputDecoration(
                labelText: 'Note',
                border: OutlineInputBorder(),
              ),
              maxLines: 2,
            ),
          ],
        ),
      ),
    );
  }
}

class _ManualIncomeSheet extends StatefulWidget {
  const _ManualIncomeSheet({
    required this.repository,
    required this.income,
    required this.accounts,
    required this.defaultCurrency,
  });

  final SettleoraManualFinanceRepository repository;
  final SettleoraManualIncomeSource? income;
  final List<SettleoraManualFinancialAccount> accounts;
  final String? defaultCurrency;

  @override
  State<_ManualIncomeSheet> createState() => _ManualIncomeSheetState();
}

class _ManualIncomeSheetState extends State<_ManualIncomeSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameController;
  late final TextEditingController _amountController;
  late final TextEditingController _nextDateController;
  late final TextEditingController _endDateController;
  late final TextEditingController _noteController;
  late String _currency;
  late String _cadence;
  String? _accountId;
  bool _isSaving = false;
  String? _failure;

  @override
  void initState() {
    super.initState();
    final income = widget.income;
    _nameController = TextEditingController(text: income?.displayName ?? '');
    _amountController = TextEditingController(text: income?.amount ?? '');
    _nextDateController = TextEditingController(
      text: income?.nextExpectedDate ?? _todayIsoDate(),
    );
    _endDateController = TextEditingController(text: income?.endDate ?? '');
    _noteController = TextEditingController(text: income?.note ?? '');
    _currency = income?.currency ?? widget.defaultCurrency ?? 'HKD';
    _cadence = income?.cadence ?? SettleoraManualIncomeCadenceValues.monthly;
    _accountId = income?.manualFinancialAccountId;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _amountController.dispose();
    _nextDateController.dispose();
    _endDateController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() {
      _isSaving = true;
      _failure = null;
    });

    final draft = SettleoraManualIncomeSourceDraft(
      displayName: _nameController.text,
      amount: _amountController.text,
      currency: _currency,
      cadence: _cadence,
      nextExpectedDate: _nextDateController.text,
      endDate: _endDateController.text,
      manualFinancialAccountId: _accountId,
      note: _noteController.text,
    );

    try {
      final income = widget.income;
      if (income == null) {
        await widget.repository.createIncomeSource(draft);
      } else {
        await widget.repository.updateIncomeSource(
          incomeSourceId: income.id,
          draft: draft,
        );
      }
      if (mounted) {
        Navigator.of(context).pop(true);
      }
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _failure = SettleoraManualFinanceFailure.from(error).message;
        _isSaving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return _FormSheetScaffold(
      title: widget.income == null ? 'Add income source' : 'Edit income source',
      failure: _failure,
      isSaving: _isSaving,
      saveKey: const Key('manual-finance-save-income'),
      onSave: _save,
      child: Form(
        key: _formKey,
        child: Column(
          children: [
            TextFormField(
              key: const Key('manual-income-name'),
              controller: _nameController,
              decoration: const InputDecoration(
                labelText: 'Name',
                border: OutlineInputBorder(),
              ),
              validator: _required,
            ),
            const SizedBox(height: 10),
            MoneyInput(
              amountKey: const Key('manual-income-amount'),
              currencyKey: const Key('manual-income-currency'),
              amountController: _amountController,
              currencyValue: _currency,
              onCurrencyChanged: (value) =>
                  setState(() => _currency = value ?? _currency),
              amountLabel: 'Expected amount',
              currencyLabel: 'Income currency',
              enabled: !_isSaving,
              amountValidator: _required,
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              key: const Key('manual-income-cadence'),
              initialValue: _cadence,
              decoration: const InputDecoration(
                labelText: 'Cadence',
                border: OutlineInputBorder(),
              ),
              items: [
                for (final cadence in SettleoraManualIncomeCadenceValues.values)
                  DropdownMenuItem(
                    value: cadence,
                    child: Text(settleoraManualIncomeCadenceLabel(cadence)),
                  ),
              ],
              onChanged: _isSaving
                  ? null
                  : (value) => setState(() => _cadence = value ?? _cadence),
            ),
            const SizedBox(height: 10),
            DateField(
              key: const Key('manual-income-next-date'),
              controller: _nextDateController,
              label: 'Next expected date',
              enabled: !_isSaving,
              validator: _required,
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String?>(
              key: const Key('manual-income-linked-account'),
              initialValue: _accountId,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'Linked manual account',
                border: OutlineInputBorder(),
              ),
              items: [
                const DropdownMenuItem<String?>(
                  value: null,
                  child: Text('No linked manual account'),
                ),
                for (final account in widget.accounts)
                  DropdownMenuItem<String?>(
                    value: account.id,
                    child: Text(account.displayName),
                  ),
              ],
              onChanged: _isSaving
                  ? null
                  : (value) => setState(() => _accountId = value),
            ),
            const SizedBox(height: 10),
            DateField(
              key: const Key('manual-income-end-date'),
              controller: _endDateController,
              label: 'End date',
              enabled: !_isSaving,
              helperText:
                  'Optional. Choose a date when this income should stop.',
            ),
            const SizedBox(height: 10),
            TextFormField(
              key: const Key('manual-income-note'),
              controller: _noteController,
              decoration: const InputDecoration(
                labelText: 'Note',
                border: OutlineInputBorder(),
              ),
              maxLines: 2,
            ),
          ],
        ),
      ),
    );
  }
}

class _FormSheetScaffold extends StatelessWidget {
  const _FormSheetScaffold({
    required this.title,
    required this.failure,
    required this.isSaving,
    required this.saveKey,
    required this.onSave,
    required this.child,
  });

  final String title;
  final String? failure;
  final bool isSaving;
  final Key saveKey;
  final VoidCallback onSave;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          16,
          0,
          16,
          16 + MediaQuery.of(context).viewInsets.bottom,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            const Text(
              'Manual records are typed by you and are not provider-synced.',
            ),
            if (failure != null) ...[
              const SizedBox(height: 10),
              Text(
                failure!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            const SizedBox(height: 14),
            child,
            const SizedBox(height: 14),
            FilledButton.icon(
              key: saveKey,
              onPressed: isSaving ? null : onSave,
              icon: isSaving
                  ? const SizedBox.square(
                      dimension: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.save_outlined),
              label: Text(isSaving ? 'Saving' : 'Save'),
            ),
          ],
        ),
      ),
    );
  }
}

Map<String, double> _totalsByCurrency(
  Iterable<SettleoraManualFinancialAccount> accounts,
) {
  final totals = <String, double>{};
  for (final account in accounts) {
    final amount = double.tryParse(account.currentBalanceAmount);
    if (amount == null) {
      continue;
    }
    totals.update(
      account.currency,
      (value) => value + amount,
      ifAbsent: () => amount,
    );
  }
  return totals;
}

String _totalsLabel(Map<String, double> totals) {
  return totals.entries
      .map((entry) => '${entry.value.toStringAsFixed(2)} ${entry.key}')
      .join(', ');
}

String? _linkedAccountName(
  String? accountId,
  List<SettleoraManualFinancialAccount> accounts,
) {
  if (accountId == null) {
    return null;
  }

  for (final account in accounts) {
    if (account.id == accountId) {
      return account.displayName;
    }
  }
  return null;
}

String _todayIsoDate() {
  return _isoDate(DateTime.now().toUtc());
}

String _isoDate(DateTime value) {
  final utc = value.toUtc();
  return '${utc.year.toString().padLeft(4, '0')}-${utc.month.toString().padLeft(2, '0')}-${utc.day.toString().padLeft(2, '0')}';
}

String? _required(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return 'Required';
  }
  return null;
}
