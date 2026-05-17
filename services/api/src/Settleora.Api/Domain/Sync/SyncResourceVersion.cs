using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.Sync;

public sealed class SyncResourceVersion
{
    public Guid Id { get; set; }

    public string ResourceType { get; set; } = string.Empty;

    public Guid ResourceId { get; set; }

    public long Version { get; set; }

    public string ChangeKind { get; set; } = SyncChangeKinds.Updated;

    public DateTimeOffset ChangedAtUtc { get; set; }

    public Guid? ChangedByUserProfileId { get; set; }

    public UserProfile? ChangedByUserProfile { get; set; }

    public Guid? OwnerUserProfileId { get; set; }

    public UserProfile? OwnerUserProfile { get; set; }

    public Guid? GroupId { get; set; }

    public UserGroup? Group { get; set; }

    public bool IsArchived { get; set; }
}
