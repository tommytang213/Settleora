namespace Settleora.Api.Auth.Sessions;

internal sealed record RefreshSessionCredentialResponse(
    string Token,
    DateTimeOffset IdleExpiresAtUtc,
    DateTimeOffset AbsoluteExpiresAtUtc);
