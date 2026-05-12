using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.Expenses;

public sealed class ReceiptOcrReview
{
    public Guid Id { get; set; }

    public Guid ExpenseBillId { get; set; }

    public Guid FileObjectId { get; set; }

    public ExpenseBillAttachment Attachment { get; set; } = null!;

    public Guid CreatedByUserProfileId { get; set; }

    public UserProfile CreatedByUserProfile { get; set; } = null!;

    public Guid? GroupId { get; set; }

    public UserGroup? Group { get; set; }

    public string Status { get; set; } = ReceiptOcrReviewStatuses.Provisional;

    public string Source { get; set; } = ReceiptOcrReviewSources.OnDevice;

    public string? MerchantText { get; set; }

    public DateTimeOffset? ReceiptIssuedAtUtc { get; set; }

    public string? Currency { get; set; }

    public decimal? SubtotalAmount { get; set; }

    public decimal? TaxAmount { get; set; }

    public decimal? ServiceChargeAmount { get; set; }

    public decimal? DiscountAmount { get; set; }

    public decimal? GrandTotalAmount { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public DateTimeOffset? RemovedAtUtc { get; set; }

    public ICollection<ReceiptOcrReviewLine> Lines { get; } = new List<ReceiptOcrReviewLine>();
}
