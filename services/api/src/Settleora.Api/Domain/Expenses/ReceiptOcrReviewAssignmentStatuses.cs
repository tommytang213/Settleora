namespace Settleora.Api.Domain.Expenses;

public static class ReceiptOcrReviewAssignmentStatuses
{
    public const string NeedsReview = "needs_review";
    public const string Reviewed = "reviewed";
    public const string Cancelled = "cancelled";
    public const string Superseded = "superseded";

    private static readonly HashSet<string> SupportedValues =
    [
        NeedsReview,
        Reviewed,
        Cancelled,
        Superseded
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
