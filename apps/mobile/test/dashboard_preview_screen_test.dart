import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/dashboard/dashboard_preview_screen.dart';
import 'package:mobile/main.dart';
import 'package:mobile/ui/settleora_theme.dart';

void main() {
  testWidgets('preview app entrypoint can start directly at dashboard', (
    tester,
  ) async {
    await tester.pumpWidget(SettleoraMobileApp(showDashboardPreview: true));
    await tester.pumpAndSettle();

    expect(find.text('Dashboard Preview'), findsOneWidget);
    expect(find.text('Good evening, Alex'), findsOneWidget);
    expect(find.text('Secure sync'), findsOneWidget);
    expect(find.text('Settle'), findsOneWidget);
    expect(find.text('Settleora Setup'), findsNothing);
  });

  testWidgets('dashboard default state uses Home as active nav destination', (
    tester,
  ) async {
    await pumpPreview(tester);

    final nav = tester.widget<NavigationBar>(
      find.byKey(const Key('server-shell-bottom-nav')),
    );
    final labels = [
      for (final destination in nav.destinations)
        (destination as NavigationDestination).label,
    ];

    expect(labels, const ['Home', 'Bills', 'Groups', 'Settle', 'Settings']);
    expect(nav.selectedIndex, 0);
    expect(find.byKey(const Key('bottom-nav-home')), findsOneWidget);
    expect(find.byKey(const Key('bottom-nav-settle')), findsOneWidget);
    expect(find.text('Upcoming Bills'), findsOneWidget);
    expect(find.text(r'$128.40'), findsOneWidget);
    expect(find.text(r'$284.15'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Group Activity'),
      220,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('Group Activity'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Receipts to Review'),
      220,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('Receipts to Review'), findsOneWidget);
  });

  testWidgets('new user variant shows welcome actions and checklist', (
    tester,
  ) async {
    await pumpPreview(tester, variant: DashboardPreviewVariant.newUser);

    expect(find.text('Welcome, Alex'), findsOneWidget);
    expect(find.text('New Group'), findsOneWidget);
    expect(find.text('Scan Receipt'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Get Started'),
      220,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('Get Started'), findsOneWidget);
    expect(find.text('Create your first group'), findsOneWidget);
    expect(find.text('Scan your first receipt'), findsOneWidget);
    expect(find.text('Enable sync encryption'), findsOneWidget);
  });

  testWidgets('offline variant renders cached and pending sync state', (
    tester,
  ) async {
    await pumpPreview(tester, variant: DashboardPreviewVariant.offline);

    expect(find.text('Offline'), findsWidgets);
    expect(find.textContaining('Working offline'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Pending Sync'),
      240,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('Pending Sync'), findsOneWidget);
    expect(find.text('Receipt edits'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Waiting to reconnect for live updates'),
      240,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('Waiting to reconnect for live updates'), findsOneWidget);
  });

  testWidgets('review variant renders action-needed receipt review content', (
    tester,
  ) async {
    await pumpPreview(tester, variant: DashboardPreviewVariant.reviewTop);

    expect(find.text('Action needed'), findsOneWidget);
    expect(find.textContaining('Receipts need review'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Sushi receipt'),
      240,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('Sushi receipt'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Approval Issues'),
      240,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('Approval Issues'), findsOneWidget);
    expect(find.text('Dinner Club approval'), findsOneWidget);
  });
}

Future<void> pumpPreview(
  WidgetTester tester, {
  DashboardPreviewVariant variant = DashboardPreviewVariant.defaultTop,
}) async {
  tester.view.physicalSize = const Size(430, 980);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    MaterialApp(
      theme: SettleoraTheme.light(),
      home: DashboardPreviewScreen(initialVariant: variant),
    ),
  );
  await tester.pumpAndSettle();
}
