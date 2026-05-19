import 'package:flutter/material.dart';

import 'report_repository.dart';

class SettleoraMonthlyReportScreen extends StatefulWidget {
  const SettleoraMonthlyReportScreen({
    super.key,
    required this.repository,
    this.initialMonth,
    this.groupId,
    this.groupLabel,
    this.onSessionEnded,
    this.now,
  });

  final SettleoraMonthlyReportRepository repository;
  final String? initialMonth;
  final String? groupId;
  final String? groupLabel;
  final Future<void> Function(String? noticeMessage)? onSessionEnded;
  final DateTime Function()? now;

  @override
  State<SettleoraMonthlyReportScreen> createState() =>
      _SettleoraMonthlyReportScreenState();
}

class _SettleoraMonthlyReportScreenState
    extends State<SettleoraMonthlyReportScreen> {
  late String _month;
  bool _isLoading = true;
  SettleoraMonthlyReport? _report;
  SettleoraMonthlyReportFailure? _failure;

  @override
  void initState() {
    super.initState();
    _month = _initialMonth();
    Future<void>.microtask(_load);
  }

  String _initialMonth() {
    final initialMonth = widget.initialMonth;
    if (initialMonth != null) {
      try {
        return normalizeSettleoraReportMonth(initialMonth);
      } on SettleoraMonthlyReportFailure {
        // Fall back to the current month; repository validation still protects
        // explicit load requests.
      }
    }

    return _formatMonth((widget.now ?? DateTime.now)());
  }

  Future<void> _load({bool showBlockingLoading = true}) async {
    setState(() {
      if (showBlockingLoading) {
        _isLoading = true;
      }
      _failure = null;
    });

    try {
      final report = await widget.repository.getMonthlyReport(
        month: _month,
        groupId: widget.groupId,
      );
      if (!mounted) {
        return;
      }

      setState(() {
        _report = report;
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _failure = SettleoraMonthlyReportFailure.from(error);
        _report = null;
        _isLoading = false;
      });
    }
  }

  Future<void> _changeMonth(int offset) async {
    setState(() {
      _month = _addMonths(_month, offset);
    });
    await _load();
  }

  Future<void> _endSession(SettleoraMonthlyReportFailure failure) async {
    final onSessionEnded = widget.onSessionEnded;
    if (onSessionEnded == null) {
      return;
    }

    if (mounted && Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    }

    await onSessionEnded(failure.message);
  }

  @override
  Widget build(BuildContext context) {
    final failure = _failure;
    final report = _report;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Monthly report'),
        actions: [
          IconButton(
            key: const Key('monthly-report-refresh'),
            tooltip: 'Refresh',
            onPressed: _isLoading ? null : () => _load(),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: Builder(
          builder: (context) {
            if (_isLoading) {
              return const _LoadingPanel();
            }

            if (failure != null) {
              return _FailurePanel(
                failure: failure,
                onRetry: _load,
                onSessionEnded: widget.onSessionEnded == null
                    ? null
                    : () => _endSession(failure),
              );
            }

            if (report == null) {
              return _FailurePanel(
                failure: const SettleoraMonthlyReportFailure(
                  kind: SettleoraMonthlyReportFailureKind.unavailable,
                  message: 'The monthly report is no longer available.',
                ),
                onRetry: _load,
              );
            }

            return RefreshIndicator(
              onRefresh: () => _load(showBlockingLoading: false),
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                children: [
                  _MonthNavigation(
                    month: _month,
                    onPrevious: () => _changeMonth(-1),
                    onNext: () => _changeMonth(1),
                  ),
                  const SizedBox(height: 12),
                  _SummaryPanel(
                    report: report,
                    groupLabel: _scopeLabel(
                      groupId: widget.groupId,
                      groupLabel: widget.groupLabel,
                    ),
                  ),
                  if (!report.hasReportActivity) ...[
                    const SizedBox(height: 14),
                    const _ZeroStatePanel(),
                  ],
                  const SizedBox(height: 18),
                  _CurrencySection(
                    title: 'Total by currency',
                    emptyLabel: 'No totals',
                    rows: report.totalByCurrency,
                    keyPrefix: 'monthly-report-total',
                  ),
                  const SizedBox(height: 18),
                  _CurrencySection(
                    title: 'Your share by currency',
                    emptyLabel: 'No share totals',
                    rows: report.actorShareByCurrency,
                    keyPrefix: 'monthly-report-actor-share',
                  ),
                  const SizedBox(height: 18),
                  _CurrencySection(
                    title: 'You paid by currency',
                    emptyLabel: 'No paid totals',
                    rows: report.actorPaidByCurrency,
                    keyPrefix: 'monthly-report-actor-paid',
                  ),
                  const SizedBox(height: 18),
                  _StatusSection(
                    title: 'Reconciliation',
                    rows: report.reconciliationCounts,
                    keyPrefix: 'monthly-report-reconciliation',
                    labelBuilder: settleoraReportReconciliationStatusLabel,
                  ),
                  const SizedBox(height: 18),
                  _StatusSection(
                    title: 'Settlement requests',
                    rows: report.settlementRequestCounts,
                    keyPrefix: 'monthly-report-settlement-request',
                    labelBuilder: settleoraReportSettlementRequestStatusLabel,
                  ),
                  const SizedBox(height: 18),
                  _StatusSection(
                    title: 'Settlement payments',
                    rows: report.settlementPaymentCounts,
                    keyPrefix: 'monthly-report-settlement-payment',
                    labelBuilder: settleoraReportSettlementPaymentStatusLabel,
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _MonthNavigation extends StatelessWidget {
  const _MonthNavigation({
    required this.month,
    required this.onPrevious,
    required this.onNext,
  });

  final String month;
  final VoidCallback onPrevious;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        OutlinedButton.icon(
          key: const Key('monthly-report-previous-month'),
          onPressed: onPrevious,
          icon: const Icon(Icons.chevron_left),
          label: const Text('Previous'),
        ),
        Expanded(
          child: Text(
            month,
            key: const Key('monthly-report-current-month'),
            style: Theme.of(context).textTheme.titleMedium,
            textAlign: TextAlign.center,
          ),
        ),
        OutlinedButton.icon(
          key: const Key('monthly-report-next-month'),
          onPressed: onNext,
          icon: const Icon(Icons.chevron_right),
          label: const Text('Next'),
        ),
      ],
    );
  }
}

class _SummaryPanel extends StatelessWidget {
  const _SummaryPanel({required this.report, required this.groupLabel});

  final SettleoraMonthlyReport report;
  final String groupLabel;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      key: const Key('monthly-report-summary'),
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const CircleAvatar(child: Icon(Icons.summarize_outlined)),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    report.month,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _KeyValueText(label: 'Scope', value: groupLabel),
            _KeyValueText(
              label: 'Generated',
              value: _formatTimestamp(report.generatedAtUtc),
            ),
            _KeyValueText(label: 'Bills', value: '${report.billCount}'),
          ],
        ),
      ),
    );
  }
}

class _CurrencySection extends StatelessWidget {
  const _CurrencySection({
    required this.title,
    required this.emptyLabel,
    required this.rows,
    required this.keyPrefix,
  });

  final String title;
  final String emptyLabel;
  final List<SettleoraMonthlyReportCurrencyTotal> rows;
  final String keyPrefix;

  @override
  Widget build(BuildContext context) {
    return _Section(
      title: title,
      children: [
        if (rows.isEmpty)
          _StatePanel(
            icon: Icons.account_balance_wallet_outlined,
            title: emptyLabel,
            message: 'No currency buckets are visible for this month.',
            compact: true,
          )
        else
          for (var index = 0; index < rows.length; index += 1)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _CurrencyRow(
                key: ValueKey('$keyPrefix-$index'),
                row: rows[index],
              ),
            ),
      ],
    );
  }
}

