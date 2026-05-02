namespace Settleora.Api.Auth.Sessions;

internal sealed record AuthSessionAuditEvent(
    string Action,
    string Outcome,
    Guid? ActorAuthAccountId,
    Guid? SubjectAuthAccountId,
    string WorkflowName,
    string StatusCategory,
    DateTimeOffset OccurredAtUtc);
