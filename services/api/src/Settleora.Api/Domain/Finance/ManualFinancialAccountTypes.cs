namespace Settleora.Api.Domain.Finance;

public static class ManualFinancialAccountTypes
{
    public const string Cash = "cash";
    public const string BankAccount = "bank_account";
    public const string StoredValue = "stored_value";
    public const string Other = "other";

    private static readonly HashSet<string> SupportedValues =
    [
        Cash,
        BankAccount,
        StoredValue,
        Other
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
