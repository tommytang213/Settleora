namespace Settleora.Api.Domain.Finance;

public static class ManualFinanceConstraints
{
    public const int DisplayNameMaxLength = 120;
    public const int NoteMaxLength = 1000;
    public const int AccountTypeMaxLength = 32;
    public const int AccountStatusMaxLength = 32;
    public const int IncomeCadenceMaxLength = 32;
    public const int IncomeStatusMaxLength = 32;
    public const int CurrencyMaxLength = 3;
    public const int MoneyAmountPrecision = 19;
    public const int MoneyAmountScale = 4;
}
