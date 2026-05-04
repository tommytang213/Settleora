namespace Settleora.Api.Users.Groups;

internal sealed record GroupMembershipAuditEvent(
    string Action,
    Guid ActorAuthAccountId,
    Guid? SubjectAuthAccountId,
    Guid GroupId,
    Guid TargetUserProfileId,
    string? PreviousRole,
    string? NewRole,
    string? PreviousStatus,
    string? NewStatus,
    DateTimeOffset OccurredAtUtc);
