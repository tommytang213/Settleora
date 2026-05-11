using System.Text.Json;
using System.Text.Json.Serialization;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Expenses.BillAttachments;

internal sealed class EfExpenseBillAttachmentAuditWriter : IExpenseBillAttachmentAuditWriter
{
    private const int MetadataCategoryMaxLength = 120;
    private const int SafeMetadataJsonMaxLength = 4096;
    private const long MetadataSizeBytesMaxValue = 5 * 1024 * 1024;
    private const string WorkflowName = "bill_attachment_file";

    private static readonly JsonSerializerOptions MetadataJsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly SettleoraDbContext dbContext;

    public EfExpenseBillAttachmentAuditWriter(SettleoraDbContext dbContext)
    {
        this.dbContext = dbContext;
    }

    public ValueTask WriteAsync(
        ExpenseBillAttachmentAuditEvent auditEvent,
        CancellationToken cancellationToken = default)
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

    private static string CreateSafeMetadataJson(ExpenseBillAttachmentAuditEvent auditEvent)
    {
        var metadata = new ExpenseBillAttachmentAuditMetadata(
            WorkflowName,
            auditEvent.BillId.ToString("D"),
            auditEvent.GroupId?.ToString("D"),
            RequireSafeMetadataCategory(auditEvent.GroupMode, nameof(auditEvent.GroupMode)),
            RequireSafeMetadataCategory(auditEvent.BillStatus, nameof(auditEvent.BillStatus)),
            auditEvent.FileObjectId.ToString("D"),
            RequireSafeMetadataCategory(auditEvent.AttachmentPurpose, nameof(auditEvent.AttachmentPurpose)),
            RequireSafeMetadataCategory(auditEvent.FilePurpose, nameof(auditEvent.FilePurpose)),
            RequireSafeMetadataCategory(auditEvent.ContentType, nameof(auditEvent.ContentType)),
            RequireSafeMetadataSizeBytes(auditEvent.SizeBytes, nameof(auditEvent.SizeBytes)),
            RequireSafeMetadataCategory(auditEvent.ActionCategory, nameof(auditEvent.ActionCategory)));

        var json = JsonSerializer.Serialize(metadata, MetadataJsonOptions);
        if (json.Length > SafeMetadataJsonMaxLength)
        {
            throw new InvalidOperationException("Bill attachment audit metadata exceeded the bounded safe metadata length.");
        }

        return json;
    }

    private static long RequireSafeMetadataSizeBytes(long value, string name)
    {
        if (value is < 1 or > MetadataSizeBytesMaxValue)
        {
            throw new InvalidOperationException($"Bill attachment audit metadata size '{name}' is outside the allowed range.");
        }

        return value;
    }

    private static string RequireSafeMetadataCategory(string value, string name)
    {
        if (value.Length is 0 or > MetadataCategoryMaxLength)
        {
            throw new InvalidOperationException($"Bill attachment audit metadata category '{name}' is outside the allowed length.");
        }

        foreach (var character in value)
        {
            if (!IsSafeMetadataCategoryCharacter(character))
            {
                throw new InvalidOperationException($"Bill attachment audit metadata category '{name}' contains an unsafe character.");
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
            or '.'
            or '/';
    }

    private sealed record ExpenseBillAttachmentAuditMetadata(
        string WorkflowName,
        string BillId,
        string? GroupId,
        string GroupMode,
        string BillStatus,
        string FileObjectId,
        string AttachmentPurpose,
        string FilePurpose,
        string ContentType,
        long SizeBytes,
        string ActionCategory);
}
