using Settleora.Api.Domain.Notifications;

namespace Settleora.Api.Notifications;

internal sealed record NotificationPreferenceUpdateRequest(
    bool? InAppEnabled,
    NotificationPreferenceCategoryRequest? Categories,
    NotificationPreferenceQuietHoursRequest? QuietHours,
    string? DeliveryTiming);

internal sealed record NotificationPreferenceCategoryRequest(
    bool? Bills,
    bool? Settlements,
    bool? Recurring,
    bool? SyncSecurity);

internal sealed record NotificationPreferenceQuietHoursRequest(
    bool? Enabled,
    int? StartHour,
    int? EndHour);

internal sealed record NotificationPreferenceResponse(
    bool InAppEnabled,
    NotificationPreferenceCategoryResponse Categories,
    NotificationPreferenceQuietHoursResponse QuietHours,
    string DeliveryTiming)
{
    public static NotificationPreferenceResponse From(UserNotificationPreference? preference)
    {
        return preference is null
            ? Defaults()
            : new NotificationPreferenceResponse(
                preference.InAppEnabled,
                new NotificationPreferenceCategoryResponse(
                    preference.BillsEnabled,
                    preference.SettlementsEnabled,
                    preference.RecurringEnabled,
                    true),
                new NotificationPreferenceQuietHoursResponse(
                    preference.QuietHoursEnabled,
                    preference.QuietHoursStartHour,
                    preference.QuietHoursEndHour),
                preference.DeliveryTiming);
    }

    private static NotificationPreferenceResponse Defaults()
    {
        return new NotificationPreferenceResponse(
            true,
            new NotificationPreferenceCategoryResponse(
                Bills: true,
                Settlements: true,
                Recurring: true,
                SyncSecurity: true),
            new NotificationPreferenceQuietHoursResponse(
                Enabled: false,
                StartHour: 22,
                EndHour: 7),
            NotificationPreferenceDeliveryTimings.Immediate);
    }
}

internal sealed record NotificationPreferenceCategoryResponse(
    bool Bills,
    bool Settlements,
    bool Recurring,
    bool SyncSecurity);

internal sealed record NotificationPreferenceQuietHoursResponse(
    bool Enabled,
    int StartHour,
    int EndHour);
