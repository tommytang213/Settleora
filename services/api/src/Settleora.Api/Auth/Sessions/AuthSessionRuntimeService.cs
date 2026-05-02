using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Auth.Sessions;

internal sealed class AuthSessionRuntimeService : IAuthSessionRuntimeService
{
    private const string AuthSessionWorkflowName = "auth_session_runtime";
    private const string SessionCreatedAction = "session.created";
    private const string SessionValidatedAction = "session.validated";
    private const string SessionValidationFailedAction = "session.validation_failed";
    private const string SessionRevokedAction = "session.revoked";
    private const string TokenHashPrefix = "sha256:";
    private const int TokenByteLength = 32;
    private const int DeviceLabelMaxLength = 120;
    private const int UserAgentSummaryMaxLength = 320;
    private const int NetworkAddressHashMaxLength = 128;
    private const int RevocationReasonMaxLength = 120;
    private const string DefaultRevocationReason = "unspecified";

    private static readonly TimeSpan DefaultSessionLifetime = TimeSpan.FromHours(8);
    private static readonly TimeSpan MaxSessionLifetime = TimeSpan.FromDays(30);

    private readonly SettleoraDbContext dbContext;
    private readonly IAuthSessionAuditWriter auditWriter;
    private readonly TimeProvider timeProvider;

    public AuthSessionRuntimeService(
        SettleoraDbContext dbContext,
        IAuthSessionAuditWriter auditWriter,
        TimeProvider timeProvider)
    {
        this.dbContext = dbContext;
        this.auditWriter = auditWriter;
        this.timeProvider = timeProvider;
    }

    public async Task<AuthSessionCreationResult> CreateSessionAsync(
        AuthSessionCreationRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var occurredAtUtc = timeProvider.GetUtcNow();
        var account = await dbContext.Set<AuthAccount>()
            .SingleOrDefaultAsync(account => account.Id == request.AuthAccountId, cancellationToken);

        if (!IsAccountAvailable(account))
        {
            var result = AuthSessionCreationResult.Failure(AuthSessionCreationStatus.AccountUnavailable);
            await WriteAuditAndSaveAsync(
                SessionCreatedAction,
                AuthAuditOutcomes.Denied,
                null,
                account?.Id,
                result.Status.ToString(),
                occurredAtUtc,
                cancellationToken);
            return result;
        }

        var rawSessionToken = GenerateOpaqueToken();
        var sessionTokenHash = HashToken(rawSessionToken);
        var expiresAtUtc = occurredAtUtc.Add(ChooseSessionLifetime(request.RequestedLifetime));
        var session = new AuthSession
        {
            Id = Guid.NewGuid(),
            AuthAccountId = request.AuthAccountId,
            SessionTokenHash = sessionTokenHash,
            RefreshTokenHash = null,
            Status = AuthSessionStatuses.Active,
            IssuedAtUtc = occurredAtUtc,
            ExpiresAtUtc = expiresAtUtc,
            LastSeenAtUtc = null,
            RevokedAtUtc = null,
            RevocationReason = null,
            DeviceLabel = NormalizeOptionalField(request.DeviceLabel, DeviceLabelMaxLength),
            UserAgentSummary = NormalizeOptionalField(request.UserAgentSummary, UserAgentSummaryMaxLength),
            NetworkAddressHash = NormalizeOptionalField(request.NetworkAddressHash, NetworkAddressHashMaxLength),
            CreatedAtUtc = occurredAtUtc,
            UpdatedAtUtc = occurredAtUtc
        };

        dbContext.Set<AuthSession>().Add(session);
        await WriteAuditAsync(
            SessionCreatedAction,
            AuthAuditOutcomes.Success,
            null,
            request.AuthAccountId,
            AuthSessionCreationStatus.Created.ToString(),
            occurredAtUtc,
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return AuthSessionCreationResult.Failure(AuthSessionCreationStatus.PersistenceFailed);
        }

        return AuthSessionCreationResult.Created(session.Id, rawSessionToken, expiresAtUtc);
    }

    public async Task<AuthSessionValidationResult> ValidateSessionAsync(
        string? rawSessionToken,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(rawSessionToken))
        {
            return AuthSessionValidationResult.Failure(AuthSessionValidationStatus.SessionUnavailable);
        }

