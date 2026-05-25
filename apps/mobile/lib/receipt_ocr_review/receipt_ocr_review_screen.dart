import 'package:flutter/material.dart';

import 'receipt_ocr_review_repository.dart';

part 'receipt_ocr_review_detail_content.dart';

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
  int _loadGeneration = 0;

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

    final loadGeneration = _loadGeneration + 1;
    setState(() {
      _loadGeneration = loadGeneration;
      _isLoading = true;
      _failure = null;
    });

    try {
      final reviews = await repository.listReviews(limit: 50);
      if (!_isCurrentLoad(loadGeneration, repository)) {
        return;
      }

      setState(() {
        _reviews = reviews;
        _isLoading = false;
      });
    } catch (error) {
      if (!_isCurrentLoad(loadGeneration, repository)) {
        return;
      }

      setState(() {
        _failure = ReceiptOcrReviewFailure.from(error);
        _isLoading = false;
      });
    }
  }

  bool _isCurrentLoad(
    int loadGeneration,
    ReceiptOcrReviewRepository repository,
  ) {
    return mounted &&
        _loadGeneration == loadGeneration &&
        identical(widget.repository, repository);
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
  }) : route = null;

  const ReceiptOcrReviewDetailScreen.forRoute({
    super.key,
    required this.repository,
    required this.route,
  }) : summary = null,
       assert(route != null);

  final ReceiptOcrReviewRepository repository;
  final ReceiptOcrReviewSummary? summary;
  final ReceiptOcrReviewRoute? route;

  @override
  State<ReceiptOcrReviewDetailScreen> createState() =>
      _ReceiptOcrReviewDetailScreenState();
}

