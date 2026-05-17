namespace Settleora.Api.Expenses.Reconciliation;

internal sealed record ExpenseBillReconciliationAuditEvent(
    string Action,
    Guid ActorAuthAccountId,
    Guid SubjectAuthAccountId,
    Guid BillId,
    Guid? GroupId,
    string GroupMode,
    string BillStatus,
    string PreviousReconciliationStatus,
    string NewReconciliationStatus,
    string Currency,
    decimal TotalAmount,
    DateTimeOffset OccurredAtUtc);
