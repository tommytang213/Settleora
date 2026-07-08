using System.Data;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Settleora.Api.Auth.Credentials;
using Settleora.Api.Auth.SignIn;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Auth.Invitations;

internal sealed class InvitationAcceptanceService : IInvitationAcceptanceService
{
    private const string WorkflowName = "auth_invitation_acceptance";
    private const string AcceptedAction = "invitation.accepted";
    private const string AcceptFailedAction = "invitation.accept_failed";
    private const string LocalSingleNodeSourceKey = "src:local-single-node";
    private const int SafeMetadataJsonMaxLength = 4096;
    private static readonly TimeSpan TerminalCleanupDelay = TimeSpan.FromDays(90);
    private static readonly string[] AcceptedRoles = [SystemRoles.User];
    private static readonly JsonSerializerOptions MetadataJsonOptions = new(JsonSerializerDefaults.Web);

    private readonly SettleoraDbContext dbContext;
    private readonly IAuthCredentialWorkflowService credentialWorkflowService;
    private readonly ISignInAbusePolicyService abusePolicyService;
    private readonly TimeProvider timeProvider;

    public InvitationAcceptanceService(
        SettleoraDbContext dbContext,
        IAuthCredentialWorkflowService credentialWorkflowService,
        ISignInAbusePolicyService abusePolicyService,
        TimeProvider timeProvider)
    {
        this.dbContext = dbContext;
        this.credentialWorkflowService = credentialWorkflowService;
        this.abusePolicyService = abusePolicyService;
        this.timeProvider = timeProvider;
    }

