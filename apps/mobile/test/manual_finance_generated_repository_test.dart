import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/settleora_api_client.dart';
import 'package:mobile/manual_finance/generated_manual_finance_repository.dart';
import 'package:mobile/manual_finance/manual_finance_repository.dart';
import 'package:settleora_api_client/settleora_api.dart' as api;

void main() {
  group('GeneratedSettleoraManualFinanceRepository', () {
    test('requires a session before calling generated client', () async {
      final client = FakeManualFinanceGeneratedClient();
      final repository = GeneratedSettleoraManualFinanceRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider(null),
      );

      final failure = await captureManualFinanceFailure(
        () => repository.listAccounts(),
      );

      expect(failure.kind, SettleoraManualFinanceFailureKind.sessionRequired);
      expect(client.listAccountCalls, 0);
    });

    test('maps list responses into mobile models', () async {
      final client = FakeManualFinanceGeneratedClient();
      final repository = GeneratedSettleoraManualFinanceRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider(' redacted '),
      );

      final accounts = await repository.listAccounts(includeArchived: true);
      final income = await repository.listIncomeSources(includeArchived: true);

      expect(accounts.single.displayName, 'Cash Wallet');
      expect(accounts.single.currentBalanceAmount, '123.45');
      expect(accounts.single.currency, 'HKD');
      expect(accounts.single.isArchived, isFalse);
      expect(income.single.displayName, 'Salary');
      expect(income.single.amount, '5000.00');
      expect(income.single.manualFinancialAccountId, _accountId);
      expect(client.lastIncludeArchivedAccounts, isTrue);
      expect(client.lastIncludeArchivedIncome, isTrue);
      expect(client.accessTokens, ['redacted', 'redacted']);
    });

    test(
      'maps summary endpoint and warning flags into mobile models',
      () async {
        final client = FakeManualFinanceGeneratedClient();
        final repository = GeneratedSettleoraManualFinanceRepository(
          client: client,
          accessTokenProvider: FakeAccessTokenProvider(' redacted '),
        );

        final summary = await repository.getSummary(
          windowStartDate: ' 2026-06-18 ',
          windowEndDate: ' 2026-08-17 ',
        );

        expect(summary.windowStartDate, '2026-06-18');
        expect(summary.windowEndDate, '2026-08-17');
        expect(summary.warnings, contains('doesNotIncludeBankSync'));
        expect(summary.warnings, contains('groupFutureBillsNotIncluded'));
        expect(summary.warnings, contains('groupRecurringBillsNotIncluded'));
        expect(
          summary.warnings,
          contains('includesSafeRecurringManualIncomeInWindow'),
        );
        expect(summary.currencies.single.currency, 'HKD');
        expect(
          summary.currencies.single.activeManualAccountBalanceTotal,
          '123.45',
        );
        expect(summary.currencies.single.expectedManualIncomeTotal, '5000.00');
        expect(
          summary.currencies.single.recurringExpectedManualIncomeTotal,
          '1000.00',
        );
        expect(
          summary.currencies.single.upcomingOneTimeFutureBillObligationTotal,
          '250.00',
        );
        expect(
          summary.currencies.single.recurringObligationEstimateTotal,
          '500.00',
        );
        expect(summary.currencies.single.estimatedAvailableAmount, '5373.45');
        expect(
          summary.currencies.single.warnings,
          contains('includesPersonalRecurringBillProjectionInWindow'),
        );
        expect(
          summary.currencies.single.warnings,
          contains('groupRecurringBillsNotIncluded'),
        );
        expect(client.lastSummaryWindowStartDate, '2026-06-18');
        expect(client.lastSummaryWindowEndDate, '2026-08-17');
        expect(client.accessTokens, ['redacted']);
      },
    );

    test('creates, updates, and archives manual account and income', () async {
      final client = FakeManualFinanceGeneratedClient();
      final repository = GeneratedSettleoraManualFinanceRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      await repository.createAccount(
        const SettleoraManualFinancialAccountDraft(
          displayName: ' Cash ',
          accountType: SettleoraManualFinancialAccountTypeValues.cash,
          currentBalanceAmount: ' 10.00 ',
          currency: ' hkd ',
          balanceAsOfDate: ' 2026-06-18 ',
          note: ' Pocket ',
        ),
      );
      await repository.updateAccount(
        accountId: ' $_accountId ',
        draft: const SettleoraManualFinancialAccountDraft(
          displayName: ' Bank ',
          accountType: SettleoraManualFinancialAccountTypeValues.bankAccount,
          currentBalanceAmount: '-5.00',
          currency: 'USD',
          balanceAsOfDate: '2026-06-17',
          note: null,
        ),
      );
      await repository.archiveAccount(' $_accountId ');
      await repository.createIncomeSource(
        const SettleoraManualIncomeSourceDraft(
          displayName: ' Pay ',
          amount: ' 100.00 ',
          currency: ' usd ',
          cadence: SettleoraManualIncomeCadenceValues.monthly,
          nextExpectedDate: ' 2026-06-30 ',
          endDate: null,
          manualFinancialAccountId: ' account-1 ',
          note: ' Expected ',
        ),
      );
      await repository.updateIncomeSource(
        incomeSourceId: ' $_incomeId ',
        draft: const SettleoraManualIncomeSourceDraft(
          displayName: ' Bonus ',
          amount: ' 20.00 ',
          currency: 'HKD',
          cadence: SettleoraManualIncomeCadenceValues.oneTime,
          nextExpectedDate: '2026-07-01',
          endDate: '2026-07-01',
          manualFinancialAccountId: null,
          note: null,
        ),
      );
      await repository.archiveIncomeSource(' $_incomeId ');

      expect(client.createAccountCalls, 1);
      expect(client.updateAccountCalls, 1);
      expect(client.archiveAccountCalls, 1);
      expect(client.createIncomeCalls, 1);
      expect(client.updateIncomeCalls, 1);
      expect(client.archiveIncomeCalls, 1);
      expect(client.lastAccountId, _accountId);
      expect(client.lastIncomeId, _incomeId);
      expect(client.lastCreateAccount?.displayName, 'Cash');
      expect(client.lastCreateAccount?.currency, 'HKD');
      expect(client.lastUpdateAccount?.currentBalanceAmount, '-5.00');
      expect(client.lastCreateIncome?.manualFinancialAccountId, 'account-1');
      expect(client.lastUpdateIncome?.manualFinancialAccountId, isNull);
    });

    test('maps generated API errors to bounded failure kinds', () async {
      final client = FakeManualFinanceGeneratedClient(
        listAccountError: const api.SettleoraApiException(403, 'Denied', null),
      );
      final repository = GeneratedSettleoraManualFinanceRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      final failure = await captureManualFinanceFailure(
        () => repository.listAccounts(),
      );

      expect(failure.kind, SettleoraManualFinanceFailureKind.denied);
      expect(failure.statusCode, 403);
      expect(failure.message, contains('access'));
    });
  });
}

