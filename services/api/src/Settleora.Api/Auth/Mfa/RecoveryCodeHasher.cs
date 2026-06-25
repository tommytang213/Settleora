using System.Security.Cryptography;
using Microsoft.AspNetCore.WebUtilities;

namespace Settleora.Api.Auth.Mfa;

internal interface IRecoveryCodeHasher
{
    RecoveryCodeHashResult Hash(string recoveryCode);

    bool Verify(string recoveryCode, string salt, string hash);
}

internal sealed record RecoveryCodeHashResult(string Hash, string Salt, string Algorithm, string Parameters);

internal sealed class RecoveryCodeHasher : IRecoveryCodeHasher
{
    private const string Algorithm = "pbkdf2-hmac-sha256";
    private const string Parameters = "iterations=100000;dk=32";
    private const int Iterations = 100_000;
    private const int SaltBytes = 16;
    private const int HashBytes = 32;

    public RecoveryCodeHashResult Hash(string recoveryCode)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltBytes);
        var hash = Rfc2898DeriveBytes.Pbkdf2(
            Normalize(recoveryCode),
            salt,
            Iterations,
            HashAlgorithmName.SHA256,
            HashBytes);
        return new RecoveryCodeHashResult(
            $"pbkdf2:{WebEncoders.Base64UrlEncode(hash)}",
            WebEncoders.Base64UrlEncode(salt),
            Algorithm,
            Parameters);
    }

    public bool Verify(string recoveryCode, string salt, string hash)
    {
        if (!hash.StartsWith("pbkdf2:", StringComparison.Ordinal))
        {
            return false;
        }

        var saltBytes = WebEncoders.Base64UrlDecode(salt);
        var expected = WebEncoders.Base64UrlDecode(hash["pbkdf2:".Length..]);
        var actual = Rfc2898DeriveBytes.Pbkdf2(
            Normalize(recoveryCode),
            saltBytes,
            Iterations,
            HashAlgorithmName.SHA256,
            HashBytes);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }

    private static string Normalize(string value)
    {
        return value.Trim().Replace(" ", string.Empty, StringComparison.Ordinal).ToUpperInvariant();
    }
}
