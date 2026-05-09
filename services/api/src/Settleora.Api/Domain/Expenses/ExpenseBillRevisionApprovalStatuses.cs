namespace Settleora.Api.Domain.Expenses;

public static class ExpenseBillRevisionApprovalStatuses
{
    public const string PendingReview = "pending_review";
    public const string Approved = "approved";
    public const string Rejected = "rejected";
    public const string InvalidatedBySupersession = "invalidated_by_supersession";

    private static readonly HashSet<string> SupportedValues =
    [
        PendingReview,
        Approved,
        Rejected,
        InvalidatedBySupersession
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
