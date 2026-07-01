namespace Settleora.Api.Notifications;

internal sealed record NotificationDeliveryOutboxProcessingRequest(
    Guid DeliveryAttemptId,
    string WorkerId,
    DateTimeOffset ProcessedAtUtc,
    TimeSpan LeaseDuration,
    TimeSpan RetryBackoff);