        var occurredAtUtc = timeProvider.GetUtcNow();
        var sessionTokenHash = HashToken(rawSessionToken);
        var session = await dbContext.Set<AuthSession>()
            .Include(session => session.AuthAccount)
            .SingleOrDefaultAsync(
                session => session.SessionTokenHash == sessionTokenHash,
                cancellationToken);

        if (session is null)
        {
            return AuthSessionValidationResult.Failure(AuthSessionValidationStatus.SessionUnavailable);
        }

        var unavailableStatus = GetUnavailableValidationStatus(session, occurredAtUtc);
        if (unavailableStatus is not null)
        {
            var result = AuthSessionValidationResult.Failure(unavailableStatus.Value);
            await WriteValidationAuditAndSaveAsync(
                result,
                session.AuthAccountId,
                occurredAtUtc,
                cancellationToken);
            return result;
        }

        session.LastSeenAtUtc = occurredAtUtc;
        session.UpdatedAtUtc = occurredAtUtc;

        var actor = new AuthenticatedSessionActor(
            session.AuthAccountId,
            session.AuthAccount.UserProfileId,
            session.Id,
            session.ExpiresAtUtc);
        var validationResult = AuthSessionValidationResult.Validated(actor);
        await WriteValidationAuditAsync(
            validationResult,
            session.AuthAccountId,
            occurredAtUtc,
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return AuthSessionValidationResult.Failure(AuthSessionValidationStatus.PersistenceFailed);
        }