class _CurrencyRow extends StatelessWidget {
  const _CurrencyRow({super.key, required this.row});

  final SettleoraMonthlyReportCurrencyTotal row;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                row.currency,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 12),
            Flexible(
              child: Text(
                '${row.amount} ${row.currency}',
                textAlign: TextAlign.end,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusSection extends StatelessWidget {
  const _StatusSection({
    required this.title,
    required this.rows,
    required this.keyPrefix,
    required this.labelBuilder,
  });

  final String title;
  final List<SettleoraMonthlyReportStatusCount> rows;
  final String keyPrefix;
  final String Function(String status) labelBuilder;

  @override
  Widget build(BuildContext context) {
    return _Section(
      title: title,
      children: [
        if (rows.isEmpty)
          const _StatePanel(
            icon: Icons.format_list_bulleted_outlined,
            title: 'No status counts',
            message: 'No status counts are visible for this month.',
            compact: true,
          )
        else
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              for (var index = 0; index < rows.length; index += 1)
                _StatusChip(
                  key: ValueKey('$keyPrefix-$index'),
                  label: labelBuilder(rows[index].status),
                  count: rows[index].count,
                ),
            ],
          ),
      ],
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({super.key, required this.label, required this.count});

  final String label;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Chip(
      visualDensity: VisualDensity.compact,
      backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
      avatar: const Icon(Icons.checklist_outlined, size: 16),
      label: Text('$label: $count'),
    );
  }
}

class _FailurePanel extends StatelessWidget {
  const _FailurePanel({
    required this.failure,
    required this.onRetry,
    this.onSessionEnded,
  });

  final SettleoraMonthlyReportFailure failure;
  final VoidCallback onRetry;
  final VoidCallback? onSessionEnded;

  @override
  Widget build(BuildContext context) {
    final requiresSignIn =
        failure.kind == SettleoraMonthlyReportFailureKind.sessionRequired ||
        failure.kind == SettleoraMonthlyReportFailureKind.sessionExpired;

    return _StatePanel(
      icon: _failureIcon(failure.kind),
      title: failure.title,
      message: failure.message,
      action: requiresSignIn && onSessionEnded != null
          ? FilledButton.icon(
              key: const Key('monthly-report-sign-in-required'),
              onPressed: onSessionEnded,
              icon: const Icon(Icons.login_outlined),
              label: const Text('Sign In'),
            )
          : OutlinedButton.icon(
              key: const Key('monthly-report-retry'),
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
    );
  }
}

class _ZeroStatePanel extends StatelessWidget {
  const _ZeroStatePanel();

  @override
  Widget build(BuildContext context) {
    return const _StatePanel(
      icon: Icons.calendar_month_outlined,
      title: 'No monthly report activity',
      message: 'No visible bills or settlement activity are in this month.',
      compact: true,
    );
  }
}

class _LoadingPanel extends StatelessWidget {
  const _LoadingPanel();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircularProgressIndicator(),
          SizedBox(height: 14),
          Text('Loading monthly report'),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        ...children,
      ],
    );
  }
}

