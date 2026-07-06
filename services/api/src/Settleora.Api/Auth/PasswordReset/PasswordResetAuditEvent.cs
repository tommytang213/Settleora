namespace Settleora.Api.Auth.PasswordReset;

internal sealed record PasswordResetAuditEvent(
    string Action,
    string Outcome,
    Guid? SubjectAuthAccountId,
    string StatusCategory,
    string? CorrelationId,
    DateTimeOffset OccurredAtUtc);
