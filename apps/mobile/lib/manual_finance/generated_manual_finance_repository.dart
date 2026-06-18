import 'dart:async';
import 'dart:io';

import 'package:settleora_api_client/settleora_api.dart' as api;

import '../api/settleora_api_client.dart';
import 'manual_finance_repository.dart';

abstract interface class SettleoraManualFinanceGeneratedClient {
  Future<api.ManualFinanceSummaryResponse> getManualFinanceSummary({
    String? windowStartDate,
    String? windowEndDate,
    required String accessToken,
  });

  Future<api.ManualFinancialAccountListResponse> listManualFinancialAccounts({
    bool? includeArchived,
    required String accessToken,
  });

  Future<api.ManualFinancialAccountResponse> createManualFinancialAccount(
    api.CreateManualFinancialAccountRequest body, {
    required String accessToken,
  });

  Future<api.ManualFinancialAccountResponse> updateManualFinancialAccount(
    String accountId,
    api.UpdateManualFinancialAccountRequest body, {
    required String accessToken,
  });

  Future<api.ManualFinancialAccountResponse> archiveManualFinancialAccount(
    String accountId, {
    required String accessToken,
  });

  Future<api.ManualIncomeSourceListResponse> listManualIncomeSources({
    bool? includeArchived,
    required String accessToken,
  });

  Future<api.ManualIncomeSourceResponse> createManualIncomeSource(
    api.CreateManualIncomeSourceRequest body, {
    required String accessToken,
  });

  Future<api.ManualIncomeSourceResponse> updateManualIncomeSource(
    String incomeSourceId,
    api.UpdateManualIncomeSourceRequest body, {
    required String accessToken,
  });

  Future<api.ManualIncomeSourceResponse> archiveManualIncomeSource(
    String incomeSourceId, {
    required String accessToken,
  });
}

