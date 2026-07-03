import 'package:flutter/material.dart';

import '../ui/settleora_components.dart'
    show
        AppCard,
        MoneyText,
        SettleoraCompactHeader,
        SettleoraInlinePanel,
        SettleoraKeyValueMoneyText,
        SettleoraKeyValueText,
        SettleoraLoadingPanel,
        SettleoraStatePanel,
        SettleoraSurfaceVariant;
import 'bill_revision_proposal_editor_screen.dart';
import 'bill_revision_repository.dart';

class SettleoraBillRevisionReviewScreen extends StatefulWidget {
  const SettleoraBillRevisionReviewScreen({
    super.key,
    required this.repository,
    required this.billId,
    required this.revisionId,
    required this.billLabel,
  });

  final SettleoraBillRevisionRepository repository;
  final String billId;
  final String revisionId;
  final String billLabel;

  @override
  State<SettleoraBillRevisionReviewScreen> createState() =>
      _SettleoraBillRevisionReviewScreenState();
}

class _SettleoraBillRevisionReviewScreenState
    extends State<SettleoraBillRevisionReviewScreen> {
  bool _isLoading = true;
  bool _isActing = false;
  bool _viewModeTouched = false;
  SettleoraBillRevision? _revision;
  SettleoraBillRevisionFailure? _failure;
  SettleoraBillRevisionFailure? _actionFailure;
  String? _actionNotice;
  SettleoraBillRevisionReviewViewMode _viewMode =
      SettleoraBillRevisionReviewViewModeValues.fullBill;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _failure = null;
      _actionFailure = null;
      _actionNotice = null;
    });

    try {
      final revision = await widget.repository.getBillRevision(
        widget.billId,
        widget.revisionId,
      );
      if (!mounted) {
        return;
      }

      setState(() {
        _revision = revision;
        if (!_viewModeTouched) {
          _viewMode = _preferredViewMode(revision);
        } else if (_viewMode ==
                SettleoraBillRevisionReviewViewModeValues.changedOnly &&
            !_changedOnlyAvailable(revision)) {
          _viewMode = SettleoraBillRevisionReviewViewModeValues.fullBill;
        }
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _failure = SettleoraBillRevisionFailure.from(error);
        _isLoading = false;
      });
    }
  }

  Future<void> _approve() async {
    if (_isActing) {
      return;
    }

    setState(() {
      _isActing = true;
      _actionFailure = null;
      _actionNotice = null;
    });

    try {
      final fresh = await widget.repository.getBillRevision(
        widget.billId,
        widget.revisionId,
      );
      if (!fresh.canApprove) {
        throw const SettleoraBillRevisionFailure(
          kind: SettleoraBillRevisionFailureKind.conflict,
          message:
              'This revision is not currently open for your approval. Review the refreshed status.',
        );
      }

      final updated = await widget.repository.approveBillRevision(fresh);
      if (!mounted) {
        return;
      }

      setState(() {
        _revision = updated;
        _viewMode = _viewModeTouched ? _viewMode : _preferredViewMode(updated);
        _actionNotice = 'Revision approval recorded.';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _actionFailure = SettleoraBillRevisionFailure.from(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isActing = false;
        });
      }
    }
  }

  Future<void> _submit() {
    return _runLifecycleAction(
      isAllowed: (revision) => revision.canSubmit,
      mutate: (revision) =>
          widget.repository.submitBillRevision(revision.billId, revision.id),
      conflictMessage:
          'This revision is no longer open for submission. Review the refreshed status.',
      successNotice: 'Revision submitted for review.',
    );
  }

  Future<void> _withdraw() {
    return _runLifecycleAction(
      isAllowed: (revision) => revision.canWithdraw,
      mutate: (revision) =>
          widget.repository.withdrawBillRevision(revision.billId, revision.id),
      conflictMessage:
          'This revision is no longer open for withdrawal. Review the refreshed status.',
      successNotice: 'Revision withdrawn. The active bill was not changed.',
    );
  }

  Future<void> _apply() {
    return _runLifecycleAction(
      isAllowed: (revision) => revision.canApply,
      mutate: (revision) =>
          widget.repository.applyBillRevision(revision.billId, revision.id),
      conflictMessage:
          'This revision is no longer open for apply. Review the refreshed status.',
      successNotice: 'Revision applied to the active bill.',
    );
  }

  Future<void> _openReviseEditor() async {
    if (_isActing) {
      return;
    }

    setState(() {
      _isActing = true;
      _actionFailure = null;
      _actionNotice = null;
    });

    late final SettleoraBillRevision fresh;
    try {
      final refreshed = await widget.repository.getBillRevision(
        widget.billId,
        widget.revisionId,
      );
      fresh = refreshed;
      if (!refreshed.canRevise) {
        if (mounted) {
          setState(() {
            _revision = refreshed;
            _viewMode = _viewModeTouched
                ? _viewMode
                : _preferredViewMode(refreshed);
          });
        }
        throw const SettleoraBillRevisionFailure(
          kind: SettleoraBillRevisionFailureKind.conflict,
          message:
              'This proposal can no longer be revised. Review the refreshed status.',
        );
      }
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _actionFailure = SettleoraBillRevisionFailure.from(error);
        _isActing = false;
      });
      return;
    }

    if (!mounted) {
      return;
    }

    setState(() {
      _isActing = false;
    });

    final updated = await Navigator.of(context).push<SettleoraBillRevision>(
      MaterialPageRoute(
        builder: (_) => SettleoraBillRevisionProposalEditorScreen.revise(
          repository: widget.repository,
          revision: fresh,
          billLabel: widget.billLabel,
        ),
      ),
    );

    if (!mounted || updated == null) {
      return;
    }

    setState(() {
      _revision = updated;
      _viewMode = _viewModeTouched ? _viewMode : _preferredViewMode(updated);
      _actionNotice = 'Replacement proposal submitted for review.';
    });
  }

  Future<void> _runLifecycleAction({
    required bool Function(SettleoraBillRevision revision) isAllowed,
    required Future<SettleoraBillRevision> Function(
      SettleoraBillRevision revision,
    )
    mutate,
    required String conflictMessage,
    required String successNotice,
  }) async {
    if (_isActing) {
      return;
    }

    setState(() {
      _isActing = true;
      _actionFailure = null;
      _actionNotice = null;
    });

    try {
      final fresh = await widget.repository.getBillRevision(
        widget.billId,
        widget.revisionId,
      );
      if (!isAllowed(fresh)) {
        if (mounted) {
          setState(() {
            _revision = fresh;
            _viewMode = _viewModeTouched
                ? _viewMode
                : _preferredViewMode(fresh);
          });
        }
        throw SettleoraBillRevisionFailure(
          kind: SettleoraBillRevisionFailureKind.conflict,
          message: conflictMessage,
        );
      }

      final updated = await mutate(fresh);
      if (!mounted) {
        return;
      }

      setState(() {
        _revision = updated;
        _viewMode = _viewModeTouched ? _viewMode : _preferredViewMode(updated);
        _actionNotice = successNotice;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _actionFailure = SettleoraBillRevisionFailure.from(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isActing = false;
        });
      }
    }
  }

  Future<void> _confirmReject() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Reject this revision?'),
        content: const Text(
          'You are rejecting this proposed correction. The active bill is not changed by this action.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            key: const Key('bill-revision-reject-confirm'),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Reject'),
          ),
        ],
      ),
    );

    if (confirmed ?? false) {
      await _reject();
    }
  }

  Future<void> _reject() async {
    if (_isActing) {
      return;
    }

    setState(() {
      _isActing = true;
      _actionFailure = null;
      _actionNotice = null;
    });

    try {
      final fresh = await widget.repository.getBillRevision(
        widget.billId,
        widget.revisionId,
      );
      if (!fresh.canReject) {
        setState(() {
          _revision = fresh;
        });
        throw const SettleoraBillRevisionFailure(
          kind: SettleoraBillRevisionFailureKind.conflict,
          message:
              'This revision is no longer open for rejection. Review the refreshed status.',
        );
      }

      final updated = await widget.repository.rejectBillRevision(
        fresh.billId,
        fresh.id,
      );
      if (!mounted) {
        return;
      }

      setState(() {
        _revision = updated;
        _viewMode = _viewModeTouched ? _viewMode : _preferredViewMode(updated);
        _actionNotice = 'Revision rejected. The active bill was not changed.';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _actionFailure = SettleoraBillRevisionFailure.from(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isActing = false;
        });
      }
    }
  }

  Future<void> _confirmPayer() async {
    if (_isActing) {
      return;
    }

    setState(() {
      _isActing = true;
      _actionFailure = null;
      _actionNotice = null;
    });

    try {
      final fresh = await widget.repository.getBillRevision(
        widget.billId,
        widget.revisionId,
      );
      if (!fresh.canConfirmPayer) {
        setState(() {
          _revision = fresh;
        });
        throw const SettleoraBillRevisionFailure(
          kind: SettleoraBillRevisionFailureKind.conflict,
          message:
              'This revision is no longer open for your payer confirmation. Review the refreshed status.',
        );
      }

      final confirmed = await widget.repository.confirmBillRevisionPayer(fresh);
      final updated = await widget.repository.getBillRevision(
        confirmed.billId,
        confirmed.id,
      );
      if (!mounted) {
        return;
      }

      setState(() {
        _revision = updated;
        _viewMode = _viewModeTouched ? _viewMode : _preferredViewMode(updated);
        _actionNotice = 'Payer confirmation recorded.';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _actionFailure = SettleoraBillRevisionFailure.from(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isActing = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final revision = _revision;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Revision review'),
        actions: [
          IconButton(
            key: const Key('bill-revision-review-refresh'),
            onPressed: _isLoading || _isActing ? null : _load,
            tooltip: 'Refresh',
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: Builder(
          builder: (context) {
            if (_isLoading && revision == null) {
              return const _RevisionLoadingPanel();
            }

            final failure = _failure;
            if (failure != null && revision == null) {
              return _RevisionFailurePanel(failure: failure, onRetry: _load);
            }

            if (revision == null) {
              return _RevisionFailurePanel(
                failure: const SettleoraBillRevisionFailure(
                  kind: SettleoraBillRevisionFailureKind.unavailable,
                  message: 'No bill revision is available for review.',
                ),
                onRetry: _load,
              );
            }

            return RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                // ignore: deprecated_member_use
                cacheExtent: 10000,
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
                children: [
                  if (_isLoading) ...[
                    const LinearProgressIndicator(),
                    const SizedBox(height: 12),
                  ],
                  if (failure != null) ...[
                    _InlineRevisionFailure(failure: failure),
                    const SizedBox(height: 12),
                  ],
                  _RevisionHeader(
                    revision: revision,
                    billLabel: widget.billLabel,
                  ),
                  const SizedBox(height: 14),
                  if (revision.isTerminal) ...[
                    _TerminalRevisionNotice(revision: revision),
                    const SizedBox(height: 14),
                  ],
                  _RevisionDecisionPanel(revision: revision),
                  const SizedBox(height: 14),
                  _FinancialImpactPanel(
                    impact: revision.reviewContext.viewerFinancialImpact,
                  ),
                  const SizedBox(height: 14),
                  _LimitationsPanel(
                    limitations: revision.reviewContext.limitations,
                  ),
                  const SizedBox(height: 14),
                  _BaselinePanel(contextData: revision.reviewContext),
                  const SizedBox(height: 14),
                  _ViewModeControl(
                    selected: _viewMode,
                    changedOnlyAvailable: _changedOnlyAvailable(revision),
                    onChanged: (value) {
                      setState(() {
                        _viewModeTouched = true;
                        _viewMode = value;
                      });
                    },
                  ),
                  const SizedBox(height: 14),
                  if (_viewMode ==
                      SettleoraBillRevisionReviewViewModeValues.changedOnly)
                    _ChangedOnlyView(revision: revision)
                  else
                    _FullBillView(revision: revision),
                  const SizedBox(height: 18),
                  _RevisionActionArea(
                    revision: revision,
                    isActing: _isActing,
                    actionFailure: _actionFailure,
                    actionNotice: _actionNotice,
                    onSubmit: _submit,
                    onWithdraw: _withdraw,
                    onApprove: _approve,
                    onReject: _confirmReject,
                    onConfirmPayer: _confirmPayer,
                    onApply: _apply,
                    onRevise: _openReviseEditor,
                  ),
                  const SizedBox(height: 18),
                  _CategorySummaryPanel(
                    summaries: revision.reviewContext.changeSummary,
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

class _RevisionHeader extends StatelessWidget {
  const _RevisionHeader({required this.revision, required this.billLabel});

  final SettleoraBillRevision revision;
  final String billLabel;

  @override
  Widget build(BuildContext context) {
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: SettleoraCompactHeader(
                  title: billLabel,
                  subtitle: 'Revision ${_shortId(revision.id)}',
                  leadingIcon: Icons.receipt_long_outlined,
                ),
              ),
              const SizedBox(width: 10),
              _RevisionStatusPill(
                label: settleoraBillRevisionStatusLabel(revision.status),
              ),
            ],
          ),
          const SizedBox(height: 14),
          _MoneyHero(
            label: 'Proposed bill total',
            amount: revision.totalAmount,
            currency: revision.totalCurrency,
            caption: 'Updated ${_formatTimestamp(revision.updatedAtUtc)}',
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _HeaderFact(
                  label: 'Bill context',
                  value: revision.groupId == null
                      ? 'Personal bill'
                      : 'Group bill',
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _HeaderFact(
                  label: 'Participants',
                  value: '${revision.participants.length}',
                  alignEnd: true,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _RevisionDecisionPanel extends StatelessWidget {
  const _RevisionDecisionPanel({required this.revision});

  final SettleoraBillRevision revision;

  @override
  Widget build(BuildContext context) {
    final changeCount = revision.reviewContext.changes.length;
    final impact = revision.reviewContext.viewerFinancialImpact;
    final payerImpact = impact.payerImpact;
    final action = _primaryRevisionAction(revision);

    return _Section(
      title: 'Review decision',
      icon: Icons.fact_check_outlined,
      children: [
        Text(
          changeCount == 0
              ? 'No changed-only rows were returned. Review the full bill before acting.'
              : '$changeCount changed item(s) need your decision.',
          style: Theme.of(context).textTheme.titleSmall,
        ),
        const SizedBox(height: 12),
        _DecisionTextRow(label: 'Revision', value: _shortId(revision.id)),
        _DecisionMoneyRow(
          label: 'Your share change',
          value: impact.deltaShare,
          emptyLabel: impact.affectedByRevision
              ? 'No delta returned'
              : 'No direct change',
        ),
        if (payerImpact != null)
          _DecisionMoneyRow(
            label: 'Payer change',
            value: payerImpact.deltaContribution,
            emptyLabel: payerImpact.requiresPayerConfirmation
                ? 'Confirmation needed'
                : 'No payer change',
          ),
        const SizedBox(height: 10),
        SettleoraInlinePanel(
          icon: action.isBlocked
              ? Icons.block_outlined
              : Icons.arrow_forward_outlined,
          title: action.title,
          message: action.message,
          variant: action.isBlocked
              ? SettleoraSurfaceVariant.danger
              : SettleoraSurfaceVariant.info,
        ),
      ],
    );
  }
}

class _DecisionTextRow extends StatelessWidget {
  const _DecisionTextRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          Text(value, textAlign: TextAlign.end),
        ],
      ),
    );
  }
}

class _DecisionMoneyRow extends StatelessWidget {
  const _DecisionMoneyRow({
    required this.label,
    required this.value,
    required this.emptyLabel,
  });

  final String label;
  final SettleoraBillRevisionMoneyValue? value;
  final String emptyLabel;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          if (value == null)
            Text(emptyLabel, textAlign: TextAlign.end)
          else
            MoneyText(
              amount: value!.amount,
              currencyCode: value!.currency,
              style: Theme.of(context).textTheme.titleSmall,
            ),
        ],
      ),
    );
  }
}

class _RevisionPrimaryAction {
  const _RevisionPrimaryAction({
    required this.title,
    required this.message,
    required this.isBlocked,
  });

  final String title;
  final String message;
  final bool isBlocked;
}

_RevisionPrimaryAction _primaryRevisionAction(SettleoraBillRevision revision) {
  if (revision.canApprove) {
    return const _RevisionPrimaryAction(
      title: 'Next action: approve or reject',
      message:
          'Review the comparison, then approve this revision or keep the original bill.',
      isBlocked: false,
    );
  }
  if (revision.canConfirmPayer) {
    return const _RevisionPrimaryAction(
      title: 'Next action: confirm payer impact',
      message:
          'Your payer confirmation is required before this revision can move forward.',
      isBlocked: false,
    );
  }
  if (revision.canSubmit) {
    return const _RevisionPrimaryAction(
      title: 'Next action: submit for review',
      message: 'Submit when the proposed total and participant rows are ready.',
      isBlocked: false,
    );
  }
  if (revision.canApply) {
    return const _RevisionPrimaryAction(
      title: 'Next action: apply approved revision',
      message:
          'Apply updates the active bill using the approved server result.',
      isBlocked: false,
    );
  }
  if (revision.canRevise) {
    return const _RevisionPrimaryAction(
      title: 'Next action: revise proposal',
      message: 'Create a replacement proposal if the current one is not right.',
      isBlocked: false,
    );
  }
  if (revision.isTerminal) {
    return const _RevisionPrimaryAction(
      title: 'No action available',
      message: 'This revision is already in a final state.',
      isBlocked: true,
    );
  }
  return const _RevisionPrimaryAction(
    title: 'Waiting on review state',
    message:
        'The server did not return an action that is available to this viewer.',
    isBlocked: true,
  );
}

class _HeaderFact extends StatelessWidget {
  const _HeaderFact({
    required this.label,
    required this.value,
    this.alignEnd = false,
  });

  final String label;
  final String value;
  final bool alignEnd;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: alignEnd
          ? CrossAxisAlignment.end
          : CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 3),
        Text(
          value,
          textAlign: alignEnd ? TextAlign.end : TextAlign.start,
          style: Theme.of(context).textTheme.bodyMedium,
        ),
      ],
    );
  }
}

class _FinancialImpactPanel extends StatelessWidget {
  const _FinancialImpactPanel({required this.impact});

  final SettleoraBillRevisionViewerFinancialImpact impact;

  @override
  Widget build(BuildContext context) {
    final payerImpact = impact.payerImpact;

    return _Section(
      title: 'Financial impact',
      icon: Icons.payments_outlined,
      children: [
        _ImpactHeroRow(
          previous: impact.previousShare,
          proposed: impact.proposedShare,
          delta: impact.deltaShare,
          caption: impact.affectedByRevision
              ? 'Your share changes in this proposal'
              : 'No direct share change was returned for you',
        ),
        if (payerImpact != null) ...[
          const SizedBox(height: 12),
          _ImpactHeroRow(
            title: 'Payer impact',
            previous: payerImpact.previousContribution,
            proposed: payerImpact.proposedContribution,
            delta: payerImpact.deltaContribution,
            caption: payerImpact.requiresPayerConfirmation
                ? 'Payer confirmation required'
                : 'No payer confirmation required',
          ),
        ],
      ],
    );
  }
}

class _RevisionStatusPill extends StatelessWidget {
  const _RevisionStatusPill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.primaryContainer,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        child: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
            color: Theme.of(context).colorScheme.onPrimaryContainer,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }
}

