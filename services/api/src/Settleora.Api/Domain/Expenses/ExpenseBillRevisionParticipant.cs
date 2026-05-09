using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.Expenses;

public sealed class ExpenseBillRevisionParticipant
{
    public Guid ExpenseBillRevisionId { get; set; }

    public ExpenseBillRevision ExpenseBillRevision { get; set; } = null!;

    public Guid UserProfileId { get; set; }

    public UserProfile UserProfile { get; set; } = null!;

    public decimal ResolvedShareAmount { get; set; }

    public string ResolvedShareCurrency { get; set; } = string.Empty;

    public bool AffectedByRevision { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }
}
