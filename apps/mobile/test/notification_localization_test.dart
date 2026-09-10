import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/.dart_tool/flutter_gen/gen_l10n/app_localizations.dart';
import 'package:mobile/notifications/notification_localization.dart';
import 'package:mobile/notifications/notification_repository.dart';

import 'notification_screen_test.dart' as notifications;

void main() {
  final localizations = lookupAppLocalizations(const Locale('en'));

  test('catalog maps every admitted stable key without dynamic arguments', () {
    expect(settleoraNotificationTitleCatalogKeys, hasLength(27));
    expect(settleoraNotificationMessageCatalogKeys, hasLength(27));

    for (final key in settleoraNotificationTitleCatalogKeys) {
      final resolved = settleoraNotificationCatalogTitle(localizations, key);
      expect(resolved, isNotNull, reason: key);
      expect(resolved, isNot(contains('notifications.')), reason: key);
    }
    for (final key in settleoraNotificationMessageCatalogKeys) {
      final resolved = settleoraNotificationCatalogMessage(localizations, key);
      expect(resolved, isNotNull, reason: key);
      expect(resolved, isNot(contains('notifications.')), reason: key);
    }

    expect(
      settleoraNotificationCatalogTitle(
        localizations,
        'notifications.future.title',
      ),
      isNull,
    );
    expect(
      settleoraNotificationCatalogMessage(
        localizations,
        'notifications.future.message',
      ),
      isNull,
    );
  });

  testWidgets(
    'known keys resolve while safe summary and unknown-key fallbacks stay safe',
    (tester) async {
      late BuildContext context;
      await tester.pumpWidget(
        MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Builder(
            builder: (value) {
              context = value;
              return const SizedBox();
            },
          ),
        ),
      );
      await tester.pumpAndSettle();

      final known = notifications.sampleNotification(
        titleKey: 'notifications.bill.submitted.title',
        messageKey: 'notifications.bill.submitted.message',
        safeSummary: '',
      );
      expect(
        settleoraLocalizedNotificationTitle(context, known),
        'Bill submitted',
      );
      expect(settleoraLocalizedNotificationSummary(context, known), 'Bill');

      final safeSummary = notifications.sampleNotification(
        messageKey: 'notifications.bill.submitted.message',
        safeSummary: 'Dinner bill is ready.',
      );
      expect(
        settleoraLocalizedNotificationSummary(context, safeSummary),
        'Dinner bill is ready.',
      );

      final unknown = notifications.sampleNotification(
        eventType: SettleoraNotificationEventTypeValues.billConfirmed,
        titleKey: 'notifications.future.raw_title',
        messageKey: 'notifications.future.raw_message',
        safeSummary: '',
      );
      expect(
        settleoraLocalizedNotificationTitle(context, unknown),
        'Bill confirmed',
      );
      expect(settleoraLocalizedNotificationSummary(context, unknown), 'Bill');
      expect(
        '${settleoraLocalizedNotificationTitle(context, unknown)} '
        '${settleoraLocalizedNotificationSummary(context, unknown)}',
        isNot(contains('notifications.future')),
      );
    },
  );
}
