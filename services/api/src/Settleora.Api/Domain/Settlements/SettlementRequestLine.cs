using Settleora.Api.Domain.Expenses;

namespace Settleora.Api.Domain.Settlements;

public sealed class SettlementRequestLine
{
    public Guid Id { get; set; }

    public Guid SettlementRequestId { get; set; }

    public SettlementRequest SettlementRequest { get; set; } = null!;

    public Guid SourceExpenseBillId { get; set; }

    public ExpenseBill SourceExpenseBill { get; set; } = null!;

    public string? SourceCandidateKey { get; set; }

    public decimal ExactAmount { get; set; }

    public string Currency { get; set; } = string.Empty;

    public int AllocationOrder { get; set; }

    public string Status { get; set; } = SettlementRequestLineStatuses.Open;

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public ICollection<SettlementPaymentAllocation> PaymentAllocations { get; } = new List<SettlementPaymentAllocation>();
}
