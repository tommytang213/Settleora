namespace Settleora.Api.Domain.Expenses;

public static class ExpenseBillRevisionStatuses
{
    public const string DraftRevision = "draft_revision";
    public const string SubmittedForReview = "submitted_for_review";
    public const string WithdrawnByProposer = "withdrawn_by_proposer";
    public const string SupersededByResubmission = "superseded_by_resubmission";
    public const string Rejected = "rejected";
    public const string AcceptedApplied = "accepted_applied";
    public const string CancelledByAuthorizedEditor = "cancelled_by_authorized_editor";

    private static readonly HashSet<string> SupportedValues =
    [
        DraftRevision,
        SubmittedForReview,
        WithdrawnByProposer,
        SupersededByResubmission,
        Rejected,
        AcceptedApplied,
        CancelledByAuthorizedEditor
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }

    public static bool IsActivePending(string? value)
    {
        return value is DraftRevision or SubmittedForReview;
    }
}
