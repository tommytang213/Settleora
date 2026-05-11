namespace Settleora.Api.Expenses.BillAttachments;

internal interface IExpenseBillAttachmentAuditWriter
{
    ValueTask WriteAsync(
        ExpenseBillAttachmentAuditEvent auditEvent,
        CancellationToken cancellationToken = default);
}
