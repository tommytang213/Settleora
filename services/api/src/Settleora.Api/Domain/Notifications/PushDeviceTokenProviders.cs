namespace Settleora.Api.Domain.Notifications;

public static class PushDeviceTokenProviders
{
    public const string Apns = "apns";
    public const string Fcm = "fcm";

    public static bool IsSupported(string? provider)
    {
        return provider is Apns or Fcm;
    }
}
