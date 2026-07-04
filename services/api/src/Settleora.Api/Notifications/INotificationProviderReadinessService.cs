using Settleora.Api.Domain.Notifications;

namespace Settleora.Api.Notifications;

internal interface INotificationProviderReadinessService
{
    NotificationProviderReadinessSnapshot GetSnapshot();
}

internal sealed record NotificationProviderReadinessSnapshot(
    string Email,
    string MobilePush)
{
    public static NotificationProviderReadinessSnapshot ConservativeDefault()
    {
        return new NotificationProviderReadinessSnapshot(
            NotificationPolicyReadinessStates.Unconfigured,
            NotificationPolicyReadinessStates.Unconfigured);
    }
}