    public async Task<InvitationAcceptanceResult> AcceptInvitationAsync(
        InvitationAcceptRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var attemptKey = InvitationSecretHasher.DeriveSafeAttemptKey(request.InvitationSecret);
        var policyResult = abusePolicyService.CheckPreVerification(new SignInAbusePolicyRequest(
            attemptKey,
            LocalSingleNodeSourceKey));
        if (!policyResult.IsAllowed)
        {
            abusePolicyService.RecordAttempt(new SignInAttemptRecord(
                attemptKey,
                LocalSingleNodeSourceKey,
                SignInAttemptOutcome.Throttled));
            await AddFailureAuditAndSaveAsync(
                "throttled",
                invitation: null,
                resultAuthAccountId: null,
                resultUserProfileId: null,
                cancellationToken);
            return InvitationAcceptanceResult.Failure(InvitationAcceptanceStatus.Throttled);
        }

        var occurredAtUtc = timeProvider.GetUtcNow();
        if (!await InvitationCapabilityEnabledAsync(cancellationToken))
        {
            abusePolicyService.RecordAttempt(new SignInAttemptRecord(
                attemptKey,
                LocalSingleNodeSourceKey,
                SignInAttemptOutcome.BlockedByPolicy));
            await AddFailureAuditAndSaveAsync(
                "policy_disabled",
                invitation: null,
                resultAuthAccountId: null,
                resultUserProfileId: null,
                cancellationToken);
            return InvitationAcceptanceResult.Failure(InvitationAcceptanceStatus.InvalidInvitation);
        }

        var secretHash = InvitationSecretHasher.DeriveInvitationSecretHash(request.InvitationSecret);
        var invitation = await dbContext.Set<AuthInvitation>()
            .SingleOrDefaultAsync(
                invitation => invitation.InvitationSecretHash == secretHash
                    && invitation.InvitationSecretHashVersion == InvitationSecretHasher.HashVersion,
                cancellationToken);

        if (!IsRedeemable(invitation, occurredAtUtc))
        {
            if (invitation is
                {
                    Status: AuthInvitationStatuses.Pending,
                    AcceptedAtUtc: null,
                    RevokedAtUtc: null,
                    ExpiredAtUtc: null
                } && invitation.ExpiresAtUtc <= occurredAtUtc)
            {
                invitation.Status = AuthInvitationStatuses.Expired;
                invitation.ExpiredAtUtc = occurredAtUtc;
                invitation.UpdatedAtUtc = occurredAtUtc;
                invitation.CleanupEligibleAtUtc = occurredAtUtc.Add(TerminalCleanupDelay);
                await dbContext.SaveChangesAsync(cancellationToken);
            }

            abusePolicyService.RecordAttempt(new SignInAttemptRecord(
                attemptKey,
                LocalSingleNodeSourceKey,
                SignInAttemptOutcome.Failed));
            await AddFailureAuditAndSaveAsync(
                ClassifyFailure(invitation, occurredAtUtc),
                invitation,
                resultAuthAccountId: null,
                resultUserProfileId: null,
                cancellationToken);
            return InvitationAcceptanceResult.Failure(InvitationAcceptanceStatus.InvalidInvitation);
        }

        IDbContextTransaction? transaction = null;
        var useRelationalTransaction = dbContext.Database.IsRelational();
        var authAccountId = Guid.NewGuid();
        var userProfileId = Guid.NewGuid();
        Guid? acceptedInvitationId = null;

        try
        {
            if (useRelationalTransaction)
            {
                transaction = await dbContext.Database.BeginTransactionAsync(
                    IsolationLevel.Serializable,
                    cancellationToken);
            }

            invitation = await dbContext.Set<AuthInvitation>()
                .SingleOrDefaultAsync(
                    invitation => invitation.InvitationSecretHash == secretHash
                        && invitation.InvitationSecretHashVersion == InvitationSecretHasher.HashVersion,
                    cancellationToken);
            if (!IsRedeemable(invitation, occurredAtUtc)
                || await LocalIdentityExistsAsync(invitation!.ContactIdentifierNormalized, cancellationToken))
            {
                await RollbackAsync(transaction, cancellationToken);
                abusePolicyService.RecordAttempt(new SignInAttemptRecord(
                    attemptKey,
                    LocalSingleNodeSourceKey,
                    SignInAttemptOutcome.Failed));
                return InvitationAcceptanceResult.Failure(InvitationAcceptanceStatus.InvalidInvitation);
            }

            var userProfile = new UserProfile
            {
                Id = userProfileId,
                DisplayName = request.DisplayName,
                DefaultCurrency = null,
                CreatedAtUtc = occurredAtUtc,
                UpdatedAtUtc = occurredAtUtc
            };
            var authAccount = new AuthAccount
            {
                Id = authAccountId,
                UserProfileId = userProfileId,
                UserProfile = userProfile,
                Status = AuthAccountStatuses.Active,
                CreatedAtUtc = occurredAtUtc,
                UpdatedAtUtc = occurredAtUtc
            };
            var localIdentity = new AuthIdentity
            {
                Id = Guid.NewGuid(),
                AuthAccountId = authAccountId,
                AuthAccount = authAccount,
                ProviderType = AuthIdentityProviderTypes.Local,
                ProviderName = LocalSignInService.LocalProviderName,
                ProviderSubject = invitation.ContactIdentifierNormalized,
                CreatedAtUtc = occurredAtUtc,
                UpdatedAtUtc = occurredAtUtc
            };
            var roleAssignment = new SystemRoleAssignment
            {
                AuthAccountId = authAccountId,
                AuthAccount = authAccount,
                Role = SystemRoles.User,
                AssignedAtUtc = occurredAtUtc,
                AssignedByAuthAccountId = invitation.InvitedByAuthAccountId
            };

            dbContext.Set<UserProfile>().Add(userProfile);
            dbContext.Set<AuthAccount>().Add(authAccount);
            dbContext.Set<AuthIdentity>().Add(localIdentity);
            dbContext.Set<SystemRoleAssignment>().Add(roleAssignment);

            invitation.Status = AuthInvitationStatuses.Accepted;
            invitation.AcceptedAtUtc = occurredAtUtc;
            invitation.UpdatedAtUtc = occurredAtUtc;
            invitation.CleanupEligibleAtUtc = occurredAtUtc.Add(TerminalCleanupDelay);
            acceptedInvitationId = invitation.Id;

            await dbContext.SaveChangesAsync(cancellationToken);

            var credentialResult = await credentialWorkflowService.CreateLocalPasswordCredentialAsync(
                authAccountId,
                request.LocalPassword,
                cancellationToken);
            if (!credentialResult.Succeeded)
            {
                await RollbackAsync(transaction, cancellationToken);
                if (!useRelationalTransaction)
                {
                    await CleanupCreatedRowsAsync(
                        authAccountId,
                        userProfileId,
                        invitation.Id,
                        occurredAtUtc,
                        cancellationToken);
                }

                abusePolicyService.RecordAttempt(new SignInAttemptRecord(
                    attemptKey,
                    LocalSingleNodeSourceKey,
                    SignInAttemptOutcome.Failed));
                return InvitationAcceptanceResult.Failure(InvitationAcceptanceStatus.PersistenceFailed);
            }

            AddAudit(
                AuthAuditOutcomes.Success,
                AcceptedAction,
                invitation.InvitedByAuthAccountId,
                authAccountId,
                occurredAtUtc,
                new InvitationAcceptanceAuditMetadata(
                    WorkflowName,
                    "accepted",
                    invitation.Id,
                    invitation.Status,
                    invitation.ContactIdentifierKind,
                    invitation.TargetSystemRole,
                    authAccountId,
                    userProfileId,
                    AcceptedRoles));
            await dbContext.SaveChangesAsync(cancellationToken);

            if (transaction is not null)
            {
                await transaction.CommitAsync(cancellationToken);
            }

            abusePolicyService.RecordAttempt(new SignInAttemptRecord(
                attemptKey,
                LocalSingleNodeSourceKey,
                SignInAttemptOutcome.Succeeded));
            return InvitationAcceptanceResult.Accepted();
        }
        catch (DbUpdateException)
        {
            await RollbackAsync(transaction, cancellationToken);
            dbContext.ChangeTracker.Clear();
            if (!useRelationalTransaction)
            {
                await CleanupCreatedRowsAsync(
                    authAccountId,
                    userProfileId,
                    acceptedInvitationId,
                    occurredAtUtc,
                    cancellationToken);
            }

            abusePolicyService.RecordAttempt(new SignInAttemptRecord(
                attemptKey,
                LocalSingleNodeSourceKey,
                SignInAttemptOutcome.Failed));
            return InvitationAcceptanceResult.Failure(InvitationAcceptanceStatus.PersistenceFailed);
        }
        finally
        {
            if (transaction is not null)
            {
                await transaction.DisposeAsync();
            }
        }
    }

