import 'package:flutter/material.dart';

import '../ui/settleora_components.dart';
import '../ui/settleora_form_fields.dart';
import 'settlement_repository.dart';

class SettleoraSettlementListScreen extends StatefulWidget {
  const SettleoraSettlementListScreen({
    super.key,
    required this.repository,
    required this.currentUserProfileId,
    this.openNeedsActionOnStart = false,
  });

  final SettleoraSettlementRepository repository;
  final String currentUserProfileId;
  final bool openNeedsActionOnStart;

  @override
  State<SettleoraSettlementListScreen> createState() =>
      _SettleoraSettlementListScreenState();
}

class _SettleoraSettlementListScreenState
    extends State<SettleoraSettlementListScreen> {
  late final TextEditingController _searchController;
  bool _isLoading = true;
  SettleoraSettlementBalanceSnapshot? _balanceSnapshot;
  List<SettleoraSettlementRequest> _requests = const [];
  late _SettlementRequestFilter _filter;
  String _searchQuery = '';
  SettleoraSettlementFailure? _failure;

  @override
  void initState() {
    super.initState();
    _filter = widget.openNeedsActionOnStart
        ? _SettlementRequestFilter.needsAction
        : _SettlementRequestFilter.all;
    _searchController = TextEditingController();
    _searchController.addListener(_handleSearchChanged);
    Future<void>.microtask(_load);
  }

  @override
  void dispose() {
    _searchController.removeListener(_handleSearchChanged);
    _searchController.dispose();
    super.dispose();
  }

  void _handleSearchChanged() {
    final nextQuery = _searchController.text.trim();
    if (nextQuery == _searchQuery) {
      return;
    }

    setState(() {
      _searchQuery = nextQuery;
    });
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _failure = null;
    });

    try {
      final balanceSnapshot = await widget.repository.listBalances();
      final requests = await widget.repository.listSettlementRequests();
      if (!mounted) {
        return;
      }

      setState(() {
        _balanceSnapshot = balanceSnapshot;
        _requests = requests;
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _failure = SettleoraSettlementFailure.from(error);
        _isLoading = false;
      });
    }
  }

  Future<void> _openRequest(SettleoraSettlementRequest request) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SettleoraSettlementDetailScreen(
          repository: widget.repository,
          settlementId: request.id,
          currentUserProfileId: widget.currentUserProfileId,
        ),
      ),
    );
  }

  void _selectFilter(_SettlementRequestFilter filter) {
    if (filter == _filter) {
      return;
    }

    setState(() {
      _filter = filter;
    });
  }

  void _clearDiscoveryState() {
    setState(() {
      _filter = _SettlementRequestFilter.all;
      _searchQuery = '';
      _searchController.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Settlements'),
        actions: [
          IconButton(
            key: const Key('settlement-list-refresh'),
            onPressed: _isLoading ? null : _load,
            tooltip: 'Refresh',
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: Builder(
          builder: (context) {
            if (_isLoading) {
              return const SettleoraLoadingPanel(label: 'Loading settlements');
            }

            final failure = _failure;
            if (failure != null) {
              return _FailurePanel(failure: failure, onRetry: _load);
            }

            final balanceSnapshot = _balanceSnapshot;
            final visibleRequests = _filterRequests(_requests);
            final hasActiveDiscovery =
                _filter != _SettlementRequestFilter.all ||
                _searchQuery.isNotEmpty;
            return RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                children: [
                  _SettlementDiscoveryControls(
                    controller: _searchController,
                    selectedFilter: _filter,
                    counts: _SettlementRequestFilterCounts.from(
                      requests: _requests,
                      currentUserProfileId: widget.currentUserProfileId,
                    ),
                    hasActiveDiscovery: hasActiveDiscovery,
                    onFilterSelected: _selectFilter,
                    onClear: _clearDiscoveryState,
                  ),
                  const SizedBox(height: 20),
                  _BalanceSection(snapshot: balanceSnapshot),
                  const SizedBox(height: 20),
                  _RequestSection(
                    requests: visibleRequests,
                    hasActiveDiscovery: hasActiveDiscovery,
                    onTap: _openRequest,
                  ),
                  const SizedBox(height: 20),
                  _SettlementLandingSummary(
                    balanceSnapshot: balanceSnapshot,
                    requests: _requests,
                    currentUserProfileId: widget.currentUserProfileId,
                    onShowNeedsAction: () =>
                        _selectFilter(_SettlementRequestFilter.needsAction),
                    onShowAll: () =>
                        _selectFilter(_SettlementRequestFilter.all),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  List<SettleoraSettlementRequest> _filterRequests(
    List<SettleoraSettlementRequest> requests,
  ) {
    final queryTerms = _searchQuery
        .toLowerCase()
        .split(RegExp(r'\s+'))
        .where((term) => term.isNotEmpty)
        .toList(growable: false);
    return requests
        .where((request) {
          if (!_filter.matches(request, widget.currentUserProfileId)) {
            return false;
          }

          if (queryTerms.isEmpty) {
            return true;
          }

          final searchText = _requestSearchText(
            request: request,
            currentUserProfileId: widget.currentUserProfileId,
          );
          return queryTerms.every(searchText.contains);
        })
        .toList(growable: false);
  }
}

class _SettlementLandingSummary extends StatelessWidget {
  const _SettlementLandingSummary({
    required this.balanceSnapshot,
    required this.requests,
    required this.currentUserProfileId,
    required this.onShowNeedsAction,
    required this.onShowAll,
  });

  final SettleoraSettlementBalanceSnapshot? balanceSnapshot;
  final List<SettleoraSettlementRequest> requests;
  final String currentUserProfileId;
  final VoidCallback onShowNeedsAction;
  final VoidCallback onShowAll;

  @override
  Widget build(BuildContext context) {
    final balances =
        balanceSnapshot?.balances ?? const <SettleoraSettlementBalance>[];
    final openBalanceCount = balances
        .where(
          (balance) =>
              _amountStringLooksNonZero(balance.remainingUnclaimedAmount),
        )
        .length;
    final needsActionCount = requests
        .where((request) => _requestNeedsAction(request, currentUserProfileId))
        .length;
    final openRequestCount = requests.where(_isOpenRequest).length;

    return Card(
      key: const Key('settlement-list-landing-summary'),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.handshake_outlined),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Settle landing',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Review balances, settlement requests, and payment actions from this screen.',
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                SettleoraStatusChip(
                  label:
                      '$openBalanceCount open balance${_plural(openBalanceCount)}',
                  icon: Icons.account_balance_wallet_outlined,
                ),
                SettleoraStatusChip(
                  label: needsActionCount == 1
                      ? '1 needing action'
                      : '$needsActionCount needing action',
                  icon: Icons.rule_outlined,
                ),
                SettleoraStatusChip(
                  label:
                      '$openRequestCount open request${_plural(openRequestCount)}',
                  icon: Icons.request_quote_outlined,
                ),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.end,
              children: [
                OutlinedButton.icon(
                  key: const Key('settlement-list-summary-all'),
                  onPressed: onShowAll,
                  icon: const Icon(Icons.list_alt_outlined),
                  label: const Text('All settlements'),
                ),
                FilledButton.icon(
                  key: const Key('settlement-list-summary-needs-action'),
                  onPressed: onShowNeedsAction,
                  icon: const Icon(Icons.rule_outlined),
                  label: const Text('Needs action'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

enum _SettlementRequestFilter {
  all(label: 'All'),
  needsAction(label: 'Needs action'),
  incoming(label: 'Incoming'),
  outgoing(label: 'Outgoing'),
  open(label: 'Open'),
  confirmed(label: 'Confirmed'),
  disputed(label: 'Disputed');

  const _SettlementRequestFilter({required this.label});

  final String label;

  String get key {
    return switch (this) {
      _SettlementRequestFilter.all => 'all',
      _SettlementRequestFilter.needsAction => 'needs-action',
      _SettlementRequestFilter.incoming => 'incoming',
      _SettlementRequestFilter.outgoing => 'outgoing',
      _SettlementRequestFilter.open => 'open',
      _SettlementRequestFilter.confirmed => 'confirmed',
      _SettlementRequestFilter.disputed => 'disputed',
    };
  }

  bool matches(
    SettleoraSettlementRequest request,
    String currentUserProfileId,
  ) {
    return switch (this) {
      _SettlementRequestFilter.all => true,
      _SettlementRequestFilter.needsAction => _requestNeedsAction(
        request,
        currentUserProfileId,
      ),
      _SettlementRequestFilter.incoming => request.isCreditor(
        currentUserProfileId,
      ),
      _SettlementRequestFilter.outgoing => request.isDebtor(
        currentUserProfileId,
      ),
      _SettlementRequestFilter.open => _isOpenRequest(request),
      _SettlementRequestFilter.confirmed =>
        request.status == SettleoraSettlementRequestStatusValues.confirmed,
      _SettlementRequestFilter.disputed =>
        request.status == SettleoraSettlementRequestStatusValues.disputed,
    };
  }
}

class _SettlementRequestFilterCounts {
  const _SettlementRequestFilterCounts(this._counts);

  factory _SettlementRequestFilterCounts.from({
    required List<SettleoraSettlementRequest> requests,
    required String currentUserProfileId,
  }) {
    return _SettlementRequestFilterCounts({
      for (final filter in _SettlementRequestFilter.values)
        filter: requests
            .where((request) => filter.matches(request, currentUserProfileId))
            .length,
    });
  }

  final Map<_SettlementRequestFilter, int> _counts;

  int count(_SettlementRequestFilter filter) => _counts[filter] ?? 0;
}

enum _SettlementDetailPaymentFilter {
  all(label: 'All'),
  needsAction(label: 'Needs action'),
  residuals(label: 'Residuals');

  const _SettlementDetailPaymentFilter({required this.label});

  final String label;

  String get key {
    return switch (this) {
      _SettlementDetailPaymentFilter.all => 'all',
      _SettlementDetailPaymentFilter.needsAction => 'needs-action',
      _SettlementDetailPaymentFilter.residuals => 'residuals',
    };
  }

  bool matches(
    SettleoraSettlementPayment payment,
    String currentUserProfileId,
  ) {
    return switch (this) {
      _SettlementDetailPaymentFilter.all => true,
      _SettlementDetailPaymentFilter.needsAction =>
        payment.canConfirmFor(currentUserProfileId) ||
            payment.canCancelFor(currentUserProfileId) ||
            payment.canDisputeFor(currentUserProfileId) ||
            (payment.isReceiver(currentUserProfileId) &&
                payment.residuals.any((residual) => residual.canConfirm)),
      _SettlementDetailPaymentFilter.residuals => payment.residuals.isNotEmpty,
    };
  }
}

class _SettlementDetailPaymentFilterCounts {
  const _SettlementDetailPaymentFilterCounts(this._counts);

  factory _SettlementDetailPaymentFilterCounts.from({
    required List<SettleoraSettlementPayment> payments,
    required String currentUserProfileId,
  }) {
    return _SettlementDetailPaymentFilterCounts({
      for (final filter in _SettlementDetailPaymentFilter.values)
        filter: payments
            .where((payment) => filter.matches(payment, currentUserProfileId))
            .length,
    });
  }

  final Map<_SettlementDetailPaymentFilter, int> _counts;

  int count(_SettlementDetailPaymentFilter filter) => _counts[filter] ?? 0;
}

class SettleoraSettlementDetailScreen extends StatefulWidget {
  const SettleoraSettlementDetailScreen({
    super.key,
    required this.repository,
    required this.settlementId,
    required this.currentUserProfileId,
  });

  final SettleoraSettlementRepository repository;
  final String settlementId;
  final String currentUserProfileId;

  @override
  State<SettleoraSettlementDetailScreen> createState() =>
      _SettleoraSettlementDetailScreenState();
}

class _SettleoraSettlementDetailScreenState
    extends State<SettleoraSettlementDetailScreen> {
  late final TextEditingController _lineSearchController;
  late final TextEditingController _paymentSearchController;
  bool _isLoading = true;
  String? _busyAction;
  SettleoraSettlementRequest? _request;
  List<SettleoraSettlementPayment> _payments = const [];
  String _lineSearchQuery = '';
  String _paymentSearchQuery = '';
  _SettlementDetailPaymentFilter _paymentFilter =
      _SettlementDetailPaymentFilter.all;
  SettleoraSettlementCounterpartyPaymentDetails? _paymentDetails;
  SettleoraSettlementFailure? _paymentDetailsFailure;
  SettleoraSettlementFailure? _failure;

  @override
  void initState() {
    super.initState();
    _lineSearchController = TextEditingController();
    _paymentSearchController = TextEditingController();
    _lineSearchController.addListener(_handleLineSearchChanged);
    _paymentSearchController.addListener(_handlePaymentSearchChanged);
    Future<void>.microtask(_load);
  }

  @override
  void dispose() {
    _lineSearchController.removeListener(_handleLineSearchChanged);
    _paymentSearchController.removeListener(_handlePaymentSearchChanged);
    _lineSearchController.dispose();
    _paymentSearchController.dispose();
    super.dispose();
  }

  void _handleLineSearchChanged() {
    final nextQuery = _lineSearchController.text.trim();
    if (nextQuery == _lineSearchQuery) {
      return;
    }

    setState(() {
      _lineSearchQuery = nextQuery;
    });
  }

  void _handlePaymentSearchChanged() {
    final nextQuery = _paymentSearchController.text.trim();
    if (nextQuery == _paymentSearchQuery) {
      return;
    }

    setState(() {
      _paymentSearchQuery = nextQuery;
    });
  }

  void _selectPaymentFilter(_SettlementDetailPaymentFilter filter) {
    if (filter == _paymentFilter) {
      return;
    }

    setState(() {
      _paymentFilter = filter;
    });
  }

  void _clearLineDiscovery() {
    setState(() {
      _lineSearchQuery = '';
      _lineSearchController.clear();
    });
  }

  void _clearPaymentDiscovery() {
    setState(() {
      _paymentFilter = _SettlementDetailPaymentFilter.all;
      _paymentSearchQuery = '';
      _paymentSearchController.clear();
    });
  }

  Future<void> _load({
    bool showLoading = true,
    bool preserveCurrentOnFailure = false,
  }) async {
    if (showLoading) {
      setState(() {
        _isLoading = true;
        _failure = null;
        _paymentDetailsFailure = null;
      });
    } else {
      setState(() {
        _failure = null;
        _paymentDetailsFailure = null;
      });
    }

    try {
      final request = await widget.repository.getSettlementRequest(
        widget.settlementId,
      );
      final payments = await widget.repository.listSettlementPayments(
        request.id,
      );
      SettleoraSettlementCounterpartyPaymentDetails? paymentDetails;
      SettleoraSettlementFailure? paymentDetailsFailure;
      final counterpartyUserProfileId = request.counterpartyFor(
        widget.currentUserProfileId,
      );
      if (counterpartyUserProfileId != null) {
        try {
          paymentDetails = await widget.repository
              .getCounterpartyPaymentDetails(
                settlementId: request.id,
                userProfileId: counterpartyUserProfileId,
              );
        } catch (error) {
          paymentDetailsFailure = SettleoraSettlementFailure.from(error);
        }
      }

      if (!mounted) {
        return;
      }

      setState(() {
        _request = request;
        _payments = payments;
        _paymentDetails = paymentDetails;
        _paymentDetailsFailure = paymentDetailsFailure;
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      final failure = SettleoraSettlementFailure.from(error);
      if (preserveCurrentOnFailure) {
        setState(() {
          _isLoading = false;
        });
        throw failure;
      }

      setState(() {
        _failure = failure;
        _isLoading = false;
      });
    }
  }

  Future<void> _runAction({
    required String actionKey,
    required String successMessage,
    required Future<void> Function() operation,
  }) async {
    if (_busyAction != null) {
      return;
    }

    setState(() {
      _busyAction = actionKey;
    });

    try {
      await operation();
      if (!mounted) {
        return;
      }

      try {
        await _load(showLoading: false, preserveCurrentOnFailure: true);
        if (!mounted) {
          return;
        }

        _showSnackBar(successMessage);
      } catch (_) {
        if (!mounted) {
          return;
        }

        _showSnackBar(
          '$successMessage Refresh failed. Use Refresh to reload server state before repeating any settlement action.',
        );
      }
    } catch (error) {
      if (!mounted) {
        return;
      }

      _showSnackBar(_settlementActionFailureMessage(error));
    } finally {
      if (mounted) {
        setState(() {
          _busyAction = null;
        });
      }
    }
  }

  Future<void> _confirmAndRunAction({
    required String actionKey,
    required String title,
    required String message,
    required String confirmLabel,
    required String successMessage,
    required Future<void> Function() operation,
  }) async {
    if (_busyAction != null) {
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Back'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(confirmLabel),
          ),
        ],
      ),
    );

    if (!mounted || confirmed != true) {
      return;
    }

    await _runAction(
      actionKey: actionKey,
      successMessage: successMessage,
      operation: operation,
    );
  }

  Future<void> _markPaymentPaid(SettleoraSettlementRequest request) async {
    if (_busyAction != null) {
      return;
    }

    final result = await _showMarkPaymentPaidDialog(
      context: context,
      amount: request.amount,
      currency: request.currency,
      paymentDate: _formatDate(DateTime.now()),
    );

    if (!mounted || result == null) {
      return;
    }

    await _runAction(
      actionKey: 'request-mark-paid',
      successMessage: 'Payment marked paid.',
      operation: () async {
        await widget.repository.markSettlementPaymentPaid(
          settlementId: request.id,
          amount: result.amount,
          currency: result.currency,
          paymentDate: result.paymentDate,
        );
      },
    );
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Settlement'),
        actions: [
          IconButton(
            key: const Key('settlement-detail-refresh'),
            onPressed: _isLoading ? null : () => _load(),
            tooltip: 'Refresh',
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: Builder(
          builder: (context) {
            if (_isLoading) {
              return const SettleoraLoadingPanel(label: 'Loading settlement');
            }

            final failure = _failure;
            if (failure != null) {
              return _FailurePanel(failure: failure, onRetry: _load);
            }

            final request = _request;
            if (request == null) {
              return _FailurePanel(
                failure: const SettleoraSettlementFailure(
                  kind: SettleoraSettlementFailureKind.unavailable,
                  message: 'The settlement is no longer available.',
                ),
                onRetry: _load,
              );
            }

            final visibleLines = _filterRequestLines(request.lines);
            final visiblePayments = _filterPayments(_payments);
            final hasActiveLineDiscovery = _lineSearchQuery.isNotEmpty;
            final hasActivePaymentDiscovery =
                _paymentFilter != _SettlementDetailPaymentFilter.all ||
                _paymentSearchQuery.isNotEmpty;

            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
              children: [
                _RequestHeader(
                  request: request,
                  currentUserProfileId: widget.currentUserProfileId,
                  busyAction: _busyAction,
                  onMarkPaid: () => _markPaymentPaid(request),
                  onCancel: () => _confirmAndRunAction(
                    actionKey: 'request-cancel',
                    title: 'Cancel settlement?',
                    message:
                        'This asks the API to cancel the requested settlement if no payment has been recorded. The loaded role and status only guide this button; the server decides authorization, status, audit, and money.',
                    confirmLabel: 'Cancel settlement',
                    successMessage: 'Settlement cancelled.',
                    operation: () async {
                      await widget.repository.cancelSettlementRequest(
                        request.id,
                      );
                    },
                  ),
                  onDispute: () => _confirmAndRunAction(
                    actionKey: 'request-dispute',
                    title: 'Dispute settlement?',
                    message:
                        'This marks the settlement as disputed so it can be corrected. A reason cannot be added from mobile yet.',
                    confirmLabel: 'Dispute',
                    successMessage: 'Settlement disputed.',
                    operation: () async {
                      await widget.repository.disputeSettlementRequest(
                        request.id,
                      );
                    },
                  ),
                ),
                const SizedBox(height: 20),
                _DetailReviewSummarySection(
                  request: request,
                  payments: _payments,
                  currentUserProfileId: widget.currentUserProfileId,
                  paymentDetails: _paymentDetails,
                  paymentDetailsFailure: _paymentDetailsFailure,
                ),
                const SizedBox(height: 20),
                _LifecycleSection(
                  request: request,
                  payments: _payments,
                  currentUserProfileId: widget.currentUserProfileId,
                ),
                const SizedBox(height: 20),
                _CounterpartyPaymentDetailsSection(
                  details: _paymentDetails,
                  failure: _paymentDetailsFailure,
                ),
                const SizedBox(height: 20),
                _RequestLinesSection(
                  lines: visibleLines,
                  totalLineCount: request.lines.length,
                  controller: _lineSearchController,
                  hasActiveDiscovery: hasActiveLineDiscovery,
                  onClear: _clearLineDiscovery,
                ),
                const SizedBox(height: 20),
                _PaymentsSection(
                  payments: visiblePayments,
                  totalPaymentCount: _payments.length,
                  controller: _paymentSearchController,
                  selectedFilter: _paymentFilter,
                  counts: _SettlementDetailPaymentFilterCounts.from(
                    payments: _payments,
                    currentUserProfileId: widget.currentUserProfileId,
                  ),
                  hasActiveDiscovery: hasActivePaymentDiscovery,
                  currentUserProfileId: widget.currentUserProfileId,
                  busyAction: _busyAction,
                  onFilterSelected: _selectPaymentFilter,
                  onClear: _clearPaymentDiscovery,
                  onConfirmPayment: (payment) => _confirmAndRunAction(
                    actionKey: 'payment-confirm-${payment.id}',
                    title: 'Confirm receipt?',
                    message:
                        'Confirm only if you received this payment. Access, settlement state, residual handling, and audit details are checked before the confirmation is saved.',
                    confirmLabel: 'Confirm receipt',
                    successMessage: 'Payment confirmed.',
                    operation: () async {
                      await widget.repository.confirmSettlementPayment(
                        payment.id,
                      );
                    },
                  ),
                  onCancelPayment: (payment) => _confirmAndRunAction(
                    actionKey: 'payment-cancel-${payment.id}',
                    title: 'Cancel payment claim?',
                    message:
                        'This asks the API to cancel your marked-paid claim. The loaded payer role only guides this button; the server decides whether the transition is allowed.',
                    confirmLabel: 'Cancel claim',
                    successMessage: 'Payment cancelled.',
                    operation: () async {
                      await widget.repository.cancelSettlementPayment(
                        payment.id,
                      );
                    },
                  ),
                  onDisputePayment: (payment) => _confirmAndRunAction(
                    actionKey: 'payment-dispute-${payment.id}',
                    title: 'Dispute payment?',
                    message:
                        'This marks the payment claim as disputed so it can be corrected. A reason cannot be added from mobile yet.',
                    confirmLabel: 'Dispute payment',
                    successMessage: 'Payment disputed.',
                    operation: () async {
                      await widget.repository.disputeSettlementPayment(
                        payment.id,
                      );
                    },
                  ),
                  onConfirmResidual: (payment, residual) => _confirmAndRunAction(
                    actionKey: 'residual-confirm-${residual.id}',
                    title: 'Confirm residual?',
                    message:
                        'Confirm this remaining amount handling only if it matches what you agreed. Access, settlement state, and audit details are checked before the confirmation is saved.',
                    confirmLabel: 'Confirm residual',
                    successMessage: 'Residual confirmed.',
                    operation: () async {
                      await widget.repository.confirmSettlementPaymentResidual(
                        paymentId: payment.id,
                        residualId: residual.id,
                      );
                    },
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  List<SettleoraSettlementRequestLine> _filterRequestLines(
    List<SettleoraSettlementRequestLine> lines,
  ) {
    final queryTerms = _searchTerms(_lineSearchQuery);
    if (queryTerms.isEmpty) {
      return lines;
    }

    return lines
        .where((line) => queryTerms.every(_lineSearchText(line).contains))
        .toList(growable: false);
  }

  List<SettleoraSettlementPayment> _filterPayments(
    List<SettleoraSettlementPayment> payments,
  ) {
    final queryTerms = _searchTerms(_paymentSearchQuery);
    return payments
        .where((payment) {
          if (!_paymentFilter.matches(payment, widget.currentUserProfileId)) {
            return false;
          }

          if (queryTerms.isEmpty) {
            return true;
          }

          final searchText = _paymentSearchText(
            payment: payment,
            currentUserProfileId: widget.currentUserProfileId,
          );
          return queryTerms.every(searchText.contains);
        })
        .toList(growable: false);
  }
}

class _SettlementDiscoveryControls extends StatelessWidget {
  const _SettlementDiscoveryControls({
    required this.controller,
    required this.selectedFilter,
    required this.counts,
    required this.hasActiveDiscovery,
    required this.onFilterSelected,
    required this.onClear,
  });

  final TextEditingController controller;
  final _SettlementRequestFilter selectedFilter;
  final _SettlementRequestFilterCounts counts;
  final bool hasActiveDiscovery;
  final void Function(_SettlementRequestFilter filter) onFilterSelected;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return SettleoraSection(
      title: 'Find settlements',
      trailing: hasActiveDiscovery
          ? TextButton.icon(
              key: const Key('settlement-list-clear-filters'),
              onPressed: onClear,
              icon: const Icon(Icons.close_outlined),
              label: const Text('Clear'),
            )
          : null,
      children: [
        TextField(
          key: const Key('settlement-list-search'),
          controller: controller,
          decoration: const InputDecoration(
            labelText: 'Search settlements',
            prefixIcon: Icon(Icons.search_outlined),
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 10),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (final filter in _SettlementRequestFilter.values)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    key: Key('settlement-list-filter-${filter.key}'),
                    selected: selectedFilter == filter,
                    onSelected: (_) => onFilterSelected(filter),
                    label: Text('${filter.label} (${counts.count(filter)})'),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Balances remain unfiltered totals.',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}

class _BalanceSection extends StatelessWidget {
  const _BalanceSection({required this.snapshot});

  final SettleoraSettlementBalanceSnapshot? snapshot;

  @override
  Widget build(BuildContext context) {
    final snapshot = this.snapshot;
    final balances = snapshot?.balances ?? const <SettleoraSettlementBalance>[];

    if (balances.isEmpty) {
      return const SettleoraSection(
        title: 'Balances',
        children: [
          SettleoraStatePanel(
            icon: Icons.account_balance_wallet_outlined,
            title: 'No balances',
            message: 'Current settlement balances will appear here.',
            compact: true,
          ),
        ],
      );
    }

    return SettleoraSection(
      title: 'Balances',
      trailing: snapshot == null
          ? null
          : Text(
              'Updated ${_formatTimestamp(snapshot.generatedAtUtc)}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
      children: [
        for (final balance in balances)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _BalanceTile(balance: balance),
          ),
      ],
    );
  }
}

class _BalanceTile extends StatelessWidget {
  const _BalanceTile({required this.balance});

  final SettleoraSettlementBalance balance;

  @override
  Widget build(BuildContext context) {
    final direction = settleoraSettlementBalanceDirectionLabel(
      balance.direction,
    );

    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListTile(
        leading: Icon(
          balance.direction ==
                  SettleoraSettlementBalanceDirectionValues.incoming
              ? Icons.south_west_outlined
              : Icons.north_east_outlined,
        ),
        title: Text('$direction balance'),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SettleoraKeyValueMoneyText(
                label: 'Selected lines',
                amount: balance.selectedLineAmount,
                currencyCode: balance.currency,
              ),
              SettleoraKeyValueMoneyText(
                label: 'Remaining',
                amount: balance.remainingUnclaimedAmount,
                currencyCode: balance.currency,
              ),
              SettleoraKeyValueMoneyText(
                label: 'Pending',
                amount: balance.pendingClaimedAmount,
                currencyCode: balance.currency,
              ),
              SettleoraKeyValueMoneyText(
                label: 'Cleared',
                amount: balance.confirmedClearedAmount,
                currencyCode: balance.currency,
              ),
              SettleoraKeyValueMoneyText(
                label: 'Confirmed residual',
                amount: balance.confirmedRemainingResidualAmount,
                currencyCode: balance.currency,
              ),
              SettleoraKeyValueMoneyText(
                label: 'Waived residual',
                amount: balance.waivedResidualAmount,
                currencyCode: balance.currency,
              ),
              SettleoraKeyValueMoneyText(
                label: 'Credit residual',
                amount: balance.creditResidualAmount,
                currencyCode: balance.currency,
              ),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  SettleoraStatusChip(
                    label: '${balance.requestCount} requests',
                    icon: Icons.receipt_long_outlined,
                  ),
                  SettleoraStatusChip(
                    label: '${balance.lineCount} lines',
                    icon: Icons.format_list_bulleted,
                  ),
                  SettleoraStatusChip(
                    label: '${balance.pendingPaymentCount} pending payments',
                    icon: Icons.pending_actions_outlined,
                  ),
                  SettleoraStatusChip(
                    label:
                        '${balance.confirmedPaymentCount} confirmed payments',
                    icon: Icons.verified_outlined,
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                'Balance rows show the latest loaded projection. Refresh before acting if anything looks stale.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RequestSection extends StatelessWidget {
  const _RequestSection({
    required this.requests,
    required this.hasActiveDiscovery,
    required this.onTap,
  });

  final List<SettleoraSettlementRequest> requests;
  final bool hasActiveDiscovery;
  final void Function(SettleoraSettlementRequest request) onTap;

  @override
  Widget build(BuildContext context) {
    if (requests.isEmpty) {
      if (hasActiveDiscovery) {
        return const SettleoraSection(
          title: 'Requests',
          children: [
            SettleoraStatePanel(
              icon: Icons.search_off_outlined,
              title: 'No matching settlements',
              message:
                  'No loaded settlement requests match this local search and filter. Clear filters to review loaded rows; no-match is not a server search, authorization result, or settlement truth.',
              compact: true,
            ),
          ],
        );
      }

      return const SettleoraSection(
        title: 'Requests',
        children: [
          SettleoraStatePanel(
            icon: Icons.handshake_outlined,
            title: 'No settlement requests',
            message: 'Visible settlement requests will appear here.',
            compact: true,
          ),
        ],
      );
    }

    return SettleoraSection(
      title: 'Requests',
      children: [
        for (var index = 0; index < requests.length; index += 1)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _RequestTile(
              index: index,
              request: requests[index],
              onTap: () => onTap(requests[index]),
            ),
          ),
      ],
    );
  }
}

class _RequestTile extends StatelessWidget {
  const _RequestTile({
    required this.index,
    required this.request,
    required this.onTap,
  });

  final int index;
  final SettleoraSettlementRequest request;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListTile(
        key: ValueKey('settlement-request-tile-$index'),
        onTap: onTap,
        leading: const Icon(Icons.request_quote_outlined),
        title: MoneyText(
          amount: request.amount,
          currencyCode: request.currency,
          style: Theme.of(context).textTheme.titleMedium,
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              SettleoraStatusChip(
                label: settleoraSettlementRequestStatusLabel(request.status),
                icon: Icons.assignment_outlined,
              ),
              SettleoraStatusChip(
                label: '${request.lines.length} lines',
                icon: Icons.format_list_bulleted,
              ),
            ],
          ),
        ),
        trailing: const Icon(Icons.chevron_right),
      ),
    );
  }
}

class _RequestHeader extends StatelessWidget {
  const _RequestHeader({
    required this.request,
    required this.currentUserProfileId,
    required this.busyAction,
    required this.onMarkPaid,
    required this.onCancel,
    required this.onDispute,
  });

  final SettleoraSettlementRequest request;
  final String currentUserProfileId;
  final String? busyAction;
  final VoidCallback onMarkPaid;
  final VoidCallback onCancel;
  final VoidCallback onDispute;

  @override
  Widget build(BuildContext context) {
    final canMarkPaid =
        request.status == SettleoraSettlementRequestStatusValues.requested &&
        request.isDebtor(currentUserProfileId);
    final canCancel = request.canCancelFor(currentUserProfileId);
    final canDispute = request.canDisputeFor(currentUserProfileId);
    final hasActions = canMarkPaid || canCancel || canDispute;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        MoneyText(
          amount: request.amount,
          currencyCode: request.currency,
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 10),
        SettleoraKeyValueText(
          label: 'Status',
          value: settleoraSettlementRequestStatusLabel(request.status),
        ),
        SettleoraKeyValueMoneyText(
          label: 'Selected total',
          amount: request.amount,
          currencyCode: request.currency,
        ),
        SettleoraKeyValueText(
          label: 'Requested',
          value: _formatTimestamp(request.requestedAtUtc),
        ),
        SettleoraKeyValueText(label: 'Lines', value: '${request.lines.length}'),
        const SizedBox(height: 8),
        Text(
          'Actions shown here use the latest loaded status. Access, settlement state, audit, and money are checked again before changes are saved.',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Selected total is the request amount for the loaded lines. Actual paid amounts are shown separately on payment claims.',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
        if (hasActions) ...[
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (canMarkPaid)
                FilledButton.icon(
                  key: const Key('settlement-request-mark-paid'),
                  onPressed: busyAction == null ? onMarkPaid : null,
                  icon: busyAction == 'request-mark-paid'
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.payments_outlined),
                  label: const Text('Mark paid'),
                ),
              if (canCancel)
                OutlinedButton.icon(
                  key: const Key('settlement-request-cancel'),
                  onPressed: busyAction == null ? onCancel : null,
                  icon: busyAction == 'request-cancel'
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.close_outlined),
                  label: const Text('Cancel'),
                ),
              if (canDispute)
                OutlinedButton.icon(
                  key: const Key('settlement-request-dispute'),
                  onPressed: busyAction == null ? onDispute : null,
                  icon: busyAction == 'request-dispute'
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.report_problem_outlined),
                  label: const Text('Dispute'),
                ),
            ],
          ),
        ],
      ],
    );
  }
}

class _LifecycleSection extends StatelessWidget {
  const _LifecycleSection({
    required this.request,
    required this.payments,
    required this.currentUserProfileId,
  });

  final SettleoraSettlementRequest request;
  final List<SettleoraSettlementPayment> payments;
  final String currentUserProfileId;

  @override
  Widget build(BuildContext context) {
    final state = _lifecycleState(
      request: request,
      payments: payments,
      currentUserProfileId: currentUserProfileId,
    );

    return SettleoraSection(
      title: 'Next step',
      children: [
        _GuidancePanel(
          icon: state.icon,
          title: state.title,
          message: state.message,
          chips: state.chips,
        ),
      ],
    );
  }
}

class _LifecycleGuidance {
  const _LifecycleGuidance({
    required this.icon,
    required this.title,
    required this.message,
    required this.chips,
  });

  final IconData icon;
  final String title;
  final String message;
  final List<String> chips;
}

_LifecycleGuidance _lifecycleState({
  required SettleoraSettlementRequest request,
  required List<SettleoraSettlementPayment> payments,
  required String currentUserProfileId,
}) {
  final isDebtor = request.isDebtor(currentUserProfileId);
  final isCreditor = request.isCreditor(currentUserProfileId);
  final hasMarkedPaidPayment = payments.any(
    (payment) =>
        payment.status == SettleoraSettlementPaymentStatusValues.markedPaid,
  );
  final hasPendingResiduals = payments.any(
    (payment) => payment.hasPendingResiduals,
  );
  final hasConfirmablePayment = payments.any(
    (payment) => payment.canConfirmFor(currentUserProfileId),
  );

  return switch (request.status) {
    SettleoraSettlementRequestStatusValues.requested =>
      isDebtor
          ? _LifecycleGuidance(
              icon: Icons.north_east_outlined,
              title: 'You are expected to pay',
              message:
                  'Use the counterparty payment details, then mark this settlement paid after sending payment. The claim is checked and recorded in the audit trail.',
              chips: const ['Payment needed', 'Mark paid available'],
            )
          : _LifecycleGuidance(
              icon: Icons.schedule_outlined,
              title: isCreditor ? 'Waiting for payer' : 'Requested',
              message: isCreditor
                  ? 'The payer needs to mark this settlement as paid before you can confirm receipt.'
                  : 'A settlement participant needs to act before this can move forward.',
              chips: const ['No payment recorded'],
            ),
    SettleoraSettlementRequestStatusValues.partiallyPaid => _LifecycleGuidance(
      icon: hasPendingResiduals
          ? Icons.rule_folder_outlined
          : Icons.pending_actions_outlined,
      title: hasPendingResiduals
          ? 'Residual needs receiver review'
          : isCreditor
          ? 'Review payment claims'
          : 'Waiting for receiver review',
      message: hasPendingResiduals
          ? 'Confirm the pending residual handling before confirming the payment.'
          : isCreditor
          ? 'Confirm receipt for valid marked-paid claims, or dispute a claim that needs correction.'
          : 'The receiver needs to confirm or dispute the marked-paid claim.',
      chips: [
        if (hasPendingResiduals) 'Residual confirmation needed',
        if (hasConfirmablePayment) 'Confirm receipt available',
        if (hasMarkedPaidPayment && !hasConfirmablePayment)
          'Receiver action needed',
      ],
    ),
    SettleoraSettlementRequestStatusValues.markedPaid => _LifecycleGuidance(
      icon: Icons.verified_outlined,
      title: isCreditor ? 'Confirm receipt' : 'Waiting for confirmation',
      message: isCreditor
          ? 'Confirm receipt if the payment arrived, or dispute the claim if it does not match.'
          : 'The payment has been marked paid and now needs receiver confirmation.',
      chips: [if (hasConfirmablePayment) 'Confirm receipt available'],
    ),
    SettleoraSettlementRequestStatusValues.confirmed => const _LifecycleGuidance(
      icon: Icons.check_circle_outline,
      title: 'No action needed',
      message:
          'This settlement is confirmed and no lifecycle actions are available.',
      chips: ['Confirmed'],
    ),
    SettleoraSettlementRequestStatusValues.disputed => const _LifecycleGuidance(
      icon: Icons.report_problem_outlined,
      title: 'Disputed',
      message: 'This settlement needs correction before it can proceed.',
      chips: ['Needs correction'],
    ),
    SettleoraSettlementRequestStatusValues.cancelled =>
      const _LifecycleGuidance(
        icon: Icons.cancel_outlined,
        title: 'Cancelled',
        message: 'This settlement was cancelled. No action is available.',
        chips: ['Closed'],
      ),
    _ => _LifecycleGuidance(
      icon: Icons.info_outline,
      title: settleoraSettlementRequestStatusLabel(request.status),
      message:
          'This settlement status is visible, but no mobile action is available for it.',
      chips: const ['No mobile action'],
    ),
  };
}

class _DetailReviewSummarySection extends StatelessWidget {
  const _DetailReviewSummarySection({
    required this.request,
    required this.payments,
    required this.currentUserProfileId,
    required this.paymentDetails,
    required this.paymentDetailsFailure,
  });

  final SettleoraSettlementRequest request;
  final List<SettleoraSettlementPayment> payments;
  final String currentUserProfileId;
  final SettleoraSettlementCounterpartyPaymentDetails? paymentDetails;
  final SettleoraSettlementFailure? paymentDetailsFailure;

  @override
  Widget build(BuildContext context) {
    final pendingResidualCount = payments.fold<int>(
      0,
      (count, payment) =>
          count +
          payment.residuals.where((residual) => residual.canConfirm).length,
    );
    final residualCount = payments.fold<int>(
      0,
      (count, payment) => count + payment.residuals.length,
    );
    final roleLabel = _requestRoleLabel(
      request: request,
      currentUserProfileId: currentUserProfileId,
    );
    final paymentDetailsStatus = paymentDetailsFailure != null
        ? 'Unavailable'
        : paymentDetails == null
        ? 'Not available'
        : paymentDetails!.isConfigured
        ? 'Available'
        : 'Not configured';

    return SettleoraSection(
      title: 'Review Summary',
      children: [
        _GuidancePanel(
          icon: Icons.fact_check_outlined,
          title: 'Loaded settlement facts',
          message:
              '${settleoraSettlementRequestStatusLabel(request.status)} - $roleLabel. Mobile shows loaded API rows and does not expand baskets, decide eligibility, or calculate settlement totals.',
          chips: [
            '${request.lines.length} lines',
            '${payments.length} payments',
            '$residualCount residuals',
            if (pendingResidualCount > 0)
              '$pendingResidualCount need confirmation'
            else
              'No residual review',
            'Payment details $paymentDetailsStatus',
          ],
          chipWidgets: [
            _SoftMoneyChip(
              label: 'Selected total',
              amount: request.amount,
              currency: request.currency,
              icon: Icons.payments_outlined,
            ),
          ],
        ),
      ],
    );
  }
}

class _CounterpartyPaymentDetailsSection extends StatelessWidget {
  const _CounterpartyPaymentDetailsSection({
    required this.details,
    required this.failure,
  });

  final SettleoraSettlementCounterpartyPaymentDetails? details;
  final SettleoraSettlementFailure? failure;

  @override
  Widget build(BuildContext context) {
    final details = this.details;
    final failure = this.failure;

    if (details == null && failure == null) {
      return const SettleoraSection(
        title: 'Counterparty Payment Details',
        children: [
          SettleoraStatePanel(
            icon: Icons.account_balance_outlined,
            title: 'No payment details',
            message: 'No settlement counterparty details are available.',
            compact: true,
          ),
        ],
      );
    }

    if (failure != null) {
      return SettleoraSection(
        title: 'Counterparty Payment Details',
        children: [
          SettleoraStatePanel(
            icon: Icons.visibility_off_outlined,
            title: failure.title,
            message: failure.message,
            compact: true,
          ),
        ],
      );
    }

    if (details == null || !details.isConfigured) {
      return const SettleoraSection(
        title: 'Counterparty Payment Details',
        children: [
          SettleoraStatePanel(
            icon: Icons.account_balance_outlined,
            title: 'Not configured',
            message: 'The counterparty has no visible payment details.',
            compact: true,
          ),
        ],
      );
    }

    return SettleoraSection(
      title: 'Counterparty Payment Details',
      children: [
        _GuidancePanel(
          icon: Icons.verified_user_outlined,
          title: 'Settlement-scoped visibility',
          message:
              'Only people involved in an eligible settlement can see these payment details. QR payment bytes are not shown here.',
          chips: [
            'Relationship-backed',
            _fallback(details.visibilityApplied, 'Verified'),
          ],
        ),
        const SizedBox(height: 10),
        SettleoraKeyValueText(
          label: 'Method',
          value: _fallback(details.preferredMethodLabel, 'Payment method'),
        ),
        if (_hasText(details.paymentHandle))
          SettleoraKeyValueText(
            label: 'Handle',
            value: details.paymentHandle!.trim(),
          ),
        if (_hasText(details.paymentNote))
          SettleoraKeyValueText(
            label: 'Note',
            value: details.paymentNote!.trim(),
          ),
        SettleoraKeyValueText(
          label: 'QR',
          value: details.hasQrFile ? 'Available' : 'Not linked',
        ),
      ],
    );
  }
}

class _RequestLinesSection extends StatelessWidget {
  const _RequestLinesSection({
    required this.lines,
    required this.totalLineCount,
    required this.controller,
    required this.hasActiveDiscovery,
    required this.onClear,
  });

  final List<SettleoraSettlementRequestLine> lines;
  final int totalLineCount;
  final TextEditingController controller;
  final bool hasActiveDiscovery;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    if (totalLineCount == 0) {
      return const SettleoraSection(
        title: 'Request Lines',
        children: [
          SettleoraStatePanel(
            icon: Icons.format_list_bulleted,
            title: 'No request lines',
            message: 'No selected settlement lines are visible.',
            compact: true,
          ),
        ],
      );
    }

    return SettleoraSection(
      title: 'Request Lines',
      trailing: Text(
        '${lines.length} of $totalLineCount',
        style: Theme.of(context).textTheme.bodySmall,
      ),
      children: [
        _GuidancePanel(
          icon: Icons.format_list_bulleted,
          title: 'Loaded selected scope',
          message:
              'These are the selected request lines returned by the API. Mobile filters only loaded rows on this device and does not expand baskets or decide line eligibility.',
          chips: [
            '$totalLineCount loaded lines',
            if (hasActiveDiscovery) '${lines.length} visible after filter',
          ],
        ),
        const SizedBox(height: 10),
        _DetailSearchControls(
          controller: controller,
          searchKey: const Key('settlement-detail-lines-search'),
          clearKey: const Key('settlement-detail-lines-search-clear'),
          label: 'Search request lines',
          hasActiveDiscovery: hasActiveDiscovery,
          onClear: onClear,
        ),
        const SizedBox(height: 10),
        if (lines.isEmpty)
          const SettleoraStatePanel(
            icon: Icons.search_off_outlined,
            title: 'No matching request lines',
            message:
                'No loaded request lines match this local filter. Clear the filter to restore the rows already returned by the API.',
            compact: true,
          )
        else
          for (var index = 0; index < lines.length; index += 1)
            _KeyValueAmountStatusText(
              label: 'Line ${index + 1}',
              amount: lines[index].exactAmount,
              currency: lines[index].currency,
              status: settleoraSettlementRequestLineStatusLabel(
                lines[index].status,
              ),
            ),
      ],
    );
  }
}

class _DetailSearchControls extends StatelessWidget {
  const _DetailSearchControls({
    required this.controller,
    required this.searchKey,
    required this.clearKey,
    required this.label,
    required this.hasActiveDiscovery,
    required this.onClear,
  });

  final TextEditingController controller;
  final Key searchKey;
  final Key clearKey;
  final String label;
  final bool hasActiveDiscovery;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: TextField(
            key: searchKey,
            controller: controller,
            decoration: InputDecoration(
              labelText: label,
              prefixIcon: const Icon(Icons.search_outlined),
              border: const OutlineInputBorder(),
            ),
          ),
        ),
        if (hasActiveDiscovery) ...[
          const SizedBox(width: 8),
          IconButton(
            key: clearKey,
            onPressed: onClear,
            tooltip: 'Clear search',
            icon: const Icon(Icons.close_outlined),
          ),
        ],
      ],
    );
  }
}

class _PaymentsSection extends StatelessWidget {
  const _PaymentsSection({
    required this.payments,
    required this.totalPaymentCount,
    required this.controller,
    required this.selectedFilter,
    required this.counts,
    required this.hasActiveDiscovery,
    required this.currentUserProfileId,
    required this.busyAction,
    required this.onFilterSelected,
    required this.onClear,
    required this.onConfirmPayment,
    required this.onCancelPayment,
    required this.onDisputePayment,
    required this.onConfirmResidual,
  });

  final List<SettleoraSettlementPayment> payments;
  final int totalPaymentCount;
  final TextEditingController controller;
  final _SettlementDetailPaymentFilter selectedFilter;
  final _SettlementDetailPaymentFilterCounts counts;
  final bool hasActiveDiscovery;
  final String currentUserProfileId;
  final String? busyAction;
  final void Function(_SettlementDetailPaymentFilter filter) onFilterSelected;
  final VoidCallback onClear;
  final void Function(SettleoraSettlementPayment payment) onConfirmPayment;
  final void Function(SettleoraSettlementPayment payment) onCancelPayment;
  final void Function(SettleoraSettlementPayment payment) onDisputePayment;
  final void Function(
    SettleoraSettlementPayment payment,
    SettleoraSettlementPaymentResidual residual,
  )
  onConfirmResidual;

  @override
  Widget build(BuildContext context) {
    if (totalPaymentCount == 0) {
      return const SettleoraSection(
        title: 'Payments',
        children: [
          SettleoraStatePanel(
            icon: Icons.payments_outlined,
            title: 'No payments',
            message: 'Payment claims for this settlement will appear here.',
            compact: true,
          ),
        ],
      );
    }

    return SettleoraSection(
      title: 'Payments',
      trailing: Text(
        '${payments.length} of $totalPaymentCount',
        style: Theme.of(context).textTheme.bodySmall,
      ),
      children: [
        _GuidancePanel(
          icon: Icons.filter_alt_outlined,
          title: 'Loaded payment filters',
          message:
              'Payment and residual filters hide only already-loaded rows on this device. They do not authorize, mutate, calculate, allocate, or reconcile settlement data.',
          chips: [
            '$totalPaymentCount loaded payments',
            if (hasActiveDiscovery) '${payments.length} visible after filter',
          ],
        ),
        const SizedBox(height: 10),
        _DetailSearchControls(
          controller: controller,
          searchKey: const Key('settlement-detail-payments-search'),
          clearKey: const Key('settlement-detail-payments-search-clear'),
          label: 'Search payments and residuals',
          hasActiveDiscovery: hasActiveDiscovery,
          onClear: onClear,
        ),
        const SizedBox(height: 10),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (final filter in _SettlementDetailPaymentFilter.values)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    key: Key('settlement-detail-payment-filter-${filter.key}'),
                    selected: selectedFilter == filter,
                    onSelected: (_) => onFilterSelected(filter),
                    label: Text('${filter.label} (${counts.count(filter)})'),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        if (payments.isEmpty)
          const SettleoraStatePanel(
            icon: Icons.search_off_outlined,
            title: 'No matching payments',
            message:
                'No loaded payments or residuals match this local filter. Clear filters to restore rows already returned by the API.',
            compact: true,
          )
        else
          for (var index = 0; index < payments.length; index += 1)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _PaymentTile(
                index: index,
                payment: payments[index],
                currentUserProfileId: currentUserProfileId,
                busyAction: busyAction,
                onConfirmPayment: () => onConfirmPayment(payments[index]),
                onCancelPayment: () => onCancelPayment(payments[index]),
                onDisputePayment: () => onDisputePayment(payments[index]),
                onConfirmResidual: (residual) =>
                    onConfirmResidual(payments[index], residual),
              ),
            ),
      ],
    );
  }
}

class _PaymentTile extends StatelessWidget {
  const _PaymentTile({
    required this.index,
    required this.payment,
    required this.currentUserProfileId,
    required this.busyAction,
    required this.onConfirmPayment,
    required this.onCancelPayment,
    required this.onDisputePayment,
    required this.onConfirmResidual,
  });

  final int index;
  final SettleoraSettlementPayment payment;
  final String currentUserProfileId;
  final String? busyAction;
  final VoidCallback onConfirmPayment;
  final VoidCallback onCancelPayment;
  final VoidCallback onDisputePayment;
  final void Function(SettleoraSettlementPaymentResidual residual)
  onConfirmResidual;

  @override
  Widget build(BuildContext context) {
    final canConfirm = payment.canConfirmFor(currentUserProfileId);
    final canCancel = payment.canCancelFor(currentUserProfileId);
    final canDispute = payment.canDisputeFor(currentUserProfileId);
    final hasPaymentActions = canConfirm || canCancel || canDispute;
    final isReceiver = payment.isReceiver(currentUserProfileId);
    final isPayer = payment.isPayer(currentUserProfileId);
    final pendingResiduals = payment.residuals
        .where((residual) => residual.canConfirm)
        .toList(growable: false);
    final confirmBlockedByResidual =
        isReceiver &&
        payment.status == SettleoraSettlementPaymentStatusValues.markedPaid &&
        pendingResiduals.isNotEmpty;
    final canActOnPendingResiduals = isReceiver && pendingResiduals.isNotEmpty;

    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            MoneyText(
              amount: payment.amount,
              currencyCode: payment.currency,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            SettleoraKeyValueMoneyText(
              label: 'Actual paid',
              amount: payment.amount,
              currencyCode: payment.currency,
            ),
            SettleoraKeyValueText(
              label: 'Payment date',
              value: payment.paymentDate,
            ),
            SettleoraKeyValueText(
              label: 'Status',
              value: settleoraSettlementPaymentStatusLabel(payment.status),
            ),
            SettleoraKeyValueText(
              label: 'Allocations',
              value: '${payment.allocations.length}',
            ),
            if (payment.allocations.isNotEmpty) ...[
              const SizedBox(height: 4),
              _AllocationList(allocations: payment.allocations),
            ],
            if (payment.residuals.isNotEmpty)
              _ResidualList(
                paymentIndex: index,
                residuals: payment.residuals,
                canConfirmResiduals: isReceiver,
                busyAction: busyAction,
                onConfirmResidual: onConfirmResidual,
              ),
            if (confirmBlockedByResidual) ...[
              const SizedBox(height: 8),
              Text(
                'Receipt confirmation is blocked until pending receiver-confirmation residuals are resolved by the API.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ] else if (isPayer &&
                payment.status ==
                    SettleoraSettlementPaymentStatusValues.markedPaid) ...[
              const SizedBox(height: 8),
              Text(
                'Waiting for the receiver to confirm this actual paid amount against the server-selected request lines.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ],
            if (hasPaymentActions || canActOnPendingResiduals) ...[
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (canConfirm)
                    FilledButton.icon(
                      key: ValueKey('settlement-payment-confirm-$index'),
                      onPressed: busyAction == null ? onConfirmPayment : null,
                      icon: busyAction == 'payment-confirm-${payment.id}'
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.check_outlined),
                      label: const Text('Confirm'),
                    ),
                  if (canCancel)
                    OutlinedButton.icon(
                      key: ValueKey('settlement-payment-cancel-$index'),
                      onPressed: busyAction == null ? onCancelPayment : null,
                      icon: busyAction == 'payment-cancel-${payment.id}'
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.close_outlined),
                      label: const Text('Cancel'),
                    ),
                  if (canDispute)
                    OutlinedButton.icon(
                      key: ValueKey('settlement-payment-dispute-$index'),
                      onPressed: busyAction == null ? onDisputePayment : null,
                      icon: busyAction == 'payment-dispute-${payment.id}'
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.report_problem_outlined),
                      label: const Text('Dispute'),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _AllocationList extends StatelessWidget {
  const _AllocationList({required this.allocations});

  final List<SettleoraSettlementPaymentAllocation> allocations;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var index = 0; index < allocations.length; index += 1)
          SettleoraKeyValueMoneyText(
            label: 'Allocation ${index + 1}',
            amount: allocations[index].clearedAmount,
            currencyCode: allocations[index].currency,
          ),
        Padding(
          padding: const EdgeInsets.only(top: 3),
          child: Text(
            'Allocation rows show clearing details for the loaded selected lines.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ),
      ],
    );
  }
}

class _ResidualList extends StatelessWidget {
  const _ResidualList({
    required this.paymentIndex,
    required this.residuals,
    required this.canConfirmResiduals,
    required this.busyAction,
    required this.onConfirmResidual,
  });

  final int paymentIndex;
  final List<SettleoraSettlementPaymentResidual> residuals;
  final bool canConfirmResiduals;
  final String? busyAction;
  final void Function(SettleoraSettlementPaymentResidual residual)
  onConfirmResidual;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Residuals', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 6),
          for (var index = 0; index < residuals.length; index += 1)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _AmountStatusText(
                          amount: residuals[index].amount,
                          currency: residuals[index].currency,
                          status: settleoraSettlementResidualStatusLabel(
                            residuals[index].status,
                          ),
                        ),
                        Text(
                          '${settleoraSettlementResidualDirectionLabel(residuals[index].direction)} / ${settleoraSettlementResidualPolicyLabel(residuals[index].policy)}',
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurfaceVariant,
                              ),
                        ),
                        if (residuals[index].canConfirm)
                          Text(
                            'Pending receiver confirmation',
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(
                                  color: Theme.of(
                                    context,
                                  ).colorScheme.onSurfaceVariant,
                                ),
                          ),
                      ],
                    ),
                  ),
                  if (canConfirmResiduals && residuals[index].canConfirm)
                    TextButton.icon(
                      key: ValueKey(
                        'settlement-residual-confirm-$paymentIndex-$index',
                      ),
                      onPressed: busyAction == null
                          ? () => onConfirmResidual(residuals[index])
                          : null,
                      icon:
                          busyAction ==
                              'residual-confirm-${residuals[index].id}'
                          ? const SizedBox.square(
                              dimension: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.check_outlined),
                      label: const Text('Confirm'),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _SettlementPaymentClaimDraft {
  const _SettlementPaymentClaimDraft({
    required this.amount,
    required this.currency,
    required this.paymentDate,
  });

  final String amount;
  final String currency;
  final String paymentDate;
}

Future<_SettlementPaymentClaimDraft?> _showMarkPaymentPaidDialog({
  required BuildContext context,
  required String amount,
  required String currency,
  required String paymentDate,
}) async {
  return showDialog<_SettlementPaymentClaimDraft>(
    context: context,
    builder: (context) => _MarkPaymentPaidDialog(
      amount: amount,
      currency: currency,
      paymentDate: paymentDate,
    ),
  );
}

class _MarkPaymentPaidDialog extends StatefulWidget {
  const _MarkPaymentPaidDialog({
    required this.amount,
    required this.currency,
    required this.paymentDate,
  });

  final String amount;
  final String currency;
  final String paymentDate;

  @override
  State<_MarkPaymentPaidDialog> createState() => _MarkPaymentPaidDialogState();
}

class _MarkPaymentPaidDialogState extends State<_MarkPaymentPaidDialog> {
  late final TextEditingController _amountController;
  late final TextEditingController _currencyController;
  late final TextEditingController _paymentDateController;
  String? _errorText;

  @override
  void initState() {
    super.initState();
    _amountController = TextEditingController(text: widget.amount);
    _currencyController = TextEditingController(text: widget.currency);
    _paymentDateController = TextEditingController(text: widget.paymentDate);
  }

  @override
  void dispose() {
    _amountController.dispose();
    _currencyController.dispose();
    _paymentDateController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Mark settlement paid?'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Mark paid only after sending payment. Access, settlement state, residual handling, audit, and money are checked before the claim is saved.',
            ),
            const SizedBox(height: 14),
            MoneyAmountCurrencyField(
              amountKey: const Key('settlement-mark-paid-amount'),
              currencyKey: const Key('settlement-mark-paid-currency'),
              amountController: _amountController,
              currencyValue: _currencyController.text,
              onCurrencyChanged: (currency) {
                setState(() {
                  _currencyController.text = currency ?? '';
                });
              },
              amountLabel: 'Amount',
              currencyLabel: 'Currency',
            ),
            const SizedBox(height: 10),
            TextField(
              key: const Key('settlement-mark-paid-date'),
              controller: _paymentDateController,
              decoration: const InputDecoration(
                labelText: 'Payment date',
                helperText: 'Use yyyy-mm-dd.',
              ),
              keyboardType: TextInputType.datetime,
            ),
            if (_errorText != null) ...[
              const SizedBox(height: 10),
              Text(
                _errorText!,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.error,
                ),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Back'),
        ),
        FilledButton(
          key: const Key('settlement-mark-paid-submit'),
          onPressed: _submit,
          child: const Text('Mark paid'),
        ),
      ],
    );
  }

  void _submit() {
    final amount = _amountController.text.trim();
    final currency = _currencyController.text.trim();
    final paymentDate = _paymentDateController.text.trim();
    if (amount.isEmpty || currency.isEmpty || paymentDate.isEmpty) {
      setState(() {
        _errorText =
            'Enter amount, currency, and payment date before marking paid.';
      });
      return;
    }

    Navigator.of(context).pop(
      _SettlementPaymentClaimDraft(
        amount: amount,
        currency: currency,
        paymentDate: paymentDate,
      ),
    );
  }
}

class _FailurePanel extends StatelessWidget {
  const _FailurePanel({required this.failure, required this.onRetry});

  final SettleoraSettlementFailure failure;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return SettleoraStatePanel(
      icon: _failureIcon(failure.kind),
      title: failure.title,
      message: failure.message,
      action: OutlinedButton.icon(
        onPressed: onRetry,
        icon: const Icon(Icons.refresh),
        label: const Text('Retry'),
      ),
    );
  }
}

class _GuidancePanel extends StatelessWidget {
  const _GuidancePanel({
    required this.icon,
    required this.title,
    required this.message,
    required this.chips,
    this.chipWidgets = const [],
  });

  final IconData icon;
  final String title;
  final String message;
  final List<String> chips;
  final List<Widget> chipWidgets;

  @override
  Widget build(BuildContext context) {
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
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, color: Theme.of(context).colorScheme.primary),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                      const SizedBox(height: 4),
                      Text(message),
                    ],
                  ),
                ),
              ],
            ),
            if (chips.isNotEmpty || chipWidgets.isNotEmpty) ...[
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  for (final chip in chips)
                    SettleoraStatusChip(label: chip, icon: Icons.info_outline),
                  ...chipWidgets,
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _KeyValueAmountStatusText extends StatelessWidget {
  const _KeyValueAmountStatusText({
    required this.label,
    required this.amount,
    required this.currency,
    required this.status,
  });

  final String label;
  final String amount;
  final String currency;
  final String status;

  @override
  Widget build(BuildContext context) {
    return SettleoraKeyValueRow(
      label: label,
      value: _AmountStatusText(
        amount: amount,
        currency: currency,
        status: status,
        alignment: WrapAlignment.end,
      ),
    );
  }
}

class _AmountStatusText extends StatelessWidget {
  const _AmountStatusText({
    required this.amount,
    required this.currency,
    required this.status,
    this.alignment = WrapAlignment.start,
  });

  final String amount;
  final String currency;
  final String status;
  final WrapAlignment alignment;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      alignment: alignment,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        MoneyText(
          amount: amount,
          currencyCode: currency,
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(width: 4),
        Text(status, style: Theme.of(context).textTheme.bodyMedium),
      ],
    );
  }
}

class _SoftMoneyChip extends StatelessWidget {
  const _SoftMoneyChip({
    required this.label,
    required this.amount,
    required this.currency,
    required this.icon,
  });

  final String label;
  final String amount;
  final String currency;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Chip(
      visualDensity: VisualDensity.compact,
      backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
      avatar: Icon(icon, size: 16),
      label: Wrap(
        spacing: 4,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Text(label),
          MoneyText(
            amount: amount,
            currencyCode: currency,
            style: Theme.of(context).textTheme.labelLarge,
          ),
        ],
      ),
    );
  }
}

