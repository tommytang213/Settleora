using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.Settlements;

public sealed class SettlementResidual
{
    public Guid Id { get; set; }

    public Guid? SettlementPaymentId { get; set; }

    public SettlementPayment? SettlementPayment { get; set; }

    public Guid? SettlementRequestId { get; set; }

    public SettlementRequest? SettlementRequest { get; set; }

    public Guid DebtorUserProfileId { get; set; }

    public UserProfile DebtorUserProfile { get; set; } = null!;

    public Guid CreditorUserProfileId { get; set; }

    public UserProfile CreditorUserProfile { get; set; } = null!;

    public string Direction { get; set; } = SettlementResidualDirections.Underpayment;

    public decimal Amount { get; set; }

    public string Currency { get; set; } = string.Empty;

    public string Policy { get; set; } = SettlementResidualPolicies.RemainingBalance;

    public string Status { get; set; } = SettlementResidualStatuses.PendingReceiverConfirmation;

    public string? Reason { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset? ResolvedAtUtc { get; set; }
}
