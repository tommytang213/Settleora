using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Expenses.BillWorkflow;

internal sealed class EfExpenseBillWorkflowAuditWriter : IExpenseBillWorkflowAuditWriter
{
    private const int MetadataCategoryMaxLength = 120;
    private const int SafeMetadataJsonMaxLength = 4096;
    private const int MetadataCountMaxValue = 100_000;
    private const decimal MetadataAmountMaxValue = 999_999_999_999_999.9999m;
    private const string WorkflowName = "bill_submit_acknowledgement";

    private static readonly JsonSerializerOptions MetadataJsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly SettleoraDbContext dbContext;

    public EfExpenseBillWorkflowAuditWriter(SettleoraDbContext dbContext)
    {
        this.dbContext = dbContext;
    }

    public ValueTask WriteAsync(
        ExpenseBillWorkflowAuditEvent auditEvent,
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

    private static string CreateSafeMetadataJson(ExpenseBillWorkflowAuditEvent auditEvent)
    {
        var metadata = new ExpenseBillWorkflowAuditMetadata(
            WorkflowName,
            auditEvent.BillId.ToString("D"),
            auditEvent.GroupId?.ToString("D"),
            RequireSafeMetadataCategory(auditEvent.GroupMode, nameof(auditEvent.GroupMode)),
            RequireSafeMetadataCategory(auditEvent.PreviousBillStatus, nameof(auditEvent.PreviousBillStatus)),
            RequireSafeMetadataCategory(auditEvent.NewBillStatus, nameof(auditEvent.NewBillStatus)),
            RequireOptionalSafeMetadataCategory(auditEvent.PreviousParticipantStatus, nameof(auditEvent.PreviousParticipantStatus)),
            RequireOptionalSafeMetadataCategory(auditEvent.NewParticipantStatus, nameof(auditEvent.NewParticipantStatus)),
            auditEvent.ParticipantUserProfileId?.ToString("D"),
            RequireSafeMetadataCount(auditEvent.ParticipantCount, nameof(auditEvent.ParticipantCount)),
            RequireSafeMetadataCount(auditEvent.AcceptedCount, nameof(auditEvent.AcceptedCount)),
            RequireSafeMetadataCount(auditEvent.RejectedCount, nameof(auditEvent.RejectedCount)),
            RequireSafeMetadataCategory(auditEvent.Currency, nameof(auditEvent.Currency)),
            RequireSafeMetadataAmount(auditEvent.TotalAmount, nameof(auditEvent.TotalAmount)),
            RequireOptionalSafeMetadataCategory(auditEvent.RejectionReasonCode, nameof(auditEvent.RejectionReasonCode)));

        var json = JsonSerializer.Serialize(metadata, MetadataJsonOptions);
        if (json.Length > SafeMetadataJsonMaxLength)
        {
            throw new InvalidOperationException("Bill workflow audit metadata exceeded the bounded safe metadata length.");
        }

        return json;
    }

    private static int RequireSafeMetadataCount(int value, string name)
    {
        if (value is < 0 or > MetadataCountMaxValue)
        {
            throw new InvalidOperationException($"Bill workflow audit metadata count '{name}' is outside the allowed range.");
        }

        return value;
    }

    private static string RequireSafeMetadataAmount(decimal value, string name)
    {
        if (value is < 0m or > MetadataAmountMaxValue)
        {
            throw new InvalidOperationException($"Bill workflow audit metadata amount '{name}' is outside the allowed range.");
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
            throw new InvalidOperationException($"Bill workflow audit metadata category '{name}' is outside the allowed length.");
        }

        foreach (var character in value)
        {
            if (!IsSafeMetadataCategoryCharacter(character))
            {
                throw new InvalidOperationException($"Bill workflow audit metadata category '{name}' contains an unsafe character.");
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

    private sealed record ExpenseBillWorkflowAuditMetadata(
        string WorkflowName,
        string BillId,
        string? GroupId,
        string GroupMode,
        string PreviousBillStatus,
        string NewBillStatus,
        string? PreviousParticipantStatus,
        string? NewParticipantStatus,
        string? ParticipantUserProfileId,
        int ParticipantCount,
        int AcceptedCount,
        int RejectedCount,
        string Currency,
        string TotalAmount,
        string? RejectionReasonCode);
}
