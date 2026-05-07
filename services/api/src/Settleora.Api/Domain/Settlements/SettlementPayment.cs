using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.Settlements;

public sealed class SettlementPayment
{
    public Guid Id { get; set; }

    public Guid SettlementRequestId { get; set; }

    public SettlementRequest SettlementRequest { get; set; } = null!;

    public Guid PaidByUserProfileId { get; set; }

    public UserProfile PaidByUserProfile { get; set; } = null!;

    public Guid ReceivedByUserProfileId { get; set; }

    public UserProfile ReceivedByUserProfile { get; set; } = null!;

    public decimal Amount { get; set; }

    public string Currency { get; set; } = string.Empty;

    public string Status { get; set; } = SettlementPaymentStatuses.MarkedPaid;

    public DateOnly PaymentDate { get; set; }

    public string? Note { get; set; }

    public Guid CreatedByUserProfileId { get; set; }

    public UserProfile CreatedByUserProfile { get; set; } = null!;

    public DateTimeOffset ClaimedAtUtc { get; set; }

    public DateTimeOffset? ConfirmedAtUtc { get; set; }

    public DateTimeOffset? DisputedAtUtc { get; set; }

    public DateTimeOffset? CancelledAtUtc { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public ICollection<SettlementProofAttachment> ProofAttachments { get; } = new List<SettlementProofAttachment>();
}
