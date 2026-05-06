namespace Settleora.Api.Domain.Expenses;

public static class ExpenseBillAdjustmentAllocationMethods
{
    public const string Equal = "equal";
    public const string ProportionalByItemSubtotal = "proportional_by_item_subtotal";
    public const string Manual = "manual";

    private static readonly HashSet<string> SupportedValues =
    [
        Equal,
        ProportionalByItemSubtotal,
        Manual
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