class SettleoraGeneratedManualFinanceClient
    implements SettleoraManualFinanceGeneratedClient {
  const SettleoraGeneratedManualFinanceClient(this._client);

  final api.SettleoraApiClient _client;

  @override
  Future<api.ManualFinanceSummaryResponse> getManualFinanceSummary({
    String? windowStartDate,
    String? windowEndDate,
    required String accessToken,
  }) {
    return _client.getManualFinanceSummary(
      windowStartDate: windowStartDate,
      windowEndDate: windowEndDate,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.ManualFinancialAccountListResponse> listManualFinancialAccounts({
    bool? includeArchived,
    required String accessToken,
  }) {
    return _client.listManualFinancialAccounts(
      includeArchived: includeArchived,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.ManualFinancialAccountResponse> createManualFinancialAccount(
    api.CreateManualFinancialAccountRequest body, {
    required String accessToken,
  }) {
    return _client.createManualFinancialAccount(body, accessToken: accessToken);
  }

  @override
  Future<api.ManualFinancialAccountResponse> updateManualFinancialAccount(
    String accountId,
    api.UpdateManualFinancialAccountRequest body, {
    required String accessToken,
  }) {
    return _client.updateManualFinancialAccount(
      accountId,
      body,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.ManualFinancialAccountResponse> archiveManualFinancialAccount(
    String accountId, {
    required String accessToken,
  }) {
    return _client.archiveManualFinancialAccount(
      accountId,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.ManualIncomeSourceListResponse> listManualIncomeSources({
    bool? includeArchived,
    required String accessToken,
  }) {
    return _client.listManualIncomeSources(
      includeArchived: includeArchived,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.ManualIncomeSourceResponse> createManualIncomeSource(
    api.CreateManualIncomeSourceRequest body, {
    required String accessToken,
  }) {
    return _client.createManualIncomeSource(body, accessToken: accessToken);
  }

  @override
  Future<api.ManualIncomeSourceResponse> updateManualIncomeSource(
    String incomeSourceId,
    api.UpdateManualIncomeSourceRequest body, {
    required String accessToken,
  }) {
    return _client.updateManualIncomeSource(
      incomeSourceId,
      body,
      accessToken: accessToken,
    );
  }

  @override
  Future<api.ManualIncomeSourceResponse> archiveManualIncomeSource(
    String incomeSourceId, {
    required String accessToken,
  }) {
    return _client.archiveManualIncomeSource(
      incomeSourceId,
      accessToken: accessToken,
    );
  }
}

class GeneratedSettleoraManualFinanceRepository
    implements SettleoraManualFinanceRepository {
  GeneratedSettleoraManualFinanceRepository({
    required SettleoraManualFinanceGeneratedClient client,
    required SettleoraAccessTokenProvider accessTokenProvider,
  }) : _client = client,
       _accessTokenProvider = accessTokenProvider;

  factory GeneratedSettleoraManualFinanceRepository.fromConfiguration({
    required SettleoraApiConfiguration configuration,
    required SettleoraAccessTokenProvider accessTokenProvider,
    SettleoraGeneratedApiClientFactory clientFactory =
        const SettleoraGeneratedApiClientFactory(),
  }) {
    return GeneratedSettleoraManualFinanceRepository(
      client: SettleoraGeneratedManualFinanceClient(
        clientFactory.create(configuration),
      ),
      accessTokenProvider: accessTokenProvider,
    );
  }

  final SettleoraManualFinanceGeneratedClient _client;
  final SettleoraAccessTokenProvider _accessTokenProvider;

  @override
  Future<SettleoraManualFinanceSummary> getSummary({
    String? windowStartDate,
    String? windowEndDate,
  }) {
    return _withAccessToken((accessToken) async {
      try {
        return _mapSummary(
          await _client.getManualFinanceSummary(
            windowStartDate: _optionalIsoDate(windowStartDate),
            windowEndDate: _optionalIsoDate(windowEndDate),
            accessToken: accessToken,
          ),
        );
      } on SettleoraManualFinanceFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<List<SettleoraManualFinancialAccount>> listAccounts({
    bool includeArchived = false,
  }) {
    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.listManualFinancialAccounts(
          includeArchived: includeArchived,
          accessToken: accessToken,
        );
        return response.accounts.map(_mapAccount).toList(growable: false);
      } on SettleoraManualFinanceFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraManualFinancialAccount> createAccount(
    SettleoraManualFinancialAccountDraft draft,
  ) {
    final request = api.CreateManualFinancialAccountRequest(
      displayName: _requiredText(draft.displayName, 'Enter an account name.'),
      accountType: _requiredAccountType(draft.accountType),
      currentBalanceAmount: _requiredDecimal(
        draft.currentBalanceAmount,
        'Enter the current manual balance.',
      ),
      currency: _requiredCurrency(draft.currency),
      balanceAsOfDate: _requiredIsoDate(draft.balanceAsOfDate),
      note: _optionalText(draft.note),
    );

    return _withAccessToken((accessToken) async {
      try {
        return _mapAccount(
          await _client.createManualFinancialAccount(
            request,
            accessToken: accessToken,
          ),
        );
      } on SettleoraManualFinanceFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraManualFinancialAccount> updateAccount({
    required String accountId,
    required SettleoraManualFinancialAccountDraft draft,
  }) {
    final trimmedId = _requiredId(
      accountId,
      'Choose a manual account before saving changes.',
    );
    final request = api.UpdateManualFinancialAccountRequest(
      displayName: _requiredText(draft.displayName, 'Enter an account name.'),
      accountType: _requiredAccountType(draft.accountType),
      currentBalanceAmount: _requiredDecimal(
        draft.currentBalanceAmount,
        'Enter the current manual balance.',
      ),
      currency: _requiredCurrency(draft.currency),
      balanceAsOfDate: _requiredIsoDate(draft.balanceAsOfDate),
      note: _optionalText(draft.note),
    );

    return _withAccessToken((accessToken) async {
      try {
        return _mapAccount(
          await _client.updateManualFinancialAccount(
            trimmedId,
            request,
            accessToken: accessToken,
          ),
        );
      } on SettleoraManualFinanceFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraManualFinancialAccount> archiveAccount(String accountId) {
    final trimmedId = _requiredId(
      accountId,
      'Choose a manual account before archiving it.',
    );

    return _withAccessToken((accessToken) async {
      try {
        return _mapAccount(
          await _client.archiveManualFinancialAccount(
            trimmedId,
            accessToken: accessToken,
          ),
        );
      } on SettleoraManualFinanceFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<List<SettleoraManualIncomeSource>> listIncomeSources({
    bool includeArchived = false,
  }) {
    return _withAccessToken((accessToken) async {
      try {
        final response = await _client.listManualIncomeSources(
          includeArchived: includeArchived,
          accessToken: accessToken,
        );
        return response.incomeSources.map(_mapIncome).toList(growable: false);
      } on SettleoraManualFinanceFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraManualIncomeSource> createIncomeSource(
    SettleoraManualIncomeSourceDraft draft,
  ) {
    final request = _incomeCreateRequest(draft);

    return _withAccessToken((accessToken) async {
      try {
        return _mapIncome(
          await _client.createManualIncomeSource(
            request,
            accessToken: accessToken,
          ),
        );
      } on SettleoraManualFinanceFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraManualIncomeSource> updateIncomeSource({
    required String incomeSourceId,
    required SettleoraManualIncomeSourceDraft draft,
  }) {
    final trimmedId = _requiredId(
      incomeSourceId,
      'Choose an income source before saving changes.',
    );
    final request = _incomeUpdateRequest(draft);

    return _withAccessToken((accessToken) async {
      try {
        return _mapIncome(
          await _client.updateManualIncomeSource(
            trimmedId,
            request,
            accessToken: accessToken,
          ),
        );
      } on SettleoraManualFinanceFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  @override
  Future<SettleoraManualIncomeSource> archiveIncomeSource(
    String incomeSourceId,
  ) {
    final trimmedId = _requiredId(
      incomeSourceId,
      'Choose an income source before archiving it.',
    );

    return _withAccessToken((accessToken) async {
      try {
        return _mapIncome(
          await _client.archiveManualIncomeSource(
            trimmedId,
            accessToken: accessToken,
          ),
        );
      } on SettleoraManualFinanceFailure {
        rethrow;
      } catch (error) {
        throw _mapFailure(error);
      }
    });
  }

  Future<T> _withAccessToken<T>(Future<T> Function(String token) action) async {
    final accessToken = (await _accessTokenProvider.accessToken())?.trim();
    if (accessToken == null || accessToken.isEmpty) {
      throw const SettleoraManualFinanceFailure(
        kind: SettleoraManualFinanceFailureKind.sessionRequired,
        message: 'Sign in before managing manual accounts and income.',
      );
    }

    return action(accessToken);
  }
}

api.CreateManualIncomeSourceRequest _incomeCreateRequest(
  SettleoraManualIncomeSourceDraft draft,
) {
  return api.CreateManualIncomeSourceRequest(
    displayName: _requiredText(draft.displayName, 'Enter an income name.'),
    amount: _requiredPositiveDecimal(draft.amount),
    currency: _requiredCurrency(draft.currency),
    cadence: _requiredCadence(draft.cadence),
    nextExpectedDate: _requiredIsoDate(draft.nextExpectedDate),
    endDate: _optionalIsoDate(draft.endDate),
    manualFinancialAccountId: _optionalId(draft.manualFinancialAccountId),
    note: _optionalText(draft.note),
  );
}

api.UpdateManualIncomeSourceRequest _incomeUpdateRequest(
  SettleoraManualIncomeSourceDraft draft,
) {
  return api.UpdateManualIncomeSourceRequest(
    displayName: _requiredText(draft.displayName, 'Enter an income name.'),
    amount: _requiredPositiveDecimal(draft.amount),
    currency: _requiredCurrency(draft.currency),
    cadence: _requiredCadence(draft.cadence),
    nextExpectedDate: _requiredIsoDate(draft.nextExpectedDate),
    endDate: _optionalIsoDate(draft.endDate),
    manualFinancialAccountId: _optionalId(draft.manualFinancialAccountId),
    note: _optionalText(draft.note),
  );
}

SettleoraManualFinanceSummary _mapSummary(
  api.ManualFinanceSummaryResponse response,
) {
  return SettleoraManualFinanceSummary(
    asOfUtc: response.asOfUtc,
    windowStartDate: response.windowStartDate,
    windowEndDate: response.windowEndDate,
    currencies: response.currencies.map(_mapSummaryRow).toList(growable: false),
    warnings: response.warnings,
  );
}

SettleoraManualFinanceSummaryCurrencyRow _mapSummaryRow(
  api.ManualFinanceSummaryCurrencyRow response,
) {
  return SettleoraManualFinanceSummaryCurrencyRow(
    currency: response.currency,
    activeManualAccountBalanceTotal: response.activeManualAccountBalanceTotal,
    expectedManualIncomeTotal: response.expectedManualIncomeTotal,
    recurringExpectedManualIncomeTotal:
        response.recurringExpectedManualIncomeTotal,
    upcomingOneTimeFutureBillObligationTotal:
        response.upcomingOneTimeFutureBillObligationTotal,
    recurringObligationEstimateTotal: response.recurringObligationEstimateTotal,
    estimatedAvailableAmount: response.estimatedAvailableAmount,
    warnings: response.warnings,
  );
}

SettleoraManualFinancialAccount _mapAccount(
  api.ManualFinancialAccountResponse response,
) {
  return SettleoraManualFinancialAccount(
    id: response.id,
    displayName: response.displayName,
    accountType: response.accountType,
    currentBalanceAmount: response.currentBalanceAmount,
    currency: response.currency,
    balanceAsOfDate: response.balanceAsOfDate,
    note: response.note,
    status: response.status,
    createdAtUtc: response.createdAtUtc,
    updatedAtUtc: response.updatedAtUtc,
    archivedAtUtc: response.archivedAtUtc,
  );
}

SettleoraManualIncomeSource _mapIncome(
  api.ManualIncomeSourceResponse response,
) {
  return SettleoraManualIncomeSource(
    id: response.id,
    displayName: response.displayName,
    amount: response.amount,
    currency: response.currency,
    cadence: response.cadence,
    nextExpectedDate: response.nextExpectedDate,
    endDate: response.endDate,
    manualFinancialAccountId: response.manualFinancialAccountId,
    note: response.note,
    status: response.status,
    createdAtUtc: response.createdAtUtc,
    updatedAtUtc: response.updatedAtUtc,
    archivedAtUtc: response.archivedAtUtc,
  );
}

SettleoraManualFinanceFailure _mapFailure(Object error) {
  if (error is SettleoraManualFinanceFailure) {
    return error;
  }
  if (error is TimeoutException || error is SocketException) {
    return const SettleoraManualFinanceFailure(
      kind: SettleoraManualFinanceFailureKind.network,
      message:
          'Manual accounts and income are unavailable. Try again when the server is reachable.',
    );
  }
  if (error is api.SettleoraApiException) {
    return switch (error.statusCode) {
      400 => SettleoraManualFinanceFailure(
        kind: SettleoraManualFinanceFailureKind.validation,
        message:
            'The manual finance request is not valid. Check the fields and try again.',
        statusCode: error.statusCode,
      ),
      401 => SettleoraManualFinanceFailure(
        kind: SettleoraManualFinanceFailureKind.sessionExpired,
        message: 'Your session has expired. Sign in again.',
        statusCode: error.statusCode,
      ),
      403 => SettleoraManualFinanceFailure(
        kind: SettleoraManualFinanceFailureKind.denied,
        message: 'You do not have access to that manual finance record.',
        statusCode: error.statusCode,
      ),
      404 => SettleoraManualFinanceFailure(
        kind: SettleoraManualFinanceFailureKind.unavailable,
        message: 'The manual finance record is no longer available.',
        statusCode: error.statusCode,
      ),
      409 => SettleoraManualFinanceFailure(
        kind: SettleoraManualFinanceFailureKind.conflict,
        message: 'Refresh accounts and income, then try again.',
        statusCode: error.statusCode,
      ),
      _ => SettleoraManualFinanceFailure(
        kind: SettleoraManualFinanceFailureKind.server,
        message: 'Manual accounts and income are unavailable right now.',
        statusCode: error.statusCode,
      ),
    };
  }

  return const SettleoraManualFinanceFailure(
    kind: SettleoraManualFinanceFailureKind.network,
    message:
        'Manual accounts and income are unavailable. Try again when the server is reachable.',
  );
}

String _requiredId(String value, String message) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    throw SettleoraManualFinanceFailure(
      kind: SettleoraManualFinanceFailureKind.validation,
      message: message,
    );
  }

  return trimmed;
}

String? _optionalId(String? value) {
  final trimmed = value?.trim();
  return trimmed == null || trimmed.isEmpty ? null : trimmed;
}

String _requiredText(String value, String message) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    throw SettleoraManualFinanceFailure(
      kind: SettleoraManualFinanceFailureKind.validation,
      message: message,
    );
  }

  return trimmed;
}

String? _optionalText(String? value) {
  final trimmed = value?.trim();
  return trimmed == null || trimmed.isEmpty ? null : trimmed;
}

String _requiredAccountType(String value) {
  final trimmed = value.trim();
  if (!SettleoraManualFinancialAccountTypeValues.values.contains(trimmed)) {
    throw const SettleoraManualFinanceFailure(
      kind: SettleoraManualFinanceFailureKind.validation,
      message: 'Choose a supported manual account type.',
    );
  }

  return trimmed;
}

String _requiredCadence(String value) {
  final trimmed = value.trim();
  if (!SettleoraManualIncomeCadenceValues.values.contains(trimmed)) {
    throw const SettleoraManualFinanceFailure(
      kind: SettleoraManualFinanceFailureKind.validation,
      message: 'Choose a supported income cadence.',
    );
  }

  return trimmed;
}

String _requiredCurrency(String value) {
  final trimmed = value.trim().toUpperCase();
  if (!RegExp(r'^[A-Z]{3}$').hasMatch(trimmed)) {
    throw const SettleoraManualFinanceFailure(
      kind: SettleoraManualFinanceFailureKind.validation,
      message: 'Use a three-letter currency code.',
    );
  }

  return trimmed;
}

String _requiredDecimal(String value, String message) {
  final trimmed = value.trim();
  final parsed = num.tryParse(trimmed);
  if (parsed == null || !RegExp(r'^-?\d+(\.\d{1,4})?$').hasMatch(trimmed)) {
    throw SettleoraManualFinanceFailure(
      kind: SettleoraManualFinanceFailureKind.validation,
      message: message,
    );
  }

  return trimmed;
}

String _requiredPositiveDecimal(String value) {
  final trimmed = _requiredDecimal(value, 'Enter the expected income amount.');
  if ((num.tryParse(trimmed) ?? 0) <= 0) {
    throw const SettleoraManualFinanceFailure(
      kind: SettleoraManualFinanceFailureKind.validation,
      message: 'Expected income must be greater than zero.',
    );
  }

  return trimmed;
}

String _requiredIsoDate(String value) {
  final trimmed = value.trim();
  if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(trimmed)) {
    throw const SettleoraManualFinanceFailure(
      kind: SettleoraManualFinanceFailureKind.validation,
      message: 'Use dates in yyyy-MM-dd format.',
    );
  }

  return trimmed;
}

String? _optionalIsoDate(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }

  return _requiredIsoDate(trimmed);
}