Future<SettleoraManualFinanceFailure> captureManualFinanceFailure(
  Future<void> Function() action,
) async {
  try {
    await action();
  } catch (error) {
    return SettleoraManualFinanceFailure.from(error);
  }

  fail('Expected SettleoraManualFinanceFailure');
}

class FakeAccessTokenProvider implements SettleoraAccessTokenProvider {
  FakeAccessTokenProvider(this._accessToken);

  final String? _accessToken;

  @override
  Future<String?> accessToken() async => _accessToken;
}

class FakeManualFinanceGeneratedClient
    implements SettleoraManualFinanceGeneratedClient {
  FakeManualFinanceGeneratedClient({this.listAccountError});

  final Object? listAccountError;
  final accessTokens = <String>[];
  int listAccountCalls = 0;
  int getSummaryCalls = 0;
  int createAccountCalls = 0;
  int updateAccountCalls = 0;
  int archiveAccountCalls = 0;
  int listIncomeCalls = 0;
  int createIncomeCalls = 0;
  int updateIncomeCalls = 0;
  int archiveIncomeCalls = 0;
  bool? lastIncludeArchivedAccounts;
  bool? lastIncludeArchivedIncome;
  String? lastSummaryWindowStartDate;
  String? lastSummaryWindowEndDate;
  String? lastAccountId;
  String? lastIncomeId;
  api.CreateManualFinancialAccountRequest? lastCreateAccount;
  api.UpdateManualFinancialAccountRequest? lastUpdateAccount;
  api.CreateManualIncomeSourceRequest? lastCreateIncome;
  api.UpdateManualIncomeSourceRequest? lastUpdateIncome;

  @override
  Future<api.ManualFinanceSummaryResponse> getManualFinanceSummary({
    String? windowStartDate,
    String? windowEndDate,
    required String accessToken,
  }) async {
    getSummaryCalls += 1;
    accessTokens.add(accessToken);
    lastSummaryWindowStartDate = windowStartDate;
    lastSummaryWindowEndDate = windowEndDate;
    return sampleSummary(
      windowStartDate: windowStartDate ?? '2026-06-18',
      windowEndDate: windowEndDate ?? '2026-08-17',
    );
  }

  @override
  Future<api.ManualFinancialAccountListResponse> listManualFinancialAccounts({
    bool? includeArchived,
    required String accessToken,
  }) async {
    listAccountCalls += 1;
    accessTokens.add(accessToken);
    lastIncludeArchivedAccounts = includeArchived;
    final error = listAccountError;
    if (error != null) {
      throw error;
    }
    return api.ManualFinancialAccountListResponse(accounts: [sampleAccount()]);
  }

  @override
  Future<api.ManualFinancialAccountResponse> createManualFinancialAccount(
    api.CreateManualFinancialAccountRequest body, {
    required String accessToken,
  }) async {
    createAccountCalls += 1;
    accessTokens.add(accessToken);
    lastCreateAccount = body;
    return sampleAccount(displayName: body.displayName);
  }

  @override
  Future<api.ManualFinancialAccountResponse> updateManualFinancialAccount(
    String accountId,
    api.UpdateManualFinancialAccountRequest body, {
    required String accessToken,
  }) async {
    updateAccountCalls += 1;
    accessTokens.add(accessToken);
    lastAccountId = accountId;
    lastUpdateAccount = body;
    return sampleAccount(displayName: body.displayName ?? 'Updated');
  }

  @override
  Future<api.ManualFinancialAccountResponse> archiveManualFinancialAccount(
    String accountId, {
    required String accessToken,
  }) async {
    archiveAccountCalls += 1;
    accessTokens.add(accessToken);
    lastAccountId = accountId;
    return sampleAccount(
      status: api.ManualFinancialAccountStatusValues.archived,
    );
  }

  @override
  Future<api.ManualIncomeSourceListResponse> listManualIncomeSources({
    bool? includeArchived,
    required String accessToken,
  }) async {
    listIncomeCalls += 1;
    accessTokens.add(accessToken);
    lastIncludeArchivedIncome = includeArchived;
    return api.ManualIncomeSourceListResponse(incomeSources: [sampleIncome()]);
  }

  @override
  Future<api.ManualIncomeSourceResponse> createManualIncomeSource(
    api.CreateManualIncomeSourceRequest body, {
    required String accessToken,
  }) async {
    createIncomeCalls += 1;
    accessTokens.add(accessToken);
    lastCreateIncome = body;
    return sampleIncome(displayName: body.displayName);
  }

  @override
  Future<api.ManualIncomeSourceResponse> updateManualIncomeSource(
    String incomeSourceId,
    api.UpdateManualIncomeSourceRequest body, {
    required String accessToken,
  }) async {
    updateIncomeCalls += 1;
    accessTokens.add(accessToken);
    lastIncomeId = incomeSourceId;
    lastUpdateIncome = body;
    return sampleIncome(displayName: body.displayName);
  }

  @override
  Future<api.ManualIncomeSourceResponse> archiveManualIncomeSource(
    String incomeSourceId, {
    required String accessToken,
  }) async {
    archiveIncomeCalls += 1;
    accessTokens.add(accessToken);
    lastIncomeId = incomeSourceId;
    return sampleIncome(status: api.ManualIncomeSourceStatusValues.archived);
  }
}

