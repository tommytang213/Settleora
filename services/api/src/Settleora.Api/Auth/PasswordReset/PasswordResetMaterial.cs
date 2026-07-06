namespace Settleora.Api.Auth.PasswordReset;

internal sealed record PasswordResetMaterial(
    string RawMaterial,
    string LookupHash,
    string HashVersion)
{
    public override string ToString()
    {
        return $"PasswordResetMaterial {{ LookupHashVersion = {HashVersion}, RawMaterialLength = {RawMaterial.Length} }}";
    }
}
