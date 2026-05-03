namespace Settleora.Api.Auth.Sessions;

internal sealed class AuthRefreshSessionCreationResult
{
    private AuthRefreshSessionCreationResult(
        AuthRefreshSessionCreationStatus status,
        Guid? authSessionId,
        Guid? authSessionFamilyId,
        Guid? authRefreshCredentialId,
        string? rawAccessSessionToken,
        string? rawRefreshCredential,
        DateTimeOffset? accessSessionExpiresAtUtc,
        DateTimeOffset? refreshCredentialIdleExpiresAtUtc,
        DateTimeOffset? refreshCredentialAbsoluteExpiresAtUtc,
        DateTimeOffset? sessionFamilyAbsoluteExpiresAtUtc)
    {
        Status = status;
        AuthSessionId = authSessionId;
        AuthSessionFamilyId = authSessionFamilyId;
        AuthRefreshCredentialId = authRefreshCredentialId;
        RawAccessSessionToken = rawAccessSessionToken;
        RawRefreshCredential = rawRefreshCredential;
        AccessSessionExpiresAtUtc = accessSessionExpiresAtUtc;
        RefreshCredentialIdleExpiresAtUtc = refreshCredentialIdleExpiresAtUtc;
        RefreshCredentialAbsoluteExpiresAtUtc = refreshCredentialAbsoluteExpiresAtUtc;
        SessionFamilyAbsoluteExpiresAtUtc = sessionFamilyAbsoluteExpiresAtUtc;
    }

    public bool Succeeded => Status is AuthRefreshSessionCreationStatus.Created;

    public AuthRefreshSessionCreationStatus Status { get; }

    public Guid? AuthSessionId { get; }

    public Guid? AuthSessionFamilyId { get; }

    public Guid? AuthRefreshCredentialId { get; }

    public string? RawAccessSessionToken { get; }

    public string? RawRefreshCredential { get; }

    public DateTimeOffset? AccessSessionExpiresAtUtc { get; }

    public DateTimeOffset? RefreshCredentialIdleExpiresAtUtc { get; }

    public DateTimeOffset? RefreshCredentialAbsoluteExpiresAtUtc { get; }

    public DateTimeOffset? SessionFamilyAbsoluteExpiresAtUtc { get; }

    public static AuthRefreshSessionCreationResult Created(
        Guid authSessionId,
        Guid authSessionFamilyId,
        Guid authRefreshCredentialId,
        string rawAccessSessionToken,
        string rawRefreshCredential,
        DateTimeOffset accessSessionExpiresAtUtc,
        DateTimeOffset refreshCredentialIdleExpiresAtUtc,
        DateTimeOffset refreshCredentialAbsoluteExpiresAtUtc,
        DateTimeOffset sessionFamilyAbsoluteExpiresAtUtc)
    {
        return new AuthRefreshSessionCreationResult(
            AuthRefreshSessionCreationStatus.Created,
            authSessionId,
            authSessionFamilyId,
            authRefreshCredentialId,
            rawAccessSessionToken,
            rawRefreshCredential,
            accessSessionExpiresAtUtc,
            refreshCredentialIdleExpiresAtUtc,
            refreshCredentialAbsoluteExpiresAtUtc,
            sessionFamilyAbsoluteExpiresAtUtc);
    }

    public static AuthRefreshSessionCreationResult Failure(AuthRefreshSessionCreationStatus status)
    {
        return new AuthRefreshSessionCreationResult(
            status,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null);
    }

    public override string ToString()
    {
        return $"AuthRefreshSessionCreationResult {{ Succeeded = {Succeeded}, Status = {Status}, AuthSessionId = {AuthSessionId?.ToString() ?? "None"}, AuthSessionFamilyId = {AuthSessionFamilyId?.ToString() ?? "None"}, AuthRefreshCredentialId = {AuthRefreshCredentialId?.ToString() ?? "None"}, HasRawAccessSessionToken = {RawAccessSessionToken is not null}, HasRawRefreshCredential = {RawRefreshCredential is not null}, AccessSessionExpiresAtUtc = {AccessSessionExpiresAtUtc?.ToString("O") ?? "None"}, RefreshCredentialIdleExpiresAtUtc = {RefreshCredentialIdleExpiresAtUtc?.ToString("O") ?? "None"}, RefreshCredentialAbsoluteExpiresAtUtc = {RefreshCredentialAbsoluteExpiresAtUtc?.ToString("O") ?? "None"}, SessionFamilyAbsoluteExpiresAtUtc = {SessionFamilyAbsoluteExpiresAtUtc?.ToString("O") ?? "None"} }}";
    }
}
