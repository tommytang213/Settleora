namespace Settleora.Api.Domain.Notifications;

public static class PushDeviceTokenPermissionStates
{
    public const string Authorized = "authorized";
    public const string Provisional = "provisional";
    public const string Denied = "denied";
    public const string NotDetermined = "not_determined";

    public static bool IsSupported(string? permissionState)
    {
        return permissionState is Authorized
            or Provisional
            or Denied
            or NotDetermined;
    }
}
