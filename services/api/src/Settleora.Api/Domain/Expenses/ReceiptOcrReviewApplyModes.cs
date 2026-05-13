namespace Settleora.Api.Domain.Expenses;

public static class ReceiptOcrReviewApplyModes
{
    public const string ReplaceDraftOcrItems = "replace_draft_ocr_items";

    public static bool IsSupported(string? value)
    {
        return value is ReplaceDraftOcrItems;
    }
}
