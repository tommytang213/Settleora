namespace Settleora.Api.Expenses.BillAttachments;

internal sealed record ExpenseBillAttachmentAuditEvent(
    string Action,
    Guid ActorAuthAccountId,
    Guid SubjectAuthAccountId,
    Guid BillId,
    Guid? GroupId,
    string GroupMode,
    string BillStatus,
    Guid FileObjectId,
    string AttachmentPurpose,
    string FilePurpose,
    string ContentType,
    long SizeBytes,
    string ActionCategory,
    DateTimeOffset OccurredAtUtc);
