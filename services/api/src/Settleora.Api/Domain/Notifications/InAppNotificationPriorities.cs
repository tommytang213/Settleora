namespace Settleora.Api.Domain.Notifications;

public static class InAppNotificationPriorities
{
    public const string Normal = "normal";
    public const string Attention = "attention";
    public const string Urgent = "urgent";

    private static readonly string[] SupportedValues =
    [
        Normal,
        Attention,
        Urgent
    ];

    public static bool IsSupported(string? value)
    {
        return SupportedValues.Contains(value, StringComparer.Ordinal);
    }
}
