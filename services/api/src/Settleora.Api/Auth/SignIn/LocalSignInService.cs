using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Credentials;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Auth.SignIn;

internal sealed class LocalSignInService : ILocalSignInService
{
    internal const string LocalProviderName = "local";

    private const string LocalSignInWorkflowName = "local_sign_in";
    private const string SignInSucceededAction = "sign_in.succeeded";
    private const string SignInFailedAction = "sign_in.failed";
    private const string SignInThrottledAction = "sign_in.throttled";
    private const string SignInSessionCreationFailedAction = "sign_in.session_creation_failed";
    private const int SubmittedPasswordMaxLength = 4096;
    private const int SafeKeyMaxLength = 128;
    private const string IdentifierKeyPrefix = "local-id-sha256:";

    private readonly SettleoraDbContext dbContext;
    private readonly ISignInAbusePolicyService abusePolicyService;
    private readonly IAuthCredentialWorkflowService credentialWorkflowService;
    private readonly IAuthRefreshSessionRuntimeService refreshSessionRuntimeService;
    private readonly ILocalSignInAuditWriter auditWriter;
    private readonly TimeProvider timeProvider;

    public LocalSignInService(
        SettleoraDbContext dbContext,
        ISignInAbusePolicyService abusePolicyService,
        IAuthCredentialWorkflowService credentialWorkflowService,
        IAuthRefreshSessionRuntimeService refreshSessionRuntimeService,
        ILocalSignInAuditWriter auditWriter,
        TimeProvider timeProvider)
    {
        this.dbContext = dbContext;
        this.abusePolicyService = abusePolicyService;
        this.credentialWorkflowService = credentialWorkflowService;
        this.refreshSessionRuntimeService = refreshSessionRuntimeService;
        this.auditWriter = auditWriter;
        this.timeProvider = timeProvider;
    }

    public async Task<LocalSignInResult> SignInAsync(
        LocalSignInRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!TryBuildRequestContext(request, out var requestContext))
        {
            return LocalSignInResult.Failure(LocalSignInStatus.InvalidRequest);
        }

        var policyRequest = new SignInAbusePolicyRequest(
            requestContext.IdentifierKey,
            requestContext.SourceKey);
        var policyResult = abusePolicyService.CheckPreVerification(policyRequest);
        if (!policyResult.IsAllowed)
        {
            RecordAttempt(requestContext, SignInAttemptOutcome.Throttled);
            await WriteAuditAndSaveAsync(
                SignInThrottledAction,
                AuthAuditOutcomes.BlockedByPolicy,
                actorAuthAccountId: null,
                subjectAuthAccountId: null,
                LocalSignInStatus.Throttled,
                policyResult.Status,
                cancellationToken);
            return LocalSignInResult.Throttled(policyResult.Status);
        }

        var identity = await ResolveLocalIdentityAsync(
            requestContext.NormalizedIdentifier,
            cancellationToken);
        if (!IsIdentityAccountAvailable(identity))
        {
            RecordAttempt(requestContext, SignInAttemptOutcome.Failed);
            await WriteAuditAndSaveAsync(
                SignInFailedAction,
                AuthAuditOutcomes.Failure,
                actorAuthAccountId: null,
                identity?.AuthAccountId,
                LocalSignInStatus.InvalidCredentials,
                policyResult.Status,
                cancellationToken);
            return LocalSignInResult.Failure(LocalSignInStatus.InvalidCredentials);
        }

        var authAccount = identity!.AuthAccount;
        var credentialResult = await credentialWorkflowService.VerifyLocalPasswordAsync(
            authAccount.Id,
            request.SubmittedPassword!,
            cancellationToken);
        if (!credentialResult.Succeeded)
        {
            RecordAttempt(requestContext, SignInAttemptOutcome.Failed);
            await WriteAuditAndSaveAsync(
                SignInFailedAction,
                AuthAuditOutcomes.Failure,
                actorAuthAccountId: null,
                authAccount.Id,
                LocalSignInStatus.InvalidCredentials,
                policyResult.Status,
                cancellationToken);
            return LocalSignInResult.Failure(LocalSignInStatus.InvalidCredentials);
        }

        var sessionResult = await refreshSessionRuntimeService.CreateRefreshSessionAsync(
            new AuthRefreshSessionCreationRequest(
                authAccount.Id,
                request.DeviceLabel,
                request.UserAgentSummary,
                request.NetworkAddressHash),
            cancellationToken);
        if (!sessionResult.Succeeded
            || sessionResult.AuthSessionId is null
            || sessionResult.RawAccessSessionToken is null
            || sessionResult.AccessSessionExpiresAtUtc is null
            || sessionResult.RawRefreshCredential is null
            || sessionResult.RefreshCredentialIdleExpiresAtUtc is null
            || sessionResult.RefreshCredentialAbsoluteExpiresAtUtc is null)
        {
            RecordAttempt(requestContext, SignInAttemptOutcome.Failed);
            await WriteAuditAndSaveAsync(
                SignInSessionCreationFailedAction,
                AuthAuditOutcomes.Failure,
                actorAuthAccountId: null,
                authAccount.Id,
                LocalSignInStatus.SessionCreationFailed,
                policyResult.Status,
                cancellationToken);
            return LocalSignInResult.Failure(LocalSignInStatus.SessionCreationFailed);
        }

