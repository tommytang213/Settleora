namespace Settleora.Api.Expenses.BillLifecycle;

internal sealed record ExpenseBillLifecycleResponse(
    Guid BillId,
    Guid? GroupId,
    string Status,
    string ArchiveState,
    DateTimeOffset? ArchivedAtUtc,
    DateTimeOffset UpdatedAtUtc);
