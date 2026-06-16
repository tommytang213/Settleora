import 'package:flutter/material.dart';

import 'notification_repository.dart';

enum SettleoraNotificationDeliveryTiming { immediate, digestReadout }

enum SettleoraNotificationPreferenceCategory {
  bills,
  settlements,
  recurring,
  syncAndSecurity,
}

class SettleoraNotificationQuietHours {
  const SettleoraNotificationQuietHours({
    required this.enabled,
    required this.startHour,
    required this.endHour,
  });

  static const disabled = SettleoraNotificationQuietHours(
    enabled: false,
    startHour: 22,
    endHour: 7,
  );

  final bool enabled;
  final int startHour;
  final int endHour;

  SettleoraNotificationQuietHours copyWith({
    bool? enabled,
    int? startHour,
    int? endHour,
  }) {
    return SettleoraNotificationQuietHours(
      enabled: enabled ?? this.enabled,
      startHour: _boundedHour(startHour ?? this.startHour),
      endHour: _boundedHour(endHour ?? this.endHour),
    );
  }

  bool isActiveAt(DateTime localTime) {
    if (!enabled || startHour == endHour) {
      return false;
    }

    final hour = localTime.hour;
    if (startHour < endHour) {
      return hour >= startHour && hour < endHour;
    }

    return hour >= startHour || hour < endHour;
  }

  String get displayLabel {
    if (!enabled) {
      return 'Off';
    }

    return '${_hourLabel(startHour)} to ${_hourLabel(endHour)}';
  }
}

class SettleoraNotificationPreferenceSettings {
  const SettleoraNotificationPreferenceSettings({
    required this.inAppEnabled,
    required this.categoryEnabled,
    required this.quietHours,
    required this.deliveryTiming,
  });

  factory SettleoraNotificationPreferenceSettings.defaults() {
    return const SettleoraNotificationPreferenceSettings(
      inAppEnabled: true,
      categoryEnabled: {
        SettleoraNotificationPreferenceCategory.bills: true,
        SettleoraNotificationPreferenceCategory.settlements: true,
        SettleoraNotificationPreferenceCategory.recurring: true,
        SettleoraNotificationPreferenceCategory.syncAndSecurity: true,
      },
      quietHours: SettleoraNotificationQuietHours.disabled,
      deliveryTiming: SettleoraNotificationDeliveryTiming.immediate,
    );
  }

  final bool inAppEnabled;
  final Map<SettleoraNotificationPreferenceCategory, bool> categoryEnabled;
  final SettleoraNotificationQuietHours quietHours;
  final SettleoraNotificationDeliveryTiming deliveryTiming;

  bool isCategoryEnabled(SettleoraNotificationPreferenceCategory category) {
    return categoryEnabled[category] ?? true;
  }

  SettleoraNotificationPreferenceSettings copyWith({
    bool? inAppEnabled,
    Map<SettleoraNotificationPreferenceCategory, bool>? categoryEnabled,
    SettleoraNotificationQuietHours? quietHours,
    SettleoraNotificationDeliveryTiming? deliveryTiming,
  }) {
    return SettleoraNotificationPreferenceSettings(
      inAppEnabled: inAppEnabled ?? this.inAppEnabled,
      categoryEnabled: Map.unmodifiable(
        categoryEnabled ?? this.categoryEnabled,
      ),
      quietHours: quietHours ?? this.quietHours,
      deliveryTiming: deliveryTiming ?? this.deliveryTiming,
    );
  }

  SettleoraNotificationPreferenceSettings setCategoryEnabled(
    SettleoraNotificationPreferenceCategory category,
    bool enabled,
  ) {
    return copyWith(categoryEnabled: {...categoryEnabled, category: enabled});
  }

  bool shouldShowNotification(
    SettleoraNotificationRow notification, {
    DateTime? localNow,
  }) {
    if (notification.status == SettleoraNotificationStatusValues.archived) {
      return true;
    }

    if (settleoraNotificationIsCritical(notification)) {
      return true;
    }

    if (!inAppEnabled) {
      return false;
    }

    final category = settleoraNotificationPreferenceCategory(notification);
    if (!isCategoryEnabled(category)) {
      return false;
    }

    if (quietHours.isActiveAt(localNow ?? DateTime.now())) {
      return false;
    }

    return true;
  }

  int suppressedCount(
    Iterable<SettleoraNotificationRow> notifications, {
    DateTime? localNow,
  }) {
    return notifications
        .where(
          (notification) =>
              notification.status != SettleoraNotificationStatusValues.archived,
        )
        .where(
          (notification) =>
              !shouldShowNotification(notification, localNow: localNow),
        )
        .length;
  }
}

