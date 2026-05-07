namespace Settleora.Api.Expenses.GroupBills;

internal interface IGroupBillAuditWriter
{
    ValueTask WriteAsync(
        GroupBillAuditEvent auditEvent,
        CancellationToken cancellationToken);
}
