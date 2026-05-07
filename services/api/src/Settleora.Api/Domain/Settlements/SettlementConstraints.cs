namespace Settleora.Api.Domain.Settlements;

public static class SettlementConstraints
{
    public const int RequestStatusMaxLength = 32;
    public const int PaymentStatusMaxLength = 32;
    public const int NoteMaxLength = 1000;
    public const int CurrencyMaxLength = 3;
    public const int MoneyAmountPrecision = 19;
    public const int MoneyAmountScale = 4;
    public const decimal MoneyAmountMaxValue = 999999999999999.9999m;
}
