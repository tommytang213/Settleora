namespace Settleora.Api.Auth.Bootstrap;

internal sealed record LocalOwnerBootstrapRequest(
    string NormalizedIdentifier,
    string PlaintextPassword,
    string DisplayName,
    string? DefaultCurrency)
{
    public override string ToString()
    {
        return $"LocalOwnerBootstrapRequest {{ HasNormalizedIdentifier = {NormalizedIdentifier.Length > 0}, HasPlaintextPassword = {PlaintextPassword.Length > 0}, HasDisplayName = {DisplayName.Length > 0}, HasDefaultCurrency = {DefaultCurrency is not null} }}";
    }
}
