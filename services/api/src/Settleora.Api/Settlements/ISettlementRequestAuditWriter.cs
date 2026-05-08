namespace Settleora.Api.Settlements;

internal interface ISettlementRequestAuditWriter
{
    ValueTask WriteAsync(
        SettlementRequestAuditEvent auditEvent,
        CancellationToken cancellationToken = default);
}
