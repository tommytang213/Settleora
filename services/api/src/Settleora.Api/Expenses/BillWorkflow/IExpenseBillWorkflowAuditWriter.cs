namespace Settleora.Api.Expenses.BillWorkflow;

internal interface IExpenseBillWorkflowAuditWriter
{
    ValueTask WriteAsync(
        ExpenseBillWorkflowAuditEvent auditEvent,
        CancellationToken cancellationToken = default);
}