class _MoneyHero extends StatelessWidget {
  const _MoneyHero({
    required this.label,
    required this.amount,
    required this.currency,
    this.caption,
  });

  final String label;
  final String amount;
  final String currency;
  final String? caption;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 5),
            MoneyText(
              amount: amount,
              currencyCode: currency,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            if (caption != null) ...[
              const SizedBox(height: 4),
              Text(caption!, style: Theme.of(context).textTheme.bodySmall),
            ],
          ],
        ),
      ),
    );
  }
}

class _ImpactHeroRow extends StatelessWidget {
  const _ImpactHeroRow({
    this.title = 'Your share',
    required this.previous,
    required this.proposed,
    required this.delta,
    required this.caption,
  });

  final String title;
  final SettleoraBillRevisionMoneyValue? previous;
  final SettleoraBillRevisionMoneyValue? proposed;
  final SettleoraBillRevisionMoneyValue? delta;
  final String caption;

  @override
  Widget build(BuildContext context) {
    final delta = this.delta;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SettleoraCompactHeader(
              title: title,
              subtitle: caption,
              leadingIcon: Icons.trending_up_outlined,
            ),
            const SizedBox(height: 12),
            if (delta != null)
              _MoneyHero(
                label: 'Delta',
                amount: delta.amount,
                currency: delta.currency,
              )
            else
              const _BodyText('No safe delta was returned for this viewer.'),
            const SizedBox(height: 10),
            _ImpactMiniGrid(previous: previous, proposed: proposed),
          ],
        ),
      ),
    );
  }
}

