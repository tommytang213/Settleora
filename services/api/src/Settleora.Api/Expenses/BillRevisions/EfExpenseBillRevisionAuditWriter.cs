using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Expenses.BillRevisions;

internal sealed class EfExpenseBillRevisionAuditWriter : IExpenseBillRevisionAuditWriter
{
    private const int MetadataCategoryMaxLength = 120;
    private const int SafeMetadataJsonMaxLength = 4096;
    private const int MetadataCountMaxValue = 100_000;
    private const decimal MetadataAmountMaxValue = 999_999_999_999_999.9999m;
    private const string WorkflowName = "bill_revision_proposal";

    private static readonly JsonSerializerOptions MetadataJsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly SettleoraDbContext dbContext;

    public EfExpenseBillRevisionAuditWriter(SettleoraDbContext dbContext)
    {
        this.dbContext = dbContext;
    }

    public ValueTask WriteAsync(
        ExpenseBillRevisionAuditEvent auditEvent,
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

    private static string CreateSafeMetadataJson(ExpenseBillRevisionAuditEvent auditEvent)
    {
        var metadata = new ExpenseBillRevisionAuditMetadata(
            WorkflowName,
            auditEvent.BillId.ToString("D"),
            auditEvent.RevisionId.ToString("D"),
            auditEvent.GroupId?.ToString("D"),
            RequireSafeMetadataCategory(auditEvent.GroupMode, nameof(auditEvent.GroupMode)),
            RequireOptionalSafeMetadataCategory(auditEvent.PreviousRevisionStatus, nameof(auditEvent.PreviousRevisionStatus)),
            RequireSafeMetadataCategory(auditEvent.NewRevisionStatus, nameof(auditEvent.NewRevisionStatus)),
            auditEvent.ParticipantUserProfileId?.ToString("D"),
            RequireSafeMetadataCount(auditEvent.ParticipantCount, nameof(auditEvent.ParticipantCount)),
            RequireSafeMetadataCount(auditEvent.PendingApprovalCount, nameof(auditEvent.PendingApprovalCount)),
            RequireSafeMetadataCount(auditEvent.ApprovedCount, nameof(auditEvent.ApprovedCount)),
            RequireSafeMetadataCount(auditEvent.RejectedCount, nameof(auditEvent.RejectedCount)),
            RequireSafeMetadataCategory(auditEvent.Currency, nameof(auditEvent.Currency)),
            RequireSafeMetadataAmount(auditEvent.TotalAmount, nameof(auditEvent.TotalAmount)));

        var json = JsonSerializer.Serialize(metadata, MetadataJsonOptions);
        if (json.Length > SafeMetadataJsonMaxLength)
        {
            throw new InvalidOperationException("Bill revision audit metadata exceeded the bounded safe metadata length.");
        }

        return json;
    }

    private static int RequireSafeMetadataCount(int value, string name)
    {
        if (value is < 0 or > MetadataCountMaxValue)
        {
            throw new InvalidOperationException($"Bill revision audit metadata count '{name}' is outside the allowed range.");
        }

        return value;
    }

    private static string RequireSafeMetadataAmount(decimal value, string name)
    {
        if (value is < 0m or > MetadataAmountMaxValue)
        {
            throw new InvalidOperationException($"Bill revision audit metadata amount '{name}' is outside the allowed range.");
        }

        return value.ToString("0.####", CultureInfo.InvariantCulture);
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
            throw new InvalidOperationException($"Bill revision audit metadata category '{name}' is outside the allowed length.");
        }

        foreach (var character in value)
        {
            if (!IsSafeMetadataCategoryCharacter(character))
            {
                throw new InvalidOperationException($"Bill revision audit metadata category '{name}' contains an unsafe character.");
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

    private sealed record ExpenseBillRevisionAuditMetadata(
        string WorkflowName,
        string BillId,
        string RevisionId,
        string? GroupId,
        string GroupMode,
        string? PreviousRevisionStatus,
        string NewRevisionStatus,
        string? ParticipantUserProfileId,
        int ParticipantCount,
        int PendingApprovalCount,
        int ApprovedCount,
        int RejectedCount,
        string Currency,
        string TotalAmount);
}
