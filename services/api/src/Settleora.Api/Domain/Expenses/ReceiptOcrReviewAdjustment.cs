namespace Settleora.Api.Domain.Expenses;

public sealed class ReceiptOcrReviewAdjustment
{
    public Guid Id { get; set; }

    public Guid ReceiptOcrReviewId { get; set; }

    public ReceiptOcrReview ReceiptOcrReview { get; set; } = null!;

    public int SortOrder { get; set; }

    public string Kind { get; set; } = ReceiptOcrReviewAdjustmentKinds.Other;

    public string OriginalLabel { get; set; } = string.Empty;

    public decimal Amount { get; set; }

    public string Currency { get; set; } = string.Empty;

    public string Direction { get; set; } = ReceiptOcrReviewAdjustmentDirections.Charge;

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }
}
