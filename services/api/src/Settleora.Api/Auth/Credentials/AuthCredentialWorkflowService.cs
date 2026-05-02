using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.PasswordHashing;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Auth.Credentials;

internal sealed class AuthCredentialWorkflowService : IAuthCredentialWorkflowService
{
    private const string CredentialCreatedAction = "credential.created";
    private const string CredentialVerificationAction = "credential.verification";

    private readonly SettleoraDbContext dbContext;
    private readonly IPasswordHashingService passwordHashingService;
    private readonly IAuthCredentialAuditWriter auditWriter;
    private readonly TimeProvider timeProvider;

    public AuthCredentialWorkflowService(
        SettleoraDbContext dbContext,
        IPasswordHashingService passwordHashingService,
        IAuthCredentialAuditWriter auditWriter,
        TimeProvider timeProvider)
    {
        this.dbContext = dbContext;
        this.passwordHashingService = passwordHashingService;
        this.auditWriter = auditWriter;
        this.timeProvider = timeProvider;
    }

    public async Task<CredentialCreationResult> CreateLocalPasswordCredentialAsync(
        Guid authAccountId,
        string plaintextPassword,
        CancellationToken cancellationToken = default)
    {
        var occurredAtUtc = timeProvider.GetUtcNow();
        var account = await dbContext.Set<AuthAccount>()
            .SingleOrDefaultAsync(account => account.Id == authAccountId, cancellationToken);

        if (!IsAccountEligibleForLocalCredential(account))
        {
            var result = CredentialCreationResult.Failure(CredentialCreationStatus.AccountUnavailable);
            await WriteAuditAsync(
                CredentialCreatedAction,
                "denied",
                account?.Id,
                result.Status.ToString(),
                occurredAtUtc,
                cancellationToken);
            return result;
        }

        var credentialExists = await dbContext.Set<LocalPasswordCredential>()
            .AnyAsync(credential => credential.AuthAccountId == authAccountId, cancellationToken);

        if (credentialExists)
        {
            var result = CredentialCreationResult.Failure(CredentialCreationStatus.CredentialAlreadyExists);
            await WriteAuditAsync(
                CredentialCreatedAction,
                "denied",
                authAccountId,
                result.Status.ToString(),
                occurredAtUtc,
                cancellationToken);
            return result;
        }

        var hashResult = passwordHashingService.HashPassword(plaintextPassword);
        if (!hashResult.Succeeded)
        {
            var result = CredentialCreationResult.HashFailure(hashResult.FailureReason!.Value);
            await WriteAuditAsync(
                CredentialCreatedAction,
                "failure",
                authAccountId,
                result.Status.ToString(),
                occurredAtUtc,
                cancellationToken);
            return result;
        }

        dbContext.Set<LocalPasswordCredential>().Add(new LocalPasswordCredential
        {
            Id = Guid.NewGuid(),
            AuthAccountId = authAccountId,
            PasswordHash = hashResult.Verifier,
            PasswordHashAlgorithm = hashResult.Algorithm,
            PasswordHashAlgorithmVersion = hashResult.AlgorithmVersion,
            PasswordHashParameters = hashResult.ParametersJson,
            Status = LocalPasswordCredentialStatuses.Active,
            CreatedAtUtc = occurredAtUtc,
            UpdatedAtUtc = occurredAtUtc,
            LastVerifiedAtUtc = null,
            RevokedAtUtc = null,
            RequiresRehash = false
        });

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            var result = CredentialCreationResult.Failure(CredentialCreationStatus.PersistenceFailed);
            await WriteAuditAsync(
                CredentialCreatedAction,
                "failure",
                authAccountId,
                result.Status.ToString(),
                occurredAtUtc,
                cancellationToken);
            return result;
        }

