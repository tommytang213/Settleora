using Settleora.Api.Domain.Auth;

namespace Settleora.Api.Domain.Notifications;

public sealed class NotificationGlobalPolicy
{
    public Guid Id { get; set; }
    public string PolicyVersion { get; set; } = "default-v1";
    public string Status { get; set; } = NotificationPolicyStatuses.Active;
    public string InAppChannelCap { get; set; } = NotificationPolicyChannelCaps.Enabled;
    public string EmailChannelCap { get; set; } = NotificationPolicyChannelCaps.Disabled;
    public string MobilePushChannelCap { get; set; } = NotificationPolicyChannelCaps.Disabled;
    public string EmailProviderReadiness { get; set; } = NotificationPolicyReadinessStates.Unconfigured;
    public string MobilePushProviderReadiness { get; set; } = NotificationPolicyReadinessStates.Unconfigured;
    public bool RequiredInAppEnabled { get; set; } = true;
    public bool OrdinaryMuteMaySuppressRequired { get; set; }
    public bool QuietHoursMayDeferRequired { get; set; }
    public string ExternalSensitiveContentClass { get; set; } = NotificationPolicyContentClasses.GenericExternalOnly;
    public string QuietHoursDefaultMode { get; set; } = NotificationPolicyTimingModes.Disabled;
    public string DigestDefaultMode { get; set; } = NotificationPolicyTimingModes.Disabled;
    public DateTimeOffset? EffectiveAtUtc { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset UpdatedAtUtc { get; set; }
    public Guid? CreatedByAuthAccountId { get; set; }
    public Guid? UpdatedByAuthAccountId { get; set; }

    public AuthAccount? CreatedByAuthAccount { get; set; }
    public AuthAccount? UpdatedByAuthAccount { get; set; }
    public ICollection<NotificationEventPolicyOverride> EventOverrides { get; } = new List<NotificationEventPolicyOverride>();
}
