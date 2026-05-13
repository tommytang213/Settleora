namespace Settleora.Api.Domain.Expenses;

public static class ExpenseBillItemSourceKinds
{
    public const string ReceiptOcrReviewApply = "receipt_ocr_review_apply";

    private static readonly HashSet<string> SupportedValues =
    [
        ReceiptOcrReviewApply
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