class _ReceiptOcrReviewDetailScreenState
    extends State<ReceiptOcrReviewDetailScreen> {
  bool _isLoadingReview = true;
  bool _isLoadingPreview = false;
  bool _isApplying = false;
  bool _isEditing = false;
  bool _isSaving = false;
  bool _isDeleting = false;
  ReceiptOcrReviewDetail? _review;
  ReceiptOcrReviewApplyPreview? _preview;
  ReceiptOcrReviewApplyResult? _applyResult;
  ReceiptOcrReviewFailure? _reviewFailure;
  ReceiptOcrReviewFailure? _previewFailure;
  ReceiptOcrReviewFailure? _applyFailure;
  ReceiptOcrReviewFailure? _saveFailure;
  ReceiptOcrReviewFailure? _deleteFailure;
  int _reviewLoadGeneration = 0;
  int _previewLoadGeneration = 0;
  int _saveGeneration = 0;
  int _deleteGeneration = 0;
  int _applyGeneration = 0;

  ReceiptOcrReviewRoute get _route => _routeFor(widget);

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_loadReview);
  }

  @override
  void didUpdateWidget(ReceiptOcrReviewDetailScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.repository != widget.repository ||
        !_sameRoute(_routeFor(oldWidget), _route)) {
      _reviewLoadGeneration += 1;
      _previewLoadGeneration += 1;
      _saveGeneration += 1;
      _deleteGeneration += 1;
      _applyGeneration += 1;
      _isLoadingPreview = false;
      _isApplying = false;
      _isEditing = false;
      _isSaving = false;
      _isDeleting = false;
      _review = null;
      _preview = null;
      _applyResult = null;
      _reviewFailure = null;
      _previewFailure = null;
      _applyFailure = null;
      _saveFailure = null;
      _deleteFailure = null;
      Future<void>.microtask(_loadReview);
    }
  }

  Future<void> _loadReview() async {
    if (_isSaving || _isDeleting || _isApplying) {
      return;
    }

    final repository = widget.repository;
    final route = _route;
    final loadGeneration = _reviewLoadGeneration + 1;
    setState(() {
      _reviewLoadGeneration = loadGeneration;
      _isLoadingReview = true;
      _isEditing = false;
      _reviewFailure = null;
      _preview = null;
      _previewFailure = null;
      _applyResult = null;
      _applyFailure = null;
      _saveFailure = null;
      _deleteFailure = null;
    });

    try {
      final review = await repository.getReview(route);
      if (!_isCurrentDetailOperation(loadGeneration, route, repository)) {
        return;
      }

      setState(() {
        _review = review;
        _isLoadingReview = false;
      });
    } catch (error) {
      if (!_isCurrentDetailOperation(loadGeneration, route, repository)) {
        return;
      }

      setState(() {
        _reviewFailure = ReceiptOcrReviewFailure.from(error);
        _isLoadingReview = false;
      });
    }
  }

  Future<void> _loadPreview() async {
    if (_detailActionsBlocked || _isLoadingPreview) {
      return;
    }

    final repository = widget.repository;
    final route = _route;
    final loadGeneration = _previewLoadGeneration + 1;
    setState(() {
      _previewLoadGeneration = loadGeneration;
      _isLoadingPreview = true;
      _previewFailure = null;
      _applyResult = null;
      _applyFailure = null;
    });

    try {
      final preview = await repository.previewApply(route);
      if (!_isCurrentPreviewOperation(loadGeneration, route, repository)) {
        return;
      }

      setState(() {
        _preview = preview;
        _isLoadingPreview = false;
      });
    } catch (error) {
      if (!_isCurrentPreviewOperation(loadGeneration, route, repository)) {
        return;
      }

      setState(() {
        _previewFailure = ReceiptOcrReviewFailure.from(error);
        _isLoadingPreview = false;
      });
    }
  }

  void _startEditing() {
    if (_detailActionsBlocked || _review == null) {
      return;
    }

    setState(() {
      _isEditing = true;
      _saveFailure = null;
      _deleteFailure = null;
      _preview = null;
      _previewFailure = null;
      _applyResult = null;
      _applyFailure = null;
    });
  }

  void _cancelEditing() {
    setState(() {
      _isEditing = false;
      _saveFailure = null;
      _deleteFailure = null;
    });
  }

  Future<void> _saveReview(ReceiptOcrReviewSaveRequest request) async {
    if (_isSaving || _isDeleting || _isLoadingReview) {
      return;
    }

    final repository = widget.repository;
    final route = _route;
    final saveGeneration = _saveGeneration + 1;
    setState(() {
      _saveGeneration = saveGeneration;
      _isSaving = true;
      _saveFailure = null;
      _deleteFailure = null;
    });

    try {
      final review = await repository.saveReview(route, request);
      if (!_isCurrentSaveOperation(saveGeneration, route, repository)) {
        return;
      }

      setState(() {
        _review = review;
        _isEditing = false;
        _isSaving = false;
        _preview = null;
        _previewFailure = null;
        _applyResult = null;
        _applyFailure = null;
      });
    } catch (error) {
      if (!_isCurrentSaveOperation(saveGeneration, route, repository)) {
        return;
      }

      setState(() {
        _saveFailure = ReceiptOcrReviewFailure.from(error);
        _isSaving = false;
      });
    }
  }

  Future<void> _confirmDelete() async {
    if (_isSaving || _isDeleting || _isLoadingReview) {
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Remove saved review?'),
          content: const Text(
            'The saved OCR review will be removed from this receipt attachment.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Remove'),
            ),
          ],
        );
      },
    );

    if (!mounted || confirmed != true) {
      return;
    }

    await _deleteReview();
  }

  Future<void> _deleteReview() async {
    if (_isSaving || _isDeleting || _isLoadingReview) {
      return;
    }

    final repository = widget.repository;
    final route = _route;
    final deleteGeneration = _deleteGeneration + 1;
    setState(() {
      _deleteGeneration = deleteGeneration;
      _isDeleting = true;
      _deleteFailure = null;
      _saveFailure = null;
    });

    try {
      final navigator = Navigator.of(context);
      await repository.deleteReview(route);
      if (!_isCurrentDeleteOperation(deleteGeneration, route, repository)) {
        return;
      }

      navigator.pop();
    } catch (error) {
      if (!_isCurrentDeleteOperation(deleteGeneration, route, repository)) {
        return;
      }

      setState(() {
        _deleteFailure = ReceiptOcrReviewFailure.from(error);
        _isDeleting = false;
      });
    }
  }

  Future<void> _confirmApply() async {
    final preview = _preview;
    if (preview == null || !preview.canApply || _detailActionsBlocked) {
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
    if (_isApplying || _isLoadingPreview || _isLoadingReview || _isEditing) {
      return;
    }

    final repository = widget.repository;
    final route = _route;
    final applyGeneration = _applyGeneration + 1;
    setState(() {
      _applyGeneration = applyGeneration;
      _isApplying = true;
      _applyFailure = null;
      _applyResult = null;
    });

    try {
      final result = await repository.applyReview(
        route,
        expectedReviewUpdatedAtUtc: preview.updatedAtUtc,
      );
      if (!_isCurrentApplyOperation(applyGeneration, route, repository)) {
        return;
      }

      setState(() {
        _applyResult = result;
        _isApplying = false;
      });
    } catch (error) {
      if (!_isCurrentApplyOperation(applyGeneration, route, repository)) {
        return;
      }

      setState(() {
        _applyFailure = ReceiptOcrReviewFailure.from(error);
        _isApplying = false;
      });
    }
  }

  bool get _detailActionsBlocked =>
      _isLoadingReview ||
      _isLoadingPreview ||
      _isApplying ||
      _isSaving ||
      _isDeleting;

  bool _isCurrentDetailOperation(
    int generation,
    ReceiptOcrReviewRoute route,
    ReceiptOcrReviewRepository repository,
  ) {
    return mounted &&
        _reviewLoadGeneration == generation &&
        identical(widget.repository, repository) &&
        _sameRoute(_route, route);
  }

  bool _isCurrentPreviewOperation(
    int generation,
    ReceiptOcrReviewRoute route,
    ReceiptOcrReviewRepository repository,
  ) {
    return mounted &&
        _previewLoadGeneration == generation &&
        identical(widget.repository, repository) &&
        _sameRoute(_route, route);
  }

  bool _isCurrentSaveOperation(
    int generation,
    ReceiptOcrReviewRoute route,
    ReceiptOcrReviewRepository repository,
  ) {
    return mounted &&
        _saveGeneration == generation &&
        identical(widget.repository, repository) &&
        _sameRoute(_route, route);
  }

  bool _isCurrentDeleteOperation(
    int generation,
    ReceiptOcrReviewRoute route,
    ReceiptOcrReviewRepository repository,
  ) {
    return mounted &&
        _deleteGeneration == generation &&
        identical(widget.repository, repository) &&
        _sameRoute(_route, route);
  }

  bool _isCurrentApplyOperation(
    int generation,
    ReceiptOcrReviewRoute route,
    ReceiptOcrReviewRepository repository,
  ) {
    return mounted &&
        _applyGeneration == generation &&
        identical(widget.repository, repository) &&
        _sameRoute(_route, route);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Receipt Review'),
        actions: [
          if (!_isEditing)
            IconButton(
              onPressed:
                  _detailActionsBlocked ||
                      _reviewFailure != null ||
                      _review == null
                  ? null
                  : _startEditing,
              tooltip: 'Edit',
              icon: const Icon(Icons.edit_outlined),
            ),
          IconButton(
            onPressed: _detailActionsBlocked || _isEditing ? null : _loadReview,
            tooltip: 'Refresh',
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: _ReceiptOcrReviewDetailBody(
          isLoadingReview: _isLoadingReview,
          isEditing: _isEditing,
          isSaving: _isSaving,
          isDeleting: _isDeleting,
          isLoadingPreview: _isLoadingPreview,
          isApplying: _isApplying,
          actionsBlocked: _detailActionsBlocked,
          review: _review,
          reviewFailure: _reviewFailure,
          preview: _preview,
          previewFailure: _previewFailure,
          applyResult: _applyResult,
          applyFailure: _applyFailure,
          saveFailure: _saveFailure,
          deleteFailure: _deleteFailure,
          onRetry: _loadReview,
          onSave: _saveReview,
          onCancelEditing: _cancelEditing,
          onDelete: _confirmDelete,
          onPreview: _loadPreview,
          onApply: _confirmApply,
        ),
      ),
    );
  }
}

