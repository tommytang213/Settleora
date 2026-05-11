using Settleora.Api.Domain.Expenses;

namespace Settleora.Api.Expenses.BillAttachments;

internal sealed record BillAttachmentListResponse(
    IReadOnlyList<BillAttachmentResponse> Attachments);

internal sealed record BillAttachmentResponse(
    Guid FileId,
    Guid BillId,
    string Purpose,
    string ContentType,
    long SizeBytes,
    DateTimeOffset UploadedAtUtc,
    DateTimeOffset UpdatedAtUtc)
{
    public static BillAttachmentResponse From(ExpenseBillAttachment attachment)
    {
        return new BillAttachmentResponse(
            attachment.FileObjectId,
            attachment.ExpenseBillId,
            attachment.Purpose,
            attachment.FileObject.ContentType,
            attachment.FileObject.SizeBytes,
            attachment.CreatedAtUtc,
            attachment.FileObject.UpdatedAtUtc);
    }
}
