using Settleora.Api.Domain.Notifications;

namespace Settleora.Api.Notifications;

internal static class NotificationPolicyReadoutRedactor
{
    public static string SafeChannel(string? value)
    {
        return NotificationPolicyChannels.IsSupported(value)
            ? value!
            : NotificationPolicyChannels.InApp;
    }

    public static string SafeChannelCap(string? value)
    {
        return NotificationPolicyChannelCaps.IsSupported(value)
            ? value!
            : NotificationPolicyChannelCaps.Unsupported;
    }

    public static string SafeReadiness(string? value)
    {
        return NotificationPolicyReadinessStates.IsSupported(value)
            ? value!
            : NotificationPolicyReadinessStates.Unknown;
    }

    public static string SafeReadoutCategory(string? value)
    {
        return NotificationPolicyReadoutCategories.IsSupported(value)
            ? value!
            : NotificationPolicyReadoutCategories.ProviderUnknown;
    }

    public static string SafeEventFamily(string? value)
    {
        return NotificationPolicyEventFamilies.IsSupported(value)
            ? value!
            : NotificationPolicyEventFamilies.Bills;
    }

    public static string SafeContentClass(string? value)
    {
        return NotificationPolicyContentClasses.IsSupported(value)
            ? value!
            : NotificationPolicyContentClasses.InAppOnly;
    }

    public static string SafeTimingMode(string? value)
    {
        return NotificationPolicyTimingModes.IsSupported(value)
            ? value!
            : NotificationPolicyTimingModes.Disabled;
    }

    public static string ReadoutCategoryForExternal(string channelCap, string readiness)
    {
        if (channelCap is NotificationPolicyChannelCaps.Disabled)
        {
            return NotificationPolicyReadoutCategories.DisabledByAdmin;
        }

        if (channelCap is NotificationPolicyChannelCaps.Unsupported)
        {
            return NotificationPolicyReadoutCategories.UnsupportedByDeployment;
        }

        return readiness switch
        {
            NotificationPolicyReadinessStates.Configured => NotificationPolicyReadoutCategories.Limited,
            NotificationPolicyReadinessStates.Limited => NotificationPolicyReadoutCategories.Limited,
            NotificationPolicyReadinessStates.Invalid => NotificationPolicyReadoutCategories.ProviderInvalid,
            NotificationPolicyReadinessStates.Disabled => NotificationPolicyReadoutCategories.DisabledByAdmin,
            NotificationPolicyReadinessStates.Unsupported => NotificationPolicyReadoutCategories.UnsupportedByDeployment,
            NotificationPolicyReadinessStates.Unconfigured => NotificationPolicyReadoutCategories.ProviderUnconfigured,
            _ => NotificationPolicyReadoutCategories.ProviderUnknown
        };
    }
}
