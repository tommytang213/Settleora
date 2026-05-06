namespace Settleora.Api.Money;

internal enum MoneyValidationFailureReason
{
    None = 0,
    InvalidCurrencyFormat,
    UnsupportedCurrency,
    InvalidDecimalFormat,
    AmountOutOfRange,
    TooManyFractionalDigits,
    NegativeAmountNotAllowed,
    ZeroAmountNotAllowed,
    CurrencyMismatch,
    InvalidSplitParticipant,
    InvalidSplitWeight,
    CustomSplitTotalMismatch
}
