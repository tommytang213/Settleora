namespace Settleora.Api.Money;

internal sealed record MoneyValidationOptions
{
    public static MoneyValidationOptions Default { get; } = new();

    public bool AllowNegative { get; init; }

    public bool AllowZero { get; init; } = true;

    public int? MaxFractionalDigits { get; init; } = MoneyAmount.StorageScale;

    public bool RequireSupportedCurrency { get; init; } = true;

    public bool RequireStoragePrecisionScale { get; init; } = true;

    public string AmountField { get; init; } = "amount";

    public string CurrencyField { get; init; } = "currency";
}
