namespace Settleora.Api.Notifications;

internal sealed class PushNotificationOptions
{
    public const string SectionName = "Notifications:MobilePush";

    public bool Enabled { get; set; }
}
