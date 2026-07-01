namespace Settleora.Api.Domain.Notifications;

public static class PushDeviceTokenStatuses
{
    public const string Active = "active";
    public const string Revoked = "revoked";
    public const string Superseded = "superseded";
    public const string Stale = "stale";
    public const string ProviderInvalid = "provider_invalid";

    public static bool IsSupported(string status)
    {
        return status is Active
            or Revoked
            or Superseded
            or Stale
            or ProviderInvalid;
    }
}
