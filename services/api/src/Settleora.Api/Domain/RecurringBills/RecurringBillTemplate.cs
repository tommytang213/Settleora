using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.RecurringBills;

public sealed class RecurringBillTemplate
{
    public Guid Id { get; set; }

    public Guid OwnerUserProfileId { get; set; }

    public UserProfile OwnerUserProfile { get; set; } = null!;

    public Guid CreatedByUserProfileId { get; set; }

    public UserProfile CreatedByUserProfile { get; set; } = null!;

    public Guid? GroupId { get; set; }

    public UserGroup? Group { get; set; }

    public string? MerchantName { get; set; }

    public string? Description { get; set; }

    public string ScheduleType { get; set; } = RecurringBillScheduleTypes.Monthly;

    public int? IntervalCount { get; set; }

    public int? IntervalDays { get; set; }

    public DateOnly StartDate { get; set; }

    public DateOnly? EndDate { get; set; }

    public int? DueOffsetDays { get; set; }

    public DateOnly? NextOccurrenceDate { get; set; }

    public string Status { get; set; } = RecurringBillTemplateStatuses.Active;

    public int PayloadVersion { get; set; } = 1;

    public string PayloadJson { get; set; } = string.Empty;

    public decimal ForecastAmount { get; set; }

    public string ForecastCurrency { get; set; } = string.Empty;

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public DateTimeOffset? ArchivedAtUtc { get; set; }

    public ICollection<RecurringBillOccurrence> Occurrences { get; } = new List<RecurringBillOccurrence>();
}
