using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Options;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Auth.Sessions;

internal sealed class AuthRefreshSessionRuntimeService : IAuthRefreshSessionRuntimeService
{
    private const string AuthRefreshSessionWorkflowName = "auth_refresh_session_runtime";
    private const string RefreshSessionCreatedAction = "refresh_session.created";
    private const string RefreshRotatedAction = "refresh.rotated";
    private const string RefreshFailedAction = "refresh.failed";
    private const string RefreshReplayDetectedAction = "refresh.replay_detected";
    private const string SessionFamilyRevokedAction = "session_family.revoked";
    private const string AccessTokenHashPrefix = "sha256:";
    private const string RefreshTokenHashPrefix = "refresh-sha256:";
    private const int TokenByteLength = 32;
    private const int DeviceLabelMaxLength = 120;
    private const int UserAgentSummaryMaxLength = 320;
    private const int NetworkAddressHashMaxLength = 128;
    private const int RevocationReasonMaxLength = 120;
    private const string RefreshRotatedReason = "refresh_rotated";
    private const string RefreshReplayReason = "refresh_replay_detected";
    private const string RefreshExpiredReason = "refresh_expired";
    private const string RefreshFamilyExpiredReason = "refresh_family_expired";
    private const string AccountUnavailableReason = "account_unavailable";

    private readonly SettleoraDbContext dbContext;
    private readonly IAuthSessionAuditWriter auditWriter;
    private readonly TimeProvider timeProvider;
    private readonly AuthSessionPolicyOptions sessionPolicyOptions;

    public AuthRefreshSessionRuntimeService(
        SettleoraDbContext dbContext,
        IAuthSessionAuditWriter auditWriter,
        TimeProvider timeProvider,
        IOptions<AuthSessionPolicyOptions> sessionPolicyOptions)
    {
        this.dbContext = dbContext;
        this.auditWriter = auditWriter;
        this.timeProvider = timeProvider;
        this.sessionPolicyOptions = sessionPolicyOptions.Value;
    }

    public async Task<AuthRefreshSessionCreationResult> CreateRefreshSessionAsync(
        AuthRefreshSessionCreationRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var occurredAtUtc = timeProvider.GetUtcNow();
        var account = await dbContext.Set<AuthAccount>()
            .SingleOrDefaultAsync(account => account.Id == request.AuthAccountId, cancellationToken);

        if (!IsAccountAvailable(account))
        {
            var result = AuthRefreshSessionCreationResult.Failure(
                AuthRefreshSessionCreationStatus.AccountUnavailable);
            return await WriteCreationFailureAuditAndReturnAsync(
                result,
                account?.Id,
                occurredAtUtc,
                cancellationToken);
        }

        var sessionFamilyId = Guid.NewGuid();
        var refreshCredentialId = Guid.NewGuid();
        var familyAbsoluteExpiresAtUtc = occurredAtUtc.Add(sessionPolicyOptions.RefreshAbsoluteLifetime);
        var credentialMaterial = CreateCredentialMaterial(occurredAtUtc, familyAbsoluteExpiresAtUtc);

        var session = CreateAccessSession(
            account!.Id,
            credentialMaterial.AccessSessionTokenHash,
            credentialMaterial.AccessSessionExpiresAtUtc,
            occurredAtUtc,
            request.DeviceLabel,
            request.UserAgentSummary,
            request.NetworkAddressHash);
        var sessionFamily = new AuthSessionFamily
        {
            Id = sessionFamilyId,
            AuthAccountId = account.Id,
            Status = AuthSessionFamilyStatuses.Active,
            CreatedAtUtc = occurredAtUtc,
            UpdatedAtUtc = occurredAtUtc,
            AbsoluteExpiresAtUtc = familyAbsoluteExpiresAtUtc,
            LastRotatedAtUtc = null,
            RevokedAtUtc = null,
            RevocationReason = null
        };
        var refreshCredential = CreateRefreshCredential(
            refreshCredentialId,
            sessionFamilyId,
            session.Id,
            credentialMaterial.RefreshCredentialHash,
            credentialMaterial.RefreshCredentialIdleExpiresAtUtc,
            credentialMaterial.RefreshCredentialAbsoluteExpiresAtUtc,
            occurredAtUtc);

        dbContext.Set<AuthSession>().Add(session);
        dbContext.Set<AuthSessionFamily>().Add(sessionFamily);
        dbContext.Set<AuthRefreshCredential>().Add(refreshCredential);
        await WriteAuditAsync(
            RefreshSessionCreatedAction,
            AuthAuditOutcomes.Success,
            actorAuthAccountId: null,
            subjectAuthAccountId: account.Id,
            AuthRefreshSessionCreationStatus.Created.ToString(),
            occurredAtUtc,
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return AuthRefreshSessionCreationResult.Failure(
                AuthRefreshSessionCreationStatus.PersistenceFailed);
        }

        return AuthRefreshSessionCreationResult.Created(
            session.Id,
            sessionFamily.Id,
            refreshCredential.Id,
            credentialMaterial.RawAccessSessionToken,
            credentialMaterial.RawRefreshCredential,
            credentialMaterial.AccessSessionExpiresAtUtc,
            credentialMaterial.RefreshCredentialIdleExpiresAtUtc,
            credentialMaterial.RefreshCredentialAbsoluteExpiresAtUtc,
            sessionFamily.AbsoluteExpiresAtUtc);
    }

