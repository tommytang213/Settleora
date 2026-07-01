namespace Settleora.Api.Notifications;

internal static class PushNotificationPayloadBuilder
{
    private const string DefaultTitle = "Settleora";
    private const string DefaultBody = "Open Settleora to view this notification.";

    public static PushNotificationPayload Build(PushNotificationSendRequest request)
    {
        var reference = ResolveSafeReference(request);
        return new PushNotificationPayload(
            DefaultTitle,
            DefaultBody,
            request.EventType,
            request.SubjectType,
            reference.Type,
            reference.Id,
            request.InAppNotificationId);
    }

    private static (string Type, string Id) ResolveSafeReference(PushNotificationSendRequest request)
    {
        if (request.InAppNotificationId is { } inAppNotificationId)
        {
            return ("in_app_notification", inAppNotificationId.ToString());
        }

        if (request.ExpenseBillId is { } expenseBillId)
        {
            return ("expense_bill", expenseBillId.ToString());
        }

        if (request.ExpenseBillRevisionId is { } expenseBillRevisionId)
        {
            return ("expense_bill_revision", expenseBillRevisionId.ToString());
        }

        if (request.SettlementRequestId is { } settlementRequestId)
        {
            return ("settlement_request", settlementRequestId.ToString());
        }

        if (request.SettlementPaymentId is { } settlementPaymentId)
        {
            return ("settlement_payment", settlementPaymentId.ToString());
        }

        if (request.RecurringBillOccurrenceId is { } recurringBillOccurrenceId)
        {
            return ("recurring_bill_occurrence", recurringBillOccurrenceId.ToString());
        }

        if (request.RecurringBillTemplateId is { } recurringBillTemplateId)
        {
            return ("recurring_bill_template", recurringBillTemplateId.ToString());
        }

        if (request.ReceiptOcrReviewId is { } receiptOcrReviewId)
        {
            return ("receipt_ocr_review", receiptOcrReviewId.ToString());
        }

        if (request.SyncOperationId is { } syncOperationId)
        {
            return ("sync_operation", syncOperationId.ToString());
        }

        if (request.GroupId is { } groupId)
        {
            return ("group", groupId.ToString());
        }

        return ("notification", "available-in-app");
    }
}
