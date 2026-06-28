using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Sync;
using Settleora.Api.Domain.Users;
using Settleora.Api.Expenses.BillLifecycle;
using Settleora.Api.Notifications;
using Settleora.Api.Persistence;

namespace Settleora.Api.Sync;

internal sealed class SyncOperationService
{
    private const int DefaultChangeFeedLimit = 50;
    private const int MaxChangeFeedLimit = 100;
    private const int MaxPayloadLength = 2048;
    private const int MaxPayloadPropertyCount = 16;
    private const string ReplayedStatus = "replayed";
    private const string OperationAcceptedAction = "sync.operation_accepted";
    private const string OperationRejectedAction = "sync.operation_rejected";
    private const string OperationConflictedAction = "sync.operation_conflicted";
    private const string UnsupportedPayloadCode = "unsupported_payload";
    private const string ResourceUnavailableCode = "resource_unavailable";
    private const string StaleBaseVersionCode = "stale_base_version";
    private const string ResourceStateConflictCode = "resource_state_conflict";
    private const string IdempotencyKeyConflictCode = "idempotency_key_conflict";

    private static readonly JsonSerializerOptions HashJsonOptions = new(JsonSerializerDefaults.Web);

    private readonly SettleoraDbContext dbContext;
    private readonly ExpenseBillLifecycleService lifecycleService;
    private readonly ISyncOperationAuditWriter auditWriter;
    private readonly IInAppNotificationWriter notificationWriter;
    private readonly TimeProvider timeProvider;

    public SyncOperationService(
        SettleoraDbContext dbContext,
        ExpenseBillLifecycleService lifecycleService,
        ISyncOperationAuditWriter auditWriter,
        IInAppNotificationWriter notificationWriter,
        TimeProvider timeProvider)
    {
        this.dbContext = dbContext;
        this.lifecycleService = lifecycleService;
        this.auditWriter = auditWriter;
        this.notificationWriter = notificationWriter;
        this.timeProvider = timeProvider;
    }

