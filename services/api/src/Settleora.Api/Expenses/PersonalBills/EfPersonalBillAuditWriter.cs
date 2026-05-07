using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Expenses.PersonalBills;

internal sealed class EfPersonalBillAuditWriter : IPersonalBillAuditWriter
{
    private const int MetadataCategoryMaxLength = 120;
    private const int SafeMetadataJsonMaxLength = 4096;
    private const int MetadataCountMaxValue = 100_000;
    private const decimal MetadataAmountMaxValue = 999_999_999_999_999.9999m;
    private const string PersonalBillWorkflowName = "personal_bill";

    private static readonly JsonSerializerOptions MetadataJsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly SettleoraDbContext dbContext;

    public EfPersonalBillAuditWriter(SettleoraDbContext dbContext)
    {
        this.dbContext = dbContext;
    }

    public ValueTask WriteAsync(
        PersonalBillAuditEvent auditEvent,
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

    private static string CreateSafeMetadataJson(PersonalBillAuditEvent auditEvent)
    {
        var metadata = new PersonalBillAuditMetadata(
            PersonalBillWorkflowName,
            auditEvent.BillId.ToString("D"),
            RequireSafeMetadataCategory(auditEvent.GroupMode, nameof(auditEvent.GroupMode)),
            RequireSafeMetadataCategory(auditEvent.Status, nameof(auditEvent.Status)),
            RequireSafeMetadataCount(auditEvent.ItemCount, nameof(auditEvent.ItemCount)),
            RequireSafeMetadataCount(auditEvent.AdjustmentCount, nameof(auditEvent.AdjustmentCount)),
            RequireSafeMetadataCount(auditEvent.ParticipantCount, nameof(auditEvent.ParticipantCount)),
            RequireSafeMetadataCategory(auditEvent.Currency, nameof(auditEvent.Currency)),
            RequireSafeMetadataAmount(auditEvent.TotalAmount, nameof(auditEvent.TotalAmount)));

        var json = JsonSerializer.Serialize(metadata, MetadataJsonOptions);
        if (json.Length > SafeMetadataJsonMaxLength)
        {
            throw new InvalidOperationException("Personal bill audit metadata exceeded the bounded safe metadata length.");
        }

        return json;
    }

    private static int RequireSafeMetadataCount(int value, string name)
    {
        if (value is < 0 or > MetadataCountMaxValue)
        {
            throw new InvalidOperationException($"Personal bill audit metadata count '{name}' is outside the allowed range.");
        }

        return value;
    }

    private static string RequireSafeMetadataAmount(decimal value, string name)
    {
        if (value is < 0m or > MetadataAmountMaxValue)
        {
            throw new InvalidOperationException($"Personal bill audit metadata amount '{name}' is outside the allowed range.");
        }

        return value.ToString("0.####", CultureInfo.InvariantCulture);
    }

    private static string RequireSafeMetadataCategory(string value, string name)
    {
        if (value.Length is 0 or > MetadataCategoryMaxLength)
        {
            throw new InvalidOperationException($"Personal bill audit metadata category '{name}' is outside the allowed length.");
        }

        foreach (var character in value)
        {
            if (!IsSafeMetadataCategoryCharacter(character))
            {
                throw new InvalidOperationException($"Personal bill audit metadata category '{name}' contains an unsafe character.");
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

    private sealed record PersonalBillAuditMetadata(
        string WorkflowName,
        string BillId,
        string GroupMode,
        string Status,
        int ItemCount,
        int AdjustmentCount,
        int ParticipantCount,
        string Currency,
        string TotalAmount);
}
