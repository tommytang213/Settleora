namespace Settleora.Api.Auth.SignIn;

internal sealed record LocalSignInEndpointRequest
{
    public string? Identifier { get; init; }

    public string? Password { get; init; }

    public string? DeviceLabel { get; init; }

    public override string ToString()
    {
        return $"LocalSignInEndpointRequest {{ HasIdentifier = {Identifier is not null}, HasPassword = {Password is not null}, HasDeviceLabel = {DeviceLabel is not null} }}";
    }
}
