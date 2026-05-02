namespace Settleora.Api.Auth.Credentials;

internal interface IAuthCredentialAuditWriter
{
    ValueTask WriteAsync(AuthCredentialAuditEvent auditEvent, CancellationToken cancellationToken);
}
