namespace Settleora.Api.Storage;

internal sealed record FileObjectLifecycleAuditEvent(
    string Action,
    Guid ActorAuthAccountId,
    Guid? SubjectAuthAccountId,
    Guid FileObjectId,
    string Purpose,
    string? PreviousStatus,
    string NewStatus,
    string StorageProvider,
    bool RowCreated,
    DateTimeOffset OccurredAtUtc);
