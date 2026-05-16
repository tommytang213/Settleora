namespace Settleora.Api.Domain.RecurringBills;

public static class RecurringBillOccurrenceStatuses
{
    public const string Forecasted = "forecasted";
    public const string DraftGenerated = "draft_generated";
    public const string Skipped = "skipped";
    public const string Cancelled = "cancelled";

    private static readonly HashSet<string> SupportedValues =
    [
        Forecasted,
        DraftGenerated,
        Skipped,
        Cancelled
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
