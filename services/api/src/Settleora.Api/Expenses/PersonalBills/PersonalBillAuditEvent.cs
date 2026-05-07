namespace Settleora.Api.Expenses.PersonalBills;

internal sealed record PersonalBillAuditEvent(
    string Action,
    Guid ActorAuthAccountId,
    Guid SubjectAuthAccountId,
    Guid BillId,
    string GroupMode,
    string Status,
    int ItemCount,
    int AdjustmentCount,
    int ParticipantCount,
    string Currency,
    decimal TotalAmount,
    DateTimeOffset OccurredAtUtc);
