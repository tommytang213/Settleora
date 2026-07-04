namespace Settleora.Api.Domain.Notifications;

public static class NotificationPolicyStatuses
{
    public const string Active = "active";
    public const string Draft = "draft";
    public const string Disabled = "disabled";
    public const string Superseded = "superseded";

    public static bool IsSupported(string? value)
    {
        return value is Active or Draft or Disabled or Superseded;
    }
}
