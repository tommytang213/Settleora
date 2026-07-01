using Settleora.Api.Domain.Notifications;

namespace Settleora.Api.Notifications;

internal interface ISmtpEmailNotificationSender
{
    Task<SmtpEmailNotificationSendResult> SendAsync(
        SmtpEmailNotificationSendRequest request,
        CancellationToken cancellationToken = default);
}

internal sealed record SmtpEmailNotificationSendRequest(
    string? RecipientEmailAddress,
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
    public static SmtpEmailNotificationSendRequest FromDeliveryAttempt(NotificationDeliveryAttempt attempt)
    {
        return new SmtpEmailNotificationSendRequest(
            RecipientEmailAddress: null,
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

internal sealed record SmtpEmailNotificationSendResult(
    string Category,
    bool Accepted = false,
    bool Retryable = false,
    bool Disabled = false,
    bool Unconfigured = false)
{
    public static SmtpEmailNotificationSendResult AcceptedByProvider()
    {
        return new SmtpEmailNotificationSendResult(SmtpEmailNotificationResultCategories.Accepted, Accepted: true);
    }

    public static SmtpEmailNotificationSendResult DisabledByConfiguration()
    {
        return new SmtpEmailNotificationSendResult(
            SmtpEmailNotificationResultCategories.DisabledByConfiguration,
            Disabled: true);
    }

    public static SmtpEmailNotificationSendResult ProviderUnconfigured()
    {
        return new SmtpEmailNotificationSendResult(
            SmtpEmailNotificationResultCategories.ProviderUnconfigured,
            Unconfigured: true);
    }

    public static SmtpEmailNotificationSendResult FailedTransient(string category)
    {
        return new SmtpEmailNotificationSendResult(category, Retryable: true);
    }

    public static SmtpEmailNotificationSendResult FailedPermanent(string category)
    {
        return new SmtpEmailNotificationSendResult(category);
    }
}

internal static class SmtpEmailNotificationResultCategories
{
    public const string Accepted = "accepted";
    public const string DisabledByConfiguration = "disabled_by_configuration";
    public const string ProviderUnconfigured = "provider_unconfigured";
    public const string ProviderUnavailable = "provider_unavailable";
    public const string AuthenticationFailedRedacted = "authentication_failed_redacted";
    public const string ConfigurationInvalid = "configuration_invalid";
    public const string RecipientRejected = "recipient_rejected";
    public const string ContentRejected = "content_rejected";
}
