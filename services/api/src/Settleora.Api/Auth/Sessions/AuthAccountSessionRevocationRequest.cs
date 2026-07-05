namespace Settleora.Api.Auth.Sessions;

internal sealed record AuthAccountSessionRevocationRequest(
    Guid AuthAccountId,
    string? RevocationReason = null,
    Guid? ExcludedAuthSessionId = null);
