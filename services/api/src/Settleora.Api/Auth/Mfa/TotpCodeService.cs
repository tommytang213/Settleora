using System.Security.Cryptography;

namespace Settleora.Api.Auth.Mfa;

internal interface ITotpCodeService
{
    bool VerifyCode(
        byte[] secret,
        string submittedCode,
        DateTimeOffset occurredAtUtc,
        int digits,
        int periodSeconds,
        int allowedDriftPeriods);
}

internal sealed class TotpCodeService : ITotpCodeService
{
    public bool VerifyCode(
        byte[] secret,
        string submittedCode,
        DateTimeOffset occurredAtUtc,
        int digits,
        int periodSeconds,
        int allowedDriftPeriods)
    {
        var normalized = NormalizeCode(submittedCode);
        if (normalized is null || normalized.Length != digits)
        {
            return false;
        }

        var timestep = occurredAtUtc.ToUnixTimeSeconds() / periodSeconds;
        var drift = Math.Clamp(allowedDriftPeriods, 0, 2);
        for (var offset = -drift; offset <= drift; offset++)
        {
            var expected = GenerateCode(secret, timestep + offset, digits);
            if (CryptographicOperations.FixedTimeEquals(
                    System.Text.Encoding.ASCII.GetBytes(expected),
                    System.Text.Encoding.ASCII.GetBytes(normalized)))
            {
                return true;
            }
        }

        return false;
    }

    internal static string GenerateCode(byte[] secret, long timestep, int digits)
    {
        Span<byte> counter = stackalloc byte[8];
        System.Buffers.Binary.BinaryPrimitives.WriteInt64BigEndian(counter, timestep);
        using var hmac = new HMACSHA1(secret);
        var hash = hmac.ComputeHash(counter.ToArray());
        var offset = hash[^1] & 0x0f;
        var binaryCode = ((hash[offset] & 0x7f) << 24)
            | ((hash[offset + 1] & 0xff) << 16)
            | ((hash[offset + 2] & 0xff) << 8)
            | (hash[offset + 3] & 0xff);
        var modulo = (int)Math.Pow(10, digits);
        return (binaryCode % modulo).ToString(new string('0', digits), System.Globalization.CultureInfo.InvariantCulture);
    }

    private static string? NormalizeCode(string? code)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            return null;
        }

        var normalized = code.Replace(" ", string.Empty, StringComparison.Ordinal);
        return normalized.All(char.IsDigit) ? normalized : null;
    }
}