    public async Task<SyncOperationProcessResult> ProcessOperationAsync(
        SyncOperationRequest request,
        AuthenticatedActor actor,
        CancellationToken cancellationToken)
    {
        if (!ValidatedSyncOperation.TryCreate(request, out var operation, out var validationError))
        {
            return SyncOperationProcessResult.InvalidRequest(validationError);
        }

        var existingOperation = await dbContext.Set<SyncOperation>()
            .AsNoTracking()
            .SingleOrDefaultAsync(
                candidate => candidate.ActorUserProfileId == actor.UserProfileId
                    && candidate.IdempotencyKey == operation.IdempotencyKey,
                cancellationToken);
        if (existingOperation is not null)
        {
            return existingOperation.RequestPayloadHash == operation.RequestPayloadHash
                ? SyncOperationProcessResult.Ok(MapReplayedOperation(existingOperation))
                : SyncOperationProcessResult.Ok(new SyncOperationResponse(
                    existingOperation.Id,
                    SyncOperationStatuses.Conflict,
                    operation.ResourceType,
                    operation.ResourceId,
                    ResultingVersion: null,
                    IdempotencyKeyConflictCode,
                    SafeMessage(IdempotencyKeyConflictCode)));
        }

        if (operation.PayloadPropertyCount > 0)
        {
            return await PersistTerminalOperationAsync(
                operation,
                actor,
                SyncOperationStatuses.Rejected,
                UnsupportedPayloadCode,
                resultVersion: null,
                cancellationToken);
        }

        var loadedBill = await lifecycleService.LoadVisibleAsync(
            operation.ResourceId,
            actor,
            cancellationToken);
        if (loadedBill.Kind is not ExpenseBillLifecycleLoadResultKind.Visible || loadedBill.Bill is null)
        {
            return await PersistTerminalOperationAsync(
                operation,
                actor,
                SyncOperationStatuses.Rejected,
                ResourceUnavailableCode,
                resultVersion: null,
                cancellationToken);
        }

        var resourceVersion = await dbContext.Set<SyncResourceVersion>()
            .SingleOrDefaultAsync(
                version => version.ResourceType == operation.ResourceType
                    && version.ResourceId == operation.ResourceId,
                cancellationToken);
        var currentVersion = resourceVersion?.Version ?? 0L;
        if (operation.BaseVersion is not null && operation.BaseVersion.Value != currentVersion)
        {
            return await PersistTerminalOperationAsync(
                operation,
                actor,
                loadedBill.Bill,
                SyncOperationStatuses.Conflict,
                StaleBaseVersionCode,
                currentVersion,
                cancellationToken);
        }

        var archive = operation.OperationType is SyncOperationTypes.BillArchive;
        var lifecycleResult = await lifecycleService.ApplyLoadedAsync(
            loadedBill.Bill,
            archive,
            actor,
            cancellationToken);
        if (lifecycleResult.Kind is ExpenseBillLifecycleResultKind.Conflict)
        {
            return await PersistTerminalOperationAsync(
                operation,
                actor,
                loadedBill.Bill,
                SyncOperationStatuses.Conflict,
                ResourceStateConflictCode,
                currentVersion,
                cancellationToken);
        }

        if (lifecycleResult.Kind is ExpenseBillLifecycleResultKind.Unavailable)
        {
            return await PersistTerminalOperationAsync(
                operation,
                actor,
                SyncOperationStatuses.Rejected,
                ResourceUnavailableCode,
                resultVersion: null,
                cancellationToken);
        }

        var now = timeProvider.GetUtcNow();
        var resultVersion = currentVersion;
        if (resourceVersion is null || lifecycleResult.Mutated)
        {
            resultVersion = await NextResourceVersionAsync(cancellationToken);
            UpsertResourceVersion(
                resourceVersion,
                operation,
                lifecycleResult,
                actor,
                archive ? SyncChangeKinds.Archived : SyncChangeKinds.Restored,
                resultVersion,
                now);
        }

        var syncOperation = AddSyncOperation(
            operation,
            actor,
            SyncOperationStatuses.Accepted,
            safeErrorCode: null,
            resultVersion,
            now);
        await WriteSyncAuditAsync(syncOperation, actor, now, cancellationToken);

        return await SaveAsync(
            new SyncOperationResponse(
                syncOperation.Id,
                SyncOperationStatuses.Accepted,
                operation.ResourceType,
                operation.ResourceId,
                resultVersion,
                SafeErrorCode: null,
                SafeMessage: null),
            cancellationToken);
    }

