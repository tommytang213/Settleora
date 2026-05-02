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

    private const int IdentifierMaxLength = 320;
    private const int SubmittedPasswordMaxLength = 4096;
    private const int SafeKeyMaxLength = 128;
    private const string IdentifierKeyPrefix = "local-id-sha256:";

    private readonly SettleoraDbContext dbContext;
    private readonly ISignInAbusePolicyService abusePolicyService;
    private readonly IAuthCredentialWorkflowService credentialWorkflowService;
    private readonly IAuthSessionRuntimeService sessionRuntimeService;

    public LocalSignInService(
        SettleoraDbContext dbContext,
        ISignInAbusePolicyService abusePolicyService,
        IAuthCredentialWorkflowService credentialWorkflowService,
        IAuthSessionRuntimeService sessionRuntimeService)
    {
        this.dbContext = dbContext;
        this.abusePolicyService = abusePolicyService;
        this.credentialWorkflowService = credentialWorkflowService;
        this.sessionRuntimeService = sessionRuntimeService;
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
            return LocalSignInResult.Throttled(policyResult.Status);
        }

        var identity = await ResolveLocalIdentityAsync(
            requestContext.NormalizedIdentifier,
            cancellationToken);
        if (!IsIdentityAccountAvailable(identity))
        {
            RecordAttempt(requestContext, SignInAttemptOutcome.Failed);
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
            return LocalSignInResult.Failure(LocalSignInStatus.InvalidCredentials);
        }

        var sessionResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                authAccount.Id,
                request.DeviceLabel,
                request.UserAgentSummary,
                request.NetworkAddressHash,
                request.RequestedSessionLifetime),
            cancellationToken);
        if (!sessionResult.Succeeded
            || sessionResult.AuthSessionId is null
            || sessionResult.RawSessionToken is null
            || sessionResult.SessionExpiresAtUtc is null)
        {
            RecordAttempt(requestContext, SignInAttemptOutcome.Failed);
            return LocalSignInResult.Failure(LocalSignInStatus.SessionCreationFailed);
        }

        RecordAttempt(requestContext, SignInAttemptOutcome.Succeeded);
        return LocalSignInResult.SignedIn(
            authAccount.Id,
            authAccount.UserProfileId,
            sessionResult.AuthSessionId.Value,
            sessionResult.RawSessionToken,
            sessionResult.SessionExpiresAtUtc.Value);
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

    private static bool TryBuildRequestContext(
        LocalSignInRequest request,
        out SignInRequestContext requestContext)
    {
        requestContext = default;

        if (!TryNormalizeIdentifier(request.SubmittedIdentifier, out var normalizedIdentifier)
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

    private static bool TryNormalizeIdentifier(
        string? submittedIdentifier,
        out string normalizedIdentifier)
    {
        normalizedIdentifier = string.Empty;
        if (string.IsNullOrWhiteSpace(submittedIdentifier))
        {
            return false;
        }

        var trimmedIdentifier = submittedIdentifier.Trim();
        if (trimmedIdentifier.Length is 0 or > IdentifierMaxLength)
        {
            return false;
        }

        normalizedIdentifier = trimmedIdentifier.ToLowerInvariant();
        return true;
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
