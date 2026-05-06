namespace Settleora.Api.Domain.Expenses;

public static class ExpenseBillAdjustmentTypes
{
    public const string Tax = "tax";
    public const string ServiceCharge = "service_charge";
    public const string Discount = "discount";
    public const string ManualAdjustment = "manual_adjustment";
    public const string Credit = "credit";

    private static readonly HashSet<string> SupportedValues =
    [
        Tax,
        ServiceCharge,
        Discount,
        ManualAdjustment,
        Credit
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
