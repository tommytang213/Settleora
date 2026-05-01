namespace Settleora.Api.Domain.Auth;

public sealed class AuthAuditEvent
{
    public Guid Id { get; set; }

    public Guid? ActorAuthAccountId { get; set; }

    public AuthAccount? ActorAuthAccount { get; set; }

    public Guid? SubjectAuthAccountId { get; set; }

    public AuthAccount? SubjectAuthAccount { get; set; }

    public string Action { get; set; } = string.Empty;

    public string Outcome { get; set; } = AuthAuditOutcomes.Success;

    public DateTimeOffset OccurredAtUtc { get; set; }

    public string? CorrelationId { get; set; }

    public string? RequestId { get; set; }

    public string? SafeMetadataJson { get; set; }
}
