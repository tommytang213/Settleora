namespace Settleora.Api.Money;

internal sealed class MoneyRoundingService
{
    private readonly SupportedCurrencyPolicy supportedCurrencies;

    public MoneyRoundingService()
        : this(SupportedCurrencyPolicy.Default)
    {
    }

    public MoneyRoundingService(SupportedCurrencyPolicy supportedCurrencies)
    {
        this.supportedCurrencies = supportedCurrencies;
    }

    public decimal Round(
        decimal amount,
        int fractionalDigits,
        MoneyRoundingMode roundingMode)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(fractionalDigits);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(fractionalDigits, 28);

        return roundingMode switch
        {
            MoneyRoundingMode.NearestToEven => decimal.Round(
                amount,
                fractionalDigits,
                MidpointRounding.ToEven),
            MoneyRoundingMode.RoundUp => RoundUp(amount, fractionalDigits),
            MoneyRoundingMode.RoundDown => RoundDown(amount, fractionalDigits),
            _ => throw new ArgumentOutOfRangeException(nameof(roundingMode), roundingMode, "Unsupported rounding mode.")
        };
    }

    public MoneyAmount RoundToCurrencyMinorUnits(
        MoneyAmount amount,
        MoneyRoundingMode roundingMode = MoneyRoundingMode.NearestToEven)
    {
        if (!TryRoundToCurrencyMinorUnits(
            amount,
            roundingMode,
            out var roundedAmount,
            out var validationResult))
        {
            if (validationResult.FailureReason is MoneyValidationFailureReason.UnsupportedCurrency)
            {
                throw new ArgumentException("Currency is not supported for rounding.", nameof(amount));
            }

            throw new ArgumentOutOfRangeException(nameof(amount), "Amount exceeds the supported storage range.");
        }

        return roundedAmount;
    }

    public bool TryRoundToCurrencyMinorUnits(
        MoneyAmount amount,
        MoneyRoundingMode roundingMode,
        out MoneyAmount roundedAmount,
        out MoneyValidationResult validationResult)
    {
        roundedAmount = default!;
        if (!supportedCurrencies.TryGetMinorUnitDigits(amount.Currency, out var minorUnitDigits))
        {
            validationResult = MoneyValidationResult.Failed(
                MoneyValidationFailureReason.UnsupportedCurrency,
                "currency",
                "Currency is not supported for this operation.");
            return false;
        }

        if (ExceedsStorageBounds(amount.Amount))
        {
            validationResult = MoneyValidationResult.Failed(
                MoneyValidationFailureReason.AmountOutOfRange,
                "amount",
                "Amount exceeds the supported storage range.");
            return false;
        }

        var roundedValue = Round(amount.Amount, minorUnitDigits, roundingMode);
        if (ExceedsStorageBounds(roundedValue))
        {
            validationResult = MoneyValidationResult.Failed(
                MoneyValidationFailureReason.AmountOutOfRange,
                "amount",
                "Amount exceeds the supported storage range.");
            return false;
        }

        roundedAmount = new MoneyAmount(roundedValue, amount.Currency);
        validationResult = MoneyValidationResult.Valid();
        return true;
    }

    public MoneyAmount RoundToStorageScale(
        MoneyAmount amount,
        MoneyRoundingMode roundingMode = MoneyRoundingMode.NearestToEven)
    {
        return new MoneyAmount(
            Round(amount.Amount, MoneyAmount.StorageScale, roundingMode),
            amount.Currency);
    }

    public static decimal GetScaleFactor(int fractionalDigits)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(fractionalDigits);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(fractionalDigits, 28);

        var scaleFactor = 1m;
        for (var index = 0; index < fractionalDigits; index++)
        {
            scaleFactor *= 10m;
        }

        return scaleFactor;
    }

    private static decimal RoundUp(decimal amount, int fractionalDigits)
    {
        var scaleFactor = GetScaleFactor(fractionalDigits);
        return decimal.Ceiling(amount * scaleFactor) / scaleFactor;
    }

    private static decimal RoundDown(decimal amount, int fractionalDigits)
    {
        var scaleFactor = GetScaleFactor(fractionalDigits);
        return decimal.Floor(amount * scaleFactor) / scaleFactor;
    }

    private static bool ExceedsStorageBounds(decimal amount)
    {
        return amount < -MoneyAmount.MaxAbsStorageAmount ||
            amount > MoneyAmount.MaxAbsStorageAmount;
    }
}
