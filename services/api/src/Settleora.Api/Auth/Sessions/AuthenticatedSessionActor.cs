namespace Settleora.Api.Auth.Sessions;

internal sealed record AuthenticatedSessionActor(
    Guid AuthAccountId,
    Guid UserProfileId,
    Guid AuthSessionId,
    DateTimeOffset SessionExpiresAtUtc);
