import 'package:flutter/material.dart';

import '../ui/settleora_components.dart'
    show
        AppCard,
        MoneyText,
        SettleoraCompactHeader,
        SettleoraInlinePanel,
        SettleoraSurfaceVariant;
import '../ui/settleora_form_fields.dart';
import 'receipt_ocr_review_repository.dart';

part 'receipt_ocr_review_accessibility.dart';
part 'receipt_ocr_review_detail_content.dart';
part 'receipt_ocr_review_queue_content.dart';

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
  _ReceiptOcrReviewQueueReturnState _returnState =
      const _ReceiptOcrReviewQueueReturnState();

  @override
  void initState() {
    super.initState();
    if (widget.repository != null) {
      _isLoading = true;
      Future<void>.microtask(() => _loadReviews(force: true));
    }
  }

  @override
  void didUpdateWidget(ReceiptOcrReviewQueueScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.repository != widget.repository) {
      _loadGeneration += 1;
      _isLoading = widget.repository != null;
      _reviews = const [];
      _failure = null;
      _returnState = const _ReceiptOcrReviewQueueReturnState();
      ScaffoldMessenger.maybeOf(context)?.clearSnackBars();
      if (widget.repository != null) {
        Future<void>.microtask(() => _loadReviews(force: true));
      }
    }
  }

  Future<void> _loadReviews({bool force = false}) async {
    final repository = widget.repository;
    if (repository == null || (_isLoading && !force)) {
      return;
    }

    final loadGeneration = _loadGeneration + 1;
    final suppressedKeysAtLoadStart = _returnState.suppressedDeletedRouteKeys;
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

      final currentSuppressedKeys = _returnState.suppressedDeletedRouteKeys;
      final staleSuppressedKeys = currentSuppressedKeys.difference(
        suppressedKeysAtLoadStart,
      );
      final shouldRefreshAgain = _returnState.refreshAfterActiveLoad;
      setState(() {
        _reviews = _withoutSuppressedDeletedRoutes(
          reviews,
          staleSuppressedKeys,
        );
        _isLoading = false;
        _returnState = _returnState.completeActiveLoad(staleSuppressedKeys);
      });
      _scheduleFollowUpRefreshIfNeeded(shouldRefreshAgain);
    } catch (error) {
      if (!_isCurrentLoad(loadGeneration, repository)) {
        return;
      }

      final shouldRefreshAgain = _returnState.refreshAfterActiveLoad;
      setState(() {
        _failure = ReceiptOcrReviewFailure.from(error);
        _isLoading = false;
        _returnState = _returnState.completeActiveLoad(
          _returnState.suppressedDeletedRouteKeys,
        );
      });
      _scheduleFollowUpRefreshIfNeeded(shouldRefreshAgain);
    }
  }

  void _scheduleFollowUpRefreshIfNeeded(bool shouldRefreshAgain) {
    if (shouldRefreshAgain) {
      Future<void>.microtask(_loadReviews);
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

    final route = ReceiptOcrReviewRoute.fromSummary(review);
    Navigator.of(context)
        .push(
          MaterialPageRoute<_ReceiptOcrReviewDetailResult>(
            builder: (_) => ReceiptOcrReviewDetailScreen(
              repository: repository,
              summary: review,
              returnMutationResult: true,
            ),
          ),
        )
        .then((result) {
          if (result == null) {
            return;
          }

          _handleDetailReturnResult(
            result: result,
            openedRoute: route,
            openedRepository: repository,
          );
        });
  }

  void _handleDetailReturnResult({
    required _ReceiptOcrReviewDetailResult result,
    required ReceiptOcrReviewRoute openedRoute,
    required ReceiptOcrReviewRepository openedRepository,
  }) {
    if (!mounted ||
        !identical(widget.repository, openedRepository) ||
        !_sameRoute(result.route, openedRoute)) {
      return;
    }

    _showReturnFeedback(result);

    if (result.suppressesQueueRow) {
      final routeKey = result.routeKey;
      setState(() {
        _returnState = _returnState.suppressDeletedRoute(result.route);
        _reviews = _withoutSuppressedDeletedRoutes(_reviews, {routeKey});
      });
    }

    if (_isLoading) {
      setState(() {
        _returnState = _returnState.scheduleRefreshAfterActiveLoad();
      });
      return;
    }

    Future<void>.microtask(_loadReviews);
  }

  void _showReturnFeedback(_ReceiptOcrReviewDetailResult result) {
    final feedbackKey = result.feedbackKey;
    if (_returnState.activeFeedbackKey == feedbackKey) {
      return;
    }

    _returnState = _returnState.activateFeedback(result);
    final messenger = ScaffoldMessenger.of(context);
    messenger.hideCurrentSnackBar();
    final controller = messenger.showSnackBar(
      SnackBar(content: Text(result.feedbackMessage)),
    );
    controller.closed.then((_) {
      if (!mounted || _returnState.activeFeedbackKey != feedbackKey) {
        return;
      }

      _returnState = _returnState.clearActiveFeedback(feedbackKey);
    });
  }

  List<ReceiptOcrReviewSummary> _withoutSuppressedDeletedRoutes(
    List<ReceiptOcrReviewSummary> reviews,
    Set<String> routeKeys,
  ) {
    if (routeKeys.isEmpty) {
      return reviews;
    }

    return [
      for (final review in reviews)
        if (!routeKeys.contains(_routeKeyForSummary(review))) review,
    ];
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
            tooltip: _refreshReceiptOcrReviewsLabel,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: _ReceiptOcrReviewQueueContent(
          key: ValueKey<ReceiptOcrReviewRepository?>(repository),
          isConnected: repository != null,
          reviews: _reviews,
          isLoading: _isLoading,
          failure: _failure,
          onRefresh: _loadReviews,
          onRetry: _loadReviews,
          onOpenReview: _openReview,
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
    this.returnMutationResult = false,
  }) : route = null;

  const ReceiptOcrReviewDetailScreen.forRoute({
    super.key,
    required this.repository,
    required this.route,
    this.returnMutationResult = false,
  }) : summary = null,
       assert(route != null);

  final ReceiptOcrReviewRepository repository;
  final ReceiptOcrReviewSummary? summary;
  final ReceiptOcrReviewRoute? route;
  final bool returnMutationResult;

  @override
  State<ReceiptOcrReviewDetailScreen> createState() =>
      _ReceiptOcrReviewDetailScreenState();
}

