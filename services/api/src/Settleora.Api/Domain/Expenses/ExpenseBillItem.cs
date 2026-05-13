namespace Settleora.Api.Domain.Expenses;

public sealed class ExpenseBillItem
{
    public Guid Id { get; set; }

    public Guid ExpenseBillId { get; set; }

    public ExpenseBill ExpenseBill { get; set; } = null!;

    public string Name { get; set; } = string.Empty;

    public string? Note { get; set; }

    public decimal? Quantity { get; set; }

    public decimal Amount { get; set; }

    public string Currency { get; set; } = string.Empty;

    public int SortOrder { get; set; }

    public string? SourceKind { get; set; }

    public Guid? SourceReceiptOcrReviewId { get; set; }

    public Guid? SourceReceiptOcrReviewLineId { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public DateTimeOffset? DeletedAtUtc { get; set; }

    public ICollection<ExpenseBillItemSplit> Splits { get; } = new List<ExpenseBillItemSplit>();
}
