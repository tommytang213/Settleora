namespace Settleora.Api.Expenses.Reconciliation;

internal interface IExpenseBillReconciliationAuditWriter
{
    ValueTask WriteAsync(
        ExpenseBillReconciliationAuditEvent auditEvent,
        CancellationToken cancellationToken);
}
