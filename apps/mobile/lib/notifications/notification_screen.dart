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
        _actionFailure = SettleoraNotificationFailure.from(error);
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
        _actionFailure = SettleoraNotificationFailure.from(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isMarkingAllRead = false;
        });
      }
    }
  }

  Future<void> _archiveNotification(
    SettleoraNotificationRow notification,
  ) async {
    if (_actingNotificationId != null || _isMarkingAllRead) {
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
        _actionFailure = SettleoraNotificationFailure.from(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _actingNotificationId = null;
        });
      }
    }
  }

  Future<void> _openBillRevision(SettleoraNotificationRow notification) async {
    if (_actingNotificationId != null || _isMarkingAllRead) {
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
        _canOpenSettlement(notification) ||
        _canOpenRecurringBill(notification);
  }

  Future<void> _openGroupBill(SettleoraNotificationRow notification) async {
    if (_actingNotificationId != null ||
        _isMarkingAllRead ||
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

  Future<void> _openSettlement(SettleoraNotificationRow notification) async {
    if (_actingNotificationId != null ||
        _isMarkingAllRead ||
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

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          IconButton(
            key: const Key('notification-refresh'),
            tooltip: 'Refresh',
            onPressed: _isLoading ? null : () => _load(),
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
                    isMarkingAllRead: _isMarkingAllRead,
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
                  if (actionFailure != null) ...[
                    const SizedBox(height: 12),
                    _InlineFailure(failure: actionFailure),
                  ],
                  const SizedBox(height: 16),
                  if (_notifications.isEmpty)
                    const _EmptyNotifications()
                  else if (visibleNotifications.isEmpty)
                    const _EmptyNotifications(
                      title: 'No matching notifications',
                      message:
                          'Notifications matching this filter will appear here.',
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
                          canOpenSettlement: _canOpenSettlement(
                            visibleNotifications[index],
                          ),
                          canOpenRecurringBill: _canOpenRecurringBill(
                            visibleNotifications[index],
                          ),
                          isActing:
                              _actingNotificationId ==
                              visibleNotifications[index].id,
                          revisionOpenButtonKey: ValueKey(
                            'notification-open-revision-$index',
                          ),
                          groupBillOpenButtonKey: ValueKey(
                            'notification-open-group-bill-$index',
                          ),
                          settlementOpenButtonKey: ValueKey(
                            'notification-open-settlement-$index',
                          ),
                          recurringOpenButtonKey: ValueKey(
                            'notification-open-recurring-$index',
                          ),
                          markReadButtonKey: ValueKey(
                            'notification-mark-read-$index',
                          ),
                          archiveButtonKey: ValueKey(
                            'notification-archive-$index',
                          ),
                          onOpenBillRevision: () =>
                              _openBillRevision(visibleNotifications[index]),
                          onOpenGroupBill: () =>
                              _openGroupBill(visibleNotifications[index]),
                          onOpenSettlement: () =>
                              _openSettlement(visibleNotifications[index]),
                          onOpenRecurringBill: () =>
                              _openRecurringBill(visibleNotifications[index]),
                          onMarkRead: () => _markNotificationRead(
                            visibleNotifications[index],
                          ),
                          onArchive: () =>
                              _archiveNotification(visibleNotifications[index]),
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
  attention('Attention'),
  urgent('Urgent'),
  bills('Bills'),
  settlements('Settlements'),
  recurring('Recurring'),
  actionable('Actionable');

  const _NotificationFilter(this.label);

  final String label;
}

class _NotificationFilterCounts {
  const _NotificationFilterCounts({
    required this.all,
    required this.unread,
    required this.attention,
    required this.urgent,
    required this.bills,
    required this.settlements,
    required this.recurring,
    required this.actionable,
  });

  factory _NotificationFilterCounts.fromRows(
    List<SettleoraNotificationRow> rows, {
    required bool Function(SettleoraNotificationRow notification) isActionable,
  }) {
    var unread = 0;
    var attention = 0;
    var urgent = 0;
    var bills = 0;
    var settlements = 0;
    var recurring = 0;
    var actionable = 0;

    for (final row in rows) {
      if (row.status == SettleoraNotificationStatusValues.unread) {
        unread += 1;
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
      if (isActionable(row)) {
        actionable += 1;
      }
    }

    return _NotificationFilterCounts(
      all: rows.length,
      unread: unread,
      attention: attention,
      urgent: urgent,
      bills: bills,
      settlements: settlements,
      recurring: recurring,
      actionable: actionable,
    );
  }

  final int all;
  final int unread;
  final int attention;
  final int urgent;
  final int bills;
  final int settlements;
  final int recurring;
  final int actionable;

  int countFor(_NotificationFilter filter) {
    return switch (filter) {
      _NotificationFilter.all => all,
      _NotificationFilter.unread => unread,
      _NotificationFilter.attention => attention,
      _NotificationFilter.urgent => urgent,
      _NotificationFilter.bills => bills,
      _NotificationFilter.settlements => settlements,
      _NotificationFilter.recurring => recurring,
      _NotificationFilter.actionable => actionable,
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

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({
    required this.notification,
    required this.canOpenBillRevision,
    required this.canOpenGroupBill,
    required this.canOpenSettlement,
    required this.canOpenRecurringBill,
    required this.isActing,
    required this.revisionOpenButtonKey,
    required this.groupBillOpenButtonKey,
    required this.settlementOpenButtonKey,
    required this.recurringOpenButtonKey,
    required this.markReadButtonKey,
    required this.archiveButtonKey,
    required this.onOpenBillRevision,
    required this.onOpenGroupBill,
    required this.onOpenSettlement,
    required this.onOpenRecurringBill,
    required this.onMarkRead,
    required this.onArchive,
  });

  final SettleoraNotificationRow notification;
  final bool canOpenBillRevision;
  final bool canOpenGroupBill;
  final bool canOpenSettlement;
  final bool canOpenRecurringBill;
  final bool isActing;
  final Key revisionOpenButtonKey;
  final Key groupBillOpenButtonKey;
  final Key settlementOpenButtonKey;
  final Key recurringOpenButtonKey;
  final Key markReadButtonKey;
  final Key archiveButtonKey;
  final VoidCallback onOpenBillRevision;
  final VoidCallback onOpenGroupBill;
  final VoidCallback onOpenSettlement;
  final VoidCallback onOpenRecurringBill;
  final VoidCallback onMarkRead;
  final VoidCallback onArchive;

  @override
  Widget build(BuildContext context) {
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
                ],
              ),
              const SizedBox(height: 6),
              Text('Received ${_formatTimestamp(notification.createdAtUtc)}'),
              if (canOpenBillRevision) ...[
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  key: revisionOpenButtonKey,
                  onPressed: isActing ? null : onOpenBillRevision,
                  icon: const Icon(Icons.open_in_new_outlined),
                  label: const Text('Open'),
                ),
              ] else if (canOpenGroupBill) ...[
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  key: groupBillOpenButtonKey,
                  onPressed: isActing ? null : onOpenGroupBill,
                  icon: const Icon(Icons.receipt_long_outlined),
                  label: const Text('Open bill'),
                ),
              ] else if (canOpenSettlement) ...[
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  key: settlementOpenButtonKey,
                  onPressed: isActing ? null : onOpenSettlement,
                  icon: const Icon(Icons.account_balance_wallet_outlined),
                  label: const Text('Open settlement'),
                ),
              ] else if (canOpenRecurringBill) ...[
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  key: recurringOpenButtonKey,
                  onPressed: isActing ? null : onOpenRecurringBill,
                  icon: const Icon(Icons.event_repeat_outlined),
                  label: const Text('Open recurring'),
                ),
              ],
            ],
          ),
        ),
        trailing: SizedBox(
          width: 96,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              IconButton(
                key: markReadButtonKey,
                tooltip: 'Mark read',
                onPressed: notification.isUnread && !isActing
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
                onPressed: isActing ? null : onArchive,
                icon: const Icon(Icons.archive_outlined),
              ),
            ],
          ),
        ),
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
    _NotificationFilter.all => true,
    _NotificationFilter.unread =>
      notification.status == SettleoraNotificationStatusValues.unread,
    _NotificationFilter.attention =>
      notification.priority == SettleoraNotificationPriorityValues.attention,
    _NotificationFilter.urgent =>
      notification.priority == SettleoraNotificationPriorityValues.urgent,
    _NotificationFilter.bills =>
      notification.subjectType ==
          SettleoraNotificationSubjectTypeValues.expenseBill,
    _NotificationFilter.settlements =>
      notification.subjectType ==
              SettleoraNotificationSubjectTypeValues.settlementRequest ||
          notification.subjectType ==
              SettleoraNotificationSubjectTypeValues.settlementPayment,
    _NotificationFilter.recurring =>
      notification.subjectType ==
          SettleoraNotificationSubjectTypeValues.recurringBillOccurrence,
    _NotificationFilter.actionable => isActionable(notification),
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