class _ImpactMiniGrid extends StatelessWidget {
  const _ImpactMiniGrid({required this.previous, required this.proposed});

  final SettleoraBillRevisionMoneyValue? previous;
  final SettleoraBillRevisionMoneyValue? proposed;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _ImpactMiniValue(label: 'Previous', value: previous),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _ImpactMiniValue(label: 'Proposed', value: proposed),
        ),
      ],
    );
  }
}

class _ImpactMiniValue extends StatelessWidget {
  const _ImpactMiniValue({required this.label, required this.value});

  final String label;
  final SettleoraBillRevisionMoneyValue? value;

  @override
  Widget build(BuildContext context) {
    final value = this.value;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 4),
        if (value == null)
          Text('Not returned', style: Theme.of(context).textTheme.bodyMedium)
        else
          MoneyText(
            amount: value.amount,
            currencyCode: value.currency,
            style: Theme.of(context).textTheme.titleSmall,
          ),
      ],
    );
  }
}

class _BaselinePanel extends StatelessWidget {
  const _BaselinePanel({required this.contextData});

  final SettleoraBillRevisionReviewContext contextData;

  @override
  Widget build(BuildContext context) {
    final baseline = contextData.baseline;
    final reviewedAt = baseline.baselineReviewedAtUtc;

    return _Section(
      title: 'Review baseline',
      icon: Icons.compare_arrows_outlined,
      children: [
        _KeyValueText(
          label: 'Baseline',
          value: settleoraBillRevisionBaselineLabel(baseline.baselineType),
        ),
        _KeyValueText(
          label: 'Default view',
          value:
              contextData.defaultViewMode ==
                  SettleoraBillRevisionReviewViewModeValues.changedOnly
              ? 'Changed only'
              : 'Full bill',
        ),
        _BodyText(baseline.derivationReason),
        const SizedBox(height: 6),
        _BodyText(
          settleoraBillRevisionRecommendationLabel(
            contextData.fullViewRecommendedReason,
          ),
        ),
        if (reviewedAt != null) ...[
          const SizedBox(height: 6),
          _KeyValueText(label: 'Reviewed', value: _formatTimestamp(reviewedAt)),
        ],
      ],
    );
  }
}

