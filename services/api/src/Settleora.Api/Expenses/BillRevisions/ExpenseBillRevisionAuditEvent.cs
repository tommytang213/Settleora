namespace Settleora.Api.Expenses.BillRevisions;

internal sealed record ExpenseBillRevisionAuditEvent(
    string Action,
    Guid ActorAuthAccountId,
    Guid SubjectAuthAccountId,
    Guid BillId,
    Guid RevisionId,
    Guid? GroupId,
    string GroupMode,
    string? PreviousRevisionStatus,
    string NewRevisionStatus,
    Guid? ParticipantUserProfileId,
    int ParticipantCount,
    int PendingApprovalCount,
    int ApprovedCount,
    int RejectedCount,
    string Currency,
    decimal TotalAmount,
    DateTimeOffset OccurredAtUtc);
