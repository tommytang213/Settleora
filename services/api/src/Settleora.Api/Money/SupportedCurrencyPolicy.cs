namespace Settleora.Api.Money;

internal sealed class SupportedCurrencyPolicy
{
    private static readonly IReadOnlyDictionary<string, int> SupportedMinorUnitDigits =
        new Dictionary<string, int>(StringComparer.Ordinal)
        {
            ["HKD"] = 2,
            ["USD"] = 2,
            ["EUR"] = 2,
            ["GBP"] = 2,
            ["JPY"] = 0,
            ["KWD"] = 3,
            ["BHD"] = 3
        };

    public static SupportedCurrencyPolicy Default { get; } = new();

    public bool IsSupported(CurrencyCode currencyCode)
    {
        return SupportedMinorUnitDigits.ContainsKey(currencyCode.Value);
    }

    public bool TryGetMinorUnitDigits(
        CurrencyCode currencyCode,
        out int minorUnitDigits)
    {
        return SupportedMinorUnitDigits.TryGetValue(currencyCode.Value, out minorUnitDigits);
    }

    public MoneyValidationResult ValidateSupported(CurrencyCode currencyCode, string field = "currency")
    {
        if (IsSupported(currencyCode))
        {
            return MoneyValidationResult.Valid();
        }

        return MoneyValidationResult.Failed(
            MoneyValidationFailureReason.UnsupportedCurrency,
            field,
            "Currency is not supported for this operation.");
    }
}
