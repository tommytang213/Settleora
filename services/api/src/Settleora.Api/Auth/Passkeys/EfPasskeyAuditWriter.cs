using System.Text.Json;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Auth.Passkeys;

internal interface IPasskeyAuditWriter
{
    ValueTask WriteAsync(PasskeyAuditEvent auditEvent, CancellationToken cancellationToken);
}

internal sealed record PasskeyAuditEvent(
    string Action,
    string Outcome,
    Guid? ActorAuthAccountId,
    Guid? SubjectAuthAccountId,
    Guid? PasskeyCredentialId,
    Guid? ChallengeId,
    string ReasonCategory,
    DateTimeOffset OccurredAtUtc);

internal sealed class EfPasskeyAuditWriter : IPasskeyAuditWriter
{
    private const string WorkflowName = "passkey_webauthn_runtime";

    private readonly SettleoraDbContext dbContext;

    public EfPasskeyAuditWriter(SettleoraDbContext dbContext)
    {
        this.dbContext = dbContext;
    }

    public ValueTask WriteAsync(PasskeyAuditEvent auditEvent, CancellationToken cancellationToken)
    {
        dbContext.Set<AuthAuditEvent>().Add(new AuthAuditEvent
        {
            Id = Guid.NewGuid(),
            ActorAuthAccountId = auditEvent.ActorAuthAccountId,
            SubjectAuthAccountId = auditEvent.SubjectAuthAccountId,
            Action = auditEvent.Action,
            Outcome = auditEvent.Outcome,
            OccurredAtUtc = auditEvent.OccurredAtUtc,
            SafeMetadataJson = CreateSafeMetadataJson(auditEvent)
        });

        return ValueTask.CompletedTask;
    }

    private static string CreateSafeMetadataJson(PasskeyAuditEvent auditEvent)
    {
        var metadata = new
        {
            workflowName = WorkflowName,
            credentialId = auditEvent.PasskeyCredentialId,
            challengeId = auditEvent.ChallengeId,
            factorType = "passkey",
            reasonCategory = Bound(auditEvent.ReasonCategory, 120)
        };

        return JsonSerializer.Serialize(metadata, new JsonSerializerOptions(JsonSerializerDefaults.Web));
    }

    private static string Bound(string value, int maxLength)
    {
        var trimmed = string.IsNullOrWhiteSpace(value) ? "unspecified" : value.Trim();
        return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength];
    }
}