SettleoraNotificationPreferenceCategory settleoraNotificationPreferenceCategory(
  SettleoraNotificationRow notification,
) {
  final eventType = notification.eventType;
  final subjectType = notification.subjectType;

  if (_isSyncOrSecurityEvent(eventType)) {
    return SettleoraNotificationPreferenceCategory.syncAndSecurity;
  }
  if (subjectType == SettleoraNotificationSubjectTypeValues.settlementRequest ||
      subjectType == SettleoraNotificationSubjectTypeValues.settlementPayment ||
      eventType.startsWith('settlement.')) {
    return SettleoraNotificationPreferenceCategory.settlements;
  }
  if (subjectType ==
          SettleoraNotificationSubjectTypeValues.recurringBillOccurrence ||
      eventType.startsWith('recurring_bill.')) {
    return SettleoraNotificationPreferenceCategory.recurring;
  }

  return SettleoraNotificationPreferenceCategory.bills;
}

bool settleoraNotificationIsCritical(SettleoraNotificationRow notification) {
  final eventType = notification.eventType;
  return _isSyncOrSecurityEvent(eventType) ||
      notification.priority == SettleoraNotificationPriorityValues.urgent &&
          settleoraNotificationPreferenceCategory(notification) ==
              SettleoraNotificationPreferenceCategory.syncAndSecurity;
}

String settleoraNotificationPreferenceCategoryLabel(
  SettleoraNotificationPreferenceCategory category,
) {
  return switch (category) {
    SettleoraNotificationPreferenceCategory.bills => 'Bills and approvals',
    SettleoraNotificationPreferenceCategory.settlements => 'Settlements',
    SettleoraNotificationPreferenceCategory.recurring => 'Recurring bills',
    SettleoraNotificationPreferenceCategory.syncAndSecurity =>
      'Sync and security',
  };
}

String settleoraNotificationDeliveryTimingLabel(
  SettleoraNotificationDeliveryTiming timing,
) {
  return switch (timing) {
    SettleoraNotificationDeliveryTiming.immediate => 'Immediate in-app',
    SettleoraNotificationDeliveryTiming.digestReadout => 'Digest readout only',
  };
}

class SettleoraNotificationPreferencePanel extends StatelessWidget {
  const SettleoraNotificationPreferencePanel({
    super.key,
    required this.settings,
    required this.onChanged,
  });

  final SettleoraNotificationPreferenceSettings settings;
  final ValueChanged<SettleoraNotificationPreferenceSettings> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return DecoratedBox(
      key: const Key('notification-preference-panel'),
      decoration: BoxDecoration(
        border: Border.all(color: theme.colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const CircleAvatar(child: Icon(Icons.tune_outlined)),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Notification preferences',
                    style: theme.textTheme.titleMedium,
                  ),
                ),
                TextButton.icon(
                  key: const Key('notification-preferences-reset'),
                  onPressed: () => onChanged(
                    SettleoraNotificationPreferenceSettings.defaults(),
                  ),
                  icon: const Icon(Icons.restart_alt_outlined),
                  label: const Text('Reset'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Applies to loaded in-app rows on this device. Push and email delivery are unavailable in this Day 1 slice.',
              style: theme.textTheme.bodySmall,
            ),
            const SizedBox(height: 8),
            SwitchListTile(
              key: const Key('notification-preferences-in-app'),
              contentPadding: EdgeInsets.zero,
              title: const Text('In-app notifications'),
              subtitle: const Text(
                'Off hides non-critical loaded rows without deleting them.',
              ),
              value: settings.inAppEnabled,
              onChanged: (value) =>
                  onChanged(settings.copyWith(inAppEnabled: value)),
            ),
            for (final category
                in SettleoraNotificationPreferenceCategory.values)
              SwitchListTile(
                key: Key('notification-preferences-${category.name}'),
                contentPadding: EdgeInsets.zero,
                title: Text(
                  settleoraNotificationPreferenceCategoryLabel(category),
                ),
                subtitle: Text(_categorySubtitle(category)),
                value: settings.isCategoryEnabled(category),
                onChanged:
                    category ==
                        SettleoraNotificationPreferenceCategory.syncAndSecurity
                    ? null
                    : (value) => onChanged(
                        settings.setCategoryEnabled(category, value),
                      ),
              ),
            const SizedBox(height: 8),
            _QuietHoursEditor(settings: settings, onChanged: onChanged),
            const SizedBox(height: 12),
            Text('Delivery timing', style: theme.textTheme.labelLarge),
            const SizedBox(height: 8),
            SegmentedButton<SettleoraNotificationDeliveryTiming>(
              key: const Key('notification-preferences-delivery-timing'),
              segments: const [
                ButtonSegment(
                  value: SettleoraNotificationDeliveryTiming.immediate,
                  label: Text('Immediate'),
                  icon: Icon(Icons.flash_on_outlined),
                ),
                ButtonSegment(
                  value: SettleoraNotificationDeliveryTiming.digestReadout,
                  label: Text('Digest'),
                  icon: Icon(Icons.summarize_outlined),
                ),
              ],
              selected: {settings.deliveryTiming},
              onSelectionChanged: (selection) {
                onChanged(settings.copyWith(deliveryTiming: selection.single));
              },
            ),
            const SizedBox(height: 8),
            Text(
              settings.deliveryTiming ==
                      SettleoraNotificationDeliveryTiming.immediate
                  ? 'Immediate means visible in the in-app inbox after the API returns rows.'
                  : 'Digest is a local readout preference only; scheduled digest delivery is not wired.',
              style: theme.textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            const _UnsupportedChannelReadout(),
          ],
        ),
      ),
    );
  }
}

