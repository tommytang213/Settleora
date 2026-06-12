import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_theme.dart';

void main() {
  testWidgets('shared Settleora UI primitives render stable labels', (
    tester,
  ) async {
    await _useLargeSurface(tester);

    await tester.pumpWidget(
      MaterialApp(
        theme: SettleoraTheme.light(),
        home: Scaffold(
          body: SingleChildScrollView(
            child: Column(
              children: [
                Wrap(
                  children: [
                    AppButton(label: 'Primary action', onPressed: () {}),
                    AppButton(
                      label: 'Secondary action',
                      variant: AppButtonVariant.secondary,
                      onPressed: () {},
                    ),
                    AppButton(
                      label: 'Soft action',
                      variant: AppButtonVariant.soft,
                      onPressed: () {},
                    ),
                    AppButton(
                      label: 'Destructive action',
                      variant: AppButtonVariant.destructive,
                      onPressed: () {},
                    ),
                  ],
                ),
                const Wrap(
                  children: [
                    StatusChip(
                      label: 'Paid',
                      variant: StatusChipVariant.success,
                    ),
                    StatusChip(
                      label: 'Needs review',
                      variant: StatusChipVariant.warning,
                    ),
                    StatusChip(
                      label: 'Blocked',
                      variant: StatusChipVariant.danger,
                    ),
                    StatusChip(
                      label: 'Synced',
                      variant: StatusChipVariant.info,
                    ),
                    StatusChip(label: 'Draft'),
                  ],
                ),
                const AppCard(child: Text('Card content')),
                const MetricCard(
                  label: 'You owe',
                  amount: r'$42.00',
                  caption: 'Across two bills',
                  variant: StatusChipVariant.danger,
                ),
                const AmountStatusRow(
                  title: 'Dinner Club',
                  subtitle: 'Due tomorrow',
                  amount: r'$18.25',
                  status: 'Pending',
                  statusVariant: StatusChipVariant.warning,
                ),
                const AppTextField(
                  label: 'Payment note',
                  hintText: 'FPS, PayMe, bank note',
                ),
                EmptyState(
                  icon: Icons.receipt_long_rounded,
                  title: 'No bills',
                  message: 'Create a bill when you have something to split.',
                  action: AppButton(
                    label: 'Create bill',
                    variant: AppButtonVariant.secondary,
                    onPressed: () {},
                  ),
                ),
                const LoadingState(message: 'Loading bills'),
                ErrorState(
                  title: 'Bills unavailable',
                  message: 'Try again later.',
                  onRetry: () {},
                ),
              ],
            ),
          ),
        ),
      ),
    );

    expect(find.text('Primary action'), findsOneWidget);
    expect(find.text('Secondary action'), findsOneWidget);
    expect(find.text('Soft action'), findsOneWidget);
    expect(find.text('Destructive action'), findsOneWidget);
    expect(find.text('Paid'), findsOneWidget);
    expect(find.text('Needs review'), findsOneWidget);
    expect(find.text('Blocked'), findsOneWidget);
    expect(find.text('Synced'), findsOneWidget);
    expect(find.text('Draft'), findsOneWidget);
    expect(find.text('Card content'), findsOneWidget);
    expect(find.text('You owe'), findsOneWidget);
    expect(find.text(r'$42.00'), findsOneWidget);
    expect(find.text('Across two bills'), findsOneWidget);
    expect(find.text('Dinner Club'), findsOneWidget);
    expect(find.text('Due tomorrow'), findsOneWidget);
    expect(find.text(r'$18.25'), findsOneWidget);
    expect(find.text('Pending'), findsOneWidget);
    expect(find.text('Payment note'), findsOneWidget);
    expect(find.text('FPS, PayMe, bank note'), findsOneWidget);
    expect(find.text('No bills'), findsOneWidget);
    expect(
      find.text('Create a bill when you have something to split.'),
      findsOneWidget,
    );
    expect(find.text('Create bill'), findsOneWidget);
    expect(find.text('Loading bills'), findsOneWidget);
    expect(find.text('Bills unavailable'), findsOneWidget);
    expect(find.text('Try again later.'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('bottom nav renders destinations and reports selected taps', (
    tester,
  ) async {
    await _useLargeSurface(tester);
    SettleoraNavDestination? tapped;

    await tester.pumpWidget(
      MaterialApp(
        theme: SettleoraTheme.light(),
        home: Scaffold(
          bottomNavigationBar: SettleoraBottomNav(
            selected: SettleoraNavDestination.bills,
            onSelected: (destination) {
              tapped = destination;
            },
          ),
          body: const SizedBox.shrink(),
        ),
      ),
    );

    expect(find.text('Home'), findsOneWidget);
    expect(find.text('Bills'), findsOneWidget);
    expect(find.text('Groups'), findsOneWidget);
    expect(find.text('Settle'), findsOneWidget);
    expect(find.text('Receipts'), findsOneWidget);
    expect(find.text('Profile'), findsOneWidget);

    final nav = tester.widget<NavigationBar>(
      find.byKey(const Key('server-shell-bottom-nav')),
    );
    expect(nav.selectedIndex, 1);

    await tester.tap(find.byKey(const Key('bottom-nav-groups')));
    await tester.pumpAndSettle();

    expect(tapped, SettleoraNavDestination.groups);
  });
}

Future<void> _useLargeSurface(WidgetTester tester) async {
  tester.view.physicalSize = const Size(900, 1200);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}
