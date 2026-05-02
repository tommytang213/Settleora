namespace Settleora.Api.Auth.Credentials;

internal sealed class NoOpAuthCredentialAuditWriter : IAuthCredentialAuditWriter
{
    public ValueTask WriteAsync(AuthCredentialAuditEvent auditEvent, CancellationToken cancellationToken)
    {
        // TODO: replace this seam with transactional auth audit persistence after audit writer policy is approved.
        return ValueTask.CompletedTask;
    }
}
