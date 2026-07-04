namespace Settleora.Api.Domain.Notifications;

public static class NotificationPolicyReadinessStates
{
    public const string Unsupported = "unsupported";
    public const string Unconfigured = "unconfigured";
    public const string Configured = "configured";
    public const string Invalid = "invalid";
    public const string Disabled = "disabled";
    public const string Limited = "limited";
    public const string Unknown = "unknown";

    public static bool IsSupported(string? value)
    {
        return value is Unsupported
            or Unconfigured
            or Configured
            or Invalid
            or Disabled
            or Limited
            or Unknown;
    }
}