    public async Task<SyncChangeFeedResult> ListChangesAsync(
        AuthenticatedActor actor,
        long? sinceVersion,
        int? limit,
        string? resourceType,
        CancellationToken cancellationToken)
    {
        if (sinceVersion is < 0)
        {
            return SyncChangeFeedResult.InvalidRequest("sinceVersion must be greater than or equal to zero.");
        }

        if (limit is < 1)
        {
            return SyncChangeFeedResult.InvalidRequest("limit must be greater than zero.");
        }

        if (!string.IsNullOrWhiteSpace(resourceType)
            && !StringComparer.Ordinal.Equals(resourceType, SyncResourceTypes.ExpenseBill))
        {
            return SyncChangeFeedResult.InvalidRequest("resourceType is not supported.");
        }

        var appliedSinceVersion = sinceVersion ?? 0L;
        var appliedLimit = Math.Min(limit ?? DefaultChangeFeedLimit, MaxChangeFeedLimit);
        var activeActorGroupIds = dbContext.Set<GroupMembership>()
            .AsNoTracking()
            .Where(membership => membership.UserProfileId == actor.UserProfileId
                && membership.Status == GroupMembershipStatuses.Active)
            .Select(membership => membership.GroupId);

        var query = dbContext.Set<SyncResourceVersion>()
            .AsNoTracking()
            .Where(version => version.Version > appliedSinceVersion
                && version.ResourceType == SyncResourceTypes.ExpenseBill
                && dbContext.Set<ExpenseBill>().Any(bill => bill.Id == version.ResourceId
                    && bill.CreatedByUserProfile.DeletedAtUtc == null
                    && ((bill.GroupId == null
                            && (bill.CreatedByUserProfileId == actor.UserProfileId
                                || bill.Participants.Any(participant => participant.UserProfileId == actor.UserProfileId)))
                        || (bill.GroupId != null
                            && bill.Group != null
                            && bill.Group.DeletedAtUtc == null
                            && activeActorGroupIds.Contains(bill.GroupId.Value)))));

        if (!string.IsNullOrWhiteSpace(resourceType))
        {
            query = query.Where(version => version.ResourceType == resourceType);
        }

        var changes = await query
            .OrderBy(version => version.Version)
            .ThenBy(version => version.ResourceId)
            .Take(appliedLimit)
            .Select(version => new SyncChangeResponse(
                version.ResourceType,
                version.ResourceId,
                version.Version,
                version.ChangedAtUtc,
                version.ChangeKind,
                version.GroupId))
            .ToListAsync(cancellationToken);
        var nextSinceVersion = changes.Count == 0
            ? appliedSinceVersion
            : changes[^1].Version;

        return SyncChangeFeedResult.Ok(new SyncChangesResponse(
            appliedSinceVersion,
            nextSinceVersion,
            appliedLimit,
            string.IsNullOrWhiteSpace(resourceType) ? null : resourceType,
            changes));
    }

    public async Task<SyncOperationReadResult> GetOperationAsync(
        Guid syncOperationId,
        AuthenticatedActor actor,
        CancellationToken cancellationToken)
    {
        if (syncOperationId == Guid.Empty)
        {
            return SyncOperationReadResult.Unavailable();
        }

        var operation = await dbContext.Set<SyncOperation>()
            .AsNoTracking()
            .SingleOrDefaultAsync(
                candidate => candidate.Id == syncOperationId
                    && candidate.ActorUserProfileId == actor.UserProfileId,
                cancellationToken);
        if (operation is null)
        {
            return SyncOperationReadResult.Unavailable();
        }

        return SyncOperationReadResult.Ok(MapOperation(operation));
    }

    private async Task<SyncOperationProcessResult> PersistTerminalOperationAsync(
        ValidatedSyncOperation operation,
        AuthenticatedActor actor,
        string status,
        string safeErrorCode,
        long? resultVersion,
        CancellationToken cancellationToken)
    {
        return await PersistTerminalOperationAsync(
            operation,
            actor,
            bill: null,
            status,
            safeErrorCode,
            resultVersion,
            cancellationToken);
    }

    private async Task<SyncOperationProcessResult> PersistTerminalOperationAsync(
        ValidatedSyncOperation operation,
        AuthenticatedActor actor,
        ExpenseBill? bill,
        string status,
        string safeErrorCode,
        long? resultVersion,
        CancellationToken cancellationToken)
    {
        var now = timeProvider.GetUtcNow();
        var syncOperation = AddSyncOperation(
            operation,
            actor,
            status,
            safeErrorCode,
            resultVersion,
            now);
        await WriteSyncAuditAsync(syncOperation, actor, now, cancellationToken);
        if (status is SyncOperationStatuses.Conflict)
        {
            await InAppNotificationEvents.WriteSyncConflictDetectedNotificationAsync(
                notificationWriter,
                syncOperation,
                actor.UserProfileId,
                bill?.GroupId,
                bill?.Id,
                now,
                cancellationToken);
        }

        return await SaveAsync(
            new SyncOperationResponse(
                syncOperation.Id,
                status,
                operation.ResourceType,
                operation.ResourceId,
                resultVersion,
                safeErrorCode,
                SafeMessage(safeErrorCode)),
            cancellationToken);
    }

