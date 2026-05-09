using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Settlements;

internal sealed class EfSettlementRequestAuditWriter : ISettlementRequestAuditWriter
{
    private const int MetadataCategoryMaxLength = 120;
    private const int SafeMetadataJsonMaxLength = 4096;
    private const decimal MetadataAmountMaxValue = 999_999_999_999_999.9999m;

    private static readonly JsonSerializerOptions MetadataJsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly SettleoraDbContext dbContext;

    public EfSettlementRequestAuditWriter(SettleoraDbContext dbContext)
    {
        this.dbContext = dbContext;
    }

    public ValueTask WriteAsync(
        SettlementRequestAuditEvent auditEvent,
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

    private static string CreateSafeMetadataJson(SettlementRequestAuditEvent auditEvent)
    {
        var metadata = new SettlementRequestAuditMetadata(
            RequireSafeMetadataCategory(auditEvent.WorkflowName, nameof(auditEvent.WorkflowName)),
            auditEvent.SettlementRequestId.ToString("D"),
            auditEvent.SourceExpenseBillId.ToString("D"),
            auditEvent.GroupId?.ToString("D"),
            RequireSafeMetadataCategory(auditEvent.GroupMode, nameof(auditEvent.GroupMode)),
            auditEvent.DebtorUserProfileId.ToString("D"),
            auditEvent.CreditorUserProfileId.ToString("D"),
            RequireSafeMetadataCategory(auditEvent.Status, nameof(auditEvent.Status)),
            auditEvent.PreviousRequestStatus is null
                ? null
                : RequireSafeMetadataCategory(auditEvent.PreviousRequestStatus, nameof(auditEvent.PreviousRequestStatus)),
            auditEvent.NewRequestStatus is null
                ? null
                : RequireSafeMetadataCategory(auditEvent.NewRequestStatus, nameof(auditEvent.NewRequestStatus)),
            RequireSafeMetadataAmount(auditEvent.Amount, nameof(auditEvent.Amount)),
            RequireSafeMetadataCategory(auditEvent.Currency, nameof(auditEvent.Currency)),
            RequireSafeMetadataCategory(auditEvent.CandidateBasis, nameof(auditEvent.CandidateBasis)));

        var json = JsonSerializer.Serialize(metadata, MetadataJsonOptions);
        if (json.Length > SafeMetadataJsonMaxLength)
        {
            throw new InvalidOperationException("Settlement request audit metadata exceeded the bounded safe metadata length.");
        }

        return json;
    }

    private static string RequireSafeMetadataAmount(decimal value, string name)
    {
        if (value is <= 0m or > MetadataAmountMaxValue)
        {
            throw new InvalidOperationException($"Settlement request audit metadata amount '{name}' is outside the allowed range.");
        }

        return value.ToString("0.####", CultureInfo.InvariantCulture);
    }

    private static string RequireSafeMetadataCategory(string value, string name)
    {
        if (value.Length is 0 or > MetadataCategoryMaxLength)
        {
            throw new InvalidOperationException($"Settlement request audit metadata category '{name}' is outside the allowed length.");
        }

        foreach (var character in value)
        {
            if (!IsSafeMetadataCategoryCharacter(character))
            {
                throw new InvalidOperationException($"Settlement request audit metadata category '{name}' contains an unsafe character.");
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

    private sealed record SettlementRequestAuditMetadata(
        string WorkflowName,
        string SettlementRequestId,
        string SourceExpenseBillId,
        string? GroupId,
        string GroupMode,
        string DebtorUserProfileId,
        string CreditorUserProfileId,
        string RequestStatus,
        string? PreviousRequestStatus,
        string? NewRequestStatus,
        string Amount,
        string Currency,
        string CandidateBasis);
}
