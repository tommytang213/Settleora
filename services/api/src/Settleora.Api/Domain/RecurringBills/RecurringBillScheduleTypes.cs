namespace Settleora.Api.Domain.RecurringBills;

public static class RecurringBillScheduleTypes
{
    public const string Weekly = "weekly";
    public const string Monthly = "monthly";
    public const string Yearly = "yearly";
    public const string CustomIntervalDays = "custom_interval_days";

    private static readonly HashSet<string> SupportedValues =
    [
        Weekly,
        Monthly,
        Yearly,
        CustomIntervalDays
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