IconData _failureIcon(SettleoraSettlementFailureKind kind) {
  return switch (kind) {
    SettleoraSettlementFailureKind.sessionRequired => Icons.lock_outline,
    SettleoraSettlementFailureKind.sessionExpired => Icons.lock_outline,
    SettleoraSettlementFailureKind.denied => Icons.no_accounts_outlined,
    SettleoraSettlementFailureKind.unavailable => Icons.visibility_off_outlined,
    SettleoraSettlementFailureKind.conflict => Icons.sync_problem_outlined,
    SettleoraSettlementFailureKind.validation => Icons.report_problem_outlined,
    SettleoraSettlementFailureKind.network => Icons.cloud_off_outlined,
    SettleoraSettlementFailureKind.server => Icons.error_outline,
  };
}

String _settlementActionFailureMessage(Object error) {
  final failure = SettleoraSettlementFailure.from(error);
  return switch (failure.kind) {
    SettleoraSettlementFailureKind.sessionRequired =>
      'Sign in before asking the API to change this settlement.',
    SettleoraSettlementFailureKind.sessionExpired =>
      'Your session expired. Sign in again before changing this settlement.',
    SettleoraSettlementFailureKind.denied =>
      'The API did not allow this settlement action for the current account.',
    SettleoraSettlementFailureKind.unavailable =>
      'This settlement action is no longer available. Refresh before trying again.',
    SettleoraSettlementFailureKind.conflict =>
      'The settlement changed on the server. Refresh before trying again.',
    SettleoraSettlementFailureKind.validation =>
      'The API rejected this settlement action. Refresh and review the loaded state before trying again.',
    SettleoraSettlementFailureKind.network =>
      'The API could not be reached. The loaded settlement state was kept; retry when the connection is back.',
    SettleoraSettlementFailureKind.server =>
      'The API could not complete this settlement action right now. The loaded settlement state was kept.',
  };
}

