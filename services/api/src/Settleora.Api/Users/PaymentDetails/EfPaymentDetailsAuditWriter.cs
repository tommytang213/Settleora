using System.Text.Json;
using System.Text.Json.Serialization;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Users.PaymentDetails;

internal sealed class EfPaymentDetailsAuditWriter : IPaymentDetailsAuditWriter
{
    private const int MetadataCategoryMaxLength = 120;
    private const int SafeMetadataJsonMaxLength = 4096;
    private static readonly JsonSerializerOptions MetadataJsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly SettleoraDbContext dbContext;

    public EfPaymentDetailsAuditWriter(SettleoraDbContext dbContext)
    {
        this.dbContext = dbContext;
    }

    public ValueTask WriteAsync(
        PaymentDetailsAuditEvent auditEvent,
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

    private static string CreateSafeMetadataJson(PaymentDetailsAuditEvent auditEvent)
    {
        var metadata = new PaymentDetailsAuditMetadata(
            RequireSafeMetadataCategory(auditEvent.WorkflowName, nameof(auditEvent.WorkflowName)),
            auditEvent.PaymentProfileId?.ToString("D"),
            auditEvent.RowCreated,
            auditEvent.FieldsChanged
                .Select(field => RequireSafeMetadataCategory(field, nameof(auditEvent.FieldsChanged)))
                .Order(StringComparer.Ordinal)
                .ToArray(),
            RequireOptionalSafeMetadataCategory(auditEvent.PreviousVisibility, nameof(auditEvent.PreviousVisibility)),
            RequireOptionalSafeMetadataCategory(auditEvent.NewVisibility, nameof(auditEvent.NewVisibility)),
            auditEvent.QrFileObjectId?.ToString("D"),
            RequireOptionalSafeMetadataCategory(auditEvent.ChangeCategory, nameof(auditEvent.ChangeCategory)),
            auditEvent.SettlementRequestId?.ToString("D"),
            auditEvent.ActorUserProfileId?.ToString("D"),
            auditEvent.TargetUserProfileId?.ToString("D"),
            auditEvent.GroupId?.ToString("D"),
            RequireOptionalSafeMetadataCategory(auditEvent.GroupMode, nameof(auditEvent.GroupMode)),
            RequireOptionalSafeMetadataCategory(auditEvent.Relationship, nameof(auditEvent.Relationship)),
            auditEvent.IsConfigured);

        var json = JsonSerializer.Serialize(metadata, MetadataJsonOptions);
        if (json.Length > SafeMetadataJsonMaxLength)
        {
            throw new InvalidOperationException("Payment details audit metadata exceeded the bounded safe metadata length.");
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
            throw new InvalidOperationException($"Payment details audit metadata category '{name}' is outside the allowed length.");
        }

        foreach (var character in value)
        {
            if (!IsSafeMetadataCategoryCharacter(character))
            {
                throw new InvalidOperationException($"Payment details audit metadata category '{name}' contains an unsafe character.");
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

    private sealed record PaymentDetailsAuditMetadata(
        string WorkflowName,
        string? PaymentProfileId,
        bool RowCreated,
        IReadOnlyList<string> FieldsChanged,
        string? PreviousVisibility,
        string? NewVisibility,
        string? QrFileObjectId,
        string? ChangeCategory,
        string? SettlementRequestId,
        string? ActorUserProfileId,
        string? TargetUserProfileId,
        string? GroupId,
        string? GroupMode,
        string? Relationship,
        bool? IsConfigured);
}