        RecordAttempt(requestContext, SignInAttemptOutcome.Succeeded);
        await WriteAuditAndSaveAsync(
            SignInSucceededAction,
            AuthAuditOutcomes.Success,
            authAccount.Id,
            authAccount.Id,
            LocalSignInStatus.SignedIn,
            policyResult.Status,
            cancellationToken);
        return LocalSignInResult.SignedIn(
            sessionResult.AuthSessionId.Value,
            sessionResult.RawAccessSessionToken,
            sessionResult.AccessSessionExpiresAtUtc.Value,
            sessionResult.RawRefreshCredential,
            sessionResult.RefreshCredentialIdleExpiresAtUtc.Value,
            sessionResult.RefreshCredentialAbsoluteExpiresAtUtc.Value);
    }

    private async Task<AuthIdentity?> ResolveLocalIdentityAsync(
        string normalizedIdentifier,
        CancellationToken cancellationToken)
    {
        return await dbContext.Set<AuthIdentity>()
            .Include(identity => identity.AuthAccount)
            .SingleOrDefaultAsync(
                identity => identity.ProviderType == AuthIdentityProviderTypes.Local
                    && identity.ProviderName == LocalProviderName
                    && identity.ProviderSubject == normalizedIdentifier
                    && identity.DisabledAtUtc == null,
                cancellationToken);
    }

    private static bool IsIdentityAccountAvailable(AuthIdentity? identity)
    {
        return identity?.AuthAccount is
        {
            Status: AuthAccountStatuses.Active,
            DisabledAtUtc: null,
            DeletedAtUtc: null
        };
    }

    private void RecordAttempt(
        SignInRequestContext requestContext,
        SignInAttemptOutcome outcome)
    {
        abusePolicyService.RecordAttempt(new SignInAttemptRecord(
            requestContext.IdentifierKey,
            requestContext.SourceKey,
            outcome));
    }

    private async ValueTask WriteAuditAndSaveAsync(
        string action,
        string outcome,
        Guid? actorAuthAccountId,
        Guid? subjectAuthAccountId,
        LocalSignInStatus statusCategory,
        SignInAbusePreCheckStatus policyStatus,
        CancellationToken cancellationToken)
    {
        await auditWriter.WriteAsync(
            new LocalSignInAuditEvent(
                action,
                outcome,
                actorAuthAccountId,
                subjectAuthAccountId,
                LocalSignInWorkflowName,
                statusCategory,
                policyStatus,
                timeProvider.GetUtcNow()),
            cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private static bool TryBuildRequestContext(
        LocalSignInRequest request,
        out SignInRequestContext requestContext)
    {
        requestContext = default;

        if (!LocalAccountIdentifier.TryNormalize(request.SubmittedIdentifier, out var normalizedIdentifier)
            || !IsSubmittedPasswordBounded(request.SubmittedPassword)
            || !TryNormalizeSafeKey(request.SourceKey, out var sourceKey))
        {
            return false;
        }

        requestContext = new SignInRequestContext(
            normalizedIdentifier,
            DeriveIdentifierKey(normalizedIdentifier),
            sourceKey);
        return true;
    }

    private static bool IsSubmittedPasswordBounded(string? submittedPassword)
    {
        return submittedPassword is { Length: > 0 and <= SubmittedPasswordMaxLength };
    }

    private static bool TryNormalizeSafeKey(string? submittedKey, out string safeKey)
    {
        safeKey = string.Empty;
        if (string.IsNullOrWhiteSpace(submittedKey))
        {
            return false;
        }

        var trimmedKey = submittedKey.Trim();
        if (trimmedKey.Length > SafeKeyMaxLength)
        {
            return false;
        }

        foreach (var character in trimmedKey)
        {
            if (!IsSafeKeyCharacter(character))
            {
                return false;
            }
        }

        safeKey = trimmedKey;
        return true;
    }

    private static bool IsSafeKeyCharacter(char character)
    {
        return character is >= 'a' and <= 'z'
            or >= 'A' and <= 'Z'
            or >= '0' and <= '9'
            or '_'
            or '-'
            or '.'
            or ':';
    }

    private static string DeriveIdentifierKey(string normalizedIdentifier)
    {
        var identifierBytes = Encoding.UTF8.GetBytes(normalizedIdentifier);
        var hashBytes = SHA256.HashData(identifierBytes);

        return IdentifierKeyPrefix + Base64UrlEncode(hashBytes);
    }

    private static string Base64UrlEncode(byte[] bytes)
    {
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private readonly record struct SignInRequestContext(
        string NormalizedIdentifier,
        string IdentifierKey,
        string SourceKey);
}
