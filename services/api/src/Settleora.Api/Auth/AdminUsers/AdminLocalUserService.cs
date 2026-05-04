using System.Data;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Auth.Credentials;
using Settleora.Api.Auth.SignIn;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Auth.AdminUsers;

internal sealed class AdminLocalUserService : IAdminLocalUserService
{
    private const string AdminLocalUserWorkflowName = "admin_local_user";
    private const string AdminLocalUserCreatedAction = "admin.local_user.created";

    private static readonly string[] DefaultCreatedRoles = [SystemRoles.User];
    private static readonly JsonSerializerOptions MetadataJsonOptions = new(JsonSerializerDefaults.Web);

    private readonly SettleoraDbContext dbContext;
    private readonly IAuthCredentialWorkflowService credentialWorkflowService;
    private readonly TimeProvider timeProvider;

    public AdminLocalUserService(
        SettleoraDbContext dbContext,
        IAuthCredentialWorkflowService credentialWorkflowService,
        TimeProvider timeProvider)
    {
        this.dbContext = dbContext;
        this.credentialWorkflowService = credentialWorkflowService;
        this.timeProvider = timeProvider;
    }

    public async Task<AdminLocalUserCreationResult> CreateLocalUserAsync(
        AdminLocalUserCreationRequest request,
        AuthenticatedActor actor,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(actor);

        if (await LocalIdentityExistsAsync(request.NormalizedIdentifier, cancellationToken))
        {
            return AdminLocalUserCreationResult.Failure(
                AdminLocalUserCreationStatus.DuplicateLocalIdentifier);
        }

        IDbContextTransaction? transaction = null;
        var useRelationalTransaction = dbContext.Database.IsRelational();
        var occurredAtUtc = timeProvider.GetUtcNow();
        var authAccountId = Guid.NewGuid();
        var userProfile = new UserProfile
        {
            Id = Guid.NewGuid(),
            DisplayName = request.DisplayName,
            DefaultCurrency = request.DefaultCurrency,
            CreatedAtUtc = occurredAtUtc,
            UpdatedAtUtc = occurredAtUtc
        };
        var authAccount = new AuthAccount
        {
            Id = authAccountId,
            UserProfileId = userProfile.Id,
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
            ProviderSubject = request.NormalizedIdentifier,
            CreatedAtUtc = occurredAtUtc,
            UpdatedAtUtc = occurredAtUtc
        };
        var roleAssignment = new SystemRoleAssignment
        {
            AuthAccountId = authAccountId,
            AuthAccount = authAccount,
            Role = SystemRoles.User,
            AssignedAtUtc = occurredAtUtc,
            AssignedByAuthAccountId = actor.AuthAccountId
        };

        try
        {
            if (useRelationalTransaction)
            {
                transaction = await dbContext.Database.BeginTransactionAsync(
                    IsolationLevel.Serializable,
                    cancellationToken);
            }

            if (await LocalIdentityExistsAsync(request.NormalizedIdentifier, cancellationToken))
            {
                await RollbackAsync(transaction, cancellationToken);
                return AdminLocalUserCreationResult.Failure(
                    AdminLocalUserCreationStatus.DuplicateLocalIdentifier);
            }

            dbContext.Set<UserProfile>().Add(userProfile);
            dbContext.Set<AuthAccount>().Add(authAccount);
            dbContext.Set<AuthIdentity>().Add(localIdentity);
            dbContext.Set<SystemRoleAssignment>().Add(roleAssignment);

            await dbContext.SaveChangesAsync(cancellationToken);

            var credentialResult = await credentialWorkflowService.CreateLocalPasswordCredentialAsync(
                authAccountId,
                request.PlaintextPassword,
                cancellationToken);
            if (!credentialResult.Succeeded)
            {
                await RollbackAsync(transaction, cancellationToken);
                if (!useRelationalTransaction)
                {
                    await CleanupCreatedRowsAsync(authAccountId, userProfile.Id, cancellationToken);
                }

                return AdminLocalUserCreationResult.Failure(
                    credentialResult.Status is CredentialCreationStatus.PersistenceFailed
                        ? AdminLocalUserCreationStatus.PersistenceFailed
                        : AdminLocalUserCreationStatus.CredentialCreationFailed);
            }

            AddAdminCreatedAudit(actor.AuthAccountId, authAccountId, occurredAtUtc);
            await dbContext.SaveChangesAsync(cancellationToken);

            if (transaction is not null)
            {
                await transaction.CommitAsync(cancellationToken);
            }
        }
        catch (DbUpdateException)
        {
            await RollbackAsync(transaction, cancellationToken);
            dbContext.ChangeTracker.Clear();
            if (!useRelationalTransaction)
            {
                await CleanupCreatedRowsAsync(authAccountId, userProfile.Id, cancellationToken);
            }

            return await MapPersistenceFailureAsync(request.NormalizedIdentifier, cancellationToken);
        }
        finally
        {
            if (transaction is not null)
            {
                await transaction.DisposeAsync();
            }
        }

        return AdminLocalUserCreationResult.Created(new AdminUserSummaryResponse(
            userProfile.Id,
            authAccountId,
            userProfile.DisplayName,
            userProfile.DefaultCurrency,
            authAccount.Status,
            DefaultCreatedRoles,
            userProfile.CreatedAtUtc,
            userProfile.UpdatedAtUtc));
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

    private void AddAdminCreatedAudit(
        Guid actorAuthAccountId,
        Guid subjectAuthAccountId,
        DateTimeOffset occurredAtUtc)
    {
        dbContext.Set<AuthAuditEvent>().Add(new AuthAuditEvent
        {
            Id = Guid.NewGuid(),
            ActorAuthAccountId = actorAuthAccountId,
            SubjectAuthAccountId = subjectAuthAccountId,
            Action = AdminLocalUserCreatedAction,
            Outcome = AuthAuditOutcomes.Success,
            OccurredAtUtc = occurredAtUtc,
            CorrelationId = null,
            RequestId = null,
            SafeMetadataJson = JsonSerializer.Serialize(
                new AdminLocalUserAuditMetadata(
                    AdminLocalUserWorkflowName,
                    AdminLocalUserCreationStatus.Created.ToString(),
                    DefaultCreatedRoles),
                MetadataJsonOptions)
        });
    }

    private async Task CleanupCreatedRowsAsync(
        Guid authAccountId,
        Guid userProfileId,
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

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task<AdminLocalUserCreationResult> MapPersistenceFailureAsync(
        string normalizedIdentifier,
        CancellationToken cancellationToken)
    {
        return await LocalIdentityExistsAsync(normalizedIdentifier, cancellationToken)
            ? AdminLocalUserCreationResult.Failure(AdminLocalUserCreationStatus.DuplicateLocalIdentifier)
            : AdminLocalUserCreationResult.Failure(AdminLocalUserCreationStatus.PersistenceFailed);
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

    private sealed record AdminLocalUserAuditMetadata(
        string WorkflowName,
        string StatusCategory,
        IReadOnlyList<string> Roles);
}
