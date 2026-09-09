import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/home_shortcut_preferences.dart';
import 'package:mobile/app/secure_storage.dart';

void main() {
  test('defaults to Notifications and Recurring bills', () async {
    final preference = LocalSettleoraHomeShortcutPreference(
      keyValueStore: _MemoryStore(),
    );

    expect(
      await preference.readShownShortcuts(),
      orderedEquals([
        SettleoraHomeShortcut.notifications,
        SettleoraHomeShortcut.recurringBills,
      ]),
    );
  });

  test('writes stable keys in fixed product order and reconstructs', () async {
    final store = _MemoryStore();
    final preference = LocalSettleoraHomeShortcutPreference(
      keyValueStore: store,
    );

    await preference.writeShownShortcuts({
      SettleoraHomeShortcut.reports,
      SettleoraHomeShortcut.notifications,
      SettleoraHomeShortcut.receiptReviews,
    });

    expect(settleoraHomeShortcutsStorageKey, isNot(contains('whats_new')));
    expect(jsonDecode(store.values[settleoraHomeShortcutsStorageKey]!), {
      'version': 1,
      'shown': ['notifications', 'receipt_reviews', 'reports'],
    });
    expect(
      await LocalSettleoraHomeShortcutPreference(
        keyValueStore: store,
      ).readShownShortcuts(),
      orderedEquals([
        SettleoraHomeShortcut.notifications,
        SettleoraHomeShortcut.receiptReviews,
        SettleoraHomeShortcut.reports,
      ]),
    );
  });

  test(
    'ignores duplicates and unknown keys and restores fixed order',
    () async {
      final store = _MemoryStore(
        values: {
          settleoraHomeShortcutsStorageKey: jsonEncode({
            'version': 1,
            'shown': [
              'reports',
              'future_shortcut',
              'notifications',
              'reports',
              'receipt_reviews',
            ],
          }),
        },
      );

      expect(
        await LocalSettleoraHomeShortcutPreference(
          keyValueStore: store,
        ).readShownShortcuts(),
        orderedEquals([
          SettleoraHomeShortcut.notifications,
          SettleoraHomeShortcut.receiptReviews,
          SettleoraHomeShortcut.reports,
        ]),
      );
    },
  );

  test('malformed payload and read failure fall back safely', () async {
    final malformed = LocalSettleoraHomeShortcutPreference(
      keyValueStore: _MemoryStore(
        values: {settleoraHomeShortcutsStorageKey: '{not-json'},
      ),
    );
    final failed = LocalSettleoraHomeShortcutPreference(
      keyValueStore: _MemoryStore(failReads: true),
    );

    expect(await malformed.readShownShortcuts(), settleoraDefaultHomeShortcuts);
    expect(await failed.readShownShortcuts(), settleoraDefaultHomeShortcuts);
  });

  test('unsupported payload version falls back safely', () async {
    final preference = LocalSettleoraHomeShortcutPreference(
      keyValueStore: _MemoryStore(
        values: {
          settleoraHomeShortcutsStorageKey: jsonEncode({
            'version': 2,
            'shown': ['reports'],
          }),
        },
      ),
    );

    expect(
      await preference.readShownShortcuts(),
      settleoraDefaultHomeShortcuts,
    );
  });

  test('empty selection is valid', () async {
    final store = _MemoryStore(
      values: {
        settleoraHomeShortcutsStorageKey: jsonEncode({
          'version': 1,
          'shown': <String>[],
        }),
      },
    );

    expect(
      await LocalSettleoraHomeShortcutPreference(
        keyValueStore: store,
      ).readShownShortcuts(),
      isEmpty,
    );
  });

  test('write failures remain failures and do not touch other keys', () async {
    final store = _MemoryStore(
      values: {
        'settleora.presentation.whats_new.seen_release_key.v1': '1.0.0+1',
        'settleora.server.session.v1': 'session-material',
      },
      failWrites: true,
    );

    await expectLater(
      LocalSettleoraHomeShortcutPreference(
        keyValueStore: store,
      ).writeShownShortcuts({SettleoraHomeShortcut.reports}),
      throwsA(isA<StateError>()),
    );
    expect(
      store.values['settleora.presentation.whats_new.seen_release_key.v1'],
      '1.0.0+1',
    );
    expect(store.values['settleora.server.session.v1'], 'session-material');
    expect(store.values, isNot(contains(settleoraHomeShortcutsStorageKey)));
  });
}

class _MemoryStore implements SecureKeyValueStore {
  _MemoryStore({
    Map<String, String>? values,
    this.failReads = false,
    this.failWrites = false,
  }) : values = values ?? <String, String>{};

  final Map<String, String> values;
  final bool failReads;
  final bool failWrites;

  @override
  Future<String?> read(String key) async {
    if (failReads) {
      throw StateError('private provider read detail');
    }
    return values[key];
  }

  @override
  Future<void> write(String key, String value) async {
    if (failWrites) {
      throw StateError('private provider write detail');
    }
    values[key] = value;
  }

  @override
  Future<void> delete(String key) async {
    values.remove(key);
  }
}
