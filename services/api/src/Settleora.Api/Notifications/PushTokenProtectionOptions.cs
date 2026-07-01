using System.ComponentModel.DataAnnotations;

namespace Settleora.Api.Notifications;

internal sealed class PushTokenProtectionOptions
{
    public const string SectionName = "Settleora:PushTokens";

    public string? FingerprintKeyBase64 { get; set; }

    public string ProtectionKeyId { get; set; } = "aspnet-data-protection";

    public string ProtectionPurpose { get; set; } = PushTokenProtector.ProtectionPurpose;

    public bool TryGetFingerprintKey(out byte[] key)
    {
        key = [];

        if (string.IsNullOrWhiteSpace(FingerprintKeyBase64))
        {
            return false;
        }

        try
        {
            key = Convert.FromBase64String(FingerprintKeyBase64);
        }
        catch (FormatException)
        {
            key = [];
            return false;
        }

        return key.Length >= 32;
    }
}
