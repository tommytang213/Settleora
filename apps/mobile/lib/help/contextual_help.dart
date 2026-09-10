import 'package:flutter/material.dart';
import 'package:mobile/.dart_tool/flutter_gen/gen_l10n/app_localizations.dart';

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

class SettleoraContextualHelpMetadata {
  const SettleoraContextualHelpMetadata({
    required this.topic,
    required this.contentVersion,
  });

  final SettleoraHelpTopic topic;
  final String contentVersion;
}

const settleoraContextualHelpRegistry =
    <SettleoraHelpTopic, SettleoraContextualHelpMetadata>{
      SettleoraHelpTopic.firstLaunch: SettleoraContextualHelpMetadata(
        topic: SettleoraHelpTopic.firstLaunch,
        contentVersion: '2026-09-08.1',
      ),
      SettleoraHelpTopic.dashboard: SettleoraContextualHelpMetadata(
        topic: SettleoraHelpTopic.dashboard,
        contentVersion: '2026-09-08.1',
      ),
      SettleoraHelpTopic.bills: SettleoraContextualHelpMetadata(
        topic: SettleoraHelpTopic.bills,
        contentVersion: '2026-09-08.1',
      ),
      SettleoraHelpTopic.ocrReview: SettleoraContextualHelpMetadata(
        topic: SettleoraHelpTopic.ocrReview,
        contentVersion: '2026-09-08.1',
      ),
      SettleoraHelpTopic.groups: SettleoraContextualHelpMetadata(
        topic: SettleoraHelpTopic.groups,
        contentVersion: '2026-09-08.1',
      ),
      SettleoraHelpTopic.settlements: SettleoraContextualHelpMetadata(
        topic: SettleoraHelpTopic.settlements,
        contentVersion: '2026-09-08.1',
      ),
      SettleoraHelpTopic.recurring: SettleoraContextualHelpMetadata(
        topic: SettleoraHelpTopic.recurring,
        contentVersion: '2026-09-08.1',
      ),
      SettleoraHelpTopic.reportsSearch: SettleoraContextualHelpMetadata(
        topic: SettleoraHelpTopic.reportsSearch,
        contentVersion: '2026-09-08.1',
      ),
      SettleoraHelpTopic.backupRestore: SettleoraContextualHelpMetadata(
        topic: SettleoraHelpTopic.backupRestore,
        contentVersion: '2026-09-08.1',
      ),
      SettleoraHelpTopic.settingsSecurity: SettleoraContextualHelpMetadata(
        topic: SettleoraHelpTopic.settingsSecurity,
        contentVersion: '2026-09-08.1',
      ),
    };

