namespace Settleora.Api.Domain.Settlements;

public static class SettlementRequestLineStatuses
{
    public const string Open = "open";
    public const string PartiallyCleared = "partially_cleared";
    public const string Cleared = "cleared";
    public const string Waived = "waived";
    public const string Disputed = "disputed";
    public const string Cancelled = "cancelled";

    private static readonly HashSet<string> SupportedValues =
    [
        Open,
        PartiallyCleared,
        Cleared,
        Waived,
        Disputed,
        Cancelled
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
