part of 'receipt_ocr_review_screen.dart';

class _ReceiptOcrReviewQueueContent extends StatefulWidget {
  const _ReceiptOcrReviewQueueContent({
    super.key,
    required this.isConnected,
    required this.reviews,
    required this.isLoading,
    required this.failure,
    required this.onRefresh,
    required this.onRetry,
    required this.onOpenReview,
  });

  final bool isConnected;
  final List<ReceiptOcrReviewSummary> reviews;
  final bool isLoading;
  final ReceiptOcrReviewFailure? failure;
  final Future<void> Function() onRefresh;
  final VoidCallback onRetry;
  final void Function(ReceiptOcrReviewSummary review) onOpenReview;

  @override
  State<_ReceiptOcrReviewQueueContent> createState() =>
      _ReceiptOcrReviewQueueContentState();
}

class _ReceiptOcrReviewQueueContentState
    extends State<_ReceiptOcrReviewQueueContent> {
  final TextEditingController _searchController = TextEditingController();
  _ReceiptOcrReviewDiscoveryFilter _selectedFilter =
      _ReceiptOcrReviewDiscoveryFilter.all;

  String _searchQuery = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  bool get _isDiscoveryActive =>
      _searchQuery.trim().isNotEmpty ||
      _selectedFilter != _ReceiptOcrReviewDiscoveryFilter.all;

  void _setSearchQuery(String value) {
    setState(() {
      _searchQuery = value;
    });
  }

  void _setSelectedFilter(_ReceiptOcrReviewDiscoveryFilter filter) {
    setState(() {
      _selectedFilter = filter;
    });
  }

  void _clearDiscovery() {
    _searchController.clear();
    setState(() {
      _searchQuery = '';
      _selectedFilter = _ReceiptOcrReviewDiscoveryFilter.all;
    });
  }

  @override
  Widget build(BuildContext context) {
    final currentFailure = widget.failure;

    if (!widget.isConnected) {
      return const _StatePanel(
        icon: Icons.lock_outline,
        title: 'Sign in required',
        message: 'Connect an account session before loading receipt reviews.',
      );
    }

    if (widget.reviews.isNotEmpty) {
      final discovery = _ReceiptOcrReviewDiscoveryState(
        reviews: widget.reviews,
        selectedFilter: _selectedFilter,
        searchQuery: _searchQuery,
      );

      return _ReceiptOcrReviewSummaryList(
        reviews: discovery.visibleReviews,
        isRefreshing: widget.isLoading,
        failure: currentFailure,
        discovery: discovery,
        searchController: _searchController,
        onSearchChanged: _setSearchQuery,
        onFilterSelected: _setSelectedFilter,
        onClearDiscovery: _isDiscoveryActive ? _clearDiscovery : null,
        onRefresh: widget.onRefresh,
        onRetry: widget.onRetry,
        onOpenReview: widget.onOpenReview,
      );
    }

    if (widget.isLoading) {
      return const _LoadingPanel(label: 'Loading receipt reviews');
    }

    if (currentFailure != null) {
      return _FailurePanel(failure: currentFailure, onRetry: widget.onRetry);
    }

    return const _StatePanel(
      icon: Icons.receipt_long_outlined,
      title: 'No receipt reviews',
      message:
          'Saved reviews that are visible to this account will appear here.',
    );
  }
}

class _ReceiptOcrReviewSummaryList extends StatelessWidget {
  const _ReceiptOcrReviewSummaryList({
    required this.reviews,
    required this.isRefreshing,
    required this.failure,
    required this.discovery,
    required this.searchController,
    required this.onSearchChanged,
    required this.onFilterSelected,
    required this.onClearDiscovery,
    required this.onRefresh,
    required this.onRetry,
    required this.onOpenReview,
  });

  final List<ReceiptOcrReviewSummary> reviews;
  final bool isRefreshing;
  final ReceiptOcrReviewFailure? failure;
  final _ReceiptOcrReviewDiscoveryState discovery;
  final TextEditingController searchController;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<_ReceiptOcrReviewDiscoveryFilter> onFilterSelected;
  final VoidCallback? onClearDiscovery;
  final Future<void> Function() onRefresh;
  final VoidCallback onRetry;
  final void Function(ReceiptOcrReviewSummary review) onOpenReview;

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (isRefreshing) ...[
              const LinearProgressIndicator(),
              const SizedBox(height: 12),
            ],
            if (failure != null) ...[
              _QueueFailureBanner(failure: failure!, onRetry: onRetry),
              const SizedBox(height: 12),
            ],
            _ReceiptOcrReviewDiscoveryControls(
              discovery: discovery,
              searchController: searchController,
              onSearchChanged: onSearchChanged,
              onFilterSelected: onFilterSelected,
              onClearDiscovery: onClearDiscovery,
            ),
            const SizedBox(height: 12),
            if (reviews.isEmpty)
              _StatePanel(
                icon: Icons.search_off_outlined,
                title: 'No matching receipt reviews',
                message:
                    'Adjust the search or filters to show loaded receipt reviews.',
              )
            else
              for (var index = 0; index < reviews.length; index++) ...[
                if (index > 0) const SizedBox(height: 12),
                _ReceiptOcrReviewSummaryTile(
                  review: reviews[index],
                  onTap: () => onOpenReview(reviews[index]),
                ),
              ],
          ],
        ),
      ),
    );
  }
}

