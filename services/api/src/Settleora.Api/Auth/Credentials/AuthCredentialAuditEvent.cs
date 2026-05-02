namespace Settleora.Api.Auth.Credentials;

internal sealed record AuthCredentialAuditEvent(
    string Action,
    string Outcome,
    Guid? SubjectAuthAccountId,
    string WorkflowName,
    string StatusCategory,
    DateTimeOffset OccurredAtUtc);
