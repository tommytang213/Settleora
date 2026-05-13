import 'package:flutter/material.dart';

import 'receipt_ocr_review_repository.dart';

class ReceiptOcrReviewQueueScreen extends StatefulWidget {
  const ReceiptOcrReviewQueueScreen({super.key, this.repository});

  final ReceiptOcrReviewRepository? repository;

  @override
  State<ReceiptOcrReviewQueueScreen> createState() =>
      _ReceiptOcrReviewQueueScreenState();
}

class _ReceiptOcrReviewQueueScreenState
    extends State<ReceiptOcrReviewQueueScreen> {
  bool _isLoading = false;
  List<ReceiptOcrReviewSummary> _reviews = const [];
  ReceiptOcrReviewFailure? _failure;

  @override
  void initState() {
    super.initState();
    if (widget.repository != null) {
      _isLoading = true;
      Future<void>.microtask(_loadReviews);
    }
  }

  @override
  void didUpdateWidget(ReceiptOcrReviewQueueScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.repository != widget.repository &&
        widget.repository != null) {
      _loadReviews();
    }
  }

  Future<void> _loadReviews() async {
    final repository = widget.repository;
    if (repository == null) {
      return;
    }

    setState(() {
      _isLoading = true;
      _failure = null;
    });

    try {
      final reviews = await repository.listReviews(limit: 50);
      if (!mounted) {
        return;
      }

      setState(() {
        _reviews = reviews;
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _failure = ReceiptOcrReviewFailure.from(error);
        _isLoading = false;
      });
    }
  }

  void _openReview(ReceiptOcrReviewSummary review) {
    final repository = widget.repository;
    if (repository == null) {
      return;
    }

    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ReceiptOcrReviewDetailScreen(
          repository: repository,
          summary: review,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final repository = widget.repository;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Receipt Reviews'),
        actions: [
          IconButton(
            onPressed: repository == null || _isLoading ? null : _loadReviews,
            tooltip: 'Refresh',
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: Builder(
          builder: (context) {
            if (repository == null) {
              return const _StatePanel(
                icon: Icons.lock_outline,
                title: 'Sign in required',
                message:
                    'Connect an account session before loading receipt reviews.',
              );
            }

            if (_isLoading) {
              return const _LoadingPanel(label: 'Loading receipt reviews');
            }

            final failure = _failure;
            if (failure != null) {
              return _FailurePanel(failure: failure, onRetry: _loadReviews);
            }

            if (_reviews.isEmpty) {
              return const _StatePanel(
                icon: Icons.receipt_long_outlined,
                title: 'No receipt reviews',
                message:
                    'Saved reviews that are visible to this account will appear here.',
              );
            }

            return RefreshIndicator(
              onRefresh: _loadReviews,
              child: ListView.separated(
                padding: const EdgeInsets.all(16),
                itemBuilder: (context, index) {
                  final review = _reviews[index];
                  return _ReceiptOcrReviewSummaryTile(
                    review: review,
                    onTap: () => _openReview(review),
                  );
                },
                separatorBuilder: (_, _) => const SizedBox(height: 12),
                itemCount: _reviews.length,
              ),
            );
          },
        ),
      ),
    );
  }
}

class ReceiptOcrReviewDetailScreen extends StatefulWidget {
  const ReceiptOcrReviewDetailScreen({
    super.key,
    required this.repository,
    required this.summary,
  });

  final ReceiptOcrReviewRepository repository;
  final ReceiptOcrReviewSummary summary;

  @override
  State<ReceiptOcrReviewDetailScreen> createState() =>
      _ReceiptOcrReviewDetailScreenState();
}

