namespace Settleora.Api.Auth.SignIn;

internal sealed record LocalSignInRefreshCredentialResponse(
    string Token,
    DateTimeOffset IdleExpiresAtUtc,
    DateTimeOffset AbsoluteExpiresAtUtc);
