import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/.dart_tool/flutter_gen/gen_l10n/app_localizations.dart';

import '../ui/settleora_components.dart';
import 'secure_storage.dart';

/// Update this key with `pubspec.yaml`'s version/build for every bundled
/// release whose What's New content should be shown again.
const currentBundledVersionNotesKey = '1.0.0+1';
const settleoraVersionNotesReleaseKeyMaxLength = 128;

const currentBundledVersionNotes = SettleoraBundledVersionNotes._catalog(
  releaseKey: currentBundledVersionNotesKey,
);

enum _SettleoraVersionNotesContentSource { staticContent, currentCatalog }

class SettleoraBundledVersionNotes {
  const SettleoraBundledVersionNotes({
    required this.releaseKey,
    required this.heading,
    this.description,
    this.points = const [],
  }) : _contentSource = _SettleoraVersionNotesContentSource.staticContent;

  const SettleoraBundledVersionNotes._catalog({required this.releaseKey})
    : heading = '',
      description = null,
      points = const [],
      _contentSource = _SettleoraVersionNotesContentSource.currentCatalog;

  final String releaseKey;
  final String heading;
  final String? description;
  final List<String> points;
  final _SettleoraVersionNotesContentSource _contentSource;

  bool get isUsable =>
      isValidSettleoraVersionNotesReleaseKey(releaseKey) &&
      (_contentSource == _SettleoraVersionNotesContentSource.currentCatalog ||
          heading.trim().isNotEmpty);
}

bool isValidSettleoraVersionNotesReleaseKey(String releaseKey) {
  final trimmed = releaseKey.trim();
  return trimmed.isNotEmpty &&
      trimmed.length <= settleoraVersionNotesReleaseKeyMaxLength;
}

/// A device-local presentation preference only. It is never consulted for
/// authentication, authorization, session validity, or domain decisions.
abstract interface class SettleoraVersionSeenPreference {
  Future<String?> readSeenReleaseKey();

  Future<void> writeSeenReleaseKey(String releaseKey);
}

/// Process-lifetime guard keyed by bundled release. Persistence failures may
/// allow a future app process to show the notes again, but rebuilding the app
/// tree in this process cannot immediately repeat the same automatic sheet.
class SettleoraVersionNotesProcessGuard {
  final Set<String> _attemptedReleaseKeys = <String>{};

  bool hasAttempted(String releaseKey) =>
      _attemptedReleaseKeys.contains(releaseKey.trim());

  bool markAttempted(String releaseKey) =>
      _attemptedReleaseKeys.add(releaseKey.trim());
}

final SettleoraVersionNotesProcessGuard
_defaultSettleoraVersionNotesProcessGuard = SettleoraVersionNotesProcessGuard();

SettleoraVersionNotesProcessGuard
get defaultSettleoraVersionNotesProcessGuard =>
    _defaultSettleoraVersionNotesProcessGuard;

class LocalSettleoraVersionSeenPreference
    implements SettleoraVersionSeenPreference {
  LocalSettleoraVersionSeenPreference({SecureKeyValueStore? keyValueStore})
    : _keyValueStore = keyValueStore ?? FlutterSecureKeyValueStore();

  static const _storageKey =
      'settleora.presentation.whats_new.seen_release_key.v1';

  final SecureKeyValueStore _keyValueStore;

  @override
  Future<String?> readSeenReleaseKey() async {
    final value = (await _keyValueStore.read(_storageKey))?.trim();
    if (value == null || !isValidSettleoraVersionNotesReleaseKey(value)) {
      return null;
    }
    return value;
  }

  @override
  Future<void> writeSeenReleaseKey(String releaseKey) {
    return _keyValueStore.write(_storageKey, releaseKey.trim());
  }
}

class _ResolvedSettleoraVersionNotesContent {
  const _ResolvedSettleoraVersionNotesContent({
    required this.heading,
    this.description,
    this.points = const [],
  });

  final String heading;
  final String? description;
  final List<String> points;

  bool get isUsable => heading.trim().isNotEmpty;
}

_ResolvedSettleoraVersionNotesContent _resolveVersionNotesContent(
  BuildContext context,
  SettleoraBundledVersionNotes notes,
) {
  switch (notes._contentSource) {
    case _SettleoraVersionNotesContentSource.staticContent:
      return _ResolvedSettleoraVersionNotesContent(
        heading: notes.heading,
        description: notes.description,
        points: notes.points,
      );
    case _SettleoraVersionNotesContentSource.currentCatalog:
      final localizations = AppLocalizations.of(context);
      return _ResolvedSettleoraVersionNotesContent(
        heading: localizations.whatsNewCurrentHeading,
        description: localizations.whatsNewCurrentDescription,
        points: [
          localizations.whatsNewCurrentPointDeviceMode,
          localizations.whatsNewCurrentPointFeatures,
          localizations.whatsNewCurrentPointReceiptReview,
        ],
      );
  }
}

