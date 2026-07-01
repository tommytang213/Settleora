namespace Settleora.Api.Notifications;

internal sealed record NotificationDeliveryAttemptLeaseResult(
    bool Claimed,
    Guid DeliveryAttemptId,
    string Status,
    string Reason,
    string? LeaseOwner,
    DateTimeOffset? LeaseExpiresAtUtc,
    int AttemptCount)
{
    public static NotificationDeliveryAttemptLeaseResult ClaimedAttempt(
        Guid deliveryAttemptId,
        string status,
        string reason,
        string leaseOwner,
        DateTimeOffset leaseExpiresAtUtc,
        int attemptCount)
    {
        return new NotificationDeliveryAttemptLeaseResult(
            Claimed: true,
            deliveryAttemptId,
            status,
            reason,
            leaseOwner,
            leaseExpiresAtUtc,
            attemptCount);
    }

    public static NotificationDeliveryAttemptLeaseResult NotClaimed(
        Guid deliveryAttemptId,
        string status,
        string reason,
        string? leaseOwner,
        DateTimeOffset? leaseExpiresAtUtc,
        int attemptCount)
    {
        return new NotificationDeliveryAttemptLeaseResult(
            Claimed: false,
            deliveryAttemptId,
            status,
            reason,
            leaseOwner,
            leaseExpiresAtUtc,
            attemptCount);
    }
}