bool _isOpenRequest(SettleoraSettlementRequest request) {
  return request.status == SettleoraSettlementRequestStatusValues.requested ||
      request.status == SettleoraSettlementRequestStatusValues.partiallyPaid ||
      request.status == SettleoraSettlementRequestStatusValues.markedPaid;
}

bool _requestNeedsAction(
  SettleoraSettlementRequest request,
  String currentUserProfileId,
) {
  if (request.status == SettleoraSettlementRequestStatusValues.requested) {
    return request.isDebtor(currentUserProfileId);
  }

  if (request.status == SettleoraSettlementRequestStatusValues.partiallyPaid ||
      request.status == SettleoraSettlementRequestStatusValues.markedPaid) {
    return request.isCreditor(currentUserProfileId);
  }

  return false;
}

String _plural(int count) => count == 1 ? '' : 's';

bool _amountStringLooksNonZero(String value) {
  final normalized = value.trim().replaceAll('-', '').replaceAll('.', '');
  return normalized.runes.any((codeUnit) => codeUnit >= 49 && codeUnit <= 57);
}

String _requestSearchText({
  required SettleoraSettlementRequest request,
  required String currentUserProfileId,
}) {
  final isIncoming = request.isCreditor(currentUserProfileId);
  final isOutgoing = request.isDebtor(currentUserProfileId);
  final tokens = <String>[
    request.amount,
    request.currency,
    _money(request.amount, request.currency),
    request.status,
    settleoraSettlementRequestStatusLabel(request.status),
    if (isIncoming) ...['incoming', 'receive', 'creditor'],
    if (isOutgoing) ...['outgoing', 'pay', 'debtor'],
    '${request.lines.length} ${request.lines.length == 1 ? 'line' : 'lines'}',
    for (final (index, line) in request.lines.indexed)
      ..._requestLineSearchTokens(line, index),
  ];

  return tokens.join(' ').toLowerCase();
}

