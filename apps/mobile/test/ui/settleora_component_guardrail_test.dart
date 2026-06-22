import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_form_fields.dart';
import 'package:mobile/ui/settleora_theme.dart';

void main() {
  test('built-in light palette keeps readable warm-fintech token pairs', () {
    const colors = SettleoraColors.light;
    final primaryHue = HSVColor.fromColor(colors.primary).hue;

    expect(primaryHue, inInclusiveRange(15, 35));
    expect(_contrastRatio(colors.primary, colors.onPrimary), greaterThan(4.5));
    expect(
      _contrastRatio(colors.primarySoft, colors.primary),
      greaterThan(4.5),
    );
    expect(_contrastRatio(colors.accentSoft, colors.accent), greaterThan(4.5));
    expect(
      _contrastRatio(colors.successSoft, colors.onSuccessSoft),
      greaterThan(4.5),
    );
    expect(
      _contrastRatio(colors.warningSoft, colors.onWarningSoft),
      greaterThan(4.5),
    );
    expect(
      _contrastRatio(colors.dangerSoft, colors.onDangerSoft),
      greaterThan(4.5),
    );
    expect(
      _contrastRatio(colors.infoSoft, colors.onInfoSoft),
      greaterThan(4.5),
    );
    expect(_contrastRatio(colors.surface, colors.textMuted), greaterThan(4.5));
    expect(_contrastRatio(colors.surface, colors.textSubtle), greaterThan(4.5));
  });

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
                const VisualPreferenceUnsupportedReadout(
                  key: Key('component-visual-preference-readout'),
                ),
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
    expect(find.text('Visual preferences'), findsOneWidget);
    expect(
      find.textContaining(
        'Custom appearance settings are not available in the mobile app yet.',
      ),
      findsOneWidget,
    );
    expect(find.text('Appearance mode'), findsOneWidget);
    expect(
      find.textContaining('currently follows the built-in mobile appearance'),
      findsOneWidget,
    );
    expect(find.text('Accent and palettes'), findsOneWidget);
    expect(find.textContaining('cannot be customized yet'), findsOneWidget);
    expect(find.text('Subject colors'), findsOneWidget);
    expect(
      find.textContaining('use the built-in Settleora style'),
      findsOneWidget,
    );
    expect(find.text('Personalization'), findsOneWidget);
    expect(find.textContaining('not configurable yet'), findsOneWidget);
    expect(find.text('Authority'), findsOneWidget);
    expect(
      find.textContaining(
        'will never change access, money, settlement, privacy, or security rules',
      ),
      findsOneWidget,
    );
    final visualReadout = find.byKey(
      const Key('component-visual-preference-readout'),
    );
    expect(
      find.descendant(of: visualReadout, matching: find.byType(FilledButton)),
      findsNothing,
    );
    expect(
      find.descendant(of: visualReadout, matching: find.byType(OutlinedButton)),
      findsNothing,
    );
    expect(
      find.descendant(of: visualReadout, matching: find.byType(TextButton)),
      findsNothing,
    );
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
    expect(
      tester
          .getSize(find.widgetWithText(FilledButton, 'Primary action'))
          .height,
      greaterThanOrEqualTo(48),
    );
  });

  testWidgets(
    'currency selector preserves supported, blank, and unknown values',
    (tester) async {
      String? selected = 'HKD';

      await tester.pumpWidget(
        MaterialApp(
          theme: SettleoraTheme.light(),
          home: StatefulBuilder(
            builder: (context, setState) {
              return Scaffold(
                body: CurrencySelector(
                  key: const Key('currency-selector'),
                  value: selected,
                  allowClear: true,
                  onChanged: (value) => setState(() => selected = value),
                ),
              );
            },
          ),
        ),
      );

      expect(find.text('HKD - Hong Kong Dollar'), findsOneWidget);
      await tester.tap(find.byKey(const Key('currency-selector')));
      await tester.pumpAndSettle();
      expect(find.text('JPY - Japanese Yen'), findsOneWidget);
      await tester.tap(find.text('JPY - Japanese Yen').last);
      await tester.pumpAndSettle();
      expect(selected, 'JPY');

      selected = 'AUD';
      await tester.pumpWidget(
        MaterialApp(
          theme: SettleoraTheme.light(),
          home: Scaffold(
            body: CurrencySelector(
              key: const Key('currency-selector-unknown'),
              value: selected,
              allowClear: true,
              onChanged: (value) => selected = value,
            ),
          ),
        ),
      );

      expect(find.text('AUD - Not currently selectable'), findsOneWidget);
    },
  );

  testWidgets('payment method selector handles common and custom values', (
    tester,
  ) async {
    String? selected = 'FPS';

    await tester.pumpWidget(
      MaterialApp(
        theme: SettleoraTheme.light(),
        home: StatefulBuilder(
          builder: (context, setState) {
            return Scaffold(
              body: PaymentMethodSelector(
                key: const Key('payment-method-selector'),
                value: selected,
                onChanged: (value) => setState(() => selected = value),
              ),
            );
          },
        ),
      ),
    );

    expect(find.text('FPS'), findsOneWidget);
    await tester.tap(find.text('FPS'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('PayMe').last);
    await tester.pumpAndSettle();
    expect(selected, 'PayMe');

    selected = 'My local wallet';
    await tester.pumpWidget(
      MaterialApp(
        theme: SettleoraTheme.light(),
        home: Scaffold(
          body: PaymentMethodSelector(
            key: const Key('payment-method-selector-custom'),
            value: selected,
            onChanged: (value) => selected = value,
          ),
        ),
      ),
    );

    expect(find.text('Other'), findsOneWidget);
    expect(find.text('My local wallet'), findsOneWidget);
  });

  testWidgets('shared icon button label fits narrow mobile widths', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(280, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        theme: SettleoraTheme.light(),
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 148,
              child: AppButton(
                key: const Key('narrow-scan-button'),
                label: 'Scan receipt',
                icon: Icons.document_scanner_outlined,
                variant: AppButtonVariant.secondary,
                expanded: true,
                onPressed: () {},
              ),
            ),
          ),
        ),
      ),
    );

    expect(find.text('Scan receipt'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('amount status row stays readable at high text scale', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 760);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        theme: SettleoraTheme.light(),
        home: const MediaQuery(
          data: MediaQueryData(textScaler: TextScaler.linear(2)),
          child: Scaffold(
            body: Center(
              child: SizedBox(
                width: 300,
                child: AppCard(
                  child: AmountStatusRow(
                    title: 'Very long dinner club settlement',
                    subtitle: 'Long saved-summary subtitle remains bounded',
                    amount: r'HKD 123456.78',
                    status: 'Needs review',
                    statusVariant: StatusChipVariant.warning,
                    leading: Icons.receipt_long_outlined,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );

    expect(find.text('Very long dinner club settlement'), findsOneWidget);
    expect(
      find.text('Long saved-summary subtitle remains bounded'),
      findsOneWidget,
    );
    expect(find.text(r'HKD 123456.78'), findsOneWidget);
    expect(find.text('Needs review'), findsOneWidget);
    expect(tester.takeException(), isNull);
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
    expect(find.text('More'), findsOneWidget);
    expect(find.text('Receipts'), findsNothing);
    expect(find.text('Profile'), findsNothing);

    final nav = tester.widget<SettleoraBottomNav>(
      find.byType(SettleoraBottomNav),
    );
    expect(nav.selected, SettleoraNavDestination.bills);

    await tester.tap(find.byKey(const Key('bottom-nav-bills')));
    await tester.pumpAndSettle();

    expect(tapped, isNull);

    await tester.tap(find.byKey(const Key('bottom-nav-groups')));
    await tester.pumpAndSettle();

    expect(tapped, SettleoraNavDestination.groups);
  });

  testWidgets('bottom nav keeps five V1 labels stable on narrow surfaces', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 820);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        theme: SettleoraTheme.light(),
        home: const Scaffold(
          bottomNavigationBar: SettleoraBottomNav(
            selected: SettleoraNavDestination.settle,
          ),
          body: SizedBox.shrink(),
        ),
      ),
    );

    for (final label in const ['Home', 'Bills', 'Groups', 'Settle', 'More']) {
      expect(find.text(label), findsOneWidget);
    }
    expect(find.text('Receipts'), findsNothing);
    expect(find.text('Profile'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}

Future<void> _useLargeSurface(WidgetTester tester) async {
  tester.view.physicalSize = const Size(900, 1200);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

double _contrastRatio(Color a, Color b) {
  final l1 = a.computeLuminance();
  final l2 = b.computeLuminance();
  final lighter = l1 > l2 ? l1 : l2;
  final darker = l1 > l2 ? l2 : l1;
  return (lighter + 0.05) / (darker + 0.05);
}
