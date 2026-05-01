namespace Settleora.Api.Domain.Users;

public sealed class UserGroup
{
    public Guid Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public Guid CreatedByUserProfileId { get; set; }

    public UserProfile CreatedByUserProfile { get; set; } = null!;

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public DateTimeOffset? DeletedAtUtc { get; set; }

    public ICollection<GroupMembership> Memberships { get; } = new List<GroupMembership>();
}
