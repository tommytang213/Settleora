import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/.dart_tool/flutter_gen/gen_l10n/app_localizations.dart';
import 'package:mobile/help/contextual_help.dart';

void main() {
  test('all ten topics map their exact ordered payload from the catalog', () {
    final localizations = lookupAppLocalizations(const Locale('en'));
    final expected = <SettleoraHelpTopic, List<String>>{
      SettleoraHelpTopic.firstLaunch: [
        localizations.contextualHelpFirstLaunchSheetTitle,
        localizations.contextualHelpFirstLaunchHeading,
        localizations.contextualHelpFirstLaunchDescription,
        localizations.contextualHelpFirstLaunchPoint1,
        localizations.contextualHelpFirstLaunchPoint2,
        localizations.contextualHelpFirstLaunchPoint3,
        localizations.contextualHelpFirstLaunchEntryLabel,
      ],
      SettleoraHelpTopic.dashboard: [
        localizations.contextualHelpDashboardSheetTitle,
        localizations.contextualHelpDashboardHeading,
        localizations.contextualHelpDashboardDescription,
        localizations.contextualHelpDashboardPoint1,
        localizations.contextualHelpDashboardPoint2,
        localizations.contextualHelpDashboardPoint3,
        localizations.contextualHelpDashboardEntryLabel,
      ],
      SettleoraHelpTopic.bills: [
        localizations.contextualHelpBillsSheetTitle,
        localizations.contextualHelpBillsHeading,
        localizations.contextualHelpBillsDescription,
        localizations.contextualHelpBillsPoint1,
        localizations.contextualHelpBillsPoint2,
        localizations.contextualHelpBillsPoint3,
        localizations.contextualHelpBillsEntryLabel,
      ],
      SettleoraHelpTopic.ocrReview: [
        localizations.contextualHelpOcrReviewSheetTitle,
        localizations.contextualHelpOcrReviewHeading,
        localizations.contextualHelpOcrReviewDescription,
        localizations.contextualHelpOcrReviewPoint1,
        localizations.contextualHelpOcrReviewPoint2,
        localizations.contextualHelpOcrReviewPoint3,
        localizations.contextualHelpOcrReviewEntryLabel,
      ],
      SettleoraHelpTopic.groups: [
        localizations.contextualHelpGroupsSheetTitle,
        localizations.contextualHelpGroupsHeading,
        localizations.contextualHelpGroupsDescription,
        localizations.contextualHelpGroupsPoint1,
        localizations.contextualHelpGroupsPoint2,
        localizations.contextualHelpGroupsPoint3,
        localizations.contextualHelpGroupsEntryLabel,
      ],
      SettleoraHelpTopic.settlements: [
        localizations.contextualHelpSettlementsSheetTitle,
        localizations.contextualHelpSettlementsHeading,
        localizations.contextualHelpSettlementsDescription,
        localizations.contextualHelpSettlementsPoint1,
        localizations.contextualHelpSettlementsPoint2,
        localizations.contextualHelpSettlementsPoint3,
        localizations.contextualHelpSettlementsEntryLabel,
      ],
      SettleoraHelpTopic.recurring: [
        localizations.contextualHelpRecurringSheetTitle,
        localizations.contextualHelpRecurringHeading,
        localizations.contextualHelpRecurringDescription,
        localizations.contextualHelpRecurringPoint1,
        localizations.contextualHelpRecurringPoint2,
        localizations.contextualHelpRecurringPoint3,
        localizations.contextualHelpRecurringEntryLabel,
      ],
      SettleoraHelpTopic.reportsSearch: [
        localizations.contextualHelpReportsSearchSheetTitle,
        localizations.contextualHelpReportsSearchHeading,
        localizations.contextualHelpReportsSearchDescription,
        localizations.contextualHelpReportsSearchPoint1,
        localizations.contextualHelpReportsSearchPoint2,
        localizations.contextualHelpReportsSearchPoint3,
        localizations.contextualHelpReportsSearchEntryLabel,
      ],
      SettleoraHelpTopic.backupRestore: [
        localizations.contextualHelpBackupRestoreSheetTitle,
        localizations.contextualHelpBackupRestoreHeading,
        localizations.contextualHelpBackupRestoreDescription,
        localizations.contextualHelpBackupRestorePoint1,
        localizations.contextualHelpBackupRestorePoint2,
        localizations.contextualHelpBackupRestorePoint3,
        localizations.contextualHelpBackupRestoreEntryLabel,
      ],
      SettleoraHelpTopic.settingsSecurity: [
        localizations.contextualHelpSettingsSecuritySheetTitle,
        localizations.contextualHelpSettingsSecurityHeading,
        localizations.contextualHelpSettingsSecurityDescription,
        localizations.contextualHelpSettingsSecurityPoint1,
        localizations.contextualHelpSettingsSecurityPoint2,
        localizations.contextualHelpSettingsSecurityPoint3,
        localizations.contextualHelpSettingsSecurityEntryLabel,
      ],
    };

    expect(expected.keys.toSet(), SettleoraHelpTopic.values.toSet());
    expect(expected.values.expand((values) => values), hasLength(70));
    expect(
      expected.values.expand((values) => values.sublist(3, 6)),
      hasLength(30),
    );

    for (final topic in SettleoraHelpTopic.values) {
      final metadata = settleoraContextualHelpRegistry[topic]!;
      final content = settleoraHelpContent(topic, localizations: localizations);
      expect(metadata.topic, topic);
      expect(metadata.contentVersion, '2026-09-08.1');
      expect(content.topic, topic);
      expect(content.contentVersion, metadata.contentVersion);
      expect(
        <String>[
          content.sheetTitle,
          content.heading,
          content.description,
          ...content.points,
          content.entryLabel,
        ],
        expected[topic],
        reason: topic.keyName,
      );
    }
  });

  test(
    'production keeps no duplicate English payload or raw-key rendering',
    () {
      final source = File('lib/help/contextual_help.dart').readAsStringSync();
      final arb =
          jsonDecode(File('l10n/app_en.arb').readAsStringSync())
              as Map<String, dynamic>;
      final messages = arb.entries
          .where((entry) => entry.key.startsWith('contextualHelp'))
          .toList();

      expect(messages, hasLength(70));
      expect(messages.where((entry) => entry.value == 'Close help'), isEmpty);
      expect(source, contains("label: 'Close help'"));
      for (final entry in messages) {
        final value = entry.value as String;
        expect(source, isNot(contains("'$value'")), reason: entry.key);
        expect(value, isNot(entry.key), reason: entry.key);
      }
    },
  );
}
