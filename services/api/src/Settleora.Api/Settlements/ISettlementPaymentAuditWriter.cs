namespace Settleora.Api.Settlements;

internal interface ISettlementPaymentAuditWriter
{
    ValueTask WriteAsync(
        SettlementPaymentAuditEvent auditEvent,
        CancellationToken cancellationToken = default);
}
