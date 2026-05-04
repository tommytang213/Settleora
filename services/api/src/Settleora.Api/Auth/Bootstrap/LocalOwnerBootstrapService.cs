using System.Data;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Settleora.Api.Auth.Credentials;
using Settleora.Api.Auth.SignIn;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Auth.Bootstrap;

internal sealed class LocalOwnerBootstrapService : ILocalOwnerBootstrapService
{
    private const string BootstrapWorkflowName = "local_owner_bootstrap";
    private const string BootstrapCreatedAction = "bootstrap.local_owner.created";
    private const string NpgsqlProviderName = "Npgsql.EntityFrameworkCore.PostgreSQL";

    private static readonly string[] FirstOwnerRoles =
    [
        SystemRoles.Owner,
        SystemRoles.Admin,
        SystemRoles.User
    ];

    private static readonly JsonSerializerOptions MetadataJsonOptions = new(JsonSerializerDefaults.Web);

    private readonly SettleoraDbContext dbContext;
    private readonly IAuthCredentialWorkflowService credentialWorkflowService;
    private readonly TimeProvider timeProvider;

    public LocalOwnerBootstrapService(
        SettleoraDbContext dbContext,
        IAuthCredentialWorkflowService credentialWorkflowService,
        TimeProvider timeProvider)
    {
        this.dbContext = dbContext;
        this.credentialWorkflowService = credentialWorkflowService;
        this.timeProvider = timeProvider;
    }

    public async Task<bool> IsBootstrapRequiredAsync(CancellationToken cancellationToken = default)
    {
        return !await dbContext.Set<AuthAccount>().AnyAsync(cancellationToken);
    }

    public async Task<LocalOwnerBootstrapCreationResult> CreateLocalOwnerAsync(
        LocalOwnerBootstrapRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

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
            Status = AuthAccountStatuses.Active,
            CreatedAtUtc = occurredAtUtc,
            UpdatedAtUtc = occurredAtUtc
        };
        var localIdentity = new AuthIdentity
        {
            Id = Guid.NewGuid(),
            AuthAccountId = authAccountId,
            ProviderType = AuthIdentityProviderTypes.Local,
            ProviderName = LocalSignInService.LocalProviderName,
            ProviderSubject = request.NormalizedIdentifier,
            CreatedAtUtc = occurredAtUtc,
            UpdatedAtUtc = occurredAtUtc
        };

        try
        {
            if (useRelationalTransaction)
            {
                transaction = await dbContext.Database.BeginTransactionAsync(
                    IsolationLevel.Serializable,
                    cancellationToken);
                await LockBootstrapAccountTableAsync(cancellationToken);
            }

            if (await dbContext.Set<AuthAccount>().AnyAsync(cancellationToken))
            {
                await RollbackAsync(transaction, cancellationToken);
                return LocalOwnerBootstrapCreationResult.Failure(
                    LocalOwnerBootstrapCreationStatus.BootstrapUnavailable);
            }

            dbContext.Set<UserProfile>().Add(userProfile);
            dbContext.Set<AuthAccount>().Add(authAccount);
            dbContext.Set<AuthIdentity>().Add(localIdentity);
            AddFirstOwnerRoles(authAccountId, occurredAtUtc);
            AddBootstrapAudit(authAccountId, occurredAtUtc);

            await dbContext.SaveChangesAsync(cancellationToken);

            var credentialResult = await credentialWorkflowService.CreateLocalPasswordCredentialAsync(
                authAccountId,
                request.PlaintextPassword,
                cancellationToken);
            if (!credentialResult.Succeeded)
            {
                await RollbackAsync(transaction, cancellationToken);
                dbContext.ChangeTracker.Clear();
                return LocalOwnerBootstrapCreationResult.Failure(
                    credentialResult.Status is CredentialCreationStatus.PersistenceFailed
                        ? LocalOwnerBootstrapCreationStatus.PersistenceFailed
                        : LocalOwnerBootstrapCreationStatus.CredentialCreationFailed);
            }

            if (transaction is not null)
            {
                await transaction.CommitAsync(cancellationToken);
            }
        }
        catch (DbUpdateException)
        {
            await RollbackAsync(transaction, cancellationToken);
            dbContext.ChangeTracker.Clear();
            return await MapPersistenceFailureAsync(cancellationToken);
        }
        finally
        {
            if (transaction is not null)
            {
                await transaction.DisposeAsync();
            }
        }

        return LocalOwnerBootstrapCreationResult.Created(userProfile, FirstOwnerRoles);
    }

    private async Task LockBootstrapAccountTableAsync(CancellationToken cancellationToken)
    {
        if (!StringComparer.Ordinal.Equals(dbContext.Database.ProviderName, NpgsqlProviderName))
        {
            return;
        }

        await dbContext.Database.ExecuteSqlRawAsync(
            "LOCK TABLE auth_accounts IN EXCLUSIVE MODE",
            cancellationToken);
    }

    private void AddFirstOwnerRoles(
        Guid authAccountId,
        DateTimeOffset occurredAtUtc)
    {
        foreach (var role in FirstOwnerRoles)
        {
            dbContext.Set<SystemRoleAssignment>().Add(new SystemRoleAssignment
            {
                AuthAccountId = authAccountId,
                Role = role,
                AssignedAtUtc = occurredAtUtc,
                AssignedByAuthAccountId = null
            });
        }
    }

    private void AddBootstrapAudit(
        Guid authAccountId,
        DateTimeOffset occurredAtUtc)
    {
        dbContext.Set<AuthAuditEvent>().Add(new AuthAuditEvent
        {
            Id = Guid.NewGuid(),
            ActorAuthAccountId = null,
            SubjectAuthAccountId = authAccountId,
            Action = BootstrapCreatedAction,
            Outcome = AuthAuditOutcomes.Success,
            OccurredAtUtc = occurredAtUtc,
            CorrelationId = null,
            RequestId = null,
            SafeMetadataJson = JsonSerializer.Serialize(
                new BootstrapAuditMetadata(
                    BootstrapWorkflowName,
                    LocalOwnerBootstrapCreationStatus.Created.ToString(),
                    FirstOwnerRoles),
                MetadataJsonOptions)
        });
    }

    private async Task<LocalOwnerBootstrapCreationResult> MapPersistenceFailureAsync(
        CancellationToken cancellationToken)
    {
        if (!await dbContext.Set<AuthAccount>().AnyAsync(cancellationToken))
        {
            return LocalOwnerBootstrapCreationResult.Failure(
                LocalOwnerBootstrapCreationStatus.PersistenceFailed);
        }

        return LocalOwnerBootstrapCreationResult.Failure(
            LocalOwnerBootstrapCreationStatus.BootstrapUnavailable);
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

    private sealed record BootstrapAuditMetadata(
        string WorkflowName,
        string StatusCategory,
        IReadOnlyList<string> Roles);
}
