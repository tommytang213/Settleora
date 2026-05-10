namespace Settleora.Api.Expenses.BillRevisions;

internal interface IExpenseBillRevisionAuditWriter
{
    ValueTask WriteAsync(
        ExpenseBillRevisionAuditEvent auditEvent,
        CancellationToken cancellationToken = default);
}
