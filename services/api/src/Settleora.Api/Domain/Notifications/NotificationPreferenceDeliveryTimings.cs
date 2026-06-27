namespace Settleora.Api.Domain.Notifications;

public static class NotificationPreferenceDeliveryTimings
{
    public const string Immediate = "immediate";
    public const string DigestReadout = "digest_readout";

    private static readonly string[] Supported =
    [
        Immediate,
        DigestReadout
    ];

    public static bool IsSupported(string? value)
    {
        return Supported.Contains(value, StringComparer.Ordinal);
    }
}
