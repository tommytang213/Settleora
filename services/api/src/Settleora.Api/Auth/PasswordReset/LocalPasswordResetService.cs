using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Settleora.Api.Auth.Credentials;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Auth.PasswordReset;

internal sealed class LocalPasswordResetService : ILocalPasswordResetService
{
    private const string ResetRequestedAction = "password_reset.requested";
    private const string ResetMaterialIssuedAction = "password_reset.material_issued";
    private const string ResetConsumedAction = "password_reset.consumed";
    private const string ResetDeniedAction = "password_reset.denied";
    private const string ResetReplaySuspiciousAction = "password_reset.replay_suspicious";
    private const string ResetMaterialRevokedAction = "password_reset.replaced_or_revoked";
    private const string ResetSessionsRevokedAction = "password_reset.sessions_revoked";
    private const string SessionRevocationReason = "password_reset";
    private const int PasswordMinLength = 12;
    private const int PasswordMaxLength = 4096;
    private const int IdentifierMaxLength = 320;

    private readonly SettleoraDbContext dbContext;
    private readonly IPasswordResetMaterialService materialService;
    private readonly IAuthCredentialWorkflowService credentialWorkflowService;
    private readonly IAuthSessionRuntimeService sessionRuntimeService;
    private readonly IPasswordResetAuditWriter auditWriter;
    private readonly TimeProvider timeProvider;

    public LocalPasswordResetService(
        SettleoraDbContext dbContext,
        IPasswordResetMaterialService materialService,
        IAuthCredentialWorkflowService credentialWorkflowService,
        IAuthSessionRuntimeService sessionRuntimeService,
        IPasswordResetAuditWriter auditWriter,
        TimeProvider timeProvider)
    {
        this.dbContext = dbContext;
        this.materialService = materialService;
        this.credentialWorkflowService = credentialWorkflowService;
        this.sessionRuntimeService = sessionRuntimeService;
        this.auditWriter = auditWriter;
        this.timeProvider = timeProvider;
    }

    public async Task<LocalPasswordResetRequestResult> RequestResetAsync(
        LocalPasswordResetRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var occurredAtUtc = timeProvider.GetUtcNow();
        var normalizedIdentifier = NormalizeIdentifier(request.SubmittedIdentifier);
        var resolved = await ResolveEligibleLocalAccountAsync(normalizedIdentifier, cancellationToken);

        await WriteAuditAsync(
            ResetRequestedAction,
            AuthAuditOutcomes.Success,
            resolved.Account?.Id,
            resolved.StatusCategory,
            request.RequestCorrelationId,
            occurredAtUtc,
            cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);
        return LocalPasswordResetRequestResult.Accepted();
    }

    public async Task<LocalPasswordResetMaterialIssueResult> IssueMaterialAsync(
        LocalPasswordResetMaterialIssueRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!StringComparer.Ordinal.Equals(request.MaterialScope, AuthPasswordResetMaterialScopes.EmailLink)
            || request.Lifetime <= TimeSpan.Zero)
        {
            return LocalPasswordResetMaterialIssueResult.NotIssued();
        }

        var occurredAtUtc = timeProvider.GetUtcNow();
        var normalizedIdentifier = NormalizeIdentifier(request.SubmittedIdentifier);
        var resolved = await ResolveEligibleLocalAccountAsync(normalizedIdentifier, cancellationToken);
        if (resolved.Account is null || resolved.Credential is null)
        {
            await WriteAuditAsync(
                ResetDeniedAction,
                AuthAuditOutcomes.Denied,
                resolved.Account?.Id,
                resolved.StatusCategory,
                request.RequestCorrelationId,
                occurredAtUtc,
                cancellationToken);
            await dbContext.SaveChangesAsync(cancellationToken);
            return LocalPasswordResetMaterialIssueResult.NotIssued();
        }

