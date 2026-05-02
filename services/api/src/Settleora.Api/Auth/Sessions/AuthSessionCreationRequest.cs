namespace Settleora.Api.Auth.Sessions;

internal sealed record AuthSessionCreationRequest(
    Guid AuthAccountId,
    string? DeviceLabel = null,
    string? UserAgentSummary = null,
    string? NetworkAddressHash = null,
    TimeSpan? RequestedLifetime = null);
