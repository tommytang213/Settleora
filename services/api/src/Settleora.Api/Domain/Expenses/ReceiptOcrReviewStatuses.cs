namespace Settleora.Api.Domain.Expenses;

public static class ReceiptOcrReviewStatuses
{
    public const string Provisional = "provisional";
    public const string Reviewed = "reviewed";

    private static readonly HashSet<string> SupportedValues =
    [
        Provisional,
        Reviewed
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