        IDbContextTransaction? transaction = null;
        try
        {
            if (dbContext.Database.IsRelational())
            {
                transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
            }

            var material = materialService.CreateMaterial();
            var resetRequestId = Guid.NewGuid();
            var pendingRequests = await dbContext.Set<AuthPasswordResetRequest>()
                .Where(resetRequest => resetRequest.AuthAccountId == resolved.Account.Id
                    && resetRequest.Purpose == AuthPasswordResetPurposes.LocalPasswordReset
                    && resetRequest.Status == AuthPasswordResetRequestStatuses.Pending
                    && resetRequest.RevokedAtUtc == null
                    && resetRequest.ConsumedAtUtc == null)
                .ToListAsync(cancellationToken);

            foreach (var pendingRequest in pendingRequests)
            {
                pendingRequest.Status = AuthPasswordResetRequestStatuses.Revoked;
                pendingRequest.RevokedAtUtc = occurredAtUtc;
                pendingRequest.ReplacedAtUtc = occurredAtUtc;
                pendingRequest.RevocationReason = AuthPasswordResetRevocationReasons.ReplacedByNewerMaterial;
                pendingRequest.ReplacedByResetRequestId = resetRequestId;
                pendingRequest.UpdatedAtUtc = occurredAtUtc;
            }

            dbContext.Set<AuthPasswordResetRequest>().Add(new AuthPasswordResetRequest
            {
                Id = resetRequestId,
                Purpose = AuthPasswordResetPurposes.LocalPasswordReset,
                Status = AuthPasswordResetRequestStatuses.Pending,
                AuthAccountId = resolved.Account.Id,
                LocalPasswordCredentialId = resolved.Credential.Id,
                ResetMaterialHash = material.LookupHash,
                ResetMaterialHashVersion = material.HashVersion,
                ResetMaterialScope = request.MaterialScope,
                IssuedAtUtc = occurredAtUtc,
                ExpiresAtUtc = occurredAtUtc.Add(request.Lifetime),
                DeliveryCategory = AuthPasswordResetDeliveryCategories.EmailLink,
                ProviderSendCategory = AuthPasswordResetProviderSendCategories.NotAttempted,
                RequestSourceBucketRef = NormalizeOptionalBucket(request.SourceBucketRef),
                IdentifierBucketRef = normalizedIdentifier is null ? null : DeriveIdentifierBucketRef(normalizedIdentifier),
                CombinedBucketRef = BuildCombinedBucketRef(request.SourceBucketRef, normalizedIdentifier),
                RequestCorrelationId = NormalizeOptionalCategory(request.RequestCorrelationId),
                AuditCorrelationId = NormalizeOptionalCategory(request.RequestCorrelationId),
                CreatedAtUtc = occurredAtUtc,
                UpdatedAtUtc = occurredAtUtc
            });

            await WriteAuditAsync(
                ResetMaterialIssuedAction,
                AuthAuditOutcomes.Success,
                resolved.Account.Id,
                LocalPasswordResetMaterialIssueStatus.Issued.ToString(),
                request.RequestCorrelationId,
                occurredAtUtc,
                cancellationToken);

            if (pendingRequests.Count > 0)
            {
                await WriteAuditAsync(
                    ResetMaterialRevokedAction,
                    AuthAuditOutcomes.Revoked,
                    resolved.Account.Id,
                    AuthPasswordResetRevocationReasons.ReplacedByNewerMaterial,
                    request.RequestCorrelationId,
                    occurredAtUtc,
                    cancellationToken);
            }

            await dbContext.SaveChangesAsync(cancellationToken);
            if (transaction is not null)
            {
                await transaction.CommitAsync(cancellationToken);
            }

            return LocalPasswordResetMaterialIssueResult.Issued(resetRequestId, material.RawMaterial);
        }
        catch (DbUpdateException)
        {
            await RollbackAsync(transaction, cancellationToken);
            dbContext.ChangeTracker.Clear();
            return LocalPasswordResetMaterialIssueResult.NotIssued();
        }
        finally
        {
            if (transaction is not null)
            {
                await transaction.DisposeAsync();
            }
        }
    }

    public async Task<LocalPasswordResetCompleteResult> CompleteResetAsync(
        LocalPasswordResetCompleteRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!IsPasswordInputBounded(request.NewPassword)
            || request.NewPassword!.Length < PasswordMinLength
            || string.IsNullOrWhiteSpace(request.SubmittedResetMaterial))
        {
            return LocalPasswordResetCompleteResult.Failure(LocalPasswordResetCompleteStatus.InvalidNewPassword);
        }

        var occurredAtUtc = timeProvider.GetUtcNow();
        var lookupHash = materialService.DeriveLookupHash(request.SubmittedResetMaterial);
        if (lookupHash.Length == 0)
        {
            return LocalPasswordResetCompleteResult.Failure(LocalPasswordResetCompleteStatus.InvalidOrUnavailable);
        }

        IDbContextTransaction? transaction = null;
        try
        {
            if (dbContext.Database.IsRelational())
            {
                transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
            }

            var resetRequest = await dbContext.Set<AuthPasswordResetRequest>()
                .Include(candidate => candidate.AuthAccount)
                .SingleOrDefaultAsync(
                    candidate => candidate.ResetMaterialHash == lookupHash
                        && candidate.Purpose == AuthPasswordResetPurposes.LocalPasswordReset,
                    cancellationToken);

            if (resetRequest is null)
            {
                await WriteAuditAsync(
                    ResetDeniedAction,
                    AuthAuditOutcomes.Denied,
                    null,
                    "unknown_material",
                    request.RequestCorrelationId,
                    occurredAtUtc,
                    cancellationToken);
                await dbContext.SaveChangesAsync(cancellationToken);
                await CommitAsync(transaction, cancellationToken);
                return LocalPasswordResetCompleteResult.Failure(LocalPasswordResetCompleteStatus.InvalidOrUnavailable);
            }

            var unavailable = await TryClassifyUnavailableMaterialAsync(
                resetRequest,
                occurredAtUtc,
                cancellationToken);
            if (unavailable is not null)
            {
                await WriteAuditAsync(
                    unavailable.ReplaySuspicious ? ResetReplaySuspiciousAction : ResetDeniedAction,
                    unavailable.ReplaySuspicious ? AuthAuditOutcomes.Failure : AuthAuditOutcomes.Denied,
                    resetRequest.AuthAccountId,
                    unavailable.StatusCategory,
                    request.RequestCorrelationId ?? resetRequest.AuditCorrelationId,
                    occurredAtUtc,
                    cancellationToken);
                await dbContext.SaveChangesAsync(cancellationToken);
                await CommitAsync(transaction, cancellationToken);
                return LocalPasswordResetCompleteResult.Failure(LocalPasswordResetCompleteStatus.InvalidOrUnavailable);
            }

            if (resetRequest.AuthAccountId is null)
            {
                return await CompleteDeniedAsync(
                    resetRequest,
                    "missing_account_binding",
                    request.RequestCorrelationId,
                    occurredAtUtc,
                    transaction,
                    cancellationToken);
            }

            var resolved = await ResolveAccountForCompletionAsync(resetRequest.AuthAccountId.Value, cancellationToken);
            if (resolved.Account is null || resolved.Credential is null)
            {
                return await CompleteDeniedAsync(
                    resetRequest,
                    resolved.StatusCategory,
                    request.RequestCorrelationId,
                    occurredAtUtc,
                    transaction,
                    cancellationToken);
            }

            var resetResult = await credentialWorkflowService.ResetLocalPasswordAsync(
                resolved.Account.Id,
                request.NewPassword,
                cancellationToken);
            if (!resetResult.Succeeded)
            {
                return await CompleteDeniedAsync(
                    resetRequest,
                    resetResult.Status.ToString(),
                    request.RequestCorrelationId,
                    occurredAtUtc,
                    transaction,
                    cancellationToken,
                    resetResult.Status == PasswordCredentialResetStatus.PersistenceFailed
                        ? LocalPasswordResetCompleteStatus.PersistenceFailed
                        : LocalPasswordResetCompleteStatus.InvalidOrUnavailable);
            }

            resetRequest.Status = AuthPasswordResetRequestStatuses.Consumed;
            resetRequest.ConsumedAtUtc = occurredAtUtc;
            resetRequest.LastCheckedAtUtc = occurredAtUtc;
            resetRequest.UpdatedAtUtc = occurredAtUtc;

            await RevokeOutstandingResetMaterialAsync(
                resolved.Account.Id,
                resetRequest.Id,
                occurredAtUtc,
                cancellationToken);

            var sessionRevocation = await sessionRuntimeService.RevokeActiveSessionsForAccountAsync(
                new AuthAccountSessionRevocationRequest(
                    resolved.Account.Id,
                    SessionRevocationReason,
                    ExcludedAuthSessionId: null),
                cancellationToken);
            if (sessionRevocation.Status == AuthAccountSessionRevocationStatus.PersistenceFailed)
            {
                await RollbackAsync(transaction, cancellationToken);
                return LocalPasswordResetCompleteResult.Failure(LocalPasswordResetCompleteStatus.PersistenceFailed);
            }

            await WriteAuditAsync(
                ResetConsumedAction,
                AuthAuditOutcomes.Success,
                resolved.Account.Id,
                LocalPasswordResetCompleteStatus.Completed.ToString(),
                request.RequestCorrelationId ?? resetRequest.AuditCorrelationId,
                occurredAtUtc,
                cancellationToken);
            await WriteAuditAsync(
                ResetSessionsRevokedAction,
                AuthAuditOutcomes.Revoked,
                resolved.Account.Id,
                SessionRevocationReason,
                request.RequestCorrelationId ?? resetRequest.AuditCorrelationId,
                occurredAtUtc,
                cancellationToken);

            await dbContext.SaveChangesAsync(cancellationToken);
            await CommitAsync(transaction, cancellationToken);
            return LocalPasswordResetCompleteResult.Completed();
        }
        catch (DbUpdateException)
        {
            await RollbackAsync(transaction, cancellationToken);
            dbContext.ChangeTracker.Clear();
            return LocalPasswordResetCompleteResult.Failure(LocalPasswordResetCompleteStatus.PersistenceFailed);
        }
        finally
        {
            if (transaction is not null)
            {
                await transaction.DisposeAsync();
            }
        }
    }

    private async Task<LocalPasswordResetCompleteResult> CompleteDeniedAsync(
        AuthPasswordResetRequest resetRequest,
        string statusCategory,
        string? requestCorrelationId,
        DateTimeOffset occurredAtUtc,
        IDbContextTransaction? transaction,
        CancellationToken cancellationToken,
        LocalPasswordResetCompleteStatus resultStatus = LocalPasswordResetCompleteStatus.InvalidOrUnavailable)
    {
        resetRequest.LastCheckedAtUtc = occurredAtUtc;
        resetRequest.UpdatedAtUtc = occurredAtUtc;
        await WriteAuditAsync(
            ResetDeniedAction,
            resultStatus == LocalPasswordResetCompleteStatus.PersistenceFailed
                ? AuthAuditOutcomes.Failure
                : AuthAuditOutcomes.Denied,
            resetRequest.AuthAccountId,
            statusCategory,
            requestCorrelationId ?? resetRequest.AuditCorrelationId,
            occurredAtUtc,
            cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        await CommitAsync(transaction, cancellationToken);
        return LocalPasswordResetCompleteResult.Failure(resultStatus);
    }

    private async Task RevokeOutstandingResetMaterialAsync(
        Guid authAccountId,
        Guid consumedResetRequestId,
        DateTimeOffset occurredAtUtc,
        CancellationToken cancellationToken)
    {
        var outstandingRequests = await dbContext.Set<AuthPasswordResetRequest>()
            .Where(resetRequest => resetRequest.AuthAccountId == authAccountId
                && resetRequest.Id != consumedResetRequestId
                && resetRequest.Purpose == AuthPasswordResetPurposes.LocalPasswordReset
                && resetRequest.Status == AuthPasswordResetRequestStatuses.Pending
                && resetRequest.RevokedAtUtc == null
                && resetRequest.ConsumedAtUtc == null)
            .ToListAsync(cancellationToken);

        foreach (var resetRequest in outstandingRequests)
        {
            resetRequest.Status = AuthPasswordResetRequestStatuses.Revoked;
            resetRequest.RevokedAtUtc = occurredAtUtc;
            resetRequest.RevocationReason = AuthPasswordResetRevocationReasons.SuccessfulReset;
            resetRequest.UpdatedAtUtc = occurredAtUtc;
        }
    }

    private async Task<UnavailableMaterial?> TryClassifyUnavailableMaterialAsync(
        AuthPasswordResetRequest resetRequest,
        DateTimeOffset occurredAtUtc,
        CancellationToken cancellationToken)
    {
        if (!StringComparer.Ordinal.Equals(resetRequest.ResetMaterialScope, AuthPasswordResetMaterialScopes.EmailLink))
        {
            resetRequest.LastCheckedAtUtc = occurredAtUtc;
            resetRequest.UpdatedAtUtc = occurredAtUtc;
            return new UnavailableMaterial("wrong_scope", ReplaySuspicious: false);
        }

        if (StringComparer.Ordinal.Equals(resetRequest.Status, AuthPasswordResetRequestStatuses.Consumed)
            || resetRequest.ConsumedAtUtc is not null)
        {
            resetRequest.Status = AuthPasswordResetRequestStatuses.SuspiciousReplay;
            resetRequest.SuspiciousReplayAtUtc ??= occurredAtUtc;
            resetRequest.LastCheckedAtUtc = occurredAtUtc;
            resetRequest.UpdatedAtUtc = occurredAtUtc;
            return new UnavailableMaterial("consumed_replay", ReplaySuspicious: true);
        }

        if (StringComparer.Ordinal.Equals(resetRequest.Status, AuthPasswordResetRequestStatuses.Revoked)
            || resetRequest.RevokedAtUtc is not null
            || resetRequest.ReplacedAtUtc is not null
            || resetRequest.ReplacedByResetRequestId is not null)
        {
            resetRequest.Status = AuthPasswordResetRequestStatuses.SuspiciousReplay;
            resetRequest.SuspiciousReplayAtUtc ??= occurredAtUtc;
            resetRequest.LastCheckedAtUtc = occurredAtUtc;
            resetRequest.UpdatedAtUtc = occurredAtUtc;
            return new UnavailableMaterial("revoked_or_replaced_replay", ReplaySuspicious: true);
        }

        if (!StringComparer.Ordinal.Equals(resetRequest.Status, AuthPasswordResetRequestStatuses.Pending)
            || resetRequest.ExpiresAtUtc is null
            || resetRequest.ExpiresAtUtc <= occurredAtUtc)
        {
            resetRequest.Status = AuthPasswordResetRequestStatuses.Expired;
            resetRequest.LastCheckedAtUtc = occurredAtUtc;
            resetRequest.UpdatedAtUtc = occurredAtUtc;
            return new UnavailableMaterial("expired", ReplaySuspicious: false);
        }

        await Task.CompletedTask;
        return null;
    }

    private async Task<ResolvedResetAccount> ResolveEligibleLocalAccountAsync(
        string? normalizedIdentifier,
        CancellationToken cancellationToken)
    {
        if (normalizedIdentifier is null)
        {
            return new ResolvedResetAccount(null, null, "invalid_identifier");
        }

        var identity = await dbContext.Set<AuthIdentity>()
            .Include(identity => identity.AuthAccount)
            .SingleOrDefaultAsync(
                identity => identity.ProviderType == AuthIdentityProviderTypes.Local
                    && identity.ProviderName == AuthIdentityProviderTypes.Local
                    && identity.ProviderSubject == normalizedIdentifier
                    && identity.DisabledAtUtc == null,
                cancellationToken);
        if (identity is null)
        {
            return new ResolvedResetAccount(null, null, "not_eligible");
        }

        if (!IsAccountEligible(identity.AuthAccount))
        {
            return new ResolvedResetAccount(identity.AuthAccount, null, "not_eligible");
        }

        var credential = await dbContext.Set<LocalPasswordCredential>()
            .SingleOrDefaultAsync(
                credential => credential.AuthAccountId == identity.AuthAccountId,
                cancellationToken);
        if (!IsCredentialActive(credential))
        {
            return new ResolvedResetAccount(identity.AuthAccount, null, "not_eligible");
        }

        return new ResolvedResetAccount(identity.AuthAccount, credential, "eligible_provider_unavailable");
    }

    private async Task<ResolvedResetAccount> ResolveAccountForCompletionAsync(
        Guid authAccountId,
        CancellationToken cancellationToken)
    {
        var account = await dbContext.Set<AuthAccount>()
            .SingleOrDefaultAsync(account => account.Id == authAccountId, cancellationToken);
        if (!IsAccountEligible(account))
        {
            return new ResolvedResetAccount(account, null, "account_unavailable");
        }

        var hasLocalIdentity = await dbContext.Set<AuthIdentity>()
            .AnyAsync(identity => identity.AuthAccountId == authAccountId
                && identity.ProviderType == AuthIdentityProviderTypes.Local
                && identity.ProviderName == AuthIdentityProviderTypes.Local
                && identity.DisabledAtUtc == null,
                cancellationToken);
        if (!hasLocalIdentity)
        {
            return new ResolvedResetAccount(account, null, "not_local_account");
        }

        var credential = await dbContext.Set<LocalPasswordCredential>()
            .SingleOrDefaultAsync(
                credential => credential.AuthAccountId == authAccountId,
                cancellationToken);
        if (!IsCredentialActive(credential))
        {
            return new ResolvedResetAccount(account, null, "credential_unavailable");
        }

        return new ResolvedResetAccount(account, credential, "eligible");
    }

    private ValueTask WriteAuditAsync(
        string action,
        string outcome,
        Guid? subjectAuthAccountId,
        string statusCategory,
        string? correlationId,
        DateTimeOffset occurredAtUtc,
        CancellationToken cancellationToken)
    {
        return auditWriter.WriteAsync(
            new PasswordResetAuditEvent(
                action,
                outcome,
                subjectAuthAccountId,
                statusCategory,
                NormalizeOptionalCategory(correlationId),
                occurredAtUtc),
            cancellationToken);
    }

    private static string? NormalizeIdentifier(string? submittedIdentifier)
    {
        if (string.IsNullOrWhiteSpace(submittedIdentifier))
        {
            return null;
        }

        var normalized = submittedIdentifier.Trim().ToLowerInvariant();
        return normalized.Length is 0 or > IdentifierMaxLength ? null : normalized;
    }

    private static bool IsPasswordInputBounded(string? password)
    {
        return !string.IsNullOrWhiteSpace(password)
            && password.Length <= PasswordMaxLength;
    }

    private static bool IsAccountEligible(AuthAccount? account)
    {
        return account is
        {
            Status: AuthAccountStatuses.Active,
            DisabledAtUtc: null,
            DeletedAtUtc: null
        };
    }

    private static bool IsCredentialActive(LocalPasswordCredential? credential)
    {
        return credential is
        {
            Status: LocalPasswordCredentialStatuses.Active,
            RevokedAtUtc: null
        };
    }

    private static string? NormalizeOptionalBucket(string? value)
    {
        return NormalizeOptionalCategory(value);
    }

    private static string? NormalizeOptionalCategory(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var normalized = value.Trim();
        if (normalized.Length is 0 or > 120)
        {
            return null;
        }

        foreach (var character in normalized)
        {
            if (!IsSafeMetadataCategoryCharacter(character))
            {
                return null;
            }
        }

        return normalized;
    }

    private static string DeriveIdentifierBucketRef(string normalizedIdentifier)
    {
        var hash = System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes("local-password-reset-id:" + normalizedIdentifier));
        return "reset-id-sha256:" + Microsoft.AspNetCore.WebUtilities.WebEncoders.Base64UrlEncode(hash);
    }

    private static string? BuildCombinedBucketRef(string? sourceBucketRef, string? normalizedIdentifier)
    {
        var normalizedSource = NormalizeOptionalBucket(sourceBucketRef);
        if (normalizedSource is null || normalizedIdentifier is null)
        {
            return null;
        }

        var hash = System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes("local-password-reset-combined:" + normalizedSource + ":" + normalizedIdentifier));
        return "reset-combined-sha256:" + Microsoft.AspNetCore.WebUtilities.WebEncoders.Base64UrlEncode(hash);
    }

    private static bool IsSafeMetadataCategoryCharacter(char character)
    {
        return character is >= 'a' and <= 'z'
            or >= 'A' and <= 'Z'
            or >= '0' and <= '9'
            or '_'
            or '-'
            or '.'
            or ':';
    }

    private static async Task CommitAsync(
        IDbContextTransaction? transaction,
        CancellationToken cancellationToken)
    {
        if (transaction is not null)
        {
            await transaction.CommitAsync(cancellationToken);
        }
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

    private sealed record ResolvedResetAccount(
        AuthAccount? Account,
        LocalPasswordCredential? Credential,
        string StatusCategory);

    private sealed record UnavailableMaterial(
        string StatusCategory,
        bool ReplaySuspicious);
}
