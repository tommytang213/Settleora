namespace Settleora.Api.Domain.Expenses;

public static class ReceiptOcrReviewApplyPreviewIssueCodes
{
    public const string UnsupportedReviewStatus = "unsupported_review_status";
    public const string UnsupportedReviewSource = "unsupported_review_source";
    public const string MissingCurrency = "missing_currency";
    public const string UnsupportedCurrency = "unsupported_currency";
    public const string CurrencyMismatch = "currency_mismatch";
    public const string MissingGrandTotal = "missing_grand_total";
    public const string EmptyLineSet = "empty_line_set";
    public const string LineTotalMissing = "line_total_missing";
    public const string UnsupportedLineState = "unsupported_line_state";
    public const string LineTotalMismatch = "line_total_mismatch";
    public const string LineSumMismatch = "line_sum_mismatch";
    public const string HeaderTotalMismatch = "header_total_mismatch";

    private static readonly HashSet<string> SupportedValues =
    [
        UnsupportedReviewStatus,
        UnsupportedReviewSource,
        MissingCurrency,
        UnsupportedCurrency,
        CurrencyMismatch,
        MissingGrandTotal,
        EmptyLineSet,
        LineTotalMissing,
        UnsupportedLineState,
        LineTotalMismatch,
        LineSumMismatch,
        HeaderTotalMismatch
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
