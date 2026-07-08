using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Auth.Invitations;

internal sealed class InvitationPolicyService : IInvitationPolicyService
{
    private const string DefaultPolicyVersion = "default-v1";
    private const string PolicyChangedAction = "invitation.policy_changed";
    private const int SafeMetadataJsonMaxLength = 4096;

    private static readonly string[] SupportedContactIdentifierKinds = [AuthInvitationContactIdentifierKinds.Email];
    private static readonly string[] SupportedTargetSystemRoles = [SystemRoles.User];
    private static readonly JsonSerializerOptions MetadataJsonOptions = new(JsonSerializerDefaults.Web);

    private readonly SettleoraDbContext dbContext;
    private readonly TimeProvider timeProvider;

    public InvitationPolicyService(SettleoraDbContext dbContext, TimeProvider timeProvider)
    {
        this.dbContext = dbContext;
        this.timeProvider = timeProvider;
    }

    public async Task<InvitationCapabilityReadoutResponse> GetCapabilityReadoutAsync(
        AuthenticatedActor actor,
        CancellationToken cancellationToken)
    {
        var policy = await LoadActivePolicyAsync(cancellationToken);
        return new InvitationCapabilityReadoutResponse(BuildCapability(policy, IsOwnerOrAdmin(actor)));
    }

    public async Task<AdminInvitationPolicyReadoutResponse> GetAdminPolicyReadoutAsync(
        AuthenticatedActor actor,
        CancellationToken cancellationToken)
    {
        var policy = await LoadActivePolicyAsync(cancellationToken);
        return BuildAdminReadout(policy, IsOwnerOrAdmin(actor));
    }

    public async Task<InvitationPolicyUpdateResult> UpdatePolicyAsync(
        AuthenticatedActor actor,
        AdminInvitationPolicyUpdateRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(actor);
        ArgumentNullException.ThrowIfNull(request);

        var current = await LoadActivePolicyAsync(cancellationToken);
        var priorCapabilityState = current?.CapabilityState ?? AuthInvitationCapabilityStates.Disabled;
        var priorGrace = current?.PendingInviteGraceWhenDisabled ?? false;
        var nextCapabilityState = request.CapabilityState ?? priorCapabilityState;
        var nextGrace = request.PendingInviteGraceWhenDisabled ?? priorGrace;

        if (!IsSupportedCapabilityState(nextCapabilityState))
        {
            throw new InvalidInvitationPolicyRequestException("Unsupported invitation capability state.");
        }

        if (string.Equals(priorCapabilityState, nextCapabilityState, StringComparison.Ordinal)
            && priorGrace == nextGrace
            && current is not null)
        {
            return new InvitationPolicyUpdateResult(BuildAdminReadout(current, canManage: true), AuditWritten: false);
        }

        var occurredAtUtc = timeProvider.GetUtcNow();
        var nextVersion = await NextPolicyVersionAsync(cancellationToken);

        if (current is not null)
        {
            current.Status = AuthInvitationPolicyStatuses.Retired;
            current.RetiredAtUtc = occurredAtUtc;
            current.UpdatedAtUtc = occurredAtUtc;
        }

        var nextPolicy = new AuthInvitationPolicy
        {
            Id = Guid.NewGuid(),
            PolicyVersion = nextVersion,
            Status = AuthInvitationPolicyStatuses.Active,
            CapabilityState = nextCapabilityState,
            PendingInviteGraceWhenDisabled = nextGrace,
            CreatedAtUtc = occurredAtUtc,
            UpdatedAtUtc = occurredAtUtc,
            ChangedByAuthAccountId = actor.AuthAccountId
        };

        dbContext.Set<AuthInvitationPolicy>().Add(nextPolicy);
        dbContext.Set<AuthAuditEvent>().Add(new AuthAuditEvent
        {
            Id = Guid.NewGuid(),
            ActorAuthAccountId = actor.AuthAccountId,
            SubjectAuthAccountId = null,
            Action = PolicyChangedAction,
            Outcome = AuthAuditOutcomes.Success,
            OccurredAtUtc = occurredAtUtc,
            CorrelationId = null,
            RequestId = null,
            SafeMetadataJson = CreatePolicyChangeMetadata(
                priorCapabilityState,
                nextCapabilityState,
                priorGrace,
                nextGrace,
                nextVersion)
        });

        await dbContext.SaveChangesAsync(cancellationToken);
        return new InvitationPolicyUpdateResult(BuildAdminReadout(nextPolicy, canManage: true), AuditWritten: true);
    }

