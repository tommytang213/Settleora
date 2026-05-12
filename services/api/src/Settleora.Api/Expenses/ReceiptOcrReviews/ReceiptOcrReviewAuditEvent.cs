namespace Settleora.Api.Expenses.ReceiptOcrReviews;

internal sealed record ReceiptOcrReviewAuditEvent(
    string Action,
    Guid ActorAuthAccountId,
    Guid SubjectAuthAccountId,
    Guid BillId,
    Guid? GroupId,
    string GroupMode,
    string BillStatus,
    Guid FileObjectId,
    Guid ReceiptOcrReviewId,
    string AttachmentPurpose,
    string OcrReviewStatus,
    string OcrReviewSource,
    int LineCount,
    string? Currency,
    string ActionCategory,
    DateTimeOffset OccurredAtUtc);