    public async Task<AuthRefreshSessionRotationResult> RotateRefreshCredentialAsync(
        AuthRefreshSessionRotationRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (string.IsNullOrWhiteSpace(request.RawRefreshCredential))
        {
            return AuthRefreshSessionRotationResult.Failure(
                AuthRefreshSessionRotationStatus.CredentialUnavailable);
        }

        var occurredAtUtc = timeProvider.GetUtcNow();
        var submittedRefreshCredentialHash = HashToken(
            request.RawRefreshCredential,
            RefreshTokenHashPrefix);
        var credential = await dbContext.Set<AuthRefreshCredential>()
            .Include(credential => credential.SessionFamily)
            .ThenInclude(sessionFamily => sessionFamily.AuthAccount)
            .SingleOrDefaultAsync(
                credential => credential.RefreshTokenHash == submittedRefreshCredentialHash,
                cancellationToken);

        if (credential is null)
        {
            return AuthRefreshSessionRotationResult.Failure(
                AuthRefreshSessionRotationStatus.CredentialUnavailable);
        }

        var credentialUnavailableStatus = GetCredentialUnavailableStatus(credential, occurredAtUtc);
        if (credentialUnavailableStatus is not null)
        {
            return await HandleLinkedCredentialUnavailableAsync(
                credential.AuthSessionFamilyId,
                credentialUnavailableStatus.Value,
                occurredAtUtc,
                cancellationToken);
        }

        var sessionFamily = credential.SessionFamily;
        var familyUnavailableStatus = GetFamilyUnavailableStatus(sessionFamily, occurredAtUtc);
        if (familyUnavailableStatus is not null)
        {
            return await HandleSessionFamilyUnavailableAsync(
                sessionFamily,
                familyUnavailableStatus.Value,
                occurredAtUtc,
                cancellationToken);
        }

        if (!IsAccountAvailable(sessionFamily.AuthAccount))
        {
            return await RevokeLinkedFamilyAndReturnFailureAsync(
                sessionFamily.Id,
                AuthRefreshSessionRotationStatus.AccountUnavailable,
                AuthSessionFamilyStatuses.Revoked,
                AuthRefreshCredentialStatuses.Revoked,
                AccountUnavailableReason,
                RefreshFailedAction,
                AuthAuditOutcomes.Denied,
                occurredAtUtc,
                cancellationToken);
        }

        return await RotateActiveCredentialAsync(
            credential,
            request,
            occurredAtUtc,
            cancellationToken);
    }

