namespace Settleora.Api.Notifications;

internal interface INotificationDeliveryAttemptLeaseService
{
    Task<NotificationDeliveryAttemptLeaseResult> ClaimAsync(
        NotificationDeliveryAttemptLeaseRequest request,
        CancellationToken cancellationToken = default);
}
