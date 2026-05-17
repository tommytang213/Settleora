namespace Settleora.Api.Sync;

internal interface ISyncOperationAuditWriter
{
    ValueTask WriteAsync(
        SyncOperationAuditEvent auditEvent,
        CancellationToken cancellationToken);
}
