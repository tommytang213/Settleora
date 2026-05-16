namespace Settleora.Api.Domain.Notifications;

public static class InAppNotificationSubjectTypes
{
    public const string ExpenseBill = "expense_bill";
    public const string SettlementRequest = "settlement_request";
    public const string SettlementPayment = "settlement_payment";
    public const string RecurringBillOccurrence = "recurring_bill_occurrence";

    private static readonly string[] SupportedValues =
    [
        ExpenseBill,
        SettlementRequest,
        SettlementPayment,
        RecurringBillOccurrence
    ];

    public static bool IsSupported(string? value)
    {
        return SupportedValues.Contains(value, StringComparer.Ordinal);
    }
}
