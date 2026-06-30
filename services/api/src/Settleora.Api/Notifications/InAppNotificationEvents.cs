using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Domain.RecurringBills;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Sync;

namespace Settleora.Api.Notifications;

internal static class InAppNotificationEvents
{
    public static async Task WriteBillParticipantNotificationsAsync(
        IInAppNotificationWriter notificationWriter,
        ExpenseBill bill,
        Guid actorUserProfileId,
        string eventType,
        string priority,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        foreach (var recipientId in bill.Participants
            .Select(participant => participant.UserProfileId)
            .Distinct()
            .Order())
        {
            await WriteBillNotificationAsync(
                notificationWriter,
                bill,
                recipientId,
                actorUserProfileId,
                eventType,
                priority,
                now,
                cancellationToken);
        }
    }

    public static async Task WriteBillPendingParticipantNotificationsAsync(
        IInAppNotificationWriter notificationWriter,
        ExpenseBill bill,
        Guid actorUserProfileId,
        string eventType,
        string priority,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        foreach (var recipientId in bill.Participants
            .Where(participant => participant.Status == ExpenseBillParticipantStatuses.PendingAcceptance)
            .Select(participant => participant.UserProfileId)
            .Distinct()
            .Order())
        {
            await WriteBillNotificationAsync(
                notificationWriter,
                bill,
                recipientId,
                actorUserProfileId,
                eventType,
                priority,
                now,
                cancellationToken);
        }
    }

    public static Task WriteBillCreatorNotificationAsync(
        IInAppNotificationWriter notificationWriter,
        ExpenseBill bill,
        Guid actorUserProfileId,
        string eventType,
        string priority,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        return WriteBillNotificationAsync(
            notificationWriter,
            bill,
            bill.CreatedByUserProfileId,
            actorUserProfileId,
            eventType,
            priority,
            now,
            cancellationToken);
    }

    public static Task WriteSettlementRequestNotificationAsync(
        IInAppNotificationWriter notificationWriter,
        SettlementRequest settlementRequest,
        Guid actorUserProfileId,
        string eventType,
        string priority,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var recipientId = ResolveSettlementCounterparty(settlementRequest, actorUserProfileId);
        if (recipientId is null)
        {
            return Task.CompletedTask;
        }

        return notificationWriter.WriteAsync(
            new InAppNotificationWriteRequest(
                recipientId.Value,
                actorUserProfileId,
                eventType,
                priority,
                InAppNotificationSubjectTypes.SettlementRequest,
                TitleKey(eventType),
                MessageKey(eventType),
                now,
                ActionUrl: $"/api/v1/settlements/{settlementRequest.Id:D}",
                GroupId: settlementRequest.GroupId,
                ExpenseBillId: settlementRequest.SourceExpenseBillId,
                SettlementRequestId: settlementRequest.Id),
            cancellationToken);
    }

    public static Task WriteSettlementPaymentNotificationAsync(
        IInAppNotificationWriter notificationWriter,
        SettlementRequest settlementRequest,
        SettlementPayment payment,
        Guid actorUserProfileId,
        string eventType,
        string priority,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var recipientId = ResolveSettlementCounterparty(settlementRequest, actorUserProfileId);
        if (recipientId is null)
        {
            return Task.CompletedTask;
        }

        return notificationWriter.WriteAsync(
            new InAppNotificationWriteRequest(
                recipientId.Value,
                actorUserProfileId,
                eventType,
                priority,
                InAppNotificationSubjectTypes.SettlementPayment,
                TitleKey(eventType),
                MessageKey(eventType),
                now,
                ActionUrl: $"/api/v1/settlement-payments/{payment.Id:D}",
                GroupId: settlementRequest.GroupId,
                ExpenseBillId: settlementRequest.SourceExpenseBillId,
                SettlementRequestId: settlementRequest.Id,
                SettlementPaymentId: payment.Id),
            cancellationToken);
    }

    public static Task WriteSettlementProofAttachedNotificationAsync(
        IInAppNotificationWriter notificationWriter,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        Guid actorUserProfileId,
        Guid? groupId,
        Guid sourceExpenseBillId,
        Guid settlementRequestId,
        Guid settlementPaymentId,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var recipientId = actorUserProfileId == debtorUserProfileId
            ? creditorUserProfileId
            : debtorUserProfileId;
        return notificationWriter.WriteAsync(
            new InAppNotificationWriteRequest(
                recipientId,
                actorUserProfileId,
                InAppNotificationEventTypes.SettlementProofAttached,
                InAppNotificationPriorities.Attention,
                InAppNotificationSubjectTypes.SettlementPayment,
                TitleKey(InAppNotificationEventTypes.SettlementProofAttached),
                MessageKey(InAppNotificationEventTypes.SettlementProofAttached),
                now,
                ActionUrl: $"/api/v1/settlement-payments/{settlementPaymentId:D}/proof",
                GroupId: groupId,
                ExpenseBillId: sourceExpenseBillId,
                SettlementRequestId: settlementRequestId,
                SettlementPaymentId: settlementPaymentId),
            cancellationToken);
    }

