namespace Settleora.Api.Auth.SignIn;

internal sealed record LocalSignInSessionResponse(
    Guid Id,
    string Token,
    DateTimeOffset ExpiresAtUtc);
