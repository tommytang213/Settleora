namespace Settleora.Api.Domain.Notifications;

public static class NotificationDeliveryAttemptStatuses
{
    public const string NotApplicable = "not_applicable";
    public const string Disabled = "disabled";
    public const string Unconfigured = "unconfigured";
    public const string Deferred = "deferred";
    public const string Queued = "queued";
    public const string Suppressed = "suppressed";
    public const string Cancelled = "cancelled";
    public const string Expired = "expired";

    public static bool IsSupported(string status)
    {
        return status is NotApplicable
            or Disabled
            or Unconfigured
            or Deferred
            or Queued
            or Suppressed
            or Cancelled
            or Expired;
    }

    public static bool IsProviderRuntimeStatus(string status)
    {
        return status is "attempting"
            or "sent"
            or "failed_transient"
            or "failed_permanent"
            or "delivered";
    }
}
