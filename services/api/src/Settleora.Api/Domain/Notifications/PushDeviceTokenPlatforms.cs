namespace Settleora.Api.Domain.Notifications;

public static class PushDeviceTokenPlatforms
{
    public const string Ios = "ios";
    public const string Android = "android";

    public static bool IsSupported(string? platform)
    {
        return platform is Ios or Android;
    }
}
