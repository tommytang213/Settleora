import 'package:flutter/material.dart';

import '../ui/settleora_components.dart';

enum SettleoraHelpTopic {
  firstLaunch('first-launch'),
  dashboard('dashboard'),
  bills('bills'),
  ocrReview('ocr-review'),
  groups('groups'),
  settlements('settlements'),
  recurring('recurring'),
  reportsSearch('reports-search'),
  backupRestore('backup-restore'),
  settingsSecurity('settings-security');

  const SettleoraHelpTopic(this.keyName);

  final String keyName;
}

class SettleoraContextualHelpContent {
  const SettleoraContextualHelpContent({
    required this.topic,
    required this.contentVersion,
    required this.sheetTitle,
    required this.heading,
    required this.description,
    required this.points,
    required this.entryLabel,
  });

  final SettleoraHelpTopic topic;
  final String contentVersion;
  final String sheetTitle;
  final String heading;
  final String description;
  final List<String> points;
  final String entryLabel;
}

const settleoraContextualHelpRegistry = <SettleoraHelpTopic, SettleoraContextualHelpContent>{
  SettleoraHelpTopic.firstLaunch: SettleoraContextualHelpContent(
    topic: SettleoraHelpTopic.firstLaunch,
    contentVersion: '2026-09-08.1',
    sheetTitle: 'Setup help',
    heading: 'Choose how this device starts',
    description:
        'Setup lets you connect this device to a Settleora server or keep it in Local Mode.',
    points: [
      'Server mode checks the address format before saving. Connecting still depends on server availability, and that server controls shared data and protected changes.',
      'Local Mode keeps this device separate from server collaboration. You can continue without signing in.',
      'Opening or closing help does not select a mode or save configuration.',
    ],
    entryLabel: 'Help with Settleora setup',
  ),
  SettleoraHelpTopic.dashboard: SettleoraContextualHelpContent(
    topic: SettleoraHelpTopic.dashboard,
    contentVersion: '2026-09-08.1',
    sheetTitle: 'Home help',
    heading: 'Your current Settleora overview',
    description:
        'Home brings together loaded balances, upcoming bills, activity, and shortcuts to the main mobile areas.',
    points: [
      'Summary cards reflect the overview currently returned by the server; they do not create or change records.',
      'Use Refresh when you want to request a newer overview.',
      'Quick actions open the existing create and group flows without changing their validation rules.',
    ],
    entryLabel: 'Help with Home',
  ),
  SettleoraHelpTopic.bills: SettleoraContextualHelpContent(
    topic: SettleoraHelpTopic.bills,
    contentVersion: '2026-09-08.1',
    sheetTitle: 'Bills help',
    heading: 'Review bills and receipt context',
    description:
        'Bills shows personal or group bill records that are currently available to this screen.',
    points: [
      'Receipt warnings and OCR suggestions are review signals, not confirmed financial truth.',
      'Currency stays attached to each amount. This mobile build does not show or fetch live provider FX rates; help does not estimate a conversion.',
      'Unavailable create, scan, archive, or restore actions remain unavailable; help does not bypass server validation or permissions.',
    ],
    entryLabel: 'Help with Bills',
  ),
  SettleoraHelpTopic.ocrReview: SettleoraContextualHelpContent(
    topic: SettleoraHelpTopic.ocrReview,
    contentVersion: '2026-09-08.1',
    sheetTitle: 'Receipt review help',
    heading: 'Check provisional receipt suggestions',
    description:
        'Receipt review shows saved OCR suggestions and the current review state for a receipt.',
    points: [
      'OCR text, amounts, currency, dates, and line classifications can be incomplete or wrong and should be reviewed against the receipt.',
      'A preview is non-final. Applying reviewed data follows the existing guarded draft-only flow and server validation remains authoritative.',
      'Actions that are disconnected, unsupported, or unavailable stay disabled and are not enabled by help.',
    ],
    entryLabel: 'Help with Receipt review',
  ),
  SettleoraHelpTopic.groups: SettleoraContextualHelpContent(
    topic: SettleoraHelpTopic.groups,
    contentVersion: '2026-09-08.1',
    sheetTitle: 'Groups help',
    heading: 'Understand groups and participants',
    description:
        'Groups lists the shared workspaces and participant details currently visible to your account.',
    points: [
      'Roles and membership statuses are server-provided readouts; hiding or showing an action does not grant authorization.',
      'Group member changes use the existing protected server flow and may be unavailable for your role or the current group state.',
      'Temporary participants are not available in this mobile build. The current group and bill flows use registered profiles and do not grant account permissions through visible controls.',
    ],
    entryLabel: 'Help with Groups',
  ),
  SettleoraHelpTopic.settlements: SettleoraContextualHelpContent(
    topic: SettleoraHelpTopic.settlements,
    contentVersion: '2026-09-08.1',
    sheetTitle: 'Settlements help',
    heading: 'Review balances and settlement requests',
    description:
        'Settlements presents server-provided balances, requests, payment records, and their current statuses.',
    points: [
      'Amounts and statuses describe current records; they are not a recommendation to send, accept, or confirm a payment.',
      'Payment and confirmation actions remain subject to the existing confirmation, permission, and server-validation flow.',
      'Unavailable actions stay unavailable and help never changes a balance or settlement status.',
    ],
    entryLabel: 'Help with Settlements',
  ),
  SettleoraHelpTopic.recurring: SettleoraContextualHelpContent(
    topic: SettleoraHelpTopic.recurring,
    contentVersion: '2026-09-08.1',
    sheetTitle: 'Recurring bills help',
    heading: 'Review templates and forecasts',
    description:
        'Recurring bills shows saved templates, forecast occurrences, and upcoming one-time bill drafts when available.',
    points: [
      'Forecast entries are derived planning views, not confirmed bills or financial truth.',
      'Generating from a template uses the existing explicit draft flow; review and confirmation remain separate.',
      'Unsupported payloads or unavailable lifecycle actions remain read-only or disabled.',
    ],
    entryLabel: 'Help with Recurring bills',
  ),
  SettleoraHelpTopic.reportsSearch: SettleoraContextualHelpContent(
    topic: SettleoraHelpTopic.reportsSearch,
    contentVersion: '2026-09-08.1',
    sheetTitle: 'Reports and search help',
    heading: 'Explore a read-only monthly summary',
    description:
        'Monthly reports summarize the report data returned for the selected month and optional group.',
    points: [
      'Search and filters narrow already-loaded report rows on this screen; they do not change saved records.',
      'Amounts remain grouped by currency and are not combined through an inferred exchange rate.',
      'Changing month or refreshing requests report data but does not mutate bills, settlements, or reconciliation states.',
    ],
    entryLabel: 'Help with Reports and search',
  ),
  SettleoraHelpTopic.backupRestore: SettleoraContextualHelpContent(
    topic: SettleoraHelpTopic.backupRestore,
    contentVersion: '2026-09-08.1',
    sheetTitle: 'Backup and import help',
    heading: 'Inspect local backup data safely',
    description:
        'Data safety can generate or inspect the mobile backup format supported by this build.',
    points: [
      'The import preview validates pasted backup JSON without overwriting local or server data.',
      'Restore apply is disabled. A valid preview does not promise that a future guarded restore will be accepted.',
      'Backups exclude passwords, session tokens, server-only records, and receipt or proof file contents.',
    ],
    entryLabel: 'Help with Backup and import preview',
  ),
  SettleoraHelpTopic.settingsSecurity: SettleoraContextualHelpContent(
    topic: SettleoraHelpTopic.settingsSecurity,
    contentVersion: '2026-09-08.1',
    sheetTitle: 'Settings and security help',
    heading: 'Understand device settings and protected account areas',
    description:
        'App settings collects notification readouts, appearance and mode boundaries, and local data tools.',
    points: [
      'Mobile-local notification choices on this screen do not replace server notification policy.',
      'Session validity, shared-data access, and protected security changes remain server-authoritative.',
      'Read-only or unavailable settings stay that way; help does not expose credentials or change security policy.',
    ],
    entryLabel: 'Help with Settings and security',
  ),
};

