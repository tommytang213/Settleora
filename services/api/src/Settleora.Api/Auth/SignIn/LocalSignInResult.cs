namespace Settleora.Api.Auth.SignIn;

internal sealed class LocalSignInResult
{
    private LocalSignInResult(
        LocalSignInStatus status,
        Guid? authSessionId,
        string? rawSessionToken,
        DateTimeOffset? sessionExpiresAtUtc,
        string? rawRefreshCredential,
        DateTimeOffset? refreshCredentialIdleExpiresAtUtc,
        DateTimeOffset? refreshCredentialAbsoluteExpiresAtUtc,
        SignInAbusePreCheckStatus? policyStatus)
    {
        Status = status;
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

    public Guid? AuthSessionId { get; }

    public string? RawSessionToken { get; }

    public DateTimeOffset? SessionExpiresAtUtc { get; }

    public string? RawRefreshCredential { get; }

    public DateTimeOffset? RefreshCredentialIdleExpiresAtUtc { get; }

    public DateTimeOffset? RefreshCredentialAbsoluteExpiresAtUtc { get; }

    public SignInAbusePreCheckStatus? PolicyStatus { get; }

    public static LocalSignInResult SignedIn(
        Guid authSessionId,
        string rawSessionToken,
        DateTimeOffset sessionExpiresAtUtc,
        string rawRefreshCredential,
        DateTimeOffset refreshCredentialIdleExpiresAtUtc,
        DateTimeOffset refreshCredentialAbsoluteExpiresAtUtc)
    {
        return new LocalSignInResult(
            LocalSignInStatus.SignedIn,
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
