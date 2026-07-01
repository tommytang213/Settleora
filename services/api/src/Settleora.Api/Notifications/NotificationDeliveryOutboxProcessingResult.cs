namespace Settleora.Api.Notifications;

internal sealed record NotificationDeliveryOutboxProcessingResult(
    bool Processed,
    bool Claimed,
    Guid DeliveryAttemptId,
    string Status,
    string Reason,
    DateTimeOffset? NextAttemptAtUtc,
    int AttemptCount)
{
    public static NotificationDeliveryOutboxProcessingResult Skipped(
        Guid deliveryAttemptId,
        string status,
        string reason,
        DateTimeOffset? nextAttemptAtUtc,
        int attemptCount)
    {
        return new NotificationDeliveryOutboxProcessingResult(
            Processed: false,
            Claimed: false,
            deliveryAttemptId,
            status,
            reason,
            nextAttemptAtUtc,
            attemptCount);
    }

    public static NotificationDeliveryOutboxProcessingResult ProcessedAttempt(
        Guid deliveryAttemptId,
        string status,
        string reason,
        DateTimeOffset? nextAttemptAtUtc,
        int attemptCount)
    {
        return new NotificationDeliveryOutboxProcessingResult(
            Processed: true,
            Claimed: true,
            deliveryAttemptId,
            status,
            reason,
            nextAttemptAtUtc,
            attemptCount);
    }
}
