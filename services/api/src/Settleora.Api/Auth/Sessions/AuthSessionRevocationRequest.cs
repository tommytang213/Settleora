namespace Settleora.Api.Auth.Sessions;

internal sealed record AuthSessionRevocationRequest(
    Guid AuthAccountId,
    Guid AuthSessionId,
    string? RevocationReason = null);
