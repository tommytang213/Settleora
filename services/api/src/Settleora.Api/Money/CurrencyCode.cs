namespace Settleora.Api.Money;

internal sealed record CurrencyCode
{
    public const int Length = 3;

    private CurrencyCode(string value)
    {
        Value = value;
    }

    public string Value { get; }

    public static bool TryCreate(string? value, out CurrencyCode currencyCode)
    {
        currencyCode = default!;
        if (value is not { Length: Length })
        {
            return false;
        }

        foreach (var character in value)
        {
            if (character is < 'A' or > 'Z')
            {
                return false;
            }
        }

        currencyCode = new CurrencyCode(value);
        return true;
    }

    public override string ToString()
    {
        return Value;
    }
}
