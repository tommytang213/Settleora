namespace Settleora.Api.Domain.Notifications;

public static class NotificationPolicyConstraints
{
    public const int PolicyVersionMaxLength = 64;
    public const int PolicyStatusMaxLength = 16;
    public const int ChannelMaxLength = 32;
    public const int ChannelCapMaxLength = 32;
    public const int ReadinessMaxLength = 32;
    public const int ReadoutCategoryMaxLength = 64;
    public const int EventFamilyMaxLength = 64;
    public const int SensitivityMaxLength = 32;
    public const int ContentClassMaxLength = 32;
    public const int TimingModeMaxLength = 32;
}
