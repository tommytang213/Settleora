namespace Settleora.Api.Domain.Users;

public sealed class GroupMembership
{
    public Guid GroupId { get; set; }

    public UserGroup Group { get; set; } = null!;

    public Guid UserProfileId { get; set; }

    public UserProfile UserProfile { get; set; } = null!;

    public string Role { get; set; } = GroupMembershipRoles.Member;

    public string Status { get; set; } = GroupMembershipStatuses.Active;

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }
}