class _ViewModeControl extends StatelessWidget {
  const _ViewModeControl({
    required this.selected,
    required this.changedOnlyAvailable,
    required this.onChanged,
  });

  final SettleoraBillRevisionReviewViewMode selected;
  final bool changedOnlyAvailable;
  final ValueChanged<SettleoraBillRevisionReviewViewMode> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SegmentedButton<SettleoraBillRevisionReviewViewMode>(
          key: const Key('bill-revision-view-mode'),
          segments: const [
            ButtonSegment(
              value: SettleoraBillRevisionReviewViewModeValues.fullBill,
              icon: Icon(Icons.receipt_long_outlined),
              label: Text('Full bill'),
            ),
            ButtonSegment(
              value: SettleoraBillRevisionReviewViewModeValues.changedOnly,
              icon: Icon(Icons.filter_alt_outlined),
              label: Text('Changed only'),
            ),
          ],
          selected: {selected},
          onSelectionChanged: (selection) => onChanged(selection.single),
        ),
        if (!changedOnlyAvailable) ...[
          const SizedBox(height: 8),
          const Text(
            'Changed-only review may be unavailable when no safe baseline or supported change rows were returned.',
          ),
        ],
      ],
    );
  }
}

class _FullBillView extends StatelessWidget {
  const _FullBillView({required this.revision});