class _ReceiptOcrReviewDiscoveryControls extends StatelessWidget {
  const _ReceiptOcrReviewDiscoveryControls({
    required this.discovery,
    required this.searchController,
    required this.onSearchChanged,
    required this.onFilterSelected,
    required this.onClearDiscovery,
  });

  final _ReceiptOcrReviewDiscoveryState discovery;
  final TextEditingController searchController;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<_ReceiptOcrReviewDiscoveryFilter> onFilterSelected;
  final VoidCallback? onClearDiscovery;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          key: const Key('receipt-review-search'),
          controller: searchController,
          decoration: const InputDecoration(
            labelText: 'Search receipt reviews',
            prefixIcon: Icon(Icons.search),
            border: OutlineInputBorder(),
          ),
          textInputAction: TextInputAction.search,
          onChanged: onSearchChanged,
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            for (final filter in _ReceiptOcrReviewDiscoveryFilter.values)
              FilterChip(
                key: ValueKey('receipt-review-filter-${filter.key}'),
                selected: discovery.selectedFilter == filter,
                label: Text('${filter.label} (${discovery.countFor(filter)})'),
                onSelected: (_) => onFilterSelected(filter),
              ),
            if (onClearDiscovery != null)
              TextButton.icon(
                key: const Key('receipt-review-clear-discovery'),
                onPressed: onClearDiscovery,
                icon: const Icon(Icons.clear),
                label: const Text('Clear'),
              ),
          ],
        ),
      ],
    );
  }
}

enum _ReceiptOcrReviewDiscoveryFilter {
  all(label: 'All', key: 'all'),
  needsReview(label: 'Needs review', key: 'needs-review'),
  applied(label: 'Applied', key: 'applied'),
  personal(label: 'Personal', key: 'personal'),
  group(label: 'Group', key: 'group'),
  hasCurrency(label: 'Has currency', key: 'has-currency'),
  missingCurrency(label: 'Missing currency', key: 'missing-currency');

  const _ReceiptOcrReviewDiscoveryFilter({
    required this.label,
    required this.key,
  });

  final String label;
  final String key;
}

class _ReceiptOcrReviewDiscoveryState {
  _ReceiptOcrReviewDiscoveryState({
    required this.reviews,
    required this.selectedFilter,
    required String searchQuery,
  }) : searchQuery = searchQuery.trim().toLowerCase();

  final List<ReceiptOcrReviewSummary> reviews;
  final _ReceiptOcrReviewDiscoveryFilter selectedFilter;
  final String searchQuery;

  late final List<ReceiptOcrReviewSummary> visibleReviews = [
    for (final review in reviews)
      if (_matchesFilter(review, selectedFilter) && _matchesSearch(review))
        review,
  ];

  int countFor(_ReceiptOcrReviewDiscoveryFilter filter) {
    return reviews.where((review) => _matchesFilter(review, filter)).length;
  }

  bool _matchesSearch(ReceiptOcrReviewSummary review) {
    if (searchQuery.isEmpty) {
      return true;
    }

    return _safeSearchText(review).contains(searchQuery);
  }

  String _safeSearchText(ReceiptOcrReviewSummary review) {
    return [
      if (review.merchantText case final merchant?)
        if (merchant.trim().isNotEmpty) merchant,
      receiptOcrReviewStatusLabel(review.status),
      review.groupId == null ? 'Personal bill personal' : 'Group bill group',
      ?_displayCurrencyCandidate(review.currency),
    ].join(' ').toLowerCase();
  }
}

bool _matchesFilter(
  ReceiptOcrReviewSummary review,
  _ReceiptOcrReviewDiscoveryFilter filter,
) {
  return switch (filter) {
    _ReceiptOcrReviewDiscoveryFilter.all => true,
    _ReceiptOcrReviewDiscoveryFilter.needsReview =>
      review.status == ReceiptOcrReviewStatusValues.provisional,
    _ReceiptOcrReviewDiscoveryFilter.applied =>
      review.status == ReceiptOcrReviewStatusValues.reviewed,
    _ReceiptOcrReviewDiscoveryFilter.personal => review.groupId == null,
    _ReceiptOcrReviewDiscoveryFilter.group => review.groupId != null,
    _ReceiptOcrReviewDiscoveryFilter.hasCurrency =>
      _displayCurrencyCandidate(review.currency) != null,
    _ReceiptOcrReviewDiscoveryFilter.missingCurrency =>
      _displayCurrencyCandidate(review.currency) == null,
  };
}

