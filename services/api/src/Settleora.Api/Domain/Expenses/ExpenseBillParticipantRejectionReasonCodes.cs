namespace Settleora.Api.Domain.Expenses;

public static class ExpenseBillParticipantRejectionReasonCodes
{
    public const string WrongAmount = "wrong_amount";
    public const string WrongItems = "wrong_items";
    public const string WrongSplit = "wrong_split";
    public const string Duplicate = "duplicate";
    public const string NotMine = "not_mine";
    public const string Other = "other";

    private static readonly HashSet<string> SupportedValues =
    [
        WrongAmount,
        WrongItems,
        WrongSplit,
        Duplicate,
        NotMine,
        Other
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
