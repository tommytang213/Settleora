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
  final _searchController = TextEditingController();
  late String _month;
  String _searchQuery = '';
  _MonthlyReportDiscoveryFilter _discoveryFilter =
      _MonthlyReportDiscoveryFilter.all;
  bool _isLoading = true;
  SettleoraMonthlyReport? _report;
  SettleoraMonthlyReportFailure? _failure;

  @override
  void initState() {
    super.initState();
    _searchController.addListener(_handleSearchChanged);
    _month = _initialMonth();
    Future<void>.microtask(_load);
  }

  @override
  void dispose() {
    _searchController.removeListener(_handleSearchChanged);
    _searchController.dispose();
    super.dispose();
  }

  void _handleSearchChanged() {
    final query = _searchController.text.trim();
    if (query == _searchQuery) {
      return;
    }

    setState(() {
      _searchQuery = query;
    });
  }

  void _selectDiscoveryFilter(_MonthlyReportDiscoveryFilter filter) {
    if (filter == _discoveryFilter) {
      return;
    }

    setState(() {
      _discoveryFilter = filter;
    });
  }

  void _clearDiscovery() {
    if (!_hasActiveDiscovery) {
      return;
    }

    setState(() {
      _discoveryFilter = _MonthlyReportDiscoveryFilter.all;
      _searchQuery = '';
      _searchController.clear();
    });
  }

  bool get _hasActiveDiscovery {
    return _searchQuery.isNotEmpty ||
        _discoveryFilter != _MonthlyReportDiscoveryFilter.all;
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

    await onSessionEnded(failure.userMessage);
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

            final discovery = _MonthlyReportDiscoveryState.from(
              report: report,
              searchQuery: _searchQuery,
              filter: _discoveryFilter,
            );

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
                  if (report.hasReportActivity) ...[
                    const SizedBox(height: 14),
                    if (_hasActiveDiscovery) ...[
                      _FilteredSummaryPanel(discovery: discovery),
                      const SizedBox(height: 10),
                    ],
                    _DiscoveryPanel(
                      searchController: _searchController,
                      selectedFilter: _discoveryFilter,
                      counts: _MonthlyReportDiscoveryFilterCounts.from(report),
                      hasActiveDiscovery: _hasActiveDiscovery,
                      onFilterSelected: _selectDiscoveryFilter,
                      onClear: _clearDiscovery,
                    ),
                  ],
                  if (discovery.isFilteredEmpty) ...[
                    const SizedBox(height: 14),
                    const _FilteredEmptyPanel(),
                  ],
                  const SizedBox(height: 18),
                  _CurrencySection(
                    title: 'Total by currency',
                    emptyLabel: 'No totals',
                    rows: discovery.totalByCurrency,
                    keyPrefix: 'monthly-report-total',
                  ),
                  const SizedBox(height: 18),
                  _CurrencySection(
                    title: 'Your share by currency',
                    emptyLabel: 'No share totals',
                    rows: discovery.actorShareByCurrency,
                    keyPrefix: 'monthly-report-actor-share',
                  ),
                  const SizedBox(height: 18),
                  _CurrencySection(
                    title: 'You paid by currency',
                    emptyLabel: 'No paid totals',
                    rows: discovery.actorPaidByCurrency,
                    keyPrefix: 'monthly-report-actor-paid',
                  ),
                  const SizedBox(height: 18),
                  _StatusSection(
                    title: 'Reconciliation',
                    rows: discovery.reconciliationCounts,
                    keyPrefix: 'monthly-report-reconciliation',
                    labelBuilder: settleoraReportReconciliationStatusLabel,
                  ),
                  const SizedBox(height: 18),
                  _StatusSection(
                    title: 'Settlement requests',
                    rows: discovery.settlementRequestCounts,
                    keyPrefix: 'monthly-report-settlement-request',
                    labelBuilder: settleoraReportSettlementRequestStatusLabel,
                  ),
                  const SizedBox(height: 18),
                  _StatusSection(
                    title: 'Settlement payments',
                    rows: discovery.settlementPaymentCounts,
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
            const SizedBox(height: 8),
            Text(
              'Server monthly aggregate. Search and filters only hide loaded rows on this device.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

enum _MonthlyReportDiscoveryFilter {
  all(label: 'All'),
  currency(label: 'Currency totals'),
  reconciliation(label: 'Reconciliation'),
  settlementRequests(label: 'Requests'),
  settlementPayments(label: 'Payments');

  const _MonthlyReportDiscoveryFilter({required this.label});

  final String label;

  String get keySuffix {
    return switch (this) {
      _MonthlyReportDiscoveryFilter.all => 'all',
      _MonthlyReportDiscoveryFilter.currency => 'currency',
      _MonthlyReportDiscoveryFilter.reconciliation => 'reconciliation',
      _MonthlyReportDiscoveryFilter.settlementRequests => 'requests',
      _MonthlyReportDiscoveryFilter.settlementPayments => 'payments',
    };
  }
}

class _MonthlyReportDiscoveryFilterCounts {
  const _MonthlyReportDiscoveryFilterCounts(this._counts);

  factory _MonthlyReportDiscoveryFilterCounts.from(
    SettleoraMonthlyReport report,
  ) {
    final currencyCount =
        report.totalByCurrency.length +
        report.actorShareByCurrency.length +
        report.actorPaidByCurrency.length;
    return _MonthlyReportDiscoveryFilterCounts({
      _MonthlyReportDiscoveryFilter.all:
          currencyCount +
          report.reconciliationCounts.length +
          report.settlementRequestCounts.length +
          report.settlementPaymentCounts.length,
      _MonthlyReportDiscoveryFilter.currency: currencyCount,
      _MonthlyReportDiscoveryFilter.reconciliation:
          report.reconciliationCounts.length,
      _MonthlyReportDiscoveryFilter.settlementRequests:
          report.settlementRequestCounts.length,
      _MonthlyReportDiscoveryFilter.settlementPayments:
          report.settlementPaymentCounts.length,
    });
  }

  final Map<_MonthlyReportDiscoveryFilter, int> _counts;

  int count(_MonthlyReportDiscoveryFilter filter) => _counts[filter] ?? 0;
}

class _MonthlyReportDiscoveryState {
  const _MonthlyReportDiscoveryState({
    required this.totalByCurrency,
    required this.actorShareByCurrency,
    required this.actorPaidByCurrency,
    required this.reconciliationCounts,
    required this.settlementRequestCounts,
    required this.settlementPaymentCounts,
    required this.hasActiveDiscovery,
  });

  factory _MonthlyReportDiscoveryState.from({
    required SettleoraMonthlyReport report,
    required String searchQuery,
    required _MonthlyReportDiscoveryFilter filter,
  }) {
    final query = _normalizeDiscoveryText(searchQuery);
    final hasSearch = query.isNotEmpty;
    final hasActiveDiscovery =
        hasSearch || filter != _MonthlyReportDiscoveryFilter.all;

    List<SettleoraMonthlyReportCurrencyTotal> currencyRows(
      List<SettleoraMonthlyReportCurrencyTotal> rows,
      String section,
    ) {
      if (filter != _MonthlyReportDiscoveryFilter.all &&
          filter != _MonthlyReportDiscoveryFilter.currency) {
        return const [];
      }

      if (!hasSearch) {
        return rows;
      }

      return rows
          .where((row) {
            return _normalizeDiscoveryText(
              '$section ${row.currency} ${row.amount}',
            ).contains(query);
          })
          .toList(growable: false);
    }

    List<SettleoraMonthlyReportStatusCount> statusRows(
      List<SettleoraMonthlyReportStatusCount> rows, {
      required _MonthlyReportDiscoveryFilter sectionFilter,
      required String section,
      required String Function(String status) labelBuilder,
    }) {
      if (filter != _MonthlyReportDiscoveryFilter.all &&
          filter != sectionFilter) {
        return const [];
      }

      if (!hasSearch) {
        return rows;
      }

      return rows
          .where((row) {
            final label = labelBuilder(row.status);
            return _normalizeDiscoveryText(
              '$section $label ${row.status} ${row.count}',
            ).contains(query);
          })
          .toList(growable: false);
    }

    return _MonthlyReportDiscoveryState(
      totalByCurrency: currencyRows(report.totalByCurrency, 'total currency'),
      actorShareByCurrency: currencyRows(
        report.actorShareByCurrency,
        'your share currency',
      ),
      actorPaidByCurrency: currencyRows(
        report.actorPaidByCurrency,
        'you paid currency',
      ),
      reconciliationCounts: statusRows(
        report.reconciliationCounts,
        sectionFilter: _MonthlyReportDiscoveryFilter.reconciliation,
        section: 'reconciliation',
        labelBuilder: settleoraReportReconciliationStatusLabel,
      ),
      settlementRequestCounts: statusRows(
        report.settlementRequestCounts,
        sectionFilter: _MonthlyReportDiscoveryFilter.settlementRequests,
        section: 'settlement requests',
        labelBuilder: settleoraReportSettlementRequestStatusLabel,
      ),
      settlementPaymentCounts: statusRows(
        report.settlementPaymentCounts,
        sectionFilter: _MonthlyReportDiscoveryFilter.settlementPayments,
        section: 'settlement payments',
        labelBuilder: settleoraReportSettlementPaymentStatusLabel,
      ),
      hasActiveDiscovery: hasActiveDiscovery,
    );
  }

  final List<SettleoraMonthlyReportCurrencyTotal> totalByCurrency;
  final List<SettleoraMonthlyReportCurrencyTotal> actorShareByCurrency;
  final List<SettleoraMonthlyReportCurrencyTotal> actorPaidByCurrency;
  final List<SettleoraMonthlyReportStatusCount> reconciliationCounts;
  final List<SettleoraMonthlyReportStatusCount> settlementRequestCounts;
  final List<SettleoraMonthlyReportStatusCount> settlementPaymentCounts;
  final bool hasActiveDiscovery;

  int get visibleRowCount {
    return totalByCurrency.length +
        actorShareByCurrency.length +
        actorPaidByCurrency.length +
        reconciliationCounts.length +
        settlementRequestCounts.length +
        settlementPaymentCounts.length;
  }

  bool get isFilteredEmpty => hasActiveDiscovery && visibleRowCount == 0;
}

class _DiscoveryPanel extends StatelessWidget {
  const _DiscoveryPanel({
    required this.searchController,
    required this.selectedFilter,
    required this.counts,
    required this.hasActiveDiscovery,
    required this.onFilterSelected,
    required this.onClear,
  });

  final TextEditingController searchController;
  final _MonthlyReportDiscoveryFilter selectedFilter;
  final _MonthlyReportDiscoveryFilterCounts counts;
  final bool hasActiveDiscovery;
  final ValueChanged<_MonthlyReportDiscoveryFilter> onFilterSelected;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return _Section(
      title: 'Find report details',
      children: [
        TextField(
          key: const Key('monthly-report-search'),
          controller: searchController,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            labelText: 'Search report',
            prefixIcon: const Icon(Icons.search),
            border: const OutlineInputBorder(),
            suffixIcon: searchController.text.isEmpty
                ? null
                : IconButton(
                    key: const Key('monthly-report-clear-search'),
                    tooltip: 'Clear search',
                    onPressed: searchController.clear,
                    icon: const Icon(Icons.clear),
                  ),
          ),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 6,
          children: [
            for (final filter in _MonthlyReportDiscoveryFilter.values)
              FilterChip(
                key: ValueKey('monthly-report-filter-${filter.keySuffix}'),
                selected: selectedFilter == filter,
                onSelected: (_) => onFilterSelected(filter),
                label: Text('${filter.label} (${counts.count(filter)})'),
              ),
          ],
        ),
        if (hasActiveDiscovery) ...[
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              key: const Key('monthly-report-clear-discovery'),
              onPressed: onClear,
              icon: const Icon(Icons.restart_alt),
              label: const Text('Clear filters'),
            ),
          ),
        ],
      ],
    );
  }
}

class _FilteredSummaryPanel extends StatelessWidget {
  const _FilteredSummaryPanel({required this.discovery});

  final _MonthlyReportDiscoveryState discovery;

  @override
  Widget build(BuildContext context) {
    return _StatePanel(
      icon: Icons.filter_alt_outlined,
      title: '${discovery.visibleRowCount} matching report rows',
      message:
          'Local discovery only changes visible loaded rows. Totals and bill count remain the server-returned monthly summary.',
      compact: true,
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
            message:
                'No server-returned currency buckets are visible for this month.',
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
            message:
                'No server-returned status counts are visible for this month.',
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
      message: failure.userMessage,
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
      message:
          'The server returned no bills, currency totals, or settlement status activity for this month.',
      compact: true,
    );
  }
}

class _FilteredEmptyPanel extends StatelessWidget {
  const _FilteredEmptyPanel();

  @override
  Widget build(BuildContext context) {
    return const _StatePanel(
      icon: Icons.search_off_outlined,
      title: 'No matching report rows',
      message:
          'Clear local search or filters to show the loaded server report rows.',
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

  return 'Personal report';
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

String _normalizeDiscoveryText(String value) {
  return value.trim().toLowerCase();
}
