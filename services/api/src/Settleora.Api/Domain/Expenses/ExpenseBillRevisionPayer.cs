using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.Expenses;

public sealed class ExpenseBillRevisionPayer
{
    public Guid ExpenseBillRevisionId { get; set; }

    public ExpenseBillRevision ExpenseBillRevision { get; set; } = null!;

    public Guid UserProfileId { get; set; }

    public UserProfile UserProfile { get; set; } = null!;

    public decimal Amount { get; set; }

    public string Currency { get; set; } = string.Empty;

    public bool RequiresPayerConfirmation { get; set; }

    public string PayerConfirmationStatus { get; set; } = ExpenseBillPayerConfirmationStatuses.Confirmed;

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }
}