  final SettleoraBillRevision revision;

  @override
  Widget build(BuildContext context) {
    return _Section(
      title: 'Full bill review',
      icon: Icons.receipt_long_outlined,
      children: [
        _AggregateMoneyRow(
          label: 'Bill total',
          amount: revision.totalAmount,
          currency: revision.totalCurrency,
          markers: _changesForScope(
            revision.reviewContext.changes,
            SettleoraBillRevisionReviewChangeScopeValues.billTotal,
          ),
        ),
        if (revision.participants.isEmpty)
          const _BodyText('No participant rows are visible in this revision.')
        else
          for (var index = 0; index < revision.participants.length; index += 1)
            _AggregateMoneyRow(
              label: 'Participant ${index + 1}',
              amount: revision.participants[index].resolvedShareAmount,
              currency: revision.participants[index].resolvedShareCurrency,
              markers: _changesForUserAndScopes(
                revision.reviewContext.changes,
                revision.participants[index].userProfileId,
                const [
                  SettleoraBillRevisionReviewChangeScopeValues.participantShare,
                ],
              ),
            ),
        if (revision.payers.isEmpty)
          const _BodyText('No payer rows are visible in this revision.')
        else
          for (var index = 0; index < revision.payers.length; index += 1)
            _AggregateMoneyRow(
              label: 'Payer ${index + 1}',
              amount: revision.payers[index].amount,
              currency: revision.payers[index].currency,
              markers: _changesForUserAndScopes(
                revision.reviewContext.changes,
                revision.payers[index].userProfileId,
                const [
                  SettleoraBillRevisionReviewChangeScopeValues
                      .payerContribution,
                  SettleoraBillRevisionReviewChangeScopeValues.payerRole,
                ],
              ),
            ),
      ],
    );
  }
}

