using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.Expenses;

public sealed class ExpenseBillRevisionApproval
{
    public Guid Id { get; set; }

    public Guid ExpenseBillRevisionId { get; set; }

    public ExpenseBillRevision ExpenseBillRevision { get; set; } = null!;

    public Guid ParticipantUserProfileId { get; set; }

    public UserProfile ParticipantUserProfile { get; set; } = null!;

    public decimal AcceptedAmount { get; set; }

    public string Currency { get; set; } = string.Empty;

    public string CalculationHash { get; set; } = string.Empty;

    public string Status { get; set; } = ExpenseBillRevisionApprovalStatuses.PendingReview;

    public DateTimeOffset? ApprovedAtUtc { get; set; }

    public DateTimeOffset? RejectedAtUtc { get; set; }

    public DateTimeOffset? InvalidatedAtUtc { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }
}
