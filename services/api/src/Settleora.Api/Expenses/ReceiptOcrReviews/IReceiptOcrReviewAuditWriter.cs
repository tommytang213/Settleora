namespace Settleora.Api.Expenses.ReceiptOcrReviews;

internal interface IReceiptOcrReviewAuditWriter
{
    ValueTask WriteAsync(
        ReceiptOcrReviewAuditEvent auditEvent,
        CancellationToken cancellationToken = default);
}