class _ReceiptOcrReviewDetailScreenState
    extends State<ReceiptOcrReviewDetailScreen> {
  bool _isLoadingReview = true;
  bool _isLoadingPreview = false;
  bool _isApplying = false;
  ReceiptOcrReviewDetail? _review;
  ReceiptOcrReviewApplyPreview? _preview;
  ReceiptOcrReviewApplyResult? _applyResult;
  ReceiptOcrReviewFailure? _reviewFailure;
  ReceiptOcrReviewFailure? _previewFailure;
  ReceiptOcrReviewFailure? _applyFailure;

  ReceiptOcrReviewRoute get _route =>
      ReceiptOcrReviewRoute.fromSummary(widget.summary);

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_loadReview);
  }

  Future<void> _loadReview() async {
    setState(() {
      _isLoadingReview = true;
      _reviewFailure = null;
      _preview = null;
      _previewFailure = null;
      _applyResult = null;
      _applyFailure = null;
    });

    try {
      final review = await widget.repository.getReview(_route);
      if (!mounted) {
        return;
      }

      setState(() {
        _review = review;
        _isLoadingReview = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _reviewFailure = ReceiptOcrReviewFailure.from(error);
        _isLoadingReview = false;
      });
    }
  }

  Future<void> _loadPreview() async {
    setState(() {
      _isLoadingPreview = true;
      _previewFailure = null;
      _applyResult = null;
      _applyFailure = null;
    });

    try {
      final preview = await widget.repository.previewApply(_route);
      if (!mounted) {
        return;
      }

      setState(() {
        _preview = preview;
        _isLoadingPreview = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _previewFailure = ReceiptOcrReviewFailure.from(error);
        _isLoadingPreview = false;
      });
    }
  }

  Future<void> _confirmApply() async {
    final preview = _preview;
    if (preview == null || !preview.canApply) {
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Apply reviewed lines?'),
          content: const Text(
            'The server will revalidate the saved review before changing draft bill items.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Apply'),
            ),
          ],
        );
      },
    );

    if (!mounted || confirmed != true) {
      return;
    }

    await _applyReview(preview);
  }

  Future<void> _applyReview(ReceiptOcrReviewApplyPreview preview) async {
    setState(() {
      _isApplying = true;
      _applyFailure = null;
      _applyResult = null;
    });

    try {
      final result = await widget.repository.applyReview(
        _route,
        expectedReviewUpdatedAtUtc: preview.updatedAtUtc,
      );
      if (!mounted) {
        return;
      }

      setState(() {
        _applyResult = result;
        _isApplying = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _applyFailure = ReceiptOcrReviewFailure.from(error);
        _isApplying = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Receipt Review'),
        actions: [
          IconButton(
            onPressed: _isLoadingReview ? null : _loadReview,
            tooltip: 'Refresh',
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: Builder(
          builder: (context) {
            if (_isLoadingReview) {
              return const _LoadingPanel(label: 'Loading receipt review');
            }

            final failure = _reviewFailure;
            if (failure != null) {
              return _FailurePanel(failure: failure, onRetry: _loadReview);
            }

            final review = _review;
            if (review == null) {
              return _FailurePanel(
                failure: const ReceiptOcrReviewFailure(
                  kind: ReceiptOcrReviewFailureKind.unavailable,
                  message: 'The receipt review is no longer available.',
                ),
                onRetry: _loadReview,
              );
            }

            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
              children: [
                _ReceiptOcrReviewHeader(review: review),
                const SizedBox(height: 20),
                _ReceiptOcrReviewTotals(review: review),
                const SizedBox(height: 20),
                _ReceiptOcrReviewLines(lines: review.lines),
                const SizedBox(height: 20),
                _ApplyPreviewSection(
                  isLoadingPreview: _isLoadingPreview,
                  isApplying: _isApplying,
                  preview: _preview,
                  previewFailure: _previewFailure,
                  applyResult: _applyResult,
                  applyFailure: _applyFailure,
                  onPreview: _loadPreview,
                  onApply: _confirmApply,
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _ReceiptOcrReviewSummaryTile extends StatelessWidget {
  const _ReceiptOcrReviewSummaryTile({
    required this.review,
    required this.onTap,
  });

  final ReceiptOcrReviewSummary review;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final merchant = review.merchantText ?? 'Receipt review';
    final scope = review.groupId == null ? 'Personal bill' : 'Group bill';
    final currency = review.currency;

    return Card(
      margin: EdgeInsets.zero,
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 10,
        ),
        leading: const Icon(Icons.receipt_long_outlined),
        title: Text(merchant, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              _StatusChip(label: receiptOcrReviewStatusLabel(review.status)),
              _SoftChip(label: scope),
              _SoftChip(label: '${review.lineCount} lines'),
              if (currency != null) _SoftChip(label: currency),
            ],
          ),
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}

class _ReceiptOcrReviewHeader extends StatelessWidget {
  const _ReceiptOcrReviewHeader({required this.review});

  final ReceiptOcrReviewDetail review;

  @override
  Widget build(BuildContext context) {
    final merchant = review.merchantText ?? 'Receipt review';
    final scope = review.groupId == null ? 'Personal bill' : 'Group bill';

    return Column(
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
        message: 'Review the line candidates or use manual entry.',
        compact: true,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Header candidates',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 8),
        for (final row in rows)
          _KeyValueText(label: row.$1, value: _money(row.$2, review.currency)),
      ],
    );
  }
}

class _ReceiptOcrReviewLines extends StatelessWidget {
  const _ReceiptOcrReviewLines({required this.lines});

  final List<ReceiptOcrReviewLine> lines;

  @override
  Widget build(BuildContext context) {
    if (lines.isEmpty) {
      return const _StatePanel(
        icon: Icons.format_list_bulleted,
        title: 'No line candidates',
        message: 'Apply is blocked until the server receives reviewed lines.',
        compact: true,
      );
    }

    final sorted = [...lines]
      ..sort((left, right) => left.sortOrder.compareTo(right.sortOrder));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Line candidates', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        for (final line in sorted)
          Padding(
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
      ],
    );
  }
}

class _ApplyPreviewSection extends StatelessWidget {
  const _ApplyPreviewSection({
    required this.isLoadingPreview,
    required this.isApplying,
    required this.preview,
    required this.previewFailure,
    required this.applyResult,
    required this.applyFailure,
    required this.onPreview,
    required this.onApply,
  });

  final bool isLoadingPreview;
  final bool isApplying;
  final ReceiptOcrReviewApplyPreview? preview;
  final ReceiptOcrReviewFailure? previewFailure;
  final ReceiptOcrReviewApplyResult? applyResult;
  final ReceiptOcrReviewFailure? applyFailure;
  final VoidCallback onPreview;
  final VoidCallback onApply;

  @override
  Widget build(BuildContext context) {
    final preview = this.preview;
    final applyEnabled = preview != null && preview.canApply && !isApplying;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Apply preview', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: isLoadingPreview ? null : onPreview,
                icon: isLoadingPreview
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.fact_check_outlined),
                label: const Text('Preview apply'),
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
                label: const Text('Apply to draft'),
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
            _KeyValueText(
              label: 'Line total sum',
              value: _money(
                preview.summary.proposedLineTotalSumAmount,
                preview.proposedCurrency,
              ),
            ),
            _KeyValueText(
              label: 'Header total',
              value: _money(
                preview.proposedGrandTotalAmount,
                preview.proposedCurrency,
              ),
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
            _KeyValueText(
              label: 'Grand total',
              value: _money(result.grandTotalAmount, result.currency),
            ),
          ],
        ),
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
              _SoftChip(
                label: receiptOcrReviewIssueLabel(issue),
                icon: Icons.info_outline,
              ),
          ],
        ),
      ],
    );
  }
}

class _FailurePanel extends StatelessWidget {
  const _FailurePanel({required this.failure, required this.onRetry});

  final ReceiptOcrReviewFailure failure;
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

class _InlineFailure extends StatelessWidget {
  const _InlineFailure({required this.failure});

  final ReceiptOcrReviewFailure failure;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.error),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              _failureIcon(failure.kind),
              color: Theme.of(context).colorScheme.error,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    failure.title,
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: 4),
                  Text(failure.message),
                ],
              ),
            ),
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

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Chip(
      visualDensity: VisualDensity.compact,
      label: Text(label),
      avatar: const Icon(Icons.pending_actions_outlined, size: 16),
    );
  }
}

