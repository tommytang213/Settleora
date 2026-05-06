using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.Expenses;

public sealed class ExpenseBillParticipant
{
    public Guid ExpenseBillId { get; set; }

    public ExpenseBill ExpenseBill { get; set; } = null!;

    public Guid UserProfileId { get; set; }

    public UserProfile UserProfile { get; set; } = null!;

    public string Status { get; set; } = ExpenseBillParticipantStatuses.PendingAcceptance;

    public decimal ResolvedShareAmount { get; set; }

    public string ResolvedShareCurrency { get; set; } = string.Empty;

    public DateTimeOffset? AcceptedAtUtc { get; set; }

    public DateTimeOffset? RejectedAtUtc { get; set; }

    public DateTimeOffset? SettledAtUtc { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }
}
