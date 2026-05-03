namespace Settleora.Api.Auth.Sessions;

internal sealed record AuthRefreshSessionRotationRequest(
    string? RawRefreshCredential,
    string? DeviceLabel = null,
    string? UserAgentSummary = null,
    string? NetworkAddressHash = null);
