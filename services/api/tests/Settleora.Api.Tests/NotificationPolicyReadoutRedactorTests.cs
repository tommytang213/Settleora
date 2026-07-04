using Settleora.Api.Domain.Notifications;
using Settleora.Api.Notifications;

namespace Settleora.Api.Tests;

public sealed class NotificationPolicyReadoutRedactorTests
{
    [Theory]
    [InlineData("smtp.internal.example", NotificationPolicyChannels.InApp)]
    [InlineData("sms", NotificationPolicyChannels.InApp)]
    [InlineData(null, NotificationPolicyChannels.InApp)]
    public void SafeChannelFailsClosedToInApp(string? input, string expected)
    {
        Assert.Equal(expected, NotificationPolicyReadoutRedactor.SafeChannel(input));
    }

    [Theory]
    [InlineData("smtpPassword=visible-secret", NotificationPolicyChannelCaps.Unsupported)]
    [InlineData("provider_payload", NotificationPolicyChannelCaps.Unsupported)]
    [InlineData(null, NotificationPolicyChannelCaps.Unsupported)]
    public void SafeChannelCapFailsClosedToUnsupported(string? input, string expected)
    {
        Assert.Equal(expected, NotificationPolicyReadoutRedactor.SafeChannelCap(input));
    }

    [Theory]
    [InlineData("smtp.internal.example:2525", NotificationPolicyReadinessStates.Unknown)]
    [InlineData("deviceToken=visible-device-token", NotificationPolicyReadinessStates.Unknown)]
    [InlineData(null, NotificationPolicyReadinessStates.Unknown)]
    public void SafeReadinessFailsClosedToUnknown(string? input, string expected)
    {
        Assert.Equal(expected, NotificationPolicyReadoutRedactor.SafeReadiness(input));
    }

    [Theory]
    [InlineData("providerRequestId=req_visible", NotificationPolicyReadoutCategories.ProviderUnknown)]
    [InlineData("password_invalid_raw", NotificationPolicyReadoutCategories.ProviderUnknown)]
    [InlineData(null, NotificationPolicyReadoutCategories.ProviderUnknown)]
    public void SafeReadoutCategoryFailsClosedToProviderUnknown(string? input, string expected)
    {
        Assert.Equal(expected, NotificationPolicyReadoutRedactor.SafeReadoutCategory(input));
    }

    [Theory]
    [InlineData("ocr_text=raw receipt line", NotificationPolicyEventFamilies.Bills)]
    [InlineData("hidden_bill", NotificationPolicyEventFamilies.Bills)]
    [InlineData(null, NotificationPolicyEventFamilies.Bills)]
    public void SafeEventFamilyFailsClosedToBills(string? input, string expected)
    {
        Assert.Equal(expected, NotificationPolicyReadoutRedactor.SafeEventFamily(input));
    }

    [Theory]
    [InlineData("payment_handle", NotificationPolicyContentClasses.InAppOnly)]
    [InlineData("private_note", NotificationPolicyContentClasses.InAppOnly)]
    [InlineData(null, NotificationPolicyContentClasses.InAppOnly)]
    public void SafeContentClassFailsClosedToInAppOnly(string? input, string expected)
    {
        Assert.Equal(expected, NotificationPolicyReadoutRedactor.SafeContentClass(input));
    }

    [Theory]
    [InlineData("signed_url", NotificationPolicyTimingModes.Disabled)]
    [InlineData("storage_path", NotificationPolicyTimingModes.Disabled)]
    [InlineData(null, NotificationPolicyTimingModes.Disabled)]
    public void SafeTimingModeFailsClosedToDisabled(string? input, string expected)
    {
        Assert.Equal(expected, NotificationPolicyReadoutRedactor.SafeTimingMode(input));
    }

    [Theory]
    [InlineData(NotificationPolicyChannelCaps.Disabled, NotificationPolicyReadinessStates.Configured, NotificationPolicyReadoutCategories.DisabledByAdmin)]
    [InlineData(NotificationPolicyChannelCaps.Unsupported, NotificationPolicyReadinessStates.Configured, NotificationPolicyReadoutCategories.UnsupportedByDeployment)]
    [InlineData(NotificationPolicyChannelCaps.GenericExternalOnly, NotificationPolicyReadinessStates.Configured, NotificationPolicyReadoutCategories.Limited)]
    [InlineData(NotificationPolicyChannelCaps.GenericExternalOnly, NotificationPolicyReadinessStates.Limited, NotificationPolicyReadoutCategories.Limited)]
    [InlineData(NotificationPolicyChannelCaps.GenericExternalOnly, NotificationPolicyReadinessStates.Invalid, NotificationPolicyReadoutCategories.ProviderInvalid)]
    [InlineData(NotificationPolicyChannelCaps.GenericExternalOnly, NotificationPolicyReadinessStates.Disabled, NotificationPolicyReadoutCategories.DisabledByAdmin)]
    [InlineData(NotificationPolicyChannelCaps.GenericExternalOnly, NotificationPolicyReadinessStates.Unsupported, NotificationPolicyReadoutCategories.UnsupportedByDeployment)]
    [InlineData(NotificationPolicyChannelCaps.GenericExternalOnly, NotificationPolicyReadinessStates.Unconfigured, NotificationPolicyReadoutCategories.ProviderUnconfigured)]
    [InlineData(NotificationPolicyChannelCaps.GenericExternalOnly, NotificationPolicyReadinessStates.Unknown, NotificationPolicyReadoutCategories.ProviderUnknown)]
    public void ExternalReadoutCategoryUsesBoundedCategories(string channelCap, string readiness, string expected)
    {
        Assert.Equal(expected, NotificationPolicyReadoutRedactor.ReadoutCategoryForExternal(channelCap, readiness));
    }
}