class _ChangedOnlyView extends StatelessWidget {
  const _ChangedOnlyView({required this.revision});

  final SettleoraBillRevision revision;

  @override
  Widget build(BuildContext context) {
    final contextData = revision.reviewContext;
    if (!contextData.hasSafeChangedOnlyBaseline) {
      return const _Section(
        title: 'Changed-only review',
        icon: Icons.filter_alt_outlined,
        children: [
          _BodyText(
            'Changed-only review is unavailable because the server did not select a safe prior baseline for this viewer.',
          ),
        ],
      );
    }

    if (contextData.changes.isEmpty) {
      return const _Section(
        title: 'Changed-only review',
        icon: Icons.filter_alt_outlined,
        children: [
          _BodyText(
            'No supported aggregate change rows were returned. Use full bill review for the current revision.',
          ),
        ],
      );
    }

    return _Section(
      title: 'Changed-only review',
      icon: Icons.filter_alt_outlined,
      children: [
        for (final change in contextData.changes) _ChangeRow(change: change),
      ],
    );
  }
}

class _ChangeRow extends StatelessWidget {
  const _ChangeRow({required this.change});

  final SettleoraBillRevisionChange change;

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
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 6,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  _ChangeMarker(label: change.accessibleLabel),
                  _SoftChip(
                    label: settleoraBillRevisionChangeScopeLabel(
                      change.changeScope,
                    ),
                    icon: Icons.label_outline,
                  ),
                  _SoftChip(
                    label: settleoraBillRevisionChangeViewerImpactLabel(
                      change.viewerImpact,
                    ),
                    icon: Icons.person_search_outlined,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              _KeyValueText(
                label: 'Before',
                value: change.before?.displayValue ?? 'Not provided',
              ),
              _KeyValueText(
                label: 'After',
                value: change.after?.displayValue ?? 'Not provided',
              ),
              if (change.reason.trim().isNotEmpty) ...[
                const SizedBox(height: 6),
                _BodyText(change.reason),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _CategorySummaryPanel extends StatelessWidget {
  const _CategorySummaryPanel({required this.summaries});

  final List<SettleoraBillRevisionChangeCategorySummary> summaries;

  @override
  Widget build(BuildContext context) {
    if (summaries.isEmpty) {
      return const _Section(
        title: 'Category summary',
        icon: Icons.summarize_outlined,
        children: [
          _BodyText('No category summary was returned for this revision.'),
        ],
      );
    }

    return _Section(
      title: 'Category summary',
      icon: Icons.summarize_outlined,
      children: [
        for (final summary in summaries)
          _KeyValueText(
            label: settleoraBillRevisionChangeCategoryLabel(summary.category),
            value:
                '${settleoraBillRevisionSupportStatusLabel(summary.supportStatus)} - ${summary.changeCount} change(s) - ${settleoraBillRevisionViewerImpactLabel(summary.viewerImpact)}',
          ),
      ],
    );
  }
}

class _LimitationsPanel extends StatelessWidget {
  const _LimitationsPanel({required this.limitations});

  final List<String> limitations;

  @override
  Widget build(BuildContext context) {
    if (limitations.isEmpty) {
      return const _Section(
        title: 'Limitations',
        icon: Icons.info_outline,
        children: [_BodyText('No revision-review limitations were returned.')],
      );
    }

    return _Section(
      title: 'Limitations',
      icon: Icons.info_outline,
      children: [
        for (final limitation in limitations)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.info_outline, size: 18),
                const SizedBox(width: 8),
                Expanded(child: Text(_titleFromCode(limitation))),
              ],
            ),
          ),
      ],
    );
  }
}

class _RevisionActionArea extends StatelessWidget {
  const _RevisionActionArea({
    required this.revision,
    required this.isActing,
    required this.actionFailure,
    required this.actionNotice,
    required this.onSubmit,
    required this.onWithdraw,
    required this.onApprove,
    required this.onReject,
    required this.onConfirmPayer,
    required this.onApply,
    required this.onRevise,
  });

  final SettleoraBillRevision revision;
  final bool isActing;
  final SettleoraBillRevisionFailure? actionFailure;
  final String? actionNotice;
  final VoidCallback onSubmit;
  final VoidCallback onWithdraw;
  final VoidCallback onApprove;
  final VoidCallback onReject;
  final VoidCallback onConfirmPayer;
  final VoidCallback onApply;
  final VoidCallback onRevise;