api.ManualFinancialAccountResponse sampleAccount({
  String displayName = 'Cash Wallet',
  String status = api.ManualFinancialAccountStatusValues.active,
}) {
  return api.ManualFinancialAccountResponse(
    id: _accountId,
    displayName: displayName,
    accountType: api.ManualFinancialAccountTypeValues.cash,
    currentBalanceAmount: '123.45',
    currency: 'HKD',
    balanceAsOfDate: '2026-06-18',
    note: 'Manual note',
    status: status,
    createdAtUtc: DateTime.utc(2026, 6, 18),
    updatedAtUtc: DateTime.utc(2026, 6, 18, 1),
    archivedAtUtc: status == api.ManualFinancialAccountStatusValues.archived
        ? DateTime.utc(2026, 6, 19)
        : null,
  );
}

api.ManualIncomeSourceResponse sampleIncome({
  String displayName = 'Salary',
  String status = api.ManualIncomeSourceStatusValues.active,
}) {
  return api.ManualIncomeSourceResponse(
    id: _incomeId,
    displayName: displayName,
    amount: '5000.00',
    currency: 'HKD',
    cadence: api.ManualIncomeCadenceValues.monthly,
    nextExpectedDate: '2026-06-30',
    endDate: null,
    manualFinancialAccountId: _accountId,
    note: 'Expected',
    status: status,
    createdAtUtc: DateTime.utc(2026, 6, 18),
    updatedAtUtc: DateTime.utc(2026, 6, 18, 1),
    archivedAtUtc: status == api.ManualIncomeSourceStatusValues.archived
        ? DateTime.utc(2026, 6, 19)
        : null,
  );
}