    private async Task<AuthRefreshSessionRotationResult> RotateActiveCredentialAsync(
        AuthRefreshCredential credential,
        AuthRefreshSessionRotationRequest request,
        DateTimeOffset occurredAtUtc,
        CancellationToken cancellationToken)
    {
        IDbContextTransaction? transaction = null;
        var useRelationalTransaction = dbContext.Database.IsRelational();
        var replacementCredentialId = Guid.NewGuid();
        var sessionFamily = credential.SessionFamily;
        var credentialMaterial = CreateCredentialMaterial(
            occurredAtUtc,
            sessionFamily.AbsoluteExpiresAtUtc);
        var replacementSession = CreateAccessSession(
            sessionFamily.AuthAccountId,
            credentialMaterial.AccessSessionTokenHash,
            credentialMaterial.AccessSessionExpiresAtUtc,
            occurredAtUtc,
            request.DeviceLabel,
            request.UserAgentSummary,
            request.NetworkAddressHash);
        var replacementCredential = CreateRefreshCredential(
            replacementCredentialId,
            sessionFamily.Id,
            replacementSession.Id,
            credentialMaterial.RefreshCredentialHash,
            credentialMaterial.RefreshCredentialIdleExpiresAtUtc,
            credentialMaterial.RefreshCredentialAbsoluteExpiresAtUtc,
            occurredAtUtc);

        try
        {
            if (useRelationalTransaction)
            {
                transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
            }

            dbContext.Set<AuthSession>().Add(replacementSession);
            dbContext.Set<AuthRefreshCredential>().Add(replacementCredential);

            if (useRelationalTransaction)
            {
                await dbContext.SaveChangesAsync(cancellationToken);
                var consumedRows = await dbContext.Set<AuthRefreshCredential>()
                    .Where(candidate => candidate.Id == credential.Id
                        && candidate.Status == AuthRefreshCredentialStatuses.Active
                        && candidate.ConsumedAtUtc == null
                        && candidate.RevokedAtUtc == null)
                    .ExecuteUpdateAsync(setters => setters
                        .SetProperty(
                            candidate => candidate.Status,
                            AuthRefreshCredentialStatuses.Rotated)
                        .SetProperty(
                            candidate => candidate.ConsumedAtUtc,
                            occurredAtUtc)
                        .SetProperty(
                            candidate => candidate.ReplacedByRefreshCredentialId,
                            (Guid?)replacementCredentialId)
                        .SetProperty(
                            candidate => candidate.RevocationReason,
                            NormalizeOptionalField(RefreshRotatedReason, RevocationReasonMaxLength))
                        .SetProperty(
                            candidate => candidate.UpdatedAtUtc,
                            occurredAtUtc),
                        cancellationToken);

                if (consumedRows is not 1)
                {
                    await RollbackAsync(transaction, cancellationToken);
                    dbContext.ChangeTracker.Clear();
                    return await RevokeLinkedFamilyAndReturnFailureAsync(
                        sessionFamily.Id,
                        AuthRefreshSessionRotationStatus.CredentialReplayed,
                        AuthSessionFamilyStatuses.Replayed,
                        AuthRefreshCredentialStatuses.Replayed,
                        RefreshReplayReason,
                        RefreshReplayDetectedAction,
                        AuthAuditOutcomes.Revoked,
                        occurredAtUtc,
                        cancellationToken);
                }
            }
            else
            {
                credential.Status = AuthRefreshCredentialStatuses.Rotated;
                credential.ConsumedAtUtc = occurredAtUtc;
                credential.ReplacedByRefreshCredentialId = replacementCredentialId;
                credential.RevocationReason = NormalizeOptionalField(
                    RefreshRotatedReason,
                    RevocationReasonMaxLength);
                credential.UpdatedAtUtc = occurredAtUtc;
            }

            sessionFamily.LastRotatedAtUtc = occurredAtUtc;
            sessionFamily.UpdatedAtUtc = occurredAtUtc;
            await WriteAuditAsync(
                RefreshRotatedAction,
                AuthAuditOutcomes.Success,
                sessionFamily.AuthAccountId,
                sessionFamily.AuthAccountId,
                AuthRefreshSessionRotationStatus.Rotated.ToString(),
                occurredAtUtc,
                cancellationToken);

            await dbContext.SaveChangesAsync(cancellationToken);

            if (transaction is not null)
            {
                await transaction.CommitAsync(cancellationToken);
            }
        }
        catch (DbUpdateException)
        {
            if (transaction is not null)
            {
                await transaction.RollbackAsync(cancellationToken);
            }

            dbContext.ChangeTracker.Clear();
            return AuthRefreshSessionRotationResult.Failure(
                AuthRefreshSessionRotationStatus.PersistenceFailed);
        }
        finally
        {
            if (transaction is not null)
            {
                await transaction.DisposeAsync();
            }
        }

        return AuthRefreshSessionRotationResult.Rotated(
            replacementSession.Id,
            sessionFamily.Id,
            credential.Id,
            replacementCredential.Id,
            credentialMaterial.RawAccessSessionToken,
            credentialMaterial.RawRefreshCredential,
            credentialMaterial.AccessSessionExpiresAtUtc,
            credentialMaterial.RefreshCredentialIdleExpiresAtUtc,
            credentialMaterial.RefreshCredentialAbsoluteExpiresAtUtc,
            sessionFamily.AbsoluteExpiresAtUtc);
    }

