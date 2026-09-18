namespace Settleora.Api.Domain.Expenses;

public static class ReceiptOcrReviewAdjustmentKinds
{
    public const string Tip = "tip";
    public const string Shipping = "shipping";
    public const string Fee = "fee";
    public const string Surcharge = "surcharge";
    public const string Deposit = "deposit";
    public const string Credit = "credit";
    public const string Other = "other";

    private static readonly HashSet<string> SupportedValues =
    [
        Tip,
        Shipping,
        Fee,
        Surcharge,
        Deposit,
        Credit,
        Other
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
