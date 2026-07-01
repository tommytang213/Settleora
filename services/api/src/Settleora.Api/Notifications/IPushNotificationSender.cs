using Settleora.Api.Domain.Notifications;

namespace Settleora.Api.Notifications;

internal interface IPushNotificationSender
{
    Task<PushNotificationSendResult> SendAsync(
        PushNotificationSendRequest request,
        CancellationToken cancellationToken = default);
}

internal interface IPushNotificationProvider
{
    Task<PushProviderSendResult> SendAsync(
        PushProviderSendRequest request,
        CancellationToken cancellationToken = default);
}

internal sealed record PushNotificationSendRequest(
    string EventType,
    string SubjectType,
    Guid RecipientUserProfileId,
    Guid? InAppNotificationId,
    Guid? GroupId,
    Guid? ExpenseBillId,
    Guid? ExpenseBillRevisionId,
    Guid? SettlementRequestId,
    Guid? SettlementPaymentId,
    Guid? RecurringBillTemplateId,
    Guid? RecurringBillOccurrenceId,
    Guid? ReceiptOcrReviewId,
    Guid? SyncOperationId)
{
    public static PushNotificationSendRequest FromDeliveryAttempt(NotificationDeliveryAttempt attempt)
    {
        return new PushNotificationSendRequest(
            attempt.EventType,
            attempt.SubjectType,
            attempt.RecipientUserProfileId,
            attempt.InAppNotificationId,
            attempt.GroupId,
            attempt.ExpenseBillId,
            attempt.ExpenseBillRevisionId,
            attempt.SettlementRequestId,
            attempt.SettlementPaymentId,
            attempt.RecurringBillTemplateId,
            attempt.RecurringBillOccurrenceId,
            attempt.ReceiptOcrReviewId,
            attempt.SyncOperationId);
    }
}

internal sealed record PushNotificationSendResult(
    string Category,
    bool Accepted = false,
    bool Retryable = false,
    bool Disabled = false,
    bool Unconfigured = false,
    bool NoActiveTokens = false)
{
    public static PushNotificationSendResult AcceptedByProvider()
    {
        return new PushNotificationSendResult(PushNotificationResultCategories.Accepted, Accepted: true);
    }

    public static PushNotificationSendResult DisabledByConfiguration()
    {
        return new PushNotificationSendResult(
            PushNotificationResultCategories.DisabledByConfiguration,
            Disabled: true);
    }

    public static PushNotificationSendResult ProviderUnconfigured()
    {
        return new PushNotificationSendResult(
            PushNotificationResultCategories.ProviderUnconfigured,
            Unconfigured: true);
    }

    public static PushNotificationSendResult NoActiveDeviceTokens()
    {
        return new PushNotificationSendResult(
            PushNotificationResultCategories.NoActiveTokens,
            NoActiveTokens: true);
    }

    public static PushNotificationSendResult FailedTransient(string category)
    {
        return new PushNotificationSendResult(category, Retryable: true);
    }

    public static PushNotificationSendResult FailedPermanent(string category)
    {
        return new PushNotificationSendResult(category);
    }
}

internal sealed record PushProviderSendRequest(
    PushNotificationPayload Payload,
    IReadOnlyList<PushProviderToken> Tokens);

internal sealed record PushProviderToken(
    Guid PushDeviceTokenId,
    string Platform,
    string Provider,
    string AppBuildEnvironment,
    string RawProviderToken);

internal sealed record PushProviderSendResult(
    string Category,
    bool Accepted = false,
    bool Retryable = false,
    bool Unconfigured = false)
{
    public static PushProviderSendResult AcceptedByProvider()
    {
        return new PushProviderSendResult(PushNotificationResultCategories.Accepted, Accepted: true);
    }

    public static PushProviderSendResult ProviderUnconfigured()
    {
        return new PushProviderSendResult(
            PushNotificationResultCategories.ProviderUnconfigured,
            Unconfigured: true);
    }

    public static PushProviderSendResult FailedTransient(string category)
    {
        return new PushProviderSendResult(category, Retryable: true);
    }

    public static PushProviderSendResult FailedPermanent(string category)
    {
        return new PushProviderSendResult(category);
    }
}

internal sealed record PushNotificationPayload(
    string Title,
    string Body,
    string EventType,
    string SubjectType,
    string ReferenceType,
    string ReferenceId,
    Guid? InAppNotificationId);

internal static class PushNotificationResultCategories
{
    public const string Accepted = "accepted";
    public const string DisabledByConfiguration = "disabled_by_configuration";
    public const string ProviderUnconfigured = "provider_unconfigured";
    public const string NoActiveTokens = "no_active_tokens";
    public const string InvalidToken = "invalid_token";
    public const string ProviderUnavailable = "provider_unavailable";
    public const string RateLimited = "rate_limited";
    public const string MalformedPayload = "malformed_payload";
    public const string PermanentProviderFailure = "permanent_provider_failure";
    public const string UnknownProviderFailure = "unknown_provider_failure";
}
