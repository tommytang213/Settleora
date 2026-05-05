namespace Settleora.Api.Storage;

internal interface IFileObjectLifecycleAuditWriter
{
    ValueTask WriteAsync(
        FileObjectLifecycleAuditEvent auditEvent,
        CancellationToken cancellationToken);
}
