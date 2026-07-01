using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;

namespace Settleora.Api.Notifications;

internal sealed class HmacPushTokenFingerprintService : IPushTokenFingerprintService
{
    private const string TokenFingerprintPurpose = "settleora.push-token-fingerprint.v1";
    private const string DeviceInstallationPurpose = "settleora.push-device-installation.v1";

    private readonly IOptions<PushTokenProtectionOptions> options;

    public HmacPushTokenFingerprintService(IOptions<PushTokenProtectionOptions> options)
    {
        this.options = options;
    }

    public bool IsAvailable => options.Value.TryGetFingerprintKey(out _);

    public string CreateTokenFingerprint(string provider, string appBuildEnvironment, string rawToken)
    {
        return CreateFingerprint($"{TokenFingerprintPurpose}|{provider}|{appBuildEnvironment}|{rawToken}");
    }

    public string CreateDeviceInstallationHash(string deviceInstallationId)
    {
        return CreateFingerprint($"{DeviceInstallationPurpose}|{deviceInstallationId}");
    }

    private string CreateFingerprint(string value)
    {
        if (!options.Value.TryGetFingerprintKey(out var key))
        {
            throw new InvalidOperationException("Push token fingerprint key is not configured.");
        }

        using var hmac = new HMACSHA256(key);
        var digest = hmac.ComputeHash(Encoding.UTF8.GetBytes(value));
        return "hmac-sha256:" + Convert.ToHexString(digest).ToLowerInvariant();
    }
}
