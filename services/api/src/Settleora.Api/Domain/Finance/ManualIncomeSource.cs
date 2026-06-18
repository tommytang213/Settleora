using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.Finance;

public sealed class ManualIncomeSource
{
    public Guid Id { get; set; }

    public Guid OwnerUserProfileId { get; set; }

    public UserProfile OwnerUserProfile { get; set; } = null!;

    public Guid? ManualFinancialAccountId { get; set; }

    public ManualFinancialAccount? ManualFinancialAccount { get; set; }

    public string DisplayName { get; set; } = string.Empty;

    public decimal Amount { get; set; }

    public string Currency { get; set; } = string.Empty;

    public string Cadence { get; set; } = ManualIncomeCadences.Monthly;

    public DateOnly NextExpectedDate { get; set; }

    public DateOnly? EndDate { get; set; }

    public string? Note { get; set; }

    public string Status { get; set; } = ManualIncomeSourceStatuses.Active;

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public DateTimeOffset? ArchivedAtUtc { get; set; }
}
