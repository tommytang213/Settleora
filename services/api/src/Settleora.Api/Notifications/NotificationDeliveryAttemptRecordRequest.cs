namespace Settleora.Api.Notifications;

internal sealed record NotificationDeliveryAttemptRecordRequest(
    NotificationDecisionEnvelope DecisionEnvelope,
    string Channel,
    string IdempotencyKey,
    DateTimeOffset CreatedAtUtc,
    bool SourceDomainEligible,
    Guid? InAppNotificationId = null,
    string? SourceCorrelationId = null,
    DateTimeOffset? NextAttemptAtUtc = null,
    DateTimeOffset? ExpiresAtUtc = null,
    Guid? GroupId = null,
    Guid? ExpenseBillId = null,
    Guid? ExpenseBillRevisionId = null,
    Guid? SettlementRequestId = null,
    Guid? SettlementPaymentId = null,
    Guid? RecurringBillTemplateId = null,
    Guid? RecurringBillOccurrenceId = null,
    Guid? ReceiptOcrReviewId = null,
    Guid? ReceiptAttachmentFileId = null,
    Guid? SyncOperationId = null);
