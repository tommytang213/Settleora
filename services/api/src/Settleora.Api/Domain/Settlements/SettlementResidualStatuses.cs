namespace Settleora.Api.Domain.Settlements;

public static class SettlementResidualStatuses
{
    public const string PendingReceiverConfirmation = "pending_receiver_confirmation";
    public const string Confirmed = "confirmed";
    public const string CarriedForward = "carried_forward";
    public const string Waived = "waived";
    public const string Credited = "credited";
    public const string Disputed = "disputed";
    public const string Cancelled = "cancelled";

    private static readonly HashSet<string> SupportedValues =
    [
        PendingReceiverConfirmation,
        Confirmed,
        CarriedForward,
        Waived,
        Credited,
        Disputed,
        Cancelled
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
