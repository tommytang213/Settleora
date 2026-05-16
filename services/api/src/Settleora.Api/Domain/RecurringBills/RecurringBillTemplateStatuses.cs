namespace Settleora.Api.Domain.RecurringBills;

public static class RecurringBillTemplateStatuses
{
    public const string Active = "active";
    public const string Paused = "paused";
    public const string Archived = "archived";

    private static readonly HashSet<string> SupportedValues =
    [
        Active,
        Paused,
        Archived
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
