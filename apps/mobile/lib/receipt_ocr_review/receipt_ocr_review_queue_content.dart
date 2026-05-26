part of 'receipt_ocr_review_screen.dart';

class _ReceiptOcrReviewQueueContent extends StatelessWidget {
  const _ReceiptOcrReviewQueueContent({
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
  Widget build(BuildContext context) {
    final currentFailure = failure;

    if (!isConnected) {
      return const _StatePanel(
        icon: Icons.lock_outline,
        title: 'Sign in required',
        message: 'Connect an account session before loading receipt reviews.',
      );
    }

    if (reviews.isNotEmpty) {
      return _ReceiptOcrReviewSummaryList(
        reviews: reviews,
        isRefreshing: isLoading,
        failure: currentFailure,
        onRefresh: onRefresh,
        onRetry: onRetry,
        onOpenReview: onOpenReview,
      );
    }

    if (isLoading) {
      return const _LoadingPanel(label: 'Loading receipt reviews');
    }

    if (currentFailure != null) {
      return _FailurePanel(failure: currentFailure, onRetry: onRetry);
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
    required this.onRefresh,
    required this.onRetry,
    required this.onOpenReview,
  });

  final List<ReceiptOcrReviewSummary> reviews;
  final bool isRefreshing;
  final ReceiptOcrReviewFailure? failure;
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
                    child: OutlinedButton.icon(
                      onPressed: onRetry,
                      icon: const Icon(Icons.refresh),
                      label: const Text('Retry'),
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
