import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/manual_finance/manual_finance_repository.dart';
import 'package:mobile/manual_finance/manual_finance_screen.dart';

void main() {
  testWidgets('lists manual account and income data with explanatory copy', (
    tester,
  ) async {
    final repository = FakeManualFinanceRepository();

    await pumpScreen(tester, repository);

    expect(find.text('Accounts & income'), findsOneWidget);
    expect(find.text('Cash Wallet'), findsOneWidget);
    expect(find.text('123.45 HKD'), findsOneWidget);
    expect(find.text('Salary'), findsOneWidget);
    expect(find.text('5000.00 HKD'), findsOneWidget);
    expect(find.textContaining('not bank sync'), findsOneWidget);
    expect(find.textContaining('payroll sync'), findsOneWidget);
    expect(find.textContaining('available-spend math'), findsOneWidget);
    expect(
      find.textContaining('Manual balance totals: 123.45 HKD'),
      findsOneWidget,
    );
  });

  testWidgets('creates account and income source', (tester) async {
    final repository = FakeManualFinanceRepository(
      accounts: const [],
      incomeSources: const [],
    );

    await pumpScreen(tester, repository);

    await tester.tap(find.byKey(const Key('manual-finance-add-account')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('manual-account-name')),
      'Bank',
    );
    await tester.enterText(
      find.byKey(const Key('manual-account-balance')),
      '50.00',
    );
    await tester.enterText(
      find.byKey(const Key('manual-account-as-of')),
      '2026-06-18',
    );
    await tester.ensureVisible(
      find.byKey(const Key('manual-finance-save-account')),
    );
    await tester.tap(find.byKey(const Key('manual-finance-save-account')));
    await tester.pumpAndSettle();

    expect(repository.createAccountCalls, 1);
    expect(repository.createdAccountDraft?.displayName, 'Bank');
    expect(find.text('Bank'), findsOneWidget);

    await tester.tap(find.byKey(const Key('manual-finance-add-income')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('manual-income-name')),
      'Bonus',
    );
    await tester.enterText(
      find.byKey(const Key('manual-income-amount')),
      '200.00',
    );
    await tester.enterText(
      find.byKey(const Key('manual-income-next-date')),
      '2026-06-30',
    );
    await tester.ensureVisible(
      find.byKey(const Key('manual-finance-save-income')),
    );
    await tester.tap(find.byKey(const Key('manual-finance-save-income')));
    await tester.pumpAndSettle();

    expect(repository.createIncomeCalls, 1);
    expect(repository.createdIncomeDraft?.displayName, 'Bonus');
    expect(find.text('Bonus'), findsOneWidget);
  });

  testWidgets('edits supported account and income fields', (tester) async {
    final repository = FakeManualFinanceRepository();

    await pumpScreen(tester, repository);

    await tester.tap(find.byKey(const Key('manual-finance-edit-account-0')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('manual-account-name')),
      'Main cash',
    );
    await tester.ensureVisible(
      find.byKey(const Key('manual-finance-save-account')),
    );
    await tester.tap(find.byKey(const Key('manual-finance-save-account')));
    await tester.pumpAndSettle();

    expect(repository.updateAccountCalls, 1);
    expect(repository.updatedAccountDraft?.displayName, 'Main cash');
    expect(find.text('Main cash'), findsOneWidget);

    await tester.ensureVisible(
      find.byKey(const Key('manual-finance-edit-income-0')),
    );
    final incomeEditTopLeft = tester.getTopLeft(
      find.byKey(const Key('manual-finance-edit-income-0')),
    );
    await tester.tapAt(incomeEditTopLeft + const Offset(20, 20));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('manual-income-name')),
      'Main salary',
    );
    await tester.ensureVisible(
      find.byKey(const Key('manual-finance-save-income')),
    );
    await tester.tap(find.byKey(const Key('manual-finance-save-income')));
    await tester.pumpAndSettle();

    expect(repository.updateIncomeCalls, 1);
    expect(repository.updatedIncomeDraft?.displayName, 'Main salary');
    expect(find.text('Main salary'), findsOneWidget);
  });

  testWidgets('archives account and income source', (tester) async {
    final repository = FakeManualFinanceRepository();

    await pumpScreen(tester, repository);

    await tester.tap(find.byKey(const Key('manual-finance-archive-account-0')));
    await tester.pumpAndSettle();
    expect(find.text('Archive manual account?'), findsOneWidget);
    await tester.tap(find.byKey(const Key('manual-finance-archive-confirm')));
    await tester.pumpAndSettle();

    expect(repository.archiveAccountCalls, 1);
    expect(find.text('Cash Wallet'), findsNothing);

    await tester.tap(find.byKey(const Key('manual-finance-archive-income-0')));
    await tester.pumpAndSettle();
    expect(find.text('Archive income source?'), findsOneWidget);
    await tester.tap(find.byKey(const Key('manual-finance-archive-confirm')));
    await tester.pumpAndSettle();

    expect(repository.archiveIncomeCalls, 1);
    expect(find.text('Salary'), findsNothing);
  });

  testWidgets('shows bounded failure copy', (tester) async {
    final repository = FakeManualFinanceRepository(
      listFailure: const SettleoraManualFinanceFailure(
        kind: SettleoraManualFinanceFailureKind.network,
        message: 'Manual accounts and income are unavailable.',
      ),
    );

    await pumpScreen(tester, repository);

    expect(find.text('Server unavailable'), findsOneWidget);
    expect(
      find.text('Manual accounts and income are unavailable.'),
      findsOneWidget,
    );
    expect(find.byKey(const Key('manual-finance-retry')), findsOneWidget);
  });
}