        await WriteAuditAsync(
            CredentialCreatedAction,
            "success",
            authAccountId,
            CredentialCreationStatus.Created.ToString(),
            occurredAtUtc,
            cancellationToken);
        return CredentialCreationResult.Created();
    }

    public async Task<PasswordCredentialVerificationResult> VerifyLocalPasswordAsync(
        Guid authAccountId,
        string submittedPassword,
        CancellationToken cancellationToken = default)
    {
        var occurredAtUtc = timeProvider.GetUtcNow();
        var account = await dbContext.Set<AuthAccount>()
            .SingleOrDefaultAsync(account => account.Id == authAccountId, cancellationToken);

        if (!IsAccountEligibleForLocalCredential(account))
        {
            var result = PasswordCredentialVerificationResult.Failure(
                PasswordCredentialVerificationStatus.AccountUnavailable);
            await WriteVerificationAuditAsync(result, account?.Id, occurredAtUtc, cancellationToken);
            return result;
        }

        var credential = await dbContext.Set<LocalPasswordCredential>()
            .SingleOrDefaultAsync(
                credential => credential.AuthAccountId == authAccountId,
                cancellationToken);

        var unavailableResult = GetCredentialUnavailableResult(credential);
        if (unavailableResult is not null)
        {
            await WriteVerificationAuditAsync(unavailableResult, authAccountId, occurredAtUtc, cancellationToken);
            return unavailableResult;
        }

        var storedHash = new StoredPasswordHash(
            credential!.PasswordHash,
            credential.PasswordHashAlgorithm,
            credential.PasswordHashAlgorithmVersion,
            credential.PasswordHashParameters,
            credential.RequiresRehash);

        var verificationResult = passwordHashingService.VerifyPassword(submittedPassword, storedHash);
        if (!verificationResult.Succeeded)
        {
            var result = PasswordCredentialVerificationResult.Failure(
                MapPasswordVerificationStatus(verificationResult.Status));
            await WriteVerificationAuditAsync(result, authAccountId, occurredAtUtc, cancellationToken);
            return result;
        }

        credential.LastVerifiedAtUtc = occurredAtUtc;
        credential.UpdatedAtUtc = occurredAtUtc;

        var rehashAttempted = verificationResult.RequiresRehash;
        var rehashed = false;
        PasswordHashFailureReason? rehashFailureReason = null;

        if (rehashAttempted)
        {
            var newHash = passwordHashingService.HashPassword(submittedPassword);
            if (newHash.Succeeded)
            {
                credential.PasswordHash = newHash.Verifier;
                credential.PasswordHashAlgorithm = newHash.Algorithm;
                credential.PasswordHashAlgorithmVersion = newHash.AlgorithmVersion;
                credential.PasswordHashParameters = newHash.ParametersJson;
                credential.RequiresRehash = false;
                rehashed = true;
            }
            else
            {
                rehashFailureReason = newHash.FailureReason;
            }
        }

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            var result = PasswordCredentialVerificationResult.Failure(
                PasswordCredentialVerificationStatus.PersistenceFailed);
            await WriteVerificationAuditAsync(result, authAccountId, occurredAtUtc, cancellationToken);
            return result;
        }

        var verifiedResult = PasswordCredentialVerificationResult.Verified(
            rehashAttempted,
            rehashed,
            rehashFailureReason);
        await WriteVerificationAuditAsync(verifiedResult, authAccountId, occurredAtUtc, cancellationToken);
        return verifiedResult;
    }

    private static bool IsAccountEligibleForLocalCredential(AuthAccount? account)
    {
        return account is
        {
            Status: AuthAccountStatuses.Active,
            DeletedAtUtc: null,
            DisabledAtUtc: null
        };
    }

    private static PasswordCredentialVerificationResult? GetCredentialUnavailableResult(
        LocalPasswordCredential? credential)
    {
        if (credential is null)
        {
            return PasswordCredentialVerificationResult.Failure(
                PasswordCredentialVerificationStatus.CredentialUnavailable);
        }

        if (StringComparer.Ordinal.Equals(credential.Status, LocalPasswordCredentialStatuses.Disabled))
        {
            return PasswordCredentialVerificationResult.Failure(
                PasswordCredentialVerificationStatus.CredentialDisabled);
        }

        if (StringComparer.Ordinal.Equals(credential.Status, LocalPasswordCredentialStatuses.Revoked)
            || credential.RevokedAtUtc is not null)
        {
            return PasswordCredentialVerificationResult.Failure(
                PasswordCredentialVerificationStatus.CredentialRevoked);
        }

        if (!StringComparer.Ordinal.Equals(credential.Status, LocalPasswordCredentialStatuses.Active))
        {
            return PasswordCredentialVerificationResult.Failure(
                PasswordCredentialVerificationStatus.CredentialUnavailable);
        }

        return null;
    }

    private static PasswordCredentialVerificationStatus MapPasswordVerificationStatus(
        PasswordVerificationStatus status)
    {
        return status switch
        {
            PasswordVerificationStatus.WrongPassword => PasswordCredentialVerificationStatus.WrongPassword,
            PasswordVerificationStatus.MalformedVerifier => PasswordCredentialVerificationStatus.MalformedCredential,
            PasswordVerificationStatus.UnsupportedAlgorithm => PasswordCredentialVerificationStatus.UnsupportedAlgorithm,
            PasswordVerificationStatus.InvalidConfiguration => PasswordCredentialVerificationStatus.InvalidConfiguration,
            _ => PasswordCredentialVerificationStatus.CredentialUnavailable
        };
    }

    private ValueTask WriteVerificationAuditAsync(
        PasswordCredentialVerificationResult result,
        Guid? subjectAuthAccountId,
        DateTimeOffset occurredAtUtc,
        CancellationToken cancellationToken)
    {
        var outcome = result.Status switch
        {
            PasswordCredentialVerificationStatus.Verified => "success",
            PasswordCredentialVerificationStatus.CredentialDisabled => "denied",
            PasswordCredentialVerificationStatus.CredentialRevoked => "revoked",
            PasswordCredentialVerificationStatus.AccountUnavailable => "denied",
            PasswordCredentialVerificationStatus.CredentialUnavailable => "denied",
            _ => "failure"
        };

        return WriteAuditAsync(
            CredentialVerificationAction,
            outcome,
            subjectAuthAccountId,
            result.Status.ToString(),
            occurredAtUtc,
            cancellationToken);
    }

    private ValueTask WriteAuditAsync(
        string action,
        string outcome,
        Guid? subjectAuthAccountId,
        string reasonCategory,
        DateTimeOffset occurredAtUtc,
        CancellationToken cancellationToken)
    {
        return auditWriter.WriteAsync(
            new AuthCredentialAuditEvent(
                action,
                outcome,
                subjectAuthAccountId,
                reasonCategory,
                occurredAtUtc),
            cancellationToken);
    }
}
