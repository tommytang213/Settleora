namespace Settleora.Api.Expenses.RecurringBills;

internal interface IRecurringBillAuditWriter
{
    ValueTask WriteAsync(
        RecurringBillAuditEvent auditEvent,
        CancellationToken cancellationToken);
}
