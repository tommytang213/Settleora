import 'package:flutter/material.dart';

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
                  _FinancialImpactPanel(
                    impact: revision.reviewContext.viewerFinancialImpact,
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
                  _CategorySummaryPanel(
                    summaries: revision.reviewContext.changeSummary,
                  ),
                  const SizedBox(height: 14),
                  _LimitationsPanel(
                    limitations: revision.reviewContext.limitations,
                  ),
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
          Text(billLabel, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          _KeyValueText(
            label: 'Revision',
            value: settleoraBillRevisionStatusLabel(revision.status),
          ),
          _KeyValueText(label: 'Bill', value: _shortId(revision.billId)),
          _KeyValueText(label: 'Revision ID', value: _shortId(revision.id)),
          _KeyValueText(
            label: 'Total',
            value: _money(revision.totalAmount, revision.totalCurrency),
          ),
          _KeyValueText(
            label: 'Updated',
            value: _formatTimestamp(revision.updatedAtUtc),
          ),
        ],
      ),
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
        _KeyValueText(
          label: 'Your status',
          value: impact.affectedByRevision
              ? 'Server marked you as affected'
              : 'Server marked no direct impact',
        ),
        _KeyValueText(
          label: 'Previous share',
          value: _moneyOrFallback(
            impact.previousShare,
            'No safe previous share',
          ),
        ),
        _KeyValueText(
          label: 'Proposed share',
          value: _moneyOrFallback(impact.proposedShare, 'Not applicable'),
        ),
        _KeyValueText(
          label: 'Delta',
          value: _moneyOrFallback(impact.deltaShare, 'No safe delta'),
        ),
        if (payerImpact != null) ...[
          const SizedBox(height: 8),
          _KeyValueText(
            label: 'Payer status',
            value: payerImpact.requiresPayerConfirmation
                ? 'Payer confirmation required'
                : 'Payer confirmation not required',
          ),
          _KeyValueText(
            label: 'Payer previous',
            value: _moneyOrFallback(
              payerImpact.previousContribution,
              'No safe previous contribution',
            ),
          ),
          _KeyValueText(
            label: 'Payer proposed',
            value: _moneyOrFallback(
              payerImpact.proposedContribution,
              'Not applicable',
            ),
          ),
          _KeyValueText(
            label: 'Payer delta',
            value: _moneyOrFallback(
              payerImpact.deltaContribution,
              'No safe delta',
            ),
          ),
        ],
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
        _AggregateRow(
          label: 'Bill total',
          value: _money(revision.totalAmount, revision.totalCurrency),
          markers: _changesForScope(
            revision.reviewContext.changes,
            SettleoraBillRevisionReviewChangeScopeValues.billTotal,
          ),
        ),
        if (revision.participants.isEmpty)
          const _BodyText('No participant rows are visible in this revision.')
        else
          for (var index = 0; index < revision.participants.length; index += 1)
            _AggregateRow(
              label: 'Participant ${index + 1}',
              value: _money(
                revision.participants[index].resolvedShareAmount,
                revision.participants[index].resolvedShareCurrency,
              ),
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
            _AggregateRow(
              label: 'Payer ${index + 1}',
              value: _money(
                revision.payers[index].amount,
                revision.payers[index].currency,
              ),
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

class _AggregateRow extends StatelessWidget {
  const _AggregateRow({
    required this.label,
    required this.value,
    required this.markers,
  });

  final String label;
  final String value;
  final List<SettleoraBillRevisionChange> markers;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _KeyValueText(label: label, value: value),
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
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, size: 22),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
            ],
          ),
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
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(padding: const EdgeInsets.all(14), child: child),
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
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.errorContainer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              _failureIcon(failure.kind),
              color: Theme.of(context).colorScheme.onErrorContainer,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    failure.title,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      color: Theme.of(context).colorScheme.onErrorContainer,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    failure.message,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onErrorContainer,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InlineNotice extends StatelessWidget {
  const _InlineNotice({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.info_outline),
            const SizedBox(width: 10),
            Expanded(child: Text(message)),
          ],
        ),
      ),
    );
  }
}

class _RevisionFailurePanel extends StatelessWidget {
  const _RevisionFailurePanel({required this.failure, required this.onRetry});

  final SettleoraBillRevisionFailure failure;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              _failureIcon(failure.kind),
              size: 42,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(height: 14),
            Text(
              failure.title,
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 6),
            Text(failure.message, textAlign: TextAlign.center),
            const SizedBox(height: 14),
            OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

class _RevisionLoadingPanel extends StatelessWidget {
  const _RevisionLoadingPanel();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircularProgressIndicator(),
          SizedBox(height: 14),
          Text('Loading revision review'),
        ],
      ),
    );
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

String _money(String amount, String currency) => '$amount $currency';

String _moneyOrFallback(
  SettleoraBillRevisionMoneyValue? money,
  String fallback,
) {
  if (money == null) {
    return fallback;
  }

  return _money(money.amount, money.currency);
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
