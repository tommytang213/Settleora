using System.Text.Json;
using System.Text.Json.Serialization;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Sync;

internal sealed class EfSyncOperationAuditWriter : ISyncOperationAuditWriter
{
    private const int MetadataCategoryMaxLength = 120;
    private const int SafeMetadataJsonMaxLength = 4096;
    private const string SyncWorkflowName = "sync_operation";

    private static readonly JsonSerializerOptions MetadataJsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly SettleoraDbContext dbContext;

    public EfSyncOperationAuditWriter(SettleoraDbContext dbContext)
    {
        this.dbContext = dbContext;
    }

    public ValueTask WriteAsync(
        SyncOperationAuditEvent auditEvent,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        dbContext.Set<AuthAuditEvent>().Add(new AuthAuditEvent
        {
            Id = Guid.NewGuid(),
            ActorAuthAccountId = auditEvent.ActorAuthAccountId,
            SubjectAuthAccountId = auditEvent.ActorAuthAccountId,
            Action = RequireSafeMetadataCategory(auditEvent.Action, nameof(auditEvent.Action)),
            Outcome = auditEvent.Status is "accepted" ? AuthAuditOutcomes.Success : AuthAuditOutcomes.Denied,
            OccurredAtUtc = auditEvent.OccurredAtUtc,
            CorrelationId = null,
            RequestId = null,
            SafeMetadataJson = CreateSafeMetadataJson(auditEvent)
        });

        return ValueTask.CompletedTask;
    }

    private static string CreateSafeMetadataJson(SyncOperationAuditEvent auditEvent)
    {
        var metadata = new SyncOperationAuditMetadata(
            SyncWorkflowName,
            auditEvent.ActorUserProfileId.ToString("D"),
            auditEvent.SyncOperationId.ToString("D"),
            RequireSafeMetadataCategory(auditEvent.OperationType, nameof(auditEvent.OperationType)),
            RequireSafeMetadataCategory(auditEvent.ResourceType, nameof(auditEvent.ResourceType)),
            auditEvent.ResourceId?.ToString("D"),
            RequireSafeMetadataCategory(auditEvent.Status, nameof(auditEvent.Status)),
            auditEvent.SafeErrorCode is null
                ? null
                : RequireSafeMetadataCategory(auditEvent.SafeErrorCode, nameof(auditEvent.SafeErrorCode)));

        var json = JsonSerializer.Serialize(metadata, MetadataJsonOptions);
        if (json.Length > SafeMetadataJsonMaxLength)
        {
            throw new InvalidOperationException("Sync operation audit metadata exceeded the bounded safe metadata length.");
        }

        return json;
    }

    private static string RequireSafeMetadataCategory(string value, string name)
    {
        if (value.Length is 0 or > MetadataCategoryMaxLength)
        {
            throw new InvalidOperationException($"Sync operation audit metadata category '{name}' is outside the allowed length.");
        }

        foreach (var character in value)
        {
            if (!IsSafeMetadataCategoryCharacter(character))
            {
                throw new InvalidOperationException($"Sync operation audit metadata category '{name}' contains an unsafe character.");
            }
        }

        return value;
    }

    private static bool IsSafeMetadataCategoryCharacter(char character)
    {
        return character is >= 'a' and <= 'z'
            or >= 'A' and <= 'Z'
            or >= '0' and <= '9'
            or '_'
            or '-'
            or '.';
    }

    private sealed record SyncOperationAuditMetadata(
        string WorkflowName,
        string ActorUserProfileId,
        string SyncOperationId,
        string OperationType,
        string ResourceType,
        string? ResourceId,
        string Status,
        string? SafeErrorCode);
}
