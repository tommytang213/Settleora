import 'dart:convert';

import 'secure_storage.dart';

const settleoraHomeShortcutsStorageKey =
    'settleora.presentation.home_shortcuts.v1';

enum SettleoraHomeShortcut {
  notifications('notifications', 'Notifications'),
  recurringBills('recurring_bills', 'Recurring bills'),
  receiptReviews('receipt_reviews', 'Receipt reviews'),
  reports('reports', 'Reports');

  const SettleoraHomeShortcut(this.machineKey, this.label);

  final String machineKey;
  final String label;
}

const settleoraHomeShortcutFixedOrder = <SettleoraHomeShortcut>[
  SettleoraHomeShortcut.notifications,
  SettleoraHomeShortcut.recurringBills,
  SettleoraHomeShortcut.receiptReviews,
  SettleoraHomeShortcut.reports,
];

const settleoraDefaultHomeShortcuts = <SettleoraHomeShortcut>{
  SettleoraHomeShortcut.notifications,
  SettleoraHomeShortcut.recurringBills,
};

Set<SettleoraHomeShortcut> normalizeSettleoraHomeShortcuts(
  Iterable<SettleoraHomeShortcut> shortcuts,
) {
  final requested = shortcuts.toSet();
  return Set.unmodifiable(
    settleoraHomeShortcutFixedOrder.where(requested.contains),
  );
}

abstract interface class SettleoraHomeShortcutPreference {
  Future<Set<SettleoraHomeShortcut>> readShownShortcuts();

  Future<void> writeShownShortcuts(Set<SettleoraHomeShortcut> shortcuts);
}

/// Device-local presentation state only. This preference is never consulted
/// for authentication, authorization, repository construction, or domain work.
class LocalSettleoraHomeShortcutPreference
    implements SettleoraHomeShortcutPreference {
  LocalSettleoraHomeShortcutPreference({SecureKeyValueStore? keyValueStore})
    : _keyValueStore = keyValueStore ?? FlutterSecureKeyValueStore();

  final SecureKeyValueStore _keyValueStore;

  @override
  Future<Set<SettleoraHomeShortcut>> readShownShortcuts() async {
    try {
      final raw = await _keyValueStore.read(settleoraHomeShortcutsStorageKey);
      if (raw == null || raw.trim().isEmpty) {
        return settleoraDefaultHomeShortcuts;
      }

      final decoded = jsonDecode(raw);
      if (decoded is! Map ||
          decoded['version'] != 1 ||
          decoded['shown'] is! List) {
        return settleoraDefaultHomeShortcuts;
      }

      final knownByKey = {
        for (final shortcut in settleoraHomeShortcutFixedOrder)
          shortcut.machineKey: shortcut,
      };
      final selected = <SettleoraHomeShortcut>{};
      for (final value in decoded['shown'] as List) {
        if (value is String) {
          final shortcut = knownByKey[value];
          if (shortcut != null) {
            selected.add(shortcut);
          }
        }
      }
      return normalizeSettleoraHomeShortcuts(selected);
    } catch (_) {
      return settleoraDefaultHomeShortcuts;
    }
  }

  @override
  Future<void> writeShownShortcuts(Set<SettleoraHomeShortcut> shortcuts) {
    final normalized = normalizeSettleoraHomeShortcuts(shortcuts);
    return _keyValueStore.write(
      settleoraHomeShortcutsStorageKey,
      jsonEncode({
        'version': 1,
        'shown': [for (final shortcut in normalized) shortcut.machineKey],
      }),
    );
  }
}
