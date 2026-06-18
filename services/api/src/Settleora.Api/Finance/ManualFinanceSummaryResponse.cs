namespace Settleora.Api.Finance;

internal sealed record ManualFinanceSummaryResponse(
    DateTimeOffset AsOfUtc,
    DateOnly WindowStartDate,
    DateOnly WindowEndDate,
    IReadOnlyList<ManualFinanceSummaryCurrencyRowResponse> Currencies,
    IReadOnlyList<string> Warnings);

internal sealed record ManualFinanceSummaryCurrencyRowResponse(
    string Currency,
    string ActiveManualAccountBalanceTotal,
    string ExpectedManualIncomeTotal,
    string RecurringExpectedManualIncomeTotal,
    string UpcomingOneTimeFutureBillObligationTotal,
    string RecurringObligationEstimateTotal,
    string EstimatedAvailableAmount,
    IReadOnlyList<string> Warnings);
