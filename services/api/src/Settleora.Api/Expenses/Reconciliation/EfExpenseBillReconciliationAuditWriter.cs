using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Expenses.Reconciliation;

internal sealed class EfExpenseBillReconciliationAuditWriter : IExpenseBillReconciliationAuditWriter
{
    private const int MetadataCategoryMaxLength = 120;
    private const int SafeMetadataJsonMaxLength = 4096;
    private const decimal MetadataAmountMaxValue = 999_999_999_999_999.9999m;
    private const string ReconciliationWorkflowName = "bill_reconciliation";

    private static readonly JsonSerializerOptions MetadataJsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly SettleoraDbContext dbContext;

    public EfExpenseBillReconciliationAuditWriter(SettleoraDbContext dbContext)
    {
        this.dbContext = dbContext;
    }

    public ValueTask WriteAsync(
        ExpenseBillReconciliationAuditEvent auditEvent,
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

    private static string CreateSafeMetadataJson(ExpenseBillReconciliationAuditEvent auditEvent)
    {
        var metadata = new ExpenseBillReconciliationAuditMetadata(
            ReconciliationWorkflowName,
            auditEvent.BillId.ToString("D"),
            auditEvent.GroupId?.ToString("D"),
            RequireSafeMetadataCategory(auditEvent.GroupMode, nameof(auditEvent.GroupMode)),
            RequireSafeMetadataCategory(auditEvent.BillStatus, nameof(auditEvent.BillStatus)),
            RequireSafeMetadataCategory(auditEvent.PreviousReconciliationStatus, nameof(auditEvent.PreviousReconciliationStatus)),
            RequireSafeMetadataCategory(auditEvent.NewReconciliationStatus, nameof(auditEvent.NewReconciliationStatus)),
            RequireSafeMetadataCategory(auditEvent.Currency, nameof(auditEvent.Currency)),
            RequireSafeMetadataAmount(auditEvent.TotalAmount, nameof(auditEvent.TotalAmount)));

        var json = JsonSerializer.Serialize(metadata, MetadataJsonOptions);
        if (json.Length > SafeMetadataJsonMaxLength)
        {
            throw new InvalidOperationException("Expense bill reconciliation audit metadata exceeded the bounded safe metadata length.");
        }

        return json;
    }

    private static string RequireSafeMetadataAmount(decimal value, string name)
    {
        if (value is < 0m or > MetadataAmountMaxValue)
        {
            throw new InvalidOperationException($"Expense bill reconciliation audit metadata amount '{name}' is outside the allowed range.");
        }

        return value.ToString("0.####", CultureInfo.InvariantCulture);
    }

    private static string RequireSafeMetadataCategory(string value, string name)
    {
        if (value.Length is 0 or > MetadataCategoryMaxLength)
        {
            throw new InvalidOperationException($"Expense bill reconciliation audit metadata category '{name}' is outside the allowed length.");
        }

        foreach (var character in value)
        {
            if (!IsSafeMetadataCategoryCharacter(character))
            {
                throw new InvalidOperationException($"Expense bill reconciliation audit metadata category '{name}' contains an unsafe character.");
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

    private sealed record ExpenseBillReconciliationAuditMetadata(
        string WorkflowName,
        string BillId,
        string? GroupId,
        string GroupMode,
        string BillStatus,
        string PreviousReconciliationStatus,
        string NewReconciliationStatus,
        string Currency,
        string TotalAmount);
}
