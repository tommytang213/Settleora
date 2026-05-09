using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.Settlements;

public sealed class SettlementRequest
{
    public Guid Id { get; set; }

    public Guid? GroupId { get; set; }

    public UserGroup? Group { get; set; }

    public Guid? SourceExpenseBillId { get; set; }

    public ExpenseBill? SourceExpenseBill { get; set; }

    public Guid DebtorUserProfileId { get; set; }

    public UserProfile DebtorUserProfile { get; set; } = null!;

    public Guid CreditorUserProfileId { get; set; }

    public UserProfile CreditorUserProfile { get; set; } = null!;

    public decimal Amount { get; set; }

    public string Currency { get; set; } = string.Empty;

    public string Status { get; set; } = SettlementRequestStatuses.Requested;

    public Guid RequestedByUserProfileId { get; set; }

    public UserProfile RequestedByUserProfile { get; set; } = null!;

    public DateTimeOffset RequestedAtUtc { get; set; }

    public DateTimeOffset? ConfirmedAtUtc { get; set; }

    public DateTimeOffset? DisputedAtUtc { get; set; }

    public DateTimeOffset? CancelledAtUtc { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public DateTimeOffset? ArchivedAtUtc { get; set; }

    public ICollection<SettlementRequestLine> Lines { get; } = new List<SettlementRequestLine>();

    public ICollection<SettlementPayment> Payments { get; } = new List<SettlementPayment>();

    public ICollection<SettlementResidual> Residuals { get; } = new List<SettlementResidual>();
}
