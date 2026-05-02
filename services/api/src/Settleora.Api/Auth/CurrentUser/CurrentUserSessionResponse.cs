namespace Settleora.Api.Auth.CurrentUser;

internal sealed record CurrentUserSessionResponse(
    Guid Id,
    DateTimeOffset ExpiresAtUtc);