class _KeyValueText extends StatelessWidget {
  const _KeyValueText({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 104,
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(child: Text(value, textAlign: TextAlign.end)),
        ],
      ),
    );
  }
}

class _StatePanel extends StatelessWidget {
  const _StatePanel({
    required this.icon,
    required this.title,
    required this.message,
    this.action,
    this.compact = false,
  });

  final IconData icon;
  final String title;
  final String message;
  final Widget? action;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final content = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          icon,
          size: compact ? 28 : 42,
          color: Theme.of(context).colorScheme.primary,
        ),
        SizedBox(height: compact ? 8 : 14),
        Text(
          title,
          style: compact
              ? Theme.of(context).textTheme.titleMedium
              : Theme.of(context).textTheme.titleLarge,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 6),
        Text(message, textAlign: TextAlign.center),
        if (action != null) ...[const SizedBox(height: 14), action!],
      ],
    );

    if (compact) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: content,
      );
    }

    return Center(
      child: Padding(padding: const EdgeInsets.all(24), child: content),
    );
  }
}

IconData _failureIcon(SettleoraMonthlyReportFailureKind kind) {
  return switch (kind) {
    SettleoraMonthlyReportFailureKind.sessionRequired => Icons.lock_outline,
    SettleoraMonthlyReportFailureKind.sessionExpired => Icons.lock_outline,
    SettleoraMonthlyReportFailureKind.denied => Icons.no_accounts_outlined,
    SettleoraMonthlyReportFailureKind.unavailable =>
      Icons.visibility_off_outlined,
    SettleoraMonthlyReportFailureKind.validation =>
      Icons.report_problem_outlined,
    SettleoraMonthlyReportFailureKind.network => Icons.cloud_off_outlined,
    SettleoraMonthlyReportFailureKind.server => Icons.error_outline,
  };
}

String _scopeLabel({required String? groupId, required String? groupLabel}) {
  final label = groupLabel?.trim();
  if (label != null && label.isNotEmpty) {
    return label;
  }

  final id = groupId?.trim();
  if (id != null && id.isNotEmpty) {
    return 'Group report';
  }

  return 'Personal';
}

String _formatMonth(DateTime value) {
  final month = value.month.toString().padLeft(2, '0');
  return '${value.year}-$month';
}

String _addMonths(String month, int offset) {
  final parts = normalizeSettleoraReportMonth(month).split('-');
  final year = int.parse(parts[0]);
  final monthNumber = int.parse(parts[1]);
  return _formatMonth(DateTime(year, monthNumber + offset));
}

String _formatTimestamp(DateTime value) {
  return value.toLocal().toString().split('.').first;
}
