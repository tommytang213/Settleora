namespace Settleora.Api.Domain.Expenses;

public static class ExpenseBillReconciliationStatuses
{
    public const string Unreconciled = "unreconciled";
    public const string Reconciled = "reconciled";
    public const string Ignored = "ignored";

    private static readonly HashSet<string> SupportedValues =
    [
        Unreconciled,
        Reconciled,
        Ignored
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }

    public static IReadOnlyList<string> All { get; } =
    [
        Unreconciled,
        Reconciled,
        Ignored
    ];
}
