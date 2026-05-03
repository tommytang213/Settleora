namespace Settleora.Api.Auth.SignIn;

internal interface ILocalSignInAuditWriter
{
    ValueTask WriteAsync(LocalSignInAuditEvent auditEvent, CancellationToken cancellationToken);
}
