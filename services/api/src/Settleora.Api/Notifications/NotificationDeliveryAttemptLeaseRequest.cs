namespace Settleora.Api.Notifications;

internal sealed record NotificationDeliveryAttemptLeaseRequest(
    Guid DeliveryAttemptId,
    string LeaseOwner,
    DateTimeOffset ClaimedAtUtc,
    TimeSpan LeaseDuration);
