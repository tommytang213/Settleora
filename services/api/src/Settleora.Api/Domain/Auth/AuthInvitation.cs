using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.Auth;

public sealed class AuthInvitation
{
    public Guid Id { get; set; }

    public string Status { get; set; } = AuthInvitationStatuses.Pending;

    public string ContactIdentifierKind { get; set; } = AuthInvitationContactIdentifierKinds.Email;

    public string ContactIdentifierNormalized { get; set; } = string.Empty;

    public string InvitationSecretHash { get; set; } = string.Empty;

    public string InvitationSecretHashVersion { get; set; } = string.Empty;

    public string TargetSystemRole { get; set; } = SystemRoles.User;

    public Guid InvitedByAuthAccountId { get; set; }

    public AuthAccount InvitedByAuthAccount { get; set; } = null!;

    public Guid InvitedByUserProfileId { get; set; }

    public UserProfile InvitedByUserProfile { get; set; } = null!;

    public Guid? RevokedByAuthAccountId { get; set; }

    public AuthAccount? RevokedByAuthAccount { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public DateTimeOffset ExpiresAtUtc { get; set; }

    public DateTimeOffset? AcceptedAtUtc { get; set; }

    public DateTimeOffset? RevokedAtUtc { get; set; }

    public DateTimeOffset? ExpiredAtUtc { get; set; }

    public DateTimeOffset? CleanupEligibleAtUtc { get; set; }
}
