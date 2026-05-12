namespace Settleora.Api.Domain.Expenses;

public static class ReceiptOcrReviewConstraints
{
    public const int StatusMaxLength = 24;
    public const int SourceMaxLength = 32;
    public const int MerchantTextMaxLength = 200;
    public const int CurrencyMaxLength = 3;
    public const int LineTextMaxLength = 240;
    public const int MoneyAmountPrecision = 19;
    public const int MoneyAmountScale = 4;
    public const decimal MoneyAmountMaxValue = 999_999_999_999_999.9999m;
    public const int QuantityPrecision = 18;
    public const int QuantityScale = 4;
    public const decimal QuantityMaxValue = 999_999_999_999_999.9999m;
    public const int MaxLineCount = 100;
}