    private async Task<AuthInvitationPolicy?> LoadActivePolicyAsync(CancellationToken cancellationToken)
    {
        return await dbContext.Set<AuthInvitationPolicy>()
            .AsNoTracking()
            .Where(policy => policy.Status == AuthInvitationPolicyStatuses.Active
                && policy.RetiredAtUtc == null)
            .OrderByDescending(policy => policy.PolicyVersion)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private async Task<int> NextPolicyVersionAsync(CancellationToken cancellationToken)
    {
        var latest = await dbContext.Set<AuthInvitationPolicy>()
            .AsNoTracking()
            .Select(policy => (int?)policy.PolicyVersion)
            .MaxAsync(cancellationToken);
        return latest.GetValueOrDefault() + 1;
    }

    private static AdminInvitationPolicyReadoutResponse BuildAdminReadout(
        AuthInvitationPolicy? policy,
        bool canManage)
    {
        return new AdminInvitationPolicyReadoutResponse(
            BuildCapability(policy, canManage),
            policy is null ? DefaultPolicyVersion : $"policy-v{policy.PolicyVersion}",
            policy?.UpdatedAtUtc);
    }

    private static InvitationCapabilityReadout BuildCapability(AuthInvitationPolicy? policy, bool canManage)
    {
        var capabilityState = policy?.CapabilityState ?? AuthInvitationCapabilityStates.Disabled;
        var pendingGrace = policy?.PendingInviteGraceWhenDisabled ?? false;
        var enabled = capabilityState == AuthInvitationCapabilityStates.Enabled;

        return new InvitationCapabilityReadout(
            capabilityState,
            DefaultState: AuthInvitationCapabilityStates.Disabled,
            CanCurrentActorManageInvitations: canManage,
            CanCurrentActorCreateInvitations: canManage && enabled,
            CanCurrentActorMutatePolicy: canManage,
            PublicAcceptEnabled: enabled || pendingGrace,
            PendingInviteGraceWhenDisabled: pendingGrace,
            SupportedContactIdentifierKinds,
            SupportedTargetSystemRoles,
            DeliveryReadiness: "unconfigured",
            ReadoutCategory: policy is null
                ? "default_disabled"
                : enabled ? "enabled_by_admin_policy" : "disabled_by_admin_policy");
    }

    private static bool IsOwnerOrAdmin(AuthenticatedActor actor)
    {
        return actor.SystemRoles.Contains(SystemRoles.Owner, StringComparer.Ordinal)
            || actor.SystemRoles.Contains(SystemRoles.Admin, StringComparer.Ordinal);
    }

    private static bool IsSupportedCapabilityState(string value)
    {
        return value is AuthInvitationCapabilityStates.Disabled or AuthInvitationCapabilityStates.Enabled;
    }

    private static string CreatePolicyChangeMetadata(
        string priorCapabilityState,
        string newCapabilityState,
        bool priorPendingInviteGraceWhenDisabled,
        bool newPendingInviteGraceWhenDisabled,
        int policyVersion)
    {
        var json = JsonSerializer.Serialize(
            new InvitationPolicyAuditMetadata(
                "invitation_policy",
                "policy_changed",
                priorCapabilityState,
                newCapabilityState,
                priorPendingInviteGraceWhenDisabled,
                newPendingInviteGraceWhenDisabled,
                policyVersion),
            MetadataJsonOptions);

        if (json.Length > SafeMetadataJsonMaxLength)
        {
            throw new InvalidOperationException("Invitation policy audit metadata exceeded the bounded safe metadata length.");
        }

        return json;
    }

    private sealed record InvitationPolicyAuditMetadata(
        string WorkflowName,
        string StatusCategory,
        string PriorCapabilityState,
        string NewCapabilityState,
        bool PriorPendingInviteGraceWhenDisabled,
        bool NewPendingInviteGraceWhenDisabled,
        int PolicyVersion);
}

internal sealed class InvalidInvitationPolicyRequestException : Exception
{
    public InvalidInvitationPolicyRequestException(string message)
        : base(message)
    {
    }
}
