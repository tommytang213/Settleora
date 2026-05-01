using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.Auth;

public sealed class AuthAccount
{
    public Guid Id { get; set; }

    public Guid UserProfileId { get; set; }

    public UserProfile UserProfile { get; set; } = null!;

    public string Status { get; set; } = AuthAccountStatuses.Active;

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public DateTimeOffset? DisabledAtUtc { get; set; }

    public DateTimeOffset? DeletedAtUtc { get; set; }

    public ICollection<AuthIdentity> Identities { get; } = new List<AuthIdentity>();

    public ICollection<SystemRoleAssignment> RoleAssignments { get; } = new List<SystemRoleAssignment>();

    public ICollection<SystemRoleAssignment> AssignedRoleAssignments { get; } = new List<SystemRoleAssignment>();
}
