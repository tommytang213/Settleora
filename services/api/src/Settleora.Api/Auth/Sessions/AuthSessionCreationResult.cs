namespace Settleora.Api.Auth.Sessions;

internal sealed class AuthSessionCreationResult
{
    private AuthSessionCreationResult(
        AuthSessionCreationStatus status,
        Guid? authSessionId,
        string? rawSessionToken,
        DateTimeOffset? sessionExpiresAtUtc)
    {
        Status = status;
        AuthSessionId = authSessionId;
        RawSessionToken = rawSessionToken;
        SessionExpiresAtUtc = sessionExpiresAtUtc;
    }

    public bool Succeeded => Status is AuthSessionCreationStatus.Created;

    public AuthSessionCreationStatus Status { get; }

    public Guid? AuthSessionId { get; }

    public string? RawSessionToken { get; }

    public DateTimeOffset? SessionExpiresAtUtc { get; }

    public static AuthSessionCreationResult Created(
        Guid authSessionId,
        string rawSessionToken,
        DateTimeOffset sessionExpiresAtUtc)
    {
        return new AuthSessionCreationResult(
            AuthSessionCreationStatus.Created,
            authSessionId,
            rawSessionToken,
            sessionExpiresAtUtc);
    }

    public static AuthSessionCreationResult Failure(AuthSessionCreationStatus status)
    {
        return new AuthSessionCreationResult(status, null, null, null);
    }

    public override string ToString()
    {
        return $"AuthSessionCreationResult {{ Succeeded = {Succeeded}, Status = {Status}, AuthSessionId = {AuthSessionId?.ToString() ?? "None"}, HasRawSessionToken = {RawSessionToken is not null}, SessionExpiresAtUtc = {SessionExpiresAtUtc?.ToString("O") ?? "None"} }}";
    }
}
