namespace Settleora.Api.Domain.Settlements;

public static class SettlementRequestStatuses
{
    public const string Requested = "requested";
    public const string PartiallyPaid = "partially_paid";
    public const string MarkedPaid = "marked_paid";
    public const string Confirmed = "confirmed";
    public const string Disputed = "disputed";
    public const string Cancelled = "cancelled";

    private static readonly HashSet<string> SupportedValues =
    [
        Requested,
        PartiallyPaid,
        MarkedPaid,
        Confirmed,
        Disputed,
        Cancelled
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
