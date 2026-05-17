namespace Settleora.Api.Sync;

internal sealed record SyncOperationAuditEvent(
    string Action,
    Guid ActorAuthAccountId,
    Guid ActorUserProfileId,
    Guid SyncOperationId,
    string OperationType,
    string ResourceType,
    Guid? ResourceId,
    string Status,
    string? SafeErrorCode,
    DateTimeOffset OccurredAtUtc);
