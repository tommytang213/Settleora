namespace Settleora.Api.Expenses.BillWorkflow;

internal sealed record ExpenseBillWorkflowAuditEvent(
    string Action,
    Guid ActorAuthAccountId,
    Guid SubjectAuthAccountId,
    Guid BillId,
    Guid? GroupId,
    string GroupMode,
    string PreviousBillStatus,
    string NewBillStatus,
    string? PreviousParticipantStatus,
    string? NewParticipantStatus,
    Guid? ParticipantUserProfileId,
    int ParticipantCount,
    int AcceptedCount,
    int RejectedCount,
    string Currency,
    decimal TotalAmount,
    string? RejectionReasonCode,
    DateTimeOffset OccurredAtUtc);