api.ManualFinanceSummaryResponse sampleSummary({
  String windowStartDate = '2026-06-18',
  String windowEndDate = '2026-08-17',
}) {
  return api.ManualFinanceSummaryResponse(
    asOfUtc: DateTime.utc(2026, 6, 18, 1),
    windowStartDate: windowStartDate,
    windowEndDate: windowEndDate,
    currencies: const [
      api.ManualFinanceSummaryCurrencyRow(
        currency: 'HKD',
        activeManualAccountBalanceTotal: '123.45',
        expectedManualIncomeTotal: '5000.00',
        recurringExpectedManualIncomeTotal: '1000.00',
        upcomingOneTimeFutureBillObligationTotal: '250.00',
        recurringObligationEstimateTotal: '500.00',
        estimatedAvailableAmount: '5373.45',
        warnings: [
          'doesNotConvertCurrency',
          'includesSafeRecurringManualIncomeInWindow',
          'includesPersonalRecurringBillProjectionInWindow',
          'groupFutureBillsNotIncluded',
          'groupRecurringBillsNotIncluded',
        ],
      ),
    ],
    warnings: const [
      'doesNotIncludeBankSync',
      'doesNotConvertCurrency',
      'includesSafeRecurringManualIncomeInWindow',
      'includesPersonalRecurringBillProjectionInWindow',
      'groupFutureBillsNotIncluded',
      'groupRecurringBillsNotIncluded',
    ],
  );
}

const _accountId = 'account-1';
const _incomeId = 'income-1';
