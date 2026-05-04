using System.Text.Json;
using System.Text.Json.Serialization;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Users.Groups;

internal sealed class EfGroupMembershipAuditWriter : IGroupMembershipAuditWriter
{
    private const int MetadataCategoryMaxLength = 120;
    private const int SafeMetadataJsonMaxLength = 4096;
    private const string GroupMembershipWorkflowName = "group_member_management";

    private static readonly JsonSerializerOptions MetadataJsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly SettleoraDbContext dbContext;

    public EfGroupMembershipAuditWriter(SettleoraDbContext dbContext)
    {
        this.dbContext = dbContext;
    }

    public ValueTask WriteAsync(
        GroupMembershipAuditEvent auditEvent,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        dbContext.Set<AuthAuditEvent>().Add(new AuthAuditEvent
        {
            Id = Guid.NewGuid(),
            ActorAuthAccountId = auditEvent.ActorAuthAccountId,
            SubjectAuthAccountId = auditEvent.SubjectAuthAccountId,
            Action = auditEvent.Action,
            Outcome = AuthAuditOutcomes.Success,
            OccurredAtUtc = auditEvent.OccurredAtUtc,
            CorrelationId = null,
            RequestId = null,
            SafeMetadataJson = CreateSafeMetadataJson(auditEvent)
        });

        return ValueTask.CompletedTask;
    }

    private static string CreateSafeMetadataJson(GroupMembershipAuditEvent auditEvent)
    {
        var metadata = new GroupMembershipAuditMetadata(
            GroupMembershipWorkflowName,
            auditEvent.GroupId.ToString("D"),
            auditEvent.TargetUserProfileId.ToString("D"),
            RequireOptionalSafeMetadataCategory(auditEvent.PreviousRole, nameof(auditEvent.PreviousRole)),
            RequireOptionalSafeMetadataCategory(auditEvent.NewRole, nameof(auditEvent.NewRole)),
            RequireOptionalSafeMetadataCategory(auditEvent.PreviousStatus, nameof(auditEvent.PreviousStatus)),
            RequireOptionalSafeMetadataCategory(auditEvent.NewStatus, nameof(auditEvent.NewStatus)));

        var json = JsonSerializer.Serialize(metadata, MetadataJsonOptions);
        if (json.Length > SafeMetadataJsonMaxLength)
        {
            throw new InvalidOperationException("Group membership audit metadata exceeded the bounded safe metadata length.");
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
            throw new InvalidOperationException($"Group membership audit metadata category '{name}' is outside the allowed length.");
        }

        foreach (var character in value)
        {
            if (!IsSafeMetadataCategoryCharacter(character))
            {
                throw new InvalidOperationException($"Group membership audit metadata category '{name}' contains an unsafe character.");
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

    private sealed record GroupMembershipAuditMetadata(
        string WorkflowName,
        string GroupId,
        string TargetUserProfileId,
        string? PreviousRole,
        string? NewRole,
        string? PreviousStatus,
        string? NewStatus);
}
