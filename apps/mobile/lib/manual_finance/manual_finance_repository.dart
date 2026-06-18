typedef SettleoraManualFinancialAccountType = String;
typedef SettleoraManualFinancialAccountStatus = String;
typedef SettleoraManualIncomeCadence = String;
typedef SettleoraManualIncomeSourceStatus = String;

class SettleoraManualFinancialAccountTypeValues {
  const SettleoraManualFinancialAccountTypeValues._();

  static const cash = 'cash';
  static const bankAccount = 'bank_account';
  static const storedValue = 'stored_value';
  static const other = 'other';
  static const values = <String>{cash, bankAccount, storedValue, other};
}

class SettleoraManualFinancialAccountStatusValues {
  const SettleoraManualFinancialAccountStatusValues._();

  static const active = 'active';
  static const archived = 'archived';
}

class SettleoraManualIncomeCadenceValues {
  const SettleoraManualIncomeCadenceValues._();

  static const oneTime = 'one_time';
  static const weekly = 'weekly';
  static const biweekly = 'biweekly';
  static const monthly = 'monthly';
  static const quarterly = 'quarterly';
  static const yearly = 'yearly';
  static const values = <String>{
    oneTime,
    weekly,
    biweekly,
    monthly,
    quarterly,
    yearly,
  };
}

class SettleoraManualIncomeSourceStatusValues {
  const SettleoraManualIncomeSourceStatusValues._();

  static const active = 'active';
  static const archived = 'archived';
}

enum SettleoraManualFinanceFailureKind {
  sessionRequired,
  sessionExpired,
  denied,
  unavailable,
  conflict,
  validation,
  network,
  server,
}

class SettleoraManualFinanceFailure implements Exception {
  const SettleoraManualFinanceFailure({
    required this.kind,
    required this.message,
    this.statusCode,
  });

  factory SettleoraManualFinanceFailure.from(Object error) {
    if (error is SettleoraManualFinanceFailure) {
      return error;
    }

    return const SettleoraManualFinanceFailure(
      kind: SettleoraManualFinanceFailureKind.network,
      message:
          'Manual accounts and income are unavailable. Try again when the server is reachable.',
    );
  }

  final SettleoraManualFinanceFailureKind kind;
  final String message;
  final int? statusCode;

  String get title {
    return switch (kind) {
      SettleoraManualFinanceFailureKind.sessionRequired => 'Sign in required',
      SettleoraManualFinanceFailureKind.sessionExpired => 'Sign in again',
      SettleoraManualFinanceFailureKind.denied =>
        'Accounts and income unavailable',
      SettleoraManualFinanceFailureKind.unavailable =>
        'Manual finance record unavailable',
      SettleoraManualFinanceFailureKind.conflict => 'Needs refresh',
      SettleoraManualFinanceFailureKind.validation => 'Unsupported request',
      SettleoraManualFinanceFailureKind.network => 'Server unavailable',
      SettleoraManualFinanceFailureKind.server =>
        'Accounts and income unavailable',
    };
  }

  @override
  String toString() {
    return 'SettleoraManualFinanceFailure($kind, statusCode: $statusCode)';
  }
}

class SettleoraManualFinancialAccount {
  const SettleoraManualFinancialAccount({
    required this.id,
    required this.displayName,
    required this.accountType,
    required this.currentBalanceAmount,
    required this.currency,
    required this.balanceAsOfDate,
    required this.note,
    required this.status,
    required this.createdAtUtc,
    required this.updatedAtUtc,
    required this.archivedAtUtc,
  });

  final String id;
  final String displayName;
  final SettleoraManualFinancialAccountType accountType;
  final String currentBalanceAmount;
  final String currency;
  final String balanceAsOfDate;
  final String? note;
  final SettleoraManualFinancialAccountStatus status;
  final DateTime createdAtUtc;
  final DateTime updatedAtUtc;
  final DateTime? archivedAtUtc;

  bool get isArchived =>
      status == SettleoraManualFinancialAccountStatusValues.archived ||
      archivedAtUtc != null;
}

class SettleoraManualIncomeSource {
  const SettleoraManualIncomeSource({
    required this.id,
    required this.displayName,
    required this.amount,
    required this.currency,
    required this.cadence,
    required this.nextExpectedDate,
    required this.endDate,
    required this.manualFinancialAccountId,
    required this.note,
    required this.status,
    required this.createdAtUtc,
    required this.updatedAtUtc,
    required this.archivedAtUtc,
  });

  final String id;
  final String displayName;
  final String amount;
  final String currency;
  final SettleoraManualIncomeCadence cadence;
  final String nextExpectedDate;
  final String? endDate;
  final String? manualFinancialAccountId;
  final String? note;
  final SettleoraManualIncomeSourceStatus status;
  final DateTime createdAtUtc;
  final DateTime updatedAtUtc;
  final DateTime? archivedAtUtc;

  bool get isArchived =>
      status == SettleoraManualIncomeSourceStatusValues.archived ||
      archivedAtUtc != null;
}

class SettleoraManualFinanceSummary {
  const SettleoraManualFinanceSummary({
    required this.asOfUtc,
    required this.windowStartDate,
    required this.windowEndDate,
    required this.currencies,
    required this.warnings,
  });

  final DateTime asOfUtc;
  final String windowStartDate;
  final String windowEndDate;
  final List<SettleoraManualFinanceSummaryCurrencyRow> currencies;
  final List<String> warnings;
}

