namespace Settleora.Api.Domain.Auth;

public sealed class SystemRoleAssignment
{
    public Guid AuthAccountId { get; set; }

    public AuthAccount AuthAccount { get; set; } = null!;

    public string Role { get; set; } = SystemRoles.User;

    public DateTimeOffset AssignedAtUtc { get; set; }

    public Guid? AssignedByAuthAccountId { get; set; }

    public AuthAccount? AssignedByAuthAccount { get; set; }
}
