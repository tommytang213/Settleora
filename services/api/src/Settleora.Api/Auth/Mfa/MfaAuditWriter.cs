using System.Text.Json;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Auth.Mfa;

internal interface IMfaAuditWriter
{
    ValueTask WriteAsync(MfaAuditEvent auditEvent, CancellationToken cancellationToken);
}

internal sealed record MfaAuditEvent(
    string Action,
    string Outcome,
    Guid? ActorAuthAccountId,
    Guid? SubjectAuthAccountId,
    Guid? MfaFactorId,
    Guid? RecoveryCodeBatchId,
    Guid? ChallengeId,
    string FactorType,
    string ReasonCategory,
    DateTimeOffset OccurredAtUtc);

internal sealed class EfMfaAuditWriter : IMfaAuditWriter
{
    private const string WorkflowName = "totp_recovery_code_runtime";
    private readonly SettleoraDbContext dbContext;

    public EfMfaAuditWriter(SettleoraDbContext dbContext)
    {
        this.dbContext = dbContext;
    }

    public ValueTask WriteAsync(MfaAuditEvent auditEvent, CancellationToken cancellationToken)
    {
        dbContext.Set<AuthAuditEvent>().Add(new AuthAuditEvent
        {
            Id = Guid.NewGuid(),
            ActorAuthAccountId = auditEvent.ActorAuthAccountId,
            SubjectAuthAccountId = auditEvent.SubjectAuthAccountId,
            Action = auditEvent.Action,
            Outcome = auditEvent.Outcome,
            OccurredAtUtc = auditEvent.OccurredAtUtc,
            SafeMetadataJson = JsonSerializer.Serialize(
                new
                {
                    workflowName = WorkflowName,
                    mfaFactorId = auditEvent.MfaFactorId,
                    recoveryCodeBatchId = auditEvent.RecoveryCodeBatchId,
                    challengeId = auditEvent.ChallengeId,
                    factorType = Bound(auditEvent.FactorType, 32),
                    reasonCategory = Bound(auditEvent.ReasonCategory, 120)
                },
                new JsonSerializerOptions(JsonSerializerDefaults.Web))
        });
        return ValueTask.CompletedTask;
    }

    private static string Bound(string value, int maxLength)
    {
        var trimmed = string.IsNullOrWhiteSpace(value) ? "unspecified" : value.Trim();
        return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength];
    }
}
