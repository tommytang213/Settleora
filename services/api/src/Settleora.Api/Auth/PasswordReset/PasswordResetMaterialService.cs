using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.WebUtilities;

namespace Settleora.Api.Auth.PasswordReset;

internal sealed class PasswordResetMaterialService : IPasswordResetMaterialService
{
    private const int MaterialByteLength = 32;
    private const string LookupHashPrefix = "pwd-reset-sha256:v1:";
    private const string HashVersion = "sha256-v1";
    private const string Purpose = "local_password_reset";

    public PasswordResetMaterial CreateMaterial()
    {
        var bytes = RandomNumberGenerator.GetBytes(MaterialByteLength);
        var rawMaterial = WebEncoders.Base64UrlEncode(bytes);
        return new PasswordResetMaterial(
            rawMaterial,
            DeriveLookupHash(rawMaterial),
            HashVersion);
    }

    public string DeriveLookupHash(string? submittedMaterial)
    {
        if (string.IsNullOrWhiteSpace(submittedMaterial))
        {
            return string.Empty;
        }

        var normalizedMaterial = submittedMaterial.Trim();
        var payload = $"{Purpose}:{normalizedMaterial}";
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(payload));
        return LookupHashPrefix + WebEncoders.Base64UrlEncode(hash);
    }
}
