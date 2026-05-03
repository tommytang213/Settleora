namespace Settleora.Api.Auth.Authorization;

internal sealed record AuthenticatedActor(
    Guid AuthAccountId,
    Guid UserProfileId,
    Guid AuthSessionId,
    DateTimeOffset SessionExpiresAtUtc,
    IReadOnlyList<string> SystemRoles);
