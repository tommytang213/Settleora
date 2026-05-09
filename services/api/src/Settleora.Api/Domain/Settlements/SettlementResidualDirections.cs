namespace Settleora.Api.Domain.Settlements;

public static class SettlementResidualDirections
{
    public const string Underpayment = "underpayment";
    public const string Overpayment = "overpayment";

    private static readonly HashSet<string> SupportedValues =
    [
        Underpayment,
        Overpayment
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