class _ReceiptOcrReviewDetailScreenState
    extends State<ReceiptOcrReviewDetailScreen> {
  bool _isLoadingReview = true;
  bool _isLoadingPreview = false;
  bool _isApplying = false;
  bool _isConfirmingApply = false;
  bool _isConfirmingDelete = false;
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
  _ReceiptOcrReviewDetailResult? _pendingMutationResult;
  bool _isReturningMutationResult = false;

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
      _isConfirmingApply = false;
      _isConfirmingDelete = false;
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
      _pendingMutationResult = null;
      _isReturningMutationResult = false;
      Future<void>.microtask(_loadReview);
    }
  }

  Future<void> _loadReview() async {
    if (_isSaving || _isDeleting || _isConfirmingDelete || _isApplying) {
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
    if (_isSaving || _isDeleting || _isConfirmingDelete || _isLoadingReview) {
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
        _pendingMutationResult = _mutationResultFor(
          route,
          kind: _ReceiptOcrReviewDetailResultKind.saved,
        );
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
    if (_isSaving || _isDeleting || _isConfirmingDelete || _isLoadingReview) {
      return;
    }

    final repository = widget.repository;
    final route = _route;
    setState(() {
      _isConfirmingDelete = true;
      _deleteFailure = null;
    });

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Remove saved review?'),
          content: const Text(
            'This deletes the saved OCR review data for this receipt review. It does not delete the receipt attachment or any finalized bill record.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const _SemanticButtonLabel(
                label: _cancelReceiptOcrReviewDeletionLabel,
                child: Text('Cancel'),
              ),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const _SemanticButtonLabel(
                label: _confirmReceiptOcrReviewDeletionLabel,
                child: Text('Remove'),
              ),
            ),
          ],
        );
      },
    );

    if (!mounted ||
        !identical(widget.repository, repository) ||
        !_sameRoute(_route, route)) {
      return;
    }

    if (confirmed != true) {
      setState(() {
        _isConfirmingDelete = false;
      });
      return;
    }

    await _deleteReview(repository: repository, route: route);
  }

  Future<void> _deleteReview({
    required ReceiptOcrReviewRepository repository,
    required ReceiptOcrReviewRoute route,
  }) async {
    if (_isSaving || _isDeleting || _isLoadingReview) {
      return;
    }

    final deleteGeneration = _deleteGeneration + 1;
    setState(() {
      _deleteGeneration = deleteGeneration;
      _isConfirmingDelete = false;
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

      navigator.pop(
        _mutationResultFor(
          route,
          kind: _ReceiptOcrReviewDetailResultKind.deleted,
        ),
      );
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

    final repository = widget.repository;
    final route = _route;
    setState(() {
      _isConfirmingApply = true;
      _applyFailure = null;
    });

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Apply reviewed lines?'),
          content: const Text(
            'OCR data is provisional. Review the saved details before applying them to a draft bill.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const _SemanticButtonLabel(
                label: _cancelReceiptOcrReviewApplyLabel,
                child: Text('Cancel'),
              ),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const _SemanticButtonLabel(
                label: _confirmReceiptOcrReviewApplyLabel,
                child: Text('Apply'),
              ),
            ),
          ],
        );
      },
    );

    if (!mounted ||
        !identical(widget.repository, repository) ||
        !_sameRoute(_route, route)) {
      return;
    }

    if (confirmed != true) {
      setState(() {
        _isConfirmingApply = false;
      });
      return;
    }

    await _applyReview(
      repository: repository,
      route: route,
      expectedReviewUpdatedAtUtc: preview.updatedAtUtc,
    );
  }

  Future<void> _applyReview({
    required ReceiptOcrReviewRepository repository,
    required ReceiptOcrReviewRoute route,
    required DateTime expectedReviewUpdatedAtUtc,
  }) async {
    if (_isApplying || _isLoadingPreview || _isLoadingReview || _isEditing) {
      return;
    }

    final applyGeneration = _applyGeneration + 1;
    setState(() {
      _applyGeneration = applyGeneration;
      _isConfirmingApply = false;
      _isApplying = true;
      _applyFailure = null;
      _applyResult = null;
    });

    try {
      final result = await repository.applyReview(
        route,
        expectedReviewUpdatedAtUtc: expectedReviewUpdatedAtUtc,
      );
      if (!_isCurrentApplyOperation(applyGeneration, route, repository)) {
        return;
      }

      setState(() {
        _applyResult = result;
        _isApplying = false;
        _pendingMutationResult = _mutationResultFor(
          route,
          kind: _ReceiptOcrReviewDetailResultKind.applied,
        );
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
      _isConfirmingApply ||
      _isConfirmingDelete ||
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

  _ReceiptOcrReviewDetailResult? _mutationResultFor(
    ReceiptOcrReviewRoute route, {
    required _ReceiptOcrReviewDetailResultKind kind,
  }) {
    if (!widget.returnMutationResult) {
      return null;
    }

    return _ReceiptOcrReviewDetailResult(route: route, kind: kind);
  }

  void _returnPendingMutationResult() {
    final result = _pendingMutationResult;
    if (result == null || _isReturningMutationResult) {
      return;
    }

    setState(() {
      _isReturningMutationResult = true;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }

      Navigator.of(context).pop(result);
    });
  }

  @override
  Widget build(BuildContext context) {
    return PopScope<_ReceiptOcrReviewDetailResult>(
      canPop: _pendingMutationResult == null || _isReturningMutationResult,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) {
          return;
        }

        _returnPendingMutationResult();
      },
      child: Scaffold(
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
                tooltip: _editReceiptOcrReviewLabel,
                icon: const Icon(Icons.edit_outlined),
              ),
            IconButton(
              onPressed: _detailActionsBlocked || _isEditing
                  ? null
                  : _loadReview,
              tooltip: _refreshReceiptOcrReviewLabel,
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
            isDeleteWorkActive: _isDeleting || _isConfirmingDelete,
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

class _ReceiptOcrReviewDetailResult {
  const _ReceiptOcrReviewDetailResult({
    required this.route,
    required this.kind,
  });

  final ReceiptOcrReviewRoute route;
  final _ReceiptOcrReviewDetailResultKind kind;

  String get routeKey => _routeKeyFor(route);

  String get feedbackKey => '$routeKey|${kind.name}';

  String get feedbackMessage => kind.feedbackMessage;

  bool get suppressesQueueRow =>
      kind == _ReceiptOcrReviewDetailResultKind.deleted;
}

enum _ReceiptOcrReviewDetailResultKind { saved, applied, deleted }

extension on _ReceiptOcrReviewDetailResultKind {
  String get feedbackMessage {
    return switch (this) {
      _ReceiptOcrReviewDetailResultKind.saved => 'Receipt review saved.',
      _ReceiptOcrReviewDetailResultKind.applied =>
        'Receipt review applied. Check the bill draft before saving.',
      _ReceiptOcrReviewDetailResultKind.deleted => 'Receipt review deleted.',
    };
  }
}

class _ReceiptOcrReviewQueueReturnState {
  const _ReceiptOcrReviewQueueReturnState({
    this.suppressedDeletedRouteKeys = const {},
    this.refreshAfterActiveLoad = false,
    this.activeFeedbackKey,
  });

  final Set<String> suppressedDeletedRouteKeys;
  final bool refreshAfterActiveLoad;
  final String? activeFeedbackKey;

  _ReceiptOcrReviewQueueReturnState suppressDeletedRoute(
    ReceiptOcrReviewRoute route,
  ) {
    return _ReceiptOcrReviewQueueReturnState(
      suppressedDeletedRouteKeys: {
        ...suppressedDeletedRouteKeys,
        _routeKeyFor(route),
      },
      refreshAfterActiveLoad: refreshAfterActiveLoad,
      activeFeedbackKey: activeFeedbackKey,
    );
  }

  _ReceiptOcrReviewQueueReturnState scheduleRefreshAfterActiveLoad() {
    return _ReceiptOcrReviewQueueReturnState(
      suppressedDeletedRouteKeys: suppressedDeletedRouteKeys,
      refreshAfterActiveLoad: true,
      activeFeedbackKey: activeFeedbackKey,
    );
  }

  _ReceiptOcrReviewQueueReturnState completeActiveLoad(
    Set<String> retainedSuppressedDeletedRouteKeys,
  ) {
    return _ReceiptOcrReviewQueueReturnState(
      suppressedDeletedRouteKeys: retainedSuppressedDeletedRouteKeys,
      activeFeedbackKey: activeFeedbackKey,
    );
  }

  _ReceiptOcrReviewQueueReturnState activateFeedback(
    _ReceiptOcrReviewDetailResult result,
  ) {
    return _ReceiptOcrReviewQueueReturnState(
      suppressedDeletedRouteKeys: suppressedDeletedRouteKeys,
      refreshAfterActiveLoad: refreshAfterActiveLoad,
      activeFeedbackKey: result.feedbackKey,
    );
  }

  _ReceiptOcrReviewQueueReturnState clearActiveFeedback(String feedbackKey) {
    if (activeFeedbackKey != feedbackKey) {
      return this;
    }

    return _ReceiptOcrReviewQueueReturnState(
      suppressedDeletedRouteKeys: suppressedDeletedRouteKeys,
      refreshAfterActiveLoad: refreshAfterActiveLoad,
    );
  }
}

String _routeKeyForSummary(ReceiptOcrReviewSummary summary) {
  return _routeKeyFor(ReceiptOcrReviewRoute.fromSummary(summary));
}

String _routeKeyFor(ReceiptOcrReviewRoute route) {
  return '${route.groupId ?? ''}|${route.billId}|${route.fileId}';
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
      action: _ReceiptOcrReviewRetryButton(onRetry: onRetry),
    );
  }
}

class _ReceiptOcrReviewRetryButton extends StatelessWidget {
  const _ReceiptOcrReviewRetryButton({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: _retryReceiptOcrReviewsLabel,
      child: Semantics(
        button: true,
        excludeSemantics: true,
        label: _retryReceiptOcrReviewsLabel,
        onTap: onRetry,
        child: OutlinedButton.icon(
          onPressed: onRetry,
          icon: const Icon(Icons.refresh),
          label: const Text('Retry'),
        ),
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