SettleoraContextualHelpContent settleoraHelpContent(
  SettleoraHelpTopic topic, {
  AppLocalizations? localizations,
}) {
  localizations ??= lookupAppLocalizations(const Locale('en'));
  final metadata = settleoraContextualHelpRegistry[topic]!;
  return switch (topic) {
    SettleoraHelpTopic.firstLaunch => SettleoraContextualHelpContent(
      topic: SettleoraHelpTopic.firstLaunch,
      contentVersion: metadata.contentVersion,
      sheetTitle: localizations.contextualHelpFirstLaunchSheetTitle,
      heading: localizations.contextualHelpFirstLaunchHeading,
      description: localizations.contextualHelpFirstLaunchDescription,
      points: [
        localizations.contextualHelpFirstLaunchPoint1,
        localizations.contextualHelpFirstLaunchPoint2,
        localizations.contextualHelpFirstLaunchPoint3,
      ],
      entryLabel: localizations.contextualHelpFirstLaunchEntryLabel,
    ),
    SettleoraHelpTopic.dashboard => SettleoraContextualHelpContent(
      topic: SettleoraHelpTopic.dashboard,
      contentVersion: metadata.contentVersion,
      sheetTitle: localizations.contextualHelpDashboardSheetTitle,
      heading: localizations.contextualHelpDashboardHeading,
      description: localizations.contextualHelpDashboardDescription,
      points: [
        localizations.contextualHelpDashboardPoint1,
        localizations.contextualHelpDashboardPoint2,
        localizations.contextualHelpDashboardPoint3,
      ],
      entryLabel: localizations.contextualHelpDashboardEntryLabel,
    ),
    SettleoraHelpTopic.bills => SettleoraContextualHelpContent(
      topic: SettleoraHelpTopic.bills,
      contentVersion: metadata.contentVersion,
      sheetTitle: localizations.contextualHelpBillsSheetTitle,
      heading: localizations.contextualHelpBillsHeading,
      description: localizations.contextualHelpBillsDescription,
      points: [
        localizations.contextualHelpBillsPoint1,
        localizations.contextualHelpBillsPoint2,
        localizations.contextualHelpBillsPoint3,
      ],
      entryLabel: localizations.contextualHelpBillsEntryLabel,
    ),
    SettleoraHelpTopic.ocrReview => SettleoraContextualHelpContent(
      topic: SettleoraHelpTopic.ocrReview,
      contentVersion: metadata.contentVersion,
      sheetTitle: localizations.contextualHelpOcrReviewSheetTitle,
      heading: localizations.contextualHelpOcrReviewHeading,
      description: localizations.contextualHelpOcrReviewDescription,
      points: [
        localizations.contextualHelpOcrReviewPoint1,
        localizations.contextualHelpOcrReviewPoint2,
        localizations.contextualHelpOcrReviewPoint3,
      ],
      entryLabel: localizations.contextualHelpOcrReviewEntryLabel,
    ),
    SettleoraHelpTopic.groups => SettleoraContextualHelpContent(
      topic: SettleoraHelpTopic.groups,
      contentVersion: metadata.contentVersion,
      sheetTitle: localizations.contextualHelpGroupsSheetTitle,
      heading: localizations.contextualHelpGroupsHeading,
      description: localizations.contextualHelpGroupsDescription,
      points: [
        localizations.contextualHelpGroupsPoint1,
        localizations.contextualHelpGroupsPoint2,
        localizations.contextualHelpGroupsPoint3,
      ],
      entryLabel: localizations.contextualHelpGroupsEntryLabel,
    ),
    SettleoraHelpTopic.settlements => SettleoraContextualHelpContent(
      topic: SettleoraHelpTopic.settlements,
      contentVersion: metadata.contentVersion,
      sheetTitle: localizations.contextualHelpSettlementsSheetTitle,
      heading: localizations.contextualHelpSettlementsHeading,
      description: localizations.contextualHelpSettlementsDescription,
      points: [
        localizations.contextualHelpSettlementsPoint1,
        localizations.contextualHelpSettlementsPoint2,
        localizations.contextualHelpSettlementsPoint3,
      ],
      entryLabel: localizations.contextualHelpSettlementsEntryLabel,
    ),
    SettleoraHelpTopic.recurring => SettleoraContextualHelpContent(
      topic: SettleoraHelpTopic.recurring,
      contentVersion: metadata.contentVersion,
      sheetTitle: localizations.contextualHelpRecurringSheetTitle,
      heading: localizations.contextualHelpRecurringHeading,
      description: localizations.contextualHelpRecurringDescription,
      points: [
        localizations.contextualHelpRecurringPoint1,
        localizations.contextualHelpRecurringPoint2,
        localizations.contextualHelpRecurringPoint3,
      ],
      entryLabel: localizations.contextualHelpRecurringEntryLabel,
    ),
    SettleoraHelpTopic.reportsSearch => SettleoraContextualHelpContent(
      topic: SettleoraHelpTopic.reportsSearch,
      contentVersion: metadata.contentVersion,
      sheetTitle: localizations.contextualHelpReportsSearchSheetTitle,
      heading: localizations.contextualHelpReportsSearchHeading,
      description: localizations.contextualHelpReportsSearchDescription,
      points: [
        localizations.contextualHelpReportsSearchPoint1,
        localizations.contextualHelpReportsSearchPoint2,
        localizations.contextualHelpReportsSearchPoint3,
      ],
      entryLabel: localizations.contextualHelpReportsSearchEntryLabel,
    ),
    SettleoraHelpTopic.backupRestore => SettleoraContextualHelpContent(
      topic: SettleoraHelpTopic.backupRestore,
      contentVersion: metadata.contentVersion,
      sheetTitle: localizations.contextualHelpBackupRestoreSheetTitle,
      heading: localizations.contextualHelpBackupRestoreHeading,
      description: localizations.contextualHelpBackupRestoreDescription,
      points: [
        localizations.contextualHelpBackupRestorePoint1,
        localizations.contextualHelpBackupRestorePoint2,
        localizations.contextualHelpBackupRestorePoint3,
      ],
      entryLabel: localizations.contextualHelpBackupRestoreEntryLabel,
    ),
    SettleoraHelpTopic.settingsSecurity => SettleoraContextualHelpContent(
      topic: SettleoraHelpTopic.settingsSecurity,
      contentVersion: metadata.contentVersion,
      sheetTitle: localizations.contextualHelpSettingsSecuritySheetTitle,
      heading: localizations.contextualHelpSettingsSecurityHeading,
      description: localizations.contextualHelpSettingsSecurityDescription,
      points: [
        localizations.contextualHelpSettingsSecurityPoint1,
        localizations.contextualHelpSettingsSecurityPoint2,
        localizations.contextualHelpSettingsSecurityPoint3,
      ],
      entryLabel: localizations.contextualHelpSettingsSecurityEntryLabel,
    ),
  };
}

Future<void> showSettleoraContextualHelp({
  required BuildContext context,
  required SettleoraHelpTopic topic,
}) async {
  final content = settleoraHelpContent(
    topic,
    localizations: _contextualHelpLocalizations(context),
  );
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
    final content = settleoraHelpContent(
      widget.topic,
      localizations: _contextualHelpLocalizations(context),
    );
    return IconButton(
      key: ValueKey('contextual-help-${widget.topic.keyName}'),
      focusNode: _focusNode,
      tooltip: content.entryLabel,
      onPressed: _open,
      icon: const Icon(Icons.help_outline),
    );
  }
}

AppLocalizations _contextualHelpLocalizations(BuildContext context) =>
    Localizations.of<AppLocalizations>(context, AppLocalizations) ??
    lookupAppLocalizations(const Locale('en'));
