namespace Settleora.Api.Expenses.Reconciliation;

internal sealed record ExpenseBillReconciliationResponse(
    string Status,
    DateTimeOffset? UpdatedAtUtc,
    Guid? UpdatedByUserProfileId,
    DateTimeOffset? ReconciledAtUtc,
    string? Note);
