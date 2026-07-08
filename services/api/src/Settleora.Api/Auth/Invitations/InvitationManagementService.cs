using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Auth.Invitations;

internal sealed class InvitationManagementService : IInvitationManagementService
{
    private const int InvitationSecretByteLength = 32;
    private const int SafeMetadataJsonMaxLength = 4096;
    private const string InvitationSecretHashPrefix = "auth-invitation-sha256:v1:";
    private const string InvitationSecretHashVersion = "sha256-v1";
    private const string InvitationSecretPurpose = "auth_invitation";
    private const string WorkflowName = "auth_invitation_management";
    private const string DeliveryStateProviderUnconfigured = "provider_unconfigured";
    private const string DeliveryStateNotRequested = "not_requested";
    private const string DeliveryStateUnknown = "unknown";
    private static readonly TimeSpan InvitationLifetime = TimeSpan.FromDays(7);
    private static readonly TimeSpan TerminalCleanupDelay = TimeSpan.FromDays(90);
    private static readonly JsonSerializerOptions MetadataJsonOptions = new(JsonSerializerDefaults.Web);

    private readonly SettleoraDbContext dbContext;
    private readonly TimeProvider timeProvider;

    public InvitationManagementService(SettleoraDbContext dbContext, TimeProvider timeProvider)
    {
        this.dbContext = dbContext;
        this.timeProvider = timeProvider;
    }

    public async Task<AdminInvitationListResponse> ListInvitationsAsync(
        InvitationListFilters filters,
        CancellationToken cancellationToken)
    {
        var now = timeProvider.GetUtcNow();
        var query = dbContext.Set<AuthInvitation>()
            .AsNoTracking()
            .AsQueryable();

        if (!string.IsNullOrEmpty(filters.Status))
        {
            query = query.Where(invitation => invitation.Status == filters.Status);
        }

        if (!string.IsNullOrEmpty(filters.ContactIdentifierKind))
        {
            query = query.Where(invitation => invitation.ContactIdentifierKind == filters.ContactIdentifierKind);
        }

        if (!string.IsNullOrEmpty(filters.ContactSearch))
        {
            var contactSearch = filters.ContactSearch.Trim();
            query = query.Where(invitation => invitation.ContactIdentifierKind.Contains(contactSearch));
        }

        if (filters.CreatedFromUtc is not null)
        {
            query = query.Where(invitation => invitation.CreatedAtUtc >= filters.CreatedFromUtc.Value);
        }

        if (filters.CreatedToUtc is not null)
        {
            query = query.Where(invitation => invitation.CreatedAtUtc <= filters.CreatedToUtc.Value);
        }

        if (filters.ExpiresBeforeUtc is not null)
        {
            query = query.Where(invitation => invitation.ExpiresAtUtc <= filters.ExpiresBeforeUtc.Value);
        }

        var invitations = await query
            .OrderByDescending(invitation => invitation.CreatedAtUtc)
            .ThenBy(invitation => invitation.Id)
            .Take(filters.Limit)
            .ToListAsync(cancellationToken);

        return new AdminInvitationListResponse(
            invitations.Select(invitation => MapSummary(invitation, now, DeliveryStateUnknown)).ToArray());
    }

    public async Task<InvitationManagementResult> CreateInvitationAsync(
        AuthenticatedActor actor,
        AdminInvitationCreateRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(actor);
        ArgumentNullException.ThrowIfNull(request);

        if (!await InvitationCapabilityEnabledAsync(cancellationToken))
        {
            return InvitationManagementResult.Failure(InvitationManagementResultStatus.CapabilityDisabled);
        }

        if (request.ContactIdentifierKind != AuthInvitationContactIdentifierKinds.Email)
        {
            return InvitationManagementResult.Failure(InvitationManagementResultStatus.UnsupportedContactIdentifierKind);
        }

        if (request.TargetSystemRole != SystemRoles.User)
        {
            return InvitationManagementResult.Failure(InvitationManagementResultStatus.UnsupportedTargetSystemRole);
        }

        if (!TryNormalizeEmail(request.ContactIdentifier, out var normalizedEmail))
        {
            return InvitationManagementResult.Failure(InvitationManagementResultStatus.InvalidRequest);
        }

        var existingPending = await dbContext.Set<AuthInvitation>()
            .AsNoTracking()
            .AnyAsync(
                invitation => invitation.Status == AuthInvitationStatuses.Pending
                    && invitation.ContactIdentifierKind == AuthInvitationContactIdentifierKinds.Email
                    && invitation.ContactIdentifierNormalized == normalizedEmail,
                cancellationToken);
        if (existingPending)
        {
            return InvitationManagementResult.Failure(InvitationManagementResultStatus.DuplicatePendingInvitation);
        }

        var occurredAtUtc = timeProvider.GetUtcNow();
        var rawInvitationSecret = CreateRawInvitationSecret();
        var invitation = new AuthInvitation
        {
            Id = Guid.NewGuid(),
            Status = AuthInvitationStatuses.Pending,
            ContactIdentifierKind = AuthInvitationContactIdentifierKinds.Email,
            ContactIdentifierNormalized = normalizedEmail,
            InvitationSecretHash = DeriveInvitationSecretHash(rawInvitationSecret),
            InvitationSecretHashVersion = InvitationSecretHashVersion,
            TargetSystemRole = SystemRoles.User,
            InvitedByAuthAccountId = actor.AuthAccountId,
            InvitedByUserProfileId = actor.UserProfileId,
            CreatedAtUtc = occurredAtUtc,
            UpdatedAtUtc = occurredAtUtc,
            ExpiresAtUtc = occurredAtUtc.Add(InvitationLifetime)
        };

        dbContext.Set<AuthInvitation>().Add(invitation);
        AddAudit(
            actor.AuthAccountId,
            action: "invitation.created",
            occurredAtUtc,
            new InvitationAuditMetadata(
                WorkflowName,
                "created",
                invitation.Id,
                invitation.Status,
                invitation.ContactIdentifierKind,
                invitation.TargetSystemRole,
                request.DeliveryRequested ? DeliveryStateProviderUnconfigured : DeliveryStateNotRequested));

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            return InvitationManagementResult.Failure(InvitationManagementResultStatus.DuplicatePendingInvitation);
        }