String? _displayCurrencyCandidate(String? currency) {
  if (currency == null) {
    return null;
  }

  final normalized = currency.trim().toUpperCase();
  if (!RegExp(r'^[A-Z]{3}$').hasMatch(normalized)) {
    return null;
  }

  return normalized;
}

class _QueueFailureBanner extends StatelessWidget {
  const _QueueFailureBanner({required this.failure, required this.onRetry});

  final ReceiptOcrReviewFailure failure;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return SettleoraInlinePanel(
      icon: _failureIcon(failure.kind),
      title: failure.title,
      message: _safeReceiptOcrReviewFailureDisplayMessage(failure),
      variant: SettleoraSurfaceVariant.danger,
      action: _ReceiptOcrReviewRetryButton(onRetry: onRetry),
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
    final currency = _displayCurrencyCandidate(review.currency);
    final status = receiptOcrReviewStatusLabel(review.status);
    final source = receiptOcrReviewSourceLabel(review.source);
    final attention = _queueAttentionText(review);
    final issueCount = _queueIssueCount(review);

    return Semantics(
      button: true,
      excludeSemantics: true,
      label: _receiptOcrReviewSummarySemanticLabel(review),
      onTap: onTap,
      child: AppCard(
        padding: const EdgeInsets.all(12),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                LayoutBuilder(
                  builder: (context, constraints) => Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: SettleoraCompactHeader(
                          title: merchant,
                          subtitle: scope,
                          leadingIcon: Icons.receipt_long_outlined,
                        ),
                      ),
                      const SizedBox(width: 10),
                      ConstrainedBox(
                        constraints: BoxConstraints(
                          maxWidth: constraints.maxWidth / 2,
                        ),
                        child: StatusChip(
                          label: status,
                          icon: Icons.pending_actions_outlined,
                          wrap: true,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                DecoratedBox(
                  decoration: BoxDecoration(
                    color: Theme.of(
                      context,
                    ).colorScheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          issueCount > 0
                              ? Icons.report_problem_outlined
                              : Icons.fact_check_outlined,
                          color: Theme.of(context).colorScheme.primary,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                attention,
                                style: Theme.of(context).textTheme.titleSmall,
                              ),
                              const SizedBox(height: 3),
                              Text(
                                issueCount > 0
                                    ? _queueReviewReason(review)
                                    : 'Review before applying to the draft.',
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
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: _QueueMetaColumn(
                        label: 'Receipt source',
                        value: [
                          source,
                          '${review.lineCount} line${review.lineCount == 1 ? '' : 's'}',
                        ].join(' • '),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _QueueMetaColumn(
                        label: 'Last updated',
                        value: _formatQueueDate(review.updatedAtUtc),
                        alignEnd: true,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        currency == null
                            ? 'Total not confirmed'
                            : 'Detected currency: $currency',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    FilledButton.icon(
                      onPressed: onTap,
                      icon: const Icon(Icons.rate_review_outlined),
                      label: const Text('Review receipt'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _QueueMetaColumn extends StatelessWidget {
  const _QueueMetaColumn({
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
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          textAlign: alignEnd ? TextAlign.end : TextAlign.start,
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    );
  }
}

int _queueIssueCount(ReceiptOcrReviewSummary review) {
  var count = 0;
  if (review.status == ReceiptOcrReviewStatusValues.provisional) {
    count += 1;
  }
  if (review.lineCount <= 0) {
    count += 1;
  }
  if (_displayCurrencyCandidate(review.currency) == null) {
    count += 1;
  }
  return count;
}

String _queueAttentionText(ReceiptOcrReviewSummary review) {
  if (review.status == ReceiptOcrReviewStatusValues.provisional) {
    if (review.lineCount <= 0) {
      return 'Review before applying';
    }
    if (_displayCurrencyCandidate(review.currency) == null) {
      return 'Confirm the receipt currency';
    }
    return 'Review before applying';
  }

  if (review.lineCount <= 0) {
    return 'Review saved data before applying';
  }

  return 'Reviewed receipt ready to open';
}

String _queueReviewReason(ReceiptOcrReviewSummary review) {
  final reasons = <String>[];
  if (review.lineCount <= 0) {
    reasons.add('no receipt lines');
  }
  if (_displayCurrencyCandidate(review.currency) == null) {
    reasons.add('total or currency not confirmed');
  }

  if (reasons.isEmpty) {
    return 'Check the receipt details before applying them to the draft.';
  }

  final formatted = reasons.length == 1
      ? reasons.single
      : '${reasons.take(reasons.length - 1).join(', ')} and ${reasons.last}';
  return 'Check $formatted before applying to the draft.';
}

String _formatQueueDate(DateTime value) {
  final month = value.month.toString().padLeft(2, '0');
  final day = value.day.toString().padLeft(2, '0');
  return '${value.year}-$month-$day';
}
