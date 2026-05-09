namespace Settleora.Api.Domain.Expenses;

public static class ExpenseBillPayerConfirmationStatuses
{
    public const string PendingConfirmation = "pending_confirmation";
    public const string Confirmed = "confirmed";
    public const string Rejected = "rejected";

    private static readonly HashSet<string> SupportedValues =
    [
        PendingConfirmation,
        Confirmed,
        Rejected
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
