namespace Settleora.Api.Auth.PasswordReset;

internal interface IPasswordResetAuditWriter
{
    ValueTask WriteAsync(
        PasswordResetAuditEvent auditEvent,
        CancellationToken cancellationToken = default);
}