Future<void> pumpScreen(
  WidgetTester tester,
  FakeManualFinanceRepository repository,
) async {
  await tester.pumpWidget(
    MaterialApp(
      home: SettleoraManualFinanceScreen(
        repository: repository,
        defaultCurrency: 'HKD',
      ),
    ),
  );
  await tester.pumpAndSettle();
}

class FakeManualFinanceRepository implements SettleoraManualFinanceRepository {
  FakeManualFinanceRepository({
    List<SettleoraManualFinancialAccount>? accounts,
    List<SettleoraManualIncomeSource>? incomeSources,
    this.listFailure,
  }) : accounts = [...?accounts, if (accounts == null) sampleAccount()],
       incomeSources = [
         ...?incomeSources,
         if (incomeSources == null) sampleIncome(),
       ];

  final List<SettleoraManualFinancialAccount> accounts;
  final List<SettleoraManualIncomeSource> incomeSources;
  final Object? listFailure;
  int createAccountCalls = 0;
  int updateAccountCalls = 0;
  int archiveAccountCalls = 0;
  int createIncomeCalls = 0;
  int updateIncomeCalls = 0;
  int archiveIncomeCalls = 0;
  SettleoraManualFinancialAccountDraft? createdAccountDraft;
  SettleoraManualFinancialAccountDraft? updatedAccountDraft;
  SettleoraManualIncomeSourceDraft? createdIncomeDraft;
  SettleoraManualIncomeSourceDraft? updatedIncomeDraft;

  @override
  Future<List<SettleoraManualFinancialAccount>> listAccounts({
    bool includeArchived = false,
  }) async {
    final failure = listFailure;
    if (failure != null) {
      throw failure;
    }
    return accounts
        .where((account) => includeArchived || !account.isArchived)
        .toList(growable: false);
  }

  @override
  Future<List<SettleoraManualIncomeSource>> listIncomeSources({
    bool includeArchived = false,
  }) async {
    final failure = listFailure;
    if (failure != null) {
      throw failure;
    }
    return incomeSources
        .where((income) => includeArchived || !income.isArchived)
        .toList(growable: false);
  }

  @override
  Future<SettleoraManualFinancialAccount> createAccount(
    SettleoraManualFinancialAccountDraft draft,
  ) async {
    createAccountCalls += 1;
    createdAccountDraft = draft;
    final account = sampleAccount(
      id: 'account-created',
      displayName: draft.displayName,
    );
    accounts.add(account);
    return account;
  }

