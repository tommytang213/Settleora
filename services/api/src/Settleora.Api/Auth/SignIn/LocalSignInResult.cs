namespace Settleora.Api.Auth.SignIn;

internal sealed class LocalSignInResult
{
    private LocalSignInResult(
        LocalSignInStatus status,
        Guid? authAccountId,
        Guid? userProfileId,
        string? userProfileDisplayName,
        string? userProfileDefaultCurrency,
        IReadOnlyList<string>? systemRoles,
        Guid? authSessionId,
        string? rawSessionToken,
        DateTimeOffset? sessionExpiresAtUtc,
        string? rawRefreshCredential,
        DateTimeOffset? refreshCredentialIdleExpiresAtUtc,
        DateTimeOffset? refreshCredentialAbsoluteExpiresAtUtc,
        SignInAbusePreCheckStatus? policyStatus)
    {
        Status = status;
        AuthAccountId = authAccountId;
        UserProfileId = userProfileId;
        UserProfileDisplayName = userProfileDisplayName;
        UserProfileDefaultCurrency = userProfileDefaultCurrency;
        SystemRoles = systemRoles ?? [];
        AuthSessionId = authSessionId;
        RawSessionToken = rawSessionToken;
        SessionExpiresAtUtc = sessionExpiresAtUtc;
        RawRefreshCredential = rawRefreshCredential;
        RefreshCredentialIdleExpiresAtUtc = refreshCredentialIdleExpiresAtUtc;
        RefreshCredentialAbsoluteExpiresAtUtc = refreshCredentialAbsoluteExpiresAtUtc;
        PolicyStatus = policyStatus;
    }

    public bool Succeeded => Status is LocalSignInStatus.SignedIn;

    public LocalSignInStatus Status { get; }

    public Guid? AuthAccountId { get; }

    public Guid? UserProfileId { get; }

    public string? UserProfileDisplayName { get; }

    public string? UserProfileDefaultCurrency { get; }

    public IReadOnlyList<string> SystemRoles { get; }

    public Guid? AuthSessionId { get; }

    public string? RawSessionToken { get; }

    public DateTimeOffset? SessionExpiresAtUtc { get; }

    public string? RawRefreshCredential { get; }

    public DateTimeOffset? RefreshCredentialIdleExpiresAtUtc { get; }

    public DateTimeOffset? RefreshCredentialAbsoluteExpiresAtUtc { get; }

    public SignInAbusePreCheckStatus? PolicyStatus { get; }

    public static LocalSignInResult SignedIn(
        Guid authAccountId,
        Guid userProfileId,
        string userProfileDisplayName,
        string? userProfileDefaultCurrency,
        IReadOnlyList<string> systemRoles,
        Guid authSessionId,
        string rawSessionToken,
        DateTimeOffset sessionExpiresAtUtc,
        string rawRefreshCredential,
        DateTimeOffset refreshCredentialIdleExpiresAtUtc,
        DateTimeOffset refreshCredentialAbsoluteExpiresAtUtc)
    {
        return new LocalSignInResult(
            LocalSignInStatus.SignedIn,
            authAccountId,
            userProfileId,
            userProfileDisplayName,
            userProfileDefaultCurrency,
            systemRoles,
            authSessionId,
            rawSessionToken,
            sessionExpiresAtUtc,
            rawRefreshCredential,
            refreshCredentialIdleExpiresAtUtc,
            refreshCredentialAbsoluteExpiresAtUtc,
            policyStatus: null);
    }

    public static LocalSignInResult Failure(LocalSignInStatus status)
    {
        return new LocalSignInResult(
            status,
            authAccountId: null,
            userProfileId: null,
            userProfileDisplayName: null,
            userProfileDefaultCurrency: null,
            systemRoles: null,
            authSessionId: null,
            rawSessionToken: null,
            sessionExpiresAtUtc: null,
            rawRefreshCredential: null,
            refreshCredentialIdleExpiresAtUtc: null,
            refreshCredentialAbsoluteExpiresAtUtc: null,
            policyStatus: null);
    }

    public static LocalSignInResult Throttled(SignInAbusePreCheckStatus policyStatus)
    {
        return new LocalSignInResult(
            LocalSignInStatus.Throttled,
            authAccountId: null,
            userProfileId: null,
            userProfileDisplayName: null,
            userProfileDefaultCurrency: null,
            systemRoles: null,
            authSessionId: null,
            rawSessionToken: null,
            sessionExpiresAtUtc: null,
            rawRefreshCredential: null,
            refreshCredentialIdleExpiresAtUtc: null,
            refreshCredentialAbsoluteExpiresAtUtc: null,
            policyStatus);
    }

    public override string ToString()
    {
        return $"LocalSignInResult {{ Succeeded = {Succeeded}, Status = {Status}, AuthSessionId = {AuthSessionId?.ToString() ?? "None"}, HasRawSessionToken = {RawSessionToken is not null}, SessionExpiresAtUtc = {SessionExpiresAtUtc?.ToString("O") ?? "None"}, HasRawRefreshCredential = {RawRefreshCredential is not null}, RefreshCredentialIdleExpiresAtUtc = {RefreshCredentialIdleExpiresAtUtc?.ToString("O") ?? "None"}, RefreshCredentialAbsoluteExpiresAtUtc = {RefreshCredentialAbsoluteExpiresAtUtc?.ToString("O") ?? "None"}, PolicyStatus = {PolicyStatus?.ToString() ?? "None"} }}";
    }
}
