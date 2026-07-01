namespace Settleora.Api.Notifications;

internal interface INotificationDeliveryAttemptRecorder
{
    Task<NotificationDeliveryAttemptRecordResult> RecordAsync(
        NotificationDeliveryAttemptRecordRequest request,
        CancellationToken cancellationToken = default);
}
