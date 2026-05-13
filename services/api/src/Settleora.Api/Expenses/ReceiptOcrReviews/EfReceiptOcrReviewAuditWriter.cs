using System.Text.Json;
using System.Text.Json.Serialization;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Persistence;

namespace Settleora.Api.Expenses.ReceiptOcrReviews;

internal sealed class EfReceiptOcrReviewAuditWriter : IReceiptOcrReviewAuditWriter
{
    private const int MetadataCategoryMaxLength = 120;
    private const int SafeMetadataJsonMaxLength = 4096;
    private const string WorkflowName = "receipt_ocr_review_intake";

    private static readonly JsonSerializerOptions MetadataJsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly SettleoraDbContext dbContext;

    public EfReceiptOcrReviewAuditWriter(SettleoraDbContext dbContext)
    {
        this.dbContext = dbContext;
    }

    public ValueTask WriteAsync(
        ReceiptOcrReviewAuditEvent auditEvent,
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

    private static string CreateSafeMetadataJson(ReceiptOcrReviewAuditEvent auditEvent)
    {
        var metadata = new ReceiptOcrReviewAuditMetadata(
            WorkflowName,
            auditEvent.BillId.ToString("D"),
            auditEvent.GroupId?.ToString("D"),
            RequireSafeMetadataCategory(auditEvent.GroupMode, nameof(auditEvent.GroupMode)),
            RequireSafeMetadataCategory(auditEvent.BillStatus, nameof(auditEvent.BillStatus)),
            auditEvent.FileObjectId.ToString("D"),
            auditEvent.ReceiptOcrReviewId.ToString("D"),
            RequireSafeMetadataCategory(auditEvent.AttachmentPurpose, nameof(auditEvent.AttachmentPurpose)),
            RequireSafeMetadataCategory(auditEvent.OcrReviewStatus, nameof(auditEvent.OcrReviewStatus)),
            RequireSafeMetadataCategory(auditEvent.OcrReviewSource, nameof(auditEvent.OcrReviewSource)),
            RequireSafeLineCount(auditEvent.LineCount, nameof(auditEvent.LineCount)),
            auditEvent.Currency is null
                ? null
                : RequireSafeMetadataCategory(auditEvent.Currency, nameof(auditEvent.Currency)),
            RequireSafeMetadataCategory(auditEvent.ActionCategory, nameof(auditEvent.ActionCategory)),
            auditEvent.ApplyMode is null
                ? null
                : RequireSafeMetadataCategory(auditEvent.ApplyMode, nameof(auditEvent.ApplyMode)));

        var json = JsonSerializer.Serialize(metadata, MetadataJsonOptions);
        if (json.Length > SafeMetadataJsonMaxLength)
        {
            throw new InvalidOperationException("Receipt OCR review audit metadata exceeded the bounded safe metadata length.");
        }

        return json;
    }

    private static int RequireSafeLineCount(int value, string name)
    {
        if (value is < 0 or > ReceiptOcrReviewConstraints.MaxLineCount)
        {
            throw new InvalidOperationException($"Receipt OCR review audit metadata count '{name}' is outside the allowed range.");
        }

        return value;
    }

    private static string RequireSafeMetadataCategory(string value, string name)
    {
        if (value.Length is 0 or > MetadataCategoryMaxLength)
        {
            throw new InvalidOperationException($"Receipt OCR review audit metadata category '{name}' is outside the allowed length.");
        }

        foreach (var character in value)
        {
            if (!IsSafeMetadataCategoryCharacter(character))
            {
                throw new InvalidOperationException($"Receipt OCR review audit metadata category '{name}' contains an unsafe character.");
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

    private sealed record ReceiptOcrReviewAuditMetadata(
        string WorkflowName,
        string BillId,
        string? GroupId,
        string GroupMode,
        string BillStatus,
        string FileObjectId,
        string ReceiptOcrReviewId,
        string AttachmentPurpose,
        string OcrReviewStatus,
        string OcrReviewSource,
        int LineCount,
        string? Currency,
        string ActionCategory,
        string? ApplyMode);
}
