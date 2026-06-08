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
      child: ListView(
        padding: const EdgeInsets.all(16),
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
                  const SizedBox(height: 10),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: _ReceiptOcrReviewRetryButton(onRetry: onRetry),
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

    return Semantics(
      button: true,
      excludeSemantics: true,
      label: _receiptOcrReviewSummarySemanticLabel(review),
      onTap: onTap,
      child: Card(
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
      ),
    );
  }
}
