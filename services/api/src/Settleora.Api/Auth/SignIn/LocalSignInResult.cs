namespace Settleora.Api.Auth.SignIn;

internal sealed class LocalSignInResult
{
    private LocalSignInResult(
        LocalSignInStatus status,
        Guid? authAccountId,
        Guid? userProfileId,
        Guid? authSessionId,
        string? rawSessionToken,
        DateTimeOffset? sessionExpiresAtUtc,
        SignInAbusePreCheckStatus? policyStatus)
    {
        Status = status;
        AuthAccountId = authAccountId;
        UserProfileId = userProfileId;
        AuthSessionId = authSessionId;
        RawSessionToken = rawSessionToken;
        SessionExpiresAtUtc = sessionExpiresAtUtc;
        PolicyStatus = policyStatus;
    }

    public bool Succeeded => Status is LocalSignInStatus.SignedIn;

    public LocalSignInStatus Status { get; }

    public Guid? AuthAccountId { get; }

    public Guid? UserProfileId { get; }

    public Guid? AuthSessionId { get; }

    public string? RawSessionToken { get; }

    public DateTimeOffset? SessionExpiresAtUtc { get; }

    public SignInAbusePreCheckStatus? PolicyStatus { get; }

    public static LocalSignInResult SignedIn(
        Guid authAccountId,
        Guid userProfileId,
        Guid authSessionId,
        string rawSessionToken,
        DateTimeOffset sessionExpiresAtUtc)
    {
        return new LocalSignInResult(
            LocalSignInStatus.SignedIn,
            authAccountId,
            userProfileId,
            authSessionId,
            rawSessionToken,
            sessionExpiresAtUtc,
            policyStatus: null);
    }

    public static LocalSignInResult Failure(LocalSignInStatus status)
    {
        return new LocalSignInResult(
            status,
            authAccountId: null,
            userProfileId: null,
            authSessionId: null,
            rawSessionToken: null,
            sessionExpiresAtUtc: null,
            policyStatus: null);
    }

    public static LocalSignInResult Throttled(SignInAbusePreCheckStatus policyStatus)
    {
        return new LocalSignInResult(
            LocalSignInStatus.Throttled,
            authAccountId: null,
            userProfileId: null,
            authSessionId: null,
            rawSessionToken: null,
            sessionExpiresAtUtc: null,
            policyStatus);
    }

    public override string ToString()
    {
        return $"LocalSignInResult {{ Succeeded = {Succeeded}, Status = {Status}, AuthAccountId = {AuthAccountId?.ToString() ?? "None"}, UserProfileId = {UserProfileId?.ToString() ?? "None"}, AuthSessionId = {AuthSessionId?.ToString() ?? "None"}, HasRawSessionToken = {RawSessionToken is not null}, SessionExpiresAtUtc = {SessionExpiresAtUtc?.ToString("O") ?? "None"}, PolicyStatus = {PolicyStatus?.ToString() ?? "None"} }}";
    }
}
