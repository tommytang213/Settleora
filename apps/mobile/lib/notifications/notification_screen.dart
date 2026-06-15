import 'package:flutter/material.dart';

import '../bills/bill_attachment_file_input.dart';
import '../bills/bill_attachment_repository.dart';
import '../bills/bill_list_screen.dart';
import '../bills/bill_repository.dart';
import '../bills/bill_revision_repository.dart';
import '../bills/bill_revision_review_screen.dart';
import '../groups/group_repository.dart';
import '../receipt_ocr_review/receipt_ocr_review_repository.dart';
import '../recurring_bills/recurring_bill_repository.dart';
import '../recurring_bills/recurring_bill_screen.dart';
import '../settlements/settlement_list_screen.dart';
import '../settlements/settlement_repository.dart';
import 'notification_repository.dart';

class SettleoraNotificationScreen extends StatefulWidget {
  const SettleoraNotificationScreen({
    super.key,
    required this.repository,
    this.currentUserProfileId,
    this.billRepository,
    this.groupRepository,
    this.settlementRepository,
    this.recurringBillRepository,
    this.billAttachmentRepository,
    this.billAttachmentFileInput,
    this.receiptOcrReviewRepository,
    this.billRevisionRepository,
    this.onSessionEnded,
  });

  final SettleoraNotificationRepository repository;
  final String? currentUserProfileId;
  final SettleoraBillRepository? billRepository;
  final SettleoraGroupRepository? groupRepository;
  final SettleoraSettlementRepository? settlementRepository;
  final SettleoraRecurringBillRepository? recurringBillRepository;
  final SettleoraBillAttachmentRepository? billAttachmentRepository;
  final SettleoraBillAttachmentFileInput? billAttachmentFileInput;
  final ReceiptOcrReviewRepository? receiptOcrReviewRepository;
  final SettleoraBillRevisionRepository? billRevisionRepository;
  final Future<void> Function(String? noticeMessage)? onSessionEnded;

  @override
  State<SettleoraNotificationScreen> createState() =>
      _SettleoraNotificationScreenState();
}

