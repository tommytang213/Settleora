namespace Settleora.Api.Domain.Expenses;

public static class ExpenseBillAttachmentPurposes
{
    public const string Receipt = "receipt";
    public const string SupportingAttachment = "supporting_attachment";

    private static readonly HashSet<string> SupportedValues =
    [
        Receipt,
        SupportingAttachment
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
