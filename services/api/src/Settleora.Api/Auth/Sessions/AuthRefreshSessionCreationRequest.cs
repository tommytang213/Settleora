namespace Settleora.Api.Auth.Sessions;

internal sealed record AuthRefreshSessionCreationRequest(
    Guid AuthAccountId,
    string? DeviceLabel = null,
    string? UserAgentSummary = null,
    string? NetworkAddressHash = null);