class _SoftChip extends StatelessWidget {
  const _SoftChip({required this.label, this.icon});

  final String label;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Chip(
      visualDensity: VisualDensity.compact,
      backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
      avatar: icon == null ? null : Icon(icon, size: 16),
      label: Text(label),
    );
  }
}

String receiptOcrReviewStatusLabel(ReceiptOcrReviewStatus status) {
  return switch (status) {
    ReceiptOcrReviewStatusValues.provisional => 'Provisional',
    ReceiptOcrReviewStatusValues.reviewed => 'Reviewed',
    _ => _titleFromCode(status),
  };
}

String receiptOcrReviewSourceLabel(ReceiptOcrReviewSource source) {
  return switch (source) {
    ReceiptOcrReviewSourceValues.onDevice => 'On device OCR',
    ReceiptOcrReviewSourceValues.manualEntry => 'Manual entry',
    ReceiptOcrReviewSourceValues.importedReviewedData => 'Imported review data',
    _ => _titleFromCode(source),
  };
}

String receiptOcrReviewIssueLabel(ReceiptOcrReviewApplyPreviewIssueCode issue) {
  return switch (issue) {
    ReceiptOcrReviewApplyPreviewIssueCodeValues.unsupportedReviewStatus =>
      'Unsupported review status',
    ReceiptOcrReviewApplyPreviewIssueCodeValues.unsupportedReviewSource =>
      'Unsupported review source',
    ReceiptOcrReviewApplyPreviewIssueCodeValues.missingCurrency =>
      'Missing currency',
    ReceiptOcrReviewApplyPreviewIssueCodeValues.unsupportedCurrency =>
      'Unsupported currency',
    ReceiptOcrReviewApplyPreviewIssueCodeValues.currencyMismatch =>
      'Currency mismatch',
    ReceiptOcrReviewApplyPreviewIssueCodeValues.missingGrandTotal =>
      'Missing grand total',
    ReceiptOcrReviewApplyPreviewIssueCodeValues.emptyLineSet =>
      'Empty line set',
    ReceiptOcrReviewApplyPreviewIssueCodeValues.lineTotalMissing =>
      'Line total missing',
    ReceiptOcrReviewApplyPreviewIssueCodeValues.unsupportedLineState =>
      'Unsupported line state',
    ReceiptOcrReviewApplyPreviewIssueCodeValues.lineTotalMismatch =>
      'Line total mismatch',
    ReceiptOcrReviewApplyPreviewIssueCodeValues.lineSumMismatch =>
      'Line sum mismatch',
    ReceiptOcrReviewApplyPreviewIssueCodeValues.headerTotalMismatch =>
      'Header total mismatch',
    _ => _titleFromCode(issue),
  };
}

