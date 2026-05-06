namespace Settleora.Api.Domain.Expenses;

public static class ExpenseBillParticipantStatuses
{
    public const string PendingAcceptance = "pending_acceptance";
    public const string Accepted = "accepted";
    public const string Rejected = "rejected";
    public const string PartiallySettled = "partially_settled";
    public const string Settled = "settled";
    public const string Waived = "waived";
    public const string ClaimedPaid = "claimed_paid";
    public const string ConfirmedPaid = "confirmed_paid";

    private static readonly HashSet<string> SupportedValues =
    [
        PendingAcceptance,
        Accepted,
        Rejected,
        PartiallySettled,
        Settled,
        Waived,
        ClaimedPaid,
        ConfirmedPaid
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