class _SettleoraNotificationScreenState
    extends State<SettleoraNotificationScreen> {
  bool _isLoading = true;
  bool _isMarkingAllRead = false;
  bool _isBulkMarkingVisibleRead = false;
  String? _actingNotificationId;
  SettleoraNotificationSummary? _summary;
  List<SettleoraNotificationRow> _notifications = const [];
  _NotificationFilter _selectedFilter = _NotificationFilter.all;
  SettleoraNotificationFailure? _loadFailure;
  SettleoraNotificationFailure? _actionFailure;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  Future<void> _load({bool showBlockingLoading = true}) async {
    setState(() {
      if (showBlockingLoading) {
        _isLoading = true;
      }
      _loadFailure = null;
      _actionFailure = null;
    });

    try {
      final summary = await widget.repository.getNotificationSummary();
      final notifications = await widget.repository.listNotifications(
        limit: 50,
      );
      if (!mounted) {
        return;
      }

      setState(() {
        _summary = summary;
        _notifications = notifications;
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _loadFailure = SettleoraNotificationFailure.from(error);
        _summary = null;
        _notifications = const [];
        _isLoading = false;
      });
    }
  }

  Future<void> _markNotificationRead(
    SettleoraNotificationRow notification,
  ) async {
    if (_actingNotificationId != null ||
        _isMarkingAllRead ||
        _isBulkMarkingVisibleRead ||
        notification.status == SettleoraNotificationStatusValues.archived ||
        !notification.isUnread) {
      return;
    }

    setState(() {
      _actingNotificationId = notification.id;
      _actionFailure = null;
    });

    try {
      await widget.repository.markNotificationRead(notification.id);
      if (!mounted) {
        return;
      }

      _showSnackBar('Notification marked read.');
      await _load(showBlockingLoading: false);
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _actionFailure = _safeNotificationActionFailure(
          error,
          fallbackMessage: 'Notification could not be marked read.',
        );
      });
    } finally {
      if (mounted) {
        setState(() {
          _actingNotificationId = null;
        });
      }
    }
  }

  Future<void> _markAllRead() async {
    final summary = _summary;
    if (_isMarkingAllRead ||
        _isBulkMarkingVisibleRead ||
        _actingNotificationId != null ||
        summary == null ||
        summary.unreadCount <= 0) {
      return;
    }

    setState(() {
      _isMarkingAllRead = true;
      _actionFailure = null;
    });

    try {
      await widget.repository.markAllNotificationsRead();
      if (!mounted) {
        return;
      }

      _showSnackBar('Notifications marked read.');
      await _load(showBlockingLoading: false);
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _actionFailure = _safeNotificationActionFailure(
          error,
          fallbackMessage: 'Notifications could not be marked read.',
        );
      });
    } finally {
      if (mounted) {
        setState(() {
          _isMarkingAllRead = false;
        });
      }
    }
  }

  Future<void> _markVisibleNotificationsRead(
    List<SettleoraNotificationRow> visibleUnreadNotifications,
  ) async {
    if (_isBulkMarkingVisibleRead ||
        _isMarkingAllRead ||
        _actingNotificationId != null ||
        visibleUnreadNotifications.isEmpty) {
      return;
    }

    final notificationIds = visibleUnreadNotifications
        .where(
          (notification) =>
              notification.status != SettleoraNotificationStatusValues.archived,
        )
        .map((notification) => notification.id)
        .where((id) => id.trim().isNotEmpty)
        .toList(growable: false);
    if (notificationIds.isEmpty) {
      return;
    }

    setState(() {
      _isBulkMarkingVisibleRead = true;
      _actionFailure = null;
    });

    try {
      for (final notificationId in notificationIds) {
        await widget.repository.markNotificationRead(notificationId);
      }
      if (!mounted) {
        return;
      }

      _showSnackBar('Visible notifications marked read.');
      await _load(showBlockingLoading: false);
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _actionFailure = _safeNotificationActionFailure(
          error,
          fallbackMessage: 'Visible notifications could not be marked read.',
        );
      });
    } finally {
      if (mounted) {
        setState(() {
          _isBulkMarkingVisibleRead = false;
        });
      }
    }
  }

  Future<void> _archiveNotification(
    SettleoraNotificationRow notification,
  ) async {
    if (_actingNotificationId != null ||
        _isMarkingAllRead ||
        _isBulkMarkingVisibleRead ||
        notification.status == SettleoraNotificationStatusValues.archived) {
      return;
    }

    setState(() {
      _actingNotificationId = notification.id;
      _actionFailure = null;
    });

    try {
      await widget.repository.archiveNotification(notification.id);
      if (!mounted) {
        return;
      }

      _showSnackBar('Notification archived.');
      await _load(showBlockingLoading: false);
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _actionFailure = _safeNotificationActionFailure(
          error,
          fallbackMessage: 'Notification could not be archived.',
        );
      });
    } finally {
      if (mounted) {
        setState(() {
          _actingNotificationId = null;
        });
      }
    }
  }

  Future<void> _restoreNotification(
    SettleoraNotificationRow notification,
  ) async {
    final restoreRepository =
        widget.repository is SettleoraNotificationRestoreRepository
        ? widget.repository as SettleoraNotificationRestoreRepository
        : null;
    if (_actingNotificationId != null ||
        _isMarkingAllRead ||
        _isBulkMarkingVisibleRead ||
        restoreRepository == null ||
        notification.status != SettleoraNotificationStatusValues.archived) {
      return;
    }

    setState(() {
      _actingNotificationId = notification.id;
      _actionFailure = null;
    });

    try {
      await restoreRepository.restoreNotification(notification.id);
      if (!mounted) {
        return;
      }

      _showSnackBar('Notification restored.');
      await _load(showBlockingLoading: false);
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _actionFailure = _safeNotificationActionFailure(
          error,
          fallbackMessage: 'Notification could not be restored.',
        );
      });
    } finally {
      if (mounted) {
        setState(() {
          _actingNotificationId = null;
        });
      }
    }
  }

  Future<void> _markOpenedNotificationRead(
    SettleoraNotificationRow notification,
  ) async {
    if (!notification.isUnread ||
        notification.status == SettleoraNotificationStatusValues.archived) {
      return;
    }

    try {
      await widget.repository.markNotificationRead(notification.id);
      if (!mounted) {
        return;
      }

      await _load(showBlockingLoading: false);
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _actionFailure = _safeOpenReadFailure(error);
      });
    }
  }

  Future<void> _openBillRevision(SettleoraNotificationRow notification) async {
    if (_actingNotificationId != null ||
        _isMarkingAllRead ||
        _isBulkMarkingVisibleRead ||
        notification.status == SettleoraNotificationStatusValues.archived) {
      return;
    }

    final billRevisionRepository = widget.billRevisionRepository;
    final billId = settleoraNotificationMetadataId(notification.expenseBillId);
    final revisionId = settleoraNotificationMetadataId(
      notification.expenseBillRevisionId,
    );

    if (billRevisionRepository == null ||
        !notification.hasBillRevisionReviewTarget ||
        billId == null ||
        revisionId == null) {
      return;
    }

    setState(() {
      _actingNotificationId = notification.id;
      _actionFailure = null;
    });

    try {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => SettleoraBillRevisionReviewScreen(
            repository: billRevisionRepository,
            billId: billId,
            revisionId: revisionId,
            billLabel: notification.displayTitle,
          ),
        ),
      );
      if (!mounted) {
        return;
      }

      await _markOpenedNotificationRead(notification);
    } finally {
      if (mounted) {
        setState(() {
          _actingNotificationId = null;
        });
      }
    }
  }

  bool _canOpenGroupBill(SettleoraNotificationRow notification) {
    return notification.hasGroupBillTarget &&
        widget.billRepository != null &&
        widget.groupRepository != null &&
        settleoraNotificationMetadataId(widget.currentUserProfileId) != null;
  }

  bool _canOpenPersonalBill(SettleoraNotificationRow notification) {
    return notification.hasPersonalBillTarget && widget.billRepository != null;
  }

  bool _canOpenSettlement(SettleoraNotificationRow notification) {
    return notification.hasSettlementTarget &&
        widget.settlementRepository != null &&
        settleoraNotificationMetadataId(widget.currentUserProfileId) != null;
  }

  bool _canOpenRecurringBill(SettleoraNotificationRow notification) {
    return notification.hasRecurringBillTarget &&
        widget.recurringBillRepository != null;
  }

  bool _canOpenAnyTypedTarget(SettleoraNotificationRow notification) {
    return (widget.billRevisionRepository != null &&
            notification.hasBillRevisionReviewTarget) ||
        _canOpenGroupBill(notification) ||
        _canOpenPersonalBill(notification) ||
        _canOpenSettlement(notification) ||
        _canOpenRecurringBill(notification);
  }

  Future<void> _openGroupBill(SettleoraNotificationRow notification) async {
    if (_actingNotificationId != null ||
        _isMarkingAllRead ||
        _isBulkMarkingVisibleRead ||
        notification.status == SettleoraNotificationStatusValues.archived ||
        !_canOpenGroupBill(notification)) {
      return;
    }

    final billRepository = widget.billRepository;
    final groupRepository = widget.groupRepository;
    final currentUserProfileId = settleoraNotificationMetadataId(
      widget.currentUserProfileId,
    );
    final groupId = settleoraNotificationMetadataId(notification.groupId);
    final billId = settleoraNotificationMetadataId(notification.expenseBillId);
    if (billRepository == null ||
        groupRepository == null ||
        currentUserProfileId == null ||
        groupId == null ||
        billId == null) {
      return;
    }

    setState(() {
      _actingNotificationId = notification.id;
      _actionFailure = null;
    });

    try {
      final group = await groupRepository.getGroup(groupId);
      var participantDisplayNames = const <String, String>{};
      try {
        final members = await groupRepository.listGroupMembers(groupId);
        participantDisplayNames = _participantDisplayNamesFromMembers(members);
      } catch (_) {
        participantDisplayNames = const {};
      }

      if (!mounted) {
        return;
      }

      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => SettleoraGroupBillDetailScreen(
            repository: billRepository,
            attachmentRepository: widget.billAttachmentRepository,
            attachmentFileInput: widget.billAttachmentFileInput,
            receiptOcrReviewRepository: widget.receiptOcrReviewRepository,
            revisionRepository: widget.billRevisionRepository,
            groupId: groupId,
            groupName: group.displayName,
            billId: billId,
            currentUserProfileId: currentUserProfileId,
            participantDisplayNames: participantDisplayNames,
          ),
        ),
      );
      if (!mounted) {
        return;
      }

      await _markOpenedNotificationRead(notification);
    } catch (error) {
      if (!mounted) {
        return;
      }

      final failure = _notificationFailureFromGroupOpen(error);
      if (failure.kind == SettleoraNotificationFailureKind.sessionRequired ||
          failure.kind == SettleoraNotificationFailureKind.sessionExpired) {
        await _endSession(failure);
        return;
      }

      setState(() {
        _actionFailure = failure;
      });
    } finally {
      if (mounted) {
        setState(() {
          _actingNotificationId = null;
        });
      }
    }
  }

  Future<void> _openPersonalBill(SettleoraNotificationRow notification) async {
    if (_actingNotificationId != null ||
        _isMarkingAllRead ||
        _isBulkMarkingVisibleRead ||
        notification.status == SettleoraNotificationStatusValues.archived ||
        !_canOpenPersonalBill(notification)) {
      return;
    }

    final billRepository = widget.billRepository;
    final billId = settleoraNotificationMetadataId(notification.expenseBillId);
    if (billRepository == null || billId == null) {
      return;
    }

    setState(() {
      _actingNotificationId = notification.id;
      _actionFailure = null;
    });

    try {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => SettleoraBillDetailScreen(
            repository: billRepository,
            billId: billId,
            attachmentRepository: widget.billAttachmentRepository,
            attachmentFileInput: widget.billAttachmentFileInput,
            receiptOcrReviewRepository: widget.receiptOcrReviewRepository,
            revisionRepository: widget.billRevisionRepository,
          ),
        ),
      );
      if (!mounted) {
        return;
      }

      await _markOpenedNotificationRead(notification);
    } catch (error) {
      if (!mounted) {
        return;
      }

      final failure = _notificationFailureFromBillOpen(error);
      if (failure.kind == SettleoraNotificationFailureKind.sessionRequired ||
          failure.kind == SettleoraNotificationFailureKind.sessionExpired) {
        await _endSession(failure);
        return;
      }

      setState(() {
        _actionFailure = failure;
      });
    } finally {
      if (mounted) {
        setState(() {
          _actingNotificationId = null;
        });
      }
    }
  }

  Future<void> _openSettlement(SettleoraNotificationRow notification) async {
    if (_actingNotificationId != null ||
        _isMarkingAllRead ||
        _isBulkMarkingVisibleRead ||
        notification.status == SettleoraNotificationStatusValues.archived ||
        !_canOpenSettlement(notification)) {
      return;
    }

    final settlementRepository = widget.settlementRepository;
    final currentUserProfileId = settleoraNotificationMetadataId(
      widget.currentUserProfileId,
    );
    final settlementRequestId = settleoraNotificationMetadataId(
      notification.settlementRequestId,
    );
    if (settlementRepository == null ||
        currentUserProfileId == null ||
        settlementRequestId == null) {
      return;
    }

    setState(() {
      _actingNotificationId = notification.id;
      _actionFailure = null;
    });

    try {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => SettleoraSettlementDetailScreen(
            repository: settlementRepository,
            settlementId: settlementRequestId,
            currentUserProfileId: currentUserProfileId,
          ),
        ),
      );
      if (!mounted) {
        return;
      }

      await _markOpenedNotificationRead(notification);
    } finally {
      if (mounted) {
        setState(() {
          _actingNotificationId = null;
        });
      }
    }
  }

  Future<void> _openRecurringBill(SettleoraNotificationRow notification) async {
    if (_actingNotificationId != null ||
        _isMarkingAllRead ||
        _isBulkMarkingVisibleRead ||
        notification.status == SettleoraNotificationStatusValues.archived ||
        !_canOpenRecurringBill(notification)) {
      return;
    }

    final recurringBillRepository = widget.recurringBillRepository;
    final templateId = settleoraNotificationMetadataId(
      notification.recurringBillTemplateId,
    );
    if (recurringBillRepository == null || templateId == null) {
      return;
    }

    setState(() {
      _actingNotificationId = notification.id;
      _actionFailure = null;
    });

    try {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => SettleoraRecurringBillDetailScreen(
            repository: recurringBillRepository,
            templateId: templateId,
          ),
        ),
      );
      if (!mounted) {
        return;
      }

      await _markOpenedNotificationRead(notification);
    } finally {
      if (mounted) {
        setState(() {
          _actingNotificationId = null;
        });
      }
    }
  }

  Future<void> _endSession(SettleoraNotificationFailure failure) async {
    final onSessionEnded = widget.onSessionEnded;
    if (onSessionEnded == null) {
      return;
    }

    if (mounted && Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    }

    await onSessionEnded(failure.message);
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final loadFailure = _loadFailure;
    final actionFailure = _actionFailure;
    final summary = _summary;
    final canRestoreArchived =
        widget.repository is SettleoraNotificationRestoreRepository;
    final counts = _NotificationFilterCounts.fromRows(
      _notifications,
      isActionable: _canOpenAnyTypedTarget,
    );
    final visibleNotifications = _notifications
        .where(
          (notification) => _matchesFilter(
            notification,
            _selectedFilter,
            isActionable: _canOpenAnyTypedTarget,
          ),
        )
        .toList(growable: false);
    final visibleUnreadNotifications = visibleNotifications
        .where(
          (notification) =>
              notification.isUnread &&
              notification.status != SettleoraNotificationStatusValues.archived,
        )
        .toList(growable: false);
    final isBulkBusy = _isMarkingAllRead || _isBulkMarkingVisibleRead;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          IconButton(
            key: const Key('notification-refresh'),
            tooltip: 'Refresh',
            onPressed: _isLoading || isBulkBusy ? null : () => _load(),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: Builder(
          builder: (context) {
            if (_isLoading) {
              return const _LoadingPanel();
            }

            if (loadFailure != null) {
              return _FailurePanel(
                failure: loadFailure,
                onRetry: _load,
                onSessionEnded: widget.onSessionEnded == null
                    ? null
                    : () => _endSession(loadFailure),
              );
            }

            return RefreshIndicator(
              onRefresh: () => _load(showBlockingLoading: false),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                children: [
                  _SummaryPanel(
                    summary:
                        summary ??
                        const SettleoraNotificationSummary(
                          unreadCount: 0,
                          attentionCount: 0,
                          urgentCount: 0,
                        ),
                    isMarkingAllRead: isBulkBusy,
                    onMarkAllRead: _markAllRead,
                  ),
                  const SizedBox(height: 12),
                  _NotificationFilterBar(
                    counts: counts,
                    selectedFilter: _selectedFilter,
                    onSelected: (filter) {
                      setState(() {
                        _selectedFilter = filter;
                      });
                    },
                  ),
                  const SizedBox(height: 12),
                  _VisibleBulkActionsPanel(
                    selectedFilterLabel: _selectedFilter.label,
                    visibleUnreadCount: visibleUnreadNotifications.length,
                    isMarkingVisibleRead: _isBulkMarkingVisibleRead,
                    isBusy: isBulkBusy || _actingNotificationId != null,
                    onMarkVisibleRead: () => _markVisibleNotificationsRead(
                      visibleUnreadNotifications,
                    ),
                  ),
                  if (actionFailure != null) ...[
                    const SizedBox(height: 12),
                    _InlineFailure(failure: actionFailure),
                  ],
                  const SizedBox(height: 16),
                  if (_notifications.isEmpty)
                    const _EmptyNotifications()
                  else if (visibleNotifications.isEmpty)
                    _EmptyNotifications(
                      title: _emptyTitleForFilter(_selectedFilter),
                      message: _emptyMessageForFilter(_selectedFilter),
                    )
                  else
                    for (
                      var index = 0;
                      index < visibleNotifications.length;
                      index += 1
                    )
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _NotificationTile(
                          notification: visibleNotifications[index],
                          canOpenBillRevision:
                              widget.billRevisionRepository != null &&
                              visibleNotifications[index]
                                  .hasBillRevisionReviewTarget,
                          canOpenGroupBill: _canOpenGroupBill(
                            visibleNotifications[index],
                          ),
                          canOpenPersonalBill: _canOpenPersonalBill(
                            visibleNotifications[index],
                          ),
                          canOpenSettlement: _canOpenSettlement(
                            visibleNotifications[index],
                          ),
                          canOpenRecurringBill: _canOpenRecurringBill(
                            visibleNotifications[index],
                          ),
                          canRestore: canRestoreArchived,
                          hasOpenTarget: _hasAnyOpenTargetMetadata(
                            visibleNotifications[index],
                          ),
                          isDisabled:
                              isBulkBusy || _actingNotificationId != null,
                          isActing:
                              _isBulkMarkingVisibleRead ||
                              _actingNotificationId ==
                                  visibleNotifications[index].id,
                          revisionOpenButtonKey: ValueKey(
                            'notification-open-revision-$index',
                          ),
                          groupBillOpenButtonKey: ValueKey(
                            'notification-open-group-bill-$index',
                          ),
                          personalBillOpenButtonKey: ValueKey(
                            'notification-open-personal-bill-$index',
                          ),
                          settlementOpenButtonKey: ValueKey(
                            'notification-open-settlement-$index',
                          ),
                          recurringOpenButtonKey: ValueKey(
                            'notification-open-recurring-$index',
                          ),
                          detailsButtonKey: ValueKey(
                            'notification-details-$index',
                          ),
                          markReadButtonKey: ValueKey(
                            'notification-mark-read-$index',
                          ),
                          archiveButtonKey: ValueKey(
                            'notification-archive-$index',
                          ),
                          restoreButtonKey: ValueKey(
                            'notification-restore-$index',
                          ),
                          onOpenBillRevision: () =>
                              _openBillRevision(visibleNotifications[index]),
                          onOpenGroupBill: () =>
                              _openGroupBill(visibleNotifications[index]),
                          onOpenPersonalBill: () =>
                              _openPersonalBill(visibleNotifications[index]),
                          onOpenSettlement: () =>
                              _openSettlement(visibleNotifications[index]),
                          onOpenRecurringBill: () =>
                              _openRecurringBill(visibleNotifications[index]),
                          onShowDetails: () => _showNotificationDetails(
                            visibleNotifications[index],
                            selectedFilter: _selectedFilter,
                          ),
                          onMarkRead: () => _markNotificationRead(
                            visibleNotifications[index],
                          ),
                          onArchive: () =>
                              _archiveNotification(visibleNotifications[index]),
                          onRestore: () =>
                              _restoreNotification(visibleNotifications[index]),
                        ),
                      ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Future<void> _showNotificationDetails(
    SettleoraNotificationRow notification, {
    required _NotificationFilter selectedFilter,
  }) async {
    final canOpenTypedTarget =
        notification.status != SettleoraNotificationStatusValues.archived &&
        _canOpenAnyTypedTarget(notification);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => _NotificationDetailSheet(
        notification: notification,
        selectedFilterLabel: selectedFilter.label,
        canOpenTypedTarget: canOpenTypedTarget,
        hasOpenTargetMetadata: _hasAnyOpenTargetMetadata(notification),
      ),
    );
  }
}

class _SummaryPanel extends StatelessWidget {
  const _SummaryPanel({
    required this.summary,
    required this.isMarkingAllRead,
    required this.onMarkAllRead,
  });

  final SettleoraNotificationSummary summary;
  final bool isMarkingAllRead;
  final VoidCallback onMarkAllRead;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      key: const Key('notification-summary'),
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const CircleAvatar(child: Icon(Icons.notifications_outlined)),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Inbox',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                OutlinedButton.icon(
                  key: const Key('notification-mark-all-read'),
                  onPressed: summary.unreadCount > 0 && !isMarkingAllRead
                      ? onMarkAllRead
                      : null,
                  icon: isMarkingAllRead
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.done_all_outlined),
                  label: const Text('Mark All Read'),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                _CountChip(
                  label: 'Unread',
                  value: summary.unreadCount,
                  icon: Icons.mark_email_unread_outlined,
                ),
                _CountChip(
                  label: 'Attention',
                  value: summary.attentionCount,
                  icon: Icons.priority_high_outlined,
                ),
                _CountChip(
                  label: 'Urgent',
                  value: summary.urgentCount,
                  icon: Icons.notification_important_outlined,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

enum _NotificationFilter {
  all('All'),
  unread('Unread'),
  read('Read'),
  attention('Attention'),
  urgent('Urgent'),
  bills('Bills'),
  settlements('Settlements'),
  recurring('Recurring'),
  actionable('Actionable'),
  archived('Archived');

  const _NotificationFilter(this.label);

  final String label;
}

class _NotificationFilterCounts {
  const _NotificationFilterCounts({
    required this.all,
    required this.unread,
    required this.read,
    required this.attention,
    required this.urgent,
    required this.bills,
    required this.settlements,
    required this.recurring,
    required this.actionable,
    required this.archived,
  });

  factory _NotificationFilterCounts.fromRows(
    List<SettleoraNotificationRow> rows, {
    required bool Function(SettleoraNotificationRow notification) isActionable,
  }) {
    var unread = 0;
    var read = 0;
    var attention = 0;
    var urgent = 0;
    var bills = 0;
    var settlements = 0;
    var recurring = 0;
    var actionable = 0;
    var archived = 0;

    for (final row in rows) {
      if (row.status == SettleoraNotificationStatusValues.archived) {
        archived += 1;
        continue;
      }
      if (row.status == SettleoraNotificationStatusValues.unread) {
        unread += 1;
      }
      if (row.status == SettleoraNotificationStatusValues.read) {
        read += 1;
      }
      if (row.priority == SettleoraNotificationPriorityValues.attention) {
        attention += 1;
      }
      if (row.priority == SettleoraNotificationPriorityValues.urgent) {
        urgent += 1;
      }
      if (row.subjectType ==
          SettleoraNotificationSubjectTypeValues.expenseBill) {
        bills += 1;
      }
      if (row.subjectType ==
              SettleoraNotificationSubjectTypeValues.settlementRequest ||
          row.subjectType ==
              SettleoraNotificationSubjectTypeValues.settlementPayment) {
        settlements += 1;
      }
      if (row.subjectType ==
          SettleoraNotificationSubjectTypeValues.recurringBillOccurrence) {
        recurring += 1;
      }
      if (row.status == SettleoraNotificationStatusValues.unread &&
          isActionable(row)) {
        actionable += 1;
      }
    }

    return _NotificationFilterCounts(
      all: rows.length,
      unread: unread,
      read: read,
      attention: attention,
      urgent: urgent,
      bills: bills,
      settlements: settlements,
      recurring: recurring,
      actionable: actionable,
      archived: archived,
    );
  }

  final int all;
  final int unread;
  final int read;
  final int attention;
  final int urgent;
  final int bills;
  final int settlements;
  final int recurring;
  final int actionable;
  final int archived;

  int countFor(_NotificationFilter filter) {
    return switch (filter) {
      _NotificationFilter.all => all - archived,
      _NotificationFilter.unread => unread,
      _NotificationFilter.read => read,
      _NotificationFilter.attention => attention,
      _NotificationFilter.urgent => urgent,
      _NotificationFilter.bills => bills,
      _NotificationFilter.settlements => settlements,
      _NotificationFilter.recurring => recurring,
      _NotificationFilter.actionable => actionable,
      _NotificationFilter.archived => archived,
    };
  }
}

class _NotificationFilterBar extends StatelessWidget {
  const _NotificationFilterBar({
    required this.counts,
    required this.selectedFilter,
    required this.onSelected,
  });

  final _NotificationFilterCounts counts;
  final _NotificationFilter selectedFilter;
  final ValueChanged<_NotificationFilter> onSelected;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      key: const Key('notification-filters'),
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final filter in _NotificationFilter.values) ...[
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: FilterChip(
                key: ValueKey('notification-filter-${filter.name}'),
                label: Text('${filter.label} (${counts.countFor(filter)})'),
                selected: selectedFilter == filter,
                onSelected: (_) => onSelected(filter),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _VisibleBulkActionsPanel extends StatelessWidget {
  const _VisibleBulkActionsPanel({
    required this.selectedFilterLabel,
    required this.visibleUnreadCount,
    required this.isMarkingVisibleRead,
    required this.isBusy,
    required this.onMarkVisibleRead,
  });

  final String selectedFilterLabel;
  final int visibleUnreadCount;
  final bool isMarkingVisibleRead;
  final bool isBusy;
  final VoidCallback onMarkVisibleRead;

  @override
  Widget build(BuildContext context) {
    final description = visibleUnreadCount == 1
        ? '1 visible unread notification in $selectedFilterLabel'
        : '$visibleUnreadCount visible unread notifications in $selectedFilterLabel';

    return DecoratedBox(
      key: const Key('notification-visible-bulk-actions'),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        child: Row(
          children: [
            Expanded(child: Text(description)),
            const SizedBox(width: 12),
            OutlinedButton.icon(
              key: const Key('notification-mark-visible-read'),
              onPressed: visibleUnreadCount > 0 && !isBusy
                  ? onMarkVisibleRead
                  : null,
              icon: isMarkingVisibleRead
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.mark_email_read_outlined),
              label: const Text('Mark Visible Read'),
            ),
          ],
        ),
      ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({
    required this.notification,
    required this.canOpenBillRevision,
    required this.canOpenGroupBill,
    required this.canOpenPersonalBill,
    required this.canOpenSettlement,
    required this.canOpenRecurringBill,
    required this.canRestore,
    required this.hasOpenTarget,
    required this.isDisabled,
    required this.isActing,
    required this.revisionOpenButtonKey,
    required this.groupBillOpenButtonKey,
    required this.personalBillOpenButtonKey,
    required this.settlementOpenButtonKey,
    required this.recurringOpenButtonKey,
    required this.detailsButtonKey,
    required this.markReadButtonKey,
    required this.archiveButtonKey,
    required this.restoreButtonKey,
    required this.onOpenBillRevision,
    required this.onOpenGroupBill,
    required this.onOpenPersonalBill,
    required this.onOpenSettlement,
    required this.onOpenRecurringBill,
    required this.onShowDetails,
    required this.onMarkRead,
    required this.onArchive,
    required this.onRestore,
  });

  final SettleoraNotificationRow notification;
  final bool canOpenBillRevision;
  final bool canOpenGroupBill;
  final bool canOpenPersonalBill;
  final bool canOpenSettlement;
  final bool canOpenRecurringBill;
  final bool canRestore;
  final bool hasOpenTarget;
  final bool isDisabled;
  final bool isActing;
  final Key revisionOpenButtonKey;
  final Key groupBillOpenButtonKey;
  final Key personalBillOpenButtonKey;
  final Key settlementOpenButtonKey;
  final Key recurringOpenButtonKey;
  final Key detailsButtonKey;
  final Key markReadButtonKey;
  final Key archiveButtonKey;
  final Key restoreButtonKey;
  final VoidCallback onOpenBillRevision;
  final VoidCallback onOpenGroupBill;
  final VoidCallback onOpenPersonalBill;
  final VoidCallback onOpenSettlement;
  final VoidCallback onOpenRecurringBill;
  final VoidCallback onShowDetails;
  final VoidCallback onMarkRead;
  final VoidCallback onArchive;
  final VoidCallback onRestore;

  @override
  Widget build(BuildContext context) {
    final isArchived =
        notification.status == SettleoraNotificationStatusValues.archived;

    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListTile(
        leading: CircleAvatar(
          child: Icon(_priorityIcon(notification.priority)),
        ),
        title: Text(
          notification.displayTitle,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(notification.displaySummary),
              const SizedBox(height: 6),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  _SoftChip(
                    label: settleoraNotificationStatusLabel(
                      notification.status,
                    ),
                    icon: Icons.mark_email_read_outlined,
                  ),
                  _SoftChip(
                    label: settleoraNotificationPriorityLabel(
                      notification.priority,
                    ),
                    icon: Icons.flag_outlined,
                  ),
                  _SoftChip(
                    label: settleoraNotificationSubjectTypeLabel(
                      notification.subjectType,
                    ),
                    icon: Icons.link_outlined,
                  ),
                  if (!isArchived && _canOpenFromTile)
                    const _SoftChip(
                      label: 'Openable',
                      icon: Icons.open_in_new_outlined,
                    )
                  else if (hasOpenTarget)
                    const _SoftChip(
                      label: 'Not safely openable',
                      icon: Icons.block_outlined,
                    ),
                ],
              ),
              const SizedBox(height: 6),
              Text('Received ${_formatTimestamp(notification.createdAtUtc)}'),
              if (!isArchived && canOpenBillRevision) ...[
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  key: revisionOpenButtonKey,
                  onPressed: isDisabled ? null : onOpenBillRevision,
                  icon: const Icon(Icons.open_in_new_outlined),
                  label: const Text('Open'),
                ),
              ] else if (!isArchived && canOpenGroupBill) ...[
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  key: groupBillOpenButtonKey,
                  onPressed: isDisabled ? null : onOpenGroupBill,
                  icon: const Icon(Icons.receipt_long_outlined),
                  label: const Text('Open bill'),
                ),
              ] else if (!isArchived && canOpenPersonalBill) ...[
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  key: personalBillOpenButtonKey,
                  onPressed: isDisabled ? null : onOpenPersonalBill,
                  icon: const Icon(Icons.receipt_outlined),
                  label: const Text('Open bill'),
                ),
              ] else if (!isArchived && canOpenSettlement) ...[
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  key: settlementOpenButtonKey,
                  onPressed: isDisabled ? null : onOpenSettlement,
                  icon: const Icon(Icons.account_balance_wallet_outlined),
                  label: const Text('Open settlement'),
                ),
              ] else if (!isArchived && canOpenRecurringBill) ...[
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  key: recurringOpenButtonKey,
                  onPressed: isDisabled ? null : onOpenRecurringBill,
                  icon: const Icon(Icons.event_repeat_outlined),
                  label: const Text('Open recurring'),
                ),
              ] else if (!isArchived && hasOpenTarget) ...[
                const SizedBox(height: 8),
                const Text(
                  'This notification cannot be opened safely here. Use the related list or refresh after a supported destination is available.',
                ),
              ],
            ],
          ),
        ),
        trailing: SizedBox(
          width: 152,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              IconButton(
                key: detailsButtonKey,
                tooltip: 'Notification details',
                onPressed: isDisabled ? null : onShowDetails,
                icon: const Icon(Icons.info_outline),
              ),
              if (isArchived)
                IconButton(
                  key: restoreButtonKey,
                  tooltip: 'Restore',
                  onPressed: !isDisabled && canRestore ? onRestore : null,
                  icon: isActing
                      ? const SizedBox.square(
                          dimension: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.unarchive_outlined),
                )
              else ...[
                IconButton(
                  key: markReadButtonKey,
                  tooltip: 'Mark read',
                  onPressed: notification.isUnread && !isDisabled
                      ? onMarkRead
                      : null,
                  icon: isActing
                      ? const SizedBox.square(
                          dimension: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.mark_email_read_outlined),
                ),
                IconButton(
                  key: archiveButtonKey,
                  tooltip: 'Archive',
                  onPressed: isDisabled ? null : onArchive,
                  icon: const Icon(Icons.archive_outlined),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  bool get _canOpenFromTile {
    return canOpenBillRevision ||
        canOpenGroupBill ||
        canOpenPersonalBill ||
        canOpenSettlement ||
        canOpenRecurringBill;
  }
}

class _NotificationDetailSheet extends StatelessWidget {
  const _NotificationDetailSheet({
    required this.notification,
    required this.selectedFilterLabel,
    required this.canOpenTypedTarget,
    required this.hasOpenTargetMetadata,
  });

  final SettleoraNotificationRow notification;
  final String selectedFilterLabel;
  final bool canOpenTypedTarget;
  final bool hasOpenTargetMetadata;

  @override
  Widget build(BuildContext context) {
    final updatedAt = _latestNotificationUpdate(notification);
    final isArchived =
        notification.status == SettleoraNotificationStatusValues.archived;
    final destinationLabel = _safeDestinationLabel(notification);
    final destinationStatus = _safeDestinationStatus(
      notification,
      canOpenTypedTarget: canOpenTypedTarget,
      hasOpenTargetMetadata: hasOpenTargetMetadata,
    );

    return SafeArea(
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(
            key: const Key('notification-detail-sheet'),
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    child: Icon(_priorityIcon(notification.priority)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      notification.displayTitle,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              _DetailRow(label: 'Summary', value: notification.displaySummary),
              _DetailRow(
                label: 'Event',
                value: settleoraNotificationEventLabel(notification.eventType),
              ),
              _DetailRow(
                label: 'Priority',
                value: settleoraNotificationPriorityLabel(
                  notification.priority,
                ),
              ),
              _DetailRow(
                label: 'Status',
                value: settleoraNotificationStatusLabel(notification.status),
              ),
              _DetailRow(
                label: 'Type',
                value: settleoraNotificationSubjectTypeLabel(
                  notification.subjectType,
                ),
              ),
              _DetailRow(
                label: 'Received',
                value: _formatTimestamp(notification.createdAtUtc),
              ),
              if (updatedAt != null)
                _DetailRow(
                  label: 'Updated',
                  value: _formatTimestamp(updatedAt),
                ),
              _DetailRow(label: 'Destination', value: destinationLabel),
              _DetailRow(label: 'Destination status', value: destinationStatus),
              const _DetailRow(
                label: 'Navigation safety',
                value:
                    'Raw links are ignored. Settleora opens only supported typed destinations.',
              ),
              _DetailRow(label: 'Current filter', value: selectedFilterLabel),
              if (isArchived)
                const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: Text(
                    'Archived notifications do not open automatically.',
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(label, style: Theme.of(context).textTheme.labelLarge),
          ),
          const SizedBox(width: 10),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }
}

SettleoraNotificationFailure _notificationFailureFromGroupOpen(Object error) {
  if (error is SettleoraGroupFailure) {
    return SettleoraNotificationFailure(
      kind: switch (error.kind) {
        SettleoraGroupFailureKind.sessionRequired =>
          SettleoraNotificationFailureKind.sessionRequired,
        SettleoraGroupFailureKind.sessionExpired =>
          SettleoraNotificationFailureKind.sessionExpired,
        SettleoraGroupFailureKind.denied =>
          SettleoraNotificationFailureKind.denied,
        SettleoraGroupFailureKind.unavailable =>
          SettleoraNotificationFailureKind.unavailable,
        SettleoraGroupFailureKind.conflict =>
          SettleoraNotificationFailureKind.conflict,
        SettleoraGroupFailureKind.validation =>
          SettleoraNotificationFailureKind.validation,
        SettleoraGroupFailureKind.network =>
          SettleoraNotificationFailureKind.network,
        SettleoraGroupFailureKind.server =>
          SettleoraNotificationFailureKind.server,
      },
      message: error.message,
      statusCode: error.statusCode,
    );
  }

  return const SettleoraNotificationFailure(
    kind: SettleoraNotificationFailureKind.network,
    message:
        'The bill could not be opened. Try again when the connection is back.',
  );
}

SettleoraNotificationFailure _notificationFailureFromBillOpen(Object error) {
  if (error is SettleoraBillFailure) {
    return SettleoraNotificationFailure(
      kind: switch (error.kind) {
        SettleoraBillFailureKind.sessionRequired =>
          SettleoraNotificationFailureKind.sessionRequired,
        SettleoraBillFailureKind.sessionExpired =>
          SettleoraNotificationFailureKind.sessionExpired,
        SettleoraBillFailureKind.denied =>
          SettleoraNotificationFailureKind.denied,
        SettleoraBillFailureKind.unavailable =>
          SettleoraNotificationFailureKind.unavailable,
        SettleoraBillFailureKind.conflict =>
          SettleoraNotificationFailureKind.conflict,
        SettleoraBillFailureKind.validation =>
          SettleoraNotificationFailureKind.validation,
        SettleoraBillFailureKind.network =>
          SettleoraNotificationFailureKind.network,
        SettleoraBillFailureKind.server =>
          SettleoraNotificationFailureKind.server,
      },
      message: error.message,
      statusCode: error.statusCode,
    );
  }

  return const SettleoraNotificationFailure(
    kind: SettleoraNotificationFailureKind.network,
    message:
        'The bill could not be opened. Try again when the connection is back.',
  );
}

SettleoraNotificationFailure _safeOpenReadFailure(Object error) {
  final failure = SettleoraNotificationFailure.from(error);
  return SettleoraNotificationFailure(
    kind: failure.kind,
    message: 'Notification status could not be refreshed. Try again later.',
    statusCode: failure.statusCode,
  );
}

SettleoraNotificationFailure _safeNotificationActionFailure(
  Object error, {
  required String fallbackMessage,
}) {
  final failure = SettleoraNotificationFailure.from(error);
  return SettleoraNotificationFailure(
    kind: failure.kind,
    message: _isUnsafeNotificationUiText(failure.message)
        ? fallbackMessage
        : failure.message,
    statusCode: failure.statusCode,
  );
}

bool _isUnsafeNotificationUiText(String value) {
  final lower = value.toLowerCase();
  return _notificationUuidPattern.hasMatch(value) ||
      lower.contains('token=') ||
      lower.contains('secret') ||
      lower.contains('bearer ') ||
      lower.contains('http://') ||
      lower.contains('https://') ||
      value.contains('/api/') ||
      value.contains('?');
}

final _notificationUuidPattern = RegExp(
  r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
);

Map<String, String> _participantDisplayNamesFromMembers(
  Iterable<SettleoraGroupMember> members,
) {
  return {
    for (final member in members)
      if (member.userProfileId.trim().isNotEmpty &&
          member.safeDisplayName.trim().isNotEmpty)
        member.userProfileId.trim(): member.safeDisplayName.trim(),
  };
}

bool _matchesFilter(
  SettleoraNotificationRow notification,
  _NotificationFilter filter, {
  required bool Function(SettleoraNotificationRow notification) isActionable,
}) {
  return switch (filter) {
    _NotificationFilter.all =>
      notification.status != SettleoraNotificationStatusValues.archived,
    _NotificationFilter.unread =>
      notification.status == SettleoraNotificationStatusValues.unread,
    _NotificationFilter.read =>
      notification.status == SettleoraNotificationStatusValues.read,
    _NotificationFilter.attention =>
      notification.status != SettleoraNotificationStatusValues.archived &&
          notification.priority ==
              SettleoraNotificationPriorityValues.attention,
    _NotificationFilter.urgent =>
      notification.status != SettleoraNotificationStatusValues.archived &&
          notification.priority == SettleoraNotificationPriorityValues.urgent,
    _NotificationFilter.bills =>
      notification.status != SettleoraNotificationStatusValues.archived &&
          notification.subjectType ==
              SettleoraNotificationSubjectTypeValues.expenseBill,
    _NotificationFilter.settlements =>
      notification.status != SettleoraNotificationStatusValues.archived &&
          (notification.subjectType ==
                  SettleoraNotificationSubjectTypeValues.settlementRequest ||
              notification.subjectType ==
                  SettleoraNotificationSubjectTypeValues.settlementPayment),
    _NotificationFilter.recurring =>
      notification.status != SettleoraNotificationStatusValues.archived &&
          notification.subjectType ==
              SettleoraNotificationSubjectTypeValues.recurringBillOccurrence,
    _NotificationFilter.actionable =>
      notification.status == SettleoraNotificationStatusValues.unread &&
          isActionable(notification),
    _NotificationFilter.archived =>
      notification.status == SettleoraNotificationStatusValues.archived,
  };
}

bool _hasAnyOpenTargetMetadata(SettleoraNotificationRow notification) {
  return notification.hasTypedOpenTarget ||
      settleoraNotificationMetadataId(notification.actionUrl) != null;
}

String _safeDestinationLabel(SettleoraNotificationRow notification) {
  if (notification.hasBillRevisionReviewTarget) {
    return 'Bill revision review';
  }
  if (notification.hasGroupBillTarget) {
    return 'Group bill';
  }
  if (notification.hasPersonalBillTarget) {
    return 'Personal bill';
  }
  if (notification.hasSettlementTarget) {
    return 'Settlement';
  }
  if (notification.hasRecurringBillTarget) {
    return 'Recurring bill';
  }
  if (settleoraNotificationMetadataId(notification.actionUrl) != null) {
    return 'Unsupported link';
  }

  return 'None';
}

String _safeDestinationStatus(
  SettleoraNotificationRow notification, {
  required bool canOpenTypedTarget,
  required bool hasOpenTargetMetadata,
}) {
  if (notification.status == SettleoraNotificationStatusValues.archived) {
    return 'Archived; restore before opening from Notifications.';
  }
  if (canOpenTypedTarget) {
    return 'Ready to open from this device.';
  }
  if (notification.hasTypedOpenTarget) {
    return 'Supported destination, but the current app context cannot open it.';
  }
  if (hasOpenTargetMetadata) {
    return 'Related destination metadata is present, but it is not safe to open here.';
  }

  return 'No supported destination metadata is available.';
}

String _emptyTitleForFilter(_NotificationFilter filter) {
  return switch (filter) {
    _NotificationFilter.unread => 'No unread notifications',
    _NotificationFilter.read => 'No read notifications',
    _NotificationFilter.archived => 'No archived notifications',
    _ => 'No matching notifications',
  };
}

String _emptyMessageForFilter(_NotificationFilter filter) {
  return switch (filter) {
    _NotificationFilter.unread => 'New unread notifications will appear here.',
    _NotificationFilter.read => 'Notifications you have read will appear here.',
    _NotificationFilter.archived => 'Archived notifications will appear here.',
    _NotificationFilter.actionable =>
      'Unread notifications with supported actions will appear here.',
    _ => 'Notifications matching this filter will appear here.',
  };
}

class _FailurePanel extends StatelessWidget {
  const _FailurePanel({
    required this.failure,
    required this.onRetry,
    this.onSessionEnded,
  });

  final SettleoraNotificationFailure failure;
  final VoidCallback onRetry;
  final VoidCallback? onSessionEnded;

  @override
  Widget build(BuildContext context) {
    final requiresSignIn =
        failure.kind == SettleoraNotificationFailureKind.sessionRequired ||
        failure.kind == SettleoraNotificationFailureKind.sessionExpired;

    return _StatePanel(
      icon: _failureIcon(failure.kind),
      title: failure.title,
      message: failure.message,
      action: requiresSignIn && onSessionEnded != null
          ? FilledButton.icon(
              key: const Key('notification-sign-in-required'),
              onPressed: onSessionEnded,
              icon: const Icon(Icons.login_outlined),
              label: const Text('Sign In'),
            )
          : OutlinedButton.icon(
              key: const Key('notification-retry'),
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
    );
  }
}

class _InlineFailure extends StatelessWidget {
  const _InlineFailure({required this.failure});

  final SettleoraNotificationFailure failure;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.error),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Icon(
              _failureIcon(failure.kind),
              color: Theme.of(context).colorScheme.error,
            ),
            const SizedBox(width: 10),
            Expanded(child: Text(failure.message)),
          ],
        ),
      ),
    );
  }
}

class _EmptyNotifications extends StatelessWidget {
  const _EmptyNotifications({
    this.title = 'No notifications',
    this.message = 'Visible in-app notifications will appear here.',
  });

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return _StatePanel(
      icon: Icons.notifications_none_outlined,
      title: title,
      message: message,
      compact: true,
    );
  }
}

class _LoadingPanel extends StatelessWidget {
  const _LoadingPanel();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircularProgressIndicator(),
          SizedBox(height: 14),
          Text('Loading notifications'),
        ],
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
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: content,
      );
    }

    return Center(
      child: Padding(padding: const EdgeInsets.all(24), child: content),
    );
  }
}

