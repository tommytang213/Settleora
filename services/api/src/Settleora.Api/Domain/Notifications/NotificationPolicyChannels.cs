namespace Settleora.Api.Domain.Notifications;

public static class NotificationPolicyChannels
{
    public const string InApp = "in_app";
    public const string Email = "email";
    public const string MobilePush = "mobile_push";

    public static bool IsSupported(string? value)
    {
        return value is InApp or Email or MobilePush;
    }
}
