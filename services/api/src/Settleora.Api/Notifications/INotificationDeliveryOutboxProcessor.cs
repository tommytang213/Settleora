namespace Settleora.Api.Notifications;

internal interface INotificationDeliveryOutboxProcessor
{
    Task<NotificationDeliveryOutboxProcessingResult> ProcessAsync(
        NotificationDeliveryOutboxProcessingRequest request,
        CancellationToken cancellationToken = default);
}
