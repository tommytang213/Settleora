import 'package:flutter/material.dart';

import 'settlement_repository.dart';

class SettleoraSettlementListScreen extends StatefulWidget {
  const SettleoraSettlementListScreen({
    super.key,
    required this.repository,
    required this.currentUserProfileId,
  });

  final SettleoraSettlementRepository repository;
  final String currentUserProfileId;

  @override
  State<SettleoraSettlementListScreen> createState() =>
      _SettleoraSettlementListScreenState();
}

class _SettleoraSettlementListScreenState
    extends State<SettleoraSettlementListScreen> {
  bool _isLoading = true;
  SettleoraSettlementBalanceSnapshot? _balanceSnapshot;
  List<SettleoraSettlementRequest> _requests = const [];
  SettleoraSettlementFailure? _failure;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
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
              return const _LoadingPanel(label: 'Loading settlements');
            }

            final failure = _failure;
            if (failure != null) {
              return _FailurePanel(failure: failure, onRetry: _load);
            }

            final balanceSnapshot = _balanceSnapshot;
            return RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                children: [
                  _BalanceSection(snapshot: balanceSnapshot),
                  const SizedBox(height: 20),
                  _RequestSection(requests: _requests, onTap: _openRequest),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
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
  bool _isLoading = true;
  String? _busyAction;
  SettleoraSettlementRequest? _request;
  List<SettleoraSettlementPayment> _payments = const [];
  SettleoraSettlementCounterpartyPaymentDetails? _paymentDetails;
  SettleoraSettlementFailure? _paymentDetailsFailure;
  SettleoraSettlementFailure? _failure;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  Future<void> _load({bool showLoading = true}) async {
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

      setState(() {
        _failure = SettleoraSettlementFailure.from(error);
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
      await _load(showLoading: false);
      if (!mounted) {
        return;
      }

      _showSnackBar(successMessage);
    } catch (error) {
      if (!mounted) {
        return;
      }

      _showSnackBar(SettleoraSettlementFailure.from(error).message);
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
              return const _LoadingPanel(label: 'Loading settlement');
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
                        'This cancels the requested settlement if no payment has been recorded. The server will verify whether this account can cancel it.',
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
                        'This flags the settlement for correction. This mobile seam does not support sending a reason yet.',
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
                _RequestLinesSection(lines: request.lines),
                const SizedBox(height: 20),
                _PaymentsSection(
                  payments: _payments,
                  currentUserProfileId: widget.currentUserProfileId,
                  busyAction: _busyAction,
                  onConfirmPayment: (payment) => _confirmAndRunAction(
                    actionKey: 'payment-confirm-${payment.id}',
                    title: 'Confirm receipt?',
                    message:
                        'Confirm only if you received this payment. The server will update the settlement state and audit the action.',
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
                        'This cancels your marked-paid claim for this settlement payment.',
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
                        'This flags the marked-paid claim for correction. This mobile seam does not support sending a reason yet.',
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
                        'Confirm this remaining amount handling only if it matches what you agreed. The server will decide the resulting settlement state.',
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
}

class _BalanceSection extends StatelessWidget {
  const _BalanceSection({required this.snapshot});

  final SettleoraSettlementBalanceSnapshot? snapshot;

  @override
  Widget build(BuildContext context) {
    final snapshot = this.snapshot;
    final balances = snapshot?.balances ?? const <SettleoraSettlementBalance>[];

    if (balances.isEmpty) {
      return const _Section(
        title: 'Balances',
        children: [
          _StatePanel(
            icon: Icons.account_balance_wallet_outlined,
            title: 'No balances',
            message: 'Current settlement balances will appear here.',
            compact: true,
          ),
        ],
      );
    }

    return _Section(
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
              _KeyValueText(
                label: 'Remaining',
                value: _money(
                  balance.remainingUnclaimedAmount,
                  balance.currency,
                ),
              ),
              _KeyValueText(
                label: 'Pending',
                value: _money(balance.pendingClaimedAmount, balance.currency),
              ),
              _KeyValueText(
                label: 'Cleared',
                value: _money(balance.confirmedClearedAmount, balance.currency),
              ),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  _SoftChip(
                    label: '${balance.requestCount} requests',
                    icon: Icons.receipt_long_outlined,
                  ),
                  _SoftChip(
                    label: '${balance.pendingPaymentCount} pending payments',
                    icon: Icons.pending_actions_outlined,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RequestSection extends StatelessWidget {
  const _RequestSection({required this.requests, required this.onTap});

  final List<SettleoraSettlementRequest> requests;
  final void Function(SettleoraSettlementRequest request) onTap;

  @override
  Widget build(BuildContext context) {
    if (requests.isEmpty) {
      return const _Section(
        title: 'Requests',
        children: [
          _StatePanel(
            icon: Icons.handshake_outlined,
            title: 'No settlement requests',
            message: 'Visible settlement requests will appear here.',
            compact: true,
          ),
        ],
      );
    }

    return _Section(
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
        title: Text(_money(request.amount, request.currency)),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              _SoftChip(
                label: settleoraSettlementRequestStatusLabel(request.status),
                icon: Icons.assignment_outlined,
              ),
              _SoftChip(
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
        Text(
          _money(request.amount, request.currency),
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 10),
        _KeyValueText(
          label: 'Status',
          value: settleoraSettlementRequestStatusLabel(request.status),
        ),
        _KeyValueText(
          label: 'Requested',
          value: _formatTimestamp(request.requestedAtUtc),
        ),
        _KeyValueText(label: 'Lines', value: '${request.lines.length}'),
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

    return _Section(
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
                  'Use the counterparty payment details, then mark this settlement paid after sending payment. The server verifies the payment claim and keeps the audit trail.',
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
      message:
          'This settlement needs correction outside the current mobile action seam before it can proceed.',
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
      return const _Section(
        title: 'Counterparty Payment Details',
        children: [
          _StatePanel(
            icon: Icons.account_balance_outlined,
            title: 'No payment details',
            message: 'No settlement counterparty details are available.',
            compact: true,
          ),
        ],
      );
    }

    if (failure != null) {
      return _Section(
        title: 'Counterparty Payment Details',
        children: [
          _StatePanel(
            icon: Icons.visibility_off_outlined,
            title: failure.title,
            message: failure.message,
            compact: true,
          ),
        ],
      );
    }

    if (details == null || !details.isConfigured) {
      return const _Section(
        title: 'Counterparty Payment Details',
        children: [
          _StatePanel(
            icon: Icons.account_balance_outlined,
            title: 'Not configured',
            message: 'The counterparty has no visible payment details.',
            compact: true,
          ),
        ],
      );
    }

    return _Section(
      title: 'Counterparty Payment Details',
      children: [
        _KeyValueText(
          label: 'Method',
          value: _fallback(details.preferredMethodLabel, 'Payment method'),
        ),
        if (_hasText(details.paymentHandle))
          _KeyValueText(label: 'Handle', value: details.paymentHandle!.trim()),
        if (_hasText(details.paymentNote))
          _KeyValueText(label: 'Note', value: details.paymentNote!.trim()),
        _KeyValueText(
          label: 'QR',
          value: details.hasQrFile ? 'Available' : 'Not linked',
        ),
      ],
    );
  }
}

class _RequestLinesSection extends StatelessWidget {
  const _RequestLinesSection({required this.lines});

  final List<SettleoraSettlementRequestLine> lines;

  @override
  Widget build(BuildContext context) {
    if (lines.isEmpty) {
      return const _Section(
        title: 'Request Lines',
        children: [
          _StatePanel(
            icon: Icons.format_list_bulleted,
            title: 'No request lines',
            message: 'No selected settlement lines are visible.',
            compact: true,
          ),
        ],
      );
    }

    final sorted = [...lines]
      ..sort(
        (left, right) => left.allocationOrder.compareTo(right.allocationOrder),
      );

    return _Section(
      title: 'Request Lines',
      children: [
        for (var index = 0; index < sorted.length; index += 1)
          _KeyValueText(
            label: 'Line ${index + 1}',
            value:
                '${_money(sorted[index].exactAmount, sorted[index].currency)} - ${settleoraSettlementRequestLineStatusLabel(sorted[index].status)}',
          ),
      ],
    );
  }
}

class _PaymentsSection extends StatelessWidget {
  const _PaymentsSection({
    required this.payments,
    required this.currentUserProfileId,
    required this.busyAction,
    required this.onConfirmPayment,
    required this.onCancelPayment,
    required this.onDisputePayment,
    required this.onConfirmResidual,
  });

  final List<SettleoraSettlementPayment> payments;
  final String currentUserProfileId;
  final String? busyAction;
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
    if (payments.isEmpty) {
      return const _Section(
        title: 'Payments',
        children: [
          _StatePanel(
            icon: Icons.payments_outlined,
            title: 'No payments',
            message: 'Payment claims for this settlement will appear here.',
            compact: true,
          ),
        ],
      );
    }

    return _Section(
      title: 'Payments',
      children: [
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
            Text(
              _money(payment.amount, payment.currency),
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            _KeyValueText(label: 'Payment date', value: payment.paymentDate),
            _KeyValueText(
              label: 'Status',
              value: settleoraSettlementPaymentStatusLabel(payment.status),
            ),
            _KeyValueText(
              label: 'Allocations',
              value: '${payment.allocations.length}',
            ),
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
                'Receipt confirmation is blocked until pending residuals are confirmed.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ] else if (isPayer &&
                payment.status ==
                    SettleoraSettlementPaymentStatusValues.markedPaid) ...[
              const SizedBox(height: 8),
              Text(
                'Waiting for the receiver to confirm this payment.',
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
                    child: Text(
                      '${_money(residuals[index].amount, residuals[index].currency)} - ${settleoraSettlementResidualStatusLabel(residuals[index].status)}',
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
              'Mark paid only after sending payment. The server will verify the claim, update settlement state, and keep the audit trail.',
            ),
            const SizedBox(height: 14),
            TextField(
              key: const Key('settlement-mark-paid-amount'),
              controller: _amountController,
              decoration: const InputDecoration(labelText: 'Amount'),
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              key: const Key('settlement-mark-paid-currency'),
              controller: _currencyController,
              decoration: const InputDecoration(labelText: 'Currency'),
              textCapitalization: TextCapitalization.characters,
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
    return _StatePanel(
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
  });

  final IconData icon;
  final String title;
  final String message;
  final List<String> chips;

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
            if (chips.isNotEmpty) ...[
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  for (final chip in chips)
                    _SoftChip(label: chip, icon: Icons.info_outline),
                ],
              ),
            ],
          ],
        ),
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
      return Align(
        alignment: Alignment.centerLeft,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: content,
        ),
      );
    }

    return Center(
      child: Padding(padding: const EdgeInsets.all(24), child: content),
    );
  }
}

class _LoadingPanel extends StatelessWidget {
  const _LoadingPanel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(),
          const SizedBox(height: 14),
          Text(label),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children, this.trailing});

  final String title;
  final List<Widget> children;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                title,
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            ?trailing,
          ],
        ),
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
            width: 132,
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

class _SoftChip extends StatelessWidget {
  const _SoftChip({required this.label, required this.icon});

  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Chip(
      visualDensity: VisualDensity.compact,
      backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
      avatar: Icon(icon, size: 16),
      label: Text(label),
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
