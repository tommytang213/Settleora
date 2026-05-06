using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.Expenses;

public sealed class ExpenseBillPayer
{
    public Guid Id { get; set; }

    public Guid ExpenseBillId { get; set; }

    public ExpenseBill ExpenseBill { get; set; } = null!;

    public Guid UserProfileId { get; set; }

    public UserProfile UserProfile { get; set; } = null!;

    public decimal Amount { get; set; }

    public string Currency { get; set; } = string.Empty;

    public string? PaymentMethodLabelSnapshot { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }
}
