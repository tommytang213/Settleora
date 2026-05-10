namespace Settleora.Api.Domain.Settlements;

public static class SettlementBalanceDirections
{
    public const string Incoming = "incoming";
    public const string Outgoing = "outgoing";

    private static readonly HashSet<string> SupportedValues =
    [
        Incoming,
        Outgoing
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
