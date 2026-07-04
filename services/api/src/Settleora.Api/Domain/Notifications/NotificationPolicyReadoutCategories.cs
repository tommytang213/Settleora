namespace Settleora.Api.Domain.Notifications;

public static class NotificationPolicyReadoutCategories
{
    public const string Available = "available";
    public const string Unsupported = "unsupported";
    public const string Unconfigured = "unconfigured";
    public const string Disabled = "disabled";
    public const string Limited = "limited";
    public const string ProviderUnconfigured = "provider_unconfigured";
    public const string ProviderInvalid = "provider_invalid";
    public const string ProviderUnknown = "provider_unknown";
    public const string DisabledByAdmin = "disabled_by_admin";
    public const string UnsupportedByDeployment = "unsupported_by_deployment";
    public const string QuietHoursDeferred = "quiet_hours_deferred";
    public const string DigestPending = "digest_pending";
    public const string Queued = "queued";
    public const string Sent = "sent";
    public const string Failed = "failed";

    public static bool IsSupported(string? value)
    {
        return value is Available
            or Unsupported
            or Unconfigured
            or Disabled
            or Limited
            or ProviderUnconfigured
            or ProviderInvalid
            or ProviderUnknown
            or DisabledByAdmin
            or UnsupportedByDeployment
            or QuietHoursDeferred
            or DigestPending
            or Queued
            or Sent
            or Failed;
    }
}
