namespace Settleora.Api.Domain.Auth;

public sealed class AuthInvitationPolicy
{
    public Guid Id { get; set; }

    public int PolicyVersion { get; set; }

    public string Status { get; set; } = AuthInvitationPolicyStatuses.Active;

    public string CapabilityState { get; set; } = AuthInvitationCapabilityStates.Disabled;

    public bool PendingInviteGraceWhenDisabled { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public DateTimeOffset? RetiredAtUtc { get; set; }

    public Guid? ChangedByAuthAccountId { get; set; }

    public AuthAccount? ChangedByAuthAccount { get; set; }
}
