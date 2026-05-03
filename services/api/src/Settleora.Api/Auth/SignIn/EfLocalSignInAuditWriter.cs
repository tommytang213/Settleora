using System.Text.Json;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Auth.SignIn;

internal sealed class EfLocalSignInAuditWriter : ILocalSignInAuditWriter
{
    private const int MetadataCategoryMaxLength = 120;
    private const int SafeMetadataJsonMaxLength = 4096;

    private static readonly JsonSerializerOptions MetadataJsonOptions = new(JsonSerializerDefaults.Web);

    private readonly SettleoraDbContext dbContext;

    public EfLocalSignInAuditWriter(SettleoraDbContext dbContext)
    {
        this.dbContext = dbContext;
    }

    public ValueTask WriteAsync(LocalSignInAuditEvent auditEvent, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        dbContext.Set<AuthAuditEvent>().Add(new AuthAuditEvent
        {
            Id = Guid.NewGuid(),
            ActorAuthAccountId = auditEvent.ActorAuthAccountId,
            SubjectAuthAccountId = auditEvent.SubjectAuthAccountId,
            Action = auditEvent.Action,
            Outcome = auditEvent.Outcome,
            OccurredAtUtc = auditEvent.OccurredAtUtc,
            CorrelationId = null,
            RequestId = null,
            SafeMetadataJson = CreateSafeMetadataJson(auditEvent)
        });

        return ValueTask.CompletedTask;
    }

    private static string CreateSafeMetadataJson(LocalSignInAuditEvent auditEvent)
    {
        var metadata = new LocalSignInAuditMetadata(
            RequireSafeMetadataCategory(auditEvent.WorkflowName, nameof(auditEvent.WorkflowName)),
            RequireSafeMetadataCategory(auditEvent.StatusCategory.ToString(), nameof(auditEvent.StatusCategory)),
            RequireSafeMetadataCategory(auditEvent.PolicyStatus.ToString(), nameof(auditEvent.PolicyStatus)));

        var json = JsonSerializer.Serialize(metadata, MetadataJsonOptions);
        if (json.Length > SafeMetadataJsonMaxLength)
        {
            throw new InvalidOperationException("Local sign-in audit metadata exceeded the bounded safe metadata length.");
        }

        return json;
    }

    private static string RequireSafeMetadataCategory(string value, string name)
    {
        if (value.Length is 0 or > MetadataCategoryMaxLength)
        {
            throw new InvalidOperationException($"Local sign-in audit metadata category '{name}' is outside the allowed length.");
        }

        foreach (var character in value)
        {
            if (!IsSafeMetadataCategoryCharacter(character))
            {
                throw new InvalidOperationException($"Local sign-in audit metadata category '{name}' contains an unsafe character.");
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

    private sealed record LocalSignInAuditMetadata(
        string WorkflowName,
        string StatusCategory,
        string PolicyStatus);
}