  @override
  Widget build(BuildContext context) {
    final payerImpact =
        revision.reviewContext.viewerFinancialImpact.payerImpact;
    final requiresPayerConfirmation =
        payerImpact?.requiresPayerConfirmation ?? false;
    final isSubmitted = revision.isSubmittedForReview;
    final hasLifecycleActions =
        revision.canSubmit ||
        revision.canWithdraw ||
        revision.canRevise ||
        revision.canApply;

    return _Section(
      title: 'Actions',
      icon: Icons.verified_user_outlined,
      children: [
        if (actionFailure != null) ...[
          _InlineRevisionFailure(failure: actionFailure!),
          const SizedBox(height: 10),
        ],
        if (actionNotice != null) ...[
          _InlineNotice(message: actionNotice!),
          const SizedBox(height: 10),
        ],
        if (hasLifecycleActions) ...[
          _LifecycleActionPanel(
            revision: revision,
            isActing: isActing,
            onSubmit: onSubmit,
            onWithdraw: onWithdraw,
            onRevise: onRevise,
            onApply: onApply,
          ),
          const SizedBox(height: 10),
        ],
        if (requiresPayerConfirmation) ...[
          _PayerConfirmationPanel(
            revision: revision,
            isActing: isActing,
            onConfirmPayer: onConfirmPayer,
          ),
          const SizedBox(height: 10),
        ],
        if (!isSubmitted)
          _BodyText(
            revision.isTerminal
                ? 'This revision is in a terminal state. Approval, rejection, and payer confirmation are disabled.'
                : 'This revision is not submitted for review yet.',
          )
        else ...[
          _BodyText(
            revision.canApprove
                ? 'You are approving the proposed amount and calculation shown for this pending revision.'
                : 'No pending approval basis was returned for this viewer. This client will not fabricate approval fields.',
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton.icon(
                key: const Key('bill-revision-approve'),
                onPressed: isActing || !revision.canApprove ? null : onApprove,
                icon: isActing
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.check_circle_outline),
                label: Text(
                  requiresPayerConfirmation
                      ? 'Approve participant share'
                      : 'Approve this revision',
                ),
              ),
              OutlinedButton.icon(
                key: const Key('bill-revision-reject'),
                onPressed: isActing || !revision.canReject ? null : onReject,
                icon: const Icon(Icons.block_outlined),
                label: const Text('Reject this revision'),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

class _LifecycleActionPanel extends StatelessWidget {
  const _LifecycleActionPanel({
    required this.revision,
    required this.isActing,
    required this.onSubmit,
    required this.onWithdraw,
    required this.onRevise,
    required this.onApply,
  });

  final SettleoraBillRevision revision;
  final bool isActing;
  final VoidCallback onSubmit;
  final VoidCallback onWithdraw;
  final VoidCallback onRevise;
  final VoidCallback onApply;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outline),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Revision lifecycle',
              style: Theme.of(context).textTheme.titleSmall,
            ),
            if (revision.canRevise) ...[
              const SizedBox(height: 6),
              const _BodyText(
                'Your replacement will be submitted for review, and previous approvals on this proposal will not carry over.',
              ),
            ],
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (revision.canSubmit)
                  FilledButton.icon(
                    key: const Key('bill-revision-submit'),
                    onPressed: isActing ? null : onSubmit,
                    icon: isActing
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.upload_outlined),
                    label: const Text('Submit for review'),
                  ),
                if (revision.canWithdraw)
                  OutlinedButton.icon(
                    key: const Key('bill-revision-withdraw'),
                    onPressed: isActing ? null : onWithdraw,
                    icon: const Icon(Icons.undo_outlined),
                    label: const Text('Withdraw revision'),
                  ),
                if (revision.canRevise)
                  OutlinedButton.icon(
                    key: const Key('bill-revision-revise'),
                    onPressed: isActing ? null : onRevise,
                    icon: const Icon(Icons.edit_outlined),
                    label: const Text('Revise proposal'),
                  ),
                if (revision.canApply)
                  FilledButton.icon(
                    key: const Key('bill-revision-apply'),
                    onPressed: isActing ? null : onApply,
                    icon: isActing
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.task_alt_outlined),
                    label: const Text('Apply revision'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PayerConfirmationPanel extends StatelessWidget {
  const _PayerConfirmationPanel({
    required this.revision,
    required this.isActing,
    required this.onConfirmPayer,
  });

  final SettleoraBillRevision revision;
  final bool isActing;
  final VoidCallback onConfirmPayer;

  @override
  Widget build(BuildContext context) {
    final payerImpact =
        revision.reviewContext.viewerFinancialImpact.payerImpact;
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.primary),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Payer confirmation required',
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: 6),
            _BodyText(
              'The server says payer role or contribution confirmation is required before this revision can be applied.',
            ),
            const SizedBox(height: 8),
            _KeyValueText(
              label: 'Status',
              value: _titleFromCode(
                payerImpact?.payerConfirmationStatus ?? 'pending_confirmation',
              ),
            ),
            const SizedBox(height: 8),
            if (revision.canConfirmPayer)
              FilledButton.icon(
                key: const Key('bill-revision-confirm-payer'),
                onPressed: isActing ? null : onConfirmPayer,
                icon: isActing
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.verified_outlined),
                label: const Text('Confirm payer role'),
              )
            else
              OutlinedButton.icon(
                key: const Key('bill-revision-payer-confirmation-unavailable'),
                onPressed: null,
                icon: const Icon(Icons.lock_outline),
                label: const Text('Payer confirmation unavailable'),
              ),
          ],
        ),
      ),
    );
  }
}

class _TerminalRevisionNotice extends StatelessWidget {
  const _TerminalRevisionNotice({required this.revision});

  final SettleoraBillRevision revision;

  @override
  Widget build(BuildContext context) {
    return _InlineNotice(
      message:
          'This revision is ${settleoraBillRevisionStatusLabel(revision.status).toLowerCase()}. Actions are disabled for this version.',
    );
  }
}

class _AggregateMoneyRow extends StatelessWidget {
  const _AggregateMoneyRow({
    required this.label,
    required this.amount,
    required this.currency,
    required this.markers,
  });