ReceiptOcrReviewRoute _routeFor(ReceiptOcrReviewDetailScreen widget) {
  return widget.route ?? ReceiptOcrReviewRoute.fromSummary(widget.summary!);
}

bool _sameRoute(ReceiptOcrReviewRoute left, ReceiptOcrReviewRoute right) {
  return left.billId == right.billId &&
      left.fileId == right.fileId &&
      left.groupId == right.groupId;
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

class _FailurePanel extends StatelessWidget {
  const _FailurePanel({required this.failure, required this.onRetry});

  final ReceiptOcrReviewFailure failure;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return _StatePanel(
      icon: _failureIcon(failure.kind),
      title: failure.title,
      message: _safeReceiptOcrReviewFailureDisplayMessage(failure),
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
                  Text(_safeReceiptOcrReviewFailureDisplayMessage(failure)),
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

String _safeReceiptOcrReviewFailureDisplayMessage(
  ReceiptOcrReviewFailure failure,
) {
  final message = failure.message.trim();
  if (message.isEmpty ||
      _containsUnsafeReceiptOcrReviewFailureDetail(message)) {
    return _fallbackReceiptOcrReviewFailureMessage(failure.kind);
  }

  return message;
}

bool _containsUnsafeReceiptOcrReviewFailureDetail(String message) {
  final lower = message.toLowerCase();
  return lower.contains('stacktrace') ||
      lower.contains('stack trace') ||
      lower.contains('exception') ||
      lower.contains('bearer ') ||
      lower.contains('access token') ||
      lower.contains('refresh token') ||
      lower.contains('session token') ||
      lower.contains('authorization:') ||
      lower.contains('raw bytes') ||
      lower.contains('object key') ||
      lower.contains('storage path') ||
      lower.contains('filesystem') ||
      lower.contains('ocr payload') ||
      lower.contains('raw ocr') ||
      lower.contains('full ocr') ||
      lower.contains('s3://') ||
      lower.contains('gs://') ||
      lower.contains('/var/') ||
      lower.contains('/tmp/') ||
      lower.contains('\\users\\') ||
      lower.contains('c:\\') ||
      RegExp(r'\[[0-9,\s]+\]').hasMatch(message);
}

String _fallbackReceiptOcrReviewFailureMessage(
  ReceiptOcrReviewFailureKind kind,
) {
  return switch (kind) {
    ReceiptOcrReviewFailureKind.unauthenticated =>
      'Sign in before loading receipt reviews.',
    ReceiptOcrReviewFailureKind.denied =>
      'This receipt review is not available to this account.',
    ReceiptOcrReviewFailureKind.unavailable =>
      'The receipt review is no longer available.',
    ReceiptOcrReviewFailureKind.conflict =>
      'Refresh the receipt review and try again.',
    ReceiptOcrReviewFailureKind.validation =>
      'The receipt review request is no longer valid. Refresh and try again.',
    ReceiptOcrReviewFailureKind.network =>
      'The server is unavailable. Try again when the connection is back.',
    ReceiptOcrReviewFailureKind.server =>
      'Receipt reviews are unavailable right now. Try again later.',
  };
}

String _titleFromCode(String code) {
  return code
      .split('_')
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}
