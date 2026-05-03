namespace Settleora.Api.Auth.SignIn;

internal sealed record LocalSignInAuditEvent(
    string Action,
    string Outcome,
    Guid? ActorAuthAccountId,
    Guid? SubjectAuthAccountId,
    string WorkflowName,
    LocalSignInStatus StatusCategory,
    SignInAbusePreCheckStatus PolicyStatus,
    DateTimeOffset OccurredAtUtc);
