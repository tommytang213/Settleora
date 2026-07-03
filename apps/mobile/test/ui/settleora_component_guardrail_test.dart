import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_form_fields.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../helpers/settleora_visual_test_fonts.dart';

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

  test(
    'midnight preset keeps approved dark reference token pairs readable',
    () {
      const colors = SettleoraColors.midnight;
      final primaryHue = HSVColor.fromColor(colors.primary).hue;
      final canvasHue = HSVColor.fromColor(colors.canvas).hue;

      expect(primaryHue, inInclusiveRange(30, 45));
      expect(canvasHue, inInclusiveRange(205, 225));
      expect(_contrastRatio(colors.canvas, colors.text), greaterThan(12));
      expect(_contrastRatio(colors.surface, colors.text), greaterThan(10));
      expect(_contrastRatio(colors.surface, colors.textMuted), greaterThan(7));
      expect(
        _contrastRatio(colors.surface, colors.textSubtle),
        greaterThan(4.5),
      );
      expect(
        _contrastRatio(colors.primary, colors.onPrimary),
        greaterThan(4.5),
      );
      expect(
        _contrastRatio(colors.primarySoft, colors.primary),
        greaterThan(4.5),
      );
      expect(
        _contrastRatio(colors.accentSoft, colors.accent),
        greaterThan(4.5),
      );
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
    },
  );

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
                  key: Key('shared-static-chip-wrap'),
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
                    SettleoraStatusChip(
                      label: 'Server ready',
                      icon: Icons.cloud_done_outlined,
                    ),
                    SettleoraCountChip(
                      label: 'Unread',
                      count: 3,
                      icon: Icons.mark_email_unread_outlined,
                    ),
                    SettleoraReadinessChip(label: 'Checklist ready'),
                    SettleoraAssignedMemberChip(
                      label: 'Morgan',
                      avatarLabel: 'M',
                    ),
                  ],
                ),
                const AppCard(child: Text('Card content')),
                const SummaryCard(
                  icon: Icons.summarize_outlined,
                  title: 'Summary card',
                  value: 'HKD 128.00',
                  caption: 'Presentation-only readout',
                  variant: SettleoraSurfaceVariant.info,
                ),
                const InfoCard(
                  title: 'Info card',
                  message: 'Use shared surfaces for reusable readouts.',
                ),
                const WarningCard(
                  title: 'Warning card',
                  message: 'Review before applying sensitive changes.',
                ),
                StateCard(
                  title: 'Action state',
                  message: 'Retry is an explicit product-facing action.',
                  variant: SettleoraSurfaceVariant.danger,
                  action: AppButton(
                    label: 'Retry action',
                    icon: Icons.refresh,
                    variant: AppButtonVariant.secondary,
                    onPressed: () {},
                  ),
                ),
                const SettleoraLoadingPanel(label: 'Loading shared rows'),
                SettleoraSection(
                  title: 'Shared section',
                  trailing: const StatusChip(
                    label: 'Shared',
                    size: StatusChipSize.small,
                  ),
                  children: const [
                    SettleoraStatePanel(
                      icon: Icons.info_outline,
                      title: 'Shared state panel',
                      message: 'Reusable state copy remains screen-owned.',
                      compact: true,
                    ),
                    SettleoraKeyValueText(label: 'Status', value: 'Ready'),
                    SettleoraKeyValueText(
                      label: 'Detail',
                      value: 'Left aligned detail',
                      labelWidth: 120,
                      padding: EdgeInsets.symmetric(vertical: 5),
                      labelStyle: TextStyle(fontWeight: FontWeight.w700),
                      valueAlignment: Alignment.centerLeft,
                      valueTextAlign: TextAlign.start,
                    ),
                    SettleoraKeyValueMoneyText(
                      label: 'Balance',
                      amount: '128.00',
                      currencyCode: 'HKD',
                    ),
                  ],
                ),
                const SettleoraCompactHeader(
                  leadingIcon: Icons.account_circle_outlined,
                  title: 'Compact header',
                  subtitle: 'Screen-owned context copy',
                ),
                const SettleoraListRow(
                  key: Key('component-list-row'),
                  leadingIcon: Icons.person_outline,
                  title: 'Profile row',
                  subtitle: 'Signed in - HKD',
                ),
                const SettleoraMoneyChip(
                  amount: '128.00',
                  currencyCode: 'HKD',
                  variant: StatusChipVariant.info,
                ),
                const SettleoraInlinePanel(
                  icon: Icons.privacy_tip_outlined,
                  title: 'Inline panel',
                  message: 'Reusable panel copy stays product-facing.',
                  variant: SettleoraSurfaceVariant.info,
                ),
                const SettleoraBottomSheetFrame(
                  title: 'Sheet shell',
                  subtitle: 'Safe scrolling content',
                  child: Text('Sheet body'),
                ),
                const SettleoraDialogFrame(
                  icon: Icons.archive_outlined,
                  title: 'Dialog shell',
                  message: 'Confirm the visible action before continuing.',
                  actions: [TextButton(onPressed: null, child: Text('Close'))],
                ),
                const SettleoraStatePanel(
                  icon: Icons.notifications_none_outlined,
                  title: 'Custom compact state',
                  message: 'Compact padding can preserve screen spacing.',
                  compact: true,
                  compactPadding: EdgeInsets.symmetric(vertical: 24),
                ),
                SettingsRow(
                  key: const Key('component-settings-row'),
                  icon: Icons.settings_outlined,
                  title: 'Settings row title',
                  subtitle:
                      'Reusable settings row subtitle with product-facing copy.',
                  statusLabel: 'Ready',
                  statusVariant: StatusChipVariant.success,
                  onTap: () {},
                ),
                const VisualPreferenceUnsupportedReadout(
                  key: Key('component-visual-preference-readout'),
                ),
                const MetricCard(
                  label: 'You owe',
                  amount: r'$42.00',
                  caption: 'Across two bills',
                  variant: StatusChipVariant.danger,
                ),
                const MoneyText(
                  amount: '42.00',
                  currencyCode: 'HKD',
                  semanticLabel: '42 dollars in HKD',
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
    expect(find.text('Server ready'), findsOneWidget);
    expect(find.text('Unread: 3'), findsOneWidget);
    expect(find.text('Checklist ready'), findsOneWidget);
    expect(find.text('Morgan'), findsOneWidget);
    expect(find.text('M'), findsOneWidget);
    final staticChipWrap = find.byKey(const Key('shared-static-chip-wrap'));
    expect(
      find.descendant(of: staticChipWrap, matching: find.byType(FilterChip)),
      findsNothing,
    );
    expect(
      find.descendant(of: staticChipWrap, matching: find.byType(ChoiceChip)),
      findsNothing,
    );
    expect(
      find.descendant(of: staticChipWrap, matching: find.byType(ActionChip)),
      findsNothing,
    );
    final semanticsHandle = tester.ensureSemantics();
    expect(
      tester
          .getSemantics(find.text('Checklist ready'))
          .getSemanticsData()
          .hasAction(SemanticsAction.tap),
      isFalse,
    );
    semanticsHandle.dispose();
    expect(find.text('Card content'), findsOneWidget);
    expect(find.text('Summary card'), findsOneWidget);
    expect(find.text('HKD 128.00'), findsOneWidget);
    expect(find.text('Presentation-only readout'), findsOneWidget);
    expect(find.text('Info card'), findsOneWidget);
    expect(
      find.text('Use shared surfaces for reusable readouts.'),
      findsOneWidget,
    );
    expect(find.text('Warning card'), findsOneWidget);
    expect(
      find.text('Review before applying sensitive changes.'),
      findsOneWidget,
    );
    expect(find.text('Action state'), findsOneWidget);
    expect(
      find.text('Retry is an explicit product-facing action.'),
      findsOneWidget,
    );
    expect(find.text('Retry action'), findsOneWidget);
    expect(find.text('Loading shared rows'), findsOneWidget);
    expect(find.text('Shared section'), findsOneWidget);
    expect(find.text('Shared'), findsOneWidget);
    expect(find.text('Shared state panel'), findsOneWidget);
    expect(
      find.text('Reusable state copy remains screen-owned.'),
      findsOneWidget,
    );
    expect(find.text('Status'), findsOneWidget);
    expect(find.text('Ready'), findsWidgets);
    expect(find.text('Detail'), findsOneWidget);
    expect(find.text('Left aligned detail'), findsOneWidget);
    expect(find.text('Balance'), findsOneWidget);
    expect(find.text('128.00 HKD'), findsWidgets);
    expect(find.text('Custom compact state'), findsOneWidget);
    expect(
      find.text('Compact padding can preserve screen spacing.'),
      findsOneWidget,
    );
    expect(find.text('Compact header'), findsOneWidget);
    expect(find.text('Screen-owned context copy'), findsOneWidget);
    expect(find.byKey(const Key('component-list-row')), findsOneWidget);
    expect(find.text('Profile row'), findsOneWidget);
    expect(find.text('Signed in - HKD'), findsOneWidget);
    expect(find.text('128.00 HKD'), findsWidgets);
    expect(find.text('Inline panel'), findsOneWidget);
    expect(
      find.text('Reusable panel copy stays product-facing.'),
      findsOneWidget,
    );
    expect(find.text('Sheet shell'), findsOneWidget);
    expect(find.text('Safe scrolling content'), findsOneWidget);
    expect(find.text('Sheet body'), findsOneWidget);
    expect(find.text('Dialog shell'), findsOneWidget);
    expect(
      find.text('Confirm the visible action before continuing.'),
      findsOneWidget,
    );
    expect(find.byKey(const Key('component-settings-row')), findsOneWidget);
    expect(find.text('Settings row title'), findsOneWidget);
    expect(
      find.text('Reusable settings row subtitle with product-facing copy.'),
      findsOneWidget,
    );
    expect(find.text('Ready'), findsWidgets);
    expect(find.text('Visual preferences'), findsOneWidget);
    expect(
      find.text('The app currently uses the default Settleora theme.'),
      findsOneWidget,
    );
    expect(find.text('Appearance'), findsOneWidget);
    expect(find.text('Appearance settings are coming later.'), findsOneWidget);
    expect(
      find.textContaining('Custom appearance settings are not available'),
      findsNothing,
    );
    expect(find.textContaining('cannot be customized yet'), findsNothing);
    expect(find.textContaining('not configurable yet'), findsNothing);
    expect(find.textContaining('will never change access'), findsNothing);
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
    expect(find.text('42.00 HKD'), findsOneWidget);
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

  testWidgets('money input keeps amount and currency explicit', (tester) async {
    final amountController = TextEditingController(text: '1200');
    String? selectedCurrency = 'JPY';

    await tester.pumpWidget(
      MaterialApp(
        theme: SettleoraTheme.light(),
        home: StatefulBuilder(
          builder: (context, setState) {
            return Scaffold(
              body: MoneyInput(
                amountKey: const Key('money-input-amount'),
                currencyKey: const Key('money-input-currency'),
                amountController: amountController,
                currencyValue: selectedCurrency,
                onCurrencyChanged: (value) =>
                    setState(() => selectedCurrency = value),
                amountLabel: 'Bill amount',
                currencyLabel: 'Bill currency',
              ),
            );
          },
        ),
      ),
    );

    expect(find.text('Bill amount'), findsOneWidget);
    expect(find.text('JPY'), findsOneWidget);
    expect(find.text('Bill currency'), findsOneWidget);
    expect(find.text('Currency stays explicit before review.'), findsOneWidget);

    final editableAmountField = tester.widget<EditableText>(
      find.descendant(
        of: find.byKey(const Key('money-input-amount')),
        matching: find.byType(EditableText),
      ),
    );
    expect(editableAmountField.keyboardType.toString(), contains('decimal'));

    await tester.tap(find.byKey(const Key('money-input-currency')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('KWD - Kuwaiti Dinar').last);
    await tester.pumpAndSettle();
    expect(selectedCurrency, 'KWD');
    amountController.dispose();
  });

  testWidgets('money input can show a section currency without selector', (
    tester,
  ) async {
    final amountController = TextEditingController(text: '43.00');

    await tester.pumpWidget(
      MaterialApp(
        theme: SettleoraTheme.light(),
        home: Scaffold(
          body: MoneyInput(
            amountKey: const Key('money-input-static-amount'),
            amountController: amountController,
            currencyValue: 'hkd',
            onCurrencyChanged: (_) {},
            amountLabel: 'Subtotal',
            currencyLabel: 'Receipt currency',
            currencyControl: MoneyInputCurrencyControl.staticCode,
          ),
        ),
      ),
    );

    expect(find.text('Subtotal'), findsOneWidget);
    expect(find.text('HKD'), findsOneWidget);
    expect(find.text('Receipt currency'), findsNothing);
    expect(find.byType(CurrencySelector), findsNothing);
    expect(find.text('Uses HKD from Receipt currency.'), findsOneWidget);
    expect(
      find.bySemanticsLabel(RegExp('Subtotal amount in HKD')),
      findsOneWidget,
    );

    amountController.dispose();
  });

  testWidgets('date field stores ISO value after picker selection', (
    tester,
  ) async {
    final dateController = TextEditingController(text: '2026-06-10');

    await tester.pumpWidget(
      MaterialApp(
        theme: SettleoraTheme.light(),
        home: Scaffold(
          body: DateField(
            key: const Key('shared-date-field'),
            controller: dateController,
            label: 'Bill date',
            firstDate: DateTime(2026, 1),
            lastDate: DateTime(2026, 12, 31),
          ),
        ),
      ),
    );

    expect(find.text('Bill date'), findsOneWidget);
    expect(find.text('Jun 10, 2026'), findsOneWidget);
    expect(find.textContaining('Choose a date'), findsOneWidget);

    await tester.tap(find.byKey(const Key('shared-date-field')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('15').last);
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();

    expect(dateController.text, '2026-06-15');
    expect(find.text('Jun 15, 2026'), findsOneWidget);
    dateController.dispose();
  });

  testWidgets('date field can clear optional ISO values', (tester) async {
    final dateController = TextEditingController(text: '2026-06-10');

    await tester.pumpWidget(
      MaterialApp(
        theme: SettleoraTheme.light(),
        home: Scaffold(
          body: DateField(
            key: const Key('shared-clearable-date-field'),
            controller: dateController,
            label: 'End date',
            allowClear: true,
          ),
        ),
      ),
    );

    expect(find.text('Jun 10, 2026'), findsOneWidget);

    await tester.tap(find.byTooltip('Clear End date'));
    await tester.pumpAndSettle();

    expect(dateController.text, isEmpty);
    expect(find.text('Jun 10, 2026'), findsNothing);
    dateController.dispose();
  });

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

  testWidgets('visual screenshot helper loads fonts and mobile viewport', (
    tester,
  ) async {
    await tester.runAsync(loadSettleoraVisualTestFonts);
    await setSettleoraMobileViewport(tester);

    await tester.pumpWidget(
      MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.light(),
        home: const Scaffold(
          body: Center(
            child: SizedBox(
              width: 360,
              child: InfoCard(
                title: 'Visual QA helper',
                message: 'Roboto and Material Icons are loaded for capture.',
              ),
            ),
          ),
        ),
      ),
    );

    expect(tester.view.physicalSize, const Size(390, 844));
    expect(find.text('Visual QA helper'), findsOneWidget);
    expect(find.byIcon(Icons.info_outline), findsOneWidget);
    expect(tester.takeException(), isNull);
  }, tags: ['visual']);
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
