namespace Settleora.Api.Domain.Expenses;

public sealed class ReceiptOcrReviewLine
{
    public Guid Id { get; set; }

    public Guid ReceiptOcrReviewId { get; set; }

    public ReceiptOcrReview ReceiptOcrReview { get; set; } = null!;

    public int SortOrder { get; set; }

    public string Text { get; set; } = string.Empty;

    public decimal? Quantity { get; set; }

    public decimal? UnitPriceAmount { get; set; }

    public decimal? LineTotalAmount { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }
}