SettleoraContextualHelpContent settleoraHelpContent(SettleoraHelpTopic topic) =>
    settleoraContextualHelpRegistry[topic]!;

Future<void> showSettleoraContextualHelp({
  required BuildContext context,
  required SettleoraHelpTopic topic,
}) async {
  final content = settleoraHelpContent(topic);
  await showSettleoraBottomSheet<void>(
    context: context,
    builder: (sheetContext) => SettleoraBottomSheetFrame(
      title: content.sheetTitle,
      actions: [
        AppButton(
          key: ValueKey('contextual-help-close-${topic.keyName}'),
          label: 'Close help',
          onPressed: () => Navigator.of(sheetContext).pop(),
        ),
      ],
      child: SettleoraGuidanceContent(
        key: ValueKey('contextual-help-content-${topic.keyName}'),
        heading: content.heading,
        description: content.description,
        points: content.points,
      ),
    ),
  );
}

class SettleoraContextualHelpAction extends StatefulWidget {
  const SettleoraContextualHelpAction({super.key, required this.topic});

  final SettleoraHelpTopic topic;

  @override
  State<SettleoraContextualHelpAction> createState() =>
      _SettleoraContextualHelpActionState();
}

class _SettleoraContextualHelpActionState
    extends State<SettleoraContextualHelpAction> {
  late final FocusNode _focusNode = FocusNode(
    debugLabel: 'contextual-help-${widget.topic.keyName}',
  );

  @override
  void dispose() {
    _focusNode.dispose();
    super.dispose();
  }

  Future<void> _open() async {
    await showSettleoraContextualHelp(context: context, topic: widget.topic);
    if (mounted) {
      _focusNode.requestFocus();
    }
  }

  @override
  Widget build(BuildContext context) {
    final content = settleoraHelpContent(widget.topic);
    return IconButton(
      key: ValueKey('contextual-help-${widget.topic.keyName}'),
      focusNode: _focusNode,
      tooltip: content.entryLabel,
      onPressed: _open,
      icon: const Icon(Icons.help_outline),
    );
  }
}
