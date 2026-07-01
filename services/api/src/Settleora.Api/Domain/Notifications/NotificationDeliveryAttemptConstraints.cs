namespace Settleora.Api.Domain.Notifications;

public static class NotificationDeliveryAttemptConstraints
{
    public const int ChannelMaxLength = 32;
    public const int StatusMaxLength = 32;
    public const int StatusReasonMaxLength = 120;
    public const int IdempotencyKeyMaxLength = 160;
    public const int SourceCorrelationIdMaxLength = 120;
    public const int LeaseOwnerMaxLength = 120;
    public const int RedactedProviderResultCategoryMaxLength = 120;
}
