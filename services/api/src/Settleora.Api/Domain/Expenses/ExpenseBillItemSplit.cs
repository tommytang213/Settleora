using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.Expenses;

public sealed class ExpenseBillItemSplit
{
    public Guid Id { get; set; }

    public Guid ExpenseBillItemId { get; set; }

    public ExpenseBillItem ExpenseBillItem { get; set; } = null!;

    public Guid UserProfileId { get; set; }

    public UserProfile UserProfile { get; set; } = null!;

    public string SplitMethod { get; set; } = ExpenseBillItemSplitMethods.Equal;

    public decimal? BasisValue { get; set; }

    public decimal ResolvedAmount { get; set; }

    public string ResolvedCurrency { get; set; } = string.Empty;

    public int AllocationOrder { get; set; }

    public bool ReceivedResidualMinorUnit { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }
}