List<String> _requestLineSearchTokens(
  SettleoraSettlementRequestLine line,
  int index,
) {
  final displayOrder = index + 1;
  return [
    line.exactAmount,
    line.currency,
    _money(line.exactAmount, line.currency),
    line.status,
    settleoraSettlementRequestLineStatusLabel(line.status),
    'line $displayOrder',
  ];
}

List<String> _searchTerms(String query) {
  return query
      .toLowerCase()
      .split(RegExp(r'\s+'))
      .where((term) => term.isNotEmpty)
      .toList(growable: false);
}

String _lineSearchText(SettleoraSettlementRequestLine line) {
  final tokens = <String>[
    line.exactAmount,
    line.currency,
    _money(line.exactAmount, line.currency),
    line.status,
    settleoraSettlementRequestLineStatusLabel(line.status),
  ];

  return tokens.join(' ').toLowerCase();
}

String _paymentSearchText({
  required SettleoraSettlementPayment payment,
  required String currentUserProfileId,
}) {
  final isPayer = payment.isPayer(currentUserProfileId);
  final isReceiver = payment.isReceiver(currentUserProfileId);
  final canConfirm = payment.canConfirmFor(currentUserProfileId);
  final canCancel = payment.canCancelFor(currentUserProfileId);
  final canDispute = payment.canDisputeFor(currentUserProfileId);
  final canConfirmResidual =
      isReceiver && payment.residuals.any((residual) => residual.canConfirm);
  final tokens = <String>[
    payment.amount,
    payment.currency,
    _money(payment.amount, payment.currency),
    payment.paymentDate,
    payment.status,
    settleoraSettlementPaymentStatusLabel(payment.status),
    if (isPayer) ...['payer', 'paid by you', 'outgoing'],
    if (isReceiver) ...['receiver', 'received by you', 'incoming'],
    if (canConfirm) 'confirm receipt available',
    if (canCancel) 'cancel available',
    if (canDispute) 'dispute available',
    if (canConfirmResidual) 'residual confirmation available',
    for (final allocation in payment.allocations) ...[
      allocation.clearedAmount,
      allocation.currency,
      _money(allocation.clearedAmount, allocation.currency),
    ],
    for (final residual in payment.residuals) ...[
      residual.amount,
      residual.currency,
      _money(residual.amount, residual.currency),
      residual.direction,
      settleoraSettlementResidualDirectionLabel(residual.direction),
      residual.policy,
      settleoraSettlementResidualPolicyLabel(residual.policy),
      residual.status,
      settleoraSettlementResidualStatusLabel(residual.status),
      if (residual.canConfirm) 'needs confirmation',
    ],
  ];

  return tokens.join(' ').toLowerCase();
}

String _requestRoleLabel({
  required SettleoraSettlementRequest request,
  required String currentUserProfileId,
}) {
  if (request.isDebtor(currentUserProfileId)) {
    return 'You pay';
  }

  if (request.isCreditor(currentUserProfileId)) {
    return 'You receive';
  }

  return 'Viewer';
}

String _money(String amount, String currency) {
  return '$amount $currency';
}

String _formatTimestamp(DateTime value) {
  return value.toLocal().toString().split('.').first;
}

String _formatDate(DateTime value) {
  final local = value.toLocal();
  final year = local.year.toString().padLeft(4, '0');
  final month = local.month.toString().padLeft(2, '0');
  final day = local.day.toString().padLeft(2, '0');
  return '$year-$month-$day';
}

String _fallback(String? value, String fallback) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return fallback;
  }

  return trimmed;
}

bool _hasText(String? value) {
  final trimmed = value?.trim();
  return trimmed != null && trimmed.isNotEmpty;
}