    private SyncOperation AddSyncOperation(
        ValidatedSyncOperation operation,
        AuthenticatedActor actor,
        string status,
        string? safeErrorCode,
        long? resultVersion,
        DateTimeOffset now)
    {
        var syncOperation = new SyncOperation
        {
            Id = Guid.NewGuid(),
            ActorUserProfileId = actor.UserProfileId,
            IdempotencyKey = operation.IdempotencyKey,
            RequestPayloadHash = operation.RequestPayloadHash,
            OperationType = operation.OperationType,
            ResourceType = operation.ResourceType,
            ResourceId = operation.ResourceId,
            BaseVersion = operation.BaseVersion,
            Status = status,
            ResultResourceId = status is SyncOperationStatuses.Accepted ? operation.ResourceId : null,
            ResultVersion = resultVersion,
            SafeErrorCode = safeErrorCode,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        dbContext.Set<SyncOperation>().Add(syncOperation);
        return syncOperation;
    }

    private async Task<long> NextResourceVersionAsync(CancellationToken cancellationToken)
    {
        return (await dbContext.Set<SyncResourceVersion>()
            .Select(version => (long?)version.Version)
            .MaxAsync(cancellationToken) ?? 0L) + 1L;
    }

    private void UpsertResourceVersion(
        SyncResourceVersion? existingVersion,
        ValidatedSyncOperation operation,
        ExpenseBillLifecycleResult lifecycleResult,
        AuthenticatedActor actor,
        string changeKind,
        long version,
        DateTimeOffset now)
    {
        var resourceVersion = existingVersion ?? new SyncResourceVersion
        {
            Id = Guid.NewGuid(),
            ResourceType = operation.ResourceType,
            ResourceId = operation.ResourceId
        };

        resourceVersion.Version = version;
        resourceVersion.ChangeKind = changeKind;
        resourceVersion.ChangedAtUtc = now;
        resourceVersion.ChangedByUserProfileId = actor.UserProfileId;
        resourceVersion.OwnerUserProfileId = lifecycleResult.OwnerUserProfileId;
        resourceVersion.GroupId = lifecycleResult.GroupId;
        resourceVersion.IsArchived = lifecycleResult.IsArchived ?? false;

        if (existingVersion is null)
        {
            dbContext.Set<SyncResourceVersion>().Add(resourceVersion);
        }
    }

    private async Task WriteSyncAuditAsync(
        SyncOperation operation,
        AuthenticatedActor actor,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        await auditWriter.WriteAsync(
            new SyncOperationAuditEvent(
                ActionForStatus(operation.Status),
                actor.AuthAccountId,
                actor.UserProfileId,
                operation.Id,
                operation.OperationType,
                operation.ResourceType,
                operation.ResourceId,
                operation.Status,
                operation.SafeErrorCode,
                now),
            cancellationToken);
    }

    private async Task<SyncOperationProcessResult> SaveAsync(
        SyncOperationResponse response,
        CancellationToken cancellationToken)
    {
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return SyncOperationProcessResult.WriteFailed();
        }

        return SyncOperationProcessResult.Ok(response);
    }

    private static SyncOperationResponse MapReplayedOperation(SyncOperation operation)
    {
        var responseStatus = operation.Status is SyncOperationStatuses.Accepted
            ? ReplayedStatus
            : operation.Status;

        return MapOperation(operation, responseStatus);
    }

    private static SyncOperationResponse MapOperation(
        SyncOperation operation,
        string? responseStatus = null)
    {
        return new SyncOperationResponse(
            operation.Id,
            responseStatus ?? operation.Status,
            operation.ResourceType,
            operation.ResultResourceId ?? operation.ResourceId,
            operation.ResultVersion,
            operation.SafeErrorCode,
            operation.SafeErrorCode is null ? null : SafeMessage(operation.SafeErrorCode));
    }

    private static string ActionForStatus(string status)
    {
        return status switch
        {
            SyncOperationStatuses.Accepted => OperationAcceptedAction,
            SyncOperationStatuses.Conflict => OperationConflictedAction,
            _ => OperationRejectedAction
        };
    }

