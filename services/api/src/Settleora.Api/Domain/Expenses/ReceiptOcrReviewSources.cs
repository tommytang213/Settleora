namespace Settleora.Api.Domain.Expenses;

public static class ReceiptOcrReviewSources
{
    public const string OnDevice = "on_device";
    public const string ManualEntry = "manual_entry";
    public const string ImportedReviewedData = "imported_reviewed_data";

    private static readonly HashSet<string> SupportedValues =
    [
        OnDevice,
        ManualEntry,
        ImportedReviewedData
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
