namespace Settleora.Api.Finance;

internal sealed record ManualIncomeSourceListResponse(
    IReadOnlyList<ManualIncomeSourceResponse> IncomeSources);

internal sealed record ManualIncomeSourceResponse(
    Guid Id,
    string DisplayName,
    string Amount,
    string Currency,
    string Cadence,
    DateOnly NextExpectedDate,
    DateOnly? EndDate,
    Guid? ManualFinancialAccountId,
    string? Note,
    string Status,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    DateTimeOffset? ArchivedAtUtc);