  final String label;
  final String amount;
  final String currency;
  final List<SettleoraBillRevisionChange> markers;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _KeyValueMoneyText(label: label, amount: amount, currency: currency),
          if (markers.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final marker in markers)
                    _ChangeMarker(label: marker.accessibleLabel),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _ChangeMarker extends StatelessWidget {
  const _ChangeMarker({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: label,
      child: Chip(
        visualDensity: VisualDensity.compact,
        avatar: const Icon(Icons.change_circle_outlined, size: 16),
        label: Text(label),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({
    required this.title,
    required this.icon,
    required this.children,
  });

  final String title;
  final IconData icon;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SettleoraCompactHeader(title: title, leadingIcon: icon),
          const SizedBox(height: 10),
          ...children,
        ],
      ),
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return AppCard(padding: const EdgeInsets.all(14), child: child);
  }
}

class _KeyValueText extends StatelessWidget {
  const _KeyValueText({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return SettleoraKeyValueText(label: label, value: value, labelWidth: 132);
  }
}

class _KeyValueMoneyText extends StatelessWidget {
  const _KeyValueMoneyText({
    required this.label,
    required this.amount,
    required this.currency,
  });

  final String label;
  final String amount;
  final String currency;

  @override
  Widget build(BuildContext context) {
    return SettleoraKeyValueMoneyText(
      label: label,
      amount: amount,
      currencyCode: currency,
      labelWidth: 132,
    );
  }
}

class _BodyText extends StatelessWidget {
  const _BodyText(this.value);

  final String value;

  @override
  Widget build(BuildContext context) {
    return Text(value);
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

class _InlineRevisionFailure extends StatelessWidget {
  const _InlineRevisionFailure({required this.failure});

  final SettleoraBillRevisionFailure failure;

  @override
  Widget build(BuildContext context) {
    return SettleoraInlinePanel(
      icon: _failureIcon(failure.kind),
      title: failure.title,
      message: failure.message,
      variant: SettleoraSurfaceVariant.danger,
    );
  }
}

class _InlineNotice extends StatelessWidget {
  const _InlineNotice({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return SettleoraInlinePanel(
      icon: Icons.info_outline,
      title: 'Revision status',
      message: message,
      variant: SettleoraSurfaceVariant.info,
    );
  }
}

class _RevisionFailurePanel extends StatelessWidget {
  const _RevisionFailurePanel({required this.failure, required this.onRetry});

  final SettleoraBillRevisionFailure failure;
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

class _RevisionLoadingPanel extends StatelessWidget {
  const _RevisionLoadingPanel();

  @override
  Widget build(BuildContext context) {
    return const SettleoraLoadingPanel(label: 'Loading revision review');
  }
}

SettleoraBillRevisionReviewViewMode _preferredViewMode(
  SettleoraBillRevision revision,
) {
  final contextData = revision.reviewContext;
  if (!contextData.hasSafeChangedOnlyBaseline) {
    return SettleoraBillRevisionReviewViewModeValues.fullBill;
  }

  if (contextData.defaultViewMode ==
          SettleoraBillRevisionReviewViewModeValues.changedOnly &&
      contextData.changes.isNotEmpty) {
    return SettleoraBillRevisionReviewViewModeValues.changedOnly;
  }

  return SettleoraBillRevisionReviewViewModeValues.fullBill;
}

bool _changedOnlyAvailable(SettleoraBillRevision revision) {
  return revision.reviewContext.hasSafeChangedOnlyBaseline &&
      revision.reviewContext.changes.isNotEmpty;
}

List<SettleoraBillRevisionChange> _changesForScope(
  List<SettleoraBillRevisionChange> changes,
  SettleoraBillRevisionReviewChangeScope scope,
) {
  return changes
      .where((change) => change.changeScope == scope)
      .toList(growable: false);
}

List<SettleoraBillRevisionChange> _changesForUserAndScopes(
  List<SettleoraBillRevisionChange> changes,
  String userProfileId,
  List<SettleoraBillRevisionReviewChangeScope> scopes,
) {
  return changes
      .where(
        (change) =>
            change.relatedUserProfileId == userProfileId &&
            scopes.contains(change.changeScope),
      )
      .toList(growable: false);
}

String _formatTimestamp(DateTime value) {
  return value.toLocal().toString().split('.').first;
}

String _shortId(String value) {
  if (value.length <= 8) {
    return value;
  }

  return value.substring(0, 8);
}

String _titleFromCode(String code) {
  return code
      .split('_')
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}

IconData _failureIcon(SettleoraBillRevisionFailureKind kind) {
  return switch (kind) {
    SettleoraBillRevisionFailureKind.sessionRequired => Icons.lock_outline,
    SettleoraBillRevisionFailureKind.sessionExpired => Icons.lock_outline,
    SettleoraBillRevisionFailureKind.denied => Icons.no_accounts_outlined,
    SettleoraBillRevisionFailureKind.unavailable =>
      Icons.visibility_off_outlined,
    SettleoraBillRevisionFailureKind.conflict => Icons.sync_problem_outlined,
    SettleoraBillRevisionFailureKind.validation =>
      Icons.report_problem_outlined,
    SettleoraBillRevisionFailureKind.network => Icons.cloud_off_outlined,
    SettleoraBillRevisionFailureKind.server => Icons.error_outline,
  };
}
