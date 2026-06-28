using Settleora.Api.Domain.Notifications;

namespace Settleora.Api.Notifications;

internal sealed record InAppNotificationResponse(
    Guid Id,
    string EventType,
    string Status,
    string Priority,
    string SubjectType,
    string TitleKey,
    string MessageKey,
    string? SafeSummary,
    string? ActionUrl,
    Guid? GroupId,
    Guid? ExpenseBillId,
    Guid? ExpenseBillRevisionId,
    Guid? SettlementRequestId,
    Guid? SettlementPaymentId,
    Guid? RecurringBillTemplateId,
    Guid? RecurringBillOccurrenceId,
    Guid? ReceiptOcrReviewId,
    Guid? ReceiptAttachmentFileId,
    Guid? SyncOperationId,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? ReadAtUtc,
    DateTimeOffset? ArchivedAtUtc)
{
    public static InAppNotificationResponse From(InAppNotification notification)
    {
        return new InAppNotificationResponse(
            notification.Id,
            notification.EventType,
            notification.Status,
            notification.Priority,
            notification.SubjectType,
            notification.TitleKey,
            notification.MessageKey,
            notification.SafeSummary,
            notification.ActionUrl,
            notification.GroupId,
            notification.ExpenseBillId,
            notification.ExpenseBillRevisionId,
            notification.SettlementRequestId,
            notification.SettlementPaymentId,
            notification.RecurringBillTemplateId,
            notification.RecurringBillOccurrenceId,
            notification.ReceiptOcrReviewId,
            notification.ReceiptAttachmentFileId,
            notification.SyncOperationId,
            notification.CreatedAtUtc,
            notification.ReadAtUtc,
            notification.ArchivedAtUtc);
    }
}

internal sealed record InAppNotificationListResponse(
    IReadOnlyList<InAppNotificationResponse> Notifications);

internal sealed record InAppNotificationSummaryResponse(
    int UnreadCount,
    int AttentionCount,
    int UrgentCount);