  @override
  Future<SettleoraManualFinancialAccount> updateAccount({
    required String accountId,
    required SettleoraManualFinancialAccountDraft draft,
  }) async {
    updateAccountCalls += 1;
    updatedAccountDraft = draft;
    final index = accounts.indexWhere((account) => account.id == accountId);
    final account = sampleAccount(
      id: accountId,
      displayName: draft.displayName,
    );
    accounts[index] = account;
    return account;
  }

  @override
  Future<SettleoraManualFinancialAccount> archiveAccount(
    String accountId,
  ) async {
    archiveAccountCalls += 1;
    final index = accounts.indexWhere((account) => account.id == accountId);
    final archived = sampleAccount(
      id: accountId,
      displayName: accounts[index].displayName,
      status: SettleoraManualFinancialAccountStatusValues.archived,
      archivedAtUtc: DateTime.utc(2026, 6, 19),
    );
    accounts[index] = archived;
    return archived;
  }

  @override
  Future<SettleoraManualIncomeSource> createIncomeSource(
    SettleoraManualIncomeSourceDraft draft,
  ) async {
    createIncomeCalls += 1;
    createdIncomeDraft = draft;
    final income = sampleIncome(
      id: 'income-created',
      displayName: draft.displayName,
    );
    incomeSources.add(income);
    return income;
  }

  @override
  Future<SettleoraManualIncomeSource> updateIncomeSource({
    required String incomeSourceId,
    required SettleoraManualIncomeSourceDraft draft,
  }) async {
    updateIncomeCalls += 1;
    updatedIncomeDraft = draft;
    final index = incomeSources.indexWhere(
      (income) => income.id == incomeSourceId,
    );
    final income = sampleIncome(
      id: incomeSourceId,
      displayName: draft.displayName,
    );
    incomeSources[index] = income;
    return income;
  }

  @override
  Future<SettleoraManualIncomeSource> archiveIncomeSource(
    String incomeSourceId,
  ) async {
    archiveIncomeCalls += 1;
    final index = incomeSources.indexWhere(
      (income) => income.id == incomeSourceId,
    );
    final archived = sampleIncome(
      id: incomeSourceId,
      displayName: incomeSources[index].displayName,
      status: SettleoraManualIncomeSourceStatusValues.archived,
      archivedAtUtc: DateTime.utc(2026, 6, 19),
    );
    incomeSources[index] = archived;
    return archived;
  }
}

SettleoraManualFinancialAccount sampleAccount({
  String id = 'account-1',
  String displayName = 'Cash Wallet',
  String status = SettleoraManualFinancialAccountStatusValues.active,
  DateTime? archivedAtUtc,
}) {
  return SettleoraManualFinancialAccount(
    id: id,
    displayName: displayName,
    accountType: SettleoraManualFinancialAccountTypeValues.cash,
    currentBalanceAmount: '123.45',
    currency: 'HKD',
    balanceAsOfDate: '2026-06-18',
    note: null,
    status: status,
    createdAtUtc: DateTime.utc(2026, 6, 18),
    updatedAtUtc: DateTime.utc(2026, 6, 18, 1),
    archivedAtUtc: archivedAtUtc,
  );
}

SettleoraManualIncomeSource sampleIncome({
  String id = 'income-1',
  String displayName = 'Salary',
  String status = SettleoraManualIncomeSourceStatusValues.active,
  DateTime? archivedAtUtc,
}) {
  return SettleoraManualIncomeSource(
    id: id,
    displayName: displayName,
    amount: '5000.00',
    currency: 'HKD',
    cadence: SettleoraManualIncomeCadenceValues.monthly,
    nextExpectedDate: '2026-06-30',
    endDate: null,
    manualFinancialAccountId: 'account-1',
    note: null,
    status: status,
    createdAtUtc: DateTime.utc(2026, 6, 18),
    updatedAtUtc: DateTime.utc(2026, 6, 18, 1),
    archivedAtUtc: archivedAtUtc,
  );
}
