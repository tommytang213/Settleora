namespace Settleora.Api.Auth.SignIn;

internal sealed record LocalSignInRequest(
    string? SubmittedIdentifier,
    string? SubmittedPassword,
    string? SourceKey,
    string? DeviceLabel = null,
    string? UserAgentSummary = null,
    string? NetworkAddressHash = null,
    TimeSpan? RequestedSessionLifetime = null)
{
    public override string ToString()
    {
        return $"LocalSignInRequest {{ HasSubmittedIdentifier = {SubmittedIdentifier is not null}, HasSubmittedPassword = {SubmittedPassword is not null}, HasSourceKey = {SourceKey is not null}, HasDeviceLabel = {DeviceLabel is not null}, HasUserAgentSummary = {UserAgentSummary is not null}, HasNetworkAddressHash = {NetworkAddressHash is not null}, RequestedSessionLifetime = {RequestedSessionLifetime?.ToString() ?? "None"} }}";
    }
}
