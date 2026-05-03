namespace Settleora.Api.Auth.Sessions;

internal sealed record RefreshSessionEndpointRequest
{
    public string? RefreshCredential { get; init; }

    public string? DeviceLabel { get; init; }

    public override string ToString()
    {
        return $"RefreshSessionEndpointRequest {{ HasRefreshCredential = {RefreshCredential is not null}, HasDeviceLabel = {DeviceLabel is not null} }}";
    }
}
