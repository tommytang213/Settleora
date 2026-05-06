namespace Settleora.Api.Domain.Expenses;

public static class ExpenseBillItemSplitMethods
{
    public const string Equal = "equal";
    public const string ExactAmount = "exact_amount";
    public const string Percentage = "percentage";
    public const string Ratio = "ratio";
    public const string ShareWeight = "share_weight";

    private static readonly HashSet<string> SupportedValues =
    [
        Equal,
        ExactAmount,
        Percentage,
        Ratio,
        ShareWeight
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