class SettleoraManualFinanceSummaryCurrencyRow {
  const SettleoraManualFinanceSummaryCurrencyRow({
    required this.currency,
    required this.activeManualAccountBalanceTotal,
    required this.expectedManualIncomeTotal,
    required this.recurringExpectedManualIncomeTotal,
    required this.upcomingOneTimeFutureBillObligationTotal,
    required this.recurringObligationEstimateTotal,
    required this.estimatedAvailableAmount,
    required this.warnings,
  });

  final String currency;
  final String activeManualAccountBalanceTotal;
  final String expectedManualIncomeTotal;
  final String recurringExpectedManualIncomeTotal;
  final String upcomingOneTimeFutureBillObligationTotal;
  final String recurringObligationEstimateTotal;
  final String estimatedAvailableAmount;
  final List<String> warnings;
}

class SettleoraManualFinancialAccountDraft {
  const SettleoraManualFinancialAccountDraft({
    required this.displayName,
    required this.accountType,
    required this.currentBalanceAmount,
    required this.currency,
    required this.balanceAsOfDate,
    required this.note,
  });

  final String displayName;
  final SettleoraManualFinancialAccountType accountType;
  final String currentBalanceAmount;
  final String currency;
  final String balanceAsOfDate;
  final String? note;
}

class SettleoraManualIncomeSourceDraft {
  const SettleoraManualIncomeSourceDraft({
    required this.displayName,
    required this.amount,
    required this.currency,
    required this.cadence,
    required this.nextExpectedDate,
    required this.endDate,
    required this.manualFinancialAccountId,
    required this.note,
  });

  final String displayName;
  final String amount;
  final String currency;
  final SettleoraManualIncomeCadence cadence;
  final String nextExpectedDate;
  final String? endDate;
  final String? manualFinancialAccountId;
  final String? note;
}

abstract interface class SettleoraManualFinanceRepository {
  Future<SettleoraManualFinanceSummary> getSummary({
    String? windowStartDate,
    String? windowEndDate,
  });

  Future<List<SettleoraManualFinancialAccount>> listAccounts({
    bool includeArchived = false,
  });

  Future<SettleoraManualFinancialAccount> createAccount(
    SettleoraManualFinancialAccountDraft draft,
  );

  Future<SettleoraManualFinancialAccount> updateAccount({
    required String accountId,
    required SettleoraManualFinancialAccountDraft draft,
  });

  Future<SettleoraManualFinancialAccount> archiveAccount(String accountId);

  Future<List<SettleoraManualIncomeSource>> listIncomeSources({
    bool includeArchived = false,
  });

  Future<SettleoraManualIncomeSource> createIncomeSource(
    SettleoraManualIncomeSourceDraft draft,
  );

  Future<SettleoraManualIncomeSource> updateIncomeSource({
    required String incomeSourceId,
    required SettleoraManualIncomeSourceDraft draft,
  });

  Future<SettleoraManualIncomeSource> archiveIncomeSource(
    String incomeSourceId,
  );
}

String settleoraManualAccountTypeLabel(
  SettleoraManualFinancialAccountType type,
) {
  return switch (type) {
    SettleoraManualFinancialAccountTypeValues.cash => 'Cash',
    SettleoraManualFinancialAccountTypeValues.bankAccount => 'Bank account',
    SettleoraManualFinancialAccountTypeValues.storedValue => 'Stored value',
    SettleoraManualFinancialAccountTypeValues.other => 'Other',
    _ => _labelFromToken(type),
  };
}

String settleoraManualIncomeCadenceLabel(SettleoraManualIncomeCadence cadence) {
  return switch (cadence) {
    SettleoraManualIncomeCadenceValues.oneTime => 'One time',
    SettleoraManualIncomeCadenceValues.weekly => 'Weekly',
    SettleoraManualIncomeCadenceValues.biweekly => 'Biweekly',
    SettleoraManualIncomeCadenceValues.monthly => 'Monthly',
    SettleoraManualIncomeCadenceValues.quarterly => 'Quarterly',
    SettleoraManualIncomeCadenceValues.yearly => 'Yearly',
    _ => _labelFromToken(cadence),
  };
}

String settleoraManualFinanceWarningLabel(String warning) {
  return switch (warning) {
    'doesNotIncludeBankSync' => 'No bank sync',
    'doesNotConvertCurrency' => 'No FX conversion',
    'includesSafeRecurringManualIncomeInWindow' =>
      'Recurring manual income included',
    'includesPersonalRecurringBillProjectionInWindow' =>
      'Personal recurring bills included',
    'recurringForecastNotIncluded' => 'Recurring forecast not included yet',
    'recurringManualIncomeForecastNotIncluded' =>
      'Recurring manual income forecast not included yet',
    'groupFutureBillsNotIncluded' => 'Group future bills not included yet',
    'groupRecurringBillsNotIncluded' =>
      'Group recurring bills not included yet',
    'includesOnlyActiveManualAccounts' =>
      'Only active manual accounts are included',
    'includesOnlyOneTimeManualIncomeInWindow' =>
      'Only one-time manual income in this window is included',
    'includesOnlyPersonalOneTimeFutureBillDraftsInWindow' =>
      'Only personal one-time future bills in this window are included',
    _ => _labelFromToken(warning),
  };
}

String _labelFromToken(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    return 'Unknown';
  }

  return trimmed
      .split('_')
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}
