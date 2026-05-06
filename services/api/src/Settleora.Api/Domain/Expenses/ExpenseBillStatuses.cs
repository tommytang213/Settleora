namespace Settleora.Api.Domain.Expenses;

public static class ExpenseBillStatuses
{
    public const string Draft = "draft";
    public const string PendingConfirmation = "pending_confirmation";
    public const string Confirmed = "confirmed";
    public const string Rejected = "rejected";
    public const string Cancelled = "cancelled";
    public const string Finalized = "finalized";
    public const string Archived = "archived";

    private static readonly HashSet<string> SupportedValues =
    [
        Draft,
        PendingConfirmation,
        Confirmed,
        Rejected,
        Cancelled,
        Finalized,
        Archived
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
