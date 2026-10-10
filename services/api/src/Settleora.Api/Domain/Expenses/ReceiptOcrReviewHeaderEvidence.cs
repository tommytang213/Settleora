namespace Settleora.Api.Domain.Expenses;

public sealed class ReceiptOcrReviewHeaderEvidence
{
    public Guid Id { get; set; }
    public Guid ReceiptOcrReviewId { get; set; }
    public ReceiptOcrReview ReceiptOcrReview { get; set; } = null!;
    public string Role { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string Currency { get; set; } = string.Empty;
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset UpdatedAtUtc { get; set; }
}
