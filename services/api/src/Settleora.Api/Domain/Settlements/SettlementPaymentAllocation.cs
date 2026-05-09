namespace Settleora.Api.Domain.Settlements;

public sealed class SettlementPaymentAllocation
{
    public Guid Id { get; set; }

    public Guid SettlementPaymentId { get; set; }

    public SettlementPayment SettlementPayment { get; set; } = null!;

    public Guid SettlementRequestLineId { get; set; }

    public SettlementRequestLine SettlementRequestLine { get; set; } = null!;

    public decimal ClearedAmount { get; set; }

    public string Currency { get; set; } = string.Empty;

    public int AllocationOrder { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }
}
