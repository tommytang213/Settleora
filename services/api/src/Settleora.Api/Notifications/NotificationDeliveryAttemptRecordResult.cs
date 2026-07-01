namespace Settleora.Api.Notifications;

internal sealed record NotificationDeliveryAttemptRecordResult(
    bool Created,
    bool Duplicate,
    string Status,
    string Reason,
    Guid? DeliveryAttemptId)
{
    public static NotificationDeliveryAttemptRecordResult CreatedAttempt(
        Guid deliveryAttemptId,
        string status,
        string reason)
    {
        return new NotificationDeliveryAttemptRecordResult(
            Created: true,
            Duplicate: false,
            status,
            reason,
            deliveryAttemptId);
    }

    public static NotificationDeliveryAttemptRecordResult Existing(
        Guid deliveryAttemptId,
        string status,
        string reason)
    {
        return new NotificationDeliveryAttemptRecordResult(
            Created: false,
            Duplicate: true,
            status,
            reason,
            deliveryAttemptId);
    }

    public static NotificationDeliveryAttemptRecordResult Skipped(string status, string reason)
    {
        return new NotificationDeliveryAttemptRecordResult(
            Created: false,
            Duplicate: false,
            status,
            reason,
            DeliveryAttemptId: null);
    }
}
