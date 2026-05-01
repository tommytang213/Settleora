namespace Settleora.Api.Domain.Users;

public sealed class UserProfile
{
    public Guid Id { get; set; }

    public string DisplayName { get; set; } = string.Empty;

    public string? DefaultCurrency { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public DateTimeOffset? DeletedAtUtc { get; set; }

    public ICollection<UserGroup> CreatedGroups { get; } = new List<UserGroup>();

    public ICollection<GroupMembership> GroupMemberships { get; } = new List<GroupMembership>();
}