        return validationResult;
    }

    public async Task<AuthSessionRevocationResult> RevokeSessionAsync(
        AuthSessionRevocationRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var occurredAtUtc = timeProvider.GetUtcNow();
        var account = await dbContext.Set<AuthAccount>()
            .SingleOrDefaultAsync(account => account.Id == request.AuthAccountId, cancellationToken);

        if (!IsAccountAvailable(account))
        {
            var result = AuthSessionRevocationResult.Failure(AuthSessionRevocationStatus.AccountUnavailable);
            await WriteAuditAndSaveAsync(
                SessionRevokedAction,
                AuthAuditOutcomes.Denied,
                account?.Id,
                account?.Id,
                result.Status.ToString(),
                occurredAtUtc,
                cancellationToken);
            return result;
        }

        var session = await dbContext.Set<AuthSession>()
            .SingleOrDefaultAsync(
                session => session.Id == request.AuthSessionId
                    && session.AuthAccountId == request.AuthAccountId,
                cancellationToken);

        if (session is null)
        {
            var result = AuthSessionRevocationResult.Failure(AuthSessionRevocationStatus.NotFound);
            await WriteAuditAndSaveAsync(
                SessionRevokedAction,
                AuthAuditOutcomes.Denied,
                request.AuthAccountId,
                request.AuthAccountId,
                result.Status.ToString(),
                occurredAtUtc,
                cancellationToken);
            return result;
        }

        if (StringComparer.Ordinal.Equals(session.Status, AuthSessionStatuses.Revoked)
            || session.RevokedAtUtc is not null)
        {
            var result = AuthSessionRevocationResult.Failure(
                AuthSessionRevocationStatus.AlreadyRevoked,
                session.Id);
            await WriteAuditAndSaveAsync(
                SessionRevokedAction,
                AuthAuditOutcomes.Revoked,
                request.AuthAccountId,
                session.AuthAccountId,
                result.Status.ToString(),
                occurredAtUtc,
                cancellationToken);
            return result;
        }

        if (!StringComparer.Ordinal.Equals(session.Status, AuthSessionStatuses.Active))
        {
            var result = AuthSessionRevocationResult.Failure(
                AuthSessionRevocationStatus.SessionInactive,
                session.Id);
            await WriteAuditAndSaveAsync(
                SessionRevokedAction,
                AuthAuditOutcomes.Denied,
                request.AuthAccountId,
                session.AuthAccountId,
                result.Status.ToString(),
                occurredAtUtc,
                cancellationToken);
            return result;
        }

        session.Status = AuthSessionStatuses.Revoked;
        session.RevokedAtUtc = occurredAtUtc;
        session.RevocationReason = NormalizeOptionalField(
            request.RevocationReason,
            RevocationReasonMaxLength) ?? DefaultRevocationReason;
        session.UpdatedAtUtc = occurredAtUtc;

        await WriteAuditAsync(
            SessionRevokedAction,
            AuthAuditOutcomes.Revoked,
            request.AuthAccountId,
            session.AuthAccountId,
            AuthSessionRevocationStatus.Revoked.ToString(),
            occurredAtUtc,
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return AuthSessionRevocationResult.Failure(
                AuthSessionRevocationStatus.PersistenceFailed,
                session.Id);
        }

        return AuthSessionRevocationResult.Revoked(session.Id);
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

    private static AuthSessionValidationStatus? GetUnavailableValidationStatus(
        AuthSession session,
        DateTimeOffset occurredAtUtc)
    {
        if (StringComparer.Ordinal.Equals(session.Status, AuthSessionStatuses.Revoked)
            || session.RevokedAtUtc is not null)
        {
            return AuthSessionValidationStatus.SessionRevoked;
        }

        if (StringComparer.Ordinal.Equals(session.Status, AuthSessionStatuses.Expired)
            || session.ExpiresAtUtc <= occurredAtUtc)
        {
            return AuthSessionValidationStatus.SessionExpired;
        }

        if (!StringComparer.Ordinal.Equals(session.Status, AuthSessionStatuses.Active))
        {
            return AuthSessionValidationStatus.SessionInactive;
        }

        if (!IsAccountAvailable(session.AuthAccount))
        {
            return AuthSessionValidationStatus.AccountUnavailable;
        }

        return null;
    }

    private static TimeSpan ChooseSessionLifetime(TimeSpan? requestedLifetime)
    {
        if (requestedLifetime is null
            || requestedLifetime <= TimeSpan.Zero
            || requestedLifetime > MaxSessionLifetime)
        {
            return DefaultSessionLifetime;
        }

        return requestedLifetime.Value;
    }

    private static string GenerateOpaqueToken()
    {
        return Base64UrlEncode(RandomNumberGenerator.GetBytes(TokenByteLength));
    }

    private static string HashToken(string rawToken)
    {
        var tokenBytes = Encoding.UTF8.GetBytes(rawToken);
        var hashBytes = SHA256.HashData(tokenBytes);
        return TokenHashPrefix + Base64UrlEncode(hashBytes);
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

    private ValueTask WriteValidationAuditAsync(
        AuthSessionValidationResult result,
        Guid subjectAuthAccountId,
        DateTimeOffset occurredAtUtc,
        CancellationToken cancellationToken)
    {
        var action = result.Succeeded
            ? SessionValidatedAction
            : SessionValidationFailedAction;
        var outcome = result.Status switch
        {
            AuthSessionValidationStatus.Validated => AuthAuditOutcomes.Success,
            AuthSessionValidationStatus.SessionExpired => AuthAuditOutcomes.Expired,
            AuthSessionValidationStatus.SessionRevoked => AuthAuditOutcomes.Revoked,
            AuthSessionValidationStatus.AccountUnavailable => AuthAuditOutcomes.Denied,
            AuthSessionValidationStatus.SessionInactive => AuthAuditOutcomes.Denied,
            _ => AuthAuditOutcomes.Failure
        };
        var actorAuthAccountId = result.Succeeded
            ? subjectAuthAccountId
            : (Guid?)null;

        return WriteAuditAsync(
            action,
            outcome,
            actorAuthAccountId,
            subjectAuthAccountId,
            result.Status.ToString(),
            occurredAtUtc,
            cancellationToken);
    }

    private async ValueTask WriteValidationAuditAndSaveAsync(
        AuthSessionValidationResult result,
        Guid subjectAuthAccountId,
        DateTimeOffset occurredAtUtc,
        CancellationToken cancellationToken)
    {
        await WriteValidationAuditAsync(result, subjectAuthAccountId, occurredAtUtc, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
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
                AuthSessionWorkflowName,
                statusCategory,
                occurredAtUtc),
            cancellationToken);
    }
}