IconData _failureIcon(ReceiptOcrReviewFailureKind kind) {
  return switch (kind) {
    ReceiptOcrReviewFailureKind.unauthenticated => Icons.lock_outline,
    ReceiptOcrReviewFailureKind.denied => Icons.no_accounts_outlined,
    ReceiptOcrReviewFailureKind.unavailable => Icons.visibility_off_outlined,
    ReceiptOcrReviewFailureKind.conflict => Icons.sync_problem_outlined,
    ReceiptOcrReviewFailureKind.validation => Icons.report_problem_outlined,
    ReceiptOcrReviewFailureKind.network => Icons.cloud_off_outlined,
    ReceiptOcrReviewFailureKind.server => Icons.error_outline,
  };
}

String _lineSummary(ReceiptOcrReviewLine line) {
  final parts = [
    if (line.quantity != null) 'Qty ${line.quantity}',
    if (line.unitPriceAmount != null) 'Unit ${line.unitPriceAmount}',
    if (line.lineTotalAmount != null) 'Total ${line.lineTotalAmount}',
  ];

  return parts.isEmpty ? 'No amount candidates' : parts.join('  ');
}

String _money(String? amount, String? currency) {
  if (amount == null) {
    return 'Not provided';
  }

  if (currency == null) {
    return amount;
  }

  return '$amount $currency';
}

String _formatDate(DateTime value) {
  final utc = value.toUtc();
  final year = utc.year.toString().padLeft(4, '0');
  final month = utc.month.toString().padLeft(2, '0');
  final day = utc.day.toString().padLeft(2, '0');
  return '$year-$month-$day';
}

String _titleFromCode(String code) {
  return code
      .split('_')
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}