        return InvitationManagementResult.Succeeded(MapSummary(
            invitation,
            occurredAtUtc,
            request.DeliveryRequested ? DeliveryStateProviderUnconfigured : DeliveryStateNotRequested));
    }

    public async Task<InvitationManagementResult> GetInvitationAsync(
        Guid invitationId,
        CancellationToken cancellationToken)
    {
        var invitation = await dbContext.Set<AuthInvitation>()
            .AsNoTracking()
            .SingleOrDefaultAsync(invitation => invitation.Id == invitationId, cancellationToken);

        return invitation is null
            ? InvitationManagementResult.Failure(InvitationManagementResultStatus.NotFound)
            : InvitationManagementResult.Succeeded(MapSummary(invitation, timeProvider.GetUtcNow(), DeliveryStateUnknown));
    }

    public async Task<InvitationManagementResult> RevokeInvitationAsync(
        AuthenticatedActor actor,
        Guid invitationId,
        AdminInvitationRevokeRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(actor);
        ArgumentNullException.ThrowIfNull(request);

        var invitation = await dbContext.Set<AuthInvitation>()
            .SingleOrDefaultAsync(invitation => invitation.Id == invitationId, cancellationToken);
        if (invitation is null)
        {
            return InvitationManagementResult.Failure(InvitationManagementResultStatus.NotFound);
        }

        var occurredAtUtc = timeProvider.GetUtcNow();
        if (!IsPendingAndUnexpired(invitation, occurredAtUtc))
        {
            return InvitationManagementResult.Failure(InvitationManagementResultStatus.TerminalState);
        }

        invitation.Status = AuthInvitationStatuses.Revoked;
        invitation.RevokedByAuthAccountId = actor.AuthAccountId;
        invitation.RevokedAtUtc = occurredAtUtc;
        invitation.UpdatedAtUtc = occurredAtUtc;
        invitation.CleanupEligibleAtUtc = occurredAtUtc.Add(TerminalCleanupDelay);

        AddAudit(
            actor.AuthAccountId,
            action: "invitation.revoked",
            occurredAtUtc,
            new InvitationAuditMetadata(
                WorkflowName,
                "revoked",
                invitation.Id,
                invitation.Status,
                invitation.ContactIdentifierKind,
                invitation.TargetSystemRole,
                DeliveryStateUnknown));

        await dbContext.SaveChangesAsync(cancellationToken);

        return InvitationManagementResult.Succeeded(MapSummary(invitation, occurredAtUtc, DeliveryStateUnknown));
    }

    public async Task<InvitationManagementResult> ResendInvitationAsync(
        AuthenticatedActor actor,
        Guid invitationId,
        AdminInvitationResendRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(actor);
        ArgumentNullException.ThrowIfNull(request);

        if (!await InvitationCapabilityEnabledAsync(cancellationToken))
        {
            return InvitationManagementResult.Failure(InvitationManagementResultStatus.CapabilityDisabled);
        }

        var invitation = await dbContext.Set<AuthInvitation>()
            .SingleOrDefaultAsync(invitation => invitation.Id == invitationId, cancellationToken);
        if (invitation is null)
        {
            return InvitationManagementResult.Failure(InvitationManagementResultStatus.NotFound);
        }

        var occurredAtUtc = timeProvider.GetUtcNow();
        if (!IsPendingAndUnexpired(invitation, occurredAtUtc))
        {
            return InvitationManagementResult.Failure(InvitationManagementResultStatus.TerminalState);
        }

        invitation.UpdatedAtUtc = occurredAtUtc;
        var deliveryState = request.DeliveryRequested ? DeliveryStateProviderUnconfigured : DeliveryStateNotRequested;

        AddAudit(
            actor.AuthAccountId,
            action: "invitation.resend_requested",
            occurredAtUtc,
            new InvitationAuditMetadata(
                WorkflowName,
                "resend_requested",
                invitation.Id,
                invitation.Status,
                invitation.ContactIdentifierKind,
                invitation.TargetSystemRole,
                deliveryState));

        await dbContext.SaveChangesAsync(cancellationToken);

        return InvitationManagementResult.Succeeded(MapSummary(invitation, occurredAtUtc, deliveryState));
    }

    private async Task<bool> InvitationCapabilityEnabledAsync(CancellationToken cancellationToken)
    {
        return await dbContext.Set<AuthInvitationPolicy>()
            .AsNoTracking()
            .AnyAsync(
                policy => policy.Status == AuthInvitationPolicyStatuses.Active
                    && policy.RetiredAtUtc == null
                    && policy.CapabilityState == AuthInvitationCapabilityStates.Enabled,
                cancellationToken);
    }

    private void AddAudit(
        Guid actorAuthAccountId,
        string action,
        DateTimeOffset occurredAtUtc,
        InvitationAuditMetadata metadata)
    {
        var safeMetadata = JsonSerializer.Serialize(metadata, MetadataJsonOptions);
        if (safeMetadata.Length > SafeMetadataJsonMaxLength)
        {
            throw new InvalidOperationException("Invitation audit metadata exceeded the bounded safe metadata length.");
        }

        dbContext.Set<AuthAuditEvent>().Add(new AuthAuditEvent
        {
            Id = Guid.NewGuid(),
            ActorAuthAccountId = actorAuthAccountId,
            SubjectAuthAccountId = null,
            Action = action,
            Outcome = AuthAuditOutcomes.Success,
            OccurredAtUtc = occurredAtUtc,
            CorrelationId = null,
            RequestId = null,
            SafeMetadataJson = safeMetadata
        });
    }

    private static AdminInvitationSummary MapSummary(
        AuthInvitation invitation,
        DateTimeOffset now,
        string deliveryState)
    {
        var status = invitation.Status == AuthInvitationStatuses.Pending && invitation.ExpiresAtUtc <= now
            ? AuthInvitationStatuses.Expired
            : invitation.Status;
        var expiredAtUtc = status == AuthInvitationStatuses.Expired
            ? invitation.ExpiredAtUtc ?? invitation.ExpiresAtUtc
            : invitation.ExpiredAtUtc;

        return new AdminInvitationSummary(
            invitation.Id,
            status,
            invitation.ContactIdentifierKind,
            ContactDisplay: "email:***",
            invitation.TargetSystemRole,
            deliveryState,
            invitation.CreatedAtUtc,
            invitation.UpdatedAtUtc,
            invitation.ExpiresAtUtc,
            invitation.AcceptedAtUtc,
            invitation.RevokedAtUtc,
            expiredAtUtc,
            invitation.CleanupEligibleAtUtc,
            invitation.InvitedByAuthAccountId,
            invitation.InvitedByUserProfileId,
            invitation.RevokedByAuthAccountId);
    }

    private static bool IsPendingAndUnexpired(AuthInvitation invitation, DateTimeOffset now)
    {
        return invitation.Status == AuthInvitationStatuses.Pending
            && invitation.AcceptedAtUtc is null
            && invitation.RevokedAtUtc is null
            && invitation.ExpiredAtUtc is null
            && invitation.ExpiresAtUtc > now;
    }

    private static bool TryNormalizeEmail(string submittedEmail, out string normalizedEmail)
    {
        normalizedEmail = string.Empty;
        var trimmed = submittedEmail.Trim();
        if (trimmed.Length is 0 or > 320)
        {
            return false;
        }

        if (trimmed.Any(char.IsWhiteSpace) || trimmed.Count(character => character == '@') != 1)
        {
            return false;
        }

        var parts = trimmed.Split('@', 2);
        if (parts[0].Length == 0 || parts[1].Length == 0 || parts[1].Length > 253)
        {
            return false;
        }

        if (!parts[1].Contains('.', StringComparison.Ordinal)
            || parts[1].StartsWith(".", StringComparison.Ordinal)
            || parts[1].EndsWith(".", StringComparison.Ordinal))
        {
            return false;
        }

        normalizedEmail = string.Create(
            trimmed.Length,
            trimmed,
            static (destination, source) => source.AsSpan().ToLowerInvariant(destination));
        return true;
    }

    private static string CreateRawInvitationSecret()
    {
        return WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(InvitationSecretByteLength));
    }

    private static string DeriveInvitationSecretHash(string rawInvitationSecret)
    {
        var payload = $"{InvitationSecretPurpose}:{rawInvitationSecret}";
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(payload));
        return InvitationSecretHashPrefix + WebEncoders.Base64UrlEncode(hash);
    }

    private sealed record InvitationAuditMetadata(
        string WorkflowName,
        string StatusCategory,
        Guid InvitationId,
        string LifecycleStatus,
        string ContactIdentifierKind,
        string TargetSystemRole,
        string DeliveryState);
}