class _CountChip extends StatelessWidget {
  const _CountChip({
    required this.label,
    required this.value,
    required this.icon,
  });

  final String label;
  final int value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Chip(
      visualDensity: VisualDensity.compact,
      avatar: Icon(icon, size: 16),
      label: Text('$label: $value'),
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

IconData _priorityIcon(SettleoraNotificationPriority priority) {
  return switch (priority) {
    SettleoraNotificationPriorityValues.urgent =>
      Icons.notification_important_outlined,
    SettleoraNotificationPriorityValues.attention =>
      Icons.priority_high_outlined,
    _ => Icons.notifications_outlined,
  };
}

IconData _failureIcon(SettleoraNotificationFailureKind kind) {
  return switch (kind) {
    SettleoraNotificationFailureKind.sessionRequired => Icons.lock_outline,
    SettleoraNotificationFailureKind.sessionExpired => Icons.lock_outline,
    SettleoraNotificationFailureKind.denied => Icons.no_accounts_outlined,
    SettleoraNotificationFailureKind.unavailable =>
      Icons.visibility_off_outlined,
    SettleoraNotificationFailureKind.conflict => Icons.sync_problem_outlined,
    SettleoraNotificationFailureKind.validation =>
      Icons.report_problem_outlined,
    SettleoraNotificationFailureKind.network => Icons.cloud_off_outlined,
    SettleoraNotificationFailureKind.server => Icons.error_outline,
  };
}

String _formatTimestamp(DateTime value) {
  return value.toLocal().toString().split('.').first;
}

DateTime? _latestNotificationUpdate(SettleoraNotificationRow notification) {
  final readAt = notification.readAtUtc;
  final archivedAt = notification.archivedAtUtc;
  if (readAt == null) {
    return archivedAt;
  }
  if (archivedAt == null) {
    return readAt;
  }

  return readAt.isAfter(archivedAt) ? readAt : archivedAt;
}
