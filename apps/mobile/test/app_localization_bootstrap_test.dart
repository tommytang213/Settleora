import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/.dart_tool/flutter_gen/gen_l10n/app_localizations.dart';
import 'package:mobile/dashboard/dashboard_preview_screen.dart';
import 'package:mobile/main.dart';

void main() {
  testWidgets(
    'application installs generated English localization before connectivity',
    (tester) async {
      await tester.pumpWidget(SettleoraMobileApp(showDashboardPreview: true));
      await tester.pumpAndSettle();

      final app = tester.widget<MaterialApp>(find.byType(MaterialApp));
      expect(
        app.localizationsDelegates,
        AppLocalizations.localizationsDelegates,
      );
      expect(app.supportedLocales, const <Locale>[Locale('en')]);
      expect(find.byType(DashboardPreviewScreen), findsOneWidget);

      final context = tester.element(find.byType(DashboardPreviewScreen));
      expect(AppLocalizations.of(context).localeName, 'en');
      expect(AppLocalizations.of(context).appTitle, 'Settleora');
      expect(app.onGenerateTitle?.call(context), 'Settleora');
    },
  );
}
