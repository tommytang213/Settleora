namespace Settleora.Api.Domain.Notifications;

public static class PushDeviceTokenAppBuildEnvironments
{
    public const string Development = "development";
    public const string Staging = "staging";
    public const string Production = "production";

    public static bool IsSupported(string? appBuildEnvironment)
    {
        return appBuildEnvironment is Development
            or Staging
            or Production;
    }
}
