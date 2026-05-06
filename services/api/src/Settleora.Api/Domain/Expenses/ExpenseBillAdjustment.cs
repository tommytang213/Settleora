namespace Settleora.Api.Domain.Expenses;

public sealed class ExpenseBillAdjustment
{
    public Guid Id { get; set; }

    public Guid ExpenseBillId { get; set; }

    public ExpenseBill ExpenseBill { get; set; } = null!;

    public string Type { get; set; } = ExpenseBillAdjustmentTypes.ManualAdjustment;

    public string Direction { get; set; } = ExpenseBillAdjustmentDirections.Charge;

    public string AllocationMethod { get; set; } = ExpenseBillAdjustmentAllocationMethods.Equal;

    public decimal Amount { get; set; }

    public string Currency { get; set; } = string.Empty;

    public string? ReasonNote { get; set; }

    public int SortOrder { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }
}
