namespace Settleora.Api.Domain.Finance;

public static class ManualIncomeCadences
{
    public const string OneTime = "one_time";
    public const string Weekly = "weekly";
    public const string Biweekly = "biweekly";
    public const string Monthly = "monthly";
    public const string Quarterly = "quarterly";
    public const string Yearly = "yearly";

    private static readonly HashSet<string> SupportedValues =
    [
        OneTime,
        Weekly,
        Biweekly,
        Monthly,
        Quarterly,
        Yearly
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
