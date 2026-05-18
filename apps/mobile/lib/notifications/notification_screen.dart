import 'package:flutter/material.dart';

import 'notification_repository.dart';

class SettleoraNotificationScreen extends StatefulWidget {
  const SettleoraNotificationScreen({
    super.key,
    required this.repository,
    this.onSessionEnded,
  });

  final SettleoraNotificationRepository repository;
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
                  if (actionFailure != null) ...[
                    const SizedBox(height: 12),
                    _InlineFailure(failure: actionFailure),
                  ],
                  const SizedBox(height: 16),
                  if (_notifications.isEmpty)
                    const _EmptyNotifications()
                  else
                    for (
                      var index = 0;
                      index < _notifications.length;
                      index += 1
                    )
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _NotificationTile(
                          notification: _notifications[index],
                          isActing:
                              _actingNotificationId == _notifications[index].id,
                          markReadButtonKey: ValueKey(
                            'notification-mark-read-$index',
                          ),
                          archiveButtonKey: ValueKey(
                            'notification-archive-$index',
                          ),
                          onMarkRead: () =>
                              _markNotificationRead(_notifications[index]),
                          onArchive: () =>
                              _archiveNotification(_notifications[index]),
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

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({
    required this.notification,
    required this.isActing,
    required this.markReadButtonKey,
    required this.archiveButtonKey,
    required this.onMarkRead,
    required this.onArchive,
  });

  final SettleoraNotificationRow notification;
  final bool isActing;
  final Key markReadButtonKey;
  final Key archiveButtonKey;
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
  const _EmptyNotifications();

  @override
  Widget build(BuildContext context) {
    return const _StatePanel(
      icon: Icons.notifications_none_outlined,
      title: 'No notifications',
      message: 'Visible in-app notifications will appear here.',
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
