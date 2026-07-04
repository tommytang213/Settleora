namespace Settleora.Api.Domain.Notifications;

public static class NotificationPolicyTimingModes
{
    public const string Immediate = "immediate";
    public const string DigestReadout = "digest_readout";
    public const string Deferred = "deferred";
    public const string Disabled = "disabled";

    public static bool IsSupported(string? value)
    {
        return value is Immediate or DigestReadout or Deferred or Disabled;
    }
}
