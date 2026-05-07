namespace Settleora.Api.Expenses.GroupBills;

internal sealed record GroupBillAuditEvent(
    string Action,
    Guid ActorAuthAccountId,
    Guid SubjectAuthAccountId,
    Guid BillId,
    Guid GroupId,
    string GroupMode,
    string Status,
    int ItemCount,
    int AdjustmentCount,
    int ParticipantCount,
    int PayerCount,
    string Currency,
    decimal TotalAmount,
    DateTimeOffset OccurredAtUtc);
