namespace Settleora.Api.Domain.Notifications;

public static class InAppNotificationStatuses
{
    public const string Unread = "unread";
    public const string Read = "read";
    public const string Archived = "archived";

    private static readonly string[] SupportedValues =
    [
        Unread,
        Read,
        Archived
    ];

    public static bool IsSupported(string? value)
    {
        return SupportedValues.Contains(value, StringComparer.Ordinal);
    }
}
