namespace Settleora.Api.Notifications;

internal sealed record InAppNotificationWriteRequest(
    Guid RecipientUserProfileId,
    Guid? ActorUserProfileId,
    string EventType,
    string Priority,
    string SubjectType,
    string TitleKey,
    string MessageKey,
    DateTimeOffset CreatedAtUtc,
    string? SafeSummary = null,
    string? ActionUrl = null,
    Guid? GroupId = null,
    Guid? ExpenseBillId = null,
    Guid? ExpenseBillRevisionId = null,
    Guid? SettlementRequestId = null,
    Guid? SettlementPaymentId = null,
    Guid? RecurringBillTemplateId = null,
    Guid? RecurringBillOccurrenceId = null,
    Guid? ReceiptOcrReviewId = null,
    Guid? ReceiptAttachmentFileId = null,
    Guid? SyncOperationId = null,
    bool AllowSelfNotification = false);
