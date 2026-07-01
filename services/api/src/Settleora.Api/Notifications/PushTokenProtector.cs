using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Options;

namespace Settleora.Api.Notifications;

internal sealed class PushTokenProtector : IPushTokenProtector
{
    public const string ProtectionPurpose = "Settleora.Notifications.PushDeviceToken.v1";

    private readonly IDataProtector protector;
    private readonly IOptions<PushTokenProtectionOptions> options;

    public PushTokenProtector(
        IDataProtectionProvider dataProtectionProvider,
        IOptions<PushTokenProtectionOptions> options)
    {
        protector = dataProtectionProvider.CreateProtector(ProtectionPurpose);
        this.options = options;
    }

    public PushTokenProtectionResult Protect(string rawToken)
    {
        return new PushTokenProtectionResult(
            protector.Protect(rawToken),
            Normalize(options.Value.ProtectionKeyId, "aspnet-data-protection"),
            ProtectionPurpose);
    }

    public string Unprotect(string protectedTokenBlob)
    {
        return protector.Unprotect(protectedTokenBlob);
    }

    private static string Normalize(string? value, string fallback)
    {
        return string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
    }
}
