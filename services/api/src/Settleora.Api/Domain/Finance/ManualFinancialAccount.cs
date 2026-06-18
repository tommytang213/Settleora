using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.Finance;

public sealed class ManualFinancialAccount
{
    public Guid Id { get; set; }

    public Guid OwnerUserProfileId { get; set; }

    public UserProfile OwnerUserProfile { get; set; } = null!;

    public string DisplayName { get; set; } = string.Empty;

    public string AccountType { get; set; } = ManualFinancialAccountTypes.Cash;

    public decimal CurrentBalanceAmount { get; set; }

    public string CurrentBalanceCurrency { get; set; } = string.Empty;

    public DateOnly BalanceAsOfDate { get; set; }

    public string? Note { get; set; }

    public string Status { get; set; } = ManualFinancialAccountStatuses.Active;

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public DateTimeOffset? ArchivedAtUtc { get; set; }
}
