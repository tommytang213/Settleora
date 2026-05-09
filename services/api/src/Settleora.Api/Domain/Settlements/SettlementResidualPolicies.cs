namespace Settleora.Api.Domain.Settlements;

public static class SettlementResidualPolicies
{
    public const string RemainingBalance = "remaining_balance";
    public const string CarriedForward = "carried_forward";
    public const string Waived = "waived";
    public const string CreditForward = "credit_forward";
    public const string WaivedByPayer = "waived_by_payer";
    public const string AppliedToOtherLine = "applied_to_other_line";

    private static readonly HashSet<string> SupportedValues =
    [
        RemainingBalance,
        CarriedForward,
        Waived,
        CreditForward,
        WaivedByPayer,
        AppliedToOtherLine
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