Future<bool> showSettleoraVersionNotes({
  required BuildContext context,
  required SettleoraBundledVersionNotes? notes,
}) async {
  if (notes == null || !notes.isUsable) {
    return false;
  }

  final _ResolvedSettleoraVersionNotesContent content;
  try {
    final resolved = _resolveVersionNotesContent(context, notes);
    if (!resolved.isUsable) {
      return false;
    }
    content = resolved;
  } catch (_) {
    return false;
  }

  await showSettleoraBottomSheet<void>(
    context: context,
    builder: (sheetContext) => SettleoraBottomSheetFrame(
      title: 'Version notes',
      actions: [
        AppButton(
          key: const Key('whats-new-close'),
          label: "Close What's New",
          onPressed: () => Navigator.of(sheetContext).pop(),
        ),
      ],
      child: SettleoraGuidanceContent(
        key: const Key('whats-new-guidance-content'),
        heading: content.heading.trim(),
        description: content.description,
        points: content.points,
      ),
    ),
  );
  return true;
}

/// Opens notes from a user-invoked launcher while coordinating with the
/// automatic presenter. Marking the release synchronously prevents a delayed
/// preference read from stacking an automatic sheet over this manual one.
Future<bool> showSettleoraVersionNotesManually({
  required BuildContext context,
  required SettleoraBundledVersionNotes? notes,
  required SettleoraVersionNotesProcessGuard processGuard,
  SettleoraVersionSeenPreference? preference,
}) async {
  if (notes == null || !notes.isUsable) {
    return false;
  }
  processGuard.markAttempted(notes.releaseKey);
  var dismissedValidSheet = false;
  try {
    dismissedValidSheet = await showSettleoraVersionNotes(
      context: context,
      notes: notes,
    );
  } catch (_) {
    return false;
  }
  if (dismissedValidSheet && preference != null) {
    unawaited(_writeSeenReleaseKeyFailOpen(preference, notes.releaseKey));
  }
  return dismissedValidSheet;
}

Future<void> _writeSeenReleaseKeyFailOpen(
  SettleoraVersionSeenPreference preference,
  String releaseKey,
) async {
  try {
    await preference.writeSeenReleaseKey(releaseKey.trim());
  } catch (_) {
    // Manual use remains available and this process stays guarded. A later
    // process may show the notes again if persistence genuinely failed.
  }
}

/// Keeps release-note preference I/O out of bootstrap loading. The child is
/// always rendered immediately; a valid unseen release is presented only
/// after an eligible child frame exists.
class SettleoraVersionNotesAutoPresenter extends StatefulWidget {
  const SettleoraVersionNotesAutoPresenter({
    super.key,
    required this.preference,
    required this.notes,
    required this.enabled,
    required this.child,
    this.processGuard,
  });

  final SettleoraVersionSeenPreference preference;
  final SettleoraBundledVersionNotes? notes;
  final bool enabled;
  final Widget child;
  final SettleoraVersionNotesProcessGuard? processGuard;

  @override
  State<SettleoraVersionNotesAutoPresenter> createState() =>
      _SettleoraVersionNotesAutoPresenterState();
}

class _SettleoraVersionNotesAutoPresenterState
    extends State<SettleoraVersionNotesAutoPresenter> {
  bool _readCompleted = false;
  bool _readFailed = false;
  bool _presentationScheduled = false;
  String? _seenReleaseKey;
  int _readGeneration = 0;

  SettleoraVersionNotesProcessGuard get _processGuard =>
      widget.processGuard ?? _defaultSettleoraVersionNotesProcessGuard;

  @override
  void initState() {
    super.initState();
    _startPreferenceRead();
  }

  @override
  void didUpdateWidget(SettleoraVersionNotesAutoPresenter oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.preference, widget.preference)) {
      _readCompleted = false;
      _readFailed = false;
      _seenReleaseKey = null;
      _startPreferenceRead();
      return;
    }
    _scheduleIfNeeded();
  }

  void _startPreferenceRead() {
    final generation = ++_readGeneration;
    Future<void>.microtask(() => _readPreference(generation));
  }

  Future<void> _readPreference(int generation) async {
    try {
      final seenReleaseKey = await widget.preference.readSeenReleaseKey();
      if (generation != _readGeneration) {
        return;
      }
      _seenReleaseKey = seenReleaseKey;
    } catch (_) {
      if (generation != _readGeneration) {
        return;
      }
      _readFailed = true;
    }
    if (!mounted) {
      return;
    }
    setState(() {
      _readCompleted = true;
    });
    _scheduleIfNeeded();
  }

  void _scheduleIfNeeded() {
    final notes = widget.notes;
    if (!mounted ||
        !widget.enabled ||
        !_readCompleted ||
        _readFailed ||
        notes == null ||
        !notes.isUsable ||
        _presentationScheduled ||
        _processGuard.hasAttempted(notes.releaseKey) ||
        _seenReleaseKey == notes.releaseKey.trim()) {
      return;
    }

    _presentationScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _presentationScheduled = false;
      if (!mounted ||
          !widget.enabled ||
          _processGuard.hasAttempted(notes.releaseKey)) {
        return;
      }
      _presentAutomatically(notes);
    });
  }

  Future<void> _presentAutomatically(SettleoraBundledVersionNotes notes) async {
    if (!_processGuard.markAttempted(notes.releaseKey)) {
      return;
    }
    var dismissedValidSheet = false;
    try {
      dismissedValidSheet = await showSettleoraVersionNotes(
        context: context,
        notes: notes,
      );
    } catch (_) {
      return;
    }

    if (!dismissedValidSheet) {
      return;
    }
    try {
      await widget.preference.writeSeenReleaseKey(notes.releaseKey.trim());
    } catch (_) {
      // A later app process may show the notes again. This process remains
      // guarded so preference failure cannot create a presentation loop.
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