class _QuietHoursEditor extends StatelessWidget {
  const _QuietHoursEditor({required this.settings, required this.onChanged});

  final SettleoraNotificationPreferenceSettings settings;
  final ValueChanged<SettleoraNotificationPreferenceSettings> onChanged;

  @override
  Widget build(BuildContext context) {
    final quietHours = settings.quietHours;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SwitchListTile(
          key: const Key('notification-preferences-quiet-hours'),
          contentPadding: EdgeInsets.zero,
          title: const Text('Quiet hours'),
          subtitle: Text(
            quietHours.enabled
                ? '${quietHours.displayLabel}; critical sync and security rows remain visible.'
                : 'Off; loaded in-app rows are not quiet-hour suppressed.',
          ),
          value: quietHours.enabled,
          onChanged: (value) => onChanged(
            settings.copyWith(quietHours: quietHours.copyWith(enabled: value)),
          ),
        ),
        if (quietHours.enabled)
          Wrap(
            spacing: 12,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              _HourDropdown(
                key: const Key('notification-preferences-quiet-start'),
                label: 'Start',
                value: quietHours.startHour,
                onChanged: (hour) => onChanged(
                  settings.copyWith(
                    quietHours: quietHours.copyWith(startHour: hour),
                  ),
                ),
              ),
              _HourDropdown(
                key: const Key('notification-preferences-quiet-end'),
                label: 'End',
                value: quietHours.endHour,
                onChanged: (hour) => onChanged(
                  settings.copyWith(
                    quietHours: quietHours.copyWith(endHour: hour),
                  ),
                ),
              ),
            ],
          ),
      ],
    );
  }
}

class _HourDropdown extends StatelessWidget {
  const _HourDropdown({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label),
        const SizedBox(width: 8),
        DropdownButton<int>(
          value: value,
          items: [
            for (var hour = 0; hour < 24; hour += 1)
              DropdownMenuItem<int>(value: hour, child: Text(_hourLabel(hour))),
          ],
          onChanged: (hour) {
            if (hour != null) {
              onChanged(hour);
            }
          },
        ),
      ],
    );
  }
}

class _UnsupportedChannelReadout extends StatelessWidget {
  const _UnsupportedChannelReadout();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        _ChannelChip(
          icon: Icons.notifications_active_outlined,
          label: 'In-app configurable',
          color: theme.colorScheme.primaryContainer,
          textColor: theme.colorScheme.onPrimaryContainer,
        ),
        _ChannelChip(
          icon: Icons.phone_android_outlined,
          label: 'Push unavailable',
          color: theme.colorScheme.surfaceContainerHighest,
          textColor: theme.colorScheme.onSurfaceVariant,
        ),
        _ChannelChip(
          icon: Icons.mail_outline,
          label: 'Email unavailable',
          color: theme.colorScheme.surfaceContainerHighest,
          textColor: theme.colorScheme.onSurfaceVariant,
        ),
      ],
    );
  }
}

class _ChannelChip extends StatelessWidget {
  const _ChannelChip({
    required this.icon,
    required this.label,
    required this.color,
    required this.textColor,
  });

  final IconData icon;
  final String label;
  final Color color;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    return Chip(
      avatar: Icon(icon, size: 18, color: textColor),
      label: Text(label),
      backgroundColor: color,
      labelStyle: TextStyle(color: textColor),
      side: BorderSide.none,
    );
  }
}

String _categorySubtitle(SettleoraNotificationPreferenceCategory category) {
  return switch (category) {
    SettleoraNotificationPreferenceCategory.bills =>
      'Bills, revisions, approvals, and correction events.',
    SettleoraNotificationPreferenceCategory.settlements =>
      'Settlement requests, payments, disputes, and proof events.',
    SettleoraNotificationPreferenceCategory.recurring =>
      'Recurring bill forecast and generated draft rows.',
    SettleoraNotificationPreferenceCategory.syncAndSecurity =>
      'Always visible when present; this protects conflict and session warnings.',
  };
}

bool _isSyncOrSecurityEvent(String eventType) {
  return eventType.startsWith('sync.') ||
      eventType.startsWith('security.') ||
      eventType.startsWith('session.') ||
      eventType.startsWith('auth.');
}

String _hourLabel(int hour) {
  final bounded = _boundedHour(hour);
  final suffix = bounded < 12 ? 'AM' : 'PM';
  final displayHour = bounded % 12 == 0 ? 12 : bounded % 12;
  return '$displayHour:00 $suffix';
}

int _boundedHour(int hour) {
  if (hour < 0) {
    return 0;
  }
  if (hour > 23) {
    return 23;
  }
  return hour;
}
