namespace Settleora.Api.Auth.Sessions;

internal sealed record RefreshSessionAccessSessionResponse(
    Guid Id,
    string Token,
    DateTimeOffset ExpiresAtUtc);
