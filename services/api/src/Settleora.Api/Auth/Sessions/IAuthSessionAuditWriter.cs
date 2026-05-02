namespace Settleora.Api.Auth.Sessions;

internal interface IAuthSessionAuditWriter
{
    ValueTask WriteAsync(AuthSessionAuditEvent auditEvent, CancellationToken cancellationToken);
}