    private static string SafeMessage(string safeErrorCode)
    {
        return safeErrorCode switch
        {
            UnsupportedPayloadCode => "The sync operation payload is not supported for this operation type.",
            ResourceUnavailableCode => "The requested resource is unavailable.",
            StaleBaseVersionCode => "The submitted base version is stale.",
            ResourceStateConflictCode => "The resource state conflicts with this operation.",
            IdempotencyKeyConflictCode => "The idempotency key was already used for a different sync operation.",
            _ => "The sync operation could not be accepted."
        };
    }

    private sealed record ValidatedSyncOperation(
        string IdempotencyKey,
        string OperationType,
        string ResourceType,
        Guid ResourceId,
        long? BaseVersion,
        int PayloadPropertyCount,
        string RequestPayloadHash)
    {
        public static bool TryCreate(
            SyncOperationRequest request,
            out ValidatedSyncOperation operation,
            out string error)
        {
            operation = null!;
            error = string.Empty;

            if (!TryValidateToken(
                request.IdempotencyKey,
                SyncConstraints.IdempotencyKeyMaxLength,
                out var idempotencyKey))
            {
                error = "idempotencyKey is required and must use safe client-token characters.";
                return false;
            }

            if (!TryValidateToken(
                request.OperationType,
                SyncConstraints.OperationTypeMaxLength,
                out var operationType))
            {
                error = "operationType is required and must use safe operation characters.";
                return false;
            }

            if (!SyncOperationTypes.IsSupported(operationType))
            {
                error = "operationType is not supported.";
                return false;
            }

            if (!TryValidateToken(
                request.ResourceType,
                SyncConstraints.ResourceTypeMaxLength,
                out var resourceType)
                || !StringComparer.Ordinal.Equals(resourceType, SyncResourceTypes.ExpenseBill))
            {
                error = "resourceType is not supported.";
                return false;
            }

            if (request.ResourceId is null || request.ResourceId.Value == Guid.Empty)
            {
                error = "resourceId is required.";
                return false;
            }

            if (request.BaseVersion is < 0)
            {
                error = "baseVersion must be greater than or equal to zero.";
                return false;
            }

            if (!TryReadPayload(
                request.Payload,
                out var payloadText,
                out var payloadPropertyCount,
                out error))
            {
                return false;
            }

            var payloadHash = ComputeRequestHash(
                idempotencyKey,
                operationType,
                resourceType,
                request.ResourceId.Value,
                request.BaseVersion,
                payloadText);

            operation = new ValidatedSyncOperation(
                idempotencyKey,
                operationType,
                resourceType,
                request.ResourceId.Value,
                request.BaseVersion,
                payloadPropertyCount,
                payloadHash);
            return true;
        }

        private static bool TryValidateToken(
            string? value,
            int maxLength,
            out string token)
        {
            token = value?.Trim() ?? string.Empty;
            if (token.Length is 0 || token.Length > maxLength)
            {
                return false;
            }

            foreach (var character in token)
            {
                if (!IsSafeTokenCharacter(character))
                {
                    return false;
                }
            }

            return true;
        }

        private static bool IsSafeTokenCharacter(char character)
        {
            return character is >= 'a' and <= 'z'
                or >= 'A' and <= 'Z'
                or >= '0' and <= '9'
                or '_'
                or '-'
                or '.'
                or ':';
        }

        private static bool TryReadPayload(
            JsonElement? payload,
            out string payloadText,
            out int payloadPropertyCount,
            out string error)
        {
            payloadText = "{}";
            payloadPropertyCount = 0;
            error = string.Empty;

            if (payload is null
                || payload.Value.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
            {
                return true;
            }

            if (payload.Value.ValueKind is not JsonValueKind.Object)
            {
                error = "payload must be a bounded JSON object.";
                return false;
            }

            payloadText = payload.Value.GetRawText();
            if (payloadText.Length > MaxPayloadLength)
            {
                error = "payload exceeds the maximum supported length.";
                return false;
            }

            payloadPropertyCount = payload.Value.EnumerateObject().Count();
            if (payloadPropertyCount > MaxPayloadPropertyCount)
            {
                error = "payload has too many properties.";
                return false;
            }

            return true;
        }

        private static string ComputeRequestHash(
            string idempotencyKey,
            string operationType,
            string resourceType,
            Guid resourceId,
            long? baseVersion,
            string payloadText)
        {
            var hashInput = JsonSerializer.Serialize(
                new OperationHashInput(
                    idempotencyKey,
                    operationType,
                    resourceType,
                    resourceId,
                    baseVersion,
                    payloadText),
                HashJsonOptions);
            var hashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(hashInput));
            return Convert.ToHexString(hashBytes).ToLowerInvariant();
        }
    }

