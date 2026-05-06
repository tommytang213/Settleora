using System.Globalization;

namespace Settleora.Api.Money;

internal sealed record MoneyAmount(decimal Amount, CurrencyCode Currency)
{
    public const int StorageScale = 4;
    public const decimal MaxAbsStorageAmount = 999_999_999_999_999.9999m;

    public static MoneyValidationResult TryParse(
        string? submittedAmount,
        string? submittedCurrency,
        MoneyValidationOptions options,
        SupportedCurrencyPolicy supportedCurrencies,
        out MoneyAmount moneyAmount)
    {
        moneyAmount = default!;
        if (!CurrencyCode.TryCreate(submittedCurrency, out var currency))
        {
            return MoneyValidationResult.Failed(
                MoneyValidationFailureReason.InvalidCurrencyFormat,
                options.CurrencyField,
                "Currency must be an uppercase three-letter code.");
        }

        return TryParse(
            submittedAmount,
            currency,
            options,
            supportedCurrencies,
            out moneyAmount);
    }

    public static MoneyValidationResult TryParse(
        string? submittedAmount,
        CurrencyCode currency,
        MoneyValidationOptions options,
        SupportedCurrencyPolicy supportedCurrencies,
        out MoneyAmount moneyAmount)
    {
        moneyAmount = default!;
        if (string.IsNullOrEmpty(submittedAmount) || !IsPlainDecimalString(submittedAmount))
        {
            return MoneyValidationResult.Failed(
                MoneyValidationFailureReason.InvalidDecimalFormat,
                options.AmountField,
                "Amount must be a plain base-10 decimal string.");
        }

        var fractionalDigits = GetSubmittedFractionalDigitCount(submittedAmount);
        if (!decimal.TryParse(
            submittedAmount,
            NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint,
            CultureInfo.InvariantCulture,
            out var parsedAmount))
        {
            return MoneyValidationResult.Failed(
                MoneyValidationFailureReason.AmountOutOfRange,
                options.AmountField,
                "Amount exceeds the supported storage range.");
        }

        return TryCreate(
            parsedAmount,
            currency,
            options,
            supportedCurrencies,
            fractionalDigits,
            out moneyAmount);
    }

    public static MoneyValidationResult TryCreate(
        decimal amount,
        CurrencyCode currency,
        MoneyValidationOptions options,
        SupportedCurrencyPolicy supportedCurrencies,
        out MoneyAmount moneyAmount)
    {
        return TryCreate(
            amount,
            currency,
            options,
            supportedCurrencies,
            GetFractionalDigitCount(amount),
            out moneyAmount);
    }

    public static int GetFractionalDigitCount(decimal amount)
    {
        return (decimal.GetBits(amount)[3] >> 16) & 0x7F;
    }

    private static MoneyValidationResult TryCreate(
        decimal amount,
        CurrencyCode currency,
        MoneyValidationOptions options,
        SupportedCurrencyPolicy supportedCurrencies,
        int fractionalDigits,
        out MoneyAmount moneyAmount)
    {
        moneyAmount = default!;
        var validationResult = Validate(
            amount,
            currency,
            options,
            supportedCurrencies,
            fractionalDigits);
        if (!validationResult.Succeeded)
        {
            return validationResult;
        }

        moneyAmount = new MoneyAmount(amount, currency);
        return MoneyValidationResult.Valid();
    }

    private static MoneyValidationResult Validate(
        decimal amount,
        CurrencyCode currency,
        MoneyValidationOptions options,
        SupportedCurrencyPolicy supportedCurrencies,
        int fractionalDigits)
    {
        if (options.RequireSupportedCurrency && !supportedCurrencies.IsSupported(currency))
        {
            return MoneyValidationResult.Failed(
                MoneyValidationFailureReason.UnsupportedCurrency,
                options.CurrencyField,
                "Currency is not supported for this operation.");
        }

        if (!options.AllowNegative && amount < 0)
        {
            return MoneyValidationResult.Failed(
                MoneyValidationFailureReason.NegativeAmountNotAllowed,
                options.AmountField,
                "Negative amount is not allowed for this operation.");
        }

        if (!options.AllowZero && amount == 0)
        {
            return MoneyValidationResult.Failed(
                MoneyValidationFailureReason.ZeroAmountNotAllowed,
                options.AmountField,
                "Zero amount is not allowed for this operation.");
        }

        if (decimal.Abs(amount) > MaxAbsStorageAmount)
        {
            return MoneyValidationResult.Failed(
                MoneyValidationFailureReason.AmountOutOfRange,
                options.AmountField,
                "Amount exceeds the supported storage range.");
        }

        if (options.MaxFractionalDigits is { } maxFractionalDigits &&
            fractionalDigits > maxFractionalDigits)
        {
            return MoneyValidationResult.Failed(
                MoneyValidationFailureReason.TooManyFractionalDigits,
                options.AmountField,
                "Amount has too many fractional digits for this operation.");
        }

        if (options.RequireStoragePrecisionScale && fractionalDigits > StorageScale)
        {
            return MoneyValidationResult.Failed(
                MoneyValidationFailureReason.TooManyFractionalDigits,
                options.AmountField,
                "Amount exceeds the supported storage scale.");
        }

        return MoneyValidationResult.Valid();
    }

    private static bool IsPlainDecimalString(string value)
    {
        var index = 0;
        if (value[0] is '-')
        {
            index = 1;
            if (index == value.Length)
            {
                return false;
            }
        }

        var integerDigits = 0;
        var fractionalDigits = 0;
        var decimalPointSeen = false;

        for (; index < value.Length; index++)
        {
            var character = value[index];
            if (character is >= '0' and <= '9')
            {
                if (decimalPointSeen)
                {
                    fractionalDigits++;
                }
                else
                {
                    integerDigits++;
                }

                continue;
            }

            if (character is '.' && !decimalPointSeen)
            {
                decimalPointSeen = true;
                continue;
            }

            return false;
        }

        return integerDigits > 0 && (!decimalPointSeen || fractionalDigits > 0);
    }

    private static int GetSubmittedFractionalDigitCount(string submittedAmount)
    {
        var decimalPointIndex = submittedAmount.IndexOf('.', StringComparison.Ordinal);
        return decimalPointIndex < 0 ? 0 : submittedAmount.Length - decimalPointIndex - 1;
    }
}
