using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.Sync;

public sealed class SyncOperation
{
    public Guid Id { get; set; }

    public Guid ActorUserProfileId { get; set; }

    public UserProfile ActorUserProfile { get; set; } = null!;

    public string IdempotencyKey { get; set; } = string.Empty;

    public string RequestPayloadHash { get; set; } = string.Empty;

    public string OperationType { get; set; } = string.Empty;

    public string ResourceType { get; set; } = string.Empty;

    public Guid? ResourceId { get; set; }

    public long? BaseVersion { get; set; }

    public string Status { get; set; } = SyncOperationStatuses.Accepted;

    public Guid? ResultResourceId { get; set; }

    public long? ResultVersion { get; set; }

    public string? SafeErrorCode { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }
}
