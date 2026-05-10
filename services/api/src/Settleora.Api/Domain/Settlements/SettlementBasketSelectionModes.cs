namespace Settleora.Api.Domain.Settlements;

public static class SettlementBasketSelectionModes
{
    public const string PayAllOutstandingForCounterparty = "pay_all_outstanding_for_counterparty";

    private static readonly HashSet<string> SupportedValues =
    [
        PayAllOutstandingForCounterparty
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