    private async Task<AuthRefreshSessionCreationResult> WriteCreationFailureAuditAndReturnAsync(
        AuthRefreshSessionCreationResult result,
        Guid? subjectAuthAccountId,
        DateTimeOffset occurredAtUtc,
        CancellationToken cancellationToken)
    {
        try
        {
            await WriteAuditAndSaveAsync(
                RefreshSessionCreatedAction,
                AuthAuditOutcomes.Denied,
                actorAuthAccountId: null,
                subjectAuthAccountId,
                result.Status.ToString(),
                occurredAtUtc,
                cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return AuthRefreshSessionCreationResult.Failure(
                AuthRefreshSessionCreationStatus.PersistenceFailed);
        }

        return result;
    }

    private async Task<AuthRefreshSessionRotationResult> HandleLinkedCredentialUnavailableAsync(
        Guid sessionFamilyId,
        AuthRefreshSessionRotationStatus status,
        DateTimeOffset occurredAtUtc,
        CancellationToken cancellationToken)
    {
        if (status is AuthRefreshSessionRotationStatus.CredentialExpired)
        {
            return await RevokeLinkedFamilyAndReturnFailureAsync(
                sessionFamilyId,
                status,
                AuthSessionFamilyStatuses.Expired,
                AuthRefreshCredentialStatuses.Expired,
                RefreshExpiredReason,
                RefreshFailedAction,
                AuthAuditOutcomes.Expired,
                occurredAtUtc,
                cancellationToken);
        }

        return await RevokeLinkedFamilyAndReturnFailureAsync(
            sessionFamilyId,
            status is AuthRefreshSessionRotationStatus.CredentialInactive
                ? AuthRefreshSessionRotationStatus.CredentialInactive
                : status,
            AuthSessionFamilyStatuses.Replayed,
            AuthRefreshCredentialStatuses.Replayed,
            RefreshReplayReason,
            RefreshReplayDetectedAction,
            AuthAuditOutcomes.Revoked,
            occurredAtUtc,
            cancellationToken);
    }

    private async Task<AuthRefreshSessionRotationResult> HandleSessionFamilyUnavailableAsync(
        AuthSessionFamily sessionFamily,
        AuthRefreshSessionRotationStatus status,
        DateTimeOffset occurredAtUtc,
        CancellationToken cancellationToken)
    {
        if (status is AuthRefreshSessionRotationStatus.SessionFamilyExpired)
        {
            return await RevokeLinkedFamilyAndReturnFailureAsync(
                sessionFamily.Id,
                status,
                AuthSessionFamilyStatuses.Expired,
                AuthRefreshCredentialStatuses.Expired,
                RefreshFamilyExpiredReason,
                RefreshFailedAction,
                AuthAuditOutcomes.Expired,
                occurredAtUtc,
                cancellationToken);
        }

        return await WriteRotationFailureAuditAndReturnAsync(
            status,
            sessionFamily.AuthAccountId,
            MapFailureOutcome(status),
            occurredAtUtc,
            cancellationToken);
    }

    private async Task<AuthRefreshSessionRotationResult> RevokeLinkedFamilyAndReturnFailureAsync(
        Guid sessionFamilyId,
        AuthRefreshSessionRotationStatus status,
        string sessionFamilyStatus,
        string activeRefreshCredentialStatus,
        string revocationReason,
        string primaryAuditAction,
        string primaryAuditOutcome,
        DateTimeOffset occurredAtUtc,
        CancellationToken cancellationToken)
    {
        IDbContextTransaction? transaction = null;

        try
        {
            if (dbContext.Database.IsRelational())
            {
                transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
            }

            var sessionFamily = await dbContext.Set<AuthSessionFamily>()
                .SingleOrDefaultAsync(
                    sessionFamily => sessionFamily.Id == sessionFamilyId,
                    cancellationToken);
            if (sessionFamily is null)
            {
                return AuthRefreshSessionRotationResult.Failure(
                    AuthRefreshSessionRotationStatus.CredentialUnavailable);
            }

            MarkSessionFamilyUnavailable(
                sessionFamily,
                sessionFamilyStatus,
                revocationReason,
                occurredAtUtc);

            var activeCredentials = await dbContext.Set<AuthRefreshCredential>()
                .Where(credential => credential.AuthSessionFamilyId == sessionFamily.Id
                    && credential.Status == AuthRefreshCredentialStatuses.Active
                    && credential.RevokedAtUtc == null)
                .ToListAsync(cancellationToken);
            foreach (var activeCredential in activeCredentials)
            {
                activeCredential.Status = activeRefreshCredentialStatus;
                activeCredential.RevokedAtUtc = occurredAtUtc;
                activeCredential.RevocationReason = NormalizeOptionalField(
                    revocationReason,
                    RevocationReasonMaxLength);
                activeCredential.UpdatedAtUtc = occurredAtUtc;
            }

            var linkedSessionIds = await dbContext.Set<AuthRefreshCredential>()
                .Where(credential => credential.AuthSessionFamilyId == sessionFamily.Id
                    && credential.AuthSessionId != null)
                .Select(credential => credential.AuthSessionId!.Value)
                .Distinct()
                .ToListAsync(cancellationToken);
            var activeSessions = await dbContext.Set<AuthSession>()
                .Where(session => linkedSessionIds.Contains(session.Id)
                    && session.Status == AuthSessionStatuses.Active
                    && session.RevokedAtUtc == null)
                .ToListAsync(cancellationToken);
            foreach (var activeSession in activeSessions)
            {
                activeSession.Status = AuthSessionStatuses.Revoked;
                activeSession.RevokedAtUtc = occurredAtUtc;
                activeSession.RevocationReason = NormalizeOptionalField(
                    revocationReason,
                    RevocationReasonMaxLength);
                activeSession.UpdatedAtUtc = occurredAtUtc;
            }

            await WriteAuditAsync(
                primaryAuditAction,
                primaryAuditOutcome,
                actorAuthAccountId: null,
                sessionFamily.AuthAccountId,
                status.ToString(),
                occurredAtUtc,
                cancellationToken);
            await WriteAuditAsync(
                SessionFamilyRevokedAction,
                AuthAuditOutcomes.Revoked,
                actorAuthAccountId: null,
                sessionFamily.AuthAccountId,
                status.ToString(),
                occurredAtUtc,
                cancellationToken);

            await dbContext.SaveChangesAsync(cancellationToken);

            if (transaction is not null)
            {
                await transaction.CommitAsync(cancellationToken);
            }
        }
        catch (DbUpdateException)
        {
            if (transaction is not null)
            {
                await transaction.RollbackAsync(cancellationToken);
            }

            dbContext.ChangeTracker.Clear();
            return AuthRefreshSessionRotationResult.Failure(
                AuthRefreshSessionRotationStatus.PersistenceFailed);
        }
        finally
        {
            if (transaction is not null)
            {
                await transaction.DisposeAsync();
            }
        }

        return AuthRefreshSessionRotationResult.Failure(status);
    }

    private async Task<AuthRefreshSessionRotationResult> WriteRotationFailureAuditAndReturnAsync(
        AuthRefreshSessionRotationStatus status,
        Guid? subjectAuthAccountId,
        string outcome,
        DateTimeOffset occurredAtUtc,
        CancellationToken cancellationToken)
    {
        try
        {
            await WriteAuditAndSaveAsync(
                RefreshFailedAction,
                outcome,
                actorAuthAccountId: null,
                subjectAuthAccountId,
                status.ToString(),
                occurredAtUtc,
                cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return AuthRefreshSessionRotationResult.Failure(
                AuthRefreshSessionRotationStatus.PersistenceFailed);
        }

        return AuthRefreshSessionRotationResult.Failure(status);
    }

    private static bool IsAccountAvailable(AuthAccount? account)
    {
        return account is
        {
            Status: AuthAccountStatuses.Active,
            DisabledAtUtc: null,
            DeletedAtUtc: null
        };
    }

    private AuthRefreshSessionRotationStatus? GetCredentialUnavailableStatus(
        AuthRefreshCredential credential,
        DateTimeOffset occurredAtUtc)
    {
        if (StringComparer.Ordinal.Equals(credential.Status, AuthRefreshCredentialStatuses.Replayed))
        {
            return AuthRefreshSessionRotationStatus.CredentialReplayed;
        }

        if (StringComparer.Ordinal.Equals(credential.Status, AuthRefreshCredentialStatuses.Rotated)
            || credential.ConsumedAtUtc is not null)
        {
            return AuthRefreshSessionRotationStatus.CredentialReplayed;
        }

        if (StringComparer.Ordinal.Equals(credential.Status, AuthRefreshCredentialStatuses.Revoked)
            || credential.RevokedAtUtc is not null)
        {
            return AuthRefreshSessionRotationStatus.CredentialRevoked;
        }

        if (StringComparer.Ordinal.Equals(credential.Status, AuthRefreshCredentialStatuses.Expired)
            || IsCredentialExpired(credential.IdleExpiresAtUtc, occurredAtUtc)
            || IsCredentialExpired(credential.AbsoluteExpiresAtUtc, occurredAtUtc))
        {
            return AuthRefreshSessionRotationStatus.CredentialExpired;
        }

        if (!StringComparer.Ordinal.Equals(credential.Status, AuthRefreshCredentialStatuses.Active))
        {
            return AuthRefreshSessionRotationStatus.CredentialInactive;
        }

        return null;
    }

    private AuthRefreshSessionRotationStatus? GetFamilyUnavailableStatus(
        AuthSessionFamily sessionFamily,
        DateTimeOffset occurredAtUtc)
    {
        if (StringComparer.Ordinal.Equals(sessionFamily.Status, AuthSessionFamilyStatuses.Replayed))
        {
            return AuthRefreshSessionRotationStatus.SessionFamilyReplayed;
        }

        if (StringComparer.Ordinal.Equals(sessionFamily.Status, AuthSessionFamilyStatuses.Revoked)
            || sessionFamily.RevokedAtUtc is not null)
        {
            return AuthRefreshSessionRotationStatus.SessionFamilyRevoked;
        }

        if (StringComparer.Ordinal.Equals(sessionFamily.Status, AuthSessionFamilyStatuses.Expired)
            || sessionFamily.AbsoluteExpiresAtUtc <= occurredAtUtc)
        {
            return AuthRefreshSessionRotationStatus.SessionFamilyExpired;
        }

        if (!StringComparer.Ordinal.Equals(sessionFamily.Status, AuthSessionFamilyStatuses.Active))
        {
            return AuthRefreshSessionRotationStatus.SessionFamilyInactive;
        }

        return null;
    }

    private bool IsCredentialExpired(DateTimeOffset expiresAtUtc, DateTimeOffset occurredAtUtc)
    {
        return expiresAtUtc.Add(sessionPolicyOptions.ClockSkewAllowance) <= occurredAtUtc;
    }

    private CredentialMaterial CreateCredentialMaterial(
        DateTimeOffset occurredAtUtc,
        DateTimeOffset sessionFamilyAbsoluteExpiresAtUtc)
    {
        var rawAccessSessionToken = GenerateOpaqueToken();
        var rawRefreshCredential = GenerateOpaqueToken();
        var accessSessionExpiresAtUtc = Earlier(
            occurredAtUtc.Add(sessionPolicyOptions.RefreshAccessSessionDefaultLifetime),
            sessionFamilyAbsoluteExpiresAtUtc);
        var refreshCredentialIdleExpiresAtUtc = Earlier(
            occurredAtUtc.Add(sessionPolicyOptions.RefreshIdleTimeout),
            sessionFamilyAbsoluteExpiresAtUtc);

        return new CredentialMaterial(
            rawAccessSessionToken,
            rawRefreshCredential,
            HashToken(rawAccessSessionToken, AccessTokenHashPrefix),
            HashToken(rawRefreshCredential, RefreshTokenHashPrefix),
            accessSessionExpiresAtUtc,
            refreshCredentialIdleExpiresAtUtc,
            sessionFamilyAbsoluteExpiresAtUtc);
    }

    private static AuthSession CreateAccessSession(
        Guid authAccountId,
        string accessSessionTokenHash,
        DateTimeOffset accessSessionExpiresAtUtc,
        DateTimeOffset occurredAtUtc,
        string? deviceLabel,
        string? userAgentSummary,
        string? networkAddressHash)
    {
        return new AuthSession
        {
            Id = Guid.NewGuid(),
            AuthAccountId = authAccountId,
            SessionTokenHash = accessSessionTokenHash,
            RefreshTokenHash = null,
            Status = AuthSessionStatuses.Active,
            IssuedAtUtc = occurredAtUtc,
            ExpiresAtUtc = accessSessionExpiresAtUtc,
            LastSeenAtUtc = null,
            RevokedAtUtc = null,
            RevocationReason = null,
            DeviceLabel = NormalizeOptionalField(deviceLabel, DeviceLabelMaxLength),
            UserAgentSummary = NormalizeOptionalField(userAgentSummary, UserAgentSummaryMaxLength),
            NetworkAddressHash = NormalizeOptionalField(networkAddressHash, NetworkAddressHashMaxLength),
            CreatedAtUtc = occurredAtUtc,
            UpdatedAtUtc = occurredAtUtc
        };
    }

    private static AuthRefreshCredential CreateRefreshCredential(
        Guid refreshCredentialId,
        Guid sessionFamilyId,
        Guid authSessionId,
        string refreshCredentialHash,
        DateTimeOffset idleExpiresAtUtc,
        DateTimeOffset absoluteExpiresAtUtc,
        DateTimeOffset occurredAtUtc)
    {
        return new AuthRefreshCredential
        {
            Id = refreshCredentialId,
            AuthSessionFamilyId = sessionFamilyId,
            AuthSessionId = authSessionId,
            RefreshTokenHash = refreshCredentialHash,
            Status = AuthRefreshCredentialStatuses.Active,
            IssuedAtUtc = occurredAtUtc,
            IdleExpiresAtUtc = idleExpiresAtUtc,
            AbsoluteExpiresAtUtc = absoluteExpiresAtUtc,
            ConsumedAtUtc = null,
            RevokedAtUtc = null,
            ReplacedByRefreshCredentialId = null,
            RevocationReason = null,
            CreatedAtUtc = occurredAtUtc,
            UpdatedAtUtc = occurredAtUtc
        };
    }

    private static void MarkSessionFamilyUnavailable(
        AuthSessionFamily sessionFamily,
        string status,
        string revocationReason,
        DateTimeOffset occurredAtUtc)
    {
        sessionFamily.Status = status;
        sessionFamily.RevokedAtUtc = occurredAtUtc;
        sessionFamily.RevocationReason = NormalizeOptionalField(
            revocationReason,
            RevocationReasonMaxLength);
        sessionFamily.UpdatedAtUtc = occurredAtUtc;
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

    private static string MapFailureOutcome(AuthRefreshSessionRotationStatus status)
    {
        return status switch
        {
            AuthRefreshSessionRotationStatus.CredentialExpired
                or AuthRefreshSessionRotationStatus.SessionFamilyExpired => AuthAuditOutcomes.Expired,
            AuthRefreshSessionRotationStatus.CredentialRevoked
                or AuthRefreshSessionRotationStatus.CredentialReplayed
                or AuthRefreshSessionRotationStatus.SessionFamilyRevoked
                or AuthRefreshSessionRotationStatus.SessionFamilyReplayed => AuthAuditOutcomes.Revoked,
            AuthRefreshSessionRotationStatus.AccountUnavailable
                or AuthRefreshSessionRotationStatus.CredentialInactive
                or AuthRefreshSessionRotationStatus.SessionFamilyInactive
                or AuthRefreshSessionRotationStatus.CredentialUnavailable => AuthAuditOutcomes.Denied,
            _ => AuthAuditOutcomes.Failure
        };
    }

    private static DateTimeOffset Earlier(DateTimeOffset first, DateTimeOffset second)
    {
        return first <= second ? first : second;
    }

    private static string GenerateOpaqueToken()
    {
        return Base64UrlEncode(RandomNumberGenerator.GetBytes(TokenByteLength));
    }

    private static string HashToken(string rawToken, string prefix)
    {
        var tokenBytes = Encoding.UTF8.GetBytes(rawToken);
        var hashBytes = SHA256.HashData(tokenBytes);
        return prefix + Base64UrlEncode(hashBytes);
    }

    private static string Base64UrlEncode(byte[] bytes)
    {
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private static string? NormalizeOptionalField(string? value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        return trimmed.Length <= maxLength
            ? trimmed
            : trimmed[..maxLength];
    }

    private async ValueTask WriteAuditAndSaveAsync(
        string action,
        string outcome,
        Guid? actorAuthAccountId,
        Guid? subjectAuthAccountId,
        string statusCategory,
        DateTimeOffset occurredAtUtc,
        CancellationToken cancellationToken)
    {
        await WriteAuditAsync(
            action,
            outcome,
            actorAuthAccountId,
            subjectAuthAccountId,
            statusCategory,
            occurredAtUtc,
            cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private ValueTask WriteAuditAsync(
        string action,
        string outcome,
        Guid? actorAuthAccountId,
        Guid? subjectAuthAccountId,
        string statusCategory,
        DateTimeOffset occurredAtUtc,
        CancellationToken cancellationToken)
    {
        return auditWriter.WriteAsync(
            new AuthSessionAuditEvent(
                action,
                outcome,
                actorAuthAccountId,
                subjectAuthAccountId,
                AuthRefreshSessionWorkflowName,
                statusCategory,
                occurredAtUtc),
            cancellationToken);
    }

    private sealed record CredentialMaterial(
        string RawAccessSessionToken,
        string RawRefreshCredential,
        string AccessSessionTokenHash,
        string RefreshCredentialHash,
        DateTimeOffset AccessSessionExpiresAtUtc,
        DateTimeOffset RefreshCredentialIdleExpiresAtUtc,
        DateTimeOffset RefreshCredentialAbsoluteExpiresAtUtc);
}
