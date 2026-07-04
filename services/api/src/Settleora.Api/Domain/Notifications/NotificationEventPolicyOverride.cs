namespace Settleora.Api.Domain.Notifications;

public sealed class NotificationEventPolicyOverride
{
    public Guid Id { get; set; }
    public Guid NotificationGlobalPolicyId { get; set; }
    public string EventFamily { get; set; } = NotificationPolicyEventFamilies.Bills;
    public string InAppChannelCap { get; set; } = NotificationPolicyChannelCaps.Enabled;
    public string EmailChannelCap { get; set; } = NotificationPolicyChannelCaps.Disabled;
    public string MobilePushChannelCap { get; set; } = NotificationPolicyChannelCaps.Disabled;
    public string ExternalContentClass { get; set; } = NotificationPolicyContentClasses.GenericExternalOnly;
    public bool RequiredInApp { get; set; } = true;
    public bool DigestEligible { get; set; }
    public bool QuietHoursEligible { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset UpdatedAtUtc { get; set; }

    public NotificationGlobalPolicy NotificationGlobalPolicy { get; set; } = null!;
}
