namespace Settleora.Api.Auth.Sessions;

internal sealed class AuthRefreshSessionRotationResult
{
    private AuthRefreshSessionRotationResult(
        AuthRefreshSessionRotationStatus status,
        Guid? authSessionId,
        Guid? authSessionFamilyId,
        Guid? consumedAuthRefreshCredentialId,
        Guid? replacementAuthRefreshCredentialId,
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
        ConsumedAuthRefreshCredentialId = consumedAuthRefreshCredentialId;
        ReplacementAuthRefreshCredentialId = replacementAuthRefreshCredentialId;
        RawAccessSessionToken = rawAccessSessionToken;
        RawRefreshCredential = rawRefreshCredential;
        AccessSessionExpiresAtUtc = accessSessionExpiresAtUtc;
        RefreshCredentialIdleExpiresAtUtc = refreshCredentialIdleExpiresAtUtc;
        RefreshCredentialAbsoluteExpiresAtUtc = refreshCredentialAbsoluteExpiresAtUtc;
        SessionFamilyAbsoluteExpiresAtUtc = sessionFamilyAbsoluteExpiresAtUtc;
    }

    public bool Succeeded => Status is AuthRefreshSessionRotationStatus.Rotated;

    public AuthRefreshSessionRotationStatus Status { get; }

    public Guid? AuthSessionId { get; }

    public Guid? AuthSessionFamilyId { get; }

    public Guid? ConsumedAuthRefreshCredentialId { get; }

    public Guid? ReplacementAuthRefreshCredentialId { get; }

    public string? RawAccessSessionToken { get; }

    public string? RawRefreshCredential { get; }

    public DateTimeOffset? AccessSessionExpiresAtUtc { get; }

    public DateTimeOffset? RefreshCredentialIdleExpiresAtUtc { get; }

    public DateTimeOffset? RefreshCredentialAbsoluteExpiresAtUtc { get; }

    public DateTimeOffset? SessionFamilyAbsoluteExpiresAtUtc { get; }

    public static AuthRefreshSessionRotationResult Rotated(
        Guid authSessionId,
        Guid authSessionFamilyId,
        Guid consumedAuthRefreshCredentialId,
        Guid replacementAuthRefreshCredentialId,
        string rawAccessSessionToken,
        string rawRefreshCredential,
        DateTimeOffset accessSessionExpiresAtUtc,
        DateTimeOffset refreshCredentialIdleExpiresAtUtc,
        DateTimeOffset refreshCredentialAbsoluteExpiresAtUtc,
        DateTimeOffset sessionFamilyAbsoluteExpiresAtUtc)
    {
        return new AuthRefreshSessionRotationResult(
            AuthRefreshSessionRotationStatus.Rotated,
            authSessionId,
            authSessionFamilyId,
            consumedAuthRefreshCredentialId,
            replacementAuthRefreshCredentialId,
            rawAccessSessionToken,
            rawRefreshCredential,
            accessSessionExpiresAtUtc,
            refreshCredentialIdleExpiresAtUtc,
            refreshCredentialAbsoluteExpiresAtUtc,
            sessionFamilyAbsoluteExpiresAtUtc);
    }

    public static AuthRefreshSessionRotationResult Failure(AuthRefreshSessionRotationStatus status)
    {
        return new AuthRefreshSessionRotationResult(
            status,
            null,
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
        return $"AuthRefreshSessionRotationResult {{ Succeeded = {Succeeded}, Status = {Status}, AuthSessionId = {AuthSessionId?.ToString() ?? "None"}, AuthSessionFamilyId = {AuthSessionFamilyId?.ToString() ?? "None"}, ConsumedAuthRefreshCredentialId = {ConsumedAuthRefreshCredentialId?.ToString() ?? "None"}, ReplacementAuthRefreshCredentialId = {ReplacementAuthRefreshCredentialId?.ToString() ?? "None"}, HasRawAccessSessionToken = {RawAccessSessionToken is not null}, HasRawRefreshCredential = {RawRefreshCredential is not null}, AccessSessionExpiresAtUtc = {AccessSessionExpiresAtUtc?.ToString("O") ?? "None"}, RefreshCredentialIdleExpiresAtUtc = {RefreshCredentialIdleExpiresAtUtc?.ToString("O") ?? "None"}, RefreshCredentialAbsoluteExpiresAtUtc = {RefreshCredentialAbsoluteExpiresAtUtc?.ToString("O") ?? "None"}, SessionFamilyAbsoluteExpiresAtUtc = {SessionFamilyAbsoluteExpiresAtUtc?.ToString("O") ?? "None"} }}";
    }
}
