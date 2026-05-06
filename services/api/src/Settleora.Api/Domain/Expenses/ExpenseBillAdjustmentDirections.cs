namespace Settleora.Api.Domain.Expenses;

public static class ExpenseBillAdjustmentDirections
{
    public const string Charge = "charge";
    public const string Credit = "credit";

    private static readonly HashSet<string> SupportedValues =
    [
        Charge,
        Credit
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
