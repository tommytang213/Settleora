namespace Settleora.Api.Finance;

internal sealed record ManualFinancialAccountListResponse(
    IReadOnlyList<ManualFinancialAccountResponse> Accounts);

internal sealed record ManualFinancialAccountResponse(
    Guid Id,
    string DisplayName,
    string AccountType,
    string CurrentBalanceAmount,
    string Currency,
    DateOnly BalanceAsOfDate,
    string? Note,
    string Status,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    DateTimeOffset? ArchivedAtUtc);
