using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.Notifications;

public sealed class UserNotificationPreference
{
    public Guid UserProfileId { get; set; }

    public UserProfile UserProfile { get; set; } = null!;

    public bool InAppEnabled { get; set; } = true;

    public bool BillsEnabled { get; set; } = true;

    public bool SettlementsEnabled { get; set; } = true;

    public bool RecurringEnabled { get; set; } = true;

    public bool SyncSecurityEnabled { get; set; } = true;

    public bool QuietHoursEnabled { get; set; }

    public int QuietHoursStartHour { get; set; } = 22;

    public int QuietHoursEndHour { get; set; } = 7;

    public string DeliveryTiming { get; set; } = NotificationPreferenceDeliveryTimings.Immediate;

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }
}
