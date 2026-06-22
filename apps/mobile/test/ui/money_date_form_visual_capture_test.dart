import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/manual_finance/manual_finance_repository.dart';
import 'package:mobile/manual_finance/manual_finance_screen.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_form_fields.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../helpers/settleora_visual_test_fonts.dart';

const _visualOutputDir =
    '/workspace/logs/settleora-visual-qa/20260622-1408-mobile-money-date-form';

void main() {
  testWidgets('captures money date form visual QA evidence', (tester) async {
    await tester.runAsync(() async {
      await loadSettleoraVisualTestFonts();
      await Directory(_visualOutputDir).create(recursive: true);
    });
    await setSettleoraMobileViewport(tester);

    const showcaseKey = Key('money-date-form-showcase-capture');
    await tester.pumpWidget(
      MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.light(),
        home: const RepaintBoundary(
          key: showcaseKey,
          child: _MoneyDateFormShowcase(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await _captureBoundary(
      tester,
      showcaseKey,
      'shared-money-date-form-showcase-390x844.png',
    );

    const formKey = Key('manual-finance-money-date-form-capture');
    await tester.pumpWidget(
      RepaintBoundary(
        key: formKey,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: SettleoraTheme.light(),
          home: SettleoraManualFinanceScreen(
            repository: _VisualManualFinanceRepository(),
            defaultCurrency: 'HKD',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -420));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('manual-finance-add-account')));
    await tester.pumpAndSettle();
    await _captureBoundary(
      tester,
      formKey,
      'manual-finance-account-form-390x844.png',
    );
  });
}

class _MoneyDateFormShowcase extends StatefulWidget {
  const _MoneyDateFormShowcase();

  @override
  State<_MoneyDateFormShowcase> createState() => _MoneyDateFormShowcaseState();
}

class _MoneyDateFormShowcaseState extends State<_MoneyDateFormShowcase> {
  final _amountController = TextEditingController(text: '1234.500');
  final _dateController = TextEditingController(text: '2026-06-22');
  String _currency = 'KWD';

  @override
  void dispose() {
    _amountController.dispose();
    _dateController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(SettleoraSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Money, date, and form fields',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: SettleoraSpacing.sm),
              const InfoCard(
                title: 'Presentation only',
                message:
                    'Amounts keep currency visible. Server rules still validate final money, dates, and calculations.',
              ),
              const SizedBox(height: SettleoraSpacing.md),
              const AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Money readout'),
                    SizedBox(height: SettleoraSpacing.xs),
                    MoneyText(amount: '1,234.500', currencyCode: 'KWD'),
                    SizedBox(height: SettleoraSpacing.xs),
                    MoneyText(amount: '12,000', currencyCode: 'JPY'),
                  ],
                ),
              ),
              const SizedBox(height: SettleoraSpacing.md),
              MoneyInput(
                amountController: _amountController,
                currencyValue: _currency,
                onCurrencyChanged: (value) =>
                    setState(() => _currency = value ?? _currency),
                amountLabel: 'Receipt total',
                currencyLabel: 'Receipt currency',
              ),
              const SizedBox(height: SettleoraSpacing.md),
              DateField(controller: _dateController, label: 'Receipt date'),
              const SizedBox(height: SettleoraSpacing.md),
              AppButton(
                label: 'Save draft',
                icon: Icons.save_outlined,
                onPressed: () {},
              ),
            ],
          ),
        ),
      ),
    );
  }
}

Future<void> _captureBoundary(
  WidgetTester tester,
  Key key,
  String fileName,
) async {
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.byKey(key),
    );
    final image = await boundary.toImage(pixelRatio: 1);
    final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
    await File(
      '$_visualOutputDir/$fileName',
    ).writeAsBytes(byteData!.buffer.asUint8List());
  });
}

class _VisualManualFinanceRepository
    implements SettleoraManualFinanceRepository {
  @override
  Future<SettleoraManualFinanceSummary> getSummary({
    String? windowStartDate,
    String? windowEndDate,
  }) async {
    return SettleoraManualFinanceSummary(
      asOfUtc: DateTime.utc(2026, 6, 22),
      windowStartDate: windowStartDate ?? '2026-06-22',
      windowEndDate: windowEndDate ?? '2026-08-21',
      currencies: const [
        SettleoraManualFinanceSummaryCurrencyRow(
          currency: 'HKD',
          activeManualAccountBalanceTotal: '1280.50',
          expectedManualIncomeTotal: '9000.00',
          recurringExpectedManualIncomeTotal: '9000.00',
          upcomingOneTimeFutureBillObligationTotal: '320.00',
          groupOneTimeFutureBillObligationTotal: '150.00',
          recurringObligationEstimateTotal: '400.00',
          groupRecurringObligationEstimateTotal: '0.00',
          estimatedAvailableAmount: '9410.50',
          warnings: ['includesOnlyActiveManualAccounts'],
        ),
      ],
      warnings: const ['doesNotIncludeBankSync'],
    );
  }

  @override
  Future<List<SettleoraManualFinancialAccount>> listAccounts({
    bool includeArchived = false,
  }) async {
    return [
      SettleoraManualFinancialAccount(
        id: 'account-1',
        displayName: 'Cash wallet',
        accountType: SettleoraManualFinancialAccountTypeValues.cash,
        currentBalanceAmount: '1280.50',
        currency: 'HKD',
        balanceAsOfDate: '2026-06-22',
        note: 'Manual balance only.',
        status: SettleoraManualFinancialAccountStatusValues.active,
        createdAtUtc: DateTime.utc(2026, 6, 1),
        updatedAtUtc: DateTime.utc(2026, 6, 22),
        archivedAtUtc: null,
      ),
    ];
  }

  @override
  Future<List<SettleoraManualIncomeSource>> listIncomeSources({
    bool includeArchived = false,
  }) async {
    return [
      SettleoraManualIncomeSource(
        id: 'income-1',
        displayName: 'Salary',
        amount: '9000.00',
        currency: 'HKD',
        cadence: SettleoraManualIncomeCadenceValues.monthly,
        nextExpectedDate: '2026-06-30',
        endDate: null,
        manualFinancialAccountId: 'account-1',
        note: 'Expected monthly income.',
        status: SettleoraManualIncomeSourceStatusValues.active,
        createdAtUtc: DateTime.utc(2026, 6, 1),
        updatedAtUtc: DateTime.utc(2026, 6, 22),
        archivedAtUtc: null,
      ),
    ];
  }

  @override
  Future<SettleoraManualFinancialAccount> createAccount(
    SettleoraManualFinancialAccountDraft draft,
  ) async {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraManualFinancialAccount> updateAccount({
    required String accountId,
    required SettleoraManualFinancialAccountDraft draft,
  }) async {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraManualFinancialAccount> archiveAccount(String accountId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraManualIncomeSource> createIncomeSource(
    SettleoraManualIncomeSourceDraft draft,
  ) async {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraManualIncomeSource> updateIncomeSource({
    required String incomeSourceId,
    required SettleoraManualIncomeSourceDraft draft,
  }) async {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraManualIncomeSource> archiveIncomeSource(
    String incomeSourceId,
  ) {
    throw UnimplementedError();
  }
}
