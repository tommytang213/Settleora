namespace Settleora.Api.Money;

internal sealed class MoneyValidationResult
{
    private MoneyValidationResult(
        MoneyValidationFailureReason failureReason,
        string field,
        string message)
    {
        FailureReason = failureReason;
        Field = field;
        Message = message;
    }

    public bool Succeeded => FailureReason is MoneyValidationFailureReason.None;

    public MoneyValidationFailureReason FailureReason { get; }

    public string Field { get; }

    public string Message { get; }

    public string Code => GetCode(FailureReason);

    public static MoneyValidationResult Valid()
    {
        return new MoneyValidationResult(
            MoneyValidationFailureReason.None,
            field: string.Empty,
            message: string.Empty);
    }

    public static MoneyValidationResult Failed(
        MoneyValidationFailureReason failureReason,
        string field,
        string message)
    {
        if (failureReason is MoneyValidationFailureReason.None)
        {
            throw new ArgumentException(
                "Successful money validation results must be created with Valid().",
                nameof(failureReason));
        }

        return new MoneyValidationResult(failureReason, field, message);
    }

    public override string ToString()
    {
        return $"MoneyValidationResult {{ Code = {Code}, Field = {Field} }}";
    }

    private static string GetCode(MoneyValidationFailureReason failureReason)
    {
        return failureReason switch
        {
            MoneyValidationFailureReason.None => "valid",
            MoneyValidationFailureReason.InvalidCurrencyFormat => "invalid_currency_format",
            MoneyValidationFailureReason.UnsupportedCurrency => "unsupported_currency",
            MoneyValidationFailureReason.InvalidDecimalFormat => "invalid_decimal_format",
            MoneyValidationFailureReason.AmountOutOfRange => "amount_out_of_range",
            MoneyValidationFailureReason.TooManyFractionalDigits => "too_many_fractional_digits",
            MoneyValidationFailureReason.NegativeAmountNotAllowed => "negative_amount_not_allowed",
            MoneyValidationFailureReason.ZeroAmountNotAllowed => "zero_amount_not_allowed",
            MoneyValidationFailureReason.CurrencyMismatch => "currency_mismatch",
            MoneyValidationFailureReason.InvalidSplitParticipant => "invalid_split_participant",
            MoneyValidationFailureReason.InvalidSplitWeight => "invalid_split_weight",
            MoneyValidationFailureReason.CustomSplitTotalMismatch => "custom_split_total_mismatch",
            _ => "invalid_money"
        };
    }
}
