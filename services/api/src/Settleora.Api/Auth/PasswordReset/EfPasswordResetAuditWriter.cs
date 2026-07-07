using System.Text.Json;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Auth.PasswordReset;

internal sealed class EfPasswordResetAuditWriter : IPasswordResetAuditWriter
{
    private const string WorkflowName = "local_password_reset";
    private const int MetadataCategoryMaxLength = 120;
    private const int SafeMetadataJsonMaxLength = 4096;

    private static readonly JsonSerializerOptions MetadataJsonOptions = new(JsonSerializerDefaults.Web);

    private readonly SettleoraDbContext dbContext;

    public EfPasswordResetAuditWriter(SettleoraDbContext dbContext)
    {
        this.dbContext = dbContext;
    }

    public ValueTask WriteAsync(
        PasswordResetAuditEvent auditEvent,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        dbContext.Set<AuthAuditEvent>().Add(new AuthAuditEvent
        {
            Id = Guid.NewGuid(),
            ActorAuthAccountId = null,
            SubjectAuthAccountId = null,
            Action = auditEvent.Action,
            Outcome = auditEvent.Outcome,
            OccurredAtUtc = auditEvent.OccurredAtUtc,
            CorrelationId = NormalizeOptionalCategory(auditEvent.CorrelationId),
            RequestId = null,
            SafeMetadataJson = CreateSafeMetadataJson(auditEvent)
        });

        return ValueTask.CompletedTask;
    }

    private static string CreateSafeMetadataJson(PasswordResetAuditEvent auditEvent)
    {
        var metadata = new PasswordResetAuditMetadata(
            WorkflowName,
            RequireSafeMetadataCategory(auditEvent.StatusCategory, nameof(auditEvent.StatusCategory)));

        var json = JsonSerializer.Serialize(metadata, MetadataJsonOptions);
        if (json.Length > SafeMetadataJsonMaxLength)
        {
            throw new InvalidOperationException("Password reset audit metadata exceeded the bounded safe metadata length.");
        }

        return json;
    }

    private static string RequireSafeMetadataCategory(string value, string name)
    {
        var normalized = NormalizeOptionalCategory(value);
        if (normalized is null)
        {
            throw new InvalidOperationException($"Password reset audit metadata category '{name}' is required.");
        }

        return normalized;
    }

    private static string? NormalizeOptionalCategory(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var normalized = value.Trim();
        if (normalized.Length is 0 or > MetadataCategoryMaxLength)
        {
            throw new InvalidOperationException("Password reset audit metadata category is outside the allowed length.");
        }

        foreach (var character in normalized)
        {
            if (!IsSafeMetadataCategoryCharacter(character))
            {
                throw new InvalidOperationException("Password reset audit metadata category contains an unsafe character.");
            }
        }

        return normalized;
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

    private sealed record PasswordResetAuditMetadata(
        string WorkflowName,
        string StatusCategory);
}
