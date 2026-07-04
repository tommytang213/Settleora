namespace Settleora.Api.Domain.Notifications;

public static class NotificationPolicyChannelCaps
{
    public const string Enabled = "enabled";
    public const string Disabled = "disabled";
    public const string Unsupported = "unsupported";
    public const string DigestOnly = "digest_only";
    public const string ImmediateAllowed = "immediate_allowed";
    public const string GenericExternalOnly = "generic_external_only";
    public const string InAppOnly = "in_app_only";

    public static bool IsSupported(string? value)
    {
        return value is Enabled
            or Disabled
            or Unsupported
            or DigestOnly
            or ImmediateAllowed
            or GenericExternalOnly
            or InAppOnly;
    }
}
