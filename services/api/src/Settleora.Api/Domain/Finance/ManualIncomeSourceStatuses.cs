namespace Settleora.Api.Domain.Finance;

public static class ManualIncomeSourceStatuses
{
    public const string Active = "active";
    public const string Archived = "archived";

    private static readonly HashSet<string> SupportedValues =
    [
        Active,
        Archived
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
