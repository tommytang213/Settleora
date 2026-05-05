using System.Text.Json;
using System.Text.Json.Serialization;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Storage;

internal sealed class EfFileObjectLifecycleAuditWriter : IFileObjectLifecycleAuditWriter
{
    private const int MetadataCategoryMaxLength = 120;
    private const int SafeMetadataJsonMaxLength = 4096;
    private const string FileObjectLifecycleWorkflowName = "file_object_lifecycle";

    private static readonly JsonSerializerOptions MetadataJsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly SettleoraDbContext dbContext;

    public EfFileObjectLifecycleAuditWriter(SettleoraDbContext dbContext)
    {
        this.dbContext = dbContext;
    }

    public ValueTask WriteAsync(
        FileObjectLifecycleAuditEvent auditEvent,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        dbContext.Set<AuthAuditEvent>().Add(new AuthAuditEvent
        {
            Id = Guid.NewGuid(),
            ActorAuthAccountId = auditEvent.ActorAuthAccountId,
            SubjectAuthAccountId = auditEvent.SubjectAuthAccountId,
            Action = RequireSafeMetadataCategory(auditEvent.Action, nameof(auditEvent.Action)),
            Outcome = AuthAuditOutcomes.Success,
            OccurredAtUtc = auditEvent.OccurredAtUtc,
            CorrelationId = null,
            RequestId = null,
            SafeMetadataJson = CreateSafeMetadataJson(auditEvent)
        });

        return ValueTask.CompletedTask;
    }

    private static string CreateSafeMetadataJson(FileObjectLifecycleAuditEvent auditEvent)
    {
        var metadata = new FileObjectLifecycleAuditMetadata(
            FileObjectLifecycleWorkflowName,
            auditEvent.FileObjectId.ToString("D"),
            RequireSafeMetadataCategory(auditEvent.Purpose, nameof(auditEvent.Purpose)),
            RequireOptionalSafeMetadataCategory(auditEvent.PreviousStatus, nameof(auditEvent.PreviousStatus)),
            RequireSafeMetadataCategory(auditEvent.NewStatus, nameof(auditEvent.NewStatus)),
            RequireSafeMetadataCategory(auditEvent.StorageProvider, nameof(auditEvent.StorageProvider)),
            auditEvent.RowCreated);

        var json = JsonSerializer.Serialize(metadata, MetadataJsonOptions);
        if (json.Length > SafeMetadataJsonMaxLength)
        {
            throw new InvalidOperationException("File lifecycle audit metadata exceeded the bounded safe metadata length.");
        }

        return json;
    }

    private static string? RequireOptionalSafeMetadataCategory(string? value, string name)
    {
        return value is null
            ? null
            : RequireSafeMetadataCategory(value, name);
    }

    private static string RequireSafeMetadataCategory(string value, string name)
    {
        if (value.Length is 0 or > MetadataCategoryMaxLength)
        {
            throw new InvalidOperationException($"File lifecycle audit metadata category '{name}' is outside the allowed length.");
        }

        foreach (var character in value)
        {
            if (!IsSafeMetadataCategoryCharacter(character))
            {
                throw new InvalidOperationException($"File lifecycle audit metadata category '{name}' contains an unsafe character.");
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

    private sealed record FileObjectLifecycleAuditMetadata(
        string WorkflowName,
        string FileObjectId,
        string Purpose,
        string? PreviousStatus,
        string NewStatus,
        string StorageProvider,
        bool RowCreated);
}