    private Task<bool> InvitationCapabilityEnabledAsync(CancellationToken cancellationToken)
    {
        return dbContext.Set<AuthInvitationPolicy>()
            .AsNoTracking()
            .AnyAsync(
                policy => policy.Status == AuthInvitationPolicyStatuses.Active
                    && policy.RetiredAtUtc == null
                    && policy.CapabilityState == AuthInvitationCapabilityStates.Enabled,
                cancellationToken);
    }

    private Task<bool> LocalIdentityExistsAsync(
        string normalizedIdentifier,
        CancellationToken cancellationToken)
    {
        return dbContext.Set<AuthIdentity>()
            .AsNoTracking()
            .AnyAsync(
                identity => identity.ProviderType == AuthIdentityProviderTypes.Local
                    && identity.ProviderName == LocalSignInService.LocalProviderName
                    && identity.ProviderSubject == normalizedIdentifier,
                cancellationToken);
    }

    private static bool IsRedeemable(AuthInvitation? invitation, DateTimeOffset now)
    {
        return invitation is
        {
            Status: AuthInvitationStatuses.Pending,
            AcceptedAtUtc: null,
            RevokedAtUtc: null,
            ExpiredAtUtc: null,
            ContactIdentifierKind: AuthInvitationContactIdentifierKinds.Email,
            TargetSystemRole: SystemRoles.User
        } && invitation.ExpiresAtUtc > now;
    }

    private static string ClassifyFailure(AuthInvitation? invitation, DateTimeOffset now)
    {
        if (invitation is null)
        {
            return "material_unavailable";
        }

        if (invitation.Status == AuthInvitationStatuses.Pending && invitation.ExpiresAtUtc <= now)
        {
            return "expired";
        }

        return "not_redeemable";
    }

