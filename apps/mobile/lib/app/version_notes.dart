import 'package:flutter/material.dart';

import '../ui/settleora_components.dart';
import 'secure_storage.dart';

/// Update this key with `pubspec.yaml`'s version/build for every bundled
/// release whose What's New content should be shown again.
const currentBundledVersionNotesKey = '1.0.0+1';

const currentBundledVersionNotes = SettleoraBundledVersionNotes(
  releaseKey: currentBundledVersionNotesKey,
  heading: "What's New in Settleora 1.0",
  description:
      'A quick look at what you can do in this self-hosted mobile build.',
  points: [
    'Choose device-only Local Mode or connect to your self-hosted Settleora server.',
    'Work with bills, groups, settlements, recurring bills, reports, and notifications after signing in.',
    'Review receipt details before applying them to a draft bill.',
  ],
);

class SettleoraBundledVersionNotes {
  const SettleoraBundledVersionNotes({
    required this.releaseKey,
    required this.heading,
    this.description,
    this.points = const [],
  });

  final String releaseKey;
  final String heading;
  final String? description;
  final List<String> points;

  bool get isUsable =>
      releaseKey.trim().isNotEmpty && heading.trim().isNotEmpty;
}

/// A device-local presentation preference only. It is never consulted for
/// authentication, authorization, session validity, or domain decisions.
abstract interface class SettleoraVersionSeenPreference {
  Future<String?> readSeenReleaseKey();

  Future<void> writeSeenReleaseKey(String releaseKey);
}

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
    if (value == null || value.isEmpty || value.length > 128) {
      return null;
    }
    return value;
  }

  @override
  Future<void> writeSeenReleaseKey(String releaseKey) {
    return _keyValueStore.write(_storageKey, releaseKey.trim());
  }
}

Future<bool> showSettleoraVersionNotes({
  required BuildContext context,
  required SettleoraBundledVersionNotes? notes,
}) async {
  if (notes == null || !notes.isUsable) {
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
        heading: notes.heading.trim(),
        description: notes.description,
        points: notes.points,
      ),
    ),
  );
  return true;
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
  });

  final SettleoraVersionSeenPreference preference;
  final SettleoraBundledVersionNotes? notes;
  final bool enabled;
  final Widget child;

  @override
  State<SettleoraVersionNotesAutoPresenter> createState() =>
      _SettleoraVersionNotesAutoPresenterState();
}

class _SettleoraVersionNotesAutoPresenterState
    extends State<SettleoraVersionNotesAutoPresenter> {
  bool _readCompleted = false;
  bool _readFailed = false;
  bool _presentationScheduled = false;
  bool _automaticPresentationAttempted = false;
  String? _seenReleaseKey;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_readPreference);
  }

  @override
  void didUpdateWidget(SettleoraVersionNotesAutoPresenter oldWidget) {
    super.didUpdateWidget(oldWidget);
    _scheduleIfNeeded();
  }

  Future<void> _readPreference() async {
    try {
      _seenReleaseKey = await widget.preference.readSeenReleaseKey();
    } catch (_) {
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
        _automaticPresentationAttempted ||
        _seenReleaseKey == notes.releaseKey.trim()) {
      return;
    }

    _presentationScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _presentationScheduled = false;
      if (!mounted || !widget.enabled || _automaticPresentationAttempted) {
        return;
      }
      _presentAutomatically(notes);
    });
  }

  Future<void> _presentAutomatically(SettleoraBundledVersionNotes notes) async {
    _automaticPresentationAttempted = true;
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