    public static Task WriteRecurringDraftGeneratedNotificationAsync(
        IInAppNotificationWriter notificationWriter,
        RecurringBillTemplate template,
        RecurringBillOccurrence occurrence,
        ExpenseBill bill,
        Guid actorUserProfileId,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        return notificationWriter.WriteAsync(
            new InAppNotificationWriteRequest(
                template.OwnerUserProfileId,
                actorUserProfileId,
                InAppNotificationEventTypes.RecurringBillDraftGenerated,
                InAppNotificationPriorities.Normal,
                InAppNotificationSubjectTypes.RecurringBillOccurrence,
                TitleKey(InAppNotificationEventTypes.RecurringBillDraftGenerated),
                MessageKey(InAppNotificationEventTypes.RecurringBillDraftGenerated),
                now,
                ActionUrl: BillActionUrl(bill),
                GroupId: template.GroupId,
                ExpenseBillId: bill.Id,
                RecurringBillTemplateId: template.Id,
                RecurringBillOccurrenceId: occurrence.Id),
            cancellationToken);
    }

    public static Task WriteSyncConflictDetectedNotificationAsync(
        IInAppNotificationWriter notificationWriter,
        SyncOperation operation,
        Guid actorUserProfileId,
        Guid? groupId,
        Guid? expenseBillId,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        return notificationWriter.WriteAsync(
            new InAppNotificationWriteRequest(
                actorUserProfileId,
                actorUserProfileId,
                InAppNotificationEventTypes.SyncConflictDetected,
                InAppNotificationPriorities.Attention,
                InAppNotificationSubjectTypes.SyncOperation,
                TitleKey(InAppNotificationEventTypes.SyncConflictDetected),
                MessageKey(InAppNotificationEventTypes.SyncConflictDetected),
                now,
                ActionUrl: $"/api/v1/sync/operations/{operation.Id:D}",
                GroupId: groupId,
                ExpenseBillId: expenseBillId,
                SyncOperationId: operation.Id,
                AllowSelfNotification: true),
            cancellationToken);
    }

    public static Task WriteReceiptOcrNeedsReviewNotificationAsync(
        IInAppNotificationWriter notificationWriter,
        Guid expenseBillId,
        Guid? groupId,
        Guid receiptOcrReviewId,
        Guid receiptAttachmentFileId,
        Guid assignedToUserProfileId,
        Guid actorUserProfileId,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        return notificationWriter.WriteAsync(
            new InAppNotificationWriteRequest(
                assignedToUserProfileId,
                actorUserProfileId,
                InAppNotificationEventTypes.OcrNeedsReview,
                InAppNotificationPriorities.Attention,
                InAppNotificationSubjectTypes.ReceiptOcrReview,
                TitleKey(InAppNotificationEventTypes.OcrNeedsReview),
                MessageKey(InAppNotificationEventTypes.OcrNeedsReview),
                now,
                ActionUrl: ReceiptOcrReviewActionUrl(expenseBillId, groupId, receiptAttachmentFileId),
                GroupId: groupId,
                ExpenseBillId: expenseBillId,
                ReceiptOcrReviewId: receiptOcrReviewId,
                ReceiptAttachmentFileId: receiptAttachmentFileId),
            cancellationToken);
    }

    private static Task WriteBillNotificationAsync(
        IInAppNotificationWriter notificationWriter,
        ExpenseBill bill,
        Guid recipientUserProfileId,
        Guid actorUserProfileId,
        string eventType,
        string priority,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        return notificationWriter.WriteAsync(
            new InAppNotificationWriteRequest(
                recipientUserProfileId,
                actorUserProfileId,
                eventType,
                priority,
                InAppNotificationSubjectTypes.ExpenseBill,
                TitleKey(eventType),
                MessageKey(eventType),
                now,
                ActionUrl: BillActionUrl(bill),
                GroupId: bill.GroupId,
                ExpenseBillId: bill.Id,
                ExpenseBillRevisionId: bill.ActiveAcceptedBillRevisionId),
            cancellationToken);
    }

    private static Guid? ResolveSettlementCounterparty(
        SettlementRequest settlementRequest,
        Guid actorUserProfileId)
    {
        if (actorUserProfileId == settlementRequest.DebtorUserProfileId)
        {
            return settlementRequest.CreditorUserProfileId;
        }

        if (actorUserProfileId == settlementRequest.CreditorUserProfileId)
        {
            return settlementRequest.DebtorUserProfileId;
        }

        return null;
    }

    private static string BillActionUrl(ExpenseBill bill)
    {
        return bill.GroupId.HasValue
            ? $"/api/v1/groups/{bill.GroupId.Value:D}/bills/{bill.Id:D}"
            : $"/api/v1/bills/{bill.Id:D}";
    }

    private static string ReceiptOcrReviewActionUrl(
        Guid expenseBillId,
        Guid? groupId,
        Guid receiptAttachmentFileId)
    {
        return groupId.HasValue
            ? $"/api/v1/groups/{groupId.Value:D}/bills/{expenseBillId:D}/attachments/{receiptAttachmentFileId:D}/ocr-review"
            : $"/api/v1/bills/{expenseBillId:D}/attachments/{receiptAttachmentFileId:D}/ocr-review";
    }

    private static string TitleKey(string eventType)
    {
        return $"notifications.{eventType}.title";
    }

    private static string MessageKey(string eventType)
    {
        return $"notifications.{eventType}.message";
    }
}