    private sealed record OperationHashInput(
        string IdempotencyKey,
        string OperationType,
        string ResourceType,
        Guid ResourceId,
        long? BaseVersion,
        string Payload);
}

internal sealed record SyncOperationRequest(
    string? IdempotencyKey,
    string? OperationType,
    string? ResourceType,
    Guid? ResourceId,
    long? BaseVersion,
    JsonElement? Payload);

internal sealed record SyncOperationResponse(
    Guid OperationId,
    string Status,
    string ResourceType,
    Guid? ResourceId,
    long? ResultingVersion,
    string? SafeErrorCode,
    string? SafeMessage);

internal enum SyncOperationReadResultKind
{
    Ok,
    Unavailable
}

internal sealed record SyncOperationReadResult(
    SyncOperationReadResultKind Kind,
    SyncOperationResponse? Response)
{
    public static SyncOperationReadResult Ok(SyncOperationResponse response)
    {
        return new SyncOperationReadResult(
            SyncOperationReadResultKind.Ok,
            response);
    }

    public static SyncOperationReadResult Unavailable()
    {
        return new SyncOperationReadResult(
            SyncOperationReadResultKind.Unavailable,
            Response: null);
    }
}

internal sealed record SyncChangesResponse(
    long SinceVersion,
    long NextSinceVersion,
    int Limit,
    string? ResourceType,
    IReadOnlyList<SyncChangeResponse> Changes);

internal sealed record SyncChangeResponse(
    string ResourceType,
    Guid ResourceId,
    long Version,
    DateTimeOffset ChangedAtUtc,
    string ChangeKind,
    Guid? GroupId);

internal enum SyncOperationProcessResultKind
{
    Ok,
    InvalidRequest,
    WriteFailed
}

internal sealed record SyncOperationProcessResult(
    SyncOperationProcessResultKind Kind,
    SyncOperationResponse? Response,
    string? Error)
{
    public static SyncOperationProcessResult Ok(SyncOperationResponse response)
    {
        return new SyncOperationProcessResult(
            SyncOperationProcessResultKind.Ok,
            response,
            Error: null);
    }

    public static SyncOperationProcessResult InvalidRequest(string error)
    {
        return new SyncOperationProcessResult(
            SyncOperationProcessResultKind.InvalidRequest,
            Response: null,
            error);
    }

    public static SyncOperationProcessResult WriteFailed()
    {
        return new SyncOperationProcessResult(
            SyncOperationProcessResultKind.WriteFailed,
            Response: null,
            Error: null);
    }
}

internal enum SyncChangeFeedResultKind
{
    Ok,
    InvalidRequest
}

internal sealed record SyncChangeFeedResult(
    SyncChangeFeedResultKind Kind,
    SyncChangesResponse? Response,
    string? Error)
{
    public static SyncChangeFeedResult Ok(SyncChangesResponse response)
    {
        return new SyncChangeFeedResult(
            SyncChangeFeedResultKind.Ok,
            response,
            Error: null);
    }

    public static SyncChangeFeedResult InvalidRequest(string error)
    {
        return new SyncChangeFeedResult(
            SyncChangeFeedResultKind.InvalidRequest,
            Response: null,
            error);
    }
}