    private async Task AddFailureAuditAndSaveAsync(
        string statusCategory,
        AuthInvitation? invitation,
        Guid? resultAuthAccountId,
        Guid? resultUserProfileId,
        CancellationToken cancellationToken)
    {
        AddAudit(
            statusCategory is "policy_disabled" or "throttled"
                ? AuthAuditOutcomes.BlockedByPolicy
                : AuthAuditOutcomes.Failure,
            AcceptFailedAction,
            actorAuthAccountId: null,
            subjectAuthAccountId: null,
            timeProvider.GetUtcNow(),
            new InvitationAcceptanceAuditMetadata(
                WorkflowName,
                statusCategory,
                invitation?.Id,
                invitation?.Status,
                invitation?.ContactIdentifierKind,
                invitation?.TargetSystemRole,
                resultAuthAccountId,
                resultUserProfileId,
                Roles: []));
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private void AddAudit(
        string outcome,
        string action,
        Guid? actorAuthAccountId,
        Guid? subjectAuthAccountId,
        DateTimeOffset occurredAtUtc,
        InvitationAcceptanceAuditMetadata metadata)
    {
        var safeMetadata = JsonSerializer.Serialize(metadata, MetadataJsonOptions);
        if (safeMetadata.Length > SafeMetadataJsonMaxLength)
        {
            throw new InvalidOperationException("Invitation acceptance audit metadata exceeded the bounded safe metadata length.");
        }

        dbContext.Set<AuthAuditEvent>().Add(new AuthAuditEvent
        {
            Id = Guid.NewGuid(),
            ActorAuthAccountId = actorAuthAccountId,
            SubjectAuthAccountId = subjectAuthAccountId,
            Action = action,
            Outcome = outcome,
            OccurredAtUtc = occurredAtUtc,
            CorrelationId = null,
            RequestId = null,
            SafeMetadataJson = safeMetadata
        });
    }

    private async Task CleanupCreatedRowsAsync(
        Guid authAccountId,
        Guid userProfileId,
        Guid? invitationId,
        DateTimeOffset occurredAtUtc,
        CancellationToken cancellationToken)
    {
        dbContext.ChangeTracker.Clear();

        var auditEvents = await dbContext.Set<AuthAuditEvent>()
            .Where(auditEvent => auditEvent.ActorAuthAccountId == authAccountId
                || auditEvent.SubjectAuthAccountId == authAccountId)
            .ToListAsync(cancellationToken);
        var credentials = await dbContext.Set<LocalPasswordCredential>()
            .Where(credential => credential.AuthAccountId == authAccountId)
            .ToListAsync(cancellationToken);
        var roleAssignments = await dbContext.Set<SystemRoleAssignment>()
            .Where(roleAssignment => roleAssignment.AuthAccountId == authAccountId
                || roleAssignment.AssignedByAuthAccountId == authAccountId)
            .ToListAsync(cancellationToken);
        var identities = await dbContext.Set<AuthIdentity>()
            .Where(identity => identity.AuthAccountId == authAccountId)
            .ToListAsync(cancellationToken);
        var accounts = await dbContext.Set<AuthAccount>()
            .Where(account => account.Id == authAccountId)
            .ToListAsync(cancellationToken);
        var profiles = await dbContext.Set<UserProfile>()
            .Where(profile => profile.Id == userProfileId)
            .ToListAsync(cancellationToken);

        dbContext.Set<AuthAuditEvent>().RemoveRange(auditEvents);
        dbContext.Set<LocalPasswordCredential>().RemoveRange(credentials);
        dbContext.Set<SystemRoleAssignment>().RemoveRange(roleAssignments);
        dbContext.Set<AuthIdentity>().RemoveRange(identities);
        dbContext.Set<AuthAccount>().RemoveRange(accounts);
        dbContext.Set<UserProfile>().RemoveRange(profiles);

        if (invitationId is { } id)
        {
            var invitation = await dbContext.Set<AuthInvitation>()
                .SingleOrDefaultAsync(invitation => invitation.Id == id, cancellationToken);
            if (invitation is not null)
            {
                invitation.Status = AuthInvitationStatuses.Pending;
                invitation.AcceptedAtUtc = null;
                invitation.CleanupEligibleAtUtc = null;
                invitation.UpdatedAtUtc = occurredAtUtc;
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private static async Task RollbackAsync(
        IDbContextTransaction? transaction,
        CancellationToken cancellationToken)
    {
        if (transaction is not null)
        {
            await transaction.RollbackAsync(cancellationToken);
        }
    }

    private sealed record InvitationAcceptanceAuditMetadata(
        string WorkflowName,
        string StatusCategory,
        Guid? InvitationId,
        string? LifecycleStatus,
        string? ContactIdentifierKind,
        string? TargetSystemRole,
        Guid? ResultAuthAccountId,
        Guid? ResultUserProfileId,
        IReadOnlyList<string> Roles);
}
