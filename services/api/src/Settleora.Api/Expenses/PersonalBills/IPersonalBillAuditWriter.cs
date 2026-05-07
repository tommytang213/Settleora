namespace Settleora.Api.Expenses.PersonalBills;

internal interface IPersonalBillAuditWriter
{
    ValueTask WriteAsync(
        PersonalBillAuditEvent auditEvent,
        CancellationToken cancellationToken);
}
